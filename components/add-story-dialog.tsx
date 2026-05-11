'use client'

import { useState } from 'react'
import { FamilyMember, Story } from '@/lib/types'
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
import { Sparkles, Loader2 } from 'lucide-react'

interface AddStoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: FamilyMember | null
  onAdd: (memberId: string, story: Omit<Story, 'id' | 'createdAt'>) => void
}

export function AddStoryDialog({
  open,
  onOpenChange,
  member,
  onAdd,
}: AddStoryDialogProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [author, setAuthor] = useState('')
  const [date, setDate] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return

    onAdd(member.id, {
      title,
      content,
      author: author || undefined,
      date: date || undefined,
    })

    resetForm()
    onOpenChange(false)
  }

  const resetForm = () => {
    setTitle('')
    setContent('')
    setAuthor('')
    setDate('')
  }

  const handleAIGenerate = async () => {
    if (!member) return
    
    setIsGenerating(true)
    
    // Simulated AI generation for MVP
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const aiStories = [
      {
        title: `A Day in the Life of ${member.name.split(' ')[0]}`,
        content: `${member.name} was known for ${member.occupation ? `their work as a ${member.occupation.toLowerCase()}` : 'their warm personality'}. ${member.bio || 'Their legacy lives on through the stories passed down in our family.'} Those who knew them remember their kindness and the way they always made time for family gatherings.`,
      },
      {
        title: `${member.name.split(' ')[0]}'s Wisdom`,
        content: `Growing up ${member.birthPlace ? `in ${member.birthPlace}` : 'with a strong sense of community'}, ${member.name} learned valuable lessons that they passed on to future generations. ${member.bio || 'Their guidance shaped our family values.'} Their words of wisdom still resonate with us today.`,
      },
      {
        title: `Memories of ${member.name.split(' ')[0]}`,
        content: `${member.name} had a way of making everyone feel special. ${member.birthYear ? `Born in ${member.birthYear}, they` : 'They'} witnessed remarkable changes in the world, yet always stayed true to their roots. ${member.occupation ? `Their career as a ${member.occupation.toLowerCase()} taught them` : 'Life taught them'} the importance of hard work and dedication.`,
      },
    ]
    
    const randomStory = aiStories[Math.floor(Math.random() * aiStories.length)]
    setTitle(randomStory.title)
    setContent(randomStory.content)
    setIsGenerating(false)
  }

  if (!member) return null

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm()
      onOpenChange(open)
    }}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Add Story for {member.name}</DialogTitle>
          <DialogDescription>
            Share a memory, anecdote, or piece of family history about {member.name.split(' ')[0]}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="title">Story Title *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAIGenerate}
                disabled={isGenerating}
                className="gap-2 text-xs"
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 text-accent" />
                )}
                {isGenerating ? 'Generating...' : 'AI Generate'}
              </Button>
            </div>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., The Summer of '75"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Story *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share the story, memory, or anecdote..."
              rows={6}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="author">Written By</Label>
              <Input
                id="author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date of Event</Label>
              <Input
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="e.g., Summer 1975"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Story</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
