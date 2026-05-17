'use client'

/**
 * RelationshipUniverse — Primary graph experience.
 *
 * Design principles:
 *  • Universe is the PRIMARY interface. Tree / Org / List are utilities.
 *  • Visual noise reduction: edges ~8% opacity by default.
 *    Connections emerge on hover, reveal fully on select / path-find.
 *  • Focus mode: selecting a node dims all unconnected members,
 *    animates relationship lines outward — cinematic emotional center.
 *  • Semantic zoom: labels / metadata reveal progressively.
 *    cluster (k<0.5) → name (k<0.8) → detail (k<1.1) → full (k≥1.1)
 *  • Node breathing: all nodes have a subtle alive pulse.
 *    Selected node has an accelerated glow pulse.
 *  • Depth-aware layering: depth-0 foreground; deeper nodes smaller +
 *    progressively atmospheric.
 *  • Scalability: viewport culling skips offscreen nodes/edges.
 *    Relation labels computed lazily for visible nodes only.
 *  • Extended family: BFS via parentIds/spouseIds — natural deeper rings.
 *  • Affiliated/community: explicit outer cluster, grouped suggested edges.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FamilyMember } from '@/lib/types'
import { computeRelationLabel } from '@/lib/relation-engine'
import { cn } from '@/lib/utils'

// ─── Internal graph types ──────────────────────────────────────────────────

type UCategory = 'self' | 'paternal' | 'maternal' | 'marriage' | 'community'
type UEdgeKind = 'blood' | 'marriage' | 'community' | 'suggested'

interface UPerson {
  id: string
  name: string
  initials: string
  category: UCategory
  x: number
  y: number
  size: number
  hue: number
  relation: string
  city: string
  gotra: string
  verified: boolean
  depth: number
  hasChildren: boolean
}

interface UEdge {
  id: string
  from: string
  to: string
  kind: UEdgeKind
}

// ─── Color maps ────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<UCategory, string> = {
  self: 'var(--cyan-glow)',
  paternal: 'var(--paternal)',
  maternal: 'var(--maternal)',
  marriage: 'var(--marriage)',
  community: 'var(--community)',
}

const EDGE_COLOR: Record<UEdgeKind, string> = {
  blood: 'var(--paternal)',
  marriage: 'var(--marriage)',
  community: 'var(--community)',
  suggested: 'var(--cyan-glow)',
}

const HUE: Record<UCategory, number> = {
  self: 190, paternal: 220, maternal: 45, marriage: 280, community: 140,
}

// ─── Sector arc ranges [startRad, endRad] ─────────────────────────────────
// SVG convention: 0=right, π/2=down(visual), -π/2=up(visual), π=left
// Paternal → upper-left sector, Maternal → upper-right, Marriage → right,
// Community → outer-left (separate from core family)

const SECTOR_ARC: Record<UCategory, [number, number]> = {
  self: [0, 0],
  paternal: [Math.PI * 0.52, Math.PI * 1.38],   // ~94° → ~248°  (left / upper-left)
  maternal: [-Math.PI * 0.48, Math.PI * 0.38],    // ~-86° → ~68°  (upper-right / right)
  marriage: [-Math.PI * 0.32, Math.PI * 0.22],    // right side
  community: [Math.PI * 0.60, Math.PI * 1.60],    // outer left cluster
}

const BASE_RING_RADIUS = 190   // depth-1 ring radius (px in graph space)
const RING_STEP = 155   // extra radius per depth level
const MIN_ANG_GAP = 0.22  // min radians between nodes in same ring (~12.6°)
const JITTER_SCALE = 28    // px of deterministic position jitter

// ─── Layout engine ─────────────────────────────────────────────────────────

function deterministicJitter(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ((h % (JITTER_SCALE * 2 + 1)) - JITTER_SCALE)
}

/**
 * Converts FamilyMember[] into UPerson[] + UEdge[] for the universe canvas.
 *
 * Handles:
 *  1. Core family  → BFS from self via parentIds / spouseIds / children
 *  2. Extended     → same BFS, appear at deeper rings automatically
 *  3. Affiliated   → placed as outer community cluster, grouped by gotra/city
 *     and connected to the nearest core member via 'suggested' edges
 */
export function buildUniverse(
  members: FamilyMember[],
  selfId: string,
): { people: UPerson[]; edges: UEdge[] } {
  if (!selfId || members.length === 0) return { people: [], edges: [] }

  const memberMap = new Map(members.map(m => [m.id, m]))
  const self = memberMap.get(selfId)
  if (!self) return { people: [], edges: [] }

  // ── 1. BFS to find depth of each reachable core/extended member ──────────
  const depth = new Map<string, number>([[selfId, 0]])
  const visited = new Set<string>([selfId])
  const queue = [selfId]
  let head = 0

  while (head < queue.length) {
    const id = queue[head++]
    const m = memberMap.get(id)
    if (!m) continue
    const d = depth.get(id)!

    const neighbors: string[] = [
      ...m.parentIds,
      ...m.spouseIds,
      ...members.filter(x => x.parentIds.includes(id)).map(x => x.id),
    ]
    for (const nid of neighbors) {
      if (!visited.has(nid) && memberMap.has(nid)) {
        visited.add(nid)
        depth.set(nid, d + 1)
        queue.push(nid)
      }
    }
  }

  // ── 2. Assign categories ──────────────────────────────────────────────────
  const category = new Map<string, UCategory>([[selfId, 'self']])

  for (const m of members) {
    if (m.id === selfId) continue

    let cat: UCategory
    if (m.networkGroup === 'affiliated') {
      cat = 'community'
    } else if (
      m.side === 'spouse' ||
      self.spouseIds.includes(m.id) ||
      m.spouseIds.includes(selfId)
    ) {
      cat = 'marriage'
    } else if (m.side === 'paternal') {
      cat = 'paternal'
    } else if (m.side === 'maternal') {
      cat = 'maternal'
    } else {
      const rel = (m.relationship ?? '').toLowerCase()
      if (rel.includes('maternal') || rel === 'mother' || rel === 'mother-in-law') {
        cat = 'maternal'
      } else if (rel.includes('in-law') || rel === 'spouse' || rel === 'husband' || rel === 'wife') {
        cat = 'marriage'
      } else {
        cat = 'paternal'   // default for untagged blood relatives
      }
    }
    category.set(m.id, cat)
  }

  // ── 3. Group by (category, depth) for sector-ring placement ──────────────
  // Each sector has multiple rings; each ring holds at most
  // floor(sector_arc_span / MIN_ANG_GAP) nodes.
  type RingSlot = { id: string; depthVal: number }
  const catDepthGroups = new Map<string, RingSlot[]>()  // key = `${cat}|${depth}`

  for (const m of members) {
    if (m.id === selfId) continue
    const cat = category.get(m.id) ?? 'paternal'
    const d = depth.get(m.id)    // undefined if affiliated/unreachable

    if (cat === 'community' || d === undefined) {
      // Affiliated members get special placement below
      continue
    }
    const key = `${cat}|${d}`
    if (!catDepthGroups.has(key)) catDepthGroups.set(key, [])
    catDepthGroups.get(key)!.push({ id: m.id, depthVal: d })
  }

  // ── 4. Radial placement for core + extended members ───────────────────────
  const positions = new Map<string, { x: number; y: number }>([[selfId, { x: 0, y: 0 }]])

  for (const [key, slots] of catDepthGroups) {
    const [catStr, depthStr] = key.split('|')
    const cat = catStr as UCategory
    const d = parseInt(depthStr)
    const [arcStart, arcEnd] = SECTOR_ARC[cat]
    const arcSpan = arcEnd - arcStart   // radians

    // How many nodes fit per ring given minimum angular gap?
    const maxPerRing = Math.max(1, Math.floor(Math.abs(arcSpan) / MIN_ANG_GAP))

    // Split slots across sub-rings at this depth
    const rings: RingSlot[][] = []
    for (let i = 0; i < slots.length; i += maxPerRing) {
      rings.push(slots.slice(i, i + maxPerRing))
    }

    rings.forEach((ring, ringIdx) => {
      // Each overflow sub-ring adds 80 px outward
      const r = BASE_RING_RADIUS + d * RING_STEP + ringIdx * 85
      const n = ring.length

      ring.forEach(({ id }, i) => {
        // Distribute evenly within the arc, with edge padding
        const fraction = n === 1 ? 0.5 : i / (n - 1)
        const angle = arcStart + fraction * arcSpan
        const jitter = deterministicJitter(id)
        positions.set(id, {
          x: Math.cos(angle) * (r + jitter),
          y: Math.sin(angle) * (r + jitter),
        })
      })
    })
  }

  // ── 5. Community / affiliated cluster placement ───────────────────────────
  // Group affiliated members by shared attribute (gotra → city → fallback)
  // Place each group as a mini-cluster in the community sector's outer ring.

  const affiliated = members.filter(m => {
    if (m.id === selfId) return false
    return category.get(m.id) === 'community' || !depth.has(m.id)
  })

  if (affiliated.length > 0) {
    // Group by gotra/caste, then by city, then ungrouped
    const groups = new Map<string, FamilyMember[]>()
    for (const m of affiliated) {
      const key = m.gotra || m.caste || m.hometown || m.currentPlace || 'other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }

    const [arcStart, arcEnd] = SECTOR_ARC.community
    const arcSpan = arcEnd - arcStart
    const groupList = [...groups.values()]
    const numGroups = groupList.length

    groupList.forEach((group, gi) => {
      // Center angle for this group within community sector
      const groupFraction = numGroups === 1 ? 0.5 : gi / (numGroups - 1)
      const groupAngle = arcStart + groupFraction * arcSpan

      // Radius: outer ring beyond core family (depth 4+)
      const groupRadius = BASE_RING_RADIUS + 4 * RING_STEP + 60

      // Within the group, spread in a small fan around groupAngle
      const fanSpread = Math.min(0.5, (group.length - 1) * 0.18)
      group.forEach((m, mi) => {
        const fraction = group.length === 1 ? 0.5 : mi / (group.length - 1)
        const angle = groupAngle - fanSpread / 2 + fraction * fanSpread
        const r = groupRadius + (mi % 2) * 80
        const jitter = deterministicJitter(m.id)
        positions.set(m.id, {
          x: Math.cos(angle) * (r + jitter),
          y: Math.sin(angle) * (r + jitter),
        })
        // Assign depth for progressive reveal (community always at depth 4)
        if (!depth.has(m.id)) depth.set(m.id, 4)
        if (!category.has(m.id)) category.set(m.id, 'community')
      })
    })
  }

  // ── 6. Build UPerson list ─────────────────────────────────────────────────
  // parentOf = IDs that are someone's parent in this tree
  const parentOf = new Set(members.flatMap(m => m.parentIds))
  const people: UPerson[] = []

  for (const m of members) {
    const pos = positions.get(m.id)
    if (!pos) continue

    const d = depth.get(m.id) ?? 4
    const cat = category.get(m.id) ?? 'paternal'
    const nameParts = m.name.trim().split(/\s+/)
    const initials = nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : m.name.substring(0, 2).toUpperCase()

    const size = d === 0 ? 1.7 : d === 1 ? 1.28 : d === 2 ? 1.0 : d === 3 ? 0.82 : 0.68

    people.push({
      id: m.id, name: m.name, initials, category: cat,
      x: pos.x, y: pos.y, size, hue: HUE[cat],
      relation: typeof m.relationship === 'string' ? m.relationship : '',
      city: m.currentPlace ?? m.birthPlace ?? m.hometown ?? '',
      gotra: m.gotra ?? m.caste ?? '',
      verified: !!m.claimedByUserId,
      depth: d,
      hasChildren: parentOf.has(m.id),
    })
  }

  // ── 7. Build UEdge list (deduplicated) ────────────────────────────────────
  const edgeSet = new Set<string>()
  const edges: UEdge[] = []

  const addEdge = (from: string, to: string, kind: UEdgeKind) => {
    if (!positions.has(from) || !positions.has(to)) return
    const key = [from, to].sort().join('|')
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      edges.push({ id: key, from, to, kind })
    }
  }

  for (const m of members) {
    for (const pid of m.parentIds) addEdge(m.id, pid, 'blood')
    for (const sid of m.spouseIds) addEdge(m.id, sid, 'marriage')
  }

  // Community suggested edges: connect each affiliated member to the closest
  // core family member sharing the same gotra/city (if any exists)
  const coreMemberIds = people.filter(p => p.category !== 'community').map(p => p.id)
  for (const m of affiliated) {
    if (!positions.has(m.id)) continue
    const match = coreMemberIds.find(cid => {
      const cm = memberMap.get(cid)!
      return (m.gotra && cm.gotra === m.gotra) ||
        (m.caste && cm.caste === m.caste) ||
        (m.hometown && cm.hometown === m.hometown)
    })
    if (match) addEdge(m.id, match, 'community')
    else if (coreMemberIds.length > 0) addEdge(m.id, selfId, 'suggested')
  }

  return { people, edges }
}

// ─── Viewport culling ──────────────────────────────────────────────────────

function isOnScreen(px: number, py: number, cx: number, cy: number, k: number, sw: number, sh: number, margin = 140): boolean {
  const sx = cx + px * k, sy = cy + py * k
  return sx > -margin && sx < sw + margin && sy > -margin && sy < sh + margin
}

// ─── Main component ────────────────────────────────────────────────────────

interface Props {
  members: FamilyMember[]
  selfMemberId: string | null
  selectedMemberId: string | null
  onSelectMember: (id: string) => void
}

export function RelationshipUniverse({ members, selfMemberId, selectedMemberId, onSelectMember }: Props) {
  const effectiveSelfId = selfMemberId ?? members[0]?.id ?? ''

  // ── Graph data ───────────────────────────────────────────────────────────
  const { people, edges } = useMemo(() => buildUniverse(members, effectiveSelfId), [members, effectiveSelfId])
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const maxDepth = useMemo(() => Math.max(0, ...people.map(p => p.depth)), [people])

  // Adjacency map — used for focus-mode opacity
  const adjacencyMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const e of edges) {
      if (!map.has(e.from)) map.set(e.from, new Set())
      if (!map.has(e.to)) map.set(e.to, new Set())
      map.get(e.from)!.add(e.to)
      map.get(e.to)!.add(e.from)
    }
    return map
  }, [edges])

  // ── Progressive reveal ───────────────────────────────────────────────────
  const [visibleDepth, setVisibleDepth] = useState(1)
  useEffect(() => {
    setVisibleDepth(1)
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 2; i <= maxDepth; i++) timers.push(setTimeout(() => setVisibleDepth(i), (i - 1) * 520))
    return () => timers.forEach(clearTimeout)
  }, [people.length, maxDepth])

  // ── Canvas ───────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 0.88 })
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
  const isPanning = useRef(false)

  useEffect(() => {
    const update = () => {
      if (!wrapRef.current) return
      const r = wrapRef.current.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.08 : 0.92
    setView(v => ({ ...v, k: Math.min(3.2, Math.max(0.2, v.k * factor)) }))
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    ; (e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
    isPanning.current = false
  }, [view.x, view.y])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.hypot(dx, dy) > 3) isPanning.current = true
    setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }, [])

  const onPointerUp = useCallback(() => { drag.current = null }, [])

  const cx = size.w / 2 + view.x
  const cy = size.h / 2 + view.y
  const k = view.k

  // ── Semantic zoom level ──────────────────────────────────────────────────
  const zoomLevel: 'cluster' | 'name' | 'detail' | 'full' =
    k < 0.5 ? 'cluster' :
      k < 0.8 ? 'name' :
        k < 1.1 ? 'detail' : 'full'

  // ── Hover / focus state ──────────────────────────────────────────────────
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const focusId = selectedMemberId ?? hoveredId

  const adjacentToFocus = useMemo(() => {
    if (!focusId) return new Set<string>()
    return adjacencyMap.get(focusId) ?? new Set<string>()
  }, [focusId, adjacencyMap])

  // ── Filter ───────────────────────────────────────────────────────────────
  const [filterCat, setFilterCat] = useState<UCategory | null>(null)

  // ── Visible set ──────────────────────────────────────────────────────────
  const visibleIds = useMemo(() => {
    const ids = new Set<string>()
    for (const p of people) {
      if (p.depth > visibleDepth) continue
      if (filterCat && p.category !== filterCat && p.category !== 'self') continue
      if (!isOnScreen(p.x, p.y, cx, cy, k, size.w, size.h)) continue
      ids.add(p.id)
    }
    return ids
  }, [people, visibleDepth, filterCat, cx, cy, k, size])

  const visibleEdges = useMemo(
    () => edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to)),
    [edges, visibleIds],
  )

  // ── Opacity helpers ──────────────────────────────────────────────────────
  // Visual noise reduction: edges ~8% by default; connections emerge on interaction.
  function nodeOpacity(p: UPerson): number {
    if (selectedMemberId) {
      if (p.id === selectedMemberId) return 1
      if (adjacentToFocus.has(p.id)) return 0.82
      return 0.22
    }
    if (hoveredId) {
      if (p.id === hoveredId) return 1
      if (adjacentToFocus.has(p.id)) return 0.85
      return 0.38
    }
    return 0.72
  }

  function edgeOpacity(e: UEdge): number {
    const fid = selectedMemberId ?? hoveredId
    if (fid) {
      const connected = e.from === fid || e.to === fid
      return connected ? 0.72 : 0.03
    }
    return e.kind === 'blood' ? 0.08 : e.kind === 'marriage' ? 0.10 : 0.05
  }

  // ── Relation labels — lazy, visible nodes only ───────────────────────────
  const relationLabels = useMemo(() => {
    if (zoomLevel === 'cluster') return new Map<string, string>()
    const map = new Map<string, string>()
    for (const id of visibleIds) {
      if (id === effectiveSelfId) continue
      const label = computeRelationLabel(effectiveSelfId, id, members)
      if (label) map.set(id, label)
    }
    return map
  }, [visibleIds, effectiveSelfId, members, zoomLevel])

  // ── Analytics ────────────────────────────────────────────────────────────
  const [showAnalytics, setShowAnalytics] = useState(false)
  const analytics = useMemo(() => {
    const counts: Record<UCategory, number> = { self: 0, paternal: 0, maternal: 0, marriage: 0, community: 0 }
    const cities = new Map<string, number>()
    const gotras = new Map<string, number>()
    for (const p of people) {
      if (p.category !== 'self') counts[p.category]++
      if (p.city) cities.set(p.city, (cities.get(p.city) ?? 0) + 1)
      if (p.gotra) gotras.set(p.gotra, (gotras.get(p.gotra) ?? 0) + 1)
    }
    return {
      counts, maxDepth,
      total: people.filter(p => p.category !== 'self').length,
      topCities: [...cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      topGotras: [...gotras.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }
  }, [people, maxDepth])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 universe-canvas cursor-grab active:cursor-grabbing select-none overflow-hidden"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >

      {/* ── SVG: atmospheric depth blooms + edges ──────────────────── */}
      <svg width={size.w} height={size.h} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <defs>
          <radialGradient id="uBgBloom" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.18)" />
            <stop offset="60%" stopColor="rgba(139,92,246,0.06)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="uCenterCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.20)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="uPatBloom" cx="35%" cy="40%" r="38%">
            <stop offset="0%" stopColor="rgba(59,130,246,0.07)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="uMatBloom" cx="65%" cy="40%" r="38%">
            <stop offset="0%" stopColor="rgba(245,158,11,0.06)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Environmental depth atmosphere */}
        <rect x="0" y="0" width={size.w} height={size.h} fill="url(#uPatBloom)" />
        <rect x="0" y="0" width={size.w} height={size.h} fill="url(#uMatBloom)" />
        <ellipse cx={cx} cy={cy} rx={520 * k} ry={400 * k} fill="url(#uBgBloom)" />
        <circle cx={cx} cy={cy} r={78 * k} fill="url(#uCenterCore)" opacity="0.7" />

        {/* Edges — very low opacity by default; emerge on focus */}
        <g>
          {visibleEdges.map(e => {
            const a = peopleById.get(e.from), b = peopleById.get(e.to)
            if (!a || !b) return null
            const x1 = cx + a.x * k, y1 = cy + a.y * k
            const x2 = cx + b.x * k, y2 = cy + b.y * k
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
            const dx = x2 - x1, dy = y2 - y1
            const len = Math.hypot(dx, dy) || 1
            const nx = -dy / len, ny = dx / len
            const curve = Math.min(55, len * 0.17)
            const qx = mx + nx * curve, qy = my + ny * curve

            const opacity = edgeOpacity(e)
            const stroke = EDGE_COLOR[e.kind]
            const dash = e.kind === 'suggested' ? '3 8' : e.kind === 'community' ? '2 6' : 'none'
            const strokeW = e.kind === 'marriage' ? 1.6 : 1.0

            return (
              <g key={e.id} opacity={opacity} style={{ transition: 'opacity 0.42s ease' }}>
                <path
                  d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`}
                  stroke={stroke} strokeOpacity={0.52}
                  strokeWidth={strokeW} fill="none"
                  strokeDasharray={dash} strokeLinecap="round"
                />
                {opacity > 0.25 && (
                  <path
                    d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`}
                    stroke={stroke} strokeOpacity={0.40}
                    strokeWidth={0.62} fill="none"
                    strokeDasharray="6 18" className="edge-flow"
                    strokeLinecap="round"
                  />
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* ── Node layer ──────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
        <AnimatePresence>
          {people.filter(p => visibleIds.has(p.id)).map(p => {
            const px = cx + p.x * k
            const py = cy + p.y * k
            const r = 34 * p.size * Math.max(0.55, k)

            const isSelected = selectedMemberId === p.id
            const isHovered = hoveredId === p.id
            const opacity = nodeOpacity(p)
            const color = CATEGORY_COLOR[p.category]

            const showName = zoomLevel !== 'cluster'
            const showRelation = zoomLevel === 'detail' || zoomLevel === 'full'
            const showCity = zoomLevel === 'full'
            const label = relationLabels.get(p.id) ?? p.relation

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity, scale: 1 }}
                exit={{ opacity: 0, scale: 0.2 }}
                transition={{
                  opacity: { duration: 0.32 },
                  scale: { type: 'spring', stiffness: 200, damping: 22, delay: Math.min(p.depth * 0.045, 0.35) },
                }}
                style={{ position: 'absolute', left: px - r, top: py - r, width: r * 2, height: r * 2 }}
                className="pointer-events-auto"
              >
                <button
                  className={cn(
                    'relative w-full h-full focus:outline-none',
                    isSelected ? 'node-breath-selected' : 'node-breath',
                  )}
                  onClick={ev => {
                    ev.stopPropagation()
                    if (!isPanning.current) onSelectMember(p.id)
                  }}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Atmospheric glow ring */}
                  <span
                    className="absolute inset-0 rounded-full transition-all duration-500"
                    style={{
                      boxShadow: `0 0 ${isSelected ? 55 : isHovered ? 36 : 16}px ${color}, 0 0 ${isSelected ? 95 : isHovered ? 62 : 26}px ${color}`,
                      opacity: isSelected ? 0.92 : isHovered ? 0.76 : 0.42,
                    }}
                  />
                  {/* Verified halo */}
                  {p.verified && (
                    <span className="absolute -inset-[3px] rounded-full border-2 opacity-68"
                      style={{ borderColor: 'oklch(0.95 0.03 230 / 0.72)' }} />
                  )}
                  {/* Selected orbit ring */}
                  {isSelected && (
                    <span className="absolute rounded-full border border-white/18"
                      style={{ inset: `-${r * 0.28}px`, animation: 'orbitRing 8s linear infinite' }} />
                  )}
                  {/* Avatar disc */}
                  <span
                    className="absolute inset-0 rounded-full grid place-items-center font-semibold text-white"
                    style={{
                      background: `radial-gradient(circle at 30% 25%, oklch(0.92 0.07 ${p.hue} / ${isSelected ? 1 : 0.88}), oklch(0.30 0.15 ${p.hue} / 0.96) 62%, oklch(0.16 0.08 ${p.hue}) 100%)`,
                      fontSize: Math.max(9, r * 0.50),
                      border: `1px solid oklch(1 0 0 / ${isSelected ? 0.22 : 0.12})`,
                      boxShadow: isSelected ? `inset 0 0 16px ${color}` : isHovered ? `inset 0 0 8px ${color}` : undefined,
                    }}
                  >
                    {p.initials}
                  </span>
                  {/* Semantic zoom labels */}
                  {showName && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none"
                      style={{ top: r * 2 + 5 }}
                    >
                      <span className="block font-medium text-white leading-tight drop-shadow-sm"
                        style={{ fontSize: Math.max(9, Math.min(13, r * 0.44)) }}>
                        {p.name}
                      </span>
                      {showRelation && (label || showCity) && (
                        <span className="block text-white/46 leading-tight"
                          style={{ fontSize: Math.max(8, Math.min(11, r * 0.34)) }}>
                          {label}{showCity && p.city ? ` · ${p.city}` : ''}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* ── Filter chips ───────────────────────────────────────────── */}
      <div className="absolute top-4 left-4 z-30 flex flex-col gap-1.5" style={{ zIndex: 10 }}>
        {([
          { cat: null, label: 'All', color: '#818cf8' },
          { cat: 'paternal', label: 'Paternal', color: 'var(--paternal)' },
          { cat: 'maternal', label: 'Maternal', color: 'var(--maternal)' },
          { cat: 'marriage', label: 'Marriage', color: 'var(--marriage)' },
          { cat: 'community', label: 'Community', color: 'var(--community)' },
        ] as { cat: UCategory | null; label: string; color: string }[]).map(({ cat, label, color }) => (
          <button
            key={label}
            onClick={() => setFilterCat(cat)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium border transition-all text-left',
              filterCat === cat
                ? 'bg-white/8 text-white'
                : 'bg-black/28 border-white/5 text-white/38 hover:text-white/62 hover:bg-black/35',
            )}
            style={filterCat === cat ? { borderColor: color, color } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Analytics ────────────────────────────────────────────────── */}
      <button
        onClick={() => setShowAnalytics(v => !v)}
        style={{ zIndex: 10 }}
        className={cn(
          'absolute bottom-14 left-4 rounded-full px-3 py-1.5 text-[11px] font-medium border backdrop-blur-md transition-all',
          showAnalytics
            ? 'bg-indigo-500/15 border-indigo-400/35 text-indigo-300'
            : 'bg-black/35 border-white/6 text-white/42 hover:text-white/65',
        )}
      >
        ◈ Analytics
      </button>

      <AnimatePresence>
        {showAnalytics && (
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            className="absolute bottom-14 right-4 z-30 w-64 rounded-2xl border border-white/10 bg-black/70 backdrop-blur-2xl p-4 shadow-2xl"
            style={{ zIndex: 10 }}
          >
            <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-3">Relationship Intelligence</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm border-b border-white/5 pb-2">
                <span className="text-white/45">Total relatives</span>
                <span className="font-semibold text-white">{analytics.total}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/42">Generations deep</span>
                <span className="text-white/68">{analytics.maxDepth}</span>
              </div>
              <div className="space-y-2 pt-0.5">
                {([
                  { label: 'Paternal', key: 'paternal' as UCategory, color: 'var(--paternal)' },
                  { label: 'Maternal', key: 'maternal' as UCategory, color: 'var(--maternal)' },
                  { label: 'Marriage', key: 'marriage' as UCategory, color: 'var(--marriage)' },
                  { label: 'Community', key: 'community' as UCategory, color: 'var(--community)' },
                ]).map(({ label, key, color }) => {
                  const count = analytics.counts[key]
                  const pct = analytics.total > 0 ? (count / analytics.total) * 100 : 0
                  return (
                    <div key={key} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/45">{label}</span>
                        <span className="text-white/62">{count}</span>
                      </div>
                      <div className="h-[3px] rounded-full bg-white/5 overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ delay: 0.15, duration: 0.55 }}
                          className="h-full rounded-full" style={{ background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {analytics.topCities.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] text-white/32 uppercase tracking-widest mb-1.5">City Spread</p>
                  <div className="flex flex-wrap gap-1">
                    {analytics.topCities.map(([city, count]) => (
                      <span key={city} className="rounded-full bg-white/5 border border-white/7 px-2 py-0.5 text-[10px] text-white/52">{city} ({count})</span>
                    ))}
                  </div>
                </div>
              )}
              {analytics.topGotras.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] text-white/32 uppercase tracking-widest mb-1.5">Gotra / Community</p>
                  <div className="flex flex-wrap gap-1">
                    {analytics.topGotras.map(([g, count]) => (
                      <span key={g} className="rounded-full bg-amber-500/8 border border-amber-500/14 px-2 py-0.5 text-[10px] text-amber-300/62">{g} ({count})</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Legend + zoom level indicator ───────────────────────────── */}
      <div
        className="absolute bottom-4 left-4 right-4 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-white/5 bg-black/32 backdrop-blur-md px-4 py-1.5"
        style={{ zIndex: 10 }}
      >
        {([
          { color: 'var(--paternal)', label: 'Paternal' },
          { color: 'var(--maternal)', label: 'Maternal' },
          { color: 'var(--marriage)', label: 'Marriage' },
          { color: 'var(--community)', label: 'Community' },
        ]).map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[10px] text-white/38">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-white/25 shrink-0 hidden sm:block">
          {zoomLevel === 'cluster' ? 'Cluster' : zoomLevel === 'name' ? 'Name' : zoomLevel === 'detail' ? 'Detail' : 'Full'} view · {Math.round(k * 100)}%
        </span>
      </div>
    </div>
  )
}
