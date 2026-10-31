import express from "express";
import OpenAI from "openai/index.js";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() { return getApps().length ? getApps()[0] : initializeApp(); }
function getAdminDb() { return getFirestore(getAdminApp()); }
async function verifyUser(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Sign in to continue.");
  return getAuth(getAdminApp()).verifyIdToken(authorization.slice(7));
}
function stableFingerprint(uid, conversationId, secret) {
  return createHmac("sha256", secret).update(`${uid}:${conversationId}`).digest("hex");
}

export function createApp() {
  const app = express();
  const provider = ["ollama", "openai", "google"].includes(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : process.env.K_SERVICE ? "openai" : "ollama";
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const defaultModel = provider === "ollama"
    ? (process.env.OLLAMA_MODEL || "qwen3.5:0.8b")
    : provider === "google"
      ? (process.env.GEMINI_MODEL || "gemini-3.8-flash")
      : (process.env.OPENAI_MODEL || "gpt-6.1-terra");
  const apiKey = provider === "google" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  const client = provider === "ollama"
    ? new OpenAI({ apiKey: "ollama", baseURL: `${ollamaBaseUrl}/v1` })
    : apiKey
      ? new OpenAI({ apiKey, ...(provider === "google" ? { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" } : {}) })
      : null;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "8mb" }));
  app.get("/api/health", async (_req, res) => {
    if (provider === "ollama") {
      try {
        const response = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
        if (!response.ok) throw new Error("Ollama returned an error.");
        const payload = await response.json();
        const models = Array.isArray(payload.models) ? payload.models.map((item) => item.name || item.model).filter(Boolean) : [];
        const selectedModel = models.includes(defaultModel) ? defaultModel : models[0] || defaultModel;
        return res.json({ configured: models.length > 0, provider, serviceAvailable: true, models, model: selectedModel });
      } catch { return res.json({ configured: false, provider, serviceAvailable: false, models: [], model: defaultModel }); }
    }
    res.json({ configured: Boolean(client), provider, serviceAvailable: Boolean(client), models: [], model: defaultModel });
  });

  app.post("/api/avatar/embed-token", async (req, res) => {
    let user;
    try { user = await verifyUser(req); } catch { return res.status(401).json({ error: "Sign in before starting a voice session." }); }
    const { conversationId, character } = req.body ?? {};
    if (typeof conversationId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(conversationId) || !["male", "female"].includes(character)) return res.status(400).json({ error: "Choose a conversation and character first." });
    const agentId = character === "female" ? process.env.BITHUMAN_AGENT_FEMALE : process.env.BITHUMAN_AGENT_MALE;
    const secret = process.env.BITHUMAN_API_SECRET;
    if (!agentId || !secret) return res.status(503).json({ error: "Live character voice is not connected yet. Add your BitHuman agent codes and API secret to enable it." });
    try {
      const db = getAdminDb();
      const conversationRef = db.doc(`users/${user.uid}/conversations/${conversationId}`);
      const conversation = await conversationRef.get();
      if (!conversation.exists) await conversationRef.set({ id: conversationId, title: "Voice conversation", createdAt: Date.now(), updatedAt: Date.now() });
      const fingerprint = stableFingerprint(user.uid, conversationId, secret);
      const expiresAt = Date.now() + 55 * 60 * 1000;
      await db.doc(`avatarSessions/${fingerprint}`).set({ uid: user.uid, conversationId, expiresAt, createdAt: Date.now() });
      const tokenResponse = await fetch("https://api.bithuman.ai/v1/embed-tokens/request", {
        method: "POST",
        headers: { "api-secret": secret, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, fingerprint, model: "expression-2" }),
        signal: AbortSignal.timeout(12000),
      });
      const payload = await tokenResponse.json();
      if (!tokenResponse.ok || !payload?.data?.token) return res.status(502).json({ error: payload?.message || "BitHuman could not start the voice session. Check the agent setup." });
      res.json({ token: payload.data.token, agentCode: agentId, model: payload.data.model || "expression-2", expiresAt });
    } catch (error) {
      console.error("Avatar token request failed:", error?.message || error);
      res.status(502).json({ error: "Could not start the live character. Check the provider connection and try again." });
    }
  });

  app.post("/api/avatar/chat/completions", async (req, res) => {
    const gatewayKey = process.env.BITHUMAN_GATEWAY_KEY || "";
    const suppliedKey = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const suppliedBuffer = Buffer.from(suppliedKey);
    const gatewayBuffer = Buffer.from(gatewayKey);
    if (!gatewayKey || suppliedBuffer.length !== gatewayBuffer.length || !timingSafeEqual(suppliedBuffer, gatewayBuffer)) return res.status(401).json({ error: "Unauthorized." });
    const fingerprint = typeof req.body?.user === "string" ? req.body.user : "";
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) return res.status(401).json({ error: "This voice session is not recognized." });
    try {
      const db = getAdminDb();
      const sessionSnap = await db.doc(`avatarSessions/${fingerprint}`).get();
      const session = sessionSnap.data();
      if (!session || session.expiresAt < Date.now()) return res.status(401).json({ error: "This voice session has expired. Start a new one." });
      const conversationRef = db.doc(`users/${session.uid}/conversations/${session.conversationId}`);
      const conversationSnap = await conversationRef.get();
      if (!conversationSnap.exists) return res.status(404).json({ error: "This conversation is no longer available." });
      const requestMessages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-40) : [];
      const safeMessages = requestMessages.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.length <= 20000).map(({ role, content }) => ({ role, content }));
      if (!safeMessages.length) return res.status(400).json({ error: "No conversation message was received." });
      const prefSnap = await db.doc(`users/${session.uid}/preferences/app`).get();
      const preferences = prefSnap.data() || {};
      const memorySnap = await db.collection(`users/${session.uid}/memories`).limit(20).get();
      const savedMemories = memorySnap.docs.map((doc) => doc.data().text).filter((text) => typeof text === "string").slice(0, 20);
      const systemPrompt = [
        "You are Astra, a warm AI friend with an android character. You are an AI, not a human. Be attentive, emotionally considerate, and naturally curious. Reflect the person's likely emotion without claiming that you feel it. Listen before advising, and ask at most one caring follow-up when useful.",
        `Use ${preferences.language && preferences.language !== "Auto" ? preferences.language : "the language the user is speaking, including natural English/Hindi/regional-language code-switching"}. Phrase replies for natural spoken delivery.`,
        savedMemories.length ? `User-approved memories to use when relevant:\n${savedMemories.map((text) => `- ${text.slice(0, 500)}`).join("\n")}` : "No saved memories are available.",
      ].join("\n\n");
      if (!client) return res.status(503).json({ error: "The conversation model is not configured." });
      const modelName = process.env.BITHUMAN_GATEWAY_MODEL || defaultModel;
      const stream = await client.chat.completions.create({ model: modelName, messages: [{ role: "system", content: systemPrompt }, ...safeMessages], stream: true, max_tokens: 1000 });
      const completionId = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      res.status(200); res.setHeader("Content-Type", "text/event-stream; charset=utf-8"); res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive");
      const userTurn = [...safeMessages].reverse().find((item) => item.role === "user")?.content || "";
      let reply = "";
      for await (const chunk of stream) {
        if (req.aborted) break;
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) {
          reply += delta;
          res.write(`data: ${JSON.stringify({ id: completionId, object: "chat.completion.chunk", created, model: modelName, choices: [{ index: 0, delta: { content: delta }, finish_reason: null }] })}\n\n`);
        }
      }
      if (!req.aborted) {
        res.write(`data: ${JSON.stringify({ id: completionId, object: "chat.completion.chunk", created, model: modelName, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
        res.write("data: [DONE]\n\n");
        const batch = db.batch();
        const now = Date.now();
        if (userTurn) { const id = randomUUID(); batch.set(conversationRef.collection("messages").doc(id), { id, role: "user", content: userTurn.slice(0, 20000), createdAt: now }); }
        if (reply) { const id = randomUUID(); batch.set(conversationRef.collection("messages").doc(id), { id, role: "assistant", content: reply.slice(0, 20000), createdAt: now + 1 }); }
        batch.set(conversationRef, { updatedAt: now }, { merge: true });
        await batch.commit();
      }
      res.end();
    } catch (error) {
      console.error("Avatar model request failed:", error?.message || error);
      if (!res.headersSent) res.status(502).json({ error: "The voice companion could not finish the reply." });
      else res.end();
    }
  });

  app.post("/api/chat", async (req, res) => {
    if (process.env.K_SERVICE || process.env.VITE_FIREBASE_PROJECT_ID) {
      try { req.user = await verifyUser(req); } catch { return res.status(401).json({ error: "Sign in to chat and sync your history." }); }
    }
    if (provider === "openai" && !client) return res.status(503).json({ error: "Add OPENAI_API_KEY to the server environment to enable live answers." });
    if (provider === "google" && !client) return res.status(503).json({ error: "Add GEMINI_API_KEY to the server environment to enable Google Gemini answers." });
    const { messages, model, thinking, language, character, memories } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60) return res.status(400).json({ error: "Send between 1 and 60 conversation messages." });
    const safeMessages = [];
    for (const message of messages) {
      if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) return res.status(400).json({ error: "Each message needs a role and non-empty text." });
      if (message.content.length > 1_500_000) return res.status(413).json({ error: "This message is too large. Remove some file text or shorten the prompt, then try again." });
      safeMessages.push({ role: message.role, content: message.content });
    }
    const modelName = typeof model === "string" && /^[a-zA-Z0-9._:-]{1,100}$/.test(model) ? model : defaultModel;
    const chosenLanguage = typeof language === "string" ? language.slice(0, 32) : "Auto";
    const persona = character === "female" ? "female-presenting" : "male-presenting";
    const savedMemories = Array.isArray(memories) ? memories.filter((item) => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 500)) : [];
    const instructions = [
      `You are Astra, a warm AI companion with a ${persona} voice. You are an AI, not a human. Speak like a thoughtful friend: conversational, attentive, and emotionally considerate without claiming to feel emotions.`,
      "Listen closely, reflect the user's likely emotion and intent gently, and show genuine curiosity about what they share. Do not rush into advice, flatten vulnerability into generic reassurance, or overdo therapy language. Ask at most one natural follow-up when it helps the person continue. Match their energy with warmth, calm, concern, or celebration as the conversation calls for it.",
      `Reply in ${chosenLanguage === "Auto" ? "the language the user is using; naturally follow code-switching between English, Hindi, and Indian regional languages" : chosenLanguage}. Use natural, spoken phrasing that sounds good aloud.`,
      savedMemories.length ? `User-approved memories to keep in mind (use only when relevant):\n${savedMemories.map((item) => `- ${item}`).join("\n")}` : "No saved personal memories are available.",
      "Be honest about uncertainty. Do not infer a mental-health diagnosis. Keep responses concise enough to sound natural in a voice conversation.",
      thinking ? "Take extra care to reason through trade-offs and explain the key steps clearly." : "",
    ].filter(Boolean).join("\n\n");
    res.status(200); res.setHeader("Content-Type", "text/event-stream; charset=utf-8"); res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive"); res.flushHeaders();
    const send = (event, data) => res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
    try {
      const recentMessages = ["ollama", "google"].includes(provider) ? safeMessages.slice(-12) : safeMessages;
      if (provider === "google") {
        const stream = await client.chat.completions.create({
          model: modelName,
          messages: [{ role: "system", content: instructions }, ...recentMessages],
          stream: true,
          max_tokens: thinking ? 1200 : 600,
          reasoning_effort: thinking ? "medium" : "low",
        });
        for await (const chunk of stream) {
          if (req.aborted) break;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) send("delta", { text: delta });
        }
      } else {
        const maxOutputTokens = provider === "ollama" ? (thinking ? 1200 : 600) : 3000;
        const stream = await client.responses.create({ model: modelName, instructions, think: Boolean(thinking), input: recentMessages, max_output_tokens: maxOutputTokens, stream: true });
        for await (const event of stream) {
          if (req.aborted) break;
          if (event.type === "response.output_text.delta") send("delta", { text: event.delta });
          if (event.type === "response.failed") send("error", { code: event.response?.error?.code || "response_failed", message: event.response?.error?.message || "The assistant could not finish this response." });
        }
      }
      if (!req.aborted) send("done", {});
    } catch (error) {
      const code = provider === "ollama" ? "ollama_unavailable" : [401, 403].includes(error?.status) ? "invalid_api_key" : error?.status === 429 ? "usage_limit" : "api_error";
      const message = code === "invalid_api_key" ? provider === "google" ? "The Gemini key was rejected. Check GEMINI_API_KEY in your server environment." : "The OpenAI key was rejected. Check OPENAI_API_KEY in your server environment." : code === "usage_limit" ? `The ${provider === "google" ? "Google Gemini" : "OpenAI"} account reached its current usage limit. Check its billing and rate limits.` : code === "ollama_unavailable" ? `Astra could not reach local Ollama or load ${modelName}. Make sure Ollama is running and the model is downloaded.` : "Astra could not reach the AI service. Check the server logs and try again.";
      if (!req.aborted) send("error", { code, message });
    } finally { res.end(); }
  });
  app.use((error, _req, res, next) => {
    if (error?.type === "entity.too.large") return res.status(413).json({ error: "This request is too large. Remove some file attachments and try again." });
    if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "The request body must be valid JSON." });
    return next(error);
  });
  return app;
}
