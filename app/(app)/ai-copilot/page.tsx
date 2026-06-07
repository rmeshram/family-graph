"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { FamilyMember, AIMessage, AIToolCallInfo } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import { DemoBanner } from "@/components/demo-banner"
import {
  ArrowLeft,
  Send,
  Sparkles,
  Users,
  Search,
  BookOpen,
  GitBranch,
  MessageSquare,
  Zap,
  ChevronRight,
  Mic,
  RotateCcw,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Bot,
  User,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  Wrench,
} from "lucide-react"
import { cn, copyToClipboard } from "@/lib/utils"

// ─── Relationship Engine ─────────────────────────────────────────────────────

function findRelationshipPath(
  fromId: string,
  toId: string,
  members: FamilyMember[]
): { path: FamilyMember[]; description: string } | null {
  if (fromId === toId) return { path: [], description: "That's you!" }

  const memberMap = new Map(members.map(m => [m.id, m]))
  const visited = new Set<string>()
  const queue: { id: string; path: string[]; rel: string[] }[] = [
    { id: fromId, path: [fromId], rel: [] }
  ]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current.id)) continue
    visited.add(current.id)

    if (current.id === toId) {
      const pathMembers = current.path.map(id => memberMap.get(id)!).filter(Boolean)
      return {
        path: pathMembers,
        description: current.rel.join(" → ") || "directly connected",
      }
    }

    const member = memberMap.get(current.id)
    if (!member) continue

    // Add parents
    for (const parentId of member.parentIds) {
      if (!visited.has(parentId)) {
        const parent = memberMap.get(parentId)
        queue.push({
          id: parentId,
          path: [...current.path, parentId],
          rel: [...current.rel, `parent (${parent?.name})`],
        })
      }
    }

    // Add spouses
    for (const spouseId of member.spouseIds) {
      if (!visited.has(spouseId)) {
        const spouse = memberMap.get(spouseId)
        queue.push({
          id: spouseId,
          path: [...current.path, spouseId],
          rel: [...current.rel, `spouse (${spouse?.name})`],
        })
      }
    }

    // Add children
    for (const m of members) {
      if (m.parentIds.includes(current.id) && !visited.has(m.id)) {
        queue.push({
          id: m.id,
          path: [...current.path, m.id],
          rel: [...current.rel, `child (${m.name})`],
        })
      }
    }
  }

  return null
}

// ─── AI Response Engine ───────────────────────────────────────────────────────

function generateAIResponse(query: string, members: FamilyMember[]): { content: string; relatedIds: string[] } {
  const q = query.toLowerCase()
  const self = members.find(m => m.relationship === 'self') || members[0]

  // Relationship queries
  const relMatch = q.match(/how (?:am i|are we) related to (.+?)(?:\?|$)/i) ||
    q.match(/who is (.+?) to me/i) ||
    q.match(/relation(?:ship)? (?:with|between me and) (.+)/i)

  if (relMatch) {
    const targetName = relMatch[1].trim()
    const target = members.find(m =>
      m.name.toLowerCase().includes(targetName.toLowerCase())
    )
    if (target && self) {
      const result = findRelationshipPath(self.id, target.id, members)
      if (result) {
        return {
          content: `🔗 **Relationship with ${target.name}:**\n\n${target.name} is your **${target.relationship || 'family member'}**.\n\n**Connection path:** ${result.description}\n\n**Gotra:** ${target.gotra || 'Not specified'} | **Generation:** ${target.generation - (self.generation) >= 0 ? '+' : ''}${target.generation - self.generation} from you`,
          relatedIds: result.path.map(m => m.id),
        }
      }
    }
    return {
      content: `I couldn't find "${targetName}" in the family tree. Try searching by their first name. Members I know: ${members.map(m => m.name.split(' ')[0]).slice(0, 8).join(', ')}...`,
      relatedIds: [],
    }
  }

  // Who is maternal uncle
  if (q.includes('maternal uncle') || q.includes('mama') || q.includes('mamu')) {
    const maternalUncles = members.filter(m => m.relationship === 'uncle' && m.side === 'maternal')
    if (maternalUncles.length > 0) {
      return {
        content: `🌳 **Your Maternal Uncle(s):**\n\n${maternalUncles.map(m => `• **${m.name}** — ${m.occupation || ''}, lives in ${m.currentPlace || m.birthPlace}`).join('\n')}`,
        relatedIds: maternalUncles.map(m => m.id),
      }
    }
  }

  // Who is paternal uncle
  if (q.includes('paternal uncle') || q.includes('chacha') || q.includes('tau')) {
    const paternalUncles = members.filter(m => m.relationship === 'uncle' && m.side === 'paternal')
    if (paternalUncles.length > 0) {
      return {
        content: `🌳 **Your Paternal Uncle(s):**\n\n${paternalUncles.map(m => `• **${m.name}** — ${m.occupation || ''}, lives in ${m.currentPlace || m.birthPlace}`).join('\n')}`,
        relatedIds: paternalUncles.map(m => m.id),
      }
    }
  }

  // Show maternal side
  if (q.includes('maternal side') || q.includes('nana') || q.includes('nani') || q.includes('mother side')) {
    const maternalMembers = members.filter(m => m.side === 'maternal' || m.side === 'both')
    return {
      content: `🌿 **Maternal Side of Your Family (${maternalMembers.length} members):**\n\n${maternalMembers.map(m => `• **${m.name}** (${m.relationship}) — ${m.currentPlace || m.birthPlace || 'location unknown'}`).join('\n')}${maternalMembers[0]?.gotra ? `\n\n**Gotra:** ${maternalMembers[0].gotra}` : ''}`,
      relatedIds: maternalMembers.map(m => m.id),
    }
  }

  // Show paternal side
  if (q.includes('paternal side') || q.includes('dada') || q.includes('dadi') || q.includes('father side')) {
    const paternalMembers = members.filter(m => m.side === 'paternal' || m.side === 'both')
    return {
      content: `🌳 **Paternal Side of Your Family (${paternalMembers.length} members):**\n\n${paternalMembers.map(m => `• **${m.name}** (${m.relationship}) — ${m.currentPlace || m.birthPlace || 'location unknown'}`).join('\n')}${paternalMembers[0]?.gotra ? `\n\n**Gotra:** ${paternalMembers[0].gotra}` : ''}`,
      relatedIds: paternalMembers.map(m => m.id),
    }
  }

  // Generation queries
  const genMatch = q.match(/generation (\d+)|gen (\d+)/)
  if (genMatch) {
    const gen = parseInt(genMatch[1] || genMatch[2])
    const genMembers = members.filter(m => m.generation === gen)
    return {
      content: `👨‍👩‍👧‍👦 **Generation ${gen} (${genMembers.length} members):**\n\n${genMembers.map(m => `• **${m.name}** — ${m.occupation || 'Occupation not listed'}`).join('\n')}`,
      relatedIds: genMembers.map(m => m.id),
    }
  }

  // Tell family history / story generation
  if (q.includes('family history') || q.includes('tell me about') || q.includes('our story') || q.includes('history')) {
    const oldest = members.reduce((o, m) => (!o || (m.birthYear && m.birthYear < (o.birthYear || 9999))) ? m : o, members[0])
    return {
      content: `📖 **Your Family Story**\n\nYour family's recorded history spans **${new Date().getFullYear() - (oldest.birthYear || 2000)} years**, from ${oldest.birthYear} to today.\n\n**The Beginning:** ${oldest.name} was born in ${oldest.birthPlace ?? 'unknown'} in ${oldest.birthYear}. ${oldest.bio?.split('.')[0] ?? 'A founding member of your tree'}.\n\n**The Family:** Your tree spans **${new Set(members.map(m => m.generation)).size} generations**, **${members.length} members**, across ${[...new Set(members.flatMap(m => [m.currentPlace?.split(',')[0]]).filter(Boolean))].length} cities. 🌳\n\n*Ask me about specific members, places, or relationships to learn more.*`,
      relatedIds: members.slice(0, 4).map(m => m.id),
    }
  }

  // Memory prompt / record story
  if (q.includes('help me record') || q.includes('record:')) {
    const promptText = query.replace(/help me record:?\s*/i, '').trim()
    return {
      content: `🎙️ **Memory Capture Guide**\n\n*"${promptText}"*\n\n**How to capture this story:**\n\n1. **Set the scene** — Sit with them in a comfortable, quiet place. Turn on the recorder in **Memory Vault → Voice Notes**.\n\n2. **Starter questions:**\n   • "Can you tell me about that time...?"\n   • "What do you remember most vividly?"\n   • "How old were you when this happened?"\n   • "Who else was there with you?"\n\n3. **Let them speak** — Don't interrupt. Let silences breathe.\n\n4. **After recording** — Add it to Memory Vault. The AI will auto-transcribe and tag the members mentioned.\n\n*Tip: Even 5 minutes of audio is precious. Future generations will treasure it.*`,
      relatedIds: [],
    }
  }

  // Add member queries
  const addMatch = q.match(/add (?:my )?(.+?) (?:named? )?(.+)/i)
  if (addMatch) {
    return {
      content: `✅ **Adding New Member**\n\nI can help you add a new family member! Here's what I'll need:\n\n• **Name:** ${addMatch[2] || '?'}\n• **Relationship:** ${addMatch[1] || '?'}\n• **Birth Year:** (optional)\n• **City:** (optional)\n\nPlease use the **"Add Member"** button in the tree view to add them with full details, or tell me more:\n\n*"Add my uncle Ramesh, born 1965, lives in Delhi"*`,
      relatedIds: [],
    }
  }

  // Oldest member
  if (q.includes('oldest') || q.includes('eldest') || q.includes('senior')) {
    const sorted = [...members].filter(m => m.birthYear).sort((a, b) => (a.birthYear || 0) - (b.birthYear || 0))
    const oldest = sorted[0]
    if (!oldest) return { content: 'No birth year data found for any member yet.', relatedIds: [] }
    return {
      content: `👴 **Oldest Family Member:**\n\n**${oldest.name}** — Born in ${oldest.birthYear}${oldest.birthPlace ? ` in ${oldest.birthPlace}` : ''}\n\n${oldest.bio ?? ''}${oldest.gotra ? `\n\n*Gotra: ${oldest.gotra}*` : ''} | Status: ${oldest.isAlive !== false ? '🟢 Alive' : '⚪ Deceased'}`,
      relatedIds: [oldest.id],
    }
  }

  // Count / stats
  if (q.includes('how many') || q.includes('total') || q.includes('count') || q.includes('size')) {
    const alive = members.filter(m => m.isAlive !== false).length
    const gen = new Set(members.map(m => m.generation)).size
    const cities = new Set(members.map(m => m.currentPlace || m.birthPlace)).size
    const gens = [...new Set(members.map(m => m.generation))].sort((a, b) => a - b)
    return {
      content: `📊 **Family Statistics:**\n\n• **Total Members:** ${members.length}\n• **Living Members:** ${alive}\n• **Generations:** ${gen}\n• **Cities:** ${cities}\n\n**Members by Generation:**\n${gens.map(g => `  Gen ${g}: ${members.filter(m => m.generation === g).length} members`).join('\n')}`,
      relatedIds: [],
    }
  }

  // Search queries
  if (q.includes('who lives in') || q.includes('members in') || q.includes('family in')) {
    const cityMatch = q.match(/(?:who lives in|members in|family in) (.+?)(?:\?|$)/i)
    if (cityMatch) {
      const city = cityMatch[1].trim()
      const cityMembers = members.filter(m =>
        (m.currentPlace || m.birthPlace || '').toLowerCase().includes(city.toLowerCase())
      )
      if (cityMembers.length > 0) {
        return {
          content: `📍 **Family Members in ${city}:**\n\n${cityMembers.map(m => `• **${m.name}** — ${m.occupation || 'Occupation not listed'}`).join('\n')}`,
          relatedIds: cityMembers.map(m => m.id),
        }
      }
    }
  }

  // Default response with suggestions
  return {
    content: `🤖 I'm your **Family AI Copilot**! I can help you:\n\n• **Explore relationships:** "How am I related to [name]?"\n• **Find family members:** "Who lives in [city]?"\n• **Discover lineage:** "Show me the maternal side"\n• **Generate stories:** "Tell me our family history"\n• **Get stats:** "How many members do we have?"\n• **Find elders:** "Who is the oldest member?"\n\nWhat would you like to know? 🌳`,
    relatedIds: [],
  }
}

// ─── Compact member mapper (strips sensitive fields before sending to API) ──────
// Members with showAsAnonymous=true are excluded entirely — their real name
// must not be revealed to the AI (and by extension, potentially to the user).

function toCompactMember(m: FamilyMember) {
  // Do not include anonymous members — the AI receives their real name and
  // could inadvertently reveal it in responses.
  if (m.showAsAnonymous) return null
  return {
    id: m.id,
    name: m.name,
    relationship: m.relationship,
    generation: m.generation,
    gender: m.gender,
    birthYear: m.birthYear,
    birthPlace: m.birthPlace,
    currentPlace: m.currentPlace,
    occupation: m.occupation,
    parentIds: m.parentIds,
    spouseIds: m.spouseIds,
  }
}

// ─── Suggestion Chips ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: GitBranch, label: "How am I related to [member]?", color: "text-violet-400" },
  { icon: Users, label: "Show me maternal side", color: "text-green-400" },
  { icon: Search, label: "Who lives in [city]?", color: "text-blue-400" },
  { icon: BookOpen, label: "Tell me our family history", color: "text-amber-400" },
  { icon: Zap, label: "How many members do we have?", color: "text-pink-400" },
  { icon: MessageSquare, label: "Who is the oldest member?", color: "text-cyan-400" },
]

// ─── Memory Prompts ───────────────────────────────────────────────────────────

const MEMORY_PROMPTS = [
  { prompt: "Ask the oldest member about their childhood home", target: "Elders", icon: "🏡" },
  { prompt: "Record a family recipe before it's lost forever", target: "Family", icon: "🍲" },
  { prompt: "Ask grandparents about stories from their youth", target: "Grandparents", icon: "📜" },
  { prompt: "Capture a family milestone or achievement story", target: "Family", icon: "🏅" },
  { prompt: "Ask about the last big family gathering", target: "Whole family", icon: "👨‍👩‍👧‍👦" },
  { prompt: "Record the story of how your family came to live where they do", target: "Family", icon: "🗺️" },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AICopilotPage() {
  const { familyId, user, profile, loading: authLoading } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const isDemoMode = !authLoading && !user
  const members = isDemoMode ? sampleFamilyMembers : (familyId && !loading ? dbMembers : [])

  // Conversation history sent to Gemini (role: 'user' | 'model')
  const [conversationHistory, setConversationHistory] = useState<{ role: string; content: string }[]>([])
  // Last user query — used for retry
  const lastUserQuery = useRef<string>('')

  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      role: 'ai',
      content: `🙏 **Namaste! I'm your Family AI Copilot.**\n\nAsk me anything in plain language:\n• "How am I related to Karan?"\n• "Show all members in Bengaluru"\n• "Tell me Dada's story"\n• "Who is my maternal uncle?"\n\nI speak your family's language. 🌳`,
      timestamp: new Date().toISOString(),
    }
  ])

  // Update welcome message count once members finish loading
  useEffect(() => {
    if (members.length > 0) {
      setMessages(prev => prev.map(m =>
        m.id === 'welcome'
          ? { ...m, content: `🙏 **Namaste! I'm your Family AI Copilot.**\n\nI know your entire family tree — **${members.length} members** loaded.\n\nAsk me anything in plain language:\n• "How am I related to Karan?"\n• "Show all members in Bengaluru"\n• "Tell me Dada's story"\n• "Who is my maternal uncle?"\n\nI speak your family's language. 🌳` }
          : m
      ))
    }
  }, [members.length])
  const [inputValue, setInputValue] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [thinkingStatus, setThinkingStatus] = useState('Thinking about your family...')
  // Track which AI messages should animate (streaming feel)
  const [newMsgIds, setNewMsgIds] = useState<Set<string>>(new Set())
  // 'gemini' | 'local' | null (null = not yet tried)
  const [aiMode, setAiMode] = useState<'gemini' | 'local' | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = useCallback(async (query: string) => {
    if (!query.trim() || isThinking) return

    lastUserQuery.current = query

    const userMsg: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsThinking(true)
    setThinkingStatus('Thinking about your family...')

    // Build new history with this user turn appended
    const updatedHistory = [...conversationHistory, { role: 'user', content: query }]

    let aiContent = ''
    let relatedIds: string[] = []
    let toolCallInfo: AIToolCallInfo | undefined
    let isError = false

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedHistory,
          members: members.map(toCompactMember).filter(Boolean),
          selfMemberId: members.find(m => m.claimedByUserId === user?.id)?.id ?? null,
        }),
      })

      const contentType = res.headers.get('Content-Type') ?? ''

      if (contentType.includes('text/event-stream') && res.body) {
        // ── SSE streaming path — show message immediately, fill tokens in real-time ──
        const aiMsgId = (Date.now() + 1).toString()
        setMessages(prev => [...prev, {
          id: aiMsgId, role: 'ai', content: '', timestamp: new Date().toISOString(), isStreaming: true,
        }])
        setIsThinking(false)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulated = ''
        let streamedToolCallInfo: AIToolCallInfo | undefined
        let streamSuccess = false

        readLoop: while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop()!
          for (const chunk of chunks) {
            if (!chunk.startsWith('data: ')) continue
            try {
              const event = JSON.parse(chunk.slice(6))
              if (event.type === 'tool') {
                streamedToolCallInfo = event.toolCallInfo as AIToolCallInfo
                setThinkingStatus('Looking up relationship...')
              } else if (event.type === 'token') {
                accumulated += event.text
                setMessages(prev => prev.map(m =>
                  m.id === aiMsgId ? { ...m, content: accumulated } : m
                ))
              } else if (event.type === 'done') {
                streamSuccess = true
                break readLoop
              } else if (event.type === 'no_key' || event.type === 'error') {
                break readLoop
              }
            } catch { /* skip malformed */ }
          }
        }

        if (accumulated) {
          // Streaming succeeded — finalize the message in-place
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId
              ? { ...m, content: accumulated, isStreaming: false, toolCallInfo: streamedToolCallInfo }
              : m
          ))
          setAiMode('gemini')
          setConversationHistory([...updatedHistory, { role: 'model', content: accumulated }])
          setNewMsgIds(prev => new Set([...prev, aiMsgId]))
          setIsThinking(false)
          return
        }

        // Stream gave nothing — remove placeholder and fall through to local
        setMessages(prev => prev.filter(m => m.id !== aiMsgId))
        setIsThinking(true)
        setAiMode('local')
        const localResult = generateAIResponse(query, members)
        aiContent = localResult.content
        relatedIds = localResult.relatedIds
        setConversationHistory([...updatedHistory, { role: 'model', content: aiContent }])
      } else {
        // ── JSON fallback path (no_api_key or network error before SSE) ──────────
        const data = await res.json()
        if (data.toolCallInfo) {
          setThinkingStatus('Looking up relationship...')
          toolCallInfo = data.toolCallInfo as AIToolCallInfo
        }
        if (data.response) {
          aiContent = data.response
          setAiMode('gemini')
          setConversationHistory([...updatedHistory, { role: 'model', content: data.response }])
        } else {
          setAiMode('local')
          const result = generateAIResponse(query, members)
          aiContent = result.content
          relatedIds = result.relatedIds
          setConversationHistory([...updatedHistory, { role: 'model', content: result.content }])
        }
      }
    } catch {
      // Network error — local fallback
      setAiMode('local')
      const result = generateAIResponse(query, members)
      aiContent = result.content
      relatedIds = result.relatedIds
      setConversationHistory([
        ...updatedHistory,
        { role: 'model', content: result.content },
      ])

      if (!aiContent) {
        aiContent = '⚠️ Something went wrong. Please try again.'
        isError = true
      }
    }

    const aiMsg: AIMessage = {
      id: (Date.now() + 1).toString(),
      role: 'ai',
      content: aiContent,
      timestamp: new Date().toISOString(),
      relatedMemberIds: relatedIds,
      toolCallInfo,
      isError,
    }
    setMessages(prev => [...prev, aiMsg])
    // Mark this message for streaming animation
    setNewMsgIds(prev => new Set([...prev, aiMsg.id]))
    setIsThinking(false)
  }, [isThinking, members, conversationHistory])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  const clearChat = () => {
    setConversationHistory([])
    setNewMsgIds(new Set())
    setAiMode(null)
    setMessages([{
      id: 'welcome-new',
      role: 'ai',
      content: `Chat cleared! Ask me anything about your family tree. 🌳`,
      timestamp: new Date().toISOString(),
    }])
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <DemoBanner />
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/95 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg shadow-violet-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">AI Family Copilot</h1>
            <p className="text-xs text-muted-foreground">Powered by Family Intelligence • {members.length} members loaded</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {aiMode === 'gemini' ? (
              <Badge variant="secondary" className="hidden sm:flex bg-violet-500/10 text-violet-400 border-violet-500/20">
                <Sparkles className="mr-1 h-3 w-3" />
                Gemini Active
              </Badge>
            ) : aiMode === 'local' ? (
              <Badge variant="secondary" className="hidden sm:flex bg-amber-500/10 text-amber-400 border-amber-500/20">
                <Zap className="mr-1 h-3 w-3" />
                Local Mode
              </Badge>
            ) : (
              <Badge variant="secondary" className="hidden sm:flex bg-violet-500/10 text-violet-400 border-violet-500/20">
                <Sparkles className="mr-1 h-3 w-3" />
                AI Ready
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={clearChat} className="h-9 w-9">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* API key setup banner — shown only when running in local fallback mode */}
      {aiMode === 'local' && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300/90">
            <strong>Copilot is in local mode</strong> — responses use pattern matching, not real AI.
            Add <code className="rounded bg-amber-500/15 px-1 font-mono">GOOGLE_AI_API_KEY</code> to
            <code className="rounded bg-amber-500/15 px-1 font-mono">.env.local</code> to enable Gemini.
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 underline hover:text-amber-200"
            >
              Get a free API key →
            </a>
          </p>
        </div>
      )}

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              members={members}
              isNew={newMsgIds.has(msg.id)}
              onRetry={msg.isError ? () => sendMessage(lastUserQuery.current) : undefined}
            />
          ))}
          {isThinking && <ThinkingIndicator status={thinkingStatus} />}
          {/* Scroll anchor */}
          <div className="h-1" />
        </div>
      </div>

      {/* Suggestion Chips */}
      {messages.length <= 2 && (
        <div className="border-t border-border/50 bg-card/50 px-4 py-3">
          <p className="mb-2 text-xs text-muted-foreground">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => sendMessage(s.label)}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <s.icon className={cn("h-3 w-3", s.color)} />
                {s.label}
              </button>
            ))}
          </div>

          {/* Memory Prompts */}
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 mb-2">
              <Lightbulb className="h-3.5 w-3.5" />
              Memory Prompts — stories to capture before they&apos;re lost
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {MEMORY_PROMPTS.map((mp) => (
                <button
                  key={mp.prompt}
                  onClick={() => sendMessage(`Help me record: ${mp.prompt}`)}
                  className="flex items-start gap-2 rounded-lg border border-amber-500/10 bg-amber-500/5 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-amber-500/30 hover:text-foreground hover:bg-amber-500/10"
                >
                  <span className="text-base leading-none mt-0.5">{mp.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-1 leading-tight">{mp.prompt}</p>
                    <p className="text-[10px] text-amber-400/70 mt-0.5">{mp.target}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/50 bg-card/95 p-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Ask me anything about your family... (Hindi or English)"
              className="h-12 pr-12 bg-muted/50 border-border/60 text-base placeholder:text-muted-foreground/50 focus-visible:ring-violet-500/30"
              disabled={isThinking}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-10 w-10 text-muted-foreground hover:text-foreground"
            >
              <Mic className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="submit"
            disabled={!inputValue.trim() || isThinking}
            className="h-12 px-5 bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          AI responses are generated from your family data. Always verify important information.
        </p>
      </div>
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  members,
  isNew = false,
  onRetry,
}: {
  message: AIMessage
  members: FamilyMember[]
  isNew?: boolean
  onRetry?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const isAI = message.role === 'ai'

  const handleCopy = () => {
    copyToClipboard(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const relatedMembers = message.relatedMemberIds
    ?.map(id => members.find(m => m.id === id))
    .filter(Boolean) as FamilyMember[] || []

  return (
    <div className={cn("flex gap-3", !isAI && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm",
        isAI
          ? "bg-gradient-to-br from-violet-600 to-purple-700"
          : "bg-gradient-to-br from-orange-500 to-red-600"
      )}>
        {isAI ? (
          <Bot className="h-4 w-4 text-white" />
        ) : (
          <User className="h-4 w-4 text-white" />
        )}
      </div>

      <div className={cn("flex max-w-[85%] flex-col gap-2", !isAI && "items-end")}>
        {/* Tool call badge — shown above bubble when Gemini used a tool */}
        {isAI && message.toolCallInfo && (
          <ToolCallBadge info={message.toolCallInfo} />
        )}

        {/* Bubble */}
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm",
          isAI
            ? "bg-card border border-border/50 text-foreground rounded-tl-sm"
            : "bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-tr-sm",
          message.isError && "border-amber-500/50 bg-amber-500/5"
        )}>
          {message.isError ? (
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{message.content}</span>
            </div>
          ) : isAI && isNew ? (
            <StreamingText content={message.content} />
          ) : (
            <MarkdownText content={message.content} />
          )}
        </div>

        {/* Related Members */}
        {isAI && relatedMembers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {relatedMembers.slice(0, 5).map(m => (
              <div
                key={m.id}
                className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/80 px-2.5 py-1 text-xs text-muted-foreground"
              >
                <Avatar className="h-4 w-4">
                  <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                    {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                {m.name.split(' ')[0]}
              </div>
            ))}
            {relatedMembers.length > 5 && (
              <span className="text-xs text-muted-foreground self-center">+{relatedMembers.length - 5} more</span>
            )}
          </div>
        )}

        {/* Actions */}
        {isAI && (
          <div className="flex items-center gap-1">
            {message.isError && onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-400 hover:bg-amber-500/20 transition-colors mr-1"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}
            {!message.isError && (
              <>
                <button
                  onClick={handleCopy}
                  className="rounded p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  title={copied ? 'Copied!' : 'Copy'}
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button className="rounded p-1 text-muted-foreground/50 hover:text-green-400 transition-colors">
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button className="rounded p-1 text-muted-foreground/50 hover:text-red-400 transition-colors">
                  <ThumbsDown className="h-3 w-3" />
                </button>
              </>
            )}
            <span className="ml-1 text-[10px] text-muted-foreground/40">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Streaming typing animation ────────────────────────────────────────────────────────────

function StreamingText({ content }: { content: string }) {
  const [displayed, setDisplayed] = useState('')
  const contentRef = useRef(content)

  useEffect(() => {
    contentRef.current = content
    let i = 0
    setDisplayed('')
    // Reveal 5 chars per tick at ~12ms = ~417 chars/sec (smooth, readable pace)
    const id = setInterval(() => {
      i = Math.min(i + 5, contentRef.current.length)
      setDisplayed(contentRef.current.slice(0, i))
      if (i >= contentRef.current.length) clearInterval(id)
    }, 12)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount — content is stable

  return <MarkdownText content={displayed || '…'} />
}

// ─── Tool Call Badge ──────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  getRelationshipPath: 'Relationship Lookup',
  getNodeDetails: 'Member Details',
  searchFamilyNodes: 'Family Search',
}

function ToolCallBadge({ info }: { info: NonNullable<AIMessage['toolCallInfo']> }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[info.toolName] ?? info.toolName
  const argsStr = Object.entries(info.args)
    .map(([k, v]) => v)
    .filter(Boolean)
    .join(' → ')

  return (
    <button
      onClick={() => setExpanded(e => !e)}
      className="flex flex-col gap-1 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-left transition-colors hover:border-violet-500/40"
    >
      <div className="flex items-center gap-1.5">
        <Wrench className="h-3 w-3 text-violet-400 shrink-0" />
        <span className="text-[11px] font-medium text-violet-400">{label}</span>
        {argsStr && (
          <span className="text-[11px] text-muted-foreground/70 truncate max-w-[200px]">
            &middot; {argsStr}
          </span>
        )}
        <ChevronRight className={cn(
          'ml-auto h-3 w-3 text-muted-foreground/40 transition-transform shrink-0',
          expanded && 'rotate-90'
        )} />
      </div>
      {expanded && (
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
          {info.result}
        </p>
      )}
    </button>
  )
}

function ThinkingIndicator({ status = 'Thinking about your family...' }: { status?: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-700">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-violet-500 [animation-delay:0ms]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-violet-500 [animation-delay:150ms]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-violet-500 [animation-delay:300ms]" />
          <span className="ml-2 text-xs text-muted-foreground">{status}</span>
        </div>
      </div>
    </div>
  )
}

// Simple markdown renderer
function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        if (!line) return <br key={i} />
        // Bold
        const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        return (
          <p
            key={i}
            className={cn(
              line.startsWith('•') && "ml-2",
              line.startsWith('#') && "font-bold text-base"
            )}
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        )
      })}
    </div>
  )
}
