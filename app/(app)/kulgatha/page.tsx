'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { useMembers } from '@/hooks/use-members'
import { sampleFamilyMembers } from '@/lib/sample-data'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DemoBanner } from '@/components/demo-banner'
import { Printer, Download, TreePine, MapPin, Users, BookOpen, Sparkles, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function KulgathaPage() {
  const { user, familyId, profile, loading: authLoading } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const isDemoMode = !authLoading && !user

  const members = useMemo(() => {
    if (isDemoMode) return sampleFamilyMembers
    if (!familyId || loading) return []
    return dbMembers
  }, [isDemoMode, familyId, loading, dbMembers])

  const familyName = (profile as any)?.families?.name ?? 'The Family'

  const byGen = useMemo(() => {
    const map = new Map<number, typeof members>()
    members.forEach(m => {
      if (!map.has(m.generation)) map.set(m.generation, [])
      map.get(m.generation)!.push(m)
    })
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [members])

  const cities = useMemo(() => {
    const c = new Map<string, number>()
    members.forEach(m => {
      const city = m.currentPlace?.split(',')[0] ?? m.birthPlace?.split(',')[0]
      if (city) c.set(city, (c.get(city) ?? 0) + 1)
    })
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1])
  }, [members])

  const occupations = useMemo(() => {
    const o = new Map<string, number>()
    members.forEach(m => {
      if (m.occupation) o.set(m.occupation, (o.get(m.occupation) ?? 0) + 1)
    })
    return Array.from(o.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [members])

  const genLabels: Record<number, string> = {
    0: 'Great Grandparents',
    1: 'Grandparents',
    2: 'Parents & Uncles/Aunts',
    3: 'Your Generation',
    4: 'Children',
  }

  const handlePrint = () => window.print()

  return (
    <>
      {/* Print stylesheet — inlined so no extra file needed */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-page { page-break-after: always; }
          body { background: white !important; color: black !important; }
          .print-card { border: 1px solid #e5e7eb !important; background: white !important; }
        }
      `}</style>

      <div className="flex flex-col min-h-full">
        {/* Toolbar — hidden on print */}
        <div className="no-print flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-6 py-3 bg-card/50 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15">
              <BookOpen className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">Kulgatha PDF</h1>
              <p className="text-[11px] text-muted-foreground">Your family lineage document</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/5 text-xs">
              {members.length} members · {byGen.length} generations
            </Badge>
            <Button onClick={handlePrint} className="h-9 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </Button>
          </div>
        </div>

        {/* Document — this is what gets printed */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-6">

            {/* ── Cover Page ─────────────────────────────────────── */}
            <div className="print-card print-page rounded-2xl border border-border/50 bg-card p-10 text-center space-y-6">
              <div className="flex justify-center">
                <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
                  <TreePine className="h-10 w-10 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-bold text-foreground mb-2">{familyName}</h1>
                <p className="text-muted-foreground text-lg">Kulgatha — Family Lineage Document</p>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-3xl font-bold text-emerald-500">{members.length}</p>
                  <p className="text-sm text-muted-foreground">Members</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-teal-500">{byGen.length}</p>
                  <p className="text-sm text-muted-foreground">Generations</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-cyan-500">{cities.length}</p>
                  <p className="text-sm text-muted-foreground">Cities</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Generated on {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Family Graph
              </p>
            </div>

            {/* ── Origins & Heritage ──────────────────────────────── */}
            {members.some(m => m.gotra || m.caste || m.religion) && (
              <div className="print-card rounded-2xl border border-border/50 bg-card p-6 space-y-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                  Origins &amp; Heritage
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {members.filter(m => m.gotra).slice(0, 1).map(m => (
                    <div key={m.id} className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Gotra</p>
                      <p className="font-semibold">{m.gotra}</p>
                    </div>
                  ))}
                  {members.filter(m => m.caste).slice(0, 1).map(m => (
                    <div key={m.id} className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Community</p>
                      <p className="font-semibold">{m.caste}</p>
                    </div>
                  ))}
                  {members.filter(m => m.religion).slice(0, 1).map(m => (
                    <div key={m.id} className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Religion</p>
                      <p className="font-semibold">{m.religion}</p>
                    </div>
                  ))}
                  {members.filter(m => m.nativeLanguage).slice(0, 1).map(m => (
                    <div key={m.id} className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Mother Tongue</p>
                      <p className="font-semibold">{m.nativeLanguage}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Members by Generation ───────────────────────────── */}
            {byGen.map(([gen, genMembers]) => (
              <div key={gen} className="print-card rounded-2xl border border-border/50 bg-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Generation {gen} — {genLabels[gen] ?? 'Family'}
                  </h2>
                  <Badge variant="secondary">{genMembers.length} members</Badge>
                </div>
                <div className="divide-y divide-border/40">
                  {genMembers.map(m => (
                    <div key={m.id} className="py-3 flex items-start gap-4">
                      <div className={cn(
                        'h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold',
                        m.isAlive === false
                          ? 'bg-muted/40 text-muted-foreground'
                          : 'bg-primary/15 text-primary'
                      )}>
                        {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-foreground">
                            {m.name}
                            {m.isAlive === false && <span className="ml-1 text-muted-foreground text-xs">(†)</span>}
                          </p>
                          {m.relationship && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize">
                              {m.relationship.replace(/-/g, ' ')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {m.birthYear && (
                            <span className="text-[11px] text-muted-foreground">
                              b. {m.birthYear}{m.deathYear ? ` – d. ${m.deathYear}` : ''}
                            </span>
                          )}
                          {(m.birthPlace || m.currentPlace) && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" />
                              {m.currentPlace ?? m.birthPlace}
                            </span>
                          )}
                          {m.occupation && (
                            <span className="text-[11px] text-muted-foreground">{m.occupation}</span>
                          )}
                        </div>
                        {m.bio && (
                          <p className="text-[11px] text-muted-foreground/80 mt-1 italic line-clamp-2">{m.bio}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* ── Geographic Distribution ─────────────────────────── */}
            {cities.length > 0 && (
              <div className="print-card rounded-2xl border border-border/50 bg-card p-6 space-y-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-cyan-400" />
                  Where We Live
                </h2>
                <div className="flex flex-wrap gap-2">
                  {cities.map(([city, count]) => (
                    <div key={city} className="flex items-center gap-1.5 rounded-full bg-muted/40 border border-border/50 px-3 py-1">
                      <span className="text-sm font-medium">{city}</span>
                      <Badge variant="secondary" className="h-4 text-[10px] px-1">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Professions ─────────────────────────────────────── */}
            {occupations.length > 0 && (
              <div className="print-card rounded-2xl border border-border/50 bg-card p-6 space-y-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-400" />
                  Family Professions
                </h2>
                <div className="flex flex-wrap gap-2">
                  {occupations.map(([occ, count]) => (
                    <div key={occ} className="flex items-center gap-1.5 rounded-full bg-muted/40 border border-border/50 px-3 py-1">
                      <span className="text-sm font-medium">{occ}</span>
                      <Badge variant="secondary" className="h-4 text-[10px] px-1">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer ──────────────────────────────────────────── */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center space-y-1">
              <p className="text-sm font-semibold text-emerald-400">Preserved on Family Graph</p>
              <p className="text-xs text-muted-foreground">
                This document was generated from your live family tree. Visit family-graph-app-phi.vercel.app to edit or grow it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
