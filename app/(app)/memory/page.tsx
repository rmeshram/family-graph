"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { sampleFamilyMembers, sampleMemories, sampleVoiceNotes } from "@/lib/sample-data"
import { MemoryItem, VoiceNote } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import { useMemories, useVoiceNotes } from "@/hooks/use-memories"
import { Textarea } from "@/components/ui/textarea"
import { useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  ArrowLeft,
  Camera,
  Mic,
  Play,
  Pause,
  Search,
  Filter,
  Heart,
  Flower,
  GraduationCap,
  Plane,
  Users,
  Star,
  Plus,
  Clock,
  Languages,
  Download,
  Share2,
  ChevronRight,
  Volume2,
  MessageCircle,
  X,
  Upload,
  ImageIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DemoBanner } from "@/components/demo-banner"

const EVENT_ICONS: Record<string, React.ElementType> = {
  wedding: Heart,
  birth: Star,
  festival: Flower,
  graduation: GraduationCap,
  travel: Plane,
  'family-gathering': Users,
  other: Camera,
}

const EVENT_COLORS: Record<string, string> = {
  wedding: "from-pink-600/20 to-rose-600/20 border-pink-500/30 text-pink-400",
  birth: "from-green-600/20 to-emerald-600/20 border-green-500/30 text-green-400",
  festival: "from-amber-600/20 to-orange-600/20 border-amber-500/30 text-amber-400",
  graduation: "from-blue-600/20 to-indigo-600/20 border-blue-500/30 text-blue-400",
  travel: "from-cyan-600/20 to-teal-600/20 border-cyan-500/30 text-cyan-400",
  'family-gathering': "from-violet-600/20 to-purple-600/20 border-violet-500/30 text-violet-400",
  other: "from-slate-600/20 to-gray-600/20 border-slate-500/30 text-slate-400",
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const BLANK_MEMORY = { title: '', description: '', eventType: 'other' as MemoryItem['eventType'], year: undefined as number | undefined, photoUrl: '', photoFile: null as File | null }

export default function MemoryPage() {
  const { user, familyId, loading: authLoading } = useAuth()
  const { members: dbMembers, loading: membersLoading } = useMembers(familyId)
  const { memories: dbMemories, loading: memoriesLoading, addMemory: dbAddMemory, uploadPhoto } = useMemories(familyId)
  const { voiceNotes: dbVoiceNotes, loading: voiceLoading } = useVoiceNotes(familyId)

  const isDemoMode = !authLoading && !user
  const [localDemoMemories, setLocalDemoMemories] = useState<MemoryItem[]>([])
  const allMembers = isDemoMode ? sampleFamilyMembers : (familyId && !membersLoading ? dbMembers : [])
  const allMemories = isDemoMode
    ? [...localDemoMemories, ...sampleMemories]
    : (familyId && !memoriesLoading ? dbMemories : [])
  const allVoiceNotes = isDemoMode ? sampleVoiceNotes : (familyId && !voiceLoading ? dbVoiceNotes : [])

  const [searchQuery, setSearchQuery] = useState("")
  const [filterEvent, setFilterEvent] = useState<string>("all")
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const [selectedMemory, setSelectedMemory] = useState<MemoryItem | null>(null)
  const { toast } = useToast()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newMemory, setNewMemory] = useState(BLANK_MEMORY)
  const [addingSaving, setAddingSaving] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNewMemory(p => ({ ...p, photoFile: file, photoUrl: '' }))
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleAddMemory = async () => {
    if (!newMemory.title) return

    // Demo mode — add to local state so user sees the memory immediately
    if (isDemoMode) {
      const demoMemory: MemoryItem = {
        id: `demo-${Date.now()}`,
        title: newMemory.title,
        description: newMemory.description || undefined,
        photoUrl: photoPreview || undefined,
        eventType: newMemory.eventType,
        year: newMemory.year,
        taggedMemberIds: [],
        uploadedAt: new Date().toISOString(),
      }
      setLocalDemoMemories(prev => [demoMemory, ...prev])
      setShowAddForm(false)
      setNewMemory(BLANK_MEMORY)
      setPhotoPreview(null)
      toast({ title: 'Memory added (demo)', description: 'Sign in to save memories permanently.' })
      return
    }

    // Not logged in but also not demo (loading state race) — bail
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in to save memories.', variant: 'destructive' })
      return
    }

    // Logged in but no family yet
    if (!familyId) {
      toast({ title: 'No family yet', description: 'Complete onboarding first to save memories.', variant: 'destructive' })
      return
    }

    setAddingSaving(true)
    try {
      let resolvedPhotoUrl = newMemory.photoUrl || undefined
      if (newMemory.photoFile) {
        try {
          resolvedPhotoUrl = await uploadPhoto(newMemory.photoFile, familyId)
        } catch (uploadErr) {
          // Storage bucket may not be set up yet (run migration 005)
          console.warn('Photo upload skipped:', uploadErr)
          resolvedPhotoUrl = undefined
        }
      }
      await dbAddMemory(familyId, {
        title: newMemory.title,
        description: newMemory.description || undefined,
        photoUrl: resolvedPhotoUrl,
        eventType: newMemory.eventType,
        year: newMemory.year,
        taggedMemberIds: [],
      }, user.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error'
      console.error('Memory save failed:', msg)
      toast({ title: 'Could not save memory', description: msg, variant: 'destructive' })
      setAddingSaving(false)
      return
    } finally {
      setAddingSaving(false)
    }

    toast({ title: 'Memory saved!', description: `"${newMemory.title}" added to your vault.` })
    setShowAddForm(false)
    setNewMemory(BLANK_MEMORY)
    setPhotoPreview(null)
  }

  const filteredMemories = useMemo(() => {
    return allMemories.filter(m => {
      const matchSearch = !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchEvent = filterEvent === 'all' || m.eventType === filterEvent
      return matchSearch && matchEvent
    })
  }, [searchQuery, filterEvent, allMemories])

  const stats = useMemo(() => ({
    photos: allMemories.length,
    voices: allVoiceNotes.length,
    years: new Set(allMemories.map(m => m.year)).size,
    members: new Set(allMemories.flatMap(m => m.taggedMemberIds || [])).size,
  }), [allMemories, allVoiceNotes])

  return (
    <div className="flex h-screen flex-col bg-background overflow-x-hidden">
      <DemoBanner />
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/95 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <Camera className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Memory Vault</h1>
            <p className="text-xs text-muted-foreground">Photos, stories &amp; voice memories of your family</p>
          </div>
          <div className="ml-auto">
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setShowAddForm(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Memory
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Strip */}
      <div className="grid grid-cols-4 divide-x divide-border/50 border-b border-border/50 bg-card/50">
        {[
          { label: "Photo Albums", value: stats.photos, icon: Camera, color: "text-amber-400" },
          { label: "Voice Notes", value: stats.voices, icon: Mic, color: "text-violet-400" },
          { label: "Years Covered", value: `${1998}–${2023}`, icon: Clock, color: "text-blue-400" },
          { label: "Members Tagged", value: stats.members, icon: Users, color: "text-green-400" },
        ].map((s) => (
          <div key={s.label} className="flex flex-col items-center py-3 px-2">
            <s.icon className={cn("h-4 w-4 mb-1", s.color)} />
            <span className="text-lg font-bold">{s.value}</span>
            <span className="text-[10px] text-muted-foreground text-center">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Add Memory inline form — rendered OUTSIDE Tabs so overflow-hidden never clips the Save button */}
      {showAddForm && (
        <div className="mx-4 my-3 rounded-2xl border border-amber-500/30 bg-card p-4 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">New Memory</p>
            <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <Input placeholder="Title (required)" value={newMemory.title} onChange={e => setNewMemory(p => ({ ...p, title: e.target.value }))} />
          <Textarea placeholder="Description (optional)" value={newMemory.description} onChange={e => setNewMemory(p => ({ ...p, description: e.target.value }))} rows={2} className="resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={newMemory.eventType} onChange={e => setNewMemory(p => ({ ...p, eventType: e.target.value as MemoryItem['eventType'] }))}>
              {['wedding', 'birth', 'festival', 'graduation', 'travel', 'family-gathering', 'other'].map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace('-', ' ')}</option>
              ))}
            </select>
            <Input type="number" placeholder="Year (e.g. 2010)" value={newMemory.year ?? ''} onChange={e => setNewMemory(p => ({ ...p, year: e.target.value ? parseInt(e.target.value) : undefined }))} />
          </div>
          {/* Photo upload */}
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-border/50">
                <img src={photoPreview} alt="preview" className="w-full h-40 object-cover" />
                <button onClick={() => { setPhotoPreview(null); setNewMemory(p => ({ ...p, photoFile: null, photoUrl: '' })) }} className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border/50 p-3 text-muted-foreground hover:border-amber-500/50 hover:text-amber-400 transition-colors">
                <ImageIcon className="h-5 w-5" />
                <span className="text-sm">Tap to upload photo (optional)</span>
              </button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" disabled={!newMemory.title || addingSaving} onClick={handleAddMemory}>
              {addingSaving ? 'Saving…' : 'Save Memory'}
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="photos" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/50 bg-card/80 px-4 pt-2">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="photos" className="gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              Photos
            </TabsTrigger>
            <TabsTrigger value="voices" className="gap-1.5">
              <Mic className="h-3.5 w-3.5" />
              Voice Memories
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Photos Tab */}
        <TabsContent value="photos" className="flex-1 overflow-hidden mt-0">
          <div className="flex gap-3 border-b border-border/50 bg-card/50 px-4 py-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search memories..."
                className="pl-9 h-9 bg-muted/50"
              />
            </div>
            <div className="flex gap-1">
              {['all', 'wedding', 'festival', 'graduation', 'travel', 'family-gathering'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterEvent(type)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    filterEvent === type
                      ? "bg-amber-500 text-white"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 h-[calc(100vh-280px)]">
            <div className="p-4">
              {selectedMemory ? (
                <MemoryDetail
                  memory={selectedMemory}
                  members={allMembers}
                  onBack={() => setSelectedMemory(null)}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredMemories.map(memory => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      members={allMembers}
                      onClick={() => setSelectedMemory(memory)}
                    />
                  ))}
                  {/* Add Memory Card */}
                  <button onClick={() => setShowAddForm(true)} className="group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/50 p-8 text-muted-foreground transition-colors hover:border-amber-500/50 hover:text-amber-400 min-h-[200px]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 group-hover:bg-amber-500/10 transition-colors">
                      <Plus className="h-6 w-6" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium">Add Memory</p>
                      <p className="text-xs">Upload photos from family events</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Voice Tab */}
        <TabsContent value="voices" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-[calc(100vh-220px)]">
            <div className="space-y-4 p-4">
              <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="h-4 w-4 text-amber-400" />
                  <p className="text-sm font-medium text-amber-400">Voice Memory Archive</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Precious voice recordings of elder family members. AI transcription & translation available.
                </p>
              </div>

              {allVoiceNotes.map(voice => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  members={allMembers}
                  isPlaying={playingVoice === voice.id}
                  onPlay={() => setPlayingVoice(playingVoice === voice.id ? null : voice.id)}
                />
              ))}

              {/* Record New */}
              <button className="group w-full flex items-center gap-4 rounded-2xl border-2 border-dashed border-border/50 p-5 text-muted-foreground transition-colors hover:border-violet-500/50 hover:text-violet-400">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 group-hover:bg-violet-500/10 transition-colors">
                  <Mic className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Record New Voice Memory</p>
                  <p className="text-xs">Capture stories from elders — auto-transcribed & translated</p>
                </div>
              </button>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Memory Card ──────────────────────────────────────────────────────────────

function MemoryCard({ memory, members, onClick }: { memory: MemoryItem; members: typeof sampleFamilyMembers; onClick: () => void }) {
  const Icon = EVENT_ICONS[memory.eventType] || Camera
  const colorClass = EVENT_COLORS[memory.eventType] || EVENT_COLORS.other

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
    >
      {/* Image */}
      <div className="relative h-44 overflow-hidden bg-muted">
        {memory.photoUrl ? (
          <img
            src={memory.photoUrl}
            alt={memory.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Icon className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {/* Event Badge */}
        <div className={cn(
          "absolute top-2 right-2 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm bg-gradient-to-r",
          colorClass
        )}>
          <Icon className="h-2.5 w-2.5" />
          {memory.eventType.replace('-', ' ')}
        </div>
        <div className="absolute bottom-2 left-2 text-white">
          <p className="text-xs font-medium opacity-80">{memory.year}</p>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="font-semibold text-sm leading-tight line-clamp-1">{memory.title}</h3>
        {memory.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{memory.description}</p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex -space-x-1">
            {(memory.taggedMemberIds || []).slice(0, 4).map(id => {
              const m = members.find(fm => fm.id === id)
              if (!m) return null
              return (
                <Avatar key={id} className="h-5 w-5 border border-background">
                  <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                    {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              )
            })}
            {(memory.taggedMemberIds?.length || 0) > 4 && (
              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-background bg-muted text-[8px] text-muted-foreground">
                +{(memory.taggedMemberIds?.length || 0) - 4}
              </div>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">{memory.uploadedBy}</span>
        </div>
      </div>
    </button>
  )
}

// ─── Memory Detail ────────────────────────────────────────────────────────────

function MemoryDetail({ memory, members, onBack }: { memory: MemoryItem; members: typeof sampleFamilyMembers; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-2 text-muted-foreground">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to gallery
      </Button>
      {memory.photoUrl && (
        <img
          src={memory.photoUrl}
          alt={memory.title}
          className="w-full rounded-2xl object-cover max-h-80"
        />
      )}
      <div className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold">{memory.title}</h2>
          <div className="flex gap-2">            <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-green-500/40 text-green-600 hover:bg-green-500/10"
            onClick={() => {
              const text = `${memory.title} (${memory.year})\n\n${memory.description ?? ''}\n\nShared from Family Graph`
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
            }}
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>            <Button variant="outline" size="icon" className="h-8 w-8">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{memory.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline">{memory.year}</Badge>
          <Badge variant="outline">{memory.eventType.replace('-', ' ')}</Badge>
          {memory.date && <Badge variant="outline">{new Date(memory.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Badge>}
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">Tagged Members</p>
          <div className="flex flex-wrap gap-2">
            {(memory.taggedMemberIds || []).map(id => {
              const m = members.find(fm => fm.id === id)
              if (!m) return null
              return (
                <div key={id} className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs">
                  <Avatar className="h-4 w-4">
                    <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                      {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  {m.name}
                </div>
              )
            })}
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Uploaded by {memory.uploadedBy}</p>
      </div>
    </div>
  )
}

// ─── Voice Card ───────────────────────────────────────────────────────────────

function VoiceCard({ voice, members, isPlaying, onPlay }: { voice: VoiceNote; members: typeof sampleFamilyMembers; isPlaying: boolean; onPlay: () => void }) {
  const member = members.find(m => m.id === voice.memberId)

  return (
    <div className={cn(
      "rounded-2xl border p-4 transition-all",
      isPlaying ? "border-violet-500/40 bg-violet-500/5" : "border-border/50 bg-card"
    )}>
      <div className="flex items-start gap-3">
        <button
          onClick={onPlay}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all",
            isPlaying
              ? "bg-violet-500 text-white shadow-lg shadow-violet-500/30"
              : "bg-muted hover:bg-violet-500/10 hover:text-violet-400"
          )}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-tight">{voice.title}</h3>
            <span className="shrink-0 text-xs text-muted-foreground font-mono">{formatDuration(voice.durationSeconds)}</span>
          </div>

          {member && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[8px] bg-amber-500/20 text-amber-400">
                  {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              {member.name}
            </div>
          )}

          {/* Waveform */}
          <div className="mt-2 flex items-center gap-0.5 h-6">
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-full w-1 transition-all",
                  isPlaying ? "bg-violet-500" : "bg-muted-foreground/30"
                )}
                style={{ height: `${20 + Math.sin(i * 0.5) * 15 + Math.random() * 10}%` }}
              />
            ))}
          </div>

          {/* Language badge */}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] py-0 px-2 h-4">
              <Languages className="mr-1 h-2.5 w-2.5" />
              {voice.language}
            </Badge>
            <span className="text-[10px] text-muted-foreground">Recorded by {voice.recordedBy}</span>
          </div>
        </div>
      </div>

      {/* Transcription */}
      {voice.transcription && (
        <div className="mt-3 rounded-xl bg-muted/50 p-3">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Transcription (Hindi → English):</p>
          <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3 italic">
            "{voice.transcription}"
          </p>
        </div>
      )}
    </div>
  )
}
