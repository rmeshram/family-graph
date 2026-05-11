"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronRight, Sparkles, Users, BookOpen, Share2, Shield, Zap,
  Check, Star, ArrowRight, Menu, X, GitBranch, Camera, Mic,
  Globe, QrCode, MessageCircle, Brain, Clock, Map, Crown,
  Heart, Flower, TrendingUp
} from "lucide-react"
import { cn } from "@/lib/utils"

const FEATURES = [
  {
    icon: GitBranch,
    title: "Interactive Family Graph",
    description: "Zoomable, pannable graph — not a boring static tree. Multi-branch support for paternal + maternal sides with infinite depth.",
    color: "from-primary/20 to-secondary/20 border-primary/30",
    badge: "Core",
  },
  {
    icon: Brain,
    title: "AI Family Copilot",
    description: '"How am I related to Ramesh?" Ask in plain Hindi or English. AI finds relationship paths, generates stories, and explains lineage.',
    color: "from-violet-600/20 to-purple-600/20 border-violet-500/30",
    badge: "AI",
  },
  {
    icon: Camera,
    title: "Memory Vault",
    description: "Upload photos per person. Albums per family branch. Tag members in events — Diwali, weddings, graduations. Preserve forever.",
    color: "from-amber-600/20 to-orange-600/20 border-amber-500/30",
    badge: "Memory",
  },
  {
    icon: Mic,
    title: "Voice Story Archive",
    description: "Record elder stories before they're lost. Auto-transcribe in Hindi, Tamil, Telugu. AI translates to English for younger generations.",
    color: "from-green-600/20 to-emerald-600/20 border-green-500/30",
    badge: "Legacy",
  },
  {
    icon: QrCode,
    title: "WhatsApp Viral Invite",
    description: "Share a link or QR code. Family joins in one tap. Guided flow: 'Add your parents and siblings.' No app download required.",
    color: "from-blue-600/20 to-cyan-600/20 border-blue-500/30",
    badge: "Growth",
  },
  {
    icon: Globe,
    title: "India-First by Design",
    description: "Gotra, joint family structure, Dada-Dadi/Nana-Nani terminology, migration history (village → city → abroad). Built for Bharat.",
    color: "from-orange-600/20 to-red-600/20 border-orange-500/30",
    badge: "India",
  },
]

const TESTIMONIALS = [
  {
    quote: "Meri family ka poora itihas ab ek jagah hai. Dada ki awaaz bhi save hai. Bahut emotional experience tha.",
    author: "Suresh Kumar",
    role: "School Principal, Nagpur",
    rating: 5,
    lang: "Hindi",
  },
  {
    quote: "We've been trying to map our 200-member joint family for years. This AI made it happen in one weekend.",
    author: "Priya Iyer",
    role: "Software Engineer, Bengaluru",
    rating: 5,
    lang: "English",
  },
  {
    quote: "The WhatsApp invite feature is genius. My whole clan from 8 cities joined in 2 days.",
    author: "Ramesh Patel",
    role: "Business Owner, Surat",
    rating: 5,
    lang: "English",
  },
]

const PRICING = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    description: "Start building your family tree",
    features: [
      "Up to 50 family members",
      "Basic family graph",
      "5 memories/month",
      "WhatsApp invite",
      "Mobile PWA",
    ],
    cta: "Start Free",
    href: "/onboarding",
    highlighted: false,
  },
  {
    name: "Family",
    price: "₹199",
    period: "per month",
    description: "For growing families",
    features: [
      "Unlimited members",
      "AI Copilot (50 queries/month)",
      "Voice story recording",
      "Memory vault unlimited",
      "PDF family book export",
      "Priority support",
    ],
    cta: "Start 14-day Trial",
    href: "/onboarding",
    highlighted: true,
  },
  {
    name: "Heritage",
    price: "₹499",
    period: "per month",
    description: "For family historians",
    features: [
      "Everything in Family",
      "Unlimited AI queries",
      "AI story generation",
      "Voice AI transcription",
      "Printed family tree book",
      "Dedicated family admin",
    ],
    cta: "Contact Us",
    href: "/onboarding",
    highlighted: false,
  },
]

const STATS = [
  { value: "2M+", label: "Family members mapped" },
  { value: "50K+", label: "Families on platform" },
  { value: "8+", label: "Languages supported" },
  { value: "99.9%", label: "Uptime guaranteed" },
]

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Start with yourself",
    description: "Tell us your name, birthplace, and family name. Takes 30 seconds.",
    icon: "👤",
  },
  {
    step: "02",
    title: "Add immediate family",
    description: "Parents, siblings, spouse. AI guides you through the connections.",
    icon: "👨‍👩‍👧‍👦",
  },
  {
    step: "03",
    title: "Invite via WhatsApp",
    description: "Send a link. Each family member adds their branch. Tree grows itself.",
    icon: "📱",
  },
  {
    step: "04",
    title: "Preserve memories",
    description: "Photos, voices, stories. Your family's legacy — safe and searchable forever.",
    icon: "🌳",
  },
]

export default function MarketingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">

      {/* ── Navigation ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-primary-foreground" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="7" r="3" />
                  <circle cx="6" cy="17" r="2.5" />
                  <circle cx="18" cy="17" r="2.5" />
                  <path d="M12 10v3M8 14l-1.5 2M16 14l1.5 2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-foreground">Family Graph</span>
                <span className="ml-2 hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary sm:inline">
                  India's #1 Family App
                </span>
              </div>
            </div>

            <div className="hidden items-center gap-6 md:flex">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it Works</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
              <Link href="/auth/signin">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link href="/onboarding">
                <Button size="sm" className="bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20">
                  Start Free
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>

            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-muted-foreground hover:text-foreground">
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-[#E5E3DE] bg-white/95 px-4 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              <a href="#features" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
              <a href="#pricing" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
              <div className="flex gap-2">
                <Link href="/auth/signin" className="flex-1">
                  <Button variant="outline" className="w-full">Sign In</Button>
                </Link>
                <Link href="/onboarding" className="flex-1">
                  <Button className="w-full">Start Free</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero Section ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-72 w-72 rounded-full bg-secondary/10 blur-3xl" />
          <div className="absolute -bottom-20 right-20 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }} />
        </div>

        <div className="relative mx-auto max-w-5xl text-center">
          <Badge className="mb-6 border-primary/30 bg-primary/10 text-primary">
            <Sparkles className="mr-1.5 h-3 w-3" />
            AI-Powered Family Intelligence Platform
          </Badge>

          <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Your Family's Living{" "}
            <span className="bg-gradient-to-r from-primary via-secondary to-violet-400 bg-clip-text text-transparent">
              Memory & Graph
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed sm:text-xl">
            Build your interactive family tree, preserve elder stories with voice AI, discover relationships, and connect every branch of your family — all in one living, growing platform.
          </p>

          <div className="mt-4 flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-400" />India-first design</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-400" />WhatsApp invite</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-400" />AI in Hindi & English</span>
          </div>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/onboarding">
              <Button size="lg" className="h-14 px-8 text-base bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all">
                Start Building Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="h-14 px-8 text-base border-border/60 hover:border-primary/50">
                <GitBranch className="mr-2 h-5 w-5" />
                See Live Demo
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Free forever for up to 50 members · No credit card required</p>
        </div>

        {/* Mock App Preview */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="rounded-2xl border border-border/50 bg-card/80 p-2 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 mb-2 px-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              <div className="ml-2 flex-1 rounded bg-muted/50 h-5 px-2 flex items-center">
                <span className="text-[10px] text-muted-foreground/50">familygraph.app/dashboard</span>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-border/30" style={{ background: 'linear-gradient(135deg, #0C0A09 0%, #1C1917 100%)' }}>
              <div className="grid grid-cols-4 gap-0 divide-x divide-white/5 h-72 sm:h-96">
                {/* Sidebar */}
                <div className="col-span-1 bg-card/30 p-3 hidden sm:block">
                  <div className="space-y-2">
                    <div className="h-8 w-full rounded-lg bg-primary/20 flex items-center px-2 gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-primary/60" />
                      <div className="h-2 flex-1 rounded bg-primary/40" />
                    </div>
                    {['bg-violet-500/10', 'bg-amber-500/10', 'bg-green-500/10', 'bg-blue-500/10'].map((bg, i) => (
                      <div key={i} className={`h-7 w-full rounded-lg ${bg} flex items-center px-2 gap-1.5`}>
                        <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                        <div className="h-1.5 flex-1 rounded bg-white/10" />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Family Tree */}
                <div className="col-span-3 sm:col-span-2 relative overflow-hidden">
                  <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 400 300">
                    {/* Gen 0 nodes */}
                    <circle cx="120" cy="40" r="20" fill="#6366F1" opacity="0.7" />
                    <circle cx="280" cy="40" r="20" fill="#A78BFA" opacity="0.7" />
                    {/* Gen 1 nodes */}
                    <circle cx="80" cy="120" r="18" fill="#6366F1" opacity="0.6" />
                    <circle cx="160" cy="120" r="18" fill="#A78BFA" opacity="0.6" />
                    <circle cx="240" cy="120" r="18" fill="#6366F1" opacity="0.6" />
                    <circle cx="320" cy="120" r="18" fill="#A78BFA" opacity="0.6" />
                    {/* Gen 2 nodes */}
                    <circle cx="120" cy="200" r="22" fill="#06B6D4" opacity="0.8" stroke="#06B6D4" strokeWidth="2" />
                    <circle cx="280" cy="200" r="18" fill="#6366F1" opacity="0.6" />
                    {/* Gen 3 nodes */}
                    <circle cx="200" cy="270" r="16" fill="#F59E0B" opacity="0.9" stroke="#F59E0B" strokeWidth="2" />
                    {/* Connections */}
                    <line x1="120" y1="60" x2="80" y2="102" stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />
                    <line x1="120" y1="60" x2="160" y2="102" stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />
                    <line x1="280" y1="60" x2="240" y2="102" stroke="#A78BFA" strokeWidth="1.5" opacity="0.4" />
                    <line x1="280" y1="60" x2="320" y2="102" stroke="#A78BFA" strokeWidth="1.5" opacity="0.4" />
                    <path d="M 80 138 Q 80 200 120 178" fill="none" stroke="#06B6D4" strokeWidth="1.5" opacity="0.4" />
                    <path d="M 160 138 Q 160 200 120 178" fill="none" stroke="#06B6D4" strokeWidth="1.5" opacity="0.4" />
                    <path d="M 120 222 Q 160 270 200 254" fill="none" stroke="#F59E0B" strokeWidth="2" opacity="0.6" />
                    <path d="M 280 218 Q 240 270 200 254" fill="none" stroke="#F59E0B" strokeWidth="2" opacity="0.6" />
                    <line x1="120" y1="40" x2="280" y2="40" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.4" />
                    {/* Labels */}
                    <text x="200" y="275" textAnchor="middle" fill="#F59E0B" fontSize="8" fontWeight="bold">YOU</text>
                  </svg>
                  <div className="absolute top-2 right-2 flex gap-1">
                    {['🔍', '🤖', '📸'].map(e => (
                      <div key={e} className="flex h-6 w-6 items-center justify-center rounded bg-card/60 text-sm">{e}</div>
                    ))}
                  </div>
                </div>
                {/* Detail Panel */}
                <div className="hidden sm:block col-span-1 bg-card/20 p-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-8 w-8 rounded-full bg-amber-500/30" />
                      <div className="space-y-1 flex-1">
                        <div className="h-2 w-full rounded bg-white/20" />
                        <div className="h-1.5 w-2/3 rounded bg-white/10" />
                      </div>
                    </div>
                    <div className="h-1 w-full rounded bg-white/5" />
                    {[1, 0.7, 0.5].map((o, i) => (
                      <div key={i} className="h-2 rounded bg-white/10" style={{ opacity: o, width: `${70 + i * 10}%` }} />
                    ))}
                    <div className="h-1 w-full rounded bg-white/5 mt-2" />
                    <div className="rounded-lg bg-violet-500/10 p-2 space-y-1">
                      <div className="h-1.5 w-4/5 rounded bg-violet-500/30" />
                      <div className="h-1.5 w-3/5 rounded bg-violet-500/20" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────── */}
      <section className="border-y border-[#E5E3DE] bg-[#F4F3EF] py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent sm:text-4xl">{s.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <Badge className="mb-4 border-blue-500/30 bg-blue-500/10 text-blue-400">Simple by Design</Badge>
            <h2 className="text-3xl font-bold sm:text-4xl">Start in 4 steps. Done in a weekend.</h2>
            <p className="mt-3 text-muted-foreground">No tech knowledge required. Designed for every age.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="relative flex flex-col rounded-2xl border border-[#E5E3DE] bg-white p-5">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="absolute -right-2 top-8 z-10 hidden h-4 w-4 rotate-45 border-r border-t border-border/50 bg-card lg:block" />
                )}
                <span className="text-3xl mb-3">{step.icon}</span>
                <span className="text-[10px] font-mono font-bold text-muted-foreground/50 mb-1">{step.step}</span>
                <h3 className="font-semibold text-base">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section id="features" className="bg-[#F4F3EF] py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <Badge className="mb-4 border-primary/30 bg-primary/10 text-primary">Everything Your Family Needs</Badge>
            <h2 className="text-3xl font-bold sm:text-4xl">More than a family tree</h2>
            <p className="mt-3 text-muted-foreground">A living platform for family intelligence, memory, and legacy.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border bg-gradient-to-br p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg",
                  feature.color
                )}
              >
                <div className="flex items-center gap-2">
                  <feature.icon className="h-5 w-5" />
                  <Badge variant="outline" className="text-[10px] py-0 h-4 border-current/30">{feature.badge}</Badge>
                </div>
                <h3 className="font-semibold text-base">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Highlight ───────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-600/10 via-purple-600/5 to-primary/10 p-8 sm:p-12">
            <div className="grid gap-8 lg:grid-cols-2 items-center">
              <div>
                <Badge className="mb-4 border-violet-500/30 bg-violet-500/10 text-violet-400">
                  <Brain className="mr-1.5 h-3 w-3" />
                  AI Copilot
                </Badge>
                <h2 className="text-3xl font-bold sm:text-4xl">Your family AI that actually understands Indian families</h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  Ask in Hindi or English. AI knows the difference between Nana-Nani and Dada-Dadi, understands joint family structures, and can trace 4-generation relationship paths in seconds.
                </p>
                <div className="mt-6 space-y-2.5">
                  {[
                    { q: '"How am I related to Ramesh chacha\'s son?"', color: 'text-violet-400' },
                    { q: '"Tell me my family history from 1920"', color: 'text-primary' },
                    { q: '"Who is my gotra, and what does it mean?"', color: 'text-amber-400' },
                    { q: '"Add my maternal uncle Ashok to the tree"', color: 'text-green-400' },
                  ].map(item => (
                    <div key={item.q} className="flex items-start gap-2 rounded-xl bg-card/50 px-3 py-2">
                      <Sparkles className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", item.color)} />
                      <span className="text-sm text-foreground/80">{item.q}</span>
                    </div>
                  ))}
                </div>
                <Link href="/ai-copilot" className="mt-6 inline-block">
                  <Button className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
                    Try AI Copilot
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="relative">
                <div className="rounded-2xl border border-violet-500/20 bg-card/80 p-4 shadow-2xl">
                  <div className="space-y-3">
                    {[
                      { role: 'user', msg: 'How am I related to Karan Mishra?' },
                      { role: 'ai', msg: 'Karan Mishra is your first cousin on the maternal side. Your mother Priya and his father Ashok are siblings (both children of Ramdas and Pushpa Mishra). So Karan is your Mama\'s son — your Mama ka beta.' },
                    ].map((m, i) => (
                      <div key={i} className={cn("flex gap-2.5", m.role === 'user' && "flex-row-reverse")}>
                        <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                          m.role === 'ai' ? "bg-violet-500 text-white" : "bg-orange-500 text-white"
                        )}>
                          {m.role === 'ai' ? '🤖' : 'R'}
                        </div>
                        <div className={cn("rounded-xl px-3 py-2 text-xs max-w-[80%] leading-relaxed",
                          m.role === 'ai' ? "bg-muted text-foreground" : "bg-orange-500/20 text-foreground"
                        )}>
                          {m.msg}
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-violet-500 flex items-center justify-center text-xs shrink-0">🤖</div>
                      <div className="flex items-center gap-1 rounded-xl bg-muted px-3 py-2">
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

      {/* ── Testimonials ───────────────────────────────────────────── */}
      <section className="bg-[#F4F3EF] py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl">Families love it</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="flex flex-col gap-4 rounded-2xl border border-[#E5E3DE] bg-white p-5">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }, (_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed italic">"{t.quote}"</p>
                <div className="mt-auto flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/40 to-secondary/40 flex items-center justify-center text-sm font-bold">
                    {t.author[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.author}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto text-[10px] py-0 h-4">{t.lang}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <Badge className="mb-4">Simple Pricing</Badge>
            <h2 className="text-3xl font-bold sm:text-4xl">Start free. Grow together.</h2>
            <p className="mt-3 text-muted-foreground">No family is too big or too small.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {PRICING.map((plan, i) => (
              <div
                key={i}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6",
                  plan.highlighted
                    ? "border-primary bg-gradient-to-br from-primary/10 to-secondary/10 shadow-xl shadow-primary/10"
                    : "border-[#E5E3DE] bg-white"
                )}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-primary/30 bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="mb-1 text-sm text-muted-foreground">/{plan.period}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <ul className="my-6 flex-1 space-y-2.5">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={plan.href}>
                  <Button
                    className={cn("w-full", plan.highlighted && "bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20")}
                    variant={plan.highlighted ? 'default' : 'outline'}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="bg-[#F4F3EF] py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-4xl mb-4">🌳</div>
          <h2 className="text-3xl font-bold sm:text-4xl">Your family story deserves to live forever</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Start today. Invite one family member this weekend. By next month, your entire clan's history will be alive, searchable, and growing.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/onboarding">
              <Button size="lg" className="h-14 px-8 text-base bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-xl shadow-primary/20">
                Build Your Family Tree — Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">No credit card · No download · 5-minute setup</p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E5E3DE] bg-[#F4F3EF] py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
                <GitBranch className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold text-sm">Family Graph</span>
              <span className="text-xs text-muted-foreground">© 2026</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Contact</a>
              <a href="#" className="hover:text-foreground transition-colors">Blog</a>
            </div>
            <Badge variant="outline" className="text-xs">
              <span className="mr-1">🇮🇳</span> Made with ❤️ for Indian families
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  )
}
