'use client'

import { useRef, useState, useCallback } from 'react'
import { Download, Share2, Users, TreePine, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMembers } from '@/hooks/use-members'
import { useAuth } from '@/hooks/use-auth'
import { sampleFamilyMembers } from '@/lib/sample-data'
import { FamilyMember } from '@/lib/types'
import { DemoBanner } from '@/components/demo-banner'
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      padding: '8px 8px',
      borderRadius: 12,
      border: `1px solid ${isDeceased ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.4)'}`,
      background: isDeceased ? 'rgba(30,41,59,0.4)' : 'rgba(30,41,59,0.8)',
      opacity: isDeceased ? 0.7 : 1,
      minWidth: 80,
      maxWidth: 96,
    }}>
      <div style={{
        height: 40, width: 40, borderRadius: '50%',
        border: '2px solid rgba(99,102,241,0.5)',
        background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 12, color: '#fff', flexShrink: 0,
      }}>
        {getInitials(member.name)}
      </div>
      <p style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, color: '#f1f5f9', margin: 0 }}>
        {member.name.split(' ')[0]}
      </p>
      {member.birthYear && (
        <p style={{ fontSize: 8, color: '#94a3b8', margin: 0 }}>
          {member.birthYear}{isDeceased ? `–${member.deathYear}` : ''}
        </p>
      )}
    </div>
  )
}

export default function PosterPage() {
  const { user, familyId, loading: authLoading } = useAuth()
  const { members: dbMembers, loading } = useMembers(familyId)
  const isDemoMode = !authLoading && !user
  const members = isDemoMode ? sampleFamilyMembers : (familyId && !loading ? dbMembers : [])
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
        imageTimeout: 5000,
        // allowTaint intentionally omitted — taints canvas and breaks toDataURL
        ignoreElements: (el) => el.hasAttribute('data-html2canvas-ignore'),
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

  const handleWhatsAppShare = useCallback(async () => {
    // Try to share the actual image via Web Share API (mobile)
    try {
      if (posterRef.current) {
        const html2canvas = (await import('html2canvas')).default
        const canvas = await html2canvas(posterRef.current!, {
          backgroundColor: '#0F172A',
          scale: 2,
          useCORS: true,
          logging: false,
          ignoreElements: (el) => el.hasAttribute('data-html2canvas-ignore'),
        })
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
        if (blob && navigator.share) {
          await navigator.share({
            files: [new File([blob], `${familyName}-family-poster.png`, { type: 'image/png' })],
            title: `${familyName} Family Tree`,
          })
          return
        }
      }
    } catch {
      // fall through to text link share
    }
    // Fallback: share link via WhatsApp
    const text = encodeURIComponent(
      `🌳 The ${familyName} Family Tree — explore our heritage at ${window.location.origin}/dashboard`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
  }, [familyName])

  return (
    <div className="flex flex-col min-h-screen bg-background overflow-x-hidden">
      <DemoBanner />
      {/* Controls */}
      <div data-html2canvas-ignore className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-md px-6 py-3">
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
          {/* Decorative blobs — ignored by html2canvas (CSS filter unsupported) */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" data-html2canvas-ignore>
            <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" />
          </div>

          {/* Header */}
          <div className="relative text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-3">
              <Heart style={{ height: 20, width: 20, color: '#fb7185' }} />
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(251,113,133,0.8)', fontWeight: 500 }}>Family Tree</span>
              <Heart style={{ height: 20, width: 20, color: '#fb7185' }} />
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
              The {familyName} Family
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              {members.length} members across {generations.length} generations
            </p>
          </div>

          {/* Generations */}
          <div className="relative space-y-8">
            {generations.map(([gen, genMembers]) => (
              <div key={gen}>
                <div className="flex items-center gap-3 mb-3">
                  <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.1)' }} />
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                    {gen < 0
                      ? `${Math.abs(gen)} generation${Math.abs(gen) > 1 ? 's' : ''} back`
                      : gen === 0
                        ? 'Your generation'
                        : `Generation +${gen}`}
                  </span>
                  <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.1)' }} />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
              <Users style={{ height: 12, width: 12 }} />
              <span>Made with Outverse • outverse.in</span>
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  )
}
