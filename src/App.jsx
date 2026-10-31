import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Check, ChevronDown, Cloud, LogOut, Menu, MessageCircle, Moon, Settings2, Sparkles, Sun, X } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import Composer from "./components/Composer.jsx";
import ChatView from "./components/ChatView.jsx";
import { useAuth } from "./components/AuthGate.jsx";
import AvatarStage, { LANGUAGES } from "./components/AvatarStage.jsx";
import CompanionExperience from "./components/CompanionExperience.jsx";
import MemoryPanel from "./components/MemoryPanel.jsx";
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, writeBatch } from "firebase/firestore";

const CHAT_KEY = "astra.conversations.v1";
const MODEL_KEY = "astra.model.v1";
const THEME_KEY = "astra.theme.v1";
const CHARACTER_KEY = "astra.character.v1";
const LANGUAGE_KEY = "astra.language.v1";
const MEMORY_KEY = "astra.memories.v1";
const LOCAL_MODEL = "qwen3.5:0.8b";
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
  const { user, cloudEnabled, db, signOut } = useAuth();
  const [conversations, setConversations] = useState(() => readStorage(CHAT_KEY, []));
  const [activeId, setActiveId] = useState(() => readStorage(CHAT_KEY, [])[0]?.id || null);
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState("ollama");
  const [serviceAvailable, setServiceAvailable] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [apiVerified, setApiVerified] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [apiModel, setApiModel] = useState("gpt-6.1-terra");
  const [modelId, setModelId] = useState(() => readStorage(MODEL_KEY, ""));
  const [theme, setTheme] = useState(() => readStorage(THEME_KEY, "dark"));
  const [character, setCharacter] = useState(() => readStorage(CHARACTER_KEY, "female"));
  const [language, setLanguage] = useState(() => readStorage(LANGUAGE_KEY, "Auto"));
  const [memories, setMemories] = useState(() => readStorage(MEMORY_KEY, []));
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("local");
  const [importOffer, setImportOffer] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companionMode, setCompanionMode] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsCopied, setSettingsCopied] = useState(false);
  const abortRef = useRef(null);
  const currentResponseRef = useRef(null);
  const responseTextRef = useRef("");
  const conversationsRef = useRef(conversations);
  const cloudAllowedIdsRef = useRef(new Set());
  const cloudIdsRef = useRef(new Set());
  const pendingCloudConversationsRef = useRef(new Map());
  const importedMemoryIdsRef = useRef(new Set());
  const cloudMemoryHashRef = useRef("");
  const memoryWritableRef = useRef(false);
  const cloudMemoryLoadedRef = useRef(false);
  const activeUidRef = useRef(user?.uid || null);
  conversationsRef.current = conversations;

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || null, [conversations, activeId]);
  const activeModelId = modelId || apiModel;
  const modelChoices = provider === "ollama"
    ? (availableModels.length
      ? availableModels.map((id) => ({ id, name: id, detail: "Runs locally on this PC" }))
      : [{ id: apiModel || LOCAL_MODEL, name: apiModel || LOCAL_MODEL, detail: "Free local model — download required" }])
    : models.some((item) => item.id === apiModel)
      ? models
      : [{ id: apiModel, name: `Server default · ${apiModel}`, detail: "Set by OPENAI_MODEL" }, ...models];
  const selectedModel = modelChoices.find((item) => item.id === activeModelId) || modelChoices[0];

  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(conversations)); } catch { /* Storage may be full or disabled. */ }
  }, [conversations]);
  useEffect(() => { try { if (modelId) localStorage.setItem(MODEL_KEY, JSON.stringify(modelId)); } catch { /* Keep the current choice for this session. */ } }, [modelId]);
  useEffect(() => { try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch { /* Keep the current choice for this session. */ } document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { try { localStorage.setItem(CHARACTER_KEY, JSON.stringify(character)); } catch { /* Keep the current choice for this session. */ } }, [character]);
  useEffect(() => { try { localStorage.setItem(LANGUAGE_KEY, JSON.stringify(language)); } catch { /* Keep the current choice for this session. */ } }, [language]);
  useEffect(() => { try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memories)); } catch { /* Keep personal notes for this session. */ } }, [memories]);

  useEffect(() => {
    const priorUid = activeUidRef.current;
    if (priorUid && user?.uid && priorUid !== user.uid) {
      setConversations(conversationsRef.current.filter((item) => !cloudIdsRef.current.has(item.id)));
      setMemories([]); setActiveId(null); setImportOffer(false);
      cloudIdsRef.current = new Set(); cloudAllowedIdsRef.current = new Set(); importedMemoryIdsRef.current = new Set();
      memoryWritableRef.current = false; cloudMemoryLoadedRef.current = false;
      setCharacter("female"); setLanguage("Auto");
    }
    activeUidRef.current = user?.uid || null;
  }, [user?.uid]);

  useEffect(() => {
    if (!cloudEnabled || !db || !user) { setCloudReady(false); setProfileReady(false); setCloudStatus("local"); setImportOffer(false); cloudAllowedIdsRef.current = new Set(); cloudIdsRef.current = new Set(); memoryWritableRef.current = false; cloudMemoryLoadedRef.current = false; return undefined; }
    let live = true;
    let revision = 0;
    setCloudReady(false); setProfileReady(false); setCloudStatus("syncing"); setImportOffer(false);
    const userRoot = `users/${user.uid}`;
    const stopConversations = onSnapshot(collection(db, userRoot, "conversations"), (snapshot) => {
      const currentRevision = ++revision;
      Promise.all(snapshot.docs.map(async (conversationDoc) => {
        const metadata = conversationDoc.data();
        const messageSnapshot = await getDocs(query(collection(db, userRoot, "conversations", conversationDoc.id, "messages"), orderBy("createdAt", "asc")));
        return { ...metadata, id: conversationDoc.id, messages: messageSnapshot.docs.map((messageDoc) => ({ ...messageDoc.data(), id: messageDoc.id })) };
      })).then((remote) => {
        if (!live || currentRevision !== revision) return;
        const nextCloudIds = new Set(remote.map((item) => item.id));
        const removedCloudIds = [...cloudIdsRef.current].filter((id) => !nextCloudIds.has(id));
        cloudIdsRef.current = nextCloudIds;
        nextCloudIds.forEach((id) => cloudAllowedIdsRef.current.add(id));
        remote.forEach((item) => pendingCloudConversationsRef.current.delete(item.id));
        setConversations((current) => {
          const localOnly = current.filter((item) => !cloudIdsRef.current.has(item.id) && !removedCloudIds.includes(item.id));
          return [...remote, ...localOnly].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        });
        setCloudReady(true); setCloudStatus("synced");
        try {
          const hasSkippedImport = localStorage.getItem(`astra.import.${user.uid}`);
          if (!hasSkippedImport && remote.length === 0 && conversationsRef.current.length > 0) setImportOffer(true);
        } catch { /* Local import offer is optional. */ }
      }).catch(() => { if (live) { setCloudReady(true); setCloudStatus("issue"); } });
    }, () => { setCloudReady(true); setCloudStatus("issue"); });
    const stopPreferences = onSnapshot(doc(db, userRoot, "preferences", "app"), (snapshot) => {
      if (snapshot.exists()) {
        const preferences = snapshot.data();
        if (["male", "female"].includes(preferences.character)) setCharacter(preferences.character);
        if (LANGUAGES.some((item) => item.value === preferences.language)) setLanguage(preferences.language);
      }
      setProfileReady(true);
    });
    const stopMemories = onSnapshot(collection(db, userRoot, "memories"), (snapshot) => {
      const next = snapshot.docs.map((item) => ({ ...item.data(), id: item.id })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      importedMemoryIdsRef.current = new Set(next.map((item) => item.id));
      cloudMemoryHashRef.current = JSON.stringify(next);
      memoryWritableRef.current = true;
      setMemories((current) => {
        if (!cloudMemoryLoadedRef.current) {
          cloudMemoryLoadedRef.current = true;
          return [...next, ...current.filter((item) => !importedMemoryIdsRef.current.has(item.id))];
        }
        return next;
      });
    }, () => setCloudStatus("issue"));
    return () => { live = false; stopConversations(); stopPreferences(); stopMemories(); };
  }, [cloudEnabled, db, user?.uid]);

  useEffect(() => {
    if (!cloudReady || !profileReady || !db || !user) return;
    setDoc(doc(db, "users", user.uid, "preferences", "app"), { character, language, updatedAt: Date.now() }, { merge: true }).then(() => setCloudStatus("synced")).catch(() => setCloudStatus("issue"));
  }, [character, language, cloudReady, profileReady, db, user?.uid]);

  useEffect(() => {
    if (!cloudReady || !db || !user || !memoryWritableRef.current) return undefined;
    const currentHash = JSON.stringify(memories);
    if (currentHash === cloudMemoryHashRef.current) return undefined;
    const timer = setTimeout(async () => {
      try {
        const snapshot = await getDocs(collection(db, "users", user.uid, "memories"));
        const remoteIds = new Set(snapshot.docs.map((item) => item.id));
        const batch = writeBatch(db);
        memories.forEach((memory) => batch.set(doc(db, "users", user.uid, "memories", memory.id), { ...memory, updatedAt: memory.updatedAt || memory.createdAt }, { merge: true }));
        snapshot.docs.forEach((item) => { if (!memories.some((memory) => memory.id === item.id)) batch.delete(item.ref); });
        if (memories.length || remoteIds.size) await batch.commit();
        importedMemoryIdsRef.current = new Set(memories.map((memory) => memory.id));
        cloudMemoryHashRef.current = JSON.stringify(memories);
        setCloudStatus("synced");
      } catch { setCloudStatus("issue"); }
    }, 400);
    return () => clearTimeout(timer);
  }, [memories, cloudReady, db, user?.uid]);

  useEffect(() => {
    if (!cloudReady || !pendingCloudConversationsRef.current.size) return;
    const queued = [...pendingCloudConversationsRef.current.values()];
    queued.forEach((conversation) => persistConversationToCloud(conversation));
  }, [cloudReady]);
  useEffect(() => {
    let ignore = false;
    fetch("/api/health").then((response) => response.json()).then((status) => {
      if (!ignore) {
        const currentProvider = status.provider || "ollama";
        const localModels = Array.isArray(status.models) ? status.models : [];
        const serverModel = status.model || (currentProvider === "ollama" ? LOCAL_MODEL : "gpt-6.1-terra");
        setProvider(currentProvider);
        setServiceAvailable(Boolean(status.serviceAvailable));
        setAvailableModels(localModels);
        setConfigured(Boolean(status.configured));
        setApiModel(serverModel);
        setModelId((current) => currentProvider === "ollama"
          ? (localModels.includes(current) && !(current === "qwen3.5:4b" && serverModel === LOCAL_MODEL) ? current : serverModel)
          : (models.some((item) => item.id === current) ? current : serverModel));
      }
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

  async function persistConversationToCloud(conversation) {
    if (!cloudEnabled || !db || !user || !cloudAllowedIdsRef.current.has(conversation.id)) return false;
    if (!cloudReady) { pendingCloudConversationsRef.current.set(conversation.id, conversation); return false; }
    setCloudStatus("syncing");
    const conversationRef = doc(db, "users", user.uid, "conversations", conversation.id);
    const now = Date.now();
    try {
      const messageCollection = collection(conversationRef, "messages");
      const remoteMessages = await getDocs(messageCollection);
      const messageIds = new Set((conversation.messages || []).map((item) => item.id));
      const operations = [];
      (conversation.messages || []).forEach((message) => operations.push({ type: "set", ref: doc(messageCollection, message.id), data: { ...message, createdAt: message.createdAt || now } }));
      remoteMessages.docs.forEach((messageDoc) => { if (!messageIds.has(messageDoc.id)) operations.push({ type: "delete", ref: messageDoc.ref }); });
      for (let start = 0; start < operations.length; start += 400) {
        const batch = writeBatch(db);
        operations.slice(start, start + 400).forEach((operation) => operation.type === "set" ? batch.set(operation.ref, operation.data) : batch.delete(operation.ref));
        await batch.commit();
      }
      await setDoc(conversationRef, { id: conversation.id, title: conversation.title || "New conversation", createdAt: conversation.createdAt || conversation.messages?.[0]?.createdAt || now, updatedAt: conversation.updatedAt || now }, { merge: true });
      cloudIdsRef.current.add(conversation.id); pendingCloudConversationsRef.current.delete(conversation.id); setCloudStatus("synced");
      return true;
    } catch { setCloudStatus("issue"); return false; }
  }

  async function deleteConversationFromCloud(id) {
    if (!cloudEnabled || !db || !user || !cloudIdsRef.current.has(id)) return;
    try {
      const messageCollection = collection(db, "users", user.uid, "conversations", id, "messages");
      const messages = await getDocs(messageCollection);
      for (let start = 0; start < messages.docs.length; start += 400) {
        const batch = writeBatch(db);
        messages.docs.slice(start, start + 400).forEach((item) => batch.delete(item.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, "users", user.uid, "conversations", id));
      cloudIdsRef.current.delete(id); cloudAllowedIdsRef.current.delete(id);
    } catch { setCloudStatus("issue"); }
  }

  function importLocalChats() {
    const local = conversationsRef.current;
    local.forEach((conversation) => cloudAllowedIdsRef.current.add(conversation.id));
    setImportOffer(false); setCloudStatus("syncing");
    try { localStorage.setItem(`astra.import.${user.uid}`, "done"); } catch { /* Account-scoped import marker is optional. */ }
    memoryWritableRef.current = true;
    Promise.all(local.map(persistConversationToCloud)).then((results) => setCloudStatus(results.every(Boolean) ? "synced" : "issue"));
  }

  function keepLocalChats() {
    setImportOffer(false);
    try { localStorage.setItem(`astra.import.${user.uid}`, "skipped"); } catch { /* Account-scoped prompt marker is optional. */ }
  }

  function rememberMessage(text) {
    const cleaned = text.trim().slice(0, 500);
    if (!cleaned || memories.some((memory) => memory.text === cleaned)) return;
    if (cloudEnabled && cloudReady) memoryWritableRef.current = true;
    setMemories((current) => [...current, { id: makeId(), text: cleaned, createdAt: Date.now(), updatedAt: Date.now() }]);
    setMemoryOpen(true);
  }

  function addMemory(text) {
    const cleaned = text.trim().slice(0, 500);
    if (!cleaned || memories.some((memory) => memory.text === cleaned)) return;
    if (cloudEnabled && cloudReady) memoryWritableRef.current = true;
    setMemories((current) => [...current, { id: makeId(), text: cleaned, createdAt: Date.now(), updatedAt: Date.now() }]);
  }

  function deleteMemory(id) {
    if (cloudEnabled && cloudReady) memoryWritableRef.current = true;
    setMemories((current) => current.filter((memory) => memory.id !== id));
  }

  function ensureConversationForVoice() {
    if (activeId && cloudAllowedIdsRef.current.has(activeId)) return activeId;
    const id = makeId();
    const conversation = { id, title: "Voice chat", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    setConversations((current) => [conversation, ...current]); setActiveId(id);
    cloudAllowedIdsRef.current.add(id); void persistConversationToCloud(conversation);
    return id;
  }

  function cancelCurrentResponse() {
    const current = currentResponseRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    currentResponseRef.current = null;
    if (current && !responseTextRef.current) {
      updateConversation(current.conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.filter((message) => message.id !== current.responseId),
      }));
    }
    responseTextRef.current = "";
    setBusy(false);
  }

  function startNew() {
    cancelCurrentResponse();
    setActiveId(null);
    setSidebarOpen(false);
    setModelOpen(false);
  }

  function selectConversation(id) {
    if (busy) cancelCurrentResponse();
    setActiveId(id);
  }

  function renameConversation(id) {
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return;
    const next = window.prompt("Rename conversation", conversation.title);
    if (next?.trim()) {
      const updated = { ...conversation, title: next.trim(), updatedAt: Date.now() };
      updateConversation(id, () => updated); void persistConversationToCloud(updated);
    }
  }

  function deleteConversation(id) {
    if (activeId === id) cancelCurrentResponse();
    void deleteConversationFromCloud(id);
    setConversations((current) => current.filter((item) => item.id !== id));
    if (activeId === id) setActiveId(null);
  }

  async function sendMessage({ text, attachments = [], thinking = false }) {
    if (busy || (!text.trim() && !attachments.length)) return;
    const userContent = text.trim() || `Please review ${attachments.map((file) => file.name).join(", ")}.`;
    const contextualContent = attachments.length
      ? `${userContent}\n\n${attachments.map((file) => `--- Attached file: ${file.name} ---\n${file.content}`).join("\n\n")}`
      : userContent;
    const id = activeId || makeId();
    const now = Date.now();
    const userMessage = { id: makeId(), role: "user", content: userContent, createdAt: now, attachments: attachments.map(({ name }) => ({ name })) };
    const responseId = makeId();
    currentResponseRef.current = { conversationId: id, responseId };
    responseTextRef.current = "";
    const existing = conversations.find((conversation) => conversation.id === id);
    const initial = existing || { id, title: titleFrom(userContent), createdAt: now, updatedAt: now, messages: [] };
    const history = [...initial.messages, userMessage];
    const withPlaceholder = [...history, { id: responseId, role: "assistant", content: "", createdAt: now + 1 }];
    const startedConversation = { ...initial, updatedAt: now, messages: withPlaceholder };
    if (!existing && cloudEnabled) cloudAllowedIdsRef.current.add(id);
    setConversations((current) => [startedConversation, ...current.filter((item) => item.id !== id)]);
    void persistConversationToCloud(startedConversation);
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
      if (provider === "ollama" && !configured) {
        const message = serviceAvailable
          ? `Ollama is running, but no local model is installed yet. Open Command Prompt and run: ollama pull ${apiModel}. Then refresh Astra.`
          : "Astra's free local AI needs Ollama. Install it from ollama.com/download, run the model command shown in Settings, then refresh this page.";
        setResponseText(message);
      } else if (!configured) {
        const answer = previewAnswer(text.trim(), attachments);
        for (const chunk of answer.match(/.{1,20}/gs) || [answer]) {
          if (controller.signal.aborted) break;
          appendDelta(chunk);
          await new Promise((resolve) => setTimeout(resolve, 14));
        }
      } else {
        const apiMessages = history.slice(provider === "ollama" ? -12 : -60).map((message, index, items) => ({
          role: message.role,
          content: index === items.length - 1 ? contextualContent : message.content,
        }));
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}) },
          body: JSON.stringify({ model: activeModelId, thinking, language, character, memories: memories.map((memory) => memory.text), messages: apiMessages }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const requestError = new Error(payload.error || `The assistant returned an error (${response.status}).`);
          requestError.code = response.status === 401 ? "invalid_api_key" : `http_${response.status}`;
          throw requestError;
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
            if (event.event === "error") {
              const streamError = new Error(event.message || "Astra could not finish the response.");
              streamError.code = event.code || "api_error";
              throw streamError;
            }
          }
        }
        if (!controller.signal.aborted) { setApiVerified(true); setConnectionError(""); }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        setConnectionError(error.code || "api_error");
        const current = responseTextRef.current;
        setResponseText(current ? `${current}\n\n> ${error.message}` : `I couldn't finish that response. ${error.message}`);
      }
    } finally {
      const stillCurrent = currentResponseRef.current?.responseId === responseId;
      if (stillCurrent) currentResponseRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
      const latestConversation = conversationsRef.current.find((conversation) => conversation.id === id);
      if (latestConversation) {
        const completedConversation = { ...latestConversation, updatedAt: Date.now(), messages: latestConversation.messages.map((message) => message.id === responseId && responseTextRef.current ? { ...message, content: responseTextRef.current } : message) };
        void persistConversationToCloud(completedConversation);
      }
      if (stillCurrent) setBusy(false);
    }
  }

  function stopResponse() {
    cancelCurrentResponse();
  }

  async function handleSignOut() {
    const localOnly = conversationsRef.current.filter((item) => !cloudIdsRef.current.has(item.id));
    const localMemories = memories.filter((item) => !importedMemoryIdsRef.current.has(item.id));
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(localOnly));
      localStorage.setItem(MEMORY_KEY, JSON.stringify(localMemories));
    } catch { /* Account data stays available from the cloud after sign-in. */ }
    await signOut();
  }

  async function copySetup() {
    try {
      const snippet = provider === "ollama" ? `ollama pull ${apiModel || LOCAL_MODEL}` : "OPENAI_API_KEY=your_api_key_here\nOPENAI_MODEL=gpt-6.1-terra";
      await navigator.clipboard.writeText(snippet);
      setSettingsCopied(true);
      setTimeout(() => setSettingsCopied(false), 1800);
    } catch { setSettingsCopied(false); }
  }

  const connectionClass = connectionError ? "error" : provider === "ollama"
    ? configured ? (apiVerified ? "connected" : "configured") : serviceAvailable ? "configured" : "preview"
    : !configured ? "preview" : apiVerified ? "connected" : "configured";
  const connectionLabel = connectionError ? "Connection issue" : provider === "ollama"
    ? configured ? (apiVerified ? "Local AI ready" : "Local model ready") : serviceAvailable ? "Install a model" : "Install Ollama"
    : !configured ? "Preview mode" : apiVerified ? "Connected" : "Key configured";
  const connectionDetail = connectionError
    ? "The last request could not reach a working model. Check the response message and connection settings."
    : provider === "ollama"
      ? configured
        ? `Astra is using ${activeModelId} on this computer. No API key is needed.`
        : serviceAvailable
          ? `Ollama is running. Download ${apiModel} to enable local answers.`
          : "Install Ollama and a local model for free answers. No API key is required."
      : !configured
        ? "Connect your OpenAI API key for live answers."
        : apiVerified
          ? "Astra has successfully received a live response from your OpenAI account."
          : "An API key is configured. Astra will verify it with the first live request.";
  const cloudLabel = !cloudEnabled ? "This device" : cloudStatus === "synced" ? "Synced" : cloudStatus === "issue" ? "Sync issue" : "Syncing";

  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), conversations, memories, preferences: { character, language } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "astra-personal-data.json"; link.click(); URL.revokeObjectURL(url);
  }

  return <>
    <CompanionExperience character={character} onCharacterChange={setCharacter} language={language} conversation={activeConversation} busy={busy} onSend={sendMessage} onStop={stopResponse} onOpenChats={() => setCompanionMode(false)} hidden={!companionMode} />
    <div className={`app-shell ${companionMode ? "app-shell-hidden" : ""}`}>
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
                {modelChoices.map((model) => <button key={model.id} className="model-option" onClick={() => { setModelId(model.id); setModelOpen(false); }}>
                  <span className="model-option-mark"><Sparkles size={14} /></span><span className="model-option-copy"><strong>{model.name}</strong><small>{model.detail}</small></span>{activeModelId === model.id && <Check size={15} className="model-check" />}
                </button>)}
                <div className="model-menu-foot">{connectionError ? "Check the latest response for connection details" : provider === "ollama" ? configured ? "Runs locally on your PC — no API bill" : "Free local setup steps are in Settings" : !configured ? "Connect an API key to use live models" : apiVerified ? "Connected through your OpenAI account" : "API key set; verified on the first response"}</div>
              </div>
            </>}
          </div>
        </div>
        <div className="topbar-right">
          <button className="companion-return-button" onClick={() => setCompanionMode(true)} aria-label="Open companion view"><MessageCircle size={15} /><span>Companion</span></button>
          <span className={`connection-status ${connectionClass}`} title={connectionDetail}><i />{connectionLabel}</span>
          <span className={`cloud-status ${cloudEnabled ? "cloud-on" : ""}`} title={cloudEnabled ? `Cloud account ${user.email || "connected"}` : "Cloud sync is not connected in this preview"}><Cloud size={13} />{cloudLabel}</span>
          <span className="topbar-separator" />
          <button className="icon-button settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings2 size={17} /></button>
          <span className="top-avatar"><img src={character === "female" ? "/characters/astra-female.jpg" : "/characters/astra-male.png"} alt="" /></span>
        </div>
      </header>

      {importOffer && <div className="import-banner"><Cloud size={16} /><div><strong>Bring your Astra history over?</strong><span>Found chats and saved notes on this device. You can import them to your account for syncing.</span></div><button onClick={importLocalChats}>Import chats + memories</button><button className="import-skip" onClick={keepLocalChats}>Keep on device</button></div>}

      <div className={`workspace ${activeConversation?.messages?.length ? "workspace-in-chat" : ""}`}>
        <AvatarStage conversationId={activeId && cloudAllowedIdsRef.current.has(activeId) ? activeId : null} onEnsureConversation={ensureConversationForVoice} character={character} onCharacterChange={setCharacter} language={language} onLanguageChange={setLanguage} />
        <ChatView conversation={activeConversation} busy={busy} onPrompt={(prompt) => sendMessage({ text: prompt })} onRemember={rememberMessage} language={language} />
        <div className={`composer-dock ${activeConversation?.messages?.length ? "composer-dock-chat" : ""}`}>
          <Composer onSend={sendMessage} busy={busy} onStop={stopResponse} autoFocus={!activeConversation?.messages?.length} language={language} />
          <p className="disclaimer">Astra is an AI companion. It can make mistakes; verify important details.</p>
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
        <div className="settings-section"><h3>Your companion</h3><p>Choose a language for typed and spoken chats.</p><label className="settings-select-label">Conversation language<select className="settings-select" value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div className="settings-actions-row"><button className="settings-action" onClick={() => { setSettingsOpen(false); setMemoryOpen(true); }}><BookmarkPlus size={15} />Things to remember <span>{memories.length}</span></button><button className="settings-action" onClick={exportData}>Export my data</button></div></div>
        <div className="settings-section cloud-section"><div className="settings-row-title"><div><h3>Account & sync</h3><p>{cloudEnabled ? `Signed in as ${user.email || "your Astra account"}. Your approved chats and memories sync here.` : "This preview stores chats on this device. Cloud sign-in and cross-device sync turn on after Firebase is connected."}</p></div><span className={`connection-pill ${cloudEnabled ? "connected" : "preview"}`}><i />{cloudEnabled ? cloudLabel : "Device only"}</span></div>{cloudEnabled ? <button className="copy-setup account-signout" onClick={handleSignOut}><LogOut size={14} />Sign out</button> : <div className="setup-steps"><span><Cloud size={12} /></span><p>To publish the cloud app, connect Firebase Authentication and Firestore to the project. The account sign-in screen will appear automatically once configured.</p></div>}</div>
        <div className="settings-section connection-section"><div className="settings-row-title"><div><h3>AI connection</h3><p>{connectionDetail}</p></div><span className={`connection-pill ${connectionClass}`}><i />{connectionError ? "Issue" : provider === "ollama" ? configured ? "Local" : serviceAvailable ? "Model needed" : "Setup needed" : !configured ? "Preview" : apiVerified ? "Live" : "Key set"}</span></div>
          {provider === "ollama" ? <>
            {!serviceAvailable && <div className="setup-steps"><span>1</span><p>Install the free <a href="https://ollama.com/download/windows" target="_blank" rel="noreferrer">Ollama app for Windows</a>, then open it once.</p></div>}
            <div className="setup-steps"><span>{serviceAvailable ? "1" : "2"}</span><p>In Command Prompt, download the local model: <code>ollama pull {apiModel || LOCAL_MODEL}</code>.</p></div>
            <div className="setup-steps"><span>{serviceAvailable ? "2" : "3"}</span><p>Wait for the download to finish, then refresh Astra. No API key is needed.</p></div>
            <p className="model-download-note">The recommended quick model download is about 1.2–1.3 GB. It runs on this computer, so speed depends on your hardware.</p>
            <button className="copy-setup" onClick={copySetup}>{settingsCopied ? <Check size={14} /> : <span className="copy-brackets">{`>_`}</span>}{settingsCopied ? "Copied model command" : "Copy model command"}</button>
          </> : !configured && <><div className="setup-steps"><span>1</span><p>Add your OpenAI API key to a <code>.env</code> file in the project folder.</p></div><div className="setup-steps"><span>2</span><p>Restart Astra. Your key stays on the server and is never saved in this browser.</p></div><button className="copy-setup" onClick={copySetup}>{settingsCopied ? <Check size={14} /> : <span className="copy-brackets">{`{ }`}</span>}{settingsCopied ? "Copied setup snippet" : "Copy setup snippet"}</button></>}
        </div>
        <div className="settings-footer"><span className="settings-orb"><Sparkles size={13} /></span><span>Astra <small>A little company, whenever you need it.</small></span><span className="settings-version">v1.1</span></div>
      </section>
    </div>}
    {memoryOpen && <MemoryPanel memories={memories} onAdd={addMemory} onDelete={deleteMemory} onClose={() => setMemoryOpen(false)} cloudEnabled={cloudEnabled} />}
  </div>
  </>;
}
