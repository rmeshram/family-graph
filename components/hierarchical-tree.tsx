'use client'

/**
 * HierarchicalTree — Screenshot-faithful self-anchored family tree view.
 *
 * UX DESIGN GOAL: signup → complete immediate family in 30–50 seconds.
 *
 * How it works:
 *  1. On first load (new user), a SpeedWizard overlay appears IMMEDIATELY.
 *     It asks ONE question at a time — no menus, no dialogs, no confusion.
 *     The tree builds in real-time BEHIND the overlay so users see it grow.
 *     4 questions × ~8 seconds = ~32 seconds total.
 *
 *  2. After the wizard, ghost "+" slot cards remain for any missing relatives,
 *     giving continued guidance without blocking the UI.
 *
 *  3. A progress pill shows "X/7 · ~Ys left" for further motivation.
 *
 * Layout (top → bottom):
 *   Row −2  Paternal grandparents (left) · Maternal grandparents (right)
 *   Row −1  Father (left) · Mother (right)
 *   Row  0  Siblings (left) · YOU (centre, crown) · Spouse (right)
 *   Row +1  Children (centred under you + spouse midpoint)
 *
 * Feature flag: FEATURE_FLAGS.enableHierarchicalTreeView
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FamilyMember } from '@/lib/types'
import { computeRelationLabel, enrichMembersWithDerivedEdges } from '@/lib/relation-engine'
import { NodeActionRing } from '@/components/node-action-ring'
import type { QuickRelType } from '@/components/quick-add-member-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ZoomIn, ZoomOut, Maximize2, Crown, Home, Trash2 } from 'lucide-react'

// ─── Layout constants ────────────────────────────────────────────────────────
const NODE_W = 148
const NODE_H = 92
const H_GAP = 32
const ROW_H = 220
const SPOUSE_GAP = 20

// ─── Types ───────────────────────────────────────────────────────────────────
interface LayoutNode {
  id: string
  member: FamilyMember
  row: number
  col: number
  x: number
  y: number
  role: 'self' | 'father' | 'mother' | 'fatherFather' | 'fatherMother' | 'motherFather' | 'motherMother' | 'spouse' | 'sibling' | 'child' | 'other'
}

interface GhostSlot {
  id: string
  row: number
  x: number
  y: number
  relType: QuickRelType
  label: string
  anchorId: string
  isNextTarget: boolean
}

interface EdgeDef {
  id: string
  x1: number; y1: number
  x2: number; y2: number
  kind: 'blood' | 'spouse'
}

// ─── Props ───────────────────────────────────────────────────────────────────
export interface HierarchicalTreeProps {
  members: FamilyMember[]
  selfMemberId?: string | null
  selectedMemberId: string | null
  onSelectMember: (id: string) => void
  onAddRelative?: (anchorId: string, relType: QuickRelType) => void
  /** Direct add — bypasses QuickAddMemberDialog, used by SpeedWizard */
  onQuickAdd?: (
    name: string,
    gender: 'male' | 'female' | 'other' | '',
    birthYear: string,
    relType: QuickRelType,
    anchorId: string,
  ) => Promise<void>
  onOpenProfile?: (id: string) => void
  onFindRelationship?: (id: string) => void
  onInviteNode?: (id: string) => void
  onClaimNode?: (id: string) => void
  onOpenMemberDetail?: (id: string) => void
  onDelete?: (id: string) => void
  /** When true, forces the SpeedWizard to show even if the user already completed it this session */
  forceWizard?: boolean
  isAdmin?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}
function genderColor(gender?: string): string {
  if (gender === 'male') return 'hsl(220 70% 62%)'
  if (gender === 'female') return 'hsl(340 65% 62%)'
  return 'hsl(160 45% 52%)'
}

// ─── Layout builder ───────────────────────────────────────────────────────────
function buildLayout(members: FamilyMember[], selfId: string | null | undefined) {
  const byId = new Map(members.map(m => [m.id, m]))
  const self = selfId ? byId.get(selfId) : undefined

  if (!self) {
    const nodes: LayoutNode[] = members.map((m, i) => ({
      id: m.id, member: m, row: 0, col: i, role: 'other' as const,
      x: (i - Math.floor(members.length / 2)) * (NODE_W + H_GAP), y: 0,
    }))
    return { nodes, ghosts: [] as GhostSlot[], edges: [] as EdgeDef[] }
  }

  const parentMembers = self.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]
  const father = parentMembers.find(p => p.gender === 'male') ?? (parentMembers[0] as FamilyMember | undefined)
  const mother = parentMembers.find(p => p.gender === 'female') ?? (parentMembers.length > 1 ? parentMembers[1] : undefined) as FamilyMember | undefined
  const fatherParents = (father?.parentIds ?? []).map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]
  const motherParents = (mother?.parentIds ?? []).map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]
  const fatherFather = fatherParents.find(p => p.gender === 'male') ?? (fatherParents[0] as FamilyMember | undefined)
  const fatherMother = fatherParents.find(p => p.gender === 'female') ?? (fatherParents.length > 1 ? fatherParents[1] : undefined) as FamilyMember | undefined
  const motherFather = motherParents.find(p => p.gender === 'male') ?? (motherParents[0] as FamilyMember | undefined)
  const motherMother = motherParents.find(p => p.gender === 'female') ?? (motherParents.length > 1 ? motherParents[1] : undefined) as FamilyMember | undefined
  const primarySpouse = (self.spouseIds ?? []).map(sid => byId.get(sid)).filter(Boolean)[0] as FamilyMember | undefined
  const siblingMembers = members.filter(m =>
    m.id !== self.id && m.parentIds.length > 0 && m.parentIds.some(pid => self.parentIds.includes(pid))
  )
  const childMembers = members.filter(m => m.parentIds.includes(self.id))

  // X positions
  // pgPairW = width of one grandparent pair (2 nodes + 1 gap)
  // fatherX/motherX spread apart by pgPairW + H_GAP so grandparent pairs don't overlap
  const pgPairW = NODE_W * 2 + H_GAP
  const fatherX = -(pgPairW + H_GAP) / 2
  const motherX = (pgPairW + H_GAP) / 2
  const patGFX = fatherX - pgPairW / 2 + NODE_W / 2
  const patGMX = fatherX + pgPairW / 2 - NODE_W / 2
  const matGFX = motherX - pgPairW / 2 + NODE_W / 2
  const matGMX = motherX + pgPairW / 2 - NODE_W / 2
  const gpY = -2 * ROW_H
  const parentY = -1 * ROW_H
  const selfY = 0
  const childY = +1 * ROW_H

  const nodes: LayoutNode[] = []

  if (fatherFather) nodes.push({ id: fatherFather.id, member: fatherFather, row: -2, col: 0, x: patGFX, y: gpY, role: 'fatherFather' })
  if (fatherMother) nodes.push({ id: fatherMother.id, member: fatherMother, row: -2, col: 1, x: patGMX, y: gpY, role: 'fatherMother' })
  if (motherFather) nodes.push({ id: motherFather.id, member: motherFather, row: -2, col: 2, x: matGFX, y: gpY, role: 'motherFather' })
  if (motherMother) nodes.push({ id: motherMother.id, member: motherMother, row: -2, col: 3, x: matGMX, y: gpY, role: 'motherMother' })
  if (father) nodes.push({ id: father.id, member: father, row: -1, col: 0, x: fatherX, y: parentY, role: 'father' })
  if (mother) nodes.push({ id: mother.id, member: mother, row: -1, col: 1, x: motherX, y: parentY, role: 'mother' })

  const sibCount = siblingMembers.length
  const sibStartX = -(NODE_W + SPOUSE_GAP) - sibCount * (NODE_W + H_GAP)
  siblingMembers.forEach((sib, i) => {
    nodes.push({ id: sib.id, member: sib, row: 0, col: i, x: sibStartX + i * (NODE_W + H_GAP), y: selfY, role: 'sibling' })
  })
  nodes.push({ id: self.id, member: self, row: 0, col: sibCount, x: 0, y: selfY, role: 'self' })
  if (primarySpouse) {
    nodes.push({ id: primarySpouse.id, member: primarySpouse, row: 0, col: sibCount + 1, x: NODE_W + SPOUSE_GAP, y: selfY, role: 'spouse' })
  }

  const childMidX = primarySpouse ? (NODE_W + SPOUSE_GAP) / 2 : 0
  if (childMembers.length > 0) {
    const totalW = childMembers.length * NODE_W + (childMembers.length - 1) * H_GAP
    const startX = childMidX - totalW / 2 + NODE_W / 2
    childMembers.forEach((child, i) => {
      nodes.push({ id: child.id, member: child, row: 1, col: i, x: startX + i * (NODE_W + H_GAP), y: childY, role: 'child' })
    })
  }

  // Ghost slots
  type GDef = { key: string; condition: boolean; relType: QuickRelType; label: string; anchorId: string; row: number; x: number; y: number }
  const immediate: GDef[] = [
    { key: 'father', condition: !father, relType: 'father', label: 'Add Father', anchorId: self.id, row: -1, x: fatherX, y: parentY },
    { key: 'mother', condition: !mother, relType: 'mother', label: 'Add Mother', anchorId: self.id, row: -1, x: motherX, y: parentY },
    { key: 'spouse', condition: !primarySpouse, relType: 'spouse', label: 'Add Spouse', anchorId: self.id, row: 0, x: NODE_W + SPOUSE_GAP, y: selfY },
    { key: 'child', condition: childMembers.length === 0, relType: 'child', label: 'Add Child', anchorId: self.id, row: 1, x: childMidX, y: childY },
    { key: 'sibling', condition: sibCount === 0, relType: 'sibling', label: 'Add Sibling', anchorId: self.id, row: 0, x: -(NODE_W + SPOUSE_GAP), y: selfY },
  ]
  const grandparent: GDef[] = [
    ...(father && !fatherFather ? [{ key: 'fffather', condition: true, relType: 'father' as QuickRelType, label: "Father's Father", anchorId: father.id, row: -2, x: patGFX, y: gpY }] : []),
    ...(father && !fatherMother ? [{ key: 'ffmother', condition: true, relType: 'mother' as QuickRelType, label: "Father's Mother", anchorId: father.id, row: -2, x: patGMX, y: gpY }] : []),
    ...(mother && !motherFather ? [{ key: 'mffather', condition: true, relType: 'father' as QuickRelType, label: "Mother's Father", anchorId: mother.id, row: -2, x: matGFX, y: gpY }] : []),
    ...(mother && !motherMother ? [{ key: 'mfmother', condition: true, relType: 'mother' as QuickRelType, label: "Mother's Mother", anchorId: mother.id, row: -2, x: matGMX, y: gpY }] : []),
  ]

  const allGhosts = [...immediate, ...grandparent].filter(g => g.condition)
  const nextKey = allGhosts[0]?.key
  const ghosts: GhostSlot[] = allGhosts.map(g => ({
    id: `ghost-${g.key}`, row: g.row, x: g.x, y: g.y,
    relType: g.relType, label: g.label, anchorId: g.anchorId,
    isNextTarget: g.key === nextKey,
  }))

  // ── Phase 2: Extended family (all remaining members in their generation rows) ──
  const placedIds = new Set(nodes.map(n => n.id))
  const unplaced = members.filter(m => !placedIds.has(m.id))

  if (unplaced.length > 0) {
    const selfGen = self.generation ?? 0

    // Group by relative generation
    const byRelGen = new Map<number, FamilyMember[]>()
    unplaced.forEach(m => {
      const rg = (m.generation ?? selfGen) - selfGen
      if (!byRelGen.has(rg)) byRelGen.set(rg, [])
      byRelGen.get(rg)!.push(m)
    })

    // Find rightmost x for each existing row
    const rowRightX = new Map<number, number>()
    nodes.forEach(n => {
      const cur = rowRightX.get(n.row) ?? -NODE_W / 2
      rowRightX.set(n.row, Math.max(cur, n.x + NODE_W / 2))
    })

    const SECTION_GAP = 96 // visual gap between core tree and extended family

    // Process from oldest generation to newest for consistent ordering
    const sortedRelGens = [...byRelGen.keys()].sort((a, b) => a - b)
    sortedRelGens.forEach(rg => {
      const genMembers = byRelGen.get(rg)!

      // Sort: keep spouse pairs adjacent
      const sorted: FamilyMember[] = []
      const added = new Set<string>()
      genMembers.forEach(m => {
        if (added.has(m.id)) return
        sorted.push(m); added.add(m.id)
          ; (m.spouseIds ?? []).forEach(sid => {
            const sp = byId.get(sid)
            if (sp && genMembers.includes(sp) && !added.has(sid)) {
              sorted.push(sp); added.add(sid)
            }
          })
      })

      const rowY = rg * ROW_H
      const baseX = (rowRightX.get(rg) ?? NODE_W / 2) + SECTION_GAP + NODE_W / 2

      sorted.forEach((m, i) => {
        const x = baseX + i * (NODE_W + H_GAP)
        nodes.push({ id: m.id, member: m, row: rg, col: nodes.length, x, y: rowY, role: 'other' })
        placedIds.add(m.id)
      })

      const newRight = baseX + (sorted.length - 1) * (NODE_W + H_GAP) + NODE_W / 2
      rowRightX.set(rg, Math.max(rowRightX.get(rg) ?? 0, newRight))
    })
  }

  // ── Edges: computed after ALL nodes are placed ─────────────────────────────
  const edges: EdgeDef[] = []
  const pos = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]))
  const edgeSet = new Set<string>()

  // Blood edges
  nodes.forEach(n => {
    n.member.parentIds.forEach(pid => {
      const key = `b-${pid}-${n.id}`
      if (!edgeSet.has(key) && pos.has(pid)) {
        edgeSet.add(key)
        const p = pos.get(pid)!
        edges.push({ id: key, x1: p.x, y1: p.y + NODE_H / 2, x2: n.x, y2: n.y - NODE_H / 2, kind: 'blood' })
      }
    })
  })

  // Spouse edges
  nodes.forEach(n => {
    ; (n.member.spouseIds ?? []).forEach(sid => {
      const key = [n.id, sid].sort().join('|')
      if (edgeSet.has(key) || !pos.has(sid)) return
      edgeSet.add(key)
      const a = pos.get(n.id)!
      const b = pos.get(sid)!
      const [left, right] = a.x < b.x ? [a, b] : [b, a]
      edges.push({ id: `s-${n.id}-${sid}`, x1: left.x + NODE_W / 2, y1: left.y, x2: right.x - NODE_W / 2, y2: right.y, kind: 'spouse' })
    })
  })

  return { nodes, ghosts, edges }
}

// ─── SVG edge layer ──────────────────────────────────────────────────────────
function EdgeLayer({ edges }: { edges: EdgeDef[] }) {
  if (!edges.length) return null
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }} width={1} height={1}>
      {edges.map(e => {
        if (e.kind === 'spouse') {
          const mx = (e.x1 + e.x2) / 2; const my = (e.y1 + e.y2) / 2
          return (
            <g key={e.id}>
              <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="rgba(244,63,94,0.45)" strokeWidth={1.5} strokeDasharray="6 4" />
              <rect x={mx - 5} y={my - 5} width={10} height={10} rx={2} fill="transparent" stroke="rgba(244,63,94,0.4)" strokeWidth={1.5} />
            </g>
          )
        }
        const midY = (e.y1 + e.y2) / 2
        return (
          <path key={e.id}
            d={`M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`}
            fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth={1.5}
          />
        )
      })}
    </svg>
  )
}

// ─── Tree node card ──────────────────────────────────────────────────────────
interface TreeNodeCardProps {
  node: LayoutNode
  isSelected: boolean
  isSelf: boolean
  relationLabel: string
  onSelect: (id: string) => void
  onAddRelative?: (anchorId: string, relType: QuickRelType) => void
  onOpenMemberDetail?: (id: string) => void
  onFindRelationship?: (id: string) => void
  onInviteNode?: (id: string) => void
  onClaimNode?: (id: string) => void
  onDelete?: (id: string) => void
  allMembers: FamilyMember[]
  isAdmin: boolean
}

const TreeNodeCard = memo(function TreeNodeCard({
  node, isSelected, isSelf, relationLabel,
  onSelect, onAddRelative, onOpenMemberDetail,
  onFindRelationship, onInviteNode, onClaimNode, onDelete,
  allMembers, isAdmin,
}: TreeNodeCardProps) {
  const { member } = node
  const [hovered, setHovered] = useState(false)
  const [ringOpen, setRingOpen] = useState(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isUnclaimed = !member.isClaimed && !isSelf
  const canClaim = isUnclaimed && !!onClaimNode
  const canInvite = isUnclaimed && !!onInviteNode && !canClaim
  const displayName = (!isAdmin && member.showAsAnonymous) ? '? Member' : member.name
  const initials = (!isAdmin && member.showAsAnonymous) ? '?' : getInitials(member.name)
  const color = genderColor(member.gender)

  const onPD = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    longPressRef.current = setTimeout(() => setRingOpen(true), 500)
  }
  const onPU = () => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null } }

  useEffect(() => {
    if (!ringOpen) return
    const t = setTimeout(() => setRingOpen(false), 4000)
    return () => clearTimeout(t)
  }, [ringOpen])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 260, damping: 20 }}
      style={{ position: 'absolute', left: node.x - NODE_W / 2, top: node.y - NODE_H / 2, width: NODE_W, height: NODE_H, zIndex: isSelected ? 20 : hovered ? 15 : 10 }}
      onPointerDown={e => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={() => { onSelect(member.id); setRingOpen(false) }}
        onContextMenu={e => { e.preventDefault(); setRingOpen(true) }}
        onPointerDown={onPD} onPointerUp={onPU} onPointerCancel={onPU}
        className={cn(
          'relative w-full h-full rounded-2xl border flex flex-col items-center justify-center gap-1.5 p-2 transition-all duration-200',
          isSelected
            ? 'border-primary/70 bg-primary/10 shadow-lg shadow-primary/20'
            : 'border-border/40 bg-card hover:border-border/80 hover:shadow-md',
        )}
      >
        {isSelf && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-amber-400 z-10">
            <Crown className="h-4 w-4 fill-amber-400" />
          </div>
        )}
        <span className="absolute top-1.5 right-2 text-[9px] font-bold opacity-55" style={{ color }}>
          {member.gender === 'male' ? '♂' : member.gender === 'female' ? '♀' : ''}
        </span>
        {isUnclaimed && (
          <div className="absolute top-1.5 left-2 h-1.5 w-1.5 rounded-full bg-amber-400 opacity-80" />
        )}
        <Avatar className="h-11 w-11 border-2" style={{ borderColor: color + '55' }}>
          {member.photoUrl && <AvatarImage src={member.photoUrl} alt={displayName} />}
          <AvatarFallback className="text-sm font-bold text-white" style={{ background: color }}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="w-full px-1 text-center">
          <p className="text-[11px] font-semibold leading-tight truncate" title={displayName}>{displayName}</p>
          {relationLabel && <p className="text-[9px] text-muted-foreground leading-tight truncate mt-0.5">{relationLabel}</p>}
        </div>
      </button>

      {/* Hover action strip */}
      <AnimatePresence>
        {hovered && !ringOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute -bottom-9 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-border/50 bg-card/95 backdrop-blur-sm px-2 py-1 shadow-md z-30 pointer-events-auto whitespace-nowrap"
            onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
          >
            {onAddRelative && (
              <button type="button" onClick={() => onAddRelative(member.id, 'child')}
                className="text-[9px] font-semibold text-primary hover:text-primary/80 px-1.5 py-0.5 rounded-full hover:bg-primary/10 transition-colors">
                + Add
              </button>
            )}
            {onOpenMemberDetail && (
              <button type="button" onClick={() => onOpenMemberDetail(member.id)}
                className="text-[9px] font-semibold text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-full hover:bg-muted transition-colors">
                👤 View
              </button>
            )}
            {onFindRelationship && !isSelf && (
              <button type="button" onClick={() => onFindRelationship(member.id)}
                className="text-[9px] font-semibold text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-full hover:bg-muted transition-colors">
                ⟷ Path
              </button>
            )}
            {canInvite && (
              <button type="button" onClick={() => onInviteNode?.(member.id)}
                className="text-[9px] font-semibold text-amber-500 hover:text-amber-400 px-1.5 py-0.5 rounded-full hover:bg-amber-500/10 transition-colors">
                ✉ Invite
              </button>
            )}
            {canClaim && (
              <button type="button" onClick={() => onClaimNode?.(member.id)}
                className="text-[9px] font-semibold text-emerald-500 hover:text-emerald-400 px-1.5 py-0.5 rounded-full hover:bg-emerald-500/10 transition-colors">
                ✓ Claim
              </button>
            )}
            {isAdmin && !isSelf && onDelete && (
              <button type="button" onClick={() => onDelete(member.id)}
                className="text-[9px] font-semibold text-destructive/70 hover:text-destructive px-1.5 py-0.5 rounded-full hover:bg-destructive/10 transition-colors ml-0.5">
                <Trash2 className="h-2.5 w-2.5 inline" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ringOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-40"
            onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
          >
            <NodeActionRing
              member={member} allMembers={allMembers}
              onViewProfile={onOpenMemberDetail}
              onFindRelationship={!isSelf ? onFindRelationship : undefined}
              onInvite={isUnclaimed ? onInviteNode : undefined}
              onAddRelative={onAddRelative}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})

// ─── Ghost slot card ─────────────────────────────────────────────────────────
function GhostSlotCard({ slot, onAddRelative }: { slot: GhostSlot; onAddRelative?: (a: string, r: QuickRelType) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.25, type: 'spring', stiffness: 300, damping: 22 }}
      style={{ position: 'absolute', left: slot.x - NODE_W / 2, top: slot.y - NODE_H / 2, width: NODE_W, height: NODE_H, zIndex: 5 }}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onAddRelative?.(slot.anchorId, slot.relType)}
        className="relative w-full h-full rounded-2xl border-2 border-dashed border-border/45 bg-muted/15 flex flex-col items-center justify-center gap-2 transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 group"
        style={{ opacity: 0.75 }}
      >
        {slot.isNextTarget && (
          <span className="absolute inset-0 rounded-2xl animate-ping border-2 border-primary/35 pointer-events-none" style={{ animationDuration: '2.2s' }} />
        )}
        <div className={cn(
          'h-10 w-10 rounded-full border-2 border-dashed flex items-center justify-center transition-colors',
          slot.isNextTarget ? 'border-primary/60 text-primary' : 'border-border/50 text-muted-foreground',
          'group-hover:border-primary/60 group-hover:text-primary',
        )}>
          <span className="text-xl font-light">+</span>
        </div>
        <span className={cn(
          'text-[10px] font-semibold text-center leading-tight px-2',
          slot.isNextTarget ? 'text-primary' : 'text-muted-foreground',
          'group-hover:text-primary',
        )}>
          {slot.label}
        </span>
      </button>
    </motion.div>
  )
}

// ─── Progress pill ────────────────────────────────────────────────────────────
function ProgressPill({ members, selfId }: { members: FamilyMember[]; selfId: string }) {
  const count = useMemo(() => {
    const byId = new Map(members.map(m => [m.id, m]))
    const self = byId.get(selfId); if (!self) return 0
    let c = 0
    const parents = self.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]
    const f = parents.find(p => p.gender === 'male')
    const m = parents.find(p => p.gender === 'female')
    if (f) c++; if (m) c++
    if ((self.spouseIds ?? []).length > 0) c++
    if (f) { const fp = f.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]; if (fp.some(p => p.gender === 'male')) c++; if (fp.some(p => p.gender === 'female')) c++ }
    if (m) { const mp = m.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]; if (mp.some(p => p.gender === 'male')) c++; if (mp.some(p => p.gender === 'female')) c++ }
    return c
  }, [members, selfId])

  if (count >= 7) return (
    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400">
      🎉 Family complete!
    </div>
  )
  const secsLeft = (7 - count) * 8
  const timeLabel = secsLeft < 60 ? `~${secsLeft}s left` : `~${Math.ceil(secsLeft / 60)}m left`
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card/90 backdrop-blur-sm px-3 py-1.5 text-[11px] font-medium shadow-sm">
      <div className="relative h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.round((count / 7) * 100)}%` }} />
      </div>
      <span className="text-muted-foreground">{count}/7</span>
      <span className="opacity-40 text-muted-foreground">·</span>
      <span className="text-muted-foreground">{timeLabel}</span>
    </div>
  )
}

// ─── Confetti burst ───────────────────────────────────────────────────────────
function ConfettiBurst() {
  const pieces = Array.from({ length: 18 }, (_, i) => ({
    angle: (i / 18) * 360,
    dist: 55 + Math.random() * 65,
    color: ['#f59e0b', '#10b981', '#6366f1', '#f43f5e', '#06b6d4', '#a855f7'][i % 6],
    size: 4 + Math.random() * 5,
  }))
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-[60] overflow-hidden">
      {pieces.map((p, i) => (
        <motion.div key={i}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: Math.cos(p.angle * Math.PI / 180) * p.dist, y: Math.sin(p.angle * Math.PI / 180) * p.dist, opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.85, ease: 'easeOut', delay: i * 0.02 }}
          style={{ position: 'absolute', width: p.size, height: p.size, borderRadius: '50%', background: p.color }}
        />
      ))}
    </div>
  )
}

// ─── Speed Wizard ─────────────────────────────────────────────────────────────
// ONE question per screen. Answer → node appears in tree behind you → next question.
// 4 questions × ~8 seconds = ~32 seconds to a complete immediate family.

// Steps that are "Do you have a X?" — show Yes/No first, reveal name input only on Yes.
const YES_NO_STEPS = new Set(['spouse', 'child', 'sibling'])

// Words that mean "I don't have one" — typed in the name field → auto-skip permanently.
const SKIP_WORDS = new Set(['no', 'nope', 'n', 'none', 'na', 'n/a', 'skip', 'nahi', 'nahin', 'nobody', 'never', 'not yet'])

// localStorage helpers — persist permanent "No" answers so steps never re-appear.
const _wizardKey = (selfId: string) => `wizard_dismissed_${selfId}`
function getWizardDismissed(selfId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(_wizardKey(selfId)) ?? '[]') as string[]) }
  catch { return new Set() }
}
function saveWizardDismissed(selfId: string, relType: string) {
  const s = getWizardDismissed(selfId); s.add(relType)
  try { localStorage.setItem(_wizardKey(selfId), JSON.stringify([...s])) } catch {}
}

const WIZARD_STEPS_DEF = [
  {
    relType: 'father' as QuickRelType,
    question: "Who is your father?",
    placeholder: "e.g. Rohan Mehta",
    defaultGender: 'male' as const,
    emoji: '👨',
    skipLabel: "I'll add him later",
    checkMissing: (members: FamilyMember[], selfId: string) => {
      const self = members.find(m => m.id === selfId); if (!self) return false
      return !members.filter(m => self.parentIds.includes(m.id)).some(p => p.gender === 'male')
    },
  },
  {
    relType: 'mother' as QuickRelType,
    question: "Who is your mother?",
    placeholder: "e.g. Anita Mehta",
    defaultGender: 'female' as const,
    emoji: '👩',
    skipLabel: "I'll add her later",
    checkMissing: (members: FamilyMember[], selfId: string) => {
      const self = members.find(m => m.id === selfId); if (!self) return false
      return !members.filter(m => self.parentIds.includes(m.id)).some(p => p.gender === 'female')
    },
  },
  {
    relType: 'spouse' as QuickRelType,
    question: "Do you have a spouse or partner?",
    placeholder: "Their name",
    defaultGender: '' as const,
    emoji: '💍',
    skipLabel: "Not yet",
    checkMissing: (members: FamilyMember[], selfId: string) => {
      const self = members.find(m => m.id === selfId)
      return !!self && (self.spouseIds ?? []).length === 0
    },
  },
  {
    relType: 'child' as QuickRelType,
    question: "Do you have children?",
    placeholder: "Child's name",
    defaultGender: '' as const,
    emoji: '👶',
    skipLabel: "Not yet",
    checkMissing: (members: FamilyMember[], selfId: string) =>
      !members.some(m => m.parentIds.includes(selfId)),
  },
  {
    relType: 'sibling' as QuickRelType,
    question: "Do you have any brothers or sisters?",
    placeholder: "e.g. Priya Mehta",
    defaultGender: '' as const,
    emoji: '👫',
    skipLabel: "No siblings",
    checkMissing: (members: FamilyMember[], selfId: string) => {
      const self = members.find(m => m.id === selfId); if (!self) return false
      // No sibling = no other member that shares at least one of self's parents
      return !(self.parentIds ?? []).length
        ? false // if self has no parents yet, skip the siblings step too
        : !members.some(m => m.id !== selfId && (self.parentIds ?? []).some(pid => (m.parentIds ?? []).includes(pid)))
    },
  },
]

interface SpeedWizardProps {
  selfId: string
  selfName: string
  members: FamilyMember[]
  onQuickAdd: (name: string, gender: 'male' | 'female' | 'other' | '', birthYear: string, relType: QuickRelType, anchorId: string) => Promise<void>
  onDone: () => void
}

function SpeedWizard({ selfId, selfName, members, onQuickAdd, onDone }: SpeedWizardProps) {
  // Permanently dismissed steps ("No" was answered) — loaded once from localStorage.
  const [dismissed] = useState(() => getWizardDismissed(selfId))

  // Compute pending steps ONCE on mount — exclude already-dismissed and structurally satisfied.
  const [pendingSteps] = useState(() =>
    WIZARD_STEPS_DEF
      .filter(s => s.checkMissing(members, selfId))
      .filter(s => !dismissed.has(s.relType))
  )
  const [stepIdx, setStepIdx] = useState(0)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [justAdded, setJustAdded] = useState(false)
  // showInput: for yes/no steps, start hidden; reveal on "Yes". Always visible for parent steps.
  const [showInput, setShowInput] = useState(() => !YES_NO_STEPS.has(pendingSteps[0]?.relType ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  const totalSteps = WIZARD_STEPS_DEF.length
  const totalSkipped = totalSteps - pendingSteps.length
  const currentStep = pendingSteps[stepIdx]

  // Auto-focus + reset on step change
  useEffect(() => {
    if (!currentStep) return
    const isYesNo = YES_NO_STEPS.has(currentStep.relType)
    setShowInput(!isYesNo)
    setName(''); setGender(currentStep.defaultGender); setError('')
    const t = setTimeout(() => { if (!isYesNo) inputRef.current?.focus() }, 80)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx])

  // Auto-focus when input becomes visible after "Yes"
  useEffect(() => {
    if (showInput) { setTimeout(() => inputRef.current?.focus(), 60) }
  }, [showInput])

  useEffect(() => { if (pendingSteps.length === 0) onDone() }, [pendingSteps.length, onDone])

  const advance = useCallback(() => {
    if (stepIdx >= pendingSteps.length - 1) onDone()
    else setStepIdx(i => i + 1)
  }, [stepIdx, pendingSteps.length, onDone])

  // handleSkip: advance to next step. permanent=true saves to localStorage so it never shows again.
  const handleSkip = useCallback((permanent = false) => {
    if (permanent && currentStep) saveWizardDismissed(selfId, currentStep.relType)
    advance()
  }, [currentStep, selfId, advance])

  const handleSubmit = useCallback(async () => {
    if (!currentStep) return
    const trimmed = name.trim()
    // If user typed a negative word ("no", "nope", etc.) treat it as a permanent skip.
    if (SKIP_WORDS.has(trimmed.toLowerCase())) {
      handleSkip(true)
      return
    }
    if (!trimmed) { setError('Please enter a name.'); return }
    setIsSubmitting(true); setError('')
    try {
      await onQuickAdd(trimmed, gender, '', currentStep.relType, selfId)
      setJustAdded(true)
      setTimeout(() => { setJustAdded(false); advance() }, 380)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [currentStep, name, gender, selfId, onQuickAdd, advance, handleSkip])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) handleSubmit()
  }

  if (!currentStep) return null

  const globalStepNum = totalSkipped + stepIdx + 1

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(4px)' }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={stepIdx}
          initial={{ opacity: 0, scale: 0.88, y: 22 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -14 }}
          transition={{ duration: 0.28, type: 'spring', stiffness: 280, damping: 24 }}
          className="relative w-full max-w-sm mx-4"
        >
          {/* Skip entire wizard */}
          <button
            type="button" onClick={onDone}
            className="absolute -top-9 right-0 text-[11px] text-white/55 hover:text-white/85 transition-colors"
          >
            Skip guide ✕
          </button>

          <div className="rounded-3xl border border-white/10 bg-card shadow-2xl overflow-hidden">
            {/* Thin progress bar */}
            <div className="h-[3px] bg-muted/60">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${((globalStepNum - 1) / totalSteps) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              />
            </div>

            <div className="px-6 py-7">
              {/* Step dots + counter */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-1.5">
                  {WIZARD_STEPS_DEF.map((_, i) => {
                    const isPast = i < totalSkipped + stepIdx
                    const isCurrent = i === totalSkipped + stepIdx
                    return (
                      <div key={i} className={cn(
                        'rounded-full transition-all duration-300',
                        isCurrent ? 'h-2 w-7 bg-primary' : isPast ? 'h-2 w-2 bg-primary/50' : 'h-2 w-2 bg-muted-foreground/20',
                      )} />
                    )
                  })}
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {globalStepNum} / {totalSteps}
                </span>
              </div>

              {/* Question */}
              <div className="mb-6">
                <span className="text-4xl leading-none">{currentStep.emoji}</span>
                <h2 className="text-[22px] font-bold text-foreground mt-3 leading-tight">
                  {currentStep.question}
                </h2>
                <p className="text-[12px] text-muted-foreground mt-1.5">
                  Just a name — details can be added later.
                </p>
              </div>

              {/* Yes/No prompt — shown for spouse/child/sibling before the name input */}
              {!showInput ? (
                <div className="mt-5 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setShowInput(true)}
                    className="w-full rounded-xl py-3.5 text-[15px] font-bold bg-primary text-primary-foreground hover:brightness-105 transition-all active:scale-[0.98]"
                  >
                    Yes, add them →
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSkip(true)}
                    className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors py-1.5"
                  >
                    No, I don't have one
                  </button>
                </div>
              ) : (
                <>
                  {/* Input */}
                  <div className="space-y-3">
                    <input
                      ref={inputRef}
                      type="text"
                      value={name}
                      onChange={e => { setName(e.target.value); setError('') }}
                      onKeyDown={handleKeyDown}
                      placeholder={currentStep.placeholder}
                      autoComplete="off"
                      autoCorrect="off"
                      disabled={isSubmitting}
                      className={cn(
                        'w-full rounded-xl border bg-muted/40 px-4 py-3.5 text-[16px] font-medium placeholder:text-muted-foreground/40 outline-none transition-all',
                        'focus:border-primary/60 focus:bg-background/80 focus:ring-2 focus:ring-primary/20',
                        error ? 'border-destructive/60' : 'border-border/50',
                      )}
                    />

                    {/* Gender picker — only for spouse / child (unknown gender) */}
                    {(currentStep.relType === 'spouse' || currentStep.relType === 'child') && (
                      <div className="grid grid-cols-3 gap-2">
                        {(['male', 'female', 'other'] as const).map(g => (
                          <button key={g} type="button" onClick={() => setGender(g)}
                            className={cn(
                              'rounded-xl border py-2 text-[11px] font-semibold transition-all',
                              gender === g
                                ? 'border-primary/60 bg-primary/10 text-primary'
                                : 'border-border/40 bg-muted/30 text-muted-foreground hover:border-border/70',
                            )}>
                            {g === 'male' ? '♂ Male' : g === 'female' ? '♀ Female' : '⊙ Other'}
                          </button>
                        ))}
                      </div>
                    )}

                    {error && <p className="text-[11px] text-destructive">{error}</p>}
                  </div>

                  {/* CTA buttons */}
                  <div className="mt-5 space-y-2.5">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting || !name.trim()}
                      className={cn(
                        'w-full rounded-xl py-3.5 text-[15px] font-bold transition-all active:scale-[0.98]',
                        justAdded
                          ? 'bg-emerald-500 text-white'
                          : 'bg-primary text-primary-foreground hover:brightness-105',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                      )}
                    >
                      {isSubmitting ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          Adding…
                        </span>
                      ) : justAdded ? (
                        '✓ Added!'
                      ) : (
                        `Add ${currentStep.relType.charAt(0).toUpperCase() + currentStep.relType.slice(1)} →`
                      )}
                    </button>
                    <button
                      type="button" onClick={() => handleSkip(false)} disabled={isSubmitting}
                      className="w-full text-center text-[12px] text-muted-foreground hover:text-foreground transition-colors py-1.5"
                    >
                      {currentStep.skipLabel}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function HierarchicalTree({
  members,
  selfMemberId,
  selectedMemberId,
  onSelectMember,
  onAddRelative,
  onQuickAdd,
  onOpenProfile,
  onFindRelationship,
  onInviteNode,
  onClaimNode,
  onOpenMemberDetail,
  onDelete,
  forceWizard = false,
  isAdmin = false,
}: HierarchicalTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const velRef = useRef({ vx: 0, vy: 0 })
  const lastMouseRef = useRef({ x: 0, y: 0, t: 0 })
  const inertiaRaf = useRef<number>(0)
  const touchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null)
  // isUserInteracted: set true when user pans/zooms; suppresses auto-fit after that
  const isUserInteracted = useRef(false)

  // Wizard state — persisted in sessionStorage
  const [wizardDone, setWizardDone] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('fg_wizard_done') === '1'
  )

  // When parent forces the wizard open, clear the done state
  useEffect(() => {
    if (forceWizard) {
      setWizardDone(false)
      if (typeof window !== 'undefined') sessionStorage.removeItem('fg_wizard_done')
    }
  }, [forceWizard])
  const [showConfetti, setShowConfetti] = useState(false)

  const showWizard = !wizardDone &&
    !!selfMemberId &&
    !!onQuickAdd &&
    (forceWizard || WIZARD_STEPS_DEF.some(s => s.checkMissing(members, selfMemberId)))

  const handleWizardDone = useCallback(() => {
    setWizardDone(true)
    if (typeof window !== 'undefined') sessionStorage.setItem('fg_wizard_done', '1')
    if (members.length > 1) {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 1100)
    }
  }, [members.length])

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDimensions({ width, height })
    })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const enrichedMembers = useMemo(() =>
    selfMemberId ? enrichMembersWithDerivedEdges(members, selfMemberId) : members,
    [members, selfMemberId])

  const { nodes, ghosts, edges } = useMemo(
    () => buildLayout(enrichedMembers, selfMemberId),
    [enrichedMembers, selfMemberId],
  )

  const relationLabels = useMemo(() => {
    if (!selfMemberId) return new Map<string, string>()
    const map = new Map<string, string>()
    nodes.forEach(n => {
      if (n.id === selfMemberId) { map.set(n.id, 'You'); return }
      const label = computeRelationLabel(selfMemberId, n.id, enrichedMembers)
      if (label) map.set(n.id, label)
      // No fallback to n.member.relationship — that field is stored relative to the
      // original tree creator, not relative to the current viewer. Showing it would
      // display e.g. "spouse" on someone's Bhabhi from the viewer's perspective.
    })
    return map
  }, [nodes, selfMemberId, enrichedMembers])

  // Smooth pan+zoom animation helper
  const animateTo = useCallback((targetPan: { x: number; y: number }, targetZoom: number, duration = 420) => {
    cancelAnimationFrame(inertiaRaf.current)
    const startPan = { ...panRef.current }
    const startZoom = zoomRef.current
    const startTime = performance.now()
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    const tick = () => {
      const t = Math.min((performance.now() - startTime) / duration, 1)
      const e = easeOut(t)
      const px = startPan.x + (targetPan.x - startPan.x) * e
      const py = startPan.y + (targetPan.y - startPan.y) * e
      const k = startZoom + (targetZoom - startZoom) * e
      panRef.current = { x: px, y: py }; zoomRef.current = k
      setPan({ x: px, y: py }); setZoom(k)
      if (t < 1) inertiaRaf.current = requestAnimationFrame(tick)
    }
    inertiaRaf.current = requestAnimationFrame(tick)
  }, [])

  // Fit to screen — fits ALL nodes (used by Maximize2 button)
  const fitToScreen = useCallback(() => {
    if (nodes.length === 0 || dimensions.width <= 10) return
    const xs = nodes.map(n => n.x); const ys = nodes.map(n => n.y)
    const minX = Math.min(...xs) - NODE_W / 2 - 52
    const maxX = Math.max(...xs) + NODE_W / 2 + 52
    const minY = Math.min(...ys) - NODE_H / 2 - 52
    const maxY = Math.max(...ys) + NODE_H / 2 + 80
    const k = Math.max(
      0.3, // never shrink below 30% — for very large trees users can scroll/zoom manually
      Math.min(dimensions.width / (maxX - minX), dimensions.height / (maxY - minY), 1.15)
    )
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2
    const px = -cx * k
    const py = -cy * k
    animateTo({ x: px, y: py }, k)
  }, [nodes, dimensions, animateTo])

  // Fit to immediate family — only non-'other' nodes (immediate family core).
  // Used for initial load and the Home button. Min zoom 0.65 so text stays readable.
  const fitToImmediate = useCallback(() => {
    if (nodes.length === 0 || dimensions.width <= 10) return
    const coreNodes = nodes.filter(n => n.role !== 'other')
    const targetNodes = coreNodes.length > 0 ? coreNodes : nodes
    const xs = targetNodes.map(n => n.x); const ys = targetNodes.map(n => n.y)
    const minX = Math.min(...xs) - NODE_W / 2 - 64
    const maxX = Math.max(...xs) + NODE_W / 2 + 64
    const minY = Math.min(...ys) - NODE_H / 2 - 64
    const maxY = Math.max(...ys) + NODE_H / 2 + 96
    const k = Math.min(
      dimensions.width / (maxX - minX),
      dimensions.height / (maxY - minY),
      1.0, // never zoom in beyond 1× on initial load
    )
    const clampedK = Math.max(k, 0.65) // never go below 65% — keeps text readable
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2
    const px = -cx * clampedK
    const py = -cy * clampedK
    animateTo({ x: px, y: py }, clampedK)
  }, [nodes, dimensions, animateTo])

  // Auto-fit: runs on node/dimension changes until the user manually pans or zooms
  // Uses fitToImmediate so the initial view shows immediate family at a readable size
  useEffect(() => {
    if (isUserInteracted.current || nodes.length === 0 || dimensions.width <= 10) return
    const id = setTimeout(fitToImmediate, 60)
    return () => clearTimeout(id)
  }, [nodes.length, dimensions.width, dimensions.height, fitToImmediate])

  // Zoom helpers
  const clampZ = (k: number) => Math.max(0.2, Math.min(2.5, k))
  const applyZoom = useCallback((delta: number, cx: number, cy: number) => {
    // cx/cy are container-relative cursor coords. The canvas origin is at (w/2, h/2).
    // Correct: use offset from canvas origin so zoom pivots on the cursor in tree space.
    const ox = cx - dimensions.width / 2
    const oy = cy - dimensions.height / 2
    const k0 = zoomRef.current; const k1 = clampZ(k0 * (1 + delta))
    const px = panRef.current.x - (ox - panRef.current.x) * (k1 / k0 - 1)
    const py = panRef.current.y - (oy - panRef.current.y) * (k1 / k0 - 1)
    zoomRef.current = k1; panRef.current = { x: px, y: py }
    setZoom(k1); setPan({ x: px, y: py })
  }, [dimensions])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    isUserInteracted.current = true
    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return
    applyZoom(-e.deltaY * 0.001, e.clientX - rect.left, e.clientY - rect.top)
  }, [applyZoom])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    isUserInteracted.current = true
    isDragging.current = true
    dragStart.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y }
    lastMouseRef.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    velRef.current = { vx: 0, vy: 0 }
      ; (e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    const px = e.clientX - dragStart.current.x; const py = e.clientY - dragStart.current.y
    const now = performance.now(); const dt = now - lastMouseRef.current.t
    if (dt > 0) velRef.current = { vx: (e.clientX - lastMouseRef.current.x) / dt * 16, vy: (e.clientY - lastMouseRef.current.y) / dt * 16 }
    lastMouseRef.current = { x: e.clientX, y: e.clientY, t: now }
    panRef.current = { x: px, y: py }; setPan({ x: px, y: py })
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return; isDragging.current = false
    let { vx, vy } = velRef.current; const decay = 0.92
    const tick = () => {
      vx *= decay; vy *= decay; if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) return
      panRef.current = { x: panRef.current.x + vx, y: panRef.current.y + vy }
      setPan({ ...panRef.current }); inertiaRaf.current = requestAnimationFrame(tick)
    }
    inertiaRaf.current = requestAnimationFrame(tick)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) return
    const [a, b] = [e.touches[0], e.touches[1]]
    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return
    touchRef.current = {
      dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      midX: (a.clientX + b.clientX) / 2 - rect.left,
      midY: (a.clientY + b.clientY) / 2 - rect.top,
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !touchRef.current) return
    e.preventDefault()
    const [a, b] = [e.touches[0], e.touches[1]]
    const newDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    applyZoom((newDist - touchRef.current.dist) / touchRef.current.dist * 0.6, touchRef.current.midX, touchRef.current.midY)
    touchRef.current.dist = newDist
  }, [applyZoom])

  const handleTouchEnd = useCallback(() => { touchRef.current = null }, [])

  // Focus on a specific node — smoothly pan/zoom to centre it in the viewport
  const focusOnNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    const k = Math.max(zoomRef.current, 1.15)
    animateTo({ x: -node.x * k, y: -node.y * k }, k, 360)
  }, [nodes, animateTo])

  const handleSelectWithFocus = useCallback((id: string) => {
    onSelectMember(id)
    // Also open the member detail panel so a single tap/click is enough to view
    // a profile — users shouldn't need to find the hover-strip "View" button.
    onOpenMemberDetail?.(id)
    focusOnNode(id)
  }, [onSelectMember, onOpenMemberDetail, focusOnNode])

  const selfMember = selfMemberId ? members.find(m => m.id === selfMemberId) : undefined

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: isDragging.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Panning canvas (origin = viewport centre) ─────────────── */}
      <div
        style={{
          position: 'absolute',
          top: dimensions.height / 2,
          left: dimensions.width / 2,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        <EdgeLayer edges={edges} />

        <AnimatePresence>
          {nodes.map(node => (
            <TreeNodeCard
              key={node.id}
              node={node}
              isSelected={selectedMemberId === node.id}
              isSelf={node.id === selfMemberId}
              relationLabel={relationLabels.get(node.id) ?? ''}
              onSelect={handleSelectWithFocus}
              onAddRelative={onAddRelative}
              onOpenMemberDetail={onOpenMemberDetail ?? onOpenProfile}
              onFindRelationship={onFindRelationship}
              onInviteNode={onInviteNode}
              onClaimNode={onClaimNode}
              onDelete={onDelete}
              allMembers={enrichedMembers}
              isAdmin={isAdmin}
            />
          ))}
        </AnimatePresence>

        {/* Ghost slots — only shown after wizard exits */}
        {!showWizard && (
          <AnimatePresence>
            {ghosts.map(slot => (
              <GhostSlotCard key={slot.id} slot={slot} onAddRelative={onAddRelative} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── Speed Wizard overlay ─────────────────────────────────── */}
      {showWizard && selfMember && onQuickAdd && (
        <SpeedWizard
          selfId={selfMemberId!}
          selfName={selfMember.name}
          members={members}
          onQuickAdd={onQuickAdd}
          onDone={handleWizardDone}
        />
      )}

      {showConfetti && <ConfettiBurst />}

      {/* ── Progress pill (top-right, only after wizard) ─────────── */}
      {selfMemberId && !showWizard && (
        <div className="absolute top-4 right-4 z-40 pointer-events-none">
          <ProgressPill members={members} selfId={selfMemberId} />
        </div>
      )}

      {/* ── Zoom controls (bottom-right) ─────────────────────────── */}
      <div
        className="absolute right-4 z-40 flex flex-col gap-1.5 pointer-events-auto"
        style={{ bottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))' }}
      >
        {([
          { icon: ZoomIn, action: () => applyZoom(0.25, dimensions.width / 2, dimensions.height / 2), title: 'Zoom in' },
          { icon: ZoomOut, action: () => applyZoom(-0.25, dimensions.width / 2, dimensions.height / 2), title: 'Zoom out' },
          { icon: Maximize2, action: fitToScreen, title: 'Fit all members' },
          { icon: Home, action: () => { isUserInteracted.current = false; fitToImmediate() }, title: 'Recentre on my family' },
        ] as const).map(({ icon: Icon, action, title }) => (
          <button key={title} type="button" onClick={action} title={title}
            className="h-8 w-8 rounded-lg border border-border/55 bg-card/90 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors shadow-sm">
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {/* ── Restart guide link (bottom-left, only when wizard is done but key nodes missing) */}
      {wizardDone && selfMemberId && WIZARD_STEPS_DEF.some(s => s.checkMissing(members, selfMemberId)) && (
        <button
          type="button"
          onClick={() => { sessionStorage.removeItem('fg_wizard_done'); setWizardDone(false) }}
          className="absolute bottom-4 left-4 z-40 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Restart guide
        </button>
      )}
    </div>
  )
}
