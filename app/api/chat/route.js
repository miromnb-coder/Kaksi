export async function POST(req) {
  const { text, imageBase64 } = await req.json();

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
          content: "Vastaa suomeksi lyhyesti ja selkeästi. Ole Noa-tyylinen.",
        },
        {
          role: "user",
          content: [
            { type: "text", text },
            {
              type: "image_url",
              image_url: { url: imageBase64 },
            },
          ],
        },
      ],
    }),
  });

  const data = await r.json();

  if (!r.ok) {
    return Response.json({ error: data }, { status: r.status });
  }

  return Response.json({
    reply: data?.choices?.[0]?.message?.content ?? "",
  });
}
