"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [pushGranted, setPushGranted] = useState(false)

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
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  const handleRequestPush = () => {
    if (typeof window === "undefined" || !("Notification" in window)) return
    // Must be called synchronously from a user gesture — no await
    Notification.requestPermission().then((permission) => {
      setPushGranted(permission === "granted")
    })
  }

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/auth/signin"); return }

      // 1. Create the family
      const nameParts = userData.name.trim().split(" ")
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0]
      const familyName = `${lastName || "My"} Family`
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()
      const { data: family, error: familyErr } = await supabase
        .from("families")
        .insert({ name: familyName, invite_code: inviteCode, created_by: user.id })
        .select()
        .single()
      if (familyErr) throw familyErr

      // 2. Update profile with family_id FIRST so RLS policies work for member inserts
      // (family_members INSERT policy checks family_id = my_family_id(), which reads from profiles)
      const { error: profileErr } = await supabase.from("profiles").update({
        family_id: family.id,
        display_name: userData.name.trim(),
        role: "admin",
      }).eq("id", user.id)
      if (profileErr) throw profileErr

      // 3. Create parent members (generation 2)
      const parentIds: string[] = []
      for (const parent of [parent1, parent2]) {
        if (!parent.name.trim()) continue
        const { data: pm } = await supabase
          .from("family_members")
          .insert({
            family_id: family.id,
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
      const { data: member, error: memberErr } = await supabase
        .from("family_members")
        .insert({
          family_id: family.id,
          name: userData.name.trim(),
          birth_year: userData.birthYear ? parseInt(userData.birthYear) : null,
          birth_place: userData.birthPlace || null,
          occupation: userData.occupation || null,
          bio: userData.bio || null,
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

      // Hard navigation so AuthProvider re-fetches the updated profile (with family_id)
      window.location.href = "/dashboard?welcome=1"
    } catch (e) {
      console.error("Onboarding error:", e)
      setIsLoading(false)
      // Supabase errors are plain objects with a `message` field, not Error instances
      const msg = e instanceof Error
        ? e.message
        : (e as any)?.message ?? (e as any)?.error_description ?? JSON.stringify(e)
      alert("Setup failed: " + msg + "\n\nPlease try again or contact support.")
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
      case "goals": return selectedGoals.length > 0
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
                : "border-amber-500/30 bg-amber-500/5"
            )}>
              <Bell className={cn("h-5 w-5 mt-0.5 shrink-0", pushGranted ? "text-green-400" : "text-amber-400")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {pushGranted ? "🎉 Notifications enabled!" : "Never miss a birthday or anniversary"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pushGranted
                    ? "We'll remind you of family birthdays, anniversaries, and milestones."
                    : "Get gentle reminders the morning of every family birthday & anniversary."}
                </p>
                {!pushGranted && (
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

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {currentStep > 0 && (
            <Button variant="outline" onClick={handleBack} className="h-11 px-5 border-border">
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
              {isLoading ? "Creating your tree..." : "Launch My Family Tree"}
              <Sparkles className="w-4 h-4 ml-2" />
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

