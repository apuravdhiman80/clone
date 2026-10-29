# Astra

Astra is a dark-first, responsive AI assistant workspace. It runs in preview mode without credentials and connects to OpenAI through a server-side API when configured.

## Start locally

Use Node.js 20 or later.

```powershell
npm install
Copy-Item .env.example .env
# Add your OpenAI API key to .env
npm run dev
```

Open the local address printed by Vite. The API key belongs in the server `.env` file and is never sent to the browser. You can also leave it blank; Astra will then use its labeled preview mode.

The app uses the OpenAI Responses API. `OPENAI_MODEL` can override the default `gpt-6.1-terra`. The model picker offers balanced, reasoning, and quick options.

## Production

```powershell
npm run build
npm start
```

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the server environment before starting. The server serves the built app from `dist` when that folder exists.

## What's included

- Responsive desktop sidebar and mobile navigation drawer
- Locally saved conversations with search, rename, and delete
- Streaming OpenAI responses, with an explicit preview fallback
- Text, Markdown, JSON, CSV, and log file context (up to 500 KB per file)
- Browser speech recognition and text-to-speech where supported
- Model picker, dark/light appearance, and connection settings
- Markdown rendering, copy response, stop generation, and keyboard shortcuts

Conversation history and preferences are stored in this browser's local storage. There are no accounts or cloud sync in this build. Attachments are read locally and their text is sent with the message to the configured AI service.
