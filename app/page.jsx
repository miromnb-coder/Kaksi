"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "halo_clone_messages_v1";
const MAX_HISTORY = 10;
const AUTO_ANALYZE_MS = 9000;

function defaultMessages() {
  return [{ role: "assistant", text: "Hei. Kysy jotain tai ota kuva." }];
}

function getInitialMessages() {
  if (typeof window === "undefined") return defaultMessages();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMessages();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return defaultMessages();

    return parsed;
  } catch {
    return defaultMessages();
  }
}

function speak(text) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  const clean = String(text || "").trim();
  if (!clean) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "fi-FI";
  utterance.rate = 1.02;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default function Page() {
  const [messages, setMessages] = useState(getInitialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [facingMode, setFacingMode] = useState("environment");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Ei käynnissä");
  const [errorText, setErrorText] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Puhe pois");

  const messagesRef = useRef(messages);
  const draftRef = useRef("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const analyzingRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    draftRef.current = input;
  }, [input]);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  useEffect(() => {
    const tryStart = async () => {
      if (typeof navigator === "undefined") return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("Kameraa ei tueta");
        return;
      }

      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setCameraReady(true);
        setCameraStatus(facingMode === "environment" ? "Takakamera valmis" : "Etukamera valmis");
      } catch {
        setCameraReady(false);
        setCameraStatus("Kameralupa puuttuu");
      }
    };

    void tryStart();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [facingMode]);

  useEffect(() => {
    if (!autoAnalyze || !cameraReady) return;

    const id = setInterval(() => {
      if (loading || analyzingRef.current) return;
      if (draftRef.current.trim()) return;

      const frame = captureFrame();
      if (!frame) return;

      void sendMessage("Kerro mitä näet kuvassa lyhyesti.", frame, {
        fromAutoAnalyze: true,
      });
    }, AUTO_ANALYZE_MS);

    return () => clearInterval(id);
  }, [autoAnalyze, cameraReady, loading]);

  function renderMessages() {
    return messages.map((m, i) => {
      const isUser = m.role === "user";

      return (
        <div key={`${m.role}-${i}`} className={`row ${isUser ? "user" : "assistant"}`}>
          {!isUser ? <div className="avatar assistant">N</div> : null}

          <div className={`bubble ${isUser ? "user" : "assistant"}`}>
            {isUser && m.imageBase64 ? (
              <img className="imgPreview" src={m.imageBase64} alt="Preview" />
            ) : null}

            <div className="text" dangerouslySetInnerHTML={{ __html: escapeHtml(m.text).replace(/\n/g, "<br>") }} />

            {!isUser ? (
              <div className="actions">
                <button
                  className="mini"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(m.text);
                    } catch {}
                  }}
                >
                  Copy
                </button>
                <button className="mini" onClick={() => speak(m.text)}>
                  Speak
                </button>
              </div>
            ) : null}
          </div>

          {isUser ? <div className="avatar user">M</div> : null}
        </div>
      );
    });
  }

  function autoGrow() {
    const el = document.getElementById("input");
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return "";

    const canvas = document.createElement("canvas");
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function sendMessage(customText = "", imageBase64 = "", options = {}) {
    if (loading || analyzingRef.current) return;

    const text = String(customText || input).trim();
    const img = String(imageBase64 || selectedImage || "").trim();

    if (!text && !img) return;

    analyzingRef.current = true;
    setLoading(true);
    setErrorText("");

    const userMsg = {
      role: "user",
      text: text || "Kerro mitä näet kuvassa lyhyesti.",
      imageBase64: img,
    };

    const nextMessages = [...messagesRef.current, userMsg];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);

    setInput("");
    if (!options.keepSelectedImage) {
      setSelectedImage("");
    }

    const history = nextMessages
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role,
        content: m.text,
      }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.text,
          imageBase64: userMsg.imageBase64,
          history,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        const err = data.error ? JSON.stringify(data.error) : `HTTP ${res.status}`;
        const errorMsg = `ERROR: ${err}`;
        const withError = [...nextMessages, { role: "assistant", text: errorMsg }];
        messagesRef.current = withError;
        setMessages(withError);
        setErrorText("Backend-virhe");
      } else {
        const reply = data.reply || "Ei vastausta.";
        const withReply = [...nextMessages, { role: "assistant", text: reply }];
        messagesRef.current = withReply;
        setMessages(withReply);

        if (autoSpeak) speak(reply);
      }
    } catch (err) {
      const errorMsg = `ERROR: ${err.message || String(err)}`;
      const withError = [...nextMessages, { role: "assistant", text: errorMsg }];
      messagesRef.current = withError;
      setMessages(withError);
      setErrorText("Verkkovirhe");
    } finally {
      setLoading(false);
      analyzingRef.current = false;
    }
  }

  async function startVoice() {
    if (listening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorText("Puhe ei ole tuettu tässä selaimessa");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "fi-FI";
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalText = "";

    recognition.onstart = () => {
      setListening(true);
      setVoiceStatus("Kuuntelee…");
      setErrorText("");
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      const visible = `${finalText} ${interim}`.trim();
      setInput(visible);
      draftRef.current = visible;
      autoGrow();
    };

    recognition.onerror = () => {
      setListening(false);
      setVoiceStatus("Puhe pois");
      setErrorText("Puhevirhe");
    };

    recognition.onend = () => {
      setListening(false);
      setVoiceStatus("Puhe pois");

      const spoken = finalText.trim();
      if (spoken) {
        void sendMessage(spoken);
      }
    };

    recognition.start();
  }

  async function startCamera(mode = facingMode) {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("Kameraa ei tueta");
        setCameraReady(false);
        return;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setCameraReady(true);
      setCameraStatus(mode === "environment" ? "Takakamera valmis" : "Etukamera valmis");
    } catch {
      setCameraReady(false);
      setCameraStatus("Kameralupa puuttuu");
    }
  }

  function captureAndPreview() {
    const frame = captureFrame();
    if (!frame) {
      setErrorText("Kamera ei ole valmis");
      return;
    }
    setSelectedImage(frame);
  }

  return (
    <main className="app">
      <div className="glow" />

      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div className="brandText">
            <div className="brandTitle">Halo AI</div>
            <div className="status">
              <span className={`dot ${loading ? "busy" : ""}`} />
              <span>{loading ? "Ajattelee…" : "Valmis"}</span>
            </div>
          </div>
        </div>

        <button
          className="btn"
          onClick={() => {
            messagesRef.current = defaultMessages();
            setMessages(defaultMessages());
            setInput("");
            setSelectedImage("");
            setErrorText("");
            setCameraStatus(cameraReady ? cameraStatus : "Ei käynnissä");
          }}
        >
          Clear
        </button>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">Noa clone mode</div>
          <h1 className="headline">Puhu, kuvaa, näe.</h1>
          <div className="subline">
            Minimalistinen HUD, live kamera, automaattinen analyysi ja puhe takaisin.
          </div>
        </div>

        <label className="switchWrap" title="Auto speak">
          <span>Auto speak</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
            />
            <span className="track">
              <span className="thumb" />
            </span>
          </label>
        </label>
      </section>

      <section className="hero" style={{ padding: "14px 16px" }}>
        <div className="switchWrap" style={{ marginTop: 0 }}>
          <span>Auto analyze</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => setAutoAnalyze(e.target.checked)}
            />
            <span className="track">
              <span className="thumb" />
            </span>
          </label>
        </div>

        <div className="switchWrap" style={{ marginTop: 0 }}>
          <span>Puhe</span>
          <span style={{ color: listening ? "white" : "rgba(245,247,251,.55)" }}>
            {voiceStatus}
          </span>
        </div>
      </section>

      <section className="cameraShell">
        <video ref={videoRef} className="cameraVideo" autoPlay playsInline muted />
        <div className="cameraOverlay" />
        <div className="cameraFrame" />

        <div className="cameraHud">
          <div className="hudPill">
            <span className="hudDot" />
            <span>
              <div style={{ fontWeight: 700, lineHeight: 1 }}>Live camera</div>
              <div className="hudMini">{cameraStatus}</div>
            </span>
          </div>

          <div className="hudPill">
            <span>
              <div style={{ fontWeight: 700, lineHeight: 1 }}>Halo HUD</div>
              <div className="hudMini">capture + analyze</div>
            </span>
          </div>
        </div>

        <div className="cameraControls">
          <button
            className="glassBtn"
            onClick={() => startCamera(facingMode)}
          >
            Start
          </button>
          <button
            className="glassBtn"
            onClick={async () => {
              const next = facingMode === "environment" ? "user" : "environment";
              setFacingMode(next);
              await startCamera(next);
            }}
          >
            Flip
          </button>
          <button
            className="glassBtn primary"
            onClick={() => {
              const frame = captureFrame();
              if (!frame) {
                setErrorText("Kameraa ei löytynyt");
                return;
              }
              void sendMessage("Kerro mitä näet kuvassa lyhyesti.", frame);
            }}
          >
            Analyze
          </button>
        </div>
      </section>

      <section className="chips" aria-label="Quick prompts">
        <button className="chip" onClick={() => void sendMessage("Kerro mitä näet.")}>
          Kerro mitä näet
        </button>
        <button className="chip" onClick={() => void sendMessage("Tiivistä tämä lyhyesti.")}>
          Tiivistä
        </button>
        <button className="chip" onClick={() => void sendMessage("Lue kaikki teksti kuvasta.")}>
          Lue teksti
        </button>
        <button className="chip" onClick={() => void sendMessage("Mikä on tärkein asia tästä?")}>
          Tärkein asia
        </button>
      </section>

      {selectedImage ? (
        <section className="selectedImageCard">
          <img className="selectedImage" src={selectedImage} alt="Selected" />
          <button className="removeImage" onClick={() => setSelectedImage("")}>
            Remove image
          </button>
        </section>
      ) : null}

      <section className="chat" aria-live="polite">
        {messages.length ? (
          renderMessages()
        ) : (
          <div className="empty">
            <strong>Valmis.</strong>
            Aloita kirjoittamalla viesti.
          </div>
        )}

        {loading ? (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        <div ref={endRef} />
      </section>

      <div className="footerRow">
        <span>{messages.length} viestiä</span>
        <span className="errorTag">{errorText}</span>
      </div>

      <footer className="composer">
        <button
          className="plus"
          onClick={() => {
            fileRef.current?.click();
          }}
          title="Lisää kuva"
        >
          ⊕
        </button>

        <button
          className="plus"
          onClick={() => void startVoice()}
          title="Puhu"
        >
          🎤
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result || "");
              setSelectedImage(dataUrl);
              setInput((v) => v || "Kerro mitä näet.");
            };
            reader.readAsDataURL(file);
            e.target.value = "";
          }}
        />

        <textarea
          id="input"
          className="input"
          rows={1}
          placeholder="Mitä kuuluu?"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            draftRef.current = e.target.value;
          }}
          onInput={() => autoGrow()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
        />

        <button className="send" onClick={() => void sendMessage()} disabled={loading}>
          →
        </button>
      </footer>

      <style jsx>{`
        :global(html, body) {
          margin: 0;
          min-height: 100%;
          background:
            radial-gradient(circle at top, rgba(127, 115, 255, 0.22), transparent 28%),
            radial-gradient(circle at right, rgba(79, 227, 255, 0.14), transparent 22%),
            linear-gradient(180deg, #050608 0%, #0b0d12 100%);
          color: #f5f7fb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
            sans-serif;
        }

        :global(*) {
          box-sizing: border-box;
        }

        .app {
          min-height: 100svh;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px 14px calc(14px + env(safe-area-inset-bottom));
          position: relative;
          overflow: hidden;
        }

        .glow {
          position: fixed;
          inset: -20% auto auto 50%;
          width: 80vw;
          height: 80vw;
          transform: translateX(-50%);
          pointer-events: none;
          background: radial-gradient(circle, rgba(127, 115, 255, 0.18), transparent 60%);
          filter: blur(30px);
        }

        .topbar {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
          box-shadow: 0 0 24px rgba(127, 115, 255, 0.6);
        }

        .brandText {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .brandTitle {
          font-weight: 800;
          font-size: 18px;
          letter-spacing: 0.2px;
          line-height: 1;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: rgba(245, 247, 251, 0.7);
        }

        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #5ef08f;
          box-shadow: 0 0 12px rgba(94, 240, 143, 0.45);
        }

        .dot.busy {
          background: #ffd86b;
          box-shadow: 0 0 12px rgba(255, 216, 107, 0.45);
        }

        .btn {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
          color: #f5f7fb;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 600;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .hero {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.05));
          border-radius: 28px;
          padding: 18px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
        }

        .eyebrow {
          font-size: 11px;
          color: rgba(245, 247, 251, 0.48);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .headline {
          font-size: 24px;
          line-height: 1.05;
          font-weight: 900;
          letter-spacing: -0.02em;
          margin: 0 0 10px;
        }

        .subline {
          color: rgba(245, 247, 251, 0.7);
          font-size: 14px;
          line-height: 1.45;
          max-width: 280px;
        }

        .switchWrap {
          display: flex;
          align-items: center;
          gap: 10px;
          user-select: none;
          font-size: 13px;
          color: rgba(245, 247, 251, 0.68);
          white-space: nowrap;
          margin-top: 2px;
        }

        .switch {
          position: relative;
          width: 48px;
          height: 28px;
          flex: 0 0 auto;
        }

        .switch input {
          display: none;
        }

        .track {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
          transition: 0.2s ease;
        }

        .thumb {
          position: absolute;
          width: 22px;
          height: 22px;
          top: 3px;
          left: 3px;
          border-radius: 50%;
          background: #fff;
          transition: 0.2s ease;
        }

        .switch input:checked + .track {
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
        }

        .switch input:checked + .track .thumb {
          transform: translateX(20px);
        }

        .cameraShell {
          position: relative;
          z-index: 1;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 30px;
          overflow: hidden;
          min-height: 320px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .cameraVideo {
          width: 100%;
          height: 100%;
          min-height: 320px;
          object-fit: cover;
          display: block;
          background: #000;
        }

        .cameraOverlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(transparent 0 46%, rgba(127, 115, 255, 0.13) 47%, transparent 48%),
            linear-gradient(90deg, transparent 0 46%, rgba(79, 227, 255, 0.1) 47%, transparent 48%);
        }

        .cameraFrame {
          position: absolute;
          inset: 16px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        }

        .cameraHud {
          position: absolute;
          top: 14px;
          left: 14px;
          right: 14px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          pointer-events: none;
        }

        .hudPill {
          pointer-events: none;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.24);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          padding: 10px 12px;
          border-radius: 16px;
          font-size: 12px;
          color: #f5f7fb;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .hudMini {
          color: rgba(245, 247, 251, 0.7);
          font-size: 11px;
        }

        .hudDot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #5ef08f;
          box-shadow: 0 0 12px rgba(94, 240, 143, 0.45);
        }

        .cameraControls {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 14px;
          display: flex;
          gap: 10px;
          z-index: 2;
        }

        .glassBtn {
          flex: 1;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.32);
          color: #f5f7fb;
          border-radius: 18px;
          padding: 12px 14px;
          font-size: 13px;
          font-weight: 700;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .glassBtn.primary {
          background: linear-gradient(135deg, rgba(127, 115, 255, 0.8), rgba(79, 227, 255, 0.72));
          color: #050608;
        }

        .chips {
          position: relative;
          z-index: 1;
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 2px;
          scrollbar-width: none;
        }

        .chips::-webkit-scrollbar {
          display: none;
        }

        .chip {
          flex: 0 0 auto;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: #f5f7fb;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          white-space: nowrap;
        }

        .selectedImageCard {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .selectedImage {
          width: 54px;
          height: 54px;
          border-radius: 14px;
          object-fit: cover;
        }

        .removeImage {
          margin-left: auto;
          background: transparent;
          color: rgba(255, 255, 255, 0.8);
          border: none;
          font-size: 13px;
        }

        .chat {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: auto;
          padding: 4px 0 6px;
        }

        .row {
          display: flex;
          align-items: flex-end;
          gap: 10px;
        }

        .row.user {
          justify-content: flex-end;
        }

        .row.assistant {
          justify-content: flex-start;
        }

        .avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 800;
          flex: 0 0 auto;
        }

        .avatar.user {
          color: #050608;
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
        }

        .avatar.assistant {
          background: rgba(255, 255, 255, 0.08);
          color: #f5f7fb;
        }

        .bubble {
          max-width: min(84%, 560px);
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 14px 14px 12px;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
          overflow: hidden;
        }

        .bubble.user {
          background: linear-gradient(135deg, rgba(127, 115, 255, 0.22), rgba(79, 227, 255, 0.12));
          border-top-right-radius: 8px;
        }

        .bubble.assistant {
          background: rgba(255, 255, 255, 0.06);
          border-top-left-radius: 8px;
        }

        .text {
          white-space: pre-wrap;
          line-height: 1.48;
          font-size: 15px;
          letter-spacing: 0.01em;
        }

        .imgPreview {
          width: 100%;
          max-height: 220px;
          object-fit: cover;
          border-radius: 16px;
          margin-bottom: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }

        .mini {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
          color: #f5f7fb;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 12px;
        }

        .typing {
          width: fit-content;
          display: inline-flex;
          gap: 6px;
          align-items: center;
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .typing span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.8);
          animation: bounce 1s infinite ease-in-out;
        }

        .typing span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .typing span:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes bounce {
          0%,
          80%,
          100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          40% {
            transform: translateY(-5px);
            opacity: 1;
          }
        }

        .footerRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: rgba(245, 247, 251, 0.48);
          font-size: 12px;
          padding: 0 4px;
        }

        .errorTag {
          color: #ff9b9b;
        }

        .composer {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-end;
          gap: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 12px;
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
        }

        .plus,
        .send {
          width: 46px;
          height: 46px;
          border: 0;
          border-radius: 50%;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          font-size: 18px;
          cursor: pointer;
        }

        .plus {
          background: rgba(255, 255, 255, 0.08);
          color: #f5f7fb;
        }

        .send {
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
          color: #050608;
          font-weight: 900;
        }

        .send:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .input {
          flex: 1;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.22);
          color: #f5f7fb;
          border-radius: 18px;
          min-height: 46px;
          max-height: 140px;
          padding: 13px 14px;
          resize: none;
          outline: none;
          font-size: 16px;
          line-height: 1.4;
        }

        .input::placeholder {
          color: rgba(245, 247, 251, 0.48);
        }

        @media (max-width: 420px) {
          .headline {
            font-size: 22px;
          }

          .bubble {
            max-width: 88%;
          }
        }
      `}</style>
    </main>
  );
}
