"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import { ArrowLeft, Download, Share2, Printer, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const CURRENT_YEAR = 2026

export default function BiodataPage() {
  const { familyId } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const allMembers = familyId && !loading ? dbMembers : sampleFamilyMembers

  const eligible = allMembers.filter(m => {
    if (m.isAlive === false || !m.birthYear) return false
    const age = CURRENT_YEAR - m.birthYear
    return age >= 18 && age <= 45
  })

  const [selectedId, setSelectedId] = useState(eligible[0]?.id ?? "")
  const [copied, setCopied] = useState(false)

  const member = allMembers.find(m => m.id === selectedId)
  const father = member
    ? allMembers.find(m2 => member.parentIds.includes(m2.id) && m2.gender === "male")
    : null
  const mother = member
    ? allMembers.find(m2 => member.parentIds.includes(m2.id) && m2.gender === "female")
    : null
  const siblings = member
    ? allMembers.filter(
      m2 => m2.id !== member.id && m2.parentIds.some(pid => member.parentIds.includes(pid))
    )
    : []
  const age = member?.birthYear ? CURRENT_YEAR - member.birthYear : null

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/50 bg-card/95 backdrop-blur px-4 sm:px-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Biodata Generator</h1>
          <p className="text-xs text-muted-foreground">Marriage biodata for family members</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">

          {/* Member selector */}
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Select Member
            </h2>
            <div className="space-y-2">
              {eligible.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    selectedId === m.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback
                      className={cn(
                        "text-xs font-bold",
                        selectedId === m.id
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium text-sm truncate", selectedId === m.id && "text-primary")}>
                      {m.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.birthYear ? `Age ${CURRENT_YEAR - m.birthYear}` : ""}
                      {" · "}
                      {m.gender === "male" ? "Male" : "Female"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Biodata Preview */}
          {member && (
            <div className="space-y-4">
              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-4 w-4" />
                  Save PDF
                </Button>
                <Button size="sm" className="gap-1.5" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  {copied ? "Copied!" : "Share Link"}
                </Button>
              </div>

              {/* Biodata Card */}
              <div className="rounded-2xl border-2 border-amber-200 bg-white shadow-xl overflow-hidden print:shadow-none">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white text-center">
                  <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/30 bg-white/20 text-3xl font-bold text-white">
                    {member.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <h2 className="text-2xl font-bold">{member.name}</h2>
                  <p className="text-amber-100 text-sm mt-1">Marriage Biodata</p>
                  <div className="flex justify-center gap-3 mt-3 flex-wrap">
                    {member.gotra && (
                      <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/20">
                        Gotra: {member.gotra}
                      </Badge>
                    )}
                    {member.religion && (
                      <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/20">
                        {member.religion}
                      </Badge>
                    )}
                    {member.caste && (
                      <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/20">
                        {member.caste}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="p-6 grid gap-6 sm:grid-cols-2">
                  {/* Personal Details */}
                  <section>
                    <h3 className="font-bold text-sm text-amber-700 uppercase tracking-wide border-b border-amber-100 pb-1 mb-3">
                      Personal Details
                    </h3>
                    <dl className="space-y-2">
                      {[
                        ["Full Name", member.name],
                        ["Year of Birth", member.birthYear ? String(member.birthYear) : "–"],
                        ["Age", age ? `${age} years` : "–"],
                        ["Gender", member.gender === "male" ? "Male" : "Female"],
                        ["Birthplace", member.birthPlace ?? "–"],
                        ["Current City", member.currentPlace ?? "–"],
                        ["Mother Tongue", member.nativeLanguage ?? "–"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-2 text-sm">
                          <dt className="text-muted-foreground w-28 shrink-0">{label}</dt>
                          <dd className="font-medium flex-1 text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  {/* Professional + Family Details */}
                  <section className="space-y-5">
                    <div>
                      <h3 className="font-bold text-sm text-amber-700 uppercase tracking-wide border-b border-amber-100 pb-1 mb-3">
                        Professional
                      </h3>
                      <dl className="space-y-2">
                        {[
                          ["Occupation", member.occupation ?? "–"],
                          [
                            "Education",
                            member.milestones?.find(ms => ms.type === "education")?.title ?? "–",
                          ],
                        ].map(([label, value]) => (
                          <div key={label} className="flex gap-2 text-sm">
                            <dt className="text-muted-foreground w-28 shrink-0">{label}</dt>
                            <dd className="font-medium flex-1 text-foreground">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-amber-700 uppercase tracking-wide border-b border-amber-100 pb-1 mb-3">
                        Family Details
                      </h3>
                      <dl className="space-y-2">
                        {[
                          ["Father", father?.name ?? "–"],
                          ["Father's Occ.", father?.occupation ?? "–"],
                          ["Mother", mother?.name ?? "–"],
                          [
                            "Siblings",
                            siblings.length > 0
                              ? siblings.map(s => s.name.split(" ")[0]).join(", ")
                              : "None",
                          ],
                          ["Family Type", "Joint Family"],
                          [
                            "Native Place",
                            member.hometown ?? member.birthPlace?.split(",")[0] ?? "–",
                          ],
                        ].map(([label, value]) => (
                          <div key={label} className="flex gap-2 text-sm">
                            <dt className="text-muted-foreground w-28 shrink-0">{label}</dt>
                            <dd className="font-medium flex-1 text-foreground">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </section>

                  {/* About */}
                  {member.bio && (
                    <div className="sm:col-span-2">
                      <h3 className="font-bold text-sm text-amber-700 uppercase tracking-wide border-b border-amber-100 pb-1 mb-3">
                        About
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{member.bio}</p>
                    </div>
                  )}

                  {/* Contact footer */}
                  <div className="sm:col-span-2 rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
                    <p className="text-xs text-amber-700 font-medium">Contact via Family Admin</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Generated by Family Graph · familygraph.app
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!member && (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-border h-60 text-muted-foreground text-sm">
              Select a member to generate biodata
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
