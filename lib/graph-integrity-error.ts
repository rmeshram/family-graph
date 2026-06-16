/**
 * FamilyGraphIntegrityError — thrown by assertCanonicalGraph() (Phase 5)
 * when the data passed to the layout engine still contains hard errors
 * that would produce a topologically invalid graph.
 */

import { NormIssue } from './normalization-engine'

export class FamilyGraphIntegrityError extends Error {
  public readonly violations: NormIssue[]

  constructor(violations: NormIssue[]) {
    const summary = violations.map(v => `[${v.type}] ${v.description}`).join('\n  ')
    super(
      `Family graph has ${violations.length} integrity violation(s) that must be resolved before layout:\n  ${summary}`
    )
    this.name = 'FamilyGraphIntegrityError'
    this.violations = violations

    // Restore prototype chain (required when extending built-ins in TS)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
