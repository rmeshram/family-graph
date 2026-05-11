'use client'

import { FamilyMember } from '@/lib/types'
import { MemberCard } from './member-card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { useMemo, useState } from 'react'
import { Search, Users, Layers, Clock } from 'lucide-react'

interface MemberListSidebarProps {
  members: FamilyMember[]
  selectedMemberId: string | null
  onSelectMember: (id: string) => void
}

export function MemberListSidebar({
  members,
  selectedMemberId,
  onSelectMember,
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

  return (
    <div className="flex h-full flex-col border-r border-border/50 bg-card">
      <div className="border-b border-border/50 p-4">
        <h2 className="font-semibold text-foreground mb-1">Family Members</h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {stats.total} people
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {stats.generations} generations
          </span>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search family..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/30 border-border/50 focus:border-primary/50"
          />
        </div>
      </div>

      <Tabs defaultValue="all" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-3 grid w-auto grid-cols-3 bg-muted/30">
          <TabsTrigger value="all" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            All
          </TabsTrigger>
          <TabsTrigger value="generations" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            By Gen
          </TabsTrigger>
          <TabsTrigger value="recent" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
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
