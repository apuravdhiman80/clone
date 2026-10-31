import { createContext, useContext, useEffect, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ArrowRight, Heart, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { firebaseAuth, firebaseConfigured, firestore } from "../lib/firebase.js";

const AuthContext = createContext({ user: null, cloudEnabled: false, auth: null, db: null, signOut: async () => {} });
export const useAuth = () => useContext(AuthContext);

function authMessage(error) {
  const messages = {
    "auth/email-already-in-use": "There is already an account with this email. Try signing in.",
    "auth/invalid-credential": "That email and password do not match. Try again.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/network-request-failed": "Could not connect. Check your internet connection.",
  };
  return messages[error?.code] || "We couldn't complete that request. Please try again.";
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(firebaseConfigured));
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseAuth) return undefined;
    return onAuthStateChanged(firebaseAuth, (nextUser) => { setUser(nextUser); setLoading(false); });
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(firebaseAuth, email.trim());
        setNotice("Password reset email sent. Check your inbox.");
      } else if (mode === "create") {
        await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      }
    } catch (requestError) { setError(authMessage(requestError)); }
    finally { setBusy(false); }
  }

  const contextValue = { user, cloudEnabled: Boolean(firebaseConfigured && user), auth: firebaseAuth, db: firestore, signOut: () => firebaseAuth ? signOut(firebaseAuth) : Promise.resolve() };
  if (!firebaseConfigured) return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
  if (loading) return <div className="auth-loading"><span className="auth-mark"><Sparkles size={20} /></span><p>Opening your space…</p></div>;
  if (user) return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;

  return <main className="auth-screen">
    <div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" />
    <section className="auth-card">
      <div className="auth-brand"><span className="auth-mark"><Sparkles size={19} /></span><span>ASTRA <small>YOUR AI COMPANION</small></span></div>
      <div className="auth-intro"><div className="auth-heart"><Heart size={18} /></div><p className="auth-kicker">A SPACE THAT REMEMBERS YOU</p><h1>{mode === "create" ? "Let’s make this yours." : mode === "reset" ? "Find your way back." : "A little company, whenever you need it."}</h1><p>Your conversations and memories stay in sync across your devices.</p></div>
      <form className="auth-form" onSubmit={submit}>
        <label>Email address<span className="auth-input"><Mail size={16} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></span></label>
        {mode !== "reset" && <label>Password<span className="auth-input"><LockKeyhole size={16} /><input type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} minLength="6" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></span></label>}
        {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="auth-notice" role="status">{notice}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "One moment…" : mode === "create" ? "Create account" : mode === "reset" ? "Send reset link" : "Continue"}<ArrowRight size={16} /></button>
      </form>
      <div className="auth-links">{mode === "signin" && <button onClick={() => { setMode("reset"); setError(""); }}>Forgot password?</button>}{mode !== "signin" && <button onClick={() => { setMode("signin"); setError(""); }}>Back to sign in</button>}<span>{mode === "create" ? "Already have an account?" : "New to Astra?"} <button onClick={() => { setMode(mode === "create" ? "signin" : "create"); setError(""); }}>{mode === "create" ? "Sign in" : "Create account"}</button></span></div>
      <p className="auth-privacy">Your private chats are linked to your account. You can export or delete them in settings.</p>
    </section>
  </main>;
}
