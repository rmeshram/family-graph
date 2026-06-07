'use client'

import { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { FamilyMember } from '@/lib/types'
import { enrichMembersWithDerivedEdges } from '@/lib/relation-engine'
import { getRelationshipBetweenPeople } from '@/lib/relationship-engine'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ZoomIn, ZoomOut, Maximize2, Grid3X3, ChevronDown, ChevronRight, Lock, ShieldCheck, ChevronLeft, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ParticleBackground } from '@/components/particle-background'
import { useGraphIndex } from '@/hooks/use-graph-index'
import { useViewportCulling, isEdgeVisible } from '@/hooks/use-viewport-culling'
import { NodeActionRing } from '@/components/node-action-ring'
import type { QuickRelType } from '@/components/quick-add-member-dialog'

/* ── Relationship badge colour map ─────────────────────────────────────────── */
function getRelBadgeStyle(rel: string | undefined, networkGroup?: string) {
  if (networkGroup === 'affiliated') return { bg: 'rgba(20,184,166,0.15)', color: 'rgba(52,211,153,0.95)', border: 'rgba(20,184,166,0.42)' }
  if (networkGroup === 'extended') return { bg: 'rgba(139,92,246,0.15)', color: 'rgba(167,139,250,0.95)', border: 'rgba(139,92,246,0.42)' }
  const r = (rel ?? '').toLowerCase()
  if (r === 'self') return { bg: 'rgba(99,102,241,0.18)', color: 'rgba(165,180,252,0.95)', border: 'rgba(99,102,241,0.52)' }
  // Spouse
  if (r.startsWith('husband') || r.startsWith('wife') || r === 'spouse' || r.startsWith('co-spouse'))
    return { bg: 'rgba(244,63,94,0.15)', color: 'rgba(251,113,133,0.95)', border: 'rgba(244,63,94,0.42)' }
  // Children / descendants (green)
  if (r.startsWith('son') || r.startsWith('daughter') || r === 'child' || r.startsWith('child ') ||
    r.startsWith('grandson') || r.startsWith('granddaughter') || r.startsWith('grandchild') ||
    r.includes('great-grandson') || r.includes('great-granddaughter') || r.includes('great-grandchild'))
    return { bg: 'rgba(34,197,94,0.12)', color: 'rgba(134,239,172,0.95)', border: 'rgba(34,197,94,0.38)' }
  // Parents / ancestors (blue)
  if (r.startsWith('father') || r.startsWith('mother') || r === 'parent' || r.startsWith('parent ') ||
    r.startsWith('grandfather') || r.startsWith('grandmother') || r.startsWith('grandparent') ||
    r.includes('great-grandfather') || r.includes('great-grandmother') || r.includes('great-grandparent'))
    return { bg: 'rgba(59,130,246,0.15)', color: 'rgba(147,197,253,0.95)', border: 'rgba(59,130,246,0.42)' }
  // Siblings (purple)
  if (r.startsWith('brother') || r.startsWith('sister') || r === 'sibling')
    return { bg: 'rgba(168,85,247,0.15)', color: 'rgba(216,180,254,0.95)', border: 'rgba(168,85,247,0.42)' }
  // Default — uncles, aunts, cousins, in-laws, etc. (amber)
  return { bg: 'rgba(245,158,11,0.15)', color: 'rgba(252,211,77,0.95)', border: 'rgba(245,158,11,0.48)' }
}

/** Strips cultural-term parentheticals and shortens verbose computed labels for node badges. */
function shortenRelLabel(label: string): string {
  if (!label) return label
  // Remove parenthetical suffixes like "(Chacha/Tau)", "(Dada/Nana)"
  const base = label.replace(/\s*\(.*?\)/g, '').trim()
  const l = base.toLowerCase()
  if (l.startsWith('paternal uncle') || l.startsWith('maternal uncle')) return 'Uncle'
  if (l.startsWith('paternal aunt') || l.startsWith('maternal aunt')) return 'Aunt'
  if (l.startsWith('paternal grandfather') || l.startsWith('maternal grandfather')) return 'Grandfather'
  if (l.startsWith('paternal grandmother') || l.startsWith('maternal grandmother')) return 'Grandmother'
  if (l.startsWith('step-')) return base.replace('Step-', 'Step ') // normalise hyphen
  return base
}

interface FamilyTreeProps {
  members: FamilyMember[]
  selfMemberId?: string | null
  selectedMemberId: string | null
  onSelectMember: (id: string) => void
  onDoubleClickMember?: (id: string) => void
  onAddRelative?: (anchorId: string, relType: QuickRelType) => void
  /** Open/focus the member detail panel (closes competing panels) */
  onOpenProfile?: (id: string) => void
  /** Open path finder with this member pre-filled as the source */
  onFindRelationship?: (id: string) => void
  /** Open invite-to-claim flow for a specific unclaimed node */
  onInviteNode?: (id: string) => void
  /** Claim this node as yourself */
  onClaimNode?: (id: string) => void
  /** Mobile: 500ms hold on a node fires this instead of the normal tap */
  onLongPressMember?: (id: string) => void
  /** When false, anonymous nodes are shown as "? Member" placeholders */
  isAdmin?: boolean
  /** Open the full detail panel for this member (graph popup → full sidebar) */
  onOpenMemberDetail?: (memberId: string) => void
  /** Extra bottom space (px) to push zoom controls above a sticky bottom bar on mobile */
  bottomControlsInset?: number
}

interface NodePosition {
  id: string
  x: number
  y: number
}

export function FamilyTree({ members, selfMemberId, selectedMemberId, onSelectMember, onDoubleClickMember, onAddRelative, onOpenProfile, onFindRelationship, onInviteNode, onClaimNode, onLongPressMember, isAdmin = false, onOpenMemberDetail, bottomControlsInset = 0 }: FamilyTreeProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  // Ring state — tracks which node's quick-add actions are visible; auto-dismisses
  const [ringNodeId, setRingNodeId] = useState<string | null>(null)
  // Affiliated clusters start collapsed — user taps to progressively discover each family
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(() => {
    // Will be populated once members are available via the useEffect below
    return new Set<string>()
  })
  // Track which clusters have ever been expanded (for stagger animation)
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  // Track extended family reveal state for stagger animation
  const [extendedRevealed, setExtendedRevealed] = useState(false)

  // Touch state for pinch-zoom
  const touchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null)
  const touchPanRef = useRef<{ x: number; y: number } | null>(null)
  // Long-press detection
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  // Track whether we've done the initial auto-fit (only do it once per tree)
  const hasAutoFit = useRef(false)
  // Track whether dimensions have been measured from the actual DOM
  const hasMeasuredDimensions = useRef(false)

  // ── Animation system ────────────────────────────────────────────────────
  // Refs mirror state for reads inside RAF callbacks (avoids stale closures).
  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const animRafRef = useRef<number>(0)
  const animFromRef = useRef({ x: 0, y: 0, k: 1 })
  const animToRef = useRef({ x: 0, y: 0, k: 1 })
  const animStartRef = useRef(0)

  // ── Inertia system ──────────────────────────────────────────────────────
  const velRef = useRef({ vx: 0, vy: 0 })
  const lastMouseRef = useRef({ x: 0, y: 0, t: 0 })
  const inertiaRafRef = useRef<number>(0)

  // ── Background-click deselect tracking ──────────────────────────────────
  const dragMovedRef = useRef(false)
  const dragStartClientRef = useRef({ x: 0, y: 0 })

  // Collapse all affiliated clusters on first member load
  useEffect(() => {
    const clusterIds = new Set(
      members
        .filter(m => m.networkGroup === 'affiliated' && m.affiliatedFamilyId)
        .map(m => m.affiliatedFamilyId!)
    )
    if (clusterIds.size > 0) {
      setCollapsedClusters(prev => {
        // Only set defaults if we haven't touched clusters yet (prev is empty)
        if (prev.size === 0) return clusterIds
        return prev
      })
    }
  }, [members])

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        const h = containerRef.current.clientHeight
        if (w > 0 && h > 0) {
          hasMeasuredDimensions.current = true
          setDimensions({ width: w, height: h })
        }
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    // ResizeObserver gives sub-pixel accuracy and fires on mount on all browsers,
    // including mobile Safari where clientWidth can be 0 during the first tick.
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(updateDimensions)
      ro.observe(containerRef.current)
    }
    return () => {
      window.removeEventListener('resize', updateDimensions)
      ro?.disconnect()
    }
  }, [])

  const nodePositions = useMemo<NodePosition[]>(() => {
    // Collect all descendant IDs of collapsed nodes to hide them
    const hiddenIds = new Set<string>()
    const getDescendants = (id: string) => {
      members.forEach(m => {
        if (m.parentIds.includes(id) && !hiddenIds.has(m.id)) {
          hiddenIds.add(m.id)
          getDescendants(m.id)
        }
      })
    }
    collapsedIds.forEach(id => getDescendants(id))

    const visibleMembers = members.filter(m => !hiddenIds.has(m.id))

    const nodeWidth = 160
    const nodeHeight = 155
    const horizontalGap = 64
    const verticalGap = 170

    //  Core + Extended: layout core by generation, extended members in a
    //  separate column grid to the left so they don't widen the core rows.
    const coreMembers = visibleMembers.filter(m => !m.networkGroup || m.networkGroup === 'core')
    const extendedMembers = visibleMembers.filter(m => m.networkGroup === 'extended')
    const mainMembers = coreMembers // only core members define row width
    const generations = new Map<number, typeof mainMembers>()
    mainMembers.forEach((member) => {
      const gen = member.generation
      if (!generations.has(gen)) generations.set(gen, [])
      generations.get(gen)!.push(member)
    })

    const positions: NodePosition[] = []
    generations.forEach((genMembers, gen) => {
      const totalWidth = genMembers.length * nodeWidth + (genMembers.length - 1) * horizontalGap
      const startX = (dimensions.width - totalWidth) / 2
      genMembers.forEach((member, index) => {
        positions.push({
          id: member.id,
          x: startX + index * (nodeWidth + horizontalGap) + nodeWidth / 2,
          y: 100 + gen * (nodeHeight + verticalGap),
        })
      })
    })

    //  Extended members: render in a compact grid to the LEFT of the core tree.
    //  Group by generation, place at x < minCoreX - extColumnWidth - 60
    if (extendedMembers.length > 0) {
      const coreMinX = positions.length > 0 ? Math.min(...positions.map(p => p.x)) : dimensions.width / 2
      const extNodeW = 130
      const extHGap = 28
      const extCols = Math.min(4, extendedMembers.length) // max 4 columns
      const extColWidth = extCols * extNodeW + (extCols - 1) * extHGap
      const extAnchorX = coreMinX - extColWidth - 80

      extendedMembers.forEach((member, idx) => {
        const col = idx % extCols
        const row = Math.floor(idx / extCols)
        positions.push({
          id: member.id,
          x: extAnchorX + col * (extNodeW + extHGap) + extNodeW / 2,
          y: 100 + row * (nodeHeight + verticalGap - 60), // tighter vertical spacing
        })
      })
    }

    //  Affiliated clusters: stack all to the RIGHT of the core tree so
    //  multiple merged families never overlap each other.
    //  Each cluster's ideal y is its junction node's y; we then enforce a
    //  minimum vertical gap so clusters with the same (or adjacent) junction
    //  nodes don't collide.
    const affiliatedMembers = visibleMembers.filter(m => m.networkGroup === 'affiliated')
    const clusterMap = new Map<string, typeof affiliatedMembers>()
    affiliatedMembers.forEach(m => {
      if (!m.affiliatedFamilyId) return
      if (!clusterMap.has(m.affiliatedFamilyId)) clusterMap.set(m.affiliatedFamilyId, [])
      clusterMap.get(m.affiliatedFamilyId)!.push(m)
    })

    const affNodeWidth = 120
    const affHGap = 32
    const coreMaxX = positions.length > 0 ? Math.max(...positions.map(p => p.x)) : dimensions.width / 2
    // Place all affiliated clusters to the right of the core tree with a fixed margin
    const clusterAnchorX = coreMaxX + 180

    // Pre-compute each cluster's height so we can assign non-overlapping y positions.
    type ClusterSpec = {
      clusterId: string
      clusterMembers: typeof affiliatedMembers
      junctionPos: { x: number; y: number } | null
      idealY: number   // preferred y = junction node y
      height: number   // pixel height of this cluster's rendered subtree
    }
    const specs: ClusterSpec[] = []
    clusterMap.forEach((clusterMembers, clusterId) => {
      if (collapsedClusters.has(clusterId)) return
      const junctionId = clusterMembers[0]?.affiliatedJunctionId
      const junctionPos = junctionId ? positions.find(p => p.id === junctionId) ?? null : null
      // Compute generation span → pixel height
      const gens = clusterMembers.map(m => m.generation ?? 3)
      const minGen = Math.min(...gens)
      const maxGen = Math.max(...gens)
      const genSpan = maxGen - minGen   // 0 if all same generation
      const height = genSpan * (nodeHeight + verticalGap) + nodeHeight + 80
      specs.push({ clusterId, clusterMembers, junctionPos, idealY: junctionPos?.y ?? 200, height })
    })

    // Sort by ideal y so clusters are stacked in the same top-to-bottom order
    // as their junction nodes appear in the core tree.
    specs.sort((a, b) => a.idealY - b.idealY)

    // Assign non-overlapping anchor y positions.
    // Each cluster's top starts at max(idealY, prevBottom + gap).
    let nextAvailableY = 60
    const CLUSTER_VGAP = 100

    specs.forEach(spec => {
      const anchorY = Math.max(spec.idealY, nextAvailableY)
      nextAvailableY = anchorY + spec.height + CLUSTER_VGAP

      // Group by generation and lay out within this cluster
      const clusterGens = new Map<number, typeof affiliatedMembers>()
      spec.clusterMembers.forEach(m => {
        const gen = m.generation
        if (!clusterGens.has(gen)) clusterGens.set(gen, [])
        clusterGens.get(gen)!.push(m)
      })
      const sortedGens = [...clusterGens.keys()].sort((a, b) => a - b)
      const firstGen = sortedGens[0] ?? 0

      sortedGens.forEach(gen => {
        const genMembers = clusterGens.get(gen)!
        const totalWidth = genMembers.length * affNodeWidth + (genMembers.length - 1) * affHGap
        const startX = clusterAnchorX - totalWidth / 2
        const yOffset = (gen - firstGen) * (nodeHeight + verticalGap)
        genMembers.forEach((member, index) => {
          positions.push({
            id: member.id,
            x: startX + index * (affNodeWidth + affHGap) + affNodeWidth / 2,
            y: anchorY + yOffset,
          })
        })
      })
    })

    return positions
  }, [members, dimensions.width, collapsedIds, collapsedClusters])

  //  Color palette rotated across affiliated family clusters (teal, violet, rose, amber, green)
  const AFFILIATED_PALETTE = [
    { stroke: '#14B8A6', fill: 'rgba(20,184,166,0.07)', text: 'rgba(20,184,166,0.80)', badge: 'rgba(20,184,166,0.18)' },
    { stroke: '#8B5CF6', fill: 'rgba(139,92,246,0.07)', text: 'rgba(167,139,250,0.80)', badge: 'rgba(139,92,246,0.18)' },
    { stroke: '#F43F5E', fill: 'rgba(244,63,94,0.07)',  text: 'rgba(251,113,133,0.80)', badge: 'rgba(244,63,94,0.18)'  },
    { stroke: '#F59E0B', fill: 'rgba(245,158,11,0.07)', text: 'rgba(252,211,77,0.80)',  badge: 'rgba(245,158,11,0.18)' },
    { stroke: '#22C55E', fill: 'rgba(34,197,94,0.07)',  text: 'rgba(134,239,172,0.80)', badge: 'rgba(34,197,94,0.18)'  },
  ]

  //  Affiliated cluster metadata (bounds, junction pos, per-family color)
  interface ClusterMeta {
    id: string
    name: string
    junctionPos: NodePosition | null
    memberCount: number  // total (including collapsed)
    bounds: { x: number; y: number; w: number; h: number }
    nodeIds: string[]
    color: typeof AFFILIATED_PALETTE[number]
  }

  const affiliatedClusters = useMemo<ClusterMeta[]>(() => {
    const clusterMap = new Map<string, { name: string; junctionId?: string; ids: string[] }>()
    members.filter(m => m.networkGroup === 'affiliated' && m.affiliatedFamilyId).forEach(m => {
      const id = m.affiliatedFamilyId!
      if (!clusterMap.has(id)) clusterMap.set(id, { name: m.affiliatedFamilyName ?? id, junctionId: m.affiliatedJunctionId, ids: [] })
      clusterMap.get(id)!.ids.push(m.id)
    })

    const posMap = new Map(nodePositions.map(p => [p.id, p]))
    // Sort cluster IDs consistently by name so color assignment is stable across renders
    const sortedEntries = [...clusterMap.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))

    return sortedEntries.map(([id, meta], idx) => {
      const color = AFFILIATED_PALETTE[idx % AFFILIATED_PALETTE.length]
      const junctionPos = meta.junctionId ? posMap.get(meta.junctionId) ?? null : null
      const clusterPositions = meta.ids.map(nid => posMap.get(nid)).filter(Boolean) as NodePosition[]
      if (clusterPositions.length === 0) {
        return { id, name: meta.name, junctionPos, memberCount: meta.ids.length, bounds: { x: 0, y: 0, w: 0, h: 0 }, nodeIds: meta.ids, color }
      }
      const xs = clusterPositions.map(p => p.x)
      const ys = clusterPositions.map(p => p.y)
      const pad = 52
      return {
        id,
        name: meta.name,
        junctionPos,
        memberCount: meta.ids.length,
        color,
        nodeIds: meta.ids,
        bounds: {
          x: Math.min(...xs) - pad,
          y: Math.min(...ys) - pad,
          w: Math.max(...xs) - Math.min(...xs) + 120 + pad * 2, // add node width
          h: Math.max(...ys) - Math.min(...ys) + 140 + pad * 2, // add node height
        },
      }
    })
  }, [members, nodePositions])

  // O(1) lookup: memberId → that cluster's color entry.
  // Built from affiliatedClusters so color assignments are stable across renders.
  const memberClusterColorMap = useMemo(() => {
    const map = new Map<string, typeof AFFILIATED_PALETTE[number]>()
    affiliatedClusters.forEach(cluster => {
      cluster.nodeIds.forEach(id => map.set(id, cluster.color))
    })
    return map
  }, [affiliatedClusters])

  const connections = useMemo(() => {
    const lines: { from: NodePosition; to: NodePosition; type: 'parent' | 'spouse'; fromId: string; toId: string }[] = []
    const posMap = new Map(nodePositions.map((p) => [p.id, p]))

    // Use enriched members so relationship-label-derived virtual edges produce
    // real connecting lines between nodes (handles families where parent_ids /
    // spouse_ids aren't set but the `relationship` label encodes the connection).
    // Virtual structural nodes (no position) are skipped automatically.
    const effectiveSelf = selfMemberId
      ? members.find(m => m.id === selfMemberId)
      : null
    const enrichedForLines = effectiveSelf
      ? enrichMembersWithDerivedEdges(members, effectiveSelf.id)
      : members

    enrichedForLines.forEach((member) => {
      const memberPos = posMap.get(member.id)
      if (!memberPos) return

      member.parentIds.forEach((parentId) => {
        const parentPos = posMap.get(parentId)
        if (parentPos) {
          lines.push({ from: parentPos, to: memberPos, type: 'parent', fromId: parentId, toId: member.id })
        }
      })

      member.spouseIds.forEach((spouseId) => {
        if (member.id < spouseId) {
          const spousePos = posMap.get(spouseId)
          if (spousePos) {
            lines.push({ from: memberPos, to: spousePos, type: 'spouse', fromId: member.id, toId: spouseId })
          }
        }
      })
    })

    return lines
  }, [members, selfMemberId, nodePositions])

  //  Graph index — O(1) relationship lookups, replaces O(n) searches 
  const graphIndex = useGraphIndex(members)
  // Keep memberMap as alias for backward compat with SVG rendering code below
  const memberMap = graphIndex.memberMap

  //  Viewport culling — only render nodes visible on screen 
  const viewport = useMemo(() => ({
    pan, zoom,
    width: dimensions.width,
    height: dimensions.height,
  }), [pan, zoom, dimensions])
  const visibleIds = useViewportCulling(nodePositions, viewport, 220)

  //  LOD tier — controls render complexity based on zoom level 
  // 'dot'     (zoom < 0.30): SVG circles only, zero React node cards
  // 'compact' (zoom 0.30-0.65): avatar + name, no details
  // 'full'    (zoom > 0.65): full interactive card
  const renderMode = zoom < 0.30 ? 'dot' : zoom < 0.65 ? 'compact' : 'full'

  // Stagger index map: extended/affiliated nodes get a staggered animation delay
  const staggerMap = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    for (const pos of nodePositions) {
      const m = memberMap.get(pos.id)
      if (m && (m.networkGroup === 'extended' || m.networkGroup === 'affiliated')) {
        map.set(pos.id, idx++)
      }
    }
    return map
  }, [nodePositions, memberMap])

  // ── BFS-computed relationship labels (keyed by memberId) ──────────────────
  // These are computed live from the graph structure so that a spouse is never
  // shown as "Father", etc. The raw DB `member.relationship` field is set from
  // the *adder's* perspective at add-time and is NOT reliable for display.
  const computedRelLabels = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>()
    if (!selfMemberId) return map
    const selfMember = members.find(m => m.id === selfMemberId)
    if (!selfMember) return map
    const enriched = enrichMembersWithDerivedEdges(members, selfMemberId)
    for (const m of members) {
      if (m.id === selfMemberId) continue
      const result = getRelationshipBetweenPeople(enriched, selfMemberId, m.id)
      if (result.found && result.confidence >= 0.5) {
        map.set(m.id, result.relationship)
      }
      // No fallback to m.relationship — that field is stored relative to whoever
      // *added* the member, not relative to the current viewer. Showing it would
      // display e.g. 'Mother' on Sukhdeo's spouse when Sukhdeo views the tree.
      // Blank is always better than a label from the wrong perspective.
    }
    return map
  }, [members, selfMemberId])

  // ── Generation row labels (rendered in transform space) ────────────────────
  const genLabels = useMemo(() => {
    const genToY = new Map<number, number[]>()
    nodePositions.forEach(pos => {
      const m = memberMap.get(pos.id)
      if (!m || (m.networkGroup && m.networkGroup !== 'core')) return
      if (!genToY.has(m.generation)) genToY.set(m.generation, [])
      genToY.get(m.generation)!.push(pos.y)
    })
    if (genToY.size === 0) return []
    const selfMember = selfMemberId
      ? members.find(m => m.id === selfMemberId)
      : null
    const allGens = [...genToY.keys()]
    const selfGen = selfMember?.generation ?? Math.max(...allGens)
    const sortedGens = allGens.sort((a, b) => a - b)
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
    return sortedGens.map((gen, idx) => {
      const ys = genToY.get(gen)!
      const minY = Math.min(...ys)
      const dist = gen - selfGen
      let name = ''
      if (dist === 0) name = 'Your Generation'
      else if (dist === -1) name = 'Parents'
      else if (dist === -2) name = 'Grandparents'
      else if (dist === -3) name = 'Great-grandparents'
      else if (dist <= -4) name = 'Ancestors'
      else if (dist === 1) name = 'Children'
      else name = 'Grandchildren'
      return { gen, y: minY, label: `Generation ${ROMAN[idx] ?? String(idx + 1)}`, name }
    })
  }, [nodePositions, memberMap, members, selfMemberId])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
      // Cancel any running animation / inertia so drag takes over immediately
      cancelAnimationFrame(animRafRef.current)
      cancelAnimationFrame(inertiaRafRef.current)
      velRef.current = { vx: 0, vy: 0 }
      dragMovedRef.current = false
      dragStartClientRef.current = { x: e.clientX, y: e.clientY }
      setIsDragging(true)
      setRingNodeId(null)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    // Track whether this is a real drag (not just a click)
    const adx = e.clientX - dragStartClientRef.current.x
    const ady = e.clientY - dragStartClientRef.current.y
    if (Math.abs(adx) > 4 || Math.abs(ady) > 4) dragMovedRef.current = true
    // Exponential moving average velocity (px/ms) for inertia
    const now = performance.now()
    const dt = now - lastMouseRef.current.t
    if (dt > 0 && dt < 80) {
      const rawVx = (e.clientX - lastMouseRef.current.x) / dt
      const rawVy = (e.clientY - lastMouseRef.current.y) / dt
      velRef.current.vx = velRef.current.vx * 0.55 + rawVx * 0.45
      velRef.current.vy = velRef.current.vy * 0.55 + rawVy * 0.45
    }
    lastMouseRef.current = { x: e.clientX, y: e.clientY, t: now }
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    // Coast with inertia if release velocity is meaningful
    const { vx, vy } = velRef.current
    if (Math.abs(vx) > 0.25 || Math.abs(vy) > 0.25) {
      let cvx = vx, cvy = vy
      const DECAY = 0.89 // ~90% speed retained per frame at 60fps
      const coast = () => {
        cvx *= DECAY; cvy *= DECAY
        if (Math.abs(cvx) < 0.04 && Math.abs(cvy) < 0.04) return
        setPan(prev => ({ x: prev.x + cvx * 16, y: prev.y + cvy * 16 }))
        inertiaRafRef.current = requestAnimationFrame(coast)
      }
      inertiaRafRef.current = requestAnimationFrame(coast)
    }
    velRef.current = { vx: 0, vy: 0 }
  }, [])

  // Background click — deselect active node (node buttons use stopPropagation)
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (dragMovedRef.current) return // was a drag, not a click
    if ((e.target as Element).closest('button')) return // node/control clicked
    setRingNodeId(null)
    if (selectedMemberId) onSelectMember(selectedMemberId) // toggle = deselect
  }, [selectedMemberId, onSelectMember])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // Distinguish trackpad scroll (pan) from pinch/mouse-wheel (zoom).
    // Trackpad two-finger swipe: ctrlKey=false, small deltaY, often non-zero deltaX.
    // Trackpad pinch or mouse wheel: ctrlKey=true (browser sets this for pinch),
    // OR large |deltaY| with deltaX ≈ 0 (mouse wheel).
    const isPinchOrMouseWheel = e.ctrlKey || (Math.abs(e.deltaX) < 3 && Math.abs(e.deltaY) >= 40)

    if (isPinchOrMouseWheel) {
      // ZOOM — anchor to cursor position
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      setZoom(prevZoom => {
        const newZoom = Math.min(Math.max(prevZoom * delta, 0.2), 4)
        setPan(prevPan => ({
          x: cursorX - (cursorX - prevPan.x) * (newZoom / prevZoom),
          y: cursorY - (cursorY - prevPan.y) * (newZoom / prevZoom),
        }))
        return newZoom
      })
    } else {
      // PAN — trackpad two-finger swipe, translate the canvas directly
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }))
    }
  }, [])

  //  Touch handlers (pinch-zoom + single-finger pan + long-press) 
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Cancel any pending long-press when a second finger is added
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
      longPressStartRef.current = null
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      touchRef.current = {
        dist: Math.hypot(dx, dy),
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
      touchPanRef.current = null
    } else if (e.touches.length === 1) {
      touchPanRef.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y }
      touchRef.current = null
      // Long-press: arm a 500ms timer when a node button is touched
      if (onLongPressMember) {
        const nodeEl = (e.target as HTMLElement).closest('[data-node-id]')
        const nodeId = nodeEl?.getAttribute('data-node-id')
        if (nodeId) {
          longPressStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null
            longPressStartRef.current = null
            onLongPressMember(nodeId)
          }, 500)
        }
      }
    }
  }, [pan, onLongPressMember])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    // Cancel long-press if the finger moves more than 8px
    if (longPressStartRef.current && longPressTimerRef.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - longPressStartRef.current.x
      const dy = e.touches[0].clientY - longPressStartRef.current.y
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
        longPressStartRef.current = null
      }
    }
    if (e.touches.length === 2 && touchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const newDist = Math.hypot(dx, dy)
      const scale = newDist / touchRef.current.dist
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      const rect = containerRef.current?.getBoundingClientRect()
      const cx = rect ? midX - rect.left : midX
      const cy = rect ? midY - rect.top : midY
      setZoom(prevZoom => {
        const newZoom = Math.min(Math.max(prevZoom * scale, 0.2), 4)
        setPan(prevPan => ({
          x: cx - (cx - prevPan.x) * (newZoom / prevZoom),
          y: cy - (cy - prevPan.y) * (newZoom / prevZoom),
        }))
        return newZoom
      })
      touchRef.current = { ...touchRef.current, dist: newDist }
    } else if (e.touches.length === 1 && touchPanRef.current) {
      setPan({
        x: e.touches[0].clientX - touchPanRef.current.x,
        y: e.touches[0].clientY - touchPanRef.current.y,
      })
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    touchRef.current = null
    touchPanRef.current = null
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
    longPressStartRef.current = null
  }, [])

  const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Event-free toggle used by the action ring
  const toggleCollapseById = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Keep mirror refs in sync with state (read by animation callbacks)
  useEffect(() => { panRef.current = pan }, [pan])
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // Cleanup animation + inertia frames on unmount
  useEffect(() => () => {
    cancelAnimationFrame(animRafRef.current)
    cancelAnimationFrame(inertiaRafRef.current)
  }, [])

  // Smooth animate to a target pan+zoom over `durationMs` using ease-out cubic
  const animateTo = useCallback((targetX: number, targetY: number, targetK: number, durationMs = 480) => {
    cancelAnimationFrame(animRafRef.current)
    cancelAnimationFrame(inertiaRafRef.current)
    animFromRef.current = { x: panRef.current.x, y: panRef.current.y, k: zoomRef.current }
    animToRef.current = { x: targetX, y: targetY, k: targetK }
    animStartRef.current = performance.now()
    const tick = (now: number) => {
      const raw = Math.min(1, (now - animStartRef.current) / durationMs)
      const eased = 1 - Math.pow(1 - raw, 3) // ease-out cubic
      setPan({
        x: animFromRef.current.x + (animToRef.current.x - animFromRef.current.x) * eased,
        y: animFromRef.current.y + (animToRef.current.y - animFromRef.current.y) * eased,
      })
      setZoom(animFromRef.current.k + (animToRef.current.k - animFromRef.current.k) * eased)
      if (raw < 1) animRafRef.current = requestAnimationFrame(tick)
    }
    animRafRef.current = requestAnimationFrame(tick)
  }, [])

  const centerView = useCallback(() => {
    animateTo(0, 0, 1)
  }, [animateTo])

  const fitToView = useCallback(() => {
    if (nodePositions.length === 0) return
    const minX = Math.min(...nodePositions.map(p => p.x)) - 100
    const maxX = Math.max(...nodePositions.map(p => p.x)) + 100
    const minY = Math.min(...nodePositions.map(p => p.y)) - 100
    const maxY = Math.max(...nodePositions.map(p => p.y)) + 100
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY
    const scaleX = dimensions.width / contentWidth
    const scaleY = dimensions.height / contentHeight
    const newZoom = Math.min(scaleX, scaleY, 1) * 0.9
    const newX = (dimensions.width - contentWidth * newZoom) / 2 - minX * newZoom
    const newY = (dimensions.height - contentHeight * newZoom) / 2 - minY * newZoom
    animateTo(newX, newY, newZoom)
  }, [nodePositions, dimensions, animateTo])

  // defaultView: like fitToView but enforces a minimum zoom of 0.55 so nodes
  // are always shown in compact mode (avatar + name) rather than as tiny dots.
  // Used for initial auto-fit. The F key / Fit button still uses fitToView to
  // show ALL nodes regardless of size.
  const defaultView = useCallback(() => {
    if (nodePositions.length === 0) return
    const minX = Math.min(...nodePositions.map(p => p.x)) - 100
    const maxX = Math.max(...nodePositions.map(p => p.x)) + 100
    const minY = Math.min(...nodePositions.map(p => p.y)) - 100
    const maxY = Math.max(...nodePositions.map(p => p.y)) + 100
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY
    const scaleX = dimensions.width / contentWidth
    const scaleY = dimensions.height / contentHeight
    // Enforce minimum 0.55 so compact cards always render (not SVG dots)
    const newZoom = Math.max(Math.min(scaleX, scaleY, 1) * 0.9, 0.55)
    const newX = (dimensions.width - contentWidth * newZoom) / 2 - minX * newZoom
    const newY = (dimensions.height - contentHeight * newZoom) / 2 - minY * newZoom
    animateTo(newX, newY, newZoom)
  }, [nodePositions, dimensions, animateTo])

  // selfCenteredView: initial view centered on the logged-in user's node at a
  // readable zoom (~0.8x). Falls back to defaultView when self is not in the tree.
  const selfCenteredView = useCallback(() => {
    if (selfMemberId) {
      const selfPos = nodePositions.find(p => p.id === selfMemberId)
      if (selfPos) {
        // Use a comfortable zoom: full cards readable, some context visible around self.
        // On small screens reduce zoom slightly so parents are also visible.
        const targetZoom = Math.min(0.82, dimensions.width / 900)
        const cx = dimensions.width / 2
        const cy = dimensions.height / 2
        animateTo(cx - selfPos.x * targetZoom, cy - selfPos.y * targetZoom, targetZoom)
        return
      }
    }
    defaultView()
  }, [selfMemberId, nodePositions, dimensions, animateTo, defaultView])

  // Focus on a specific node — smoothly center it at a readable zoom
  const focusNode = useCallback((nodeId: string) => {
    const pos = nodePositions.find(p => p.id === nodeId)
    if (!pos) return
    const targetZoom = Math.max(zoomRef.current, 1.2)
    const cx = dimensions.width / 2
    const cy = dimensions.height / 2
    animateTo(cx - pos.x * targetZoom, cy - pos.y * targetZoom, targetZoom, 420)
  }, [nodePositions, dimensions, animateTo])

  // Auto-fit on first load and whenever member count or viewport size changes significantly.
  // The ResizeObserver updates `dimensions` which triggers this effect, ensuring mobile
  // Safari devices re-fit after the viewport has been properly measured.
  const prevMemberCount = useRef(0)
  const prevDimensionsRef = useRef({ width: 0, height: 0 })
  useEffect(() => {
    if (nodePositions.length === 0 || !hasMeasuredDimensions.current) return
    const memberCountChanged = Math.abs(nodePositions.length - prevMemberCount.current) > 5
    const prev = prevDimensionsRef.current
    const dimensionsChanged =
      Math.abs(dimensions.width - prev.width) > 50 ||
      Math.abs(dimensions.height - prev.height) > 50
    if (!hasAutoFit.current || memberCountChanged || dimensionsChanged) {
      hasAutoFit.current = true
      prevMemberCount.current = nodePositions.length
      prevDimensionsRef.current = { width: dimensions.width, height: dimensions.height }
      if (dimensions.width > 0 && dimensions.height > 0) selfCenteredView()
    }
  }, [nodePositions, dimensions, selfCenteredView])

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

  // Ring: clear when selection changes externally (e.g. sidebar)
  useEffect(() => {
    setRingNodeId(prev => (prev && prev !== selectedMemberId ? null : prev))
  }, [selectedMemberId])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const rect = containerRef.current?.getBoundingClientRect()
      const cx = rect ? rect.width / 2 : dimensions.width / 2
      const cy = rect ? rect.height / 2 : dimensions.height / 2
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setZoom(z => {
          const nz = Math.min(z * 1.25, 4)
          setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
          return nz
        })
      } else if (e.key === '-') {
        e.preventDefault()
        setZoom(z => {
          const nz = Math.max(z * 0.8, 0.2)
          setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
          return nz
        })
      } else if (e.key === '0') {
        e.preventDefault()
        setZoom(1); setPan({ x: 0, y: 0 })
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        fitToView()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dimensions, fitToView])

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ background: 'var(--surface-base)', touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleBackgroundClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Cosmic canvas — stars + nebulae */}
      <ParticleBackground className="absolute inset-0 pointer-events-none z-0" />

      {/* Dot pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--tree-canvas-dot) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Nebula accent overlays */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 15% 30%, rgba(99,102,241,0.06) 0%, transparent 100%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: 'radial-gradient(ellipse 50% 35% at 85% 75%, rgba(139,92,246,0.05) 0%, transparent 100%)',
        }}
      />

      <div
        className="absolute inset-0 z-[2]"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          width={dimensions.width * 2}
          height={dimensions.height * 2}
          style={{ left: -dimensions.width / 2, top: -dimensions.height / 2, overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="edgeGoldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#D97706" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#FCD34D" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="edgeGoldGradientH" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#D97706" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#FCD34D" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="edgeVioletGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.6" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glowGold" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/*  Branch zone backgrounds  */}
          {(() => {
            const offsetX = dimensions.width / 2
            const offsetY = dimensions.height / 2
            const posMap = new Map(nodePositions.map(p => [p.id, p]))
            const zones: { side: string; xs: number[]; ys: number[] }[] = []
              ; (['paternal', 'maternal'] as const).forEach(side => {
                const sidePosns = members
                  .filter(m => m.side === side && m.networkGroup !== 'affiliated')
                  .map(m => posMap.get(m.id))
                  .filter(Boolean) as NodePosition[]
                if (sidePosns.length < 2) return
                zones.push({ side, xs: sidePosns.map(p => p.x), ys: sidePosns.map(p => p.y) })
              })
            return zones.map(zone => {
              const pad = 60
              const x = Math.min(...zone.xs) - pad + offsetX
              const y = Math.min(...zone.ys) - 80 + offsetY
              const w = Math.max(...zone.xs) - Math.min(...zone.xs) + 150 + pad * 2
              const h = Math.max(...zone.ys) - Math.min(...zone.ys) + 140 + pad
              const fill = zone.side === 'paternal' ? 'rgba(245,158,11,0.035)' : 'rgba(99,102,241,0.035)'
              const stroke = zone.side === 'paternal' ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)'
              const label = zone.side === 'paternal' ? 'Paternal Branch' : 'Maternal Branch'
              const labelColor = zone.side === 'paternal' ? 'rgba(245,158,11,0.45)' : 'rgba(139,92,246,0.45)'
              return (
                <g key={zone.side}>
                  <rect x={x} y={y} width={w} height={h} rx={20} fill={fill} stroke={stroke} strokeWidth={1} strokeDasharray="6,4" />
                  <text x={x + 14} y={y + 18} fontSize={9} fontWeight={600} letterSpacing={1.5} fill={labelColor} style={{ textTransform: 'uppercase' }}>{label}</text>
                </g>
              )
            })
          })()}

          {/*  Affiliated cluster island backgrounds  */}
          {affiliatedClusters.map(cluster => {
            const offsetX = dimensions.width / 2
            const offsetY = dimensions.height / 2
            if (collapsedClusters.has(cluster.id) || cluster.bounds.w < 10) return null
            const { stroke, fill, text } = cluster.color
            return (
              <g key={`cluster-bg-${cluster.id}`}>
                <rect
                  x={cluster.bounds.x + offsetX}
                  y={cluster.bounds.y + offsetY}
                  width={cluster.bounds.w}
                  height={cluster.bounds.h}
                  rx={24}
                  fill={fill}
                  stroke={stroke}
                  strokeOpacity={0.35}
                  strokeWidth={1.2}
                  strokeDasharray="8,5"
                />
                <text
                  x={cluster.bounds.x + cluster.bounds.w / 2 + offsetX}
                  y={cluster.bounds.y + 18 + offsetY}
                  fontSize={10}
                  fontWeight={700}
                  textAnchor="middle"
                  letterSpacing={1.2}
                  fill={text}
                  style={{ textTransform: 'uppercase' }}
                >
                  {cluster.name}
                </text>
              </g>
            )
          })}

          {/*  Bridge edges (junction → affiliated cluster)  */}
          {affiliatedClusters.map(cluster => {
            const offsetX = dimensions.width / 2
            const offsetY = dimensions.height / 2
            if (!cluster.junctionPos) return null
            // Find the cluster member closest to the junction (nearest x)
            const posMap = new Map(nodePositions.map(p => [p.id, p]))
            const clusterPositions = cluster.nodeIds.map(id => posMap.get(id)).filter(Boolean) as NodePosition[]
            if (clusterPositions.length === 0) return null
            const nearest = clusterPositions.reduce((a, b) => Math.abs(a.x - cluster.junctionPos!.x) < Math.abs(b.x - cluster.junctionPos!.x) ? a : b)
            const x1 = cluster.junctionPos.x + 75 + offsetX
            const y1 = cluster.junctionPos.y + offsetY
            const x2 = nearest.x - 60 + offsetX
            const y2 = nearest.y + offsetY
            const mx = (x1 + x2) / 2
            const my = (y1 + y2) / 2
            const { stroke } = cluster.color

            if (collapsedClusters.has(cluster.id)) {
              // Collapsed: just a short stub line + pill
              return (
                <g key={`bridge-${cluster.id}`}>
                  <line x1={x1} y1={y1} x2={x1 + 60} y2={y1} stroke={stroke} strokeWidth={1.5} strokeDasharray="8,5" opacity={0.6} />
                </g>
              )
            }

            return (
              <g key={`bridge-${cluster.id}`}>
                {/* Glow halo */}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={10} opacity={0.06} />
                {/* Main dashed bridge */}
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={stroke} strokeWidth={1.5} strokeDasharray="10,6" opacity={0.65}
                />
                {/* Diamond marker at midpoint */}
                <rect x={mx - 5} y={my - 5} width={10} height={10} rx={2} fill={stroke} opacity={0.75}
                  transform={`rotate(45, ${mx}, ${my})`}
                />
                {/* Label */}
                <text x={mx} y={my - 12} fontSize={8} textAnchor="middle" fill={cluster.color.text} fontWeight={600}>{cluster.name.length > 18 ? cluster.name.slice(0, 17) + '…' : cluster.name}</text>
              </g>
            )
          })}

          {/*  Regular edges (parent-child + spouse)  */}
          {connections.map((conn, i) => {
            // Skip edges where both endpoints are off-screen
            if (!isEdgeVisible(conn.from, conn.to, viewport, 400)) return null
            const offsetX = dimensions.width / 2
            const offsetY = dimensions.height / 2
            const fromMember = memberMap.get(conn.fromId)
            const toMember = memberMap.get(conn.toId)
            const bothExtended = fromMember?.networkGroup === 'extended' && toMember?.networkGroup === 'extended'

            if (conn.type === 'spouse') {
              const isHighlighted = hoveredMemberId === conn.fromId || hoveredMemberId === conn.toId

              const x1 = conn.from.x + offsetX
              const y1 = conn.from.y + offsetY
              const x2 = conn.to.x + offsetX
              const y2 = conn.to.y + offsetY

              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#F59E0B" strokeWidth={10} opacity={0.07} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#F59E0B"
                    strokeWidth={isHighlighted ? 2.5 : 1.5}
                    strokeDasharray="8,5"
                    opacity={isHighlighted ? 0.9 : 0.55}
                    filter={isHighlighted ? 'url(#glowGold)' : undefined}
                  />
                  <rect
                    x={(x1 + x2) / 2 - 5}
                    y={(y1 + y2) / 2 - 5}
                    width={10} height={10}
                    rx={2}
                    fill="#F59E0B"
                    opacity={0.85}
                    transform={`rotate(45, ${(x1 + x2) / 2}, ${(y1 + y2) / 2})`}
                  />
                </g>
              )
            }

            const midY = (conn.from.y + conn.to.y) / 2
            const isHighlighted = hoveredMemberId === conn.fromId || hoveredMemberId === conn.toId

            const d = `M ${conn.from.x + offsetX} ${conn.from.y + 40 + offsetY}
                        C ${conn.from.x + offsetX} ${midY + offsetY},
                          ${conn.to.x + offsetX} ${midY + offsetY},
                          ${conn.to.x + offsetX} ${conn.to.y - 40 + offsetY}`

            const edgeColor = bothExtended ? 'url(#edgeVioletGradient)' : 'url(#edgeGoldGradient)'
            const glowColor = bothExtended ? '#7C3AED' : '#F59E0B'

            return (
              <g key={i}>
                <path d={d} fill="none"
                  stroke={glowColor} strokeWidth={14}
                  opacity={isHighlighted ? 0.12 : 0.06}
                />
                <path d={d} fill="none"
                  stroke={edgeColor}
                  strokeWidth={isHighlighted ? 2.5 : 1.8}
                  opacity={isHighlighted ? 1 : 0.75}
                  filter={isHighlighted ? 'url(#glowGold)' : undefined}
                />
              </g>
            )
          })}
        </svg>

        {/* ── Generation row labels ──────────────────────────────────────────── */}
        {renderMode !== 'dot' && genLabels.map(gl => {
          const offsetX = dimensions.width / 2
          const offsetY = dimensions.height / 2
          return (
            <div
              key={`gen-label-${gl.gen}`}
              className="absolute pointer-events-none select-none flex items-center"
              style={{
                left: 0,
                top: gl.y - 42 + offsetY,
                width: dimensions.width,
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <div style={{ height: 1, width: 44, background: 'rgba(148,163,184,0.10)', flexShrink: 0 }} />
              <p style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(148,163,184,0.32)',
                whiteSpace: 'nowrap',
              }}>
                {gl.label} · {gl.name}
              </p>
              <div style={{ height: 1, width: 44, background: 'rgba(148,163,184,0.10)', flexShrink: 0 }} />
            </div>
          )
        })}

        {/*  DOT MODE: zoom < 0.30 — pure SVG, zero React cards in DOM  */}
        {renderMode === 'dot' && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={dimensions.width * 2}
            height={dimensions.height * 2}
            style={{ left: -dimensions.width / 2, top: -dimensions.height / 2, overflow: 'visible' }}
          >
            {nodePositions.map(pos => {
              const member = memberMap.get(pos.id)
              if (!member) return null
              const ng = member.networkGroup ?? 'core'
              const fill = ng === 'affiliated'
                ? (memberClusterColorMap.get(pos.id)?.stroke ?? '#14B8A6')
                : ng === 'extended' ? '#8B5CF6' : '#F59E0B'
              const offsetX = dimensions.width / 2
              const offsetY = dimensions.height / 2
              return (
                <circle
                  key={pos.id}
                  cx={pos.x + offsetX}
                  cy={pos.y + offsetY}
                  r={ng === 'core' ? 7 : 5}
                  fill={fill}
                  opacity={selectedMemberId === pos.id ? 1 : 0.65}
                />
              )
            })}
          </svg>
        )}

        {/*  COMPACT + FULL modes: viewport-culled React node cards  */}
        <TooltipProvider>
          {renderMode !== 'dot' && nodePositions.map((pos) => {
            if (!visibleIds.has(pos.id)) return null
            const member = memberMap.get(pos.id)!
            if (!member) return null
            const isSelected = selectedMemberId === member.id
            const isHovered = hoveredMemberId === member.id
            const networkGroup = member.networkGroup ?? 'core'
            const isExtended = networkGroup === 'extended'
            const isAffiliated = networkGroup === 'affiliated'
            // Per-cluster color — each merged family gets a distinct hue
            const clusterColor = isAffiliated ? (memberClusterColorMap.get(member.id) ?? null) : null
            const nodeWidth = isAffiliated ? 120 : isExtended ? 130 : 150
            const staggerDelay = isExtended || isAffiliated
              ? `${(staggerMap.get(member.id) ?? 0) * 35}ms`
              : '0ms'
            const initials = member.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)

            // Anonymous: non-admins see "? Member" placeholder when showAsAnonymous=true
            const isAnonymous = !isAdmin && (member.showAsAnonymous ?? false)
            const displayName = isAnonymous ? '? Member' : member.name.split(' ')[0]
            const displayInitials = isAnonymous ? '?' : initials

            const isSelf = !!selfMemberId && member.id === selfMemberId
            const isDeceased = !!member.deathYear
            const isUnclaimed = !member.isClaimed && !isSelf
            const lifespan = member.deathYear
              ? `${member.birthYear}–${member.deathYear}`
              : member.birthYear
                ? `b. ${member.birthYear}`
                : ''
            const isCollapsed = collapsedIds.has(member.id)
            // ✔ O(1) hasChildren via precomputed parentSet
            const hasChildren = graphIndex.parentSet.has(member.id)
            // Use BFS-computed label (never the raw DB field which reflects the adder's perspective)
            const computedLabel = computedRelLabels.get(member.id) ?? null
            // Short form for the badge (strips cultural parentheticals, keeps it to 1-2 words)
            const relationshipLabel = !isSelf && computedLabel ? shortenRelLabel(computedLabel).toUpperCase() : null
            const relBadge = getRelBadgeStyle(computedLabel ?? undefined, networkGroup)

            // COMPACT mode: stripped-down node, avatar + name only
            if (renderMode === 'compact') {
              return (
                <div
                  key={member.id}
                  className="absolute"
                  style={{
                    left: pos.x - nodeWidth / 2,
                    top: pos.y - 44,
                    width: nodeWidth,
                    opacity: isExtended ? 0.82 : isAffiliated ? 0.9 : 1,
                    animation: isExtended || isAffiliated ? `fadeSlideIn 0.35s ease both` : 'none',
                    animationDelay: staggerDelay,
                  }}
                >
                  <button
                    data-node-id={member.id}
                    className={cn(
                      'flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl w-full border backdrop-blur-sm transition-all duration-200',
                      isSelected ? 'shadow-md shadow-amber-500/10' : '',
                      isUnclaimed ? 'opacity-60' : ''
                    )}
                    style={{
                      background: isSelected ? 'var(--tree-node-bg-selected)' : 'var(--tree-node-bg)',
                      borderStyle: isUnclaimed ? 'dashed' : 'solid',
                      borderColor: isSelected ? 'var(--tree-node-border-selected)'
                        : isUnclaimed ? 'rgba(148,163,184,0.40)'
                          : clusterColor ? `${clusterColor.stroke}4d`
                            : isExtended ? 'rgba(139,92,246,0.30)'
                              : 'var(--tree-node-border)',
                    }}
                    onClick={(e) => { e.stopPropagation(); onSelectMember(member.id) }}
                    onDoubleClick={(e) => { e.stopPropagation(); focusNode(member.id); onDoubleClickMember?.(member.id) }}
                    onMouseEnter={() => setHoveredMemberId(member.id)}
                    onMouseLeave={() => setHoveredMemberId(null)}
                  >
                    <div className="relative">
                      <Avatar className={cn('border-2 h-8 w-8',
                        isSelf ? 'border-amber-400/70'
                          : isSelected ? 'border-amber-400/60' : isUnclaimed ? 'border-slate-500/40' : isExtended ? 'border-violet-600/35' : 'border-slate-600/40'
                      )}
                      style={clusterColor && !isSelected && !isSelf ? { borderColor: `${clusterColor.stroke}59` } : undefined}
                      >
                        {!isAnonymous && member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} className="object-cover" />}
                        <AvatarFallback
                          className={cn('text-[9px] font-semibold',
                            isAnonymous ? 'bg-muted/60 text-muted-foreground'
                              : isUnclaimed ? 'bg-slate-700/40 text-slate-400'
                                : isExtended ? 'bg-gradient-to-br from-violet-600/25 to-purple-600/25 text-violet-300'
                                  : !clusterColor ? 'bg-gradient-to-br from-indigo-600/20 to-violet-600/20 text-indigo-200' : ''
                          )}
                          style={clusterColor && !isAnonymous && !isUnclaimed ? {
                            background: `linear-gradient(135deg, ${clusterColor.stroke}40, ${clusterColor.stroke}26)`,
                            color: clusterColor.text,
                          } : undefined}
                        >{displayInitials}</AvatarFallback>
                      </Avatar>
                      {/* YOU indicator — shown even in compact mode (#2 fix) */}
                      {isSelf && (
                        <span
                          className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[6px] font-bold tracking-widest px-1 rounded-full leading-tight whitespace-nowrap"
                          style={{ background: 'rgba(251,191,36,0.18)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }}
                        >
                          YOU
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] font-medium leading-tight text-center truncate w-full" style={{ color: isUnclaimed ? 'rgba(148,163,184,0.7)' : isSelf ? '#fbbf24' : 'var(--tree-node-text)' }}>
                      {displayName}
                    </p>
                  </button>
                </div>
              )
            }

            // FULL mode: premium interactive card
            return (
              <div
                key={member.id}
                className="absolute transition-opacity duration-200"
                style={{
                  left: pos.x - nodeWidth / 2,
                  top: pos.y - 76,
                  width: nodeWidth,
                  opacity: isExtended ? 0.82 : isAffiliated ? 0.9 : 1,
                  animation: isExtended || isAffiliated ? `fadeSlideIn 0.35s ease both` : 'none',
                  animationDelay: staggerDelay,
                  zIndex: isSelected ? 20 : undefined,
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-node-id={member.id}
                      className={cn(
                        'flex flex-col items-center rounded-2xl transition-all duration-200 w-full overflow-hidden',
                        'border backdrop-blur-md',
                        isSelected ? 'shadow-xl shadow-amber-500/15 ring-1 ring-amber-500/25'
                          : isHovered ? 'shadow-xl shadow-indigo-500/12 -translate-y-0.5' : '',
                        isUnclaimed ? 'opacity-65' : ''
                      )}
                      style={{
                        background: isSelected ? 'var(--tree-node-bg-selected)'
                          : isHovered ? 'var(--tree-node-bg-hover)'
                            : 'var(--tree-node-bg)',
                        borderStyle: isUnclaimed ? 'dashed' : 'solid',
                        borderColor: isSelected ? 'var(--tree-node-border-selected)'
                          : isUnclaimed ? 'rgba(148,163,184,0.35)'
                            : isHovered
                              ? (clusterColor ? `${clusterColor.stroke}99` : isExtended ? 'rgba(139,92,246,0.60)' : 'var(--tree-node-border-hover)')
                              : (clusterColor ? `${clusterColor.stroke}4d` : isExtended ? 'rgba(139,92,246,0.30)' : 'var(--tree-node-border)'),
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setRingNodeId(member.id)
                        onSelectMember(member.id)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setRingNodeId(null)
                        focusNode(member.id)
                        onDoubleClickMember?.(member.id)
                      }}
                      onMouseEnter={() => setHoveredMemberId(member.id)}
                      onMouseLeave={() => setHoveredMemberId(null)}
                    >
                      {/* ── Card header: relationship badge + living status ── */}
                      <div className="flex items-center justify-between px-2 pt-1.5 pb-1 w-full gap-1">
                        {(relationshipLabel || isSelf) ? (
                          <span
                            className="text-[7px] font-bold tracking-wider px-1.5 py-0.5 rounded-full leading-tight whitespace-nowrap"
                            style={{
                              background: relBadge.bg,
                              color: relBadge.color,
                              border: `1px solid ${relBadge.border}`,
                            }}
                          >
                            {isSelf ? 'YOU' : relationshipLabel}
                          </span>
                        ) : <span />}
                        <span className="flex items-center gap-0.5 text-[7.5px] flex-shrink-0 ml-auto">
                          {isDeceased ? (
                            <span style={{ color: 'rgba(148,163,184,0.55)' }}>In memory</span>
                          ) : (
                            <>
                              <span style={{ color: '#22c55e', fontSize: 7, lineHeight: 1 }}>●</span>
                              <span style={{ color: 'rgba(148,163,184,0.55)' }}>Living</span>
                            </>
                          )}
                        </span>
                      </div>
                      {/* thin divider */}
                      <div style={{
                        height: 1,
                        width: '100%',
                        background: clusterColor ? `${clusterColor.stroke}1f` : isExtended ? 'rgba(139,92,246,0.12)' : 'rgba(100,116,139,0.14)',
                      }} />

                      {/* ── Card body: avatar + name + metadata ── */}
                      <div className="flex flex-col items-center gap-1.5 px-2.5 py-2.5 w-full">
                        <div className="relative">
                          <Avatar
                            className={cn(
                              'border-2 transition-all duration-200',
                              isAffiliated ? 'h-11 w-11' : isExtended ? 'h-11 w-11' : 'h-12 w-12',
                              isSelected
                                ? 'border-amber-400/60 ring-2 ring-amber-400/20 ring-offset-1 ring-offset-[var(--surface-base)]'
                                : isUnclaimed
                                  ? 'border-slate-500/35'
                                  : isHovered
                                    ? (isExtended
                                        ? 'border-violet-400/50 ring-2 ring-violet-400/15 ring-offset-1 ring-offset-[var(--surface-base)]'
                                        : !clusterColor ? 'border-indigo-400/50 ring-2 ring-indigo-400/15 ring-offset-1 ring-offset-[var(--surface-base)]' : '')
                                    : (isExtended ? 'border-violet-600/35' : !clusterColor ? 'border-slate-600/40' : '')
                            )}
                          style={clusterColor && !isSelected && !isUnclaimed ? {
                            borderColor: isHovered ? `${clusterColor.stroke}cc` : `${clusterColor.stroke}59`,
                            ...(isHovered ? { boxShadow: `0 0 0 2px ${clusterColor.stroke}26` } : {}),
                          } : undefined}
                          >
                            {!isAnonymous && member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} className="object-cover" />}
                            <AvatarFallback
                              className={cn(
                                'font-bold transition-colors',
                                isAffiliated ? 'text-sm' : isExtended ? 'text-sm' : 'text-base',
                                isAnonymous ? 'bg-muted/60 text-muted-foreground'
                                  : isSelected
                                    ? 'bg-gradient-to-br from-amber-600/30 to-indigo-600/30'
                                    : isHovered
                                      ? (isExtended ? 'bg-gradient-to-br from-violet-600/25 to-purple-600/25'
                                        : !clusterColor ? 'bg-gradient-to-br from-indigo-600/25 to-violet-600/25' : '')
                                      : (isExtended ? 'bg-gradient-to-br from-violet-600/15 to-slate-500/20'
                                        : !clusterColor ? 'bg-gradient-to-br from-slate-400/30 to-slate-500/30' : '')
                              )}
                              style={{
                                color: isAnonymous ? undefined : (clusterColor && !isSelected ? clusterColor.text : 'var(--tree-node-text)'),
                                ...(clusterColor && !isAnonymous && !isSelected ? {
                                  background: isHovered
                                    ? `linear-gradient(135deg, ${clusterColor.stroke}40, ${clusterColor.stroke}26)`
                                    : `linear-gradient(135deg, ${clusterColor.stroke}26, ${clusterColor.stroke}18)`,
                                } : {}),
                              }}
                            >
                              {displayInitials}
                            </AvatarFallback>
                          </Avatar>
                          {isDeceased && (
                            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-slate-600 border-2 flex items-center justify-center" style={{ borderColor: 'var(--surface-base)' }}>
                              <span className="text-[8px] text-slate-300">†</span>
                            </div>
                          )}
                          {member.isClaimed && (
                            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500/90 border-2 flex items-center justify-center" style={{ borderColor: 'var(--surface-base)' }}>
                              <ShieldCheck className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                          {isUnclaimed && (
                            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 flex h-4 items-center rounded-full border border-orange-500/50 bg-orange-500/20 px-1.5">
                              <span className="text-[7px] font-bold text-orange-400 whitespace-nowrap">Not joined</span>
                            </div>
                          )}
                          {member.visibility === 'private' && (
                            <div className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-orange-500/90 border-2 flex items-center justify-center" style={{ borderColor: 'var(--surface-base)' }}>
                              <Lock className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                          {isAnonymous && (
                            <div className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-slate-600/90 border-2 flex items-center justify-center" style={{ borderColor: 'var(--surface-base)' }}>
                              <EyeOff className="h-2.5 w-2.5 text-slate-300" />
                            </div>
                          )}
                        </div>

                        {/* Name: given name + family name on separate lines */}
                        <div className="text-center w-full">
                          {isAnonymous ? (
                            <p className="text-[11px] font-semibold text-muted-foreground italic">? Member</p>
                          ) : (
                            <>
                              <p
                                className="text-[11px] font-semibold leading-tight truncate w-full"
                                style={{ color: 'var(--tree-node-text)' }}
                              >
                                {member.name.split(' ').slice(0, -1).join(' ') || member.name}
                              </p>
                              {member.name.split(' ').length > 1 && (
                                <p className="text-[9px] mt-0.5 truncate w-full" style={{ color: 'var(--tree-node-subtext)' }}>
                                  {member.name.split(' ').slice(-1)[0]}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Metadata: lifespan + location */}
                        {!isAnonymous && (lifespan || member.currentPlace || member.birthPlace) && (
                          <div className="flex flex-col items-center gap-0.5 w-full mt-0.5">
                            {lifespan && (
                              <p className="text-[8px] flex items-center gap-1" style={{ color: 'var(--tree-node-subtext)' }}>
                                <span>📅</span><span>{lifespan}</span>
                              </p>
                            )}
                            {(member.currentPlace || member.birthPlace) && (
                              <p className="text-[8px] flex items-center gap-1" style={{ color: 'var(--tree-node-subtext)' }}>
                                <span>📍</span>
                                <span className="truncate max-w-[92px]">{member.currentPlace || member.birthPlace}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs border-border">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{isAnonymous ? '? Member' : member.name}</p>
                      {isAnonymous && (
                        <p className="text-xs text-slate-400">This member is displayed anonymously</p>
                      )}
                      {isUnclaimed && (
                        <p className="text-xs text-orange-400">Not joined yet — tap to invite</p>
                      )}
                      {!isUnclaimed && computedLabel && (
                        <p className="text-xs text-amber-400/80">{computedLabel}</p>
                      )}
                      {member.occupation && (
                        <p className="text-xs text-muted-foreground">{member.occupation}</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
                {/* Collapse/expand toggle — sibling of Tooltip, NOT nested inside it */}
                {hasChildren && isHovered && (
                  <button
                    onClick={(e) => toggleCollapse(member.id, e)}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 border border-indigo-400/30 shadow-sm hover:bg-indigo-500 transition-colors z-10"
                    title={isCollapsed ? 'Expand branch' : 'Collapse branch'}
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-3 w-3 text-white" />
                      : <ChevronDown className="h-3 w-3 text-white" />
                    }
                  </button>
                )}
                {isCollapsed && (
                  <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex h-5 items-center gap-0.5 rounded-full bg-muted/90 border border-border/50 px-1.5 pointer-events-none">
                    <span className="text-[8px] text-slate-500">+branch</span>
                  </div>
                )}
                {/* Inline action ring — shown when this node is active, from compact zoom up */}
                {ringNodeId === member.id && zoom >= 0.30 && (() => {
                  // Position ring above when the node is in the bottom 60 % of the viewport
                  const nodeScreenY = pos.y * zoom + pan.y + dimensions.height / 2
                  const ringGoesUp = nodeScreenY > dimensions.height * 0.60
                  return (
                    <div
                      className="absolute"
                      style={{
                        ...(ringGoesUp
                          ? { bottom: 'calc(100% + 10px)' }
                          : { top: 'calc(100% + 10px)' }),
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 20,
                        animation: 'ringEnter 0.18s ease-out both',
                      }}
                    >
                      <NodeActionRing
                        member={member}
                        allMembers={members}
                        onViewProfile={onOpenProfile}
                        onFindRelationship={onFindRelationship}
                        onInvite={onInviteNode}
                        onAddRelative={onAddRelative}
                        compact={zoom < 0.65}
                      />
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </TooltipProvider>
      </div>

      {/*  Affiliated cluster collapse buttons (per cluster)  */}
      {affiliatedClusters.map(cluster => {
        if (!cluster.junctionPos) return null
        const isCollapsed = collapsedClusters.has(cluster.id)

        if (isCollapsed) {
          // Compelling "discover" pill — pulsing ring + family name + member count + avatar initials
          const previewMembers = cluster.nodeIds
            .slice(0, 3)
            .map(id => graphIndex.memberMap.get(id))
            .filter(Boolean) as FamilyMember[]

          const pillX = (cluster.junctionPos.x + 80 + dimensions.width / 2) * zoom + pan.x
          const pillY = (cluster.junctionPos.y - 20 + dimensions.height / 2) * zoom + pan.y

          return (
            <div
              key={`collapse-btn-${cluster.id}`}
              className="absolute z-[4] cursor-pointer select-none"
              style={{ left: pillX, top: pillY }}
              onClick={() => {
                setCollapsedClusters(prev => { const n = new Set(prev); n.delete(cluster.id); return n })
                setExpandedClusters(prev => new Set([...prev, cluster.id]))
              }}
            >
              {/* Pulsing outer ring */}
              <div className="relative">
                <div className="absolute inset-0 -m-1.5 rounded-2xl animate-pulse" style={{ background: `${cluster.color.badge}`, border: `1px solid ${cluster.color.stroke}4d` }} />
                <div
                  className="relative flex items-center gap-2 rounded-2xl px-3 py-2 border backdrop-blur-md transition-all hover:scale-105"
                  style={{
                    background: 'rgba(15,23,42,0.85)',
                    borderColor: `${cluster.color.stroke}72`,
                  }}
                >
                  {/* Preview avatars */}
                  <div className="flex -space-x-2">
                    {previewMembers.map(m => (
                      <div
                        key={m.id}
                        className="h-7 w-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
                        style={{
                          borderColor: `${cluster.color.stroke}80`,
                          background: `${cluster.color.badge}`,
                          color: cluster.color.text,
                        }}
                      >
                        {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                    ))}
                    {cluster.memberCount > 3 && (
                      <div
                        className="h-7 w-7 rounded-full border-2 flex items-center justify-center text-[8px] font-bold"
                        style={{
                          borderColor: `${cluster.color.stroke}80`,
                          background: `${cluster.color.badge}`,
                          color: cluster.color.text,
                          opacity: 0.75,
                        }}
                      >
                        +{cluster.memberCount - 3}
                      </div>
                    )}
                  </div>
                  {/* Text */}
                  <div className="text-left">
                    <p className="text-[11px] font-semibold leading-tight" style={{ color: cluster.color.text }}>
                      {cluster.name}
                    </p>
                    <p className="text-[9px] leading-tight" style={{ color: `${cluster.color.stroke}88` }}>
                      {cluster.memberCount} relatives · tap to explore
                    </p>
                  </div>
                  {/* Expand chevron */}
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: cluster.color.text }} />
                </div>
              </div>
            </div>
          )
        }

        // Expanded: show a small collapse button at the right edge
        const btnX = (cluster.bounds.x + cluster.bounds.w + dimensions.width / 2) * zoom + pan.x + 8
        const btnY = (cluster.bounds.y + 4 + dimensions.height / 2) * zoom + pan.y

        return (
          <button key={`collapse-btn-${cluster.id}`}
            className="absolute z-[4] h-6 rounded-full flex items-center gap-1 px-2 text-[9px] font-medium backdrop-blur-md border transition-colors hover:opacity-90"
            style={{
              left: btnX,
              top: btnY,
              background: cluster.color.badge,
              borderColor: `${cluster.color.stroke}59`,
              color: cluster.color.text,
            }}
            title={`Collapse ${cluster.name}`}
            onClick={() => setCollapsedClusters(prev => new Set([...prev, cluster.id]))}
          >
            <ChevronLeft className="h-3 w-3" />
            <span>Collapse</span>
          </button>
        )
      })}

      {/*  Legend — core + extended + one entry per merged family  */}
      <div className="absolute bottom-[72px] left-4 z-[3] flex flex-col gap-1.5 rounded-xl px-3 py-2.5 backdrop-blur-md border border-border/30 text-[10px]"
        style={{ background: 'var(--surface-card)' }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80 ring-1 ring-amber-400/30 flex-shrink-0" />
          <span className="text-muted-foreground">Core Family</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500/70 ring-1 ring-violet-500/30 flex-shrink-0" />
          <span className="text-muted-foreground">Extended Relatives</span>
        </div>
        {affiliatedClusters.map(cluster => (
          <div key={cluster.id} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ background: cluster.color.stroke, opacity: 0.82 }}
            />
            <span className="text-muted-foreground truncate max-w-[120px]">{cluster.name}</span>
          </div>
        ))}
      </div>

      {/* ─── Minimap ───────────────────────────────────────────────────── */}
      {nodePositions.length > 0 && (() => {
        const mapW = 176, mapH = 112
        const pad = 80
        const allX = nodePositions.map(p => p.x)
        const allY = nodePositions.map(p => p.y)
        const mnX = Math.min(...allX) - pad, mxX = Math.max(...allX) + pad + 160
        const mnY = Math.min(...allY) - pad, mxY = Math.max(...allY) + pad + 155
        const cW = mxX - mnX, cH = mxY - mnY
        const sc = Math.min(mapW / cW, mapH / cH, 1)
        const oX = (mapW - cW * sc) / 2
        const oY = (mapH - cH * sc) / 2
        const toMx = (x: number) => (x - mnX) * sc + oX
        const toMy = (y: number) => (y - mnY) * sc + oY
        // Viewport rectangle in minimap coords
        const vpX = -pan.x / zoom
        const vpY = -pan.y / zoom
        const vpW = dimensions.width / zoom
        const vpH = dimensions.height / zoom
        const vpMx = Math.max(0, toMx(vpX))
        const vpMy = Math.max(0, toMy(vpY))
        const vpMw = Math.min(vpW * sc, mapW - vpMx)
        const vpMh = Math.min(vpH * sc, mapH - vpMy)
        return (
          <div
            className="absolute z-[3] rounded-xl border border-border/40 overflow-hidden backdrop-blur-md cursor-pointer hover:border-border/70 transition-colors"
            style={{ bottom: 56, right: 16, width: mapW, height: mapH, background: 'rgba(9,9,11,0.80)' }}
            title="Minimap — click to navigate"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const mx = e.clientX - rect.left
              const my = e.clientY - rect.top
              const cx = (mx - oX) / sc + mnX
              const cy = (my - oY) / sc + mnY
              const targetZoom = Math.max(zoomRef.current, 0.65)
              animateTo(dimensions.width / 2 - cx * targetZoom, dimensions.height / 2 - cy * targetZoom, targetZoom, 350)
            }}
          >
            <svg width={mapW} height={mapH}>
              {nodePositions.map(pos => {
                const m = memberMap.get(pos.id)
                const fill = m?.networkGroup === 'affiliated'
                  ? (memberClusterColorMap.get(pos.id)?.stroke ?? '#14B8A6')
                  : m?.networkGroup === 'extended' ? '#8B5CF6' : '#F59E0B'
                const r = m?.networkGroup === 'core' ? 3.5 : 2.5
                return (
                  <circle key={pos.id} cx={toMx(pos.x)} cy={toMy(pos.y)} r={r}
                    fill={fill} opacity={selectedMemberId === pos.id ? 1 : 0.65}
                  />
                )
              })}
              {vpMw > 2 && vpMh > 2 && (
                <rect x={vpMx} y={vpMy} width={vpMw} height={vpMh}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.32)"
                  strokeWidth={1} rx={2}
                />
              )}
            </svg>
            <span className="absolute bottom-1 right-2 text-[8px] font-medium tracking-wider uppercase" style={{ color: 'rgba(148,163,184,0.45)', pointerEvents: 'none' }}>MAP</span>
          </div>
        )
      })()}

      {/* ─── Controls pill ─────────────────────────────────────────────── */}
      <div
        className="absolute right-4 z-[3] flex items-center rounded-xl border border-border/40 overflow-hidden backdrop-blur-md divide-x divide-border/30"
        style={{ background: 'var(--surface-card)', bottom: `${16 + bottomControlsInset}px` }}
      >
        <button
          onClick={() => { const cx = dimensions.width / 2; const cy = dimensions.height / 2; setZoom(z => { const nz = Math.min(z * 1.25, 4); setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) })); return nz }) }}
          className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title="Zoom in (+)"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <div className="flex h-9 w-12 items-center justify-center text-[11px] font-medium tabular-nums select-none" style={{ color: 'var(--tree-node-subtext)' }}>
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={() => { const cx = dimensions.width / 2; const cy = dimensions.height / 2; setZoom(z => { const nz = Math.max(z * 0.8, 0.2); setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) })); return nz }) }}
          className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title="Zoom out (-)"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={fitToView}
          className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title="Fit all to view (F)"
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={centerView}
          className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title="Reset view (0)"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 z-[3]">
        <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg backdrop-blur-md border border-border/30 text-[10px] text-muted-foreground/55" style={{ background: 'var(--surface-card)' }}>
          Scroll to zoom · Drag to pan · Double-click to focus · F to fit
        </div>
      </div>

      {/* ─── Identity card popup ────────────────────────────────────────── */}
      {/* Appears when a node is selected on desktop/tablet; mobile uses the
          dashboard's MobileNodeMenu + Drawer flow instead.                   */}
      <AnimatePresence>
        {selectedMemberId && dimensions.width >= 600 && (() => {
          const member = memberMap.get(selectedMemberId)
          if (!member) return null
          const initials = member.name.split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
          const isDeceased = !!(member.deathYear || member.isDeceased)
          const isSelf = !!selfMemberId && member.id === selfMemberId
          const isUnclaimed = !(member.isClaimed ?? false)
          const canClaim = isUnclaimed && !isDeceased && !isSelf && !selfMemberId && !!onClaimNode
          const canInvite = isUnclaimed && !isDeceased && !isSelf && !!onInviteNode
          const spouses = (member.spouseIds ?? []).map(id => memberMap.get(id)).filter((m): m is FamilyMember => !!m)
          const children = members.filter(m => (m.parentIds ?? []).includes(selectedMemberId!))
          const birthYear = member.birthYear ?? (member.dateOfBirth ? new Date(member.dateOfBirth).getFullYear() : null)
          const age = birthYear ? new Date().getFullYear() - birthYear : null
          const catColor = member.networkGroup === 'affiliated' ? '#14B8A6' : member.networkGroup === 'extended' ? '#8B5CF6' : '#F59E0B'
          const relLabel = isSelf ? 'You' : (computedRelLabels.get(selectedMemberId!) ?? null)
          const isNarrow = dimensions.width < 560
          // Context-aware primary CTA — mirrors universe popup logic
          const primaryBtn = isSelf
            ? { label: 'Edit My Profile', icon: '✏️', bg: 'var(--primary)', action: () => (onOpenMemberDetail ?? onOpenProfile)?.(selectedMemberId!) }
            : canClaim
              ? { label: 'This is me — Claim', icon: '🙋', bg: 'oklch(0.50 0.22 200)', action: () => onClaimNode!(selectedMemberId!) }
              : canInvite
                ? { label: 'Invite to Join', icon: '✉️', bg: 'oklch(0.50 0.22 145)', action: () => onInviteNode!(selectedMemberId!) }
                : { label: 'View Profile', icon: '👤', bg: 'var(--primary)', action: () => (onOpenMemberDetail ?? onOpenProfile)?.(selectedMemberId!) }
          return (
            <motion.div
              key={`popup-${selectedMemberId}`}
              initial={{ opacity: 0, y: isNarrow ? 56 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: isNarrow ? 48 : 12 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              className="absolute z-[5] overflow-hidden"
              style={{
                left: 12, right: 12, bottom: 68,
                borderRadius: 14,
                background: 'var(--universe-panel-bg, rgba(15,15,20,0.92))',
                border: '1px solid var(--universe-panel-border, rgba(255,255,255,0.10))',
                backdropFilter: 'blur(32px)',
                WebkitBackdropFilter: 'blur(32px)',
                boxShadow: '0 -4px 36px rgba(0,0,0,0.28)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Accent stripe */}
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
                style={{ background: `linear-gradient(90deg, ${catColor} 0%, transparent 60%)` }} />
              {/* Global close button */}
              <button
                onClick={e => { e.stopPropagation(); onSelectMember(selectedMemberId!) }}
                className="absolute top-2.5 right-3 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all hover:brightness-110 active:scale-90"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: 11 }}
                aria-label="Close popup"
              >✕</button>

              <div className={`flex ${isNarrow ? 'flex-col' : 'flex-row'}`} style={{ minHeight: isNarrow ? undefined : 130, maxHeight: isNarrow ? 280 : 170 }}>
                {/* ── Identity column ── */}
                <div className="flex items-start gap-3 px-4 pt-4 pb-3 shrink-0"
                  style={{
                    width: isNarrow ? '100%' : 240,
                    borderRight: isNarrow ? 'none' : '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))',
                    borderBottom: isNarrow ? '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))' : 'none',
                  }}>
                  {/* Avatar */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className="rounded-full overflow-hidden flex items-center justify-center font-bold text-white"
                      style={{
                        width: 50, height: 50, fontSize: 15,
                        background: `linear-gradient(135deg, ${catColor}bb 0%, ${catColor}44 100%)`,
                        boxShadow: `0 0 0 2.5px ${catColor}55`,
                      }}>
                      {member.photoUrl
                        ? <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover" />
                        : initials}
                    </div>
                    {member.isClaimed && !isDeceased && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold"
                        style={{ background: 'oklch(0.62 0.22 145)', borderColor: 'var(--universe-panel-bg, #0f0f14)', color: '#fff' }}>✓</span>
                    )}
                  </div>
                  {/* Name block */}
                  <div className="min-w-0 flex-1 pt-0.5 pr-8">
                    <div className="font-bold text-[13px] leading-snug break-words" style={{ color: 'var(--foreground)', wordBreak: 'break-word' }}>
                      {member.showAsAnonymous && !isAdmin ? '? Member' : member.name}
                    </div>
                    {relLabel && (
                      <div className="text-[11px] font-semibold mt-0.5" style={{ color: catColor }}>{relLabel}</div>
                    )}
                    {member.currentPlace && (
                      <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>{member.currentPlace}</div>
                    )}
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {age && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md"
                          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))' }}>
                          {isDeceased && member.deathYear && birthYear ? `Lived ${member.deathYear - birthYear} yrs` : `Age ${age}`}
                        </span>
                      )}
                      {member.occupation && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md"
                          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))' }}>
                          {member.occupation}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Family column ── */}
                {!isNarrow && (
                  <div className="flex-1 min-w-0 flex flex-col px-4 py-3 overflow-hidden"
                    style={{ borderRight: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))', minWidth: 130 }}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.10em] mb-2" style={{ color: 'var(--muted-foreground)' }}>Family</div>
                    <div className="space-y-1.5 overflow-auto flex-1">
                      {spouses.slice(0, 1).map(sp => (
                        <button key={sp.id}
                          onClick={e => { e.stopPropagation(); onSelectMember(sp.id) }}
                          className="flex items-center gap-1.5 w-full text-left hover:opacity-70 transition-opacity">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0"
                            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                            {sp.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold truncate" style={{ color: 'var(--foreground)' }}>{sp.name}</div>
                            <div className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>Spouse</div>
                          </div>
                        </button>
                      ))}
                      {children.length > 0 && (
                        <div>
                          <div className="text-[9px] mb-1" style={{ color: 'var(--muted-foreground)' }}>{children.length} {children.length === 1 ? 'child' : 'children'}</div>
                          <div className="flex gap-1 flex-wrap">
                            {children.slice(0, 5).map(ch => (
                              <button key={ch.id}
                                onClick={e => { e.stopPropagation(); onSelectMember(ch.id) }}
                                className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0"
                                  style={{ background: `${catColor}33`, color: 'var(--foreground)' }}>
                                  {ch.name[0]}
                                </div>
                                <span className="text-[10px]" style={{ color: 'var(--foreground)' }}>{ch.name.split(' ')[0]}</span>
                              </button>
                            ))}
                            {children.length > 5 && <span className="text-[10px] self-center" style={{ color: 'var(--muted-foreground)' }}>+{children.length - 5}</span>}
                          </div>
                        </div>
                      )}
                      {spouses.length === 0 && children.length === 0 && (
                        <div className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>No family linked yet</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── About column (desktop non-narrow only) ── */}
                {!isNarrow && (
                  <div className="flex-1 min-w-0 px-4 py-3 overflow-hidden"
                    style={{ borderRight: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))', minWidth: 130 }}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.10em] mb-2" style={{ color: 'var(--muted-foreground)' }}>About</div>
                    {(age || member.occupation || member.hometown || member.gotra || member.caste) ? (
                      <div className="grid" style={{ gridTemplateColumns: '68px 1fr', rowGap: 5, columnGap: 8 }}>
                        {age && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Age</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{isDeceased && member.deathYear && birthYear ? `Lived ${member.deathYear - birthYear} yrs` : age}</span>
                          </>
                        )}
                        {member.occupation && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Profession</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{member.occupation}</span>
                          </>
                        )}
                        {member.hometown && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Hometown</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{member.hometown}</span>
                          </>
                        )}
                        {member.caste && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Community</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{member.caste}</span>
                          </>
                        )}
                        {member.gotra && (
                          <>
                            <span className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>Gotra</span>
                            <span className="text-[11px] font-semibold leading-snug truncate" style={{ color: 'var(--foreground)' }}>{member.gotra}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] mt-1" style={{ color: 'var(--muted-foreground)' }}>No details yet</div>
                    )}
                  </div>
                )}

                {/* ── Actions column ── */}
                <div className={`shrink-0 flex flex-col px-3 py-3 gap-2 ${isNarrow ? 'flex-row flex-wrap' : ''}`}
                  style={{ width: isNarrow ? '100%' : 154 }}>
                  {!isNarrow && (
                    <div className="text-[9px] font-semibold uppercase tracking-[0.10em]" style={{ color: 'var(--muted-foreground)' }}>Actions</div>
                  )}
                  {/* Context-aware primary CTA */}
                  <button
                    onClick={e => { e.stopPropagation(); primaryBtn.action() }}
                    className={`flex items-center gap-2 px-2.5 h-8 rounded-lg text-[10.5px] font-semibold transition-all hover:brightness-110 active:scale-[0.97] ${isNarrow ? 'flex-1' : 'w-full'}`}
                    style={{ background: primaryBtn.bg, color: '#fff' }}
                  >
                    <span style={{ fontSize: 12 }}>{primaryBtn.icon}</span>
                    {primaryBtn.label}
                  </button>
                  {/* 2×2 action grid */}
                  <div className={`grid gap-1.5 ${isNarrow ? 'grid-cols-4 flex-1' : 'grid-cols-2'}`}>
                    {/* Focus */}
                    <button
                      onClick={e => { e.stopPropagation(); focusNode(selectedMemberId!) }}
                      className="flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[9px] font-semibold transition-all hover:brightness-110 active:scale-95"
                      style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))', color: 'var(--muted-foreground)' }}
                    >
                      <span style={{ fontSize: 13, lineHeight: 1 }}>⊕</span>
                      <span style={{ color: 'var(--foreground)' }}>Focus</span>
                    </button>
                    {/* In-Laws */}
                    <button
                      onClick={e => { e.stopPropagation(); if (spouses[0]) onSelectMember(spouses[0].id) }}
                      disabled={spouses.length === 0}
                      className="flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[9px] font-semibold transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))', color: 'var(--muted-foreground)' }}
                    >
                      <span style={{ fontSize: 13, lineHeight: 1 }}>💍</span>
                      <span style={{ color: 'var(--foreground)' }}>In-Laws</span>
                    </button>
                    {/* Add Relative */}
                    <button
                      onClick={e => { e.stopPropagation(); onAddRelative?.(selectedMemberId!, 'child') }}
                      disabled={!onAddRelative}
                      className="flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[9px] font-semibold transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))', color: 'var(--muted-foreground)' }}
                    >
                      <span style={{ fontSize: 13, lineHeight: 1 }}>＋</span>
                      <span style={{ color: 'var(--foreground)' }}>Add</span>
                    </button>
                    {/* Find Relationship */}
                    <button
                      onClick={e => { e.stopPropagation(); onFindRelationship?.(selectedMemberId!) }}
                      disabled={!onFindRelationship || isSelf}
                      className="flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[9px] font-semibold transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))', color: 'var(--muted-foreground)' }}
                    >
                      <span style={{ fontSize: 13, lineHeight: 1 }}>⟷</span>
                      <span style={{ color: 'var(--foreground)' }}>Find Rel</span>
                    </button>
                  </div>
                  {/* View / Edit Profile — always visible, secondary to primary CTA */}
                  {!isSelf && !canClaim && !canInvite && (
                    // Already handled by primary CTA for self/claim/invite — skip to avoid duplicate
                    null
                  )}
                  {(isSelf || canClaim || canInvite) && (
                    <button
                      onClick={e => { e.stopPropagation(); (onOpenMemberDetail ?? onOpenProfile)?.(selectedMemberId!) }}
                      className={`flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[10px] font-medium transition-all hover:brightness-105 active:scale-[0.97] ${isNarrow ? '' : 'w-full'}`}
                      style={{ background: 'var(--muted)', border: '1px solid var(--universe-panel-border, rgba(255,255,255,0.08))', color: 'var(--muted-foreground)' }}
                    >
                      <span style={{ fontSize: 11 }}>👤</span>
                      {isUnclaimed ? 'Edit Profile' : 'View Profile'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

    </div>
  )
}
