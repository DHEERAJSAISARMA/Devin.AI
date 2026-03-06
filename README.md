<<<<<<< HEAD
# ⚡ CodeLearnAI — Interactive Code Learning Platform

AI-powered code visualizer with step-by-step execution flow, variable tracking, diff view, error detection, test generation, complexity analysis, and an AI tutor chat.

---

## 🚀 Deploy in 5 Minutes (Vercel)

### Step 1 — Get your Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Click **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)

### Step 2 — Set up the project locally
```bash
# Install dependencies
npm install

# Copy the env file
cp .env.local.example .env.local

# Open .env.local and paste your key:
# ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE

# Run locally to test
npm run dev
# Open http://localhost:3000
```

### Step 3 — Deploy to Vercel
```bash
# Option A: Vercel CLI (fastest)
npm install -g vercel
vercel

# It will ask you to log in and set up the project.
# When prompted for environment variables, add:
#   ANTHROPIC_API_KEY = sk-ant-YOUR_KEY_HERE
```

**Option B: GitHub + Vercel Dashboard**
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repo
4. In **Environment Variables**, add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-YOUR_KEY_HERE`
5. Click **Deploy** — done!

---

## 🏗 Project Structure

```
codelearn-ai/
├── app/
│   ├── api/
│   │   └── claude/
│   │       └── route.js      ← Secure API proxy (rate-limited)
│   ├── globals.css
│   ├── layout.js
│   └── page.jsx              ← Full platform UI
├── .env.local.example        ← Copy to .env.local
├── .gitignore                ← API key is excluded
├── next.config.js
├── package.json
├── vercel.json
└── README.md
```

---

## 🔒 Security Notes

- Your `ANTHROPIC_API_KEY` lives **only on the server** — never sent to the browser
- The API route (`/api/claude`) rate-limits to **10 requests/minute per IP**
- The `.gitignore` excludes `.env.local` so your key won't accidentally be committed
- Never commit `.env.local` to a public repo

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗺️ Execution Flow | Step-by-step visualization of what the code does |
| 📊 Variable Tracker | Animated variable states with playback timeline |
| 🔍 Issue Detection | Errors/warnings with student-friendly explanations |
| ↔️ Diff View | Side-by-side or unified original vs corrected code |
| ⚡ Optimizer | Optimized code + Big-O complexity + growth chart |
| 🧪 Test Generator | Auto-generated test cases with expected outputs |
| 🤖 AI Tutor Chat | Ask questions about your specific code |
| 🔊 Voice Narration | Text-to-speech walkthrough of all steps |
| 🌐 Language Selector | Force a specific language for better analysis |

---

## 🛠 Other Deployment Options

### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
# Set env var: railway variables set ANTHROPIC_API_KEY=sk-ant-...
```

### Netlify
```bash
npm install -g netlify-cli
netlify init
netlify deploy --prod
# Set env var in Netlify dashboard → Site Settings → Environment Variables
```

### Docker (Self-hosted)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```
```bash
docker build -t codelearn-ai .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... codelearn-ai
```

---

## 💡 Customization Tips

- **Change rate limit**: Edit `maxRequests` and `windowMs` in `app/api/claude/route.js`
- **Change model**: Edit `claude-sonnet-4-20250514` in `app/api/claude/route.js`
- **Add auth**: Install [Clerk](https://clerk.com) or [NextAuth](https://next-auth.js.org) for user logins
- **Add a database**: Use [Supabase](https://supabase.com) to save analysis history per user

---

Built with Next.js 14 + Anthropic Claude API
=======
# Devin.AI
An AI-powered backend API built with Next.js that uses Google Gemini to analyze code and provide intelligent suggestions.
>>>>>>> 5c964b4bcd34e66f532bda75e10093865b32e858
