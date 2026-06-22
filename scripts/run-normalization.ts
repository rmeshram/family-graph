/**
 * Run the family tree normalization engine against the sample data.
 * Execute with: npx tsx scripts/run-normalization.ts
 */

import { sampleFamilyMembers } from '../lib/sample-data'
import { normalizeFamilyTree, formatAuditReport } from '../lib/normalization-engine'
import fs from 'fs'
import path from 'path'

const result = normalizeFamilyTree(sampleFamilyMembers)

// Print the audit report to stdout
console.log(formatAuditReport(result))

// Write full JSON output to a file
const outputPath = path.join(process.cwd(), 'NORMALIZATION_REPORT.json')
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      meta: {
        generatedAt: new Date().toISOString(),
        totalMembers: result.cleaned_members.length,
        issuesFound: result.issues_found.length,
        fixesApplied: result.fixes_applied.length,
        suggestions: result.suggestions.length,
      },
      issues_found: result.issues_found,
      fixes_applied: result.fixes_applied,
      suggestions: result.suggestions,
      // Omit cleaned_members from file to keep it readable;
      // import normalizeFamilyTree() directly to access the cleaned array.
    },
    null,
    2
  )
)

console.log(`\nFull JSON report written to: ${outputPath}`)
