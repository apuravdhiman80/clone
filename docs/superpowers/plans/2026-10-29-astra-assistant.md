# Astra AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, responsive Astra assistant app with locally saved conversations, voice features, and free local streaming responses through Ollama.

**Architecture:** A React/Vite single-page client owns the workspace UI and local conversation state. An Express server checks local Ollama, streams stateless Responses API output, and can optionally use OpenAI with a server-side key. The client shows exact local setup steps while Ollama or a model is missing.

**Tech Stack:** React, Vite, JavaScript, Express, OpenAI JavaScript SDK, Lucide React.

**Spec:** `docs/superpowers/specs/2026-10-29-astra-assistant-design.md`

## Global Constraints

- Default to local Ollama; no provider key is needed for local inference.
- Keep optional `OPENAI_API_KEY` server-side.
- Persist conversations in browser local storage.
- Default local model is `qwen3.5:4b`; allow `OLLAMA_MODEL` override and discover installed models.
- Setup mode must explain that local inference needs Ollama plus a downloaded model.
- Use the stateless Responses API for streaming, supported by Ollama and OpenAI.

## Review Focus

- Missing or invalid API keys must produce a clear preview or error state, never a false connected indicator.
- Long or empty messages must not break the streaming route.
- An interrupted stream must leave the conversation usable.
- The mobile drawer and composer must remain usable at narrow widths.
- Browser voice APIs may be absent and must fail gracefully.

---

### Task 1: App scaffold and server connection

**Files:**
- Create: `package.json`, `index.html`, `vite.config.js`, `.gitignore`, `.env.example`
- Create: `server/index.js`
- Create: `src/main.jsx`, `src/App.jsx`, `src/styles.css`

**Interfaces:**
- `GET /api/health` returns `{ configured, provider, serviceAvailable, models, model }`.
- `POST /api/chat` accepts `{ model, messages }` and streams SSE `delta`, `error`, and `done` events.

- [x] Scaffold scripts and dependencies for Vite, React, Express, OpenAI, and Lucide.
- [x] Implement health and validated streaming routes for local Ollama and optional OpenAI.
- [x] Add the React entry and baseline dark theme.
- [x] Add local Ollama setup guidance when the runtime/model is missing and document startup.

### Task 2: Conversation workspace

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Create: `src/components/Sidebar.jsx`, `src/components/Composer.jsx`, `src/components/ChatView.jsx`

**Interfaces:**
- Conversation model: `{ id, title, updatedAt, messages: [{ id, role, content, attachments? }] }`.
- Persist conversations and preferences under versioned local-storage keys.

- [x] Build empty state, prompt suggestions, provider-aware model picker, and streamed message view.
- [x] Add create/select/search/rename/delete flows and persist them locally.
- [x] Add message composer, stop generation, markdown rendering, and text-file context.
- [x] Add responsive sidebar, mobile navigation, and settings dialog.

### Task 3: Voice, polish, and user guidance

**Files:**
- Modify: `src/App.jsx`, `src/components/Composer.jsx`, `src/components/ChatView.jsx`, `src/styles.css`
- Create: `README.md`

- [x] Add speech recognition input and assistant text-to-speech controls with graceful fallbacks.
- [x] Finish interaction details, focus states, reduced motion, empty/loading/error states, and responsive layout.
- [x] Document local setup, OpenAI key configuration, data behavior, and feature limits.
- [x] Run the production build and confirm the local app is served.
