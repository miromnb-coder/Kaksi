"use client";

import { useState } from "react";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Page() {
  const [text, setText] = useState("Mitä kuvassa näkyy?");
  const [imageBase64, setImageBase64] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setReply("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, imageBase64 }),
    });

    const data = await res.json();

    if (data.error) {
      setReply("ERROR: " + JSON.stringify(data.error));
    } else {
      setReply(data.reply || "");
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(data.reply || "");
      u.lang = "fi-FI";
      speechSynthesis.speak(u);
    }

    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>Halo AI</div>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Kysy jotain..."
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 16,
          border: "1px solid #ddd",
          fontSize: 18,
          marginBottom: 12,
        }}
      />

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const dataUrl = await fileToDataUrl(file);
          setImageBase64(dataUrl);
        }}
        style={{ width: "100%", marginBottom: 12 }}
      />

      <button
        onClick={send}
        disabled={loading}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 16,
          border: 0,
          background: "#111",
          color: "#fff",
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {loading ? "Ajatellaan..." : "Kysy AI:lta"}
      </button>

      <div
        style={{
          marginTop: 20,
          padding: 16,
          minHeight: 120,
          borderRadius: 20,
          background: "#f6f6f6",
          whiteSpace: "pre-wrap",
          fontSize: 18,
        }}
      >
        {reply || "Vastaus näkyy tässä."}
      </div>
    </main>
  );
}
