'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { FamilyMember, Story, FamilyEvent } from '@/lib/types'
import { sampleFamilyMembers } from '@/lib/sample-data'
import { filterByDegree, computeProfileCompleteness, copyToClipboard } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useMembers, useStories } from '@/hooks/use-members'
import { useInvites } from '@/hooks/use-invites'
import { useLinkedFamilies } from '@/hooks/use-linked-families'
import { LinkFamilyDialog } from '@/components/link-family-dialog'
import { FamilyLinkRequestsBanner } from '@/components/family-link-requests-banner'
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
import { RelationshipUniverse } from '@/components/relationship-universe'
import { PathFinderPanel } from '@/components/path-finder-panel'
import { enrichMembersWithDerivedEdges } from '@/lib/relation-engine'
import { RelationshipSuggestionsBanner } from '@/components/relationship-suggestions-banner'
import { computePostAddSuggestions, type RelationshipSuggestion, type RelationshipAction } from '@/lib/relationship-engine'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import {
  GitBranch, Sparkles, UserPlus, Search, Settings,
  X, Home, Activity,
  Copy, Check, QrCode, Send, Bot, ChevronRight, List, Network, Users2,
  Link2, TreePine,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

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


type TreeViewMode = 'graph' | 'orgchart' | 'list' | 'universe'

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
  const { profile } = useAuth()
  const userInitials = (profile as any)?.full_name
    ? (profile as any).full_name.trim().split(/\s+/).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'Me'
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
                {m.role === 'ai' ? '🤖' : userInitials}
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
    copyToClipboard(displayLink)
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
  const isMobile = useIsMobile()
  const { user, familyId, profile, loading: authLoading } = useAuth()
  const { members: dbMembers, loading: dbLoading, error: dbError, totalCount: dbTotalCount, addMember: dbAddMember, updateMember: dbUpdateMember, deleteMember: dbDeleteMember, claimMember, setVisibility } = useMembers(familyId)
  const { storiesByMember, addStory: dbAddStory } = useStories(familyId)

  const isDemoMode = !authLoading && !user

  const {
    linkedMembers,
    linkedFamilies,
    newMemberAlert,
    clearNewMemberAlert,
    sendLinkRequest,
  } = useLinkedFamilies(isDemoMode ? null : familyId)

  const [maxDegree, setMaxDegree] = useState(10)
  const [showExtended, setShowExtended] = useState(true)
  const [isLinkFamilyOpen, setIsLinkFamilyOpen] = useState(false)
  useEffect(() => {
    if (window.innerWidth < 768) setShowExtended(false)
  }, [])
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [detailMemberId, setDetailMemberId] = useState<string | null>(null)
  // Phase 2.5 — relationship exploration trail ("You → Brother → Brother's Wife → …")
  // Capped at 8 hops so the breadcrumb stays readable.
  const [explorationTrail, setExplorationTrail] = useState<string[]>([])
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false)
  const [isAIInsightsOpen, setIsAIInsightsOpen] = useState(false)
  const [isStoryDialogOpen, setIsStoryDialogOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<string>('general')

  // Listen for fg:open-settings custom event fired from notification bell
  useEffect(() => {
    const handler = (e: CustomEvent<{ tab?: string }>) => {
      setSettingsDefaultTab(e.detail?.tab ?? 'general')
      setIsSettingsOpen(true)
    }
    window.addEventListener('fg:open-settings', handler as EventListener)
    return () => window.removeEventListener('fg:open-settings', handler as EventListener)
  }, [])
  const [isClaimDialogOpen, setIsClaimDialogOpen] = useState(false)
  const [claimTargetId, setClaimTargetId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  // ── Relationship intelligence suggestions ─────────────────────────────────
  const [pendingSuggestions, setPendingSuggestions] = useState<RelationshipSuggestion[]>([])
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [showFeed, setShowFeed] = useState(false)
  const [viewMode, setViewMode] = useState<TreeViewMode>('universe')
  const [showAIWidget, setShowAIWidget] = useState(false)
  const [showInviteWidget, setShowInviteWidget] = useState(false)
  const [memberListOpen, setMemberListOpen] = useState(false)

  // ── Path Finder state ──────────────────────────────────────────────────────
  const [pathFinderOpen, setPathFinderOpen] = useState(false)
  const [pfFrom, setPfFrom] = useState('')
  const [pfTo, setPfTo] = useState('')
  const [pfFromSearch, setPfFromSearch] = useState('')
  const [pfToSearch, setPfToSearch] = useState('')
  const [pfPathNodes, setPfPathNodes] = useState<Set<string>>(new Set())
  const [pfPathEdges, setPfPathEdges] = useState<Set<string>>(new Set())
  const [pfPathSequence, setPfPathSequence] = useState<string[]>([])

  // ── Path Finder BFS helpers ──────────────────────────────────────────────
  const dashboardAdjacencyMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (a: string, b: string) => {
      if (!map.has(a)) map.set(a, new Set())
      if (!map.has(b)) map.set(b, new Set())
      map.get(a)!.add(b); map.get(b)!.add(a)
    }
    // Use enriched members: derives edges from relationship labels for isolated nodes
    const base = isDemoMode ? sampleFamilyMembers : dbMembers
    const selfMemberForEnrich = base.find(m => m.relationship === 'self')
    const enriched = selfMemberForEnrich ? enrichMembersWithDerivedEdges(base, selfMemberForEnrich.id) : base
    enriched.forEach(m => {
      m.parentIds.forEach(pid => add(m.id, pid))
      m.spouseIds.forEach(sid => add(m.id, sid))
    })
    return map
  }, [isDemoMode, dbMembers])

  const findExternalPath = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) {
      setPfPathNodes(new Set()); setPfPathEdges(new Set()); setPfPathSequence([])
      return
    }
    const parent = new Map<string, string>([[fromId, '']])
    const queue = [fromId]
    let found = false
    outer: while (queue.length > 0) {
      const cur = queue.shift()!
      for (const nid of (dashboardAdjacencyMap.get(cur) ?? new Set())) {
        if (!parent.has(nid)) {
          parent.set(nid, cur)
          if (nid === toId) { found = true; break outer }
          queue.push(nid)
        }
      }
    }
    if (!found) { setPfPathNodes(new Set()); setPfPathEdges(new Set()); setPfPathSequence([]); return }
    const nodes: string[] = []; const edgeKeys = new Set<string>()
    let cur = toId
    while (cur) {
      nodes.unshift(cur)
      const prev = parent.get(cur)!
      if (prev) edgeKeys.add([prev, cur].sort().join('|'))
      cur = prev
    }
    setPfPathNodes(new Set(nodes)); setPfPathEdges(edgeKeys); setPfPathSequence(nodes)
  }, [dashboardAdjacencyMap])

  useEffect(() => {
    if (pfFrom && pfTo && pfFrom !== pfTo) findExternalPath(pfFrom, pfTo)
    else { setPfPathNodes(new Set()); setPfPathEdges(new Set()); setPfPathSequence([]) }
  }, [pfFrom, pfTo, findExternalPath])

  const handleOpenPathFinder = useCallback((fromMemberId?: string) => {
    if (!fromMemberId && pathFinderOpen) {
      setPathFinderOpen(false); return
    }
    setPathFinderOpen(true)
    if (fromMemberId) {
      setPfFrom(fromMemberId)
      const m = (isDemoMode ? sampleFamilyMembers : dbMembers).find(x => x.id === fromMemberId)
      if (m) setPfFromSearch(m.name)
      setPfTo(''); setPfToSearch('')
      setPfPathNodes(new Set()); setPfPathEdges(new Set()); setPfPathSequence([])
    }
  }, [isDemoMode, dbMembers, pathFinderOpen])

  const members = useMemo(() => {
    if (isDemoMode) return sampleFamilyMembers
    if (authLoading || dbLoading) return []
    if (!familyId) return []
    const core = dbMembers.map(m => ({
      ...m,
      stories: storiesByMember[m.id] ?? [],
    }))
    // Merge linked family members as affiliated nodes (shown as Community cluster)
    return [...core, ...linkedMembers]
  }, [isDemoMode, authLoading, familyId, dbLoading, dbMembers, storiesByMember, linkedMembers])

  // ── Activity feed — derived from real member + story data for logged-in users ─
  const feedItems = useMemo<FamilyEvent[]>(() => {
    if (isDemoMode) return []
    const memberEvents: FamilyEvent[] = members
      .filter(m => m.addedAt)
      .map(m => ({
        id: `member-${m.id}`,
        type: 'member_added' as const,
        actorName: 'Family Admin',
        subjectName: m.name,
        subjectId: m.id,
        message: `added ${m.name} to the family tree`,
        timestamp: m.addedAt!,
        emoji: m.gender === 'female' ? '👩' : m.gender === 'male' ? '👨' : '👤',
      }))
    const storyEvents: FamilyEvent[] = Object.entries(storiesByMember).flatMap(([memberId, stories]) => {
      const member = members.find(m => m.id === memberId)
      if (!member) return []
      return stories.map(s => ({
        id: `story-${s.id}`,
        type: 'story_added' as const,
        actorName: s.author ?? 'Family Member',
        subjectName: member.name,
        subjectId: memberId,
        message: `shared a story about ${member.name}: "${s.title}"`,
        timestamp: s.createdAt,
        emoji: '📖',
      }))
    })
    return [...memberEvents, ...storyEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 30)
  }, [isDemoMode, members, storiesByMember])

  // The "self" member — use profile.member_id (authoritative), then claimedByUserId
  // (catches the case where profile.member_id is stale immediately after join),
  // then fall back to relationship === 'self' (demo mode / unauthenticated).
  const selfMember = members.find(m => m.id === (profile as any)?.member_id)
    ?? members.find(m => m.claimedByUserId === user?.id)
    ?? members.find(m => m.relationship === 'self')
    ?? null
  const filteredMembers = useMemo(() => {
    let base = maxDegree < 10 && selfMember
      ? filterByDegree(members, selfMember.id, maxDegree)
      : members
    // In demo mode always show all sample members regardless of screen size —
    // the sample data has no 'core' networkGroup entries so skipping the filter
    // prevents an empty canvas on mobile.
    if (!isDemoMode && !showExtended) {
      base = base.filter(m => !m.networkGroup || m.networkGroup === 'core')
    }
    return base
  }, [isDemoMode, members, maxDegree, selfMember, showExtended])

  const { toast } = useToast()
  const selectedMember = members.find((m) => m.id === (viewMode === 'universe' ? detailMemberId : selectedMemberId))

  const closeMemberDetail = useCallback(() => {
    if (viewMode === 'universe') {
      setDetailMemberId(null)
      return
    }
    setSelectedMemberId(null)
  }, [viewMode])

  const handleSelectMember = useCallback((id: string) => {
    setSelectedMemberId((prev) => (prev === id ? null : id))
    setExplorationTrail((trail) => {
      if (trail[trail.length - 1] === id) return trail
      // If this id is already in the trail, truncate back to it (navigating "back")
      const existingIdx = trail.indexOf(id)
      if (existingIdx !== -1) return trail.slice(0, existingIdx + 1)
      return [...trail, id].slice(-8)
    })
  }, [])

  const handleSelectUniverseMember = useCallback((id: string) => {
    setDetailMemberId(null)
    setSelectedMemberId((prev) => (prev === id ? null : id))
    setExplorationTrail((trail) => {
      if (trail[trail.length - 1] === id) return trail
      const existingIdx = trail.indexOf(id)
      if (existingIdx !== -1) return trail.slice(0, existingIdx + 1)
      return [...trail, id].slice(-8)
    })
  }, [])

  const handleOpenSelectedMemberDetail = useCallback((id?: string) => {
    const nextId = id ?? selectedMemberId
    if (!nextId) return
    setSelectedMemberId(nextId)
    setDetailMemberId(nextId)
  }, [selectedMemberId])

  const handleTrailJump = useCallback((id: string) => {
    setSelectedMemberId(id)
    setDetailMemberId(null)
    setExplorationTrail((trail) => {
      const idx = trail.indexOf(id)
      return idx !== -1 ? trail.slice(0, idx + 1) : [id]
    })
  }, [])

  const handleTrailClear = useCallback(() => {
    setExplorationTrail([])
    setSelectedMemberId(null)
    setDetailMemberId(null)
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
      const newMember = await dbAddMember(memberData, user.id)
      toast({ title: 'Member added', description: `${memberData.name} added to the tree.` })
      // Run relationship intelligence: surface actionable suggestions to the user
      if (newMember) {
        const allWithNew = [...members, newMember]
        const suggestions = computePostAddSuggestions(newMember.id, allWithNew)
        if (suggestions.length > 0) setPendingSuggestions(suggestions)
      }
    } catch (e: unknown) {
      toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    }
  }, [familyId, user, dbAddMember, toast])

  const handleUpdateMember = useCallback(async (id: string, updates: Partial<FamilyMember>) => {
    try {
      await dbUpdateMember(id, updates)
      setEditingMember(null)
      toast({ title: 'Member updated' })
    } catch (e: unknown) {
      toast({ title: 'Update failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    }
  }, [dbUpdateMember, toast])

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
    { key: 'universe', label: 'Universe', icon: Sparkles },
  ]

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">

        {/* Demo mode banner */}
        {!user && (
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2"
            style={{ background: 'var(--demo-banner-bg)', borderColor: 'var(--demo-banner-border)' }}
          >
            <div className="flex min-w-0 items-center gap-2 text-[12px]" style={{ color: 'var(--demo-banner-text)' }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full animate-pulse" style={{ background: 'var(--demo-banner-text)' }} />
              <span className="truncate hidden sm:inline">You're viewing <strong>demo data</strong> — this is what your family tree could look like</span>
              <span className="truncate sm:hidden">Viewing <strong>demo data</strong></span>
            </div>
            <Link
              href="/auth/signup"
              className="shrink-0 rounded-lg border px-3 py-1 text-[11px] font-semibold transition-colors hover:opacity-80 active:scale-95"
              style={{ background: 'var(--demo-banner-bg)', borderColor: 'var(--demo-banner-border)', color: 'var(--demo-banner-link)' }}
            >
              Get started free →
            </Link>
          </div>
        )}

        {/* ── Top Bar ──────────────────────────────────────────────── */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 px-4 backdrop-blur-xl" style={{ background: 'var(--surface-header)' }}>
          <div className="hidden lg:flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
            <Home className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">Family Tree</span>
          </div>

          {/* View mode switcher */}
          <div className="flex items-center rounded-lg border border-border/40 bg-muted/30 p-0.5 gap-0.5 lg:ml-3">
            {VIEW_MODES.map(v => (
              <button key={v.key} onClick={() => setViewMode(v.key)}
                className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  viewMode === v.key
                    ? 'bg-card text-foreground shadow-sm border border-border/50'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <v.icon className="h-3 w-3" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* Extended family toggle */}
          <button
            onClick={() => setShowExtended(v => !v)}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium border transition-colors shrink-0',
              showExtended
                ? 'bg-teal-500/10 border-teal-500/40 text-teal-400 hover:bg-teal-500/15'
                : 'bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground'
            )}
            title={showExtended ? 'Hide extended family' : 'Show extended family'}
          >
            <Users2 className="h-3 w-3" />
            <span className="hidden md:inline">Extended</span>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setIsSearchDialogOpen(true)} className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded bg-muted px-1 text-[10px] sm:inline">⌘K</kbd>
            </Button>

            <div className="hidden sm:block w-px h-5 bg-border/50 mx-0.5" />

            {FEATURE_FLAGS.enableAICopilot && (
              <Button variant={showAIWidget ? 'default' : 'ghost'} size="sm"
                onClick={() => { setShowAIWidget(v => !v); setShowInviteWidget(false) }}
                className={cn('h-8 gap-1.5 text-xs', showAIWidget ? 'bg-violet-500 text-white hover:bg-violet-600' : 'text-violet-400 hover:bg-violet-500/10')}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">AI</span>
              </Button>
            )}
            <Button variant={showInviteWidget ? 'default' : 'ghost'} size="sm"
              onClick={() => { setShowInviteWidget(v => !v); setShowAIWidget(false) }}
              className={cn('h-8 gap-1.5 text-xs', showInviteWidget ? 'bg-green-500 text-white hover:bg-green-600' : 'text-green-400 hover:bg-green-500/10')}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Invite</span>
            </Button>

            {/* Link another family tree */}
            {user && (
              <Button variant="ghost" size="sm"
                onClick={() => setIsLinkFamilyOpen(true)}
                className={cn('h-8 gap-1.5 text-xs relative text-teal-400 hover:bg-teal-500/10')}
              >
                <Link2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Link Family</span>
                {linkedFamilies.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[9px] font-bold text-white">
                    {linkedFamilies.length}
                  </span>
                )}
              </Button>
            )}

            <div className="hidden sm:block w-px h-5 bg-border/50 mx-0.5" />

            <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90">
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add</span>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* ── Profile completeness nudge ───────────────────────────── */}
        {!isDemoMode && selfMember && (() => {
          const { score, missing } = computeProfileCompleteness(selfMember)
          if (missing.length === 0) return null
          return (
            <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-medium text-amber-400">{score}% complete</span>
                <span className="text-muted-foreground hidden sm:inline">— add: {missing.join(', ')}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10 shrink-0"
                onClick={() => { setEditingMember(selfMember); handleSelectMember(selfMember.id) }}
              >
                Complete Profile
              </Button>
            </div>
          )
        })()}

        {/* ── Pending family link requests banner (logged-in only) ── */}
        {!isDemoMode && <FamilyLinkRequestsBanner familyId={familyId ?? null} />}

        {/* ── "Their tree just grew" real-time alert ───────────────── */}
        {newMemberAlert && (
          <div className="flex items-center gap-3 border-b border-teal-500/25 bg-teal-500/8 px-4 py-2.5 text-sm animate-in slide-in-from-top-1 duration-300">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-base">🌱</span>
            <p className="flex-1 min-w-0 text-teal-300 text-xs">
              <span className="font-semibold">{newMemberAlert.familyName}</span> just added{' '}
              <span className="font-semibold text-white">{newMemberAlert.member.name}</span> to their tree — they appear in your universe now!
            </p>
            <button
              onClick={clearNewMemberAlert}
              className="text-teal-400/60 hover:text-teal-300 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ── Content Area ─────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Member list sidebar — visible in graph + universe modes */}
          {(viewMode === 'graph' || viewMode === 'universe') && (
            <aside
              className={cn(
                'hidden shrink-0 border-r border-border/40 backdrop-blur-xl xl:block transition-all duration-200',
                isSidebarCollapsed ? 'w-10' : 'w-72'
              )}
              style={{ background: 'var(--surface-sidebar)' }}
            >
              <MemberListSidebar
                members={filteredMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={handleSelectMember}
                maxDegree={maxDegree}
                onMaxDegreeChange={setMaxDegree}
                totalCount={isDemoMode ? members.length : dbTotalCount}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(v => !v)}
              />
            </aside>
          )}

          {/* Main canvas */}
          <main className="flex-1 min-h-0 overflow-hidden relative">
            {/* RLS / DB error banner */}
            {!isDemoMode && !dbLoading && dbError && (
              <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-destructive/90 px-4 py-2.5 text-sm text-white backdrop-blur">
                <span className="font-semibold">Database error:</span>
                <span className="flex-1 truncate">{dbError}</span>
                <span className="text-xs opacity-75">Run FULL_RESET.sql in Supabase SQL Editor to fix RLS policies</span>
              </div>
            )}
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
            {viewMode === 'universe' && (
              <RelationshipUniverse
                members={filteredMembers}
                selfMemberId={selfMember?.id ?? null}
                selectedMemberId={selectedMemberId}
                onSelectMember={handleSelectUniverseMember}
                pathHighlight={pfPathSequence.length > 0 ? { nodes: pfPathNodes, edges: pfPathEdges, sequence: pfPathSequence } : undefined}
                onOpenPathFinder={handleOpenPathFinder}
                onOpenMemberDetail={handleOpenSelectedMemberDetail}
                pathFinderOpen={pathFinderOpen}
                detailPanelOpen={!!detailMemberId && !showAIWidget && !showInviteWidget && !pathFinderOpen}
                onAddMember={() => setIsAddDialogOpen(true)}
                loading={!isDemoMode && (dbLoading || authLoading)}
              />
            )}

            {/* ── Relationship Intelligence suggestions banner ──────── */}
            {viewMode === 'universe' && pendingSuggestions.length > 0 && (
              <RelationshipSuggestionsBanner
                suggestions={pendingSuggestions}
                onAccept={async (actions: RelationshipAction[]) => {
                  for (const action of actions) {
                    const target = members.find(m => m.id === action.memberId)
                    if (!target) continue
                    if (action.field === 'spouseIds') {
                      const updated = [...new Set([...target.spouseIds, action.value])]
                      await dbUpdateMember(action.memberId, { spouseIds: updated })
                    }
                  }
                  toast({ title: 'Connected!', description: 'Relationship updated in the tree.' })
                }}
                onDismiss={(id) => setPendingSuggestions(prev => prev.filter(s => s.id !== id))}
                onDismissAll={() => setPendingSuggestions([])}
              />
            )}

            {/* Phase 2.5 — Relationship exploration trail (breadcrumb GPS) */}
            {viewMode === 'universe' && explorationTrail.length > 0 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-[90vw] pointer-events-auto">
                <div
                  className="flex items-center gap-1.5 rounded-full border backdrop-blur-md px-3 py-1.5 shadow-lg overflow-x-auto"
                  style={{
                    background: 'var(--universe-trail-bg)',
                    borderColor: 'var(--universe-trail-border)',
                    color: 'var(--universe-trail-text)',
                    maxWidth: '90vw',
                  }}
                >
                  <button
                    onClick={handleTrailClear}
                    className="text-[11px] font-medium whitespace-nowrap opacity-70 hover:opacity-100 transition-opacity px-1"
                    title="Clear exploration trail"
                  >
                    You
                  </button>
                  {explorationTrail.map((id, idx) => {
                    const m = members.find((mm) => mm.id === id)
                    if (!m) return null
                    const isLast = idx === explorationTrail.length - 1
                    return (
                      <div key={`${id}-${idx}`} className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] opacity-40">›</span>
                        <button
                          onClick={() => handleTrailJump(id)}
                          className="text-[11px] font-medium whitespace-nowrap transition-all px-1 rounded"
                          style={{
                            color: isLast ? 'var(--universe-trail-active)' : 'var(--universe-trail-text)',
                            fontWeight: isLast ? 600 : 500,
                          }}
                          title={`Jump to ${m.name}`}
                        >
                          {m.name.split(' ')[0]}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Mobile member list FAB — only on small screens in graph/universe modes */}
            {isMobile && (viewMode === 'graph' || viewMode === 'universe') && (
              <button
                onClick={() => setMemberListOpen(true)}
                className="absolute bottom-[3.75rem] left-4 z-30 flex items-center gap-2 rounded-full border border-border/40 px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-md transition-all active:scale-95"
                style={{ background: 'var(--surface-header)' }}
              >
                <Users2 className="h-4 w-4" />
                <span>Members</span>
              </button>
            )}

            {/* Mobile member list bottom sheet */}
            {isMobile && (
              <Drawer open={memberListOpen} onOpenChange={setMemberListOpen} direction="bottom">
                <DrawerContent className="max-h-[82vh] overflow-y-auto">
                  <MemberListSidebar
                    members={filteredMembers}
                    selectedMemberId={selectedMemberId}
                    onSelectMember={(id) => { handleSelectMember(id); setMemberListOpen(false) }}
                    maxDegree={maxDegree}
                    onMaxDegreeChange={setMaxDegree}
                    totalCount={isDemoMode ? members.length : dbTotalCount}
                    isCollapsed={false}
                    onToggleCollapse={() => { }}
                  />
                </DrawerContent>
              </Drawer>
            )}

            {/* Presence avatars — top right of canvas */}
            {viewMode === 'graph' && FEATURE_FLAGS.enablePresenceAvatars && (
              <div className="absolute top-3 right-3 z-20">
                <PresenceAvatars isDemoMode={isDemoMode} />
              </div>
            )}

            {/* Live activity feed — bottom left of canvas (visible when no member selected) */}
            {viewMode === 'graph' && FEATURE_FLAGS.enableLiveActivityWidget && (
              <div className="absolute bottom-4 left-4 z-20">
                <LiveActivityFeed isDemoMode={isDemoMode} />
              </div>
            )}
          </main>

          {/* AI Widget */}
          {FEATURE_FLAGS.enableAICopilot && showAIWidget && (
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

          {/* Path Finder Panel */}
          {pathFinderOpen && viewMode === 'universe' && !showAIWidget && !showInviteWidget && (
            <aside className="w-80 shrink-0 xl:w-96 h-full min-h-0 overflow-hidden border-l border-border/40">
              <PathFinderPanel
                members={filteredMembers}
                pfFrom={pfFrom}
                pfTo={pfTo}
                pfFromSearch={pfFromSearch}
                pfToSearch={pfToSearch}
                pathSequence={pfPathSequence}
                onPfFromChange={setPfFrom}
                onPfToChange={setPfTo}
                onPfFromSearchChange={setPfFromSearch}
                onPfToSearchChange={setPfToSearch}
                onSelectMember={handleSelectMember}
                onClose={() => {
                  setPathFinderOpen(false)
                  setPfFrom(''); setPfTo(''); setPfFromSearch(''); setPfToSearch('')
                  setPfPathNodes(new Set()); setPfPathEdges(new Set()); setPfPathSequence([])
                }}
                selfMemberId={selfMember?.id ?? null}
              />
            </aside>
          )}

          {/* Member Detail — aside on desktop, bottom sheet on mobile */}
          {selectedMember && !showAIWidget && !showInviteWidget && !pathFinderOpen && !isMobile && (
            <aside className="w-80 shrink-0 xl:w-96 h-full overflow-hidden">
              <MemberDetail
                member={selectedMember}
                allMembers={members}
                onClose={closeMemberDetail}
                onEdit={() => setEditingMember(selectedMember)}
                onDelete={() => setIsDeleteDialogOpen(true)}
                onAddStory={() => setIsStoryDialogOpen(true)}
                onInvite={() => { closeMemberDetail(); setShowInviteWidget(true) }}
                isAdmin={!!profile && (profile as { role?: string }).role === 'admin'}
                currentUserId={user?.id}
                selfMemberId={selfMember?.id ?? null}
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

          {/* Member Detail — mobile bottom sheet */}
          {isMobile && (
            <Drawer
              open={!!selectedMember && !showAIWidget && !showInviteWidget}
              onOpenChange={(open) => { if (!open) closeMemberDetail() }}
              direction="bottom"
            >
              <DrawerContent className="h-[88vh] flex flex-col overflow-hidden">
                {selectedMember && (
                  <MemberDetail
                    member={selectedMember}
                    allMembers={members}
                    onClose={closeMemberDetail}
                    onEdit={() => setEditingMember(selectedMember)}
                    onDelete={() => setIsDeleteDialogOpen(true)}
                    onAddStory={() => setIsStoryDialogOpen(true)}
                    onInvite={() => { closeMemberDetail(); setShowInviteWidget(true) }}
                    isAdmin={!!profile && (profile as { role?: string }).role === 'admin'}
                    currentUserId={user?.id}
                    selfMemberId={selfMember?.id ?? null}
                    onSetVisibility={async (memberId, v) => {
                      try {
                        await setVisibility(memberId, v)
                        toast({ title: 'Visibility updated' })
                      } catch (e: unknown) {
                        toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
                      }
                    }}
                  />
                )}
              </DrawerContent>
            </Drawer>
          )}

          {/* Feed panel */}
          {showFeed && !selectedMember && !showAIWidget && !showInviteWidget && (
            <aside className="w-80 shrink-0 border-l border-border/40 backdrop-blur-xl" style={{ background: 'var(--surface-header)' }}>
              <FamilyFeedPanel onClose={() => setShowFeed(false)} feedItems={feedItems} />
            </aside>
          )}
        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <AddMemberDialog
        open={isAddDialogOpen || !!editingMember}
        onOpenChange={(open) => { if (!open) { setIsAddDialogOpen(false); setEditingMember(null) } }}
        existingMembers={members}
        onAdd={handleAddMember}
        onUpdate={handleUpdateMember}
        editingMember={editingMember}
        familyId={familyId ?? undefined}
        currentUserId={user?.id}
        selfMemberId={selfMember?.id ?? null}
      />
      <SearchDialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen} members={members} onSelectMember={handleSelectMember} />
      <AIInsightsDialog open={isAIInsightsOpen} onOpenChange={setIsAIInsightsOpen} members={members} />
      <AddStoryDialog open={isStoryDialogOpen} onOpenChange={setIsStoryDialogOpen} member={selectedMember || null} onAdd={handleAddStory} />
      <SettingsDialog open={isSettingsOpen} onOpenChange={(v) => { setIsSettingsOpen(v); if (!v) setSettingsDefaultTab('general') }} onExport={handleExport} onImport={handleImport} defaultTab={settingsDefaultTab} />
      <LinkFamilyDialog
        open={isLinkFamilyOpen}
        onOpenChange={setIsLinkFamilyOpen}
        myFamilyName={(profile as any)?.family_name ?? 'My Family'}
        linkedFamilies={linkedFamilies}
        members={members.filter(m => m.networkGroup !== 'affiliated')}
        onSendRequest={sendLinkRequest}
      />
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

function FamilyFeedPanel({ onClose, feedItems }: { onClose: () => void; feedItems: FamilyEvent[] }) {
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
