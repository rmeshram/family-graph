'use client'

import { useState } from 'react'
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
import { Loader2, UserX } from 'lucide-react'
import { toast } from 'sonner'

interface UnclaimDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberName: string
  nodeId: string
  /** Called after the unclaim succeeds so the parent can refresh state. */
  onUnclaimed: () => void
}

export function UnclaimDialog({
  open,
  onOpenChange,
  memberName,
  nodeId,
  onUnclaimed,
}: UnclaimDialogProps) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/unclaim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message ?? 'Could not unlink profile. Please try again.')
        return
      }

      toast.success(`Unlinked from ${memberName}'s profile.`)
      onOpenChange(false)
      onUnclaimed()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-muted-foreground" />
            Unlink from this profile?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-sm leading-relaxed">
            <span>
              Your account will be detached from{' '}
              <span className="font-semibold text-foreground">{memberName}</span>'s profile.
            </span>
            <br />
            <span className="text-muted-foreground">
              The profile stays in the family tree with all its relationships, stories, and
              history intact. You can re-claim it later if needed.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm() }}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Unlinking…</>
            ) : (
              'Yes, unlink me'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
