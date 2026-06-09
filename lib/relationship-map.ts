/**
 * Canonical Relationship Dictionary
 *
 * Maps normalized BFS edge sequences to human-readable relationship labels.
 *
 * Edge types (see relationship-engine.ts):
 *   PARENT   — child → parent
 *   CHILD    — parent → child
 *   SPOUSE   — bidirectional
 *   SIBLING  — derived from shared parentIds (never stored in DB)
 *
 * Normalization: edge types joined by '>',  e.g. 'PARENT>SIBLING>CHILD'
 *
 * Each entry has a gender-neutral form plus optional male/female variants.
 * Gender-specific selection happens at runtime in resolveLabel() based on
 * the target member's stored gender.
 *
 * Ordering within each section: simpler/direct paths first, legacy/fallback paths last.
 * "Legacy" paths arise when sibling edges could NOT be materialized (e.g. siblings
 * who share no stored parentIds) — the BFS then traverses PARENT then CHILD.
 */

export interface RelationLabel {
  neutral: string
  male?: string
  female?: string
}
export const RELATIONSHIP_MAP: Record<string, RelationLabel> = {

  // ── 1-step ─────────────────────────────────────────────────────────────────
  'PARENT': { neutral: 'Parent', male: 'Father', female: 'Mother' },
  'CHILD': { neutral: 'Child', male: 'Son', female: 'Daughter' },
  'SPOUSE': { neutral: 'Spouse', male: 'Husband', female: 'Wife' },
  'SIBLING': { neutral: 'Sibling', male: 'Brother', female: 'Sister' },

  // ── 2-step ─────────────────────────────────────────────────────────────────
  'PARENT>PARENT': { neutral: 'Grandparent', male: 'Grandfather', female: 'Grandmother' },
  'CHILD>CHILD': { neutral: 'Grandchild', male: 'Grandson', female: 'Granddaughter' },
  'PARENT>SIBLING': { neutral: 'Uncle/Aunt', male: 'Uncle', female: 'Aunt' },
  'SIBLING>CHILD': { neutral: 'Nephew/Niece', male: 'Nephew', female: 'Niece' },
  'SPOUSE>PARENT': { neutral: 'Parent-in-law', male: 'Father-in-law', female: 'Mother-in-law' },
  'CHILD>SPOUSE': { neutral: 'Child-in-law', male: 'Son-in-law', female: 'Daughter-in-law' },
  'SPOUSE>SIBLING': { neutral: 'Sibling-in-law', male: 'Brother-in-law', female: 'Sister-in-law' },
  'SIBLING>SPOUSE': { neutral: 'Sibling-in-law', male: 'Brother-in-law', female: 'Sister-in-law' },
  'PARENT>SPOUSE': { neutral: 'Step-parent', male: 'Stepfather', female: 'Stepmother' },
  'SPOUSE>CHILD': { neutral: 'Step-child', male: 'Stepson', female: 'Stepdaughter' },
  'SPOUSE>SPOUSE': { neutral: 'Co-spouse' }, // Note: Historically descriptive, relevant in specific legal/polygamous dynamics
  'PARENT>CHILD': { neutral: 'Sibling', male: 'Brother', female: 'Sister' },
  'CHILD>PARENT': { neutral: 'Spouse', male: 'Husband', female: 'Wife' },

  // ── 3-step ─────────────────────────────────────────────────────────────────
  'PARENT>PARENT>PARENT': { neutral: 'Great-grandparent', male: 'Great-grandfather', female: 'Great-grandmother' },
  'CHILD>CHILD>CHILD': { neutral: 'Great-grandchild', male: 'Great-grandson', female: 'Great-granddaughter' },
  'PARENT>SIBLING>CHILD': { neutral: 'Cousin', male: 'Cousin', female: 'Cousin' },
  'SPOUSE>SIBLING>SPOUSE': { neutral: 'Co-sibling-in-law', male: 'Brother-in-law', female: 'Sister-in-law' },
  'PARENT>SIBLING>SPOUSE': { neutral: 'Uncle/Aunt by Marriage', male: 'Uncle', female: 'Aunt' },
  'SIBLING>CHILD>CHILD': { neutral: 'Grandnephew/Grandniece', male: 'Grandnephew', female: 'Grandniece' },
  'PARENT>PARENT>SIBLING': { neutral: 'Great-uncle/Great-aunt', male: 'Great-uncle', female: 'Great-aunt' },
  'SPOUSE>SIBLING>CHILD': { neutral: "Spouse's Nephew/Niece", male: "Nephew", female: "Niece" },
  'SIBLING>CHILD>SPOUSE': { neutral: "Nephew/Niece-in-law", male: "Nephew-in-law", female: "Niece-in-law" },
  'PARENT>SPOUSE>CHILD': { neutral: 'Step-sibling', male: 'Stepbrother', female: 'Stepsister' },
  'CHILD>CHILD>SPOUSE': { neutral: 'Grandchild-in-law', male: 'Grandson-in-law', female: 'Granddaughter-in-law' },
  'CHILD>SPOUSE>PARENT': { neutral: "Child's Parent-in-law" }, // Co-parents-in-law
  'PARENT>PARENT>CHILD': { neutral: 'Uncle/Aunt', male: 'Uncle', female: 'Aunt' },
  'PARENT>CHILD>CHILD': { neutral: 'Nephew/Niece', male: 'Nephew', female: 'Niece' },
  'SPOUSE>PARENT>CHILD': { neutral: 'Sibling-in-law', male: 'Brother-in-law', female: 'Sister-in-law' },
  'PARENT>CHILD>SPOUSE': { neutral: "Sibling-in-law", male: 'Brother-in-law', female: 'Sister-in-law' },
  'CHILD>CHILD>PARENT': { neutral: 'Child', male: 'Son', female: 'Daughter' },
  'PARENT>PARENT>SPOUSE': { neutral: 'Grandparent-in-law', male: 'Grandfather-in-law', female: 'Grandmother-in-law' },
  'PARENT>SPOUSE>PARENT': { neutral: 'Step-grandparent', male: 'Step-grandfather', female: 'Step-grandmother' },
  'SPOUSE>CHILD>CHILD': { neutral: 'Step-grandchild', male: 'Step-grandson', female: 'Step-granddaughter' },

  // ── 4-step ─────────────────────────────────────────────────────────────────
  'PARENT>PARENT>SIBLING>CHILD': { neutral: 'Second Cousin', male: 'Second Cousin', female: 'Second Cousin' },
  'PARENT>SIBLING>CHILD>CHILD': { neutral: "First Cousin Once Removed", male: "First Cousin's Son", female: "First Cousin's Daughter" },
  'PARENT>SIBLING>CHILD>SPOUSE': { neutral: "Cousin-in-law", male: "Cousin's Husband", female: "Cousin's Wife" },
  'PARENT>PARENT>SIBLING>SPOUSE': { neutral: 'Great-uncle/Aunt by Marriage', male: 'Great-uncle', female: 'Great-aunt' },
  'SIBLING>CHILD>CHILD>CHILD': { neutral: 'Great-grandnephew/Niece', male: 'Great-grandnephew', female: 'Great-grandniece' },
  'PARENT>PARENT>CHILD>CHILD': { neutral: 'First Cousin', male: 'Cousin', female: 'Cousin' },
  'PARENT>PARENT>CHILD>SPOUSE': { neutral: 'Uncle/Aunt by Marriage', male: 'Uncle', female: 'Aunt' },
  'SPOUSE>PARENT>CHILD>CHILD': { neutral: "Spouse's Nephew/Niece", male: "Nephew", female: "Niece" },
  'PARENT>CHILD>CHILD>SPOUSE': { neutral: "Nephew/Niece-in-law", male: "Nephew-in-law", female: "Niece-in-law" },

  // ── 5-step ─────────────────────────────────────────────────────────────────
  'PARENT>PARENT>SIBLING>CHILD>CHILD': { neutral: "Second Cousin Once Removed", male: "Second Cousin's Son", female: "Second Cousin's Daughter" },
  'PARENT>SIBLING>CHILD>CHILD>CHILD': { neutral: "First Cousin Twice Removed", male: "First Cousin's Grandson", female: "First Cousin's Granddaughter" },
  'PARENT>PARENT>PARENT>SIBLING>CHILD': { neutral: 'Third Cousin', male: 'Third Cousin', female: 'Third Cousin' },
  'PARENT>PARENT>SIBLING>CHILD>SPOUSE': { neutral: "Second Cousin-in-law", male: "Second Cousin's Husband", female: "Second Cousin's Wife" },
}