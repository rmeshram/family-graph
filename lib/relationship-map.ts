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
  'PARENT>PARENT': { neutral: 'Grandparent', male: 'Grandfather (Dada/Nana)', female: 'Grandmother (Dadi/Nani)' },
  'CHILD>CHILD': { neutral: 'Grandchild', male: 'Grandson', female: 'Granddaughter' },
  'PARENT>SIBLING': { neutral: 'Uncle/Aunt', male: 'Uncle', female: 'Aunt' },
  'SIBLING>CHILD': { neutral: 'Nephew/Niece', male: 'Nephew (Bhatija/Bhanja)', female: 'Niece (Bhatiji/Bhanji)' },
  'SPOUSE>PARENT': { neutral: 'Parent-in-law', male: 'Father-in-law', female: 'Mother-in-law' },
  'CHILD>SPOUSE': { neutral: 'Child-in-law', male: 'Son-in-law', female: 'Daughter-in-law' },
  'SPOUSE>SIBLING': { neutral: 'Sibling-in-law', male: 'Brother-in-law (Saala/Devar)', female: 'Sister-in-law (Saali/Nanad)' },
  'SIBLING>SPOUSE': { neutral: "Sibling's Spouse", male: 'Jija (Didi ka Pati)', female: 'Bhabhi (Bhai ki Patni)' },
  'PARENT>SPOUSE': { neutral: 'Step-parent', male: 'Step-father', female: 'Step-mother' },
  'SPOUSE>CHILD': { neutral: 'Step-child', male: 'Step-son', female: 'Step-daughter' },
  'SPOUSE>SPOUSE': { neutral: 'Co-spouse (Sautan/Sauta)' },
  // PARENT>CHILD = sibling when SIBLING edge absent (go up to parent, down to other child)
  'PARENT>CHILD': { neutral: 'Sibling', male: 'Brother', female: 'Sister' },
  // CHILD>PARENT = co-parent/spouse: go down to child, up to the child's other parent = my spouse
  // NOTE: CHILD>PARENT is NOT the same as PARENT>CHILD. The reverse path means co-parent.
  'CHILD>PARENT': { neutral: 'Spouse', male: 'Husband', female: 'Wife' },

  // ── 3-step ─────────────────────────────────────────────────────────────────
  'PARENT>PARENT>PARENT': { neutral: 'Great-grandparent', male: 'Great-grandfather', female: 'Great-grandmother' },
  'CHILD>CHILD>CHILD': { neutral: 'Great-grandchild', male: 'Great-grandson', female: 'Great-granddaughter' },
  'PARENT>SIBLING>CHILD': { neutral: 'First Cousin', male: 'First Cousin (Bhai)', female: 'First Cousin (Didi)' },
  'SPOUSE>SIBLING>SPOUSE': { neutral: 'Co-sibling-in-law', male: 'Co-brother', female: 'Co-sister' },
  'PARENT>SIBLING>SPOUSE': { neutral: "Uncle/Aunt's Spouse", male: 'Fua (Bua ka Pati)', female: 'Chachi/Mausi' },
  'SIBLING>CHILD>CHILD': { neutral: 'Grand-nephew/niece', male: 'Grand-nephew', female: 'Grand-niece' },
  'PARENT>PARENT>SIBLING': { neutral: 'Great-uncle/aunt', male: 'Great-uncle', female: 'Great-aunt' },
  'SPOUSE>SIBLING>CHILD': { neutral: "Spouse's Nephew/Niece", male: "Spouse's Nephew", female: "Spouse's Niece" },
  'SIBLING>CHILD>SPOUSE': { neutral: "Nephew/Niece's Spouse" },
  'PARENT>SPOUSE>CHILD': { neutral: 'Step-sibling', male: 'Step-brother', female: 'Step-sister' },
  'CHILD>CHILD>SPOUSE': { neutral: 'Grandchild-in-law', male: 'Grandson-in-law', female: 'Granddaughter-in-law' },
  'CHILD>SPOUSE>PARENT': { neutral: "Child's In-law" },
  // Legacy 3-step
  'PARENT>PARENT>CHILD': { neutral: 'Uncle/Aunt', male: 'Uncle', female: 'Aunt' },
  'PARENT>CHILD>CHILD': { neutral: 'Nephew/Niece', male: 'Nephew (Bhatija/Bhanja)', female: 'Niece (Bhatiji/Bhanji)' },
  'SPOUSE>PARENT>CHILD': { neutral: 'Sibling-in-law', male: 'Brother-in-law (Saala/Devar)', female: 'Sister-in-law (Saali/Nanad)' },
  'PARENT>CHILD>SPOUSE': { neutral: "Sibling's Spouse", male: 'Jija', female: 'Bhabhi' },
  'CHILD>CHILD>PARENT': { neutral: 'Nephew/Niece', male: 'Nephew', female: 'Niece' },
  'PARENT>PARENT>SPOUSE': { neutral: 'Grandparent', male: 'Grandfather', female: 'Grandmother' },
  'PARENT>SPOUSE>PARENT': { neutral: 'Grandparent (in-law)' },
  'SPOUSE>CHILD>CHILD': { neutral: 'Step-grandchild', male: 'Grandson (step)', female: 'Granddaughter (step)' },

  // ── 4-step ─────────────────────────────────────────────────────────────────
  'PARENT>PARENT>SIBLING>CHILD': { neutral: 'Second Cousin' },
  'PARENT>SIBLING>CHILD>CHILD': { neutral: "First Cousin's Child" },
  'PARENT>SIBLING>CHILD>SPOUSE': { neutral: "First Cousin's Spouse" },
  'PARENT>PARENT>SIBLING>SPOUSE': { neutral: 'Uncle/Aunt by marriage' },
  'SIBLING>CHILD>CHILD>CHILD': { neutral: 'Great-grand-nephew/niece', male: 'Great-grand-nephew', female: 'Great-grand-niece' },
  // Legacy 4-step
  'PARENT>PARENT>CHILD>CHILD': { neutral: 'First Cousin', male: 'First Cousin (Bhai)', female: 'First Cousin (Behen)' },
  'PARENT>PARENT>CHILD>SPOUSE': { neutral: 'Uncle/Aunt by marriage', male: 'Uncle (by marriage)', female: 'Aunt (by marriage)' },
  'SPOUSE>PARENT>CHILD>CHILD': { neutral: "Spouse's Nephew/Niece", male: 'Nephew-in-law (Bhatija)', female: 'Niece-in-law (Bhatiji)' },
  'PARENT>CHILD>CHILD>SPOUSE': { neutral: "Nephew/Niece's Spouse", male: 'Nephew-in-law', female: 'Niece-in-law' },

  // ── 5-step ─────────────────────────────────────────────────────────────────
  'PARENT>PARENT>SIBLING>CHILD>CHILD': { neutral: "Second Cousin's Child" },
  'PARENT>SIBLING>CHILD>CHILD>CHILD': { neutral: "First Cousin's Grandchild" },
  'PARENT>PARENT>PARENT>SIBLING>CHILD': { neutral: 'Third Cousin' },
  'PARENT>PARENT>SIBLING>CHILD>SPOUSE': { neutral: "Second Cousin's Spouse" },

}
