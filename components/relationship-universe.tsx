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
  isBirthday: boolean
  birthdayDaysAway: number | null  // 0 = today, 1-6 = upcoming this week
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

/** Returns days until this person's next birthday (0 = today, null = unknown). */
function daysUntilBirthday(m: FamilyMember): number | null {
  let month: number | undefined, day: number | undefined
  if (m.dateOfBirth) {
    const d = new Date(m.dateOfBirth)
    if (!isNaN(d.getTime())) { month = d.getMonth() + 1; day = d.getDate() }
  } else {
    month = m.birthMonth; day = m.birthDay
  }
  if (!month || !day) return null
  const now = new Date()
  const thisYear = new Date(now.getFullYear(), month - 1, day)
  const diff = Math.ceil((thisYear.getTime() - now.setHours(0, 0, 0, 0)) / 86_400_000)
  if (diff >= 0) return diff
  // already passed this year — next birthday is next year
  const nextYear = new Date(now.getFullYear() + 1, month - 1, day)
  return Math.ceil((nextYear.getTime() - Date.now()) / 86_400_000)
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
    const daysAway = daysUntilBirthday(m)

    people.push({
      id: m.id, name: m.name, initials, category: cat,
      x: pos.x, y: pos.y, size, hue: HUE[cat],
      relation: typeof m.relationship === 'string' ? m.relationship : '',
      city: m.currentPlace ?? m.birthPlace ?? m.hometown ?? '',
      gotra: m.gotra ?? m.caste ?? '',
      verified: !!m.claimedByUserId,
      depth: d,
      hasChildren: parentOf.has(m.id),
      isBirthday: daysAway !== null && daysAway <= 6,
      birthdayDaysAway: daysAway,
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
  /** Path highlight injected from the dashboard's PathFinderPanel */
  pathHighlight?: { nodes: Set<string>; edges: Set<string>; sequence: string[] }
  /** Called when the user wants to open the path finder (optionally pre-seeded with a member) */
  onOpenPathFinder?: (fromMemberId?: string) => void
  /** Whether the external path finder panel is currently open (for legend button state) */
  pathFinderOpen?: boolean
  /** Called when the user taps "Add first member" in the empty state */
  onAddMember?: () => void
}

export function RelationshipUniverse({
  members,
  selfMemberId,
  selectedMemberId,
  onSelectMember,
  pathHighlight,
  onOpenPathFinder,
  pathFinderOpen = false,
  onAddMember,
}: Props) {
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
    // Auto-reveal up to depth 3 (self + 2 rings ≈ immediate family).
    // Beyond that the user expands via the Network button — avoids first-load overwhelm.
    for (let i = 2; i <= Math.min(maxDepth, 3); i++) timers.push(setTimeout(() => setVisibleDepth(i), (i - 1) * 520))
    return () => timers.forEach(clearTimeout)
  }, [people.length, maxDepth])

  // ── Canvas ───────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 0.88 })
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const sizeRef = useRef({ w: 1200, h: 800 })      // always-current, no stale closures in handlers
  const [isMobileView, setIsMobileView] = useState(false)
  const [showMobileControls, setShowMobileControls] = useState(true)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Multi-touch tracking
  const activePointers = useRef(new Map<number, { x: number; y: number }>())
  const lastPinchDist = useRef<number | null>(null)
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
  const isPanning = useRef(false)
  // Inertia
  const velRef = useRef({ vx: 0, vy: 0 })
  const lastPosRef = useRef({ x: 0, y: 0, t: 0 })
  const inertiaRaf = useRef<number | null>(null)
  // Double-tap detection
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null)

  // Cinematic pan: always-current view for animation start
  const viewRef = useRef({ x: 0, y: 0, k: 0.88 })
  useEffect(() => { viewRef.current = view }, [view])
  const panAnimRef = useRef<number | null>(null)
  // Tracks whether the most recent selection came from an internal node click
  const internalClickRef = useRef(false)

  // Animate view to center the selected member (only for external/search selections)
  useEffect(() => {
    if (!selectedMemberId) return
    if (internalClickRef.current) { internalClickRef.current = false; return }
    const p = peopleById.get(selectedMemberId)
    if (!p) return
    if (panAnimRef.current) { cancelAnimationFrame(panAnimRef.current); panAnimRef.current = null }
    const sv = viewRef.current
    const targetK = Math.max(sv.k, isMobileView ? 0.72 : 0.92)
    const targetX = -p.x * targetK
    const targetY = -p.y * targetK
    const [sx, sy, sk] = [sv.x, sv.y, sv.k]
    const dur = 480, t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setView({ x: sx + (targetX - sx) * e, y: sy + (targetY - sy) * e, k: sk + (targetK - sk) * e })
      if (t < 1) panAnimRef.current = requestAnimationFrame(step)
      else panAnimRef.current = null
    }
    panAnimRef.current = requestAnimationFrame(step)
  }, [selectedMemberId, peopleById, isMobileView])
  useEffect(() => () => { if (panAnimRef.current) cancelAnimationFrame(panAnimRef.current) }, [])

  // ── Path-finding ─────────────────────────────────────────────────────────
  const [pathFrom, setPathFrom] = useState<string | null>(null)
  const [pathNodes, setPathNodes] = useState<Set<string>>(new Set())
  const [pathEdges, setPathEdges] = useState<Set<string>>(new Set())
  const [pathSequence, setPathSequence] = useState<string[]>([])
  const [isPathFindingMode, setIsPathFindingMode] = useState(false)
  const [showIntelPanel, setShowIntelPanel] = useState(false)
  const [portalPair, setPortalPair] = useState<{ from: string; to: string } | null>(null)
  const portalTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const findPath = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) { setPathNodes(new Set([fromId])); setPathEdges(new Set()); setPathSequence([fromId]); return }
    const parent = new Map<string, string>([[fromId, '']])
    const queue = [fromId]
    let found = false
    outer: while (queue.length > 0) {
      const cur = queue.shift()!
      for (const nid of (adjacencyMap.get(cur) ?? new Set())) {
        if (!parent.has(nid)) {
          parent.set(nid, cur)
          if (nid === toId) { found = true; break outer }
          queue.push(nid)
        }
      }
    }
    if (!found) { setPathNodes(new Set()); setPathEdges(new Set()); setPathSequence([]); return }
    const nodes: string[] = [], edgeKeys = new Set<string>()
    let cur = toId
    while (cur) {
      nodes.unshift(cur)
      const prev = parent.get(cur)!
      if (prev) edgeKeys.add([prev, cur].sort().join('|'))
      cur = prev
    }
    setPathNodes(new Set(nodes))
    setPathEdges(edgeKeys)
    setPathSequence(nodes)
    setPathFrom(fromId)
  }, [adjacencyMap])

  useEffect(() => {
    const update = () => {
      if (!wrapRef.current) return
      const r = wrapRef.current.getBoundingClientRect()
      const next = { w: r.width, h: r.height }
      setSize(next)
      sizeRef.current = next
      const mobile = r.width < 768
      setIsMobileView(mobile)
    }
    update()
    // Adaptive initial zoom for mobile
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setView(v => ({ ...v, k: 0.52 }))
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Mobile controls auto-hide
  const resetControlsTimer = useCallback(() => {
    setShowMobileControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setShowMobileControls(false), 2800)
  }, [])
  useEffect(() => () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current) }, [])

  // Cancel any in-flight inertia animation on unmount
  useEffect(() => () => { if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current) }, [])

  // Cleanup any staged reveal timers used by portal exploration actions.
  useEffect(() => () => {
    portalTimers.current.forEach(clearTimeout)
    portalTimers.current = []
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.08 : 0.92
    setView(v => ({ ...v, k: Math.min(3.2, Math.max(0.2, v.k * factor)) }))
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (inertiaRaf.current) { cancelAnimationFrame(inertiaRaf.current); inertiaRaf.current = null }
    ; (e.target as Element).setPointerCapture?.(e.pointerId)
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointers.current.size === 1) {
      // Double-tap detection for mobile zoom
      const now = Date.now()
      const last = lastTapRef.current
      if (last && now - last.t < 280 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 44) {
        setView(v => {
          const nk = Math.min(3.2, v.k * 1.65)
          const r = nk / v.k
          const dx = e.clientX - sizeRef.current.w / 2
          const dy = e.clientY - sizeRef.current.h / 2
          return { x: dx * (1 - r) + v.x * r, y: dy * (1 - r) + v.y * r, k: nk }
        })
        lastTapRef.current = null
        return
      }
      lastTapRef.current = { t: now, x: e.clientX, y: e.clientY }

      drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      velRef.current = { vx: 0, vy: 0 }
      lastPosRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
      isPanning.current = false
      lastPinchDist.current = null
    } else {
      // Second finger — enter pinch mode, disable pan
      drag.current = null
      lastPinchDist.current = null
    }
    if (isMobileView) resetControlsTimer()
  }, [view.x, view.y, isMobileView, resetControlsTimer])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pointers = [...activePointers.current.values()]

    if (pointers.length >= 2) {
      // Pinch-to-zoom: keep midpoint fixed in world space
      const [p1, p2] = pointers
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      if (lastPinchDist.current !== null && lastPinchDist.current > 0) {
        const ratio = dist / lastPinchDist.current
        const midX = (p1.x + p2.x) / 2
        const midY = (p1.y + p2.y) / 2
        setView(v => {
          const nk = Math.min(3.2, Math.max(0.2, v.k * ratio))
          const r = nk / v.k
          const dx = midX - sizeRef.current.w / 2
          const dy = midY - sizeRef.current.h / 2
          return { x: dx * (1 - r) + v.x * r, y: dy * (1 - r) + v.y * r, k: nk }
        })
      }
      lastPinchDist.current = dist
      drag.current = null
      return
    }

    // Single pointer pan
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.hypot(dx, dy) > 3) isPanning.current = true
    const now = Date.now(), dt = now - lastPosRef.current.t
    if (dt > 0 && dt < 80) {
      velRef.current.vx = (e.clientX - lastPosRef.current.x) / dt * 14
      velRef.current.vy = (e.clientY - lastPosRef.current.y) / dt * 14
    }
    lastPosRef.current = { x: e.clientX, y: e.clientY, t: now }
    setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }, [])

  const releasePointer = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) lastPinchDist.current = null

    if (activePointers.current.size === 0) {
      drag.current = null
      const { vx, vy } = velRef.current
      if (Math.hypot(vx, vy) < 0.8) return
      const step = () => {
        velRef.current.vx *= 0.90
        velRef.current.vy *= 0.90
        if (Math.hypot(velRef.current.vx, velRef.current.vy) < 0.4) {
          inertiaRaf.current = null; return
        }
        setView(v => ({ ...v, x: v.x + velRef.current.vx, y: v.y + velRef.current.vy }))
        inertiaRaf.current = requestAnimationFrame(step)
      }
      inertiaRaf.current = requestAnimationFrame(step)
    }
  }, [])

  const cx = size.w / 2 + view.x
  const cy = size.h / 2 + view.y
  const k = view.k

  // ── Semantic zoom level ──────────────────────────────────────────────────
  const zoomLevel: 'cluster' | 'name' | 'detail' | 'full' =
    k < 0.5 ? 'cluster' :
      k < 0.8 ? 'name' :
        k < 1.1 ? 'detail' : 'full'

  // Small deterministic ambient particles to make the canvas feel alive.
  const ambientParticles = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => ({
      id: `p-${i}`,
      left: ((i * 37) % 100),
      top: ((i * 19 + 11) % 100),
      size: 1.6 + (i % 4) * 0.9,
      duration: 9 + (i % 5) * 2.4,
      delay: (i % 6) * 0.55,
      opacity: 0.14 + (i % 3) * 0.08,
      color: i % 3 === 0 ? 'var(--star-color-1)' : i % 3 === 1 ? 'var(--star-color-2)' : 'var(--star-color-3)',
    }))
  }, [])

  // ── Hover / focus state ──────────────────────────────────────────────────
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const focusId = selectedMemberId ?? hoveredId
  const selectedPerson = selectedMemberId ? peopleById.get(selectedMemberId) : undefined

  const selectedAnchor = useMemo(() => {
    if (!selectedPerson) return null
    const sx = cx + selectedPerson.x * k
    const sy = cy + selectedPerson.y * k
    if (sx < 24 || sx > size.w - 24 || sy < 24 || sy > size.h - 24) return null
    return { x: sx, y: sy }
  }, [selectedPerson, cx, cy, k, size.w, size.h])

  const marriageNeighbors = useMemo(() => {
    if (!selectedMemberId) return [] as string[]
    const out: string[] = []
    for (const e of edges) {
      if (e.kind !== 'marriage') continue
      if (e.from === selectedMemberId) out.push(e.to)
      if (e.to === selectedMemberId) out.push(e.from)
    }
    return Array.from(new Set(out))
  }, [edges, selectedMemberId])

  const panToPerson = useCallback((id: string, nextZoom?: number, biasX = 0) => {
    const p = peopleById.get(id)
    if (!p) return
    setView(v => {
      const nk = nextZoom ?? v.k
      const nx = biasX - p.x * nk
      const ny = -p.y * nk
      return { x: nx, y: ny, k: nk }
    })
  }, [peopleById])

  // Pan to "You" node on first load so the user is always centred in their universe
  const hasMountedPan = useRef(false)
  useEffect(() => {
    if (!effectiveSelfId || hasMountedPan.current || people.length === 0) return
    hasMountedPan.current = true
    const t = setTimeout(() => panToPerson(effectiveSelfId, isMobileView ? 0.72 : 0.92), 750)
    return () => clearTimeout(t)
  }, [effectiveSelfId, people.length, panToPerson, isMobileView])

  const runMarriagePortal = useCallback(() => {
    if (!selectedMemberId || marriageNeighbors.length === 0) return
    const spouseId = marriageNeighbors[0]
    const from = peopleById.get(selectedMemberId)
    const to = peopleById.get(spouseId)
    if (!from || !to) return

    setPortalPair({ from: selectedMemberId, to: spouseId })
    findPath(selectedMemberId, spouseId)
    setPathFrom(selectedMemberId)

    // Cinematic bridge: shift focus toward spouse side while preserving origin in frame.
    setView(v => {
      const nk = Math.max(0.9, Math.min(1.2, v.k * 1.06))
      const midX = (from.x + to.x) / 2
      const midY = (from.y + to.y) / 2
      return { x: size.w * 0.08 - midX * nk, y: -midY * nk, k: nk }
    })

    // Progressive emergence of deeper rings after entering marriage portal.
    portalTimers.current.forEach(clearTimeout)
    portalTimers.current = []
    setVisibleDepth(1)
    for (let i = 2; i <= maxDepth; i++) {
      portalTimers.current.push(setTimeout(() => setVisibleDepth(i), 240 + i * 240))
    }
  }, [selectedMemberId, marriageNeighbors, peopleById, findPath, size.w, maxDepth])

  // ── Relationship Intelligence Engine ──────────────────────────────────
  // All computed client-side — no backend required for MVP.
  const intelligence = useMemo(() => {
    if (people.length === 0) return null

    // Influence score: direct connections + marriage bridge bonus (2x)
    const influenceScores = new Map<string, number>()
    for (const p of people) {
      let score = adjacencyMap.get(p.id)?.size ?? 0
      // Marriage bridges worth 2× because they connect ecosystems
      for (const e of edges) {
        if (e.kind === 'marriage' && (e.from === p.id || e.to === p.id)) score += 1
      }
      influenceScores.set(p.id, score)
    }
    const topInfluencers = [...people]
      .sort((a, b) => (influenceScores.get(b.id) ?? 0) - (influenceScores.get(a.id) ?? 0))
      .slice(0, 5)
      .map(p => ({ id: p.id, name: p.name, score: influenceScores.get(p.id) ?? 0 }))

    // Social proximity from self (BFS distance)
    const distFromSelf = new Map<string, number>()
    const bfsQueue = [effectiveSelfId]
    distFromSelf.set(effectiveSelfId, 0)
    while (bfsQueue.length) {
      const cur = bfsQueue.shift()!
      const d = distFromSelf.get(cur)!
      for (const nid of (adjacencyMap.get(cur) ?? new Set())) {
        if (!distFromSelf.has(nid)) {
          distFromSelf.set(nid, d + 1)
          bfsQueue.push(nid)
        }
      }
    }

    // Relationship strength for selected person
    const strengthMap = new Map<string, number>()
    for (const p of people) {
      if (p.id === effectiveSelfId) continue
      const dist = distFromSelf.get(p.id) ?? 99
      const sharedNeighbors = [...(adjacencyMap.get(p.id) ?? new Set())]
        .filter(nid => adjacencyMap.get(effectiveSelfId)?.has(nid)).length
      const attrBonus = (
        (people.find(s => s.id === effectiveSelfId)?.city === p.city ? 1 : 0) +
        (people.find(s => s.id === effectiveSelfId)?.gotra === p.gotra && p.gotra ? 1 : 0)
      )
      strengthMap.set(p.id, Math.max(0, Math.round((10 / Math.max(1, dist)) + sharedNeighbors * 1.5 + attrBonus)))
    }

    // Suggested connections: people not yet adjacent to self, sharing gotra/city/generation
    const selfPerson = people.find(p => p.id === effectiveSelfId)
    const selfAdj = adjacencyMap.get(effectiveSelfId) ?? new Set<string>()
    const suggestions = people
      .filter(p => p.id !== effectiveSelfId && !selfAdj.has(p.id) && p.category !== 'self')
      .map(p => {
        let reason = ''
        if (selfPerson?.gotra && p.gotra === selfPerson.gotra) reason = `Same gotra · ${p.gotra}`
        else if (selfPerson?.city && p.city === selfPerson.city) reason = `Same city · ${p.city}`
        else if (Math.abs((people.find(s => s.id === effectiveSelfId)?.depth ?? 0) - p.depth) <= 1) reason = 'Same generation'
        return reason ? { id: p.id, name: p.name, reason } : null
      })
      .filter((x): x is { id: string; name: string; reason: string } => x !== null)
      .slice(0, 4)

    // Trust network: verified connected members
    const verifiedCount = people.filter(p => p.verified).length
    const trustScore = people.length > 0 ? Math.round((verifiedCount / people.length) * 100) : 0

    // Marriage bridges: unique marriage connections between clusters
    const marriagePortals = edges.filter(e => e.kind === 'marriage').length

    return { topInfluencers, distFromSelf, strengthMap, suggestions, trustScore, verifiedCount, marriagePortals }
  }, [people, adjacencyMap, edges, effectiveSelfId])

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
  // Combine internal shift-click path state with external pathHighlight prop from dashboard.
  const effectivePathNodes = pathHighlight ? pathHighlight.nodes : pathNodes
  const effectivePathEdges = pathHighlight ? pathHighlight.edges : pathEdges

  function nodeOpacity(p: UPerson): number {
    if (effectivePathNodes.size > 0) return effectivePathNodes.has(p.id) ? 1 : 0.18
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
    if (effectivePathEdges.size > 0) return effectivePathEdges.has(e.id) ? 1 : 0.04
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
      onPointerUp={releasePointer}
      onPointerLeave={releasePointer}
      onPointerCancel={releasePointer}
      onClick={() => { setPathNodes(new Set()); setPathEdges(new Set()) }}
    >

      {/* ── Empty state — shown when no family members exist yet ─── */}
      {members.length === 0 && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none select-none">
          {/* Pulsing concentric rings */}
          <div className="relative flex items-center justify-center mb-8">
            {[80, 150, 230].map((sz, i) => (
              <div
                key={i}
                className="absolute rounded-full border"
                style={{
                  width: sz, height: sz,
                  borderColor: '#22d3ee',
                  opacity: 0.12 - i * 0.03,
                  animation: `selfPulse ${2.6 + i * 0.7}s ease-in-out infinite ${i * 0.65}s`,
                }}
              />
            ))}
            <div
              className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #22d3eecc, #22d3ee33)',
                boxShadow: '0 0 36px #22d3ee44, 0 0 70px #22d3ee22',
              }}
            >
              <span style={{ fontSize: 28 }}>🌳</span>
            </div>
          </div>
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
            Your family universe awaits
          </h3>
          <p className="text-sm text-center max-w-[280px] mb-6 leading-relaxed px-4" style={{ color: 'var(--muted-foreground)' }}>
            Add your first member and watch your tree bloom — generation by generation
          </p>
          {onAddMember && (
            <button
              onClick={onAddMember}
              className="pointer-events-auto px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #22d3ee1a, #22d3ee0d)',
                border: '1.5px solid #22d3ee55',
                color: '#22d3ee',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              + Add first member
            </button>
          )}
        </div>
      )}

      {/* ── SVG: atmospheric depth blooms + edges (theme-aware via CSS vars) ── */}
      <svg width={size.w} height={size.h} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <defs>
          <radialGradient id="uBgBloom" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="var(--ambient-bloom-1)" />
            <stop offset="60%" stopColor="var(--ambient-bloom-2)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="uCenterCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ambient-bloom-center)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="uPatBloom" cx="35%" cy="40%" r="38%">
            <stop offset="0%" stopColor="var(--ambient-pat-bloom)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="uMatBloom" cx="65%" cy="40%" r="38%">
            <stop offset="0%" stopColor="var(--ambient-mat-bloom)" />
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
            const isPathEdge = pathEdges.has(e.id)
            const isPortalEdge = !!portalPair &&
              ((e.from === portalPair.from && e.to === portalPair.to) || (e.from === portalPair.to && e.to === portalPair.from))
            const isMarriagePortal =
              e.kind === 'marriage' && ((!!focusId && (e.from === focusId || e.to === focusId)) || isPortalEdge)
            const stroke = isPathEdge ? '#facc15' : EDGE_COLOR[e.kind]
            const dash = isPathEdge ? 'none' : (e.kind === 'suggested' ? '3 8' : e.kind === 'community' ? '2 6' : 'none')
            const strokeW = isPathEdge ? 2.5 : (e.kind === 'marriage' ? (isMarriagePortal ? 2.8 : 1.8) : 1.0)

            return (
              <g key={e.id} opacity={opacity} style={{ transition: 'opacity 0.42s ease' }}>
                {e.kind === 'marriage' && (
                  <path
                    d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`}
                    stroke={stroke}
                    strokeOpacity={isMarriagePortal ? 0.34 : 0.20}
                    strokeWidth={isMarriagePortal ? 8 : 5.2}
                    fill="none"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 ${isMarriagePortal ? 14 : 9}px ${stroke})` }}
                  />
                )}
                <path
                  d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`}
                  stroke={stroke} strokeOpacity={e.kind === 'marriage' ? (isMarriagePortal ? 0.78 : 0.62) : 0.52}
                  strokeWidth={strokeW} fill="none"
                  strokeDasharray={dash} strokeLinecap="round"
                />
                {e.kind === 'marriage' && opacity > 0.2 && (
                  <path
                    d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`}
                    stroke={stroke}
                    strokeOpacity={isMarriagePortal ? 0.58 : 0.38}
                    strokeWidth={1.25}
                    fill="none"
                    strokeDasharray="2 14"
                    className="edge-flow"
                    strokeLinecap="round"
                  />
                )}
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

      {/* Ambient drifting particles for cinematic depth (subtle in light mode). */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        {ambientParticles.map((p) => (
          <span
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.color,
              opacity: p.opacity,
              filter: 'blur(0.35px)',
              animation: `particleDrift ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
            }}
          />
        ))}
      </div>

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
                    if (isPanning.current) return
                    // Path-finding mode: first click selects origin, second click finds path
                    if (isPathFindingMode) {
                      if (pathFrom && pathFrom !== p.id) {
                        findPath(pathFrom, p.id)
                        setIsPathFindingMode(false)
                      } else {
                        setPathFrom(p.id)
                        onSelectMember(p.id)
                      }
                      return
                    }
                    if (ev.shiftKey && selectedMemberId && selectedMemberId !== p.id) {
                      findPath(selectedMemberId, p.id)
                    } else {
                      internalClickRef.current = true  // skip cinematic pan for direct clicks
                      onSelectMember(p.id)
                      setPathNodes(new Set())
                      setPathEdges(new Set())
                      setPathSequence([])
                      setPortalPair(null)
                    }
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
                  {/* Birthday pulse ring */}
                  {p.isBirthday && (
                    <span
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        inset: `-${Math.round(r * 0.20)}px`,
                        border: '2px solid #facc15',
                        boxShadow: '0 0 10px rgba(250,204,21,0.85), 0 0 22px rgba(250,204,21,0.4)',
                        animation: 'birthdayPulse 2s ease-in-out infinite',
                      }}
                    />
                  )}
                  {/* Path highlight ring */}
                  {pathNodes.has(p.id) && pathNodes.size > 1 && (
                    <span
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        inset: `-${Math.round(r * 0.14)}px`,
                        border: '2px solid #facc15',
                        opacity: 0.88,
                      }}
                    />
                  )}
                  {/* Marriage-portal destination aura */}
                  {portalPair?.to === p.id && (
                    <span
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        inset: `-${Math.round(r * 0.34)}px`,
                        border: '2px solid var(--marriage)',
                        boxShadow: '0 0 14px color-mix(in oklab, var(--marriage) 60%, transparent), 0 0 34px color-mix(in oklab, var(--marriage) 35%, transparent)',
                        animation: 'orbitRing 6.5s linear infinite',
                        opacity: 0.78,
                      }}
                    />
                  )}
                  {/* Selected orbit ring */}
                  {isSelected && (
                    <span className="absolute rounded-full border border-white/18"
                      style={{ inset: `-${r * 0.28}px`, animation: 'orbitRing 8s linear infinite' }} />
                  )}
                  {/* "You" permanent double-pulse ring */}
                  {p.category === 'self' && (
                    <>
                      <span
                        className="absolute rounded-full pointer-events-none"
                        style={{
                          inset: `-${Math.round(r * 0.32)}px`,
                          border: '2px solid #22d3ee',
                          boxShadow: '0 0 14px #22d3ee99, 0 0 28px #22d3ee33',
                          animation: 'selfPulse 3s ease-in-out infinite',
                        }}
                      />
                      <span
                        className="absolute rounded-full pointer-events-none"
                        style={{
                          inset: `-${Math.round(r * 0.66)}px`,
                          border: '1px solid #22d3ee',
                          opacity: 0.2,
                          animation: 'selfPulse 3s ease-in-out infinite 1.5s',
                        }}
                      />
                    </>
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
                  {/* Semantic zoom labels — theme-aware via tokens */}
                  {showName && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none"
                      style={{ top: r * 2 + 5 }}
                    >
                      <span className="block font-medium leading-tight drop-shadow-sm"
                        style={{ fontSize: Math.max(9, Math.min(13, r * 0.44)), color: 'var(--universe-label-name)' }}>
                        {p.name}
                      </span>
                      {showRelation && (label || showCity) && (
                        <span className="block leading-tight"
                          style={{ fontSize: Math.max(8, Math.min(11, r * 0.34)), color: 'var(--universe-label-meta)' }}>
                          {label}{showCity && p.city ? ` · ${p.city}` : ''}
                        </span>
                      )}
                      {/* Birthday badge */}
                      {p.isBirthday && (
                        <span className="block leading-tight mt-0.5"
                          style={{ fontSize: Math.max(8, Math.min(11, r * 0.34)), color: '#facc15' }}>
                          {p.birthdayDaysAway === 0 ? '🎂 Today!' : `🎂 in ${p.birthdayDaysAway}d`}
                        </span>
                      )}
                      {/* "You" badge inline with name label */}
                      {p.category === 'self' && (
                        <span className="block leading-tight mt-0.5 font-bold tracking-widest uppercase"
                          style={{ fontSize: Math.max(7, Math.min(10, r * 0.30)), color: '#22d3ee', textShadow: '0 0 6px #22d3ee88', letterSpacing: '0.2em' }}>
                          You
                        </span>
                      )}
                    </span>
                  )}
                  {/* "You" at cluster zoom (name hidden) */}
                  {p.category === 'self' && !showName && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-bold tracking-widest uppercase pointer-events-none"
                      style={{ top: r * 2 + 3, fontSize: 8, color: '#22d3ee', textShadow: '0 0 6px #22d3ee88', letterSpacing: '0.2em' }}
                    >You</span>
                  )}
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* ── Path-finding mode overlay banner ─────────────────────── */}
      <AnimatePresence>
        {isPathFindingMode && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
          >
            <div className="flex items-center gap-2.5 rounded-full border px-4 py-2 shadow-lg backdrop-blur-xl"
              style={{ background: 'var(--universe-panel-bg)', borderColor: 'var(--primary)', color: 'var(--foreground)' }}>
              <span className="text-sm font-medium">
                {pathFrom
                  ? <>From <span className="font-bold" style={{ color: 'var(--primary)' }}>{people.find(p => p.id === pathFrom)?.name.split(' ')[0]}</span> — click any person to trace the path</>
                  : <>🧭 Path Finder — click any person to set start, then click destination</>}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setIsPathFindingMode(false); setPathFrom(null); setPathNodes(new Set()); setPathEdges(new Set()); setPathSequence([]) }}
                className="text-xs rounded-full px-2 py-0.5 border transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--universe-chip-border)', background: 'var(--universe-chip-bg)', color: 'var(--universe-chip-text)' }}
              >Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Path Result Panel ─────────────────────────────────────── */}
      <AnimatePresence>
        {pathSequence.length > 1 && !isPathFindingMode && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-[min(560px,88vw)] w-full pointer-events-auto"
          >
            <div className="rounded-2xl border shadow-2xl backdrop-blur-2xl p-4"
              style={{ background: 'var(--universe-panel-bg)', borderColor: 'var(--universe-panel-border)' }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--muted-foreground)' }}>Relationship Path</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--foreground)' }}>
                    {pathSequence.length - 1} step{pathSequence.length - 1 !== 1 ? 's' : ''} between{' '}
                    <span style={{ color: 'var(--primary)' }}>{people.find(p => p.id === pathSequence[0])?.name.split(' ')[0]}</span>
                    {' '}&amp;{' '}
                    <span style={{ color: 'var(--paternal)' }}>{people.find(p => p.id === pathSequence[pathSequence.length - 1])?.name.split(' ')[0]}</span>
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setPathNodes(new Set()); setPathEdges(new Set()); setPathSequence([]); setPathFrom(null) }}
                  className="text-[11px] rounded-full px-2.5 py-1 border"
                  style={{ borderColor: 'var(--universe-chip-border)', background: 'var(--universe-chip-bg)', color: 'var(--universe-chip-text)' }}
                >× Clear</button>
              </div>
              {/* Ordered path pills — clickable to navigate */}
              <div className="flex flex-wrap items-center gap-1.5">
                {pathSequence.map((id, idx) => {
                  const m = people.find(p => p.id === id)
                  if (!m) return null
                  const col = CATEGORY_COLOR[m.category]
                  return (
                    <span key={id} className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectMember(id) }}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all hover:opacity-90"
                        style={{ borderColor: col, background: 'var(--universe-chip-bg-active)', color: 'var(--foreground)' }}
                        title={m.name}
                      >
                        {m.name.split(' ')[0]}
                      </button>
                      {idx < pathSequence.length - 1 && (
                        <span className="text-[12px] font-light" style={{ color: 'var(--muted-foreground)' }}>›</span>
                      )}
                    </span>
                  )
                })}
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                {pathSequence.length === 2 && 'Direct relationship — one step apart.'}
                {pathSequence.length === 3 && 'Connected through one common relative.'}
                {pathSequence.length >= 4 && `Connected through ${pathSequence.length - 2} intermediate ${pathSequence.length - 2 === 1 ? 'person' : 'people'}.`}
                {' '}Click any name to navigate there. Shift-click two nodes for quick paths.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Contextual actions for selected node ─────────────────────────── */}
      <AnimatePresence>
        {selectedMemberId && selectedPerson && (
          <motion.div
            key={selectedMemberId}
            initial={{ opacity: 0, y: isMobileView ? -20 : 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: isMobileView ? -12 : 16, scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="absolute z-40 overflow-hidden"
            style={{
              ...(isMobileView
                ? { top: 52, left: 16, right: 16 }
                : { bottom: 72, left: '50%', transform: 'translateX(-50%)', width: 300 }),
              borderRadius: 20,
              background: 'var(--universe-panel-bg)',
              border: `1px solid ${CATEGORY_COLOR[selectedPerson.category] ?? '#888'}55`,
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              boxShadow: `0 0 0 1px ${CATEGORY_COLOR[selectedPerson.category] ?? '#888'}18, 0 24px 64px rgba(0,0,0,0.6), 0 0 48px ${CATEGORY_COLOR[selectedPerson.category] ?? '#888'}16`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left category accent bar */}
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{
                borderRadius: '20px 0 0 20px',
                background: `linear-gradient(180deg, ${CATEGORY_COLOR[selectedPerson.category] ?? '#888'} 0%, transparent 100%)`,
              }}
            />

            {/* Header */}
            <div className="flex items-center gap-3 pl-5 pr-2.5 pt-3 pb-2.5">
              {/* Avatar with category glow */}
              <div
                className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold"
                style={{
                  background: `linear-gradient(135deg, ${CATEGORY_COLOR[selectedPerson.category] ?? '#888'}cc, ${CATEGORY_COLOR[selectedPerson.category] ?? '#888'}55)`,
                  boxShadow: `0 0 0 2px ${CATEGORY_COLOR[selectedPerson.category] ?? '#888'}44, 0 0 16px ${CATEGORY_COLOR[selectedPerson.category] ?? '#888'}33`,
                  color: '#fff',
                  letterSpacing: '-0.02em',
                }}
              >
                {selectedPerson.initials}
              </div>

              {/* Name + relation badge */}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold leading-tight truncate" style={{ color: 'var(--foreground)' }}>
                  {selectedPerson.name}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: `${CATEGORY_COLOR[selectedPerson.category] ?? '#888'}22`,
                      color: CATEGORY_COLOR[selectedPerson.category] ?? 'var(--muted-foreground)',
                    }}
                  >
                    {selectedPerson.relation || selectedPerson.category}
                  </span>
                  {selectedPerson.city && (
                    <span className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                      {selectedPerson.city}
                    </span>
                  )}
                </div>
              </div>

              {/* Dismiss */}
              <button
                onClick={(e) => { e.stopPropagation(); onSelectMember(selectedMemberId) }}
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:bg-white/10 active:scale-90"
                style={{ color: 'var(--muted-foreground)' }}
                title="Dismiss"
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>✕</span>
              </button>
            </div>

            <div className="mx-5 h-px" style={{ background: 'var(--border)' }} />

            {/* Action grid */}
            <div className="grid grid-cols-4 gap-2 p-3">
              <button
                onClick={(e) => { e.stopPropagation(); panToPerson(selectedMemberId, 1.6) }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all hover:scale-105 active:scale-95"
                style={{ background: 'var(--universe-chip-bg)', color: 'var(--foreground)' }}
                title="Zoom in & center"
              >
                <span className="text-xl leading-none">🔍</span>
                <span className="text-[9px] font-semibold tracking-widest uppercase">Focus</span>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); setVisibleDepth(maxDepth); panToPerson(effectiveSelfId, 0.58) }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all hover:scale-105 active:scale-95"
                style={{ background: 'var(--universe-chip-bg)', color: 'var(--foreground)' }}
                title="Show full network"
              >
                <span className="text-xl leading-none">🌐</span>
                <span className="text-[9px] font-semibold tracking-widest uppercase">Network</span>
              </button>

              <button
                disabled={marriageNeighbors.length === 0}
                onClick={(e) => { e.stopPropagation(); if (marriageNeighbors.length > 0) runMarriagePortal() }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  color: marriageNeighbors.length > 0 ? 'var(--marriage)' : 'var(--muted-foreground)',
                  background: marriageNeighbors.length > 0 ? 'var(--universe-chip-bg-active)' : 'var(--universe-chip-bg)',
                  outline: marriageNeighbors.length > 0 ? '1.5px solid var(--marriage)' : 'none',
                }}
                title={marriageNeighbors.length === 0 ? 'No spouse connected' : 'Explore spouse\'s family'}
              >
                <span className="text-xl leading-none">💍</span>
                <span className="text-[9px] font-semibold tracking-widest uppercase">Portal</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenPathFinder?.(selectedMemberId ?? undefined)
                  setShowAnalytics(false); setShowIntelPanel(false)
                }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all hover:scale-105 active:scale-95"
                style={{ color: 'var(--primary)', background: 'var(--glow-primary)', outline: '1.5px solid var(--primary)' }}
                title="Trace relationship path"
              >
                <span className="text-xl leading-none">⟷</span>
                <span className="text-[9px] font-semibold tracking-widest uppercase">Path</span>
              </button>
            </div>

            {/* Marriage Portal: explore in-laws family */}
            {portalPair && marriageNeighbors.length > 0 && (() => {
              const spouse = peopleById.get(marriageNeighbors[0])
              if (!spouse) return null
              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    panToPerson(marriageNeighbors[0], 0.72)
                    setVisibleDepth(maxDepth)
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-all hover:opacity-80"
                  style={{ color: 'var(--marriage)', borderTop: '1px solid var(--border)' }}
                >
                  <span>↗</span> Explore {spouse.name.split(' ')[0]}&apos;s full family
                </button>
              )
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter chips — horizontal scroll on mobile, vertical on desktop ── */}
      {isMobileView ? (
        <div
          className="absolute top-2 left-2 right-2 z-30 flex flex-row gap-1.5 overflow-x-auto"
          style={{ zIndex: 10, scrollbarWidth: 'none' }}
        >
          {([
            { cat: null, label: 'All', color: 'var(--primary)' },
            { cat: 'paternal', label: 'Paternal', color: 'var(--paternal)' },
            { cat: 'maternal', label: 'Maternal', color: 'var(--maternal)' },
            { cat: 'marriage', label: 'Marriage', color: 'var(--marriage)' },
            { cat: 'community', label: 'Community', color: 'var(--community)' },
          ] as { cat: UCategory | null; label: string; color: string }[]).map(({ cat, label, color }) => (
            <button
              key={label}
              onClick={() => setFilterCat(cat)}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-all backdrop-blur-md shadow-sm"
              style={{
                background: filterCat === cat ? 'var(--universe-chip-bg-active)' : 'var(--universe-chip-bg)',
                borderColor: filterCat === cat ? color : 'var(--universe-chip-border)',
                color: filterCat === cat ? color : 'var(--universe-chip-text)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="absolute top-4 right-4 z-30 flex flex-col gap-1.5 items-end" style={{ zIndex: 10 }}>
          {([
            { cat: null, label: 'All', color: 'var(--primary)' },
            { cat: 'paternal', label: 'Paternal', color: 'var(--paternal)' },
            { cat: 'maternal', label: 'Maternal', color: 'var(--maternal)' },
            { cat: 'marriage', label: 'Marriage', color: 'var(--marriage)' },
            { cat: 'community', label: 'Community', color: 'var(--community)' },
          ] as { cat: UCategory | null; label: string; color: string }[]).map(({ cat, label, color }) => (
            <button
              key={label}
              onClick={() => setFilterCat(cat)}
              className="rounded-full px-3 py-1 text-xs font-medium border transition-all text-left backdrop-blur-md shadow-sm"
              style={{
                background: filterCat === cat ? 'var(--universe-chip-bg-active)' : 'var(--universe-chip-bg)',
                borderColor: filterCat === cat ? color : 'var(--universe-chip-border)',
                color: filterCat === cat ? color : 'var(--universe-chip-text)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Intelligence Panel toggle buttons — desktop only (mobile: in legend bar) ── */}
      {!isMobileView && (
        <div className="absolute bottom-14 left-4 z-30 flex gap-1.5">
          <button
            onClick={() => { setShowAnalytics(v => !v); setShowIntelPanel(false) }}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium border backdrop-blur-md transition-all"
            style={{
              background: showAnalytics ? 'var(--universe-chip-bg-active)' : 'var(--universe-chip-bg)',
              borderColor: showAnalytics ? 'var(--primary)' : 'var(--universe-chip-border)',
              color: showAnalytics ? 'var(--primary)' : 'var(--universe-chip-text)',
            }}
          >
            ◈ Overview
          </button>
          <button
            onClick={() => { setShowIntelPanel(v => !v); setShowAnalytics(false) }}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium border backdrop-blur-md transition-all"
            style={{
              background: showIntelPanel ? 'var(--universe-chip-bg-active)' : 'var(--universe-chip-bg)',
              borderColor: showIntelPanel ? 'var(--marriage)' : 'var(--universe-chip-border)',
              color: showIntelPanel ? 'var(--marriage)' : 'var(--universe-chip-text)',
            }}
          >
            ✦ Intelligence
          </button>
        </div>
      )}

      {/* ── Overview Analytics Panel ─────────────────────────────────── */}
      <AnimatePresence>
        {showAnalytics && (
          <motion.div
            initial={isMobileView ? { opacity: 0, y: 20 } : { opacity: 0, x: 20 }}
            animate={isMobileView ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
            exit={isMobileView ? { opacity: 0, y: 20 } : { opacity: 0, x: 20 }}
            className={cn(
              "absolute z-30 rounded-2xl border backdrop-blur-2xl p-4 shadow-2xl overflow-y-auto",
              isMobileView ? "bottom-14 left-2 right-2" : "bottom-14 right-4 w-72"
            )}
            style={{ zIndex: 10, maxHeight: isMobileView ? '52vh' : '70vh', background: 'var(--universe-panel-bg)', borderColor: 'var(--universe-panel-border)', color: 'var(--foreground)' }}
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted-foreground)' }}>Family Overview</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Total relatives</span>
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{analytics.total}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--muted-foreground)' }}>Generations deep</span>
                <span style={{ color: 'var(--foreground)' }}>{analytics.maxDepth}</span>
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
                        <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
                        <span style={{ color: 'var(--foreground)' }}>{count}</span>
                      </div>
                      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
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
                  <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted-foreground)' }}>City Spread</p>
                  <div className="flex flex-wrap gap-1">
                    {analytics.topCities.map(([city, count]) => (
                      <span key={city} className="rounded-full border px-2 py-0.5 text-[10px]"
                        style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>{city} ({count})</span>
                    ))}
                  </div>
                </div>
              )}
              {analytics.topGotras.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Gotra / Community</p>
                  <div className="flex flex-wrap gap-1">
                    {analytics.topGotras.map(([g, count]) => (
                      <span key={g} className="rounded-full border px-2 py-0.5 text-[10px]"
                        style={{ background: 'var(--glow-gold)', borderColor: 'var(--border)', color: 'var(--accent)' }}>{g} ({count})</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Relationship Intelligence Panel ──────────────────────────── */}
      <AnimatePresence>
        {showIntelPanel && intelligence && (
          <motion.div
            initial={isMobileView ? { opacity: 0, y: 20 } : { opacity: 0, x: 20 }}
            animate={isMobileView ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
            exit={isMobileView ? { opacity: 0, y: 20 } : { opacity: 0, x: 20 }}
            className={cn(
              "absolute z-30 rounded-2xl border backdrop-blur-2xl p-4 shadow-2xl overflow-y-auto",
              isMobileView ? "bottom-14 left-2 right-2" : "bottom-14 right-4 w-72"
            )}
            style={{ zIndex: 10, maxHeight: isMobileView ? '52vh' : '70vh', background: 'var(--universe-panel-bg)', borderColor: 'var(--universe-panel-border)', color: 'var(--foreground)' }}
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted-foreground)' }}>Relationship Intelligence</h3>
            <div className="space-y-4">

              {/* Trust Network */}
              <div className="rounded-xl border p-3 space-y-1.5" style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--muted-foreground)' }}>Trust Network Score</span>
                  <span className="font-bold" style={{ color: intelligence.trustScore >= 60 ? 'var(--success)' : 'var(--warning)' }}>
                    {intelligence.trustScore}%
                  </span>
                </div>
                <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${intelligence.trustScore}%`, background: intelligence.trustScore >= 60 ? 'var(--success)' : 'var(--warning)' }} />
                </div>
                <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                  {intelligence.verifiedCount} of {people.length} members verified · {intelligence.marriagePortals} marriage bridge{intelligence.marriagePortals !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Influence Map */}
              {intelligence.topInfluencers.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Most Connected</p>
                  <div className="space-y-1.5">
                    {intelligence.topInfluencers.map((inf, i) => (
                      <button
                        key={inf.id}
                        onClick={(e) => { e.stopPropagation(); onSelectMember(inf.id) }}
                        className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:opacity-90"
                        style={{ background: i === 0 ? 'var(--glow-primary)' : 'transparent', border: `1px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'}` }}
                      >
                        <span className="text-[10px] font-bold w-4 shrink-0" style={{ color: 'var(--muted-foreground)' }}>#{i + 1}</span>
                        <span className="flex-1 text-[11px] font-medium text-left truncate" style={{ color: 'var(--foreground)' }}>{inf.name}</span>
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--primary)' }}>{inf.score} links</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Connections */}
              {intelligence.suggestions.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>People You May Know</p>
                  <div className="space-y-1.5">
                    {intelligence.suggestions.map(s => (
                      <button
                        key={s.id}
                        onClick={(e) => { e.stopPropagation(); onSelectMember(s.id) }}
                        className="w-full flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors hover:opacity-90"
                        style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
                      >
                        <span className="flex-1 text-[11px] font-medium truncate" style={{ color: 'var(--foreground)' }}>{s.name}</span>
                        <span className="text-[10px] shrink-0 rounded-full px-1.5 py-0.5 border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'var(--surface-card)' }}>{s.reason}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Path Intelligence hint */}
              {selectedMemberId && intelligence.distFromSelf.has(selectedMemberId) && (
                <div className="rounded-xl border p-3" style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Social Proximity</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                    {intelligence.distFromSelf.get(selectedMemberId) === 1
                      ? 'Direct connection'
                      : `${intelligence.distFromSelf.get(selectedMemberId)} degrees away`}
                  </p>
                  {intelligence.strengthMap.has(selectedMemberId) && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      Relationship strength: {intelligence.strengthMap.get(selectedMemberId)}/10
                    </p>
                  )}
                </div>
              )}

              {intelligence.suggestions.length === 0 && intelligence.topInfluencers.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Add more family members to unlock relationship intelligence</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating mobile controls (zoom + recenter) ────────────── */}
      {isMobileView && (
        <div
          className="absolute bottom-20 right-4 z-40 flex flex-col gap-2 transition-opacity duration-300"
          style={{ opacity: showMobileControls ? 1 : 0, pointerEvents: showMobileControls ? 'auto' : 'none' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setView(v => ({ ...v, k: Math.min(3.2, v.k * 1.3) })); resetControlsTimer() }}
            className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md shadow-lg text-xl font-bold active:scale-95 transition-transform"
            style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--universe-chip-text)' }}
          >+</button>
          <button
            onClick={(e) => { e.stopPropagation(); setView(v => ({ ...v, k: Math.max(0.2, v.k * 0.77) })); resetControlsTimer() }}
            className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md shadow-lg text-xl font-bold active:scale-95 transition-transform"
            style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--universe-chip-text)' }}
          >−</button>
          <button
            onClick={(e) => { e.stopPropagation(); setView({ x: 0, y: 0, k: 0.52 }); resetControlsTimer() }}
            className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md shadow-lg text-base active:scale-95 transition-transform"
            style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--primary)' }}
            title="Recenter graph"
          >⌖</button>
        </div>
      )}

      {/* ── Legend + zoom level + mobile panel toggles ─────────────── */}
      <div
        className="absolute bottom-4 left-4 right-4 z-30 flex items-center gap-x-2 rounded-full border backdrop-blur-md px-3 py-1.5"
        style={{ zIndex: 10, background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)' }}
      >
        {/* Mobile: Overview + Intelligence icon buttons, then separator */}
        {isMobileView && (
          <>
            <button
              onClick={() => { setShowAnalytics(v => !v); setShowIntelPanel(false) }}
              className="shrink-0 text-sm leading-none transition-all"
              title="Overview"
              style={{ color: showAnalytics ? 'var(--primary)' : 'var(--universe-chip-text)' }}
            >◈</button>
            <button
              onClick={() => { setShowIntelPanel(v => !v); setShowAnalytics(false) }}
              className="shrink-0 text-sm leading-none transition-all"
              title="Intelligence"
              style={{ color: showIntelPanel ? 'var(--marriage)' : 'var(--universe-chip-text)' }}
            >✦</button>
            <span className="shrink-0 h-3 w-px" style={{ background: 'var(--universe-chip-border)' }} />
          </>
        )}

        {/* Legend dots — labels on desktop, dots-only on mobile */}
        {([
          { color: 'var(--paternal)', label: 'Paternal' },
          { color: 'var(--maternal)', label: 'Maternal' },
          { color: 'var(--marriage)', label: 'Marriage' },
          { color: 'var(--community)', label: 'Community' },
        ]).map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1 text-[10px] shrink-0" style={{ color: 'var(--universe-chip-text)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
            {!isMobileView && label}
          </span>
        ))}

        {/* Find Relationship — icon-only on mobile, with label on desktop */}
        <button
          onClick={() => onOpenPathFinder?.()}
          className="ml-auto flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border shrink-0 transition-all"
          style={{
            borderColor: pathFinderOpen ? 'var(--primary)' : 'var(--universe-chip-border)',
            color: pathFinderOpen ? 'var(--primary)' : 'var(--universe-chip-text)',
            background: pathFinderOpen ? 'var(--glow-primary)' : 'transparent',
          }}
          title="Find relationship path between any two people"
        >
          <span>⟷</span>
          {!isMobileView && <span>Find Relationship</span>}
        </button>

        {/* Zoom level — desktop only */}
        {!isMobileView && (
          <span className="text-[10px] shrink-0 hidden sm:block" style={{ color: 'var(--universe-chip-text)', opacity: 0.7 }}>
            {zoomLevel === 'cluster' ? 'Cluster' : zoomLevel === 'name' ? 'Name' : zoomLevel === 'detail' ? 'Detail' : 'Full'} view · {Math.round(k * 100)}%
          </span>
        )}
      </div>
    </div >
  )
}
