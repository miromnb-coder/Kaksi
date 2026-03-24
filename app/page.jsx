"use client";

import { useEffect, useRef, useState } from "react";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function speakText(text) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fi-FI";
  utterance.rate = 1.02;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function MessageBubble({ role, content, imageBase64, onCopy, onSpeak }) {
  const isUser = role === "user";

  return (
    <div className={`bubbleRow ${isUser ? "userRow" : "assistantRow"}`}>
      <div className={`avatar ${isUser ? "userAvatar" : "assistantAvatar"}`}>
        {isUser ? "M" : "N"}
      </div>

      <div className={`bubble ${isUser ? "userBubble" : "assistantBubble"}`}>
        {imageBase64 ? (
          <img src={imageBase64} alt="Preview" className="imagePreview" />
        ) : null}

        <div className="bubbleText">{content}</div>

        {!isUser ? (
          <div className="bubbleActions">
            <button className="miniButton" onClick={onCopy}>
              Copy
            </button>
            <button className="miniButton" onClick={onSpeak}>
              Speak
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Page() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hei. Kysy jotain tai ota kuva.",
    },
  ]);
  const [input, setInput] = useState("");
  const [imageBase64, setImageBase64] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [status, setStatus] = useState("Valmis");
  const listEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const cleaned = input.trim();
    if (!cleaned && !imageBase64) return;

    const userMessage = {
      role: "user",
      content: cleaned || "Mitä kuvassa näkyy?",
      imageBase64: imageBase64 || "",
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setImageBase64("");
    setLoading(true);
    setStatus("Ajattelen…");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: nextMessages,
      }),
    });

    const data = await res.json();

    let assistantText = "";
    if (data.error) {
      assistantText =
        "ERROR: " + JSON.stringify(data.error, null, 2).slice(0, 600);
      setStatus("Virhe");
    } else {
      assistantText = data.reply || "Ei vastausta.";
      setStatus("Valmis");
      if (autoSpeak) speakText(assistantText);
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: assistantText,
      },
    ]);

    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const quickPrompt = (text) => {
    setInput(text);
  };

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: "Hei. Kysy jotain tai ota kuva.",
      },
    ]);
    setInput("");
    setImageBase64("");
    setStatus("Valmis");
  };

  return (
    <main className="app">
      <div className="topGlow" />

      <header className="topBar">
        <div className="brand">
          <div className="brandDot" />
          <div>
            <div className="brandTitle">Halo AI</div>
            <div className="brandSub">
              <span className={`statusDot ${loading ? "busy" : "ready"}`} />
              {status}
            </div>
          </div>
        </div>

        <button className="ghostButton" onClick={clearChat}>
          Clear
        </button>
      </header>

      <section className="heroCard">
        <div className="heroLeft">
          <div className="heroEyebrow">Noa-style assistant</div>
          <div className="heroTitle">Puhu, kuvaa tai kysy.</div>
          <div className="heroText">
            Hiljainen käyttöliittymä, nopea vastaus, kuva mukana.
          </div>
        </div>

        <label className="switch">
          <input
            type="checkbox"
            checked={autoSpeak}
            onChange={(e) => setAutoSpeak(e.target.checked)}
          />
          <span className="slider" />
          <span className="switchLabel">Auto speak</span>
        </label>
      </section>

      <section className="chips">
        <button className="chip" onClick={() => quickPrompt("Kerro mitä näet.")}>
          Kerro mitä näet
        </button>
        <button className="chip" onClick={() => quickPrompt("Lue kaikki teksti kuvasta.")}>
          Lue teksti
        </button>
        <button className="chip" onClick={() => quickPrompt("Tiivistä tämä lyhyesti.")}>
          Tiivistä
        </button>
      </section>

      <section className="messages">
        {messages.map((m, i) => (
          <MessageBubble
            key={`${m.role}-${i}`}
            role={m.role}
            content={m.content}
            imageBase64={m.imageBase64}
            onCopy={async () => {
              try {
                await navigator.clipboard.writeText(m.content);
              } catch {}
            }}
            onSpeak={() => speakText(m.content)}
          />
        ))}

        {loading ? (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        <div ref={listEndRef} />
      </section>

      {imageBase64 ? (
        <section className="selectedImageCard">
          <img src={imageBase64} alt="Selected" className="selectedImage" />
          <button className="removeImage" onClick={() => setImageBase64("")}>
            Remove image
          </button>
        </section>
      ) : null}

      <footer className="composer">
        <button
          className="iconButton"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Lisää kuva"
        >
          ⊕
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const dataUrl = await fileToDataUrl(file);
            setImageBase64(dataUrl);
          }}
        />

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Mitä kuuluu?"
          className="input"
          rows={1}
        />

        <button className="sendButton" onClick={send} disabled={loading}>
          →
        </button>
      </footer>

      <style jsx>{`
        :global(html, body) {
          margin: 0;
          background: #050608;
          color: #f5f7fb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
            Arial, sans-serif;
        }

        :global(*) {
          box-sizing: border-box;
        }

        .app {
          min-height: 100svh;
          background:
            radial-gradient(circle at top, rgba(95, 88, 255, 0.24), transparent 30%),
            radial-gradient(circle at right, rgba(0, 225, 255, 0.12), transparent 25%),
            linear-gradient(180deg, #050608 0%, #0a0c11 100%);
          padding: 18px 16px 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .topGlow {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 50% 0%, rgba(120, 102, 255, 0.18), transparent 35%);
          filter: blur(12px);
        }

        .topBar {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brandDot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8f7dff, #4fe3ff);
          box-shadow: 0 0 18px rgba(111, 104, 255, 0.7);
        }

        .brandTitle {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }

        .brandSub {
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(245, 247, 251, 0.7);
          font-size: 12px;
          margin-top: 2px;
        }

        .statusDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #5ef08f;
        }

        .statusDot.busy {
          background: #ffd86b;
        }

        .ghostButton {
          position: relative;
          z-index: 1;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 14px;
        }

        .heroCard {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 18px;
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
        }

        .heroEyebrow {
          color: rgba(245, 247, 251, 0.6);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          margin-bottom: 8px;
        }

        .heroTitle {
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .heroText {
          color: rgba(245, 247, 251, 0.76);
          font-size: 14px;
          line-height: 1.45;
          max-width: 260px;
        }

        .switch {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          user-select: none;
          font-size: 13px;
          color: rgba(245, 247, 251, 0.8);
          margin-top: 4px;
        }

        .switch input {
          display: none;
        }

        .slider {
          width: 46px;
          height: 28px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
          position: relative;
          transition: 0.2s ease;
          flex: 0 0 auto;
        }

        .slider::after {
          content: "";
          position: absolute;
          width: 22px;
          height: 22px;
          top: 3px;
          left: 3px;
          border-radius: 50%;
          background: white;
          transition: 0.2s ease;
        }

        .switch input:checked + .slider {
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
        }

        .switch input:checked + .slider::after {
          transform: translateX(18px);
        }

        .chips {
          position: relative;
          z-index: 1;
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 2px;
        }

        .chip {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          border-radius: 999px;
          padding: 10px 14px;
          white-space: nowrap;
          font-size: 13px;
        }

        .messages {
          position: relative;
          z-index: 1;
          flex: 1;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 4px 0 10px;
        }

        .bubbleRow {
          display: flex;
          align-items: flex-end;
          gap: 10px;
        }

        .userRow {
          justify-content: flex-end;
        }

        .assistantRow {
          justify-content: flex-start;
        }

        .avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 700;
          flex: 0 0 auto;
        }

        .userAvatar {
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
          color: #020308;
        }

        .assistantAvatar {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .bubble {
          max-width: min(84%, 520px);
          padding: 14px 14px 12px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
          backdrop-filter: blur(18px);
        }

        .userBubble {
          background: linear-gradient(135deg, rgba(127, 115, 255, 0.25), rgba(79, 227, 255, 0.14));
          border-top-right-radius: 8px;
        }

        .assistantBubble {
          background: rgba(255, 255, 255, 0.06);
          border-top-left-radius: 8px;
        }

        .bubbleText {
          white-space: pre-wrap;
          line-height: 1.45;
          font-size: 15px;
          color: rgba(255, 255, 255, 0.96);
        }

        .bubbleActions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }

        .miniButton {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 12px;
        }

        .imagePreview {
          width: 100%;
          max-height: 220px;
          object-fit: cover;
          border-radius: 16px;
          margin-bottom: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .typing {
          display: inline-flex;
          gap: 6px;
          padding: 14px 16px;
          width: fit-content;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
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
          0%, 80%, 100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          40% {
            transform: translateY(-5px);
            opacity: 1;
          }
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

        .composer {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-end;
          gap: 10px;
          padding: 12px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(22px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.26);
        }

        .iconButton,
        .sendButton {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          border: none;
          display: grid;
          place-items: center;
          font-size: 18px;
          flex: 0 0 auto;
        }

        .iconButton {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .sendButton {
          background: linear-gradient(135deg, #7f73ff, #4fe3ff);
          color: #050608;
          font-weight: 900;
        }

        .sendButton:disabled {
          opacity: 0.6;
        }

        .input {
          flex: 1;
          resize: none;
          border: none;
          outline: none;
          min-height: 46px;
          max-height: 140px;
          padding: 13px 14px;
          border-radius: 18px;
          background: rgba(0, 0, 0, 0.22);
          color: #fff;
          font-size: 16px;
          line-height: 1.4;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .input::placeholder {
          color: rgba(255, 255, 255, 0.45);
        }
      `}</style>
    </main>
  );
}
