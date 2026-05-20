'use client'

import { useState, useEffect, useCallback } from 'react'
import { copyToClipboard } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Download, Upload, Trash2, Shield, Bell, Palette, Database, Users, Crown, Eye, Edit3, Lock, Globe, Link2, Unlink, CheckCircle2, Clock, XCircle, Loader2, Copy, Share2, AlertCircle, UserCheck,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

interface FamilyProfile {
  id: string
  display_name: string | null
  role: string
  avatar_url: string | null
}

function usePref(key: string, def: boolean) {
  const [val, setVal] = useState<boolean>(() => {
    if (typeof window === 'undefined') return def
    const stored = localStorage.getItem(`fg-pref-${key}`)
    return stored !== null ? stored === '1' : def
  })
  const toggle = (v: boolean) => {
    setVal(v)
    localStorage.setItem(`fg-pref-${key}`, v ? '1' : '0')
    window.dispatchEvent(new CustomEvent('fg-pref-change', { detail: { key, value: v } }))
  }
  return [val, toggle] as const
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onExport?: () => void
  onImport?: () => void
}

export function SettingsDialog({ open, onOpenChange, onExport, onImport }: SettingsDialogProps) {
  const isMobile = useIsMobile()
  const { user, profile, familyId, loading: authLoading } = useAuth()
  const supabase = createClient()
  const isAdmin = (profile as any)?.role === 'admin'

  // Persistent preferences
  const [showDeceased, setShowDeceased] = usePref('showDeceased', true)
  const [showBirthplaces, setShowBirthplaces] = usePref('showBirthplaces', true)
  const [birthdayNotifs, setBirthdayNotifs] = usePref('birthdayNotifs', true)
  const [anniversaryNotifs, setAnniversaryNotifs] = usePref('anniversaryNotifs', false)

  // Connected families
  const [linkedData, setLinkedData] = useState<{
    incoming: any[]
    outgoing: any[]
    accepted: any[]
  }>({ incoming: [], outgoing: [], accepted: [] })
  const [loadingLinked, setLoadingLinked] = useState(false)
  const [linkedTab, setLinkedTab] = useState<'incoming' | 'outgoing' | 'accepted'>('incoming')
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fetchLinkedData = useCallback(async () => {
    if (!familyId) return
    setLoadingLinked(true)
    try {
      const res = await fetch('/api/family-links/pending')
      if (res.ok) setLinkedData(await res.json())
    } catch { }
    setLoadingLinked(false)
  }, [familyId])

  const respondToLink = async (id: string, action: 'accept' | 'reject') => {
    setRespondingId(id)
    try {
      const res = await fetch(`/api/family-links/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message ?? data.error ?? `Failed to ${action} link`)
      }
      await fetchLinkedData()
      toast.success(action === 'accept' ? 'Family link accepted' : 'Family link rejected')
    } catch (err: any) {
      toast.error(err?.message ?? `Could not ${action} link`)
    } finally {
      setRespondingId(null)
    }
  }

  const revokeLink = async (id: string) => {
    setRevokingId(id)
    try {
      const res = await fetch(`/api/family-links/${id}/revoke`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message ?? data.error ?? 'Failed to revoke link')
      }
      await fetchLinkedData()
      toast.success('Family link revoked')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not revoke link')
    } finally {
      setRevokingId(null)
    }
  }

  // Privacy mode
  const [privacyMode, setPrivacyMode] = useState<'open' | 'protected' | 'closed'>('protected')
  const [savingPrivacy, setSavingPrivacy] = useState(false)

  const fetchPrivacyMode = useCallback(async () => {
    if (!familyId) return
    const { data } = await supabase.from('families').select('privacy_mode').eq('id', familyId).single()
    if ((data as any)?.privacy_mode) setPrivacyMode((data as any).privacy_mode as 'open' | 'protected' | 'closed')
  }, [familyId, supabase])

  const savePrivacyMode = async (mode: 'open' | 'protected' | 'closed') => {
    if (!familyId || !isAdmin) return
    setSavingPrivacy(true)
    setPrivacyMode(mode)
    await supabase.from('families').update({ privacy_mode: mode } as any).eq('id', familyId)
    setSavingPrivacy(false)
  }

  // ── Invite code ─────────────────────────────────────────────────────────
  const [familyInviteCode, setFamilyInviteCode] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  const fetchInviteCode = useCallback(async () => {
    if (!familyId) return
    setLoadingInvite(true)
    try {
      const { data } = await (supabase as any)
        .from('invite_links')
        .select('code, expires_at')
        .eq('family_id', familyId)
        .is('node_id', null)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data?.code) {
        setFamilyInviteCode(data.code)
        setInviteLink(`${window.location.origin}/join/${data.code}`)
      } else {
        setFamilyInviteCode(null)
        setInviteLink(null)
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load invite link')
    } finally {
      setLoadingInvite(false)
    }
  }, [familyId, supabase])

  const generateInviteCode = useCallback(async () => {
    if (!familyId || !user) return
    setLoadingInvite(true)
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.from('invite_links').insert({
        family_id: familyId, code, role: 'contributor',
        created_by: user.id, expires_at: expiresAt, max_uses: 100, invite_type: 'family',
      } as any)
      if (error) throw new Error(error.message)
      setFamilyInviteCode(code)
      setInviteLink(`${window.location.origin}/join/${code}`)
      toast.success('New family invite link created')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not create invite link')
    } finally {
      setLoadingInvite(false)
    }
  }, [familyId, user, supabase])

  const copyInviteLink = useCallback(() => {
    if (!inviteLink) return
    copyToClipboard(inviteLink).then(ok => {
      if (ok) {
        setCopiedInvite(true)
        setTimeout(() => setCopiedInvite(false), 2000)
        toast.success('Invite link copied')
      } else {
        toast.error('Could not copy to clipboard')
      }
    })
  }, [inviteLink])

  // ── Pending claims ───────────────────────────────────────────────────────
  const [pendingClaims, setPendingClaims] = useState<any[]>([])
  const [loadingClaims, setLoadingClaims] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const fetchPendingClaims = useCallback(async () => {
    if (!isAdmin) return
    setLoadingClaims(true)
    try {
      const res = await fetch('/api/claims/pending')
      if (!res.ok) throw new Error('Failed to load claims')
      setPendingClaims((await res.json()).claims ?? [])
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load pending claims')
    } finally {
      setLoadingClaims(false)
    }
  }, [isAdmin])

  const reviewClaim = useCallback(async (id: string, action: 'approve' | 'reject') => {
    setReviewingId(id)
    try {
      const res = await fetch(`/api/claims/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message ?? data.error ?? `Failed to ${action} claim`)
      }
      toast.success(action === 'approve' ? 'Claim approved' : 'Claim rejected')
      await fetchPendingClaims()
    } catch (err: any) {
      toast.error(err?.message ?? `Could not ${action} claim`)
    } finally {
      setReviewingId(null)
    }
  }, [fetchPendingClaims])

  // Family members management
  const [familyProfiles, setFamilyProfiles] = useState<FamilyProfile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)

  const fetchFamilyProfiles = useCallback(async () => {
    if (!familyId) return
    setLoadingProfiles(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, role, avatar_url')
      .eq('family_id', familyId)
    setFamilyProfiles((data ?? []) as FamilyProfile[])
    setLoadingProfiles(false)
  }, [familyId, supabase])

  useEffect(() => {
    if (open) fetchFamilyProfiles()
  }, [open, fetchFamilyProfiles])

  useEffect(() => {
    if (open) fetchPrivacyMode()
  }, [open, fetchPrivacyMode])

  useEffect(() => {
    if (open && isAdmin) fetchLinkedData()
  }, [open, isAdmin, fetchLinkedData])

  useEffect(() => {
    if (open) fetchInviteCode()
  }, [open, fetchInviteCode])

  useEffect(() => {
    if (open && isAdmin) fetchPendingClaims()
  }, [open, isAdmin, fetchPendingClaims])

  const updateRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
      if (error) throw new Error(error.message)
      setFamilyProfiles(prev => prev.map(p => p.id === userId ? { ...p, role } : p))
      toast.success('Role updated')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update role')
    }
  }

  const removeFromFamily = async (userId: string) => {
    if (userId === user?.id) return // can't remove self
    try {
      const { error } = await supabase.from('profiles').update({ family_id: null, role: 'viewer' }).eq('id', userId)
      if (error) throw new Error(error.message)
      setFamilyProfiles(prev => prev.filter(p => p.id !== userId))
      toast.success('Member removed from family')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not remove member')
    }
  }

  const roleIcon = (role: string) => {
    if (role === 'admin') return <Crown className="h-3 w-3 text-amber-400" />
    if (role === 'contributor') return <Edit3 className="h-3 w-3 text-green-400" />
    return <Eye className="h-3 w-3 text-blue-400" />
  }

  const roleBadgeClass = (role: string) => {
    if (role === 'admin') return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    if (role === 'contributor') return 'bg-green-500/10 text-green-400 border-green-500/20'
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  }

  const innerContent = (
    <>
      <DialogHeader className={isMobile ? 'px-4 pt-2 pb-0 text-left' : ''}>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Manage your Family Graph preferences and team</DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="general">
        <TabsList className="w-full mb-4 overflow-x-auto flex-nowrap justify-start">
          <TabsTrigger value="general" className="flex-1 shrink-0 text-xs sm:text-sm">General</TabsTrigger>
          <TabsTrigger value="team" className="flex-1 shrink-0 text-xs sm:text-sm">
            <span className="hidden sm:inline">Family Members</span>
            <span className="sm:hidden">Family</span>
            {(familyProfiles.length > 0 || pendingClaims.length > 0) && (
              <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1">
                {pendingClaims.length > 0 ? `${pendingClaims.length}⚠` : familyProfiles.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex-1 shrink-0 text-xs sm:text-sm">Privacy</TabsTrigger>
          <TabsTrigger value="data" className="flex-1 shrink-0 text-xs sm:text-sm">Data</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="connected" className="flex-1 shrink-0 text-xs sm:text-sm">
              Connected
              {linkedData.incoming.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1 bg-teal-500/30 text-teal-300">{linkedData.incoming.length}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── General ───────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-4 mt-0">
          {/* Account */}
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {user ? (
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {(profile as any)?.display_name?.[0] ?? user.email?.[0]?.toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{(profile as any)?.display_name ?? 'Anonymous'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant="outline" className={`ml-auto text-xs ${roleBadgeClass((profile as any)?.role ?? 'viewer')}`}>
                    {(profile as any)?.role ?? 'viewer'}
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not signed in</p>
              )}
              {FEATURE_FLAGS.enableUpgradeFlow && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Free Plan</p>
                      <p className="text-xs text-muted-foreground">Up to 50 family members</p>
                    </div>
                    <Badge variant="secondary" className="bg-primary/20 text-primary">Free</Badge>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">Upgrade to Pro</Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Display preferences */}
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground" />
                Display
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Show deceased members</Label>
                  <p className="text-xs text-muted-foreground">Display † indicator for passed members</p>
                </div>
                <Switch checked={showDeceased} onCheckedChange={setShowDeceased} />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Show birthplaces on cards</Label>
                  <p className="text-xs text-muted-foreground">Display city on member cards in sidebar</p>
                </div>
                <Switch checked={showBirthplaces} onCheckedChange={setShowBirthplaces} />
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Birthday reminders</Label>
                  <p className="text-xs text-muted-foreground">Morning notification on family birthdays</p>
                </div>
                <Switch checked={birthdayNotifs} onCheckedChange={setBirthdayNotifs} />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Anniversary reminders</Label>
                  <p className="text-xs text-muted-foreground">Wedding and memorial date reminders</p>
                </div>
                <Switch checked={anniversaryNotifs} onCheckedChange={setAnniversaryNotifs} />
              </div>
              {(birthdayNotifs || anniversaryNotifs) && typeof Notification !== 'undefined' && Notification.permission === 'default' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                  onClick={async () => { await Notification.requestPermission() }}
                >
                  <Bell className="h-3.5 w-3.5 mr-2" />
                  Enable browser notifications
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Share Family card */}
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Share2 className="h-4 w-4 text-muted-foreground" />
                Share Your Family
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!familyId ? (
                <p className="text-xs text-muted-foreground">Sign in and complete onboarding to get an invite link.</p>
              ) : loadingInvite ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading invite link…
                </div>
              ) : familyInviteCode ? (
                <>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border/50 px-3 py-2">
                    <code className="flex-1 text-xs font-mono text-foreground truncate">{inviteLink}</code>
                    <button
                      onClick={copyInviteLink}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy link"
                    >
                      {copiedInvite ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Code: <span className="font-mono font-bold text-foreground tracking-widest">{familyInviteCode}</span>
                    {' '}· Share this link with family members to let them join
                  </p>
                  <Button size="sm" variant="outline" className="w-full" onClick={copyInviteLink}>
                    {copiedInvite ? <><CheckCircle2 className="h-3.5 w-3.5 mr-2 text-green-400" />Copied!</> : <><Copy className="h-3.5 w-3.5 mr-2" />Copy Invite Link</>}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">No active invite link. Generate one to share your family.</p>
                  <Button size="sm" className="w-full" onClick={generateInviteCode} disabled={loadingInvite}>
                    {loadingInvite ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-2" />}
                    Generate Invite Link
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Team / Family Members ─────────────────────────────── */}
        <TabsContent value="team" className="mt-0 space-y-4">
          {/* Pending Claims — admin only */}
          {isAdmin && (
            <Card className="bg-muted/30 border-amber-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-amber-400" />
                  Pending Claim Requests
                  {pendingClaims.length > 0 && (
                    <Badge className="ml-auto bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                      {pendingClaims.length} pending
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingClaims ? (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading claims…
                  </div>
                ) : pendingClaims.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    No pending claims — all clear!
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {pendingClaims.map((c: any) => (
                      <div key={c.id} className="px-4 py-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              <span className="text-amber-400">{c.claimantName}</span>
                              {' '}wants to claim{' '}
                              <span className="font-semibold">{c.nodeName}</span>
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {c.submittedName && (
                                <span className="text-[11px] text-muted-foreground">
                                  Submitted: <span className="text-foreground/70">{c.submittedName}</span>
                                  {c.submittedBirthYear && ` (${c.submittedBirthYear})`}
                                </span>
                              )}
                              {c.confidenceScore != null && (
                                <span className={`text-[11px] font-medium ${c.confidenceScore >= 60 ? 'text-green-400' : c.confidenceScore >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                                  {c.confidenceScore}% match
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground/60">
                                {new Date(c.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 pl-7">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 flex-1"
                            disabled={reviewingId === c.id}
                            onClick={() => reviewClaim(c.id, 'reject')}
                          >
                            {reviewingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><XCircle className="h-3 w-3 mr-1" />Reject</>}
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white flex-1"
                            disabled={reviewingId === c.id}
                            onClick={() => reviewClaim(c.id, 'approve')}
                          >
                            {reviewingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" />Approve</>}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Members with access */}
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Family Members with Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {!familyId && authLoading ? (
                <p className="text-sm text-muted-foreground p-4">Loading…</p>
              ) : !familyId ? (
                <p className="text-sm text-muted-foreground p-4">Sign in and create a family to manage members.</p>
              ) : loadingProfiles ? (
                <p className="text-sm text-muted-foreground p-4">Loading...</p>
              ) : familyProfiles.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">No family members have joined yet. Share your invite link!</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {familyProfiles.map(fp => (
                    <div key={fp.id} className="flex items-center gap-3 px-4 py-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                          {fp.display_name?.[0]?.toUpperCase() ?? '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{fp.display_name ?? 'Unknown'}</p>
                        <div className="flex items-center gap-1">
                          {roleIcon(fp.role)}
                          <p className="text-[10px] text-muted-foreground capitalize">{fp.role}</p>
                          {fp.id === user?.id && <span className="text-[10px] text-primary ml-1">(you)</span>}
                        </div>
                      </div>
                      {isAdmin && fp.id !== user?.id && (
                        <div className="flex items-center gap-2">
                          <Select
                            value={fp.role}
                            onValueChange={v => updateRole(fp.id, v)}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="contributor">Contributor</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeFromFamily(fp.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {(!isAdmin || fp.id === user?.id) && (
                        <Badge variant="outline" className={`text-xs ${roleBadgeClass(fp.role)}`}>
                          {fp.role}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Privacy ───────────────────────────────────────────── */}
        <TabsContent value="privacy" className="space-y-4 mt-0">
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Family Visibility
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">Only admins can change family visibility.</p>
              )}
              <div className="grid grid-cols-3 gap-2">
                {([
                  {
                    key: 'open' as const,
                    label: 'Open',
                    icon: Globe,
                    color: 'border-green-500/40 bg-green-500/10 text-green-400',
                  },
                  {
                    key: 'protected' as const,
                    label: 'Protected',
                    icon: Shield,
                    color: 'border-primary/40 bg-primary/10 text-primary',
                  },
                  {
                    key: 'closed' as const,
                    label: 'Closed',
                    icon: Lock,
                    color: 'border-red-500/40 bg-red-500/10 text-red-400',
                  },
                ]).map(({ key, label, icon: Icon, color }) => {
                  const active = privacyMode === key
                  return (
                    <button
                      key={key}
                      disabled={!isAdmin || savingPrivacy}
                      onClick={() => savePrivacyMode(key)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-all disabled:opacity-50 ${active ? color : 'border-border/40 text-muted-foreground hover:border-border/60'
                        }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 p-2.5">
                {privacyMode === 'open' && '🌍 Open — Anyone with the invite link can view the family tree and request to join.'}
                {privacyMode === 'protected' && '🔒 Protected — The tree is only visible to joined members. New joiners need admin approval.'}
                {privacyMode === 'closed' && '🚫 Closed — Fully invite-only. The public bio-link (/family/code) shows no member data.'}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Individual Member Privacy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Set per-member visibility (Public / Family / Private) by selecting a member in the tree and using the Privacy panel in the detail view.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Data ─────────────────────────────────────────────── */}
        <TabsContent value="data" className="space-y-4 mt-0">
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                Data Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                Export Family Data (JSON)
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={onImport}>
                <Upload className="h-4 w-4 mr-2" />
                Import from JSON
              </Button>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="bg-destructive/5 border-destructive/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10">
                Delete All My Data
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Connected Families ───────────────────────────────── */}
        {isAdmin && (
          <TabsContent value="connected" className="space-y-4 mt-0">
            <Card className="bg-muted/30 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-teal-400" />
                  Connected Families
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingLinked ? (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
                  </div>
                ) : (
                  <>
                    {/* Sub-tabs */}
                    <div className="flex gap-1 px-4 pt-3 pb-1">
                      {(['incoming', 'outgoing', 'accepted'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setLinkedTab(t)}
                          className={`text-xs px-2.5 py-1 rounded-full transition-colors capitalize ${linkedTab === t
                            ? 'bg-primary/20 text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                          {t}
                          {t === 'incoming' && linkedData.incoming.length > 0 && (
                            <span className="ml-1 text-[10px] bg-teal-500/30 text-teal-300 rounded-full px-1">{linkedData.incoming.length}</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <Separator className="bg-border/30 my-2" />

                    {/* Incoming */}
                    {linkedTab === 'incoming' && (
                      <div className="divide-y divide-border/30">
                        {linkedData.incoming.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-4">No incoming requests.</p>
                        ) : linkedData.incoming.map((r: any) => (
                          <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{r.otherFamilyName}</p>
                              {r.linkNote && <p className="text-xs text-muted-foreground truncate">{r.linkNote}</p>}
                              <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(r.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                                disabled={respondingId === r.id}
                                onClick={() => respondToLink(r.id, 'reject')}
                              >
                                {respondingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Decline'}
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-teal-600 hover:bg-teal-500 text-white"
                                disabled={respondingId === r.id}
                                onClick={() => respondToLink(r.id, 'accept')}
                              >
                                {respondingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Accept'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Outgoing */}
                    {linkedTab === 'outgoing' && (
                      <div className="divide-y divide-border/30">
                        {linkedData.outgoing.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-4">No sent requests.</p>
                        ) : linkedData.outgoing.map((r: any) => (
                          <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{r.otherFamilyName}</p>
                              {r.linkNote && <p className="text-xs text-muted-foreground truncate">{r.linkNote}</p>}
                              <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(r.createdAt).toLocaleDateString()}</p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] capitalize ${r.status === 'pending' ? 'border-amber-500/30 text-amber-400' :
                              r.status === 'rejected' ? 'border-red-500/30 text-red-400' :
                                'border-border/50 text-muted-foreground'
                              }`}>
                              {r.status === 'pending' && <Clock className="h-2.5 w-2.5 mr-1" />}
                              {r.status === 'rejected' && <XCircle className="h-2.5 w-2.5 mr-1" />}
                              {r.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Accepted / Linked */}
                    {linkedTab === 'accepted' && (
                      <div className="divide-y divide-border/30">
                        {linkedData.accepted.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-4">No active family connections yet.</p>
                        ) : linkedData.accepted.map((r: any) => (
                          <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{r.otherFamilyName}</p>
                              <p className="text-[10px] text-muted-foreground">Linked {new Date(r.updatedAt).toLocaleDateString()}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                              disabled={revokingId === r.id}
                              onClick={() => revokeLink(r.id)}
                            >
                              {revokingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Unlink className="h-3 w-3 mr-1" />Unlink</>}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
        <DrawerContent className="h-[92vh] flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            {innerContent}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[85vh] overflow-y-auto">
        {innerContent}
      </DialogContent>
    </Dialog>
  )
}

