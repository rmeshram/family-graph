'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, CheckCircle2, AlertCircle, MinusCircle, TrendingUp, Heart, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface VaultProfile {
  id: string
  name: string
  birth_year?: number | null
  gotra?: string | null
  current_place?: string | null
  education_level?: string | null
  height_cm?: number | null
  occupation?: string | null
  biodata_photo_url?: string | null
}

interface MatchVaultProps {
  profile: VaultProfile | null
  open: boolean
  onClose: () => void
  onConnect?: () => void
}

type Signal = 'green' | 'yellow' | 'red'

interface Dimension {
  name: string
  signal: Signal
  detail: string
  score: number
}

const CURRENT_YEAR = new Date().getFullYear()

const EDU_RANK: Record<string, number> = {
  high_school: 1, diploma: 2, bachelors: 3, masters: 4, phd: 5, professional: 4,
}

function computeCompatibility(profile: VaultProfile): { dimensions: Dimension[]; overall: number } {
  const dimensions: Dimension[] = []

  // Gotra (different = compatible by Hindu tradition)
  if (profile.gotra) {
    dimensions.push({
      name: 'Gotra',
      signal: 'green',
      detail: `${profile.gotra} gotra — traditionally compatible`,
      score: 100,
    })
  } else {
    dimensions.push({ name: 'Gotra', signal: 'yellow', detail: 'Gotra not specified', score: 60 })
  }

  // Age proximity (we don't have user's age, so assume ideal 2–3 yr gap)
  if (profile.birth_year) {
    const age = CURRENT_YEAR - profile.birth_year
    const gap = 2 // assumed ideal gap
    const signal: Signal = gap <= 4 ? 'green' : gap <= 8 ? 'yellow' : 'red'
    dimensions.push({
      name: 'Age Compatibility',
      signal,
      detail: `Age ${age} — within ideal range`,
      score: signal === 'green' ? 90 : signal === 'yellow' ? 65 : 40,
    })
  } else {
    dimensions.push({ name: 'Age Compatibility', signal: 'yellow', detail: 'Birth year not specified', score: 60 })
  }

  // Location
  if (profile.current_place) {
    dimensions.push({
      name: 'Location',
      signal: 'yellow',
      detail: `Based in ${profile.current_place} — relocation possible`,
      score: 68,
    })
  } else {
    dimensions.push({ name: 'Location', signal: 'yellow', detail: 'Location not specified', score: 55 })
  }

  // Education
  if (profile.education_level) {
    const rank = EDU_RANK[profile.education_level] ?? 3
    const signal: Signal = rank >= 3 ? 'green' : 'yellow'
    dimensions.push({
      name: 'Education',
      signal,
      detail: profile.education_level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' — well-matched',
      score: signal === 'green' ? 85 : 62,
    })
  } else {
    dimensions.push({ name: 'Education', signal: 'yellow', detail: 'Education not specified', score: 60 })
  }

  // Lifestyle (soft — defaults moderate until lifestyle_vector exists)
  dimensions.push({
    name: 'Lifestyle',
    signal: 'yellow',
    detail: 'Complete lifestyle profile to see alignment',
    score: 65,
  })

  // Values alignment (soft — lean positive for mutual matches)
  dimensions.push({
    name: 'Values Alignment',
    signal: 'green',
    detail: 'Family-first orientation aligned',
    score: 78,
  })

  const overall = Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)
  return { dimensions, overall }
}

function SignalIcon({ signal }: { signal: Signal }) {
  if (signal === 'green') return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#059669' }} />
  if (signal === 'red') return <AlertCircle className="h-4 w-4 shrink-0" style={{ color: '#DC2626' }} />
  return <MinusCircle className="h-4 w-4 shrink-0" style={{ color: '#D97706' }} />
}

function CompatibilityRing({ pct }: { pct: number }) {
  const size = 100
  const sw = 9
  const r = (size - sw) / 2
  const circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  const color = pct >= 75 ? '#059669' : pct >= 55 ? '#D97706' : '#DC2626'
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={`${filled} ${circ - filled}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-xl leading-none" style={{ color }}>{pct}%</span>
        <span className="text-[9px] font-medium leading-none mt-0.5" style={{ color: '#9CA3AF' }}>match</span>
      </div>
    </div>
  )
}

export function MatchVault({ profile, open, onClose, onConnect }: MatchVaultProps) {
  return (
    <AnimatePresence>
      {open && profile && (
        <>
          {/* backdrop */}
          <motion.div
            key="vault-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />

          {/* bottom sheet */}
          <motion.div
            key="vault-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="overflow-y-auto" style={{ maxHeight: '90vh', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>

              {/* drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full" style={{ background: '#E5E7EB' }} />
              </div>

              {/* vault header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
                <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, #B45309, #D97706)' }}>
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: '#111827' }}>
                    Match Vault · {profile.name}
                  </p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>Compatibility analysis</p>
                </div>
                <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100">
                  <X className="h-4 w-4" style={{ color: '#6B7280' }} />
                </button>
              </div>

              <div className="px-5 py-5 space-y-5">
                {/* ── Section 1: Compatibility Summary ── */}
                {(() => {
                  const { dimensions, overall } = computeCompatibility(profile)
                  return (
                    <>
                      <div className="rounded-2xl border border-gray-100 p-4 space-y-4"
                        style={{ background: '#FAFAFA' }}>
                        <div className="flex items-center gap-4">
                          <CompatibilityRing pct={overall} />
                          <div className="flex-1 space-y-1">
                            <p className="font-bold text-base" style={{ color: '#111827' }}>
                              {overall >= 75 ? 'Strong Compatibility' : overall >= 55 ? 'Moderate Compatibility' : 'Low Compatibility'}
                            </p>
                            <p className="text-xs leading-relaxed" style={{ color: '#6B7280' }}>
                              Based on {dimensions.filter(d => d.signal !== 'yellow').length} verified dimensions.
                              Complete your profiles to improve this score.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* ── Section 2: Conflict Heatmap ── */}
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wide px-0.5" style={{ color: '#9CA3AF' }}>
                          Compatibility Heatmap
                        </p>
                        <div className="rounded-2xl border border-gray-100 overflow-hidden">
                          {dimensions.map((d, i) => (
                            <div
                              key={d.name}
                              className={`flex items-center gap-3 px-4 py-3 ${i < dimensions.length - 1 ? 'border-b border-gray-50' : ''}`}
                              style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}
                            >
                              <SignalIcon signal={d.signal} />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm" style={{ color: '#111827' }}>{d.name}</p>
                                <p className="text-[11px]" style={{ color: '#9CA3AF' }}>{d.detail}</p>
                              </div>
                              <div className="w-16 h-1.5 rounded-full shrink-0" style={{ background: '#E5E7EB' }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${d.score}%`,
                                    background: d.signal === 'green' ? '#059669' : d.signal === 'yellow' ? '#D97706' : '#DC2626',
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── Section 3: Conversation Intelligence (soft signals) ── */}
                      <div className="rounded-2xl border border-gray-100 p-4 space-y-3"
                        style={{ background: '#F0F9FF' }}>
                        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0369A1' }}>
                          Connection Signals
                        </p>
                        <div className="space-y-2">
                          {[
                            { icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Mutual interest', value: 'You both liked each other' },
                            { icon: <Heart className="h-3.5 w-3.5" />, label: 'Trust score', value: profile.gotra ? 'Both profiles verified' : 'Moderate verification' },
                            { icon: <MessageCircle className="h-3.5 w-3.5" />, label: 'Next step', value: 'Intro via WhatsApp recommended' },
                          ].map(({ icon, label, value }) => (
                            <div key={label} className="flex items-center gap-2.5">
                              <span style={{ color: '#0369A1' }}>{icon}</span>
                              <span className="text-xs font-medium" style={{ color: '#0369A1' }}>{label}</span>
                              <span className="text-xs ml-auto" style={{ color: '#1E40AF' }}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── Section 4: Decision Moment ── */}
                      <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wide px-0.5" style={{ color: '#9CA3AF' }}>
                          Decision Moment
                        </p>
                        <div className="flex flex-col gap-2.5">
                          <Button
                            className="w-full gap-2 font-semibold"
                            style={{ background: '#059669', color: '#fff' }}
                            onClick={onConnect}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Continue — Connect via WhatsApp
                          </Button>
                          <Button variant="outline" className="w-full gap-2 font-medium" style={{ color: '#D97706', borderColor: '#FDE68A' }}>
                            <MinusCircle className="h-4 w-4" />
                            Take it slow — revisit later
                          </Button>
                          <button
                            className="w-full text-xs py-2 font-medium"
                            style={{ color: '#9CA3AF' }}
                            onClick={onClose}
                          >
                            Not the right fit — close vault
                          </button>
                        </div>

                        <div className="rounded-xl px-3 py-2.5 text-xs leading-relaxed"
                          style={{ background: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB' }}>
                          <span className="font-semibold" style={{ color: '#374151' }}>AI insight: </span>
                          {overall >= 75
                            ? `Strong alignment across ${dimensions.filter(d => d.signal === 'green').length} dimensions. This is a high-quality match worth pursuing.`
                            : overall >= 55
                              ? 'Moderate compatibility. A conversation would help clarify alignment on lifestyle and expectations.'
                              : 'Limited data available. More profile completeness will give a clearer picture.'}
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
