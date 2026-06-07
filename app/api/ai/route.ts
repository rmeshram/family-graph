import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeRelationLabel, findRelationshipPath } from '@/lib/relation-engine'
import type { FamilyMember } from '@/lib/types'

// ─── Compact member shape (no sensitive fields sent to Gemini) ────────────────
interface CompactMember {
  id: string
  name: string
  relationship?: string
  generation: number
  gender?: string
  birthYear?: number
  birthPlace?: string
  currentPlace?: string
  occupation?: string
  parentIds: string[]
  spouseIds: string[]
}

// ─── Gemini types ─────────────────────────────────────────────────────────────
interface GeminiPart {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}
interface GeminiContent { role: string; parts: GeminiPart[] }

// ─── Input sanitization ───────────────────────────────────────────────────────
function sanitize(s: unknown): string {
  if (typeof s !== 'string') return ''
  // Strip control characters and null bytes to prevent prompt injection
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 2000)
}

// ─── Fuzzy name match ─────────────────────────────────────────────────────────
function findMemberByName(name: string, members: CompactMember[]): CompactMember | undefined {
  const q = name.toLowerCase().trim()
  return (
    members.find(m => m.name.toLowerCase() === q) ??
    members.find(m => m.name.toLowerCase().includes(q)) ??
    members.find(m => q.includes(m.name.toLowerCase().split(' ')[0]))
  )
}

// ─── Tool resolvers (pure — no DB, use client-passed member list) ─────────────
function resolveGetRelationshipPath(
  args: Record<string, unknown>,
  members: CompactMember[],
  selfMember: CompactMember | null
): string {
  const nameA = sanitize(args.memberAName)
  const nameB = sanitize(args.memberBName)
  const memberA = findMemberByName(nameA, members)
  const memberB = findMemberByName(nameB, members)

  if (!memberA) return `Could not find a family member named "${nameA}".`
  if (!memberB) return `Could not find a family member named "${nameB}".`
  if (memberA.id === memberB.id) return `${memberA.name} is the same person.`

  // Cast compact members to FamilyMember for the engine (only graph fields are needed)
  const asFamilyMembers = members as unknown as FamilyMember[]
  const label = computeRelationLabel(memberA.id, memberB.id, asFamilyMembers)
  const path = findRelationshipPath(memberA.id, memberB.id, asFamilyMembers)

  if (!label || !path) {
    return `No relationship path found between ${memberA.name} and ${memberB.name} in the current family tree.`
  }

  const chain = path.map(m => m?.name ?? '?').filter(Boolean).join(' → ')
  const steps = path.length - 1

  // If one of the members is the logged-in user, give a viewer-relative answer
  if (selfMember && memberA.id === selfMember.id) {
    // "What is memberB to me?" → label is from memberA(self) → memberB
    return `${memberB.name} is your **${label}**. Path: ${chain} (${steps} step${steps !== 1 ? 's' : ''}).`
  }
  if (selfMember && memberB.id === selfMember.id) {
    // "What is memberA to me?" → compute reverse label (from self → memberA)
    const reverseLabel = computeRelationLabel(memberB.id, memberA.id, asFamilyMembers)
    return `${memberA.name} is your **${reverseLabel ?? label}**. Path: ${chain} (${steps} step${steps !== 1 ? 's' : ''}).`
  }

  // Third-party relationship (neither is self)
  return `${memberA.name} is ${memberB.name}'s **${label}**. Path: ${chain} (${steps} step${steps !== 1 ? 's' : ''}).`
}

function resolveGetNodeDetails(
  args: Record<string, unknown>,
  members: CompactMember[]
): string {
  const name = sanitize(args.memberName)
  const m = findMemberByName(name, members)
  if (!m) return `Could not find a family member named "${name}".`

  const parts: string[] = [`**${m.name}**`]
  if (m.relationship) parts.push(`Relationship: ${m.relationship}`)
  if (m.generation !== undefined) parts.push(`Generation: ${m.generation}`)
  if (m.gender) parts.push(`Gender: ${m.gender}`)
  if (m.birthYear) parts.push(`Born: ${m.birthYear}`)
  if (m.birthPlace) parts.push(`Birthplace: ${m.birthPlace}`)
  if (m.currentPlace) parts.push(`Current city: ${m.currentPlace}`)
  if (m.occupation) parts.push(`Occupation: ${m.occupation}`)
  const childCount = members.filter(x => x.parentIds.includes(m.id)).length
  if (childCount > 0) parts.push(`Children in tree: ${childCount}`)
  return parts.join(' | ')
}

function resolveSearchFamilyNodes(
  args: Record<string, unknown>,
  members: CompactMember[]
): string {
  const query = sanitize(args.query).toLowerCase()
  if (!query) return 'No search query provided.'

  const results = members.filter(m =>
    m.name.toLowerCase().includes(query) ||
    (m.relationship ?? '').toLowerCase().includes(query) ||
    (m.birthPlace ?? '').toLowerCase().includes(query) ||
    (m.currentPlace ?? '').toLowerCase().includes(query) ||
    (m.occupation ?? '').toLowerCase().includes(query)
  ).slice(0, 5)

  if (results.length === 0) return `No family members found matching "${query}".`
  return results.map(m =>
    `${m.name} (${m.relationship ?? 'member'}, gen ${m.generation}${m.currentPlace ? `, ${m.currentPlace}` : ''})`
  ).join('\n')
}

// ─── Tool declarations ────────────────────────────────────────────────────────
const TOOL_DECLARATIONS = [
  {
    name: 'getRelationshipPath',
    description: 'Find how two family members are related to each other. Use this when the user asks about relationships like "how is X related to Y" or "what is my relation to Z". Returns the relationship label and the path through the family tree.',
    parameters: {
      type: 'OBJECT',
      properties: {
        memberAName: { type: 'STRING', description: 'Full or partial name of the first person.' },
        memberBName: { type: 'STRING', description: 'Full or partial name of the second person.' },
      },
      required: ['memberAName', 'memberBName'],
    },
  },
  {
    name: 'getNodeDetails',
    description: 'Retrieve profile details about a specific family member by name. Use when user asks about a specific person (birth year, city, occupation, relationship, etc.).',
    parameters: {
      type: 'OBJECT',
      properties: {
        memberName: { type: 'STRING', description: 'Full or partial name of the family member.' },
      },
      required: ['memberName'],
    },
  },
  {
    name: 'searchFamilyNodes',
    description: 'Search family members by name, city, occupation, or relationship type. Use for queries like "who lives in Mumbai" or "who is a doctor" or "show all uncles".',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search term — name, city, occupation, or relationship.' },
      },
      required: ['query'],
    },
  },
]

// ─── Gemini fetch with retry (handles 503 / 429 transient errors) ─────────────
// Model fallback chain: gemini-2.0-flash → gemini-1.5-flash
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash']

async function geminiPost(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    for (let attempt = 0; attempt < 2; attempt++) {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 18000) // 18 s hard cap per attempt
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        })
        clearTimeout(timer)
        // Success or non-retriable error — return immediately
        if (res.ok || (res.status !== 503 && res.status !== 429)) return res
        // 503/429 — short wait then retry once more
        if (attempt < 1) await new Promise(r => setTimeout(r, 500))
      } catch {
        clearTimeout(timer)
      }
    }
  }
  // All models exhausted — return last response (caller handles non-ok)
  const lastUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[GEMINI_MODELS.length - 1]}:generateContent?key=${apiKey}`
  return fetch(lastUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

// ─── Gemini streaming: pipes tokens into a ReadableStream controller ──────────
async function geminiStreamToController(
  apiKey: string,
  body: Record<string, unknown>,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<void> {
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 20000)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      })
      clearTimeout(timer)
      if (!res.ok || !res.body) continue

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()!
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') return
          try {
            const chunk = JSON.parse(raw)
            const parts = chunk?.candidates?.[0]?.content?.parts as Array<{ text?: string }> | undefined
            const text = parts?.find(p => p.text)?.text
            if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text })}\n\n`))
          } catch { /* skip malformed chunk */ }
        }
      }
      return // streamed successfully
    } catch {
      clearTimeout(timer)
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY

  // ── Auth (optional) — get user if logged in; allow demo/unauthenticated ──────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // We do NOT block unauthenticated users — demo mode should still reach Gemini.
  // Family member data is sent by the client (already RLS-enforced at fetch time).

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: {
    messages?: { role: string; content: string }[]
    members?: CompactMember[]
    familySummary?: string
    selfMemberId?: string | null
    // Legacy single-turn support
    message?: string
    context?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── No API key → signal graceful degradation ───────────────────────────────
  if (!apiKey) {
    return NextResponse.json({ response: null, reason: 'no_api_key' })
  }

  // ── Normalize to multi-turn format ─────────────────────────────────────────
  let rawMessages = body.messages ?? []
  if (rawMessages.length === 0 && body.message) {
    rawMessages = [{ role: 'user', content: body.message }]
  }
  if (rawMessages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  // ── Sanitize & cap history (last 10 turns = 20 messages) ──────────────────
  const cappedMessages = rawMessages.slice(-20).map(m => ({
    role: m.role === 'model' ? 'model' : 'user',
    content: sanitize(m.content),
  })).filter(m => m.content.length > 0)

  // ── Sanitize member list (strip any extra fields) ──────────────────────────
  const rawMembers: CompactMember[] = (body.members ?? []).slice(0, 500).map(m => ({
    id: String(m.id ?? ''),
    name: sanitize(m.name),
    relationship: m.relationship ? sanitize(m.relationship) : undefined,
    generation: Number(m.generation) || 0,
    gender: m.gender ? sanitize(m.gender) : undefined,
    birthYear: typeof m.birthYear === 'number' ? m.birthYear : undefined,
    birthPlace: m.birthPlace ? sanitize(m.birthPlace) : undefined,
    currentPlace: m.currentPlace ? sanitize(m.currentPlace) : undefined,
    occupation: m.occupation ? sanitize(m.occupation) : undefined,
    parentIds: Array.isArray(m.parentIds) ? m.parentIds.map(String) : [],
    spouseIds: Array.isArray(m.spouseIds) ? m.spouseIds.map(String) : [],
  }))

  // ── Identify self member (the logged-in user's node in the tree) ───────────
  const selfMemberId = body.selfMemberId ? sanitize(body.selfMemberId) : null
  const selfMember = selfMemberId ? rawMembers.find(m => m.id === selfMemberId) : null

  // ── Build system prompt ────────────────────────────────────────────────────
  const memberCount = rawMembers.length
  const genCount = new Set(rawMembers.map(m => m.generation)).size
  const alive = rawMembers.filter(m => m.generation !== undefined).length

  // Rich member list: name, relationship, generation, city, occupation, birth year
  const memberList = rawMembers.slice(0, 80).map(m => {
    const parts = [`${m.name}`]
    if (m.relationship) parts.push(m.relationship)
    parts.push(`gen ${m.generation}`)
    if (m.birthYear) parts.push(`b.${m.birthYear}`)
    if (m.currentPlace || m.birthPlace) parts.push(m.currentPlace ?? m.birthPlace ?? '')
    if (m.occupation) parts.push(m.occupation)
    return parts.join(', ')
  }).join('\n')

  const userName = selfMember?.name ?? user?.email?.split('@')[0] ?? 'the user'

  const systemPrompt = `You are Copilot — an intelligent, warm AI assistant built into Family Graph, a family history and genealogy platform. You speak like a knowledgeable family historian who personally knows everyone in the tree.

You are talking to: ${userName}${selfMember ? ` (their node in the family tree is "${selfMember.name}", ID: ${selfMember.id})` : ''}

Family overview:
- ${memberCount} members recorded across ${genCount} generation(s)

Family roster:
${memberList}${memberCount > 80 ? `\n...and ${memberCount - 80} more members` : ''}

TOOL USAGE (mandatory for factual queries):
- ALWAYS use getRelationshipPath when asked how two people are related — never guess
- ALWAYS use getNodeDetails when asked about a specific person's birth year, city, occupation, etc.
- ALWAYS use searchFamilyNodes when asked to find members by city, occupation, or relationship type
- After getting tool results, explain them warmly and naturally — not just raw data

PERSONALITY:
- Warm, thoughtful, like a wise elder who knows the family deeply
- Give rich, engaging answers — not one-liners
- When you find a relationship, add a cultural or emotional observation (e.g., "That makes Suresh your Mama — your mother's brother. In Indian culture, the Mama relationship is especially cherished!")
- You can answer ANY question the user asks — not just family topics
- If the user writes in Hindi, Hinglish, or any other language — respond in the same language
- For general questions (history, culture, advice, etc.), answer thoroughly and helpfully
- Never say "I can only answer family questions"

FAMILY QUERY HANDLING:
- "Who is X" → use getNodeDetails
- "How is X related to Y" / "What is X to me" / "Who is X to me" → use getRelationshipPath. When the user says "me"/"I"/"my", always use "${selfMember?.name ?? userName}" as one of the members.
- "Who lives in [city]" / "Who is a [occupation]" → use searchFamilyNodes
- "Show my [relative type]" → use searchFamilyNodes with the relationship type
- Family tree summary → use the roster above, no tool needed
- General stats → use the roster above, no tool needed

IMPORTANT: Never hallucinate or invent facts about family members. If something isn't in the tools or roster, say so honestly and helpfully.`

  // ── Build Gemini contents array ────────────────────────────────────────────
  const geminiContents: GeminiContent[] = cappedMessages.map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }))

  console.log(`[AI_REQUEST] user=${user?.id ?? 'demo'} turns=${cappedMessages.length} members=${memberCount}`)

  try {
    // ── Pass 1: Send to Gemini with function declarations ──────────────────
    const pass1Body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: geminiContents,
      tools: [{ function_declarations: TOOL_DECLARATIONS }],
      tool_config: { function_calling_config: { mode: 'AUTO' } },
      generationConfig: { maxOutputTokens: 1024, temperature: 0.6 },
    }

    const pass1Res = await geminiPost(apiKey, pass1Body)

    if (!pass1Res.ok) {
      const errText = await pass1Res.text()
      console.error('[AI_ERROR] Gemini pass1 error:', pass1Res.status, errText.slice(0, 200))
      return NextResponse.json({ response: null, reason: 'api_error' })
    }

    const pass1Data = await pass1Res.json()
    const candidate = pass1Data?.candidates?.[0]
    const parts: GeminiPart[] = candidate?.content?.parts ?? []

    // ── Check for function call ────────────────────────────────────────────
    const funcCallPart = parts.find(p => p.functionCall)
    if (funcCallPart?.functionCall) {
      const { name, args } = funcCallPart.functionCall
      console.log(`[AI_TOOL] tool=${name} args=${JSON.stringify(args).slice(0, 200)} user=${user?.id ?? 'demo'}`)

      // ── Resolve the tool (pure, instant) ──────────────────────────────
      let toolResult: string
      if (name === 'getRelationshipPath') {
        toolResult = resolveGetRelationshipPath(args, rawMembers, selfMember ?? null)
      } else if (name === 'getNodeDetails') {
        toolResult = resolveGetNodeDetails(args, rawMembers)
      } else if (name === 'searchFamilyNodes') {
        toolResult = resolveSearchFamilyNodes(args, rawMembers)
      } else {
        toolResult = 'Tool not found.'
      }

      // ── Build pass 2 body ──────────────────────────────────────────────
      const pass2Contents: GeminiContent[] = [
        ...geminiContents,
        candidate.content as GeminiContent,
        { role: 'user', parts: [{ functionResponse: { name, response: { result: toolResult } } }] },
      ]
      const pass2Body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: pass2Contents,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.6 },
      }

      // ── Stream pass 2 — user sees tokens as they arrive ───────────────
      const displayArgs: Record<string, string> = {}
      for (const [k, v] of Object.entries(args)) displayArgs[k] = String(v)
      const toolCallInfo = { toolName: name, args: displayArgs, result: toolResult }

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          // Emit the tool call badge data first so the client can show it
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool', toolCallInfo })}\n\n`))
          // Stream the natural-language response
          await geminiStreamToController(apiKey, pass2Body, controller, encoder)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }

    // ── No tool call — direct text response (already have full text) ──────
    const text = parts.find(p => p.text)?.text ?? null
    if (!text) return NextResponse.json({ response: null, reason: 'empty_response' })

    // Return as SSE so the client can use the same streaming handler
    const encoder = new TextEncoder()
    return new Response(
      encoder.encode(`data: ${JSON.stringify({ type: 'token', text })}\n\ndata: ${JSON.stringify({ type: 'done' })}\n\n`),
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } },
    )
  } catch (err) {
    console.error('[AI_ERROR] Route error:', err)
    return NextResponse.json({ response: null, reason: 'fetch_error' })
  }
}
