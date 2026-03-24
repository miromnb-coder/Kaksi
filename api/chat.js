export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const message = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY" });
    }

    const systemPrompt =
      "Olet Noa: nopea, rauhallinen ja ultra-minimalistinen AI-avustaja. Vastaat suomeksi. Pidät vastaukset lyhyinä, selkeinä ja käytännöllisinä. Älä selitä liikaa. Jos käyttäjä pyytää kuva-analyysiä, kerro vain tärkein havainto ja lue kuvassa oleva teksti.";

    const messages = [
      { role: "system", content: systemPrompt },
      ...history
        .slice(-10)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? m.text ?? ""),
        }))
        .filter((m) => m.content.trim().length > 0),
      { role: "user", content: message },
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages,
        temperature: 0.35,
        max_completion_tokens: 250,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json({
      reply: data?.choices?.[0]?.message?.content || "Ei vastausta",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
