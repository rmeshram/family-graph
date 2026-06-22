/**
 * Runner: Genealogy Graph Repair & Layout Engine
 * npx tsx scripts/run-graph-layout.ts
 */

import { sampleFamilyMembers } from '../lib/sample-data'
import { buildFamilyGraph, formatGraphReport } from '../lib/graph-layout-engine'
import fs from 'fs'
import path from 'path'

const result = buildFamilyGraph(sampleFamilyMembers)

// ── Console report ────────────────────────────────────────────────────────────
console.log(formatGraphReport(result))

// ── JSON output ───────────────────────────────────────────────────────────────
// Write the full machine-readable result (omit cleaned_members blob for readability;
// import buildFamilyGraph() directly to access cleaned_members at runtime).

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    totalMembers: result.cleaned_members.length,
    graphNodes: result.graph.nodes.length,
    graphEdges: result.graph.edges.length,
    ancestors: result.graph.ancestors.length,
    couples: result.graph.couples.length,
    parentChildEdges: result.graph.parent_child_edges.length,
    layoutPositions: result.layout.node_positions.length,
    warnings: result.warnings.length,
  },
  graph: {
    ancestors: result.graph.ancestors,
    couples: result.graph.couples,
    parent_child_edges: result.graph.parent_child_edges,
    nodes: result.graph.nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
      memberIds: n.memberIds,
      generation: n.generation,
      isPlaceholder: n.isPlaceholder,
    })),
    edges: result.graph.edges,
  },
  layout: result.layout,
  warnings: result.warnings,
}

const outPath = path.join(process.cwd(), 'GRAPH_LAYOUT_REPORT.json')
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
console.log(`\nFull JSON written to: ${outPath}`)
