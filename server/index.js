import express from "express";
import "dotenv/config";
import OpenAI from "openai";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 8787);
const defaultModel = process.env.OPENAI_MODEL || "gpt-6.1-terra";
const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ configured: Boolean(client), model: defaultModel });
});

app.post("/api/chat", async (req, res) => {
  if (!client) {
    return res.status(503).json({ error: "Add OPENAI_API_KEY to the server environment to enable live answers." });
  }

  const { messages, model } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60) {
    return res.status(400).json({ error: "Send between 1 and 60 conversation messages." });
  }

  const safeMessages = [];
  for (const message of messages) {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) {
      return res.status(400).json({ error: "Each message needs a role and non-empty text." });
    }
    safeMessages.push({ role: message.role, content: message.content.slice(0, 24000) });
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
      instructions: "You are Astra, a clear, thoughtful, capable AI assistant. Be warm and direct. Match the user's level of detail, use Markdown when it helps, and be honest about uncertainty.",
      input: safeMessages,
      max_output_tokens: 3000,
      stream: true,
    });

    for await (const event of stream) {
      if (req.aborted) break;
      if (event.type === "response.output_text.delta") send("delta", { text: event.delta });
      if (event.type === "response.failed") {
        send("error", { message: event.response?.error?.message || "The assistant could not finish this response." });
      }
    }
    if (!req.aborted) send("done", {});
  } catch (error) {
    const message = error?.status === 401
      ? "The OpenAI key was rejected. Check OPENAI_API_KEY in your server environment."
      : error?.status === 429
        ? "The OpenAI account is at its current usage limit. Check the account's billing and rate limits."
        : "Astra could not reach the AI service. Check the server logs and try again.";
    if (!req.aborted) send("error", { message });
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

app.listen(port, "0.0.0.0", () => {
  console.log(`Astra API listening on http://localhost:${port}${client ? " (OpenAI connected)" : " (preview mode)"}`);
});
