'use client'

/**
 * PathFinderPanel — Relationship Intelligence Card
 *
 * Converts the raw BFS graph path between two people into a rich semantic
 * relationship card:
 *  • Canonical relationship label + Indian cultural term (devanagari)
 *  • Human-readable chain sentence ("Sanjay is your father's brother's son")
 *  • Annotated graph traversal path with step labels per hop
 *  • Metadata chips (family side, blood/marriage, generation, cousin degree)
 *  • Confidence indicator
 *
 * Graph highlighting (dim non-path nodes, pulsing ring on path nodes) is
 * driven by `pathSequence` → `pfPathNodes` set on the dashboard.
 */

import { useMemo, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, ArrowRight, Share2, Check } from 'lucide-react'
import { FamilyMember } from '@/lib/types'
import { computeSemanticRelationship } from '@/lib/relation-engine'
import { lookupIndianTerm } from '@/lib/cultural-terms'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function confidenceTier(score: number): { label: string; color: string } {
  if (score >= 0.95) return { label: 'Direct', color: '#22d3ee' }
  if (score >= 0.88) return { label: 'High', color: '#4ade80' }
  if (score >= 0.72) return { label: 'Medium', color: '#facc15' }
  return { label: 'Approx', color: '#f97316' }
}

function genLabel(delta: number): string {
  if (delta === 0) return 'Same generation'
  return delta > 0 ? `${delta} gen older` : `${Math.abs(delta)} gen younger`
}

function edgeArrow(edgeType: string): string {
  if (edgeType === 'UP') return '↑'
  if (edgeType === 'DOWN') return '↓'
  if (edgeType === 'SPOUSE') return '↔'
  return '·'
}

function getMemberColor(m: FamilyMember): string {
  const rel = (m.relationship ?? '').toLowerCase()
  if (rel.includes('spouse') || rel.includes('wife') || rel.includes('husband') || rel.includes('in-law'))
    return 'var(--marriage)'
  if (rel.includes('maternal') || rel.includes('mother'))
    return 'var(--maternal)'
  if (rel.includes('paternal') || rel.includes('father') || rel.includes('grandfather'))
    return 'var(--paternal)'
  return 'var(--primary)'
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PathFinderPanelProps {
  members: FamilyMember[]
  pfFrom: string
  pfTo: string
  pfFromSearch: string
  pfToSearch: string
  pathSequence: string[]
  onPfFromChange: (id: string) => void
  onPfToChange: (id: string) => void
  onPfFromSearchChange: (s: string) => void
  onPfToSearchChange: (s: string) => void
  onSelectMember?: (id: string) => void
  onClose: () => void
  /** If provided and pfFrom matches, shows "you" in chain sentence */
  selfMemberId?: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PathFinderPanel({
  members,
  pfFrom,
  pfTo,
  pfFromSearch,
  pfToSearch,
  pathSequence,
  onPfFromChange,
  onPfToChange,
  onPfFromSearchChange,
  onPfToSearchChange,
  onSelectMember,
  onClose,
  selfMemberId,
}: PathFinderPanelProps) {
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  )

  const fromMember = members.find((m) => m.id === pfFrom)
  const toMember = members.find((m) => m.id === pfTo)

  // ── Semantic intelligence ──────────────────────────────────────────────
  const semanticResult = useMemo(() => {
    if (!pfFrom || !pfTo || pfFrom === pfTo || pathSequence.length < 2) return null
    const fromLabel = pfFrom === selfMemberId ? 'your' : `${fromMember?.name?.split(' ')[0] ?? ''}'s`
    return computeSemanticRelationship(pfFrom, pfTo, members, fromLabel, selfMemberId)
  }, [pfFrom, pfTo, members, pathSequence.length, selfMemberId, fromMember])

  const indianTerm = useMemo(() => {
    if (!semanticResult?.found || !toMember) return null
    return lookupIndianTerm(semanticResult.canonicalLabel, toMember.gender)
  }, [semanticResult, toMember])

  const conf = semanticResult ? confidenceTier(semanticResult.confidence) : null

  const [shareCopied, setShareCopied] = useState(false)

  const handleWhatsAppShare = useCallback(() => {
    if (!fromMember || !toMember) return
    const fromName = fromMember.name.split(' ')[0]
    const toName = toMember.name
    const relLabel = semanticResult?.found ? semanticResult.canonicalLabel : `${pathSequence.length - 1}-step relative`
    const sentence = semanticResult?.found ? `\n"${semanticResult.chainSentence}"` : ''
    const hops = pathSequence.length > 2 ? `\nConnected through ${pathSequence.length - 2} shared relative${pathSequence.length - 2 !== 1 ? 's' : ''}.` : ''
    const text = `🌳 Did you know?\n\n*${fromName}* and *${toName}* are *${relLabel}*!${sentence}${hops}\n\nDiscover your family connections at outverse.in`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }, [fromMember, toMember, semanticResult, pathSequence.length])

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--surface-header)' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-5 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between">
          <div>
            <p
              className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Family Graph
            </p>
            <h2 className="text-[17px] font-bold mt-0.5" style={{ color: 'var(--foreground)' }}>
              Find Relationship
            </h2>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              Discover how any two people in your family are connected — path traces through the graph in real time.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 ml-3 w-7 h-7 rounded-full border grid place-items-center text-[14px] transition-opacity hover:opacity-70"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">

        {/* FROM picker */}
        <div>
          <label
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold mb-2"
            style={{ color: 'var(--primary)' }}
          >
            <span
              className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-black"
              style={{ background: 'var(--primary)', color: 'white' }}
            >
              A
            </span>
            From
          </label>

          {fromMember ? (
            <div
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
              style={{ background: 'var(--glow-primary)', borderColor: 'var(--primary)' }}
            >
              <span
                className="w-8 h-8 rounded-full shrink-0 grid place-items-center text-[11px] font-bold"
                style={{ background: getMemberColor(fromMember), color: 'white' }}
              >
                {getInitials(fromMember.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                  {fromMember.name}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                  {fromMember.relationship ?? 'family member'}
                </div>
              </div>
              <button
                onClick={() => { onPfFromChange(''); onPfFromSearchChange('') }}
                className="text-[12px] opacity-50 hover:opacity-100 ml-1"
                style={{ color: 'var(--foreground)' }}
              >
                ×
              </button>
            </div>
          ) : (
            <div>
              <input
                autoComplete="off"
                placeholder="Search by name…"
                value={pfFromSearch}
                onChange={(e) => onPfFromSearchChange(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-[13px] bg-transparent focus:outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
              {pfFromSearch.length >= 1 && (
                <div
                  className="mt-1.5 rounded-xl border overflow-hidden"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-card)' }}
                >
                  {sortedMembers
                    .filter(
                      (m) =>
                        m.name.toLowerCase().includes(pfFromSearch.toLowerCase()) && m.id !== pfTo,
                    )
                    .slice(0, 7)
                    .map((m, i, arr) => (
                      <button
                        key={m.id}
                        onClick={() => { onPfFromChange(m.id); onPfFromSearchChange(m.name) }}
                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 hover:opacity-80 transition-opacity"
                        style={{
                          borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <span
                          className="w-7 h-7 rounded-full shrink-0 grid place-items-center text-[10px] font-bold"
                          style={{ background: getMemberColor(m), color: 'white' }}
                        >
                          {getInitials(m.name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-[12px] font-semibold truncate"
                            style={{ color: 'var(--foreground)' }}
                          >
                            {m.name}
                          </div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                            {m.relationship ?? 'family member'}
                          </div>
                        </div>
                      </button>
                    ))}
                  {sortedMembers.filter(
                    (m) =>
                      m.name.toLowerCase().includes(pfFromSearch.toLowerCase()) && m.id !== pfTo,
                  ).length === 0 && (
                      <div className="px-3 py-3 text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
                        No matches found
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Swap button */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <button
            onClick={() => {
              const tf = pfFrom, tfs = pfFromSearch
              onPfFromChange(pfTo); onPfFromSearchChange(pfToSearch)
              onPfToChange(tf); onPfToSearchChange(tfs)
            }}
            className="w-8 h-8 rounded-full border grid place-items-center text-[16px] transition-all hover:scale-110"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--muted-foreground)',
              background: 'var(--muted)',
            }}
            title="Swap From ↔ To"
          >
            ⇅
          </button>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* TO picker */}
        <div>
          <label
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold mb-2"
            style={{ color: 'var(--maternal)' }}
          >
            <span
              className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-black"
              style={{ background: 'var(--maternal)', color: 'white' }}
            >
              B
            </span>
            To
          </label>

          {toMember ? (
            <div
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
              style={{
                background: 'color-mix(in srgb, var(--maternal) 12%, transparent)',
                borderColor: 'var(--maternal)',
              }}
            >
              <span
                className="w-8 h-8 rounded-full shrink-0 grid place-items-center text-[11px] font-bold"
                style={{ background: getMemberColor(toMember), color: 'white' }}
              >
                {getInitials(toMember.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                  {toMember.name}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                  {toMember.relationship ?? 'family member'}
                </div>
              </div>
              <button
                onClick={() => { onPfToChange(''); onPfToSearchChange('') }}
                className="text-[12px] opacity-50 hover:opacity-100 ml-1"
                style={{ color: 'var(--foreground)' }}
              >
                ×
              </button>
            </div>
          ) : (
            <div>
              <input
                autoComplete="off"
                placeholder="Search by name…"
                value={pfToSearch}
                onChange={(e) => onPfToSearchChange(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-[13px] bg-transparent focus:outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
              {pfToSearch.length >= 1 && (
                <div
                  className="mt-1.5 rounded-xl border overflow-hidden"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-card)' }}
                >
                  {sortedMembers
                    .filter(
                      (m) =>
                        m.name.toLowerCase().includes(pfToSearch.toLowerCase()) && m.id !== pfFrom,
                    )
                    .slice(0, 7)
                    .map((m, i, arr) => (
                      <button
                        key={m.id}
                        onClick={() => { onPfToChange(m.id); onPfToSearchChange(m.name) }}
                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 hover:opacity-80 transition-opacity"
                        style={{
                          borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <span
                          className="w-7 h-7 rounded-full shrink-0 grid place-items-center text-[10px] font-bold"
                          style={{ background: getMemberColor(m), color: 'white' }}
                        >
                          {getInitials(m.name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-[12px] font-semibold truncate"
                            style={{ color: 'var(--foreground)' }}
                          >
                            {m.name}
                          </div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                            {m.relationship ?? 'family member'}
                          </div>
                        </div>
                      </button>
                    ))}
                  {sortedMembers.filter(
                    (m) =>
                      m.name.toLowerCase().includes(pfToSearch.toLowerCase()) && m.id !== pfFrom,
                  ).length === 0 && (
                      <div className="px-3 py-3 text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
                        No matches found
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Result chain / empty states ─────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {pfFrom && pfTo && pathSequence.length > 1 && (
            <motion.div
              key="found"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: 'var(--primary)', background: 'var(--glow-primary)' }}
            >
              {/* ── Relationship Intelligence header ── */}
              <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--muted-foreground)' }}>
                  Connection Found
                </p>

                {/* Canonical relationship label */}
                {semanticResult?.found ? (
                  <>
                    <div className="mt-1.5 mb-0.5">
                      <span className="text-[22px] font-black leading-tight" style={{ color: 'var(--foreground)' }}>
                        {semanticResult.canonicalLabel}
                      </span>
                      {indianTerm && (
                        <span className="ml-2.5 text-[13px] font-semibold" style={{ color: 'var(--primary)' }}>
                          {indianTerm.term}
                          {indianTerm.devanagari && (
                            <span className="ml-1.5 font-normal" style={{ color: 'var(--muted-foreground)', fontFamily: 'serif' }}>
                              {indianTerm.devanagari}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Chain sentence */}
                    <p className="text-[11px] italic mt-0.5 leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                      &ldquo;{semanticResult.chainSentence}&rdquo;
                    </p>

                    {/* Semantic chain breadcrumb */}
                    {semanticResult.semanticChain.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-2">
                        {semanticResult.semanticChain.map((step, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: 'var(--glow-primary)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' }}
                            >
                              {step}
                            </span>
                            {i < semanticResult.semanticChain.length - 1 && (
                              <span style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>›</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Metadata chips */}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {semanticResult.metadata.side && (
                        <span
                          className="text-[9px] font-semibold px-2 py-0.5 rounded-full border"
                          style={{
                            color: semanticResult.metadata.side === 'paternal' ? 'var(--paternal)' : semanticResult.metadata.side === 'maternal' ? 'var(--maternal)' : 'var(--marriage)',
                            borderColor: 'currentColor',
                            background: 'color-mix(in srgb, currentColor 12%, transparent)',
                          }}
                        >
                          {semanticResult.metadata.side === 'paternal' ? '⊕ Paternal' : semanticResult.metadata.side === 'maternal' ? '⊗ Maternal' : '⊙ Spouse'}
                        </span>
                      )}
                      <span
                        className="text-[9px] font-semibold px-2 py-0.5 rounded-full border"
                        style={{ color: semanticResult.metadata.type === 'blood' ? '#4ade80' : '#f97316', borderColor: 'currentColor', background: 'color-mix(in srgb, currentColor 12%, transparent)' }}
                      >
                        {semanticResult.metadata.type === 'blood' ? '❤ Blood' : '💍 Marriage'}
                      </span>
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)', background: 'var(--muted)' }}>
                        {genLabel(semanticResult.metadata.generationDelta)}
                      </span>
                      {semanticResult.metadata.cousinDegree !== null && (
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: '#a78bfa', borderColor: 'currentColor', background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
                          {semanticResult.metadata.cousinDegree === 1 ? '1st' : semanticResult.metadata.cousinDegree === 2 ? '2nd' : `${semanticResult.metadata.cousinDegree}th`} Cousin
                          {semanticResult.metadata.removedLevel ? ` ·${semanticResult.metadata.removedLevel}× removed` : ''}
                        </span>
                      )}
                    </div>

                    {/* Confidence bar */}
                    {conf && (
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'var(--muted-foreground)' }}>Confidence</span>
                          <span className="text-[9px] font-bold" style={{ color: conf.color }}>{conf.label} · {Math.round(semanticResult.confidence * 100)}%</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${semanticResult.confidence * 100}%`, background: conf.color }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Fallback: degrees of separation (shown while semantic result loads) */
                  <>
                    <div className="flex items-end gap-2 mt-1">
                      <span className="text-[28px] font-black leading-none" style={{ color: 'var(--foreground)' }}>{pathSequence.length - 1}</span>
                      <span className="text-[13px] font-medium mb-0.5" style={{ color: 'var(--muted-foreground)' }}>
                        {pathSequence.length - 1 === 1 ? 'degree' : 'degrees'} of separation
                      </span>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                      {pathSequence.length === 2 && '✦ Direct family connection'}
                      {pathSequence.length === 3 && '✦ Connected through 1 shared relative'}
                      {pathSequence.length >= 4 && `✦ ${pathSequence.length - 2} people in between`}
                    </p>
                  </>
                )}
              </div>

              {/* Path chain — each node tappable */}
              <div className="p-3 space-y-1">
                {pathSequence.map((id, idx) => {
                  const m = members.find((x) => x.id === id)
                  if (!m) return null
                  const col = getMemberColor(m)
                  const isStart = idx === 0
                  const isEnd = idx === pathSequence.length - 1
                  return (
                    <div key={id}>
                      <button
                        onClick={() => onSelectMember?.(id)}
                        className="w-full text-left flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:scale-[1.01]"
                        style={{
                          background:
                            isStart || isEnd
                              ? `color-mix(in srgb, ${col} 18%, var(--surface-card))`
                              : 'var(--muted)',
                          border: `1px solid ${isStart || isEnd ? col : 'var(--border)'}`,
                        }}
                      >
                        <span
                          className="w-9 h-9 rounded-full shrink-0 grid place-items-center text-[12px] font-bold shadow"
                          style={{ background: col, color: 'white' }}
                        >
                          {getInitials(m.name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-[13px] font-bold truncate"
                              style={{ color: 'var(--foreground)' }}
                            >
                              {m.name}
                            </span>
                            {isStart && (
                              <span
                                className="shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black tracking-wide"
                                style={{ background: 'var(--primary)', color: 'white' }}
                              >
                                FROM
                              </span>
                            )}
                            {isEnd && (
                              <span
                                className="shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black tracking-wide"
                                style={{ background: col, color: 'white' }}
                              >
                                TO
                              </span>
                            )}
                          </div>
                          <div
                            className="text-[10px] truncate mt-0.5"
                            style={{ color: 'var(--muted-foreground)' }}
                          >
                            {m.relationship ?? 'family member'}
                            {m.currentPlace ? ` · ${m.currentPlace}` : ''}
                          </div>
                        </div>
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                          tap →
                        </span>
                      </button>
                      {idx < pathSequence.length - 1 && (() => {
                        const nextId = pathSequence[idx + 1]
                        const nextNode = semanticResult?.pathWithLabels.find(n => n.member.id === nextId)
                        return (
                          <div className="flex items-center pl-[22px] py-0.5 gap-1.5">
                            <div className="w-px h-4 shrink-0" style={{ background: 'var(--border)', marginLeft: 2 }} />
                            {nextNode && nextNode.edgeType !== 'START' && (
                              <span className="flex items-center gap-1">
                                <span className="text-[11px] font-bold w-3" style={{ color: 'var(--primary)' }}>
                                  {edgeArrow(nextNode.edgeType)}
                                </span>
                                <span className="text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>
                                  {nextNode.stepLabel}
                                </span>
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>

              {/* Share on WhatsApp */}
              <div className="px-3 pb-2">
                <button
                  onClick={handleWhatsAppShare}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-semibold border transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{
                    borderColor: 'rgba(37,211,102,0.4)',
                    background: 'rgba(37,211,102,0.08)',
                    color: 'rgb(37,211,102)',
                  }}
                >
                  {shareCopied
                    ? <><Check className="h-3.5 w-3.5" /> Opening WhatsApp…</>
                    : <><Share2 className="h-3.5 w-3.5" /> Share on WhatsApp</>
                  }
                </button>
              </div>

              {/* Clear */}
              <div className="px-3 pb-3">
                <button
                  onClick={() => {
                    onPfFromChange('')
                    onPfFromSearchChange('')
                    onPfToChange('')
                    onPfToSearchChange('')
                  }}
                  className="w-full py-1.5 rounded-xl text-[11px] border transition-opacity hover:opacity-70"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--muted-foreground)',
                    background: 'var(--muted)',
                  }}
                >
                  Clear &amp; start over
                </button>
              </div>
            </motion.div>
          )}

          {pfFrom && pfTo && pathSequence.length === 0 && (
            <motion.div
              key="notfound"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border p-5 text-center"
              style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
            >
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>
                No path found
              </p>
              <p
                className="text-[11px] mt-1.5 leading-relaxed"
                style={{ color: 'var(--muted-foreground)' }}
              >
                These two people aren&apos;t connected yet. Try adding more family members or linking family trees.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tip */}
        {(!pfFrom || !pfTo) && (
          <div className="rounded-xl p-3.5" style={{ background: 'var(--muted)' }}>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              💡 <strong style={{ color: 'var(--foreground)' }}>Tip:</strong> You can also{' '}
              <strong style={{ color: 'var(--foreground)' }}>shift-click</strong> any two people directly
              on the canvas to instantly trace their connection path.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
