"use client"

import { redirect } from "next/navigation"
import { FEATURE_FLAGS } from "@/lib/feature-flags"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/hooks/use-auth"
import {
  ArrowLeft, Heart, MessageCircle, CheckCircle2,
  X, Users, GraduationCap, Briefcase, Loader2,
  RefreshCw, Send, Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { sampleInboxData, sampleMutualNodeIds, type DemoSenderProfile, type DemoReceivedInterest } from "@/lib/sample-data"

/* ── types (re-use demo types from sample-data) ── */
type SenderProfile = DemoSenderProfile
type ReceivedInterest = DemoReceivedInterest

type Tab = "requests" | "likes" | "mutual"

const CURRENT_YEAR = new Date().getFullYear()

function fmtEdu(level: string | null): string {
  if (!level) return ""
  return level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

/* ── avatar ── */
function Avatar({ profile, size = 48 }: { profile: SenderProfile; size?: number }) {
  const initials = profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  if (profile.biodata_photo_url) {
    return (
      <img
        src={profile.biodata_photo_url}
        alt={profile.name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: "2px solid #FDE68A" }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{
        width: size, height: size,
        background: "linear-gradient(135deg, #D97706, #F59E0B)",
        color: "#fff", fontSize: size * 0.3,
        border: "2px solid #FDE68A",
      }}
    >
      {initials}
    </div>
  )
}

/* ── profile mini-card ── */
function ProfileMeta({ profile }: { profile: SenderProfile }) {
  const age = profile.birth_year ? CURRENT_YEAR - profile.birth_year : null
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
      {age && <span className="text-xs" style={{ color: "#6B7280" }}>Age {age}</span>}
      {profile.gotra && (
        <span className="text-xs font-medium" style={{ color: "#B45309" }}>{profile.gotra} gotra</span>
      )}
      {profile.occupation && (
        <span className="text-xs flex items-center gap-0.5" style={{ color: "#6B7280" }}>
          <Briefcase className="h-3 w-3" /> {profile.occupation}
        </span>
      )}
      {profile.current_place && (
        <span className="text-xs" style={{ color: "#6B7280" }}>{profile.current_place}</span>
      )}
      {profile.education_level && (
        <span className="text-xs flex items-center gap-0.5" style={{ color: "#6B7280" }}>
          <GraduationCap className="h-3 w-3" /> {fmtEdu(profile.education_level)}
        </span>
      )}
    </div>
  )
}

/* ── main page ── */
export default function MatchesInboxPage() {
  if (!FEATURE_FLAGS.enableMatrimonyFeed) redirect("/dashboard")

  const { user, profile: authProfile, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [forceDemo, setForceDemo] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') setForceDemo(true)
  }, [])

  const [tab, setTab] = useState<Tab>("requests")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [myNodeId, setMyNodeId] = useState<string | null>(null)

  const [requests, setRequests] = useState<ReceivedInterest[]>([])
  const [likes, setLikes] = useState<ReceivedInterest[]>([])
  const [mutualIds, setMutualIds] = useState<Set<string>>(new Set())

  const [actioning, setActioning] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const isDemoMode = forceDemo || (!authLoading && !user)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const load = useCallback(async () => {
    /* demo mode — serve sample inbox data */
    if (isDemoMode) {
      setRequests(sampleInboxData.filter(r => r.action === "connect_request"))
      setLikes(sampleInboxData.filter(r => r.action === "like"))
      setMutualIds(sampleMutualNodeIds)
      setMyNodeId("demo-node")
      setLoading(false)
      return
    }
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const nodeId = authProfile?.member_id ?? null
      setMyNodeId(nodeId)
      if (!nodeId) { setLoading(false); return }

      /* received non-pass interests */
      const { data: received, error: recErr } = await (supabase
        .from("matrimony_interests") as any)
        .select("id, from_node_id, action, message, status, created_at")
        .eq("to_node_id", nodeId)
        .neq("action", "pass")
        .order("created_at", { ascending: false })
      if (recErr) throw recErr

      /* my sent non-pass interests (for mutual detection) */
      const { data: sent } = await (supabase
        .from("matrimony_interests") as any)
        .select("to_node_id")
        .eq("from_node_id", nodeId)
        .neq("action", "pass")
      const sentToIds = new Set<string>((sent ?? []).map((r: any) => r.to_node_id))

      /* fetch sender profiles */
      const senderIds: string[] = [...new Set<string>((received ?? []).map((r: any) => r.from_node_id as string))]
      let profileMap = new Map<string, SenderProfile>()
      if (senderIds.length > 0) {
        const { data: profiles } = await (supabase
          .from("family_members") as any)
          .select("id, name, birth_year, gotra, religion, occupation, current_place, biodata_photo_url, education_level, height_cm")
          .in("id", senderIds)
          ; (profiles ?? []).forEach((p: SenderProfile) => profileMap.set(p.id, p))
      }

      /* merge */
      const enriched: ReceivedInterest[] = (received ?? []).map((r: any) => ({
        ...r,
        profile: profileMap.get(r.from_node_id) ?? null,
      }))

      setRequests(enriched.filter(r => r.action === "connect_request"))
      setLikes(enriched.filter(r => r.action === "like"))
      setMutualIds(new Set(enriched.filter(r => sentToIds.has(r.from_node_id)).map(r => r.from_node_id)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load inbox")
    } finally {
      setLoading(false)
    }
  }, [user, authProfile?.member_id, isDemoMode, forceDemo])

  useEffect(() => { if (isDemoMode || !authLoading) load() }, [authLoading, isDemoMode, load])

  async function handleAction(interestId: string, status: "accepted" | "declined") {
    setActioning(interestId)
    if (isDemoMode) {
      // optimistic update in demo — no DB write
      setRequests(prev => prev.map(r => r.id === interestId ? { ...r, status } : r))
      setToast(status === "accepted" ? "Introduction accepted!" : "Declined")
      setActioning(null)
      return
    }
    const { error: err } = await (supabase
      .from("matrimony_interests") as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", interestId)
    if (!err) {
      setRequests(prev => prev.map(r => r.id === interestId ? { ...r, status } : r))
      setToast(status === "accepted" ? "Introduction accepted!" : "Declined")
    }
    setActioning(null)
  }

  /* ── derived ── */
  const mutual = likes.filter(r => r.from_node_id && mutualIds.has(r.from_node_id))
  const pendingRequests = requests.filter(r => r.status === "pending")
  const totalUnread = pendingRequests.length + likes.length

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "requests", label: "Connect Requests", count: pendingRequests.length || undefined },
    { id: "likes", label: "Liked You", count: likes.length || undefined },
    { id: "mutual", label: "Mutual", count: mutual.length || undefined },
  ]

  /* ── render ── */
  if ((authLoading && !isDemoMode) || loading) {
    return (
      <div className="flex flex-col h-full" style={{ background: "#F8F9FA" }}>
        {/* header skeleton */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 bg-white">
          <div className="h-6 w-28 rounded-lg bg-gray-200 animate-pulse" />
          <div className="flex-1" />
          <div className="h-6 w-20 rounded-full bg-gray-100 animate-pulse" />
        </div>
        {/* tab skeleton */}
        <div className="flex gap-1 px-4 pt-4 pb-2">
          {[96, 80, 72].map((w, i) => (
            <div key={i} className="h-8 rounded-full bg-gray-200 animate-pulse" style={{ width: w }} />
          ))}
        </div>
        {/* interest card skeletons */}
        <div className="flex-1 px-4 py-3 space-y-3 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 flex gap-4 overflow-hidden relative">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: `${i * 120}ms` }} />
              <div className="h-14 w-14 rounded-full bg-gray-200 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 py-0.5">
                <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-48 rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="flex gap-2 items-start shrink-0">
                <div className="h-8 w-20 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-8 w-20 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "#F8F9FA" }}>
        <p className="text-sm text-red-500">{error}</p>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F8F9FA" }}>
      {/* header */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <Link href="/matches">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-base" style={{ color: "#111827" }}>Inbox</h1>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            {totalUnread > 0 ? `${totalUnread} new` : "All caught up"}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      {/* tabs */}
      <div className="flex gap-1 px-4 pt-4 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.id
                ? "text-white"
                : "text-gray-500 bg-white border border-gray-200 hover:bg-gray-50"
            )}
            style={tab === t.id ? { background: "#1D4ED8" } : {}}
          >
            {t.label}
            {t.count != null && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                style={tab === t.id
                  ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                  : { background: "#EFF6FF", color: "#1D4ED8" }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <AnimatePresence mode="wait">
          {tab === "requests" && (
            <motion.div key="requests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {requests.length === 0 ? (
                <EmptyState icon={<MessageCircle className="h-8 w-8" />} title="No connect requests yet" sub="When someone sends you an introduction, it'll appear here." />
              ) : (
                requests.map(r => (
                  <RequestCard
                    key={r.id}
                    item={r}
                    actioning={actioning}
                    onAccept={() => handleAction(r.id, "accepted")}
                    onDecline={() => handleAction(r.id, "declined")}
                  />
                ))
              )}
            </motion.div>
          )}

          {tab === "likes" && (
            <motion.div key="likes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {likes.length === 0 ? (
                <EmptyState icon={<Heart className="h-8 w-8" />} title="No likes yet" sub="Profiles that liked you will appear here." />
              ) : (
                likes.map(r => (
                  <LikeCard key={r.id} item={r} isMutual={mutualIds.has(r.from_node_id)} />
                ))
              )}
            </motion.div>
          )}

          {tab === "mutual" && (
            <motion.div key="mutual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {mutual.length === 0 ? (
                <EmptyState icon={<Sparkles className="h-8 w-8" />} title="No mutual likes yet" sub="When you both like each other, it'll show up here as a match." />
              ) : (
                mutual.map(r => (
                  <MutualCard key={r.id} item={r} />
                ))
              )}
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
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-sm font-semibold shadow-xl z-50"
            style={{ background: "#1D4ED8", color: "#fff" }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── request card ── */
function RequestCard({
  item, actioning, onAccept, onDecline,
}: {
  item: ReceivedInterest
  actioning: string | null
  onAccept: () => void
  onDecline: () => void
}) {
  const p = item.profile
  const isPending = item.status === "pending"
  if (!p) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: "#fff",
        border: isPending ? "1.5px solid #BFDBFE" : "1px solid #E5E7EB",
        boxShadow: isPending ? "0 4px 20px -8px rgba(29,78,216,0.15)" : "none",
      }}
    >
      <div className="flex items-start gap-3">
        <Avatar profile={p} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm" style={{ color: "#111827" }}>{p.name}</p>
            {!isPending && (
              <span
                className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                style={{
                  background: item.status === "accepted" ? "#D1FAE5" : "#FEE2E2",
                  color: item.status === "accepted" ? "#065F46" : "#991B1B",
                }}
              >
                {item.status === "accepted" ? "Accepted" : "Declined"}
              </span>
            )}
          </div>
          <ProfileMeta profile={p} />
        </div>
      </div>

      {item.message && (
        <div
          className="rounded-xl px-3 py-2.5 text-sm leading-relaxed"
          style={{ background: "#F0F9FF", color: "#1E40AF", borderLeft: "3px solid #93C5FD" }}
        >
          &ldquo;{item.message}&rdquo;
        </div>
      )}

      {isPending && (
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 text-red-500 border-red-200 hover:bg-red-50"
            disabled={actioning === item.id}
            onClick={onDecline}
          >
            <X className="h-3.5 w-3.5" />
            Decline
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            style={{ background: "#1D4ED8", color: "#fff" }}
            disabled={actioning === item.id}
            onClick={onAccept}
          >
            {actioning === item.id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CheckCircle2 className="h-3.5 w-3.5" />}
            Accept
          </Button>
        </div>
      )}

      {item.status === "accepted" && (
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
          style={{ background: "#D1FAE5", color: "#065F46" }}
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Introduction accepted — a family admin will follow up via WhatsApp.
        </div>
      )}
    </motion.div>
  )
}

/* ── like card ── */
function LikeCard({ item, isMutual }: { item: ReceivedInterest; isMutual: boolean }) {
  const p = item.profile
  if (!p) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4"
      style={{
        background: "#fff",
        border: isMutual ? "1.5px solid #FBCFE8" : "1px solid #E5E7EB",
        boxShadow: isMutual ? "0 4px 20px -8px rgba(219,39,119,0.2)" : "none",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar profile={p} size={44} />
          <span
            className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center"
            style={{ background: "#DB2777", border: "2px solid #fff" }}
          >
            <Heart className="h-2.5 w-2.5 text-white" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm" style={{ color: "#111827" }}>{p.name}</p>
            {isMutual && (
              <span
                className="text-[10px] font-bold rounded-full px-2 py-0.5"
                style={{ background: "#FDF2F8", color: "#DB2777" }}
              >
                ✨ Mutual
              </span>
            )}
          </div>
          <ProfileMeta profile={p} />
        </div>
        <Link href="/matches">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-xs gap-1"
            style={{ borderColor: "#FBCFE8", color: "#DB2777" }}
          >
            <Heart className="h-3 w-3" />
            Like back
          </Button>
        </Link>
      </div>
    </motion.div>
  )
}

/* ── mutual card ── */
function MutualCard({ item }: { item: ReceivedInterest }) {
  const p = item.profile
  if (!p) return null
  const age = p.birth_year ? CURRENT_YEAR - p.birth_year : null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{
        border: "1.5px solid #FDE68A",
        boxShadow: "0 8px 30px -12px rgba(180,83,9,0.25)",
      }}
    >
      {/* saffron strip */}
      <div
        className="flex items-center gap-3 px-4 py-2"
        style={{ background: "linear-gradient(90deg, #B45309, #D97706)" }}
      >
        <Sparkles className="h-3.5 w-3.5 text-white shrink-0" />
        <p className="text-xs font-semibold text-white">You both liked each other</p>
      </div>
      <div className="p-4 bg-white flex items-center gap-3">
        <Avatar profile={p} size={48} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: "#111827" }}>{p.name}</p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            {age && <span className="text-xs" style={{ color: "#6B7280" }}>Age {age}</span>}
            {p.gotra && <span className="text-xs font-medium" style={{ color: "#B45309" }}>{p.gotra} gotra</span>}
            {p.current_place && <span className="text-xs" style={{ color: "#6B7280" }}>{p.current_place}</span>}
          </div>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5 text-xs"
          style={{ background: "#1D4ED8", color: "#fff" }}
          onClick={() => {
            const text = `Hi, we matched on Outverse! I'd love to connect — ${p.name}, ${p.current_place ?? ""}`
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")
          }}
        >
          <Send className="h-3 w-3" />
          Connect
        </Button>
      </div>
    </motion.div>
  )
}

/* ── empty state ── */
function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-3 text-center py-16 px-6"
    >
      <div
        className="h-16 w-16 rounded-full flex items-center justify-center"
        style={{ background: "#EFF6FF", color: "#1D4ED8" }}
      >
        {icon}
      </div>
      <p className="font-semibold text-sm" style={{ color: "#111827" }}>{title}</p>
      <p className="text-xs max-w-xs" style={{ color: "#9CA3AF" }}>{sub}</p>
    </motion.div>
  )
}
