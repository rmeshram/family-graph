'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Download, Upload, Trash2, Shield, Bell, Palette, Database, Users, Crown, Eye, Edit3,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'

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
  const { user, profile, familyId } = useAuth()
  const supabase = createClient()
  const isAdmin = (profile as any)?.role === 'admin'

  // Persistent preferences
  const [showDeceased, setShowDeceased] = usePref('showDeceased', true)
  const [showBirthplaces, setShowBirthplaces] = usePref('showBirthplaces', true)
  const [birthdayNotifs, setBirthdayNotifs] = usePref('birthdayNotifs', true)
  const [anniversaryNotifs, setAnniversaryNotifs] = usePref('anniversaryNotifs', false)

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

  const updateRole = async (userId: string, role: string) => {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setFamilyProfiles(prev => prev.map(p => p.id === userId ? { ...p, role } : p))
  }

  const removeFromFamily = async (userId: string) => {
    if (userId === user?.id) return // can't remove self
    await supabase.from('profiles').update({ family_id: null, role: 'viewer' }).eq('id', userId)
    setFamilyProfiles(prev => prev.filter(p => p.id !== userId))
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your Family Graph preferences and team</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
            <TabsTrigger value="team" className="flex-1">
              Family Members
              {familyProfiles.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 text-[10px] px-1">{familyProfiles.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="data" className="flex-1">Data</TabsTrigger>
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Free Plan</p>
                    <p className="text-xs text-muted-foreground">Up to 50 family members</p>
                  </div>
                  <Badge variant="secondary" className="bg-primary/20 text-primary">Free</Badge>
                </div>
                <Button variant="outline" size="sm" className="w-full">Upgrade to Pro</Button>
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
          </TabsContent>

          {/* ── Team / Family Members ─────────────────────────────── */}
          <TabsContent value="team" className="mt-0">
            <Card className="bg-muted/30 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Family Members with Access
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 p-0">
                {!familyId ? (
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
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

