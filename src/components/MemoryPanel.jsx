import { useState } from "react";
import { Bookmark, Plus, Trash2, X } from "lucide-react";

export default function MemoryPanel({ memories, onAdd, onDelete, onClose, cloudEnabled }) {
  const [draft, setDraft] = useState("");
  function submit(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft.trim()); setDraft("");
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="memory-dialog" role="dialog" aria-modal="true" aria-labelledby="memory-title">
      <div className="dialog-header"><div><span className="dialog-eyebrow">YOUR PERSONAL CONTEXT</span><h2 id="memory-title">Things to remember</h2></div><button className="icon-button" onClick={onClose} aria-label="Close memories"><X size={18} /></button></div>
      <p className="memory-intro">Only save things you want Astra to remember. These notes can help make future chats feel more personal{cloudEnabled ? " and sync with your account" : " on this device"}.</p>
      <form className="memory-form" onSubmit={submit}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="500" placeholder="For example: I prefer gentle encouragement and speak Hindi with my family." aria-label="Memory note" /><div><span>{draft.length}/500</span><button className="memory-add" disabled={!draft.trim()}><Plus size={14} />Add memory</button></div></form>
      <div className="memory-list">{memories.length ? memories.map((memory) => <article className="memory-item" key={memory.id}><span className="memory-icon"><Bookmark size={14} /></span><p>{memory.text}</p><button onClick={() => onDelete(memory.id)} aria-label="Delete memory"><Trash2 size={14} /></button></article>) : <div className="memory-empty"><span><Bookmark size={18} /></span><p>No memories saved yet.</p><small>Use “Remember” under a message or add a note above.</small></div>}</div>
      <div className="memory-footer"><span className="memory-dot" />Your memory is editable. Remove anything whenever you like.</div>
    </section>
  </div>;
}
