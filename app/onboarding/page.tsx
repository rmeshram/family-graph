"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Users,
  User,
  MapPin,
  Calendar,
  Heart,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Check
} from "lucide-react"

const steps = [
  {
    id: "welcome",
    title: "Welcome to Family Graph",
    description: "Let's set up your family tree in just a few steps.",
    icon: Users
  },
  {
    id: "yourself",
    title: "Tell us about yourself",
    description: "Start by adding yourself as the first member of your tree.",
    icon: User
  },
  {
    id: "parents",
    title: "Add your parents",
    description: "Building connections starts with your immediate family.",
    icon: Heart
  },
  {
    id: "goals",
    title: "What are your goals?",
    description: "Help us personalize your experience.",
    icon: Sparkles
  }
]

const goals = [
  { id: "preserve", label: "Preserve family stories", icon: "📖" },
  { id: "discover", label: "Discover ancestry", icon: "🔍" },
  { id: "connect", label: "Connect with relatives", icon: "🤝" },
  { id: "document", label: "Document genealogy", icon: "📋" },
  { id: "share", label: "Share with family", icon: "👨‍👩‍👧‍👦" },
  { id: "learn", label: "Learn about heritage", icon: "🌍" }
]

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Form state
  const [userData, setUserData] = useState({
    name: "",
    birthYear: "",
    birthPlace: "",
    bio: ""
  })

  const [parent1, setParent1] = useState({
    name: "",
    birthYear: "",
    birthPlace: ""
  })

  const [parent2, setParent2] = useState({
    name: "",
    birthYear: "",
    birthPlace: ""
  })

  const [selectedGoals, setSelectedGoals] = useState<string[]>([])

  const progress = ((currentStep + 1) / steps.length) * 100

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/signin'); return }

      // 1. Create the family
      const familyName = `${userData.lastName || 'My'} Family`
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()
      const { data: family, error: familyErr } = await supabase
        .from('families')
        .insert({ name: familyName, invite_code: inviteCode, created_by: user.id })
        .select()
        .single()
      if (familyErr) throw familyErr

      // 2. Create the first member (self)
      const { data: member, error: memberErr } = await supabase
        .from('family_members')
        .insert({
          family_id: family.id,
          name: `${userData.firstName} ${userData.lastName}`.trim(),
          birth_year: userData.birthYear ? parseInt(userData.birthYear) : null,
          birth_place: userData.birthPlace || null,
          relationship: 'self',
          generation: 3,
          is_alive: true,
          role: 'admin',
          added_by: user.id,
        })
        .select()
        .single()
      if (memberErr) throw memberErr

      // 3. Update profile
      await supabase.from('profiles').update({
        family_id: family.id,
        member_id: member.id,
        display_name: `${userData.firstName} ${userData.lastName}`.trim(),
        role: 'admin',
      }).eq('id', user.id)

      router.push('/dashboard')
    } catch (e) {
      console.error('Onboarding error:', e)
      // Still redirect — user can set up family later
      router.push('/dashboard')
    }
  }

  const toggleGoal = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId)
        ? prev.filter((id) => id !== goalId)
        : [...prev, goalId]
    )
  }

  const canProceed = () => {
    switch (steps[currentStep].id) {
      case "yourself":
        return userData.name.trim() !== ""
      case "parents":
        return true // Optional step
      case "goals":
        return selectedGoals.length > 0
      default:
        return true
    }
  }

  const renderStepContent = () => {
    switch (steps[currentStep].id) {
      case "welcome":
        return (
          <div className="text-center py-8">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-8">
              <Users className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Build Your Family Legacy
            </h2>
            <p className="text-muted-foreground text-lg max-w-md mx-auto mb-8">
              Family Graph helps you visualize, preserve, and understand your family heritage across generations.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              {[
                { icon: Users, label: "Build Trees" },
                { icon: Heart, label: "Save Stories" },
                { icon: Sparkles, label: "AI Insights" }
              ].map((item, index) => (
                <div key={index} className="p-4 rounded-xl bg-muted/50 border border-border">
                  <item.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        )

      case "yourself":
        return (
          <div className="space-y-6 py-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center border border-border">
                <User className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Your Profile</h3>
                <p className="text-sm text-muted-foreground">This will be the root of your family tree</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="Your full name"
                  value={userData.name}
                  onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                  className="h-11 bg-muted/50 border-border"
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
                  <Label htmlFor="birthPlace">Birth Place</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="birthPlace"
                      placeholder="City, Country"
                      value={userData.birthPlace}
                      onChange={(e) => setUserData({ ...userData, birthPlace: e.target.value })}
                      className="pl-10 h-11 bg-muted/50 border-border"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Short Bio (optional)</Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us a bit about yourself..."
                  value={userData.bio}
                  onChange={(e) => setUserData({ ...userData, bio: e.target.value })}
                  className="bg-muted/50 border-border resize-none"
                  rows={3}
                />
              </div>
            </div>
          </div>
        )

      case "parents":
        return (
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Add your parents to start building connections. You can skip this and add them later.
            </p>

            {/* Parent 1 */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground">Parent 1</h4>
                  <p className="text-xs text-muted-foreground">Mother or Father</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input
                  placeholder="Name"
                  value={parent1.name}
                  onChange={(e) => setParent1({ ...parent1, name: e.target.value })}
                  className="h-10 bg-muted/50 border-border"
                />
                <Input
                  placeholder="Birth year"
                  type="number"
                  value={parent1.birthYear}
                  onChange={(e) => setParent1({ ...parent1, birthYear: e.target.value })}
                  className="h-10 bg-muted/50 border-border"
                />
                <Input
                  placeholder="Birth place"
                  value={parent1.birthPlace}
                  onChange={(e) => setParent1({ ...parent1, birthPlace: e.target.value })}
                  className="h-10 bg-muted/50 border-border"
                />
              </div>
            </div>

            {/* Parent 2 */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground">Parent 2</h4>
                  <p className="text-xs text-muted-foreground">Mother or Father</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input
                  placeholder="Name"
                  value={parent2.name}
                  onChange={(e) => setParent2({ ...parent2, name: e.target.value })}
                  className="h-10 bg-muted/50 border-border"
                />
                <Input
                  placeholder="Birth year"
                  type="number"
                  value={parent2.birthYear}
                  onChange={(e) => setParent2({ ...parent2, birthYear: e.target.value })}
                  className="h-10 bg-muted/50 border-border"
                />
                <Input
                  placeholder="Birth place"
                  value={parent2.birthPlace}
                  onChange={(e) => setParent2({ ...parent2, birthPlace: e.target.value })}
                  className="h-10 bg-muted/50 border-border"
                />
              </div>
            </div>
          </div>
        )

      case "goals":
        return (
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Select the goals that matter most to you. This helps us personalize your experience.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {goals.map((goal) => {
                const isSelected = selectedGoals.includes(goal.id)
                return (
                  <button
                    key={goal.id}
                    onClick={() => toggleGoal(goal.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${isSelected
                        ? "bg-primary/10 border-primary/50"
                        : "bg-muted/30 border-border hover:border-border/80"
                      }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{goal.icon}</span>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    <p className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"
                      }`}>
                      {goal.label}
                    </p>
                  </button>
                )
              })}
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
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(progress)}% complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((step, index) => {
            const StepIcon = step.icon
            const isActive = index === currentStep
            const isComplete = index < currentStep

            return (
              <div
                key={step.id}
                className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isComplete
                      ? "bg-primary text-white"
                      : isActive
                        ? "bg-primary/20 text-primary border-2 border-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                >
                  {isComplete ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <StepIcon className="w-5 h-5" />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${isComplete ? "bg-primary" : "bg-border"
                      }`}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Content card */}
        <div className="bg-card rounded-2xl border border-border p-6 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-foreground">
              {steps[currentStep].title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {steps[currentStep].description}
            </p>
          </div>

          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={handleBack}
              className="h-11 px-6 border-border"
            >
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
              {isLoading ? "Creating your tree..." : "Get Started"}
              <Sparkles className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="h-11 px-6 bg-primary hover:bg-primary/90"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        {/* Skip link */}
        {currentStep > 0 && currentStep < steps.length - 1 && (
          <button
            onClick={() => setCurrentStep(steps.length - 1)}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors"
          >
            Skip setup and go to dashboard
          </button>
        )}
      </div>
    </div>
  )
}
