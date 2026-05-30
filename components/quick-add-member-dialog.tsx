'use client'

import { useState } from 'react'
import { AlertTriangle, UserCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import type { FamilyMember } from '@/lib/types'
import { scoreCandidate, normalizeStoredName, findExactNameMatch } from '@/lib/match-detection'

export type QuickRelType = 'father' | 'mother' | 'spouse' | 'child' | 'sibling'

export const QUICK_REL_LABELS: Record<QuickRelType, string> = {
  father: 'Father',
  mother: 'Mother',
  spouse: 'Spouse / Partner',
  child: 'Child',
  sibling: 'Brother / Sister',
}

// Short labels for the pill selector
const REL_PILL_LABELS: Record<QuickRelType, string> = {
  father: 'Father',
  mother: 'Mother',
  spouse: 'Spouse',
  child: 'Child',
  sibling: 'Sibling',
}

const DEFAULT_GENDER: Record<QuickRelType, 'male' | 'female' | 'other' | ''> = {
  father: 'male',
  mother: 'female',
  spouse: '',
  child: '',
  sibling: '',
}

const ALL_REL_TYPES: QuickRelType[] = ['father', 'mother', 'spouse', 'child', 'sibling']

type DuplicateWarning = { member: FamilyMember; score: number; tier: 'high' | 'medium' }

interface QuickAddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  relType: QuickRelType
  anchorMember: FamilyMember
  /** All current family members — used to detect duplicates before creation. */
  existingMembers?: FamilyMember[]
  /** Called when user picks an existing node instead of creating a duplicate. */
  onFocusExisting?: (id: string) => void
  /**
   * When provided, the duplicate-warning UI shows a "Use as [RelType]" button
   * that links the anchor to the existing node (patches parentIds / spouseIds)
   * instead of creating a second node. The handler is responsible for persisting
   * the change; the dialog will close itself afterwards.
   */
  onLinkExisting?: (existingId: string) => Promise<void>
  onAdd: (
    name: string,
    gender: 'male' | 'female' | 'other' | '',
    birthYear: string,
    relType: QuickRelType,
    anchorId: string
  ) => Promise<void>
}

export function QuickAddMemberDialog({
  open,
  onOpenChange,
  relType: initialRelType,
  anchorMember,
  existingMembers,
  onFocusExisting,
  onLinkExisting,
  onAdd,
}: QuickAddMemberDialogProps) {
  const [relType, setRelType] = useState<QuickRelType>(initialRelType)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>(DEFAULT_GENDER[initialRelType])
  const [birthYear, setBirthYear] = useState('')
  const [nameError, setNameError] = useState('')
  const [birthYearError, setBirthYearError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null)

  const handleRelTypeChange = (type: QuickRelType) => {
    setRelType(type)
    // Auto-update gender default when the user switches relation type,
    // but only if they haven't explicitly made a choice yet.
    setGender(prev => {
      const wasDefault = Object.entries(DEFAULT_GENDER).some(([, v]) => v === prev)
      return wasDefault ? DEFAULT_GENDER[type] : prev
    })
    setDuplicateWarning(null)
  }

  const reset = () => {
    setRelType(initialRelType)
    setName('')
    setGender(DEFAULT_GENDER[initialRelType])
    setBirthYear('')
    setNameError('')
    setBirthYearError('')
    setIsSubmitting(false)
    setSubmitError(null)
    setDuplicateWarning(null)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) reset()
    onOpenChange(open)
  }

  const validate = () => {
    let valid = true
    if (!name.trim()) {
      setNameError('Name is required')
      valid = false
    } else {
      setNameError('')
    }
    if (birthYear) {
      const y = parseInt(birthYear)
      if (isNaN(y) || y < 1800 || y > new Date().getFullYear()) {
        setBirthYearError('Enter a valid year (1800–present)')
        valid = false
      } else {
        setBirthYearError('')
      }
    } else {
      setBirthYearError('')
    }
    return valid
  }

  const doAdd = async (submittedName: string) => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await onAdd(submittedName, gender, birthYear, relType, anchorMember.id)
      handleOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setSubmitError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    if (!validate() || isSubmitting) return

    const storedName = normalizeStoredName(name)

    if (existingMembers?.length) {
      // 1. Hard block: exact name match — no bypass.
      const exactMatch = findExactNameMatch(existingMembers, storedName, anchorMember.id)
      if (exactMatch) {
        setDuplicateWarning({ member: exactMatch as FamilyMember, score: 100, tier: 'high' })
        return
      }

      // 2. Soft warning: fuzzy / contact-info match — user may bypass.
      if (!duplicateWarning) {
        let bestMatch: DuplicateWarning | null = null
        for (const m of existingMembers) {
          if (m.id === anchorMember.id) continue
          const result = scoreCandidate(
            {
              nodeId: m.id, nodeName: m.name, familyId: '', familyName: '',
              addedByName: null, relationship: m.relationship ?? null,
              birthYear: m.birthYear ?? null, phone: m.phone ?? null, email: m.email ?? null,
            },
            { name: storedName, birthYear: birthYear ? parseInt(birthYear) : null }
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

    await doAdd(storedName)
  }

  const anchorFirstName = anchorMember.name.split(' ')[0]
  const label = REL_PILL_LABELS[relType]
  const fullLabel = QUICK_REL_LABELS[relType]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add a Relative for {anchorFirstName}</DialogTitle>
          <DialogDescription>
            Choose the relationship type, enter their name, and fill in optional details later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">

          {/* ── Relationship type picker ── */}
          <div className="space-y-2">
            <Label>Relation to {anchorFirstName}</Label>
            <div className="grid grid-cols-5 gap-1">
              {ALL_REL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleRelTypeChange(type)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-all ${relType === type
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-border/70 hover:text-foreground'
                    }`}
                >
                  {REL_PILL_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="qa-name">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qa-name"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError('') }}
              placeholder={`e.g., ${relType === 'father' ? 'Rajesh Kumar' : relType === 'mother' ? 'Sunita Devi' : 'Name'}`}
              autoFocus
              className={nameError ? 'border-destructive' : ''}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          {/* Gender */}
          <div className="space-y-2">
            <Label>Gender <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <div className="flex gap-2">
              {([['male', '♂ Male'], ['female', '♀ Female'], ['other', '⚥ Other']] as const).map(([g, lbl]) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(prev => prev === g ? '' : g)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-all ${gender === g
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-border/70'
                    }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Birth Year */}
          <div className="space-y-2">
            <Label htmlFor="qa-birth">Birth Year <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="qa-birth"
              type="number"
              value={birthYear}
              onChange={(e) => { setBirthYear(e.target.value); if (birthYearError) setBirthYearError('') }}
              placeholder="e.g., 1950"
              className={birthYearError ? 'border-destructive' : ''}
            />
            {birthYearError && <p className="text-xs text-destructive">{birthYearError}</p>}
          </div>

          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className={`rounded-lg border p-3 text-sm space-y-2.5 ${duplicateWarning.tier === 'high'
              ? 'border-destructive/50 bg-destructive/10'
              : 'border-amber-500/40 bg-amber-500/10'
              }`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${duplicateWarning.tier === 'high' ? 'text-destructive' : 'text-amber-500'
                  }`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-xs ${duplicateWarning.tier === 'high' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
                    }`}>
                    {duplicateWarning.tier === 'high' ? 'This person likely already exists' : 'Possible duplicate found'}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5 truncate">
                    {duplicateWarning.member.name}
                    {duplicateWarning.member.birthYear ? ` · Born ${duplicateWarning.member.birthYear}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs"
                  disabled={isLinking}
                  onClick={async () => {
                    if (onLinkExisting) {
                      setIsLinking(true)
                      try {
                        await onLinkExisting(duplicateWarning.member.id)
                      } finally {
                        setIsLinking(false)
                      }
                      handleOpenChange(false)
                    } else {
                      onFocusExisting?.(duplicateWarning.member.id)
                      handleOpenChange(false)
                    }
                  }}
                >
                  {isLinking ? <Spinner className="h-3 w-3 mr-1" /> : <UserCheck className="h-3 w-3 mr-1" />}
                  {onLinkExisting ? `Use as ${label}` : 'Open Existing'}
                </Button>
                {/* 'Add as Different Person' only for fuzzy warnings, never for exact-name hard-blocks. */}
                {duplicateWarning.tier === 'medium' && duplicateWarning.score < 100 && (
                  <Button
                    type="button" variant="ghost" size="sm" className="flex-1 h-7 text-xs"
                    disabled={isSubmitting || isLinking}
                    onClick={() => { setDuplicateWarning(null); doAdd(normalizeStoredName(name)) }}
                  >
                    {isSubmitting ? <Spinner className="h-3 w-3" /> : 'Add as Different Person'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {submitError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <p className="text-xs text-destructive">{submitError}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting || !!duplicateWarning}>
              {isSubmitting ? <Spinner className="h-4 w-4" /> : `Add ${label}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
