// app/api/claude/route.js
// Secure server-side proxy for Google Gemini API
// Your API key is NEVER sent to the browser

import { GoogleGenerativeAI } from "@google/generative-ai";

const rateLimitMap = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 10;      // 10 requests per minute per IP

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }

  const entry = rateLimitMap.get(ip);
  if (now - entry.start > windowMs) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }

  if (entry.count >= maxRequests) return false;

  entry.count++;
  return true;
}

export async function POST(req) {
  // Get client IP for rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // Rate limit check
  if (!rateLimit(ip)) {
    return Response.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  // API key check moved to try block to support both GEMINI_API_KEY and GOOGLE_API_KEY

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate basic structure
  if (!body.messages || !Array.isArray(body.messages)) {
    return Response.json({ error: "Invalid messages format" }, { status: 400 });
  }

  try {
    // Check for GOOGLE_API_KEY first, then GEMINI_API_KEY (both are supported)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "GOOGLE_API_KEY or GEMINI_API_KEY is not configured. Please set it in .env.local" },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Default to a model that is actually available for the current API key.
    // (This project previously used 1.5 model names, but this key's account exposes
    // "gemini-flash-latest"/"gemini-pro-latest" and newer, per ListModels.)
    const DEFAULT_MODEL = "gemini-flash-latest";
    const normalizeModelName = (m) => {
      if (!m) return DEFAULT_MODEL;
      const raw = String(m).trim();
      const noPrefix = raw.startsWith("models/") ? raw.slice("models/".length) : raw;

      // Map deprecated/unsupported aliases to currently supported aliases.
      if (noPrefix === "gemini-pro") return "gemini-pro-latest";
      if (noPrefix === "gemini-flash") return "gemini-flash-latest";

      // Map older 1.5 names to the closest supported "-latest" aliases.
      if (noPrefix.startsWith("gemini-1.5-")) {
        if (noPrefix.includes("pro")) return "gemini-pro-latest";
        return "gemini-flash-latest";
      }

      return noPrefix || DEFAULT_MODEL;
    };

    const modelName = normalizeModelName(body.model || DEFAULT_MODEL);
    
    // Prepare the generation config
    const generationConfig = {
      maxOutputTokens: Math.min(body.max_tokens || 4000, 4000),
      temperature: 0.7,
    };
    
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig,
    });

    // Convert messages format from Claude format to Gemini format
    // Gemini uses a different format: it needs parts array with text
    const history = [];
    let currentPrompt = "";

    // Process all messages except the last one as history
    for (let i = 0; i < body.messages.length - 1; i++) {
      const msg = body.messages[i];
      if (msg.role === "user") {
        history.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        history.push({
          role: "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Get the last message as the current prompt
    const lastMessage = body.messages[body.messages.length - 1];
    if (lastMessage && lastMessage.role === "user") {
      currentPrompt = lastMessage.content;
    } else {
      // If last message is not user, use it anyway
      currentPrompt = lastMessage?.content || "";
    }

    // Combine system prompt with current prompt if available
    if (body.system) {
      currentPrompt = `${body.system}\n\n${currentPrompt}`;
    }

    let text;
    
    // Use generateContent for single prompts (no history), startChat for conversations
    if (history.length > 0) {
      // Use chat API when there's conversation history
      const chat = model.startChat({ 
        history: history,
      });
      const result = await chat.sendMessage(currentPrompt);
      const response = await result.response;
      text = response.text();
    } else {
      // Use generateContent for single prompts
      // Correct syntax: generateContent takes a string directly
      const result = await model.generateContent(currentPrompt);
      const response = await result.response;
      text = response.text();
    }

    // Convert Gemini response format to Claude-compatible format
    // Frontend expects: { content: [{ text: "..." }] }
    return Response.json({
      content: [{ text }],
      model: modelName,
    });
  } catch (err) {
    console.error("Gemini API error:", err);
    return Response.json(
      { error: err.message || "API request failed" },
      { status: 500 }
    );
  }
}
