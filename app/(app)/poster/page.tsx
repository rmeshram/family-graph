'use client'

import { useRef, useState, useCallback } from 'react'
import { Download, Share2, Users, TreePine, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useMembers } from '@/hooks/use-members'
import { useAuth } from '@/hooks/use-auth'
import { sampleFamilyMembers } from '@/lib/sample-data'
import { FamilyMember } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'

// Group members by generation
function groupByGeneration(members: FamilyMember[]) {
  const map = new Map<number, FamilyMember[]>()
  members.forEach((m) => {
    if (!map.has(m.generation)) map.set(m.generation, [])
    map.get(m.generation)!.push(m)
  })
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function PosterCard({ member }: { member: FamilyMember }) {
  const isDeceased = !!member.deathYear
  return (
    <div className={cn(
      'flex flex-col items-center gap-1 px-2 py-2 rounded-xl border min-w-[80px] max-w-[96px]',
      isDeceased ? 'bg-muted/30 border-border/30 opacity-70' : 'bg-card/80 border-border/50'
    )}>
      <Avatar className="h-10 w-10 border-2 border-primary/30">
        <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-primary/60 to-secondary/60 text-primary-foreground">
          {getInitials(member.name)}
        </AvatarFallback>
      </Avatar>
      <p className="text-[10px] font-semibold text-center leading-tight line-clamp-2">
        {member.name.split(' ')[0]}
      </p>
      {member.birthYear && (
        <p className="text-[8px] text-muted-foreground">
          {member.birthYear}{isDeceased ? `–${member.deathYear}` : ''}
        </p>
      )}
    </div>
  )
}

export default function PosterPage() {
  const { user, familyId } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const members = familyId && !loading ? dbMembers : sampleFamilyMembers
  const generations = groupByGeneration(members)

  const posterRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const { toast } = useToast()

  const familyName =
    members.find(m => m.relationship === 'self')?.name.split(' ').pop() ??
    'Our Family'

  const handleDownload = useCallback(async () => {
    setDownloading(true)
    try {
      // Dynamically import html2canvas only when needed
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(posterRef.current!, {
        backgroundColor: '#0F172A',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `${familyName.replace(/\s+/g, '-')}-family-tree.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      toast({ title: 'Poster downloaded!', description: 'Share it with your family on WhatsApp or Instagram.' })
    } catch {
      toast({ title: 'Download failed', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setDownloading(false)
    }
  }, [familyName, toast])

  const handleWhatsAppShare = useCallback(() => {
    const text = encodeURIComponent(
      `🌳 The ${familyName} Family Tree — explore our heritage at ${window.location.origin}/dashboard`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
  }, [familyName])

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Controls */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-md px-6 py-3">
        <div className="flex items-center gap-2">
          <TreePine className="h-5 w-5 text-primary" />
          <span className="font-semibold">Family Poster</span>
          <Badge variant="secondary" className="text-xs">{members.length} members</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleWhatsAppShare}>
            <Share2 className="h-4 w-4 mr-2" />
            WhatsApp
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={downloading}>
            <Download className="h-4 w-4 mr-2" />
            {downloading ? 'Generating…' : 'Download PNG'}
          </Button>
        </div>
      </div>

      {/* Poster canvas */}
      <div className="flex-1 flex items-start justify-center p-8 overflow-auto">
        <div
          ref={posterRef}
          className="relative rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #0F172A 100%)',
            minWidth: 760,
            maxWidth: 960,
            width: '100%',
            padding: '48px 40px',
          }}
        >
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" />
          </div>

          {/* Header */}
          <div className="relative text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-3">
              <Heart className="h-5 w-5 text-rose-400" />
              <span className="text-xs uppercase tracking-widest text-rose-400/80 font-medium">Family Tree</span>
              <Heart className="h-5 w-5 text-rose-400" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-1">
              The {familyName} Family
            </h1>
            <p className="text-sm text-white/50">
              {members.length} members across {generations.length} generations
            </p>
          </div>

          {/* Generations */}
          <div className="relative space-y-8">
            {generations.map(([gen, genMembers]) => (
              <div key={gen}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">
                    {gen < 0
                      ? `${Math.abs(gen)} generation${Math.abs(gen) > 1 ? 's' : ''} back`
                      : gen === 0
                        ? 'Your generation'
                        : `Generation +${gen}`}
                  </span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {genMembers.map((m) => (
                    <PosterCard key={m.id} member={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="relative mt-10 text-center">
            <div className="flex items-center justify-center gap-2 text-white/30 text-[10px]">
              <Users className="h-3 w-3" />
              <span>Made with Family Graph • family-graph-app-phi.vercel.app</span>
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  )
}
