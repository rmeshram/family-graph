'use client'

import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set())

  // Touch state for pinch-zoom
  const touchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null)
  const touchPanRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
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

    // ── Core + Extended: use existing generation-based centering ─────────────
    const mainMembers = visibleMembers.filter(m => m.networkGroup !== 'affiliated')
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

    // ── Affiliated clusters: anchor to junction node, place to the right ─────
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

  // ── Affiliated cluster metadata (bounds, junction pos) ─────────────────────
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
    const lines: { from: NodePosition; to: NodePosition; type: 'parent' | 'spouse' }[] = []
    const posMap = new Map(nodePositions.map((p) => [p.id, p]))

    members.forEach((member) => {
      const memberPos = posMap.get(member.id)
      if (!memberPos) return

      member.parentIds.forEach((parentId) => {
        const parentPos = posMap.get(parentId)
        if (parentPos) {
          lines.push({ from: parentPos, to: memberPos, type: 'parent' })
        }
      })

      member.spouseIds.forEach((spouseId) => {
        if (member.id < spouseId) {
          const spousePos = posMap.get(spouseId)
          if (spousePos) {
            lines.push({ from: memberPos, to: spousePos, type: 'spouse' })
          }
        }
      })
    })

    return lines
  }, [members, nodePositions])

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
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.min(Math.max(z * delta, 0.3), 2.5))
  }, [])

  // ── Touch handlers (pinch-zoom + single-finger pan) ────────────────────────
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
      setZoom(z => Math.min(Math.max(z * scale, 0.3), 2.5))
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
    const newZoom = Math.min(scaleX, scaleY, 1) * 0.9

    setZoom(newZoom)
    setPan({
      x: (dimensions.width - contentWidth * newZoom) / 2 - minX * newZoom,
      y: (dimensions.height - contentHeight * newZoom) / 2 - minY * newZoom,
    })
  }, [nodePositions, dimensions])

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
          transformOrigin: 'center center',
        }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          width={dimensions.width * 2}
          height={dimensions.height * 2}
          style={{ left: -dimensions.width / 2, top: -dimensions.height / 2 }}
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

          {/* ── Branch zone backgrounds ─────────────────────────────────────── */}
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

          {/* ── Affiliated cluster island backgrounds ──────────────────────── */}
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

          {/* ── Bridge edges (junction → affiliated cluster) ────────────────── */}
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

          {/* ── Regular edges (parent-child + spouse) ──────────────────────── */}
          {connections.map((conn, i) => {
            const offsetX = dimensions.width / 2
            const offsetY = dimensions.height / 2
            const fromMember = members.find(m => nodePositions.find(p => p.id === m.id)?.x === conn.from.x && nodePositions.find(p => p.id === m.id)?.y === conn.from.y)
            const toMember = members.find(m => nodePositions.find(p => p.id === m.id)?.x === conn.to.x && nodePositions.find(p => p.id === m.id)?.y === conn.to.y)
            const bothExtended = fromMember?.networkGroup === 'extended' && toMember?.networkGroup === 'extended'

            if (conn.type === 'spouse') {
              const isHighlighted =
                hoveredMemberId === members.find(m => nodePositions.find(p => p.id === m.id)?.x === conn.from.x)?.id ||
                hoveredMemberId === members.find(m => nodePositions.find(p => p.id === m.id)?.x === conn.to.x)?.id

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
            const isHighlighted =
              hoveredMemberId === members.find(m => nodePositions.find(p => p.id === m.id && p.y === conn.from.y)?.id === m.id)?.id ||
              hoveredMemberId === members.find(m => nodePositions.find(p => p.id === m.id && p.y === conn.to.y)?.id === m.id)?.id

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
                  strokeDasharray="200"
                  filter={isHighlighted ? 'url(#glowGold)' : undefined}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="200" to="0"
                    dur={`${2.5 + (i % 3) * 0.5}s`}
                    repeatCount="indefinite"
                  />
                </path>
              </g>
            )
          })}
        </svg>

        <TooltipProvider>
          <AnimatePresence mode="popLayout">
            {nodePositions.map((pos, index) => {
              const member = members.find((m) => m.id === pos.id)!
              const isSelected = selectedMemberId === member.id
              const isHovered = hoveredMemberId === member.id
              const networkGroup = member.networkGroup ?? 'core'
              const isExtended = networkGroup === 'extended'
              const isAffiliated = networkGroup === 'affiliated'
              const nodeWidth = isAffiliated ? 120 : isExtended ? 130 : 150
              const initials = member.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)

              const isDeceased = !!member.deathYear
              const lifespan = member.deathYear
                ? `${member.birthYear}–${member.deathYear}`
                : member.birthYear
                  ? `b. ${member.birthYear}`
                  : ''
              const isCollapsed = collapsedIds.has(member.id)
              const hasChildren = members.some(m => m.parentIds.includes(member.id))
              const relationshipLabel = member.relationship
                ? member.relationship.toUpperCase()
                : null

              return (
                <motion.div
                  key={member.id}
                  className="absolute"
                  style={{
                    left: pos.x - nodeWidth / 2,
                    top: pos.y - 60,
                    width: nodeWidth,
                    opacity: isExtended ? 0.82 : isAffiliated ? 0.9 : 1,
                  }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: isExtended ? 0.82 : isAffiliated ? 0.9 : 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{
                    type: 'spring',
                    stiffness: 280,
                    damping: 26,
                    delay: index * 0.028,
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
                            : isHovered ? 'shadow-lg shadow-indigo-500/10' : ''
                        )}
                        style={{
                          background: isSelected ? 'var(--tree-node-bg-selected)'
                            : isHovered ? 'var(--tree-node-bg-hover)'
                              : 'var(--tree-node-bg)',
                          borderColor: isSelected ? 'var(--tree-node-border-selected)'
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
                                  ? 'bg-gradient-to-br from-amber-600/30 to-indigo-600/30 text-amber-200'
                                  : isHovered
                                    ? (isAffiliated ? 'bg-gradient-to-br from-teal-600/25 to-emerald-600/25 text-teal-200'
                                      : isExtended ? 'bg-gradient-to-br from-violet-600/25 to-purple-600/25 text-violet-200'
                                        : 'bg-gradient-to-br from-indigo-600/25 to-violet-600/25 text-indigo-200')
                                    : (isAffiliated ? 'bg-gradient-to-br from-teal-600/15 to-emerald-600/15'
                                      : isExtended ? 'bg-gradient-to-br from-violet-600/15 to-slate-500/20'
                                        : 'bg-gradient-to-br from-slate-400/30 to-slate-500/30')
                              )}
                              style={(!isSelected && !isHovered) ? { color: 'var(--tree-node-text)' } : undefined}
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
                              isSelected ? 'text-amber-200' : isHovered ? 'text-slate-100' : ''
                            )}
                            style={(!isSelected && !isHovered) ? { color: 'var(--tree-node-text)' } : undefined}
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
                    <TooltipContent side="top" className="max-w-xs border-slate-700/50" style={{ background: 'var(--surface-panel)' }}>
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-100">{member.name}</p>
                        {member.relationship && (
                          <p className="text-xs text-amber-400/80">{member.relationship}</p>
                        )}
                        {member.occupation && (
                          <p className="text-xs text-slate-400">{member.occupation}</p>
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
                </motion.div>
              )
            })}
          </AnimatePresence>
        </TooltipProvider>
      </div>

      {/* ── Affiliated cluster collapse buttons (per cluster) ────────────── */}
      {affiliatedClusters.map(cluster => {
        if (!cluster.junctionPos) return null
        const isCollapsed = collapsedClusters.has(cluster.id)
        // Position the button at the right edge of the cluster bounds (or stub if collapsed)
        const btnX = (cluster.bounds.x + cluster.bounds.w + dimensions.width / 2) * zoom + pan.x + 8
        const btnY = (cluster.bounds.y + 4 + dimensions.height / 2) * zoom + pan.y

        if (isCollapsed) {
          // Show a pill/badge with count + expand button
          return (
            <div key={`collapse-btn-${cluster.id}`}
              className="absolute z-[4] flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-[10px] font-semibold backdrop-blur-md cursor-pointer"
              style={{
                left: (cluster.junctionPos.x + 75 + dimensions.width / 2) * zoom + pan.x + 8,
                top: (cluster.junctionPos.y - 14 + dimensions.height / 2) * zoom + pan.y,
                background: 'rgba(20,184,166,0.12)',
                borderColor: 'rgba(20,184,166,0.35)',
                color: 'rgba(20,184,166,0.9)',
              }}
              onClick={() => setCollapsedClusters(prev => { const n = new Set(prev); n.delete(cluster.id); return n })}
            >
              <span>{cluster.name} ({cluster.memberCount})</span>
              <ChevronLeft className="h-3 w-3" />
            </div>
          )
        }

        return (
          <button key={`collapse-btn-${cluster.id}`}
            className="absolute z-[4] h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold backdrop-blur-md border transition-colors hover:opacity-90"
            style={{
              left: btnX,
              top: btnY,
              background: 'rgba(20,184,166,0.15)',
              borderColor: 'rgba(20,184,166,0.4)',
              color: 'rgba(20,184,166,0.9)',
            }}
            title={`Collapse ${cluster.name}`}
            onClick={() => setCollapsedClusters(prev => new Set([...prev, cluster.id]))}
          >
            ×
          </button>
        )
      })}

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
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
          onClick={() => setZoom((z) => Math.min(z * 1.2, 2.5))}
          className="h-8 w-8 backdrop-blur-md border border-slate-700/40 text-muted-foreground hover:text-foreground"
          style={{ background: 'var(--surface-card)' }}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
          className="h-8 w-8 backdrop-blur-md border border-slate-700/40 text-muted-foreground hover:text-foreground"
          style={{ background: 'var(--surface-card)' }}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={fitToView}
          className="h-8 w-8 backdrop-blur-md border border-slate-700/40 text-muted-foreground hover:text-foreground"
          style={{ background: 'var(--surface-card)' }}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={centerView}
          className="h-8 w-8 backdrop-blur-md border border-slate-700/40 text-muted-foreground hover:text-foreground"
          style={{ background: 'var(--surface-card)' }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 px-2.5 py-1 rounded-lg backdrop-blur-md border border-slate-700/40 text-[11px] text-muted-foreground z-[3]" style={{ background: 'var(--surface-card)' }}>
        {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
