# Astra

Astra is a dark-first, responsive AI assistant workspace. By default, it connects to a local Ollama model, so live answers do not require an API key or API billing. An OpenAI API connection remains an optional paid alternative.

## Start locally

Use Node.js 20.19 or later, or 22.12 or later. Install [Ollama for Windows](https://ollama.com/download/windows), open the app once, then download the recommended model from Command Prompt:

```cmd
ollama pull qwen3.5:0.8b
```

The quick model download is about 1.2–1.3 GB. It runs on this computer; response speed depends on available hardware.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open the local address printed by Vite. The local model runs through Ollama at `127.0.0.1:11434`; no key is sent to a cloud service. The app stays on its setup/preview state until Ollama and a model are installed. The Astra server listens on `127.0.0.1` by default.

The app uses Ollama's local, stateless Responses API. `OLLAMA_MODEL` can change the local model. To use the optional OpenAI provider instead, set `AI_PROVIDER=openai`, add `OPENAI_API_KEY`, and set `OPENAI_MODEL` in `.env`.

## Production

```powershell
npm run build
npm start
```

Set the provider values in `.env` before starting. The server serves the built app from `dist` when that folder exists. If you set `HOST=0.0.0.0` to expose it, put authentication and rate limiting in front of it first.

## What's included

- Responsive desktop sidebar and mobile navigation drawer
- Locally saved conversations with search, rename, and delete
- Streaming local Ollama responses, with optional OpenAI support
- Text, Markdown, JSON, CSV, and log file context (up to 500 KB per file and 1.5 MB total per message)
- Browser speech recognition and text-to-speech where supported
- Model picker, dark/light appearance, and connection settings
- Markdown rendering, copy response, stop generation, and keyboard shortcuts

Conversation history and preferences are stored in this browser's local storage. There are no accounts or cloud sync in this build. Attachments are read locally and their text is sent with the message to the configured AI service. Local Ollama responses are generated on this computer; choosing the optional OpenAI provider sends prompts to OpenAI.
