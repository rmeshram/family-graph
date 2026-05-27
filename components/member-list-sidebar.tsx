'use client'

import { FamilyMember } from '@/lib/types'
import { MemberCard } from './member-card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { useMemo, useState } from 'react'
import { Search, Users, Layers, Clock, Network, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeRelationLabel, computeDegreesOfSeparation } from '@/lib/relation-engine'

interface MemberListSidebarProps {
  members: FamilyMember[]
  selectedMemberId: string | null
  onSelectMember: (id: string) => void
  selfMemberId?: string | null
  relationshipIntelligenceEnabled?: boolean
  maxDegree?: number
  onMaxDegreeChange?: (d: number) => void
  totalCount?: number
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function MemberListSidebar({
  members,
  selectedMemberId,
  onSelectMember,
  selfMemberId,
  relationshipIntelligenceEnabled = true,
  maxDegree = 10,
  onMaxDegreeChange,
  totalCount,
  isCollapsed = false,
  onToggleCollapse,
}: MemberListSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members
    const query = searchQuery.toLowerCase()
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.relationship?.toLowerCase().includes(query) ||
        m.birthPlace?.toLowerCase().includes(query) ||
        m.occupation?.toLowerCase().includes(query)
    )
  }, [members, searchQuery])

  const groupedByGeneration = useMemo(() => {
    const groups: Record<number, FamilyMember[]> = {}
    filteredMembers.forEach((member) => {
      if (!groups[member.generation]) {
        groups[member.generation] = []
      }
      groups[member.generation].push(member)
    })
    return groups
  }, [filteredMembers])

  const recentlyActive = useMemo(() => {
    return [...filteredMembers]
      .filter((m) => m.stories && m.stories.length > 0)
      .sort((a, b) => {
        const aDate = a.stories?.[0]?.createdAt || ''
        const bDate = b.stories?.[0]?.createdAt || ''
        return bDate.localeCompare(aDate)
      })
      .slice(0, 5)
  }, [filteredMembers])

  // Pre-compute dynamic relation labels for every visible member relative to the
  // logged-in user's node. Falls back to the raw DB relationship field when no
  // selfMemberId is available (demo mode / unauthenticated).
  const relationLabels = useMemo<Record<string, string | null>>(() => {
    if (!selfMemberId || !relationshipIntelligenceEnabled) return {}
    const map: Record<string, string | null> = {}
    for (const m of members) {
      map[m.id] = m.id === selfMemberId
        ? 'You'
        : computeRelationLabel(selfMemberId, m.id, members)
    }
    return map
  }, [selfMemberId, members, relationshipIntelligenceEnabled])

  const degreesMap = useMemo<Record<string, number | null>>(() => {
    if (!selfMemberId || !relationshipIntelligenceEnabled) return {}
    const map: Record<string, number | null> = {}
    for (const m of members) {
      map[m.id] = m.id === selfMemberId
        ? 0
        : computeDegreesOfSeparation(selfMemberId, m.id, members)
    }
    return map
  }, [selfMemberId, members, relationshipIntelligenceEnabled])

  const generationLabels: Record<number, string> = {
    0: 'Great Grandparents',
    1: 'Grandparents',
    2: 'Parents',
    3: 'Your Generation',
    4: 'Children',
  }

  const stats = useMemo(() => {
    const generations = new Set(members.map((m) => m.generation)).size
    const living = members.filter((m) => !m.deathYear).length
    const withStories = members.filter((m) => m.stories && m.stories.length > 0).length
    return { total: members.length, generations, living, withStories }
  }, [members])

  if (isCollapsed) {
    return (
      <div className="flex h-full flex-col items-center py-3 gap-2">
        <button
          onClick={onToggleCollapse}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="mt-2 flex flex-col gap-2 items-center">
          {members.slice(0, 8).map(m => (
            <button
              key={m.id}
              onClick={() => onSelectMember(m.id)}
              title={m.name}
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                selectedMemberId === m.id
                  ? 'ring-2 ring-primary bg-primary/20 text-primary'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              )}
            >
              {m.name.charAt(0)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/40 p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-foreground">Family Members</h2>
          <div className="flex items-center gap-2">
            {totalCount !== undefined && totalCount > members.length && (
              <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full border border-border/30">
                {members.length}/{totalCount}
              </span>
            )}
            <button
              onClick={onToggleCollapse}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {stats.total} people
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {stats.generations} gen
          </span>
        </div>
      </div>

      {/* Degree filter */}
      {onMaxDegreeChange && (
        <div className="px-4 py-2.5 border-b border-border/40 bg-muted/10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Network className="h-3 w-3" />
              Depth
            </span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => onMaxDegreeChange(d)}
                  className={cn(
                    'h-5 w-5 rounded text-[10px] font-bold transition-colors',
                    maxDegree === d
                      ? 'bg-primary text-white'
                      : maxDegree > d
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                  )}
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => onMaxDegreeChange(10)}
                className={cn(
                  'h-5 px-1.5 rounded text-[10px] font-bold transition-colors',
                  maxDegree === 10
                    ? 'bg-primary text-white'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                )}
              >
                All
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search family..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/30 border-border/40 focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Tabs defaultValue="all" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-3 grid w-auto grid-cols-3 bg-muted/30 border border-border/40">
          <TabsTrigger value="all" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-white text-muted-foreground">
            All
          </TabsTrigger>
          <TabsTrigger value="generations" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-white text-muted-foreground">
            By Gen
          </TabsTrigger>
          <TabsTrigger value="recent" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-white text-muted-foreground">
            Recent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="space-y-2 p-4">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    isSelected={selectedMemberId === member.id}
                    onClick={() => onSelectMember(member.id)}
                    isSelf={selfMemberId ? member.id === selfMemberId : false}
                    relationLabel={relationLabels[member.id] ?? undefined}
                    hasSelf={!!selfMemberId}
                    degreesOfSeparation={degreesMap[member.id]}
                  />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No members found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="generations" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="space-y-6 p-4">
              {Object.entries(groupedByGeneration)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([gen, genMembers]) => (
                  <div key={gen}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px flex-1 bg-border/50" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2">
                        {generationLabels[Number(gen)] || `Generation ${gen}`}
                      </h3>
                      <div className="h-px flex-1 bg-border/50" />
                    </div>
                    <div className="space-y-2">
                      {genMembers.map((member) => (
                        <MemberCard
                          key={member.id}
                          member={member}
                          isSelected={selectedMemberId === member.id}
                          onClick={() => onSelectMember(member.id)}
                          compact
                          isSelf={selfMemberId ? member.id === selfMemberId : false}
                          relationLabel={relationLabels[member.id] ?? undefined}
                          hasSelf={!!selfMemberId}
                          degreesOfSeparation={degreesMap[member.id]}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="recent" className="flex-1 mt-0">
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="p-4">
              {recentlyActive.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Members with recent stories
                  </p>
                  {recentlyActive.map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      isSelected={selectedMemberId === member.id}
                      onClick={() => onSelectMember(member.id)}
                      isSelf={selfMemberId ? member.id === selfMemberId : false}
                      relationLabel={relationLabels[member.id] ?? undefined}
                      hasSelf={!!selfMemberId}
                      degreesOfSeparation={degreesMap[member.id]}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No recent activity</p>
                  <p className="text-xs mt-1">Add stories to see them here</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
