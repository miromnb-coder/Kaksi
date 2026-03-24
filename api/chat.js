export default async function handler(req, res) {
  try {
    const { message } = req.body;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
      model: "llama-3.1-8b-instant",
        messages: [
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();

    // 🔥 DEBUG
    console.log(data);

    if (!response.ok) {
      return res.status(500).json({ error: data });
    }

    res.status(200).json({
      reply: data.choices?.[0]?.message?.content || "Ei vastausta"
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
