"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_ANALYZE_MS = 5000;

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
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const analyzingRef = useRef(false);
  const lastAnalyzeRef = useRef(0);
  const fileRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [latestReply, setLatestReply] = useState("Valmis.");
  const [status, setStatus] = useState("Odottamassa");
  const [errorText, setErrorText] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([
    { role: "assistant", text: "Hei. Paina Start ja kysy jotain." },
  ]);

  const captureFrame = useCallback(() => {
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
  }, []);

  const startCamera = useCallback(
    async (mode = facingMode) => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setErrorText("Kameraa ei tueta tässä selaimessa");
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
        setStatus(mode === "environment" ? "Takakamera valmis" : "Etukamera valmis");
        setErrorText("");
      } catch {
        setCameraReady(false);
        setStatus("Kameralupa puuttuu");
        setErrorText("Salli kameran käyttö");
      }
    },
    [facingMode]
  );

  useEffect(() => {
    const id = setInterval(() => {
      if (!autoAnalyze || !cameraReady) return;
      if (busy || analyzingRef.current) return;

      const now = Date.now();
      if (now - lastAnalyzeRef.current < AUTO_ANALYZE_MS) return;
      lastAnalyzeRef.current = now;

      void analyzeCurrentFrame("Kerro mitä näet kuvassa lyhyesti.");
    }, 700);

    return () => clearInterval(id);
  }, [autoAnalyze, cameraReady, busy]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const analyzeCurrentFrame = useCallback(
    async (promptText = "Kerro mitä näet kuvassa lyhyesti.") => {
      if (!cameraReady || analyzingRef.current) return;

      const frame = captureFrame();
      if (!frame) {
        setErrorText("Kamerakuvaa ei saatu");
        return;
      }

      analyzingRef.current = true;
      setBusy(true);
      setStatus("Analysoi kuvaa…");
      setSelectedImage(frame);
      setErrorText("");

      const nextHistory = [...history, { role: "user", text: promptText }];
      setHistory(nextHistory);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: promptText,
            imageBase64: frame,
            history: nextHistory.slice(-10).map((m) => ({
              role: m.role,
              content: m.text,
            })),
          }),
        });

        const raw = await res.text();

        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(`Backend ei palauttanut JSONia: ${raw.slice(0, 120)}`);
        }

        if (!res.ok || data.error) {
          const err = data.error ? JSON.stringify(data.error) : `HTTP ${res.status}`;
          const msg = `ERROR: ${err}`;
          setLatestReply(msg);
          setHistory((prev) => [...prev, { role: "assistant", text: msg }]);
          setErrorText("Backend-virhe");
        } else {
          const reply = data.reply || "Ei vastausta.";
          setLatestReply(reply);
          setHistory((prev) => [...prev, { role: "assistant", text: reply }]);
          if (autoSpeak) speak(reply);
        }
      } catch (e) {
        const msg = `ERROR: ${e.message || String(e)}`;
        setLatestReply(msg);
        setHistory((prev) => [...prev, { role: "assistant", text: msg }]);
        setErrorText("Verkkovirhe");
      } finally {
        setBusy(false);
        analyzingRef.current = false;
        setStatus("Valmis");
      }
    },
    [autoSpeak, cameraReady, captureFrame, history]
  );

  async function sendText() {
    const text = input.trim();
    if (!text) return;

    setInput("");
    setBusy(true);
    setStatus("Ajattelee…");
    setErrorText("");

    const nextHistory = [...history, { role: "user", text }];
    setHistory(nextHistory);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: nextHistory.slice(-10).map((m) => ({
            role: m.role,
            content: m.text,
          })),
        }),
      });

      const raw = await res.text();

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Backend ei palauttanut JSONia: ${raw.slice(0, 120)}`);
      }

      if (!res.ok || data.error) {
        const err = data.error ? JSON.stringify(data.error) : `HTTP ${res.status}`;
        const msg = `ERROR: ${err}`;
        setLatestReply(msg);
        setHistory((prev) => [...prev, { role: "assistant", text: msg }]);
        setErrorText("Backend-virhe");
      } else {
        const reply = data.reply || "Ei vastausta.";
        setLatestReply(reply);
        setHistory((prev) => [...prev, { role: "assistant", text: reply }]);
        if (autoSpeak) speak(reply);
      }
    } catch (e) {
      const msg = `ERROR: ${e.message || String(e)}`;
      setLatestReply(msg);
      setHistory((prev) => [...prev, { role: "assistant", text: msg }]);
      setErrorText("Verkkovirhe");
    } finally {
      setBusy(false);
      setStatus("Valmis");
    }
  }

  function clearAll() {
    const reset = [{ role: "assistant", text: "Hei. Paina Start ja kysy jotain." }];
    setHistory(reset);
    setLatestReply("Valmis.");
    setSelectedImage("");
    setInput("");
    setErrorText("");
  }

  return (
    <main className="app">
      <div className="bgGlow" />
      <video ref={videoRef} className="video" autoPlay playsInline muted />

      <div className="overlay">
        <div className="topRow">
          <div className="brand">
            <div className={`dot ${busy ? "pulse" : ""}`} />
            <div>
              <div className="title">Noa HUD</div>
              <div className="sub">{status} • {cameraReady ? "kamera päällä" : "kamera pois"}</div>
            </div>
          </div>

          <button className="smallBtn" onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}>
            Flip
          </button>
        </div>

        <div className="centerFrame" />

        <div className="statusCard">
          <div className="statusLine">
            <span className={`state ${busy ? "busy" : ""}`}>{status}</span>
            <span className="mini">vision mode</span>
          </div>

          <div className="reply">{escapeHtml(latestReply).slice(0, 220)}</div>

          <div className="toggles">
            <button className={`toggle ${autoAnalyze ? "on" : ""}`} onClick={() => setAutoAnalyze((v) => !v)}>
              Auto analyze
            </button>
            <button className={`toggle ${autoSpeak ? "on" : ""}`} onClick={() => setAutoSpeak((v) => !v)}>
              Auto speak
            </button>
          </div>

          <div className="controls">
            <button className="btn" onClick={() => void startCamera()}>
              Start
            </button>
            <button className="btn primary" onClick={() => void analyzeCurrentFrame()}>
              Analyze
            </button>
            <button className="btn" onClick={() => speak(latestReply)}>
              Speak
            </button>
          </div>

          {selectedImage ? (
            <img src={selectedImage} alt="Selected" className="preview" />
          ) : null}

          {errorText ? <div className="error">{errorText}</div> : null}
        </div>

        <div className="bottomHint">
          <div className="hintPill">Halo HUD</div>
          <div className="hintPill">Groq vision</div>
          <div className="hintPill">No URL tweak</div>
        </div>
      </div>

      <footer className="composer">
        <button className="plus" onClick={() => fileRef.current?.click()}>⊕</button>
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
              setInput((v) => v || "Kerro mitä näet kuvassa lyhyesti.");
            };
            reader.readAsDataURL(file);
            e.target.value = "";
          }}
        />

        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mitä kuuluu?"
        />

        <button className="send" onClick={() => void sendText()} disabled={busy}>
          →
        </button>
      </footer>

      <div className="quickRow">
        <button className="quickChip" onClick={() => setInput("Kerro mitä näet.")}>Kerro mitä näet</button>
        <button className="quickChip" onClick={() => setInput("Lue kaikki teksti kuvasta.")}>Lue teksti</button>
        <button className="quickChip" onClick={() => setInput("Tiivistä tämä lyhyesti.")}>Tiivistä</button>
      </div>

      <style jsx>{`
        :global(html, body) {
          margin: 0;
          width: 100%;
          height: 100%;
          background: #050608;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        :global(*) { box-sizing: border-box; }

        .app {
          position: relative;
          width: 100vw;
          height: 100svh;
          background: #050608;
          color: #f5f7fb;
          overflow: hidden;
        }

        .bgGlow {
          position: absolute;
          inset: -20% auto auto 50%;
          width: 90vw;
          height: 90vw;
          transform: translateX(-50%);
          background: radial-gradient(circle, rgba(127,115,255,0.18), transparent 60%);
          filter: blur(24px);
          pointer-events: none;
        }

        .video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
        }

        .overlay {
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(0,0,0,.35), transparent 24%, transparent 72%, rgba(0,0,0,.56));
        }

        .topRow {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
          box-shadow: 0 0 18px rgba(127,115,255,.6);
          flex: 0 0 auto;
        }

        .dot.pulse { animation: pulse 1s infinite; }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: .7; }
          100% { transform: scale(1); opacity: 1; }
        }

        .title { font-size: 18px; font-weight: 800; line-height: 1; }
        .sub { margin-top: 3px; font-size: 12px; color: rgba(245,247,251,.7); }

        .smallBtn {
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.28);
          color: #f5f7fb;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          backdrop-filter: blur(16px);
        }

        .centerFrame {
          position: absolute;
          inset: 14vh 10px 28vh;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 28px;
          pointer-events: none;
        }

        .statusCard {
          align-self: center;
          width: min(100%, 760px);
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.34);
          border-radius: 26px;
          padding: 14px;
          backdrop-filter: blur(20px);
        }

        .statusLine {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
          font-size: 12px;
          color: rgba(245,247,251,.74);
        }

        .state { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
        .state.busy::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ffd86b;
          box-shadow: 0 0 12px rgba(255,216,107,.45);
        }

        .mini { color: rgba(245,247,251,.55); }

        .reply {
          min-height: 72px;
          font-size: 18px;
          line-height: 1.45;
          white-space: pre-wrap;
          color: #fff;
        }

        .toggles, .controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .toggle, .btn, .quickChip {
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.06);
          color: #f5f7fb;
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 12px;
        }

        .toggle.on {
          background: linear-gradient(135deg, rgba(127,115,255,.78), rgba(79,227,255,.70));
          color: #050608;
          font-weight: 800;
        }

        .controls .btn { flex: 1; padding: 12px 14px; }
        .btn.primary { background: linear-gradient(135deg, #7f73ff, #4fe3ff); color: #050608; font-weight: 900; }

        .preview {
          width: 100%;
          height: 160px;
          object-fit: cover;
          border-radius: 18px;
          margin-top: 12px;
          border: 1px solid rgba(255,255,255,.10);
        }

        .error {
          margin-top: 10px;
          color: #ff9b9b;
          font-size: 12px;
        }

        .bottomHint {
          display: flex;
          gap: 8px;
          justify-content: center;
          flex-wrap: wrap;
          padding-bottom: 4px;
        }

        .hintPill {
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.24);
          color: rgba(245,247,251,.78);
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          backdrop-filter: blur(14px);
        }

        .composer {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 70px;
          z-index: 3;
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 12px;
          border-radius: 24px;
          background: rgba(0,0,0,.30);
          border: 1px solid rgba(255,255,255,.12);
          backdrop-filter: blur(18px);
        }

        .plus {
          width: 46px;
          height: 46px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 18px;
        }

        .input {
          flex: 1;
          min-width: 0;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.07);
          color: #fff;
          border-radius: 18px;
          padding: 12px 14px;
          font-size: 16px;
          outline: none;
        }

        .send {
          width: 46px;
          height: 46px;
          border-radius: 999px;
          border: 0;
          background: #fff;
          color: #050608;
          font-size: 20px;
          font-weight: 900;
        }

        .quickRow {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 14px;
          z-index: 3;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }

        @media (max-width: 420px) {
          .reply { font-size: 16px; }
          .controls { flex-direction: column; }
          .centerFrame { inset: 12vh 8px 30vh; }
          .composer { bottom: 74px; }
        }
      `}</style>
    </main>
  );
}
