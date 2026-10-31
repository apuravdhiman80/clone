import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Check, Code2, Copy, GraduationCap, Lightbulb, PenLine, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const starters = [
  { icon: Lightbulb, label: "Think something through", prompt: "Help me think through a decision I'm weighing." },
  { icon: PenLine, label: "Write with a little polish", prompt: "Help me write a thoughtful, clear message." },
  { icon: Code2, label: "Make something work", prompt: "I have a project idea. Help me turn it into a simple plan." },
  { icon: GraduationCap, label: "Learn at my pace", prompt: "Teach me a surprising concept in a simple, memorable way." },
];

function Greeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return <>
    <div className="welcome-orbit"><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /><span className="orbit-core"><i /><i /><i /><i /></span></div>
    <p className="welcome-kicker">A LITTLE MORE CLARITY. A LITTLE MORE YOU.</p>
    <h1>{greeting},<br /><span>what's on your mind?</span></h1>
    <p className="welcome-description">Bring a question, a half-formed thought, or the thing you can't quite untangle. We'll find a way through it.</p>
  </>;
}

const speechLocale = { English: "en-IN", Hindi: "hi-IN", Bengali: "bn-IN", Gujarati: "gu-IN", Kannada: "kn-IN", Malayalam: "ml-IN", Marathi: "mr-IN", Odia: "or-IN", Punjabi: "pa-IN", Tamil: "ta-IN", Telugu: "te-IN", Urdu: "ur-IN" };

function Message({ message, onRemember, language }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* Clipboard may be unavailable in insecure contexts. */ }
  }
  function speak() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.rate = 1;
    utterance.lang = speechLocale[language] || navigator.language || "en-IN";
    window.speechSynthesis.speak(utterance);
  }

  if (message.role === "user") return <article className="message message-user">
    <div className="user-message-content">
      {message.attachments?.length > 0 && <div className="message-attachments">{message.attachments.map((file, index) => <span className="message-attachment" key={`${file.name}-${index}`}>↗ {file.name}</span>)}</div>}
      {message.content && <p>{message.content}</p>}
      {message.content && onRemember && <button className="remember-message" onClick={() => onRemember(message.content)}><BookmarkPlus size={12} />Remember</button>}
    </div>
  </article>;

  return <article className="message message-assistant">
    <div className="assistant-avatar"><span className="mini-orb"><i /><i /><i /><i /></span></div>
    <div className="assistant-message-body">
      {message.content ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div> : <div className="typing-indicator" aria-label="Astra is thinking"><i /><i /><i /></div>}
      {message.content && <div className="message-actions">
        <button onClick={copy} title="Copy response" aria-label="Copy response">{copied ? <Check size={14} /> : <Copy size={14} />}{copied && <span>Copied</span>}</button>
        <button onClick={speak} disabled={!("speechSynthesis" in window)} title={"speechSynthesis" in window ? "Read aloud" : "Text-to-speech isn't available in this browser"} aria-label="Read response aloud"><Volume2 size={15} /></button>
      </div>}
    </div>
  </article>;
}

export default function ChatView({ conversation, busy, onPrompt, onRemember, language }) {
  const scrollRef = useRef(null);
  const isEmpty = !conversation?.messages?.length;
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages]);

  return <div className={`chat-scroll ${isEmpty ? "chat-scroll-empty" : ""}`} ref={scrollRef}>
    {isEmpty ? <div className="welcome-content">
      <Greeting />
      <div className="starter-grid">
        {starters.map(({ icon: Icon, label, prompt }) => <button className="starter-card" onClick={() => onPrompt(prompt)} key={label}>
          <span className="starter-icon"><Icon size={17} strokeWidth={1.8} /></span>
          <span>{label}</span><span className="starter-arrow">↗</span>
        </button>)}
      </div>
    </div> : <div className="message-list">
      {conversation.messages.map((message) => <Message key={message.id} message={message} onRemember={onRemember} language={language} />)}
      {busy && conversation.messages.at(-1)?.role !== "assistant" && <article className="message message-assistant"><div className="assistant-avatar"><span className="mini-orb"><i /><i /><i /><i /></span></div><div className="typing-indicator"><i /><i /><i /></div></article>}
    </div>}
  </div>;
}
