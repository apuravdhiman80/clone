import { useMemo, useState } from "react";
import {
  ChevronDown, Clock3, MessageSquare, MoreHorizontal, Pencil,
  Plus, Search, Settings2, Sparkles, Trash2, X,
} from "lucide-react";

function dayGroup(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return "Earlier";
}

export default function Sidebar({ conversations, activeId, onNew, onSelect, onRename, onDelete, onSettings, isOpen, onClose }) {
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState(null);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(term) ||
      conversation.messages.some((message) => message.content.toLowerCase().includes(term)),
    );
  }, [conversations, query]);
  const groups = ["Today", "Yesterday", "Earlier"].map((label) => [
    label,
    filtered.filter((conversation) => dayGroup(conversation.updatedAt) === label),
  ]).filter(([, items]) => items.length);

  return (
    <>
      <button className={`sidebar-scrim ${isOpen ? "visible" : ""}`} aria-label="Close navigation" onClick={onClose} />
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-topline">
          <button className="brand-lockup" onClick={onNew} aria-label="Astra home and new chat">
            <span className="brand-mark"><Sparkles size={17} strokeWidth={2.2} /></span>
          <span className="brand-name">astra<span className="brand-period">.</span></span>
          </button>
          <button className="icon-button quiet sidebar-dismiss" onClick={onClose} aria-label="Close sidebar"><X size={18} /></button>
        </div>

        <button className="new-chat-button" onClick={() => { onNew(); onClose(); }}>
          <Plus size={17} strokeWidth={2.2} /><span>New conversation</span><kbd>Ctrl K</kbd>
        </button>

        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
          {query ? <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button> : <kbd>Ctrl F</kbd>}
        </label>

        <div className="sidebar-section-heading"><span>YOUR SPACE</span><ChevronDown size={13} /></div>
        <nav className="space-nav" aria-label="Workspace">
          <button className="space-nav-item selected"><MessageSquare size={16} /><span>Conversations</span><span className="nav-count">{conversations.length || ""}</span></button>
        </nav>

        <div className="history-heading"><span>RECENTS</span><Clock3 size={13} /></div>
        <div className="conversation-list">
          {groups.length ? groups.map(([label, items]) => (
            <section className="conversation-group" key={label}>
              <div className="conversation-group-label">{label}</div>
              {items.map((conversation) => (
                <div className={`conversation-row ${activeId === conversation.id ? "active" : ""}`} key={conversation.id}>
                  <button className="conversation-select" onClick={() => { onSelect(conversation.id); onClose(); }} title={conversation.title}>
                    <span className="conversation-title">{conversation.title}</span>
                  </button>
                  <button className="conversation-more icon-button" onClick={() => setMenuId(menuId === conversation.id ? null : conversation.id)} aria-label={`Options for ${conversation.title}`}><MoreHorizontal size={17} /></button>
                  {menuId === conversation.id && <>
                    <button className="menu-dismiss" aria-label="Close conversation menu" onClick={() => setMenuId(null)} />
                    <div className="conversation-menu">
                      <button onClick={() => { onRename(conversation.id); setMenuId(null); }}><Pencil size={14} />Rename</button>
                      <button className="danger-menu-item" onClick={() => { onDelete(conversation.id); setMenuId(null); }}><Trash2 size={14} />Delete</button>
                    </div>
                  </>}
                </div>
              ))}
            </section>
          )) : <div className="sidebar-empty">{query ? "No matches found" : "Your conversations will show up here"}</div>}
        </div>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <span className="upgrade-icon"><Sparkles size={15} /></span>
            <span><strong>Your chats stay yours</strong><small>Saved on this device</small></span>
            <span className="upgrade-arrow">✦</span>
          </div>
          <button className="account-button" onClick={onSettings}>
            <span className="avatar-mark">A</span>
            <span className="account-copy"><strong>Your workspace</strong><small>Personal space</small></span>
            <Settings2 className="account-settings" size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}
