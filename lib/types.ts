export interface PrivacySettings {
  hideContactInfo: boolean
  hideFromSearch: boolean
  defaultNodeVisibility: 'public' | 'family' | 'private'
}

export type RelationshipType =
  | 'self'
  | 'father' | 'mother' | 'parent'
  | 'son' | 'daughter' | 'child'
  | 'spouse' | 'husband' | 'wife'
  | 'brother' | 'sister' | 'sibling'
  | 'grandfather' | 'grandmother' | 'grandparent'
  | 'grandson' | 'granddaughter' | 'grandchild'
  | 'great-grandfather' | 'great-grandmother'
  | 'uncle' | 'aunt' | 'maternal-uncle' | 'paternal-uncle' | 'maternal-aunt' | 'paternal-aunt'
  | 'nephew' | 'niece'
  | 'cousin' | 'first-cousin' | 'second-cousin'
  | 'father-in-law' | 'mother-in-law' | 'son-in-law' | 'daughter-in-law'
  | 'brother-in-law' | 'sister-in-law'
  | 'step-father' | 'step-mother' | 'step-child'
  | 'other'

export type FamilyRole = 'admin' | 'moderator' | 'branch_admin' | 'contributor' | 'viewer'

export type ConflictType =
  | 'too_many_parents'
  | 'cycle_detected'
  | 'birth_year_gap'
  | 'self_parent'
  | 'self_spouse'
  | 'unidirectional_spouse'
  | 'duplicate_identity'
  | 'generation_mismatch'

export interface PendingConflict {
  id: string
  familyId: string
  nodeId: string | null
  conflictType: ConflictType
  description: string
  severity: 'warning' | 'error'
  status: 'open' | 'resolved' | 'dismissed'
  detectedBy: string | null
  resolvedBy: string | null
  resolution: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type ClaimStatus =
  | 'unclaimed'
  | 'invite_sent'
  | 'claim_pending'
  | 'claimed'
  | 'rejected'
  | 'revoked'

export interface NodeMatchSuggestion {
  nodeId: string
  nodeName: string
  nodeInitials: string
  familyId: string
  familyName: string
  addedByName: string | null
  relationship: string | null
  confidenceScore: number
  confidenceTier: 'high' | 'medium' | 'low'
  matchReasons: string[]
}

export interface ClaimRequest {
  id: string
  nodeId: string
  claimantUserId: string
  status: 'pending' | 'verified' | 'rejected' | 'abandoned' | 'expired'
  submittedName?: string
  submittedBirthYear?: number
  confidenceScore?: number
  attempts: number
  lockedUntil?: string
  intentToken?: string
  resumeStep: string
  createdAt: string
  expiresAt: string
}

export type MemberTag = 'elder' | 'historian' | 'child' | 'youth' | 'patriarch' | 'matriarch' | 'veteran' | 'scholar' | 'artist' | 'athlete'

export type FamilySide = 'paternal' | 'maternal' | 'both' | 'spouse'

export interface FamilyMember {
  id: string
  name: string
  birthYear?: number
  birthMonth?: number
  birthDay?: number
  deathYear?: number
  birthPlace?: string
  currentPlace?: string
  photoUrl?: string
  bio?: string
  relationship?: RelationshipType | string
  occupation?: string
  parentIds: string[]
  spouseIds: string[]
  generation: number
  x?: number
  y?: number
  isAlive?: boolean
  gender?: 'male' | 'female' | 'other'
  tags?: MemberTag[]
  side?: FamilySide
  role?: FamilyRole
  // India-specific
  gotra?: string
  caste?: string
  hometown?: string
  nativeLanguage?: string
  religion?: string
  // Rich content
  stories?: Story[]
  documents?: Document[]
  milestones?: Milestone[]
  memories?: MemoryItem[]
  voiceNotes?: VoiceNote[]
  phone?: string
  email?: string
  instagramHandle?: string
  addedBy?: string
  addedAt?: string
  // Claiming & privacy
  claimedByUserId?: string
  isClaimed?: boolean
  claimStatus?: ClaimStatus
  claimedAt?: string
  claimRevokedReason?: string
  isDeceased?: boolean
  dateOfBirth?: string
  visibility?: 'public' | 'family' | 'private'
  /** When true, the node is displayed as a grey "? Member" placeholder to non-admins */
  showAsAnonymous?: boolean
  /** When true, this profile is visible for matrimony / community search */
  isBiodataVisible?: boolean

  // ──────────────────────────────────────────────────────────────────────────
  // Extended Biodata Fields (Migration 028)
  // ──────────────────────────────────────────────────────────────────────────

  // Physical & Personal Details
  heightCm?: number  // Height in centimeters
  weightKg?: number  // Weight in kilograms
  complexion?: 'fair' | 'wheatish' | 'dusky' | 'dark'
  bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
  disability?: string  // Full disclosure for matrimony
  maritalStatus?: 'never_married' | 'divorced' | 'widowed' | 'separated'

  // Astrological (User enters manually - no API integration)
  timeOfBirth?: string  // HH:mm format
  placeOfBirth?: string  // For kundli
  manglik?: boolean  // Manglik dosha status
  rashi?: string  // Zodiac sign (Indian astrology)
  nakshatra?: string  // Birth star

  // Education & Career (Extended)
  educationLevel?: 'below_10th' | '10th_pass' | '12th_pass' | 'diploma' | 'graduate' | 'post_graduate' | 'doctorate'
  educationField?: string  // e.g., "Computer Engineering", "MBBS"
  occupationCategory?: 'government' | 'private' | 'business' | 'professional' | 'student' | 'homemaker' | 'retired' | 'not_working'
  annualIncomeRange?: 'below_2lakh' | '2_to_5lakh' | '5_to_10lakh' | '10_to_15lakh' | '15_to_25lakh' | '25_to_50lakh' | '50lakh_plus'

  // Family Details (Extended)
  fatherOccupation?: string
  motherOccupation?: string
  familyIncomeRange?: 'below_5lakh' | '5_to_10lakh' | '10_to_20lakh' | '20_to_50lakh' | '50lakh_plus'
  familyType?: 'joint' | 'nuclear'
  numberOfBrothers?: number
  numberOfSisters?: number
  brothersMarried?: number
  sistersMarried?: number
  ancestralProperty?: string

  // Partner Expectations
  partnerExpectations?: string  // Free text
  preferredLocations?: string[]  // Cities/countries
  preferredAgeMin?: number
  preferredAgeMax?: number
  preferredHeightMinCm?: number
  preferredHeightMaxCm?: number

  // Residency & Relocation
  residencyStatus?: 'indian_citizen' | 'nri' | 'green_card' | 'work_visa' | 'citizen_other' | 'student_visa'
  currentCountry?: string
  willingToRelocate?: boolean

  // Biodata Photos (separate from profile photo)
  biodataPhotoUrl?: string  // Professional passport-style photo
  fullLengthPhotoUrl?: string  // Full-length photo (optional)

  // Biodata Analytics (free - no payment needed)
  biodataViewsCount?: number
  biodataPdfDownloads?: number
  biodataWhatsappShares?: number
  biodataLastUpdatedAt?: string

  // Extended & affiliated family network
  networkGroup?: 'core' | 'extended' | 'affiliated'
  affiliatedFamilyId?: string     // shared key for all members of same external family cluster
  affiliatedFamilyName?: string   // display name e.g. "Rao Family"
  affiliatedJunctionId?: string   // ID of the core-tree member this cluster connects through
}

export interface LinkedFamily {
  id: string
  name: string
  memberCount: number
  junctionMemberId: string | null
}

export interface FamilyLink {
  id: string
  familyAId: string
  familyBId: string
  status: 'pending' | 'accepted' | 'rejected' | 'revoked'
  junctionMemberA?: string | null
  junctionMemberB?: string | null
  linkNote?: string | null
  visibilityScope: 'names_only' | 'full_profile' | 'admin_only'
  initiatedBy: string
  acceptedBy?: string | null
  createdAt: string
  updatedAt: string
}

export interface Story {
  id: string
  title: string
  content: string
  date?: string
  author?: string
  createdAt: string
  aiGenerated?: boolean
  language?: string
}

export interface Document {
  id: string
  name: string
  type: 'photo' | 'certificate' | 'letter' | 'other'
  url: string
  uploadedAt: string
}

export interface MemoryItem {
  id: string
  title: string
  description?: string
  photoUrl?: string
  eventType: 'wedding' | 'birth' | 'festival' | 'graduation' | 'travel' | 'family-gathering' | 'other'
  year?: number
  date?: string
  taggedMemberIds?: string[]
  uploadedBy?: string
  uploadedAt: string
}

export interface VoiceNote {
  id: string
  title: string
  durationSeconds: number
  fileUrl?: string
  transcription?: string
  translation?: string
  language?: string
  recordedBy?: string
  recordedAt: string
  memberId?: string
}

export interface Milestone {
  id: string
  title: string
  year: number
  description?: string
  type: 'birth' | 'marriage' | 'career' | 'education' | 'achievement' | 'relocation' | 'other'
}

export interface FamilyConnection {
  from: string
  to: string
  type: 'parent' | 'spouse' | 'sibling'
}

export interface FamilyEvent {
  id: string
  type: 'member_added' | 'story_added' | 'memory_added' | 'milestone_added' | 'invite_joined' | 'voice_added'
  actorName: string
  actorId?: string
  subjectName: string
  subjectId?: string
  message: string
  timestamp: string
  emoji?: string
}

export interface AIToolCallInfo {
  toolName: string
  args: Record<string, string>
  result: string
}

export interface AIMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: string
  relatedMemberIds?: string[]
  actionType?: 'relationship' | 'add_member' | 'story' | 'search' | 'insight'
  toolCallInfo?: AIToolCallInfo
  isError?: boolean
  /** True while the message is being streamed — hides it from conversation history export */
  isStreaming?: boolean
}

export interface InviteLink {
  id: string
  code: string
  role: FamilyRole
  createdBy: string
  createdAt: string
  expiresAt?: string
  usedCount: number
  maxUses?: number
}

export interface AIInsight {
  id: string
  type: 'pattern' | 'suggestion' | 'discovery' | 'milestone'
  title: string
  description: string
  relatedMemberIds: string[]
  confidence: number
}

export interface FamilyStats {
  totalMembers: number
  generations: number
  oldestMember?: FamilyMember
  youngestMember?: FamilyMember
  averageLifespan?: number
  mostCommonOccupation?: string
  birthplaces: { place: string; count: number }[]
}
