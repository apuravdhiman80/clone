# Astra Cloud Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Astra an installable mobile PWA with two live android characters, expressive multilingual conversation, and private synchronized chats and memories.

**Architecture:** Keep the current React/Vite client, add Firebase Authentication and Firestore for account-scoped sync, and host the app/API through Firebase. Embed two private BitHuman Expression 2 agents; mint scoped tokens on the server and route their OpenAI-compatible model requests through a Firebase-aware endpoint that loads memory and writes the transcript to Firestore.

**Tech Stack:** React 19, Vite, Firebase Web SDK, Firebase Authentication, Cloud Firestore, Firebase Functions v2, Express, OpenAI-compatible chat completions, BitHuman web embed, optional ElevenLabs expressive voice, PWA/service worker.

**Spec:** `docs/superpowers/specs/2026-10-31-astra-companion-design.md`

## Global Constraints

- Mobile delivery is an installable PWA hosted over HTTPS, not separate native App Store and Play Store binaries.
- Never expose Firebase Admin credentials, BitHuman API secrets, or premium voice/model keys in client code.
- Chats and memories are stored under the signed-in Firebase UID and protected by Firestore rules.
- Do not import local conversations into the cloud without the user accepting the import prompt.
- The two robot characters use separate adult male-presenting and female-presenting portrait references and separate private agent IDs.
- Live avatar use and custom robot creation can incur provider charges; do not create external agents or spend credits before the user's service credentials are connected.
- Automated tests are not added or run under the current task instruction. Check code structure and build output only if the user later asks for verification.

## Review Focus

- Signed-out user: cannot read or write another user's chats or memories.
- Interrupted/expired avatar session: show a recoverable message and allow a new token to be minted without losing the conversation.
- Character switch or language switch: preserve the current account, conversation, and approved memory context.
- Local-chat import: skip leaves existing chats untouched; accept imports exactly once for the selected account.
- Missing Firebase/avatar credentials or unsupported mobile browser: show a useful setup/fallback state, never a false connected state or blank avatar.

## File Structure

- `src/lib/firebase.js`: client Firebase initialization and auth/Firestore exports.
- `src/components/AuthGate.jsx`: responsive sign-in/create-account/password-reset flow.
- `src/components/MemoryPanel.jsx`: synced, user-editable memory notebook and privacy explanation.
- `src/components/AvatarStage.jsx`: private BitHuman iframe, token lifecycle, character selection, and browser permission/error states.
- `src/App.jsx`: auth lifecycle, synchronized conversation state, language/character preferences, and local-chat import flow.
- `src/components/ChatView.jsx`, `Composer.jsx`, `Sidebar.jsx`: transcript, voice/text controls, synced history, and memory actions.
- `src/styles.css`: mobile-first atmospheric design, live character stage, forms, panels, and reduced motion.
- `functions/src/app.js`: shared Express routes for existing text chat, Firebase-authenticated data operations, avatar token minting, and the private OpenAI-compatible voice-model endpoint.
- `functions/index.js`: Firebase Functions v2 export for the Express API.
- `server/index.js`: local development wrapper that runs the shared Express app.
- `firestore.rules`: UID-scoped access rules for conversations, messages, preferences, and memories.
- `firebase.json`, `.firebaserc.example`, `vite.config.js`, `index.html`, `public/manifest.webmanifest`, `public/icons/*`: PWA and Firebase Hosting setup.
- `README.md`, `.env.example`: local preview, cloud project setup, provider keys/agent IDs, deployment, privacy, and published usage-cost notes.
- `public/characters/*`: generated male/female android portrait references used for setup and static fallback.

---

### Task 1: Firebase account and mobile PWA foundation

**Files:**
- Create: `src/lib/firebase.js`
- Create: `src/components/AuthGate.jsx`
- Create: `functions/src/app.js`
- Create: `functions/index.js`
- Create: `firestore.rules`
- Create: `firebase.json`, `.firebaserc.example`, `public/manifest.webmanifest`, `public/icons/*`
- Modify: `package.json`, `package-lock.json`, `.env.example`, `vite.config.js`, `index.html`, `server/index.js`, `src/main.jsx`, `src/App.jsx`

**Interfaces:**
- `getFirebaseConfig()` reads `VITE_FIREBASE_*`; Firebase client initializes Auth and Firestore only when config is present.
- `createApp()` returns the Express app used by local Node and Firebase Functions.
- Firebase Auth user identity is `user.uid`; all cloud paths use `/users/{uid}/...`.
- PWA display name is `Astra`; theme color and icons follow the existing dark violet/cyan brand.

- [ ] Add Firebase Web/Admin/Functions and PWA dependencies; keep the root development script and production API paths working.
- [ ] Build `AuthGate` with email/password sign-up, sign-in, password reset, sign-out callback, and visible setup fallback when Firebase config is absent.
- [ ] Refactor the server into a shared Express factory and export it through Firebase Functions v2 while retaining the local Node entry point.
- [ ] Add Firebase Hosting rewrite to the API function, a web manifest, service worker for static shell assets only, and app icons.
- [ ] Add Firestore rules that require `request.auth.uid == uid` for each user's data subtree and deny all other access.

### Task 2: Synced conversations, memories, and local import

**Files:**
- Create: `src/components/MemoryPanel.jsx`
- Modify: `src/App.jsx`, `src/components/Sidebar.jsx`, `src/components/ChatView.jsx`, `src/styles.css`, `functions/src/app.js`, `firestore.rules`

**Interfaces:**
- Conversation document: `{ id, title, createdAt, updatedAt }` at `users/{uid}/conversations/{conversationId}`; message documents `{ id, role, content, createdAt }` live in its `messages` subcollection.
- Memory record: `{ id, text, category, createdAt, updatedAt }` stored at `users/{uid}/memories/{memoryId}`; text length is at most 500 characters and model context is at most 20 records.
- `MemoryPanel({ memories, onAdd, onUpdate, onDelete, onClose })` shows synced records and explains that approved memories are included in future prompts.
- Text-chat API requires a Firebase ID token and never accepts a trusted `uid` from the request body.

- [ ] Replace the local-only conversation source with authenticated Firestore listeners and writes; keep a no-config preview state for local UI development.
- [ ] Persist account preferences (`language`, `character`) in `users/{uid}/preferences/app` and synchronize updates live.
- [ ] Add synced chat create/select/search/rename/delete and keep current conversation model fields compatible with existing UI.
- [ ] Add memory panel CRUD, message-level “Remember” actions, a 20-record/500-character context bound, and explicit remove/clear affordances.
- [ ] Add a one-time import prompt that offers existing local chats after sign-in; record import completion per account only after the user accepts.
- [ ] Add user-triggered JSON export and account-data deletion routes/UI for conversations, memories, and preferences.

### Task 3: Live male/female androids and voice transcript sync

**Files:**
- Create: `src/components/AvatarStage.jsx`
- Modify: `functions/src/app.js`, `functions/index.js`, `src/App.jsx`, `src/components/ChatView.jsx`, `src/styles.css`, `.env.example`
- Add: generated portrait reference assets under `public/characters/`

**Interfaces:**
- `POST /api/avatar/embed-token` requires `Authorization: Bearer <Firebase ID token>` and `{ conversationId, character }`; it verifies ownership, then returns `{ token, agentCode, model, conversationId }` from a server-side BitHuman request.
- `POST /api/avatar/chat/completions` accepts the OpenAI-compatible BitHuman provider request, authenticates the server-only `BITHUMAN_GATEWAY_KEY`, resolves the HMAC fingerprint from the token-mint flow through the Admin-only `avatarSessions` collection, retrieves only that user's approved memory, and saves the user/assistant turns under that conversation.
- `AvatarStage({ conversationId, character, language, onTranscript, onError })` embeds the chosen private Expression 2 agent with `allow="microphone *; autoplay *"`; it never receives the provider API secret.
- Server configuration: `BITHUMAN_API_SECRET`, `BITHUMAN_AGENT_MALE`, `BITHUMAN_AGENT_FEMALE`, `BITHUMAN_GATEWAY_KEY`, `BITHUMAN_GATEWAY_MODEL`, and the OpenAI model credential, plus optional premium voice provider keys.

- [ ] Generate two distinct, adult South Asian humanoid-android portrait references (male-presenting and female-presenting) for setup/fallback; keep them as project assets.
- [ ] Implement authenticated short-lived BitHuman embed-token minting and select only the configured agent for the requested character.
- [ ] Implement the OpenAI-compatible provider endpoint; validate provider auth, parse the signed user/thread identity, load that user's memories, and persist each complete user/assistant turn.
- [ ] Connect the text-chat path and voice-provider path to the same Firestore conversation so voice transcripts appear live in the chat list on every signed-in device.
- [ ] Implement avatar loading, microphone-denied, expired-session, unsupported-browser, and missing-credentials states with a visible static portrait fallback.
- [ ] Add stop/interrupt and “Tap to talk” interactions; never request microphone permission before the user starts voice mode.

### Task 4: Multilingual emotional companion and visual polish

**Files:**
- Modify: `functions/src/app.js`, `src/App.jsx`, `src/components/AvatarStage.jsx`, `src/components/Composer.jsx`, `src/components/ChatView.jsx`, `src/components/Sidebar.jsx`, `src/styles.css`, `src/components/MemoryPanel.jsx`

**Interfaces:**
- Language choices: `Auto`, `English`, `Hindi`, `Bengali`, `Gujarati`, `Kannada`, `Malayalam`, `Marathi`, `Odia`, `Punjabi`, `Tamil`, `Telugu`, and `Urdu`, with each choice shown in its native label plus English.
- Character choice is `male` or `female`; it is per-user, persists in Firestore, and maps to the corresponding private BitHuman agent.
- The assistant system prompt is shared by text and voice routes and includes approved memories, language preference, warm conversational listening, curiosity, and clear AI identity.

- [ ] Add a labeled native-language selector and user-visible male/female android selector with accessible selected states.
- [ ] Prompt the assistant to match the user's language, acknowledge likely emotion and intent gently, ask one natural follow-up when useful, and avoid forced advice or claiming human feelings.
- [ ] Configure expressive voice delivery for emotional context; keep captions/transcript visible and provide a way to stop speech or return to text-only chat.
- [ ] Add an atmospheric aurora/starfield background, polished glass surfaces, character glow, and listening/thinking/speaking states; preserve existing themes and responsive sidebar.
- [ ] Respect `prefers-reduced-motion`, add accessible labels and focus styles, and ensure microphone permission errors do not block typed chat.

### Task 5: Setup, deployment, and user guidance

**Files:**
- Modify: `README.md`, `.env.example`, `package.json`, `firebase.json`

**Interfaces:**
- Setup instructions use Firebase project configuration and Firebase Functions secrets; no provider secret is placed in `VITE_*` variables or committed.
- `npm run dev` continues to start the local UI/API preview; `npm run build` produces static PWA assets for Firebase Hosting.

- [ ] Document local preview, Firebase Authentication/Firestore setup, security rules, BitHuman agent creation and private embed configuration, optional expressive voice/model keys, and PWA install steps for Android/iOS.
- [ ] Document current provider fees as estimates with direct links, cloud data handling, memory controls, export/delete, and speech-language limitations.
- [ ] Provide a deployment checklist for the Firebase project and HTTPS domain; only deploy after the user's Firebase/BitHuman accounts are connected and required secrets are available.
- [ ] Review the final diff against every design goal and the five Review Focus conditions. Do not add or run tests unless the user asks for testing or verification.
