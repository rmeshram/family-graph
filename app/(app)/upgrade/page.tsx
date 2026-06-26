"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FEATURE_FLAGS } from "@/lib/feature-flags"
import {
  ArrowLeft, CheckCircle2, X, Sparkles, Crown,
  Heart, MessageCircle, TrendingUp, Users, Zap, Lock,
} from "lucide-react"
import { cn } from "@/lib/utils"

const FREE_FEATURES = [
  "Browse all match profiles",
  "Express interest (❤️ Interested)",
  "Request intro — 3 per day",
  "Lifestyle Intelligence persona",
  "Trust Score visible to matches",
  "Family tree (up to 25 members)",
  "Invite family members",
  "Social Vouches (receive up to 3)",
]

const PREMIUM_FEATURES = [
  { label: "Unlimited intro requests", icon: MessageCircle },
  { label: "Lifestyle compatibility score on every match", icon: TrendingUp },
  { label: "See who viewed your biodata", icon: Heart },
  { label: "Priority placement in match feeds", icon: Zap },
  { label: "Match Vault deep compatibility report", icon: Sparkles },
  { label: "Unlimited Social Vouches", icon: Users },
  { label: "Family tree up to 500 members", icon: Users },
  { label: "Assisted matchmaking concierge", icon: Crown },
  { label: "WhatsApp Business notifications", icon: MessageCircle },
  { label: "Export biodata as PDF", icon: Lock },
]

const PLANS = [
  {
    id: "monthly",
    label: "Monthly",
    price: "₹999",
    period: "/month",
    badge: null,
    priceNote: "Billed monthly",
  },
  {
    id: "quarterly",
    label: "3 Months",
    price: "₹2,499",
    period: "/quarter",
    badge: "Save 17%",
    priceNote: "₹833/month",
  },
  {
    id: "biannual",
    label: "6 Months",
    price: "₹3,999",
    period: "/6 months",
    badge: "Most Popular",
    priceNote: "₹666/month",
  },
]

export default function UpgradePage() {
  const isPaymentsLive = FEATURE_FLAGS.enableStripePayments

  return (
    <div className="min-h-full pb-24" style={{ background: "#F8F9FA" }}>
      {/* header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-white">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-base" style={{ color: "#111827" }}>Premium Plans</h1>
          <p className="text-xs" style={{ color: "#6B7280" }}>Unlock your best match</p>
        </div>
        <Crown className="h-5 w-5" style={{ color: "#D97706" }} />
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* hero */}
        <div
          className="rounded-3xl p-6 text-center space-y-3"
          style={{
            background: "linear-gradient(145deg, #7C3AED, #5B21B6)",
            boxShadow: "0 24px 60px -12px rgba(124,58,237,0.4)",
          }}
        >
          <div className="h-14 w-14 rounded-full mx-auto flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.18)" }}>
            <Crown className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Outverse Premium</h2>
          <p className="text-sm text-purple-200 leading-relaxed max-w-xs mx-auto">
            Get lifestyle-matched introductions, unlimited connects, and priority placement — so the right families find you first.
          </p>
        </div>

        {/* plan selector */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#6B7280" }}>Choose your plan</p>
          <div className="grid grid-cols-3 gap-2">
            {PLANS.map(plan => (
              <div
                key={plan.id}
                className={cn(
                  "relative rounded-2xl border-2 p-3 text-center cursor-pointer transition-all",
                  plan.badge === "Most Popular"
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 bg-white hover:border-purple-300"
                )}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-bold whitespace-nowrap"
                    style={{
                      background: plan.badge === "Most Popular" ? "#7C3AED" : "#059669",
                      color: "#fff",
                    }}>
                    {plan.badge}
                  </span>
                )}
                <p className="font-bold text-sm" style={{ color: "#111827" }}>{plan.price}</p>
                <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{plan.period}</p>
                <p className="text-[10px] font-medium mt-1" style={{ color: "#6B7280" }}>{plan.priceNote}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        {isPaymentsLive ? (
          <Button
            className="w-full h-12 font-bold text-base gap-2"
            style={{ background: "#7C3AED", color: "#fff" }}
          >
            <Crown className="h-4 w-4" />
            Upgrade to Premium
          </Button>
        ) : (
          <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-center space-y-2">
            <p className="text-sm font-semibold" style={{ color: "#5B21B6" }}>
              Premium launching soon
            </p>
            <p className="text-xs" style={{ color: "#7C3AED" }}>
              All features are free during our beta. We'll notify you when Premium goes live.
            </p>
            <Button
              variant="outline"
              className="border-purple-300 text-purple-700 hover:bg-purple-100 gap-2"
            >
              <Heart className="h-4 w-4" />
              Notify me at launch
            </Button>
          </div>
        )}

        {/* comparison table */}
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden"
          style={{ boxShadow: "0 2px 12px -4px rgba(0,0,0,0.08)" }}>

          {/* header row */}
          <div className="grid grid-cols-3 border-b border-gray-100">
            <div className="col-span-1 p-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
              Feature
            </div>
            <div className="p-3 text-center text-[11px] font-bold uppercase tracking-wide border-l border-gray-100" style={{ color: "#6B7280" }}>
              Free
            </div>
            <div className="p-3 text-center text-[11px] font-bold uppercase tracking-wide border-l border-purple-100"
              style={{ background: "#FAF5FF", color: "#7C3AED" }}>
              Premium
            </div>
          </div>

          {/* free features */}
          {FREE_FEATURES.map(f => (
            <div key={f} className="grid grid-cols-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <div className="col-span-1 px-3 py-2.5 text-[12px]" style={{ color: "#374151" }}>{f}</div>
              <div className="px-3 py-2.5 flex justify-center items-center border-l border-gray-100">
                <CheckCircle2 className="h-4 w-4" style={{ color: "#059669" }} />
              </div>
              <div className="px-3 py-2.5 flex justify-center items-center border-l border-purple-100"
                style={{ background: "#FAF5FF" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "#7C3AED" }} />
              </div>
            </div>
          ))}

          {/* premium-only features */}
          {PREMIUM_FEATURES.map(({ label, icon: Icon }) => (
            <div key={label} className="grid grid-cols-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <div className="col-span-1 px-3 py-2.5 flex items-center gap-1.5">
                <Icon className="h-3 w-3 shrink-0" style={{ color: "#7C3AED" }} />
                <span className="text-[12px]" style={{ color: "#374151" }}>{label}</span>
              </div>
              <div className="px-3 py-2.5 flex justify-center items-center border-l border-gray-100">
                <X className="h-4 w-4" style={{ color: "#D1D5DB" }} />
              </div>
              <div className="px-3 py-2.5 flex justify-center items-center border-l border-purple-100"
                style={{ background: "#FAF5FF" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "#7C3AED" }} />
              </div>
            </div>
          ))}
        </div>

        {/* trust badges */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { emoji: "🔒", label: "Secure payment", sub: "Razorpay / Stripe" },
            { emoji: "↩️", label: "7-day refund", sub: "No questions asked" },
            { emoji: "🚫", label: "No auto-renew", sub: "Cancel anytime" },
          ].map(({ emoji, label, sub }) => (
            <div key={label} className="rounded-2xl bg-white border border-gray-100 p-3 space-y-1">
              <div className="text-xl">{emoji}</div>
              <p className="text-[11px] font-semibold" style={{ color: "#111827" }}>{label}</p>
              <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{sub}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
