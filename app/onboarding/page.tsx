"use client"

import { useState, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  User,
  MapPin,
  Calendar,
  Sparkles,
  TreePine,
  Camera,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react"

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
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [userData, setUserData] = useState({
    name: "",
    birthYear: "",
    birthPlace: "",
  })

  const handleComplete = async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // Belt-and-suspenders: if the user arrived here from an invite link,
      // redirect immediately WITHOUT creating a family or member nodes.
      // The auth/callback should have skipped onboarding for /join/ destinations,
      // but a browser back-button or stale session can still land here.
      // The join page handles all family + node assignment for invite flows.
      const inviteNext = searchParams.get('next')
      // Also check sessionStorage backup set by the join page before auth redirect
      const inviteCodeBackup = typeof window !== 'undefined'
        ? sessionStorage.getItem('fg_invite_return')
        : null
      const invitePath = (inviteNext?.startsWith('/join/') || inviteNext?.startsWith('/claim/') ? inviteNext : null)
        ?? (inviteCodeBackup ? `/join/${inviteCodeBackup}` : null)
      if (invitePath) {
        window.location.href = invitePath
        return
      }

      const supabase = createClient()

      // Refresh session first — ensures JWT is valid before any DB writes
      // (stale/expired token causes auth.uid() = NULL → RLS blocks insert)
      const { data: { session }, error: sessionErr } = await supabase.auth.refreshSession()
      if (sessionErr || !session) {
        setIsLoading(false)
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
      // MED-10: validate name before any DB writes so an empty name never reaches the insert.
      const trimmedUserName = userData.name.trim()
      if (!trimmedUserName) {
        setIsLoading(false)
        setErrorMsg('Please enter your name before continuing.')
        return
      }
      const nameParts = trimmedUserName.split(" ")
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0]
      const familyName = `${lastName || "My"} Family`
      const inviteCode = (() => {
        const bytes = new Uint8Array(12)
        crypto.getRandomValues(bytes)
        return Array.from(bytes, b => b.toString(36)).join('').replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()
      })()

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

      // 2. Update profile with family_id so RLS policies work for member inserts
      // (family_members INSERT policy checks family_id = my_family_id(), which reads from profiles)
      const { error: profileErr } = await supabase.from("profiles").update({
        family_id: familyId,
        display_name: userData.name.trim(),
        role: "admin",
      }).eq("id", user.id)
      if (profileErr) throw profileErr

      // 3. Create self member (generation 3)
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
          photo_url: photoUrl,
          relationship: "self",
          generation: 3,
          is_alive: true,
          role: "admin",
          parent_ids: [],
          added_by: user.id,
        })
        .select()
        .single()
      if (memberErr) throw memberErr
      // Guard: .single() can return null data without an error in some Supabase versions.
      // If member is null, profile.member_id would be set to undefined, leaving the user
      // in 'unlinked' state on the dashboard despite completing onboarding.
      if (!member) throw new Error('Member profile was not created — please try again.')

      // 4. Update profile with member_id now that self member exists
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

  const canSubmit = () => {
    const trimmed = userData.name.trim()
    return trimmed.length >= 2 && /\p{L}/u.test(trimmed)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 mb-4 shadow-lg shadow-primary/20">
            <TreePine className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">What's your name?</h1>
          <p className="text-sm text-muted-foreground mt-1">We'll create your family tree in seconds.</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">

          {/* Photo */}
          <div className="flex items-center gap-4">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (!f) return
                if (f.size > 5 * 1024 * 1024) { setErrorMsg('Photo must be under 5 MB.'); return }
                if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type)) {
                  setErrorMsg('Please upload a JPEG, PNG, or WebP image.'); return
                }
                setPhotoFile(f)
                setPhotoPreview(URL.createObjectURL(f))
              }}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border hover:border-primary/60 bg-muted/50 overflow-hidden transition-colors"
            >
              {photoPreview
                ? <img src={photoPreview} alt="you" className="h-full w-full object-cover" />
                : <Camera className="h-6 w-6 text-muted-foreground/50" />
              }
            </button>
            <div>
              <p className="text-sm font-medium">Add a photo</p>
              <p className="text-xs text-muted-foreground">Optional — helps family recognise you</p>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Your full name <span className="text-destructive">*</span></Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="name"
                placeholder="e.g. Rahul Sharma"
                value={userData.name}
                onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit() && handleComplete()}
                className="pl-10 h-11 bg-muted/50 border-border"
                autoFocus
              />
            </div>
          </div>

          {/* Optional fields — shown inline, no extra step */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="birthYear" className="text-xs text-muted-foreground">Birth year <span className="text-muted-foreground/50">(optional)</span></Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="birthYear"
                  type="number"
                  placeholder="1990"
                  value={userData.birthYear}
                  onChange={(e) => setUserData({ ...userData, birthYear: e.target.value })}
                  className="pl-9 h-9 text-sm bg-muted/50 border-border"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="birthPlace" className="text-xs text-muted-foreground">City <span className="text-muted-foreground/50">(optional)</span></Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="birthPlace"
                  placeholder="Nagpur"
                  value={userData.birthPlace}
                  onChange={(e) => setUserData({ ...userData, birthPlace: e.target.value })}
                  className="pl-9 h-9 text-sm bg-muted/50 border-border"
                />
              </div>
            </div>
          </div>

          {/* Error banner */}
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
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

          {/* CTA */}
          <Button
            onClick={handleComplete}
            disabled={!canSubmit() || isLoading}
            className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
          >
            {isLoading ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Creating your tree…</>
            ) : (
              <>Create my family tree <Sparkles className="w-5 h-5 ml-2" /></>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground/60 mt-5">
          You can add parents, siblings and relatives right from the tree — no extra steps.
        </p>
      </div>
    </div>
  )
}

