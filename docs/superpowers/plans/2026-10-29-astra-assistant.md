# Astra AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, responsive Astra assistant app with locally saved conversations, voice features, and a secure OpenAI-backed streaming API.

**Architecture:** A React/Vite single-page client owns the workspace UI and local conversation state. An Express server exposes health and streaming chat endpoints and reads the OpenAI API key only from the server environment; the client provides an explicit preview mode when the endpoint reports no key.

**Tech Stack:** React, Vite, JavaScript, Express, OpenAI JavaScript SDK, Lucide React.

**Spec:** `docs/superpowers/specs/2026-10-29-astra-assistant-design.md`

## Global Constraints

- Keep `OPENAI_API_KEY` server-side.
- Persist conversations in browser local storage.
- Default model is `gpt-6.1-terra`; allow `OPENAI_MODEL` override.
- Preview mode must be disclosed in the interface.
- Use the OpenAI Responses API for the live integration.

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
- `GET /api/health` returns `{ configured: boolean, model: string }`.
- `POST /api/chat` accepts `{ model, messages }` and streams SSE `delta`, `error`, and `done` events.

- [ ] Scaffold scripts and dependencies for Vite, React, Express, OpenAI, and Lucide.
- [ ] Implement health and validated streaming routes using `OPENAI_API_KEY` server-side.
- [ ] Add the React entry and baseline dark theme.
- [ ] Add preview behavior for missing credentials and document startup/environment setup.

### Task 2: Conversation workspace

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Create: `src/components/Sidebar.jsx`, `src/components/Composer.jsx`, `src/components/ChatView.jsx`

**Interfaces:**
- Conversation model: `{ id, title, updatedAt, messages: [{ id, role, content, attachments? }] }`.
- Persist conversations and preferences under versioned local-storage keys.

- [ ] Build empty state, prompt suggestions, model picker, and streamed message view.
- [ ] Add create/select/search/rename/delete flows and persist them locally.
- [ ] Add message composer, stop generation, markdown rendering, and text-file context.
- [ ] Add responsive sidebar, mobile navigation, and settings dialog.

### Task 3: Voice, polish, and user guidance

**Files:**
- Modify: `src/App.jsx`, `src/components/Composer.jsx`, `src/components/ChatView.jsx`, `src/styles.css`
- Create: `README.md`

- [ ] Add speech recognition input and assistant text-to-speech controls with graceful fallbacks.
- [ ] Finish interaction details, focus states, reduced motion, empty/loading/error states, and responsive layout.
- [ ] Document local setup, OpenAI key configuration, data behavior, and feature limits.
- [ ] Run a production build and inspect the rendered app before reporting completion.
