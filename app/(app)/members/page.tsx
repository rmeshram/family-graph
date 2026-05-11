"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import {
  ArrowLeft, Search, Users, UserPlus, MapPin, Briefcase,
  Filter, ChevronRight, Baby, Crown, Heart,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FamilyMember } from "@/lib/types"

const SIDE_COLORS: Record<string, string> = {
  paternal: "bg-blue-500/10 text-blue-600 border-blue-200",
  maternal: "bg-pink-500/10 text-pink-600 border-pink-200",
  both: "bg-purple-500/10 text-purple-600 border-purple-200",
  spouse: "bg-amber-500/10 text-amber-600 border-amber-200",
}

const GENDER_ICONS: Record<string, string> = {
  male: "👨",
  female: "👩",
  other: "🧑",
}

export default function MembersPage() {
  const { familyId } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const allMembers = familyId && !loading ? dbMembers : sampleFamilyMembers

  const [search, setSearch] = useState("")
  const [filterGen, setFilterGen] = useState<number | "all">("all")
  const [filterSide, setFilterSide] = useState<string>("all")

  const generations = useMemo(
    () => [...new Set(allMembers.map(m => m.generation))].sort((a, b) => a - b),
    [allMembers]
  )

  const filtered = useMemo(() => {
    return allMembers.filter(m => {
      const matchSearch = !search ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.occupation?.toLowerCase().includes(search.toLowerCase()) ||
        m.currentPlace?.toLowerCase().includes(search.toLowerCase())
      const matchGen = filterGen === "all" || m.generation === filterGen
      const matchSide = filterSide === "all" || m.side === filterSide
      return matchSearch && matchGen && matchSide
    })
  }, [allMembers, search, filterGen, filterSide])

  const stats = useMemo(() => ({
    total: allMembers.length,
    alive: allMembers.filter(m => m.isAlive !== false).length,
    generations: new Set(allMembers.map(m => m.generation)).size,
    cities: new Set(allMembers.map(m => m.currentPlace).filter(Boolean)).size,
  }), [allMembers])

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/50 bg-card/95 backdrop-blur px-4 sm:px-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg">
          <Users className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Family Members</h1>
          <p className="text-xs text-muted-foreground">{stats.total} members · {stats.generations} generations</p>
        </div>
        <Link href="/dashboard">
          <Button size="sm" className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Add Member
          </Button>
        </Link>
      </header>

      {/* Stats Strip */}
      <div className="grid grid-cols-4 divide-x divide-border/50 border-b border-border/50 bg-card/50">
        {[
          { label: "Total", value: stats.total, icon: Users, color: "text-indigo-400" },
          { label: "Living", value: stats.alive, icon: Heart, color: "text-green-400" },
          { label: "Generations", value: stats.generations, icon: Crown, color: "text-amber-400" },
          { label: "Cities", value: stats.cities, icon: MapPin, color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center py-3 px-2">
            <s.icon className={cn("h-4 w-4 mb-1", s.color)} />
            <span className="font-bold text-lg">{s.value}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="border-b border-border/50 bg-card/30 px-4 py-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, city, occupation…"
            className="pl-9 h-9 bg-muted/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <div className="flex gap-1 shrink-0">
            <Filter className="h-3.5 w-3.5 text-muted-foreground self-center" />
            <span className="text-xs text-muted-foreground self-center mr-1">Gen:</span>
            {["all", ...generations].map(g => (
              <button
                key={String(g)}
                onClick={() => setFilterGen(g as number | "all")}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors shrink-0",
                  filterGen === g
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {g === "all" ? "All" : `G${g}`}
              </button>
            ))}
          </div>
          <div className="flex gap-1 shrink-0">
            <span className="text-xs text-muted-foreground self-center">Side:</span>
            {["all", "paternal", "maternal", "spouse"].map(s => (
              <button
                key={s}
                onClick={() => setFilterSide(s)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors shrink-0",
                  filterSide === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Member List */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl p-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading family members…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">No members match your search</p>
            </div>
          )}
          {filtered.map(member => (
            <MemberRow key={member.id} member={member} allMembers={allMembers} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MemberRow({ member, allMembers }: { member: FamilyMember; allMembers: FamilyMember[] }) {
  const initials = member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  const parents = allMembers.filter(m => member.parentIds.includes(m.id))
  const spouses = allMembers.filter(m => member.spouseIds.includes(m.id))

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-3.5 hover:border-primary/30 hover:bg-card/80 transition-all">
      <Avatar className="h-12 w-12 shrink-0">
        {member.photoUrl ? (
          <img src={member.photoUrl} alt={member.name} className="h-full w-full object-cover rounded-full" />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{member.name}</span>
          {member.gender && <span className="text-sm">{GENDER_ICONS[member.gender]}</span>}
          {member.isAlive === false && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 text-muted-foreground">Departed</Badge>
          )}
          {member.side && (
            <Badge variant="outline" className={cn("text-[10px] py-0 h-4", SIDE_COLORS[member.side] ?? "")}>
              {member.side}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] py-0 h-4 text-muted-foreground">Gen {member.generation}</Badge>
        </div>

        <div className="mt-0.5 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          {member.birthYear && (
            <span className="flex items-center gap-1">
              <Baby className="h-3 w-3" />
              b. {member.birthYear}
            </span>
          )}
          {member.currentPlace && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {member.currentPlace}
            </span>
          )}
          {member.occupation && (
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {member.occupation}
            </span>
          )}
        </div>

        {(parents.length > 0 || spouses.length > 0) && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            {parents.length > 0 && (
              <span>↑ {parents.map(p => p.name.split(" ")[0]).join(" & ")}</span>
            )}
            {spouses.length > 0 && (
              <span className="flex items-center gap-0.5">
                <Heart className="h-2.5 w-2.5 text-pink-400" />
                {spouses.map(s => s.name.split(" ")[0]).join(" & ")}
              </span>
            )}
          </div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </div>
  )
}
