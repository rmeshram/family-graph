'use client'

import { redirect } from 'next/navigation'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Sparkles, Share2, CheckCircle2, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'

const LS_KEY = 'fg_lifestyle_vector'

const SLIDER_DEFS = [
  { key: 'comfort' as const, label: 'Living Comfort', low: 'Comfortable & cozy', high: 'Premium & curated', emoji: '🏠' },
  { key: 'travel' as const, label: 'Travel Lifestyle', low: 'Home is my center', high: 'Always exploring', emoji: '✈️' },
  { key: 'housing' as const, label: 'Housing Aspiration', low: 'Practical first', high: 'Dream home always', emoji: '🏡' },
  { key: 'spending' as const, label: 'Spending Style', low: 'Save & invest first', high: 'Experiences over saving', emoji: '💳' },
  { key: 'luxury' as const, label: 'Quality Preference', low: 'Value-driven choices', high: 'Premium quality matters', emoji: '✨' },
  { key: 'growth' as const, label: 'Financial Outlook', low: 'Stable & secure', high: 'Bold & growth-focused', emoji: '📈' },
]

type SliderKey = typeof SLIDER_DEFS[number]['key']
type SliderValues = Record<SliderKey, number>

const DEFAULT_VALUES: SliderValues = {
  comfort: 55, travel: 50, housing: 50, spending: 45, luxury: 45, growth: 60,
}

type Persona = {
  name: string
  tagline: string
  description: string
  color: string
  percentile: number
}

function computePersona(v: SliderValues): Persona {
  const vals = [v.comfort, v.travel, v.housing, v.spending, v.luxury, v.growth].map(x => x / 100)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const [, travel, , spending, luxury, growth] = vals

  if (mean >= 0.75) return {
    name: 'Urban Luxury Explorer',
    tagline: "You're in the top 8% lifestyle cluster",
    description: 'You curate premium experiences and invest in quality. Spaces, travel, and brands all tell your story.',
    color: '#7C3AED', percentile: 8,
  }
  if (mean >= 0.63 && travel >= 0.65) return {
    name: 'Premium Balanced',
    tagline: "You're in the top 18% lifestyle cluster",
    description: 'You balance aspirations with smart planning. Travel and new experiences matter deeply to you.',
    color: '#0EA5E9', percentile: 18,
  }
  if (mean >= 0.58 && luxury >= 0.6) return {
    name: 'Aspirational Builder',
    tagline: "You're in the top 24% lifestyle cluster",
    description: "You're building toward a premium lifestyle with clear goals. You know exactly where you're headed.",
    color: '#D97706', percentile: 24,
  }
  if (growth >= 0.68 && mean >= 0.45) return {
    name: 'Growth Optimizer',
    tagline: "You're in the top 32% lifestyle cluster",
    description: 'Financially strategic and growth-focused. You play the long game and invest aggressively.',
    color: '#059669', percentile: 32,
  }
  if (travel >= 0.62 && mean >= 0.42) return {
    name: 'Adventure Optimized',
    tagline: "You're in the top 38% lifestyle cluster",
    description: 'Experiences over possessions. You optimize for freedom, travel, and new perspectives.',
    color: '#DC2626', percentile: 38,
  }
  if (spending <= 0.35 && growth <= 0.35 && mean <= 0.42) return {
    name: 'Simple High-Saver',
    tagline: "You're in the top 55% lifestyle cluster",
    description: 'Stability and family come first. You build steady wealth and create lasting security.',
    color: '#6B7280', percentile: 55,
  }
  if (mean <= 0.38) return {
    name: 'Value-Smart Professional',
    tagline: "You're in the top 60% lifestyle cluster",
    description: 'You maximize value in every decision. Thoughtful, practical, and financially disciplined.',
    color: '#374151', percentile: 60,
  }
  if (luxury <= 0.5 && mean >= 0.45) return {
    name: 'Quiet Achiever',
    tagline: "You're in the top 42% lifestyle cluster",
    description: 'You live well without broadcasting it. Quality matters but you keep it understated.',
    color: '#8B5CF6', percentile: 42,
  }
  return {
    name: 'Premium Balanced',
    tagline: "You're in the top 28% lifestyle cluster",
    description: 'Thoughtful spending, curated experiences, and steady growth. You have a clear vision.',
    color: '#0EA5E9', percentile: 28,
  }
}

export default function LifestylePage() {
  if (!FEATURE_FLAGS.enableLifestyleIntelligence) redirect('/dashboard')

  const { user, profile } = useAuth()
  const supabase = createClient()

  const [values, setValues] = useState<SliderValues>(DEFAULT_VALUES)
  const [phase, setPhase] = useState<'quiz' | 'reveal'>('quiz')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) setValues(JSON.parse(stored))
    } catch { }
  }, [])

  const persona = computePersona(values)

  async function handleSave() {
    // Always persist locally
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(values))
      localStorage.setItem('fg_lifestyle_persona', persona.name)
    } catch { }

    // Persist to DB if signed in
    if (user && profile) {
      await (supabase.from('profiles') as any).update({
        wealth_vector: values,
        lifestyle_persona: persona.name,
      }).eq('id', (profile as any).id)
    }

    setSaved(true)
  }

  function handleShare() {
    const text = `I'm a "${persona.name}" — ${persona.tagline.toLowerCase()} on Outverse. Discover your lifestyle profile!`
    if (navigator.share) {
      navigator.share({ text, url: window.location.origin + '/lifestyle' }).catch(() => { })
    } else {
      navigator.clipboard.writeText(text).catch(() => { })
    }
  }

  return (
    <div className="min-h-full" style={{ background: '#F8F9FA' }}>
      <AnimatePresence mode="wait">

        {/* ── Phase 1: Sliders quiz ── */}
        {phase === 'quiz' && (
          <motion.div key="quiz" initial={{ opacity: 1 }} exit={{ opacity: 0, x: -30 }}
            className="max-w-4xl mx-auto px-4 py-6 pb-32 lg:pb-6">

            <div className="flex items-center gap-3 mb-6">
              <Link href="/matches">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="font-bold text-lg" style={{ color: '#111827' }}>Lifestyle Intelligence</h1>
                <p className="text-xs" style={{ color: '#6B7280' }}>Discover your lifestyle persona — shown to your matches</p>
              </div>
            </div>

            <div className="lg:grid lg:grid-cols-5 lg:gap-6">

              {/* sliders — 3/5 cols */}
              <div className="lg:col-span-3 space-y-3">
                {SLIDER_DEFS.map(({ key, label, low, high, emoji }) => (
                  <div key={key} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3"
                    style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.08)' }}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm" style={{ color: '#111827' }}>
                        {emoji} {label}
                      </span>
                      <span className="text-xs font-bold rounded-full px-2 py-0.5"
                        style={{ background: `${persona.color}15`, color: persona.color }}>
                        {values[key]}
                      </span>
                    </div>
                    <Slider
                      value={[values[key]]}
                      onValueChange={([val]) => setValues(prev => ({ ...prev, [key]: val }))}
                      min={0} max={100} step={5}
                    />
                    <div className="flex justify-between text-[10px]" style={{ color: '#9CA3AF' }}>
                      <span>{low}</span>
                      <span>{high}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* live persona preview — 2/5 cols, sticky on desktop */}
              <div className="lg:col-span-2 mt-4 lg:mt-0 lg:sticky lg:top-6 lg:self-start">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={persona.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-2xl p-5 space-y-4"
                    style={{
                      background: `linear-gradient(135deg, ${persona.color}12, ${persona.color}06)`,
                      border: `1.5px solid ${persona.color}30`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `${persona.color}20` }}>
                        <Sparkles className="h-5 w-5" style={{ color: persona.color }} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: persona.color }}>
                          Your persona
                        </p>
                        <p className="font-bold text-base leading-tight" style={{ color: '#111827' }}>
                          {persona.name}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed" style={{ color: '#4B5563' }}>
                      {persona.description}
                    </p>

                    <div className="rounded-xl px-3 py-2 text-[11px] font-semibold"
                      style={{ background: `${persona.color}18`, color: persona.color }}>
                      {persona.tagline}
                    </div>

                    {/* vector bars */}
                    <div className="space-y-1.5 pt-1">
                      {SLIDER_DEFS.map(({ key, emoji }) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[11px] w-4 shrink-0">{emoji}</span>
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: '#E5E7EB' }}>
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${values[key]}%`, background: persona.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>

                <Button
                  className="w-full mt-4 gap-2 font-semibold hidden lg:flex"
                  style={{ background: persona.color, color: '#fff' }}
                  onClick={() => setPhase('reveal')}
                >
                  <TrendingUp className="h-4 w-4" />
                  Reveal My Profile →
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Phase 2: Persona reveal ── */}
        {phase === 'reveal' && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
            style={{ background: `linear-gradient(160deg, ${persona.color}10 0%, #F8F9FA 50%)` }}
          >
            <div className="w-full max-w-sm space-y-5">

              {/* persona hero card */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.08 }}
                className="rounded-3xl p-7 text-center space-y-4"
                style={{
                  background: `linear-gradient(145deg, ${persona.color}, ${persona.color}CC)`,
                  boxShadow: `0 24px 60px -12px ${persona.color}60`,
                  color: '#fff',
                }}
              >
                <div className="h-20 w-20 rounded-full mx-auto flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest opacity-75 mb-2">
                    Your Lifestyle Persona
                  </p>
                  <h2 className="text-2xl font-bold leading-tight">{persona.name}</h2>
                </div>
                <div className="rounded-2xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <p className="text-sm font-semibold">{persona.tagline}</p>
                </div>
                <p className="text-sm opacity-90 leading-relaxed">{persona.description}</p>
              </motion.div>

              {/* stat row */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.22 }}
                className="grid grid-cols-3 gap-3"
              >
                {[
                  { label: 'Percentile', value: `Top ${persona.percentile}%` },
                  { label: 'Dimensions', value: '6 traits' },
                  { label: 'Visibility', value: 'Active' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl bg-white border border-gray-100 p-3 text-center"
                    style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.08)' }}>
                    <p className="font-bold text-sm" style={{ color: '#111827' }}>{value}</p>
                    <p className="text-[10px]" style={{ color: '#9CA3AF' }}>{label}</p>
                  </div>
                ))}
              </motion.div>

              {/* action buttons */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.34 }}
                className="flex gap-3"
              >
                <Button variant="outline" className="flex-1 gap-1.5" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                  Share Badge
                </Button>
                <Button
                  className="flex-1 gap-1.5"
                  style={{ background: persona.color, color: '#fff' }}
                  onClick={handleSave}
                  disabled={saved}
                >
                  {saved
                    ? <CheckCircle2 className="h-4 w-4" />
                    : <Sparkles className="h-4 w-4" />}
                  {saved ? 'Saved!' : 'Save to Profile'}
                </Button>
              </motion.div>

              <button
                onClick={() => { setPhase('quiz'); setSaved(false) }}
                className="w-full text-sm font-medium text-center py-2"
                style={{ color: '#9CA3AF' }}
              >
                ← Adjust sliders
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* mobile fixed reveal button (quiz phase only) */}
      {phase === 'quiz' && (
        <div className="lg:hidden fixed bottom-20 left-0 right-0 px-4 z-40">
          <Button
            className="w-full gap-2 font-semibold shadow-xl"
            style={{ background: persona.color, color: '#fff' }}
            onClick={() => setPhase('reveal')}
          >
            <TrendingUp className="h-4 w-4" />
            Reveal My Profile →
          </Button>
        </div>
      )}
    </div>
  )
}
