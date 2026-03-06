"use client";
import { useState, useRef, useEffect, useCallback } from "react";

/* ─── CONSTANTS ─────────────────────────────────────────── */
const LANGUAGES = [
  "Auto Detect","JavaScript","Python","Java","C++","C",
  "TypeScript","Go","Rust","Ruby","PHP","Swift","Kotlin",
];

const ANALYSIS_PROMPT = `You are an expert code analysis engine for LEARNING. Respond ONLY with valid JSON (no markdown, no backticks):
{
  "language": "detected language",
  "summary": "2-3 sentence overview of what the code does",
  "visualSteps": [
    {
      "stepNumber": 1,
      "title": "Step title",
      "description": "Plain-English explanation a student can understand",
      "codeSnippet": "relevant code lines",
      "lineRange": "1-3",
      "type": "declaration|logic|loop|condition|function|io|error|return|import",
      "variables": [{"name":"x","value":"5","operation":"assigned"}]
    }
  ],
  "variableTimeline": [
    {
      "step": 1,
      "variables": [{"name":"varName","value":"value","type":"number|string|boolean|array|object|null","changed":true}]
    }
  ],
  "errors": [
    {
      "lineStart": 3,
      "lineEnd": 3,
      "severity": "critical|warning|info",
      "issue": "description",
      "fix": "how to fix it",
      "explanation": "why this is wrong — student-friendly"
    }
  ],
  "correctedCode": "full corrected code",
  "diffHints": [
    {"line": 3, "type": "removed|added|changed", "original": "old code", "corrected": "new code", "reason": "why"}
  ],
  "optimizedCode": "optimized code",
  "optimizationNotes": ["note 1", "note 2"],
  "complexity": {"time": "O(?)", "space": "O(?)", "explanation": "brief"},
  "complexityData": [
    {"n": 1, "ops": 1}, {"n": 2, "ops": 2}, {"n": 4, "ops": 4},
    {"n": 8, "ops": 8}, {"n": 16, "ops": 16}, {"n": 32, "ops": 32}
  ],
  "testCases": [
    {"name": "test name", "input": "input description", "expectedOutput": "expected output", "code": "actual test code"}
  ],
  "learningTips": ["tip 1", "tip 2", "tip 3"]
}`;

const CHAT_SYSTEM = (code) => `You are a patient, encouraging coding tutor. The student has submitted this code:

\`\`\`
${code}
\`\`\`

Answer their questions clearly and simply. Use analogies. Be encouraging. Keep answers concise but complete.
If they ask about a specific line, reference it directly. Always end with a small encouragement or next step.`;

const STEP_META = {
  declaration: { color: "#38bdf8", bg: "#0c1a2e", icon: "📦", label: "Declaration" },
  logic:       { color: "#34d399", bg: "#0c1f1a", icon: "⚙️", label: "Logic"       },
  loop:        { color: "#a78bfa", bg: "#1a0c2e", icon: "🔄", label: "Loop"        },
  condition:   { color: "#fbbf24", bg: "#1f1a0c", icon: "🔀", label: "Condition"   },
  function:    { color: "#f472b6", bg: "#2e0c1a", icon: "🔧", label: "Function"    },
  io:          { color: "#fb923c", bg: "#2e1a0c", icon: "📡", label: "I/O"         },
  error:       { color: "#f87171", bg: "#2e0c0c", icon: "❌", label: "Error"       },
  return:      { color: "#818cf8", bg: "#0c0c2e", icon: "↩️", label: "Return"      },
  import:      { color: "#2dd4bf", bg: "#0c1e1e", icon: "📥", label: "Import"      },
};

const SEVERITY = {
  critical: { color: "#f87171", bg: "#2e0c0c", border: "#f87171", label: "CRITICAL", icon: "🔴" },
  warning:  { color: "#fbbf24", bg: "#2e200c", border: "#fbbf24", label: "WARNING",  icon: "🟡" },
  info:     { color: "#38bdf8", bg: "#0c1a2e", border: "#38bdf8", label: "INFO",     icon: "🔵" },
};

const VAR_TYPE_COLOR = {
  number: "#38bdf8", string: "#34d399", boolean: "#fbbf24",
  array: "#a78bfa", object: "#f472b6", null: "#6b7280",
};

/* ─── HELPERS ────────────────────────────────────────────── */
async function callClaude(messages, system, signal) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "gemini-flash-latest",
      max_tokens: 4000,
      system,
      messages,
    }),
  });
  return res.json();
}

function extractText(data) {
  return (data.content || []).map((c) => c.text || "").join("");
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    return null;
  }
}

function computeDiff(original, corrected) {
  if (!original || !corrected) return [];
  const oLines = original.split("\n");
  const cLines = corrected.split("\n");
  const result = [];
  const max = Math.max(oLines.length, cLines.length);
  for (let i = 0; i < max; i++) {
    const o = oLines[i] ?? null;
    const c = cLines[i] ?? null;
    if (o === null)    result.push({ lineNum: i+1, type: "added",   original: "",  corrected: c });
    else if (c === null) result.push({ lineNum: i+1, type: "removed", original: o,  corrected: "" });
    else if (o !== c)  result.push({ lineNum: i+1, type: "changed", original: o,  corrected: c });
    else               result.push({ lineNum: i+1, type: "same",    original: o,  corrected: c });
  }
  return result;
}

/* ─── SMALL SHARED COMPONENTS ───────────────────────────── */
function Spinner() {
  return (
    <span style={{
      display:"inline-block", width:14, height:14,
      border:"2px solid #1e3a5f", borderTop:"2px solid #38bdf8",
      borderRadius:"50%", animation:"spin 0.7s linear infinite",
    }}/>
  );
}

function TabBar({ tabs, active, setActive }) {
  return (
    <div style={{ display:"flex", background:"#070d14", borderBottom:"1px solid #1e2d3d",
      overflowX:"auto", flexShrink:0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)} style={{
          background:"none", border:"none",
          borderBottom: active===t.id ? "2px solid #38bdf8" : "2px solid transparent",
          color: active===t.id ? "#38bdf8" : "#4a6077",
          padding:"10px 14px", fontSize:11, fontWeight:700, cursor:"pointer",
          letterSpacing:1, whiteSpace:"nowrap", fontFamily:"'JetBrains Mono',monospace",
          display:"flex", alignItems:"center", gap:6, transition:"color .2s",
        }}>
          {t.icon} {t.label}
          {t.badge != null && (
            <span style={{
              fontSize:9, padding:"1px 5px", borderRadius:8, fontFamily:"monospace",
              background: t.badgeAlert ? "#f8717122" : "#38bdf822",
              color: t.badgeAlert ? "#f87171" : "#38bdf8",
              border:`1px solid ${t.badgeAlert ? "#f8717144":"#38bdf844"}`,
            }}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", height:"100%", gap:12, opacity:.35, padding:32 }}>
      <div style={{ fontSize:52 }}>{icon}</div>
      <p style={{ fontSize:13, color:"#8b949e", textAlign:"center", lineHeight:1.7, maxWidth:260 }}>{text}</p>
    </div>
  );
}

function CopyBtn({ text, accent="#38bdf8" }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(()=>setDone(false),2000); }}
      style={{ background:accent+"18", border:`1px solid ${accent}44`, color:accent,
        fontSize:10, padding:"3px 10px", borderRadius:4, cursor:"pointer",
        fontFamily:"monospace", letterSpacing:.5 }}>
      {done ? "✓ COPIED" : "COPY"}
    </button>
  );
}

function CodeDisplay({ code, accent="#38bdf8" }) {
  if (!code) return null;
  return (
    <pre style={{
      background:"#030812", border:`1px solid ${accent}22`, borderRadius:8,
      margin:0, fontSize:12, fontFamily:"'JetBrains Mono',monospace",
      overflowX:"auto", lineHeight:1.7, maxHeight:340, overflowY:"auto", padding:0,
    }}>
      {code.split("\n").map((line,i) => (
        <div key={i} style={{ display:"flex", minWidth:"100%" }}>
          <span style={{ color:"#2a3f55", fontSize:10, minWidth:36, padding:"0 8px",
            userSelect:"none", textAlign:"right", flexShrink:0, lineHeight:1.7 }}>{i+1}</span>
          <span style={{ color:"#c9d1d9", padding:"0 12px 0 4px", whiteSpace:"pre", flex:1 }}>{line}</span>
        </div>
      ))}
    </pre>
  );
}

function ctrlBtn(color) {
  return {
    background:color+"18", border:`1px solid ${color}44`, color,
    width:30, height:30, borderRadius:6, cursor:"pointer", fontSize:12,
    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
  };
}

/* ─── PANELS ─────────────────────────────────────────────── */
function StepsPanel({ analysis, activeStep, setActiveStep }) {
  if (!analysis) return <EmptyState icon="🗺️" text="Paste your code and the execution flow will appear here step by step."/>;
  const steps = analysis.visualSteps || [];
  return (
    <div style={{ padding:16, overflowY:"auto", height:"100%" }}>
      <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2, marginBottom:14 }}>
        EXECUTION FLOW — {steps.length} STEPS
      </div>
      {steps.map((step,i) => {
        const meta = STEP_META[step.type] || STEP_META.logic;
        const isActive = activeStep === i;
        return (
          <div key={i} onClick={() => setActiveStep(isActive ? -1 : i)} style={{
            background: isActive ? meta.bg : "#070d14",
            border:`1px solid ${isActive ? meta.color : "#1e2d3d"}`,
            borderRadius:8, padding:"12px 14px", cursor:"pointer", marginBottom:8,
            transform: isActive ? "translateX(4px)" : "none",
            boxShadow: isActive ? `0 0 24px ${meta.color}18` : "none",
            transition:"all .2s",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: isActive ? 10 : 0 }}>
              <span style={{ width:26, height:26, borderRadius:"50%", background:meta.color+"1a",
                border:`1px solid ${meta.color}`, display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:11, color:meta.color, fontWeight:800,
                fontFamily:"monospace", flexShrink:0 }}>{step.stepNumber}</span>
              <span style={{ fontSize:13, fontWeight:600, color: isActive ? meta.color : "#8b949e", flex:1 }}>
                {meta.icon} {step.title}
              </span>
              {step.lineRange && (
                <span style={{ fontSize:9, background:meta.color+"18", color:meta.color,
                  padding:"2px 6px", borderRadius:4, fontFamily:"monospace" }}>L{step.lineRange}</span>
              )}
              <span style={{ fontSize:9, color:meta.color, fontFamily:"monospace", opacity:.7 }}>{meta.label}</span>
            </div>
            {isActive && (
              <div style={{ animation:"fadeIn .2s ease" }}>
                <p style={{ color:"#a8b8c8", fontSize:13, lineHeight:1.7, margin:"0 0 10px 36px" }}>{step.description}</p>
                {step.codeSnippet && (
                  <pre style={{ background:"#030812", border:`1px solid ${meta.color}33`, borderRadius:6,
                    padding:"10px 12px", margin:"0 0 10px 36px", color:meta.color, fontSize:12,
                    fontFamily:"monospace", overflowX:"auto", lineHeight:1.6 }}>{step.codeSnippet}</pre>
                )}
                {step.variables?.length > 0 && (
                  <div style={{ margin:"0 0 0 36px", display:"flex", flexWrap:"wrap", gap:6 }}>
                    {step.variables.map((v,vi) => (
                      <span key={vi} style={{ fontSize:11, fontFamily:"monospace", padding:"3px 10px",
                        background:"#0c1a2e", border:"1px solid #38bdf844", borderRadius:4, color:"#38bdf8" }}>
                        <span style={{ color:"#6b7280" }}>{v.operation}: </span>
                        <span style={{ color:"#f472b6" }}>{v.name}</span>
                        <span style={{ color:"#6b7280" }}> = </span>
                        <span style={{ color:"#34d399" }}>{v.value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {analysis.learningTips?.length > 0 && (
        <div style={{ marginTop:20, background:"#0c1a0c", border:"1px solid #34d39944", borderRadius:8, padding:14 }}>
          <div style={{ fontSize:10, color:"#34d399", fontFamily:"monospace", fontWeight:700, marginBottom:10, letterSpacing:1 }}>💡 LEARNING TIPS</div>
          {analysis.learningTips.map((tip,i) => (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:6 }}>
              <span style={{ color:"#34d399", fontSize:12, flexShrink:0 }}>→</span>
              <span style={{ color:"#a8b8c8", fontSize:12, lineHeight:1.6 }}>{tip}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VariablePanel({ analysis, activeStep }) {
  const [playStep, setPlayStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => { if (activeStep >= 0) setPlayStep(activeStep); }, [activeStep]);
  useEffect(() => {
    if (playing) {
      const tl = analysis?.variableTimeline || [];
      if (playStep >= tl.length - 1) { setPlaying(false); return; }
      timerRef.current = setTimeout(() => setPlayStep(p => p+1), 900);
    }
    return () => clearTimeout(timerRef.current);
  }, [playing, playStep, analysis]);

  if (!analysis?.variableTimeline?.length)
    return <EmptyState icon="📊" text="Variable states will animate here as your code executes step by step."/>;

  const timeline = analysis.variableTimeline;
  const current = timeline[Math.min(playStep, timeline.length-1)];
  const prev    = playStep > 0 ? timeline[playStep-1] : null;

  return (
    <div style={{ padding:16, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:16 }}>
      {/* Playback controls */}
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <button onClick={() => setPlayStep(0)} style={ctrlBtn("#38bdf8")}>⏮</button>
        <button onClick={() => setPlayStep(p => Math.max(0,p-1))} style={ctrlBtn("#38bdf8")}>◀</button>
        <button onClick={() => { setPlaying(p=>!p); if(playStep>=timeline.length-1) setPlayStep(0); }}
          style={ctrlBtn(playing?"#f87171":"#34d399")}>{playing?"⏸":"▶"}</button>
        <button onClick={() => setPlayStep(p => Math.min(timeline.length-1,p+1))} style={ctrlBtn("#38bdf8")}>▶</button>
        <button onClick={() => setPlayStep(timeline.length-1)} style={ctrlBtn("#38bdf8")}>⏭</button>
        <div style={{ flex:1, background:"#1e2d3d", borderRadius:4, height:4, cursor:"pointer", position:"relative" }}
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            setPlayStep(Math.round(((e.clientX-r.left)/r.width)*(timeline.length-1)));
          }}>
          <div style={{ position:"absolute", left:0, top:0, height:"100%", borderRadius:4,
            background:"#38bdf8", width:`${(playStep/Math.max(1,timeline.length-1))*100}%`, transition:"width .3s" }}/>
        </div>
        <span style={{ fontSize:11, color:"#38bdf8", fontFamily:"monospace", flexShrink:0 }}>
          Step {playStep+1}/{timeline.length}
        </span>
      </div>

      {/* Variable cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:10 }}>
        {current?.variables?.map((v,i) => {
          const pv = prev?.variables?.find(x=>x.name===v.name);
          const changed = v.changed || (pv && pv.value!==v.value);
          const tc = VAR_TYPE_COLOR[v.type] || "#8b949e";
          return (
            <div key={i} style={{
              background: changed ? tc+"12" : "#070d14",
              border:`1px solid ${changed ? tc : "#1e2d3d"}`,
              borderRadius:8, padding:12,
              boxShadow: changed ? `0 0 18px ${tc}22` : "none",
              transition:"all .35s", animation: changed ? "pulse .4s ease" : "none",
            }}>
              <div style={{ fontSize:9, color:tc, fontFamily:"monospace", letterSpacing:1, marginBottom:4 }}>
                {v.type?.toUpperCase()} {changed && "✦ CHANGED"}
              </div>
              <div style={{ fontSize:14, color:"#e2e8f0", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>{v.name}</div>
              <div style={{ fontSize:13, color:tc, fontFamily:"monospace", background:tc+"12",
                padding:"4px 8px", borderRadius:4, wordBreak:"break-all", lineHeight:1.4 }}>{String(v.value)}</div>
              {changed && pv && (
                <div style={{ fontSize:10, color:"#4a6077", fontFamily:"monospace", marginTop:6 }}>
                  was: <span style={{ color:"#6b7280" }}>{String(pv.value)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Timeline sparkline */}
      <div style={{ background:"#070d14", border:"1px solid #1e2d3d", borderRadius:8, padding:14 }}>
        <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2, marginBottom:12 }}>VARIABLE HISTORY TIMELINE</div>
        {[...new Set(timeline.flatMap(t=>t.variables?.map(v=>v.name)||[]))].slice(0,6).map(varName => {
          const history = timeline.map(t=>{
            const f=t.variables?.find(v=>v.name===varName);
            return f ? f.value : "—";
          });
          return (
            <div key={varName} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ fontSize:11, color:"#f472b6", fontFamily:"monospace", minWidth:70, fontWeight:700 }}>{varName}</span>
              <div style={{ display:"flex", gap:4, flex:1, overflowX:"auto" }}>
                {history.map((val,si) => (
                  <div key={si} onClick={() => setPlayStep(si)} style={{
                    fontSize:9, fontFamily:"monospace", padding:"2px 6px", borderRadius:3,
                    cursor:"pointer", flexShrink:0,
                    background: si===playStep ? "#38bdf822" : "#1e2d3d",
                    color: si===playStep ? "#38bdf8" : "#4a6077",
                    border:`1px solid ${si===playStep?"#38bdf8":"transparent"}`,
                    transition:"all .2s",
                  }}>{String(val).substring(0,8)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorsPanel({ analysis }) {
  if (!analysis) return <EmptyState icon="🔍" text="Issues and errors will appear here after analysis."/>;
  const errors = analysis.errors || [];
  if (!errors.length) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:12 }}>
      <div style={{ fontSize:52 }}>✅</div>
      <p style={{ color:"#34d399", fontSize:14, fontWeight:600 }}>No issues found!</p>
      <p style={{ color:"#4a6077", fontSize:12, textAlign:"center", maxWidth:260, lineHeight:1.6 }}>
        Your code looks clean. Check the Optimized tab for performance improvements.
      </p>
    </div>
  );
  return (
    <div style={{ padding:16, overflowY:"auto", height:"100%" }}>
      <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2, marginBottom:14 }}>
        {errors.length} ISSUE{errors.length>1?"S":""} DETECTED
      </div>
      {errors.map((err,i) => {
        const s = SEVERITY[err.severity] || SEVERITY.info;
        return (
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}33`,
            borderLeft:`3px solid ${s.border}`, borderRadius:8, padding:"14px 16px", marginBottom:10 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
              <span>{s.icon}</span>
              <span style={{ fontSize:10, fontWeight:800, color:s.color, fontFamily:"monospace",
                background:s.color+"1a", padding:"2px 8px", borderRadius:4 }}>{s.label}</span>
              <span style={{ fontSize:11, color:"#4a6077", fontFamily:"monospace" }}>
                Line {err.lineStart}{err.lineEnd&&err.lineEnd!==err.lineStart?`–${err.lineEnd}`:""}
              </span>
            </div>
            <p style={{ color:"#e2e8f0", fontSize:13, margin:"0 0 10px", fontWeight:600 }}>{err.issue}</p>
            {err.explanation && (
              <p style={{ color:"#8b949e", fontSize:12, margin:"0 0 10px", lineHeight:1.6, fontStyle:"italic" }}>
                💬 {err.explanation}
              </p>
            )}
            <div style={{ background:"#0c1a0c", border:"1px solid #34d39933", borderRadius:6, padding:"10px 12px" }}>
              <span style={{ color:"#34d399", fontSize:11, fontWeight:700 }}>✓ HOW TO FIX: </span>
              <span style={{ color:"#a8b8c8", fontSize:12, lineHeight:1.6 }}>{err.fix}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiffPanel({ analysis, code }) {
  const [view, setView] = useState("side");
  if (!analysis?.correctedCode) return <EmptyState icon="↔️" text="Diff view shows original vs corrected code here."/>;
  const diff = computeDiff(code, analysis.correctedCode);
  const hasChanges = diff.some(d=>d.type!=="same");
  return (
    <div style={{ padding:16, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2, flex:1 }}>
          CODE DIFF — {hasChanges?`${diff.filter(d=>d.type!=="same").length} CHANGES`:"NO CHANGES"}
        </div>
        <div style={{ display:"flex", gap:1, background:"#1e2d3d", borderRadius:6, padding:2 }}>
          {["side","unified"].map(v => (
            <button key={v} onClick={()=>setView(v)} style={{
              background: view===v?"#38bdf822":"none",
              border: view===v?"1px solid #38bdf844":"1px solid transparent",
              color: view===v?"#38bdf8":"#4a6077", fontSize:10, padding:"4px 10px",
              borderRadius:4, cursor:"pointer", fontFamily:"monospace", letterSpacing:.5,
            }}>{v}</button>
          ))}
        </div>
        <CopyBtn text={analysis.correctedCode} accent="#34d399"/>
      </div>

      {view==="unified" ? (
        <div style={{ background:"#030812", border:"1px solid #1e2d3d", borderRadius:8, overflow:"auto", flex:1 }}>
          {diff.map((line,i) => {
            const cl = { same:{bg:"transparent",c:"#6b7280",p:" "}, removed:{bg:"#f8717112",c:"#f87171",p:"−"},
              added:{bg:"#34d39912",c:"#34d399",p:"+"}, changed:{bg:"#fbbf2412",c:"#fbbf24",p:"~"} }[line.type]||{bg:"transparent",c:"#6b7280",p:" "};
            return (
              <div key={i} style={{ display:"flex", background:cl.bg, minWidth:"100%" }}>
                <span style={{ color:"#2a3f55", fontSize:10, minWidth:32, padding:"0 6px", textAlign:"right", flexShrink:0, lineHeight:1.8 }}>{line.lineNum}</span>
                <span style={{ color:cl.c, minWidth:16, textAlign:"center", fontSize:12, lineHeight:1.8, fontFamily:"monospace" }}>{cl.p}</span>
                <span style={{ color:cl.c, fontFamily:"monospace", fontSize:12, padding:"0 8px", whiteSpace:"pre", lineHeight:1.8 }}>
                  {line.type==="removed"?line.original:line.corrected}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, flex:1, minHeight:0 }}>
          {[["ORIGINAL","#f87171","original"],["CORRECTED","#34d399","corrected"]].map(([label,color,key])=>(
            <div key={key} style={{ display:"flex", flexDirection:"column" }}>
              <div style={{ fontSize:10, color, fontFamily:"monospace", letterSpacing:1, marginBottom:6, padding:"0 4px" }}>{label}</div>
              <div style={{ background:"#030812", border:`1px solid ${color}22`, borderRadius:8, overflow:"auto", flex:1 }}>
                {diff.map((line,i) => (
                  <div key={i} style={{ display:"flex",
                    background: (key==="original"&&(line.type==="removed"||line.type==="changed"))||(key==="corrected"&&(line.type==="added"||line.type==="changed"))
                      ? color+"12":"transparent", minWidth:"100%" }}>
                    <span style={{ color:"#2a3f55", fontSize:10, minWidth:28, padding:"0 4px", textAlign:"right", flexShrink:0, lineHeight:1.8 }}>{line.lineNum}</span>
                    <span style={{ color: line.type!=="same"?color:"#4a6077", fontFamily:"monospace", fontSize:12, padding:"0 8px", whiteSpace:"pre", lineHeight:1.8 }}>{line[key]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {analysis.diffHints?.length > 0 && (
        <div style={{ background:"#070d14", border:"1px solid #1e2d3d", borderRadius:8, padding:12, flexShrink:0 }}>
          <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2, marginBottom:8 }}>CHANGE EXPLANATIONS</div>
          {analysis.diffHints.map((hint,i) => (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"flex-start" }}>
              <span style={{ fontSize:9, fontFamily:"monospace", padding:"2px 6px", borderRadius:3, flexShrink:0,
                background: hint.type==="removed"?"#f8717122":hint.type==="added"?"#34d39922":"#fbbf2422",
                color: hint.type==="removed"?"#f87171":hint.type==="added"?"#34d399":"#fbbf24",
              }}>L{hint.line}</span>
              <span style={{ fontSize:12, color:"#a8b8c8", lineHeight:1.5 }}>{hint.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OptimizedPanel({ analysis }) {
  if (!analysis?.optimizedCode) return <EmptyState icon="⚡" text="Optimized code will appear here after analysis."/>;
  return (
    <div style={{ padding:16, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2 }}>OPTIMIZED VERSION</div>
        <CopyBtn text={analysis.optimizedCode} accent="#a78bfa"/>
      </div>
      {analysis.complexity && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[["⏱ TIME",analysis.complexity.time,"#38bdf8"],["💾 SPACE",analysis.complexity.space,"#a78bfa"]].map(([label,val,color])=>(
            <div key={label} style={{ background:color+"0c", border:`1px solid ${color}33`, borderRadius:8, padding:"10px 14px" }}>
              <div style={{ fontSize:9, color, fontFamily:"monospace", letterSpacing:1, marginBottom:4 }}>{label} COMPLEXITY</div>
              <div style={{ fontSize:22, color, fontFamily:"monospace", fontWeight:800 }}>{val}</div>
            </div>
          ))}
        </div>
      )}
      {analysis.complexity?.explanation && (
        <p style={{ color:"#8b949e", fontSize:12, lineHeight:1.6, margin:0 }}>{analysis.complexity.explanation}</p>
      )}
      {analysis.optimizationNotes?.length > 0 && (
        <div style={{ background:"#0c0c1e", border:"1px solid #a78bfa33", borderRadius:8, padding:12 }}>
          <div style={{ fontSize:10, color:"#a78bfa", fontFamily:"monospace", letterSpacing:1, fontWeight:700, marginBottom:10 }}>OPTIMIZATIONS APPLIED</div>
          {analysis.optimizationNotes.map((note,i)=>(
            <div key={i} style={{ display:"flex", gap:8, marginBottom:6 }}>
              <span style={{ color:"#a78bfa", fontSize:12 }}>→</span>
              <span style={{ color:"#a8b8c8", fontSize:12, lineHeight:1.6 }}>{note}</span>
            </div>
          ))}
        </div>
      )}
      <CodeDisplay code={analysis.optimizedCode} accent="#a78bfa"/>
    </div>
  );
}

function TestsPanel({ analysis }) {
  if (!analysis?.testCases?.length) return <EmptyState icon="🧪" text="Test cases will be generated after code analysis."/>;
  return (
    <div style={{ padding:16, overflowY:"auto", height:"100%" }}>
      <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2, marginBottom:14 }}>
        GENERATED TEST CASES — {analysis.testCases.length} TESTS
      </div>
      {analysis.testCases.map((tc,i)=>(
        <div key={i} style={{ background:"#070d14", border:"1px solid #1e2d3d", borderRadius:8, padding:14, marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ fontSize:16 }}>🧪</span>
            <span style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>{tc.name}</span>
            <CopyBtn text={tc.code} accent="#34d399"/>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            {[["INPUT","#38bdf8","input"],["EXPECTED","#34d399","expectedOutput"]].map(([label,color,key])=>(
              <div key={key} style={{ background:color+"0c", border:`1px solid ${color}22`, borderRadius:6, padding:"8px 12px" }}>
                <div style={{ fontSize:9, color, fontFamily:"monospace", letterSpacing:1, marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:12, color:"#a8b8c8", fontFamily:"monospace" }}>{tc[key]}</div>
              </div>
            ))}
          </div>
          <pre style={{ background:"#030812", border:"1px solid #34d39922", borderRadius:6, padding:"10px 12px",
            margin:0, color:"#34d399", fontSize:11, fontFamily:"monospace", overflowX:"auto", lineHeight:1.6 }}>
            {tc.code}
          </pre>
        </div>
      ))}
    </div>
  );
}

function ChatPanel({ code }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const endRef  = useRef(null);
  const abortRef= useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const suggestions = [
    "Explain this code like I'm a beginner",
    "Why does this code have bugs?",
    "What does each variable do?",
    "How can I improve this code?",
  ];

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || !code.trim()) return;
    setInput("");
    const userMsg = { role:"user", content:msg };
    setMessages(prev=>[...prev, userMsg]);
    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const data = await callClaude([...messages, userMsg], CHAT_SYSTEM(code), ctrl.signal);
      if (data.error) throw new Error(data.error);
      setMessages(prev=>[...prev, { role:"assistant", content:extractText(data) }]);
    } catch(e) {
      if (e.name!=="AbortError")
        setMessages(prev=>[...prev, { role:"assistant", content:"Sorry, I couldn't process that. Please try again." }]);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ flex:1, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:12 }}>
        {messages.length===0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ textAlign:"center", padding:"24px 16px" }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🤖</div>
              <p style={{ color:"#38bdf8", fontSize:14, fontWeight:600, margin:"0 0 4px" }}>AI Code Tutor</p>
              <p style={{ color:"#4a6077", fontSize:12, lineHeight:1.6 }}>Ask me anything about your code. I'll explain it simply!</p>
            </div>
            <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2, marginBottom:4 }}>SUGGESTED QUESTIONS</div>
            {suggestions.map((s,i)=>(
              <button key={i} onClick={()=>send(s)} style={{
                background:"#070d14", border:"1px solid #1e2d3d", borderRadius:8,
                padding:"10px 14px", color:"#8b949e", fontSize:12, cursor:"pointer",
                textAlign:"left", lineHeight:1.5, transition:"all .2s",
              }}
                onMouseOver={e=>{e.currentTarget.style.borderColor="#38bdf844";e.currentTarget.style.color="#38bdf8";}}
                onMouseOut={e=>{e.currentTarget.style.borderColor="#1e2d3d";e.currentTarget.style.color="#8b949e";}}>
                💬 {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m,i)=>(
          <div key={i} style={{ display:"flex", gap:10, flexDirection:m.role==="user"?"row-reverse":"row", animation:"fadeIn .2s ease" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
              background:m.role==="user"?"#38bdf822":"#34d39922",
              border:`1px solid ${m.role==="user"?"#38bdf844":"#34d39944"}`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>
              {m.role==="user"?"👤":"🤖"}
            </div>
            <div style={{ maxWidth:"80%",
              background:m.role==="user"?"#0c1a2e":"#070d14",
              border:`1px solid ${m.role==="user"?"#38bdf833":"#1e2d3d"}`,
              borderRadius:m.role==="user"?"12px 4px 12px 12px":"4px 12px 12px 12px",
              padding:"10px 14px" }}>
              <p style={{ color:"#c9d1d9", fontSize:13, margin:0, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{m.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:"#34d39922",
              border:"1px solid #34d39944", display:"flex", alignItems:"center", justifyContent:"center" }}>🤖</div>
            <div style={{ background:"#070d14", border:"1px solid #1e2d3d", borderRadius:"4px 12px 12px 12px",
              padding:"10px 14px", display:"flex", gap:6, alignItems:"center" }}>
              {[0,1,2].map(i=>(
                <span key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#38bdf8",
                  animation:`bounce 1s ${i*.15}s infinite` }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={endRef}/>
      </div>
      <div style={{ padding:"12px 16px", borderTop:"1px solid #1e2d3d", display:"flex", gap:8 }}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder={code.trim()?"Ask about your code...":"Paste code first, then ask questions..."}
          disabled={!code.trim()||loading}
          style={{ flex:1, background:"#0c1420", border:"1px solid #1e2d3d", borderRadius:8,
            color:"#c9d1d9", fontSize:13, padding:"10px 14px", outline:"none", fontFamily:"'JetBrains Mono',monospace" }}
        />
        <button onClick={()=>send()} disabled={!input.trim()||!code.trim()||loading}
          style={{ background:input.trim()&&code.trim()?"#38bdf8":"#1e2d3d", border:"none", borderRadius:8,
            color:input.trim()&&code.trim()?"#030812":"#4a6077", width:40,
            cursor:input.trim()&&code.trim()?"pointer":"not-allowed", fontSize:16, transition:"all .2s",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
          {loading?<Spinner/>:"↑"}
        </button>
      </div>
    </div>
  );
}

function ComplexityChart({ data, timeLabel }) {
  if (!data?.length) return <EmptyState icon="📈" text="Complexity chart appears after analysis."/>;
  const maxOps = Math.max(...data.map(d=>d.ops));
  const W=320, H=180, PAD=36;
  const xS = n => PAD+((n-data[0].n)/(data[data.length-1].n-data[0].n||1))*(W-PAD*2);
  const yS = v => H-PAD-(v/maxOps)*(H-PAD*2);
  const pts = data.map(d=>`${xS(d.n)},${yS(d.ops)}`).join(" ");
  return (
    <div style={{ padding:16 }}>
      <div style={{ fontSize:10, color:"#2a5f7f", fontFamily:"monospace", letterSpacing:2, marginBottom:12 }}>
        GROWTH CURVE — {timeLabel}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background:"#030812", borderRadius:8, border:"1px solid #1e2d3d" }}>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity=".4"/>
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[.25,.5,.75,1].map(p=>(
          <line key={p} x1={PAD} y1={yS(maxOps*p)} x2={W-PAD} y2={yS(maxOps*p)}
            stroke="#1e2d3d" strokeWidth="1" strokeDasharray="4,4"/>
        ))}
        <polyline points={`${xS(data[0].n)},${H-PAD} ${pts} ${xS(data[data.length-1].n)},${H-PAD}`}
          fill="url(#lg)" stroke="none"/>
        <polyline points={pts} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        {data.map((d,i)=>(
          <circle key={i} cx={xS(d.n)} cy={yS(d.ops)} r="4" fill="#030812" stroke="#38bdf8" strokeWidth="2"/>
        ))}
        {data.filter((_,i)=>i%2===0).map((d,i)=>(
          <text key={i} x={xS(d.n)} y={H-8} textAnchor="middle" fill="#2a5f7f" fontSize="9" fontFamily="monospace">n={d.n}</text>
        ))}
        <text x={PAD-4} y={yS(maxOps)} textAnchor="end" fill="#38bdf8" fontSize="9" fontFamily="monospace">{maxOps}</text>
        <text x={W/2} y={16} textAnchor="middle" fill="#38bdf8" fontSize="11" fontFamily="monospace" fontWeight="bold">{timeLabel}</text>
      </svg>
    </div>
  );
}

/* ─── MAIN PAGE ──────────────────────────────────────────── */
export default function Home() {
  const [code, setCode]           = useState("");
  const [lang, setLang]           = useState("Auto Detect");
  const [analysis, setAnalysis]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [apiErr, setApiErr]       = useState(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [leftTab, setLeftTab]     = useState("editor");
  const [rightTab, setRightTab]   = useState("steps");
  const [speaking, setSpeaking]   = useState(false);
  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  const analyze = useCallback(async (src) => {
    if (src.trim().length < 8) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setApiErr(null);
    try {
      const prompt = lang !== "Auto Detect" ? `Language: ${lang}\n\n${src}` : src;
      const data = await callClaude(
        [{ role:"user", content:`Analyze this code:\n\n${prompt}` }],
        ANALYSIS_PROMPT,
        ctrl.signal
      );
      if (data.error) throw new Error(data.error);
      const parsed = safeParseJSON(extractText(data));
      if (parsed) { setAnalysis(parsed); setActiveStep(0); }
      else setApiErr("Could not parse analysis response. Please try again.");
    } catch(e) {
      if (e.name !== "AbortError") setApiErr(e.message || "Analysis failed. Please try again.");
    } finally { setLoading(false); }
  }, [lang]);

  useEffect(()=>{
    clearTimeout(debounceRef.current);
    if (code.trim().length > 8) debounceRef.current = setTimeout(()=>analyze(code), 1600);
    else setAnalysis(null);
    return ()=>clearTimeout(debounceRef.current);
  }, [code, analyze]);

  const speak = () => {
    if (!analysis || typeof window === "undefined" || !window.speechSynthesis) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const steps = analysis.visualSteps || [];
    const text = `Code Summary. ${analysis.summary}. ${steps.map(s=>`Step ${s.stepNumber}: ${s.title}. ${s.description}`).join(". ")}`;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.9;
    utt.onend = ()=>setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utt);
  };

  const errorCount = analysis?.errors?.length || 0;

  const leftTabs = [
    { id:"editor",     label:"EDITOR",     icon:"💻" },
    { id:"complexity", label:"COMPLEXITY", icon:"📈" },
  ];
  const rightTabs = [
    { id:"steps",     label:"FLOW",     icon:"🗺️", badge:analysis?.visualSteps?.length },
    { id:"vars",      label:"VARS",     icon:"📊" },
    { id:"errors",    label:"ISSUES",   icon:"🔍", badge:errorCount, badgeAlert:errorCount>0 },
    { id:"diff",      label:"DIFF",     icon:"↔️" },
    { id:"optimized", label:"OPTIMIZE", icon:"⚡" },
    { id:"tests",     label:"TESTS",    icon:"🧪", badge:analysis?.testCases?.length },
    { id:"chat",      label:"TUTOR",    icon:"🤖" },
  ];

  return (
    <div style={{ height:"100vh", background:"#030812", color:"#c9d1d9",
      fontFamily:"'Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* HEADER */}
      <div style={{ background:"#070d14", borderBottom:"1px solid #1e2d3d", padding:"10px 20px",
        display:"flex", alignItems:"center", gap:14, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10,
            background:"linear-gradient(135deg,#38bdf8,#a78bfa,#34d399)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚡</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", letterSpacing:-.5 }}>
              <span style={{ color:"#38bdf8" }}>Code</span>
              <span style={{ color:"#a78bfa" }}>Learn</span>
              <span style={{ color:"#34d399" }}>AI</span>
            </div>
            <div style={{ fontSize:9, color:"#2a5f7f", letterSpacing:3, fontFamily:"monospace" }}>
              INTERACTIVE CODE LEARNING PLATFORM
            </div>
          </div>
        </div>

        <select value={lang} onChange={e=>setLang(e.target.value)} style={{
          background:"#0c1420", border:"1px solid #1e2d3d", color:"#38bdf8", fontSize:11,
          padding:"5px 10px", borderRadius:6, fontFamily:"monospace", cursor:"pointer", outline:"none",
        }}>
          {LANGUAGES.map(l=><option key={l} value={l}>{l}</option>)}
        </select>

        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          {analysis?.language && (
            <span style={{ fontSize:10, background:"#38bdf81a", border:"1px solid #38bdf833",
              color:"#38bdf8", padding:"3px 10px", borderRadius:12, fontFamily:"monospace", letterSpacing:1 }}>
              {analysis.language.toUpperCase()}
            </span>
          )}
          {analysis?.complexity && (
            <span style={{ fontSize:10, background:"#a78bfa1a", border:"1px solid #a78bfa33",
              color:"#a78bfa", padding:"3px 10px", borderRadius:12, fontFamily:"monospace" }}>
              T:{analysis.complexity.time} S:{analysis.complexity.space}
            </span>
          )}
          {analysis && (
            <button onClick={speak} style={{
              background: speaking?"#f8717122":"#38bdf81a",
              border:`1px solid ${speaking?"#f87171":"#38bdf844"}`,
              color: speaking?"#f87171":"#38bdf8",
              fontSize:11, padding:"4px 12px", borderRadius:6, cursor:"pointer",
              fontFamily:"monospace", display:"flex", alignItems:"center", gap:5,
            }}>{speaking?"⏹ Stop":"🔊 Listen"}</button>
          )}
          {loading && (
            <div style={{ display:"flex", alignItems:"center", gap:6, color:"#34d399", fontSize:11, fontFamily:"monospace" }}>
              <Spinner/> Analyzing...
            </div>
          )}
        </div>
      </div>

      {/* BODY */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* LEFT */}
        <div style={{ width:"44%", borderRight:"1px solid #1e2d3d", display:"flex", flexDirection:"column" }}>
          <TabBar tabs={leftTabs} active={leftTab} setActive={setLeftTab}/>

          {leftTab==="editor" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 14px",
                background:"#070d14", borderBottom:"1px solid #1e2d3d" }}>
                {["#ff5f57","#febc2e","#28c840"].map(c=>(
                  <span key={c} style={{ width:11, height:11, borderRadius:"50%", background:c }}/>
                ))}
                <span style={{ marginLeft:8, fontSize:11, color:"#2a5f7f", fontFamily:"monospace" }}>
                  {analysis?.language || (lang!=="Auto Detect"?lang:"untitled")}.txt
                </span>
                {code.trim() && (
                  <button onClick={()=>{setCode(""); setAnalysis(null);}}
                    style={{ marginLeft:"auto", background:"none", border:"1px solid #1e2d3d",
                      color:"#4a6077", fontSize:10, padding:"2px 8px", borderRadius:4,
                      cursor:"pointer", fontFamily:"monospace" }}>CLEAR</button>
                )}
              </div>
              <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
                <textarea value={code} onChange={e=>setCode(e.target.value)}
                  placeholder={"// Paste or type your code here...\n// Analysis starts automatically\n\nfunction fibonacci(n) {\n  if (n <= 1) return n\n  return fibonacci(n-1) + fibonacci(n-2)\n}"}
                  spellCheck={false}
                  style={{ position:"absolute", inset:0, width:"100%", height:"100%",
                    background:"#030812", color:"#c9d1d9", border:"none", outline:"none",
                    resize:"none", padding:"14px 14px 14px 50px",
                    fontFamily:"'JetBrains Mono',monospace", fontSize:13, lineHeight:1.8,
                    caretColor:"#38bdf8", tabSize:2 }}
                  onKeyDown={e=>{
                    if (e.key==="Tab"){
                      e.preventDefault();
                      const s=e.target.selectionStart;
                      const nv=code.substring(0,s)+"  "+code.substring(e.target.selectionEnd);
                      setCode(nv);
                      requestAnimationFrame(()=>{ e.target.selectionStart=e.target.selectionEnd=s+2; });
                    }
                  }}
                />
                <div style={{ position:"absolute", left:0, top:0, width:44, height:"100%",
                  background:"#030812", borderRight:"1px solid #0c1420", pointerEvents:"none",
                  padding:"14px 4px", overflow:"hidden" }}>
                  {(code||"\n").split("\n").map((_,i)=>(
                    <div key={i} style={{ height:"1.8em", lineHeight:"1.8em", textAlign:"right",
                      paddingRight:8, fontSize:11, fontFamily:"monospace", color:"#1e3a5f" }}>{i+1}</div>
                  ))}
                </div>
              </div>
              {analysis?.summary && (
                <div style={{ padding:"8px 14px", background:"#070d14", borderTop:"1px solid #1e2d3d",
                  fontSize:12, color:"#4a6077", lineHeight:1.5 }}>
                  <span style={{ color:"#38bdf8" }}>▸ </span>{analysis.summary}
                </div>
              )}
            </div>
          )}

          {leftTab==="complexity" && (
            <div style={{ flex:1, overflowY:"auto" }}>
              {analysis?.complexityData
                ? <ComplexityChart data={analysis.complexityData} timeLabel={`Time: ${analysis.complexity?.time}`}/>
                : <EmptyState icon="📈" text="Complexity chart appears after analysis."/>
              }
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <TabBar tabs={rightTabs} active={rightTab} setActive={setRightTab}/>
          <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
            {apiErr && (
              <div style={{ margin:12, padding:12, background:"#2e0c0c", border:"1px solid #f8717144",
                borderRadius:8, color:"#f87171", fontSize:12 }}>{apiErr}</div>
            )}
            {rightTab==="steps"     && <StepsPanel analysis={analysis} activeStep={activeStep} setActiveStep={setActiveStep}/>}
            {rightTab==="vars"      && <VariablePanel analysis={analysis} activeStep={activeStep}/>}
            {rightTab==="errors"    && <ErrorsPanel analysis={analysis}/>}
            {rightTab==="diff"      && <DiffPanel analysis={analysis} code={code}/>}
            {rightTab==="optimized" && <OptimizedPanel analysis={analysis}/>}
            {rightTab==="tests"     && <TestsPanel analysis={analysis}/>}
            {rightTab==="chat"      && <ChatPanel code={code} analysis={analysis}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
