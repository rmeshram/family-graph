'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FamilyMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { User, Calendar, MapPin, Briefcase, Heart, Users, ImageIcon, X, Instagram, Loader2, Phone, Mail, Hash, Lock, ArrowLeftRight, AlertTriangle, UserCheck } from 'lucide-react'
import { scoreCandidate, normalizeStoredName, findExactNameMatch, type StructuralContext } from '@/lib/match-detection'
import { getInverseRelationship } from '@/lib/relationship-engine'
import { computeRelationLabel } from '@/lib/relation-engine'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

// Map verbose BFS labels to dropdown values ("Paternal Uncle (Chacha/Tau)" -> "paternal-uncle")
function bfsLabelToRelType(label: string): string | null {
  const l = label.toLowerCase()
  if (l === 'self') return 'self'
  if (l.includes('paternal uncle')) return 'paternal-uncle'
  if (l.includes('paternal aunt')) return 'paternal-aunt'
  if (l.includes('maternal uncle')) return 'maternal-uncle'
  if (l.includes('maternal aunt')) return 'maternal-aunt'
  if (l.includes('father-in-law')) return 'father-in-law'
  if (l.includes('mother-in-law')) return 'mother-in-law'
  if (l.includes('son-in-law')) return 'son-in-law'
  if (l.includes('daughter-in-law')) return 'daughter-in-law'
  if (l.includes('brother-in-law')) return 'brother-in-law'
  if (l.includes('sister-in-law')) return 'sister-in-law'
  if (l.includes('step-father') || l.includes('step father')) return 'step-father'
  if (l.includes('step-mother') || l.includes('step mother')) return 'step-mother'
  if (l.includes('great-grandfather') || l.includes('great grandfather')) return 'great-grandfather'
  if (l.includes('great-grandmother') || l.includes('great grandmother')) return 'great-grandmother'
  if (l.startsWith('grandfather')) return 'grandfather'
  if (l.startsWith('grandmother')) return 'grandmother'
  if (l.startsWith('grandson')) return 'grandson'
  if (l.startsWith('granddaughter')) return 'granddaughter'
  if (l.includes('first cousin')) return 'first-cousin'
  if (l.includes('second cousin')) return 'second-cousin'
  if (l.startsWith('father')) return 'father'
  if (l.startsWith('mother')) return 'mother'
  if (l.startsWith('son')) return 'son'
  if (l.startsWith('daughter')) return 'daughter'
  if (l.startsWith('husband')) return 'husband'
  if (l.startsWith('wife')) return 'wife'
  if (l.startsWith('brother')) return 'brother'
  if (l.startsWith('sister')) return 'sister'
  if (l.startsWith('uncle')) return 'uncle'
  if (l.startsWith('aunt')) return 'aunt'
  if (l.startsWith('nephew')) return 'nephew'
  if (l.startsWith('niece')) return 'niece'
  if (l.startsWith('cousin')) return 'cousin'
  return null
}

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingMembers: FamilyMember[]
  onAdd: (member: Omit<FamilyMember, 'id'>) => void | Promise<void>
  onUpdate?: (id: string, updates: Partial<FamilyMember>) => Promise<void>
  editingMember?: FamilyMember | null
  familyId?: string
  /** The currently authenticated user's ID — used to lock photo on claimed nodes. */
  currentUserId?: string
  /** Logged-in user's bound member id; hides 'Relationship to You' when editing self. */
  selfMemberId?: string | null
  /** Called when user opts to navigate to an existing node instead of creating a duplicate. */
  onFocusExisting?: (id: string) => void
}

type DuplicateWarning = { member: FamilyMember; score: number; tier: 'high' | 'medium' }

export function AddMemberDialog({
  open,
  onOpenChange,
  existingMembers,
  onAdd,
  onUpdate,
  editingMember,
  familyId,
  currentUserId,
  selfMemberId,
  onFocusExisting,
}: AddMemberDialogProps) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [name, setName] = useState('')

  // Photo is locked when editing a node claimed by someone else
  const photoIsLocked =
    !!editingMember?.claimedByUserId &&
    editingMember.claimedByUserId !== currentUserId

  // Pre-populate when editing; hard-reset all fields when opening for a new add.
  // Without the reset branch, stale relationship/gender from a previous add can
  // persist when the dialog re-opens (React component keeps state between renders).
  useEffect(() => {
    if (editingMember && open) {
      setName(editingMember.name ?? '')
      setBirthYear(editingMember.birthYear?.toString() ?? '')
      setDeathYear(editingMember.deathYear?.toString() ?? '')
      setBirthPlace(editingMember.birthPlace ?? '')
      setCurrentPlace(editingMember.currentPlace ?? '')
      setHometown(editingMember.hometown ?? '')
      setOccupation(editingMember.occupation ?? '')
      setGotra(editingMember.gotra ?? '')
      setPhone(editingMember.phone ?? '')
      setEmail(editingMember.email ?? '')
      setInstagramHandle(editingMember.instagramHandle ?? '')
      setRelationship(editingMember.relationship ?? '')
      setBio(editingMember.bio ?? '')
      // Identify father/mother from parentIds by gender; fall back to index order
      const parentMembers = (editingMember.parentIds ?? [])
        .map(id => existingMembers.find(m => m.id === id))
        .filter((m): m is FamilyMember => !!m)
      const fatherMember = parentMembers.find(m => m.gender === 'male') ?? parentMembers[0]
      const motherMember = parentMembers.find(m => m.gender === 'female') ??
        parentMembers.find(m => m.id !== fatherMember?.id)
      setFatherId(fatherMember?.id ?? '')
      setMotherId(motherMember?.id ?? '')
      setSpouseId(editingMember.spouseIds?.[0] ?? '')
      setNetworkGroup((editingMember.networkGroup as 'core' | 'extended' | 'affiliated') ?? 'core')
      setAffiliatedFamilyName(editingMember.affiliatedFamilyName ?? '')
      setAffiliatedJunctionId(editingMember.affiliatedJunctionId ?? '')
      setGender((editingMember.gender as 'male' | 'female' | 'other' | '') ?? '')
      setPhotoPreview(editingMember.photoUrl ?? null)
    } else if (!editingMember && open) {
      // Hard reset — clears any stale values from the previous open session
      setName(''); setBirthYear(''); setDeathYear('')
      setBirthPlace(''); setCurrentPlace(''); setHometown('')
      setOccupation(''); setGotra(''); setPhone(''); setEmail('')
      setInstagramHandle(''); setRelationship(''); setBio('')
      setFatherId(''); setMotherId(''); setSpouseId('')
      setNetworkGroup('core'); setAffiliatedFamilyName('')
      setAffiliatedJunctionId(''); setGender('')
      setErrors({}); setDuplicateWarning(null); setBypassDuplicate(false)
      setUploadError(null); setPhotoFile(null); setPhotoPreview(null)
    }
  }, [editingMember, open])
  const [birthYear, setBirthYear] = useState('')
  const [deathYear, setDeathYear] = useState('')
  const [birthPlace, setBirthPlace] = useState('')
  const [currentPlace, setCurrentPlace] = useState('')
  const [hometown, setHometown] = useState('')
  const [occupation, setOccupation] = useState('')
  const [gotra, setGotra] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [relationship, setRelationship] = useState('')
  const [bio, setBio] = useState('')
  const [fatherId, setFatherId] = useState<string>('')
  const [motherId, setMotherId] = useState<string>('')
  const [spouseId, setSpouseId] = useState<string>('')
  const [networkGroup, setNetworkGroup] = useState<'core' | 'extended' | 'affiliated'>('core')
  const [affiliatedFamilyName, setAffiliatedFamilyName] = useState('')
  const [affiliatedJunctionId, setAffiliatedJunctionId] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null)
  const [bypassDuplicate, setBypassDuplicate] = useState(false)

  // ── Phase 2: "Already in tree?" quick-select candidates ──────────────────
  // When the user picks father / mother / spouse as relationship, surface existing
  // members who already fill that structural role for the adder's siblings.
  // Clicking one links that existing node instead of creating a duplicate.
  const quickSelectCandidates = useMemo(() => {
    if (editingMember || !selfMemberId) return []
    const parentRel = /^(father|mother|step-?father|step-?mother)$/i
    const spouseRel = /^(husband|wife|spouse|partner)$/i
    if (!parentRel.test(relationship) && !spouseRel.test(relationship)) return []

    const self = existingMembers.find(m => m.id === selfMemberId)
    if (!self) return []

    if (parentRel.test(relationship)) {
      const isFather = /father/i.test(relationship)
      // Collect all parent-generation members that siblings already have
      const siblings = existingMembers.filter(m =>
        m.id !== selfMemberId &&
        m.parentIds.some(pid => self.parentIds.includes(pid))
      )
      const siblingParentIds = new Set(
        [...siblings, self].flatMap(s => s.parentIds)
      )
      const candidates = existingMembers.filter(m =>
        siblingParentIds.has(m.id) &&
        (isFather ? m.gender !== 'female' : m.gender !== 'male')
      )
      return candidates
    }

    if (spouseRel.test(relationship)) {
      const spouseIds = new Set(self.spouseIds ?? [])
      return existingMembers.filter(m => spouseIds.has(m.id))
    }
    return []
  }, [editingMember, selfMemberId, relationship, existingMembers])

  // Real-time exact-name duplicate detection — updates as the user types.
  // Only fires when birth years are NOT clearly different (same name + same/no DOB = likely duplicate).
  // Skips the member currently being edited so renaming with the same name is OK.
  const exactNameMatch = !editingMember
    ? (() => {
      const match = findExactNameMatch(existingMembers, name, undefined)
      if (!match) return null
      // Both sides have birth years and they differ → different people with same name
      const newBY = birthYear ? parseInt(birthYear) : null
      const existBY = match.birthYear ?? null
      if (newBY !== null && existBY !== null && newBY !== existBY) return null
      return match
    })()
    : null

  // ── Smart co-parent auto-fill ───────────────────────────────────────────
  const handleFatherChange = (value: string) => {
    setFatherId(value)
    if (value && value !== 'none') {
      const father = existingMembers.find(m => m.id === value)
      if (father?.spouseIds.length) {
        const autoMother = existingMembers.find(
          m => father.spouseIds.includes(m.id) && m.gender !== 'male'
        )
        if (autoMother && !motherId) setMotherId(autoMother.id)
      }
    }
  }

  const handleMotherChange = (value: string) => {
    setMotherId(value)
    if (value && value !== 'none') {
      const mother = existingMembers.find(m => m.id === value)
      if (mother?.spouseIds.length) {
        const autoFather = existingMembers.find(
          m => mother.spouseIds.includes(m.id) && m.gender !== 'female'
        )
        if (autoFather && !fatherId) setFatherId(autoFather.id)
      }
    }
  }

  // ── Auto-compute “Relationship to you” via BFS when parent / spouse is selected ──
  // Only fills when the field is currently empty (never overwrites a manual pick).
  useEffect(() => {
    // DECISION 4: resolve self via prop (logged-in user's bound member id) and
    // fall back to legacy 'relationship === self' for unauthenticated demo views.
    const self = (selfMemberId && existingMembers.find(m => m.id === selfMemberId))
      || existingMembers.find(m => m.relationship === 'self')
    if (!self) return
    const tempParentIds = [fatherId, motherId].filter(id => id && id !== 'none')
    const tempSpouseIds = spouseId && spouseId !== 'none' ? [spouseId] : []
    if (!tempParentIds.length && !tempSpouseIds.length) return
    const TEMP_ID = '__temp_compute__'
    const tempMember: FamilyMember = {
      id: TEMP_ID, name: '', parentIds: tempParentIds, spouseIds: tempSpouseIds, generation: 0,
    }
    const computed = computeRelationLabel(TEMP_ID, self.id, [...existingMembers, tempMember])
    if (computed) {
      const normalized = bfsLabelToRelType(computed)
      if (normalized && !relationship) setRelationship(normalized)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fatherId, motherId, spouseId])

  // ── Reverse: when a sibling relationship is chosen, auto-fill the parents from the self-member ──
  // This ensures `generation` is computed correctly (parentMember.generation+1) and the
  // new node is wired into the right family branch on the graph.
  useEffect(() => {
    const SIBLING_RELS = ['brother', 'sister', 'half-brother', 'half-sister', 'stepbrother', 'stepsister']
    if (!SIBLING_RELS.includes(relationship)) return
    const self = (selfMemberId && existingMembers.find(m => m.id === selfMemberId))
      || existingMembers.find(m => m.relationship === 'self')
    if (!self?.parentIds?.length) return
    const selfParents = existingMembers.filter(m => self.parentIds.includes(m.id))
    const selfFather = selfParents.find(m => m.gender === 'male') ?? selfParents[0]
    const selfMother = selfParents.find(m => m.gender === 'female') ?? selfParents.find(m => m.id !== selfFather?.id)
    // Only auto-fill if the user hasn't already made a manual selection
    if (selfFather && !fatherId) setFatherId(selfFather.id)
    if (selfMother && !motherId) setMotherId(selfMother.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationship])

  // Is the relationship field visible? Hidden only when editing the self-node.
  const isEditingSelf = !!editingMember && (
    editingMember.id === selfMemberId ||
    (!selfMemberId && editingMember.relationship === 'self')
  )

  // Names that are clearly not real people — placeholder or test values
  const INVALID_NAME_BLOCKLIST = /^(yes|no|n\/a|na|nil|unknown|test|dummy|tbd|xxx|none|fake|temp|abc|xyz)$/i

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Name is required'
    // Prevent pure-whitespace or symbol-only names
    if (name.trim() && !/\p{L}/u.test(name.trim())) e.name = 'Please enter a valid person\'s name'
    // Reject known placeholder / test values
    if (name.trim() && INVALID_NAME_BLOCKLIST.test(name.trim())) e.name = 'Please enter a valid person\'s name'
    // Relationship is required for new members and when editing non-self nodes
    if (!isEditingSelf && !relationship)
      e.relationship = 'Please select how this person is related to you — it determines their position in the tree'
    // Gender is required for new members (drives tree layout and node colour)
    if (!editingMember && !gender)
      e.gender = 'Gender is required so the tree can position and colour this node correctly'
    if (birthYear && (isNaN(+birthYear) || +birthYear < 1800 || +birthYear > new Date().getFullYear()))
      e.birthYear = 'Enter a valid year (1800 – present)'
    if (deathYear && (isNaN(+deathYear) || +deathYear < 1800 || +deathYear > new Date().getFullYear()))
      e.deathYear = 'Enter a valid year'
    if (deathYear && birthYear && +deathYear < +birthYear)
      e.deathYear = 'Must be after birth year'
    if (instagramHandle && !/^[a-zA-Z0-9._]{1,30}$/.test(instagramHandle.replace(/^@/, '')))
      e.instagramHandle = 'Invalid handle (letters, numbers, . _ only)'
    // Phone/email format validation
    if (phone && !/^[+]?[0-9\s\-()]{7,20}$/.test(phone.trim()))
      e.phone = 'Enter a valid phone number'
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      e.email = 'Enter a valid email address'
    // Prevent self-referential relationships
    const selfId = editingMember?.id
    if (selfId) {
      if (spouseId && spouseId === selfId) e.spouseId = 'Cannot be your own spouse'
      if (fatherId && fatherId === selfId) e.fatherId = 'Cannot be your own parent'
      if (motherId && motherId === selfId) e.motherId = 'Cannot be your own parent'
    }
    // Issue 5: Structural duplicate-relationship enforcement
    // A person cannot have two biological fathers or two biological mothers.
    // Step/foster parents are OK in addition to a biological parent.
    if (!editingMember && selfMemberId) {
      const self = existingMembers.find(m => m.id === selfMemberId)
      if (self) {
        const existingParents = existingMembers.filter(m => (self.parentIds ?? []).includes(m.id))
        const isBioFather = /^(father)$/i.test(relationship)
        const isBioMother = /^(mother)$/i.test(relationship)
        if (isBioFather && existingParents.some(p => p.gender === 'male')) {
          e.relationship = `A father is already in your tree (${existingParents.find(p => p.gender === 'male')?.name ?? 'existing'}). Use stepfather or foster-father if this is a different role, or edit the existing father node instead.`
        }
        if (isBioMother && existingParents.some(p => p.gender === 'female')) {
          e.relationship = `A mother is already in your tree (${existingParents.find(p => p.gender === 'female')?.name ?? 'existing'}). Use stepmother or foster-mother if this is a different role, or edit the existing mother node instead.`
        }
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Revoke previous object URL to avoid memory leak
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const clearPhoto = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (isSubmitting) return

    // ── Duplicate detection — only when adding a new member (not editing) ────
    if (!editingMember) {
      const storedName = normalizeStoredName(name)

      // 1. Hard block: exact name match — only blocked when birth years are NOT clearly different.
      // Two people can share a name if they have verifiably distinct birth years (e.g., father & son namesake).
      const exactMatch = findExactNameMatch(existingMembers, storedName)
      if (exactMatch) {
        const newBY = birthYear ? parseInt(birthYear) : null
        const existBY = exactMatch.birthYear ?? null
        const differentBirthYear = newBY !== null && existBY !== null && newBY !== existBY
        if (!differentBirthYear) {
          setDuplicateWarning({ member: exactMatch as FamilyMember, score: 100, tier: 'high' })
          return
        }
        // Different birth year — genuinely different person; skip fuzzy check and continue
      } else if (!bypassDuplicate) {
        // Build structural context so sibling-parent / spouse signals boost score
        const structuralCtx: StructuralContext | undefined = selfMemberId && relationship
          ? {
            addingRelationship: relationship,
            addingForMemberId: selfMemberId,
            allMembers: existingMembers.map(m => ({
              id: m.id, name: m.name,
              parentIds: m.parentIds ?? [],
              spouseIds: m.spouseIds ?? [],
              gender: m.gender ?? null,
            })),
          }
          : undefined

        let bestMatch: DuplicateWarning | null = null
        for (const m of existingMembers) {
          const result = scoreCandidate(
            {
              nodeId: m.id, nodeName: m.name, familyId: '', familyName: '',
              addedByName: null, relationship: m.relationship ?? null,
              birthYear: m.birthYear ?? null, phone: m.phone ?? null, email: m.email ?? null,
            },
            { name: storedName, birthYear: birthYear ? parseInt(birthYear) : null, phone: phone || null, email: email || null },
            structuralCtx
          )
          if (result && result.confidenceScore >= 40) {
            const tier = result.confidenceScore >= 70 ? 'high' : 'medium'
            if (!bestMatch || result.confidenceScore > bestMatch.score) {
              bestMatch = { member: m, score: result.confidenceScore, tier }
            }
          }
        }
        if (bestMatch) {
          setDuplicateWarning(bestMatch)
          return
        }
      }
    }

    setIsSubmitting(true)
    setUploadError(null)

    const parentIds = [fatherId, motherId].filter(id => id && id !== 'none')
    const spouseIds = spouseId && spouseId !== 'none' ? [spouseId] : []

    const parentMember = existingMembers.find(m => parentIds.includes(m.id))
    const generation = parentMember ? parentMember.generation + 1 : 0

    let uploadedPhotoUrl: string | undefined
    if (photoFile && familyId) {
      // family-photos bucket is family-scoped via RLS (migration 012):
      //   (storage.foldername(name))[1] IN (SELECT family_id::text FROM profiles WHERE id = auth.uid())
      // Path convention: <family_id>/members/<timestamp>.<ext>
      const ext = (photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${familyId}/members/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage
        .from('family-photos')
        .upload(path, photoFile, { upsert: false, contentType: photoFile.type })
      if (error) {
        console.error('[add-member] photo upload failed:', error)
        const friendly = /row-level security|Unauthorized|403/i.test(error.message)
          ? 'Photo upload blocked — your account isn\'t linked to this family yet. Member added without photo.'
          : 'Photo upload failed — member will be added without photo.'
        setUploadError(friendly)
      } else {
        const { data } = supabase.storage.from('family-photos').getPublicUrl(path)
        uploadedPhotoUrl = data.publicUrl
      }
    }

    const memberData: Omit<FamilyMember, 'id'> = {
      name: normalizeStoredName(name),
      birthYear: birthYear ? parseInt(birthYear) : undefined,
      deathYear: deathYear ? parseInt(deathYear) : undefined,
      birthPlace: birthPlace || undefined,
      currentPlace: currentPlace || undefined,
      hometown: hometown || undefined,
      occupation: occupation || undefined,
      gotra: gotra || undefined,
      phone: phone || undefined,
      email: email || undefined,
      instagramHandle: instagramHandle ? instagramHandle.replace(/^@/, '') : undefined,
      relationship,
      bio,
      gender: gender || undefined,
      parentIds,
      spouseIds,
      generation,
      photoUrl: uploadedPhotoUrl ?? (editingMember?.photoUrl || undefined),
      networkGroup: networkGroup !== 'core' ? networkGroup : undefined,
      affiliatedFamilyName: networkGroup === 'affiliated' && affiliatedFamilyName ? affiliatedFamilyName : undefined,
      affiliatedFamilyId: networkGroup === 'affiliated' && affiliatedFamilyName ? affiliatedFamilyName.toLowerCase().replace(/\s+/g, '-') : undefined,
      affiliatedJunctionId: networkGroup === 'affiliated' && affiliatedJunctionId && affiliatedJunctionId !== 'none' ? affiliatedJunctionId : undefined,
      isAlive: !deathYear,
    }

    try {
      if (editingMember && onUpdate) {
        await onUpdate(editingMember.id, memberData)
      } else {
        await onAdd(memberData)
      }
      resetForm()
      onOpenChange(false)
    } catch (err) {
      // Error toast is already shown by the caller (handleAddMember/handleUpdateMember)
      console.error('[add-member] submit failed:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setName('')
    setBirthYear('')
    setDeathYear('')
    setBirthPlace('')
    setCurrentPlace('')
    setHometown('')
    setOccupation('')
    setGotra('')
    setPhone('')
    setEmail('')
    setInstagramHandle('')
    setRelationship('')
    setBio('')
    setFatherId('')
    setMotherId('')
    setSpouseId('')
    setNetworkGroup('core')
    setAffiliatedFamilyName('')
    setErrors({})
    setAffiliatedJunctionId('')
    setGender('')
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    setUploadError(null)
    setIsSubmitting(false)
    setDuplicateWarning(null)
    setBypassDuplicate(false)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        // Revoke any pending object URL to prevent memory leak when dialog is cancelled
        if (photoPreview) URL.revokeObjectURL(photoPreview)
        resetForm()
      }
      onOpenChange(open)
    }}>
      <DialogContent className={cn(
        "p-0 gap-0",
        isMobile
          ? "w-screen h-[100dvh] max-h-[100dvh] max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0 flex flex-col"
          : "sm:max-w-[550px] max-h-[90vh]"
      )}>
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            {editingMember ? 'Edit Member' : 'Add Family Member'}
          </DialogTitle>
          <DialogDescription>
            {editingMember
              ? 'Update the details for this family member.'
              : 'Add a new member to your family tree. Fields marked * are required to place them in the tree.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className={isMobile ? "flex-1 min-h-0" : "max-h-[calc(90vh-180px)]"}>
          <form id="add-member-form" onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Notice when editing a node claimed by another user */}
            {photoIsLocked && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs">
                <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                <p className="text-amber-200/90">
                  <span className="font-medium">{editingMember?.name?.split(' ')[0] ?? 'This person'}</span> manages their own profile.
                  You can still update family connections and relationships.
                </p>
              </div>
            )}
            {/* Photo Upload */}
            <div className="flex items-center gap-4">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} disabled={photoIsLocked} />
              <div
                onClick={() => !photoIsLocked && photoInputRef.current?.click()}
                className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed transition-colors overflow-hidden ${photoIsLocked
                  ? 'border-border/30 bg-muted/20 cursor-not-allowed'
                  : 'border-border/50 bg-muted/30 cursor-pointer hover:border-primary/50'
                  }`}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  photoIsLocked
                    ? <Lock className="h-6 w-6 text-muted-foreground/40" />
                    : <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
                )}
                {photoPreview && !photoIsLocked && (
                  <button type="button" onClick={clearPhoto} className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Profile Photo</p>
                {photoIsLocked ? (
                  <p className="text-xs text-amber-400/80 flex items-center gap-1 mt-0.5">
                    <Lock className="h-3 w-3" />
                    {editingMember?.name?.split(' ')[0] ?? 'This person'} manages their own photo
                  </p>
                ) : (
                  <p className="text-xs">Tap to upload (optional)</p>
                )}
              </div>
            </div>

            {/* ── Phase 2: "Already in tree?" quick-select ─────────────────────
                Shown when the relationship implies a known structural slot
                (father/mother/spouse) and siblings/self already have a match. */}
            {!editingMember && quickSelectCandidates.length > 0 && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  Already added by a family member — is it one of these?
                </p>
                <div className="flex flex-wrap gap-2">
                  {quickSelectCandidates.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        // Link the existing node into the correct slot and close
                        if (/father/i.test(relationship)) { setFatherId(m.id) }
                        else if (/mother/i.test(relationship)) { setMotherId(m.id) }
                        else if (/husband|wife|spouse|partner/i.test(relationship)) { setSpouseId(m.id) }
                        // Clear name + warn since we're re-using an existing node
                        setName('')
                        setDuplicateWarning(null)
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/60 transition-colors"
                    >
                      <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                      {m.name}
                      {m.birthYear ? <span className="text-muted-foreground">· {m.birthYear}</span> : null}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Tap a name to link that existing profile — no duplicate created.
                  Or type a new name below if this is a different person.
                </p>
              </div>
            )}

            {/* Basic Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />
                Basic Information
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (errors.name) setErrors(p => ({ ...p, name: '' }))
                      // Clear stale duplicate warning when user edits the name
                      if (duplicateWarning) { setDuplicateWarning(null); setBypassDuplicate(false) }
                    }}
                    placeholder="e.g., John Smith"
                    className={`bg-muted/30 border-border/50 ${errors.name ? 'border-destructive' : exactNameMatch ? 'border-amber-500/60' : ''
                      }`}
                    required
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                  {!errors.name && exactNameMatch && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-500">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>
                        <span className="font-medium">{exactNameMatch.name}</span> is already in this tree
                        {exactNameMatch.relationship ? ` · ${exactNameMatch.relationship}` : ''}
                        {exactNameMatch.birthYear ? ` · b. ${exactNameMatch.birthYear}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Hide 'Relationship to You' when editing self — self cannot have a relationship to self. */}
                {!isEditingSelf && (
                  <div className="space-y-2">
                    <Label htmlFor="relationship" className="flex items-center gap-1">
                      Relationship to You
                      <span className="text-destructive">*</span>
                      <span className="ml-auto text-[10px] font-normal text-muted-foreground">Required for tree placement</span>
                    </Label>
                    <Select
                      value={relationship}
                      onValueChange={(v) => { setRelationship(v); if (errors.relationship) setErrors(p => ({ ...p, relationship: '' })) }}
                    >
                      <SelectTrigger className={`bg-muted/30 border-border/50 ${errors.relationship ? 'border-destructive' : ''}`}>
                        <SelectValue placeholder="Select relationship" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Only show 'Myself' when no self-node exists yet — prevents duplicate self-nodes */}
                        {!existingMembers.some(m =>
                          (m.relationship === 'self' || m.id === selfMemberId) &&
                          m.id !== editingMember?.id
                        ) && (
                            <SelectGroup>
                              <SelectLabel>Self</SelectLabel>
                              <SelectItem value="self">Myself (You)</SelectItem>
                            </SelectGroup>
                          )}
                        <SelectGroup>
                          <SelectLabel>Grandparents</SelectLabel>
                          <SelectItem value="paternal-grandfather">Paternal Grandfather</SelectItem>
                          <SelectItem value="paternal-grandmother">Paternal Grandmother</SelectItem>
                          <SelectItem value="maternal-grandfather">Maternal Grandfather</SelectItem>
                          <SelectItem value="maternal-grandmother">Maternal Grandmother</SelectItem>
                          <SelectItem value="great-grandfather">Great Grandfather</SelectItem>
                          <SelectItem value="great-grandmother">Great Grandmother</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Parents</SelectLabel>
                          <SelectItem value="father">Father</SelectItem>
                          <SelectItem value="mother">Mother</SelectItem>
                          <SelectItem value="stepfather">Stepfather</SelectItem>
                          <SelectItem value="stepmother">Stepmother</SelectItem>
                          <SelectItem value="foster-father">Foster Father</SelectItem>
                          <SelectItem value="foster-mother">Foster Mother</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Siblings</SelectLabel>
                          <SelectItem value="brother">Brother</SelectItem>
                          <SelectItem value="sister">Sister</SelectItem>
                          <SelectItem value="half-brother">Half Brother</SelectItem>
                          <SelectItem value="half-sister">Half Sister</SelectItem>
                          <SelectItem value="stepbrother">Stepbrother</SelectItem>
                          <SelectItem value="stepsister">Stepsister</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Spouse &amp; Partner</SelectLabel>
                          <SelectItem value="husband">Husband</SelectItem>
                          <SelectItem value="wife">Wife</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                          <SelectItem value="ex-husband">Ex Husband</SelectItem>
                          <SelectItem value="ex-wife">Ex Wife</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Children</SelectLabel>
                          <SelectItem value="son">Son</SelectItem>
                          <SelectItem value="daughter">Daughter</SelectItem>
                          <SelectItem value="stepson">Stepson</SelectItem>
                          <SelectItem value="stepdaughter">Stepdaughter</SelectItem>
                          <SelectItem value="adopted-son">Adopted Son</SelectItem>
                          <SelectItem value="adopted-daughter">Adopted Daughter</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Grandchildren</SelectLabel>
                          <SelectItem value="grandson">Grandson</SelectItem>
                          <SelectItem value="granddaughter">Granddaughter</SelectItem>
                          <SelectItem value="great-grandson">Great Grandson</SelectItem>
                          <SelectItem value="great-granddaughter">Great Granddaughter</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Aunts &amp; Uncles</SelectLabel>
                          <SelectItem value="paternal-uncle">Paternal Uncle (Father&apos;s Brother)</SelectItem>
                          <SelectItem value="paternal-aunt">Paternal Aunt (Father&apos;s Sister)</SelectItem>
                          <SelectItem value="maternal-uncle">Maternal Uncle (Mother&apos;s Brother)</SelectItem>
                          <SelectItem value="maternal-aunt">Maternal Aunt (Mother&apos;s Sister)</SelectItem>
                          <SelectItem value="uncle-in-law">Uncle-in-law</SelectItem>
                          <SelectItem value="aunt-in-law">Aunt-in-law</SelectItem>
                          <SelectItem value="great-uncle">Great Uncle</SelectItem>
                          <SelectItem value="great-aunt">Great Aunt</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Cousins</SelectLabel>
                          <SelectItem value="first-cousin">First Cousin</SelectItem>
                          <SelectItem value="second-cousin">Second Cousin</SelectItem>
                          <SelectItem value="third-cousin">Third Cousin</SelectItem>
                          <SelectItem value="first-cousin-once-removed">First Cousin Once Removed</SelectItem>
                          <SelectItem value="cousin-in-law">Cousin-in-law</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Nieces &amp; Nephews</SelectLabel>
                          <SelectItem value="nephew">Nephew</SelectItem>
                          <SelectItem value="niece">Niece</SelectItem>
                          <SelectItem value="grand-nephew">Grand Nephew</SelectItem>
                          <SelectItem value="grand-niece">Grand Niece</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>In-Laws</SelectLabel>
                          <SelectItem value="father-in-law">Father-in-law</SelectItem>
                          <SelectItem value="mother-in-law">Mother-in-law</SelectItem>
                          <SelectItem value="brother-in-law">Brother-in-law</SelectItem>
                          <SelectItem value="sister-in-law">Sister-in-law</SelectItem>
                          <SelectItem value="son-in-law">Son-in-law</SelectItem>
                          <SelectItem value="daughter-in-law">Daughter-in-law</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Other</SelectLabel>
                          <SelectItem value="family-friend">Family Friend</SelectItem>
                          <SelectItem value="godfather">Godfather</SelectItem>
                          <SelectItem value="godmother">Godmother</SelectItem>
                          <SelectItem value="godson">Godson</SelectItem>
                          <SelectItem value="goddaughter">Goddaughter</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {errors.relationship && (
                      <p className="text-xs text-destructive">{errors.relationship}</p>
                    )}
                    {/* Inverse relationship hint — shown once the user picks a relationship */}
                    {relationship && relationship !== 'self' && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                        <ArrowLeftRight className="h-3 w-3 shrink-0" />
                        They will see you as their{' '}
                        <span className="font-medium capitalize text-foreground">
                          {getInverseRelationship(
                            relationship,
                            existingMembers.find(m => m.relationship === 'self')?.gender
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Gender
                    {!editingMember && <span className="text-destructive">*</span>}
                    {!editingMember && <span className="ml-auto text-[10px] font-normal text-muted-foreground">Required for tree colour</span>}
                  </Label>
                  <div className="flex gap-2">
                    {([['male', '♂ Male'], ['female', '♀ Female'], ['other', '⚥ Other']] as const).map(([g, label]) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => { setGender(prev => prev === g ? '' : g); if (errors.gender) setErrors(p => ({ ...p, gender: '' })) }}
                        className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-all ${gender === g
                          ? 'border-primary bg-primary/10 text-primary'
                          : errors.gender
                            ? 'border-destructive/60 bg-destructive/5 text-muted-foreground'
                            : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-border/70'
                          }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {errors.gender && <p className="text-xs text-destructive">{errors.gender}</p>}
                </div>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Dates & Locations */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Dates &amp; Locations
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="birthYear">Birth Year</Label>
                  <Input
                    id="birthYear"
                    type="number"
                    value={birthYear}
                    onChange={(e) => { setBirthYear(e.target.value); if (errors.birthYear) setErrors(p => ({ ...p, birthYear: '' })) }}
                    placeholder="e.g., 1950"
                    className={`bg-muted/30 border-border/50 ${errors.birthYear ? 'border-destructive' : ''}`}
                  />
                  {errors.birthYear && <p className="text-xs text-destructive">{errors.birthYear}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deathYear">Death Year</Label>
                  <Input
                    id="deathYear"
                    type="number"
                    value={deathYear}
                    onChange={(e) => { setDeathYear(e.target.value); if (errors.deathYear) setErrors(p => ({ ...p, deathYear: '' })) }}
                    placeholder="Leave empty if living"
                    className={`bg-muted/30 border-border/50 ${errors.deathYear ? 'border-destructive' : ''}`}
                  />
                  {errors.deathYear && <p className="text-xs text-destructive">{errors.deathYear}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthPlace" className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Birthplace
                  </Label>
                  <Input
                    id="birthPlace"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder="City, Country"
                    className="bg-muted/30 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currentPlace" className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Current Location
                  </Label>
                  <Input
                    id="currentPlace"
                    value={currentPlace}
                    onChange={(e) => setCurrentPlace(e.target.value)}
                    placeholder="City they live in now"
                    className="bg-muted/30 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hometown" className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Native Place
                  </Label>
                  <Input
                    id="hometown"
                    value={hometown}
                    onChange={(e) => setHometown(e.target.value)}
                    placeholder="Native city / hometown"
                    className="bg-muted/30 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="occupation" className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    Occupation
                  </Label>
                  <Input
                    id="occupation"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="e.g., Teacher"
                    className="bg-muted/30 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instagram" className="flex items-center gap-1">
                    <Instagram className="h-3 w-3" />
                    Instagram
                  </Label>
                  <Input
                    id="instagram"
                    value={instagramHandle}
                    onChange={(e) => setInstagramHandle(e.target.value)}
                    placeholder="@username"
                    className="bg-muted/30 border-border/50"
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Connections */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Users className="h-4 w-4" />
                Family Connections
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="father" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Father
                  </Label>
                  <Select value={fatherId} onValueChange={handleFatherChange}>
                    <SelectTrigger className={`bg-muted/30 border-border/50 ${errors.fatherId ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select father" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {existingMembers
                        .slice()
                        .sort((a, b) => (b.gender === 'male' ? 1 : 0) - (a.gender === 'male' ? 1 : 0))
                        .map(member => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}{member.gender === 'male' ? ' ♂' : member.gender === 'female' ? ' ♀' : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.fatherId && <p className="text-xs text-destructive">{errors.fatherId}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mother" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Mother
                  </Label>
                  <Select value={motherId} onValueChange={handleMotherChange}>
                    <SelectTrigger className={`bg-muted/30 border-border/50 ${errors.motherId ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select mother" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {existingMembers
                        .slice()
                        .sort((a, b) => (b.gender === 'female' ? 1 : 0) - (a.gender === 'female' ? 1 : 0))
                        .map(member => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}{member.gender === 'male' ? ' ♂' : member.gender === 'female' ? ' ♀' : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.motherId && <p className="text-xs text-destructive">{errors.motherId}</p>}
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="spouse" className="flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    Spouse
                  </Label>
                  <Select value={spouseId} onValueChange={setSpouseId}>
                    <SelectTrigger className={`bg-muted/30 border-border/50 ${errors.spouseId ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select spouse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {existingMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}{member.gender === 'male' ? ' ♂' : member.gender === 'female' ? ' ♀' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.spouseId && <p className="text-xs text-destructive">{errors.spouseId}</p>}
                </div>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Biography */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bio">Biography / Notes</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share stories, memories, or interesting facts about this person..."
                  rows={4}
                  className="bg-muted/30 border-border/50 resize-none"
                />
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Heritage & Contact */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Hash className="h-4 w-4" />
                Heritage &amp; Contact
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="gotra" className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    Gotra
                  </Label>
                  <Input
                    id="gotra"
                    value={gotra}
                    onChange={(e) => setGotra(e.target.value)}
                    placeholder="e.g., Bharadwaj"
                    className="bg-muted/30 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className={`bg-muted/30 border-border/50 ${errors.phone ? 'border-destructive' : ''}`}
                  />
                  {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={`bg-muted/30 border-border/50 ${errors.email ? 'border-destructive' : ''}`}
                  />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                </div>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Network Tier */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-muted-foreground" />
                Network Tier
              </div>
              <div className="space-y-2">
                <Label>Relationship to main family</Label>
                <Select value={networkGroup} onValueChange={(v) => setNetworkGroup(v as 'core' | 'extended' | 'affiliated')}>
                  <SelectTrigger className="bg-muted/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="core">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                        Core Family (direct blood relative)
                      </span>
                    </SelectItem>
                    <SelectItem value="extended">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-violet-400 inline-block" />
                        Extended Relative (2nd cousin, great-uncle/aunt…)
                      </span>
                    </SelectItem>
                    <SelectItem value="affiliated">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-teal-400 inline-block" />
                        Affiliated Family (in-law relatives, spouse's family)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {networkGroup === 'affiliated' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-2">
                    <Label>Family Name</Label>
                    <Input
                      value={affiliatedFamilyName}
                      onChange={(e) => setAffiliatedFamilyName(e.target.value)}
                      placeholder="e.g. Rao Family"
                      className="bg-muted/30 border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Connects through</Label>
                    <Select value={affiliatedJunctionId} onValueChange={setAffiliatedJunctionId}>
                      <SelectTrigger className="bg-muted/30 border-border/50">
                        <SelectValue placeholder="Select member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {existingMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className={cn(
          "p-6 pt-4 border-t border-border/50 flex-col gap-3",
          isMobile && "sticky bottom-0 bg-background safe-area-pb"
        )}>
          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className={cn(
              'w-full rounded-lg border p-3 text-sm space-y-2.5',
              duplicateWarning.tier === 'high'
                ? 'border-destructive/50 bg-destructive/10'
                : 'border-amber-500/40 bg-amber-500/10'
            )}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', duplicateWarning.tier === 'high' ? 'text-destructive' : 'text-amber-500')} />
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium text-xs', duplicateWarning.tier === 'high' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')}>
                    {duplicateWarning.tier === 'high' ? 'This person likely already exists' : 'Possible duplicate found'}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5 truncate">
                    {duplicateWarning.member.name}
                    {duplicateWarning.member.birthYear ? ` · Born ${duplicateWarning.member.birthYear}` : ''}
                    {duplicateWarning.member.relationship ? ` · ${duplicateWarning.member.relationship}` : ''}
                  </p>
                  {/* Show reason if structural */}
                  {(duplicateWarning as any).reasons?.includes?.('structural_parent') && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Already added as a parent by another family member
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs"
                  onClick={() => { onFocusExisting?.(duplicateWarning.member.id); onOpenChange(false) }}
                >
                  <UserCheck className="h-3 w-3 mr-1" />
                  Open Existing
                </Button>
                {/* "Add Anyway" is only available for fuzzy near-match warnings,
                     never for exact name matches (score === 100) which are hard-blocked. */}
                {duplicateWarning.tier === 'medium' && duplicateWarning.score < 100 && (
                  <Button
                    type="button" variant="ghost" size="sm" className="flex-1 h-7 text-xs"
                    onClick={() => { setDuplicateWarning(null); setBypassDuplicate(true) }}
                  >
                    Add as Different Person
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className={cn('flex gap-2', isMobile && 'flex-row flex-wrap')}>
            {uploadError && (
              <p className="text-xs text-amber-500 mr-auto self-center">{uploadError}</p>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-member-form"
              disabled={isSubmitting || !name.trim() || !!exactNameMatch || duplicateWarning?.tier === 'high'}
              className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
            >
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{editingMember ? 'Saving...' : 'Adding...'}</>
              ) : editingMember ? 'Save Changes' : 'Add Member'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
