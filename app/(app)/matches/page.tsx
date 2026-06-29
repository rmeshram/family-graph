"use client"

import { redirect } from "next/navigation"
import { FEATURE_FLAGS } from "@/lib/feature-flags"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import { sampleMatrimonyProfiles, type DemoBiodataProfile } from "@/lib/sample-data"
import { useAuth } from "@/hooks/use-auth"
import {
  ArrowLeft, Heart, X, MessageCircle, Sparkles,
  Briefcase, GraduationCap, Users, CheckCircle2,
  Send, RefreshCw, Loader2, Inbox,
  Search, SlidersHorizontal, ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { computeTrustScore, trustScoreTierLabel } from "@/lib/trust-score"
import { getAuraTier } from "@/lib/aura"

/* ── types ── */
interface BiodataProfile {
  id: string
  name: string
  gender: string | null
  birth_year: number | null
  current_place: string | null
  gotra: string | null
  religion: string | null
  caste: string | null
  occupation: string | null
  occupation_category: string | null
  education_level: string | null
  education_field: string | null
  annual_income_range: string | null
  height_cm: number | null
  marital_status: string | null
  family_type: string | null
  manglik: boolean | null
  biodata_photo_url: string | null
  residency_status: string | null
  current_country: string | null
  partner_expectations: string | null
  family_id: string
}

const CURRENT_YEAR = new Date().getFullYear()

/* ── helpers ── */
function fmtHeight(cm: number): string {
  const totalIn = Math.round(cm / 2.54)
  return `${Math.floor(totalIn / 12)}'${totalIn % 12}"`
}

function fmtEdu(level: string | null): string {
  if (!level) return ""
  return level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

/* ── lifestyle compatibility ── */
const VECTOR_KEYS = ['comfort', 'travel', 'housing', 'spending', 'luxury', 'growth']
const MAX_DIST = Math.sqrt(VECTOR_KEYS.length * 100 * 100) // ~244.9

function vectorCompatibility(a: Record<string, number>, b: Record<string, number> | null | undefined): number {
  if (!b) return 50 // no vector → neutral score
  const dist = Math.sqrt(VECTOR_KEYS.reduce((sum, k) => sum + Math.pow((a[k] ?? 50) - (b[k] ?? 50), 2), 0))
  return Math.round((1 - dist / MAX_DIST) * 100)
}

function fmtIncome(range: string | null): string | null {
  if (!range) return null
  const r = range.toLowerCase().trim()
  if (r.includes("lpa") || r.includes("l/yr")) return `₹${r.replace(/lpa|l\/yr/gi, "").trim()} LPA`
  if (r.includes("+")) return `₹${r.replace("+", "").trim()}L+/yr`
  if (r.includes("-")) {
    const [lo, hi] = r.split("-").map(s => s.trim())
    return `₹${lo}–${hi}L/yr`
  }
  return `₹${r} LPA`
}

function whyMatch(profile: BiodataProfile, familyStats?: { total: number; verified: number }): string[] {
  const reasons: string[] = []
  if (familyStats && familyStats.verified >= 1) reasons.push("Family tree verified")
  if (profile.gotra) reasons.push("Gotra profile shared")
  const filled = [profile.biodata_photo_url, profile.gotra, profile.birth_year, profile.occupation,
  profile.education_level, profile.current_place, profile.family_type, profile.religion].filter(Boolean).length
  if (filled >= 5) reasons.push("Detailed profile")
  if (profile.religion) reasons.push("Community match")
  if (profile.birth_year) {
    const age = CURRENT_YEAR - profile.birth_year
    if (age >= 22 && age <= 35) reasons.push("Age compatible")
  }
  if (profile.family_type === "joint") reasons.push("Joint family values")
  const fallbacks = ["Recommended match", "Trust compatible", "Values aligned"]
  let fi = 0
  while (reasons.length < 3 && fi < fallbacks.length) {
    if (!reasons.includes(fallbacks[fi])) reasons.push(fallbacks[fi])
    fi++
  }
  return reasons.slice(0, 4)
}

/* ── connect dialog ── */
function ConnectDialog({
  profile,
  onSend,
  onClose,
}: {
  profile: BiodataProfile
  onSend: (msg: string) => void
  onClose: () => void
}) {
  const [msg, setMsg] = useState("")
  const firstName = profile.name.split(" ")[0]
  const templates = [
    { label: "Know more about your family", text: `We'd love to know more about ${firstName}'s family and background. Looking forward to connecting.` },
    { label: "Introduce our side", text: "We'd like to introduce our family and share a little about our side. We hope to hear from you soon." },
    { label: "Looks compatible — let's talk", text: "Your family's background looks compatible with ours. Could our families connect to talk further?" },
  ]
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md rounded-3xl p-6 space-y-4"
        style={{ background: "#FFFFFF" }}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
      >
        <div>
          <h3 className="font-bold text-lg" style={{ color: "#111827" }}>
            Request a family introduction
          </h3>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Your message will go to {profile.name.split(" ")[0]}&apos;s family admin for review. No direct contact details are shared until both families agree.
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide mb-1">About the match</p>
          <p className="text-[13px] text-amber-900">
            {profile.name}
            {profile.birth_year ? `, ${CURRENT_YEAR - profile.birth_year} yrs` : ""}
            {profile.current_place ? ` · ${profile.current_place}` : ""}
            {profile.gotra ? ` · ${profile.gotra} gotra` : ""}
          </p>
        </div>
        {/* quick-start templates — tap to fill, still fully editable below */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#92400E" }}>
            Quick start — tap one
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map(t => (
              <button
                key={t.label}
                type="button"
                onClick={() => setMsg(t.text)}
                aria-pressed={msg === t.text}
                className="rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={
                  msg === t.text
                    ? { background: "#FDE68A", borderColor: "#D97706", color: "#92400E" }
                    : { background: "#FFFBEB", borderColor: "#FDE68A", color: "#92400E" }
                }
              >
                + {t.label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Tap a quick-start above, or write your own introduction…"
          rows={4}
          className="w-full rounded-xl border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ borderColor: "#E5E7EB", color: "#111827" }}
          maxLength={500}
        />
        <p className="text-[11px] text-gray-400">{msg.length}/500 characters</p>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 gap-2"
            style={{ background: "#1D4ED8", color: "#fff" }}
            disabled={msg.trim().length < 10}
            onClick={() => onSend(msg.trim())}
          >
            <Send className="h-4 w-4" />
            Send Introduction
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── main page ── */
export default function MatchesPage() {
  if (!FEATURE_FLAGS.enableMatrimonyFeed) redirect("/dashboard")

  const { user, profile: authProfile, familyId, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [forceDemo, setForceDemo] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1') setForceDemo(true)
    if (params.get('welcome') === '1') setShowWelcome(true)
  }, [])

  const [profiles, setProfiles] = useState<BiodataProfile[]>([])
  const [actioned, setActioned] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = sessionStorage.getItem('fg_actioned')
        if (s) return new Set(JSON.parse(s))
      } catch { }
    }
    return new Set()
  })
  const [familyStats, setFamilyStats] = useState<Map<string, { total: number; verified: number }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectTarget, setConnectTarget] = useState<BiodataProfile | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "like" | "pass" | "connect" } | null>(null)
  const [myNodeId, setMyNodeId] = useState<string | null>(null)
  const [myGender, setMyGender] = useState<string | null>(null)
  const [inboxCount, setInboxCount] = useState(0)
  const [trustScore, setTrustScore] = useState<number | null>(null)
  const [trustDismissed, setTrustDismissed] = useState(false)
  const [ownVector, setOwnVector] = useState<Record<string, number> | null>(null)

  /* ── search ── */
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchGotra, setSearchGotra] = useState("")
  const [searchCity, setSearchCity] = useState("")
  const [searchAgeMin, setSearchAgeMin] = useState("")
  const [searchAgeMax, setSearchAgeMax] = useState("")
  const [searchResults, setSearchResults] = useState<BiodataProfile[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const hasFilter = searchQuery.length >= 2 || !!searchGotra || !!searchCity || !!searchAgeMin || !!searchAgeMax
  const isSearchActive = searchOpen && hasFilter

  const isDemoMode = FEATURE_FLAGS.enableDemoData && (forceDemo || (!authLoading && !user))

  /* load profiles */
  const load = useCallback(async () => {
    /* demo mode — use sample data, no DB calls */
    if (isDemoMode) {
      setProfiles(sampleMatrimonyProfiles as unknown as BiodataProfile[])
      setMyNodeId("demo-node")
      setMyGender("male")
      setInboxCount(2)
      // Use localStorage vector if available for demo compatibility preview
      try {
        const stored = localStorage.getItem('fg_lifestyle_vector')
        if (stored) setOwnVector(JSON.parse(stored))
      } catch { }
      const dm = new Map<string, { total: number; verified: number }>()
        ; (sampleMatrimonyProfiles as any[]).forEach((p, i) => {
          dm.set(p.family_id ?? `demo-fam-${i}`, { total: 8 + i * 4, verified: 3 + i * 2 })
        })
      setFamilyStats(dm)
      setLoading(false)
      return
    }
    if (!user || !familyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      /* get caller's own node — extended fields for trust score */
      const { data: myNode } = await (supabase as any)
        .from("family_members")
        .select("id, gender, photo_url, biodata_photo_url, birth_year, gotra, is_biodata_visible, is_claimed, claimed_by_user_id")
        .eq("id", authProfile?.member_id ?? "")
        .maybeSingle()

      const nodeId: string | null = myNode?.id ?? null
      const gender: string | null = (myNode as any)?.gender ?? null
      setMyNodeId(nodeId)
      setMyGender(gender)

      /* caller's own family size — feeds the trust-score family_size signal.
         Was hardcoded to 0, which permanently understated the score and kept
         the "improve your profile" strip showing for already-complete users. */
      let ownFamilyCount = 0
      if (familyId) {
        const { count: famCount } = await (supabase.from("family_members") as any)
          .select("id", { count: "exact", head: true })
          .eq("family_id", familyId)
          .eq("is_alive", true)
        ownFamilyCount = famCount ?? 0
      }

      /* compute trust score for match-strength strip */
      if (myNode) {
        const n = myNode as any
        const score = computeTrustScore({
          member: {
            isClaimed: !!(n.is_claimed || n.claimed_by_user_id),
            claimedByUserId: n.claimed_by_user_id ?? undefined,
            photoUrl: n.photo_url ?? null,
            biodataPhotoUrl: n.biodata_photo_url ?? null,
            birthYear: n.birth_year ?? null,
            dateOfBirth: undefined,
            gotra: n.gotra ?? null,
            isBiodataVisible: n.is_biodata_visible ?? false,
          },
          claimantPhoneVerified: !!user.phone,
          familyMemberCount: ownFamilyCount,
        })
        setTrustScore(score.total)
      }

      /* fetch own lifestyle/wealth vector for compatibility sorting */
      const { data: ownProfile } = await (supabase.from('profiles') as any)
        .select('wealth_vector')
        .eq('id', user.id)
        .maybeSingle()
      const vec = (ownProfile as any)?.wealth_vector ?? null
      setOwnVector(vec)
      // Fall back to localStorage if DB has nothing yet
      if (!vec) {
        try {
          const stored = localStorage.getItem('fg_lifestyle_vector')
          if (stored) setOwnVector(JSON.parse(stored))
        } catch { }
      }

      /* inbox unread count — pending interests aimed at my node */
      if (nodeId) {
        const { count } = await (supabase
          .from("matrimony_interests") as any)
          .select("id", { count: "exact", head: true })
          .eq("to_node_id", nodeId)
          .neq("action", "pass")
          .eq("status", "pending")
        setInboxCount(count ?? 0)
      }

      const oppositeGender = gender === "male" ? "female" : gender === "female" ? "male" : null

      /* already-actioned profiles */
      const actSet = new Set<string>()
      if (nodeId) {
        const { data: prevActions } = await supabase
          .from("matrimony_interests")
          .select("to_node_id")
          .eq("from_node_id", nodeId)
          ; (prevActions ?? []).forEach((r: any) => actSet.add(r.to_node_id))
      }
      /* merge DB actioned with any session-cached actioned to prevent re-showing acted profiles */
      setActioned(prev => new Set([...prev, ...actSet]))

      /* fetch visible biodata from OTHER families */
      let q = (supabase.from("family_members") as any)
        .select(`id, name, gender, birth_year, current_place, gotra, religion, caste,
                 occupation, occupation_category, education_level, education_field,
                 annual_income_range, height_cm, marital_status, family_type, manglik,
                 biodata_photo_url, residency_status, current_country, partner_expectations,
                 family_id`)
        .eq("is_biodata_visible", true)
        .eq("is_alive", true)
        .neq("family_id", familyId)
        .not("birth_year", "is", null)
        .gte("birth_year", CURRENT_YEAR - 45)
        .lte("birth_year", CURRENT_YEAR - 18)
        .order("biodata_last_updated_at", { ascending: false })
        .limit(60)

      if (oppositeGender) q = q.eq("gender", oppositeGender)
      if (actSet.size > 0) q = q.not("id", "in", `(${[...actSet].join(",")})`)

      const { data, error: fetchErr } = await q
      if (fetchErr) throw fetchErr
      const dbProfiles = (data ?? []) as BiodataProfile[]
      const finalProfiles = dbProfiles.length > 0
        ? dbProfiles
        : (FEATURE_FLAGS.enableDemoData ? (sampleMatrimonyProfiles as unknown as BiodataProfile[]) : [])

      /* sort by lifestyle compatibility if own vector is available */
      const sortedProfiles = vec
        ? [...finalProfiles].sort((a, b) =>
            vectorCompatibility(vec, (a as any).wealth_vector) -
            vectorCompatibility(vec, (b as any).wealth_vector)
          ).reverse()
        : finalProfiles
      setProfiles(sortedProfiles)

      /* batch-fetch family member counts for all displayed profiles */
      const fids = [...new Set(finalProfiles.map(p => p.family_id).filter(Boolean))]
      if (fids.length > 0) {
        const { data: statRows } = await (supabase.from('family_members') as any)
          .select('family_id, is_claimed')
          .in('family_id', fids)
          .eq('is_alive', true)
        const sm = new Map<string, { total: number; verified: number }>()
        for (const row of (statRows ?? [])) {
          const fid = (row as any).family_id
          const cur = sm.get(fid) ?? { total: 0, verified: 0 }
          cur.total++
          if ((row as any).is_claimed) cur.verified++
          sm.set(fid, cur)
        }
        setFamilyStats(sm)
      }
    } catch (e: unknown) {
      console.warn("[matches] DB query failed:", e)
      if (FEATURE_FLAGS.enableDemoData) {
        // demo/dev only — show sample profiles instead of an empty feed
        setProfiles(sampleMatrimonyProfiles as unknown as BiodataProfile[])
      } else {
        // production — never show fabricated profiles; surface an empty/retry state
        setProfiles([])
        setError("We couldn't load matches right now. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }, [user, familyId, authProfile?.member_id, isDemoMode, forceDemo])

  useEffect(() => {
    if (isDemoMode || !authLoading) load()
  }, [authLoading, isDemoMode, load])

  /* ── search logic ── */
  const doSearch = useCallback(async () => {
    if (!hasFilter) { setSearchResults([]); return }
    if (isDemoMode) {
      const q = searchQuery.toLowerCase()
      const filtered = (sampleMatrimonyProfiles as unknown as BiodataProfile[]).filter(p =>
        (!searchQuery || p.name.toLowerCase().includes(q)) &&
        (!searchGotra || p.gotra?.toLowerCase().includes(searchGotra.toLowerCase())) &&
        (!searchCity || p.current_place?.toLowerCase().includes(searchCity.toLowerCase()))
      )
      setSearchResults(filtered)
      return
    }
    if (!familyId) return
    setSearchLoading(true)
    try {
      let q = (supabase.from("family_members") as any)
        .select(`id, name, gender, birth_year, current_place, gotra, religion, caste,
                 occupation, occupation_category, education_level, education_field,
                 annual_income_range, height_cm, marital_status, family_type, manglik,
                 biodata_photo_url, residency_status, current_country, partner_expectations,
                 family_id`)
        .eq("is_biodata_visible", true)
        .eq("is_alive", true)
        .neq("family_id", familyId)
        .limit(40)
      if (searchQuery.trim().length >= 2) q = q.ilike("name", `%${searchQuery.trim()}%`)
      if (searchGotra.trim()) q = q.ilike("gotra", `%${searchGotra.trim()}%`)
      if (searchCity.trim()) q = q.ilike("current_place", `%${searchCity.trim()}%`)
      if (searchAgeMin) q = q.lte("birth_year", CURRENT_YEAR - parseInt(searchAgeMin))
      if (searchAgeMax) q = q.gte("birth_year", CURRENT_YEAR - parseInt(searchAgeMax))
      const { data, error: searchErr } = await q
      if (searchErr) throw searchErr
      setSearchResults((data ?? []) as BiodataProfile[])
    } catch (e) {
      console.warn("[search] failed:", e)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [supabase, familyId, isDemoMode, hasFilter, searchQuery, searchGotra, searchCity, searchAgeMin, searchAgeMax])

  useEffect(() => {
    if (!searchOpen) return
    const t = setTimeout(doSearch, 350)
    return () => clearTimeout(t)
  }, [searchOpen, doSearch])

  /* persist actioned set to sessionStorage so page refresh doesn't re-show acted-on profiles */
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { sessionStorage.setItem('fg_actioned', JSON.stringify([...actioned])) } catch { }
  }, [actioned])

  /* dismiss toast */
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const remaining = profiles.filter(p => !actioned.has(p.id))

  async function handleLike(profile: BiodataProfile) {
    setActioned(prev => new Set([...prev, profile.id]))
    setToast({ msg: "Interested!", type: "like" })
    await recordAction(profile.id, "like")
  }

  async function handlePass(profile: BiodataProfile) {
    setActioned(prev => new Set([...prev, profile.id]))
    await recordAction(profile.id, "pass")
  }

  async function handleConnect(msg: string) {
    if (!connectTarget) return
    await recordAction(connectTarget.id, "connect_request", msg)
    setActioned(prev => new Set([...prev, connectTarget.id]))
    setConnectTarget(null)
    setToast({ msg: "Introduction sent!", type: "connect" })
  }

  async function recordAction(
    nodeId: string,
    action: "like" | "pass" | "connect_request",
    message?: string
  ) {
    if (isDemoMode || !myNodeId || !user) return
    await supabase.from("matrimony_interests" as any).upsert(
      {
        from_user_id: user.id,
        from_node_id: myNodeId,
        to_node_id: nodeId,
        action,
        message: message ?? null,
        status: "pending",
      },
      { onConflict: "from_node_id,to_node_id" }
    )
    setActioned(prev => new Set([...prev, nodeId]))
  }

  /* ── loading ── */
  if ((authLoading && !isDemoMode) || loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F4F1EA" }}>
        {/* header skeleton */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-white shrink-0">
          <div className="h-6 w-32 rounded-lg bg-gray-200 animate-pulse" />
          <div className="flex-1" />
          <div className="h-8 w-24 rounded-xl bg-gray-200 animate-pulse" />
        </div>
        {/* card skeleton — matches the shape of a real match card */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* photo area */}
            <div className="relative h-56 bg-gray-100 animate-pulse overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            </div>
            <div className="p-5 space-y-4">
              {/* name + age */}
              <div className="space-y-2">
                <div className="h-5 w-40 rounded-md bg-gray-200 animate-pulse" />
                <div className="h-3.5 w-24 rounded-md bg-gray-100 animate-pulse" />
              </div>
              {/* tags row */}
              <div className="flex gap-2">
                {[72, 88, 64].map((w, i) => (
                  <div key={i} className="h-6 rounded-full bg-gray-100 animate-pulse" style={{ width: w }} />
                ))}
              </div>
              {/* trust badge */}
              <div className="h-8 rounded-xl bg-green-50 animate-pulse w-full" />
              {/* action buttons */}
              <div className="flex gap-3 pt-1">
                <div className="h-11 flex-1 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-11 flex-1 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-11 flex-1 rounded-xl bg-blue-100 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── not logged in (and not in demo) ── */
  if (!user && !isDemoMode) return null

  /* ── no own node ── */
  if (!authLoading && !myNodeId && !loading && profiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "#F4F1EA" }}>
        <Sparkles className="h-10 w-10 text-blue-700" />
        <h2 className="font-bold text-xl">Complete your profile first</h2>
        <p className="text-sm text-gray-500 max-w-xs">You need a biodata profile before you can browse matches.</p>
        <Link href="/biodata/setup">
          <Button style={{ background: "#1D4ED8", color: "#fff" }}>Set up my biodata</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F4F1EA" }}>
      {/* header */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-base" style={{ color: "#111827" }}>Find Matches</h1>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            {remaining.length > 0
              ? `${remaining.length} profiles available`
              : "All caught up"}
          </p>
        </div>
        {/* search toggle */}
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          aria-label={searchOpen ? "Close search" : "Search profiles"}
          onClick={() => { setSearchOpen(o => !o); if (searchOpen) { setSearchQuery(""); setSearchGotra(""); setSearchCity(""); setSearchAgeMin(""); setSearchAgeMax("") } }}
        >
          {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </Button>
        {/* inbox link */}
        <Link href="/matches/inbox">
          <Button variant="ghost" size="icon" className="h-8 w-8 relative" aria-label={`Introduction requests${inboxCount > 0 ? ` (${inboxCount} pending)` : ""}`}>
            <Inbox className="h-4 w-4" />
            {inboxCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{ background: "#DB2777", color: "#fff" }}
              >
                {inboxCount > 9 ? "9+" : inboxCount}
              </span>
            )}
          </Button>
        </Link>
      </header>

      {/* Demo mode conversion strip */}
      {isDemoMode && (
        <div
          className="shrink-0 border-b border-pink-100 px-4 sm:px-6 py-2.5 flex items-center gap-3"
          style={{ background: "linear-gradient(90deg, #FFF1F2, #FFF5F5)" }}
        >
          <Heart className="h-4 w-4 shrink-0 text-pink-500 fill-pink-500" />
          <p className="flex-1 text-[12px] text-pink-800 font-medium">
            Sign up free to express interest and connect with families
          </p>
          <Link href="/auth/signup">
            <button className="shrink-0 rounded-lg px-3 py-1 text-[11px] font-bold text-white transition-colors"
              style={{ background: "#DB2777" }}>
              Sign up free
            </button>
          </Link>
        </div>
      )}

      {/* Match strength strip — shown when trust score < 70 and not dismissed */}
      {FEATURE_FLAGS.enableTrustScore && trustScore !== null && trustScore < 70 && !trustDismissed && !searchOpen && (
        <div
          className="shrink-0 border-b border-amber-100 px-4 sm:px-6 py-2.5 flex items-center gap-3"
          style={{ background: "#FFFBEB" }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-1.5 rounded-full bg-amber-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${trustScore}%`, background: trustScore >= 50 ? "#D97706" : "#EF4444" }}
                />
              </div>
              <span className="text-[11px] font-bold text-amber-700 shrink-0">{trustScore}/100</span>
              <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 shrink-0">
                {trustScoreTierLabel(trustScore)}
              </span>
            </div>
            <p className="text-[11px] text-amber-800 truncate">
              {trustScore < 20
                ? "Unverified — add a photo and claim your profile to start getting matches"
                : trustScore < 40
                  ? "Basic profile — add gotra and birth year to improve match quality"
                  : "Boost visibility — complete your biodata to reach more families"}
            </p>
          </div>
          <Link href="/upgrade">
            <button
              className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-amber-800 border border-amber-300 bg-white hover:bg-amber-50 transition-colors"
            >
              Improve
            </button>
          </Link>
          <button
            onClick={() => setTrustDismissed(true)}
            className="shrink-0 text-amber-400 hover:text-amber-600 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* search panel */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 rounded-2xl px-4 py-3 flex items-start gap-3 shrink-0"
            style={{ background: "linear-gradient(135deg, #EDE9FE, #F5F3FF)", border: "1px solid #C4B5FD" }}
          >
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#7C3AED" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#5B21B6" }}>Welcome to Outverse!</p>
              <p className="text-xs mt-0.5" style={{ color: "#7C3AED" }}>
                Complete your biodata to unlock better matches and appear higher in search results.
              </p>
              <Link href="/biodata/setup" className="inline-block mt-1.5">
                <span className="text-xs font-bold underline" style={{ color: "#5B21B6" }}>Complete my profile →</span>
              </Link>
            </div>
            <button onClick={() => setShowWelcome(false)} className="shrink-0" style={{ color: "#7C3AED" }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* search panel */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-b border-gray-100 bg-white shrink-0"
          >
            <div className="px-4 sm:px-6 py-3 space-y-2.5">
              {/* name */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-[14px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {/* row 2 — gotra + city */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Gotra (e.g. Kashyap)"
                  value={searchGotra}
                  onChange={e => setSearchGotra(e.target.value)}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="City / place"
                  value={searchCity}
                  onChange={e => setSearchCity(e.target.value)}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {/* row 3 — age range */}
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-[12px] text-gray-500 shrink-0">Age:</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={searchAgeMin}
                  onChange={e => setSearchAgeMin(e.target.value)}
                  className="w-16 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[12px] text-gray-400">–</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={searchAgeMax}
                  onChange={e => setSearchAgeMax(e.target.value)}
                  className="w-16 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* search results */}
      {isSearchActive && (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 space-y-2">
          {searchLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Search className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">No profiles found. Try different filters.</p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-gray-400 font-medium pb-1">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
              {searchResults.map(p => (
                <SearchResultRow
                  key={p.id}
                  profile={p}
                  actioned={actioned.has(p.id)}
                  onConnect={() => setConnectTarget(p)}
                  onLike={async () => { await recordAction(p.id, "like"); setToast({ msg: "Liked!", type: "like" }) }}
                />
              ))}
            </>
          )}
        </div>
      )}
      {!isSearchActive && (
        <div className="flex-1 overflow-y-auto">
          {remaining.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-5 text-center p-6 max-w-sm mx-auto mt-8"
            >
              <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{ background: "#EFF6FF" }}>
                <Heart className="h-8 w-8" style={{ color: "#1D4ED8" }} />
              </div>
              <div>
                <h2 className="font-bold text-xl mb-1" style={{ color: "#111827" }}>You&apos;re all caught up!</h2>
                <p className="text-sm" style={{ color: "#6B7280" }}>
                  No new profiles right now. Grow your match pool by improving your profile or inviting family.
                </p>
              </div>
              <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left space-y-3">
                <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">Improve your match visibility</p>
                <div className="space-y-2">
                  {[
                    { label: "Upload your photo", href: "/biodata/setup", desc: "Required for match visibility", pts: "+15 pts" },
                    { label: "Invite your father to verify you", href: "/invite", desc: "Biggest trust boost available", pts: "+15 pts" },
                    { label: "Complete your biodata", href: "/biodata/setup", desc: "Add height, education, income", pts: "+15 pts" },
                    { label: "Add 3+ family members", href: "/dashboard", desc: "A larger tree = more trust", pts: "+10 pts" },
                  ].map(({ label, href, desc, pts }) => (
                    <Link key={href + label} href={href}
                      className="flex items-center gap-3 rounded-xl bg-white border border-amber-100 px-3 py-2.5 hover:border-amber-300 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800">{label}</p>
                        <p className="text-[11px] text-slate-500">{desc}</p>
                      </div>
                      <span className="text-[11px] font-bold text-amber-700 shrink-0">{pts}</span>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 w-full">
                <Link href="/invite" className="flex-1">
                  <Button variant="outline" className="w-full gap-2">
                    <Users className="h-4 w-4" /> Invite Family
                  </Button>
                </Link>
                <Button className="flex-1 gap-2" style={{ background: "#1D4ED8", color: "#fff" }} onClick={load}>
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
              </div>
            </motion.div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 space-y-3 pb-24">
              {remaining.map(profile => (
                <MatchListCard
                  key={profile.id}
                  profile={profile}
                  familyStats={familyStats.get(profile.family_id)}
                  compatScore={ownVector ? vectorCompatibility(ownVector, (profile as any).wealth_vector) : undefined}
                  onLike={() => handleLike(profile)}
                  onPass={() => handlePass(profile)}
                  onConnect={() => setConnectTarget(profile)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-sm font-semibold shadow-xl z-50 flex items-center gap-2"
            style={{
              background: toast.type === "like" ? "#EC4899" : toast.type === "connect" ? "#1D4ED8" : "#6B7280",
              color: "#fff",
            }}
          >
            {toast.type === "like" && <Heart className="h-4 w-4" />}
            {toast.type === "connect" && <Send className="h-4 w-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* connect dialog */}
      <AnimatePresence>
        {connectTarget && (
          <ConnectDialog
            profile={connectTarget}
            onSend={handleConnect}
            onClose={() => setConnectTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── match list card (reference-design style) ── */
function MatchListCard({
  profile,
  familyStats,
  compatScore,
  onLike,
  onPass,
  onConnect,
}: {
  profile: BiodataProfile
  familyStats?: { total: number; verified: number }
  compatScore?: number
  onLike: () => void
  onPass: () => void
  onConnect: () => void
}) {
  const age = profile.birth_year ? CURRENT_YEAR - profile.birth_year : null
  const initials = profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  const income = fmtIncome(profile.annual_income_range)
  const reasons = whyMatch(profile, familyStats)
  const filled = [profile.biodata_photo_url, profile.gotra, profile.birth_year, profile.occupation,
  profile.education_level, profile.current_place, profile.family_type, profile.religion].filter(Boolean).length
  const trustPct = Math.round((filled / 8) * 100)
  const isVerified = familyStats && familyStats.verified >= 1
  const isFamilyVerified = familyStats && familyStats.verified >= 2

  return (
    <div
      className="group premium-rise overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-0.5"
      style={{ background: "#FBF8F2", border: "1px solid rgba(76,60,40,0.10)", boxShadow: "0 2px 16px -6px rgba(76,60,40,0.20)" }}
    >
      <div className="flex">
        {/* Photo column */}
        <div
          className="shrink-0 relative"
          style={{ width: 108, minHeight: 208, background: "linear-gradient(150deg, #92400E, #D97706)" }}
        >
          {profile.biodata_photo_url ? (
            <img
              src={profile.biodata_photo_url}
              alt={profile.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-[28px] font-bold text-white/95">{initials}</span>
            </div>
          )}
          {/* legibility scrim for the verified pill */}
          {isVerified && (
            <>
              <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
                style={{ background: "linear-gradient(to top, rgba(20,12,4,0.55), transparent)" }} />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap"
                style={{ background: "#047857", color: "#fff", boxShadow: "0 2px 8px rgba(4,120,87,0.4)" }}>
                <ShieldCheck className="h-3 w-3 shrink-0" />
                Verified
              </div>
            </>
          )}
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0 p-4 space-y-2.5">
          {/* Name + hero verification */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display font-bold text-[17px] leading-tight" style={{ color: "#1B2230" }}>{profile.name}</h3>
              {isFamilyVerified && (
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold flex items-center gap-1"
                  style={{ background: "#ECFBF3", color: "#047857", border: "1px solid rgba(4,120,87,0.20)" }}>
                  <ShieldCheck className="h-3 w-3" />
                  Family Verified
                </span>
              )}
            </div>
            <p className="text-[12.5px] mt-1" style={{ color: "#57534E" }}>
              {[
                age ? `${age} yrs` : null,
                profile.height_cm ? fmtHeight(profile.height_cm) : null,
                profile.current_place,
              ].filter(Boolean).join(" · ")}
            </p>
            {familyStats && familyStats.total > 0 && (
              <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "#9C7A3C" }}>
                <Users className="h-3 w-3 shrink-0" />
                <span><span className="font-semibold">{familyStats.total}</span> in family tree · <span className="font-semibold">{familyStats.verified}</span> verified</span>
              </p>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {profile.education_level && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                style={{ background: "#EFF4FF", color: "#1D4ED8" }}>
                <GraduationCap className="h-3 w-3" />{fmtEdu(profile.education_level)}
              </span>
            )}
            {profile.occupation && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                style={{ background: "#ECFBF3", color: "#047857" }}>
                <Briefcase className="h-3 w-3" />{profile.occupation}
              </span>
            )}
            {income && (
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                style={{ background: "#FBF3E6", color: "#92400E" }}>
                {income}
              </span>
            )}
            {profile.religion && (
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                style={{ background: "#FBF0F5", color: "#9D174D" }}>
                {profile.religion}{profile.caste ? ` · ${profile.caste}` : ""}
              </span>
            )}
          </div>

          {/* Gotra + Trust + Lifestyle Compat */}
          <div className="flex items-center gap-3 flex-wrap">
            {profile.gotra && (
              <span className="text-[11.5px]" style={{ color: "#57534E" }}>
                Gotra: <span className="font-semibold" style={{ color: "#1B2230" }}>{profile.gotra}</span>
              </span>
            )}
            {profile.manglik !== null && profile.manglik !== undefined && (
              <span className="text-[11.5px]" style={{ color: "#57534E" }}>
                Manglik: {profile.manglik ? "Yes" : "No"}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2.5">
              {compatScore !== undefined && FEATURE_FLAGS.enableLifestyleIntelligence && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px]" style={{ color: "#9C9486" }}>Lifestyle</span>
                  <span className="font-display font-bold text-[15px]"
                    style={{ color: compatScore >= 75 ? "#7C3AED" : compatScore >= 55 ? "#047857" : "#B45309" }}>
                    {compatScore}%
                  </span>
                </div>
              )}
              {FEATURE_FLAGS.enableTrustScore && (() => {
                const tier = getAuraTier(trustPct)
                return (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: tier.bg,
                      color: tier.color,
                      border: `1px solid ${tier.border}`,
                      boxShadow: tier.glow,
                    }}
                  >
                    {tier.label}
                  </span>
                )
              })()}
            </div>
          </div>

          <div className="gold-hairline my-0.5" />

          {/* Why this match */}
          <div className="rounded-xl p-2.5" style={{ background: "#ECFBF3", border: "1px solid rgba(4,120,87,0.16)" }}>
            <p className="text-[9px] font-bold uppercase tracking-[0.06em] mb-1.5" style={{ color: "#047857" }}>Why this match?</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              {reasons.map(r => (
                <div key={r} className="flex items-center gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" style={{ color: "#047857" }} />
                  <span className="text-[10.5px] font-medium leading-tight" style={{ color: "#15603C" }}>{r}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 pt-0.5">
            <button onClick={onPass}
              className="rounded-xl px-3 py-2.5 text-[11.5px] font-medium transition-colors hover:bg-black/[0.04]"
              style={{ border: "1px solid rgba(76,60,40,0.16)", color: "#9C9486" }}>
              Skip
            </button>
            <button onClick={onConnect}
              className="flex-1 rounded-xl px-2 py-2.5 text-[11.5px] font-semibold transition-colors flex items-center justify-center gap-1"
              style={{ border: "1px solid rgba(29,78,216,0.28)", color: "#1D4ED8", background: "#F5F8FF" }}>
              <MessageCircle className="h-3.5 w-3.5" />Request Intro
            </button>
            <button onClick={onLike}
              className="flex-1 rounded-xl px-2 py-2.5 text-[11.5px] font-bold text-white transition-transform active:scale-[0.97] flex items-center justify-center gap-1"
              style={{ background: "#DB2777", boxShadow: "0 2px 10px -2px rgba(219,39,119,0.45)" }}>
              <Heart className="h-3.5 w-3.5 fill-current" />Interested
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── search result row ── */
function SearchResultRow({
  profile,
  actioned,
  onConnect,
  onLike,
}: {
  profile: BiodataProfile
  actioned: boolean
  onConnect: () => void
  onLike: () => void
}) {
  const age = profile.birth_year ? CURRENT_YEAR - profile.birth_year : null
  const initials = profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">
      {/* avatar */}
      <div
        className="h-12 w-12 shrink-0 rounded-xl flex items-center justify-center text-base font-bold"
        style={{ background: "#EFF6FF", color: "#1D4ED8" }}
      >
        {profile.biodata_photo_url ? (
          <img src={profile.biodata_photo_url} alt={profile.name} className="h-12 w-12 rounded-xl object-cover" />
        ) : initials}
      </div>
      {/* info */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-slate-900 truncate">
          {profile.name}{age ? `, ${age}` : ""}
        </p>
        <p className="text-[12px] text-slate-500 truncate">
          {[profile.gotra && `${profile.gotra} gotra`, profile.current_place, profile.occupation].filter(Boolean).join(" · ")}
        </p>
        {profile.education_level && (
          <p className="text-[11px] text-slate-400 truncate">{fmtEdu(profile.education_level)}</p>
        )}
      </div>
      {/* actions */}
      {actioned ? (
        <span className="text-[11px] font-medium text-gray-400 shrink-0">Sent</span>
      ) : (
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={onLike}
            className="h-8 w-8 rounded-xl flex items-center justify-center border border-pink-200 hover:bg-pink-50 transition-colors"
          >
            <Heart className="h-3.5 w-3.5 text-pink-500" />
          </button>
          <button
            onClick={onConnect}
            className="h-8 w-8 rounded-xl flex items-center justify-center border border-blue-200 hover:bg-blue-50 transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5 text-blue-600" />
          </button>
        </div>
      )}
    </div>
  )
}
