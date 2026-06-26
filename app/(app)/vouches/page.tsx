'use client'

import { redirect } from 'next/navigation'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BadgeCheck, Plus, Send, X, CheckCircle2, Users } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'

const TRAITS = ['Honest', 'Responsible', 'Family-oriented', 'Stable', 'Social', 'Thoughtful', 'Caring'] as const
type Trait = typeof TRAITS[number]

interface VouchRecord {
  id: string
  by: string
  byInitials: string
  traits: Trait[]
  note: string | null
  time: string
}

const DEMO_VOUCHES: VouchRecord[] = [
  { id: '1', by: 'Priya Sharma', byInitials: 'PS', traits: ['Honest', 'Family-oriented', 'Caring'], note: "I've known them for 5 years — genuinely trustworthy.", time: '2 days ago' },
  { id: '2', by: 'Amit Verma', byInitials: 'AV', traits: ['Responsible', 'Stable'], note: null, time: '1 week ago' },
  { id: '3', by: 'Sunita Mehta', byInitials: 'SM', traits: ['Thoughtful', 'Social', 'Caring'], note: 'Very family-oriented, great person.', time: '2 weeks ago' },
]

const TRUST_LABELS = [
  { min: 0, max: 0, label: 'No vouches yet', color: '#9CA3AF' },
  { min: 1, max: 2, label: 'Getting verified', color: '#D97706' },
  { min: 3, max: 4, label: 'Socially verified', color: '#059669' },
  { min: 5, max: 99, label: 'Strong Social Trust', color: '#7C3AED' },
]

function getTrustInfo(count: number) {
  return TRUST_LABELS.find(t => count >= t.min && count <= t.max) ?? TRUST_LABELS[3]
}

function TrustRing({ count }: { count: number }) {
  const size = 88
  const strokeW = 7
  const r = (size - strokeW) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(count / 5, 1)
  const filled = pct * circ
  const { color } = getTrustInfo(count)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={strokeW} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeW}
          strokeLinecap="round" strokeDasharray={`${filled} ${circ - filled}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-xl leading-none" style={{ color }}>{count}</span>
        <span className="text-[9px] font-medium leading-none mt-0.5" style={{ color: '#9CA3AF' }}>vouches</span>
      </div>
    </div>
  )
}

function traitCount(vouches: VouchRecord[], trait: Trait): number {
  return vouches.filter(v => v.traits.includes(trait)).length
}

export default function VouchesPage() {
  if (!FEATURE_FLAGS.enableVouches) redirect('/dashboard')

  const { user, profile: authProfile, loading: authLoading } = useAuth()

  const [endorseFor, setEndorseFor] = useState<string | null>(null)
  const [endorseName, setEndorseName] = useState<string>('')
  const [vouches, setVouches] = useState<VouchRecord[]>([])
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestName, setRequestName] = useState('')
  const [requestPhone, setRequestPhone] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Endorser view state
  const [selectedTraits, setSelectedTraits] = useState<Set<Trait>>(new Set())
  const [endorseNote, setEndorseNote] = useState('')
  const [endorseSubmitted, setEndorseSubmitted] = useState(false)

  const isDemoMode = !authLoading && !user

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ef = params.get('endorse')
    const en = params.get('name')
    if (ef) { setEndorseFor(ef); setEndorseName(en ?? 'this person') }
  }, [])

  useEffect(() => {
    setVouches(isDemoMode ? DEMO_VOUCHES : DEMO_VOUCHES) // TODO: fetch from DB
  }, [isDemoMode])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const myNodeId = isDemoMode ? 'demo-node' : (authProfile as any)?.member_id ?? 'my-node'
  const myName = isDemoMode ? 'Your Profile' : (authProfile?.display_name ?? 'Your Profile')
  const traitInfo = getTrustInfo(vouches.length)

  // aggregate traits across all vouches
  const traitCounts = TRAITS.map(t => ({ trait: t, count: traitCount(vouches, t) }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)

  function handleSendRequest() {
    if (!requestName.trim()) return
    const vouchUrl = `${window.location.origin}/vouches?endorse=${myNodeId}&name=${encodeURIComponent(myName)}`
    const msg = `Hi ${requestName.trim()}, I'm on Outverse for matrimony. Could you vouch for my character? It takes 30 seconds: ${vouchUrl}`
    window.open(`https://wa.me/${requestPhone.replace(/\D/g, '') ? '91' + requestPhone.replace(/\D/g, '').slice(-10) : ''}?text=${encodeURIComponent(msg)}`, '_blank')
    setRequestSent(true)
    setToast(`Vouch request sent to ${requestName.trim()}!`)
    setTimeout(() => { setShowRequestForm(false); setRequestSent(false); setRequestName(''); setRequestPhone('') }, 1500)
  }

  function toggleTrait(t: Trait) {
    setSelectedTraits(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function handleSubmitEndorse() {
    if (selectedTraits.size === 0) return
    setEndorseSubmitted(true)
    setToast('Thank you! Your vouch has been recorded.')
  }

  /* ── Endorser view (when ?endorse= param is present) ── */
  if (endorseFor) {
    return (
      <div className="min-h-full" style={{ background: '#F8F9FA' }}>
        <div className="max-w-md mx-auto px-4 py-8 space-y-6">

          <div className="text-center space-y-2">
            <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center font-bold text-xl"
              style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)', color: '#fff' }}>
              {endorseName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <h1 className="font-bold text-xl" style={{ color: '#111827' }}>
              Vouch for {endorseName}
            </h1>
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Select the traits that best describe them
            </p>
          </div>

          {endorseSubmitted ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-3xl p-8 text-center space-y-3"
              style={{ background: '#D1FAE5', border: '1.5px solid #6EE7B7' }}
            >
              <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color: '#059669' }} />
              <p className="font-bold text-lg" style={{ color: '#065F46' }}>Vouch submitted!</p>
              <p className="text-sm" style={{ color: '#047857' }}>
                Your vouch for {endorseName} has been recorded. Thank you for strengthening their trust profile.
              </p>
            </motion.div>
          ) : (
            <>
              <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4"
                style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.08)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>
                  Choose traits (select all that apply)
                </p>
                <div className="flex flex-wrap gap-2">
                  {TRAITS.map(t => {
                    const sel = selectedTraits.has(t)
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTrait(t)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                        style={{
                          background: sel ? '#D97706' : '#F9FAFB',
                          color: sel ? '#fff' : '#374151',
                          border: sel ? '1.5px solid #B45309' : '1.5px solid #E5E7EB',
                        }}
                      >
                        {sel ? '✓ ' : ''}{t}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2"
                style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.08)' }}>
                <p className="text-xs font-semibold" style={{ color: '#6B7280' }}>
                  Add a note (optional)
                </p>
                <textarea
                  value={endorseNote}
                  onChange={e => setEndorseNote(e.target.value)}
                  placeholder="How do you know them? What makes them stand out?"
                  rows={3}
                  className="w-full text-sm resize-none outline-none"
                  style={{ color: '#111827' }}
                />
              </div>

              <Button
                className="w-full gap-2 font-semibold"
                style={{ background: '#D97706', color: '#fff' }}
                disabled={selectedTraits.size === 0}
                onClick={handleSubmitEndorse}
              >
                <CheckCircle2 className="h-4 w-4" />
                Submit Vouch for {endorseName}
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  /* ── My Vouches view ── */
  return (
    <div className="min-h-full" style={{ background: '#F8F9FA' }}>
      <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">

        {/* header */}
        <div className="flex items-center gap-3">
          <Link href="/biodata">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-bold text-lg" style={{ color: '#111827' }}>My Vouches</h1>
            <p className="text-xs" style={{ color: '#6B7280' }}>Social trust shown to potential matches</p>
          </div>
        </div>

        {/* trust ring card */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5"
          style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-5">
            <TrustRing count={vouches.length} />
            <div className="flex-1 space-y-2">
              <div>
                <p className="font-bold text-base" style={{ color: '#111827' }}>
                  {vouches.length} Vouch{vouches.length !== 1 ? 'es' : ''} Received
                </p>
                <p className="text-sm font-semibold" style={{ color: traitInfo.color }}>
                  {traitInfo.label}
                </p>
              </div>
              {traitCounts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {traitCounts.slice(0, 4).map(({ trait, count }) => (
                    <span key={trait}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: '#FEF3C7', color: '#92400E' }}>
                      {trait} ×{count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* request a vouch */}
        <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden"
          style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.08)' }}>
          <button
            onClick={() => setShowRequestForm(v => !v)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: '#FEF3C7' }}>
              <Plus className="h-4 w-4" style={{ color: '#D97706' }} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: '#111827' }}>Request a Vouch</p>
              <p className="text-xs" style={{ color: '#6B7280' }}>Send a WhatsApp request to someone who knows you</p>
            </div>
            <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: '#D97706' }} />
          </button>

          <AnimatePresence>
            {showRequestForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
                  <input
                    value={requestName}
                    onChange={e => setRequestName(e.target.value)}
                    placeholder="Their name"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    style={{ color: '#111827' }}
                  />
                  <input
                    value={requestPhone}
                    onChange={e => setRequestPhone(e.target.value)}
                    placeholder="Their phone number (optional)"
                    type="tel"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    style={{ color: '#111827' }}
                  />
                  {requestName.trim() && (
                    <div className="rounded-xl p-3 text-xs leading-relaxed"
                      style={{ background: '#F0FDF4', color: '#166534', borderLeft: '3px solid #86EFAC' }}>
                      <span className="font-semibold">Preview: </span>
                      Hi {requestName.trim()}, I'm on Outverse for matrimony. Could you vouch for my character? It takes 30 seconds.
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowRequestForm(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5"
                      style={{ background: '#25D366', color: '#fff' }}
                      disabled={!requestName.trim() || requestSent}
                      onClick={handleSendRequest}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {requestSent ? 'Sent!' : 'Send via WhatsApp'}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* vouch list */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide px-1" style={{ color: '#9CA3AF' }}>
            Received vouches
          </p>
          {vouches.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center"
              style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.08)' }}>
              <Users className="h-8 w-8 mx-auto mb-3" style={{ color: '#D1D5DB' }} />
              <p className="text-sm font-medium" style={{ color: '#6B7280' }}>No vouches yet</p>
              <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>Request your first vouch above</p>
            </div>
          ) : (
            vouches.map(v => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2.5"
                style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.06)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)', color: '#fff' }}>
                    {v.byInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: '#111827' }}>{v.by}</p>
                    <p className="text-[11px]" style={{ color: '#9CA3AF' }}>{v.time}</p>
                  </div>
                  <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: '#D97706' }} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {v.traits.map(t => (
                    <span key={t} className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: '#FEF3C7', color: '#92400E' }}>
                      {t}
                    </span>
                  ))}
                </div>
                {v.note && (
                  <p className="text-xs leading-relaxed rounded-xl px-3 py-2"
                    style={{ background: '#FAFAFA', color: '#4B5563', borderLeft: '2px solid #FDE68A' }}>
                    "{v.note}"
                  </p>
                )}
              </motion.div>
            ))
          )}
        </div>
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
            style={{ background: '#D97706', color: '#fff' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
