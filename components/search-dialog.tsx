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
import { Search, MapPin, Briefcase, BookOpen, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: FamilyMember[]
  onSelectMember: (id: string) => void
}

export function SearchDialog({
  open,
  onOpenChange,
  members,
  onSelectMember,
}: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filteredMembers = useMemo(() => {
    if (!query.trim()) return members.slice(0, 8) // Show first 8 when no query
    const lowerQuery = query.toLowerCase()
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(lowerQuery) ||
        member.relationship?.toLowerCase().includes(lowerQuery) ||
        member.bio?.toLowerCase().includes(lowerQuery) ||
        member.birthPlace?.toLowerCase().includes(lowerQuery) ||
        member.occupation?.toLowerCase().includes(lowerQuery)
    )
  }, [members, query])

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
      setSelectedIndex(i => Math.min(i + 1, filteredMembers.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filteredMembers[selectedIndex]) {
      e.preventDefault()
      handleSelect(filteredMembers[selectedIndex].id)
    }
  }, [filteredMembers, selectedIndex, handleSelect])

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

        <ScrollArea className="max-h-[400px]">
          {filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No family members found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="p-2">
              {!query.trim() && (
                <p className="text-xs text-muted-foreground px-3 py-2">Recent family members</p>
              )}
              {filteredMembers.map((member, index) => {
                const initials = member.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)

                const isSelected = index === selectedIndex
                const hasStories = member.stories && member.stories.length > 0

                return (
                  <button
                    key={member.id}
                    onClick={() => handleSelect(member.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors group',
                      isSelected
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted/50 border border-transparent'
                    )}
                  >
                    <Avatar className={cn(
                      'h-11 w-11 border-2 transition-colors',
                      isSelected ? 'border-primary' : 'border-border/50'
                    )}>
                      <AvatarFallback className={cn(
                        'font-semibold transition-colors',
                        isSelected
                          ? 'bg-gradient-to-br from-primary to-secondary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      )}>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          'font-semibold truncate',
                          isSelected ? 'text-primary' : 'text-foreground'
                        )}>
                          {highlightMatch(member.name, query)}
                        </p>
                        {member.deathYear && (
                          <span className="text-xs text-muted-foreground">+</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {member.relationship && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              isSelected && "border-primary/50"
                            )}
                          >
                            {member.relationship}
                          </Badge>
                        )}
                        {member.birthYear && (
                          <span>
                            {member.birthYear}
                            {member.deathYear && ` - ${member.deathYear}`}
                          </span>
                        )}
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
                    <ArrowRight className={cn(
                      'h-4 w-4 transition-all',
                      isSelected
                        ? 'text-primary opacity-100'
                        : 'text-muted-foreground opacity-0 group-hover:opacity-50'
                    )} />
                  </button>
                )
              })}
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
          <span>{filteredMembers.length} of {members.length} members</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
