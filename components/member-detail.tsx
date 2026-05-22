'use client'

import { FamilyMember } from '@/lib/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Edit,
  Link2,
  Sparkles,
  Trash2,
  X,
  MapPin,
  Briefcase,
  Calendar,
  BookOpen,
  GraduationCap,
  Heart,
  Star,
  Clock,
  PlusCircle,
  CheckCircle2,
  TrendingUp,
  GitBranch,
  Globe,
  Users,
  Lock,
  Shield,
  UserPlus,
  UserRoundPlus,
  Phone,
  Mail,
  UserX,
  EyeOff,
} from 'lucide-react'
import type { QuickRelType } from '@/components/quick-add-member-dialog'
import { cn, computeProfileCompleteness } from '@/lib/utils'
import { findRelationshipPath, computeRelationLabel } from '@/lib/relation-engine'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { useMilestones } from '@/hooks/use-milestones'
import { useState as useLocalState } from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MemberDetailProps {
  member: FamilyMember
  allMembers: FamilyMember[]
  onClose: () => void
  onEdit: () => void
  onDelete?: () => void
  onAddStory?: () => void
  onInvite?: () => void
  isAdmin?: boolean
  currentUserId?: string
  /**
   * The logged-in user's bound member id (from profiles.member_id).
   * Use this — NOT `relationship === 'self'` — to determine "this is you".
   * Static relationship strings break in multi-user families where multiple
   * profiles point at different nodes within the same tree.
   */
  selfMemberId?: string | null
  onSetVisibility?: (memberId: string, v: 'public' | 'family' | 'private') => void
  /** Called to toggle anonymous display mode on this member */
  onSetAnonymous?: (memberId: string, anon: boolean) => void
  /**
   * Privacy settings of the user who has claimed this member node.
   * When hideContactInfo=true and the viewer is not admin, phone/email are masked.
   */
  memberPrivacySettings?: { hideContactInfo?: boolean }
  /** Called when user clicks a quick-add relative button; parent opens QuickAddMemberDialog. */
  onAddRelative?: (anchorId: string, relType: QuickRelType) => void
  /** Family context — required for milestone DB CRUD */
  familyId?: string | null
  /** Logged-in user id — required for milestone creation */
  userId?: string | null
}

const milestoneIcons: Record<string, React.ReactNode> = {
  birth: <Calendar className="h-3 w-3" />,
  marriage: <Heart className="h-3 w-3" />,
  career: <Briefcase className="h-3 w-3" />,
  education: <GraduationCap className="h-3 w-3" />,
  achievement: <Star className="h-3 w-3" />,
  other: <Clock className="h-3 w-3" />,
}

const milestoneColors: Record<string, string> = {
  birth: 'bg-green-500/20 text-green-400 border-green-500/30',
  marriage: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  career: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  education: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  achievement: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  other: 'bg-muted text-muted-foreground border-border',
}

export function MemberDetail({
  member,
  allMembers,
  onClose,
  onEdit,
  onDelete,
  onAddStory,
  onInvite,
  onAddRelative,
  isAdmin = false,
  currentUserId,
  selfMemberId,
  onSetVisibility,
  onSetAnonymous,
  memberPrivacySettings,
  familyId,
  userId,
}: MemberDetailProps) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)

  const parents = allMembers.filter((m) => member.parentIds.includes(m.id))
  const spouses = allMembers.filter((m) => member.spouseIds.includes(m.id))
  const children = allMembers.filter((m) => m.parentIds.includes(member.id))
  const siblings = allMembers.filter(
    (m) => m.id !== member.id && m.parentIds.some((pid) => member.parentIds.includes(pid))
  )

  const lifespan = member.deathYear
    ? `${member.birthYear} - ${member.deathYear}`
    : member.birthYear
      ? `Born ${member.birthYear}`
      : ''

  const age = member.birthYear
    ? member.deathYear
      ? member.deathYear - member.birthYear
      : new Date().getFullYear() - member.birthYear
    : null

  // Milestone CRUD — live from DB when familyId is available; falls back to sample-data milestones
  const { milestones: dbMilestones, addMilestone, deleteMilestone } = useMilestones(
    familyId ?? null,
    member.id,
  )
  const sortedMilestones = familyId
    ? [...dbMilestones].sort((a, b) => a.year - b.year)
    : [...(member.milestones || [])].sort((a, b) => a.year - b.year)

  // Inline Add Milestone form state
  const [showMilestoneForm, setShowMilestoneForm] = useLocalState(false)
  const [msTitle, setMsTitle] = useLocalState('')
  const [msYear, setMsYear] = useLocalState(String(new Date().getFullYear()))
  const [msType, setMsType] = useLocalState<'birth' | 'marriage' | 'career' | 'education' | 'achievement' | 'relocation' | 'other'>('other')
  const [msDesc, setMsDesc] = useLocalState('')
  const [msSaving, setMsSaving] = useLocalState(false)

  const handleAddMilestone = async () => {
    if (!msTitle.trim() || !msYear || !userId || !familyId) return
    setMsSaving(true)
    try {
      await addMilestone({ title: msTitle.trim(), year: parseInt(msYear), type: msType, description: msDesc.trim() || undefined }, userId)
      setShowMilestoneForm(false)
      setMsTitle(''); setMsYear(String(new Date().getFullYear())); setMsType('other'); setMsDesc('')
    } catch (err) { console.error('[milestone] add failed:', err) }
    finally { setMsSaving(false) }
  }

  // DECISION 4: Self is resolved dynamically from the logged-in user's bound
  // member_id (passed via prop). Fall back to legacy `relationship === 'self'`
  // for demo data / unauthenticated views where no profile binding exists.
  const selfMember = (selfMemberId && allMembers.find(m => m.id === selfMemberId))
    || allMembers.find(m => m.relationship === 'self')
  const completeness = computeProfileCompleteness(member)
  const relationPath = selfMember && member.id !== selfMember.id
    ? findRelationshipPath(selfMember.id, member.id, allMembers)
    : null
  const relationLabel = selfMember && member.id !== selfMember.id
    ? computeRelationLabel(selfMember.id, member.id, allMembers)
    : null

  // Contact info is masked for non-admins when the member's claimer has enabled hideContactInfo
  const contactInfoMasked = !isAdmin && (memberPrivacySettings?.hideContactInfo ?? false)

  return (
    <Card className="flex flex-col h-full min-h-0 overflow-hidden border-0 rounded-none backdrop-blur-xl border-l border-border/50" style={{ background: 'var(--surface-panel)' }}>
      <CardHeader className="pb-4 border-b border-border/40">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16 border-2 border-amber-400/30 ring-2 ring-amber-400/10">
                {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} className="object-cover" />}
                <AvatarFallback className="bg-gradient-to-br from-amber-600/20 to-indigo-600/25 text-xl font-bold" style={{ color: 'var(--accent)' }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              {member.deathYear && (
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-muted border-2 flex items-center justify-center" style={{ borderColor: 'var(--background)' }}>
                  <span className="text-[10px] text-muted-foreground">†</span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">{member.name}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {(member.relationship && member.relationship !== 'self') || member.id === selfMemberId ? (
                  <Badge variant="secondary" className="border" style={{ background: 'var(--glow-gold)', color: 'var(--accent)', borderColor: 'var(--border)' }}>
                    {member.id === selfMemberId ? 'You' : member.relationship}
                  </Badge>
                ) : null}
                {member.showAsAnonymous && (
                  <Badge variant="outline" className="border-orange-500/40 text-orange-400 bg-orange-500/10 text-[10px]">
                    <UserX className="h-2.5 w-2.5 mr-1" />
                    Anonymous
                  </Badge>
                )}
                {age && (
                  <Badge variant="outline" className="text-muted-foreground border-border/50">
                    {member.deathYear ? `Lived ${age} years` : `Age ${age}`}
                  </Badge>
                )}
              </div>
              {lifespan && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {lifespan}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 min-h-0 overflow-auto">
        <CardContent className="p-0">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full rounded-none border-b border-border/50 bg-transparent h-auto p-0">
              <TabsTrigger
                value="overview"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="timeline"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
              >
                Timeline
              </TabsTrigger>
              <TabsTrigger
                value="stories"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
              >
                Stories
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="p-4 space-y-6 mt-0">
              {/* Quick Info */}
              <div className="grid grid-cols-2 gap-3">
                {member.birthPlace && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Birthplace</p>
                      <p className="text-xs font-medium text-foreground">{member.birthPlace}</p>
                    </div>
                  </div>
                )}
                {member.currentPlace && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
                    <MapPin className="h-4 w-4 text-primary/70 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Current City</p>
                      <p className="text-xs font-medium text-foreground">{member.currentPlace}</p>
                    </div>
                  </div>
                )}
                {member.hometown && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Native Place</p>
                      <p className="text-xs font-medium text-foreground">{member.hometown}</p>
                    </div>
                  </div>
                )}
                {member.occupation && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Occupation</p>
                      <p className="text-xs font-medium text-foreground">{member.occupation}</p>
                    </div>
                  </div>
                )}
                {member.instagramHandle && (
                  <div className="col-span-2 flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
                    <span className="text-pink-400 shrink-0 text-sm font-bold">IG</span>
                    <div>
                      <p className="text-xs text-muted-foreground">Instagram</p>
                      <a
                        href={`https://instagram.com/${member.instagramHandle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-pink-400 hover:text-pink-300 transition-colors"
                      >
                        @{member.instagramHandle}
                      </a>
                    </div>
                  </div>
                )}
                {(member.phone || member.email) && (
                  <div className="col-span-2 rounded-xl bg-muted/30 border border-border/40 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Contact</p>
                    {member.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {contactInfoMasked ? (
                          <span className="text-xs text-muted-foreground tracking-widest">••••••••</span>
                        ) : (
                          <a href={`tel:${member.phone}`} className="text-xs font-medium text-foreground hover:text-primary transition-colors">{member.phone}</a>
                        )}
                      </div>
                    )}
                    {member.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {contactInfoMasked ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <EyeOff className="h-3 w-3" />
                            <span className="tracking-widest">••••••••</span>
                          </span>
                        ) : (
                          <a href={`mailto:${member.email}`} className="text-xs font-medium text-foreground hover:text-primary transition-colors">{member.email}</a>
                        )}
                      </div>
                    )}
                    {contactInfoMasked && (
                      <p className="text-[10px] text-muted-foreground/70">This member has hidden their contact info</p>
                    )}
                  </div>
                )}
              </div>

              {member.bio && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    Biography
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{member.bio}</p>
                </div>
              )}

              {/* Profile Completeness */}
              <div className="rounded-xl bg-muted/30 border border-border/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                    Profile Completeness
                  </h3>
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: completeness.score >= 80 ? 'var(--success)' : completeness.score >= 50 ? 'var(--warning)' : 'var(--error)',
                    }}
                  >
                    {completeness.score}%
                  </span>
                </div>
                <Progress
                  value={completeness.score}
                  className={cn(
                    "h-1.5",
                    completeness.score >= 80 ? "[&>div]:bg-green-500" : completeness.score >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"
                  )}
                />
                {completeness.missing.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Missing: {completeness.missing.slice(0, 4).join(', ')}{completeness.missing.length > 4 ? '…' : ''}
                  </p>
                )}
                {completeness.score === 100 && (
                  <p className="text-[10px] text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Complete profile
                  </p>
                )}
              </div>

              {/* Relationship Path */}
              {relationPath !== null && (
                <div className="rounded-xl border p-3 space-y-2" style={{ background: 'var(--glow-gold)', borderColor: 'var(--border)' }}>
                  <h3 className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                    <GitBranch className="h-3.5 w-3.5" />
                    {relationLabel ? relationLabel : `Your Connection · ${relationPath.length - 1} step${relationPath.length !== 2 ? 's' : ''}`}
                  </h3>
                  <div className="flex items-center gap-1 flex-wrap">
                    {relationPath.map((m, i) => (
                      <span key={m.id} className="flex items-center gap-1">
                        <span className="rounded-full text-[10px] px-2 py-0.5 font-medium border" style={{ background: 'var(--surface-card)', color: 'var(--foreground)', borderColor: 'var(--border)' }}>
                          {m.name.split(' ')[0]}
                        </span>
                        {i < relationPath.length - 1 && (
                          <span className="text-[10px] text-muted-foreground">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Separator className="bg-border/50" />

              {/* Privacy / Visibility — admin or the member's own claimed profile */}
              {(isAdmin || (currentUserId && member.claimedByUserId === currentUserId)) && onSetVisibility && (
                <div className="rounded-xl bg-muted/30 border border-border/40 p-3 space-y-2">
                  <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    Privacy
                  </h3>
                  <div className="flex gap-2">
                    {([
                      { key: 'public', label: 'Public', icon: Globe, color: 'text-green-400 border-green-500/40 bg-green-500/10' },
                      { key: 'family', label: 'Family', icon: Users, color: 'text-primary border-primary/40 bg-primary/10' },
                      { key: 'private', label: 'Private', icon: Lock, color: 'text-red-400 border-red-500/40 bg-red-500/10' },
                    ] as const).map(({ key, label, icon: Icon, color }) => {
                      const active = (member.visibility ?? 'family') === key
                      return (
                        <button
                          key={key}
                          onClick={() => onSetVisibility(member.id, key)}
                          className={cn(
                            'flex-1 flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-medium transition-all',
                            active ? color : 'border-border/40 text-muted-foreground hover:border-border/60'
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {(member.visibility ?? 'family') === 'public' && 'Visible to anyone with the invite link'}
                    {(member.visibility ?? 'family') === 'family' && 'Visible to all family members'}
                    {(member.visibility ?? 'family') === 'private' && 'Only visible to admins'}
                  </p>
                  {onSetAnonymous && (
                    <>
                      <div className="h-px bg-border/40 my-1" />
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-medium text-foreground flex items-center gap-1">
                            <UserX className="h-3 w-3 text-muted-foreground" />
                            Show as anonymous
                          </p>
                          <p className="text-[10px] text-muted-foreground">Display as "? Member" — hides name from others</p>
                        </div>
                        <button
                          onClick={() => onSetAnonymous(member.id, !(member.showAsAnonymous ?? false))}
                          className={cn(
                            'h-5 w-9 rounded-full border transition-colors',
                            member.showAsAnonymous
                              ? 'bg-orange-500 border-orange-600'
                              : 'bg-muted border-border/50'
                          )}
                        >
                          <span className={cn(
                            'block h-4 w-4 rounded-full bg-white shadow transition-transform',
                            member.showAsAnonymous ? 'translate-x-[18px]' : 'translate-x-0.5'
                          )} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <Separator className="bg-border/50" />

              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  Family Connections
                </h3>
                <div className="space-y-3">
                  {parents.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Parents
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {parents.map((p) => (
                          <Badge key={p.id} variant="outline" className="bg-muted/30 border-border/50 text-foreground">
                            {p.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {spouses.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Spouse
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {spouses.map((s) => (
                          <Badge key={s.id} variant="outline" className="border" style={{ background: 'var(--glow-gold)', color: 'var(--accent)', borderColor: 'var(--border)' }}>
                            <Heart className="h-3 w-3 mr-1" />
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {siblings.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Siblings
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {siblings.map((s) => (
                          <Badge key={s.id} variant="outline" className="bg-muted/30">
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {children.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Children
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {children.map((c) => (
                          <Badge key={c.id} variant="outline" className="bg-muted/30">
                            {c.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="p-4 mt-0">
              {FEATURE_FLAGS.enableMilestoneEditor && familyId && sortedMilestones.length > 0 && (
                <div className="flex justify-end mb-3">
                  <Button variant="outline" size="sm" onClick={() => setShowMilestoneForm(v => !v)}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                    Add
                  </Button>
                </div>
              )}
              {sortedMilestones.length > 0 ? (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-border/50" />
                  <div className="space-y-4">
                    {sortedMilestones.map((milestone, index) => (
                      <div key={milestone.id} className="relative flex gap-4 pl-8">
                        <div
                          className={cn(
                            'absolute left-0 w-6 h-6 rounded-full border-2 flex items-center justify-center',
                            milestoneColors[milestone.type]
                          )}
                        >
                          {milestoneIcons[milestone.type]}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-foreground">{milestone.title}</span>
                            <Badge variant="outline" className="text-xs">
                              {milestone.year}
                            </Badge>
                          </div>
                          {milestone.description && (
                            <p className="text-sm text-muted-foreground">{milestone.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-sm text-muted-foreground">No milestones recorded yet</p>
                  {FEATURE_FLAGS.enableMilestoneEditor && familyId && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowMilestoneForm(true)}>
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Add Milestone
                    </Button>
                  )}
                </div>
              )}
              {/* Inline Add Milestone form */}
              {FEATURE_FLAGS.enableMilestoneEditor && showMilestoneForm && familyId && (
                <div className="mt-4 rounded-xl border border-border/50 bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-semibold">Add Milestone</p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                    <input
                      className="w-full rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                      placeholder="e.g. Graduated college"
                      value={msTitle}
                      onChange={e => setMsTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Year *</label>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                        placeholder="2020"
                        value={msYear}
                        onChange={e => setMsYear(e.target.value)}
                        min="1900"
                        max={new Date().getFullYear() + 10}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                      <select
                        className="w-full rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                        value={msType}
                        onChange={e => setMsType(e.target.value as typeof msType)}
                      >
                        <option value="career">Career</option>
                        <option value="education">Education</option>
                        <option value="marriage">Marriage</option>
                        <option value="achievement">Achievement</option>
                        <option value="relocation">Relocation</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                    <textarea
                      className="w-full rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                      placeholder="Optional details..."
                      rows={2}
                      value={msDesc}
                      onChange={e => setMsDesc(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowMilestoneForm(false)}>Cancel</Button>
                    <Button size="sm" disabled={!msTitle.trim() || !msYear || msSaving} onClick={handleAddMilestone}>
                      {msSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="stories" className="p-4 mt-0">
              {member.stories && member.stories.length > 0 ? (
                <div className="space-y-4">
                  {member.stories.map((story) => (
                    <Card key={story.id} className="bg-muted/30 border-border/50">
                      <CardContent className="p-4">
                        <h4 className="font-semibold text-foreground mb-2">{story.title}</h4>
                        <p className="text-sm text-muted-foreground mb-3">{story.content}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>By {story.author || 'Unknown'}</span>
                          <span>{story.createdAt}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button variant="outline" className="w-full" onClick={onAddStory}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Story
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-sm text-muted-foreground mb-1">No stories yet</p>
                  <p className="text-xs text-muted-foreground/70 mb-4">Share memories and stories about {member.name.split(' ')[0]}</p>
                  <Button variant="outline" size="sm" onClick={onAddStory}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add First Story
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </ScrollArea>

      <div className="shrink-0 p-4 border-t border-border/50 space-y-2" style={{ background: 'var(--surface-panel)' }}>
        {/* Quick-add relative buttons */}
        {onAddRelative && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
              <UserRoundPlus className="h-3 w-3" />
              Add relative
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {(['father', 'mother', 'spouse', 'child', 'sibling'] as QuickRelType[]).map((rel) => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => onAddRelative(member.id, rel)}
                  className="rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all capitalize"
                >
                  + {rel}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Invite nudge for unclaimed members */}
        {!member.isClaimed && member.relationship !== 'self' && onInvite && (
          <button
            onClick={onInvite}
            className="mb-2 w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
            style={{ borderColor: 'var(--border)', background: 'var(--glow-gold)', color: 'var(--accent)' }}
          >
            <UserPlus className="h-4 w-4 shrink-0" />
            <span>Invite {member.name.split(' ')[0]} to join the tree</span>
          </button>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" size="sm" className="flex-1 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20" onClick={onAddStory}>
            <Sparkles className="mr-2 h-4 w-4" />
            AI Story
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
