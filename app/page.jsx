"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "halo_clone_hud_v1";
const ANALYZE_INTERVAL_MS = 4500;
const WAKE_WORDS = ["hei noa", "hey noa", "noa"];

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
  const recognitionRef = useRef(null);
  const analyzeLockRef = useRef(false);
  const lastAutoAnalyzeRef = useRef(0);
  const lastWakeHitRef = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Ei käynnissä");
  const [loading, setLoading] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [wakeWord, setWakeWord] = useState(true);
  const [facingMode, setFacingMode] = useState("environment");
  const [lastReply, setLastReply] = useState("Valmis.");
  const [lastAction, setLastAction] = useState("Odottaa");
  const [errorText, setErrorText] = useState("");
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.autoAnalyze === "boolean") setAutoAnalyze(parsed.autoAnalyze);
        if (typeof parsed.autoSpeak === "boolean") setAutoSpeak(parsed.autoSpeak);
        if (typeof parsed.wakeWord === "boolean") setWakeWord(parsed.wakeWord);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ autoAnalyze, autoSpeak, wakeWord })
    );
  }, [autoAnalyze, autoSpeak, wakeWord]);

  async function startCamera(mode = facingMode) {
    try {
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
      setErrorText("");
    } catch {
      setCameraReady(false);
      setCameraStatus("Kameralupa puuttuu");
      setErrorText("Salli kameran käyttö");
    }
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

  async function analyzeFrame(promptText = "Kerro mitä näet kuvassa lyhyesti.") {
    if (!cameraReady || analyzeLockRef.current) return;

    const imageBase64 = captureFrame();
    if (!imageBase64) return;

    analyzeLockRef.current = true;
    setLoading(true);
    setPulse(true);
    setLastAction("Analysoi…");
    setErrorText("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptText,
          imageBase64,
          history: [
            { role: "user", content: promptText },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        const err = data.error ? JSON.stringify(data.error) : `HTTP ${res.status}`;
        setLastReply(`ERROR: ${err}`);
        setErrorText("Backend-virhe");
      } else {
        const reply = data.reply || "Ei vastausta.";
        setLastReply(reply);
        if (autoSpeak) speak(reply);
      }
    } catch (err) {
      setLastReply(`ERROR: ${err.message || String(err)}`);
      setErrorText("Verkkovirhe");
    } finally {
      setLoading(false);
      setPulse(false);
      setLastAction("Valmis");
      analyzeLockRef.current = false;
    }
  }

  useEffect(() => {
    void startCamera(facingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  useEffect(() => {
    if (!autoAnalyze || !cameraReady) return;

    const id = setInterval(() => {
      const now = Date.now();
      if (now - lastAutoAnalyzeRef.current < ANALYZE_INTERVAL_MS) return;
      if (loading || analyzeLockRef.current) return;

      lastAutoAnalyzeRef.current = now;
      void analyzeFrame("Kerro mitä näet kuvassa lyhyesti.");
    }, ANALYZE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [autoAnalyze, cameraReady, loading]);

  useEffect(() => {
    if (!wakeWord || typeof window === "undefined") return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorText("Puheentunnistus ei ole tuettu tässä selaimessa");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "fi-FI";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalChunk = "";

    recognition.onresult = (event) => {
      let full = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        full += event.results[i][0].transcript + " ";
      }

      const transcript = full.trim().toLowerCase();
      if (!transcript) return;

      const now = Date.now();
      if (now - lastWakeHitRef.current < 5000) return;

      const hasWake = WAKE_WORDS.some((w) => transcript.includes(w));
      if (!hasWake) {
        finalChunk = transcript;
        return;
      }

      lastWakeHitRef.current = now;
      setPulse(true);
      setLastAction("Herätys");
      speak("Kuuntelen.");

      const cleaned = transcript
        .replace("hei noa", "")
        .replace("hey noa", "")
        .replace("noa", "")
        .trim();

      if (cleaned.length > 0) {
        void analyzeFrame(cleaned);
      } else {
        void analyzeFrame("Kerro mitä näet kuvassa lyhyesti.");
      }

      finalChunk = "";
    };

    recognition.onerror = () => {
      setErrorText("Puheherätys ei käynnistynyt");
    };

    try {
      recognition.start();
      setLastAction("Wake word päällä");
    } catch {}

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, [wakeWord, autoSpeak, cameraReady]);

  const overlayText = lastReply.length > 160 ? `${lastReply.slice(0, 160)}…` : lastReply;

  return (
    <main className="app">
      <div className="bgGlow" />

      <video ref={videoRef} className="video" autoPlay playsInline muted />

      <div className="overlay">
        <div className="topRow">
          <div className="brand">
            <div className={`dot ${pulse ? "pulse" : ""}`} />
            <div>
              <div className="title">Noa HUD</div>
              <div className="sub">{cameraStatus}</div>
            </div>
          </div>

          <button
            className="smallBtn"
            onClick={() => {
              setFacingMode((m) => (m === "environment" ? "user" : "environment"));
            }}
          >
            Flip
          </button>
        </div>

        <div className="centerFrame" />

        <div className="statusCard">
          <div className="statusLine">
            <span className={`state ${loading ? "busy" : ""}`}>{lastAction}</span>
            <span className="mini">camera {cameraReady ? "ready" : "off"}</span>
          </div>

          <div className="reply">{escapeHtml(overlayText)}</div>

          <div className="toggles">
            <button className={`toggle ${autoAnalyze ? "on" : ""}`} onClick={() => setAutoAnalyze(v => !v)}>
              Auto analyze
            </button>
            <button className={`toggle ${autoSpeak ? "on" : ""}`} onClick={() => setAutoSpeak(v => !v)}>
              Auto speak
            </button>
            <button className={`toggle ${wakeWord ? "on" : ""}`} onClick={() => setWakeWord(v => !v)}>
              Wake word
            </button>
          </div>

          <div className="controls">
            <button className="btn" onClick={() => void startCamera(facingMode)}>
              Start
            </button>
            <button className="btn primary" onClick={() => void analyzeFrame()}>
              Analyze now
            </button>
            <button className="btn" onClick={() => speak(lastReply)}>
              Speak
            </button>
          </div>

          {errorText ? <div className="error">{errorText}</div> : null}
        </div>

        <div className="bottomHint">
          <div className="hintPill">Hei Noa</div>
          <div className="hintPill">Auto vision</div>
          <div className="hintPill">AR overlay</div>
        </div>
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

        :global(*) {
          box-sizing: border-box;
        }

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
          background:
            linear-gradient(180deg, rgba(0,0,0,.36), transparent 24%, transparent 72%, rgba(0,0,0,.55)),
            radial-gradient(circle at top, rgba(127,115,255,.08), transparent 40%);
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

        .dot.pulse {
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: .7; }
          100% { transform: scale(1); opacity: 1; }
        }

        .title {
          font-size: 18px;
          font-weight: 800;
          line-height: 1;
        }

        .sub {
          margin-top: 3px;
          font-size: 12px;
          color: rgba(245,247,251,.7);
        }

        .smallBtn {
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.28);
          color: #f5f7fb;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .centerFrame {
          position: absolute;
          inset: 14vh 10px 28vh;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 28px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
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
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 0 18px 50px rgba(0,0,0,.28);
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

        .state {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
        }

        .state.busy::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ffd86b;
          box-shadow: 0 0 12px rgba(255,216,107,.45);
        }

        .mini {
          color: rgba(245,247,251,.55);
        }

        .reply {
          min-height: 72px;
          font-size: 18px;
          line-height: 1.45;
          white-space: pre-wrap;
          color: #fff;
        }

        .toggles {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .toggle, .btn {
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

        .controls {
          display: flex;
          gap: 10px;
          margin-top: 12px;
        }

        .btn {
          flex: 1;
          padding: 12px 14px;
        }

        .btn.primary {
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
          color: #050608;
          font-weight: 900;
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
          -webkit-backdrop-filter: blur(14px);
        }

        @media (max-width: 420px) {
          .reply {
            font-size: 16px;
          }

          .controls {
            flex-direction: column;
          }

          .centerFrame {
            inset: 12vh 8px 30vh;
          }
        }
      `}</style>
    </main>
  );
}
