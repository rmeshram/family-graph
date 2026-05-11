'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { 
  Download, 
  Upload, 
  Trash2, 
  Shield, 
  Bell, 
  Palette,
  Database,
  Cloud,
} from 'lucide-react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onExport?: () => void
  onImport?: () => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  onExport,
  onImport,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your Family Graph preferences and data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Account */}
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Free Plan</p>
                  <p className="text-xs text-muted-foreground">Up to 50 family members</p>
                </div>
                <Badge variant="secondary" className="bg-primary/20 text-primary">
                  Free
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="w-full">
                Upgrade to Pro
              </Button>
            </CardContent>
          </Card>

          {/* Display */}
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
                  <p className="text-xs text-muted-foreground">Display indicator for passed family members</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Compact cards</Label>
                  <p className="text-xs text-muted-foreground">Use smaller member cards in sidebar</p>
                </div>
                <Switch />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Show birthplaces</Label>
                  <p className="text-xs text-muted-foreground">Display birthplace on member cards</p>
                </div>
                <Switch defaultChecked />
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
                  <p className="text-xs text-muted-foreground">Get notified about upcoming birthdays</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Anniversary reminders</Label>
                  <p className="text-xs text-muted-foreground">Get notified about memorial dates</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                Data Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={onExport}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Family Data
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={onImport}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import from GEDCOM
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
              >
                <Cloud className="h-4 w-4 mr-2" />
                Backup to Cloud
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
              <CardDescription>
                Irreversible actions that affect your data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                Delete All Data
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
