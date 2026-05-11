"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import type { FamilyMember } from "@/lib/types"
import { ArrowLeft, Cake, Heart, Clock, ExternalLink } from "lucide-react"

const TODAY_DEMO = new Date("2026-05-11")

function getBirthdays(members: FamilyMember[]) {
  return members
    .filter(m => m.birthYear && m.isAlive !== false)
    .map((m, i) => {
      const age = TODAY_DEMO.getFullYear() - m.birthYear!
      const daysUntil = (i * 3) % 15 // demo spread
      return { member: m, age, daysUntil }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 4)
}

function getAnniversaries(members: FamilyMember[]) {
  return members
    .filter(m => m.milestones?.some(ms => ms.type === "marriage"))
    .map((m, i) => {
      const ms = m.milestones!.find(ms => ms.type === "marriage")!
      const years = TODAY_DEMO.getFullYear() - ms.year
      return { member: m, milestone: ms, years, daysUntil: (i * 7) % 30 }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 3)
}

function getHistoricalEvents(members: FamilyMember[]) {
  const events: { year: number; text: string; memberName: string; memberId: string }[] = []
  members.forEach(m => {
    m.milestones?.forEach(ms => {
      if (ms.year < TODAY_DEMO.getFullYear()) {
        events.push({ year: ms.year, text: ms.title, memberName: m.name, memberId: m.id })
      }
    })
  })
  return events.slice(0, 6)
}

function DaysChip({ days }: { days: number }) {
  if (days === 0) return <Badge className="bg-green-500/10 text-green-600 border border-green-200 hover:bg-green-500/10">Today! 🎉</Badge>
  if (days === 1) return <Badge className="bg-amber-500/10 text-amber-600 border border-amber-200 hover:bg-amber-500/10">Tomorrow</Badge>
  return <Badge variant="outline" className="text-muted-foreground">In {days} days</Badge>
}

export default function TodayPage() {
  const { familyId } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const members = familyId && !loading ? dbMembers : sampleFamilyMembers

  const birthdays = getBirthdays(members)
  const anniversaries = getAnniversaries(members)
  const historicalEvents = getHistoricalEvents(members)

  const dateStr = TODAY_DEMO.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/50 bg-card/95 backdrop-blur px-4 sm:px-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg">On This Day</h1>
          <p className="text-xs text-muted-foreground">{dateStr}</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 space-y-8">

        {/* Birthdays */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Cake className="h-4 w-4 text-purple-500" />
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Upcoming Birthdays</h2>
          </div>
          <div className="space-y-3">
            {birthdays.map(({ member, age, daysUntil }) => (
              <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <Avatar className="h-11 w-11">
                  <AvatarFallback className="bg-purple-500/10 text-purple-600 font-bold">
                    {member.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{member.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Turning {age + (daysUntil > 0 ? 1 : 0)} · {String(member.relationship ?? "family").replace(/-/g, " ")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <DaysChip days={daysUntil} />
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    🎂 Wish on WhatsApp
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Anniversaries */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Heart className="h-4 w-4 text-pink-500" />
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Anniversaries</h2>
          </div>
          <div className="space-y-3">
            {anniversaries.map(({ member, milestone, years, daysUntil }) => (
              <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-pink-500/10 text-pink-500 text-xl">
                  💍
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{milestone.title}</p>
                  <p className="text-xs text-muted-foreground">{years} years · {member.name}</p>
                </div>
                <DaysChip days={daysUntil} />
              </div>
            ))}
          </div>
        </section>

        {/* Historical Events */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">This Day in History</h2>
          </div>
          <div className="relative pl-6 space-y-4 border-l-2 border-dashed border-border ml-3">
            {historicalEvents.map((ev, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[25px] top-1 h-3 w-3 rounded-full border-2 border-amber-400 bg-card" />
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{ev.text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ev.memberName} · {ev.year} ({TODAY_DEMO.getFullYear() - ev.year} years ago)
                      </p>
                    </div>
                    <Link href="/dashboard">
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Daily Wisdom */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 border border-primary/20 p-5 text-center">
          <div className="text-3xl mb-2">🌅</div>
          <p className="text-sm font-medium italic text-foreground/80">
            "जहाँ सुमति तहँ संपति नाना" — Where there is wisdom, there is prosperity.
          </p>
          <p className="text-xs text-muted-foreground mt-1">— Ramcharitmanas</p>
        </div>
      </div>
    </div>
  )
}
