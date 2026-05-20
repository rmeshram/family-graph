'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { FamilyMember } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, MapPin, Briefcase, BookOpen, ArrowRight, Users2, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: FamilyMember[]
  onSelectMember: (id: string) => void
}

// ─── MemberRow ────────────────────────────────────────────────────────────────
function MemberRow({
  member, query, isSelected, onSelect, onHover, highlightMatch, communityHint,
}: {
  member: FamilyMember
  query: string
  isSelected: boolean
  onSelect: (id: string) => void
  onHover: () => void
  highlightMatch: (text: string, query: string) => React.ReactNode
  communityHint?: string
}) {
  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  const hasStories = member.stories && member.stories.length > 0
  return (
    <button
      onClick={() => onSelect(member.id)}
      onMouseEnter={onHover}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors group',
        isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'
      )}
    >
      <Avatar className={cn('h-11 w-11 border-2 transition-colors', isSelected ? 'border-primary' : 'border-border/50')}>
        <AvatarFallback className={cn('font-semibold', isSelected ? 'bg-gradient-to-br from-primary to-secondary text-primary-foreground' : 'bg-muted text-foreground')}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn('font-semibold truncate', isSelected ? 'text-primary' : 'text-foreground')}>
            {highlightMatch(member.name, query)}
          </p>
          {member.deathYear && <span className="text-xs text-muted-foreground">+</span>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {member.relationship && (
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', isSelected && 'border-primary/50')}>
              {member.relationship}
            </Badge>
          )}
          {member.birthYear && <span>{member.birthYear}{member.deathYear && ` – ${member.deathYear}`}</span>}
          {communityHint && <span className="text-[10px] text-accent truncate">{communityHint}</span>}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          {member.birthPlace && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {highlightMatch(member.birthPlace.split(',')[0], query)}
            </span>
          )}
          {member.occupation && (
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {highlightMatch(member.occupation, query)}
            </span>
          )}
          {hasStories && (
            <span className="flex items-center gap-1 text-accent">
              <BookOpen className="h-3 w-3" />
              {member.stories!.length} {member.stories!.length === 1 ? 'story' : 'stories'}
            </span>
          )}
        </div>
      </div>
      <ArrowRight className={cn('h-4 w-4 transition-all', isSelected ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-50')} />
    </button>
  )
}

// ─── SearchDialog ──────────────────────────────────────────────────────────────
export function SearchDialog({
  open,
  onOpenChange,
  members,
  onSelectMember,
}: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      const family = members.filter(m => m.networkGroup !== 'affiliated').slice(0, 8)
      return { family, community: [] as FamilyMember[], connected: [] as FamilyMember[] }
    }
    const family = members.filter(m =>
      m.networkGroup !== 'affiliated' && (
        m.name.toLowerCase().includes(q) ||
        m.relationship?.toLowerCase().includes(q) ||
        m.bio?.toLowerCase().includes(q) ||
        m.birthPlace?.toLowerCase().includes(q) ||
        m.currentPlace?.toLowerCase().includes(q) ||
        m.occupation?.toLowerCase().includes(q)
      )
    )
    const connected = members.filter(m =>
      m.networkGroup === 'affiliated' && (
        m.name.toLowerCase().includes(q) ||
        m.relationship?.toLowerCase().includes(q) ||
        m.affiliatedFamilyName?.toLowerCase().includes(q)
      )
    )
    const familyIds = new Set(family.map(m => m.id))
    const connectedIds = new Set(connected.map(m => m.id))
    const community = members.filter(m =>
      !familyIds.has(m.id) && !connectedIds.has(m.id) && (
        m.gotra?.toLowerCase().includes(q) ||
        m.caste?.toLowerCase().includes(q) ||
        m.hometown?.toLowerCase().includes(q) ||
        m.religion?.toLowerCase().includes(q) ||
        m.nativeLanguage?.toLowerCase().includes(q)
      )
    )
    return { family, community, connected }
  }, [members, query])

  // Flat list for keyboard navigation
  const flatResults = useMemo(
    () => [...searchResults.family, ...searchResults.community, ...searchResults.connected],
    [searchResults]
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleSelect = useCallback((id: string) => {
    onSelectMember(id)
    onOpenChange(false)
    setQuery('')
  }, [onSelectMember, onOpenChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
      e.preventDefault()
      handleSelect(flatResults[selectedIndex].id)
    }
  }, [flatResults, selectedIndex, handleSelect])

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text
    const regex = new RegExp(`(${query})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="bg-accent/30 text-accent-foreground rounded px-0.5">
          {part}
        </span>
      ) : part
    )
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open)
      if (!open) setQuery('')
    }}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
        <VisuallyHidden><DialogTitle>Search family members</DialogTitle></VisuallyHidden>
        <div className="flex items-center border-b border-border/50 px-4">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            placeholder="Search family members by name, place, occupation..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 bg-transparent focus-visible:ring-0 text-base py-6 px-3"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border/50 bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <ScrollArea className="max-h-[440px]">
          {flatResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No results found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Try a name, place, gotra, or occupation</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {/* ── Family members ─────────────────────────────────── */}
              {searchResults.family.length > 0 && (
                <>
                  {!query.trim()
                    ? <p className="text-xs text-muted-foreground px-3 py-1.5">Your family members</p>
                    : <p className="text-xs font-medium text-muted-foreground px-3 py-1.5 flex items-center gap-1.5"><Users2 className="h-3.5 w-3.5" /> Family</p>
                  }
                  {searchResults.family.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      query={query}
                      isSelected={flatResults.indexOf(member) === selectedIndex}
                      onSelect={handleSelect}
                      onHover={() => setSelectedIndex(flatResults.indexOf(member))}
                      highlightMatch={highlightMatch}
                    />
                  ))}
                </>
              )}

              {/* ── Community matches (gotra / caste / hometown) ────── */}
              {searchResults.community.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Community Match</p>
                  {searchResults.community.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      query={query}
                      isSelected={flatResults.indexOf(member) === selectedIndex}
                      onSelect={handleSelect}
                      onHover={() => setSelectedIndex(flatResults.indexOf(member))}
                      highlightMatch={highlightMatch}
                      communityHint={[member.gotra, member.caste, member.hometown].filter(Boolean).join(' · ')}
                    />
                  ))}
                </>
              )}

              {/* ── Connected / affiliated families ─────────────────── */}
              {searchResults.connected.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1.5"><Users2 className="h-3.5 w-3.5 text-indigo-400" /> Connected Family</p>
                  {searchResults.connected.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      query={query}
                      isSelected={flatResults.indexOf(member) === selectedIndex}
                      onSelect={handleSelect}
                      onHover={() => setSelectedIndex(flatResults.indexOf(member))}
                      highlightMatch={highlightMatch}
                      communityHint={member.affiliatedFamilyName}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border/50 px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="h-4 px-1 rounded bg-muted text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="h-4 px-1 rounded bg-muted text-[10px]">↵</kbd>
              Select
            </span>
          </div>
          <span>{flatResults.length} result{flatResults.length !== 1 ? 's' : ''}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
