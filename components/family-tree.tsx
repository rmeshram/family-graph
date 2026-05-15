'use client'

import { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react'
import { FamilyMember } from '@/lib/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ZoomIn, ZoomOut, Maximize2, Grid3X3, ChevronDown, ChevronRight, Lock, ShieldCheck, ChevronLeft } from 'lucide-react'
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

interface FamilyTreeProps {
  members: FamilyMember[]
  selectedMemberId: string | null
  onSelectMember: (id: string) => void
  onDoubleClickMember?: (id: string) => void
}

interface NodePosition {
  id: string
  x: number
  y: number
}

export function FamilyTree({ members, selectedMemberId, onSelectMember, onDoubleClickMember }: FamilyTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
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
  // Track whether we've done the initial auto-fit (only do it once per tree)
  const hasAutoFit = useRef(false)
  // Track whether dimensions have been measured from the actual DOM
  const hasMeasuredDimensions = useRef(false)

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
        hasMeasuredDimensions.current = true
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
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

    const nodeWidth = 150
    const nodeHeight = 140
    const horizontalGap = 40
    const verticalGap = 140

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

    //  Affiliated clusters: anchor to junction node, place to the right 
    const affiliatedMembers = visibleMembers.filter(m => m.networkGroup === 'affiliated')
    const clusterMap = new Map<string, typeof affiliatedMembers>()
    affiliatedMembers.forEach(m => {
      if (!m.affiliatedFamilyId) return
      if (!clusterMap.has(m.affiliatedFamilyId)) clusterMap.set(m.affiliatedFamilyId, [])
      clusterMap.get(m.affiliatedFamilyId)!.push(m)
    })

    const clusterGap = 340 // horizontal offset from junction node

    clusterMap.forEach((clusterMembers, clusterId) => {
      if (collapsedClusters.has(clusterId)) return // collapsed: don't add positions

      // Find junction position
      const junctionId = clusterMembers[0]?.affiliatedJunctionId
      const junctionPos = junctionId ? positions.find(p => p.id === junctionId) : null
      const anchorX = junctionPos ? junctionPos.x + clusterGap : dimensions.width - 200
      const anchorY = junctionPos ? junctionPos.y : 200

      // Group cluster members by generation
      const clusterGens = new Map<number, typeof clusterMembers>()
      clusterMembers.forEach(m => {
        const gen = m.generation
        if (!clusterGens.has(gen)) clusterGens.set(gen, [])
        clusterGens.get(gen)!.push(m)
      })

      const affNodeWidth = 120
      const affHGap = 32
      let yOffset = 0

      // Sort gens ascending
      const sortedGens = [...clusterGens.keys()].sort((a, b) => a - b)
      const firstGen = sortedGens[0] ?? 0

      sortedGens.forEach(gen => {
        const genMembers = clusterGens.get(gen)!
        const totalWidth = genMembers.length * affNodeWidth + (genMembers.length - 1) * affHGap
        const startX = anchorX - totalWidth / 2
        yOffset = (gen - firstGen) * (nodeHeight + verticalGap)
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

  //  Affiliated cluster metadata (bounds, junction pos) 
  interface ClusterMeta {
    id: string
    name: string
    junctionPos: NodePosition | null
    memberCount: number  // total (including collapsed)
    bounds: { x: number; y: number; w: number; h: number }
    nodeIds: string[]
  }

  const affiliatedClusters = useMemo<ClusterMeta[]>(() => {
    const clusterMap = new Map<string, { name: string; junctionId?: string; ids: string[] }>()
    members.filter(m => m.networkGroup === 'affiliated' && m.affiliatedFamilyId).forEach(m => {
      const id = m.affiliatedFamilyId!
      if (!clusterMap.has(id)) clusterMap.set(id, { name: m.affiliatedFamilyName ?? id, junctionId: m.affiliatedJunctionId, ids: [] })
      clusterMap.get(id)!.ids.push(m.id)
    })

    const posMap = new Map(nodePositions.map(p => [p.id, p]))

    return [...clusterMap.entries()].map(([id, meta]) => {
      const junctionPos = meta.junctionId ? posMap.get(meta.junctionId) ?? null : null
      const clusterPositions = meta.ids.map(nid => posMap.get(nid)).filter(Boolean) as NodePosition[]
      if (clusterPositions.length === 0) {
        return { id, name: meta.name, junctionPos, memberCount: meta.ids.length, bounds: { x: 0, y: 0, w: 0, h: 0 }, nodeIds: meta.ids }
      }
      const xs = clusterPositions.map(p => p.x)
      const ys = clusterPositions.map(p => p.y)
      const pad = 52
      return {
        id,
        name: meta.name,
        junctionPos,
        memberCount: meta.ids.length,
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

  const connections = useMemo(() => {
    const lines: { from: NodePosition; to: NodePosition; type: 'parent' | 'spouse'; fromId: string; toId: string }[] = []
    const posMap = new Map(nodePositions.map((p) => [p.id, p]))

    members.forEach((member) => {
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
  }, [members, nodePositions])

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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

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

  //  Touch handlers (pinch-zoom + single-finger pan) 
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
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
    }
  }, [pan])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
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

  const centerView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

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
    // Let fitToView find the natural zoom — no artificial floor.
    // Compact mode (zoom > 0.15) shows readable cards; dot mode is the extreme fallback.
    const newZoom = Math.min(scaleX, scaleY, 1) * 0.9

    setZoom(newZoom)
    setPan({
      x: (dimensions.width - contentWidth * newZoom) / 2 - minX * newZoom,
      y: (dimensions.height - contentHeight * newZoom) / 2 - minY * newZoom,
    })
  }, [nodePositions, dimensions])

  // Focus on a specific node — center it in the viewport at a readable zoom
  const focusNode = useCallback((nodeId: string) => {
    const pos = nodePositions.find(p => p.id === nodeId)
    if (!pos) return
    setZoom(prevZoom => {
      const targetZoom = Math.max(prevZoom, 1.2)
      const cx = dimensions.width / 2
      const cy = dimensions.height / 2
      setPan({
        x: cx - pos.x * targetZoom,
        y: cy - pos.y * targetZoom,
      })
      return targetZoom
    })
  }, [nodePositions, dimensions])

  // Auto-fit on first load and whenever member count changes significantly
  // (e.g. when mobile hides extended members after hydration — member count drops)
  const prevMemberCount = useRef(0)
  useEffect(() => {
    if (nodePositions.length === 0 || !hasMeasuredDimensions.current) return
    const memberCountChanged = Math.abs(nodePositions.length - prevMemberCount.current) > 5
    if (!hasAutoFit.current || memberCountChanged) {
      hasAutoFit.current = true
      prevMemberCount.current = nodePositions.length
      fitToView()
    }
  }, [nodePositions, dimensions, fitToView])

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
      style={{ background: 'var(--surface-base)' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
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
            return (
              <g key={`cluster-bg-${cluster.id}`}>
                <rect
                  x={cluster.bounds.x + offsetX}
                  y={cluster.bounds.y + offsetY}
                  width={cluster.bounds.w}
                  height={cluster.bounds.h}
                  rx={24}
                  fill="rgba(20,184,166,0.06)"
                  stroke="rgba(20,184,166,0.28)"
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
                  fill="rgba(20,184,166,0.75)"
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
            // Find the cluster member closest to the junction (leftmost)
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

            if (collapsedClusters.has(cluster.id)) {
              // Collapsed: just a short stub line + pill
              return (
                <g key={`bridge-${cluster.id}`}>
                  <line x1={x1} y1={y1} x2={x1 + 60} y2={y1} stroke="#14B8A6" strokeWidth={1.5} strokeDasharray="8,5" opacity={0.6} />
                </g>
              )
            }

            return (
              <g key={`bridge-${cluster.id}`}>
                {/* Glow halo */}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#14B8A6" strokeWidth={10} opacity={0.06} />
                {/* Main dashed bridge */}
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#14B8A6" strokeWidth={1.5} strokeDasharray="10,6" opacity={0.65}
                />
                {/* Diamond marker at midpoint */}
                <rect x={mx - 5} y={my - 5} width={10} height={10} rx={2} fill="#14B8A6" opacity={0.75}
                  transform={`rotate(45, ${mx}, ${my})`}
                />
                {/* Label */}
                <text x={mx} y={my - 12} fontSize={8} textAnchor="middle" fill="rgba(20,184,166,0.6)" fontWeight={600}>in-law</text>
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
              const fill = ng === 'affiliated' ? '#14B8A6' : ng === 'extended' ? '#8B5CF6' : '#F59E0B'
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
            const nodeWidth = isAffiliated ? 120 : isExtended ? 130 : 150
            const staggerDelay = isExtended || isAffiliated
              ? `${(staggerMap.get(member.id) ?? 0) * 35}ms`
              : '0ms'
            const initials = member.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)

            const isDeceased = !!member.deathYear
            const isUnclaimed = !member.isClaimed && member.relationship !== 'self'
            const lifespan = member.deathYear
              ? `${member.birthYear}–${member.deathYear}`
              : member.birthYear
                ? `b. ${member.birthYear}`
                : ''
            const isCollapsed = collapsedIds.has(member.id)
            // ✔ O(1) hasChildren via precomputed parentSet
            const hasChildren = graphIndex.parentSet.has(member.id)
            const relationshipLabel = member.relationship
              ? member.relationship.toUpperCase()
              : null

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
                          : isAffiliated ? 'rgba(20,184,166,0.30)'
                            : isExtended ? 'rgba(139,92,246,0.30)'
                              : 'var(--tree-node-border)',
                    }}
                    onClick={(e) => { e.stopPropagation(); onSelectMember(member.id) }}
                    onDoubleClick={(e) => { e.stopPropagation(); focusNode(member.id); onDoubleClickMember?.(member.id) }}
                    onMouseEnter={() => setHoveredMemberId(member.id)}
                    onMouseLeave={() => setHoveredMemberId(null)}
                  >
                    <Avatar className={cn('border-2 h-8 w-8',
                      isSelected ? 'border-amber-400/60' : isUnclaimed ? 'border-slate-500/40' : isAffiliated ? 'border-teal-600/35' : isExtended ? 'border-violet-600/35' : 'border-slate-600/40'
                    )}>
                      <AvatarFallback className={cn('text-[9px] font-semibold',
                        isUnclaimed ? 'bg-slate-700/40 text-slate-400'
                          : isAffiliated ? 'bg-gradient-to-br from-teal-600/25 to-emerald-600/25 text-teal-300'
                            : isExtended ? 'bg-gradient-to-br from-violet-600/25 to-purple-600/25 text-violet-300'
                              : 'bg-gradient-to-br from-indigo-600/20 to-violet-600/20 text-indigo-200'
                      )}>{initials}</AvatarFallback>
                    </Avatar>
                    <p className="text-[9px] font-medium leading-tight text-center truncate w-full" style={{ color: isUnclaimed ? 'rgba(148,163,184,0.7)' : 'var(--tree-node-name)' }}>
                      {member.name.split(' ')[0]}
                    </p>
                  </button>
                </div>
              )
            }

            // FULL mode: complete interactive card
            return (
              <div
                key={member.id}
                className="absolute transition-opacity duration-200"
                style={{
                  left: pos.x - nodeWidth / 2,
                  top: pos.y - 60,
                  width: nodeWidth,
                  opacity: isExtended ? 0.82 : isAffiliated ? 0.9 : 1,
                  animation: isExtended || isAffiliated ? `fadeSlideIn 0.35s ease both` : 'none',
                  animationDelay: staggerDelay,
                }}
              >
                {/* Relationship label above node */}
                {relationshipLabel && (
                  <p
                    className="text-center text-[8px] font-semibold tracking-[0.04em] uppercase mb-1 leading-tight px-1 text-wrap break-words"
                    style={{
                      color: isAffiliated ? 'rgba(20,184,166,0.70)' : isExtended ? 'rgba(139,92,246,0.65)' : 'var(--tree-node-label)',
                    }}
                  >
                    {relationshipLabel}
                  </p>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        'flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-200 w-full',
                        'border backdrop-blur-md',
                        isSelected ? 'shadow-lg shadow-amber-500/10'
                          : isHovered ? 'shadow-lg shadow-indigo-500/10' : '',
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
                              ? (isAffiliated ? 'rgba(20,184,166,0.55)' : isExtended ? 'rgba(139,92,246,0.55)' : 'var(--tree-node-border-hover)')
                              : (isAffiliated ? 'rgba(20,184,166,0.30)' : isExtended ? 'rgba(139,92,246,0.30)' : 'var(--tree-node-border)'),
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectMember(member.id)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        focusNode(member.id)
                        onDoubleClickMember?.(member.id)
                      }}
                      onMouseEnter={() => setHoveredMemberId(member.id)}
                      onMouseLeave={() => setHoveredMemberId(null)}
                    >
                      <div className="relative">
                        <Avatar
                          className={cn(
                            'border-2 transition-all duration-200',
                            isAffiliated ? 'h-12 w-12' : isExtended ? 'h-12 w-12' : 'h-14 w-14',
                            isSelected
                              ? 'border-amber-400/60 ring-2 ring-amber-400/20 ring-offset-1 ring-offset-[var(--surface-base)]'
                              : isUnclaimed
                                ? 'border-slate-500/35'
                                : isHovered
                                  ? (isAffiliated
                                    ? 'border-teal-400/50 ring-2 ring-teal-400/15 ring-offset-1 ring-offset-[var(--surface-base)]'
                                    : isExtended
                                      ? 'border-violet-400/50 ring-2 ring-violet-400/15 ring-offset-1 ring-offset-[var(--surface-base)]'
                                      : 'border-indigo-400/50 ring-2 ring-indigo-400/15 ring-offset-1 ring-offset-[var(--surface-base)]')
                                  : (isAffiliated ? 'border-teal-600/35' : isExtended ? 'border-violet-600/35' : 'border-slate-600/40')
                          )}
                        >
                          <AvatarFallback
                            className={cn(
                              'font-bold text-lg transition-colors',
                              isSelected
                                ? 'bg-gradient-to-br from-amber-600/30 to-indigo-600/30'
                                : isHovered
                                  ? (isAffiliated ? 'bg-gradient-to-br from-teal-600/25 to-emerald-600/25'
                                    : isExtended ? 'bg-gradient-to-br from-violet-600/25 to-purple-600/25'
                                      : 'bg-gradient-to-br from-indigo-600/25 to-violet-600/25')
                                  : (isAffiliated ? 'bg-gradient-to-br from-teal-600/15 to-emerald-600/15'
                                    : isExtended ? 'bg-gradient-to-br from-violet-600/15 to-slate-500/20'
                                      : 'bg-gradient-to-br from-slate-400/30 to-slate-500/30')
                            )}
                            style={{ color: 'var(--tree-node-text)' }}
                          >
                            {initials}
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
                      </div>
                      <div className="text-center w-full">
                        <p
                          className={cn(
                            'text-[11px] font-semibold truncate w-full',
                            isSelected ? '' : isHovered ? '' : ''
                          )}
                          style={{ color: 'var(--tree-node-text)' }}
                        >
                          {member.name.split(' ')[0]}
                        </p>
                        {lifespan && (
                          <p className="text-[9px] mt-0.5" style={{ color: 'var(--tree-node-subtext)' }}>
                            {lifespan}
                          </p>
                        )}
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs border-border">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{member.name}</p>
                      {isUnclaimed && (
                        <p className="text-xs text-orange-400">Not joined yet — tap to invite</p>
                      )}
                      {!isUnclaimed && member.relationship && (
                        <p className="text-xs text-amber-600 dark:text-amber-400/80">{member.relationship}</p>
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
                <div className="absolute inset-0 -m-1.5 rounded-2xl animate-pulse" style={{ background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.3)' }} />
                <div
                  className="relative flex items-center gap-2 rounded-2xl px-3 py-2 border backdrop-blur-md transition-all hover:scale-105"
                  style={{
                    background: 'rgba(15,23,42,0.85)',
                    borderColor: 'rgba(20,184,166,0.45)',
                  }}
                >
                  {/* Preview avatars */}
                  <div className="flex -space-x-2">
                    {previewMembers.map(m => (
                      <div
                        key={m.id}
                        className="h-7 w-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
                        style={{
                          borderColor: 'rgba(20,184,166,0.5)',
                          background: 'rgba(20,184,166,0.2)',
                          color: 'rgba(20,184,166,0.95)',
                        }}
                      >
                        {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                    ))}
                    {cluster.memberCount > 3 && (
                      <div
                        className="h-7 w-7 rounded-full border-2 flex items-center justify-center text-[8px] font-bold"
                        style={{
                          borderColor: 'rgba(20,184,166,0.5)',
                          background: 'rgba(20,184,166,0.15)',
                          color: 'rgba(20,184,166,0.75)',
                        }}
                      >
                        +{cluster.memberCount - 3}
                      </div>
                    )}
                  </div>
                  {/* Text */}
                  <div className="text-left">
                    <p className="text-[11px] font-semibold leading-tight" style={{ color: 'rgba(20,184,166,0.95)' }}>
                      {cluster.name}
                    </p>
                    <p className="text-[9px] leading-tight" style={{ color: 'rgba(20,184,166,0.55)' }}>
                      {cluster.memberCount} relatives · tap to explore
                    </p>
                  </div>
                  {/* Expand chevron */}
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'rgba(20,184,166,0.7)' }} />
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
              background: 'rgba(20,184,166,0.10)',
              borderColor: 'rgba(20,184,166,0.35)',
              color: 'rgba(20,184,166,0.75)',
            }}
            title={`Collapse ${cluster.name}`}
            onClick={() => setCollapsedClusters(prev => new Set([...prev, cluster.id]))}
          >
            <ChevronLeft className="h-3 w-3" />
            <span>Collapse</span>
          </button>
        )
      })}

      {/*  Legend  */}
      <div className="absolute bottom-16 right-4 z-[3] flex flex-col gap-1.5 rounded-xl px-3 py-2.5 backdrop-blur-md border border-border/30 text-[10px]"
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
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-400/80 ring-1 ring-teal-400/30 flex-shrink-0" />
          <span className="text-muted-foreground">Affiliated Family</span>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-1.5 z-[3]">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            const cx = dimensions.width / 2; const cy = dimensions.height / 2
            setZoom(z => { const nz = Math.min(z * 1.25, 4); setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) })); return nz })
          }}
          className="h-8 w-8 backdrop-blur-md border border-slate-700/40 text-muted-foreground hover:text-foreground"
          style={{ background: 'var(--surface-card)' }}
          title="Zoom in (+)"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            const cx = dimensions.width / 2; const cy = dimensions.height / 2
            setZoom(z => { const nz = Math.max(z * 0.8, 0.2); setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) })); return nz })
          }}
          className="h-8 w-8 backdrop-blur-md border border-slate-700/40 text-muted-foreground hover:text-foreground"
          style={{ background: 'var(--surface-card)' }}
          title="Zoom out (-)"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={fitToView}
          className="h-8 w-8 backdrop-blur-md border border-slate-700/40 text-muted-foreground hover:text-foreground"
          style={{ background: 'var(--surface-card)' }}
          title="Fit all to view (F)"
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={centerView}
          className="h-8 w-8 backdrop-blur-md border border-slate-700/40 text-muted-foreground hover:text-foreground"
          style={{ background: 'var(--surface-card)' }}
          title="Reset view (0)"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Zoom indicator + hint */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 z-[3]">
        <div className="px-2.5 py-1 rounded-lg backdrop-blur-md border border-slate-700/40 text-[11px] text-muted-foreground" style={{ background: 'var(--surface-card)' }}>
          {Math.round(zoom * 100)}%
        </div>
        <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg backdrop-blur-md border border-slate-700/40 text-[10px] text-muted-foreground/60" style={{ background: 'var(--surface-card)' }}>
          Scroll to zoom · Drag to pan · Double-click node to focus · F to fit
        </div>
      </div>
    </div>
  )
}
