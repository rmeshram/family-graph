/**
 * Cultural Family Terminology — extensible configuration.
 *
 * Architecture: plain config objects keyed by a stable semantic identifier
 * that is independent of the English canonical label produced by the relation
 * engine. To add a new locale or region, add a new top-level export following
 * the same `Record<string, CulturalTermEntry>` shape.
 *
 * Currently supported: Indian family system (North Indian / Hindi default).
 * Terminology is intentionally NOT auto-applied — always surface through UI
 * as supplementary context, never replacing the canonical English label.
 */

export interface CulturalTerm {
  /** Romanised term, e.g. "Chacha" */
  term: string
  /** Devanagari script, e.g. "चाचा" */
  devanagari?: string
  /** Short note for disambiguation, e.g. "Father's younger brother" */
  notes?: string
  /** Regional context, e.g. "North India" */
  region?: string
}

export interface CulturalTermEntry {
  male?: CulturalTerm
  female?: CulturalTerm
  neutral?: CulturalTerm
}

// ─── Indian family terminology ────────────────────────────────────────────────

export const INDIAN_TERMS: Record<string, CulturalTermEntry> = {
  father: { male: { term: 'Pitaji', devanagari: 'पिताजी' } },
  mother: { female: { term: 'Mataji', devanagari: 'माताजी' } },
  son: { male: { term: 'Beta', devanagari: 'बेटा' } },
  daughter: { female: { term: 'Beti', devanagari: 'बेटी' } },
  brother: { male: { term: 'Bhai', devanagari: 'भाई' } },
  sister: { female: { term: 'Didi / Behen', devanagari: 'दीदी / बहन' } },
  husband: { male: { term: 'Pati', devanagari: 'पति' } },
  wife: { female: { term: 'Patni', devanagari: 'पत्नी' } },
  grandfather: { male: { term: 'Dada / Nana', devanagari: 'दादा / नाना', notes: 'Paternal: Dada · Maternal: Nana' } },
  grandmother: { female: { term: 'Dadi / Nani', devanagari: 'दादी / नानी', notes: 'Paternal: Dadi · Maternal: Nani' } },
  paternal_grandfather: { male: { term: 'Dada', devanagari: 'दादा' } },
  maternal_grandfather: { male: { term: 'Nana', devanagari: 'नाना' } },
  paternal_grandmother: { female: { term: 'Dadi', devanagari: 'दादी' } },
  maternal_grandmother: { female: { term: 'Nani', devanagari: 'नानी' } },
  grandson: { male: { term: 'Pota / Nati', devanagari: 'पोता / नाती', notes: 'Paternal: Pota · Maternal: Nati' } },
  granddaughter: { female: { term: 'Poti / Natin', devanagari: 'पोती / नातिन' } },
  great_grandfather: { male: { term: 'Pardada / Parnana', devanagari: 'परदादा / परनाना' } },
  great_grandmother: { female: { term: 'Pardadi / Parnani', devanagari: 'परदादी / परनानी' } },
  paternal_uncle: { male: { term: 'Chacha / Tau', devanagari: 'चाचा / ताऊ', notes: "Father's brother. Younger: Chacha · Elder: Tau" } },
  maternal_uncle: { male: { term: 'Mama', devanagari: 'मामा', notes: "Mother's brother" } },
  paternal_aunt: { female: { term: 'Bua', devanagari: 'बुआ', notes: "Father's sister" } },
  maternal_aunt: { female: { term: 'Mausi', devanagari: 'मौसी', notes: "Mother's sister" } },
  paternal_uncle_wife: { female: { term: 'Chachi / Tai', devanagari: 'चाची / ताई' } },
  maternal_uncle_wife: { female: { term: 'Mami', devanagari: 'मामी' } },
  paternal_aunt_husband: { male: { term: 'Fufa / Phufaji', devanagari: 'फूफा' } },
  maternal_aunt_husband: { male: { term: 'Mausa', devanagari: 'मौसा' } },
  father_in_law: { male: { term: 'Sasur', devanagari: 'ससुर' } },
  mother_in_law: { female: { term: 'Saas', devanagari: 'सास' } },
  son_in_law: { male: { term: 'Damad', devanagari: 'दामाद' } },
  daughter_in_law: { female: { term: 'Bahu', devanagari: 'बहू' } },
  wife_brother: { male: { term: 'Saala', devanagari: 'साला', notes: "Wife's brother" } },
  wife_sister: { female: { term: 'Saali', devanagari: 'साली', notes: "Wife's sister" } },
  husband_younger_brother: { male: { term: 'Devar', devanagari: 'देवर', notes: "Husband's younger brother" } },
  husband_elder_brother: { male: { term: 'Jeth', devanagari: 'जेठ', notes: "Husband's elder brother" } },
  husband_sister: { female: { term: 'Nanad', devanagari: 'ननद', notes: "Husband's sister" } },
  sibling_wife: { female: { term: 'Bhabhi', devanagari: 'भाभी', notes: "Brother's wife" } },
  sibling_husband: { male: { term: 'Jija / Jijaji', devanagari: 'जीजा', notes: "Sister's husband" } },
  nephew: { male: { term: 'Bhatija / Bhanja', devanagari: 'भतीजा / भांजा' } },
  niece: { female: { term: 'Bhatiji / Bhanji', devanagari: 'भतीजी / भांजी' } },
  first_cousin: { neutral: { term: 'Bhai / Behen', devanagari: 'भाई / बहन', notes: "Cousins are traditionally called brothers/sisters" } },
  second_cousin: { neutral: { term: 'Door ka Bhai/Behen', devanagari: 'दूर का भाई/बहन' } },
}

// ─── Label → semantic key map ─────────────────────────────────────────────────
// Maps the canonical labels produced by computeRelationLabel to semantic keys
// above. Add new mappings here as the engine adds new canonical labels.

const LABEL_TO_KEY: Record<string, string> = {
  'Father': 'father',
  'Mother': 'mother',
  'Son': 'son',
  'Daughter': 'daughter',
  'Brother': 'brother',
  'Sister': 'sister',
  'Sibling': 'brother',
  'Husband': 'husband',
  'Wife': 'wife',
  'Spouse': 'husband',
  'Grandson': 'grandson',
  'Granddaughter': 'granddaughter',
  'Grandfather': 'grandfather',
  'Grandmother': 'grandmother',
  'Grandfather (Dada/Nana)': 'grandfather',
  'Grandmother (Dadi/Nani)': 'grandmother',
  'Maternal Grandfather': 'maternal_grandfather',
  'Maternal Grandmother': 'maternal_grandmother',
  'Great-grandfather': 'great_grandfather',
  'Great-grandmother': 'great_grandmother',
  'Uncle (Chacha/Mama)': 'paternal_uncle',
  'Aunt (Chachi/Mami)': 'maternal_aunt',
  'Paternal Uncle (Chacha/Tau)': 'paternal_uncle',
  'Maternal Uncle (Mama)': 'maternal_uncle',
  'Paternal Aunt (Bua)': 'paternal_aunt',
  'Maternal Aunt (Mausi/Mami)': 'maternal_aunt',
  'Father-in-law': 'father_in_law',
  'Mother-in-law': 'mother_in_law',
  'Son-in-law': 'son_in_law',
  'Daughter-in-law': 'daughter_in_law',
  'Brother-in-law (Saala/Devar)': 'wife_brother',
  'Sister-in-law (Saali/Nanad)': 'wife_sister',
  'Cousin (Bhai)': 'first_cousin',
  'Cousin (Behen)': 'first_cousin',
  'Cousin': 'first_cousin',
  'First Cousin (Bhai)': 'first_cousin',
  'First Cousin (Behen)': 'first_cousin',
  'First Cousin': 'first_cousin',
  'Second Cousin': 'second_cousin',
  'Nephew (Bhatija/Bhanja)': 'nephew',
  'Niece (Bhatiji/Bhanji)': 'niece',
  "Brother's Wife / Bhabhi": 'sibling_wife',
  "Brother's Husband / Jija": 'sibling_husband',
  "Sibling's Spouse": 'sibling_wife',
}

/**
 * Look up an Indian family term for the given canonical label and target gender.
 * Returns null if no term is defined for this combination.
 */
export function lookupIndianTerm(
  canonicalLabel: string,
  targetGender?: 'male' | 'female' | 'other',
): CulturalTerm | null {
  const key = LABEL_TO_KEY[canonicalLabel]
  if (!key) return null
  const entry = INDIAN_TERMS[key]
  if (!entry) return null
  if (targetGender === 'male' && entry.male) return entry.male
  if (targetGender === 'female' && entry.female) return entry.female
  return entry.neutral ?? entry.male ?? entry.female ?? null
}
