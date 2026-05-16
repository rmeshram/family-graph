'use client'

import { useState, useRef, useEffect } from 'react'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { User, Calendar, MapPin, Briefcase, Heart, Users, ImageIcon, X, Instagram, Loader2 } from 'lucide-react'

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingMembers: FamilyMember[]
  onAdd: (member: Omit<FamilyMember, 'id'>) => void
  onUpdate?: (id: string, updates: Partial<FamilyMember>) => Promise<void>
  editingMember?: FamilyMember | null
  familyId?: string
}

export function AddMemberDialog({
  open,
  onOpenChange,
  existingMembers,
  onAdd,
  onUpdate,
  editingMember,
  familyId,
}: AddMemberDialogProps) {
  const supabase = createClient()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [name, setName] = useState('')

  // Pre-populate fields when editing an existing member
  useEffect(() => {
    if (editingMember && open) {
      setName(editingMember.name ?? '')
      setBirthYear(editingMember.birthYear?.toString() ?? '')
      setDeathYear(editingMember.deathYear?.toString() ?? '')
      setBirthPlace(editingMember.birthPlace ?? '')
      setOccupation(editingMember.occupation ?? '')
      setInstagramHandle(editingMember.instagramHandle ?? '')
      setRelationship(editingMember.relationship ?? '')
      setBio(editingMember.bio ?? '')
      setParentId(editingMember.parentIds?.[0] ?? '')
      setSpouseId(editingMember.spouseIds?.[0] ?? '')
      setNetworkGroup((editingMember.networkGroup as 'core' | 'extended' | 'affiliated') ?? 'core')
      setAffiliatedFamilyName(editingMember.affiliatedFamilyName ?? '')
      setAffiliatedJunctionId(editingMember.affiliatedJunctionId ?? '')
      setPhotoPreview(editingMember.photoUrl ?? null)
    }
  }, [editingMember, open])
  const [birthYear, setBirthYear] = useState('')
  const [deathYear, setDeathYear] = useState('')
  const [birthPlace, setBirthPlace] = useState('')
  const [occupation, setOccupation] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [relationship, setRelationship] = useState('')
  const [bio, setBio] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [spouseId, setSpouseId] = useState<string>('')
  const [networkGroup, setNetworkGroup] = useState<'core' | 'extended' | 'affiliated'>('core')
  const [affiliatedFamilyName, setAffiliatedFamilyName] = useState('')
  const [affiliatedJunctionId, setAffiliatedJunctionId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Name is required'
    if (birthYear && (isNaN(+birthYear) || +birthYear < 1800 || +birthYear > new Date().getFullYear()))
      e.birthYear = 'Enter a valid year (1800 – present)'
    if (deathYear && (isNaN(+deathYear) || +deathYear < 1800 || +deathYear > new Date().getFullYear()))
      e.deathYear = 'Enter a valid year'
    if (deathYear && birthYear && +deathYear < +birthYear)
      e.deathYear = 'Must be after birth year'
    if (instagramHandle && !/^[a-zA-Z0-9._]{1,30}$/.test(instagramHandle.replace(/^@/, '')))
      e.instagramHandle = 'Invalid handle (letters, numbers, . _ only)'
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
    setIsSubmitting(true)
    setUploadError(null)

    const parentIds = parentId && parentId !== 'none' ? [parentId] : []
    const spouseIds = spouseId && spouseId !== 'none' ? [spouseId] : []

    const parentMember = existingMembers.find((m) => m.id === parentId)
    const generation = parentMember ? parentMember.generation + 1 : 0

    let uploadedPhotoUrl: string | undefined
    if (photoFile && familyId) {
      const ext = photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${familyId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, photoFile, { upsert: false })
      if (error) {
        setUploadError('Photo upload failed — member will be added without photo.')
      } else {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path)
        uploadedPhotoUrl = data.publicUrl
      }
    }

    const memberData: Omit<FamilyMember, 'id'> = {
      name,
      birthYear: birthYear ? parseInt(birthYear) : undefined,
      deathYear: deathYear ? parseInt(deathYear) : undefined,
      birthPlace: birthPlace || undefined,
      occupation: occupation || undefined,
      instagramHandle: instagramHandle ? instagramHandle.replace(/^@/, '') : undefined,
      relationship,
      bio,
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

    if (editingMember && onUpdate) {
      await onUpdate(editingMember.id, memberData)
    } else {
      onAdd(memberData)
    }

    setIsSubmitting(false)
    resetForm()
    onOpenChange(false)
  }

  const resetForm = () => {
    setName('')
    setBirthYear('')
    setDeathYear('')
    setBirthPlace('')
    setOccupation('')
    setInstagramHandle('')
    setRelationship('')
    setBio('')
    setParentId('')
    setSpouseId('')
    setNetworkGroup('core')
    setAffiliatedFamilyName('')
    setErrors({})
    setAffiliatedJunctionId('')
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    setUploadError(null)
    setIsSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm()
      onOpenChange(open)
    }}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            {editingMember ? 'Edit Member' : 'Add Family Member'}
          </DialogTitle>
          <DialogDescription>
            {editingMember ? 'Update the details for this family member.' : 'Add a new member to your family tree. Fill in as much information as you have.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <form id="add-member-form" onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Photo Upload */}
            <div className="flex items-center gap-4">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              <div
                onClick={() => photoInputRef.current?.click()}
                className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-border/50 bg-muted/30 hover:border-primary/50 transition-colors overflow-hidden"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
                )}
                {photoPreview && (
                  <button type="button" onClick={clearPhoto} className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Profile Photo</p>
                <p className="text-xs">Tap to upload (optional)</p>
              </div>
            </div>

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
                    onChange={(e) => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: '' })) }}
                    placeholder="e.g., John Smith"
                    className={`bg-muted/30 border-border/50 ${errors.name ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="relationship">Relationship to You</Label>
                  <Select value={relationship} onValueChange={setRelationship}>
                    <SelectTrigger className="bg-muted/30 border-border/50">
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Great Grandparent">Great Grandparent</SelectItem>
                      <SelectItem value="Grandparent">Grandparent</SelectItem>
                      <SelectItem value="Parent">Parent</SelectItem>
                      <SelectItem value="Sibling">Sibling</SelectItem>
                      <SelectItem value="You">You</SelectItem>
                      <SelectItem value="Spouse">Spouse</SelectItem>
                      <SelectItem value="Child">Child</SelectItem>
                      <SelectItem value="Aunt/Uncle">Aunt/Uncle</SelectItem>
                      <SelectItem value="Cousin">Cousin</SelectItem>
                      <SelectItem value="Niece/Nephew">Niece/Nephew</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Dates & Places */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Dates & Places
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
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                  <Label htmlFor="parent" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Parent
                  </Label>
                  <Select value={parentId} onValueChange={setParentId}>
                    <SelectTrigger className="bg-muted/30 border-border/50">
                      <SelectValue placeholder="Select parent" />
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
                <div className="space-y-2">
                  <Label htmlFor="spouse" className="flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    Spouse
                  </Label>
                  <Select value={spouseId} onValueChange={setSpouseId}>
                    <SelectTrigger className="bg-muted/30 border-border/50">
                      <SelectValue placeholder="Select spouse" />
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

        <DialogFooter className="p-6 pt-4 border-t border-border/50">
          {uploadError && (
            <p className="text-xs text-amber-500 mr-auto">{uploadError}</p>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-member-form"
            disabled={isSubmitting || !name.trim()}
            className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{editingMember ? 'Saving...' : 'Adding...'}</>
            ) : editingMember ? 'Save Changes' : 'Add Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
