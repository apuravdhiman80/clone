import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Menu, Moon, Settings2, Sparkles, Sun, X } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import Composer from "./components/Composer.jsx";
import ChatView from "./components/ChatView.jsx";

const CHAT_KEY = "astra.conversations.v1";
const MODEL_KEY = "astra.model.v1";
const THEME_KEY = "astra.theme.v1";
const models = [
  { id: "gpt-6.1-terra", name: "Astra Balanced", detail: "A little bit of everything" },
  { id: "gpt-6.1-sol", name: "Astra Reasoning", detail: "For deeper, careful thinking" },
  { id: "gpt-6-luna", name: "Astra Quick", detail: "For everyday questions" },
];

function readStorage(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function makeId() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function titleFrom(text) { const cleaned = text.replace(/\s+/g, " ").trim(); return cleaned.length > 34 ? `${cleaned.slice(0, 34).trimEnd()}…` : cleaned || "New conversation"; }

function previewAnswer(text, files) {
  const topic = text ? `“${text.length > 100 ? `${text.slice(0, 100).trim()}…` : text}”` : `the ${files.length === 1 ? "file" : "files"} you shared`;
  const isDecision = /decid|choose|should i|which|weigh|pros and cons/i.test(text);
  const isPlan = /plan|organize|schedule|roadmap|steps/i.test(text);
  const isWrite = /write|draft|email|message|caption|rewrite/i.test(text);
  let body;
  if (isDecision) body = `A useful way to approach ${topic} is to make the trade-offs visible first.\n\n1. **Name what matters most.** What outcome are you trying to protect or create?\n2. **List the real options.** Include waiting or doing nothing if those are on the table.\n3. **Test each against your priorities.** Notice which costs are temporary and which are hard to reverse.\n4. **Choose a small next step.** You can learn more before committing fully.`;
  else if (isPlan) body = `Let's make ${topic} feel manageable.\n\n### A simple starting plan\n- **Get clear on the outcome:** write down what “done” looks like.\n- **Pick the next three steps:** keep each one small enough to finish in a sitting.\n- **Give the first step a time:** a specific slot makes it much easier to begin.\n- **Leave room to adjust:** review what worked and reshape the plan as you go.`;
  else if (isWrite) body = `Absolutely. For ${topic}, start with the one thing you want the reader to understand or do. A clear draft usually needs just three pieces:\n\n- **A human opening** that gives a little context\n- **The main point** in one or two direct sentences\n- **A warm close** with the next step, if there is one\n\nShare the audience and tone you're after, and I can shape a more tailored version.`;
  else body = `Here's a clear way to get started with ${topic}:\n\n1. **Start with the core question.** What would a useful answer help you decide, understand, or do?\n2. **Break it into smaller pieces.** The tricky part is often easier once the moving parts are visible.\n3. **Choose one next action.** A concrete first step is more helpful than a perfect plan.\n\nTell me which part you'd like to explore first and we'll take it from there.`;
  return `${body}\n\n---\n*Preview answer · Add an OpenAI API key on the server for live Astra responses.*`;
}

export default function App() {
  const [conversations, setConversations] = useState(() => readStorage(CHAT_KEY, []));
  const [activeId, setActiveId] = useState(() => readStorage(CHAT_KEY, [])[0]?.id || null);
  const [configured, setConfigured] = useState(false);
  const [apiModel, setApiModel] = useState("gpt-6.1-terra");
  const [modelId, setModelId] = useState(() => readStorage(MODEL_KEY, "gpt-6.1-terra"));
  const [theme, setTheme] = useState(() => readStorage(THEME_KEY, "dark"));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsCopied, setSettingsCopied] = useState(false);
  const abortRef = useRef(null);
  const currentResponseRef = useRef(null);
  const responseTextRef = useRef("");

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || null, [conversations, activeId]);
  const selectedModel = models.find((item) => item.id === modelId) || models[0];

  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(conversations)); } catch { /* Storage may be full or disabled. */ }
  }, [conversations]);
  useEffect(() => { localStorage.setItem(MODEL_KEY, JSON.stringify(modelId)); }, [modelId]);
  useEffect(() => { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    let ignore = false;
    fetch("/api/health").then((response) => response.json()).then((status) => {
      if (!ignore) { setConfigured(Boolean(status.configured)); setApiModel(status.model || "gpt-6.1-terra"); }
    }).catch(() => { if (!ignore) setConfigured(false); });
    return () => { ignore = true; };
  }, []);
  useEffect(() => {
    function shortcuts(event) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") { event.preventDefault(); startNew(); document.querySelector(".composer-card textarea")?.focus(); }
      if ((event.metaKey || event.ctrlKey) && key === "f") { event.preventDefault(); setSidebarOpen(true); document.querySelector(".search-box input")?.focus(); }
      if (key === "Escape") { setSettingsOpen(false); setModelOpen(false); setSidebarOpen(false); }
    }
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  });

  const updateConversation = useCallback((id, updater) => {
    setConversations((current) => current.map((conversation) => conversation.id === id ? updater(conversation) : conversation));
  }, []);

  function startNew() {
    abortRef.current?.abort();
    setBusy(false);
    setActiveId(null);
    setSidebarOpen(false);
    setModelOpen(false);
  }

  function selectConversation(id) {
    if (busy) abortRef.current?.abort();
    setBusy(false);
    setActiveId(id);
  }

  function renameConversation(id) {
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return;
    const next = window.prompt("Rename conversation", conversation.title);
    if (next?.trim()) updateConversation(id, (item) => ({ ...item, title: next.trim(), updatedAt: Date.now() }));
  }

  function deleteConversation(id) {
    setConversations((current) => current.filter((item) => item.id !== id));
    if (activeId === id) { setActiveId(null); setBusy(false); abortRef.current?.abort(); }
  }

  async function sendMessage({ text, attachments = [] }) {
    if (busy || (!text.trim() && !attachments.length)) return;
    const userContent = text.trim() || `Please review ${attachments.map((file) => file.name).join(", ")}.`;
    const contextualContent = attachments.length
      ? `${userContent}\n\n${attachments.map((file) => `--- Attached file: ${file.name} ---\n${file.content}`).join("\n\n")}`
      : userContent;
    const id = activeId || makeId();
    const now = Date.now();
    const userMessage = { id: makeId(), role: "user", content: userContent, attachments: attachments.map(({ name }) => ({ name })) };
    const responseId = makeId();
    currentResponseRef.current = { conversationId: id, responseId };
    responseTextRef.current = "";
    const existing = conversations.find((conversation) => conversation.id === id);
    const initial = existing || { id, title: titleFrom(userContent), updatedAt: now, messages: [] };
    const history = [...initial.messages, userMessage];
    const withPlaceholder = [...history, { id: responseId, role: "assistant", content: "" }];
    setConversations((current) => [{ ...initial, updatedAt: now, messages: withPlaceholder }, ...current.filter((item) => item.id !== id)]);
    setActiveId(id);
    setBusy(true);
    setSidebarOpen(false);
    const appendDelta = (delta) => {
      responseTextRef.current += delta;
      updateConversation(id, (conversation) => ({
        ...conversation,
        updatedAt: Date.now(),
        messages: conversation.messages.map((message) => message.id === responseId ? { ...message, content: message.content + delta } : message),
      }));
    };
    const setResponseText = (content) => updateConversation(id, (conversation) => ({
      ...conversation,
      updatedAt: Date.now(),
      messages: conversation.messages.map((message) => message.id === responseId ? { ...message, content } : message),
    }));
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!configured) {
        const answer = previewAnswer(text.trim(), attachments);
        for (const chunk of answer.match(/.{1,20}/gs) || [answer]) {
          if (controller.signal.aborted) break;
          appendDelta(chunk);
          await new Promise((resolve) => setTimeout(resolve, 14));
        }
      } else {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelId || apiModel, messages: [...history.slice(0, -1).map(({ role, content }) => ({ role, content })), { role: "user", content: contextualContent }] }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `The assistant returned an error (${response.status}).`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";
          for (const block of blocks) {
            const line = block.split("\n").find((item) => item.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6));
            if (event.event === "delta" && event.text) appendDelta(event.text);
            if (event.event === "error") throw new Error(event.message || "Astra could not finish the response.");
          }
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        const current = responseTextRef.current;
        setResponseText(current ? `${current}\n\n> ${error.message}` : `I couldn't finish that response. ${error.message}`);
      }
    } finally {
      if (currentResponseRef.current?.responseId === responseId) currentResponseRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  function stopResponse() {
    abortRef.current?.abort();
    setBusy(false);
  }

  async function copySetup() {
    try {
      await navigator.clipboard.writeText("OPENAI_API_KEY=your_api_key_here\nOPENAI_MODEL=gpt-6.1-terra");
      setSettingsCopied(true);
      setTimeout(() => setSettingsCopied(false), 1800);
    } catch { setSettingsCopied(false); }
  }

  return <div className="app-shell">
    <Sidebar conversations={conversations} activeId={activeId} onNew={startNew} onSelect={selectConversation} onRename={renameConversation} onDelete={deleteConversation} onSettings={() => setSettingsOpen(true)} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button mobile-menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="model-picker-wrap">
            <button className={`model-picker ${modelOpen ? "model-picker-open" : ""}`} onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen}>
              <span>{selectedModel.name}</span><ChevronDown size={14} />
            </button>
            {modelOpen && <>
              <button className="menu-dismiss" aria-label="Close model menu" onClick={() => setModelOpen(false)} />
              <div className="model-menu">
                <div className="model-menu-heading">CHOOSE YOUR ASTRA</div>
                {models.map((model) => <button key={model.id} className="model-option" onClick={() => { setModelId(model.id); setModelOpen(false); }}>
                  <span className="model-option-mark"><Sparkles size={14} /></span><span className="model-option-copy"><strong>{model.name}</strong><small>{model.detail}</small></span>{modelId === model.id && <Check size={15} className="model-check" />}
                </button>)}
                <div className="model-menu-foot">{configured ? "Available through your OpenAI account" : "Connect an API key to use live models"}</div>
              </div>
            </>}
          </div>
        </div>
        <div className="topbar-right">
          <span className={`connection-status ${configured ? "connected" : "preview"}`}><i />{configured ? "Connected" : "Preview mode"}</span>
          <span className="topbar-separator" />
          <button className="icon-button settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings2 size={17} /></button>
          <span className="top-avatar">A</span>
        </div>
      </header>

      <div className={`workspace ${activeConversation?.messages?.length ? "workspace-in-chat" : ""}`}>
        <ChatView conversation={activeConversation} busy={busy} onPrompt={(prompt) => sendMessage({ text: prompt })} />
        <div className={`composer-dock ${activeConversation?.messages?.length ? "composer-dock-chat" : ""}`}>
          <Composer onSend={sendMessage} busy={busy} onStop={stopResponse} autoFocus={!activeConversation?.messages?.length} />
          <p className="disclaimer">Astra can make mistakes. For important decisions, verify the details.</p>
        </div>
      </div>
      <div className="ambient-glow" />
    </main>

    {settingsOpen && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-header"><div><span className="dialog-eyebrow">YOUR ASTRA</span><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={18} /></button></div>
        <div className="settings-section"><h3>Appearance</h3><p>Make Astra feel like your space.</p><div className="appearance-switch">
          <button className={theme === "dark" ? "chosen" : ""} onClick={() => setTheme("dark")}><Moon size={15} />Dark</button>
          <button className={theme === "light" ? "chosen" : ""} onClick={() => setTheme("light")}><Sun size={15} />Light</button>
        </div></div>
        <div className="settings-section connection-section"><div className="settings-row-title"><div><h3>AI connection</h3><p>{configured ? "Astra is ready to answer with your OpenAI account." : "Connect your OpenAI account for live answers."}</p></div><span className={`connection-pill ${configured ? "on" : "off"}`}><i />{configured ? "Live" : "Preview"}</span></div>
          {!configured && <><div className="setup-steps"><span>1</span><p>Add your OpenAI API key to a <code>.env</code> file in the project folder.</p></div><div className="setup-steps"><span>2</span><p>Restart Astra. Your key stays on the server and is never saved in this browser.</p></div><button className="copy-setup" onClick={copySetup}>{settingsCopied ? <Check size={14} /> : <span className="copy-brackets">{`{ }`}</span>}{settingsCopied ? "Copied setup snippet" : "Copy setup snippet"}</button></>}
        </div>
        <div className="settings-footer"><span className="settings-orb"><Sparkles size={13} /></span><span>Astra <small>Made for your next good idea.</small></span><span className="settings-version">v1.0</span></div>
      </section>
    </div>}
  </div>;
}
