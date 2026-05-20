"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import { useEvents } from "@/hooks/use-events"
import {
  ArrowLeft, Plus, Calendar, MapPin, Users, X,
  PartyPopper, Church, Home, Coffee, Clock, Trash2,
} from "lucide-react"
import { cn, copyToClipboard } from "@/lib/utils"
import { DemoBanner } from "@/components/demo-banner"

type EventType = "reunion" | "wedding" | "puja" | "birthday" | "funeral" | "other"
type RSVPStatus = "going" | "not-going" | "maybe" | "pending"

interface FamilyEventItem {
  id: string
  title: string
  type: EventType
  date: string
  time?: string
  location: string
  description?: string
  organizer: string
  invitedMemberIds: string[]
  rsvps: Record<string, RSVPStatus>
}

const EVENT_TYPE_ICONS: Record<EventType, React.ElementType> = {
  reunion: Home,
  wedding: Church,
  puja: PartyPopper,
  birthday: PartyPopper,
  funeral: Coffee,
  other: Calendar,
}

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  reunion: "bg-blue-500/10 text-blue-600 border-blue-200",
  wedding: "bg-pink-500/10 text-pink-600 border-pink-200",
  puja: "bg-orange-500/10 text-orange-600 border-orange-200",
  birthday: "bg-purple-500/10 text-purple-600 border-purple-200",
  funeral: "bg-slate-500/10 text-slate-600 border-slate-200",
  other: "bg-gray-500/10 text-gray-600 border-gray-200",
}

const SAMPLE_EVENTS: FamilyEventItem[] = [
  {
    id: "e1",
    title: "Annual Sharma Family Reunion 2026",
    type: "reunion",
    date: "2026-06-15",
    time: "11:00 AM",
    location: "Suresh Dada's Home, Nagpur",
    description: "Annual gathering of the entire Sharma-Mishra family. Lunch, games, and family tree update session.",
    organizer: "g2-1",
    invitedMemberIds: sampleFamilyMembers.map(m => m.id),
    rsvps: { "g3-1": "going", "g2-1": "going", "g2-2": "going", "g1-1": "going", "g1-2": "going", "g3-2": "maybe", "g2-3": "pending" },
  },
  {
    id: "e2",
    title: "Karan & Ananya's Engagement",
    type: "wedding",
    date: "2026-07-20",
    time: "6:00 PM",
    location: "Mishra Residence, Bengaluru",
    description: "Engagement ceremony of Karan Mishra and Ananya Reddy.",
    organizer: "g2-5",
    invitedMemberIds: ["g3-1", "g3-2", "g2-1", "g2-2", "g2-5", "g2-6", "g1-3", "g1-4"],
    rsvps: { "g3-1": "going", "g3-2": "going", "g2-1": "going" },
  },
  {
    id: "e3",
    title: "Suresh Dada's 81st Birthday Puja",
    type: "puja",
    date: "2026-08-03",
    time: "9:00 AM",
    location: "Sharma Home, Nagpur",
    description: "Birthday puja and celebration for Suresh Kumar Sharma.",
    organizer: "g2-1",
    invitedMemberIds: ["g3-1", "g3-2", "g2-1", "g2-2", "g2-3", "g2-4", "g1-1", "g1-2"],
    rsvps: { "g3-1": "going", "g3-2": "going" },
  },
]

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
}

function getDaysUntil(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const event = new Date(dateStr)
  event.setHours(0, 0, 0, 0)
  const diff = Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff < 0) return `${Math.abs(diff)} days ago`
  return `In ${diff} days`
}

export default function EventsPage() {
  const { familyId, user, profile, loading: authLoading } = useAuth()
  const { members: dbMembers, loading: membersLoading } = useMembers(familyId)
  const { events: dbEvents, loading: eventsLoading, createEvent: dbCreateEvent, updateRSVP, deleteEvent: dbDeleteEvent } = useEvents(familyId)
  const isDemoMode = !authLoading && !user
  const allMembers = isDemoMode ? sampleFamilyMembers : (familyId && !membersLoading ? dbMembers : [])

  // Map DB events to the local FamilyEventItem shape for unified rendering
  // Normalize DB 'cant' → 'not-going' to match the UI RSVPStatus type
  const dbMappedEvents: FamilyEventItem[] = dbEvents.map(e => {
    const normalizedRsvps: Record<string, RSVPStatus> = {}
    for (const [uid, status] of Object.entries(e.rsvps ?? {})) {
      normalizedRsvps[uid] = (status === 'cant' ? 'not-going' : status) as RSVPStatus
    }
    return {
      id: e.id,
      title: e.title,
      type: "other" as EventType,
      date: e.eventDate.split("T")[0],
      time: e.eventDate.includes("T") ? new Date(e.eventDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : undefined,
      location: e.location ?? "",
      description: e.description,
      organizer: e.createdBy ?? "",
      invitedMemberIds: allMembers.map(m => m.id),
      rsvps: normalizedRsvps,
    }
  })

  const [localEvents, setLocalEvents] = useState<FamilyEventItem[]>(SAMPLE_EVENTS)
  const events = isDemoMode ? localEvents : (familyId && !eventsLoading ? dbMappedEvents : [])

  // Pre-populate myRSVPs from persisted DB data for the current user
  const [myRSVPs, setMyRSVPs] = useState<Record<string, RSVPStatus>>(() => {
    if (!user) return {}
    const initial: Record<string, RSVPStatus> = {}
    for (const e of dbMappedEvents) {
      const persisted = e.rsvps[user.id]
      if (persisted) initial[e.id] = persisted
    }
    return initial
  })

  // Sync myRSVPs when DB events load/change (handles page refresh)
  useEffect(() => {
    if (!user) return
    setMyRSVPs(prev => {
      const next = { ...prev }
      for (const e of dbMappedEvents) {
        const persisted = e.rsvps[user.id]
        if (persisted && !next[e.id]) next[e.id] = persisted
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbEvents, user])

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: "", type: "reunion" as EventType, date: "", time: "", location: "", description: "" })
  const [filter, setFilter] = useState<"all" | "upcoming" | "mine">("upcoming")

  // Apply filter — this is what was broken (filter was stored but never applied)
  const filteredEvents = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    switch (filter) {
      case "upcoming":
        return events
          .filter(e => new Date(e.date) >= today)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      case "mine":
        // In demo mode match the first sample member; in real mode match current user
        return events.filter(e => isDemoMode
          ? e.organizer === allMembers[0]?.id
          : e.organizer === user?.id
        )
      default:
        return events
    }
  }, [events, filter, isDemoMode, user, allMembers])

  const rsvp = (eventId: string, status: RSVPStatus) => {
    setMyRSVPs(prev => ({ ...prev, [eventId]: status }))
    if (familyId && user) updateRSVP(eventId, user.id, status === 'not-going' ? 'cant' : status as 'going' | 'maybe' | 'cant').catch(() => { })
  }

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdEventShare, setCreatedEventShare] = useState<{ title: string; date: string; time?: string; location: string; description?: string } | null>(null)

  const createEvent = async () => {
    const missing = []
    if (!newEvent.title.trim()) missing.push('title')
    if (!newEvent.date) missing.push('date')
    if (!newEvent.location.trim()) missing.push('location')
    if (missing.length > 0) {
      setCreateError(`Please fill in: ${missing.join(', ')}`)
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      if (familyId && user) {
        const eventDate = newEvent.time ? `${newEvent.date}T${newEvent.time}:00` : newEvent.date
        await dbCreateEvent(familyId, { title: newEvent.title, description: newEvent.description, eventDate, location: newEvent.location }, user.id)
        setCreatedEventShare({ title: newEvent.title, date: newEvent.date, time: newEvent.time || undefined, location: newEvent.location, description: newEvent.description || undefined })
      } else {
        // Demo mode: add to local state
        const ev: FamilyEventItem = {
          id: `e${Date.now()}`,
          ...newEvent,
          organizer: allMembers[0]?.id ?? 'demo',
          invitedMemberIds: allMembers.map(m => m.id),
          rsvps: {},
        }
        setLocalEvents(prev => [ev, ...prev])
        setCreatedEventShare({ title: newEvent.title, date: newEvent.date, time: newEvent.time || undefined, location: newEvent.location, description: newEvent.description || undefined })
      }
      setShowCreateForm(false)
      setNewEvent({ title: "", type: "reunion", date: "", time: "", location: "", description: "" })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create event. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background overflow-x-hidden">
      <DemoBanner />
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/50 bg-card/95 backdrop-blur px-4 sm:px-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Family Events</h1>
          <p className="text-xs text-muted-foreground">Reunions, pujas &amp; celebrations</p>
        </div>
        <Button size="sm" onClick={() => setShowCreateForm(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Create Event
        </Button>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-5">

        {/* Create Event Form */}
        {showCreateForm && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">New Event</h2>
              <button onClick={() => setShowCreateForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Event title *"
                value={newEvent.title}
                onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
                className={`sm:col-span-2 ${!newEvent.title && createError ? 'border-destructive' : ''}`}
              />
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newEvent.type}
                onChange={e => setNewEvent(p => ({ ...p, type: e.target.value as EventType }))}
              >
                {(["reunion", "wedding", "puja", "birthday", "other"] as EventType[]).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
              <Input
                type="date"
                value={newEvent.date}
                onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                className={!newEvent.date && createError ? 'border-destructive' : ''}
              />
              <Input
                type="time"
                value={newEvent.time}
                onChange={e => setNewEvent(p => ({ ...p, time: e.target.value }))}
                className=""
              />
              <Input
                placeholder="Location *"
                value={newEvent.location}
                onChange={e => setNewEvent(p => ({ ...p, location: e.target.value }))}
                className={`sm:col-span-2 ${!newEvent.location && createError ? 'border-destructive' : ''}`}
              />
              <Input
                placeholder="Description (optional)"
                value={newEvent.description}
                onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))}
                className="sm:col-span-2"
              />
            </div>
            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowCreateForm(false); setCreateError(null) }}>Cancel</Button>
              <Button
                size="sm"
                onClick={createEvent}
                disabled={creating || !newEvent.title || !newEvent.date || !newEvent.location}
              >
                {creating ? 'Creating…' : 'Create Event'}
              </Button>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {(["upcoming", "all", "mine"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Events */}
        {filteredEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {filter === 'upcoming' ? 'No upcoming events' : filter === 'mine' ? 'You haven\'t created any events yet' : 'No events'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click "Create Event" to add one</p>
          </div>
        )}
        {filteredEvents.map(event => {
          const myStatus = myRSVPs[event.id] || "pending"
          const Icon = EVENT_TYPE_ICONS[event.type]
          const goingIds = Object.entries(event.rsvps).filter(([, s]) => s === "going").map(([id]) => id)
          const maybeIds = Object.entries(event.rsvps).filter(([, s]) => s === "maybe").map(([id]) => id)
          const cantIds = Object.entries(event.rsvps).filter(([, s]) => s === "not-going").map(([id]) => id)
          const toName = (id: string) => {
            if (id === user?.id) return profile?.display_name?.split(' ')[0] ?? 'You'
            const m = allMembers.find(m => m.id === id || (m as any).claimedByUserId === id)
            return m?.name.split(' ')[0] ?? 'Family Member'
          }
          const invited = allMembers.filter(m => event.invitedMemberIds.includes(m.id))
          const isOwner = isDemoMode ? event.organizer === allMembers[0]?.id : event.organizer === user?.id
          const whatsappText = encodeURIComponent(
            `📅 *${event.title}*\n🗓️ ${formatDate(event.date)}${event.time ? ` · ${event.time}` : ""}\n📍 ${event.location}${event.description ? `\n\n${event.description}` : ""}\n\nRSVP on Family Graph: ${typeof window !== "undefined" ? window.location.origin : ""}/events`
          )

          return (
            <div key={event.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Type color bar */}
              <div className={cn("flex items-center gap-2 px-5 py-3 border-b border-border/50", EVENT_TYPE_COLORS[event.type])}>
                <Icon className="h-4 w-4" />
                <Badge variant="outline" className={cn("text-[10px] h-4 py-0 border-current/30 capitalize", EVENT_TYPE_COLORS[event.type])}>
                  {event.type}
                </Badge>
                <span className="ml-auto text-xs font-medium">{getDaysUntil(event.date)}</span>
                {isOwner && (
                  <button
                    onClick={() => {
                      if (!confirm(`Delete "${event.title}"?`)) return
                      if (isDemoMode) {
                        setLocalEvents(prev => prev.filter(e => e.id !== event.id))
                      } else {
                        dbDeleteEvent(event.id).catch(() => { })
                      }
                    }}
                    className="ml-1 text-current/50 hover:text-destructive transition-colors"
                    title="Delete event"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-base">{event.title}</h3>
                  {event.description && <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>}
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(event.date)}{event.time && ` · ${event.time}`}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.location}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {goingIds.length} going
                  </span>
                </div>

                {/* Invited member avatars */}
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {invited.slice(0, 6).map(m => (
                      <Avatar key={m.id} className="h-7 w-7 border-2 border-card">
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                          {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {invited.length > 6 && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] text-muted-foreground font-medium">
                        +{invited.length - 6}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{invited.length} invited</span>
                </div>

                {/* RSVP breakdown pills */}
                {(goingIds.length > 0 || maybeIds.length > 0 || cantIds.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {goingIds.length > 0 && (
                      <span className="rounded-full bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 px-2 py-0.5">
                        ✅ {goingIds.length} going{goingIds.length <= 3 ? ` · ${goingIds.map(toName).join(", ")}` : ""}
                      </span>
                    )}
                    {maybeIds.length > 0 && (
                      <span className="rounded-full bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 px-2 py-0.5">
                        🤔 {maybeIds.length} maybe{maybeIds.length <= 3 ? ` · ${maybeIds.map(toName).join(", ")}` : ""}
                      </span>
                    )}
                    {cantIds.length > 0 && (
                      <span className="rounded-full bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 px-2 py-0.5">
                        ❌ {cantIds.length} can't go{cantIds.length <= 3 ? ` · ${cantIds.map(toName).join(", ")}` : ""}
                      </span>
                    )}
                  </div>
                )}

                {/* RSVP buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
                  <span className="text-xs text-muted-foreground mr-1">Your RSVP:</span>
                  {([
                    ["going", "✅ Going"],
                    ["maybe", "🤔 Maybe"],
                    ["not-going", "❌ Can't Go"],
                  ] as [RSVPStatus, string][]).map(([status, label]) => (
                    <button
                      key={status}
                      onClick={() => rsvp(event.id, status)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                        myStatus === status
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  <a
                    href={`https://wa.me/?text=${whatsappText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1 transition-colors"
                  >
                    💬 Share on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Post-create share sheet ──────────────────────────────── */}
      {createdEventShare && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-green-500/30 bg-card p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500 text-xl">🎉</div>
              <div>
                <p className="font-semibold">Event Created!</p>
                <p className="text-sm text-muted-foreground">Share it with your family so they can RSVP.</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1 text-sm">
              <p className="font-medium">{createdEventShare.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(createdEventShare.date)}{createdEventShare.time ? ` · ${createdEventShare.time}` : ''} · {createdEventShare.location}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `📅 *${createdEventShare.title}*\n🗓️ ${formatDate(createdEventShare.date)}${createdEventShare.time ? ` · ${createdEventShare.time}` : ''}\n📍 ${createdEventShare.location}${createdEventShare.description ? `\n\n${createdEventShare.description}` : ''}\n\nRSVP on Family Graph: ${typeof window !== 'undefined' ? window.location.origin : ''}/events`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 transition-colors"
              >
                💬 WhatsApp
              </a>
              <button
                onClick={() => {
                  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/events`
                  if (navigator.share) {
                    navigator.share({ title: createdEventShare.title, url }).catch(() => { })
                  } else {
                    copyToClipboard(url)
                  }
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted hover:bg-muted/70 text-foreground text-sm font-medium py-2.5 transition-colors"
              >
                🔗 Copy Link
              </button>
            </div>

            <button
              onClick={() => setCreatedEventShare(null)}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
