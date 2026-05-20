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
} from 'lucide-react'
import { cn, computeProfileCompleteness } from '@/lib/utils'
import { findRelationshipPath, computeRelationLabel } from '@/lib/relation-engine'

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
  onSetVisibility?: (memberId: string, v: 'public' | 'family' | 'private') => void
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
  isAdmin = false,
  currentUserId,
  onSetVisibility,
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

  const sortedMilestones = [...(member.milestones || [])].sort((a, b) => a.year - b.year)

  const selfMember = allMembers.find(m => m.relationship === 'self')
  const completeness = computeProfileCompleteness(member)
  const relationPath = selfMember && member.id !== selfMember.id
    ? findRelationshipPath(selfMember.id, member.id, allMembers)
    : null
  const relationLabel = selfMember && member.id !== selfMember.id
    ? computeRelationLabel(selfMember.id, member.id, allMembers)
    : null

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
                {member.relationship && (
                  <Badge variant="secondary" className="border" style={{ background: 'var(--glow-gold)', color: 'var(--accent)', borderColor: 'var(--border)' }}>
                    {member.relationship}
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
                  <Button variant="outline" size="sm" className="mt-4">
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Milestone
                  </Button>
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

      <div className="shrink-0 p-4 border-t border-border/50" style={{ background: 'var(--surface-panel)' }}>
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
