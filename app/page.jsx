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
  const [text, setText] = useState("");
  const [imageBase64, setImageBase64] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setReply("");

    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, imageBase64 }),
    });

    const data = await r.json();
    setReply(data.reply || JSON.stringify(data.error || {}));
    setLoading(false);
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, marginBottom: 20 }}>Halo AI</h1>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Kysy jotain..."
        style={{ width: "100%", padding: 14, fontSize: 18, marginBottom: 12 }}
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
        style={{ marginBottom: 12 }}
      />

      <button onClick={send} disabled={loading} style={{ padding: 14, width: "100%" }}>
        {loading ? "Ajatellaan..." : "Kysy AI:lta"}
      </button>

      <p style={{ marginTop: 20, fontSize: 18, whiteSpace: "pre-wrap" }}>{reply}</p>
    </main>
  );
}
