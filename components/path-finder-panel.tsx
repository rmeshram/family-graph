'use client'

import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FamilyMember } from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
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
}: PathFinderPanelProps) {
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  )

  const fromMember = members.find((m) => m.id === pfFrom)
  const toMember = members.find((m) => m.id === pfTo)

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
                background: 'color-mix(in oklab, var(--maternal) 12%, transparent)',
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
              {/* Result header */}
              <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p
                  className="text-[10px] uppercase tracking-widest font-semibold"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Connection Found
                </p>
                <div className="flex items-end gap-2 mt-1">
                  <span className="text-[28px] font-black leading-none" style={{ color: 'var(--foreground)' }}>
                    {pathSequence.length - 1}
                  </span>
                  <span className="text-[13px] font-medium mb-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {pathSequence.length - 1 === 1 ? 'degree' : 'degrees'} of separation
                  </span>
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  {pathSequence.length === 2 && '✦ Direct family connection — one step apart'}
                  {pathSequence.length === 3 && '✦ Connected through 1 shared relative'}
                  {pathSequence.length >= 4 &&
                    `✦ ${pathSequence.length - 2} intermediate ${pathSequence.length - 2 === 1 ? 'person' : 'people'} in between`}
                </p>
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
                              ? `color-mix(in oklab, ${col} 18%, var(--surface-card))`
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
                      {idx < pathSequence.length - 1 && (
                        <div className="flex items-center pl-[22px] py-0.5">
                          <div className="w-px h-3" style={{ background: 'var(--border)', marginLeft: 2 }} />
                        </div>
                      )}
                    </div>
                  )
                })}
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
