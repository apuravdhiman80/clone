# Astra Cloud Companion — Design

## Intent

Turn Astra into a friendly AI companion people can open on Android phones and iPhones, speak with in natural language, and return to with their synced conversation and memory history. The user wants an attractive, realistic humanoid android, male/female character choices, Indian languages, empathetic and curious replies, voice with emotional delivery, and a more aesthetic background.

## Goals

- Make Astra an installable, responsive Progressive Web App (PWA) that opens from a hosted URL and can be added to an Android or iPhone home screen.
- Offer two adult android character options (male and female), with a live speaking avatar and visible chat transcript.
- Provide spoken and typed conversations, auto language detection, and a selectable language preference covering English, Hindi, and major Indian languages.
- Make replies conversational, emotionally attentive, and curious. When a user shares something personal, reflect what they said and invite them to continue without forcing advice.
- Store chats and user-approved memory records in a cloud account and keep them in sync between signed-in devices.
- Make all conversation and memory data viewable, editable, exportable, and deletable by the signed-in user.
- Replace the plain chat backdrop with an atmospheric, polished, mobile-friendly visual treatment.

## Non-goals

- Claiming that the AI is human or literally experiences the user's emotions. It detects conversational cues and adjusts language, voice delivery, and avatar expression.
- Always-on recording, emotion detection through the camera, or diagnosis of mental health conditions.
- A native App Store / Play Store binary in the first release. This plan uses a PWA; store publishing would be a separate project.
- Guaranteeing that every browser/voice sounds identical to a human or that every regional accent is equally available.

## Constraints

- The existing project is React/Vite plus an Express server and currently stores chat data only in browser localStorage. It defaults to Ollama on the developer's machine; there is no authentication, cloud database, or hosted deployment configuration.
- Use Firebase Authentication, Cloud Firestore, Firebase Hosting, and a Firebase HTTPS backend for account-scoped synchronization and deployment.
- Use a hosted live-avatar provider for realistic 3D presentation and speech. The selected direction is two custom BitHuman Expression 2 android agents embedded in the PWA, with a provider-backed expressive voice. Keep API secrets on the server.
- The current provider's managed avatar plan and usage are billable. At the current published rates, Creator is $20/month; Expression 2 custom avatars use 2,000 credits each; managed voice chat is 10 credits/minute. Two custom avatars therefore exceed the 2,000 monthly included credits by 2,000 credits, currently a $20 top-up. Premium voice or separate model usage can add charges. Recheck the provider's current plan before deployment.
- Firebase project configuration, BitHuman API credentials/agent codes, and any premium voice/model credentials are external prerequisites. Do not create paid accounts or incur credits without the user's explicit action.
- A PWA must be served over HTTPS for browser microphone access. The provider embed uses the browser's microphone permission and handles its own turn-taking/audio/avatar session.

## Approaches

1. **Cloud PWA with managed live android agents (chosen):** keep the existing React app, add Firebase sign-in/Firestore sync, and embed two live BitHuman android agents. A server-owned OpenAI-compatible model endpoint receives the account/thread identity, retrieves approved memories, and writes the turn to Firestore. This best matches mobile access, natural voice, live character, and cross-device history with the least platform rewrite; it needs Firebase and avatar/voice provider setup and recurring usage.
2. **Custom 3D canvas with Firebase and browser speech:** less vendor setup and no avatar-minute billing, but browser voices and custom facial animation are less natural and vary by device. This would miss the user's expressive-voice goal.
3. **Separate native iOS and Android apps:** can render the character natively, but duplicates platform work and requires app-store/developer account setup. Defer it; the PWA can be opened and installed from either mobile browser.

The user selected the full 3D and expressive-voice route. PWA is the delivery choice because one responsive web app reaches both mobile platforms and can be opened directly from a hosted URL.

## Product behavior

- **Getting started:** show a warm, polished sign-in screen. Email/password sign-up and sign-in create the Firebase user identity. On first sign-in, offer to import existing Astra conversations from this browser; import only after the user accepts.
- **Companion workspace:** use a layered aurora/night-sky background with a portrait-format live avatar, visible captions/transcript, a text composer, microphone control, stop/interruption control, language selector, and obvious male/female character selector. Preserve the conversation list as a synced sidebar/drawer.
- **Characters:** provide two distinct adult humanoid android agents, one male-presenting and one female-presenting, built from portrait references. Let the user switch at any time; preserve the same account, chat history, and memory across both.
- **Voice and languages:** support voice and typed turns. Default language is Auto; allow an explicit choice including English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, and Urdu. Ask the model to reply in the language the user uses or explicitly selects. Use an expressive voice configured for the chosen character; voice availability and accent can vary by language/provider.
- **Emotion and intent:** treat the model as emotionally attentive, not emotionally sentient. Prompt it to notice the user's likely intent and tone, acknowledge feeling in a natural way, match the selected language, ask at most one thoughtful follow-up when it helps, and avoid jumping to advice. The spoken/avatar delivery may reflect calm, concern, sadness, warmth, or excitement when context supports it. Do not infer mental-health conditions.
- **Memory:** keep full conversations searchable and synced. Add a separate personal-memory notebook with user-approved entries. Provide a “remember this” action on messages and memory add/edit/delete controls. Send a bounded set of these records as context in future text and voice turns. Do not silently retain sensitive facts; make memory use and cloud storage clear.
- **Sync:** store data under Firebase user IDs with Firestore security rules requiring the authenticated UID to match. Use realtime listeners so changes from a phone or desktop appear on other signed-in devices. Voice requests identify the owner and conversation thread through a short-lived server-minted avatar token; never accept a client-supplied owner ID on its own.
- **Privacy controls:** provide export/delete for chats and memories, sign-out, and a concise data notice describing Firebase storage and the third-party avatar/voice/model processing needed for live conversation.
- **Responsive / accessibility:** design for narrow phone screens first, add captions and clear permission states, support reduced motion, preserve keyboard/text use, and keep readable contrast in dark and light themes.

## Builder decisions

- Use a PWA, not separate native projects, for the first mobile-ready release.
- Use Firebase Authentication and Cloud Firestore for identity and synced data; scope every read and write to the signed-in UID. Store conversation metadata separately from per-message documents so a long conversation does not grow into one oversized Firestore record.
- Use two BitHuman Expression 2 agents, which support a robot/character look from portrait references and can be embedded as live web avatars. The web embed requires HTTPS, microphone permission, a server-minted token for private agents, and provider API credentials.
- Configure the avatar's model through a server-owned OpenAI-compatible endpoint. The server verifies the user's Firebase ID token when minting an embed token, creates an HMAC fingerprint for the Firebase UID and thread, and stores the session binding in an Admin-only Firestore collection. The gateway accepts only the server-configured provider key, resolves that fingerprint to its stored owner/thread binding, loads approved memories, returns the assistant reply, and persists both sides of the turn.
- Keep the regular text chat path backed by the existing Express model integration, but authenticate and persist turns through the same Firebase-owned conversation store.
- Start with user-authored or explicitly saved memory. Automatic extraction of personal facts can be considered later after users have clear controls and consent.
- Add graceful setup states when cloud/avatar credentials are absent; never show a fake “connected” state or an inactive blank video frame.
- Keep old local chats on the device until an explicit import is accepted. Do not upload them automatically on sign-up.
