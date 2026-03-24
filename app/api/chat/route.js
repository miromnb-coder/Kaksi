export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "Olet Noa: nopea, rauhallinen ja ultra-minimalistinen AI-avustaja. Vastaat suomeksi. Pidät vastaukset lyhyinä, selkeinä ja käytännöllisinä. Älä selitä liikaa. Jos käyttäjä lähettää kuvan, kerro vain tärkein havainto ja lue kuvassa oleva teksti.";

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-10)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? m.text ?? "").trim(),
    }))
    .filter((m) => m.content.length > 0);
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const message = String(body.message || "").trim();
    const imageBase64 = String(body.imageBase64 || "").trim();
    const history = normalizeHistory(body.history);

    if (!message && !imageBase64) {
      return Response.json({ error: "Missing message" }, { status: 400 });
    }

    if (imageBase64) {
      if (!process.env.OPENAI_API_KEY) {
        return Response.json(
          { error: "Missing OPENAI_API_KEY for image analysis" },
          { status: 500 }
        );
      }

      const imageUrl = imageBase64.startsWith("data:")
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        {
          role: "user",
          content: [
            {
              type: "text",
              text: message || "Kerro mitä näet kuvassa lyhyesti.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          messages,
          temperature: 0.25,
          max_tokens: 280,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return Response.json({ error: data }, { status: response.status });
      }

      return Response.json({
        reply: data?.choices?.[0]?.message?.content || "Ei vastausta",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return Response.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
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
        max_tokens: 250,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json({ error: data }, { status: response.status });
    }

    return Response.json({
      reply: data?.choices?.[0]?.message?.content || "Ei vastausta",
    });
  } catch (err) {
    return Response.json(
      { error: err.message || String(err) },
      { status: 500 }
    );
  }
}
