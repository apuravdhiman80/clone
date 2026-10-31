import { useState } from "react";
import { Mic, RefreshCw, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { useAuth } from "./AuthGate.jsx";

export const LANGUAGES = [
  { value: "Auto", label: "Auto", short: "Auto" },
  { value: "English", label: "English", short: "EN" },
  { value: "Hindi", label: "हिन्दी · Hindi", short: "हि" },
  { value: "Bengali", label: "বাংলা · Bengali", short: "বা" },
  { value: "Gujarati", label: "ગુજરાતી · Gujarati", short: "ગુ" },
  { value: "Kannada", label: "ಕನ್ನಡ · Kannada", short: "ಕ" },
  { value: "Malayalam", label: "മലയാളം · Malayalam", short: "മ" },
  { value: "Marathi", label: "मराठी · Marathi", short: "म" },
  { value: "Odia", label: "ଓଡ଼ିଆ · Odia", short: "ଓ" },
  { value: "Punjabi", label: "ਪੰਜਾਬੀ · Punjabi", short: "ਪੰ" },
  { value: "Tamil", label: "தமிழ் · Tamil", short: "த" },
  { value: "Telugu", label: "తెలుగు · Telugu", short: "తె" },
  { value: "Urdu", label: "اردو · Urdu", short: "اُ" },
];

export default function AvatarStage({ conversationId, onEnsureConversation, character, onCharacterChange, language, onLanguageChange }) {
  const { user } = useAuth();
  const [callState, setCallState] = useState("idle");
  const [frameUrl, setFrameUrl] = useState("");
  const [error, setError] = useState("");

  async function startVoice() {
    setCallState("loading"); setError("");
    try {
      if (!user) throw new Error("Sign in to start a private voice session. Cloud sync is not connected yet.");
      const id = conversationId || onEnsureConversation();
      const response = await fetch("/api/avatar/embed-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ conversationId: id, character }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The live character could not start.");
      setFrameUrl(`https://www.bithuman.ai/embed/${encodeURIComponent(result.agentCode)}?token=${encodeURIComponent(result.token)}&render=auto`);
      setCallState("active");
    } catch (requestError) { setError(requestError.message || "The live character could not start."); setCallState("idle"); }
  }

  function closeVoice() { setFrameUrl(""); setCallState("idle"); setError(""); }
  const image = character === "female" ? "/characters/astra-female.jpg" : "/characters/astra-male.png";

  return <section className={`avatar-stage ${callState === "active" ? "avatar-stage-live" : ""}`} aria-label="Choose your companion">
    {callState === "active" ? <>
      <iframe className="avatar-iframe" src={frameUrl} title="Astra live voice companion" allow="microphone *; camera *; autoplay *" />
      <div className="avatar-live-top"><span className="live-pill"><i /> LIVE SESSION</span><button onClick={closeVoice} aria-label="End voice conversation"><X size={16} /></button></div>
    </> : <>
      <div className="avatar-art-wrap"><img className="avatar-art" src={image} alt={`Astra ${character === "female" ? "female" : "male"} companion`} /><span className="avatar-art-glow" /><span className="avatar-orbit" /></div>
      <div className="avatar-details">
        <div className="avatar-heading"><div><span className="avatar-eyebrow"><Sparkles size={11} /> YOUR COMPANION</span><h2>Astra <span className="avatar-presence"><i /> here with you</span></h2></div><div className="avatar-protection"><ShieldCheck size={13} />Private chats</div></div>
        <p className="avatar-subtitle">A thoughtful listener who remembers what matters to you.</p>
        <div className="avatar-controls">
          <div className="character-switch" role="group" aria-label="Character">
            <button className={character === "female" ? "selected" : ""} onClick={() => { closeVoice(); onCharacterChange("female"); }}>Female</button>
            <button className={character === "male" ? "selected" : ""} onClick={() => { closeVoice(); onCharacterChange("male"); }}>Male</button>
          </div>
          <label className="language-control"><span>LANGUAGE</span><select aria-label="Conversation language" value={language} onChange={(event) => onLanguageChange(event.target.value)}>{LANGUAGES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <button className="voice-start" onClick={startVoice} disabled={callState === "loading"}>{callState === "loading" ? <><RefreshCw size={14} className="spin" />Connecting</> : <><Mic size={14} />Talk to Astra</>}</button>
        </div>
        {error ? <p className="avatar-state-note avatar-state-error">{error}</p> : <p className="avatar-state-note"><Volume2 size={12} /> Voice chat uses your microphone and needs the live character provider to be connected.</p>}
      </div>
    </>}
  </section>;
}
