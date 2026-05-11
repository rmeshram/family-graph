'use client'

import { useState } from 'react'
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
import { User, Calendar, MapPin, Briefcase, Heart, Users } from 'lucide-react'

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingMembers: FamilyMember[]
  onAdd: (member: Omit<FamilyMember, 'id'>) => void
}

export function AddMemberDialog({
  open,
  onOpenChange,
  existingMembers,
  onAdd,
}: AddMemberDialogProps) {
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [deathYear, setDeathYear] = useState('')
  const [birthPlace, setBirthPlace] = useState('')
  const [occupation, setOccupation] = useState('')
  const [relationship, setRelationship] = useState('')
  const [bio, setBio] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [spouseId, setSpouseId] = useState<string>('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const parentIds = parentId && parentId !== 'none' ? [parentId] : []
    const spouseIds = spouseId && spouseId !== 'none' ? [spouseId] : []
    
    const parentMember = existingMembers.find((m) => m.id === parentId)
    const generation = parentMember ? parentMember.generation + 1 : 0

    onAdd({
      name,
      birthYear: birthYear ? parseInt(birthYear) : undefined,
      deathYear: deathYear ? parseInt(deathYear) : undefined,
      birthPlace: birthPlace || undefined,
      occupation: occupation || undefined,
      relationship,
      bio,
      parentIds,
      spouseIds,
      generation,
    })

    resetForm()
    onOpenChange(false)
  }

  const resetForm = () => {
    setName('')
    setBirthYear('')
    setDeathYear('')
    setBirthPlace('')
    setOccupation('')
    setRelationship('')
    setBio('')
    setParentId('')
    setSpouseId('')
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
            Add Family Member
          </DialogTitle>
          <DialogDescription>
            Add a new member to your family tree. Fill in as much information as you have.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., John Smith"
                    className="bg-muted/30 border-border/50"
                    required
                  />
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
                    onChange={(e) => setBirthYear(e.target.value)}
                    placeholder="e.g., 1950"
                    className="bg-muted/30 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deathYear">Death Year</Label>
                  <Input
                    id="deathYear"
                    type="number"
                    value={deathYear}
                    onChange={(e) => setDeathYear(e.target.value)}
                    placeholder="Leave empty if living"
                    className="bg-muted/30 border-border/50"
                  />
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
          </form>
        </ScrollArea>

        <DialogFooter className="p-6 pt-4 border-t border-border/50">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            onClick={handleSubmit}
            className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
          >
            Add Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
