import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ response: null, reason: 'no_api_key' })
  }

  let body: { message?: string; context?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { message, context } = body
  if (!message || typeof message !== 'string' || message.length > 2000) {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
  }

  const systemPrompt = `You are a helpful AI Copilot for a family history app called Family Graph.
You help users understand their family relationships, discover stories, and preserve memories.
${context ? `\nFamily context:\n${context}` : ''}
Keep responses concise, warm, and in a conversational tone. Use markdown for formatting when helpful.
If asked something unrelated to family/genealogy, gently redirect to family topics.`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API error:', geminiRes.status, errText)
      return NextResponse.json({ response: null, reason: 'api_error' })
    }

    const data = await geminiRes.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null
    return NextResponse.json({ response: text })
  } catch (err) {
    console.error('AI route error:', err)
    return NextResponse.json({ response: null, reason: 'fetch_error' })
  }
}
