/**
 * Phase 4 — Family Graph Validation Report
 * npx tsx scripts/run-family-validation.ts
 *
 * Runs the complete pipeline:
 *   Phase 1 → normalizeFamilyRelationships
 *   Phase 2 → resolvePersonIdentities
 *   Phase 3+4 → buildFamilyGraph (couple-anchor graph + layout)
 *   Phase 5 → assertCanonicalGraph (safety guard inside buildFamilyGraph)
 *
 * Then prints the human-readable FAMILY GRAPH VALIDATION REPORT to stdout
 * and writes FAMILY_VALIDATION_REPORT.json for machine consumption.
 */

import { sampleFamilyMembers } from '../lib/sample-data'
import { normalizeFamilyRelationships } from '../lib/family-relationship-normalizer'
import { resolvePersonIdentities } from '../lib/person-identity-resolver'
import { buildFamilyGraph, assertCanonicalGraph } from '../lib/graph-layout-engine'
import { FamilyGraphIntegrityError } from '../lib/graph-integrity-error'
import fs from 'fs'
import path from 'path'

// ─── Run the pipeline ─────────────────────────────────────────────────────────

console.log('Running Family Graph Integrity Pipeline…\n')

// Phase 1
const p1 = normalizeFamilyRelationships(sampleFamilyMembers)

// Phase 2
const p2 = resolvePersonIdentities(p1.members)

// Phases 3+4+5 (buildFamilyGraph calls assertCanonicalGraph internally)
let graphResult: ReturnType<typeof buildFamilyGraph> | null = null
let integrityError: FamilyGraphIntegrityError | null = null

try {
  graphResult = buildFamilyGraph(sampleFamilyMembers)
} catch (e) {
  if (e instanceof FamilyGraphIntegrityError) {
    integrityError = e
  } else {
    throw e
  }
}

// ─── Build the report ─────────────────────────────────────────────────────────

const lines: string[] = []
const w = (s = '') => lines.push(s)

w('╔══════════════════════════════════════════════════════════════════════╗')
w('║           FAMILY GRAPH VALIDATION REPORT                            ║')
w('╚══════════════════════════════════════════════════════════════════════╝')
w()
w(`  Members processed         : ${p1.members.length}`)
w(`  After identity resolution : ${p2.members.length}`)
w()

// ── Phase 1 Auto-fixes ────────────────────────────────────────────────────────

w('──────────────────────────────────────────────────────────────────────')
w('  AUTO-FIXES APPLIED (Phase 1)')
w('──────────────────────────────────────────────────────────────────────')

if (p1.fixes.length === 0) {
  w('  ✓  No fixes required — data is clean.')
} else {
  // Group by issue type
  const byType = new Map<string, typeof p1.fixes>()
  for (const f of p1.fixes) {
    // Normalise key: take everything before ' —' or first space
    const key = f.issue.split(/\s+—\s+| /)[0]
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key)!.push(f)
  }
  for (const [type, fixes] of byType) {
    const label = formatFixLabel(type, fixes.length)
    w(`  ✓  ${label}`)
    for (const f of fixes) {
      w(`       • ${f.memberName} (${f.memberId})  [confidence ${f.confidence_score}%]`)
      w(`         old: ${JSON.stringify(f.old_value)}`)
      w(`         new: ${JSON.stringify(f.new_value)}`)
    }
  }
}
w()

// ── Phase 2 Identity Resolution ───────────────────────────────────────────────

w('──────────────────────────────────────────────────────────────────────')
w('  IDENTITY RESOLUTION (Phase 2)')
w('──────────────────────────────────────────────────────────────────────')

if (p2.resolvedIdentities.length === 0 && p2.potentialDuplicates.filter(d => !d.autoMerged).length === 0) {
  w('  ✓  No duplicate people detected.')
} else {
  if (p2.resolvedIdentities.length > 0) {
    w(`  ✓  Auto-merged ${p2.resolvedIdentities.length} duplicate pair(s):`)
    for (const ri of p2.resolvedIdentities) {
      w(`       • Canonical: "${ri.canonicalName}" (${ri.canonicalId})`)
      w(`         Merged in: ${ri.mergedFromIds.map(id => `"${ri.aliases.join('", "')}"`).join(', ')}`)
      w(`         Reasons  : ${ri.matchReasons.join(', ')}  [${ri.confidence}%]`)
    }
    w()
  }

  const unmerged = p2.potentialDuplicates.filter(d => !d.autoMerged)
  if (unmerged.length > 0) {
    w(`  ⚠  ${unmerged.length} possible duplicate(s) need human confirmation:`)
    for (const d of unmerged) {
      w(`       • "${d.nameA}" (${d.idA})`)
      w(`         "${d.nameB}" (${d.idB})`)
      w(`         Reasons: ${d.matchReasons.join(', ')}  [${d.confidence}%]`)
    }
  }
}
w()

// ── Phase 1 Warnings ──────────────────────────────────────────────────────────

const allWarnings = [...p1.errors, ...p1.warnings, ...p1.info]

if (allWarnings.length > 0) {
  w('──────────────────────────────────────────────────────────────────────')
  w('  RELATIONSHIP WARNINGS (Phase 1)')
  w('──────────────────────────────────────────────────────────────────────')
  for (const issue of allWarnings) {
    const icon = issue.severity === 'error' ? '  ❌' : issue.severity === 'warning' ? '  ⚠ ' : '  ℹ '
    w(`${icon} [${issue.id}] ${issue.type}`)
    w(`      ${issue.description}`)
    w(`      Affected: ${issue.affectedIds.join(', ')}`)
    w()
  }
}

// ── Phase 5 Integrity Guard ───────────────────────────────────────────────────

w('──────────────────────────────────────────────────────────────────────')
w('  GRAPH INTEGRITY GUARD (Phase 5)')
w('──────────────────────────────────────────────────────────────────────')

if (integrityError) {
  w('  ❌  LAYOUT BLOCKED — hard integrity violations detected:')
  for (const v of integrityError.violations) {
    w(`       • [${v.type}] ${v.description}`)
  }
  w()
  w('  ⛔  buildFamilyGraph() threw FamilyGraphIntegrityError.')
  w('      Resolve the above errors before the layout engine will accept this data.')
} else if (graphResult) {
  w('  ✓  Graph passed all integrity checks.')
  w()

  // ── Phase 3 Graph stats ──────────────────────────────────────────────────
  w('──────────────────────────────────────────────────────────────────────')
  w('  CANONICAL GRAPH (Phase 3)')
  w('──────────────────────────────────────────────────────────────────────')
  const g = graphResult.graph
  const memberNodes = g.nodes.filter(n => n.type === 'member')
  const coupleAnchors = g.nodes.filter(n => n.type === 'couple_anchor')
  const phNodes = g.nodes.filter(n => n.isPlaceholder)
  const pcEdges = g.edges.filter(e => e.type === 'parent_child')
  const directEdges = pcEdges.filter(e => !e.source.startsWith('couple:'))

  w(`  Graph nodes : ${g.nodes.length}`)
  w(`    ├─ Members         : ${memberNodes.length}`)
  w(`    ├─ Couple anchors  : ${coupleAnchors.length}`)
  w(`    └─ Placeholders    : ${phNodes.length}`)
  w(`  Graph edges : ${g.edges.length}`)
  w(`    ├─ Spouse          : ${g.edges.filter(e => e.type === 'spouse').length}`)
  w(`    ├─ Parent-child    : ${pcEdges.length}`)
  w(`    │    └─ direct (not via couple): ${directEdges.length}  ← must be 0`)
  w(`    └─ Couple-link     : ${g.edges.filter(e => e.type === 'couple_link').length}`)
  w(`  Couple units         : ${g.couples.length}`)
  w(`  Ancestor roots       : ${g.ancestors.length}`)
  w()

  if (directEdges.length > 0) {
    w('  ❌  PROBLEM: Some parent-child edges bypass couple anchors:')
    for (const e of directEdges) w(`       ${e.source} → ${e.target}`)
  } else {
    w('  ✓  All parent-child edges route through couple anchors.')
  }
  w()

  // ── Phase 4 Layout summary ───────────────────────────────────────────────
  w('──────────────────────────────────────────────────────────────────────')
  w('  LAYOUT SUMMARY (Phase 4)')
  w('──────────────────────────────────────────────────────────────────────')
  const positions = graphResult.layout.node_positions
  const genMap = new Map<number, number>()
  for (const np of positions) {
    const node = g.nodes.find(n => n.id === np.nodeId)
    if (!node || node.type !== 'member') continue
    genMap.set(node.generation, (genMap.get(node.generation) ?? 0) + 1)
  }
  w(`  Positioned nodes : ${positions.length}`)
  for (const [gen, count] of [...genMap.entries()].sort(([a], [b]) => a - b)) {
    w(`    Generation ${gen} (y=${gen * 300}px) : ${count} member(s)`)
  }
}

w()
w('╔══════════════════════════════════════════════════════════════════════╗')
w('║  SUMMARY                                                             ║')
w('╚══════════════════════════════════════════════════════════════════════╝')
w(`  Phase 1 — Fixes applied       : ${p1.fixes.length}`)
w(`  Phase 1 — Errors flagged      : ${p1.errors.length}`)
w(`  Phase 1 — Warnings            : ${p1.warnings.length}`)
w(`  Phase 2 — Auto-merged pairs   : ${p2.resolvedIdentities.length}`)
w(`  Phase 2 — Review-needed pairs : ${p2.potentialDuplicates.filter(d => !d.autoMerged).length}`)
w(`  Phase 5 — Integrity status    : ${integrityError ? '❌ BLOCKED' : '✓ PASSED'}`)
w(`  Pipeline status                : ${integrityError ? '❌ Layout blocked — fix errors above' : '✓ All phases completed successfully'}`)
w()

// ── Print & save ──────────────────────────────────────────────────────────────

console.log(lines.join('\n'))

const reportJson = {
  meta: {
    generatedAt: new Date().toISOString(),
    membersProcessed: p1.members.length,
    membersAfterIdentityResolution: p2.members.length,
    pipelineStatus: integrityError ? 'blocked' : 'success',
  },
  phase1: {
    fixes: p1.fixes,
    errors: p1.errors,
    warnings: p1.warnings,
    info: p1.info,
  },
  phase2: {
    resolvedIdentities: p2.resolvedIdentities,
    potentialDuplicates: p2.potentialDuplicates,
  },
  phase5: {
    passed: !integrityError,
    violations: integrityError?.violations ?? [],
  },
  ...(graphResult ? {
    phase3: {
      nodeCount: graphResult.graph.nodes.length,
      edgeCount: graphResult.graph.edges.length,
      coupleCount: graphResult.graph.couples.length,
      ancestorCount: graphResult.graph.ancestors.length,
      directParentChildEdges: graphResult.graph.edges.filter(
        e => e.type === 'parent_child' && !e.source.startsWith('couple:')
      ).length,
    },
    phase4: {
      positionedNodes: graphResult.layout.node_positions.length,
    },
  } : {}),
}

const outPath = path.join(process.cwd(), 'FAMILY_VALIDATION_REPORT.json')
fs.writeFileSync(outPath, JSON.stringify(reportJson, null, 2))
console.log(`Full JSON written to: ${outPath}`)

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatFixLabel(type: string, count: number): string {
  const labels: Record<string, string> = {
    duplicate_parent_id: 'Removed duplicate parent IDs',
    duplicate_spouse_id: 'Removed duplicate spouse IDs',
    unidirectional_spouse: 'Added missing spouse reverse links',
    self_parent: 'Removed self-parent references',
    self_spouse: 'Removed self-spouse references',
    dangling_parent_ref: 'Removed dangling parent references',
    dangling_spouse_ref: 'Removed dangling spouse references',
    marital_status_contradiction: 'Fixed marital status contradictions',
    generation_value_corrected: 'Corrected generation values',
  }
  const label = labels[type] ?? type.replace(/_/g, ' ')
  return `${label}: ${count}`
}
