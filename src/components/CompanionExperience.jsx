import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Mic, MicOff, Sparkles } from "lucide-react";

const portraits = {
  female: "/characters/astra-female.jpg",
  male: "/characters/astra-male.png",
};

const speechLanguage = {
  English: "en-IN", Hindi: "hi-IN", Bengali: "bn-IN", Gujarati: "gu-IN",
  Kannada: "kn-IN", Malayalam: "ml-IN", Marathi: "mr-IN", Odia: "or-IN",
  Punjabi: "pa-IN", Tamil: "ta-IN", Telugu: "te-IN", Urdu: "ur-IN",
};

const whisperLanguage = {
  English: "english", Hindi: "hindi", Bengali: "bengali", Gujarati: "gujarati",
  Kannada: "kannada", Malayalam: "malayalam", Marathi: "marathi", Odia: "odia",
  Punjabi: "punjabi", Tamil: "tamil", Telugu: "telugu", Urdu: "urdu",
};

const states = {
  idle: "Tap below when you’re ready to talk.",
  listening: "I’m listening.",
  thinking: "Give me a moment to think.",
  speaking: "Astra is speaking.",
};

function spokenText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, "I’ve included a code example in the chat.")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]\s|\d+\.\s)/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function CompanionExperience({
  character,
  onCharacterChange,
  language,
  conversation,
  busy,
  onSend,
  onStop,
  onOpenChats,
  hidden = false,
}) {
  const [screen, setScreen] = useState("choose");
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceError, setVoiceError] = useState("");
  const voiceEnabledRef = useRef(false);
  const voiceFailedRef = useRef(false);
  const recognitionRef = useRef(null);
  const pendingTranscriptRef = useRef("");
  const listenTimerRef = useRef(null);
  const onSendRef = useRef(onSend);
  const onStopRef = useRef(onStop);
  const busyRef = useRef(busy);
  const wasBusyRef = useRef(busy);
  const speechResponseIdRef = useRef("");
  const speechRawLengthRef = useRef(0);
  const speechBufferRef = useRef("");
  const speechQueueRef = useRef([]);
  const speechActiveRef = useRef(false);
  const responseCompleteRef = useRef(true);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const vadSamplesRef = useRef(null);
  const vadTimerRef = useRef(null);
  const localFallbackRef = useRef(false);
  const localTranscribingRef = useRef(false);
  const heardSpeechRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const localTranscriberRef = useRef(null);
  onSendRef.current = onSend;
  onStopRef.current = onStop;
  busyRef.current = busy;

  async function releaseAudioCapture(keepAudio = false) {
    window.clearInterval(vadTimerRef.current);
    vadTimerRef.current = null;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise((resolve) => {
        recorder.addEventListener("stop", resolve, { once: true });
        try { recorder.stop(); } catch { resolve(); }
      });
    }
    const chunks = recordedChunksRef.current;
    const audio = keepAudio && chunks.length
      ? new Blob(chunks, { type: recorder?.mimeType || chunks[0]?.type || "audio/webm" })
      : null;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    analyserRef.current = null;
    vadSamplesRef.current = null;
    if (context && context.state !== "closed") await context.close().catch(() => {});
    return audio;
  }

  async function startAudioCapture() {
    if (mediaRecorderRef.current?.state === "recording") return true;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return false;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!voiceEnabledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) recordedChunksRef.current.push(event.data);
      });
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.start(250);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const context = new AudioContextClass();
        void context.resume().catch(() => {});
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        context.createMediaStreamSource(stream).connect(analyser);
        audioContextRef.current = context;
        analyserRef.current = analyser;
        vadSamplesRef.current = new Float32Array(analyser.fftSize);
        vadTimerRef.current = window.setInterval(() => {
          const currentAnalyser = analyserRef.current;
          const samples = vadSamplesRef.current;
          if (!currentAnalyser || !samples) return;
          currentAnalyser.getFloatTimeDomainData(samples);
          let energy = 0;
          for (const sample of samples) energy += sample * sample;
          const now = Date.now();
          if (Math.sqrt(energy / samples.length) > 0.008) {
            heardSpeechRef.current = true;
            lastSpeechAtRef.current = now;
          }
          if (localFallbackRef.current && heardSpeechRef.current && now - lastSpeechAtRef.current > 1600) {
            void finishLocalTranscription();
          }
        }, 120);
      }
      heardSpeechRef.current = false;
      lastSpeechAtRef.current = Date.now();
      return true;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (voiceEnabledRef.current) {
        voiceEnabledRef.current = false;
        voiceFailedRef.current = true;
        localFallbackRef.current = false;
        recognitionRef.current?.abort();
        const message = error?.name === "NotAllowedError" || error?.name === "SecurityError"
          ? "Allow microphone access for this page, then tap to talk again."
          : error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError"
            ? "No microphone was found. Connect a microphone and try again."
            : error?.name === "NotReadableError"
              ? "The microphone is busy in another app. Close that app and try again."
              : `The microphone could not start (${error?.name || "unknown error"}).`;
        setVoiceState("error");
        setVoiceError(message);
      }
      return false;
    }
  }

  async function transcribeLocally(blob) {
    if (!localTranscriberRef.current) {
      localTranscriberRef.current = (async () => {
        setVoiceError("Preparing on-device voice recognition… the first setup downloads a small speech model.");
        const { pipeline } = await import("@huggingface/transformers");
        return pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
      })().catch((error) => {
        localTranscriberRef.current = null;
        throw error;
      });
    }
    const transcriber = await localTranscriberRef.current;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Audio decoding is not supported in this browser.");
    const context = new AudioContextClass();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const samples = decoded.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) mono[index] += samples[index] / decoded.numberOfChannels;
      }
      const ratio = decoded.sampleRate / 16000;
      const targetLength = Math.floor(mono.length / ratio);
      const audio = new Float32Array(targetLength);
      for (let index = 0; index < targetLength; index += 1) {
        const start = Math.floor(index * ratio);
        const end = Math.min(mono.length, Math.floor((index + 1) * ratio));
        let total = 0;
        for (let source = start; source < Math.max(start + 1, end); source += 1) total += mono[source] || 0;
        audio[index] = total / Math.max(1, end - start);
      }
      const options = { task: "transcribe", ...(whisperLanguage[language] ? { language: whisperLanguage[language] } : {}) };
      const result = await transcriber(audio, options);
      return result?.text?.trim() || "";
    } finally {
      await context.close().catch(() => {});
    }
  }

  async function finishLocalTranscription() {
    if (localTranscribingRef.current || !voiceEnabledRef.current) return;
    localTranscribingRef.current = true;
    setVoiceState("thinking");
    setVoiceError("Transcribing your voice on this device…");
    try {
      const audio = await releaseAudioCapture(true);
      if (!audio || audio.size < 2500) throw new Error("I didn't catch any clear speech. Tap to try again.");
      const transcript = await transcribeLocally(audio);
      if (!voiceEnabledRef.current) return;
      if (!transcript) throw new Error("I couldn't catch those words. Try speaking a little closer to the microphone.");
      localFallbackRef.current = false;
      voiceFailedRef.current = false;
      setVoiceError("");
      setVoiceState("thinking");
      void onSendRef.current?.({ text: transcript, attachments: [], thinking: false });
    } catch (error) {
      if (voiceEnabledRef.current) {
        voiceEnabledRef.current = false;
        voiceFailedRef.current = true;
        localFallbackRef.current = false;
        setVoiceState("error");
        setVoiceError(error?.message || "On-device voice recognition could not start. Try again.");
      }
    } finally {
      localTranscribingRef.current = false;
    }
  }

  function stopVoice() {
    voiceEnabledRef.current = false;
    voiceFailedRef.current = false;
    window.clearTimeout(listenTimerRef.current);
    listenTimerRef.current = null;
    pendingTranscriptRef.current = "";
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    speechQueueRef.current = [];
    speechBufferRef.current = "";
    speechActiveRef.current = false;
    responseCompleteRef.current = true;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    localFallbackRef.current = false;
    void releaseAudioCapture(false);
    if (busyRef.current) onStopRef.current?.();
    setVoiceState("idle");
    setVoiceError("");
  }

  function beginListening() {
    if (!voiceEnabledRef.current || recognitionRef.current) return;
    const audioCapturePromise = startAudioCapture();
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const localLanguageRecognition = language === "Auto" || language === "Hindi";
    if (!SpeechRecognition || localLanguageRecognition) {
      localFallbackRef.current = true;
      setVoiceState("listening");
      setVoiceError(language === "Hindi"
        ? "Listening for Hindi on this device. Speak naturally, then pause."
        : "Listening for your language on this device. Speak naturally, then pause.");
      void audioCapturePromise.then((started) => {
        if (!started && voiceEnabledRef.current && localFallbackRef.current) {
          voiceEnabledRef.current = false;
          localFallbackRef.current = false;
          setVoiceState("error");
          setVoiceError("This browser could not access the microphone. Allow microphone access and try again.");
        }
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = speechLanguage[language] || navigator.language || "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;
    pendingTranscriptRef.current = "";
    setVoiceState("listening");
    setVoiceError("");

    recognition.onresult = (event) => {
      pendingTranscriptRef.current = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (pendingTranscriptRef.current) recognition.stop();
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      const localMicReady = mediaRecorderRef.current?.state === "recording";
      if (event.error === "network" || event.error === "service-not-allowed" || event.error === "audio-capture" || (event.error === "not-allowed" && localMicReady)) {
        localFallbackRef.current = true;
        setVoiceState("listening");
        setVoiceError("Switching to on-device listening. Speak naturally, then pause.");
        void audioCapturePromise.then((started) => {
          if (!started && voiceEnabledRef.current && localFallbackRef.current) {
            voiceEnabledRef.current = false;
            localFallbackRef.current = false;
            setVoiceState("error");
            setVoiceError("The browser speech service is unavailable and local microphone capture could not start.");
          }
        });
        return;
      }
      voiceEnabledRef.current = false;
      voiceFailedRef.current = true;
      void releaseAudioCapture(false);
      setVoiceState("error");
      setVoiceError(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Allow microphone access in your browser, then try again."
        : `Voice recognition stopped (${event.error}). Check your microphone and try again.`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      const transcript = pendingTranscriptRef.current;
      pendingTranscriptRef.current = "";
      if (transcript && voiceEnabledRef.current) {
        localFallbackRef.current = false;
        void releaseAudioCapture(false);
        setVoiceState("thinking");
        void onSendRef.current?.({ text: transcript, attachments: [], thinking: false });
        return;
      }
      if (localFallbackRef.current) return;
      if (voiceFailedRef.current) return;
      if (voiceEnabledRef.current) {
        listenTimerRef.current = window.setTimeout(beginListening, 250);
      } else {
        setVoiceState("idle");
      }
    };

    try { recognition.start(); }
    catch {
      recognitionRef.current = null;
      localFallbackRef.current = true;
      setVoiceState("listening");
      setVoiceError("Using on-device listening. Speak naturally, then pause.");
    }
  }

  function playNextSpeechChunk() {
    if (speechActiveRef.current || !voiceEnabledRef.current) return;
    if (!("speechSynthesis" in window)) {
      if (responseCompleteRef.current) beginListening();
      return;
    }
    const text = speechQueueRef.current.shift();
    if (!text) {
      if (responseCompleteRef.current) beginListening();
      return;
    }
    speechActiveRef.current = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLanguage[language] || navigator.language || "en-IN";
    utterance.rate = 0.96;
    utterance.pitch = character === "male" ? 0.94 : 1.02;
    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = () => {
      speechActiveRef.current = false;
      if (voiceEnabledRef.current) playNextSpeechChunk();
      else setVoiceState("idle");
    };
    utterance.onerror = () => {
      speechActiveRef.current = false;
      if (voiceEnabledRef.current) playNextSpeechChunk();
      else setVoiceState("idle");
    };
    window.speechSynthesis.speak(utterance);
  }

  function addStreamedSpeech(message, final = false) {
    if (!message || message.id !== speechResponseIdRef.current) return;
    const content = message.content || "";
    const newText = content.slice(speechRawLengthRef.current);
    speechRawLengthRef.current = content.length;
    if (newText) speechBufferRef.current += spokenText(newText);

    const sentenceBoundary = /[.!?।]+["'’”)}\]]*(?:\s+|$)/;
    let match;
    while ((match = sentenceBoundary.exec(speechBufferRef.current))) {
      const end = match.index + match[0].length;
      const sentence = speechBufferRef.current.slice(0, end).trim();
      speechBufferRef.current = speechBufferRef.current.slice(end);
      if (sentence) speechQueueRef.current.push(sentence);
    }
    if (final) {
      const lastWords = speechBufferRef.current.trim();
      speechBufferRef.current = "";
      if (lastWords) speechQueueRef.current.push(lastWords);
    }
    playNextSpeechChunk();
  }

  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    const latestAssistantMessage = [...(conversation?.messages || [])]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!wasBusy && busy) {
      speechResponseIdRef.current = latestAssistantMessage?.id || "";
      speechRawLengthRef.current = 0;
      speechBufferRef.current = "";
      speechQueueRef.current = [];
      speechActiveRef.current = false;
      responseCompleteRef.current = false;
    }
    if (busy && voiceEnabledRef.current) addStreamedSpeech(latestAssistantMessage);
    wasBusyRef.current = busy;
    if (wasBusy && !busy && voiceEnabledRef.current) {
      responseCompleteRef.current = true;
      if (latestAssistantMessage?.id === speechResponseIdRef.current) addStreamedSpeech(latestAssistantMessage, true);
      else playNextSpeechChunk();
    }
  }, [busy, conversation?.messages]);

  useEffect(() => {
    if (hidden) stopVoice();
  }, [hidden]);

  useEffect(() => () => {
    voiceEnabledRef.current = false;
    window.clearTimeout(listenTimerRef.current);
    recognitionRef.current?.abort();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    void releaseAudioCapture(false);
  }, []);

  function toggleVoice() {
    if (voiceEnabledRef.current) {
      if (localFallbackRef.current) {
        if (localTranscribingRef.current) stopVoice();
        else void finishLocalTranscription();
        return;
      }
      stopVoice();
      return;
    }
    voiceEnabledRef.current = true;
    voiceFailedRef.current = false;
    setVoiceError("");
    beginListening();
  }

  function chooseCharacter(nextCharacter) {
    stopVoice();
    onCharacterChange(nextCharacter);
    setScreen("companion");
  }

  function openChats() {
    stopVoice();
    onOpenChats();
  }

  const image = portraits[character] || portraits.female;
  const talkLabel = voiceState === "listening"
    ? localFallbackRef.current ? "Finish and send" : "Listening · tap to end"
    : voiceState === "thinking"
      ? localTranscribingRef.current ? "Stop transcription" : "Thinking · tap to end"
      : voiceState === "speaking"
        ? "Speaking · tap to end"
        : voiceState === "error"
          ? "Try talking again"
          : "Talk with Astra";

  return <main className={`companion-experience ${hidden ? "companion-experience-hidden" : ""}`}>
    <header className="companion-topbar">
      <div className="companion-wordmark"><span><Sparkles size={15} /></span> astra</div>
      {screen === "companion" ? <div className="companion-top-actions">
        <button className="companion-quiet-button" onClick={() => { stopVoice(); setScreen("choose"); }}><ArrowLeft size={14} /> Change companion</button>
        <button className="companion-quiet-button companion-chats-button" onClick={openChats}><MessageCircle size={15} /><span>Chats</span></button>
      </div> : <button className="companion-quiet-button" onClick={openChats}><MessageCircle size={15} /><span>Chats</span></button>}
    </header>

    {screen === "choose" ? <section className="companion-picker-screen" aria-labelledby="companion-picker-title">
      <div className="companion-picker-copy">
        <span className="companion-eyebrow">A LITTLE COMPANY, WHENEVER YOU NEED IT</span>
        <h1 id="companion-picker-title">Who would you like to talk with?</h1>
        <p>Choose a companion. You can switch any time.</p>
      </div>
      <div className="companion-choice-grid">
        {["female", "male"].map((option) => <button className="companion-choice-card" key={option} onClick={() => chooseCharacter(option)}>
          <span className={`companion-choice-portrait companion-portrait-${option}`}><img src={portraits[option]} alt="" /></span>
          <span className="companion-choice-name">{option === "female" ? "Female" : "Male"}</span>
          <span className="companion-choice-hint">Choose companion <span aria-hidden="true">↗</span></span>
        </button>)}
      </div>
    </section> : <section className="companion-room" aria-label={`${character} companion`}>
      <div className={`companion-main-portrait companion-portrait-${character}`}>
        <img src={image} alt={`Astra ${character} companion`} />
      </div>
      <div className="companion-introduction">
        <span className="companion-name">Astra</span>
        <span className="companion-caption">I’m here with you. What’s on your mind?</span>
      </div>
      <div className="companion-talk-area">
        <p className={`companion-voice-status ${voiceState === "error" ? "is-error" : ""}`} aria-live="polite">
          {voiceError || states[voiceState] || states.idle}
        </p>
        <button className={`companion-talk-button ${voiceEnabledRef.current ? "is-active" : ""} companion-talk-${voiceState}`} onClick={toggleVoice} aria-label={talkLabel} aria-pressed={voiceEnabledRef.current}>
          {voiceEnabledRef.current ? <MicOff size={20} /> : <Mic size={20} />}
          <span>{talkLabel}</span>
        </button>
      </div>
    </section>}
  </main>;
}
