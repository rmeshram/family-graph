'use client'

import { FamilyMember } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MapPin } from 'lucide-react'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

interface MemberCardProps {
  member: FamilyMember
  isSelected: boolean
  onClick: () => void
  compact?: boolean
  isSelf?: boolean
  /** Pre-computed dynamic relation label (e.g. "Father", "Maternal Uncle"). Overrides the raw DB field. */
  relationLabel?: string
  /**
   * True when a real selfMemberId exists for the current user.
   * When true and relationLabel is null/undefined (no graph path found), the raw DB
   * `relationship` field is suppressed — it was set from the adder's perspective and
   * would be misleading (e.g. showing "Brother" to the member's mother).
   */
  hasSelf?: boolean
  /** Show "Unclaimed" badge — typically for admin/contributor role */
  showUnclaimedBadge?: boolean
  /** Number of graph hops between the logged-in user and this member. Shown for distant relatives (≥3). */
  degreesOfSeparation?: number | null
}

export function MemberCard({ member, isSelected, onClick, compact = false, isSelf = false, relationLabel, hasSelf = false, showUnclaimedBadge = false, degreesOfSeparation }: MemberCardProps) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)

  const lifespan = member.deathYear
    ? `${member.birthYear} - ${member.deathYear}`
    : member.birthYear
      ? `Born ${member.birthYear}`
      : ''

  const hasStories = member.stories && member.stories.length > 0

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 p-2 rounded-lg transition-all duration-200',
          isSelected
            ? 'bg-primary/20 ring-1 ring-primary'
            : 'hover:bg-muted/50'
        )}
      >
        <Avatar className="h-8 w-8 border border-border">
          {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} className="object-cover" />}
          <AvatarFallback className={cn(
            'text-xs font-semibold',
            isSelected
              ? 'bg-gradient-to-br from-primary to-secondary text-primary-foreground'
              : 'bg-muted text-foreground'
          )}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 text-left">
          <p className={cn(
            'text-sm font-medium truncate',
            isSelected ? 'text-primary' : 'text-foreground'
          )}>
            {member.name}
          </p>
          {lifespan && (
            <p className="text-xs text-muted-foreground">{lifespan}</p>
          )}
        </div>
      </button>
    )
  }

  return (
    <Card
      onClick={onClick}
      className={cn(
        'group cursor-pointer p-4 transition-all duration-200 border-border/50',
        isSelected
          ? 'ring-1 ring-primary bg-primary/10 border-primary/30'
          : 'hover:bg-muted/30 hover:border-border'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className={cn(
            'h-12 w-12 border-2 transition-all duration-200',
            isSelected
              ? 'border-primary'
              : 'border-border/50 group-hover:border-primary/50'
          )}>
            {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} className="object-cover" />}
            <AvatarFallback className={cn(
              'font-semibold transition-colors',
              isSelected
                ? 'bg-gradient-to-br from-primary to-secondary text-primary-foreground'
                : 'bg-muted text-foreground group-hover:bg-primary/20'
            )}>
              {initials}
            </AvatarFallback>
          </Avatar>
          {member.deathYear && (
            <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-muted border border-card flex items-center justify-center">
              <span className="text-[8px] text-muted-foreground">+</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={cn(
              'font-semibold truncate transition-colors',
              isSelected ? 'text-primary' : 'text-foreground'
            )}>
              {member.name}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {(isSelf || relationLabel || (!hasSelf && member.relationship && member.relationship !== 'self')) && (
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs capitalize',
                  isSelected
                    ? 'bg-primary/20 text-primary border-primary/30'
                    : 'bg-muted/50 text-muted-foreground border-border/50'
                )}
              >
                {isSelf ? 'You' : (relationLabel ?? member.relationship?.replace(/-/g, ' '))}
              </Badge>
            )}
            {degreesOfSeparation !== null && degreesOfSeparation !== undefined && degreesOfSeparation >= 3 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-dashed border-muted-foreground/30 text-muted-foreground/70"
                title={`${degreesOfSeparation} degrees of separation`}
              >
                {degreesOfSeparation}°
              </Badge>
            )}
            {hasStories && (
              <Badge variant="outline" className="text-xs bg-accent/10 text-accent border-accent/30">
                {member.stories!.length} {member.stories!.length === 1 ? 'story' : 'stories'}
              </Badge>
            )}
            {showUnclaimedBadge && !member.isClaimed && !member.isDeceased && (
              <Badge variant="outline" className="text-xs border-dashed border-muted-foreground/40 text-muted-foreground/60">
                Unclaimed
              </Badge>
            )}
            {FEATURE_FLAGS.enableBiodata && member.isBiodataVisible && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-pink-500/40 text-pink-400/80" title="Biodata visible for matrimony search">
                ❤ Matrimony
              </Badge>
            )}
          </div>
          {(lifespan || member.birthPlace) && (
            <div className="mt-2 space-y-0.5">
              {lifespan && (
                <p className="text-xs text-muted-foreground">{lifespan}</p>
              )}
              {member.birthPlace && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {member.birthPlace}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
