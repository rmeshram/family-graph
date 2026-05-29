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
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { FamilyMember } from '@/lib/types'
import { computeRelationLabel, enrichMembersWithDerivedEdges } from '@/lib/relation-engine'
import { cn } from '@/lib/utils'
import { NodeActionRing } from '@/components/node-action-ring'

// ─── Internal graph types ──────────────────────────────────────────────────

type UCategory = 'self' | 'paternal' | 'maternal' | 'marriage' | 'community'
type UEdgeKind = 'blood' | 'marriage' | 'community' | 'suggested'

interface UPerson {
  id: string
  name: string
  initials: string
  photoUrl?: string
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
  paternal: [Math.PI * 0.42, Math.PI * 1.48],   // ~76° → ~266°  (wider left arc)
  maternal: [-Math.PI * 0.42, Math.PI * 0.42],   // ~-76° → ~76°  (wider right arc)
  marriage: [-Math.PI * 0.38, Math.PI * 0.38],    // right side (wider)
  community: [Math.PI * 0.60, Math.PI * 1.60],    // outer left cluster
}

const BASE_RING_RADIUS = 210   // depth-1 ring radius (px in graph space)
const RING_STEP = 160   // extra radius per depth level
const MIN_ANG_GAP = 0.26  // min radians between nodes in same ring (~15°) — prevents node overlap
const JITTER_SCALE = 14    // px of deterministic position jitter (kept < half MIN_ANG_GAP arc-length)

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
  anchorId: string,
  perspectiveSelfId?: string | null,
): { people: UPerson[]; edges: UEdge[] } {
  if (!anchorId || members.length === 0) return { people: [], edges: [] }

  const memberMap = new Map(members.map(m => [m.id, m]))
  const self = memberMap.get(anchorId)
  if (!self) return { people: [], edges: [] }

  // ── Enrich with relationship-label-derived edges ───────────────────────────
  // Isolated members (no parent_ids/spouse_ids) carry a `relationship` label
  // relative to selfId (e.g. "father", "mother", "spouse"). The enrichment
  // function derives virtual parentIds/spouseIds so the BFS can reach them.
  // Virtual intermediate nodes (id starts with "__virt_") are used for BFS
  // traversal only — they are filtered out before rendering.
  const enrichedMembers = enrichMembersWithDerivedEdges(members, anchorId)
  const enrichedMap = new Map(enrichedMembers.map(m => [m.id, m]))

  // ── 1. BFS to find depth of each reachable core/extended member ──────────
  const depth = new Map<string, number>([[anchorId, 0]])
  const visited = new Set<string>([anchorId])
  const queue = [anchorId]
  let head = 0

  while (head < queue.length) {
    const id = queue[head++]
    const m = enrichedMap.get(id)   // use enriched edges for traversal
    if (!m) continue
    const d = depth.get(id)!

    const neighbors: string[] = [
      ...m.parentIds,
      ...m.spouseIds,
      ...enrichedMembers.filter(x => x.parentIds.includes(id)).map(x => x.id),
    ]
    for (const nid of neighbors) {
      if (!visited.has(nid) && enrichedMap.has(nid)) {
        visited.add(nid)
        depth.set(nid, d + 1)
        queue.push(nid)
      }
    }
  }

  // ── Generation-based depth fallback ───────────────────────────────────────
  // Members that BFS couldn't reach (disconnected sub-clusters or members
  // whose relationship labels weren't recognised) get a depth derived from
  // their `generation` integer. This guarantees every real family member
  // appears in a ring instead of being silently pushed to the community sink.
  const selfGen = self.generation ?? 3
  for (const m of members) {
    if (m.id === anchorId || m.id.startsWith('__virt_') || depth.has(m.id)) continue
    // networkGroup === 'affiliated' members intentionally live in the community cluster
    if (m.networkGroup === 'affiliated') continue
    const memberGen = m.generation ?? selfGen
    const genDiff = Math.abs(memberGen - selfGen)
    depth.set(m.id, Math.max(1, genDiff === 0 ? 1 : genDiff))
  }

  // ── 2. Assign categories ──────────────────────────────────────────────────
  const category = new Map<string, UCategory>([[anchorId, 'self']])

  for (const m of members) {
    if (m.id === anchorId) continue

    let cat: UCategory
    if (m.networkGroup === 'affiliated') {
      cat = 'community'
    } else if (
      m.side === 'spouse' ||
      self.spouseIds.includes(m.id) ||
      m.spouseIds.includes(anchorId)
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
      } else if (['son', 'daughter', 'child', 'grandson', 'granddaughter', 'grandchild',
        'nephew', 'niece', 'son-in-law', 'daughter-in-law'].includes(rel)) {
        // Descendants go in paternal sector but at deeper positive ring
        cat = 'paternal'
      } else {
        // For members with no usable label, spread across paternal/maternal by generation parity
        // to avoid all unknowns piling into one sector.
        const memberGen = m.generation ?? selfGen
        cat = memberGen % 2 === 0 ? 'paternal' : 'maternal'
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
    if (m.id === anchorId) continue
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
  const positions = new Map<string, { x: number; y: number }>([[anchorId, { x: 0, y: 0 }]])

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
    if (m.id === anchorId) return false
    if (m.id.startsWith('__virt_')) return false   // never render virtual nodes as community
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
    // Skip virtual structural nodes — they participate in BFS but are never rendered
    if (m.id.startsWith('__virt_')) continue
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
      // Compute relation label from the verified viewer perspective via BFS.
      // Never show the stored `relationship` field directly — it is relative to
      // the admin who created the tree, not the current viewer.
      relation: perspectiveSelfId && m.id === perspectiveSelfId
        ? 'You'
        // Use enriched member list so label-derived virtual edges are traversable.
        // In anonymous explore mode there is no verified self perspective, so
        // relationship labels are intentionally hidden.
        : (perspectiveSelfId ? (computeRelationLabel(perspectiveSelfId, m.id, enrichedMembers) ?? '') : ''),
      photoUrl: m.photoUrl || undefined,
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
    else if (coreMemberIds.length > 0) addEdge(m.id, anchorId, 'suggested')
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
  /** When false, nodes with showAsAnonymous=true are shown as "? Member" placeholders */
  isAdmin?: boolean
  onSelectMember: (id: string) => void
  onOpenMemberDetail?: (memberId?: string) => void
  /** Path highlight injected from the dashboard's PathFinderPanel */
  pathHighlight?: { nodes: Set<string>; edges: Set<string>; sequence: string[] }
  /** Called when the user wants to open the path finder (optionally pre-seeded with a member) */
  onOpenPathFinder?: (fromMemberId?: string) => void
  /** Whether the external path finder panel is currently open (for legend button state) */
  pathFinderOpen?: boolean
  /** Whether a separate detail drawer/sidebar is currently open */
  detailPanelOpen?: boolean
  /** Called when the user taps "Add first member" in the empty state */
  onAddMember?: () => void
  /** Called when user clicks an inline add-relative action on a node */
  onAddRelative?: (anchorId: string, relType: import('@/components/quick-add-member-dialog').QuickRelType) => void
  /** Called when user wants to invite someone else to claim an unclaimed node */
  onInvite?: (memberId: string) => void
  /** Called when the viewer (who has no claimed node yet) wants to claim this node as themselves */
  onClaim?: (memberId: string) => void
  /** True while the parent is fetching members — suppresses the empty-state animation */
  loading?: boolean
}

export function RelationshipUniverse({
  members,
  selfMemberId,
  selectedMemberId,
  onSelectMember,
  onOpenMemberDetail,
  pathHighlight,
  onOpenPathFinder,
  pathFinderOpen = false,
  detailPanelOpen = false,
  onAddMember,
  onAddRelative,
  onInvite,
  onClaim,
  loading = false,
  isAdmin = false,
}: Props) {
  // Use only the authenticated viewer's resolved member ID for self labeling.
  // For anonymous explore mode we still need a stable layout anchor to keep the
  // graph visible, but that anchor must NOT be treated as "You".
  const effectiveSelfId = selfMemberId ?? ''
  const layoutAnchorId = selfMemberId ?? selectedMemberId ?? members[0]?.id ?? ''
  const router = useRouter()

  // ── Graph data ───────────────────────────────────────────────────────────
  const { people, edges } = useMemo(
    () => buildUniverse(members, layoutAnchorId, effectiveSelfId || null),
    [members, layoutAnchorId, effectiveSelfId]
  )
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  // Full FamilyMember lookup — used for anonymous display + NodeActionRing
  const membersById = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const maxDepth = useMemo(() => Math.max(0, ...people.map(p => p.depth)), [people])

  // ── Structural isolation nudge ──────────────────────────────────────────
  // True when the logged-in user's own node has no parentIds and no spouseIds
  // in the database. We show a prompt encouraging them to add connections so
  // the tree has a real structural backbone (not just label-derived edges).
  const isSelfIsolated = useMemo(() => {
    if (!effectiveSelfId) return false
    const selfMember = members.find(m => m.id === effectiveSelfId)
    if (!selfMember) return false
    return selfMember.parentIds.length === 0 && selfMember.spouseIds.length === 0
  }, [members, effectiveSelfId])

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
    // Auto-reveal close family only (depth 1→2): parents, spouse, children, siblings, grandparents.
    // Extended family (depth 3+) and community/affiliated (depth 4) are hidden until the user
    // taps ◎ Expand — this keeps the initial view focused and uncluttered.
    const initialRevealDepth = Math.min(2, maxDepth)
    for (let i = 2; i <= initialRevealDepth; i++) timers.push(setTimeout(() => setVisibleDepth(i), (i - 1) * 480))
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
  // Dock vanishes while the user is actively panning so it doesn't obstruct the canvas.
  const [dockHiddenByPan, setDockHiddenByPan] = useState(false)

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
    // ctrlKey = trackpad pinch on macOS — use finer steps; mouse wheel = coarser
    const delta = e.ctrlKey ? e.deltaY * 0.8 : e.deltaY
    const factor = delta < 0 ? 1.10 : 0.91
    setView(v => {
      const nk = Math.min(3.5, Math.max(0.18, v.k * factor))
      const f = nk / v.k
      // Keep the world-point under the cursor fixed in screen space
      const dx = e.clientX - sizeRef.current.w / 2
      const dy = e.clientY - sizeRef.current.h / 2
      return { x: dx * (1 - f) + v.x * f, y: dy * (1 - f) + v.y * f, k: nk }
    })
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
    if (Math.hypot(dx, dy) > 3) {
      if (!isPanning.current) setDockHiddenByPan(true)
      isPanning.current = true
    }
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
      setDockHiddenByPan(false)
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
  // Ring visibility state — auto-dismisses on idle/pan/ESC
  const [ringNodeId, setRingNodeId] = useState<string | null>(null)
  const lastNodeClickRef = useRef<{ id: string; t: number } | null>(null)

  // Ring: 4-second idle auto-dismiss
  useEffect(() => {
    if (!ringNodeId) return
    const t = setTimeout(() => setRingNodeId(null), 4000)
    return () => clearTimeout(t)
  }, [ringNodeId])

  // Ring: ESC to dismiss
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setRingNodeId(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Ring: clear when selection changes externally
  useEffect(() => {
    setRingNodeId(prev => (prev && prev !== selectedMemberId ? null : prev))
  }, [selectedMemberId])

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
    if (panAnimRef.current) { cancelAnimationFrame(panAnimRef.current); panAnimRef.current = null }
    const sv = viewRef.current
    const nk = nextZoom ?? sv.k
    const targetX = biasX - p.x * nk
    const targetY = -p.y * nk
    const [sx, sy, sk] = [sv.x, sv.y, sv.k]
    const dur = 520, t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const ease = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setView({ x: sx + (targetX - sx) * ease, y: sy + (targetY - sy) * ease, k: sk + (nk - sk) * ease })
      if (t < 1) panAnimRef.current = requestAnimationFrame(step)
      else panAnimRef.current = null
    }
    panAnimRef.current = requestAnimationFrame(step)
  }, [peopleById])

  /** Animated zoom by factor, centered on viewport center */
  const animateZoomBy = useCallback((factor: number) => {
    if (panAnimRef.current) { cancelAnimationFrame(panAnimRef.current); panAnimRef.current = null }
    const sv = viewRef.current
    const nk = Math.min(3.5, Math.max(0.18, sv.k * factor))
    const f = nk / sv.k
    // Zoom around viewport center (dx=0)
    const targetX = sv.x * f
    const targetY = sv.y * f
    const [sx, sy, sk] = [sv.x, sv.y, sv.k]
    const dur = 300, t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const ease = 1 - Math.pow(1 - t, 3)
      setView({ x: sx + (targetX - sx) * ease, y: sy + (targetY - sy) * ease, k: sk + (nk - sk) * ease })
      if (t < 1) panAnimRef.current = requestAnimationFrame(step)
      else panAnimRef.current = null
    }
    panAnimRef.current = requestAnimationFrame(step)
  }, [])

  /** Animated fit-all: smoothly frames entire graph */
  const animateFitAll = useCallback(() => {
    if (people.length === 0) return
    const xs = people.map(p => p.x)
    const ys = people.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const worldW = (maxX - minX) || 400
    const worldH = (maxY - minY) || 400
    const fitK = Math.min((size.w * 0.82) / worldW, (size.h * 0.82) / worldH, 1.5)
    const worldCx = (minX + maxX) / 2
    const worldCy = (minY + maxY) / 2
    if (panAnimRef.current) { cancelAnimationFrame(panAnimRef.current); panAnimRef.current = null }
    const sv = viewRef.current
    const targetX = -worldCx * fitK
    const targetY = -worldCy * fitK
    const [sx, sy, sk] = [sv.x, sv.y, sv.k]
    const dur = 520, t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const ease = 1 - Math.pow(1 - t, 3)
      setView({ x: sx + (targetX - sx) * ease, y: sy + (targetY - sy) * ease, k: sk + (fitK - sk) * ease })
      if (t < 1) panAnimRef.current = requestAnimationFrame(step)
      else panAnimRef.current = null
    }
    panAnimRef.current = requestAnimationFrame(step)
  }, [people, size])

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
    if (!effectiveSelfId) return new Map<string, string>()
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
      {members.length === 0 && !loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none select-none">
          {/* ── Progressive Graph Awakening ──
              Skeleton constellation: pulsing center node + 6 orbiting placeholder
              nodes fading in on a stagger. Conveys "this is where your universe
              will live" without showing a flat empty state. */}
          <div className="relative flex items-center justify-center mb-8" style={{ width: 260, height: 260 }}>
            {/* Orbit ring */}
            <div
              className="absolute rounded-full border"
              style={{
                width: 220, height: 220,
                borderColor: '#22d3ee',
                borderStyle: 'dashed',
                opacity: 0.18,
                animation: 'selfPulse 4.2s ease-in-out infinite',
              }}
            />
            {/* Orbiting skeleton nodes */}
            {Array.from({ length: 6 }).map((_, i) => {
              const angle = (i / 6) * Math.PI * 2 - Math.PI / 2
              const r = 110
              const x = Math.cos(angle) * r
              const y = Math.sin(angle) * r
              const delay = 0.4 + i * 0.18
              return (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: 28, height: 28,
                    left: `calc(50% + ${x}px - 14px)`,
                    top: `calc(50% + ${y}px - 14px)`,
                    background: 'linear-gradient(135deg, #22d3ee33, #22d3ee0a)',
                    border: '1.5px solid #22d3ee55',
                    boxShadow: '0 0 14px #22d3ee44',
                    opacity: 0,
                    animation: `selfPulse 2.4s ease-in-out infinite ${delay}s, awakenFade 0.9s ease-out ${delay}s forwards`,
                  }}
                />
              )
            })}
            {/* Center node — the user */}
            <div
              className="relative z-10 w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #22d3eecc, #22d3ee33)',
                boxShadow: '0 0 44px #22d3ee66, 0 0 90px #22d3ee33',
                animation: 'selfPulse 2.2s ease-in-out infinite',
              }}
            >
              <span style={{ fontSize: 32 }}>🌳</span>
            </div>
          </div>
          <h3 className="text-xl font-bold mb-2 tracking-tight" style={{ color: 'var(--foreground)' }}>
            Awakening your universe…
          </h3>
          <p className="text-sm text-center max-w-[300px] mb-6 leading-relaxed px-4" style={{ color: 'var(--muted-foreground)' }}>
            Your first node will light up the constellation. Each new relative extends the graph another generation.
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
              + Add the first node
            </button>
          )}
          <style jsx>{`
            @keyframes awakenFade {
              0%   { opacity: 0; transform: scale(0.6); }
              60%  { opacity: 1; transform: scale(1.08); }
              100% { opacity: 1; transform: scale(1); }
            }
          `}</style>
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

            // Anonymous display: non-admins see "?" placeholder for members with showAsAnonymous=true
            const fullMemberForAnon = membersById.get(p.id)
            const isNodeAnonymous = !isAdmin && (fullMemberForAnon?.showAsAnonymous ?? false)
            const displayInitials = isNodeAnonymous ? '?' : p.initials
            const displayNodeName = isNodeAnonymous ? '? Member' : p.name

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
                style={{ position: 'absolute', left: px - r, top: py - r, width: r * 2, height: r * 2, zIndex: isSelected ? 50 : undefined }}
                className="pointer-events-auto overflow-visible"
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
                      // Double-click → open deep profile
                      const now = Date.now()
                      const last = lastNodeClickRef.current
                      if (last && last.id === p.id && now - last.t < 350) {
                        lastNodeClickRef.current = null
                        setRingNodeId(null)
                        onOpenMemberDetail?.(p.id)
                        return
                      }
                      lastNodeClickRef.current = { id: p.id, t: now }
                      internalClickRef.current = true  // skip cinematic pan for direct clicks
                      onSelectMember(p.id)
                      setRingNodeId(p.id)
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
                      boxShadow: `0 0 ${isSelected ? 36 : isHovered ? 26 : 13}px ${color}, 0 0 ${isSelected ? 60 : isHovered ? 44 : 22}px ${color}`,
                      opacity: isSelected ? 0.72 : isHovered ? 0.60 : 0.36,
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
                  {effectivePathNodes.has(p.id) && effectivePathNodes.size > 1 && (
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
                        boxShadow: '0 0 14px color-mix(in srgb, var(--marriage) 60%, transparent), 0 0 34px color-mix(in srgb, var(--marriage) 35%, transparent)',
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
                    className="absolute inset-0 rounded-full grid place-items-center font-semibold text-white overflow-hidden"
                    style={{
                      background: isNodeAnonymous
                        ? 'oklch(0.28 0.02 250)'
                        : `radial-gradient(circle at 30% 25%, oklch(0.92 0.07 ${p.hue} / ${isSelected ? 1 : 0.88}), oklch(0.30 0.15 ${p.hue} / 0.96) 62%, oklch(0.16 0.08 ${p.hue}) 100%)`,
                      fontSize: Math.max(9, r * 0.50),
                      border: `1px solid oklch(1 0 0 / ${isSelected ? 0.22 : 0.12})`,
                      boxShadow: isNodeAnonymous ? undefined : isSelected ? `inset 0 0 16px ${color}` : isHovered ? `inset 0 0 8px ${color}` : undefined,
                      opacity: isNodeAnonymous ? 0.6 : undefined,
                    }}
                  >
                    {!isNodeAnonymous && p.photoUrl
                      ? <img src={p.photoUrl} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                      : displayInitials
                    }
                  </span>
                  {/* ── Claimed / unclaimed indicator ───────────────────── */}
                  {p.verified ? (
                    /* Claimed: small green shield badge at bottom-right */
                    <span
                      className="absolute rounded-full grid place-items-center pointer-events-none"
                      style={{
                        width: Math.max(10, Math.round(r * 0.42)),
                        height: Math.max(10, Math.round(r * 0.42)),
                        bottom: -Math.round(r * 0.10),
                        right: -Math.round(r * 0.10),
                        background: '#16a34a',
                        border: '1.5px solid var(--background, #09090b)',
                        boxShadow: '0 0 6px #16a34a88',
                        fontSize: Math.max(6, Math.round(r * 0.24)),
                      }}
                      title="Claimed — profile linked"
                    >✓</span>
                  ) : p.category !== 'self' && r >= 14 ? (
                    /* Unclaimed: subtle dashed ring around the avatar */
                    <span
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        inset: -2,
                        border: '1.5px dashed oklch(0.65 0.04 250 / 0.45)',
                      }}
                      title="Not yet claimed"
                    />
                  ) : null}
                  {/* Semantic zoom labels — theme-aware via tokens */}
                  {showName && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none"
                      style={{ top: r * 2 + 5 }}
                    >
                      <span className="block font-medium leading-tight drop-shadow-sm"
                        style={{ fontSize: Math.max(9, Math.min(13, r * 0.44)), color: isNodeAnonymous ? 'var(--muted-foreground)' : 'var(--universe-label-name)', fontStyle: isNodeAnonymous ? 'italic' : undefined }}>
                        {displayNodeName}
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
                  {/* ── Isolation nudge — shown when user has no structural connections ── */}
                  {p.category === 'self' && isSelfIsolated && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 pointer-events-auto"
                      style={{ top: r * 2 + (showName ? 52 : 22), zIndex: 60, minWidth: 186 }}
                      onClick={e => { e.stopPropagation(); onAddRelative?.(p.id, 'father') }}
                    >
                      <div
                        className="flex items-start gap-2 rounded-xl px-3 py-2.5 cursor-pointer group"
                        style={{
                          background: 'oklch(0.16 0.04 250 / 0.92)',
                          border: '1px solid oklch(0.55 0.18 196 / 0.55)',
                          boxShadow: '0 0 18px #22d3ee18, 0 4px 16px #00000088',
                          backdropFilter: 'blur(8px)',
                        }}
                      >
                        <span className="text-base mt-0.5 shrink-0">🌱</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold leading-snug"
                            style={{ color: '#67e8f9' }}>
                            Connect your branch
                          </p>
                          <p className="text-[10px] leading-snug mt-0.5"
                            style={{ color: 'oklch(0.72 0.04 250)' }}>
                            Add your parents, spouse or siblings to build the real tree structure.
                          </p>
                          <p className="text-[10px] font-semibold mt-1.5 group-hover:underline"
                            style={{ color: '#22d3ee' }}>
                            + Add relationship →
                          </p>
                        </div>
                      </div>
                      {/* Connector dot to the node */}
                      <div className="absolute left-1/2 -translate-x-px -top-1.5 w-px h-2"
                        style={{ background: 'oklch(0.55 0.18 196 / 0.5)' }} />
                    </div>
                  )}
                </button>
                {/* Inline add-relative actions — rendered outside <button>, dismisses after idle */}
                {ringNodeId === p.id && onAddRelative && (() => {
                  const fullMember = members.find(m => m.id === p.id)
                  if (!fullMember) return null
                  return (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 pointer-events-auto"
                      style={{ top: r * 2 + 58, zIndex: 50 }}
                      onClick={e => e.stopPropagation()}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <NodeActionRing member={fullMember} allMembers={members} onAddRelative={onAddRelative} />
                    </div>
                  )
                })()}
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

      {/* ── Contextual identity card for selected node ────────────────────── */}
      {/*
          Design principles:
          • Fully theme-aware — uses CSS variable tokens (dark + light).
          • Signature actions (Path, Focus, Portal, Network) are always visible —
            they are the product's signature UX, not buried behind a toggle.
          • Mobile: bottom sheet — header + scrollable info chips + primary CTA
            + 2-row signature grid.
          • Desktop: 4-column tray — identity | family | about | actions.
          • maxHeight capped so the graph always dominates the viewport.
      */}
      <AnimatePresence>
        {selectedMemberId && selectedPerson && !detailPanelOpen && !pathFinderOpen && (
          <motion.div
            key={selectedMemberId}
            initial={{ opacity: 0, y: isMobileView ? 64 : 18 }}
            animate={{ opacity: dockHiddenByPan ? 0 : 1, y: dockHiddenByPan ? (isMobileView ? 64 : 10) : 0 }}
            exit={{ opacity: 0, y: isMobileView ? 64 : 14 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className={cn('absolute z-50 overflow-hidden', dockHiddenByPan && 'pointer-events-none')}
            style={{
              ...(isMobileView
                ? { left: 0, right: 0, bottom: 56, borderRadius: '20px 20px 0 0' }
                : { left: 12, right: 12, bottom: 68, borderRadius: 16 }),
              background: 'var(--universe-panel-bg)',
              border: `1px solid var(--universe-panel-border)`,
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              boxShadow: `0 -4px 40px rgba(0,0,0,0.22), 0 0 0 1px var(--universe-panel-border)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Category color accent stripe — top edge */}
            <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
              style={{ background: `linear-gradient(90deg, ${CATEGORY_COLOR[selectedPerson.category]} 0%, transparent 60%)` }} />

            {/* Global dismiss button — top-right of the whole card */}
            {!isMobileView && (
              <button
                onClick={(e) => { e.stopPropagation(); onSelectMember(selectedMemberId) }}
                className="absolute top-2.5 right-3 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all hover:brightness-110 active:scale-90"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: 11 }}
              >✕</button>
            )}

            {(() => {
              const fullM = membersById.get(selectedMemberId!)
              const isSelf = !!selfMemberId && selectedMemberId === selfMemberId
              const isUnclaimed = !(fullM?.isClaimed ?? false)
              const isDeceased = !!(fullM?.isDeceased ?? fullM?.deathYear)
              // canClaim: viewer has no claimed node and wants to claim for themselves
              const canClaim = isUnclaimed && !isDeceased && !isSelf && !selfMemberId && !!onClaim
              // canInvite: viewer already has a claimed node and wants to invite someone else
              const canInvite = isUnclaimed && !isDeceased && !!onInvite
              const spouseIds: string[] = fullM?.spouseIds ?? []
              const spouses = spouseIds.map(id => membersById.get(id)).filter(Boolean) as FamilyMember[]
              const children = members.filter(m => m.parentIds?.includes(selectedMemberId!))
              const age = fullM?.birthYear ? new Date().getFullYear() - fullM.birthYear : null
              const hasAbout = !!(age ?? fullM?.occupation ?? fullM?.hometown ?? fullM?.gotra ?? fullM?.caste)
              const hasFamily = spouses.length > 0 || children.length > 0
              const catColor = CATEGORY_COLOR[selectedPerson.category]

              // ── Signature action buttons — ALWAYS VISIBLE, never hidden ─────
              // These are the core "universe navigation" primitives.
              // Each button has its own semantic color so users build muscle memory.
              const sigButtons = [
                ...(onOpenPathFinder && !isSelf ? [{
                  key: 'path', label: 'Find Rel', icon: '⟷',
                  color: 'var(--paternal)',
                  action: () => { onOpenPathFinder!(selectedMemberId!); setShowAnalytics(false); setShowIntelPanel(false) },
                }] : []),
                {
                  key: 'focus', label: 'Focus', icon: '⊕',
                  color: 'var(--cyan-glow)',
                  action: () => panToPerson(selectedMemberId!, 1.6),
                },
                ...(marriageNeighbors.length > 0 ? [{
                  key: 'portal', label: 'In-Laws', icon: '💍',
                  color: 'var(--marriage)',
                  action: () => runMarriagePortal(),
                }] : []),
                {
                  key: 'network', label: 'Expand', icon: '◎',
                  color: 'var(--community)',
                  action: () => {
                    // Staggered cinematic reveal of extended family (depth 3 → maxDepth)
                    const expandTimers: ReturnType<typeof setTimeout>[] = []
                    for (let i = 3; i <= maxDepth; i++) {
                      expandTimers.push(setTimeout(() => setVisibleDepth(i), (i - 3) * 480))
                    }
                    panToPerson(effectiveSelfId, 0.58)
                  },
                },
                ...(onAddRelative ? [{
                  key: 'add', label: 'Add', icon: '＋',
                  color: 'var(--muted-foreground)',
                  action: () => onAddRelative!(selectedMemberId!, 'child'),
                }] : []),
              ] as { key: string; label: string; icon: string; color: string; action: () => void }[]

              // ── Primary CTA ────────────────────────────────────────────────
              const primaryBtn = isSelf
                ? { label: 'Edit My Profile', icon: '✏️', bg: 'var(--primary)', action: () => onOpenMemberDetail?.(selectedMemberId!) }
                : canClaim
                  ? { label: 'This is me — Claim', icon: '🙋', bg: 'oklch(0.50 0.22 200)', action: () => onClaim!(selectedMemberId!) }
                  : canInvite
                    ? { label: 'Invite to Join', icon: '✉️', bg: 'oklch(0.50 0.22 145)', action: () => onInvite!(selectedMemberId!) }
                    : { label: 'View Profile', icon: '👤', bg: 'var(--primary)', action: () => onOpenMemberDetail?.(selectedMemberId!) }

              // ── Avatar element — reused in both layouts ─────────────────────
              const AvatarEl = (
                <div className="relative shrink-0">
                  <div className="rounded-full overflow-hidden flex items-center justify-center font-bold text-white"
                    style={{
                      width: isMobileView ? 44 : 52, height: isMobileView ? 44 : 52,
                      fontSize: isMobileView ? 14 : 17,
                      background: `linear-gradient(135deg, color-mix(in srgb, ${catColor} 80%, #000) 0%, color-mix(in srgb, ${catColor} 30%, transparent) 100%)`,
                      boxShadow: `0 0 0 2.5px color-mix(in srgb, ${catColor} 40%, transparent), 0 0 20px color-mix(in srgb, ${catColor} 22%, transparent)`,
                    }}>
                    {selectedPerson.photoUrl
                      ? <img src={selectedPerson.photoUrl} alt={selectedPerson.name} className="w-full h-full object-cover" />
                      : selectedPerson.initials}
                  </div>
                  {fullM?.isClaimed && !isDeceased && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 flex items-center justify-center"
                      style={{ background: 'oklch(0.62 0.22 145)', borderColor: 'var(--universe-panel-bg)' }} />
                  )}
                </div>
              )

              // ── MOBILE LAYOUT ───────────────────────────────────────────────
              if (isMobileView) {
                return (
                  <div className="flex flex-col">
                    {/* Row 1 — Avatar + Identity + dismiss */}
                    <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5"
                      style={{ borderBottom: `1px solid var(--universe-panel-border)` }}>
                      {AvatarEl}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14px] truncate leading-tight"
                          style={{ color: 'var(--foreground)' }}>{selectedPerson.name}</div>
                        <div className="text-[11px] font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span style={{ color: catColor }}>
                            {selectedPerson.relation || selectedPerson.category.replace(/-/g, ' ')}
                          </span>
                          {age && <span style={{ color: 'var(--muted-foreground)' }}>· {age} yrs</span>}
                          {selectedPerson.city && <span style={{ color: 'var(--muted-foreground)' }}>· {selectedPerson.city}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {isSelf && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full"
                              style={{ background: 'color-mix(in srgb, var(--primary) 18%, transparent)', color: 'var(--primary)' }}>You</span>
                          )}
                          {!isSelf && isUnclaimed && !isDeceased && (
                            <span className="text-[9px] px-1.5 py-px rounded-full"
                              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>unclaimed</span>
                          )}
                          {!isSelf && fullM?.isClaimed && (
                            <span className="text-[9px] font-semibold px-1.5 py-px rounded-full"
                              style={{ background: 'color-mix(in srgb, oklch(0.62 0.22 145) 14%, transparent)', color: 'oklch(0.62 0.22 145)' }}>● active</span>
                          )}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); onSelectMember(selectedMemberId) }}
                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:brightness-110 active:scale-90"
                        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: 11 }}>✕</button>
                    </div>

                    {/* Row 2 — Scrollable info chips (family + about facts) */}
                    {(hasFamily || hasAbout) && (
                      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto"
                        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', borderBottom: `1px solid var(--universe-panel-border)` }}>
                        {spouses.slice(0, 1).map(sp => (
                          <button key={sp.id}
                            onClick={(e) => { e.stopPropagation(); onSelectMember(sp.id) }}
                            className="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
                            style={{
                              background: 'color-mix(in srgb, var(--marriage) 12%, var(--muted))',
                              border: '1px solid color-mix(in srgb, var(--marriage) 28%, transparent)',
                              color: 'var(--foreground)',
                            }}>
                            💍 {sp.name.split(' ')[0]}
                          </button>
                        ))}
                        {children.length > 0 && (
                          <span className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]"
                            style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border)', color: 'var(--muted-foreground)' }}>
                            👨‍👩‍👧 {children.length} {children.length === 1 ? 'child' : 'children'}
                          </span>
                        )}
                        {age && (
                          <span className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]"
                            style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border)', color: 'var(--muted-foreground)' }}>
                            🎂 {age} yrs
                          </span>
                        )}
                        {fullM?.occupation && (
                          <span className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]"
                            style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border)', color: 'var(--muted-foreground)' }}>
                            💼 {fullM.occupation}
                          </span>
                        )}
                        {fullM?.hometown && (
                          <span className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]"
                            style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border)', color: 'var(--muted-foreground)' }}>
                            🏡 {fullM.hometown}
                          </span>
                        )}
                        {fullM?.gotra && (
                          <span className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]"
                            style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border)', color: 'var(--muted-foreground)' }}>
                            ∞ {fullM.gotra}
                          </span>
                        )}
                        {spouses.length === 0 && children.length === 0 && onAddRelative && (
                          <button onClick={(e) => { e.stopPropagation(); onAddRelative!(selectedMemberId!, 'spouse') }}
                            className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] transition-opacity hover:opacity-80"
                            style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border)', color: 'var(--muted-foreground)' }}>
                            + Add spouse
                          </button>
                        )}
                      </div>
                    )}

                    {/* Row 3 — Primary CTA + Signature action grid */}
                    <div className="px-4 pt-2.5 pb-3 space-y-2">
                      {/* Primary CTA — full width */}
                      <button
                        onClick={(e) => { e.stopPropagation(); primaryBtn.action() }}
                        className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-[12px] font-semibold transition-all hover:brightness-110 active:scale-[0.98]"
                        style={{ background: primaryBtn.bg, color: '#fff' }}
                      >
                        <span style={{ fontSize: 14 }}>{primaryBtn.icon}</span>
                        {primaryBtn.label}
                      </button>

                      {/* Signature grid — ALWAYS VISIBLE on mobile */}
                      {sigButtons.length > 0 && (
                        <div
                          className="grid gap-1.5"
                          style={{ gridTemplateColumns: `repeat(${Math.min(sigButtons.length, 5)}, 1fr)` }}
                        >
                          {sigButtons.map(({ key, icon, label, color, action }) => (
                            <button
                              key={key}
                              onClick={(e) => { e.stopPropagation(); action() }}
                              className="flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[9px] font-semibold transition-all hover:brightness-110 active:scale-95"
                              style={{
                                background: `color-mix(in srgb, ${color} 12%, var(--muted))`,
                                border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
                                color,
                              }}
                            >
                              <span className="text-[15px] leading-none">{icon}</span>
                              {label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* View / Edit Profile — only when primary CTA doesn't already open the profile */}
                      {!isSelf && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenMemberDetail?.(selectedMemberId!) }}
                          className="w-full flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-medium transition-all hover:brightness-105 active:scale-[0.98]"
                          style={{
                            background: 'var(--muted)',
                            border: `1px solid var(--universe-panel-border)`,
                            color: 'var(--muted-foreground)',
                          }}
                        >
                          <span style={{ fontSize: 12 }}>👤</span>
                          {isUnclaimed ? 'Edit Profile' : 'View Profile'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              }

              // ── DESKTOP LAYOUT — 5-column card (reference-matched) ──────────
              // Columns: Identity (250px) | Family (flex) | About (flex) | Connections (148px) | Actions (140px)
              // About uses a CSS grid so label and value sit immediately adjacent — no justify-between gap.
              const adjacentIds = adjacencyMap.get(selectedMemberId!) ?? new Set<string>()
              const selfAdjacentIds = adjacencyMap.get(effectiveSelfId) ?? new Set<string>()
              const mutualIds = [...adjacentIds].filter(id =>
                id !== selectedMemberId && id !== effectiveSelfId && selfAdjacentIds.has(id)
              )
              const mutualPeople = mutualIds.map(id => peopleById.get(id)).filter(Boolean) as UPerson[]

              // Occupation + gotra pill tags (shown in identity column)
              const identityPills = [
                fullM?.occupation,
                fullM?.gotra ? `${fullM.gotra} gotra` : undefined,
              ].filter(Boolean) as string[]

              // Community string: "Verma • Kashyap" style
              const communityLine = [fullM?.caste, fullM?.nativeLanguage].filter(Boolean).join(' • ')

              return (
                <div className="flex flex-row" style={{ minHeight: 150, maxHeight: 190 }}>

                  {/* ── IDENTITY (280px) — photo · name · relation · location · community · pills ── */}
                  <div className="relative flex items-start gap-3 px-4 pt-4 pb-3 shrink-0"
                    style={{ width: 280, borderRight: `1px solid var(--universe-panel-border)` }}>

                    {/* Larger avatar — 64px with glow */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className="rounded-full overflow-hidden flex items-center justify-center font-bold text-white"
                        style={{
                          width: 64, height: 64, fontSize: 20,
                          background: `linear-gradient(135deg, color-mix(in srgb, ${catColor} 75%, #000) 0%, color-mix(in srgb, ${catColor} 28%, transparent) 100%)`,
                          boxShadow: `0 0 0 2.5px color-mix(in srgb, ${catColor} 45%, transparent), 0 0 22px color-mix(in srgb, ${catColor} 20%, transparent)`,
                        }}>
                        {selectedPerson.photoUrl
                          ? <img src={selectedPerson.photoUrl} alt={selectedPerson.name} className="w-full h-full object-cover" />
                          : selectedPerson.initials}
                      </div>
                      {fullM?.isClaimed && !isDeceased && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold"
                          style={{ background: 'oklch(0.62 0.22 145)', borderColor: 'var(--universe-panel-bg)', color: '#fff' }}>✓</span>
                      )}
                    </div>

                    {/* Text block */}
                    <div className="min-w-0 flex-1 pt-0.5 pr-7">
                      {/* Name + badge */}
                      <div className="flex items-start gap-1 leading-tight">
                        <span className="font-bold text-[13px] leading-snug break-words" style={{ color: 'var(--foreground)', wordBreak: 'break-word' }}>
                          {selectedPerson.name}
                        </span>
                        {fullM?.isClaimed && (
                          <span className="shrink-0 text-[10px]" style={{ color: catColor }}>✓</span>
                        )}
                      </div>
                      {/* Relation */}
                      <div className="text-[11px] font-medium mt-0.5 truncate" style={{ color: catColor }}>
                        {selectedPerson.relation || selectedPerson.category.replace(/-/g, ' ')}
                        {isSelf && <span className="ml-1 font-bold" style={{ color: 'var(--primary)' }}>· You</span>}
                      </div>
                      {/* Location */}
                      {selectedPerson.city && (
                        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>
                          {selectedPerson.city}
                        </div>
                      )}
                      {/* Community line */}
                      {communityLine && (
                        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>
                          {communityLine}
                        </div>
                      )}
                      {/* Tag pills — occupation, gotra */}
                      {identityPills.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {identityPills.map(pill => (
                            <span key={pill} className="text-[9px] px-1.5 py-px rounded-md"
                              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--universe-panel-border)' }}>
                              {pill}
                            </span>
                          ))}
                          {isUnclaimed && !isDeceased && !isSelf && (
                            <span className="text-[9px] px-1.5 py-px rounded-md"
                              style={{ background: 'color-mix(in srgb, var(--warning) 12%, var(--muted))', color: 'var(--warning)', border: '1px solid color-mix(in srgb, var(--warning) 22%, transparent)' }}>
                              unclaimed
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── FAMILY column (flex-1) ─────────────────────────────── */}
                  <div className="flex-1 min-w-0 flex flex-col px-4 py-3 overflow-hidden"
                    style={{ borderRight: `1px solid var(--universe-panel-border)`, minWidth: 150 }}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.10em] mb-2"
                      style={{ color: 'var(--muted-foreground)' }}>Family</div>

                    {hasFamily ? (
                      <div className="flex-1 flex flex-col justify-between">
                        <div className="space-y-2">
                          {/* Spouse row */}
                          {spouses.slice(0, 1).map(sp => (
                            <button key={sp.id}
                              onClick={(e) => { e.stopPropagation(); onSelectMember(sp.id) }}
                              className="flex items-center gap-2 w-full group text-left">
                              <div className="shrink-0">
                                <div className="text-[8.5px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>Spouse</div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[9px] font-semibold"
                                    style={{
                                      background: 'color-mix(in srgb, var(--marriage) 30%, var(--muted))',
                                      color: 'var(--foreground)',
                                    }}>
                                    {sp.photoUrl ? <img src={sp.photoUrl} alt={sp.name} className="w-full h-full object-cover" /> : sp.name[0]}
                                  </div>
                                  <span className="text-[11px] font-semibold truncate group-hover:opacity-70 transition-opacity"
                                    style={{ color: 'var(--foreground)' }}>{sp.name}</span>
                                </div>
                              </div>
                            </button>
                          ))}

                          {/* Children — avatar + first name chips */}
                          {children.length > 0 && (
                            <div>
                              <div className="text-[8.5px] mb-1" style={{ color: 'var(--muted-foreground)' }}>Children</div>
                              <div className="flex gap-2 flex-wrap">
                                {children.slice(0, 4).map(ch => (
                                  <button key={ch.id}
                                    onClick={(e) => { e.stopPropagation(); onSelectMember(ch.id) }}
                                    className="flex items-center gap-1 group hover:opacity-80 transition-opacity">
                                    <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[8px] font-semibold"
                                      style={{
                                        background: `color-mix(in srgb, ${catColor} 28%, var(--muted))`,
                                        color: 'var(--foreground)',
                                      }}>
                                      {ch.photoUrl ? <img src={ch.photoUrl} alt={ch.name} className="w-full h-full object-cover" /> : ch.name[0]}
                                    </div>
                                    <span className="text-[10px] font-medium" style={{ color: 'var(--foreground)' }}>
                                      {ch.name.split(' ')[0]}
                                    </span>
                                  </button>
                                ))}
                                {children.length > 4 && (
                                  <span className="text-[10px] self-center" style={{ color: 'var(--muted-foreground)' }}>
                                    +{children.length - 4}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* View Family Tree link */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenMemberDetail?.(selectedMemberId!) }}
                          className="mt-auto pt-2 text-left text-[10px] font-semibold hover:opacity-70 transition-opacity"
                          style={{ color: catColor }}>
                          View Family Tree ›
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-between">
                        <div className="space-y-1.5">
                          {!!onAddRelative && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); onAddRelative!(selectedMemberId!, 'spouse') }}
                                className="flex items-center gap-1.5 text-[10px] transition-opacity hover:opacity-70"
                                style={{ color: 'var(--muted-foreground)' }}>
                                <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]"
                                  style={{ borderColor: 'var(--universe-panel-border)' }}>+</span>
                                Add spouse
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); onAddRelative!(selectedMemberId!, 'child') }}
                                className="flex items-center gap-1.5 text-[10px] transition-opacity hover:opacity-70"
                                style={{ color: 'var(--muted-foreground)' }}>
                                <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]"
                                  style={{ borderColor: 'var(--universe-panel-border)' }}>+</span>
                                Add child
                              </button>
                            </>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenMemberDetail?.(selectedMemberId!) }}
                          className="mt-auto pt-2 text-left text-[10px] font-semibold hover:opacity-70 transition-opacity"
                          style={{ color: catColor }}>
                          View Family Tree ›
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── ABOUT column (flex-1) — CSS grid keeps label+value immediately adjacent ── */}
                  <div className="flex-1 min-w-0 px-4 py-3 overflow-hidden"
                    style={{ borderRight: `1px solid var(--universe-panel-border)`, minWidth: 150 }}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.10em] mb-2"
                      style={{ color: 'var(--muted-foreground)' }}>About</div>
                    {hasAbout ? (
                      /* 2-column CSS grid: fixed label column (72px) | value column
                         No justify-between — label and value are immediately adjacent */
                      <div className="grid" style={{ gridTemplateColumns: '72px 1fr', rowGap: 6, columnGap: 10 }}>
                        {age && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Age</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{age}</span>
                          </>
                        )}
                        {fullM?.occupation && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Profession</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{fullM.occupation}</span>
                          </>
                        )}
                        {fullM?.hometown && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Hometown</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{fullM.hometown}</span>
                          </>
                        )}
                        {fullM?.caste && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Community</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{fullM.caste}</span>
                          </>
                        )}
                        {fullM?.gotra && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Gotra</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{fullM.gotra}</span>
                          </>
                        )}
                        {fullM?.religion && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Religion</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{fullM.religion}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        No details yet —{' '}
                        <button onClick={(e) => { e.stopPropagation(); onOpenMemberDetail?.(selectedMemberId!) }}
                          className="underline underline-offset-2 hover:opacity-70 transition-opacity">
                          add info
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── SHARED CONNECTIONS (148px) ─────────────────────────── */}
                  <div className="shrink-0 flex flex-col px-4 py-3"
                    style={{ width: 148, borderRight: `1px solid var(--universe-panel-border)` }}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.10em] mb-2"
                      style={{ color: 'var(--muted-foreground)' }}>Connections</div>

                    {/* Overlapping avatar stack */}
                    {mutualPeople.length > 0 ? (
                      <>
                        <div className="flex items-center mb-1.5">
                          {mutualPeople.slice(0, 4).map((mp, i) => (
                            <button key={mp.id}
                              onClick={(e) => { e.stopPropagation(); onSelectMember(mp.id) }}
                              title={mp.name}
                              className="relative rounded-full overflow-hidden flex items-center justify-center text-[8px] font-bold hover:scale-110 transition-transform"
                              style={{
                                width: 26, height: 26,
                                marginLeft: i === 0 ? 0 : -8,
                                zIndex: 4 - i,
                                background: `color-mix(in srgb, ${CATEGORY_COLOR[mp.category]} 50%, var(--muted))`,
                                color: 'var(--foreground)',
                                border: '1.5px solid var(--universe-panel-bg)',
                              }}>
                              {mp.photoUrl
                                ? <img src={mp.photoUrl} alt={mp.name} className="w-full h-full object-cover" />
                                : mp.initials[0]}
                            </button>
                          ))}
                          {mutualPeople.length > 4 && (
                            <div className="relative rounded-full flex items-center justify-center text-[8px] font-bold"
                              style={{
                                width: 26, height: 26, marginLeft: -8, zIndex: 0,
                                background: 'var(--muted)', color: 'var(--muted-foreground)',
                                border: '1.5px solid var(--universe-panel-bg)',
                              }}>
                              +{mutualPeople.length - 4}
                            </div>
                          )}
                        </div>
                        <div className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--foreground)' }}>
                          {mutualPeople.length} Mutual {mutualPeople.length === 1 ? 'Connection' : 'Connections'}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowIntelPanel(true); setShowAnalytics(false) }}
                          className="mt-1 text-left text-[10px] font-semibold hover:opacity-70 transition-opacity"
                          style={{ color: catColor }}>
                          View All ›
                        </button>
                      </>
                    ) : (
                      <div className="text-[10px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        No shared connections yet
                      </div>
                    )}
                  </div>

                  {/* ── ACTIONS (156px) — 2×2 icon+label grid + View/Edit Profile ── */}
                  <div className="shrink-0 flex flex-col px-3 py-3 gap-2" style={{ width: 156 }}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.10em]"
                      style={{ color: 'var(--muted-foreground)' }}>Actions</div>

                    {/* Primary CTA — full width */}
                    <button
                      onClick={(e) => { e.stopPropagation(); primaryBtn.action() }}
                      className="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg text-[10.5px] font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                      style={{ background: primaryBtn.bg, color: '#fff' }}
                    >
                      <span style={{ fontSize: 12 }}>{primaryBtn.icon}</span>
                      {primaryBtn.label}
                    </button>

                    {/* 2×2 compact grid: Focus · In-Laws / Expand · Add Relative */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {sigButtons.filter(b => b.key === 'focus' || b.key === 'portal' || b.key === 'network' || b.key === 'add').map(({ key, icon, label, color, action }) => (
                        <button
                          key={key}
                          onClick={(e) => { e.stopPropagation(); action() }}
                          className="flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[9px] font-semibold transition-all hover:brightness-110 active:scale-95"
                          style={{
                            background: `color-mix(in srgb, ${color} 12%, var(--muted))`,
                            border: `1px solid color-mix(in srgb, ${color} 22%, var(--universe-panel-border))`,
                            color,
                          }}
                        >
                          <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
                          <span style={{ color: 'var(--foreground)' }}>{label}</span>
                        </button>
                      ))}
                    </div>

                    {/* View / Edit Profile — only when primary CTA doesn't already open the profile */}
                    {!isSelf && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenMemberDetail?.(selectedMemberId!) }}
                        className="w-full flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[10px] font-medium transition-all hover:brightness-105 active:scale-[0.97]"
                        style={{
                          background: 'var(--muted)',
                          border: `1px solid var(--universe-panel-border)`,
                          color: 'var(--muted-foreground)',
                        }}
                      >
                        <span style={{ fontSize: 11 }}>👤</span>
                        {isUnclaimed ? 'Edit Profile' : 'View Profile'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter chips — horizontal scroll on mobile, vertical on desktop ── */}
      {/* mobile: left-14 (56px) clears the AppSidebar fixed hamburger (left-3 + w-9 = 48px) + 8px gap */}
      {isMobileView ? (
        <div
          className="absolute top-2 left-14 right-2 z-30 flex flex-row gap-1.5 overflow-x-auto"
          style={{ zIndex: 10, scrollbarWidth: 'none' }}
        >
          {/* Hidden-members hint — mobile: inline chip in the filter row */}
          {(() => {
            const hiddenCount = people.filter(p => p.depth > visibleDepth).length
            if (hiddenCount === 0) return null
            return (
              <button
                onClick={() => {
                  for (let i = visibleDepth + 1; i <= maxDepth; i++) {
                    setTimeout(() => setVisibleDepth(i), (i - visibleDepth - 1) * 480)
                  }
                }}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-all backdrop-blur-md shadow-sm"
                style={{
                  background: 'var(--universe-chip-bg)',
                  borderColor: 'var(--community)',
                  color: 'var(--community)',
                }}
              >
                +{hiddenCount} ◎
              </button>
            )
          })()}
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
      )
      }

      {/* ── Intelligence Panel toggle buttons — desktop only (mobile: in legend bar) ── */}
      {
        !isMobileView && (
          <div className="absolute bottom-14 left-4 z-30 flex items-center gap-1.5 flex-wrap">
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
            {/* Hidden members hint — shown when extended family is not yet revealed */}
            {(() => {
              const hiddenCount = people.filter(p => p.depth > visibleDepth).length
              if (hiddenCount === 0) return null
              return (
                <button
                  onClick={() => {
                    for (let i = visibleDepth + 1; i <= maxDepth; i++) {
                      setTimeout(() => setVisibleDepth(i), (i - visibleDepth - 1) * 480)
                    }
                  }}
                  className="rounded-full px-3 py-1.5 text-[11px] font-medium border backdrop-blur-md transition-all animate-pulse"
                  style={{
                    background: 'var(--universe-chip-bg)',
                    borderColor: 'var(--community)',
                    color: 'var(--community)',
                  }}
                  title="Show extended family and affiliated members"
                >
                  +{hiddenCount} hidden · ◎ Expand
                </button>
              )
            })()}
          </div>
        )
      }

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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Family Overview</h3>
              <button
                onClick={() => setShowAnalytics(false)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-opacity hover:opacity-70"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
              >✕</button>
            </div>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Relationship Intelligence</h3>
              <button
                onClick={() => setShowIntelPanel(false)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-opacity hover:opacity-70"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
              >✕</button>
            </div>
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
      {/* Hidden when node popup is open so the popup (z-50) is fully accessible */}
      {
        isMobileView && !(selectedMemberId && selectedPerson && !detailPanelOpen && !pathFinderOpen) && (
          <div
            className="absolute bottom-20 right-4 z-40 flex flex-col gap-2 transition-opacity duration-300"
            style={{ opacity: showMobileControls ? 1 : 0, pointerEvents: showMobileControls ? 'auto' : 'none' }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); animateZoomBy(1.30); resetControlsTimer() }}
              className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md shadow-lg text-xl font-bold active:scale-95 transition-transform"
              style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--universe-chip-text)' }}
            >+</button>
            <button
              onClick={(e) => { e.stopPropagation(); animateZoomBy(0.77); resetControlsTimer() }}
              className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md shadow-lg text-xl font-bold active:scale-95 transition-transform"
              style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--universe-chip-text)' }}
            >−</button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (effectiveSelfId) panToPerson(effectiveSelfId, isMobileView ? 0.72 : 0.88)
                else animateFitAll()
                resetControlsTimer()
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md shadow-lg text-base active:scale-95 transition-transform"
              style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--primary)' }}
              title="Recenter graph"
            >⌖</button>
          </div>
        )
      }

      {/* ── Desktop FABs (Zoom In, Zoom Out, Fit, Recenter) ──────────── */}
      {
        !isMobileView && (
          <div className="absolute top-4 left-4 z-40 flex flex-col gap-1.5">
            {/* Zoom In */}
            <button
              onClick={(e) => { e.stopPropagation(); animateZoomBy(1.25) }}
              title="Zoom in"
              className="flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur-md shadow-md text-base font-bold hover:scale-105 active:scale-95 transition-transform"
              style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--universe-chip-text)' }}
            >+</button>
            {/* Zoom Out */}
            <button
              onClick={(e) => { e.stopPropagation(); animateZoomBy(0.80) }}
              title="Zoom out"
              className="flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur-md shadow-md text-base font-bold hover:scale-105 active:scale-95 transition-transform"
              style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--universe-chip-text)' }}
            >−</button>
            {/* Fit all nodes */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                animateFitAll()
              }}
              title="Fit all to screen"
              className="flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur-md shadow-md text-xs hover:scale-105 active:scale-95 transition-transform"
              style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--universe-chip-text)' }}
            >▭</button>
            {/* Recenter on self */}
            <button
              onClick={(e) => { e.stopPropagation(); panToPerson(effectiveSelfId, 0.92) }}
              title="Recenter on me"
              className="flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur-md shadow-md text-base hover:scale-105 active:scale-95 transition-transform"
              style={{ background: 'var(--universe-chip-bg)', borderColor: 'var(--universe-chip-border)', color: 'var(--primary)' }}
            >⌖</button>
          </div>
        )
      }

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
