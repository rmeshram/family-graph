"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronRight, Sparkles, Check, ArrowRight, Menu, X,
  GitBranch, Camera, Mic, Globe, Brain, Lock, Search,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ─────────────────────────────────────────────────────── data ── */

const USE_CASES = [
  {
    emoji: "🔍",
    label: "Discover",
    title: "Find relatives you never knew existed",
    description:
      "Your extended family has hundreds of members. See the full graph — paternal, maternal, in-laws — mapped together. Find cousins in Canada, ancestors from the 1890s, and everyone in between.",
    bullets: ["Full paternal + maternal graph in one place", "Diaspora connections across countries", "AI relationship path: 'How am I related to Karan?'"],
    activeTabClass: "bg-indigo-600 text-white border-indigo-600",
    cardBorder: "border-indigo-100",
    cardBg: "bg-gradient-to-br from-indigo-50/60 to-white",
    bulletColor: "text-indigo-600",
  },
  {
    emoji: "💍",
    label: "Matrimony",
    title: "The smarter rishta conversation",
    description:
      "Before any match — know the full picture. Automatic gotra check, shared ancestry view, mutual family connections. Families walk in informed, not surprised.",
    bullets: ["Auto gotra compatibility check", "See if families already share ancestors", "Complete family tree visible before the meeting"],
    activeTabClass: "bg-rose-600 text-white border-rose-600",
    cardBorder: "border-rose-100",
    cardBg: "bg-gradient-to-br from-rose-50/60 to-white",
    bulletColor: "text-rose-600",
  },
  {
    emoji: "📖",
    label: "Legacy",
    title: "Preserve before it's too late",
    description:
      "Every elder who passes takes stories with them. Record voices now. AI transcribes in Hindi, Tamil, Telugu, Marathi. Photos tagged to people. Your family's memory — searchable forever.",
    bullets: ["Voice recording + AI transcription in Indian languages", "Photo albums per person & event", "Stories survive across generations"],
    activeTabClass: "bg-emerald-600 text-white border-emerald-600",
    cardBorder: "border-emerald-100",
    cardBg: "bg-gradient-to-br from-emerald-50/60 to-white",
    bulletColor: "text-emerald-600",
  },
]

const FEATURES = [
  {
    icon: GitBranch,
    title: "Interactive Family Graph",
    description: "Zoomable, pannable graph — not a boring static tree. Multi-branch support for paternal + maternal sides. Infinite depth.",
    badge: "Core",
    span: "lg:col-span-2",
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    icon: Brain,
    title: "AI Copilot",
    description: '"How am I related to Ramesh chacha\'s son?" Ask in plain Hindi or English. Answers in seconds.',
    badge: "AI",
    span: "",
    iconColor: "text-violet-600",
    iconBg: "bg-violet-50",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    icon: Lock,
    title: "Privacy-First",
    description: "Anonymous nodes, contact hiding, private branches. You control exactly who sees what.",
    badge: "Security",
    span: "",
    iconColor: "text-stone-600",
    iconBg: "bg-stone-100",
    badgeClass: "bg-stone-100 text-stone-700 border-stone-200",
  },
  {
    icon: Camera,
    title: "Memory Vault",
    description: "Upload photos per person. Albums per event. Tag members. Preserved forever.",
    badge: "Memory",
    span: "",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    icon: Mic,
    title: "Voice Stories",
    description: "Record elder stories. Auto-transcribe in Hindi, Tamil, Telugu, Marathi.",
    badge: "Legacy",
    span: "",
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    icon: Globe,
    title: "WhatsApp Viral Invite",
    description: "Share a link or QR. Each family member adds their branch. Tree grows itself.",
    badge: "Growth",
    span: "lg:col-span-2",
    iconColor: "text-teal-600",
    iconBg: "bg-teal-50",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
  },
]

const HOW_IT_WORKS = [
  { step: "01", title: "Start with yourself", description: "Name, birthplace, family name. 30 seconds.", icon: "👤" },
  { step: "02", title: "Add immediate family", description: "Parents, siblings, spouse. AI guides you through.", icon: "👨‍👩‍👧‍👦" },
  { step: "03", title: "Invite via WhatsApp", description: "Send a link. Each member adds their branch.", icon: "📱" },
  { step: "04", title: "Explore & discover", description: "Relationships, stories, connections, rishta context.", icon: "✨" },
]

export default function MarketingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeUseCase, setActiveUseCase] = useState(0)

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAF8] text-stone-900">

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#FAFAF8]/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/20">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="7" r="3" />
                  <circle cx="6" cy="17" r="2.5" />
                  <circle cx="18" cy="17" r="2.5" />
                  <path d="M12 10v3M8 14l-1.5 2M16 14l1.5 2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-900">Family Graph</span>
                <span className="hidden rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 sm:inline border border-indigo-200">
                  Early Access
                </span>
              </div>
            </div>

            <div className="hidden items-center gap-6 md:flex">
              <a href="#use-cases" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">Use Cases</a>
              <a href="#features" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">How it Works</a>
              <Link href="/auth/signin">
                <Button variant="ghost" size="sm" className="text-stone-600 hover:text-stone-900 hover:bg-stone-100">Sign In</Button>
              </Link>
              <Link href="/auth/signup">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm border-0">
                  Get Early Access
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>

            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-stone-500 hover:text-stone-900 transition-colors">
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-stone-200 bg-[#FAFAF8] px-4 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              <a href="#use-cases" className="text-sm text-stone-600" onClick={() => setMobileMenuOpen(false)}>Use Cases</a>
              <a href="#features" className="text-sm text-stone-600" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#how-it-works" className="text-sm text-stone-600" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
              <div className="flex gap-2 pt-2">
                <Link href="/auth/signin" className="flex-1">
                  <Button variant="outline" className="w-full border-stone-200 text-stone-700 hover:bg-stone-100">Sign In</Button>
                </Link>
                <Link href="/auth/signup" className="flex-1">
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white border-0">Get Access</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24">
        {/* soft warm ambient blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/3 h-[500px] w-[600px] rounded-full bg-indigo-100/60 blur-[120px]" />
          <div className="absolute top-20 right-0 h-64 w-64 rounded-full bg-amber-100/50 blur-[80px]" />
          <div className="absolute bottom-0 left-0 h-48 w-64 rounded-full bg-violet-100/40 blur-[80px]" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            India&apos;s first AI-powered family intelligence platform
          </div>

          <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-stone-900 sm:text-6xl lg:text-7xl">
            Your family has{" "}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 bg-clip-text text-transparent">hundreds</span>
            {" "}of members.
            <br />
            <span className="text-stone-400">Most are strangers to each other.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-500 leading-relaxed sm:text-xl">
            Map your entire family network. Discover lost relatives. Check gotra before a rishta. Preserve elder stories before they&apos;re gone. All in one living, growing graph.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="h-14 px-8 text-base bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 border-0 transition-all hover:shadow-indigo-500/30 hover:-translate-y-0.5">
                Build Your Family Tree — Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/dashboard?demo=1">
              <Button variant="outline" size="lg" className="h-14 px-8 text-base border-stone-300 text-stone-600 hover:text-stone-900 hover:bg-stone-100 hover:border-stone-400 transition-all">
                <Search className="mr-2 h-5 w-5" />
                See Live Demo
              </Button>
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-stone-400">
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" />Free forever · up to 50 members</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" />No credit card</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" />5-minute setup</span>
          </div>
        </div>

        {/* App preview — light UI mockup */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="rounded-2xl border border-stone-200 bg-white p-1.5 shadow-2xl shadow-stone-300/40">
            <div className="flex items-center gap-1.5 mb-2 px-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
              <div className="ml-2 flex-1 rounded bg-stone-100 h-5 px-2 flex items-center">
                <span className="text-[10px] text-stone-400">familygraph.app/dashboard</span>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-stone-100 bg-stone-50">
              <div className="grid grid-cols-4 gap-0 divide-x divide-stone-100 h-64 sm:h-80">
                {/* Sidebar */}
                <div className="col-span-1 bg-white p-3 hidden sm:block border-r border-stone-100">
                  <div className="space-y-1.5">
                    <div className="h-7 w-full rounded-lg bg-indigo-600 flex items-center px-2 gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-white/60" />
                      <div className="h-1.5 flex-1 rounded bg-white/40" />
                    </div>
                    {['bg-violet-100','bg-rose-100','bg-amber-100','bg-emerald-100','bg-teal-100'].map((bg, i) => (
                      <div key={i} className={`h-6 w-full rounded-lg ${bg} flex items-center px-2 gap-1.5`}>
                        <div className="h-2 w-2 rounded-full bg-stone-300" />
                        <div className="h-1.5 flex-1 rounded bg-stone-200" />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Graph canvas */}
                <div className="col-span-3 sm:col-span-2 relative overflow-hidden bg-[#F8F7F4]">
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 420 280" preserveAspectRatio="xMidYMid meet">
                    <line x1="100" y1="57" x2="60" y2="92" stroke="#6366F1" strokeWidth="1.5" opacity="0.25" />
                    <line x1="100" y1="57" x2="140" y2="92" stroke="#6366F1" strokeWidth="1.5" opacity="0.25" />
                    <line x1="320" y1="57" x2="280" y2="92" stroke="#7C3AED" strokeWidth="1.5" opacity="0.25" />
                    <line x1="320" y1="57" x2="360" y2="92" stroke="#7C3AED" strokeWidth="1.5" opacity="0.25" />
                    <line x1="60" y1="128" x2="100" y2="159" stroke="#6366F1" strokeWidth="1.5" opacity="0.25" />
                    <line x1="140" y1="128" x2="100" y2="159" stroke="#6366F1" strokeWidth="1.5" opacity="0.25" />
                    <line x1="100" y1="211" x2="210" y2="237" stroke="#F59E0B" strokeWidth="2" opacity="0.4" />
                    <line x1="320" y1="205" x2="210" y2="237" stroke="#F59E0B" strokeWidth="2" opacity="0.4" />
                    <line x1="100" y1="185" x2="320" y2="185" stroke="#F43F5E" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.3" />
                    <circle cx="100" cy="35" r="22" fill="#EEF2FF" stroke="#6366F1" strokeWidth="1.5" />
                    <circle cx="320" cy="35" r="22" fill="#F5F3FF" stroke="#7C3AED" strokeWidth="1.5" />
                    <circle cx="60" cy="110" r="18" fill="#EEF2FF" stroke="#6366F1" strokeWidth="1" />
                    <circle cx="140" cy="110" r="18" fill="#F5F3FF" stroke="#7C3AED" strokeWidth="1" />
                    <circle cx="280" cy="110" r="18" fill="#EEF2FF" stroke="#6366F1" strokeWidth="1" />
                    <circle cx="360" cy="110" r="18" fill="#F5F3FF" stroke="#7C3AED" strokeWidth="1" />
                    <circle cx="100" cy="185" r="28" fill="#6366F1" opacity="0.95" />
                    <circle cx="100" cy="185" r="32" fill="none" stroke="#6366F1" strokeWidth="1.5" opacity="0.2" />
                    <circle cx="320" cy="185" r="20" fill="#EEF2FF" stroke="#6366F1" strokeWidth="1" />
                    <circle cx="210" cy="255" r="18" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="2" />
                    <text x="100" y="189" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">YOU</text>
                    <text x="210" y="259" textAnchor="middle" fill="#92400E" fontSize="7.5" fontWeight="600">CHILD</text>
                    <text x="210" y="176" textAnchor="middle" fill="#F43F5E" fontSize="6.5" opacity="0.7">gotra check</text>
                  </svg>
                  <div className="absolute top-3 left-3 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-1 text-[9px] text-emerald-700 font-medium">
                    247 members mapped
                  </div>
                </div>
                {/* Right panel */}
                <div className="hidden sm:block col-span-1 bg-white p-3 border-l border-stone-100">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-600 font-bold">R</div>
                      <div className="space-y-1 flex-1">
                        <div className="h-2 w-full rounded bg-stone-200" />
                        <div className="h-1.5 w-2/3 rounded bg-stone-100" />
                      </div>
                    </div>
                    {[1, 0.7, 0.5].map((o, i) => (
                      <div key={i} className="h-1.5 rounded bg-stone-100" style={{ opacity: o, width: `${70 + i * 12}%` }} />
                    ))}
                    <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 mt-2">
                      <div className="text-[8px] text-indigo-600 font-semibold mb-1">AI Insight</div>
                      <div className="h-1.5 w-full rounded bg-indigo-100 mb-1" />
                      <div className="h-1.5 w-4/5 rounded bg-indigo-100/70" />
                    </div>
                    <div className="rounded-lg bg-rose-50 border border-rose-100 p-2">
                      <div className="text-[8px] text-rose-600 font-semibold mb-1">Gotra: Kashyap</div>
                      <div className="h-1.5 w-3/5 rounded bg-rose-100" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 h-16 w-2/3 bg-indigo-200/50 blur-2xl rounded-full" />
        </div>
      </section>

      {/* ── Feature strip ──────────────────────────────────────── */}
      <div className="border-y border-stone-200 bg-white py-4 overflow-hidden">
        <div className="flex items-center gap-6 justify-center flex-wrap px-4 text-sm text-stone-400">
          {[
            "🌳 Full family graph", "💍 Gotra compatibility", "🔍 Relationship finder",
            "🎙️ Voice story archive", "🤖 AI in Hindi & English", "📸 Photo per member",
            "🔗 WhatsApp invite", "🔒 Privacy controls", "🌏 Diaspora support",
          ].map((item) => (
            <span key={item} className="flex items-center gap-1.5 whitespace-nowrap hover:text-stone-600 transition-colors">{item}</span>
          ))}
        </div>
      </div>

      {/* ── 3 Use Cases ────────────────────────────────────────── */}
      <section id="use-cases" className="py-24 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-4 py-1.5 text-sm text-stone-500">
              Why families use Family Graph
            </div>
            <h2 className="text-3xl font-black sm:text-5xl text-stone-900">More than a family tree</h2>
            <p className="mt-4 text-lg text-stone-500 max-w-2xl mx-auto">
              Discovery, matrimony context, and legacy preservation — three problems no single app has solved together. Until now.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
            {USE_CASES.map((uc, i) => (
              <button
                key={i}
                onClick={() => setActiveUseCase(i)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium border transition-all duration-200",
                  activeUseCase === i
                    ? uc.activeTabClass
                    : "border-stone-200 text-stone-500 hover:text-stone-800 hover:border-stone-300 bg-white"
                )}
              >
                <span>{uc.emoji}</span>
                {uc.label}
              </button>
            ))}
          </div>

          {USE_CASES.map((uc, i) => (
            <div
              key={i}
              className={cn(
                "rounded-3xl border p-8 sm:p-12 transition-all duration-300",
                uc.cardBorder,
                uc.cardBg,
                activeUseCase === i ? "block" : "hidden"
              )}
            >
              <div className="grid gap-10 lg:grid-cols-2 items-center">
                <div>
                  <div className="text-5xl mb-4">{uc.emoji}</div>
                  <h3 className="text-2xl font-black sm:text-3xl text-stone-900">{uc.title}</h3>
                  <p className="mt-4 text-stone-500 leading-relaxed text-base">{uc.description}</p>
                  <ul className="mt-6 space-y-3">
                    {uc.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-3 text-sm">
                        <Check className={cn("h-4 w-4 shrink-0", uc.bulletColor)} />
                        <span className="text-stone-700">{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/auth/signup" className="mt-8 inline-block">
                    <Button className="bg-stone-900 text-white hover:bg-stone-800 font-semibold gap-2 transition-all hover:-translate-y-0.5">
                      Get Started Free <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white p-6 min-h-48 shadow-sm">
                  {i === 0 && (
                    <div className="space-y-3">
                      <div className="text-xs text-stone-400 font-mono mb-4">// AI finds the path</div>
                      {[
                        { q: "How am I related to Karan Mishra?", a: "Karan is your Mama ka beta — first cousin, maternal side. Your mother and his father are siblings." },
                        { q: "Do I have relatives in the US?", a: "Yes — 3 members: Amit (New Jersey), Priya (California), Rohan (Texas)." },
                      ].map((item, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex gap-2 justify-end">
                            <div className="rounded-xl rounded-tr-sm bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-stone-700 max-w-[80%]">{item.q}</div>
                          </div>
                          <div className="flex gap-2">
                            <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">🤖</div>
                            <div className="rounded-xl rounded-tl-sm bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-600 max-w-[80%]">{item.a}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {i === 1 && (
                    <div className="space-y-3">
                      <div className="text-xs text-stone-400 font-mono mb-4">// Rishta intel in seconds</div>
                      <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                        <div className="text-xs font-semibold text-rose-700 mb-3">Compatibility Check</div>
                        <div className="space-y-2">
                          {[
                            { label: "Your gotra (Paternal)", val: "Kashyap", ok: true },
                            { label: "Their gotra", val: "Vashishtha", ok: true },
                            { label: "Common ancestors (4 gen)", val: "None found", ok: true },
                            { label: "Shared connections", val: "2 mutual relatives", ok: null },
                          ].map((row) => (
                            <div key={row.label} className="flex items-center justify-between text-xs">
                              <span className="text-stone-500">{row.label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-stone-700">{row.val}</span>
                                <span className={row.ok === true ? "text-emerald-600" : row.ok === false ? "text-red-500" : "text-amber-500"}>
                                  {row.ok === true ? "✓" : row.ok === false ? "✗" : "ℹ"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-stone-400 text-center">Informational only · Not a matrimony platform</p>
                    </div>
                  )}
                  {i === 2 && (
                    <div className="space-y-3">
                      <div className="text-xs text-stone-400 font-mono mb-4">// Stories that survive</div>
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-lg">👴</div>
                          <div>
                            <div className="text-sm font-semibold text-stone-800">Ramesh Dada, 87</div>
                            <div className="text-xs text-stone-400">6 stories recorded · 4h 32min</div>
                          </div>
                        </div>
                        {["The partition story (1947)", "How I built our family home", "Your father's first day of school"].map((story) => (
                          <div key={story} className="flex items-center gap-2 py-1.5 border-t border-emerald-100">
                            <Mic className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span className="text-xs text-stone-600">{story}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 border-t border-stone-200">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-4 py-1.5 text-sm text-stone-500">
              Simple by Design
            </div>
            <h2 className="text-3xl font-black sm:text-4xl text-stone-900">Start in 4 steps. Done in a weekend.</h2>
            <p className="mt-3 text-stone-500">No tech knowledge required. Designed for every age.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="relative flex flex-col rounded-2xl border border-stone-200 bg-white p-6 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50/80 transition-all duration-200 hover:-translate-y-0.5">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="absolute -right-2 top-8 z-10 hidden h-4 w-4 rotate-45 border-r border-t border-stone-200 bg-white lg:block" />
                )}
                <span className="text-3xl mb-3">{step.icon}</span>
                <span className="text-[10px] font-mono font-bold text-stone-300 mb-1">{step.step}</span>
                <h3 className="font-semibold text-base text-stone-900">{step.title}</h3>
                <p className="mt-1.5 text-sm text-stone-500">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Bento ─────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 border-t border-stone-200 bg-stone-50/50">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm text-stone-500">
              Everything Your Family Needs
            </div>
            <h2 className="text-3xl font-black sm:text-4xl text-stone-900">Built for Indian families</h2>
            <p className="mt-3 text-stone-500">Gotra, joint family, Dada-Dadi/Nana-Nani, village-to-abroad migration. India-first by design.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-200/80 hover:border-stone-300",
                  feature.span
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", feature.iconBg)}>
                    <feature.icon className={cn("h-5 w-5", feature.iconColor)} />
                  </div>
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", feature.badgeClass)}>{feature.badge}</span>
                </div>
                <h3 className="font-semibold text-base text-stone-900">{feature.title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Section ─────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 border-t border-stone-200">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-8 sm:p-12 shadow-sm">
            <div className="grid gap-10 lg:grid-cols-2 items-center">
              <div>
                <Badge className="mb-4 border-violet-200 bg-violet-50 text-violet-700 font-medium">
                  <Brain className="mr-1.5 h-3 w-3" />
                  AI Copilot
                </Badge>
                <h2 className="text-3xl font-black sm:text-4xl text-stone-900">Ask anything about your family. In Hindi or English.</h2>
                <p className="mt-4 text-stone-500 leading-relaxed">
                  AI understands Indian family structures — Nana-Nani vs Dada-Dadi, joint family branches, gotra, village lineages. Traces 4-generation paths in seconds.
                </p>
                <div className="mt-6 space-y-2.5">
                  {[
                    { q: '"How am I related to Ramesh chacha\'s son?"', color: 'text-violet-600' },
                    { q: '"Is this rishta gotra-compatible for us?"', color: 'text-rose-600' },
                    { q: '"Tell me my family history from 1920"', color: 'text-indigo-600' },
                    { q: '"Add my maternal uncle Ashok to the tree"', color: 'text-emerald-600' },
                  ].map(item => (
                    <div key={item.q} className="flex items-start gap-2 rounded-xl bg-white border border-stone-200 px-3 py-2 shadow-sm">
                      <Sparkles className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", item.color)} />
                      <span className="text-sm text-stone-600">{item.q}</span>
                    </div>
                  ))}
                </div>
                <Link href="/auth/signup" className="mt-6 inline-block">
                  <Button className="bg-violet-600 hover:bg-violet-700 text-white gap-2 shadow-md shadow-violet-200 transition-all hover:-translate-y-0.5 border-0">
                    Try AI Copilot <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="relative">
                <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-lg shadow-stone-200/60">
                  <div className="space-y-3">
                    {[
                      { role: 'user', msg: 'Is there any gotra issue with the Sharma family rishta?' },
                      { role: 'ai', msg: "Your gotra is Kashyap (paternal). The Sharma family is Vashishtha. No conflict. I also found no common ancestors in the last 4 generations. You're clear to proceed." },
                    ].map((m, i) => (
                      <div key={i} className={cn("flex gap-2.5", m.role === 'user' && "flex-row-reverse")}>
                        <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                          m.role === 'ai' ? "bg-violet-100 text-violet-600" : "bg-orange-100 text-orange-600"
                        )}>
                          {m.role === 'ai' ? '🤖' : 'R'}
                        </div>
                        <div className={cn("rounded-xl px-3 py-2 text-xs max-w-[80%] leading-relaxed",
                          m.role === 'ai'
                            ? "bg-stone-50 border border-stone-200 text-stone-600"
                            : "bg-indigo-50 border border-indigo-100 text-stone-700"
                        )}>
                          {m.msg}
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-violet-100 flex items-center justify-center text-xs shrink-0">🤖</div>
                      <div className="flex items-center gap-1 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2">
                        {[0, 150, 300].map(d => (
                          <div key={d} className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 px-4 sm:px-6 border-t border-stone-200 bg-gradient-to-b from-white to-indigo-50/60">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-64 w-96 rounded-full bg-indigo-100/60 blur-[80px]" />
          <div className="absolute bottom-0 right-0 h-48 w-64 rounded-full bg-violet-100/40 blur-[80px]" />
        </div>
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="text-5xl mb-6">🌳</div>
          <h2 className="text-3xl font-black sm:text-5xl text-stone-900 leading-tight">
            Your family story is being written.
            <br />
            <span className="text-stone-400">Are you in it?</span>
          </h2>
          <p className="mt-6 text-lg text-stone-500 leading-relaxed max-w-xl mx-auto">
            Start today. Invite one family member this weekend. By next month, your entire family&apos;s history will be alive, searchable, and growing.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="h-14 px-10 text-base bg-stone-900 text-white hover:bg-stone-800 font-bold shadow-xl shadow-stone-300/50 transition-all hover:-translate-y-0.5 hover:shadow-stone-400/40 border-0">
                Build Your Family Tree — Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-stone-400">Free forever · Up to 50 members · No credit card · No download</p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 bg-white py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                <GitBranch className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-stone-800">Family Graph</span>
              <span className="text-xs text-stone-300">© 2026</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-stone-400">
              <a href="#" className="hover:text-stone-700 transition-colors">Privacy</a>
              <a href="#" className="hover:text-stone-700 transition-colors">Terms</a>
              <a href="#" className="hover:text-stone-700 transition-colors">Contact</a>
            </div>
            <div className="text-xs text-stone-400 flex items-center gap-1">
              <span>🇮🇳</span> Made with ❤️ for Indian families
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
