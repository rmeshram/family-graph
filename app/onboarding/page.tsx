"use client"

import { useState, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import {
  User, MapPin, Calendar, ArrowRight, ArrowLeft,
  Camera, Loader2, AlertCircle, RefreshCw, TreePine,
  Heart, Sparkles, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ─────────────────────────── gotra reference (SPEC Appendix A) ── */
const GOTRAS = [
  "Atri","Bharadwaj","Gautam","Jamadagni","Kashyap","Vashishtha","Vishwamitra","Agastya",
  "Angiras","Garg","Harit","Kaushik","Kaundinya","Mudgal","Parashar","Sandilya","Shandilya",
  "Shaunaka","Shringi","Upamanyu","Vasishtha","Vatsa","Audich","Bhrigu","Dhananjay",
  "Durvasa","Galav","Gautama","Jabali","Kanva","Kratu","Lomasha","Mandavya","Marichi",
  "Maudgalya","Pulaha","Pulastya","Rishyashringa","Srivatsa","Suryadatta","Vamadeva",
  "Viswamitra","Yajnavalkya","Lingayat","Savarni","Lohita","Pouranik","Naitreyi",
  "Maitreyi","Vyasa","Jabala","Kapi","Agni","Daksha","Varuna","Indra",
]

const RELIGIONS = ["Hindu","Muslim","Christian","Sikh","Jain","Buddhist","Parsi","Jewish","Other"]

/* ─────────────────────────── types ── */
type Intent = "matrimony" | "family_tree" | "both" | null
type Dir = 1 | -1

/* ─────────────────────────── slide animation ── */
function stepVariants(dir: Dir) {
  return {
    enter: { x: dir * 40, opacity: 0 },
    center: { x: 0, opacity: 1, transition: { duration: 0.28, ease: "easeOut" as const } },
    exit: { x: dir * -40, opacity: 0, transition: { duration: 0.2, ease: "easeIn" as const } },
  }
}

/* ─────────────────────────── progress dots ── */
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full transition-all duration-300",
            i < current
              ? "w-2 h-2 bg-blue-700"
              : i === current
              ? "w-5 h-2 bg-blue-700"
              : "w-2 h-2 bg-gray-200"
          )}
        />
      ))}
    </div>
  )
}

/* ─────────────────────────── intent card ── */
function IntentCard({
  icon, label, desc, selected, onClick,
}: {
  icon: React.ReactNode
  label: string
  desc: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border-2 p-4 transition-all duration-150",
        selected
          ? "border-blue-700 bg-blue-50 shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl text-lg shrink-0",
          selected ? "bg-blue-700 text-white" : "bg-gray-100 text-slate-600"
        )}>
          {icon}
        </div>
        <div>
          <p className={cn("text-[14px] font-semibold", selected ? "text-blue-700" : "text-slate-900")}>{label}</p>
          <p className="text-[12px] text-slate-500 mt-0.5">{desc}</p>
        </div>
        {selected && <ChevronRight className="ml-auto h-4 w-4 text-blue-700 shrink-0" />}
      </div>
    </button>
  )
}

/* ─────────────────────────── page ── */
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

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<Dir>(1)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [userData, setUserData] = useState({
    name: "",
    gender: "" as "male" | "female" | "",
    birthYear: "",
    city: "",
    gotra: "",
    religion: "",
  })
  const [intent, setIntent] = useState<Intent>(null)

  /* ── navigation ── */
  function next() { setDir(1); setStep(s => s + 1) }
  function back() { setDir(-1); setStep(s => s - 1) }

  function canProceedStep0() {
    const n = userData.name.trim()
    return n.length >= 2 && /\p{L}/u.test(n) && userData.gender !== "" && userData.birthYear.length === 4
  }

  /* ── submit ── */
  async function handleComplete() {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // Belt-and-suspenders invite redirect check
      const inviteNext = searchParams.get("next")
      const inviteCodeBackup = typeof window !== "undefined"
        ? sessionStorage.getItem("fg_invite_return")
        : null
      const invitePath =
        (inviteNext?.startsWith("/join/") || inviteNext?.startsWith("/claim/") ? inviteNext : null) ??
        (inviteCodeBackup ? `/join/${inviteCodeBackup}` : null)
      if (invitePath) { window.location.href = invitePath; return }

      const supabase = createClient()
      const { data: { session }, error: sessionErr } = await supabase.auth.refreshSession()
      if (sessionErr || !session) { setIsLoading(false); router.push("/auth/signin"); return }
      const user = session.user

      // Guard: already onboarded
      const { data: existingProfile } = await supabase
        .from("profiles").select("family_id").eq("id", user.id).single()
      if (existingProfile?.family_id) { window.location.href = "/dashboard"; return }

      // Derive family name from last name
      const trimmedName = userData.name.trim()
      if (!trimmedName) { setIsLoading(false); setErrorMsg("Please enter your name."); return }
      const parts = trimmedName.split(" ")
      const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0]
      const familyName = `${lastName || "My"} Family`
      const inviteCode = (() => {
        const bytes = new Uint8Array(12)
        crypto.getRandomValues(bytes)
        return Array.from(bytes, b => b.toString(36)).join("").replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()
      })()

      let familyId!: string
      let familyCreated = false
      const _diag: string[] = []

      // Path 1: SECURITY DEFINER RPC
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcData, error: rpcErr } = await (supabase as any).rpc("create_family", {
          p_name: familyName, p_invite_code: inviteCode,
        })
        if (!rpcErr && rpcData) { familyId = (rpcData as any).id; familyCreated = true }
        else _diag.push(`RPC: ${rpcErr?.message ?? "no data"}`)
      } catch (e: unknown) { _diag.push(`RPC exception: ${(e as any)?.message ?? e}`) }

      // Path 2: Server API route
      if (!familyCreated) {
        try {
          const res = await fetch("/api/create-family", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: familyName, inviteCode, createdBy: user.id }),
          })
          if (res.ok) {
            const data = await res.json()
            familyId = data.family.id; familyCreated = true
          } else {
            const body = await res.json().catch(() => ({}))
            _diag.push(`API ${res.status}: ${body.error ?? "unknown"}`)
          }
        } catch (e: unknown) { _diag.push(`API exception: ${(e as any)?.message ?? e}`) }
      }

      // Path 3: Direct insert
      if (!familyCreated) {
        const { data: family, error: familyErr } = await supabase
          .from("families").insert({ name: familyName, invite_code: inviteCode, created_by: user.id })
          .select().single()
        if (familyErr) throw new Error(`All methods failed — ${_diag.join(" | ")}`)
        familyId = family.id
      }

      // Update profile
      await supabase.from("profiles").update({
        family_id: familyId,
        display_name: trimmedName,
        role: "admin",
      }).eq("id", user.id)

      // Upload photo
      let photoUrl: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split(".").pop()
        const path = `${user.id}/avatar.${ext}`
        const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, photoFile, { upsert: true })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }

      // Create self member
      const { data: member, error: memberErr } = await supabase
        .from("family_members")
        .insert({
          family_id: familyId,
          name: trimmedName,
          gender: userData.gender || null,
          birth_year: userData.birthYear ? parseInt(userData.birthYear) : null,
          birth_place: userData.city || null,
          gotra: userData.gotra.trim() || null,
          religion: userData.religion || null,
          photo_url: photoUrl,
          relationship: "self",
          generation: 3,
          is_alive: true,
          role: "admin",
          parent_ids: [],
          added_by: user.id,
          is_biodata_visible: intent === "matrimony" || intent === "both",
        } as any)
        .select().single()
      if (memberErr) throw memberErr
      if (!member) throw new Error("Member profile was not created — please try again.")

      // Link member to profile
      await supabase.from("profiles").update({ member_id: member.id }).eq("id", user.id)

      // Redirect — matrimony intent goes to dashboard with matrimony flag
      const pendingInvite = searchParams.get("next")
      if (pendingInvite?.startsWith("/join/")) {
        window.location.href = pendingInvite
      } else if (intent === "matrimony" || intent === "both") {
        window.location.href = "/matches?welcome=1"
      } else {
        window.location.href = "/dashboard?welcome=1"
      }
    } catch (e) {
      console.error("Onboarding error:", e)
      setIsLoading(false)
      const raw = e instanceof Error ? e.message : (e as any)?.message ?? "Unknown error"
      const isRLS = raw.includes("row-level security") || raw.includes("policy") || raw.includes("42501")
      setErrorMsg(isRLS ? "Account setup hit a permissions error. Please try again." : raw)
    }
  }

  /* ─────────────────────────── render ── */
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#F8F9FA" }}
    >
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-700">
            <TreePine className="h-4 w-4 text-white" />
          </div>
          <span className="text-[15px] font-bold text-slate-900">Outverse</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Progress */}
          <div className="px-6 pt-6 pb-4">
            <StepDots current={step} total={3} />
            <p className="text-center text-[11px] text-slate-400 mt-2">
              Step {step + 1} of 3
            </p>
          </div>

          {/* Steps */}
          <div className="relative overflow-hidden" style={{ minHeight: 340 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                variants={stepVariants(dir)}
                initial="enter"
                animate="center"
                exit="exit"
                className="px-6 pb-6"
              >

                {/* ── Step 0 — About you ─────────────────── */}
                {step === 0 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-[20px] font-bold text-slate-900">Tell us about yourself</h2>
                      <p className="text-[13px] text-slate-500 mt-1">This becomes your profile on Outverse.</p>
                    </div>

                    {/* Photo */}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        if (f.size > 5 * 1024 * 1024) { setErrorMsg("Photo must be under 5 MB."); return }
                        setPhotoFile(f)
                        setPhotoPreview(URL.createObjectURL(f))
                        setErrorMsg(null)
                      }}
                    />
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="relative h-16 w-16 shrink-0 rounded-full border-2 border-dashed border-gray-200 hover:border-blue-400 bg-gray-50 overflow-hidden transition-colors flex items-center justify-center"
                      >
                        {photoPreview
                          ? <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                          : <Camera className="h-6 w-6 text-slate-400" />
                        }
                      </button>
                      <div>
                        <p className="text-[13px] font-medium text-slate-700">Add a photo</p>
                        <p className="text-[11px] text-slate-400">Optional — helps family recognise you</p>
                      </div>
                    </div>

                    {/* Name */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">Full name <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="e.g. Rahul Sharma"
                          value={userData.name}
                          onChange={e => setUserData(d => ({ ...d, name: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    {/* Gender */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">Gender <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["male", "female"] as const).map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setUserData(d => ({ ...d, gender: g }))}
                            className={cn(
                              "rounded-xl border py-2.5 text-[13px] font-semibold capitalize transition-all",
                              userData.gender === g
                                ? "border-blue-700 bg-blue-50 text-blue-700"
                                : "border-gray-200 bg-white text-slate-600 hover:border-gray-300"
                            )}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Birth year */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">Birth year <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="number"
                          placeholder="e.g. 1995"
                          min={1920}
                          max={new Date().getFullYear() - 15}
                          value={userData.birthYear}
                          onChange={e => setUserData(d => ({ ...d, birthYear: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      disabled={!canProceedStep0()}
                      onClick={next}
                      className="w-full rounded-xl bg-blue-700 py-3.5 text-[14px] font-semibold text-white hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      Continue <ArrowRight className="h-4 w-4" />
                    </motion.button>
                  </div>
                )}

                {/* ── Step 1 — Intent ────────────────────── */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-[20px] font-bold text-slate-900">What brings you here?</h2>
                      <p className="text-[13px] text-slate-500 mt-1">We&apos;ll personalise your experience.</p>
                    </div>

                    <IntentCard
                      icon={<Heart className="h-5 w-5" />}
                      label="Find a match"
                      desc="For myself or a family member. Build biodata, get verified matches."
                      selected={intent === "matrimony"}
                      onClick={() => setIntent("matrimony")}
                    />
                    <IntentCard
                      icon={<TreePine className="h-5 w-5" />}
                      label="Build our family tree"
                      desc="Map our extended family, connect relatives, preserve our history."
                      selected={intent === "family_tree"}
                      onClick={() => setIntent("family_tree")}
                    />
                    <IntentCard
                      icon={<Sparkles className="h-5 w-5" />}
                      label="Both"
                      desc="Family tree first, matrimony when ready. Most families do this."
                      selected={intent === "both"}
                      onClick={() => setIntent("both")}
                    />

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={back} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 text-[13px] font-semibold text-slate-600 hover:bg-gray-50 transition-colors">
                        <ArrowLeft className="h-4 w-4" /> Back
                      </button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        type="button"
                        disabled={!intent}
                        onClick={next}
                        className="flex-1 rounded-xl bg-blue-700 py-3 text-[14px] font-semibold text-white hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                      >
                        Continue <ArrowRight className="h-4 w-4" />
                      </motion.button>
                    </div>
                  </div>
                )}

                {/* ── Step 2 — Family details ─────────────── */}
                {step === 2 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-[20px] font-bold text-slate-900">Your family background</h2>
                      <p className="text-[13px] text-slate-500 mt-1">
                        {intent === "matrimony" || intent === "both"
                          ? "Used for gotra matching and verified introductions."
                          : "Helps place you in your family tree."}
                      </p>
                    </div>

                    {/* City */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">Your city</label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="e.g. Pune"
                          value={userData.city}
                          onChange={e => setUserData(d => ({ ...d, city: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    {/* Gotra — datalist autocomplete, shown for all intents */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">
                        Gotra
                        {(intent === "matrimony" || intent === "both")
                          ? <span className="ml-1 text-amber-600 text-[11px] font-semibold">· Important for matching</span>
                          : <span className="ml-1 text-slate-400 text-[11px]">(optional)</span>}
                      </label>
                      <input
                        list="gotra-list"
                        type="text"
                        placeholder="e.g. Kashyap, Bharadwaj, Vashishtha"
                        value={userData.gotra}
                        onChange={e => setUserData(d => ({ ...d, gotra: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      <datalist id="gotra-list">
                        {GOTRAS.map(g => <option key={g} value={g} />)}
                      </datalist>
                      <p className="text-[11px] text-slate-400">Used to check gotra compatibility automatically.</p>
                    </div>

                    {/* Religion — shown for matrimony intent */}
                    {(intent === "matrimony" || intent === "both") && (
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-slate-700">Religion</label>
                        <div className="flex flex-wrap gap-2">
                          {RELIGIONS.map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setUserData(d => ({ ...d, religion: d.religion === r ? "" : r }))}
                              className={cn(
                                "px-3.5 py-2 rounded-xl border text-[13px] font-medium transition-all",
                                userData.religion === r
                                  ? "bg-blue-700 border-blue-700 text-white"
                                  : "bg-gray-50 border-gray-200 text-slate-600 hover:border-blue-300"
                              )}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {errorMsg && (
                      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-red-700">Setup failed</p>
                          <p className="text-[12px] text-red-600 mt-0.5">{errorMsg}</p>
                        </div>
                        <button onClick={handleComplete} className="text-[12px] text-red-600 flex items-center gap-1 shrink-0">
                          <RefreshCw className="h-3 w-3" /> Retry
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button type="button" onClick={back} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 text-[13px] font-semibold text-slate-600 hover:bg-gray-50 transition-colors">
                        <ArrowLeft className="h-4 w-4" /> Back
                      </button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        type="button"
                        onClick={handleComplete}
                        disabled={isLoading}
                        className="flex-1 rounded-xl bg-blue-700 py-3 text-[14px] font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                      >
                        {isLoading
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Setting up…</>
                          : <>{intent === "matrimony" || intent === "both" ? "Start finding matches" : "Build my family tree"} <Sparkles className="h-4 w-4" /></>
                        }
                      </motion.button>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-5">
          Your data is private by default. Share only with families you trust.
        </p>
      </div>
    </div>
  )
}
