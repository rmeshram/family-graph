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
  MapPin, Briefcase, GraduationCap, Users, CheckCircle2,
  Send, ChevronLeft, ChevronRight, RefreshCw, Loader2, Inbox,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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

function fmtIncome(range: string | null): string {
  if (!range) return ""
  return range.replace(/_/g, " ").replace("lakh", "L").replace("plus", "+").toUpperCase()
}

/* ── card animation variants ── */
const cardVariants = {
  enter: { x: 60, opacity: 0, scale: 0.97 },
  center: { x: 0, opacity: 1, scale: 1, transition: { duration: 0.32, ease: "easeOut" as const } },
  exit: (dir: 1 | -1) => ({
    x: dir * -80,
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.24, ease: "easeIn" as const },
  }),
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
        <h3 className="font-bold text-lg" style={{ color: "#111827" }}>
          Send introduction to {profile.name.split(" ")[0]}
        </h3>
        <p className="text-sm" style={{ color: "#6B7280" }}>
          A family admin will review and forward your introduction. No direct contact details shared.
        </p>
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Hi, I came across your profile on Outverse and would love to connect…"
          rows={4}
          className="w-full rounded-xl border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ borderColor: "#E5E7EB", color: "#111827" }}
          maxLength={500}
        />
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 gap-2"
            style={{ background: "#1D4ED8", color: "#fff" }}
            disabled={msg.trim().length < 10}
            onClick={() => onSend(msg.trim())}
          >
            <Send className="h-4 w-4" />
            Send
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
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') setForceDemo(true)
  }, [])

  const [profiles, setProfiles] = useState<BiodataProfile[]>([])
  const [actioned, setActioned] = useState<Set<string>>(new Set())
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectTarget, setConnectTarget] = useState<BiodataProfile | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "like" | "pass" | "connect" } | null>(null)
  const [myNodeId, setMyNodeId] = useState<string | null>(null)
  const [myGender, setMyGender] = useState<string | null>(null)
  const [inboxCount, setInboxCount] = useState(0)

  const isDemoMode = forceDemo || (!authLoading && !user)

  /* load profiles */
  const load = useCallback(async () => {
    /* demo mode — use sample data, no DB calls */
    if (isDemoMode) {
      setProfiles(sampleMatrimonyProfiles as unknown as BiodataProfile[])
      setMyNodeId("demo-node")
      setMyGender("male")
      setInboxCount(2)
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
      /* get caller's own node */
      const { data: myNode } = await supabase
        .from("family_members")
        .select("id, gender")
        .eq("id", authProfile?.member_id ?? "")
        .maybeSingle()

      const nodeId: string | null = myNode?.id ?? null
      const gender: string | null = (myNode as any)?.gender ?? null
      setMyNodeId(nodeId)
      setMyGender(gender)

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
      setActioned(actSet)

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
      // Fall back to demo profiles when DB has no other families with biodata yet
      setProfiles(dbProfiles.length > 0 ? dbProfiles : sampleMatrimonyProfiles as unknown as BiodataProfile[])
      setIdx(0)
    } catch (e: unknown) {
      // DB error (e.g. missing migration) — fall back to demo profiles
      console.warn("[matches] DB query failed, showing demo data:", e)
      setProfiles(sampleMatrimonyProfiles as unknown as BiodataProfile[])
      setIdx(0)
    } finally {
      setLoading(false)
    }
  }, [user, familyId, authProfile?.member_id, isDemoMode, forceDemo])

  useEffect(() => {
    if (isDemoMode || !authLoading) load()
  }, [authLoading, isDemoMode, load])

  /* dismiss toast */
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const remaining = profiles.filter(p => !actioned.has(p.id))
  const current = remaining[idx] ?? null

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

  function advance(toDir: 1 | -1 = 1) {
    setDir(toDir)
    setIdx(i => Math.min(i + 1, remaining.length))
  }

  async function handleLike() {
    if (!current) return
    await recordAction(current.id, "like")
    setToast({ msg: "Liked!", type: "like" })
    advance(1)
  }

  async function handlePass() {
    if (!current) return
    await recordAction(current.id, "pass")
    advance(-1)
  }

  async function handleConnect(msg: string) {
    if (!connectTarget) return
    await recordAction(connectTarget.id, "connect_request", msg)
    setConnectTarget(null)
    setToast({ msg: "Introduction sent!", type: "connect" })
    advance(1)
  }

  /* ── loading ── */
  if ((authLoading && !isDemoMode) || loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F8F9FA" }}>
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

  /* ── not logged in ── */
  if (!user) return null

  /* ── no own node ── */
  if (!authLoading && !myNodeId && !loading && profiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "#F8F9FA" }}>
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
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F8F9FA" }}>
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
              ? `${remaining.length} profiles · profile ${idx + 1} of ${remaining.length}`
              : "All caught up"}
          </p>
        </div>
        {remaining.length > 0 && (
          <div className="flex gap-1">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={idx === 0}
              onClick={() => { setDir(-1); setIdx(i => Math.max(0, i - 1)) }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={idx >= remaining.length - 1}
              onClick={() => { setDir(1); setIdx(i => Math.min(remaining.length - 1, i + 1)) }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        {/* inbox link */}
        <Link href="/matches/inbox">
          <Button variant="ghost" size="icon" className="h-8 w-8 relative">
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

      {/* card area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          {current ? (
            <motion.div
              key={current.id}
              custom={dir}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-sm"
            >
              <ProfileCard
                profile={current}
                onLike={handleLike}
                onPass={handlePass}
                onConnect={() => setConnectTarget(current)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-5 text-center p-6 max-w-xs"
            >
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center"
                style={{ background: "#EFF6FF" }}
              >
                <Heart className="h-8 w-8" style={{ color: "#1D4ED8" }} />
              </div>
              <div>
                <h2 className="font-bold text-xl mb-1" style={{ color: "#111827" }}>
                  You&apos;re all caught up!
                </h2>
                <p className="text-sm" style={{ color: "#6B7280" }}>
                  No new profiles right now. Invite family members to grow the network and find more matches.
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <Link href="/invite" className="flex-1">
                  <Button variant="outline" className="w-full gap-2">
                    <Users className="h-4 w-4" /> Invite Family
                  </Button>
                </Link>
                <Button
                  className="flex-1 gap-2"
                  style={{ background: "#1D4ED8", color: "#fff" }}
                  onClick={load}
                >
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
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

/* ── profile card ── */
function ProfileCard({
  profile,
  onLike,
  onPass,
  onConnect,
}: {
  profile: BiodataProfile
  onLike: () => void
  onPass: () => void
  onConnect: () => void
}) {
  const age = profile.birth_year ? CURRENT_YEAR - profile.birth_year : null
  const initials = profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background: "#FFFFFF",
        boxShadow: "0 20px 60px -20px rgba(29,78,216,0.18), 0 4px 16px -8px rgba(0,0,0,0.08)",
        border: "1px solid #E5E7EB",
      }}
    >
      {/* amber header */}
      <div
        className="relative flex flex-col items-center pt-8 pb-6 px-6"
        style={{ background: "linear-gradient(135deg, #B45309 0%, #D97706 50%, #F59E0B 100%)" }}
      >
        {/* Verified badge */}
        <div
          className="absolute top-3 right-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)" }}
        >
          <CheckCircle2 className="h-3 w-3" />
          Family Verified
        </div>

        {/* Avatar */}
        {profile.biodata_photo_url ? (
          <img
            src={profile.biodata_photo_url}
            alt={profile.name}
            className="h-24 w-24 rounded-full object-cover mb-3"
            style={{ border: "3px solid rgba(255,255,255,0.6)" }}
          />
        ) : (
          <div
            className="h-24 w-24 rounded-full flex items-center justify-center mb-3 text-3xl font-bold"
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "3px solid rgba(255,255,255,0.5)",
              color: "#fff",
            }}
          >
            {initials}
          </div>
        )}

        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "22px", fontWeight: 700, color: "#fff" }}>
          {profile.name}
        </h2>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px", marginTop: "3px" }}>
          {age ? `Age ${age}` : ""}
          {age && (profile.current_place || profile.current_country) ? " · " : ""}
          {profile.current_place ?? (profile.current_country !== "India" ? profile.current_country : "")}
        </p>

        {/* tags */}
        <div className="flex flex-wrap justify-center gap-2 mt-3">
          {profile.gotra && (
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              {profile.gotra} gotra
            </span>
          )}
          {profile.religion && (
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              {profile.religion}
            </span>
          )}
          {profile.residency_status && profile.residency_status !== "indian_citizen" && (
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              NRI
            </span>
          )}
        </div>
      </div>

      {/* details */}
      <div className="px-6 py-5 space-y-3" style={{ background: "#FFFBF2" }}>
        <div className="grid grid-cols-2 gap-3">
          {profile.education_level && (
            <Chip icon={<GraduationCap className="h-3.5 w-3.5" />} label={fmtEdu(profile.education_level)} />
          )}
          {profile.occupation && (
            <Chip icon={<Briefcase className="h-3.5 w-3.5" />} label={profile.occupation} />
          )}
          {profile.height_cm && (
            <Chip icon={<span className="text-[10px] font-bold">H</span>} label={fmtHeight(profile.height_cm)} />
          )}
          {profile.annual_income_range && (
            <Chip icon={<span className="text-[10px] font-bold">₹</span>} label={fmtIncome(profile.annual_income_range)} />
          )}
          {profile.family_type && (
            <Chip icon={<Users className="h-3.5 w-3.5" />} label={profile.family_type === "joint" ? "Joint family" : "Nuclear family"} />
          )}
          {profile.marital_status && profile.marital_status !== "never_married" && (
            <Chip icon={<Heart className="h-3.5 w-3.5" />} label={profile.marital_status.replace(/_/g, " ")} />
          )}
        </div>

        {profile.partner_expectations && (
          <p
            className="text-xs leading-relaxed line-clamp-2 pt-1"
            style={{ color: "#6B7280" }}
          >
            &ldquo;{profile.partner_expectations}&rdquo;
          </p>
        )}

        {/* Trust / profile-strength badge — SPEC §5.3 */}
        {FEATURE_FLAGS.enableTrustScore && (() => {
          const filled = [
            profile.biodata_photo_url,
            profile.gotra,
            profile.birth_year,
            profile.occupation,
            profile.education_level,
            profile.annual_income_range,
            profile.current_place,
            profile.family_type,
          ].filter(Boolean).length
          if (filled < 3) return null
          const high = filled >= 6
          return (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${high ? 'bg-green-50' : 'bg-amber-50'}`}>
              <CheckCircle2 className={`h-4 w-4 shrink-0 ${high ? 'text-green-600' : 'text-amber-600'}`} />
              <span className={`text-xs font-semibold ${high ? 'text-green-700' : 'text-amber-700'}`}>
                {high ? 'Verified profile · Family-backed' : 'Profile complete'}
              </span>
              <span className={`ml-auto text-[10px] font-bold ${high ? 'text-green-600' : 'text-amber-600'}`}>
                {Math.round((filled / 8) * 100)}%
              </span>
            </div>
          )
        })()}
      </div>

      {/* action bar */}
      <div
        className="flex items-center gap-3 px-6 pb-6 pt-2"
        style={{ background: "#FFFBF2" }}
      >
        {/* pass */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onPass}
          className="flex-1 flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold transition-colors hover:bg-gray-100"
          style={{ color: "#9CA3AF", border: "1.5px solid #E5E7EB", background: "#fff" }}
        >
          <X className="h-5 w-5" />
          Pass
        </motion.button>

        {/* connect */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onConnect}
          className="flex-1 flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold transition-colors hover:bg-blue-50"
          style={{ color: "#1D4ED8", border: "1.5px solid #BFDBFE", background: "#EFF6FF" }}
        >
          <MessageCircle className="h-5 w-5" />
          Connect
        </motion.button>

        {/* like */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onLike}
          className="flex-1 flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold transition-colors hover:bg-pink-50"
          style={{ color: "#DB2777", border: "1.5px solid #FBCFE8", background: "#FDF2F8" }}
        >
          <Heart className="h-5 w-5" />
          Like
        </motion.button>
      </div>
    </div>
  )
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
      style={{ background: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 500 }}
    >
      <span style={{ color: "#B45309" }}>{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  )
}
