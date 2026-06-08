'use client'

import { useState, useEffect, useCallback } from 'react'
import { copyToClipboard } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Download, Upload, Trash2, Shield, Bell, Palette, Database, Users, Crown, Eye, Edit3, Lock, Globe, Link2, Unlink, CheckCircle2, Clock, XCircle, Loader2, Copy, Share2, AlertCircle, UserCheck, EyeOff, UserX, Phone, ShieldOff,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { usePrivacySettings } from '@/hooks/use-members'
import type { FamilyMember } from '@/lib/types'

interface FamilyProfile {
  id: string
  display_name: string | null
  role: string
  avatar_url: string | null
  member_id: string | null
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
  onDownloadTemplate?: () => void
  defaultTab?: string
  /** The logged-in user's own family member node (for profile privacy controls) */
  selfMember?: FamilyMember | null
  /** Callback to update visibility on the user's own node */
  onSetVisibility?: (memberId: string, v: 'public' | 'family' | 'private') => void
  /** Callback to toggle anonymous display mode on the user's own node */
  onSetAnonymous?: (memberId: string, anon: boolean) => void
  /** Called after a successful self-unclaim so the parent can refresh member data */
  onUnclaim?: () => void
  /** Called after the user successfully leaves the family — parent should redirect to onboarding */
  onLeaveFamily?: () => void
}

export function SettingsDialog({ open, onOpenChange, onExport, onImport, onDownloadTemplate, defaultTab = 'general', selfMember, onSetVisibility, onSetAnonymous, onUnclaim, onLeaveFamily }: SettingsDialogProps) {
  const isMobile = useIsMobile()
  const { user, profile, familyId, loading: authLoading, refreshProfile } = useAuth()
  const supabase = createClient()
  const isAdmin = (profile as any)?.role === 'admin'

  // ── Controlled tab state — avoids Tabs key= hack which resets all local state ──
  const [activeTab, setActiveTab] = useState(defaultTab)
  // Sync when defaultTab changes (e.g. notification bell opens Settings > Notifications)
  useEffect(() => { setActiveTab(defaultTab) }, [defaultTab])

  // ── Display name inline editing ─────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [savingName, setSavingName] = useState(false)
  const startEditName = () => {
    setNameValue((profile as any)?.display_name ?? '')
    setEditingName(true)
  }
  const saveDisplayName = async () => {
    if (!user || !nameValue.trim()) return
    setSavingName(true)
    const { error } = await supabase.from('profiles').update({ display_name: nameValue.trim() }).eq('id', user.id)
    setSavingName(false)
    if (error) { toast.error('Could not save name'); return }
    toast.success('Name updated')
    setEditingName(false)
    refreshProfile()
  }

  // Account-level privacy settings
  const { settings: privacySettings, saving: savingPrivacySettings, saveSettings: savePrivacySettings } = usePrivacySettings(user?.id)

  // Persistent preferences
  const [showDeceased, setShowDeceased] = usePref('showDeceased', true)
  const [showBirthplaces, setShowBirthplaces] = usePref('showBirthplaces', true)
  const [birthdayNotifs, setBirthdayNotifs] = usePref('birthdayNotifs', true)
  const [anniversaryNotifs, setAnniversaryNotifs] = usePref('anniversaryNotifs', false)

  // Remove from family confirmation
  const [removeConfirmUserId, setRemoveConfirmUserId] = useState<string | null>(null)

  // Self-unclaim state
  const [unclaiming, setUnclaiming] = useState(false)
  const [showUnclaimConfirm, setShowUnclaimConfirm] = useState(false)
  const [unclaimError, setUnclaimError] = useState<string | null>(null)

  // Leave family state
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const handleLeaveFamily = useCallback(async () => {
    setLeaving(true)
    setLeaveError(null)
    try {
      const res = await fetch('/api/families/leave', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLeaveError(data.message ?? data.error ?? `Error ${res.status}`)
        return
      }
      toast.success('You have left the family. Redirecting…')
      setShowLeaveConfirm(false)
      onLeaveFamily?.()
    } catch (err: any) {
      setLeaveError(err?.message ?? 'Network error — could not reach server')
    } finally {
      setLeaving(false)
    }
  }, [onLeaveFamily])

  // Reset family tree state
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  const handleResetFamily = async () => {
    setResetting(true)
    try {
      const res = await fetch('/api/admin/family/reset', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? 'Failed to reset family tree.')
        return
      }
      toast.success('Family tree reset. All members and content have been deleted.')
      setShowResetConfirm(false)
      // Reload so the empty tree is shown
      window.location.reload()
    } catch (err) {
      toast.error('Network error. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [otherAdminCount, setOtherAdminCount] = useState<number | null>(null)
  const isLastAdmin = isAdmin && otherAdminCount === 0

  // Count other admins in the family so we can warn before the delete API blocks
  useEffect(() => {
    if (!open || !isAdmin || !familyId || !user) { setOtherAdminCount(null); return }
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', familyId)
      .eq('role', 'admin')
      .neq('id', user.id)
      .then(({ count }) => setOtherAdminCount(count ?? 0))
  }, [open, isAdmin, familyId, user?.id])

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/users/me/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Surface the human-readable message; fall back to code if absent
        const msg = data.message ?? data.error ?? 'Failed to delete account. Please try again.'
        toast.error(msg)
        setDeleting(false)
        setShowDeleteConfirm(false)
        return
      }
      // Clear the local session only — the auth user is already deleted on the
      // server so calling the Supabase signout endpoint would 401. scope:'local'
      // wipes cookies/localStorage without making a network request.
      try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* already deleted */ }
      window.location.href = '/'
    } catch (err) {
      console.error('[delete-account]', err)
      toast.error('Network error. Please try again.')
      setDeleting(false)
    }
  }

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
    const prev = privacyMode
    setPrivacyMode(mode) // optimistic
    try {
      const res = await fetch('/api/admin/family/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyMode: mode }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to save (${res.status})`)
      }
      toast.success(`Family visibility set to ${mode}`)
    } catch (err: any) {
      setPrivacyMode(prev) // roll back
      toast.error(err?.message ?? 'Could not update family visibility')
    } finally {
      setSavingPrivacy(false)
    }
  }

  // ── Invite code ─────────────────────────────────────────────────────────
  const [familyInviteCode, setFamilyInviteCode] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  // ── Invite by phone ──────────────────────────────────────────────────────
  const [phoneInviteInput, setPhoneInviteInput] = useState('')
  const [phoneInviteLoading, setPhoneInviteLoading] = useState(false)
  const [phoneInviteResult, setPhoneInviteResult] = useState<{ waLink: string; code: string } | null>(null)
  const [phoneInviteError, setPhoneInviteError] = useState('')

  const handlePhoneInvite = useCallback(async () => {
    if (!familyId || !user) return
    setPhoneInviteLoading(true)
    setPhoneInviteError('')
    setPhoneInviteResult(null)
    try {
      const { normalizePhone, whatsappUrl, isValidIndianPhone } = await import('@/lib/phone-utils')
      if (!isValidIndianPhone(phoneInviteInput)) {
        setPhoneInviteError('Please enter a valid 10-digit Indian mobile number.')
        return
      }
      const e164 = normalizePhone(phoneInviteInput)!
      const code = Math.random().toString(36).substring(2, 10).toUpperCase()
      const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString()
      const { error } = await (supabase.from('invite_links') as any).insert({
        family_id: familyId, code, role: 'contributor',
        created_by: user.id, expires_at: expiresAt, max_uses: 1, invited_phone: e164,
      })
      if (error) throw new Error(error.message)
      const link = `${window.location.origin}/join/${code}`
      const waText = `🌳 You've been invited to join your family tree on Family Graph!\n\nJoin here: ${link}`
      setPhoneInviteResult({ waLink: whatsappUrl(e164, waText), code })
      setPhoneInviteInput('')
      toast.success('Invite created!')
    } catch (e: any) {
      setPhoneInviteError(e?.message ?? 'Failed to create invite')
    } finally {
      setPhoneInviteLoading(false)
    }
  }, [familyId, user, phoneInviteInput, supabase])

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

  const handleSelfUnclaim = useCallback(async () => {
    if (!selfMember?.id) return
    setUnclaiming(true)
    setUnclaimError(null)
    try {
      const res = await fetch(`/api/nodes/${selfMember.id}/unclaim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.message ?? data.error ?? `Error ${res.status}`
        setUnclaimError(msg)
        return
      }
      toast.success('Profile unlinked. Your account is no longer tied to this node.')
      setShowUnclaimConfirm(false)
      setUnclaimError(null)
      onUnclaim?.()
    } catch (err: any) {
      setUnclaimError(err?.message ?? 'Network error — could not reach server')
    } finally {
      setUnclaiming(false)
    }
  }, [selfMember?.id, onUnclaim])

  // Family members management
  const [familyProfiles, setFamilyProfiles] = useState<FamilyProfile[]>([])
  const removeConfirmProfile = removeConfirmUserId ? familyProfiles.find(p => p.id === removeConfirmUserId) : null
  const [loadingProfiles, setLoadingProfiles] = useState(false)

  const fetchFamilyProfiles = useCallback(async () => {
    if (!familyId) return
    setLoadingProfiles(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, role, avatar_url, member_id')
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
      const res = await fetch(`/api/admin/members/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to update role (${res.status})`)
      }
      setFamilyProfiles(prev => prev.map(p => p.id === userId ? { ...p, role } : p))
      toast.success('Role updated')
      // If the role change affects the current user, refresh their auth profile
      // so the sidebar badge and admin-gated UI update without a page reload.
      if (userId === user?.id) refreshProfile()
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update role')
    }
  }

  const removeFromFamily = async (userId: string) => {
    if (userId === user?.id) return // can't remove self
    try {
      const res = await fetch(`/api/admin/members/${userId}/remove`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to remove member (${res.status})`)
      }
      setFamilyProfiles(prev => prev.filter(p => p.id !== userId))
      toast.success('Member removed from family')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not remove member')
    }
  }

  const [revokingNodeId, setRevokingNodeId] = useState<string | null>(null)
  const handleAdminRevokeClaim = async (nodeId: string) => {
    setRevokingNodeId(nodeId)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/revoke-claim`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Revoke failed')
      toast.success('Claim revoked')
      // Refresh the profiles list so the ShieldOff button disappears and
      // the member_id column reflects the cleared state.
      await fetchFamilyProfiles()
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not revoke claim')
    } finally {
      setRevokingNodeId(null)
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                  <div className="flex-1 min-w-0">
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-7 text-sm py-0 px-2"
                          value={nameValue}
                          onChange={e => setNameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveDisplayName(); if (e.key === 'Escape') setEditingName(false) }}
                          autoFocus
                        />
                        <Button size="sm" className="h-7 px-2 text-xs shrink-0" onClick={saveDisplayName} disabled={savingName || !nameValue.trim()}>
                          {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0" onClick={() => setEditingName(false)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{(profile as any)?.display_name ?? 'Anonymous'}</p>
                        <button onClick={startEditName} className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors" title="Edit name">
                          <Edit3 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <Badge variant="outline" className={`ml-auto text-xs shrink-0 ${roleBadgeClass((profile as any)?.role ?? 'viewer')}`}>
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

          {/* ── Invite by Phone ──────────────────────────────────── */}
          {isAdmin && (
            <Card className="bg-muted/30 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  Invite by Phone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Send a personal invite to a specific family member's WhatsApp.
                </p>
                <div className="flex gap-2">
                  <div className="flex items-center justify-center rounded-lg border border-border bg-background px-2.5 h-9 text-xs font-medium shrink-0 gap-1">
                    🇮🇳 <span className="text-muted-foreground">+91</span>
                  </div>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phoneInviteInput}
                    onChange={e => {
                      setPhoneInviteInput(e.target.value.replace(/\D/g, '').slice(0, 10))
                      setPhoneInviteError('')
                      setPhoneInviteResult(null)
                    }}
                    className="h-9 text-sm bg-background border-border font-mono"
                  />
                  <Button
                    size="sm"
                    className="shrink-0 h-9"
                    disabled={phoneInviteLoading || phoneInviteInput.length < 10}
                    onClick={handlePhoneInvite}
                  >
                    {phoneInviteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Invite'}
                  </Button>
                </div>
                {phoneInviteError && (
                  <p className="text-xs text-destructive">{phoneInviteError}</p>
                )}
                {phoneInviteResult && (
                  <a
                    href={phoneInviteResult.waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Send via WhatsApp · Code {phoneInviteResult.code}
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Team / Family Members ─────────────────────────────── */}
        <TabsContent value="team" className="mt-0 space-y-4">

          {/* ── Your Role Card ───────────────────────────────────── */}
          <div className={`rounded-xl border p-3 flex items-center gap-3 ${isAdmin ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-muted/20'}`}>
            <div className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${isAdmin ? 'bg-amber-500/15' : 'bg-muted'}`}>
              {isAdmin ? <Crown className="h-4 w-4 text-amber-400" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {isAdmin ? 'You are the Family Admin' : `Your role: ${(profile as any)?.role ?? 'viewer'}`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isAdmin
                  ? 'You can approve or reject profile claims, manage members, and change invite settings.'
                  : 'Contact the family admin to get elevated access.'}
              </p>
            </div>
            <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${isAdmin ? 'border-amber-500/30 text-amber-400' : 'border-border text-muted-foreground'}`}>
              {isAdmin ? 'Admin' : (profile as any)?.role ?? 'viewer'}
            </Badge>
          </div>

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
              {/* Non-admin hint: show who to contact for role changes */}
              {!isAdmin && familyProfiles.some(fp => fp.role === 'admin') && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Contact{' '}
                  <span className="font-semibold text-amber-400">
                    {familyProfiles.find(fp => fp.role === 'admin')?.display_name ?? 'the admin'}
                  </span>
                  {' '}to change your role or get admin access.
                </p>
              )}
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
                  {/* Sort: admins first, then contributors, then viewers */}
                  {[...familyProfiles]
                    .sort((a, b) => {
                      const order = { admin: 0, contributor: 1, viewer: 2 }
                      return (order[a.role as keyof typeof order] ?? 3) - (order[b.role as keyof typeof order] ?? 3)
                    })
                    .map(fp => (
                      <div
                        key={fp.id}
                        className={`flex items-center gap-3 px-4 py-3 ${fp.role === 'admin' ? 'bg-amber-500/3' : ''}`}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={`text-xs font-bold ${fp.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-primary/20 text-primary'}`}>
                              {fp.display_name?.[0]?.toUpperCase() ?? '?'}
                            </AvatarFallback>
                          </Avatar>
                          {fp.role === 'admin' && (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 ring-1 ring-background">
                              <Crown className="h-2 w-2 text-white" />
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium truncate">{fp.display_name ?? 'Unknown'}</p>
                            {fp.id === user?.id && (
                              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0 rounded-full border border-primary/20">you</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {roleIcon(fp.role)}
                            <p className={`text-[10px] capitalize font-medium ${fp.role === 'admin' ? 'text-amber-400' : 'text-muted-foreground'}`}>
                              {fp.role}
                              {fp.role === 'admin' && ' · Family Admin'}
                            </p>
                          </div>
                        </div>
                        {/* Admin: show role selector + remove button for others */}
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
                              onClick={() => setRemoveConfirmUserId(fp.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            {/* Revoke claim button: only when this profile has a claimed node */}
                            {fp.member_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-amber-400"
                                title="Revoke profile claim"
                                disabled={revokingNodeId === fp.member_id}
                                onClick={() => fp.member_id && handleAdminRevokeClaim(fp.member_id)}
                              >
                                {revokingNodeId === fp.member_id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <ShieldOff className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        )}
                        {/* Non-admin or viewing own row: just show role badge */}
                        {(!isAdmin || fp.id === user?.id) && (
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${roleBadgeClass(fp.role)}`}>
                            {roleIcon(fp.role)}
                            <span className="ml-1">{fp.role}</span>
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

          {/* ── Your Profile Node ────────────────────────────────── */}
          {selfMember && (
            <Card className="bg-muted/30 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Your Profile Visibility
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Control how your member node appears in the family tree.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'public' as const, label: 'Public', icon: Globe, color: 'border-green-500/40 bg-green-500/10 text-green-400' },
                    { key: 'family' as const, label: 'Family', icon: Users, color: 'border-primary/40 bg-primary/10 text-primary' },
                    { key: 'private' as const, label: 'Private', icon: Lock, color: 'border-red-500/40 bg-red-500/10 text-red-400' },
                  ]).map(({ key, label, icon: Icon, color }) => {
                    const active = (selfMember.visibility ?? 'family') === key
                    return (
                      <button
                        key={key}
                        onClick={() => onSetVisibility?.(selfMember.id, key)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-all ${active ? color : 'border-border/40 text-muted-foreground hover:border-border/60'}`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground rounded-lg bg-muted/40 p-2">
                  {(selfMember.visibility ?? 'family') === 'public' && '🌍 Visible to anyone with the invite link'}
                  {(selfMember.visibility ?? 'family') === 'family' && '👨‍👩‍👧 Visible to all family members'}
                  {(selfMember.visibility ?? 'family') === 'private' && '🔒 Only visible to family admins'}
                </p>
                <Separator className="bg-border/40" />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                      Show as anonymous
                    </Label>
                    <p className="text-xs text-muted-foreground">Display your node as "? Member" — family can see you're in the tree but not your name</p>
                  </div>
                  <Switch
                    checked={selfMember.showAsAnonymous ?? false}
                    onCheckedChange={(v) => onSetAnonymous?.(selfMember.id, v)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Unlink My Profile (self-unclaim, 7-day window) ─── */}
          {/* Only shown when this user is the active claimer of the node.
              If an admin revoked the claim, selfMember.isClaimed is false
              and selfMember.claimedByUserId is null — hide the section. */}
          {selfMember && selfMember.isClaimed && selfMember.claimedByUserId === user?.id && (
            <Card className="bg-muted/30 border-destructive/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldOff className="h-4 w-4 text-muted-foreground" />
                  Unlink My Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Unlink your account from <span className="font-medium text-foreground">{selfMember.name}</span>. This resets the node to unclaimed so someone else can claim it.
                </p>
                {selfMember.claimedAt && (() => {
                  const claimedAt = new Date(selfMember.claimedAt!)
                  const daysLeft = Math.max(0, 7 - Math.floor((Date.now() - claimedAt.getTime()) / 86_400_000))
                  const inWindow = daysLeft > 0
                  return (
                    <>
                      <div className={`text-xs rounded-lg px-3 py-2 ${inWindow ? 'bg-amber-500/10 text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                        {inWindow
                          ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining in the 7-day self-unclaim window`
                          : 'The 7-day unclaim window has passed. Contact the tree owner to revoke.'}
                      </div>
                      {!showUnclaimConfirm ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          onClick={() => setShowUnclaimConfirm(true)}
                          disabled={!inWindow}
                        >
                          <ShieldOff className="h-3.5 w-3.5 mr-2" />
                          Unlink My Profile
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-destructive font-medium">Are you sure? This cannot be undone without re-claiming.</p>
                          {unclaimError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                              <span className="font-semibold">Error: </span>{unclaimError}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1"
                              onClick={() => { setShowUnclaimConfirm(false); setUnclaimError(null) }}
                              disabled={unclaiming}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="flex-1"
                              onClick={handleSelfUnclaim}
                              disabled={unclaiming}
                            >
                              {unclaiming ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm Unlink'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </CardContent>
            </Card>
          )}

          {/* ── Leave Family ──────────────────────────────────────── */}
          {familyId && (
            <Card className="bg-muted/30 border-destructive/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  Leave Family
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Remove yourself from this family tree. Your member profile will stay in the tree — it just becomes unclaimed so another family member can re-add it. You will lose access to the tree immediately.
                </p>
                {!showLeaveConfirm ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => { setShowLeaveConfirm(true); setLeaveError(null) }}
                  >
                    <UserX className="h-3.5 w-3.5 mr-2" />
                    Leave Family
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-destructive font-medium">
                      Are you sure? You will be signed out of the tree and need a new invite to rejoin.
                    </p>
                    {leaveError && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <span className="font-semibold">Error: </span>{leaveError}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                        onClick={() => { setShowLeaveConfirm(false); setLeaveError(null) }}
                        disabled={leaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        onClick={handleLeaveFamily}
                        disabled={leaving}
                      >
                        {leaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm Leave'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Contact Info Privacy ──────────────────────────────── */}
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
                Contact Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Hide my phone &amp; email</Label>
                  <p className="text-xs text-muted-foreground">Only family admins can see your contact details. Other members see "••••••••"</p>
                </div>
                <Switch
                  checked={privacySettings.hideContactInfo}
                  disabled={savingPrivacySettings}
                  onCheckedChange={(v) =>
                    savePrivacySettings({ hideContactInfo: v })
                      .then(() => toast.success(v ? 'Contact info hidden' : 'Contact info visible to family'))
                      .catch((err: any) => toast.error(err?.message ?? 'Could not save privacy setting'))
                  }
                />
              </div>
              <Separator className="bg-border/40" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Hide from family search</Label>
                  <p className="text-xs text-muted-foreground">Your node won't appear in family member search results</p>
                </div>
                <Switch
                  checked={privacySettings.hideFromSearch}
                  disabled={savingPrivacySettings}
                  onCheckedChange={(v) =>
                    savePrivacySettings({ hideFromSearch: v })
                      .then(() => toast.success(v ? 'Hidden from search' : 'Visible in search'))
                      .catch((err: any) => toast.error(err?.message ?? 'Could not save privacy setting'))
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Family Visibility (admin only) ────────────────────── */}
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
                {privacyMode === 'closed' && '🚫 Closed — Fully invite-only. The public join page shows no member data.'}
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
                Set per-member visibility (Public / Family / Private) or anonymous mode by selecting a member in the tree and using the Privacy panel in their detail view.
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

              {/* Import section with format guide */}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Import from JSON</p>
                  <button
                    type="button"
                    onClick={onDownloadTemplate}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline font-medium"
                  >
                    <Download className="h-3 w-3" />
                    Download template
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Upload a <strong>.json</strong> file containing an array of family members.
                  Download the template above to see the exact format — fill it in and import.
                </p>
                <div className="rounded-md bg-muted/40 border border-border/40 px-2.5 py-2 font-mono text-[10px] text-muted-foreground leading-relaxed whitespace-pre overflow-x-auto">{`[
  {
    "name": "Ramesh Meshram",
    "gender": "male",
    "birthYear": 1972,
    "generation": 1,
    "relationship": "father",
    "occupation": "Engineer",
    "birthPlace": "Nagpur",
    "parentIds": [],
    "spouseIds": []
  }
]`}</div>
                <p className="text-[10px] text-muted-foreground">
                  Tip: leave <code className="text-[10px] bg-muted px-1 rounded">parentIds</code> and <code className="text-[10px] bg-muted px-1 rounded">spouseIds</code> empty — link relatives in the tree after import.
                </p>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={onImport}>
                  <Upload className="h-4 w-4 mr-2" />
                  Choose JSON file to import
                </Button>
              </div>
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
            <CardContent className="space-y-3">
              {/* Reset Family Tree — admin only */}
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                    onClick={() => setShowResetConfirm(true)}
                    disabled={resetting}
                  >
                    {resetting
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting…</>
                      : <><Trash2 className="h-4 w-4 mr-2" />Reset Family Tree</>}
                  </Button>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Deletes all family members and content from the tree. Your account and family name are kept — you can start adding members again immediately.
                  </p>
                  <Separator className="bg-border/30" />
                </>
              )}
              {isLastAdmin && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>You are the only admin of this family. Promote another member to admin first before deleting your account.</span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting || isLastAdmin}
              >
                {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</> : <><Trash2 className="h-4 w-4 mr-2" />Delete All My Data</>}
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Permanently deletes your account and unlinks you from your family node. Your family member record will remain in the tree for other members to see.
              </p>
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
      <>
        <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
          <DrawerContent className="h-[92vh] flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 pb-8">
              {innerContent}
            </div>
          </DrawerContent>
        </Drawer>
        <AlertDialog open={!!removeConfirmUserId} onOpenChange={v => { if (!v) setRemoveConfirmUserId(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from family?</AlertDialogTitle>
              <AlertDialogDescription>
                {removeConfirmProfile?.display_name ?? 'This person'} will lose access to the family tree immediately. You can re-invite them later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (removeConfirmUserId) removeFromFamily(removeConfirmUserId); setRemoveConfirmUserId(null) }}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[580px] max-h-[85vh] overflow-y-auto">
          {innerContent}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!removeConfirmUserId} onOpenChange={v => { if (!v) setRemoveConfirmUserId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from family?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeConfirmProfile?.display_name ?? 'This person'} will lose access to the family tree immediately. You can re-invite them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (removeConfirmUserId) removeFromFamily(removeConfirmUserId); setRemoveConfirmUserId(null) }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset Family Tree confirmation ──────────────────────────────── */}
      <AlertDialog open={showResetConfirm} onOpenChange={(v) => { if (!v && !resetting) setShowResetConfirm(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset family tree?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">This will <strong>permanently delete all family members</strong> and content (stories, memories, events) from the tree.</span>
              <span className="block">Your account and the family itself will remain — you can start adding members again immediately.</span>
              <span className="block font-medium text-orange-400">⚠️ This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 text-white hover:bg-orange-700"
              disabled={resetting}
              onClick={(e) => { e.preventDefault(); handleResetFamily() }}
            >
              {resetting ? 'Resetting…' : 'Yes, reset the tree'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete All My Data confirmation ─────────────────────────────── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(v) => { if (!v && !deleting) setShowDeleteConfirm(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">This will <strong>permanently delete</strong> your account and sign you out. This action cannot be undone.</span>
              <span className="block">Your family member record (name, photos, bio) will remain in the tree so your relatives can still see it — only your login access will be removed.</span>
              {isLastAdmin && (
                <span className="block font-medium text-amber-400">⚠️ You are the only admin. Promote another member first.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting || isLastAdmin}
              onClick={(e) => {
                e.preventDefault()
                handleDeleteAccount()
              }}
            >
              {deleting ? 'Deleting…' : 'Yes, delete my account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

