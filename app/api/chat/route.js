export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "Olet Noa: nopea, rauhallinen ja ultra-minimalistinen AI-avustaja. Vastaat suomeksi. Pidät vastaukset lyhyinä, selkeinä ja käytännöllisinä. Jos käyttäjä lähettää kuvan, kerrot vain tärkeimmän ja luet kuvassa olevan tekstin.";

export async function POST(req) {
  try {
    const { messages = [], model } = await req.json();

    const groqMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => {
        if (m.role === "user" && m.imageBase64) {
          return {
            role: "user",
            content: [
              {
                type: "text",
                text: m.content?.trim() || "Mitä kuvassa näkyy?",
              },
              {
                type: "image_url",
                image_url: {
                  url: m.imageBase64,
                },
              },
            ],
          };
        }

        return {
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? ""),
        };
      }),
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages: groqMessages,
        temperature: 0.35,
        max_completion_tokens: 300,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json({ error: data }, { status: response.status });
    }

    return Response.json({
      reply: data?.choices?.[0]?.message?.content ?? "",
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
