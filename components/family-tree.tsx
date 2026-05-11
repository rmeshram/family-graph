'use client'

import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { FamilyMember } from '@/lib/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ZoomIn, ZoomOut, Maximize2, Grid3X3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface FamilyTreeProps {
  members: FamilyMember[]
  selectedMemberId: string | null
  onSelectMember: (id: string) => void
}

interface NodePosition {
  id: string
  x: number
  y: number
}

export function FamilyTree({ members, selectedMemberId, onSelectMember }: FamilyTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)

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
    const generations = new Map<number, FamilyMember[]>()
    
    members.forEach((member) => {
      const gen = member.generation
      if (!generations.has(gen)) {
        generations.set(gen, [])
      }
      generations.get(gen)!.push(member)
    })

    const positions: NodePosition[] = []
    const nodeWidth = 140
    const nodeHeight = 120
    const horizontalGap = 60
    const verticalGap = 140

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

    return positions
  }, [members, dimensions.width])

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
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Grid pattern background */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(rgba(148, 163, 184, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      
      <div
        className="absolute inset-0"
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
            <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.3" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {connections.map((conn, i) => {
            const offsetX = dimensions.width / 2
            const offsetY = dimensions.height / 2
            
            if (conn.type === 'spouse') {
              const isHighlighted = 
                hoveredMemberId === members.find(m => nodePositions.find(p => p.id === m.id)?.x === conn.from.x)?.id ||
                hoveredMemberId === members.find(m => nodePositions.find(p => p.id === m.id)?.x === conn.to.x)?.id
              
              return (
                <g key={i}>
                  <line
                    x1={conn.from.x + offsetX}
                    y1={conn.from.y + offsetY}
                    x2={conn.to.x + offsetX}
                    y2={conn.to.y + offsetY}
                    stroke={isHighlighted ? '#F59E0B' : '#F59E0B'}
                    strokeWidth={isHighlighted ? 3 : 2}
                    strokeDasharray="8,6"
                    opacity={isHighlighted ? 1 : 0.5}
                    filter={isHighlighted ? 'url(#glow)' : undefined}
                  />
                  {/* Marriage indicator */}
                  <circle
                    cx={(conn.from.x + conn.to.x) / 2 + offsetX}
                    cy={(conn.from.y + conn.to.y) / 2 + offsetY}
                    r="6"
                    fill="#F59E0B"
                    opacity={0.8}
                  />
                </g>
              )
            }

            const midY = (conn.from.y + conn.to.y) / 2
            const isHighlighted = 
              hoveredMemberId === members.find(m => nodePositions.find(p => p.id === m.id && p.y === conn.from.y)?.id === m.id)?.id ||
              hoveredMemberId === members.find(m => nodePositions.find(p => p.id === m.id && p.y === conn.to.y)?.id === m.id)?.id
            
            return (
              <path
                key={i}
                d={`M ${conn.from.x + offsetX} ${conn.from.y + 35 + offsetY} 
                    C ${conn.from.x + offsetX} ${midY + offsetY},
                      ${conn.to.x + offsetX} ${midY + offsetY},
                      ${conn.to.x + offsetX} ${conn.to.y - 35 + offsetY}`}
                fill="none"
                stroke={isHighlighted ? '#4F46E5' : 'url(#connectionGradient)'}
                strokeWidth={isHighlighted ? 3 : 2}
                opacity={isHighlighted ? 1 : 0.6}
                filter={isHighlighted ? 'url(#glow)' : undefined}
              />
            )
          })}
        </svg>

        <TooltipProvider>
          {nodePositions.map((pos) => {
            const member = members.find((m) => m.id === pos.id)!
            const isSelected = selectedMemberId === member.id
            const isHovered = hoveredMemberId === member.id
            const initials = member.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)

            const isDeceased = !!member.deathYear
            const lifespan = member.deathYear
              ? `${member.birthYear} - ${member.deathYear}`
              : member.birthYear
                ? `b. ${member.birthYear}`
                : ''

            return (
              <Tooltip key={member.id}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      'absolute flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-300',
                      'border backdrop-blur-sm',
                      isSelected 
                        ? 'bg-primary/20 border-primary shadow-lg shadow-primary/20 scale-110' 
                        : isHovered
                          ? 'bg-card/80 border-primary/50 shadow-lg scale-105'
                          : 'bg-card/60 border-border/50 hover:bg-card/80 hover:border-primary/30'
                    )}
                    style={{
                      left: pos.x - 60,
                      top: pos.y - 45,
                      width: 120,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectMember(member.id)
                    }}
                    onMouseEnter={() => setHoveredMemberId(member.id)}
                    onMouseLeave={() => setHoveredMemberId(null)}
                  >
                    <div className="relative">
                      <Avatar
                        className={cn(
                          'h-14 w-14 border-2 transition-all duration-300',
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : isHovered
                              ? 'border-primary/70'
                              : 'border-border/50'
                        )}
                      >
                        <AvatarFallback
                          className={cn(
                            'font-bold text-lg transition-colors',
                            isSelected || isHovered
                              ? 'bg-gradient-to-br from-primary to-secondary text-primary-foreground'
                              : 'bg-muted text-foreground'
                          )}
                        >
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      {isDeceased && (
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                          <span className="text-[8px] text-muted-foreground">+</span>
                        </div>
                      )}
                    </div>
                    <div className="text-center w-full">
                      <p className={cn(
                        'text-xs font-semibold truncate w-full',
                        isSelected ? 'text-primary' : 'text-foreground'
                      )}>
                        {member.name.split(' ')[0]}
                      </p>
                      {lifespan && (
                        <p className="text-[10px] text-muted-foreground">
                          {lifespan}
                        </p>
                      )}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-semibold">{member.name}</p>
                    {member.relationship && (
                      <p className="text-xs text-muted-foreground">{member.relationship}</p>
                    )}
                    {member.occupation && (
                      <p className="text-xs">{member.occupation}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </TooltipProvider>
      </div>

      {/* Generation labels */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 pointer-events-none">
        {[0, 1, 2, 3].map((gen) => {
          const labels = ['Great Grandparents', 'Grandparents', 'Parents', 'Your Generation']
          return (
            <div
              key={gen}
              className="text-xs font-medium text-muted-foreground/50 whitespace-nowrap"
              style={{ transform: 'rotate(-90deg)' }}
            >
              {labels[gen]}
            </div>
          )
        })}
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setZoom((z) => Math.min(z * 1.2, 2.5))}
          className="h-9 w-9 bg-card/90 backdrop-blur-sm border border-border/50 hover:bg-card hover:border-primary/50"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
          className="h-9 w-9 bg-card/90 backdrop-blur-sm border border-border/50 hover:bg-card hover:border-primary/50"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={fitToView}
          className="h-9 w-9 bg-card/90 backdrop-blur-sm border border-border/50 hover:bg-card hover:border-primary/50"
        >
          <Grid3X3 className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={centerView}
          className="h-9 w-9 bg-card/90 backdrop-blur-sm border border-border/50 hover:bg-card hover:border-primary/50"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-card/90 backdrop-blur-sm border border-border/50 text-xs text-muted-foreground">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
