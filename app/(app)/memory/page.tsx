"use client"

import { useState, useMemo, useEffect } from "react"
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
  Pencil,
  Check,
  Square,
  Trash2,
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

const BLANK_MEMORY = { title: '', description: '', eventType: 'other' as MemoryItem['eventType'], year: undefined as number | undefined, photoUrl: '', photoFile: null as File | null, taggedMemberIds: [] as string[] }

export default function MemoryPage() {
  const { user, familyId, loading: authLoading } = useAuth()
  const { members: dbMembers, loading: membersLoading } = useMembers(familyId)
  const { memories: dbMemories, loading: memoriesLoading, addMemory: dbAddMemory, updateMemory: dbUpdateMemory, deleteMemory: dbDeleteMemory, uploadPhoto } = useMemories(familyId)
  const { voiceNotes: dbVoiceNotes, loading: voiceLoading, addVoiceNote: dbAddVoiceNote, uploadVoiceBlob, deleteVoiceNote: dbDeleteVoiceNote } = useVoiceNotes(familyId)

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

  // Voice recording state
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
  const [recState, setRecState] = useState<'idle' | 'recording' | 'recorded'>('idle')
  const [recSeconds, setRecSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [voiceTitle, setVoiceTitle] = useState('')
  const [voiceMemberId, setVoiceMemberId] = useState<string>('')
  const [voiceSaving, setVoiceSaving] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Edit state
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', taggedMemberIds: [] as string[], year: undefined as number | undefined })
  const [editSaving, setEditSaving] = useState(false)

  const handleDeleteMemory = async (memoryId: string) => {
    if (isDemoMode) {
      setLocalDemoMemories(prev => prev.filter(m => m.id !== memoryId))
      return
    }
    try {
      await dbDeleteMemory(memoryId)
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    }
  }

  const handleDeleteVoiceNote = async (noteId: string) => {
    if (isDemoMode) return
    try {
      await dbDeleteVoiceNote(noteId)
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    }
  }

  const openEdit = (memory: MemoryItem) => {
    setEditingMemory(memory)
    setEditForm({ title: memory.title, description: memory.description ?? '', taggedMemberIds: memory.taggedMemberIds ?? [], year: memory.year })
  }

  const handleSaveEdit = async () => {
    if (!editingMemory || !editForm.title) return
    setEditSaving(true)
    try {
      if (!isDemoMode) {
        await dbUpdateMemory(editingMemory.id, { title: editForm.title, description: editForm.description, taggedMemberIds: editForm.taggedMemberIds, year: editForm.year })
      }
      toast({ title: 'Memory updated!' })
      setEditingMemory(null)
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setEditSaving(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNewMemory(p => ({ ...p, photoFile: file, photoUrl: '' }))
    setPhotoPreview(URL.createObjectURL(file))
  }

  // ── Voice recording ──────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' })
        setAudioBlob(blob)
        setAudioPreviewUrl(URL.createObjectURL(blob))
        setRecState('recorded')
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start(250)
      mediaRecorderRef.current = mr
      setRecState('recording')
      setRecSeconds(0)
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch {
      toast({ title: 'Microphone access denied', description: 'Please allow microphone access in your browser settings.', variant: 'destructive' })
    }
  }

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const handleDiscardRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setShowVoiceRecorder(false)
    setRecState('idle')
    setRecSeconds(0)
    setAudioBlob(null)
    setAudioPreviewUrl(null)
    setVoiceTitle('')
    setVoiceMemberId('')
  }

  const handleSaveVoiceNote = async () => {
    if (!audioBlob || !voiceTitle) return
    if (!user) { toast({ title: 'Sign in required', variant: 'destructive' }); return }
    if (!familyId) { toast({ title: 'No family yet', variant: 'destructive' }); return }
    setVoiceSaving(true)
    try {
      const fileUrl = await uploadVoiceBlob(audioBlob, familyId)
      await dbAddVoiceNote(familyId, {
        title: voiceTitle,
        durationSeconds: recSeconds,
        memberId: voiceMemberId || undefined,
        fileUrl,
      }, user.id)
      toast({ title: 'Voice note saved!', description: `"${voiceTitle}" added to your vault.` })
      handleDiscardRecording()
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setVoiceSaving(false)
    }
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
        taggedMemberIds: newMemory.taggedMemberIds,
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
    <div className="flex h-full flex-col bg-background">
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
                      onEdit={() => openEdit(memory)}
                      onDelete={() => handleDeleteMemory(memory.id)}
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
                  onDelete={() => handleDeleteVoiceNote(voice.id)}
                />
              ))}

              {/* Record New */}
              <button onClick={() => setShowVoiceRecorder(true)} className="group w-full flex items-center gap-4 rounded-2xl border-2 border-dashed border-border/50 p-5 text-muted-foreground transition-colors hover:border-violet-500/50 hover:text-violet-400">
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

      {/* Add Memory Dialog */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-card p-5 space-y-3 shadow-2xl my-auto">
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
            {/* Member tagging */}
            {allMembers.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tag family members (optional)</label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {allMembers.map(m => {
                    const tagged = newMemory.taggedMemberIds.includes(m.id)
                    return (
                      <button key={m.id} type="button"
                        onClick={() => setNewMemory(p => ({ ...p, taggedMemberIds: tagged ? p.taggedMemberIds.filter(id => id !== m.id) : [...p.taggedMemberIds, m.id] }))}
                        className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all', tagged ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-border/50 text-muted-foreground hover:border-border/70')}
                      >
                        {tagged && <Check className="h-3 w-3" />}
                        {m.name.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {isDemoMode && (
              <p className="text-xs text-amber-500/80 text-right">⚠ Demo mode — <a href="/auth/signin" className="underline hover:text-amber-400">sign in</a> to save permanently</p>
            )}
            {!isDemoMode && !familyId && (
              <p className="text-xs text-destructive text-right">⚠ No family set up yet — complete onboarding first</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" disabled={!newMemory.title || addingSaving} onClick={handleAddMemory}>
                {addingSaving ? 'Saving…' : 'Save Memory'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Recorder Dialog */}
      {showVoiceRecorder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-violet-500/30 bg-card p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold flex items-center gap-2">
                <Mic className="h-4 w-4 text-violet-400" />
                Record Voice Memory
              </p>
              <button onClick={handleDiscardRecording} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {/* Recording UI */}
            <div className="flex flex-col items-center gap-4 py-2">
              {recState === 'idle' && (
                <>
                  <button onClick={handleStartRecording}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/30 hover:bg-violet-600 transition-all active:scale-95">
                    <Mic className="h-8 w-8" />
                  </button>
                  <p className="text-xs text-muted-foreground">Tap the microphone to start recording</p>
                </>
              )}
              {recState === 'recording' && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                    <button onClick={handleStopRecording}
                      className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600 transition-all active:scale-95">
                      <Square className="h-7 w-7" />
                    </button>
                  </div>
                  <p className="text-2xl font-mono font-bold text-red-400">{formatDuration(recSeconds)}</p>
                  <p className="text-xs text-muted-foreground">Recording… tap square to stop</p>
                </>
              )}
              {recState === 'recorded' && audioPreviewUrl && (
                <>
                  <audio controls src={audioPreviewUrl} className="w-full rounded-lg" />
                  <p className="text-xs text-muted-foreground">{formatDuration(recSeconds)} recorded</p>
                </>
              )}
            </div>

            {recState === 'recorded' && (
              <>
                <Input placeholder="Title — e.g. Dada's story about the village (required)" value={voiceTitle} onChange={e => setVoiceTitle(e.target.value)} />
                {allMembers.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Voice of (optional)</label>
                    <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                      {allMembers.map(m => (
                        <button key={m.id} type="button"
                          onClick={() => setVoiceMemberId(id => id === m.id ? '' : m.id)}
                          className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all', voiceMemberId === m.id ? 'border-violet-500 bg-violet-500/10 text-violet-400' : 'border-border/50 text-muted-foreground hover:border-border/70')}
                        >
                          {voiceMemberId === m.id && <Check className="h-3 w-3" />}
                          {m.name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setRecState('idle')}>Re-record</Button>
                  <Button size="sm" className="bg-violet-500 hover:bg-violet-600 text-white" disabled={!voiceTitle || voiceSaving} onClick={handleSaveVoiceNote}>
                    {voiceSaving ? 'Saving…' : 'Save Voice Note'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Memory Dialog */}
      {editingMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Edit Memory</p>
              <button onClick={() => setEditingMemory(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <Input placeholder="Title" value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
            <Textarea placeholder="Description" value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={3} className="resize-none" />
            <Input type="number" placeholder="Year" value={editForm.year ?? ''} onChange={e => setEditForm(p => ({ ...p, year: e.target.value ? parseInt(e.target.value) : undefined }))} />
            {allMembers.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tagged members</label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {allMembers.map(m => {
                    const tagged = editForm.taggedMemberIds.includes(m.id)
                    return (
                      <button key={m.id} type="button" onClick={() => setEditForm(p => ({ ...p, taggedMemberIds: tagged ? p.taggedMemberIds.filter(id => id !== m.id) : [...p.taggedMemberIds, m.id] }))}
                        className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all', tagged ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-border/50 text-muted-foreground hover:border-border/70')}>
                        {tagged && <Check className="h-3 w-3" />}
                        {m.name.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditingMemory(null)}>Cancel</Button>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" disabled={!editForm.title || editSaving} onClick={handleSaveEdit}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Memory Card ──────────────────────────────────────────────────────────────

function MemoryCard({ memory, members, onClick, onEdit, onDelete }: { memory: MemoryItem; members: typeof sampleFamilyMembers; onClick: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const Icon = EVENT_ICONS[memory.eventType] || Camera
  const colorClass = EVENT_COLORS[memory.eventType] || EVENT_COLORS.other
  const uploaderName = members.find(m => m.claimedByUserId === memory.uploadedBy)?.name ?? (memory.uploadedBy ? 'Family Member' : undefined)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5">
      {/* Edit / Delete buttons */}
      {onEdit && (
        <button onClick={e => { e.stopPropagation(); onEdit() }} className="absolute top-2 left-2 z-10 rounded-full bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="absolute top-2 right-2 z-10 rounded-full bg-black/60 p-1.5 text-red-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/80">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      <button onClick={onClick} className="flex flex-col flex-1 text-left">
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
            {uploaderName && <span className="text-[10px] text-muted-foreground">{uploaderName}</span>}
          </div>
        </div>
      </button>
    </div>
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
            onClick={async () => {
              if (memory.photoUrl && navigator.share) {
                try {
                  const res = await fetch(memory.photoUrl)
                  const blob = await res.blob()
                  await navigator.share({ files: [new File([blob], 'memory.jpg', { type: blob.type })], title: memory.title })
                  return
                } catch { /* fall through */ }
              }
              const text = `${memory.title} (${memory.year})\n\n${memory.description ?? ''}\n\nShared from Outverse`
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
            }}
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
            {memory.photoUrl && (
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={async () => {
                const link = document.createElement('a')
                link.href = memory.photoUrl!
                link.download = `${memory.title.replace(/\s+/g, '-')}.jpg`
                link.target = '_blank'
                link.click()
              }}>
                <Download className="h-4 w-4" />
              </Button>
            )}
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
        {(() => { const n = members.find(m => m.claimedByUserId === memory.uploadedBy)?.name; return n ? <p className="mt-4 text-xs text-muted-foreground">Uploaded by {n}</p> : null })()}
      </div>
    </div>
  )
}

// ─── Voice Card ───────────────────────────────────────────────────────────────

function VoiceCard({ voice, members, isPlaying, onPlay, onDelete }: { voice: VoiceNote; members: typeof sampleFamilyMembers; isPlaying: boolean; onPlay: () => void; onDelete?: () => void }) {
  const member = members.find(m => m.id === voice.memberId)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onPlayRef = useRef(onPlay)
  useEffect(() => { onPlayRef.current = onPlay }, [onPlay])

  // Create/destroy audio element when fileUrl changes
  useEffect(() => {
    if (!voice.fileUrl) return
    const audio = new Audio(voice.fileUrl)
    const handleEnded = () => onPlayRef.current()
    audio.addEventListener('ended', handleEnded)
    audioRef.current = audio
    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
      audioRef.current = null
    }
  }, [voice.fileUrl])

  // Play/pause when isPlaying changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.play().catch(() => { })
    } else {
      audio.pause()
      audio.currentTime = 0
    }
  }, [isPlaying])

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
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground font-mono">{formatDuration(voice.durationSeconds)}</span>
              {onDelete && (
                <button onClick={onDelete} className="rounded-full p-1 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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
