export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message, imageBase64, history } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "GROQ_API_KEY puuttuu",
      });
    }

    const messages = [
      ...(history || []),
      {
        role: "user",
        content: [
          {
            type: "text",
            text: message || "Kerro mitä näet kuvassa.",
          },
          ...(imageBase64
            ? [
                {
                  type: "image_url",
                  image_url: {
                    url: imageBase64,
                  },
                },
              ]
            : []),
        ],
      },
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data });
    }

    const reply =
      data.choices?.[0]?.message?.content || "Ei vastausta.";

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "Unknown error",
    });
  }
}
