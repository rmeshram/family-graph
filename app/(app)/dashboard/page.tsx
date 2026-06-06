'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFocusMode } from '@/app/(app)/layout'
import { FamilyMember, Story, FamilyEvent } from '@/lib/types'
import { sampleFamilyMembers } from '@/lib/sample-data'
import { filterByDegree, computeProfileCompleteness, copyToClipboard } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useMembers, useStories, usePrivacySettings } from '@/hooks/use-members'
import { useInvites } from '@/hooks/use-invites'
import { useLinkedFamilies } from '@/hooks/use-linked-families'
import { LinkFamilyDialog } from '@/components/link-family-dialog'
import { FamilyLinkRequestsBanner } from '@/components/family-link-requests-banner'
import { FamilyTree } from '@/components/family-tree'
import { MemberListSidebar } from '@/components/member-list-sidebar'
import { MemberDetail } from '@/components/member-detail'
import { MobileNodeMenu } from '@/components/mobile-node-menu'
import { AddMemberDialog } from '@/components/add-member-dialog'
import { QuickAddMemberDialog, type QuickRelType, QUICK_REL_LABELS } from '@/components/quick-add-member-dialog'
import { SearchDialog } from '@/components/search-dialog'
import { AIInsightsDialog } from '@/components/ai-insights-dialog'
import { AddStoryDialog } from '@/components/add-story-dialog'
import { SettingsDialog } from '@/components/settings-dialog'
import { DuplicateMergeDialog } from '@/components/duplicate-merge-dialog'
import { LiveActivityFeed, PresenceAvatars } from '@/components/live-activity-feed'
import { ClaimNodeDialog } from '@/components/claim-node-dialog'
import { RelationshipOnboardingDialog } from '@/components/relationship-onboarding-dialog'
import { InviteToClaimDialog } from '@/components/invite-to-claim-dialog'
import { SuggestedNodesBanner } from '@/components/suggested-nodes-banner'
import { SuggestedMergesBanner } from '@/components/suggested-merges-banner'
import { RelationshipUniverse } from '@/components/relationship-universe'
import { HierarchicalTree } from '@/components/hierarchical-tree'
import { PathFinderPanel } from '@/components/path-finder-panel'
import { enrichMembersWithDerivedEdges } from '@/lib/relation-engine'
import { RelationshipSuggestionsBanner } from '@/components/relationship-suggestions-banner'
import { DuplicateDetectionBanner } from '@/components/duplicate-detection-banner'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { FamilyMissionPanel } from '@/components/family-mission-panel'
import { computePostAddSuggestions, getRelationshipBetweenPeople, type RelationshipSuggestion, type RelationshipAction, type RelationshipResult } from '@/lib/relationship-engine'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NodeActionRing } from '@/components/node-action-ring'
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
import { QRCodeSVG } from 'qrcode.react'
import {
  GitBranch, GitMerge, Sparkles, UserPlus, Search, Settings,
  X, Home, Activity, MessageCircle,
  Copy, Check, Send, Bot, ChevronRight, List, Network, Users2,
  Link2, TreePine, Eye, Crown, AlertTriangle, UserCheck, Shield, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { normalizeStoredName, findExactNameMatch } from '@/lib/match-detection'

// ─── FamilyTreeSkeleton ────────────────────────────────────────────────────
// Mimics the hierarchical tree: grandparents → parents → self+spouse → children.
// Uses the same `animate-pulse` pattern as the layout shell skeleton.
function TreeNodeSkel({ w, highlight = false }: { w: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-3 flex flex-col items-center gap-2 ${highlight ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-muted/15'}`}
      style={{ width: w + 16 }}
    >
      <Skeleton className={`h-10 w-10 rounded-full ${highlight ? 'bg-primary/20' : ''}`} />
      <Skeleton className="h-2.5 rounded-full" style={{ width: w * 0.6 }} />
      <Skeleton className="h-2 rounded-full" style={{ width: w * 0.4 }} />
    </div>
  )
}

function FamilyTreeSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 pointer-events-none select-none overflow-hidden px-4 animate-pulse">
      {/* grandparents */}
      <div className="flex items-end gap-14 md:gap-20">
        {[80, 72].map((w, i) => <TreeNodeSkel key={i} w={w} />)}
      </div>
      {/* parents */}
      <div className="flex items-end gap-10 md:gap-16">
        {[72, 68].map((w, i) => <TreeNodeSkel key={i} w={w} />)}
      </div>
      {/* self + spouse */}
      <div className="flex items-end gap-6 md:gap-10">
        {([68, 64, 60] as const).map((w, i) => <TreeNodeSkel key={i} w={w} highlight={i === 1} />)}
      </div>
      {/* children */}
      <div className="flex items-end gap-10 md:gap-14">
        {[56, 52].map((w, i) => <TreeNodeSkel key={i} w={w} />)}
      </div>
    </div>
  )
}


type TreeViewMode = 'graph' | 'orgchart' | 'list' | 'universe' | 'tree'

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

function OrgChartView({ members, onSelect, selectedId, onAddRelative }: {
  members: FamilyMember[]
  onSelect: (id: string) => void
  selectedId: string | null
  onAddRelative?: (anchorId: string, relType: QuickRelType) => void
}) {
  const byGen = useMemo(() => {
    const map = new Map<number, FamilyMember[]>()
    members.forEach(m => {
      if (!map.has(m.generation)) map.set(m.generation, [])
      map.get(m.generation)!.push(m)
    })
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [members])

  const [ringNodeId, setRingNodeId] = useState<string | null>(null)

  // 4s idle auto-dismiss
  useEffect(() => {
    if (!ringNodeId) return
    const t = setTimeout(() => setRingNodeId(null), 4000)
    return () => clearTimeout(t)
  }, [ringNodeId])

  // ESC dismiss
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setRingNodeId(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Sync with external selection
  useEffect(() => {
    setRingNodeId(prev => (prev && prev !== selectedId ? null : prev))
  }, [selectedId])

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
                <div key={m.id} className="relative">
                  <button
                    onClick={() => { setRingNodeId(m.id); onSelect(m.id) }}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-2xl border p-3 w-28 transition-all hover:-translate-y-0.5 hover:shadow-lg',
                      selectedId === m.id
                        ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                        : 'border-border/50 bg-card hover:border-primary/30'
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      {m.photoUrl && <AvatarImage src={m.photoUrl} alt={m.name} className="object-cover" />}
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
                  {ringNodeId === m.id && onAddRelative && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-20">
                      <NodeActionRing member={m} allMembers={members} onAddRelative={onAddRelative} />
                    </div>
                  )}
                </div>
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
          {byGen.length === 0 && listSearch ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No members match "{listSearch}"</p>
              <p className="text-[11px] text-muted-foreground/60">Try a different name</p>
            </div>
          ) : (
            byGen.map(([gen, genMembers]) => (
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
            ))
          )}
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
  const [inviteRole, setInviteRole] = useState<'contributor' | 'viewer'>('contributor')

  const generateLink = useCallback((role: 'contributor' | 'viewer') => {
    if (!familyId || !userId) return
    setLink(null)
    setGenerating(true)
    createInviteLink(role, 72, userId)
      .then(result => setLink(result.link))
      .catch(() => {/* silently fall back to placeholder */ })
      .finally(() => setGenerating(false))
  }, [familyId, userId, createInviteLink])

  // Generate a real invite link on mount (for authenticated users with a family)
  useEffect(() => {
    generateLink(inviteRole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, userId])

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
          {/* Role picker — controls who the link invites as */}
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
            {(['contributor', 'viewer'] as const).map(r => (
              <button
                key={r}
                onClick={() => { setInviteRole(r); generateLink(r) }}
                className={cn(
                  'flex-1 rounded-md py-1 text-[10px] font-semibold transition-colors',
                  inviteRole === r
                    ? 'bg-card text-foreground shadow-sm border border-border/50'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r === 'contributor' ? '✏️ Contributor' : '👁 Viewer'}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {inviteRole === 'contributor' ? 'Can add and edit family members' : 'Can view only — cannot edit'}
          </p>
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
            {displayLink ? (
              <div className="relative rounded-xl bg-white p-2 shadow-inner">
                <QRCodeSVG
                  value={displayLink}
                  size={96}
                  bgColor="#ffffff"
                  fgColor="#111827"
                  level="M"
                />
              </div>
            ) : (
              <div className="inline-flex h-24 w-24 items-center justify-center rounded-xl bg-muted/40 border border-border/50 text-[10px] text-muted-foreground">
                Generate link first
              </div>
            )}
          </div>
          <Link href="/invite"><Button variant="outline" size="sm" className="h-7 text-xs w-full">Full QR &amp; Options</Button></Link>
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
  const { user, familyId, profile, loading: authLoading, refreshProfile } = useAuth()
  const router = useRouter()
  const { setFocusMode } = useFocusMode()
  const { members: dbMembers, loading: dbLoading, error: dbError, totalCount: dbTotalCount, addMember: dbAddMember, updateMember: dbUpdateMember, deleteMember: dbDeleteMember, claimMember, setVisibility, setAnonymous, refetch: refetchMembers } = useMembers(familyId)
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

  // After a phone-based claim, /dashboard?claimed=NODE_ID focuses the claimed node.
  // We read from window.location (client-only) to avoid requiring Suspense.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const claimedId = new URLSearchParams(window.location.search).get('claimed')
    if (claimedId) setSelectedMemberId(claimedId)
  }, [])

  // ?welcome=1 is appended by onboarding — show first-step overlay once.
  // ?view=tree (from sidebar "View Details") switches to the tree view with the Family Mission panel.
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('welcome') === '1') {
      setShowWelcomeOverlay(true)
    }
    if (params.get('view') === 'tree') {
      setViewMode('tree')
    }
    // Clean any handled params from URL without a page reload
    if (params.has('welcome') || params.has('view')) {
      const url = new URL(window.location.href)
      url.searchParams.delete('welcome')
      url.searchParams.delete('view')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // Guard: if the user has no family_id yet, they skipped onboarding — send them back.
  // This handles back-button bypasses and direct /dashboard navigation after email signup.
  useEffect(() => {
    if (authLoading || isDemoMode) return
    if (user && !(profile as any)?.family_id) {
      router.replace('/onboarding')
    }
  }, [authLoading, isDemoMode, user, profile, router])

  // Mobile-only: tracks which node was tapped to show the compact context menu.
  // The full MemberDetail drawer only opens after the user taps "View Full Profile".
  const [mobileMenuMemberId, setMobileMenuMemberId] = useState<string | null>(null)
  // When set, MobileNodeMenu is opened in admin long-press mode (shows delete etc.)
  const [longPressMemberId, setLongPressMemberId] = useState<string | null>(null)
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
  const [isDuplicateMergeOpen, setIsDuplicateMergeOpen] = useState(false)

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
  const [isRelOnboardingOpen, setIsRelOnboardingOpen] = useState(false)
  const [inviteToClaimTarget, setInviteToClaimTarget] = useState<FamilyMember | null>(null)
  // Tracks which NBA label was dismissed — auto-resets when the recommended action changes
  const [nbaDismissedLabel, setNbaDismissedLabel] = useState<string | null>(null)
  // ── Relationship intelligence suggestions ─────────────────────────────────
  const [pendingSuggestions, setPendingSuggestions] = useState<RelationshipSuggestion[]>([])
  const [mergeScanTrigger, setMergeScanTrigger] = useState(1) // start at 1 so scan fires on first member load
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [showFeed, setShowFeed] = useState(false)
  const [showMissionDrawer, setShowMissionDrawer] = useState(false)
  const [viewMode, setViewMode] = useState<TreeViewMode>(
    FEATURE_FLAGS.enableHierarchicalTreeView ? 'tree' : 'universe'
  )
  const [forceSpeedWizard, setForceSpeedWizard] = useState(false)
  const [showAIWidget, setShowAIWidget] = useState(false)
  const [showInviteWidget, setShowInviteWidget] = useState(false)
  const [memberListOpen, setMemberListOpen] = useState(false)
  // Quick-add relative inline UX
  const [quickAdd, setQuickAdd] = useState<{ anchorId: string; relType: QuickRelType } | null>(null)

  // ── Path Finder state ──────────────────────────────────────────────────────
  const [pathFinderOpen, setPathFinderOpen] = useState(false)
  const [pfFrom, setPfFrom] = useState('')
  const [pfTo, setPfTo] = useState('')
  const [pfFromSearch, setPfFromSearch] = useState('')
  const [pfToSearch, setPfToSearch] = useState('')
  const [pfPathNodes, setPfPathNodes] = useState<Set<string>>(new Set())
  const [pfPathEdges, setPfPathEdges] = useState<Set<string>>(new Set())
  const [pfPathSequence, setPfPathSequence] = useState<string[]>([])

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

  // Focus mode: hide sidebar when user has 0 members (new user, nothing to navigate to).
  // Restore sidebar when they leave the dashboard or add their first member.
  useEffect(() => {
    setFocusMode(!isDemoMode && !dbLoading && !authLoading && members.length === 0)
    return () => setFocusMode(false)
  }, [isDemoMode, dbLoading, authLoading, members.length, setFocusMode])

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

  // Canonical self resolver: exactly one source of truth at a time.
  // Priority: profiles.member_id -> unique claimed_by_user_id mapping.
  // We never infer self from static relationship labels in production data.
  // ── Identity resolution ─────────────────────────────────────────────────────
  //
  // Identity (YOU binding) is a SEPARATE layer from the graph.
  //
  //  Three distinct states that must NEVER be collapsed into a fallback:
  //
  //   access_revoked  — admin removed access; node still exists; YOU removed.
  //                     Do NOT fall through to another node.
  //
  //   node_deleted    — admin deleted the node from the graph; profile.member_id
  //                     is set but points nowhere; YOU removed.
  //                     Do NOT fall through to claimedByUserId scan.
  //
  //   unlinked        — user is in a family but has no member_id at all;
  //                     they haven't claimed/created a node yet.
  //
  // Rule: "YOU is never inferred — it is always explicitly bound."
  // → system must enter UNBOUND USER STATE after revoke / unclaim / deletion.
  // → NEVER auto-assign another node as YOU.

  type IdentityState =
    | 'fully_claimed'    // profile.member_id → node exists, is_claimed=true, claimedByUserId=user
    | 'soft_identified'  // profile.member_id → node exists, but not formally claimed (joined via invite)
    | 'access_revoked'   // profile.member_id → node exists, but claim_status='revoked'
    | 'node_deleted'     // profile.member_id set, but no matching node in this family's member list
    | 'unlinked'         // family joined but no member_id — needs to claim/create a node
    | 'anonymous_explore'// no family or no member_id, just browsing

  const selfResolution = useMemo(() => {
    const profileMemberId = (profile as any)?.member_id as string | null | undefined

    if (isDemoMode) {
      const demoSelf = members.find((m) => m.relationship === 'self')?.id ?? null
      return { id: demoSelf, state: 'fully_claimed' as IdentityState }
    }

    if (profileMemberId) {
      const boundNode = members.find((m) => m.id === profileMemberId)

      if (!boundNode) {
        // Node was deleted from the graph by an admin.
        // DO NOT fall through to claimedByUserId scan — that would auto-assign
        // a different node as YOU, violating the identity separation principle.
        return { id: null, state: 'node_deleted' as IdentityState }
      }

      // Node exists — check access state.
      if (boundNode.claimStatus === 'revoked') {
        // Admin revoked this user's access to the node.
        // The node still exists in the graph but this user no longer owns it.
        // YOU must be removed. DO NOT fall through to another node.
        return { id: null, state: 'access_revoked' as IdentityState }
      }

      // Node exists and access is not revoked — bind as YOU.
      const isFullyClaimed = boundNode.isClaimed && boundNode.claimedByUserId === user?.id
      return {
        id: profileMemberId,
        state: isFullyClaimed ? 'fully_claimed' as IdentityState : 'soft_identified' as IdentityState,
      }
    }

    // No member_id in profile.
    const hasFamilyId = !!(profile as any)?.family_id
    return { id: null, state: hasFamilyId ? 'unlinked' as IdentityState : 'anonymous_explore' as IdentityState }
  }, [isDemoMode, members, profile, user?.id])

  const selfMember = selfResolution.id
    ? (members.find((m) => m.id === selfResolution.id) ?? null)
    : null

  const identityState = isDemoMode ? 'fully_claimed' : selfResolution.state

  // Legacy alias — components still reference identityMode; keep in sync.
  const identityMode = (identityState === 'fully_claimed' || identityState === 'soft_identified')
    ? identityState
    : 'anonymous_explore'

  // Only used to drive banners — computed after auth + db have settled.
  const settled = !authLoading && !dbLoading && !isDemoMode && members.length > 0

  // Relationship perspective is only meaningful when the viewer has a *claimed*
  // Relationship labels: enabled for fully_claimed AND soft_identified users.
  // In soft_identified mode the labels reflect the admin's perspective (e.g., "Father")
  // which is correct for the node's role in the tree even if the viewer hasn't claimed yet.
  // Hiding all labels left invited users with an unlabelled graph — worse UX than imprecise labels.
  const relationshipPerspectiveEnabled = isDemoMode || identityState === 'fully_claimed' || identityState === 'soft_identified'
  // Relationship intelligence (Path Finder) is also enabled for soft_identified
  // users — their structural position in the tree is known even without a claimed
  // profile, so BFS-computed paths are meaningful.
  const relationshipIntelligenceEnabled = isDemoMode || identityState === 'fully_claimed' || identityState === 'soft_identified'
  const fullRelationshipActivation = isDemoMode || identityState === 'fully_claimed'

  const displayMembers = useMemo(() => {
    if (relationshipPerspectiveEnabled) return members
    return members.map((m) => ({ ...m, relationship: undefined }))
  }, [members, relationshipPerspectiveEnabled])

  // ── Path Finder — canonical graph engine ─────────────────────────────────────
  // Single useMemo delegates to getRelationshipBetweenPeople (the one source of
  // truth). No custom adjacency map, no duplicate BFS implementation.
  // Placed after selfMember so we can use the authoritatively-resolved identity
  // (profile.member_id / claimedByUserId) for enrichment — not relationship === 'self',
  // which is only set in demo data, not in real user records.
  const pfResult = useMemo<RelationshipResult | null>(() => {
    if (!pfFrom || !pfTo || pfFrom === pfTo) return null
    // Use the full `members` array (includes linked-family members shown in the picker).
    // dbMembers would exclude linked members, causing NOT_FOUND when a linked member is selected.
    const base = isDemoMode ? sampleFamilyMembers : members

    const compute = (anchorId: string | null | undefined): RelationshipResult => {
      const enriched = anchorId ? enrichMembersWithDerivedEdges(base, anchorId) : base
      const fromM = enriched.find(m => m.id === pfFrom)
      const fromLabel = pfFrom === selfMember?.id
        ? 'your'
        : `${fromM?.name?.split(' ')[0] ?? ''}'s`
      return getRelationshipBetweenPeople(enriched, pfFrom, pfTo, fromLabel)
    }

    // Try anchors in order: self (most semantically accurate) → pfFrom → pfTo → raw BFS.
    // Multiple anchors ensure connectivity even when selfMember is not set (unclaimed profile)
    // or when label-only members have no structural edges anchored at self.
    const r = compute(selfMember?.id ?? null)
    if (r.found) return r
    const r2 = compute(pfFrom)
    if (r2.found) return r2
    const r3 = compute(pfTo)
    if (r3.found) return r3
    const r4 = compute(undefined) // raw BFS, no enrichment
    if (r4.found) return r4

    // 5th attempt: bidirectional enrichment — enrich from pfFrom perspective first, then
    // re-enrich the result from pfTo perspective. Handles cases where pfFrom and pfTo are
    // label-only members whose relationship chains were recorded from different perspectives
    // and only connect when both virtual structures are present simultaneously.
    const enrichedBoth = enrichMembersWithDerivedEdges(
      enrichMembersWithDerivedEdges(base, pfFrom),
      pfTo,
    )
    const fromMB = enrichedBoth.find(m => m.id === pfFrom)
    const fromLabelB = pfFrom === selfMember?.id
      ? 'your'
      : `${fromMB?.name?.split(' ')[0] ?? ''}'s`
    return getRelationshipBetweenPeople(enrichedBoth, pfFrom, pfTo, fromLabelB)
  }, [pfFrom, pfTo, isDemoMode, members, selfMember])

  useEffect(() => {
    if (pfResult?.found && pfResult.people.length > 0) {
      // Filter virtual structural anchors — only real member IDs reach the UI
      const seq = pfResult.people.filter(id => !id.startsWith('__virt_'))
      setPfPathSequence(seq)
      setPfPathNodes(new Set(seq))
      const edgeKeys = new Set<string>()
      for (let i = 0; i < seq.length - 1; i++) {
        edgeKeys.add([seq[i], seq[i + 1]].sort().join('|'))
      }
      setPfPathEdges(edgeKeys)
    } else {
      setPfPathNodes(new Set()); setPfPathEdges(new Set()); setPfPathSequence([])
    }
  }, [pfResult])

  const isAdmin = !isDemoMode && (profile as any)?.role === 'admin'
  const isViewer = !isDemoMode && (profile as any)?.role === 'viewer'
  // Contributors (non-viewer, non-admin logged-in users) can add AND delete unclaimed nodes.
  // Admins can delete any node (including claimed ones). Contributors are blocked from
  // archiving a node that is claimed by a different user — that requires an admin.
  // The logged-in user's own node can NEVER be deleted by anyone.
  const canDelete = !isDemoMode && !isViewer && !!user

  // ── Progressive onboarding checklist data ────────────────────────────────────
  const checklistHasStories = useMemo(() =>
    Object.values(storiesByMember).some(stories => stories.length > 0),
    [storiesByMember]
  )
  const checklistHasOtherClaims = useMemo(() =>
    members.some(m => m.isClaimed && m.claimedByUserId && m.claimedByUserId !== user?.id),
    [members, user?.id]
  )

  // ── Next Best Action ─────────────────────────────────────────────────────────────────
  // Computes ONE specific step the user should take right now, in priority order:
  // add father → add mother → invite each parent → add grandparents → invite others.
  // Pure client computation, no extra fetches. Returns null when tree is well-built.
  const nextBestAction = useMemo<{
    icon: string; label: string; sublabel: string
    ctaText: string; isWhatsApp: boolean
    targetMember: FamilyMember | null
    anchorId: string | null; relType: QuickRelType | null
  } | null>(() => {
    if (isDemoMode || isViewer || !selfMember) return null
    const sid = selfMember.id
    const selfPids = selfMember.parentIds ?? []
    const father = members.find(m => selfPids.includes(m.id) && m.gender === 'male')
      ?? members.find(m => (m as any).relationship === 'father')
    const mother = members.find(m => selfPids.includes(m.id) && m.gender === 'female')
      ?? members.find(m => (m as any).relationship === 'mother')
    if (!father) return { icon: '👨', label: 'Add your father', sublabel: 'Start building your ancestry', ctaText: 'Add Father', isWhatsApp: false, targetMember: null, anchorId: sid, relType: 'father' }
    if (!mother) return { icon: '👩', label: 'Add your mother', sublabel: 'Complete your core family', ctaText: 'Add Mother', isWhatsApp: false, targetMember: null, anchorId: sid, relType: 'mother' }
    if (!father.isClaimed) return { icon: '💌', label: `Invite ${father.name.split(' ')[0]} to claim their profile`, sublabel: 'They can add their parents & siblings', ctaText: 'Invite via WhatsApp', isWhatsApp: true, targetMember: father, anchorId: null, relType: null }
    if (!mother.isClaimed) return { icon: '💌', label: `Invite ${mother.name.split(' ')[0]} to claim their profile`, sublabel: 'They can add their parents & siblings', ctaText: 'Invite via WhatsApp', isWhatsApp: true, targetMember: mother, anchorId: null, relType: null }
    const fPids = father.parentIds ?? []
    const hasPGf = fPids.some(pid => members.find(m => m.id === pid)?.gender === 'male')
    const hasPGm = fPids.some(pid => members.find(m => m.id === pid)?.gender === 'female')
    if (!hasPGf) return { icon: '👴', label: `Add ${father.name.split(' ')[0]}'s father`, sublabel: 'Your paternal grandfather', ctaText: 'Add Grandfather', isWhatsApp: false, targetMember: null, anchorId: father.id, relType: 'father' }
    if (!hasPGm) return { icon: '👵', label: `Add ${father.name.split(' ')[0]}'s mother`, sublabel: 'Your paternal grandmother', ctaText: 'Add Grandmother', isWhatsApp: false, targetMember: null, anchorId: father.id, relType: 'mother' }
    const unclaimedOther = members.find(m => !m.isClaimed && m.id !== sid && m.id !== father.id && m.id !== mother.id)
    if (unclaimedOther) return { icon: '💌', label: `Invite ${unclaimedOther.name.split(' ')[0]} to join`, sublabel: "They haven't claimed their profile yet", ctaText: 'Invite via WhatsApp', isWhatsApp: true, targetMember: unclaimedOther, anchorId: null, relType: null }
    return null
  }, [isDemoMode, isViewer, selfMember, members])

  // Account-level privacy settings for the current user — used for contact info masking
  const { settings: myPrivacySettings } = usePrivacySettings(isDemoMode ? undefined : user?.id)
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

  const filteredDisplayMembers = useMemo(() => {
    if (relationshipPerspectiveEnabled) return filteredMembers
    const idSet = new Set(filteredMembers.map((m) => m.id))
    return displayMembers.filter((m) => idSet.has(m.id))
  }, [displayMembers, filteredMembers, relationshipPerspectiveEnabled])

  const { toast } = useToast()
  // Both universe and graph view only show the full sidebar when detailMemberId is set.
  // Node selection in graph view shows the lightweight popup card in FamilyTree;
  // the sidebar opens only after the user clicks "View Profile" in that card.
  const selectedMember = members.find((m) => m.id === detailMemberId) ?? null
  const selectedMemberDisplay = selectedMember && !relationshipPerspectiveEnabled
    ? { ...selectedMember, relationship: undefined }
    : selectedMember

  const closeMemberDetail = useCallback(() => {
    setDetailMemberId(null)
    setMobileMenuMemberId(null)
  }, [])

  // Mobile: tap node → compact context menu (not full detail)
  const handleSelectMemberMobile = useCallback((id: string) => {
    setMobileMenuMemberId(prev => prev === id ? null : id)
    setLongPressMemberId(null)
    setExplorationTrail((trail) => {
      if (trail[trail.length - 1] === id) return trail
      const existingIdx = trail.indexOf(id)
      if (existingIdx !== -1) return trail.slice(0, existingIdx + 1)
      return [...trail, id].slice(-8)
    })
  }, [])

  // Mobile: 500ms hold on a node → open compact menu in admin long-press mode
  const handleLongPressMemberMobile = useCallback((id: string) => {
    setMobileMenuMemberId(id)
    setLongPressMemberId(id)
  }, [])

  // Mobile: "View Full Profile" from context menu → open full drawer
  const handleOpenMobileDetail = useCallback(() => {
    if (mobileMenuMemberId) {
      setSelectedMemberId(mobileMenuMemberId)
      setDetailMemberId(mobileMenuMemberId)
    }
  }, [mobileMenuMemberId])

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

  // Ring: "Profile" button — ensures the member detail panel is visible by closing
  // competing panels (AI, invite, path finder) before selecting the node.
  const handleOpenProfileFromRing = useCallback((id: string) => {
    setShowAIWidget(false)
    setShowInviteWidget(false)
    setPathFinderOpen(false)
    setSelectedMemberId(id)
    setDetailMemberId(id)
    setExplorationTrail((trail) => {
      if (trail[trail.length - 1] === id) return trail
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
      // Safety net: reject exact-name duplicates that somehow bypassed dialog-level checks.
      const duplicate = findExactNameMatch(members, memberData.name)
      if (duplicate) {
        toast({
          title: 'Duplicate name',
          description: `${normalizeStoredName(memberData.name)} is already in this tree. Please use the existing member or choose a different name.`,
          variant: 'destructive',
        })
        return
      }
      const newMember = await dbAddMember(memberData, user.id)
      toast({
        title: `${memberData.name} added`,
        description: 'Invite them to join the family tree?',
        action: newMember ? (
          <button
            className="shrink-0 rounded border border-border bg-transparent px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            onClick={() => setInviteToClaimTarget(newMember)}
          >
            Invite
          </button>
        ) : undefined,
      })
      // Run relationship intelligence: surface actionable suggestions to the user
      if (newMember) {
        const allWithNew = [...members, newMember]
        const suggestions = computePostAddSuggestions(newMember.id, allWithNew)
        if (suggestions.length > 0) setPendingSuggestions(suggestions)
        // Trigger duplicate scan after every successful add
        setMergeScanTrigger(t => t + 1)
      }
    } catch (e: unknown) {
      toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    }
  }, [familyId, user, dbAddMember, toast, members])

  const handleUpdateMember = useCallback(async (id: string, updates: Partial<FamilyMember>) => {
    try {
      await dbUpdateMember(id, updates)
      setEditingMember(null)
      toast({ title: 'Member updated' })
    } catch (e: unknown) {
      toast({ title: 'Update failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    }
  }, [dbUpdateMember, toast])

  // Open the inline quick-add dialog anchored to a specific node
  const handleAddRelative = useCallback((anchorId: string, relType: QuickRelType) => {
    setQuickAdd({ anchorId, relType })
  }, [])

  // Called by QuickAddMemberDialog on submit — creates the new member and handles bidirectional wiring
  const handleQuickAddSubmit = useCallback(async (
    name: string,
    gender: 'male' | 'female' | 'other' | '',
    birthYearStr: string,
    relType: QuickRelType,
    anchorId: string,
  ) => {
    if (!user || !familyId) return
    const anchor = members.find(m => m.id === anchorId)
    if (!anchor) return

    const birthYear = birthYearStr ? parseInt(birthYearStr) : undefined

    // Normalize stored name — collapses extra whitespace, preserves casing
    const storedName = normalizeStoredName(name)

    // Derive parentIds / spouseIds for the new node
    const parentIds: string[] = relType === 'child' ? [anchorId]
      : relType === 'sibling' ? [...(anchor.parentIds ?? [])]
        : [] // father / mother / spouse — no pre-set parents for the new node

    const spouseIds: string[] = relType === 'spouse' ? [anchorId] : []

    const generation =
      relType === 'child' ? (anchor.generation ?? 0) + 1
        : relType === 'father' || relType === 'mother' ? (anchor.generation ?? 0) - 1
          : anchor.generation ?? 0

    const memberData: Omit<FamilyMember, 'id'> = {
      name: storedName,
      gender: (gender || undefined) as FamilyMember['gender'],
      birthYear,
      parentIds,
      spouseIds,
      generation,
      isAlive: true,
      relationship: (
        relType === 'father' ? 'father'
          : relType === 'mother' ? 'mother'
            : relType === 'spouse' ? (gender === 'female' ? 'wife' : 'husband')
              : relType === 'child' ? (gender === 'female' ? 'daughter' : 'son')
                : (gender === 'female' ? 'sister' : 'brother')
      ) as FamilyMember['relationship'],
    }

    const newMember = await dbAddMember(memberData, user.id)
    if (!newMember) return

    // Patch anchor so graph edges are bidirectional for every relationship type
    if (relType === 'father' || relType === 'mother') {
      // New parent: anchor must recognise the new node as its parent
      const updated = [...new Set([...(anchor.parentIds ?? []), newMember.id])]
      await dbUpdateMember(anchorId, { parentIds: updated })
    } else if (relType === 'spouse') {
      // New spouse: anchor must also list the new node as a spouse.
      // Without this the graph has a one-sided edge → BFS traversal fails →
      // the spouse appears as "Father" (or no label) from the anchor's perspective.
      const updated = [...new Set([...(anchor.spouseIds ?? []), newMember.id])]
      await dbUpdateMember(anchorId, { spouseIds: updated })
    } else if (relType === 'sibling') {
      // New sibling via shared parent: ensure the new node also lists the shared parent
      // (it already has it via parentIds set above, but double-check for safety)
    }

    toast({
      title: `${QUICK_REL_LABELS[relType]} added`,
      description: 'Invite them to join the family tree?',
      action: (
        <button
          className="shrink-0 rounded border border-border bg-transparent px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          onClick={() => setInviteToClaimTarget(newMember)}
        >
          Invite
        </button>
      ),
    })
  }, [familyId, user, members, dbAddMember, dbUpdateMember, toast, setInviteToClaimTarget])

  const handleDeleteMember = useCallback(async () => {
    if (!selectedMemberId) return
    if (!familyId) {
      toast({ title: 'Demo mode', description: 'Sign in to manage members.', variant: 'destructive' })
      setIsDeleteDialogOpen(false)
      return
    }
    const memberToDelete = members.find(m => m.id === selectedMemberId)
    // Issue 3: The logged-in user's own node must never be deleted
    if (selectedMemberId === selfMember?.id) {
      toast({ title: 'Cannot archive your own profile', description: 'Your node is the anchor of the family tree and cannot be removed. Contact support if you need to transfer ownership.', variant: 'destructive' })
      setIsDeleteDialogOpen(false)
      return
    }
    // Contributors may not archive a node claimed by a different user
    if (!isAdmin && memberToDelete?.isClaimed && memberToDelete?.claimedByUserId !== user?.id) {
      toast({ title: 'Cannot archive', description: 'This profile is claimed by another member. Ask a family admin to archive it.', variant: 'destructive' })
      setIsDeleteDialogOpen(false)
      return
    }
    try {
      await dbDeleteMember(selectedMemberId)
      setSelectedMemberId(null)
      setIsDeleteDialogOpen(false)
      toast({ title: 'Profile archived', description: `${memberToDelete?.name} has been hidden from the tree. A family admin can restore them at any time.` })
    } catch (e: unknown) {
      toast({ title: 'Could not archive', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
      setIsDeleteDialogOpen(false)
    }
  }, [selectedMemberId, members, familyId, isAdmin, user?.id, dbDeleteMember, toast])

  const handleRevokeClaim = useCallback(async (memberId: string) => {
    try {
      const res = await fetch(`/api/nodes/${memberId}/revoke-claim`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Revoke failed')
      toast({ title: 'Claim revoked', description: 'The profile node is now unclaimed.' })
      refetchMembers()
    } catch (e: unknown) {
      toast({ title: 'Could not revoke', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    }
  }, [toast, refetchMembers])

  // Called after the user unlinks themselves from their own claimed node.
  // Refreshes members + auth profile so the UI reflects the unclaimed state immediately.
  // refreshProfile clears the stale profile.member_id in client state, which
  // makes selfMemberId null → the "Claim This Profile" button reappears on unclaimed nodes.
  const handleUnclaimSelf = useCallback(() => {
    refetchMembers()
    refreshProfile()
    closeMemberDetail()
    toast({ title: 'Profile unlinked', description: 'Your account is no longer linked to that profile. You can claim another node if needed.' })
  }, [refetchMembers, refreshProfile, toast])

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

  // Smart missing-relative nudges: shown as a floating chip strip in graph view
  // when the selected node is missing key relatives. Recalculates on selection change.
  const graphMissingNudges = useMemo(() => {
    if (viewMode !== 'graph' || !selectedMemberId || isDemoMode || isViewer) return []
    const m = members.find(mm => mm.id === selectedMemberId)
    if (!m || m.showAsAnonymous || m.deathYear) return []
    const parents = m.parentIds.flatMap(pid => members.filter(mm => mm.id === pid))
    const hasFather = parents.some(p => p.gender === 'male')
    const hasMother = parents.some(p => p.gender === 'female')
    const hasSpouse = m.spouseIds.length > 0
    return [
      !hasFather && { label: '+Father', type: 'father' as QuickRelType },
      !hasMother && { label: '+Mother', type: 'mother' as QuickRelType },
      !hasSpouse && { label: '+Spouse', type: 'spouse' as QuickRelType },
    ].filter((x): x is { label: string; type: QuickRelType } => !!x)
  }, [viewMode, selectedMemberId, isDemoMode, isViewer, members])

  const VIEW_MODES: { key: TreeViewMode; label: string; icon: React.ElementType }[] = [
    ...(FEATURE_FLAGS.enableHierarchicalTreeView ? [{ key: 'tree' as TreeViewMode, label: 'Tree', icon: TreePine }] : []),
    ...(FEATURE_FLAGS.enableGraphView ? [{ key: 'graph' as TreeViewMode, label: 'Graph', icon: Network }] : []),
    ...(FEATURE_FLAGS.enableOrgChartView ? [{ key: 'orgchart' as TreeViewMode, label: 'Org Chart', icon: GitBranch }] : []),
    { key: 'list', label: 'List', icon: List },
    { key: 'universe', label: 'Universe', icon: Sparkles },
  ]

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">

        {/* Beta Banner */}
        {user && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 shrink-0">
            <div className="container max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-amber-600 font-semibold">🚧 Beta Version</span>
                <span className="text-muted-foreground hidden sm:inline">
                  Expect changes. Found a bug?
                </span>
              </div>
              <a
                href="mailto:support@familygraph.app?subject=Family%20Graph%20Feedback"
                className="text-amber-600 hover:text-amber-700 underline font-medium"
              >
                Send Feedback
              </a>
            </div>
          </div>
        )}

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

        {/* Viewer mode banner */}
        {isViewer && (
          <div className="flex shrink-0 items-center gap-2 border-b border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-[11px] text-blue-400">
            <Eye className="h-3 w-3 shrink-0" />
            <span>You have <strong>view-only access</strong> — contact the family admin to request contributor or admin access</span>
          </div>
        )}

        {/* ── Identity state banners ── three distinct states, never collapsed ── */}

        {/* access_revoked: admin removed this user's access to their node */}
        {settled && identityState === 'access_revoked' && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>You no longer have access to this profile — an admin has removed your claim.</span>
            </div>
            <button
              onClick={() => setIsRelOnboardingOpen(true)}
              className="shrink-0 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium hover:bg-destructive/20 transition-colors whitespace-nowrap"
            >
              Claim another profile →
            </button>
          </div>
        )}

        {/* node_deleted: the node this user claimed was deleted from the graph */}
        {settled && identityState === 'node_deleted' && (
          <div className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Your profile node was removed from the family tree. Ask the family admin to re-add you, then claim your new profile.</span>
          </div>
        )}

        {/* unlinked: in a family but no node claimed/created yet */}
        {settled && identityState === 'unlinked' && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-[11px] text-blue-400">
            <div className="flex items-center gap-2">
              <UserCheck className="h-3 w-3 shrink-0" />
              <span>Claim or add your profile to see relationships from your perspective.</span>
            </div>
            <button
              onClick={() => setIsRelOnboardingOpen(true)}
              className="shrink-0 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20 transition-colors whitespace-nowrap"
            >
              Find my place →
            </button>
          </div>
        )}

        {!isDemoMode && identityMode === 'anonymous_explore' && identityState === 'anonymous_explore' && (
          <div className="flex shrink-0 items-center gap-2 border-b border-sky-500/20 bg-sky-500/5 px-3 py-1.5 text-[11px] text-sky-300">
            <Shield className="h-3 w-3 shrink-0" />
            <span>Explore mode: relationship intelligence is hidden until your identity is verified.</span>
          </div>
        )}

        {/* DB load error banner */}
        {dbError && !isDemoMode && (
          <div className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
            <span>Could not load family data — check your connection and refresh.</span>
            <button onClick={() => window.location.reload()} className="ml-auto shrink-0 underline underline-offset-2 hover:opacity-80">Retry</button>
          </div>
        )}

        {/* ── Top Bar ──────────────────────────────────────────────── */}
        {/* pl-14 on mobile clears the AppSidebar fixed hamburger (left-3 w-9 = 12+36=48px); lg:px-4 restores normal desktop padding */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 pl-14 pr-4 lg:px-4 backdrop-blur-xl" style={{ background: 'var(--surface-header)' }}>
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

          {/* Extended family toggle — shows linked-family count when active */}
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
            {!isDemoMode && linkedMembers.length > 0 && (
              <span className={cn(
                'rounded-full px-1.5 py-px text-[9px] font-bold leading-none',
                showExtended ? 'bg-teal-500/30 text-teal-200' : 'bg-muted-foreground/20 text-muted-foreground'
              )}>
                +{linkedMembers.length}
              </span>
            )}
          </button>

          {/* Network size chip — appears once linked families exist */}
          {!isDemoMode && linkedFamilies.length > 0 && (
            <div
              className="hidden sm:flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/5 px-2 py-1 text-[10px] text-violet-400 shrink-0"
              title={`You are connected to ${members.length} people across ${linkedFamilies.length + 1} families`}
            >
              <Network className="h-3 w-3" />
              <span className="font-semibold">{members.length}</span>
              <span className="text-muted-foreground hidden lg:inline">connected</span>
            </div>
          )}

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
            {!isViewer && (
              <Button variant={showInviteWidget ? 'default' : 'ghost'} size="sm"
                onClick={() => { setShowInviteWidget(v => !v); setShowAIWidget(false) }}
                className={cn('h-8 gap-1.5 text-xs', showInviteWidget ? 'bg-green-500 text-white hover:bg-green-600' : 'text-green-400 hover:bg-green-500/10')}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Invite</span>
              </Button>
            )}

            <div className="hidden sm:block w-px h-5 bg-border/50 mx-0.5" />

            {/* Mission button — mobile only, shows progress badge */}
            {viewMode === 'tree' && !isDemoMode && selfMember && !isViewer && isMobile && (
              <Button
                variant="ghost" size="sm"
                onClick={() => setShowMissionDrawer(true)}
                className="h-8 gap-1 text-xs text-primary hover:bg-primary/10 relative"
              >
                <Target className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mission</span>
              </Button>
            )}

            {!isViewer && (
              <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90">
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add</span>
              </Button>
            )}
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setIsDuplicateMergeOpen(true)}>
                    <GitMerge className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Check for duplicate profiles</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>

            {/* Role badge — always visible so users know their permission level */}
            {!isDemoMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                      isAdmin
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : (profile as any)?.role === 'contributor'
                          ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                          : 'border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {isAdmin ? <Crown className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                    <span className="hidden sm:inline">
                      {isAdmin ? 'Admin' : (profile as any)?.role ?? 'viewer'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {isAdmin
                    ? 'You are the Family Admin — full access'
                    : (profile as any)?.role === 'contributor'
                      ? 'Contributor — can add & edit members'
                      : 'Viewer — read-only access'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </header>

        {/* Profile completeness + FamilyLinkRequestsBanner removed — surfaced in sidebar Family Health widget instead */}

        {/* People You May Know — only once identity is fully verified */}
        {!isDemoMode && fullRelationshipActivation && (
          <div className="px-3 pt-2">
            <SuggestedNodesBanner onClaimed={() => refetchMembers()} />
          </div>
        )}

        {/* Duplicate member suggestions — shown after an add if pairs are detected */}
        {!isDemoMode && !isViewer && (
          <SuggestedMergesBanner
            members={members}
            scanTrigger={mergeScanTrigger}
            isAdmin={isAdmin}
            onMergeComplete={(_primaryId, absorbedId) => {
              dbDeleteMember(absorbedId).catch(() => null)
              refetchMembers()
            }}
          />
        )}

        {/* ── Next Best Action strip — one specific step, highest priority ──────────────
             Resets when the action changes (e.g. father added → strip reappears with mother).
             Never shows two competing nudges at the same time.                               */}
        {/* {!isDemoMode && !isViewer && nextBestAction && nbaDismissedLabel !== nextBestAction.label && (
          <div className="flex items-center gap-3 border-b border-primary/15 bg-primary/5 px-4 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm">
              {nextBestAction.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground leading-snug truncate">{nextBestAction.label}</p>
              <p className="text-[10px] text-muted-foreground">{nextBestAction.sublabel}</p>
            </div>
            <Button
              size="sm"
              className={cn(
                'h-7 shrink-0 gap-1 text-xs font-semibold border-none whitespace-nowrap',
                nextBestAction.isWhatsApp
                  ? 'bg-[#25D366] hover:bg-[#1fba59] text-white'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground'
              )}
              onClick={() => {
                if (nextBestAction.targetMember) setInviteToClaimTarget(nextBestAction.targetMember)
                else if (nextBestAction.anchorId && nextBestAction.relType) handleAddRelative(nextBestAction.anchorId, nextBestAction.relType)
              }}
            >
              {nextBestAction.isWhatsApp && <MessageCircle className="h-3 w-3" />}
              {nextBestAction.ctaText}
            </Button>
            <button
              onClick={() => setNbaDismissedLabel(nextBestAction.label)}
              className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )} */}

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
                members={filteredDisplayMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={handleSelectMember}
                selfMemberId={selfMember?.id ?? null}
                relationshipIntelligenceEnabled={relationshipIntelligenceEnabled}
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

            {/* ── Empty-canvas state — shown when family has no members at all ─────
                Handles: new admin, unlinked user, viewer on empty family.
                This is the highest-priority overlay — prevents blank screen. */}
            {!isDemoMode && !dbLoading && !authLoading && members.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center z-20">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 border border-primary/20">
                  <TreePine className="h-10 w-10 text-primary/50" />
                </div>

                {isViewer ? (
                  <>
                    <div>
                      <h2 className="text-xl font-bold text-foreground mb-2">This family tree is empty</h2>
                      <p className="text-muted-foreground text-sm max-w-xs">
                        You joined as a <strong>viewer</strong>. Ask the family admin to add members, or request contributor access so you can build the tree yourself.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setIsSettingsOpen(true)}
                      className="h-11 px-6 gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Request access
                    </Button>
                  </>
                ) : (identityState === 'unlinked' || !selfMember) ? (
                  <>
                    <div>
                      <h2 className="text-xl font-bold text-foreground mb-2">Welcome! Let's build your tree 🌱</h2>
                      <p className="text-muted-foreground text-sm max-w-xs">
                        Your account is set up — now add yourself to see your family tree come alive.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <Button
                        size="lg"
                        onClick={() => setIsAddDialogOpen(true)}
                        className="h-12 px-8 gap-2 text-base font-semibold"
                      >
                        <UserPlus className="h-5 w-5" />
                        Add yourself first
                      </Button>
                      <Link href="/onboarding">
                        <Button variant="outline" className="h-12 px-6 gap-1.5 text-sm">
                          Or redo setup →
                        </Button>
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <h2 className="text-xl font-bold text-foreground mb-2">Your tree starts here 🌱</h2>
                      <p className="text-muted-foreground text-sm max-w-xs">
                        Add your father or mother — two taps and your tree comes alive.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <Button
                        size="lg"
                        onClick={() => setIsAddDialogOpen(true)}
                        className="h-12 px-8 gap-2 text-base font-semibold"
                      >
                        <UserPlus className="h-5 w-5" />
                        Add a family member
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setShowInviteWidget(true); setShowAIWidget(false) }}
                        className="h-12 px-6 gap-1.5 text-sm"
                      >
                        Invite family instead →
                      </Button>
                    </div>
                  </>
                )}

                {/* Step hint */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground/60">
                  <span className="flex items-center gap-1"><span className="text-green-400">①</span> Add yourself</span>
                  <span>→</span>
                  <span className="flex items-center gap-1"><span className="text-primary/60">②</span> Add parents</span>
                  <span>→</span>
                  <span className="flex items-center gap-1"><span className="text-violet-400/60">③</span> Invite relatives</span>
                </div>
              </div>
            )}

            {/* Ghost-slot parent guide — shown when user has their own node but no parents added */}
            {!isDemoMode && !dbLoading && !authLoading && selfMember &&
              members.length <= 1 && (selfMember.parentIds ?? []).length === 0 &&
              !isViewer && viewMode === 'graph' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 pointer-events-none select-none z-10">
                  {/* Ghost parents */}
                  <div className="flex items-end gap-12">
                    {([{ label: 'Add Father', rel: 'father' as QuickRelType, color: 'blue' }, { label: 'Add Mother', rel: 'mother' as QuickRelType, color: 'pink' }]).map(slot => (
                      <div key={slot.rel} className="flex flex-col items-center gap-2 pointer-events-auto">
                        <button
                          onClick={() => {
                            if (selfMember && handleAddRelative) {
                              handleAddRelative(selfMember.id, slot.rel)
                            } else {
                              setIsAddDialogOpen(true)
                            }
                          }}
                          className={`flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed transition-all hover:scale-105 ${slot.color === 'blue' ? 'border-blue-500/40 bg-blue-500/5 hover:border-blue-500/70 hover:bg-blue-500/10' : 'border-pink-500/40 bg-pink-500/5 hover:border-pink-500/70 hover:bg-pink-500/10'}`}
                        >
                          <span className="text-xl">＋</span>
                        </button>
                        <p className={`text-xs font-medium ${slot.color === 'blue' ? 'text-blue-400/70' : 'text-pink-400/70'}`}>{slot.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Connector lines from parents to self */}
                  <div className="flex items-start gap-12">
                    <div className="w-px h-8 bg-border/30" />
                    <div className="w-px h-8 bg-border/30" />
                  </div>

                  {/* Self node (real, centred) */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/60 bg-primary/10 shadow-lg shadow-primary/10">
                      {selfMember.photoUrl
                        ? <img src={selfMember.photoUrl} alt={selfMember.name} className="h-full w-full rounded-full object-cover" />
                        : <span className="text-lg font-bold text-primary">{selfMember.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>
                      }
                    </div>
                    <p className="text-sm font-semibold text-foreground">{selfMember.name.split(' ')[0]}</p>
                    <p className="text-[10px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">You</p>
                  </div>

                  <p className="text-sm text-muted-foreground/60 text-center max-w-xs mt-2">
                    Tap a slot above to add your parents and start growing the tree
                  </p>
                </div>
              )}
            {viewMode === 'graph' && (
              <FamilyTree
                members={filteredDisplayMembers}
                selfMemberId={selfMember?.id ?? null}
                selectedMemberId={isMobile ? (mobileMenuMemberId ?? selectedMemberId) : selectedMemberId}
                onSelectMember={isMobile ? handleSelectMemberMobile : handleSelectMember}
                onDoubleClickMember={(id) => {
                  setClaimTargetId(id)
                  setIsClaimDialogOpen(true)
                }}
                onAddRelative={!isDemoMode && !isViewer ? handleAddRelative : undefined}
                onOpenProfile={!isMobile ? handleOpenProfileFromRing : undefined}
                onOpenMemberDetail={!isMobile ? handleOpenSelectedMemberDetail : undefined}
                onFindRelationship={!isMobile && relationshipIntelligenceEnabled ? handleOpenPathFinder : undefined}
                onInviteNode={!isDemoMode && !isViewer && !isMobile
                  ? (memberId) => {
                    const m = members.find(m => m.id === memberId)
                    if (m && !m.isClaimed) setInviteToClaimTarget(m)
                  }
                  : undefined}
                onClaimNode={!isDemoMode && user && !isMobile
                  ? (memberId) => { setClaimTargetId(memberId); setIsClaimDialogOpen(true) }
                  : undefined}
                onLongPressMember={isMobile && isAdmin ? handleLongPressMemberMobile : undefined}
                isAdmin={isAdmin}
              />
            )}
            {viewMode === 'orgchart' && (
              <OrgChartView members={filteredDisplayMembers} onSelect={isMobile ? handleSelectMemberMobile : handleSelectMember} selectedId={isMobile ? (mobileMenuMemberId ?? selectedMemberId) : selectedMemberId} onAddRelative={!isDemoMode && !isViewer ? handleAddRelative : undefined} />
            )}
            {viewMode === 'list' && (
              <ListView members={filteredDisplayMembers} onSelect={handleSelectMember} selectedId={selectedMemberId} />
            )}
            {viewMode === 'tree' && FEATURE_FLAGS.enableHierarchicalTreeView && (
              <HierarchicalTree
                members={filteredDisplayMembers}
                selfMemberId={selfMember?.id ?? null}
                userId={user?.id ?? null}
                wizardSkipped={profile?.wizard_skipped ?? []}
                selectedMemberId={selectedMemberId}
                onSelectMember={handleSelectMember}
                onAddRelative={!isDemoMode && !isViewer ? handleAddRelative : undefined}
                onQuickAdd={!isDemoMode && !isViewer ? handleQuickAddSubmit : undefined}
                forceWizard={forceSpeedWizard}
                onOpenProfile={handleOpenProfileFromRing}
                onFindRelationship={relationshipIntelligenceEnabled ? handleOpenPathFinder : undefined}
                onInviteNode={!isDemoMode && !isViewer ? (memberId) => {
                  const m = members.find(m => m.id === memberId)
                  if (m && !m.isClaimed) setInviteToClaimTarget(m)
                } : undefined}
                onClaimNode={!isDemoMode && user ? (memberId) => { setClaimTargetId(memberId); setIsClaimDialogOpen(true) } : undefined}
                onDelete={canDelete ? (memberId) => {
                  if (memberId === selfMember?.id) return // Issue 3: own node is permanent
                  setSelectedMemberId(memberId)
                  setIsDeleteDialogOpen(true)
                } : undefined}
                onOpenMemberDetail={handleOpenSelectedMemberDetail}
                isAdmin={isAdmin}
              />
            )}
            {viewMode === 'universe' && (
              <RelationshipUniverse
                members={filteredDisplayMembers}
                selfMemberId={selfMember?.id ?? null}
                selectedMemberId={selectedMemberId}
                onSelectMember={handleSelectUniverseMember}
                pathHighlight={pfPathSequence.length > 0 ? { nodes: pfPathNodes, edges: pfPathEdges, sequence: pfPathSequence } : undefined}
                onOpenPathFinder={relationshipIntelligenceEnabled ? handleOpenPathFinder : undefined}
                onOpenMemberDetail={handleOpenSelectedMemberDetail}
                pathFinderOpen={pathFinderOpen}
                detailPanelOpen={!!detailMemberId && !showAIWidget && !showInviteWidget && !pathFinderOpen}
                onAddMember={() => setIsAddDialogOpen(true)}
                onAddRelative={!isDemoMode && !isViewer ? handleAddRelative : undefined}
                onInvite={!isDemoMode && !isViewer ? (memberId) => {
                  const m = members.find(m => m.id === memberId)
                  if (m && !m.isClaimed) setInviteToClaimTarget(m)
                } : undefined}
                onClaim={!isDemoMode && user ? (memberId) => { setClaimTargetId(memberId); setIsClaimDialogOpen(true) } : undefined}
                loading={!isDemoMode && (dbLoading || authLoading)}
                isAdmin={isAdmin}
              />
            )}

            {/* ── Duplicate detection banner — admin-only, post-add scan ──────── */}
            {!isDemoMode && isAdmin && members.length > 1 && (
              <DuplicateDetectionBanner
                members={members}
                isAdmin={isAdmin}
              />
            )}

            {/* ── Relationship Intelligence suggestions banner ──────── */}
            {(viewMode === 'universe' || viewMode === 'graph') && fullRelationshipActivation && pendingSuggestions.length > 0 && (
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
            {(viewMode === 'universe' || viewMode === 'graph') && explorationTrail.length > 0 && (
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
                    {identityMode === 'anonymous_explore' ? 'Explore' : 'You'}
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

            {/* Smart missing-relative nudge chip strip — graph view only */}
            {viewMode === 'graph' && graphMissingNudges.length > 0 && selectedMemberId && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                <div
                  className="flex items-center gap-2 rounded-full border backdrop-blur-md px-3 py-1.5 shadow-lg"
                  style={{
                    background: 'var(--universe-trail-bg)',
                    borderColor: 'var(--universe-trail-border)',
                  }}
                >
                  <span
                    className="text-[11px] whitespace-nowrap opacity-60"
                    style={{ color: 'var(--universe-trail-text)' }}
                  >
                    {members.find(mm => mm.id === selectedMemberId)?.name.split(' ')[0]}:
                  </span>
                  {graphMissingNudges.map(n => (
                    <button
                      key={n.type}
                      onClick={() => handleAddRelative(selectedMemberId!, n.type)}
                      className="text-[11px] font-medium rounded-full px-2 py-0.5 border transition-all hover:bg-primary/20 active:scale-95"
                      style={{ color: 'var(--universe-trail-active)', borderColor: 'var(--universe-trail-border)' }}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile member list FAB — hidden when node popup is open (avoids bottom overlap) */}
            {isMobile && (viewMode === 'graph' || viewMode === 'universe')
              && !(viewMode === 'universe' && selectedMemberId && !detailMemberId) && (
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
                    members={filteredDisplayMembers}
                    selectedMemberId={selectedMemberId}
                    onSelectMember={(id) => { handleSelectMember(id); setMemberListOpen(false) }}
                    selfMemberId={selfMember?.id ?? null}
                    relationshipIntelligenceEnabled={relationshipIntelligenceEnabled}
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

          {/* Path Finder Panel — side panel on desktop, bottom sheet on mobile */}
          {pathFinderOpen && viewMode === 'universe' && !showAIWidget && !showInviteWidget && (
            isMobile ? (
              <Drawer open={pathFinderOpen} onOpenChange={(open) => {
                if (!open) {
                  setPathFinderOpen(false)
                  setPfFrom(''); setPfTo(''); setPfFromSearch(''); setPfToSearch('')
                  setPfPathNodes(new Set()); setPfPathEdges(new Set()); setPfPathSequence([])
                }
              }} direction="bottom">
                <DrawerContent className="max-h-[75vh] overflow-y-auto">
                  <PathFinderPanel
                    members={filteredMembers}
                    pfFrom={pfFrom}
                    pfTo={pfTo}
                    pfFromSearch={pfFromSearch}
                    pfToSearch={pfToSearch}
                    pathSequence={pfPathSequence}
                    relationshipResult={pfResult}
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
                </DrawerContent>
              </Drawer>
            ) : (
              <aside className="w-80 shrink-0 xl:w-96 h-full min-h-0 overflow-hidden border-l border-border/40">
                <PathFinderPanel
                  members={filteredMembers}
                  pfFrom={pfFrom}
                  pfTo={pfTo}
                  pfFromSearch={pfFromSearch}
                  pfToSearch={pfToSearch}
                  pathSequence={pfPathSequence}
                  relationshipResult={pfResult}
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
            )
          )}

          {/* Member Detail — aside on desktop, bottom sheet on mobile */}
          {selectedMemberDisplay && !showAIWidget && !showInviteWidget && !pathFinderOpen && !isMobile && (
            <aside className="w-80 shrink-0 xl:w-96 h-full overflow-hidden">
              <MemberDetail
                member={selectedMemberDisplay}
                allMembers={displayMembers}
                onClose={closeMemberDetail}
                onEdit={(
                  !isViewer &&
                  (!selectedMemberDisplay.isClaimed || selectedMemberDisplay.claimedByUserId === user?.id)
                ) ? () => setEditingMember(selectedMember) : undefined}
                onDelete={canDelete && selectedMemberDisplay?.id !== selfMember?.id ? () => setIsDeleteDialogOpen(true) : undefined}
                onAddStory={!isViewer ? () => setIsStoryDialogOpen(true) : undefined}
                onInvite={!isDemoMode && !isViewer && !selectedMemberDisplay.isClaimed
                  ? () => setInviteToClaimTarget(selectedMember)
                  : undefined}
                onAddRelative={!isDemoMode && !isViewer ? handleAddRelative : undefined}
                isAdmin={isAdmin}
                currentUserId={user?.id}
                selfMemberId={selfMember?.id ?? null}
                relationshipMode={identityMode}
                familyId={isDemoMode ? null : familyId}
                userId={user?.id ?? null}
                memberPrivacySettings={selectedMemberDisplay?.claimedByUserId === user?.id ? myPrivacySettings : undefined}
                onClaim={!isDemoMode && user ? (memberId) => { setClaimTargetId(memberId); setIsClaimDialogOpen(true) } : undefined}
                onRevokeClaim={isAdmin ? handleRevokeClaim : undefined}
                onUnclaimSelf={!isDemoMode ? handleUnclaimSelf : undefined}
                onSetVisibility={!isViewer ? async (memberId, v) => {
                  try {
                    await setVisibility(memberId, v)
                    toast({ title: 'Visibility updated' })
                  } catch (e: unknown) {
                    toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
                  }
                } : undefined}
                onSetAnonymous={!isViewer ? async (memberId, anon) => {
                  try {
                    await setAnonymous(memberId, anon)
                    toast({ title: anon ? 'Node shown as anonymous' : 'Node name restored' })
                  } catch (e: unknown) {
                    toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
                  }
                } : undefined}
              />
            </aside>
          )}

          {/* ── Mobile: compact context menu (appears on first node tap) ── */}
          {isMobile && (
            <MobileNodeMenu
              member={displayMembers.find(m => m.id === mobileMenuMemberId) ?? null}
              open={!!mobileMenuMemberId && !selectedMemberId && !showAIWidget && !showInviteWidget}
              onClose={() => { setMobileMenuMemberId(null); setLongPressMemberId(null) }}
              onViewProfile={handleOpenMobileDetail}
              onEdit={() => {
                const m = members.find(m => m.id === mobileMenuMemberId)
                if (m) { setEditingMember(m); setMobileMenuMemberId(null) }
              }}
              onInvite={!isDemoMode && !isViewer ? () => {
                const m = members.find(m => m.id === mobileMenuMemberId)
                if (m && !m.isClaimed) { setMobileMenuMemberId(null); setInviteToClaimTarget(m) }
              } : undefined}
              onAddRelative={!isDemoMode && !isViewer ? handleAddRelative : undefined}
              onFindRelationship={!isDemoMode && relationshipIntelligenceEnabled ? (id) => {
                setMobileMenuMemberId(null)
                setLongPressMemberId(null)
                handleOpenPathFinder(id)
              } : undefined}
              onDelete={canDelete ? (id) => {
                if (id === selfMember?.id) return // Issue 3: own node is permanent
                setSelectedMemberId(id)
                setMobileMenuMemberId(null)
                setLongPressMemberId(null)
                setIsDeleteDialogOpen(true)
              } : undefined}
              allMembers={displayMembers}
              selfMemberId={selfMember?.id ?? null}
              relationshipIntelligenceEnabled={relationshipIntelligenceEnabled}
              isViewer={isViewer}
              isAdminLongPress={!!longPressMemberId && longPressMemberId === mobileMenuMemberId}
            />
          )}

          {/* Member Detail — mobile bottom sheet (full profile, opens from context menu) */}
          {isMobile && (
            <Drawer
              open={!!selectedMember && !showAIWidget && !showInviteWidget}
              onOpenChange={(open) => { if (!open) closeMemberDetail() }}
              direction="bottom"
            >
              <DrawerContent className="h-[88vh] flex flex-col">
                {/* Sticky drawer close bar — always visible even when content scrolls */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
                  <p className="text-sm font-semibold text-foreground truncate pr-4">
                    {selectedMember?.name ?? 'Profile'}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    onClick={closeMemberDetail}
                  >
                    <X className="h-3.5 w-3.5" />
                    Done
                  </Button>
                </div>
                {selectedMemberDisplay && (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <MemberDetail
                      member={selectedMemberDisplay}
                      allMembers={displayMembers}
                      onClose={closeMemberDetail}
                      onEdit={(
                        !isViewer &&
                        (!selectedMemberDisplay.isClaimed || selectedMemberDisplay.claimedByUserId === user?.id)
                      ) ? () => setEditingMember(selectedMember) : undefined}
                      onDelete={canDelete && selectedMember?.id !== selfMember?.id ? () => setIsDeleteDialogOpen(true) : undefined}
                      onAddStory={!isViewer ? () => setIsStoryDialogOpen(true) : undefined}
                      onInvite={!isDemoMode && !isViewer && selectedMember && !selectedMemberDisplay.isClaimed
                        ? () => setInviteToClaimTarget(selectedMember)
                        : undefined}
                      onAddRelative={!isDemoMode && !isViewer ? handleAddRelative : undefined}
                      isAdmin={isAdmin}
                      currentUserId={user?.id}
                      selfMemberId={selfMember?.id ?? null}
                      relationshipMode={identityMode}
                      familyId={isDemoMode ? null : familyId}
                      userId={user?.id ?? null}
                      memberPrivacySettings={selectedMember?.claimedByUserId === user?.id ? myPrivacySettings : undefined}
                      onClaim={!isDemoMode && user ? (memberId) => { setClaimTargetId(memberId); setIsClaimDialogOpen(true) } : undefined}
                      onRevokeClaim={isAdmin ? handleRevokeClaim : undefined}
                      onUnclaimSelf={!isDemoMode ? handleUnclaimSelf : undefined}
                      onSetVisibility={!isViewer ? async (memberId, v) => {
                        try {
                          await setVisibility(memberId, v)
                          toast({ title: 'Visibility updated' })
                        } catch (e: unknown) {
                          toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
                        }
                      } : undefined}
                      onSetAnonymous={!isViewer ? async (memberId, anon) => {
                        try {
                          await setAnonymous(memberId, anon)
                          toast({ title: anon ? 'Node shown as anonymous' : 'Node name restored' })
                        } catch (e: unknown) {
                          toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
                        }
                      } : undefined}
                    />
                  </div>
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
        onFocusExisting={(id) => { setSelectedMemberId(id); setIsAddDialogOpen(false); setEditingMember(null) }}
      />
      <SearchDialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen} members={displayMembers} onSelectMember={handleSelectMember} />
      {/* Inline quick-add relative dialog */}
      {quickAdd && (() => {
        const anchor = members.find(m => m.id === quickAdd.anchorId)
        return anchor ? (
          <QuickAddMemberDialog
            open={!!quickAdd}
            onOpenChange={(open) => { if (!open) setQuickAdd(null) }}
            relType={quickAdd.relType}
            anchorMember={anchor}
            existingMembers={members}
            onFocusExisting={(id) => { setSelectedMemberId(id); setQuickAdd(null) }}
            onLinkExisting={async (existingId) => {
              if (!quickAdd || !user) return
              const { relType, anchorId } = quickAdd
              const anc = members.find(m => m.id === anchorId)
              const existing = members.find(m => m.id === existingId)
              if (!anc || !existing) return
              try {
                if (relType === 'father' || relType === 'mother') {
                  await dbUpdateMember(anchorId, { parentIds: [...new Set([...(anc.parentIds ?? []), existingId])] })
                } else if (relType === 'spouse') {
                  await dbUpdateMember(anchorId, { spouseIds: [...new Set([...(anc.spouseIds ?? []), existingId])] })
                  await dbUpdateMember(existingId, { spouseIds: [...new Set([...(existing.spouseIds ?? []), anchorId])] })
                } else if (relType === 'child') {
                  await dbUpdateMember(existingId, { parentIds: [...new Set([...(existing.parentIds ?? []), anchorId])] })
                } else if (relType === 'sibling') {
                  const sharedParentId = anc.parentIds[0]
                  if (sharedParentId) {
                    await dbUpdateMember(existingId, { parentIds: [...new Set([...(existing.parentIds ?? []), sharedParentId])] })
                  }
                }
                toast({ title: 'Family link created', description: `${existing.name} linked as ${QUICK_REL_LABELS[relType]}.` })
                setQuickAdd(null)
              } catch (err) {
                console.error('[link-existing]', err)
                toast({ title: 'Could not link', description: 'Please try again.', variant: 'destructive' })
              }
            }}
            onAdd={handleQuickAddSubmit}
          />
        ) : null
      })()}
      <AIInsightsDialog open={isAIInsightsOpen} onOpenChange={setIsAIInsightsOpen} members={members} />
      <AddStoryDialog open={isStoryDialogOpen} onOpenChange={setIsStoryDialogOpen} member={selectedMember || null} onAdd={handleAddStory} />
      {isAdmin && (
        <DuplicateMergeDialog
          open={isDuplicateMergeOpen}
          onOpenChange={setIsDuplicateMergeOpen}
          members={members}
          onMergeComplete={() => refetchMembers()}
        />
      )}
      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={(v) => { setIsSettingsOpen(v); if (!v) setSettingsDefaultTab('general') }}
        onExport={handleExport}
        onImport={handleImport}
        defaultTab={settingsDefaultTab}
        selfMember={selfMember}
        onSetVisibility={async (memberId, v) => {
          try {
            await setVisibility(memberId, v)
          } catch (err: any) {
            toast({ title: 'Could not update visibility', description: err?.message, variant: 'destructive' })
          }
        }}
        onSetAnonymous={async (memberId, anon) => {
          try {
            await setAnonymous(memberId, anon)
          } catch (err: any) {
            toast({ title: 'Could not update anonymous setting', description: err?.message, variant: 'destructive' })
          }
        }}
        onUnclaim={() => { refetchMembers(); refreshProfile() }}
      />
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
        selfMemberId={selfMember?.id ?? null}
        open={isClaimDialogOpen}
        onOpenChange={setIsClaimDialogOpen}
        onClaim={async (memberId, _userId, opts) => {
          await claimMember(memberId, _userId, opts)
          toast({ title: 'Profile claimed!', description: 'Your account is now linked to this node.' })
          refetchMembers()
        }}
        onSetVisibility={async (memberId, visibility) => {
          await setVisibility(memberId, visibility)
        }}
      />

      {/* Relationship-first onboarding — for unclaimed general-invite users */}
      <RelationshipOnboardingDialog
        open={isRelOnboardingOpen}
        onClose={() => setIsRelOnboardingOpen(false)}
        members={members}
        onClaim={async (nodeId) => {
          await claimMember(nodeId, user?.id ?? '', {})
          toast({ title: 'Welcome to the family! 🎉', description: 'Your profile is now linked to the tree.' })
          refetchMembers()
          setIsRelOnboardingOpen(false)
        }}
        onCreateNew={(referenceId, relType) => {
          setIsRelOnboardingOpen(false)
          // Map onboarding rel type → QuickRelType where possible, else open generic add dialog
          const quickRelMap: Record<string, string> = {
            child: 'child', sibling: 'sibling', spouse: 'spouse',
            parent: 'father', // best-effort; admin can change gender after
          }
          const quickRel = quickRelMap[relType]
          if (quickRel) {
            handleAddRelative(referenceId, quickRel as Parameters<typeof handleAddRelative>[1])
          } else {
            setIsAddDialogOpen(true)
          }
        }}
      />
      <InviteToClaimDialog
        member={inviteToClaimTarget}
        open={!!inviteToClaimTarget}
        onOpenChange={(open) => { if (!open) setInviteToClaimTarget(null) }}
        familyId={familyId ?? null}
        userId={user?.id ?? null}
      />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {selectedMember?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide {selectedMember?.name} from the family tree. Their connections and memories are preserved — a family admin can restore them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster />

      {/* ── Welcome overlay — fires once after onboarding (?welcome=1) */}
      {showWelcomeOverlay && !isDemoMode && !dbLoading && !authLoading && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowWelcomeOverlay(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setShowWelcomeOverlay(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="text-center mb-5">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 mb-3">
                <TreePine className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Your tree is ready! 🎉</h2>
              <p className="text-sm text-muted-foreground mt-1">3 quick steps to bring it to life</p>
            </div>

            <ol className="space-y-3 mb-6">
              {[
                { n: 1, icon: '👨', title: 'Add your father or mother', detail: 'Tap "Add" → choose Father or Mother' },
                { n: 2, icon: '💌', title: 'Invite a family member', detail: 'Share the link on WhatsApp' },
                { n: 3, icon: '📸', title: 'Add a memory', detail: 'A photo, story, or voice note' },
              ].map(step => (
                <li key={step.n} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{step.n}</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.icon} {step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <Button
              className="w-full h-11 text-sm font-semibold gap-2"
              onClick={() => {
                setShowWelcomeOverlay(false)
                setViewMode('tree')
                setForceSpeedWizard(true)
              }}
            >
              <UserPlus className="h-4 w-4" />
              Add first family member
            </Button>
            <button
              onClick={() => setShowWelcomeOverlay(false)}
              className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
            >
              I'll explore first
            </button>
          </div>
        </div>
      )}

      {/* OnboardingChecklist removed — Family Mission panel in the right sidebar covers the same tasks
          and is more prominent + includes People Waiting to Join */}
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
