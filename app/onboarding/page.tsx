"use client"

import { useState, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  Users,
  User,
  MapPin,
  Calendar,
  Heart,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Check,
  Bell,
  TreePine,
  Share2,
  Camera,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

const steps = [
  {
    id: "welcome",
    title: "Welcome to Family Graph",
    description: "Build your family legacy in 3 minutes.",
    icon: TreePine,
  },
  {
    id: "yourself",
    title: "Tell us about yourself",
    description: "You are the root of your family tree.",
    icon: User,
  },
  {
    id: "parents",
    title: "Add your parents",
    description: "Two members in 30 seconds — your tree comes alive.",
    icon: Heart,
  },
  {
    id: "goals",
    title: "Almost there!",
    description: "Enable notifications to never miss a family moment.",
    icon: Bell,
  },
]

const goals = [
  { id: "preserve", label: "Preserve family stories", icon: "📖" },
  { id: "discover", label: "Discover ancestry", icon: "🔍" },
  { id: "connect", label: "Connect with relatives", icon: "🤝" },
  { id: "document", label: "Document genealogy", icon: "📋" },
  { id: "share", label: "Share with family", icon: "👨‍👩‍👧‍👦" },
  { id: "learn", label: "Learn about heritage", icon: "🌍" },
]

async function requestPushPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission === "granted") return
  await Notification.requestPermission()
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  )
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pushGranted, setPushGranted] = useState(false)
  const [pushBlocked, setPushBlocked] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [userData, setUserData] = useState({
    name: "",
    birthYear: "",
    birthPlace: "",
    occupation: "",
    bio: "",
  })

  const [parent1, setParent1] = useState({ name: "", birthYear: "", birthPlace: "", gender: "male" })
  const [parent2, setParent2] = useState({ name: "", birthYear: "", birthPlace: "", gender: "female" })
  const [selectedGoals, setSelectedGoals] = useState<string[]>([])

  const progress = ((currentStep + 1) / steps.length) * 100

  // Estimated completeness after onboarding
  const treeSize = 1 + (parent1.name ? 1 : 0) + (parent2.name ? 1 : 0)

  const handleNext = () => {
    setErrorMsg(null)
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  const handleRequestPush = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPushBlocked(true)
      return
    }
    if (Notification.permission === "denied") {
      setPushBlocked(true)
      return
    }
    // Must be called synchronously from a user gesture — no await
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        setPushGranted(true)
        setPushBlocked(false)
      } else {
        setPushBlocked(permission === "denied")
      }
    })
  }

  const handleComplete = async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const supabase = createClient()

      // Refresh session first — ensures JWT is valid before any DB writes
      // (stale/expired token causes auth.uid() = NULL → RLS blocks insert)
      const { data: { session }, error: sessionErr } = await supabase.auth.refreshSession()
      if (sessionErr || !session) {
        router.push("/auth/signin")
        return
      }
      const user = session.user

      // Guard: if user already completed onboarding (has a family_id), don't create a second family.
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("family_id")
        .eq("id", user.id)
        .single()
      if (existingProfile?.family_id) {
        window.location.href = "/dashboard"
        return
      }

      // 1. Create the family — try server route first (bypasses RLS), fall back to direct insert
      const nameParts = userData.name.trim().split(" ")
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0]
      const familyName = `${lastName || "My"} Family`
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()

      let familyId!: string
      let familyInviteCode!: string
      const _diag: string[] = []

      // ── Path 1: SECURITY DEFINER RPC (bypasses RLS, works without service role key) ──
      let familyCreated = false
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('create_family', {
          p_name: familyName,
          p_invite_code: inviteCode,
        })
        if (!rpcErr && rpcData) {
          familyId = (rpcData as any).id
          familyInviteCode = (rpcData as any).invite_code
          familyCreated = true
        } else {
          _diag.push(`RPC: ${rpcErr?.message ?? 'no data returned'}`)
        }
      } catch (e: unknown) {
        _diag.push(`RPC exception: ${(e as any)?.message ?? String(e)}`)
      }

      // ── Path 2: Server-side API route (needs SUPABASE_SERVICE_ROLE_KEY in Vercel) ──
      if (!familyCreated) {
        try {
          const res = await fetch("/api/create-family", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: familyName, inviteCode, createdBy: user.id }),
          })
          if (res.ok) {
            const data = await res.json()
            familyId = data.family.id
            familyInviteCode = data.family.invite_code
            familyCreated = true
          } else {
            const body = await res.json().catch(() => ({}))
            _diag.push(`API ${res.status}: ${body.error ?? 'unknown'}`)
          }
        } catch (e: unknown) {
          _diag.push(`API exception: ${(e as any)?.message ?? String(e)}`)
        }
      }

      // ── Path 3: Direct insert (requires migration 004 INSERT policy) ──
      if (!familyCreated) {
        const { data: family, error: familyErr } = await supabase
          .from("families")
          .insert({ name: familyName, invite_code: inviteCode, created_by: user.id })
          .select()
          .single()
        if (familyErr) {
          _diag.push(`Direct: ${familyErr.message}`)
          throw new Error(`All methods failed — ${_diag.join(' | ')}`)
        }
        familyId = family.id
        familyInviteCode = family.invite_code
      }

      // 2. Update profile with family_id FIRST so RLS policies work for member inserts
      // (family_members INSERT policy checks family_id = my_family_id(), which reads from profiles)
      const { error: profileErr } = await supabase.from("profiles").update({
        family_id: familyId,
        display_name: userData.name.trim(),
        role: "admin",
      }).eq("id", user.id)
      if (profileErr) throw profileErr

      // 3. Create parent members (generation 2)
      const currentYear = new Date().getFullYear()
      for (const parent of [parent1, parent2]) {
        if (parent.birthYear) {
          const yr = parseInt(parent.birthYear)
          if (isNaN(yr) || yr < 1900 || yr > currentYear - 15) {
            setIsLoading(false)
            setErrorMsg(`Enter a realistic birth year for your ${parent.gender === 'male' ? 'father' : 'mother'} (1900 – ${currentYear - 15}).`)
            return
          }
        }
      }
      const parentIds: string[] = []
      for (const parent of [parent1, parent2]) {
        if (!parent.name.trim()) continue
        const { data: pm } = await supabase
          .from("family_members")
          .insert({
            family_id: familyId,
            name: parent.name.trim(),
            birth_year: parent.birthYear ? parseInt(parent.birthYear) : null,
            birth_place: parent.birthPlace || null,
            relationship: parent.gender === "male" ? "father" : "mother",
            gender: parent.gender as "male" | "female",
            generation: 2,
            is_alive: true,
            added_by: user.id,
          })
          .select()
          .single()
        if (pm) parentIds.push(pm.id)
      }

      // 4. Create self (generation 3) with parent references
      // Upload profile photo if provided
      let photoUrl: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split('.').pop()
        const path = `${user.id}/avatar.${ext}`
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, photoFile, { upsert: true })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }

      const { data: member, error: memberErr } = await supabase
        .from("family_members")
        .insert({
          family_id: familyId,
          name: userData.name.trim(),
          birth_year: userData.birthYear ? parseInt(userData.birthYear) : null,
          birth_place: userData.birthPlace || null,
          occupation: userData.occupation || null,
          bio: userData.bio || null,
          photo_url: photoUrl,
          relationship: "self",
          generation: 3,
          is_alive: true,
          role: "admin",
          parent_ids: parentIds,
          added_by: user.id,
        })
        .select()
        .single()
      if (memberErr) throw memberErr

      // 5. Update profile with member_id now that self member exists
      await supabase.from("profiles").update({
        member_id: member.id,
      }).eq("id", user.id)

      // Hard navigation so AuthProvider re-fetches the updated profile (with family_id).
      // If the user came via an invite link, resume that flow; otherwise go to dashboard.
      const pendingInvite = searchParams.get('next')
      if (pendingInvite && pendingInvite.startsWith('/join/')) {
        window.location.href = pendingInvite
      } else {
        window.location.href = "/dashboard?welcome=1"
      }
    } catch (e) {
      console.error("Onboarding error:", e)
      setIsLoading(false)
      const raw = e instanceof Error
        ? e.message
        : (e as any)?.message ?? (e as any)?.error_description ?? "Unknown error"
      // Surface a friendly message for the most common failure
      const isRLS = raw.includes('row-level security') || raw.includes('policy') || raw.includes('42501')
      setErrorMsg(isRLS
        ? "Account setup hit a permissions error. Please try again — if it persists, contact support."
        : raw
      )
    }
  }

  const toggleGoal = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    )
  }

  const canProceed = () => {
    switch (steps[currentStep].id) {
      case "yourself": return userData.name.trim() !== ""
      case "goals": return true // goals are optional — never block completion
      default: return true
    }
  }

  const renderStepContent = () => {
    switch (steps[currentStep].id) {
      case "welcome":
        return (
          <div className="text-center py-6">
            <div className="relative mx-auto mb-8 w-32 h-32">
              {/* Animated tree icon */}
              <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-2xl shadow-primary/30">
                <TreePine className="w-16 h-16 text-white" />
              </div>
              <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-amber-400 flex items-center justify-center text-sm animate-bounce">✨</div>
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-3">Build Your Family Legacy</h2>
            <p className="text-muted-foreground text-base max-w-md mx-auto mb-8">
              Family Graph helps you map, preserve, and share your family heritage across generations — starting in under 3 minutes.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mb-6">
              {[
                { icon: "🌳", label: "Interactive tree" },
                { icon: "🎙️", label: "Voice stories" },
                { icon: "🤖", label: "AI Copilot" },
              ].map((item) => (
                <div key={item.label} className="p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
            <Badge variant="outline" className="text-green-400 border-green-500/30 bg-green-500/10">
              Free forever · No credit card
            </Badge>
          </div>
        )

      case "yourself":
        return (
          <div className="space-y-5 py-2">
            {/* Profile photo */}
            <div className="flex items-center gap-4">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0]
                if (!f) return
                setPhotoFile(f)
                setPhotoPreview(URL.createObjectURL(f))
              }} />
              <div
                onClick={() => photoInputRef.current?.click()}
                className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border hover:border-primary/60 bg-muted/50 overflow-hidden transition-colors"
              >
                {photoPreview
                  ? <img src={photoPreview} alt="you" className="h-full w-full object-cover" />
                  : <Camera className="h-7 w-7 text-muted-foreground/50" />
                }
              </div>
              <div>
                <p className="text-sm font-medium">Your photo</p>
                <p className="text-xs text-muted-foreground">Tap to upload (optional)<br />Helps family recognise you</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                placeholder="e.g. Rahul Sharma"
                value={userData.name}
                onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                className="h-11 bg-muted/50 border-border"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="birthYear">Birth Year</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="birthYear"
                    type="number"
                    placeholder="1990"
                    value={userData.birthYear}
                    onChange={(e) => setUserData({ ...userData, birthYear: e.target.value })}
                    className="pl-10 h-11 bg-muted/50 border-border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthPlace">Birth City</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="birthPlace"
                    placeholder="Nagpur, Maharashtra"
                    value={userData.birthPlace}
                    onChange={(e) => setUserData({ ...userData, birthPlace: e.target.value })}
                    className="pl-10 h-11 bg-muted/50 border-border"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                placeholder="Software Engineer, Doctor, Teacher..."
                value={userData.occupation}
                onChange={(e) => setUserData({ ...userData, occupation: e.target.value })}
                className="h-11 bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">One-line bio <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="bio"
                placeholder="What would you want your grandchildren to know about you?"
                value={userData.bio}
                onChange={(e) => setUserData({ ...userData, bio: e.target.value })}
                className="bg-muted/50 border-border resize-none"
                rows={2}
              />
            </div>
          </div>
        )

      case "parents":
        return (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              These 2 members instantly make your tree meaningful. You can skip and add later.
            </p>

            {[
              { label: "Father", state: parent1, setState: setParent1, gender: "male", color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "Mother", state: parent2, setState: setParent2, gender: "female", color: "text-pink-400", bg: "bg-pink-500/10" },
            ].map(({ label, state, setState, gender, color, bg }) => (
              <div key={label} className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", bg)}>
                    <User className={cn("w-4 h-4", color)} />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-foreground">{label}</h4>
                    {state.name && <p className="text-xs text-muted-foreground">{state.name}</p>}
                  </div>
                  {state.name && <Check className="ml-auto h-4 w-4 text-green-400" />}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder={`${label}'s name`}
                    value={state.name}
                    onChange={(e) => setState({ ...state, name: e.target.value, gender })}
                    className="h-9 text-sm bg-muted/50 border-border"
                  />
                  <Input
                    placeholder="Birth year"
                    type="number"
                    value={state.birthYear}
                    onChange={(e) => setState({ ...state, birthYear: e.target.value })}
                    className="h-9 text-sm bg-muted/50 border-border"
                  />
                  <Input
                    placeholder="City"
                    value={state.birthPlace}
                    onChange={(e) => setState({ ...state, birthPlace: e.target.value })}
                    className="h-9 text-sm bg-muted/50 border-border"
                  />
                </div>
              </div>
            ))}

            {/* Tree preview counter */}
            <div className="flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 p-3">
              <TreePine className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground">
                Your tree will start with <strong>{treeSize} member{treeSize !== 1 ? "s" : ""}</strong>
                {treeSize >= 3 ? " 🎉" : " — add parents to grow it faster"}
              </span>
            </div>
          </div>
        )

      case "goals":
        return (
          <div className="space-y-5 py-2">
            {/* Push notification request */}
            <div className={cn(
              "rounded-xl border p-4 flex items-start gap-3 transition-colors",
              pushGranted
                ? "border-green-500/30 bg-green-500/10"
                : pushBlocked
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
            )}>
              <Bell className={cn("h-5 w-5 mt-0.5 shrink-0", pushGranted ? "text-green-400" : pushBlocked ? "text-red-400" : "text-amber-400")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {pushGranted ? "🎉 Notifications enabled!" : pushBlocked ? "Notifications blocked" : "Never miss a birthday or anniversary"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pushGranted
                    ? "We'll remind you of family birthdays, anniversaries, and milestones."
                    : pushBlocked
                      ? "Your browser has blocked notifications. Please enable them in your browser or system settings and try again."
                      : "Get gentle reminders the morning of every family birthday & anniversary."}
                </p>
                {!pushGranted && !pushBlocked && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                    onClick={handleRequestPush}
                  >
                    <Bell className="h-3 w-3 mr-1" />
                    Enable Notifications
                  </Button>
                )}
              </div>
            </div>

            {/* Goals */}
            <div>
              <p className="text-sm text-muted-foreground mb-3">What matters most to you? (pick any)</p>
              <div className="grid grid-cols-2 gap-2.5">
                {goals.map((goal) => {
                  const isSelected = selectedGoals.includes(goal.id)
                  return (
                    <button
                      key={goal.id}
                      onClick={() => toggleGoal(goal.id)}
                      className={cn(
                        "p-3.5 rounded-xl border text-left transition-all",
                        isSelected
                          ? "bg-primary/10 border-primary/50"
                          : "bg-muted/30 border-border hover:border-border/80"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xl">{goal.icon}</span>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      <p className={cn("text-xs font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
                        {goal.label}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* WhatsApp share teaser */}
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-3">
              <Share2 className="h-4 w-4 text-green-500 shrink-0" />
              <p className="text-xs text-muted-foreground">
                After setup, share a magic invite link — family joins in one tap, no app download needed.
              </p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Step {currentStep + 1} of {steps.length}</span>
            <span className="text-sm font-medium text-primary">{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((step, index) => {
            const StepIcon = step.icon
            const isActive = index === currentStep
            const isComplete = index < currentStep
            return (
              <div key={step.id} className={cn("flex items-center", index < steps.length - 1 ? "flex-1" : "")}>
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                  isComplete ? "bg-primary text-white" :
                    isActive ? "bg-primary/20 text-primary border-2 border-primary" :
                      "bg-muted text-muted-foreground"
                )}>
                  {isComplete ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                </div>
                {index < steps.length - 1 && (
                  <div className={cn("flex-1 h-0.5 mx-2", isComplete ? "bg-primary" : "bg-border")} />
                )}
              </div>
            )
          })}
        </div>

        {/* Content card */}
        <div className="bg-card rounded-2xl border border-border p-6 mb-5">
          <div className="text-center mb-5">
            <h1 className="text-xl font-semibold text-foreground">{steps[currentStep].title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{steps[currentStep].description}</p>
          </div>
          {renderStepContent()}
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-destructive font-medium">Setup failed</p>
              <p className="text-xs text-destructive/80 mt-0.5">{errorMsg}</p>
            </div>
            <button
              onClick={handleComplete}
              className="shrink-0 flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {currentStep > 0 && (
            <Button variant="outline" onClick={handleBack} disabled={isLoading} className="h-11 px-5 border-border">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          {currentStep === steps.length - 1 ? (
            <Button
              onClick={handleComplete}
              disabled={!canProceed() || isLoading}
              className="h-11 px-8 bg-primary hover:bg-primary/90"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating your tree...</>
              ) : (
                <>Launch My Family Tree <Sparkles className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={!canProceed()} className="h-11 px-6 bg-primary hover:bg-primary/90">
              Continue
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        {/* Skip */}
        {currentStep > 0 && currentStep < steps.length - 1 && (
          <button
            onClick={() => setCurrentStep(steps.length - 1)}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors"
          >
            Skip this step
          </button>
        )}
      </div>
    </div>
  )
}

