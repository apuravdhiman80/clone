import express from "express";
import "dotenv/config";
// Use the SDK's declared CommonJS export because this installed release's default
// ESM export points to an index.mjs file that is absent from the package payload.
import OpenAI from "openai/index.js";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const defaultModel = process.env.OPENAI_MODEL || "gpt-6.1-terra";
const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ configured: Boolean(client), model: defaultModel });
});

app.post("/api/chat", async (req, res) => {
  if (!client) {
    return res.status(503).json({ error: "Add OPENAI_API_KEY to the server environment to enable live answers." });
  }

  const { messages, model, thinking } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60) {
    return res.status(400).json({ error: "Send between 1 and 60 conversation messages." });
  }

  const safeMessages = [];
  for (const message of messages) {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) {
      return res.status(400).json({ error: "Each message needs a role and non-empty text." });
    }
    if (message.content.length > 1_500_000) {
      return res.status(413).json({ error: "This message is too large. Remove some file text or shorten the prompt, then try again." });
    }
    safeMessages.push({ role: message.role, content: message.content });
  }

  const modelName = typeof model === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(model) ? model : defaultModel;

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event, data) => res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);

  try {
    const stream = await client.responses.create({
      model: modelName,
      instructions: `You are Astra, a clear, thoughtful, capable AI assistant. Be warm and direct. Match the user's level of detail, use Markdown when it helps, and be honest about uncertainty.${thinking ? " Take extra care to reason through trade-offs and explain the key steps clearly." : ""}`,
      input: safeMessages,
      max_output_tokens: 3000,
      stream: true,
    });

    for await (const event of stream) {
      if (req.aborted) break;
      if (event.type === "response.output_text.delta") send("delta", { text: event.delta });
      if (event.type === "response.failed") {
        send("error", { code: event.response?.error?.code || "response_failed", message: event.response?.error?.message || "The assistant could not finish this response." });
      }
    }
    if (!req.aborted) send("done", {});
  } catch (error) {
    const code = error?.status === 401 ? "invalid_api_key" : error?.status === 429 ? "usage_limit" : "api_error";
    const message = code === "invalid_api_key"
      ? "The OpenAI key was rejected. Check OPENAI_API_KEY in your server environment."
      : code === "usage_limit"
        ? "The OpenAI account is at its current usage limit. Check the account's billing and rate limits."
        : "Astra could not reach the AI service. Check the server logs and try again.";
    if (!req.aborted) send("error", { code, message });
  } finally {
    res.end();
  }
});

{
  const dist = path.resolve(__dirname, "../dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
}

app.use((error, _req, res, next) => {
  if (error?.type === "entity.too.large") return res.status(413).json({ error: "This request is too large. Remove some file attachments and try again." });
  if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "The request body must be valid JSON." });
  return next(error);
});

app.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Astra API listening on http://${displayHost}:${port}${client ? " (API key configured)" : " (preview mode)"}`);
});
