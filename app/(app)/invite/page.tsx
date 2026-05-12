"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft,
  Share2,
  QrCode,
  MessageCircle,
  Copy,
  Check,
  Users,
  Shield,
  Eye,
  Edit3,
  Crown,
  ChevronRight,
  Link as LinkIcon,
  Smartphone,
  UserPlus,
  Clock,
  Trash2,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { useInvites } from "@/hooks/use-invites"
import { useToast } from "@/hooks/use-toast"

const ROLES = [
  {
    value: 'viewer',
    label: 'Viewer',
    description: 'Can view the family tree and members',
    icon: Eye,
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  {
    value: 'contributor',
    label: 'Contributor',
    description: 'Can add members, stories, and memories',
    icon: Edit3,
    color: 'text-green-400 bg-green-500/10 border-green-500/20',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access — can manage all members and permissions',
    icon: Crown,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
]

interface InviteLink {
  id: string
  role: string
  code: string
  createdAt: string
  usedCount: number
  expiresIn: string
}

const SAMPLE_LINKS: InviteLink[] = [
  { id: '1', role: 'contributor', code: 'SHARMA-X7K2P', createdAt: '2024-05-08', usedCount: 3, expiresIn: '7 days' },
  { id: '2', role: 'viewer', code: 'SHARMA-B9R4Q', createdAt: '2024-05-05', usedCount: 8, expiresIn: '30 days' },
]

const FAMILY_TREE_URL = "https://familygraph.app/join/SHARMA-X7K2P"

export default function InvitePage() {
  const { familyId, user } = useAuth()
  const { createInviteLink, getActiveLinks } = useInvites(familyId)
  const { toast } = useToast()
  const [selectedRole, setSelectedRole] = useState<string>('contributor')
  const [expiresIn, setExpiresIn] = useState('7')
  const [copied, setCopied] = useState(false)
  const [whatsappCopied, setWhatsappCopied] = useState(false)
  const [links, setLinks] = useState<InviteLink[]>(SAMPLE_LINKS)
  const [activeUrl, setActiveUrl] = useState(FAMILY_TREE_URL)
  const [isGenerating, setIsGenerating] = useState(false)

  const inviteUrl = activeUrl
  const whatsappMessage = encodeURIComponent(
    `🌳 Join our Family Graph!\n\nHi! I'm building a digital family tree for our family. Join us to view, add memories, and connect with family members.\n\nClick to join: ${inviteUrl}\n\n_Sent via Family Graph App_`
  )
  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`

  const handleGenerateLink = async () => {
    if (!familyId || !user) {
      toast({ title: 'Demo mode', description: 'Sign in to create real invite links.' })
      return
    }
    setIsGenerating(true)
    try {
      const expiryHours = expiresIn === 'never' ? 24 * 365 : parseInt(expiresIn) * 24
      const link = await createInviteLink(selectedRole as 'contributor' | 'viewer' | 'admin', expiryHours, user.id)
      const url = `${location.origin}/join/${link.code}`
      setActiveUrl(url)
      const newLink: InviteLink = {
        id: link.id,
        role: link.role,
        code: link.code,
        createdAt: new Date(link.created_at).toLocaleDateString('en-IN'),
        usedCount: 0,
        expiresIn: expiresIn === 'never' ? 'Never' : `${expiresIn} day${expiresIn !== '1' ? 's' : ''}`,
      }
      setLinks(prev => [newLink, ...prev])
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast({ title: 'Invite link created!', description: 'Link copied to clipboard.' })
    } catch (e) {
      toast({ title: 'Error', description: String(e), variant: 'destructive' })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: 'Copied!', description: 'Invite link copied to clipboard.' })
  }

  const handleShareWhatsApp = () => {
    setWhatsappCopied(true)
    setTimeout(() => setWhatsappCopied(false), 2000)
    window.open(whatsappUrl, '_blank')
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/95 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20">
            <UserPlus className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Invite Family</h1>
            <p className="text-xs text-muted-foreground">Grow your family tree together</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-6 p-4 pb-12">

          {/* Hero */}
          <div className="rounded-2xl bg-gradient-to-br from-green-600/10 via-emerald-600/5 to-teal-600/10 border border-green-500/20 p-6 text-center">
            <div className="flex h-16 w-16 mx-auto mb-3 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20">
              <Users className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-xl font-bold">Bring Your Family Together</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Share a link or QR code. Family members join in one tap — no app download needed.
            </p>
            <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">✅ No signup required for viewers</span>
              <span className="flex items-center gap-1">✅ Works on any phone</span>
              <span className="flex items-center gap-1">✅ WhatsApp friendly</span>
            </div>
          </div>

          {/* Role Selector */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Select Permission Level</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ROLES.map(role => (
                <button
                  key={role.value}
                  onClick={() => setSelectedRole(role.value)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
                    selectedRole === role.value
                      ? `${role.color} border-current`
                      : "border-border/50 bg-card hover:border-primary/30"
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <role.icon className={cn("h-4 w-4", selectedRole === role.value ? "" : "text-muted-foreground")} />
                    {selectedRole === role.value && (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <span className="font-medium text-sm">{role.label}</span>
                  <span className="text-xs text-muted-foreground leading-tight">{role.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Expiry */}
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <Label className="text-sm text-muted-foreground w-24 shrink-0">Link expires:</Label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">24 hours</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Share Methods */}
          <Tabs defaultValue="link" className="space-y-4">
            <TabsList className="bg-muted/50 w-full">
              <TabsTrigger value="link" className="flex-1 gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" />
                Link
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="flex-1 gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="qr" className="flex-1 gap-1.5">
                <QrCode className="h-3.5 w-3.5" />
                QR Code
              </TabsTrigger>
            </TabsList>

            {/* Link Tab */}
            <TabsContent value="link" className="space-y-3 mt-0">
              <div className="flex gap-2">
                <div className="flex-1 rounded-xl border border-border/50 bg-muted/50 px-3 py-2.5 font-mono text-xs text-muted-foreground truncate">
                  {inviteUrl}
                </div>
                <Button onClick={handleCopyLink} size="sm" className="shrink-0 gap-1.5">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can join as a <strong>{selectedRole}</strong>. Link expires in {expiresIn === 'never' ? 'never' : `${expiresIn} day${expiresIn !== '1' ? 's' : ''}`}.
              </p>
            </TabsContent>

            {/* WhatsApp Tab */}
            <TabsContent value="whatsapp" className="space-y-4 mt-0">
              <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-emerald-500/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">WhatsApp Invite</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Share directly to WhatsApp with a pre-written message</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl bg-card border border-border/50 p-3 text-xs text-muted-foreground">
                  <p>🌳 <strong>Join our Family Graph!</strong></p>
                  <p className="mt-1">Hi! I'm building a digital family tree for the Sharma-Mishra family. Join us to view, add memories, and connect with family members.</p>
                  <p className="mt-1 text-primary">Click to join: {FAMILY_TREE_URL}</p>
                  <p className="mt-1 text-muted-foreground/60 italic">Sent via Family Graph App</p>
                </div>
                <Button
                  onClick={handleShareWhatsApp}
                  className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  {whatsappCopied ? 'Opening WhatsApp...' : 'Share on WhatsApp'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="flex items-center gap-2 rounded-xl border border-border/50 bg-card p-3 text-sm hover:border-primary/30 transition-colors">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  Share to any app
                </button>
                <button className="flex items-center gap-2 rounded-xl border border-border/50 bg-card p-3 text-sm hover:border-primary/30 transition-colors">
                  <Copy className="h-4 w-4 text-muted-foreground" />
                  Copy message
                </button>
              </div>
            </TabsContent>

            {/* QR Code Tab */}
            <TabsContent value="qr" className="space-y-4 mt-0">
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/50 bg-card p-6">
                <div className="relative rounded-2xl bg-white p-3 shadow-inner">
                  <QRCodeSVG
                    value={inviteUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/join/DEMO`}
                    size={176}
                    bgColor="#ffffff"
                    fgColor="#111827"
                    level="H"
                    imageSettings={{
                      src: '/manifest.json',
                      x: undefined,
                      y: undefined,
                      height: 36,
                      width: 36,
                      opacity: 0,
                      excavate: true,
                    }}
                  />
                  {/* Center logo overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-md">
                      <Users className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-semibold">
                    {inviteUrl ? 'Invite QR Code' : 'Generate a link first'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Scan to join the family tree</p>
                  {inviteUrl && (
                    <Badge variant="outline" className="mt-2 font-mono text-xs">
                      {inviteUrl.split('/').pop()?.toUpperCase()}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: 'Join our family tree', url: inviteUrl })
                      }
                    }}
                    disabled={!inviteUrl}
                  >
                    <Share2 className="h-4 w-4" />
                    Share QR
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      const svg = document.querySelector('.qr-container svg') as SVGElement
                      if (!svg) return
                      const svgData = new XMLSerializer().serializeToString(svg)
                      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
                      const url = URL.createObjectURL(svgBlob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'family-invite-qr.svg'
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    disabled={!inviteUrl}
                  >
                    <Copy className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Print this QR code for family events, weddings, and reunions 🎉
              </p>
            </TabsContent>
          </Tabs>

          {/* Guided Flow */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Guided Onboarding Flow</h3>
            <div className="space-y-2">
              {[
                { step: 1, label: "They open the invite link", icon: LinkIcon, desc: "One-tap on any device" },
                { step: 2, label: "Enter their name & basic info", icon: UserPlus, desc: "30 seconds setup" },
                { step: 3, label: "Guided: Add their parents & siblings", icon: Users, desc: "AI helps connect the graph" },
                { step: 4, label: "Ready! They can view & contribute", icon: Check, desc: "Join the family network" },
              ].map(item => (
                <div key={item.step} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {item.step}
                  </div>
                  <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Existing Links */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Active Invite Links</h3>
            <div className="space-y-2">
              {links.map(link => {
                const role = ROLES.find(r => r.value === link.role)!
                return (
                  <div key={link.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
                    <role.icon className={cn("h-4 w-4 shrink-0", role.color.split(' ')[0])} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{link.code}</span>
                        <Badge variant="outline" className={cn("text-[10px] py-0 h-4", role.color)}>
                          {link.role}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {link.usedCount} used · Expires in {link.expiresIn} · Created {link.createdAt}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-1" onClick={handleGenerateLink} disabled={isGenerating}>
                <RefreshCw className="h-3.5 w-3.5" />
                {isGenerating ? 'Generating...' : 'Generate New Link'}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
