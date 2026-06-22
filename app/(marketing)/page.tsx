"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight, Check, Shield, Users, Menu, X,
  ChevronRight, Star, TreePine, Heart, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ─────────────────────────── animation presets ── */
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
}
const stagger = { show: { transition: { staggerChildren: 0.08 } } }

/* ─────────────────────────── static data ── */
const HOW_IT_WORKS = [
  {
    step: "01",
    icon: <TreePine className="h-5 w-5 text-blue-700" />,
    title: "Build your family tree",
    desc: "Add yourself, your parents, siblings. Invite family via WhatsApp. Takes 3 minutes.",
  },
  {
    step: "02",
    icon: <Sparkles className="h-5 w-5 text-amber-600" />,
    title: "Complete your biodata",
    desc: "Education, profession, gotra, preferences. AI fills in what it can — you review.",
  },
  {
    step: "03",
    icon: <Shield className="h-5 w-5 text-green-700" />,
    title: "Get verified matches",
    desc: "Every match shows their real family tree. No fake profiles. No surprises.",
  },
]

const TRUST_BADGES = [
  { icon: <Check className="h-3.5 w-3.5" />, label: "Free to start" },
  { icon: <Check className="h-3.5 w-3.5" />, label: "3-minute setup" },
  { icon: <Check className="h-3.5 w-3.5" />, label: "No credit card" },
]

const TESTIMONIALS = [
  {
    quote: "We found Priya's match through their family tree. We already knew the family from two degrees away — no surprises at all.",
    author: "Sunita Mehta",
    role: "Mother, Pune",
    initials: "SM",
    color: "bg-amber-100 text-amber-700",
  },
  {
    quote: "Finally — a platform where I can see the family behind the match, not just a profile with 3 photos and a WhatsApp number.",
    author: "Arjun Sharma",
    role: "Software Engineer, Bengaluru",
    initials: "AS",
    color: "bg-blue-100 text-blue-700",
  },
  {
    quote: "The gotra check alone saved us from an embarrassing situation. Every serious family should be on this.",
    author: "Ramesh Patel",
    role: "Father, Surat",
    initials: "RP",
    color: "bg-green-100 text-green-700",
  },
]

/* ─────────────────────────── sample match card ── */
function SampleMatchCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm max-w-sm w-full">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center text-2xl font-bold text-slate-400 shrink-0">
          P
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-slate-900">Priya Sharma, 27</span>
          </div>
          <p className="text-[13px] text-slate-500 mt-0.5">Software Engineer · Bengaluru</p>
          {/* Verified badge */}
          <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
            <Shield className="h-3 w-3" />
            Family Verified
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="my-3.5 border-t border-gray-100" />

      {/* Family trust signals */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-slate-500">Family members</span>
          <span className="font-medium text-slate-900">34 members · 7 verified</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-slate-500">Gotra</span>
          <span className="flex items-center gap-1 font-medium">
            <span className="text-amber-700">Vashishtha</span>
            <span className="text-green-700 text-[11px] font-semibold">· Compatible ✓</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-slate-500">Shared connections</span>
          <span className="font-medium text-slate-900">2 mutual relatives</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-slate-500">Parents in app</span>
          <span className="flex items-center gap-1 font-medium text-green-700">
            <Check className="h-3 w-3" /> Yes, both verified
          </span>
        </div>
      </div>

      {/* CTA row */}
      <div className="mt-4 flex gap-2">
        <button className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-gray-50 transition-colors">
          View tree
        </button>
        <button className="flex-1 rounded-xl bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white hover:bg-blue-800 transition-colors">
          Express interest
        </button>
      </div>

      <p className="mt-2.5 text-center text-[11px] text-slate-400">
        Sharma family · on platform since Jan 2025
      </p>
    </div>
  )
}

/* ─────────────────────────── phone input ── */
function PhoneInputHero() {
  const [phone, setPhone] = useState("")
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const encoded = phone.trim() ? `?phone=${encodeURIComponent(phone.trim())}` : ""
    router.push(`/auth/signin${encoded}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 w-full max-w-md mx-auto">
      <div className="relative flex-1">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-slate-400 select-none">+91</span>
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="Your mobile number"
          className="w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 py-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </div>
      <motion.button
        type="submit"
        whileTap={{ scale: 0.97 }}
        className="shrink-0 rounded-xl bg-blue-700 px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-800 active:bg-blue-900 transition-colors flex items-center justify-center gap-2"
      >
        Get started free
        <ArrowRight className="h-4 w-4" />
      </motion.button>
    </form>
  )
}

/* ─────────────────────────── page ── */
export default function MarketingPage() {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
    const errorCode = params.get("error_code") || hash.get("error_code")
    const errorParam = params.get("error") || hash.get("error")
    if (errorParam === "access_denied" && errorCode === "otp_expired") {
      router.replace("/auth/forgot-password?expired=1")
    }
  }, [])

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#F8F9FA", color: "#0F172A" }}>

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-700">
                <TreePine className="h-4.5 w-4.5 text-white" />
              </div>
              <span className="text-[15px] font-bold text-slate-900 tracking-tight">Outverse</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#how-it-works" className="text-[14px] text-slate-500 hover:text-slate-900 transition-colors">How it works</a>
              <a href="#why-different" className="text-[14px] text-slate-500 hover:text-slate-900 transition-colors">Why different</a>
              <Link href="/auth/signin" className="text-[14px] text-slate-500 hover:text-slate-900 transition-colors">
                Sign in
              </Link>
              <Link href="/auth/signup">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  className="rounded-xl bg-blue-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-800 transition-colors flex items-center gap-1.5"
                >
                  Get started free
                  <ChevronRight className="h-3.5 w-3.5" />
                </motion.button>
              </Link>
            </div>

            {/* Mobile menu toggle */}
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-slate-500 hover:text-slate-900">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-gray-100 bg-white px-4 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              <a href="#how-it-works" className="text-[14px] text-slate-600" onClick={() => setMobileOpen(false)}>How it works</a>
              <a href="#why-different" className="text-[14px] text-slate-600" onClick={() => setMobileOpen(false)}>Why different</a>
              <div className="flex gap-2 pt-1">
                <Link href="/auth/signin" className="flex-1">
                  <button className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-[14px] font-semibold text-slate-700">Sign in</button>
                </Link>
                <Link href="/auth/signup" className="flex-1">
                  <button className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-[14px] font-semibold text-white">Get started</button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="px-4 pt-16 pb-20 sm:pt-24 sm:pb-28 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="text-center"
          >
            {/* Badge */}
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-[13px] font-semibold text-amber-700 mb-6">
              <Heart className="h-3.5 w-3.5" />
              Trusted by 500+ families across India &amp; abroad
            </motion.div>

            {/* Headline */}
            <motion.h1 variants={fadeUp} className="text-[2.5rem] sm:text-[3.5rem] font-bold leading-[1.1] tracking-tight text-slate-900">
              Find matches your{" "}
              <span className="text-blue-700">family can trust</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p variants={fadeUp} className="mt-5 text-[17px] sm:text-[19px] leading-relaxed text-slate-500 max-w-2xl mx-auto">
              The only matrimony platform where every match comes with a verified family tree — not just a profile.
            </motion.p>

            {/* CTA */}
            <motion.div variants={fadeUp} className="mt-8">
              <PhoneInputHero />
            </motion.div>

            {/* Trust row */}
            <motion.div variants={fadeUp} className="mt-4 flex items-center justify-center gap-5 flex-wrap">
              {TRUST_BADGES.map(b => (
                <span key={b.label} className="flex items-center gap-1.5 text-[13px] text-slate-500">
                  <span className="text-green-700">{b.icon}</span>
                  {b.label}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Social proof strip ───────────────────────────────────────── */}
      <section className="border-y border-gray-200 bg-white py-5 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12">
            {[
              { val: "500+", label: "Families" },
              { val: "12,000+", label: "Members mapped" },
              { val: "94%", label: "Gotra accuracy" },
              { val: "3 min", label: "Avg setup time" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-[22px] font-bold text-slate-900">{s.val}</div>
                <div className="text-[12px] text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why different ─────────────────────────────────────────────── */}
      <section id="why-different" className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-[13px] font-semibold uppercase tracking-widest text-blue-700 mb-3">The difference</p>
              <h2 className="text-[1.875rem] sm:text-[2.25rem] font-bold text-slate-900">
                Every match comes with<br className="hidden sm:block" /> their family tree
              </h2>
              <p className="mt-3 text-[16px] text-slate-500 max-w-xl mx-auto">
                Shaadi.com gives you a profile. We give you a family — verified, connected, real.
              </p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-8 items-center">
              {/* Sample match card */}
              <motion.div variants={fadeUp} className="flex justify-center lg:justify-end">
                <SampleMatchCard />
              </motion.div>

              {/* Feature list */}
              <motion.div variants={stagger} className="space-y-5">
                {[
                  {
                    color: "bg-green-50 border-green-200",
                    icon: <Shield className="h-5 w-5 text-green-700" />,
                    title: "Family-verified profiles",
                    desc: "Real family members in the app, verified by phone OTP. Not self-reported. Not fake.",
                  },
                  {
                    color: "bg-amber-50 border-amber-200",
                    icon: <span className="text-[18px]">🔯</span>,
                    title: "Automatic gotra check",
                    desc: "Instant gotra compatibility — paternal and maternal. No awkward conversation needed.",
                  },
                  {
                    color: "bg-blue-50 border-blue-200",
                    icon: <Users className="h-5 w-5 text-blue-700" />,
                    title: "See mutual connections",
                    desc: "Know how you're already connected. \"Priya is your maternal uncle's neighbour's daughter.\"",
                  },
                  {
                    color: "bg-slate-50 border-gray-200",
                    icon: <TreePine className="h-5 w-5 text-slate-600" />,
                    title: "Browse their family tree",
                    desc: "See grandparents, siblings, occupations — before the first call. Families walk in informed.",
                  },
                ].map((f, i) => (
                  <motion.div key={i} variants={fadeUp} className={cn("flex gap-4 rounded-2xl border p-4", f.color)}>
                    <div className="mt-0.5 shrink-0">{f.icon}</div>
                    <div>
                      <p className="text-[14px] font-semibold text-slate-900">{f.title}</p>
                      <p className="text-[13px] text-slate-500 mt-0.5 leading-relaxed">{f.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-y border-gray-200 bg-white px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-[13px] font-semibold uppercase tracking-widest text-blue-700 mb-3">Simple by design</p>
              <h2 className="text-[1.875rem] sm:text-[2.25rem] font-bold text-slate-900">Up and running in 3 steps</h2>
              <p className="mt-3 text-[16px] text-slate-500">No tech knowledge. Works for every age group.</p>
            </motion.div>

            <div className="grid sm:grid-cols-3 gap-4">
              {HOW_IT_WORKS.map((step, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className="relative rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
                      {step.icon}
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-400">{step.step}</span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-[13px] text-slate-500 leading-relaxed">{step.desc}</p>
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div className="absolute -right-2 top-9 hidden sm:flex h-5 w-5 items-center justify-center">
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-[1.875rem] font-bold text-slate-900">Families trust us</h2>
            </motion.div>
            <div className="grid sm:grid-cols-3 gap-4">
              {TESTIMONIALS.map((t, i) => (
                <motion.div key={i} variants={fadeUp} className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-shadow">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }, (_, j) => (
                      <Star key={j} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-[13px] text-slate-600 leading-relaxed flex-1">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-2.5 pt-1 border-t border-gray-100">
                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0", t.color)}>
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900">{t.author}</p>
                      <p className="text-[11px] text-slate-500">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-200 bg-blue-700 px-4 py-20 sm:px-6">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.h2 variants={fadeUp} className="text-[1.875rem] sm:text-[2.25rem] font-bold text-white">
            Start building your family&apos;s future
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-3 text-[16px] text-blue-200">
            Free forever. No payment required to get started.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup">
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-[15px] font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
              >
                Get started free
                <ArrowRight className="h-4 w-4" />
              </motion.button>
            </Link>
            <Link href="/auth/signin">
              <button className="inline-flex items-center gap-2 rounded-xl border border-blue-500 px-7 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-800 transition-colors">
                Sign in
              </button>
            </Link>
          </motion.div>
          <motion.p variants={fadeUp} className="mt-4 text-[12px] text-blue-300">
            Already trusted by families in India, USA, UK, Canada &amp; Australia
          </motion.p>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 bg-white px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-5xl flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-700">
              <TreePine className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-[14px] font-bold text-slate-900">Outverse</span>
            <span className="text-[12px] text-slate-400">© 2026</span>
          </div>
          <div className="flex items-center gap-5 text-[13px] text-slate-500">
            <Link href="/legal" className="hover:text-slate-900 transition-colors">Privacy &amp; Legal</Link>
            <a href="mailto:hello@outverse.in" className="hover:text-slate-900 transition-colors">Contact</a>
          </div>
          <span className="text-[12px] text-slate-400">🇮🇳 Built for Indian families, everywhere</span>
        </div>
      </footer>

    </div>
  )
}
