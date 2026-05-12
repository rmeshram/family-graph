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

export type FamilyRole = 'admin' | 'contributor' | 'viewer'

export type MemberTag = 'elder' | 'historian' | 'child' | 'youth' | 'patriarch' | 'matriarch' | 'veteran' | 'scholar' | 'artist' | 'athlete'

export type FamilySide = 'paternal' | 'maternal' | 'both' | 'spouse'

export interface FamilyMember {
  id: string
  name: string
  birthYear?: number
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
  addedBy?: string
  addedAt?: string
  // Claiming & privacy
  claimedByUserId?: string
  isClaimed?: boolean
  visibility?: 'public' | 'family' | 'private'
  // Extended & affiliated family network
  networkGroup?: 'core' | 'extended' | 'affiliated'
  affiliatedFamilyId?: string     // shared key for all members of same external family cluster
  affiliatedFamilyName?: string   // display name e.g. "Rao Family"
  affiliatedJunctionId?: string   // ID of the core-tree member this cluster connects through
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
  transcription?: string
  translation?: string
  language?: string
  recordedBy?: string
  recordedAt: string
  memberId: string
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

export interface AIMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: string
  relatedMemberIds?: string[]
  actionType?: 'relationship' | 'add_member' | 'story' | 'search' | 'insight'
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
