export async function POST(req) {
  try {
    const { text, imageBase64 } = await req.json();

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "system",
            content: "Vastaa suomeksi lyhyesti ja selkeästi. Olet Noa-tyylinen avustaja.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: text || "Mitä kuvassa näkyy?" },
              imageBase64
                ? {
                    type: "image_url",
                    image_url: { url: imageBase64 },
                  }
                : null,
            ].filter(Boolean),
          },
        ],
        temperature: 0.3,
        max_completion_tokens: 300,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json({ error: data }, { status: response.status });
    }

    return Response.json({
      reply: data?.choices?.[0]?.message?.content ?? "Ei vastausta",
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
