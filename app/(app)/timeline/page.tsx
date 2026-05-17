"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { FamilyMember, Milestone } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import { DemoBanner } from "@/components/demo-banner"
import {
  ArrowLeft,
  Search,
  Calendar,
  Baby,
  GraduationCap,
  Briefcase,
  Heart,
  Award,
  MapPin,
  Star,
  Users,
  Filter,
  ChevronDown
} from "lucide-react"

const milestoneIcons: Record<string, React.ElementType> = {
  birth: Baby,
  education: GraduationCap,
  career: Briefcase,
  marriage: Heart,
  achievement: Award,
  relocation: MapPin,
  other: Star
}

const milestoneColors: Record<string, string> = {
  birth: "bg-green-500/20 text-green-400 border-green-500/30",
  education: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  career: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  marriage: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  achievement: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  relocation: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  other: "bg-slate-500/20 text-slate-400 border-slate-500/30"
}

interface TimelineEvent {
  year: number
  member: FamilyMember
  type: "birth" | "death" | "milestone"
  milestone?: Milestone
  title: string
  description?: string
}

export default function TimelinePage() {
  const { familyId, user, loading: authLoading } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const isDemoMode = !authLoading && !user
  const allMembers = isDemoMode ? sampleFamilyMembers : (familyId && !loading ? dbMembers : [])

  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterMember, setFilterMember] = useState<string>("all")

  // Generate timeline events from family data
  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = []

    allMembers.forEach((member) => {
      // Add birth event
      if (member.birthYear) {
        events.push({
          year: member.birthYear,
          member,
          type: "birth",
          title: `${member.name} was born`,
          description: member.birthPlace ? `Born in ${member.birthPlace}` : undefined
        })
      }

      // Add death event
      if (member.deathYear) {
        events.push({
          year: member.deathYear,
          member,
          type: "death",
          title: `${member.name} passed away`,
          description: member.birthYear
            ? `Lived ${member.deathYear - member.birthYear} years`
            : undefined
        })
      }

      // Add milestones
      member.milestones?.forEach((milestone) => {
        events.push({
          year: milestone.year,
          member,
          type: "milestone",
          milestone,
          title: milestone.title,
          description: milestone.description
        })
      })
    })

    // Sort by year descending (most recent first)
    return events.sort((a, b) => b.year - a.year)
  }, [allMembers])

  // Apply filters
  const filteredEvents = useMemo(() => {
    return timelineEvents.filter((event) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          event.title.toLowerCase().includes(query) ||
          event.member.name.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // Type filter
      if (filterType !== "all") {
        if (filterType === "birth" && event.type !== "birth") return false
        if (filterType === "death" && event.type !== "death") return false
        if (filterType !== "birth" && filterType !== "death" && event.type === "milestone") {
          if (event.milestone?.type !== filterType) return false
        } else if (filterType !== "birth" && filterType !== "death" && event.type !== "milestone") {
          return false
        }
      }

      // Member filter
      if (filterMember !== "all" && event.member.id !== filterMember) {
        return false
      }

      return true
    })
  }, [timelineEvents, searchQuery, filterType, filterMember])

  // Group events by decade
  const eventsByDecade = useMemo(() => {
    const grouped: Record<string, TimelineEvent[]> = {}

    filteredEvents.forEach((event) => {
      const decade = Math.floor(event.year / 10) * 10
      const decadeKey = `${decade}s`

      if (!grouped[decadeKey]) {
        grouped[decadeKey] = []
      }
      grouped[decadeKey].push(event)
    })

    return grouped
  }, [filteredEvents])

  const getEventIcon = (event: TimelineEvent) => {
    if (event.type === "birth") return Baby
    if (event.type === "death") return Star
    return milestoneIcons[event.milestone?.type || "other"]
  }

  const getEventColor = (event: TimelineEvent) => {
    if (event.type === "birth") return milestoneColors.birth
    if (event.type === "death") return "bg-slate-500/20 text-slate-400 border-slate-500/30"
    return milestoneColors[event.milestone?.type || "other"]
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <DemoBanner />
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="text-muted-foreground">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Family Timeline</h1>
                <p className="text-sm text-muted-foreground">
                  {filteredEvents.length} events across {Object.keys(eventsByDecade).length} decades
                </p>
              </div>
            </div>

            <Link href="/dashboard">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-foreground hidden sm:block">Family Graph</span>
              </div>
            </Link>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="sticky top-16 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50 border-border"
              />
            </div>

            <div className="flex items-center gap-3">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40 bg-muted/50 border-border">
                  <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="birth">Births</SelectItem>
                  <SelectItem value="death">Deaths</SelectItem>
                  <SelectItem value="marriage">Marriages</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="career">Career</SelectItem>
                  <SelectItem value="achievement">Achievements</SelectItem>
                  <SelectItem value="relocation">Relocations</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterMember} onValueChange={setFilterMember}>
                <SelectTrigger className="w-44 bg-muted/50 border-border">
                  <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Family member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {allMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {Object.keys(eventsByDecade).length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No events found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {Object.entries(eventsByDecade).map(([decade, events]) => (
              <div key={decade}>
                {/* Decade header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                    <span className="text-lg font-bold text-primary">{decade}</span>
                  </div>
                  <div className="flex-1 h-px bg-border" />
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    {events.length} {events.length === 1 ? "event" : "events"}
                  </Badge>
                </div>

                {/* Events in decade */}
                <div className="relative pl-8 border-l-2 border-border space-y-6">
                  {events.map((event, index) => {
                    const EventIcon = getEventIcon(event)
                    const colorClass = getEventColor(event)

                    return (
                      <div key={`${event.member.id}-${event.year}-${index}`} className="relative">
                        {/* Timeline dot */}
                        <div className={`absolute -left-[25px] w-4 h-4 rounded-full border-2 ${colorClass}`} />

                        {/* Event card */}
                        <div className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors">
                          <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
                              <EventIcon className="w-5 h-5" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-primary">{event.year}</span>
                                <span className="text-muted-foreground">•</span>
                                <Link
                                  href={`/dashboard?member=${event.member.id}`}
                                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {event.member.name}
                                </Link>
                              </div>

                              <h3 className="text-foreground font-medium mb-1">{event.title}</h3>

                              {event.description && (
                                <p className="text-sm text-muted-foreground">{event.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
