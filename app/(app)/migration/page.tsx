"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { sampleFamilyMembers } from "@/lib/sample-data"
import { useAuth } from "@/hooks/use-auth"
import { useMembers } from "@/hooks/use-members"
import { DemoBanner } from "@/components/demo-banner"
import { ArrowLeft, MapPin, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

// City coordinates on a simplified India SVG (viewBox 60 80 300 380)
const CITY_COORDS: Record<string, { x: number; y: number }> = {
  "Varanasi": { x: 258, y: 178 },
  "Allahabad": { x: 248, y: 185 },
  "Lucknow": { x: 240, y: 162 },
  "Nagpur": { x: 210, y: 268 },
  "Pune": { x: 162, y: 302 },
  "Mumbai": { x: 148, y: 292 },
  "Bengaluru": { x: 196, y: 368 },
  "Delhi": { x: 218, y: 130 },
  "Hyderabad": { x: 212, y: 322 },
}

function parseCityFromPlace(place?: string): string | null {
  if (!place) return null
  for (const city of Object.keys(CITY_COORDS)) {
    if (place.includes(city)) return city
  }
  return null
}

type ViewMode = "both" | "birthplace" | "current"

export default function MigrationPage() {
  const { user, familyId, loading: authLoading } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const isDemoMode = !authLoading && !user
  const allMembers = isDemoMode ? sampleFamilyMembers : (familyId && !loading ? dbMembers : [])

  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("both")
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)

  // Build city data
  const cityData = useMemo(() => Object.keys(CITY_COORDS).map(city => {
    const bornHere = allMembers.filter(m => parseCityFromPlace(m.birthPlace) === city)
    const liveHere = allMembers.filter(m => parseCityFromPlace(m.currentPlace) === city)
    const total = new Set([...bornHere.map(m => m.id), ...liveHere.map(m => m.id)]).size
    return { city, bornHere, liveHere, total }
  }).filter(d => d.total > 0), [allMembers])

  const filteredMembers = useMemo(() => selectedCity
    ? allMembers.filter(m =>
      parseCityFromPlace(m.currentPlace) === selectedCity ||
      parseCityFromPlace(m.birthPlace) === selectedCity
    )
    : [], [allMembers, selectedCity])

  // Migration arrows
  const migrations = useMemo(() => allMembers
    .filter(m => {
      const birth = parseCityFromPlace(m.birthPlace)
      const current = parseCityFromPlace(m.currentPlace)
      return birth && current && birth !== current && CITY_COORDS[birth] && CITY_COORDS[current]
    })
    .map(m => ({
      member: m,
      from: CITY_COORDS[parseCityFromPlace(m.birthPlace)!],
      to: CITY_COORDS[parseCityFromPlace(m.currentPlace)!],
    })), [allMembers])

  const cities = useMemo(() => cityData
    .map(d => ({ ...d, coords: CITY_COORDS[d.city] }))
    .filter(d => d.coords), [cityData])

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <DemoBanner />
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/50 bg-card/95 backdrop-blur px-4 sm:px-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Migration Map</h1>
          <p className="text-xs text-muted-foreground">How our family spread across India</p>
        </div>
        <div className="flex gap-1">
          {(["both", "birthplace", "current"] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                viewMode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "both" ? "All" : m === "birthplace" ? "Born" : "Live"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row" style={{ height: "calc(100vh - 4rem)" }}>
        {/* Map SVG */}
        <div className="flex-1 relative bg-card/30 min-h-[400px] lg:min-h-0 overflow-hidden">
          <svg
            viewBox="60 80 300 380"
            className="w-full h-full"
            style={{ maxHeight: "calc(100vh - 4rem)" }}
          >
            {/* India simplified outline */}
            <path
              d="M 150 85 L 170 82 L 210 88 L 250 85 L 290 95 L 310 115 L 320 140 L 318 165 L 300 185 L 310 210 L 308 240 L 295 268 L 270 295 L 255 325 L 235 360 L 215 395 L 200 420 L 190 430 L 185 420 L 175 400 L 165 380 L 148 355 L 135 330 L 125 305 L 115 280 L 110 255 L 108 225 L 112 195 L 118 170 L 120 145 L 130 120 L 140 100 Z"
              fill="#E8F0FE"
              stroke="#BFD0F7"
              strokeWidth="1.5"
            />
            {/* Rough state dividers */}
            <path d="M 130 200 Q 200 185 268 200" fill="none" stroke="#BFD0F7" strokeWidth="0.5" strokeDasharray="3,3" />
            <path d="M 120 265 Q 210 258 295 262" fill="none" stroke="#BFD0F7" strokeWidth="0.5" strokeDasharray="3,3" />
            <path d="M 128 315 Q 195 310 270 318" fill="none" stroke="#BFD0F7" strokeWidth="0.5" strokeDasharray="3,3" />

            {/* Migration arrows */}
            {viewMode !== "birthplace" && migrations.map(({ member, from, to }, i) => {
              const isHovered = hoveredMemberId === member.id
              return (
                <g key={i}>
                  <defs>
                    <marker
                      id={`arrowhead-${i}`}
                      markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"
                    >
                      <path d="M0,0 L0,6 L6,3 Z" fill="#2F6FED" opacity={isHovered ? 1 : 0.5} />
                    </marker>
                  </defs>
                  <line
                    x1={from.x} y1={from.y}
                    x2={to.x} y2={to.y}
                    stroke="#2F6FED"
                    strokeWidth={isHovered ? 2 : 1}
                    strokeDasharray="4,3"
                    opacity={isHovered ? 1 : 0.4}
                    markerEnd={`url(#arrowhead-${i})`}
                    onMouseEnter={() => setHoveredMemberId(member.id)}
                    onMouseLeave={() => setHoveredMemberId(null)}
                    style={{ cursor: "pointer" }}
                  />
                </g>
              )
            })}

            {/* City nodes */}
            {cities.map(({ city, coords, total, liveHere }) => {
              const isSelected = selectedCity === city
              const r = 8 + Math.min(total * 3, 18)
              return (
                <g
                  key={city}
                  onClick={() => setSelectedCity(selectedCity === city ? null : city)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={coords.x} cy={coords.y} r={r}
                    fill={isSelected ? "#2F6FED" : "#4F8CFF"}
                    opacity={isSelected ? 1 : 0.78}
                    stroke="white" strokeWidth="2"
                  />
                  <text
                    x={coords.x} y={coords.y - r - 4}
                    textAnchor="middle" fill="#111827" fontSize="8" fontWeight="600"
                  >
                    {city}
                  </text>
                  <text
                    x={coords.x} y={coords.y + 3}
                    textAnchor="middle" fill="white" fontSize="8" fontWeight="bold"
                  >
                    {total}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 rounded-xl border border-border bg-card/95 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Legend</p>
            <div className="flex items-center gap-2 text-xs">
              <div className="h-3 w-3 rounded-full bg-[#4F8CFF]" />
              <span>City (number = members)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="h-0.5 w-6 border-t-2 border-dashed border-[#2F6FED]" />
              <span>Migration path</span>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto">
          {selectedCity ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {selectedCity}
                  </h2>
                  <p className="text-xs text-muted-foreground">{filteredMembers.length} family members</p>
                </div>
                <button
                  onClick={() => setSelectedCity(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2">
                {filteredMembers.map(m => {
                  const bornHere = parseCityFromPlace(m.birthPlace) === selectedCity
                  const livesHere = parseCityFromPlace(m.currentPlace) === selectedCity
                  return (
                    <div key={m.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                          {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bornHere && livesHere
                            ? "Born & lives here"
                            : bornHere
                              ? `Born here → ${m.currentPlace?.split(",")[0] ?? "?"}`
                              : `From ${m.birthPlace?.split(",")[0] ?? "?"}`}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        {bornHere && (
                          <Badge variant="outline" className="text-[9px] py-0 h-4 border-green-300 text-green-600">Born</Badge>
                        )}
                        {livesHere && (
                          <Badge variant="outline" className="text-[9px] py-0 h-4 border-blue-300 text-blue-600">Lives</Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <h2 className="font-semibold text-sm">Family Distribution</h2>
              <div className="space-y-1">
                {cityData.sort((a, b) => b.total - a.total).map(({ city, bornHere, liveHere }) => (
                  <button
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className="w-full flex items-center gap-3 rounded-xl hover:bg-muted/50 p-2.5 transition-colors text-left"
                  >
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{city}</p>
                      <p className="text-xs text-muted-foreground">
                        {bornHere.length} born · {liveHere.length} live here
                      </p>
                    </div>
                    <div className="flex -space-x-1.5">
                      {liveHere.slice(0, 3).map(m => (
                        <Avatar key={m.id} className="h-6 w-6 border border-card">
                          <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-bold">
                            {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {liveHere.length > 3 && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-card bg-muted text-[9px] text-muted-foreground">
                          +{liveHere.length - 3}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs font-semibold text-primary mb-1">
                  <TrendingUp className="inline h-3 w-3 mr-1" />
                  Migration trend
                </p>
                <p className="text-xs text-muted-foreground">
                  Family moved Varanasi &amp; Lucknow → Nagpur / Pune → Mumbai &amp; Bengaluru over 3 generations.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
