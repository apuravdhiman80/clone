# Astra AI Assistant — Design

## Intent

Create a polished, responsive AI assistant web app for people who want a familiar ChatGPT-style place to ask questions, work through ideas, and speak prompts aloud. The product should feel cohesive and ready to personalize, rather than like a bare chat demo.

## Goals

- Provide a distinctive dark-first visual identity for Astra.
- Support creating, searching, switching, renaming, and deleting locally saved conversations.
- Offer prompt suggestions, a responsive message composer, text-file attachments, browser speech recognition, and spoken assistant replies.
- Stream actual assistant output through a local Ollama model by default, with no provider key or API billing.
- Keep OpenAI as an optional provider for users who choose to configure a paid API key.
- Show clear installation instructions when Ollama or its model is not present.
- Work on desktop and mobile layouts.

## Non-goals

- User accounts, cloud synchronization, billing, or team administration.
- Claiming access to ChatGPT's internal services or using a browser-exposed API key.
- Full PDF/image ingestion, web search, generated images, or real-time duplex voice in this first build.

## Constraints

- The workspace is empty; choose and scaffold the app stack.
- Use React, Vite, and a small Node/Express server.
- Persist conversation metadata and messages in browser local storage.
- Keep provider credentials in server environment variables.
- The default provider is local Ollama; the optional OpenAI integration uses OpenAI's Responses API.
- Local responses use Ollama's OpenAI-compatible, stateless Responses endpoint.

## Approaches

1. **Static chat mockup:** fastest to build, but answers and controls would be decorative.
2. **Browser-only API integration:** simpler deployment, but exposes the secret key to every user.
3. **React client plus local model service (chosen):** connects a small server to Ollama on the same computer, avoids API charges and browser keys, and keeps OpenAI optional.

## Product direction

Use an Astra wordmark, a softly glowing geometric mark, near-black surfaces, restrained violet/cyan highlights, and clean typography. The primary screen has a collapsible conversation sidebar, a model and connection header, an inviting empty state, and a centered composer. Conversation history stays on the current device. The server streams Responses API text deltas from local Ollama by default and never exposes provider credentials to the browser.

## Builder decisions

- Use the default local model `qwen3.5:4b`; discover installed local models through Ollama and allow choosing among them.
- Keep OpenAI selectable through `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
- Use browser speech recognition/synthesis where available, with clear unsupported-browser behavior.
- Accept text, Markdown, JSON, and CSV attachments and include their extracted text in the user turn.
- Save app preferences and chats locally; no authentication is introduced.
