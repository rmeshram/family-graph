"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import { DemoBanner } from "@/components/demo-banner"
import { whatsAppShareUrl } from "@/lib/whatsapp-invite"
import type { FamilyMember } from "@/lib/types"
import { ArrowLeft, Cake, Heart, Clock, ExternalLink, Share2 } from "lucide-react"

/** Days until the next occurrence of month/day from today (0 = today, 1 = tomorrow …) */
function daysUntilDate(month: number, day: number, today: Date): number {
  const y = today.getFullYear()
  const t = new Date(today); t.setHours(0, 0, 0, 0)
  let next = new Date(y, month - 1, day)
  next.setHours(0, 0, 0, 0)
  if (next < t) next = new Date(y + 1, month - 1, day)
  return Math.round((next.getTime() - t.getTime()) / 86_400_000)
}

function getBirthdays(members: FamilyMember[], today: Date) {
  return members
    .filter(m => m.isAlive !== false && m.birthMonth != null && m.birthDay != null)
    .map(m => ({
      member: m,
      age: m.birthYear ? today.getFullYear() - m.birthYear : null,
      daysUntil: daysUntilDate(m.birthMonth!, m.birthDay!, today),
    }))
    .filter(b => b.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 6)
}

function getAnniversaries(members: FamilyMember[], today: Date) {
  const results: { member: FamilyMember; milestoneTitle: string; years: number; daysUntil: number }[] = []
  members.forEach(m => {
    m.milestones?.filter(ms => ms.type === "marriage" && ms.year > 0).forEach(ms => {
      // Use June 1 as a placeholder month/day when only year is known
      const annivMonth = (ms as any).month ?? 6
      const annivDay = (ms as any).day ?? 1
      const daysUntil = daysUntilDate(annivMonth, annivDay, today)
      if (daysUntil <= 30) {
        results.push({ member: m, milestoneTitle: ms.title, years: today.getFullYear() - ms.year, daysUntil })
      }
    })
  })
  return results.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 4)
}

function getHistoricalEvents(members: FamilyMember[], today: Date) {
  const events: { year: number; text: string; memberName: string; memberId: string }[] = []
  members.forEach(m => {
    m.milestones?.forEach(ms => {
      if (ms.year < today.getFullYear()) {
        events.push({ year: ms.year, text: ms.title, memberName: m.name, memberId: m.id })
      }
    })
  })
  return events.sort((a, b) => b.year - a.year).slice(0, 6)
}

function DaysChip({ days }: { days: number }) {
  if (days === 0) return <Badge className="bg-green-500/10 text-green-600 border border-green-200 hover:bg-green-500/10">Today! 🎉</Badge>
  if (days === 1) return <Badge className="bg-amber-500/10 text-amber-600 border border-amber-200 hover:bg-amber-500/10">Tomorrow</Badge>
  return <Badge variant="outline" className="text-muted-foreground">In {days} days</Badge>
}

function buildGroupShareMessage(
  birthdays: ReturnType<typeof getBirthdays>,
  anniversaries: ReturnType<typeof getAnniversaries>,
  historicalEvents: ReturnType<typeof getHistoricalEvents>,
  today: Date,
): string {
  const lines: string[] = ['🌅 Good morning from Outverse!\n']
  birthdays.slice(0, 3).forEach(({ member, age, daysUntil }) => {
    const ageLine = age != null ? ` (turning ${age + (daysUntil > 0 ? 1 : 0)})` : ''
    if (daysUntil === 0) lines.push(`🎂 Today is ${member.name}'s birthday!${ageLine}`)
    else if (daysUntil === 1) lines.push(`🎂 Tomorrow is ${member.name}'s birthday${ageLine}`)
    else lines.push(`🎂 ${member.name}'s birthday in ${daysUntil} days${ageLine}`)
  })
  anniversaries.slice(0, 2).forEach(({ member, milestoneTitle, years, daysUntil }) => {
    if (daysUntil === 0) lines.push(`💍 Today: ${milestoneTitle} — ${years} years!`)
    else if (daysUntil === 1) lines.push(`💍 Tomorrow: ${milestoneTitle} — ${years} years`)
    else lines.push(`💍 ${milestoneTitle} in ${daysUntil} days (${years} yrs)`)
  })
  historicalEvents.slice(0, 2).forEach(ev => {
    lines.push(`📅 ${today.getFullYear() - ev.year} years ago: ${ev.text} — ${ev.memberName}`)
  })
  if (lines.length === 1) lines.push('No upcoming events this week.')
  lines.push(`\nSee the full family calendar 👉 ${typeof window !== 'undefined' ? window.location.origin : ''}/today`)
  return lines.join('\n')
}

export default function TodayPage() {
  const { familyId, user, loading: authLoading } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const isDemoMode = !authLoading && !user

  const today = new Date()
  const members = isDemoMode ? sampleFamilyMembers : (familyId && !loading ? dbMembers : [])

  const birthdays = getBirthdays(members, today)
  const anniversaries = getAnniversaries(members, today)
  const historicalEvents = getHistoricalEvents(members, today)

  const hasAnything = birthdays.length > 0 || anniversaries.length > 0 || historicalEvents.length > 0

  const dateStr = today.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <DemoBanner />
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
        {hasAnything && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 hover:border-[#25D366]/50"
            onClick={() => {
              const msg = buildGroupShareMessage(birthdays, anniversaries, historicalEvents, today)
              window.open(whatsAppShareUrl(msg), '_blank', 'noopener,noreferrer')
            }}
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
        )}
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 space-y-8">

        {/* Empty state for logged-in users with no data */}
        {!isDemoMode && members.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="text-4xl">📅</div>
            <h3 className="font-semibold text-lg">No events yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Add family members with birth years and milestones to see upcoming birthdays, anniversaries, and events here.
            </p>
            <Link href="/dashboard">
              <Button size="sm" className="mt-2">Add Family Members</Button>
            </Link>
          </div>
        )}

        {/* Birthdays */}
        {birthdays.length > 0 && (
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
                      {member.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Turning {(age ?? 0) + (daysUntil > 0 ? 1 : 0)} · {String(member.relationship ?? "family").replace(/-/g, " ")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <DaysChip days={daysUntil} />
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => {
                        const msg = encodeURIComponent(`🎂 Happy Birthday ${member.name}! Wishing you a wonderful ${age != null ? `${age + (daysUntil > 0 ? 1 : 0)}th ` : ''}birthday! 🌸 — Outverse`)
                        window.open(`https://wa.me/?text=${msg}`, '_blank')
                      }}
                    >
                      🎂 Wish on WhatsApp
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Anniversaries */}
        {anniversaries.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Heart className="h-4 w-4 text-pink-500" />
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Anniversaries</h2>
            </div>
            <div className="space-y-3">
              {anniversaries.map(({ member, milestoneTitle, years, daysUntil }) => (
                <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-pink-500/10 text-pink-500 text-xl">
                    💍
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{milestoneTitle}</p>
                    <p className="text-xs text-muted-foreground">{years} years · {member.name}</p>
                  </div>
                  <DaysChip days={daysUntil} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Historical Events */}
        {historicalEvents.length > 0 && (
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
                          {ev.memberName} · {ev.year} ({today.getFullYear() - ev.year} years ago)
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
        )}

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
