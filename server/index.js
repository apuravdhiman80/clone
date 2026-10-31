import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "../functions/src/app.js";

const app = createApp();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../dist");

if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  const provider = process.env.AI_PROVIDER || "ollama";
  const model = provider === "ollama" ? `local Ollama · ${process.env.OLLAMA_MODEL || "qwen3.5:0.8b"}` : process.env.OPENAI_API_KEY ? "OpenAI API key configured" : "preview mode";
  console.log(`Astra API listening on http://${displayHost}:${port} (${model})`);
});
