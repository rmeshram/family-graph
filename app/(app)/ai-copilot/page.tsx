"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { FamilyMember, AIMessage } from "@/lib/types"
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
  const { familyId, user, loading: authLoading } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const isDemoMode = !authLoading && !user
  const members = isDemoMode ? sampleFamilyMembers : (familyId && !loading ? dbMembers : [])

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = useCallback(async (query: string) => {
    if (!query.trim() || isThinking) return

    const userMsg: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInputValue("")
    setIsThinking(true)

    let aiContent: string
    let relatedIds: string[] = []

    try {
      // Build compact family context for Gemini
      const context = members.slice(0, 30).map(m =>
        `${m.name} (${m.relationship}, gen ${m.generation}${m.birthYear ? `, b.${m.birthYear}` : ''}${m.birthPlace ? `, ${m.birthPlace}` : ''})`
      ).join('\n')

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, context }),
      })
      const data = await res.json()

      if (data.response) {
        aiContent = data.response
      } else {
        // Fallback to local pattern matching
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400))
        const result = generateAIResponse(query, members)
        aiContent = result.content
        relatedIds = result.relatedIds
      }
    } catch {
      // Network error — fall back silently
      await new Promise(r => setTimeout(r, 600))
      const result = generateAIResponse(query, members)
      aiContent = result.content
      relatedIds = result.relatedIds
    }

    const aiMsg: AIMessage = {
      id: (Date.now() + 1).toString(),
      role: 'ai',
      content: aiContent,
      timestamp: new Date().toISOString(),
      relatedMemberIds: relatedIds,
    }
    setMessages(prev => [...prev, aiMsg])
    setIsThinking(false)
  }, [isThinking, members])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  const clearChat = () => {
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
            <Badge variant="secondary" className="hidden sm:flex bg-violet-500/10 text-violet-400 border-violet-500/20">
              <Sparkles className="mr-1 h-3 w-3" />
              AI Active
            </Badge>
            <Button variant="ghost" size="icon" onClick={clearChat} className="h-9 w-9">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} members={members} />
          ))}
          {isThinking && <ThinkingIndicator />}
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

function MessageBubble({ message, members }: { message: AIMessage; members: FamilyMember[] }) {
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
        {/* Bubble */}
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm",
          isAI
            ? "bg-card border border-border/50 text-foreground rounded-tl-sm"
            : "bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-tr-sm"
        )}>
          <MarkdownText content={message.content} />
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
            <button
              onClick={handleCopy}
              className="rounded p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button className="rounded p-1 text-muted-foreground/50 hover:text-green-400 transition-colors">
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button className="rounded p-1 text-muted-foreground/50 hover:text-red-400 transition-colors">
              <ThumbsDown className="h-3 w-3" />
            </button>
            <span className="ml-1 text-[10px] text-muted-foreground/40">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator() {
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
          <span className="ml-2 text-xs text-muted-foreground">Thinking about your family...</span>
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
