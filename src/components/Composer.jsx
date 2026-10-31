import { useRef, useState } from "react";
import { ArrowUp, FileText, Mic, Paperclip, Plus, Sparkles, X } from "lucide-react";

const speechLanguage = { English: "en-IN", Hindi: "hi-IN", Bengali: "bn-IN", Gujarati: "gu-IN", Kannada: "kn-IN", Malayalam: "ml-IN", Marathi: "mr-IN", Odia: "or-IN", Punjabi: "pa-IN", Tamil: "ta-IN", Telugu: "te-IN", Urdu: "ur-IN" };

export default function Composer({ onSend, busy, onStop, autoFocus = false, language = "Auto" }) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState([]);
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const canSend = Boolean(value.trim() || files.length) && !busy;

  async function addFiles(fileList) {
    const accepted = [];
    let totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of Array.from(fileList || [])) {
      if (!/\.(txt|md|markdown|json|csv|log)$/i.test(file.name)) {
        setVoiceNote(`${file.name} isn't supported yet. Try a text, Markdown, JSON, CSV, or log file.`);
        continue;
      }
      if (file.size > 512_000) {
        setVoiceNote(`${file.name} is too large. Files need to be under 500 KB.`);
        continue;
      }
      const content = await file.text();
      const contentBytes = new TextEncoder().encode(content).byteLength;
      if (totalBytes + contentBytes > 1_500_000) {
        setVoiceNote("Attachments are limited to 1.5 MB per message. Remove a file before adding another.");
        continue;
      }
      totalBytes += contentBytes;
      accepted.push({ name: file.name, content, size: contentBytes });
    }
    if (accepted.length) {
      setFiles((current) => [...current, ...accepted]);
      setVoiceNote("");
      inputRef.current?.focus();
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    if (!canSend) return;
    onSend({ text: value.trim(), attachments: files, thinking });
    setValue("");
    setFiles([]);
    setThinking(false);
    setVoiceNote("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function toggleRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceNote("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    const prefix = value.trim();
    recognition.lang = speechLanguage[language] || navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join("");
      setValue(`${prefix}${prefix ? " " : ""}${transcript}`.trim());
    };
    recognition.onerror = () => setVoiceNote("I couldn't hear that. Check your microphone permission and try again.");
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;
    setVoiceNote("Listening…");
    setRecording(true);
    try { recognition.start(); } catch { setRecording(false); setVoiceNote("Voice input couldn't start. Try again in a moment."); }
  }

  return (
    <div className="composer-wrap">
      <div className={`composer-card ${recording ? "composer-recording" : ""} ${busy ? "composer-busy" : ""}`}>
        {files.length > 0 && <div className="attachment-list">
          {files.map((file, index) => <span className="attachment-chip" key={`${file.name}-${index}`}><FileText size={13} /><span>{file.name}</span><button onClick={() => setFiles((items) => items.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><X size={12} /></button></span>)}
        </div>}
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
            if (voiceNote) setVoiceNote("");
          }}
          onKeyDown={onKeyDown}
          placeholder="Ask anything, or start with an idea…"
          rows={1}
          autoFocus={autoFocus}
          aria-label="Message Astra"
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <button className="composer-tool add-tool" onClick={() => fileRef.current?.click()} aria-label="Attach a text file" title="Attach a text file"><Plus size={17} /><Paperclip className="paperclip-overlay" size={11} /></button>
            <span className="composer-divider" />
            <button className={`composer-tool web-tool ${thinking ? "tool-enabled" : ""}`} onClick={() => setThinking((enabled) => !enabled)} aria-pressed={thinking} title="Ask Astra for a more considered response"><Sparkles size={14} />Think deeper</button>
          </div>
          <div className="composer-actions">
            <button className={`composer-tool mic-tool ${recording ? "recording" : ""}`} onClick={toggleRecording} aria-label={recording ? "Stop voice input" : "Start voice input"} title="Voice input"><Mic size={17} /></button>
            {busy ? <button className="send-button stop-button" onClick={onStop} aria-label="Stop generating"><span /></button> : <button className="send-button" onClick={submit} disabled={!canSend} aria-label="Send message"><ArrowUp size={19} strokeWidth={2.3} /></button>}
          </div>
        </div>
        <input ref={fileRef} type="file" hidden multiple accept=".txt,.md,.markdown,.json,.csv,.log,text/plain,text/markdown,application/json,text/csv" onChange={(event) => addFiles(event.target.files)} />
      </div>
      {voiceNote && <div className={`composer-note ${recording ? "is-listening" : ""}`}>{recording && <span className="listening-dot" />}{voiceNote}</div>}
    </div>
  );
}
