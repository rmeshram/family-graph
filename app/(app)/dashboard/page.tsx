'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { FamilyMember, Story } from '@/lib/types'
import { sampleFamilyMembers, familyFeed } from '@/lib/sample-data'
import { filterByDegree } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useMembers, useStories } from '@/hooks/use-members'
import { useInvites } from '@/hooks/use-invites'
import { FamilyTree } from '@/components/family-tree'
import { MemberListSidebar } from '@/components/member-list-sidebar'
import { MemberDetail } from '@/components/member-detail'
import { AddMemberDialog } from '@/components/add-member-dialog'
import { SearchDialog } from '@/components/search-dialog'
import { AIInsightsDialog } from '@/components/ai-insights-dialog'
import { AddStoryDialog } from '@/components/add-story-dialog'
import { SettingsDialog } from '@/components/settings-dialog'
import { LiveActivityFeed, PresenceAvatars } from '@/components/live-activity-feed'
import { ClaimNodeDialog } from '@/components/claim-node-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  GitBranch, Sparkles, UserPlus, Search, Settings,
  X, Download, Home, Activity,
  Copy, Check, QrCode, Send, Bot, ChevronRight, List, Network, Users2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

// ─── FamilyTreeSkeleton ────────────────────────────────────────────────────
function FamilyTreeSkeleton() {
  const rows = [
    [{ w: 72, label: true }],
    [{ w: 64 }, { w: 64 }],
    [{ w: 56 }, { w: 56 }, { w: 56 }],
    [{ w: 52 }, { w: 52 }, { w: 52 }, { w: 52 }],
  ] as { w: number; label?: boolean }[][]

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 pointer-events-none select-none overflow-hidden">
      {rows.map((row, ri) => (
        <div key={ri} className="flex items-start gap-10 md:gap-16">
          {row.map((node, ni) => (
            <div key={ni} className="flex flex-col items-center gap-2 relative">
              {/* connector up */}
              {ri > 0 && (
                <div className="absolute -top-8 left-1/2 -translate-x-px w-px h-8 bg-border/40" />
              )}
              {/* node card */}
              <div
                className="rounded-2xl border border-border/30 bg-muted/20 p-3 flex flex-col items-center gap-2"
                style={{ width: node.w + 16 }}
              >
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-2.5 rounded-full" style={{ width: node.w * 0.65 }} />
                {node.label && <Skeleton className="h-2 rounded-full" style={{ width: node.w * 0.45 }} />}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}


type TreeViewMode = 'graph' | 'orgchart' | 'list'

// ─── AI Quick-response engine ──────────────────────────────────────────────────

function quickAIAnswer(q: string, members: FamilyMember[]): string {
  const lower = q.toLowerCase()
  if (lower.includes('how many') || lower.includes('count')) {
    return `Your family has **${members.length} members** across **${new Set(members.map(m => m.generation)).size} generations**.`
  }
  if (lower.includes('oldest')) {
    const oldest = members.filter(m => m.birthYear && m.isAlive !== false).sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999))[0]
    return oldest ? `The oldest living member is **${oldest.name}**, born in ${oldest.birthYear}.` : 'No birth year data found.'
  }
  if (lower.includes('youngest')) {
    const youngest = members.filter(m => m.birthYear && m.isAlive !== false).sort((a, b) => (b.birthYear ?? 0) - (a.birthYear ?? 0))[0]
    return youngest ? `The youngest member is **${youngest.name}**, born in ${youngest.birthYear}.` : 'No birth year data found.'
  }
  // City-based query: detect any city mentioned in member data
  const allCities = [...new Set(members.flatMap(m => [m.currentPlace?.split(',')[0], m.birthPlace?.split(',')[0]]).filter(Boolean) as string[])]
  const mentionedCity = allCities.find(city => lower.includes(city.toLowerCase()))
  if (mentionedCity) {
    const found = members.filter(m => m.currentPlace?.includes(mentionedCity) || m.birthPlace?.includes(mentionedCity))
    return found.length
      ? `${found.map(m => `**${m.name}**`).join(', ')} ${found.length === 1 ? 'is' : 'are'} connected to **${mentionedCity}**.`
      : `No members found in ${mentionedCity}.`
  }
  if (lower.includes('generation')) {
    const gens = [...new Set(members.map(m => m.generation))].sort((a, b) => a - b)
    return `Your family spans **${gens.length} generations** (Gen ${gens[0]} to Gen ${gens[gens.length - 1]}). Total: **${members.length} members**.`
  }
  if (lower.includes('alive') || lower.includes('living')) {
    const alive = members.filter(m => m.isAlive !== false).length
    return `**${alive} of ${members.length}** family members are alive.`
  }
  // Name search
  const nameMatch = members.find(m => lower.includes(m.name.toLowerCase()) || lower.includes(m.name.split(' ')[0].toLowerCase()))
  if (nameMatch) {
    const rel = nameMatch.relationship ?? 'family member'
    const born = nameMatch.birthYear ? `, born ${nameMatch.birthYear}` : ''
    return `**${nameMatch.name}** is your ${rel}${born}. ${nameMatch.occupation ? `Occupation: ${nameMatch.occupation}.` : ''} ${nameMatch.currentPlace ? `Currently in ${nameMatch.currentPlace}.` : ''}`
  }
  return `I found **${members.length} members** in your tree. Ask me about relationships, cities, generations, or any specific member!`
}

// ─── Org Chart View ────────────────────────────────────────────────────────────

function OrgChartView({ members, onSelect, selectedId }: {
  members: FamilyMember[]
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  const byGen = useMemo(() => {
    const map = new Map<number, FamilyMember[]>()
    members.forEach(m => {
      if (!map.has(m.generation)) map.set(m.generation, [])
      map.get(m.generation)!.push(m)
    })
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [members])

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="mx-auto space-y-8 w-full">
        {byGen.map(([gen, genMembers]) => (
          <div key={gen}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-border/50" />
              <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                Gen {gen} — {gen === 0 ? 'Great Grandparents' : gen === 1 ? 'Grandparents' : gen === 2 ? 'Parents & Aunts/Uncles' : gen === 3 ? 'You & Cousins' : gen === 4 ? 'Children & 2nd Cousins' : `Generation ${gen}`}
              </Badge>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {genMembers.map(m => (
                <button
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-2xl border p-3 w-28 transition-all hover:-translate-y-0.5 hover:shadow-lg',
                    selectedId === m.id
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                      : 'border-border/50 bg-card hover:border-primary/30'
                  )}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={cn(
                      'text-xs font-bold',
                      selectedId === m.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center">
                    <p className="text-[11px] font-semibold leading-tight">{m.name.split(' ')[0]}</p>
                    <p className="text-[9px] text-muted-foreground">{m.birthYear ?? '—'}</p>
                    {m.isAlive === false && <div className="mt-0.5 h-1 w-1 rounded-full bg-muted-foreground/50 mx-auto" />}
                  </div>
                  {m.side && (
                    <Badge variant="outline" className={cn(
                      'text-[8px] py-0 h-3.5 px-1',
                      m.side === 'paternal' ? 'border-blue-500/30 text-blue-400' : m.side === 'maternal' ? 'border-rose-500/30 text-rose-400' : 'border-green-500/30 text-green-400'
                    )}>
                      {m.side}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── List View ─────────────────────────────────────────────────────────────────

function ListView({ members, onSelect, selectedId }: {
  members: FamilyMember[]
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  const [listSearch, setListSearch] = useState('')
  const filtered = useMemo(() =>
    members.filter(m => m.name.toLowerCase().includes(listSearch.toLowerCase())),
    [members, listSearch]
  )
  const byGen = useMemo(() => {
    const map = new Map<number, FamilyMember[]>()
    filtered.forEach(m => {
      if (!map.has(m.generation)) map.set(m.generation, [])
      map.get(m.generation)!.push(m)
    })
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [filtered])
  const genLabels: Record<number, string> = { 0: 'Great Grandparents', 1: 'Grandparents', 2: 'Parents & Uncles/Aunts', 3: 'You & Cousins' }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Filter members..." className="pl-8 h-8 text-sm" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {byGen.map(([gen, genMembers]) => (
            <div key={gen}>
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Gen {gen} — {genLabels[gen] ?? 'Family'}
              </p>
              <div className="space-y-0.5">
                {genMembers.map(m => (
                  <button key={m.id} onClick={() => onSelect(m.id)}
                    className={cn('w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', selectedId === m.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50')}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className={cn('text-xs font-bold', selectedId === m.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                        {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {m.relationship?.replace(/-/g, ' ')} · {m.currentPlace?.split(',')[0] ?? m.birthPlace?.split(',')[0] ?? '—'}
                      </p>
                    </div>
                    {m.isAlive === false ? <span className="text-[9px] text-muted-foreground/50 shrink-0">†</span> : <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── AI Widget ─────────────────────────────────────────────────────────────────

function AIWidget({ members, onClose }: { members: FamilyMember[]; onClose: () => void }) {
  const [msgs, setMsgs] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: `🙏 Namaste! Ask me anything about your **${members.length}-member** family tree.` }
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)

  const send = (q?: string) => {
    const question = (q ?? input).trim()
    if (!question) return
    setInput('')
    setMsgs(prev => [...prev, { role: 'user', text: question }])
    setThinking(true)
    setTimeout(() => {
      setMsgs(prev => [...prev, { role: 'ai', text: quickAIAnswer(question, members) }])
      setThinking(false)
    }, 700)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20">
            <Bot className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <span className="text-sm font-semibold">AI Copilot</span>
          <Badge className="h-4 px-1.5 text-[9px] bg-violet-500/10 text-violet-400 border-violet-500/20">Live</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/ai-copilot"><Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">Full view <ChevronRight className="h-3 w-3" /></Button></Link>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')}>
              <div className={cn('h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold', m.role === 'ai' ? 'bg-violet-500/20 text-violet-400' : 'bg-primary/20 text-primary')}>
                {m.role === 'ai' ? '🤖' : 'R'}
              </div>
              <div className={cn('rounded-xl px-3 py-1.5 text-xs max-w-[85%] leading-relaxed', m.role === 'ai' ? 'bg-muted text-foreground' : 'bg-primary/15 text-foreground')}>
                {m.text.split('**').map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex gap-2 items-center">
              <div className="h-6 w-6 shrink-0 rounded-full bg-violet-500/20 flex items-center justify-center text-xs">🤖</div>
              <div className="flex gap-1 rounded-xl bg-muted px-3 py-2">
                {[0, 150, 300].map(d => <div key={d} className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t border-border/50 p-2">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask about your family..." className="flex-1 rounded-xl border border-border/50 bg-muted/40 px-3 py-1.5 text-xs outline-none focus:border-violet-500/50 placeholder:text-muted-foreground/50" />
          <button onClick={() => send()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white hover:bg-violet-600 transition-colors"><Send className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-1.5 flex gap-1 flex-wrap">
          {['How many members?', 'Who is oldest?', 'Who is in Mumbai?'].map(q => (
            <button key={q} onClick={() => send(q)} className="rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-violet-500/30 transition-colors">{q}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Invite Widget ─────────────────────────────────────────────────────────────

function InviteWidget({ onClose, familyId, userId }: { onClose: () => void; familyId: string | null; userId: string | undefined }) {
  const { createInviteLink } = useInvites(familyId)
  const [link, setLink] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Generate a real invite link on mount (for authenticated users with a family)
  useEffect(() => {
    if (!familyId || !userId) return
    setGenerating(true)
    createInviteLink('contributor', 72, userId)
      .then(result => setLink(result.link))
      .catch(() => {/* silently fall back to placeholder */ })
      .finally(() => setGenerating(false))
  }, [familyId, userId, createInviteLink])

  const displayLink = link ?? (familyId ? '' : 'https://familygraph.app/join/DEMO')
  const copy = () => {
    if (!displayLink) return
    navigator.clipboard.writeText(displayLink).catch(() => { })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`🌳 *Join our Family Tree!*\n\nNamaste! I'm building our family's digital history on Family Graph.\n\nJoin here: ${displayLink}\n\nNo app download needed — just click and add yourself! 🙏`)}`

  return (
    <div className="flex flex-col h-full">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20"><UserPlus className="h-3.5 w-3.5 text-green-400" /></div>
          <span className="text-sm font-semibold">Invite Family</span>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/invite"><Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">Full options <ChevronRight className="h-3 w-3" /></Button></Link>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Invite Link</p>
          <div className="flex items-center gap-2">
            {generating ? (
              <span className="flex-1 text-[10px] text-muted-foreground animate-pulse">Generating link…</span>
            ) : (
              <code className="flex-1 text-[10px] truncate text-foreground/80">{displayLink}</code>
            )}
            <button onClick={copy} disabled={!displayLink || generating} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted hover:bg-muted/80 transition-colors disabled:opacity-40">
              {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          </div>
        </div>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-3 hover:bg-green-500/10 transition-colors">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-lg">💬</div>
          <div>
            <p className="text-sm font-semibold text-green-400">Share on WhatsApp</p>
            <p className="text-[10px] text-muted-foreground">Pre-written message</p>
          </div>
          <ChevronRight className="h-4 w-4 text-green-400 ml-auto" />
        </a>
        <div className="rounded-xl border border-border/50 p-3 text-center space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">QR Code</p>
          <div className="flex justify-center">
            <div className="inline-flex h-24 w-24 items-center justify-center rounded-xl bg-muted/40 border border-border/50">
              <QrCode className="h-12 w-12 text-muted-foreground/50" />
            </div>
          </div>
          <Link href="/invite"><Button variant="outline" size="sm" className="h-7 text-xs w-full">Generate Full QR</Button></Link>
        </div>
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed"><span className="font-semibold text-primary">Tip:</span> Share in your family WhatsApp group — the tree builds itself! 🌳</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function FamilyGraphApp() {
  const { user, familyId, profile, loading: authLoading } = useAuth()
  const { members: dbMembers, loading: dbLoading, totalCount: dbTotalCount, addMember: dbAddMember, deleteMember: dbDeleteMember, claimMember, setVisibility } = useMembers(familyId)
  const { storiesByMember, addStory: dbAddStory } = useStories(familyId)

  const isDemoMode = !authLoading && !user

  const [maxDegree, setMaxDegree] = useState(2)
  const [showExtended, setShowExtended] = useState(true)
  useEffect(() => {
    if (window.innerWidth < 768) setShowExtended(false)
  }, [])
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false)
  const [isAIInsightsOpen, setIsAIInsightsOpen] = useState(false)
  const [isStoryDialogOpen, setIsStoryDialogOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isClaimDialogOpen, setIsClaimDialogOpen] = useState(false)
  const [claimTargetId, setClaimTargetId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [showFeed, setShowFeed] = useState(false)
  const [viewMode, setViewMode] = useState<TreeViewMode>('graph')
  const [showAIWidget, setShowAIWidget] = useState(false)
  const [showInviteWidget, setShowInviteWidget] = useState(false)

  const members = useMemo(() => {
    if (isDemoMode) return sampleFamilyMembers
    if (authLoading || dbLoading) return []
    if (!familyId) return []
    return dbMembers.map(m => ({
      ...m,
      stories: storiesByMember[m.id] ?? [],
    }))
  }, [isDemoMode, authLoading, familyId, dbLoading, dbMembers, storiesByMember])

  // The "self" member is the root for degree calculations
  const selfMember = members.find(m => m.relationship === 'self') ?? members[0] ?? null
  const filteredMembers = useMemo(() => {
    let base = maxDegree < 10 && selfMember
      ? filterByDegree(members, selfMember.id, maxDegree)
      : members
    if (!showExtended) {
      base = base.filter(m => !m.networkGroup || m.networkGroup === 'core')
    }
    return base
  }, [members, maxDegree, selfMember, showExtended])

  const { toast } = useToast()
  const selectedMember = members.find((m) => m.id === selectedMemberId)

  const handleSelectMember = useCallback((id: string) => {
    setSelectedMemberId((prev) => (prev === id ? null : id))
  }, [])

  const handleAddMember = useCallback(async (memberData: Omit<FamilyMember, 'id'>) => {
    if (!user) {
      // Not signed in — prompt to create account
      toast({
        title: 'Sign in to save',
        description: 'Create a free account to permanently save members to your family tree.',
        action: <Link href="/auth/signup" className="underline text-primary">Create account</Link>,
      })
      return
    }
    if (!familyId) {
      // Signed in but onboarding not complete
      toast({
        title: 'Complete setup first',
        description: 'Finish setting up your family to start adding members.',
        action: <Link href="/onboarding" className="underline text-primary">Go to setup</Link>,
      })
      return
    }
    try {
      await dbAddMember(memberData, user.id)
      toast({ title: 'Member added', description: `${memberData.name} added to the tree.` })
    } catch (e: unknown) {
      toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    }
  }, [familyId, user, dbAddMember, toast])

  const handleDeleteMember = useCallback(async () => {
    if (!selectedMemberId) return
    if (!familyId) {
      toast({ title: 'Demo mode', description: 'Sign in to manage members.', variant: 'destructive' })
      setIsDeleteDialogOpen(false)
      return
    }
    const memberToDelete = members.find(m => m.id === selectedMemberId)
    try {
      await dbDeleteMember(selectedMemberId)
      setSelectedMemberId(null)
      setIsDeleteDialogOpen(false)
      toast({ title: 'Member removed', description: `${memberToDelete?.name} has been removed.` })
    } catch (e: unknown) {
      toast({ title: 'Could not delete', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
      setIsDeleteDialogOpen(false)
    }
  }, [selectedMemberId, members, familyId, dbDeleteMember, toast])

  const handleAddStory = useCallback(async (memberId: string, storyData: Omit<Story, 'id' | 'createdAt'>) => {
    if (familyId) {
      try {
        await dbAddStory(memberId, familyId, storyData)
        toast({ title: 'Story added' })
      } catch (e: unknown) {
        toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
      }
    } else {
      toast({ title: 'Demo mode', description: 'Sign in to save stories.' })
    }
  }, [familyId, dbAddStory, toast])

  const handleExport = useCallback(() => {
    const data = JSON.stringify(members, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'family-graph.json'; a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Export complete', description: 'Family data exported as JSON.' })
  }, [members, toast])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string)
          if (!Array.isArray(imported)) { toast({ title: 'Invalid file', description: 'Expected a JSON array of members.', variant: 'destructive' }); return }
          if (!familyId || !user) {
            toast({ title: `Found ${imported.length} members`, description: 'Sign in and create a family to import data into the database.' })
            return
          }
          let success = 0
          for (const m of imported) {
            try {
              await dbAddMember({ ...m, networkGroup: m.networkGroup ?? 'core' }, user.id)
              success++
            } catch { /* skip duplicates/errors */ }
          }
          toast({ title: 'Import complete', description: `${success} of ${imported.length} members imported.` })
        } catch {
          toast({ title: 'Import failed', description: 'Could not parse the JSON file.', variant: 'destructive' })
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [familyId, user, dbAddMember, toast])

  const VIEW_MODES: { key: TreeViewMode; label: string; icon: React.ElementType }[] = [
    { key: 'graph', label: 'Graph', icon: Network },
    { key: 'orgchart', label: 'Org Chart', icon: GitBranch },
    { key: 'list', label: 'List', icon: List },
  ]

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">

        {/* Demo mode banner */}
        {!user && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-2">
            <div className="flex items-center gap-2 text-[12px] text-amber-400/90">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span>You're viewing <strong>demo data</strong> — this is what your family tree could look like</span>
            </div>
            <Link
              href="/auth/signup"
              className="shrink-0 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/25 transition-colors"
            >
              Get started free →
            </Link>
          </div>
        )}

        {/* ── Top Bar ──────────────────────────────────────────────── */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/40 px-4 backdrop-blur-xl" style={{ background: 'var(--surface-header)' }}>
          <div className="hidden lg:flex items-center gap-1.5 text-sm text-muted-foreground">
            <Home className="h-3.5 w-3.5" />
            <span>/</span>
            <span className="text-foreground font-medium">Family Tree</span>
          </div>

          {/* View mode switcher */}
          <div className="flex items-center rounded-xl border border-border/40 bg-muted/30 p-0.5 gap-0.5 ml-0 lg:ml-3">
            {VIEW_MODES.map(v => (
              <button key={v.key} onClick={() => setViewMode(v.key)}
                className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  viewMode === v.key
                    ? 'bg-card text-foreground shadow-sm border border-border/50'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* Extended family toggle */}
          <button
            onClick={() => setShowExtended(v => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium border transition-colors',
              showExtended
                ? 'bg-teal-500/10 border-teal-500/40 text-teal-400 hover:bg-teal-500/15'
                : 'bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60'
            )}
            title={showExtended ? 'Hide extended & affiliated family' : 'Show extended & affiliated family'}
          >
            <Users2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Extended</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsSearchDialogOpen(true)} className="h-8 gap-1.5 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded bg-muted px-1 text-[10px] sm:inline">⌘K</kbd>
            </Button>
            <Button variant={showAIWidget ? 'default' : 'ghost'} size="sm"
              onClick={() => { setShowAIWidget(v => !v); setShowInviteWidget(false) }}
              className={cn('h-8 gap-1.5 text-xs', showAIWidget ? 'bg-violet-500 text-white hover:bg-violet-600' : 'text-violet-400 hover:bg-violet-500/10')}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI</span>
            </Button>
            <Button variant={showInviteWidget ? 'default' : 'ghost'} size="sm"
              onClick={() => { setShowInviteWidget(v => !v); setShowAIWidget(false) }}
              className={cn('h-8 gap-1.5 text-xs', showInviteWidget ? 'bg-green-500 text-white hover:bg-green-600' : 'text-green-400 hover:bg-green-500/10')}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Invite</span>
            </Button>
            <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="h-8 gap-1.5 text-xs">
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add</span>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* ── Content Area ─────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Member list (graph mode, xl+ only) */}
          {viewMode === 'graph' && (
            <aside className="hidden w-72 shrink-0 border-r border-border/40 backdrop-blur-xl xl:block" style={{ background: 'var(--surface-sidebar)' }}>
              <MemberListSidebar
                members={filteredMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={handleSelectMember}
                maxDegree={maxDegree}
                onMaxDegreeChange={setMaxDegree}
                totalCount={isDemoMode ? members.length : dbTotalCount}
              />
            </aside>
          )}

          {/* Main canvas */}
          <main className="flex-1 overflow-hidden relative">
            {/* Progressive skeleton while data loads */}
            {!isDemoMode && (dbLoading || authLoading) && <FamilyTreeSkeleton />}
            {viewMode === 'graph' && (
              <FamilyTree
                members={filteredMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={handleSelectMember}
                onDoubleClickMember={(id) => {
                  setClaimTargetId(id)
                  setIsClaimDialogOpen(true)
                }}
              />
            )}
            {viewMode === 'orgchart' && (
              <OrgChartView members={filteredMembers} onSelect={handleSelectMember} selectedId={selectedMemberId} />
            )}
            {viewMode === 'list' && (
              <ListView members={filteredMembers} onSelect={handleSelectMember} selectedId={selectedMemberId} />
            )}

            {/* Presence avatars — top right of canvas */}
            {viewMode === 'graph' && (
              <div className="absolute top-3 right-3 z-20">
                <PresenceAvatars isDemoMode={isDemoMode} />
              </div>
            )}

            {/* Live activity feed — bottom left of canvas (visible when no member selected) */}
            {viewMode === 'graph' && (
              <div className="absolute bottom-4 left-4 z-20">
                <LiveActivityFeed isDemoMode={isDemoMode} />
              </div>
            )}
          </main>

          {/* AI Widget */}
          {showAIWidget && (
            <aside className="w-80 shrink-0 border-l border-border/40 backdrop-blur-xl" style={{ background: 'var(--surface-header)' }}>
              <AIWidget members={members} onClose={() => setShowAIWidget(false)} />
            </aside>
          )}

          {/* Invite Widget */}
          {showInviteWidget && (
            <aside className="w-72 shrink-0 border-l border-border/40 backdrop-blur-xl" style={{ background: 'var(--surface-header)' }}>
              <InviteWidget onClose={() => setShowInviteWidget(false)} familyId={familyId} userId={user?.id} />
            </aside>
          )}

          {/* Member Detail */}
          {selectedMember && !showAIWidget && !showInviteWidget && (
            <aside className="w-80 shrink-0 xl:w-96">
              <MemberDetail
                member={selectedMember}
                allMembers={members}
                onClose={() => setSelectedMemberId(null)}
                onEdit={() => setEditingMember(selectedMember)}
                onDelete={() => setIsDeleteDialogOpen(true)}
                onAddStory={() => setIsStoryDialogOpen(true)}
                isAdmin={!!profile && (profile as { role?: string }).role === 'admin'}
                onSetVisibility={async (memberId, v) => {
                  try {
                    await setVisibility(memberId, v)
                    toast({ title: 'Visibility updated' })
                  } catch (e: unknown) {
                    toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
                  }
                }}
              />
            </aside>
          )}

          {/* Feed panel */}
          {showFeed && !selectedMember && !showAIWidget && !showInviteWidget && (
            <aside className="w-80 shrink-0 border-l border-border/40 backdrop-blur-xl" style={{ background: 'var(--surface-header)' }}>
              <FamilyFeedPanel onClose={() => setShowFeed(false)} />
            </aside>
          )}
        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <AddMemberDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} existingMembers={members} onAdd={handleAddMember} familyId={familyId ?? undefined} />
      <SearchDialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen} members={members} onSelectMember={handleSelectMember} />
      <AIInsightsDialog open={isAIInsightsOpen} onOpenChange={setIsAIInsightsOpen} members={members} />
      <AddStoryDialog open={isStoryDialogOpen} onOpenChange={setIsStoryDialogOpen} member={selectedMember || null} onAdd={handleAddStory} />
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} onExport={handleExport} onImport={handleImport} />
      <ClaimNodeDialog
        member={members.find(m => m.id === claimTargetId) ?? null}
        userId={user?.id ?? null}
        open={isClaimDialogOpen}
        onOpenChange={setIsClaimDialogOpen}
        onClaim={async (memberId, userId) => {
          await claimMember(memberId, userId)
          toast({ title: 'Node claimed!', description: 'Your profile is now linked to this tree.' })
        }}
        onSetVisibility={async (memberId, visibility) => {
          await setVisibility(memberId, visibility)
        }}
      />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedMember?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove {selectedMember?.name} and all their connections.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster />
    </TooltipProvider>
  )
}

// ─── Family Feed Panel ─────────────────────────────────────────────────────────

function FamilyFeedPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const feedItems = !user ? familyFeed : []
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-border/50 px-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span className="font-semibold text-sm">Family Feed</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-0">
          {feedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Activity from your family will appear here</p>
            </div>
          )}
          {feedItems.map(event => (
            <div key={event.id} className="flex gap-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-base">{event.emoji}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-relaxed">
                  <span className="font-semibold text-foreground">{event.actorName}</span>{' '}
                  <span className="text-muted-foreground">{event.message}</span>
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                  {new Date(event.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
