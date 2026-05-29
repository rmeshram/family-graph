# 🔔 NOTIFICATION SYSTEM COMPREHENSIVE AUDIT

**Date:** May 29, 2026  
**Auditor:** Rovo Dev AI  
**Overall Grade:** B (Good foundation, 5 critical gaps found)

---

## 📊 EXECUTIVE SUMMARY

**Current Status:** ⚠️ **PARTIALLY WORKING** - Core notifications work, but several events don't trigger notifications

**Issues Found:**
- 🔴 **5 Critical Gaps** - Important events missing notifications
- 🟡 **3 High Priority Issues** - Notification logic incomplete
- 🟠 **2 Medium Issues** - Edge cases not handled
- 🟢 **1 Low Priority** - Minor optimization

**What Works:**
- ✅ Claim system notifications (via `claim_audit_log`)
- ✅ Member joined notifications (realtime)
- ✅ Story added notifications (realtime)
- ✅ Profile visibility changes (realtime)
- ✅ Role changes (realtime)
- ✅ Birthday/anniversary reminders

**What's Broken/Missing:**
- 🔴 Family linking notifications (table exists but never written to)
- 🔴 Invite accepted notifications (no audit log entry)
- 🔴 Member updated notifications (too noisy, throttled but not tested)
- 🔴 Duplicate merge notifications (no implementation)
- 🔴 Admin actions (delete member, revoke claim) don't notify affected users

---

## 🏗️ ARCHITECTURE OVERVIEW

### **Notification Sources:**

1. **Database Tables** (for persistence):
   - `claim_audit_log` - Claim system events ✅ **WORKING**
   - `family_link_notifications` - Family linking events ❌ **NEVER USED**
   
2. **Realtime Subscriptions** (for instant updates):
   - `family_members` INSERT → member_joined ✅ **WORKING**
   - `family_members` UPDATE → member_updated/visibility_changed ✅ **WORKING**
   - `stories` INSERT → story_added ✅ **WORKING**
   - `profiles` UPDATE → role_changed ✅ **WORKING**

3. **Computed** (in React hook):
   - Birthday notifications (checks `birthMonth`/`birthDay`) ✅ **WORKING**
   - Anniversary notifications ✅ **WORKING**
   - Upcoming events ✅ **WORKING**

### **Notification Flow:**

```
Event occurs in API route
    ↓
INSERT into audit table (claim_audit_log or family_link_notifications)
    ↓
Supabase Realtime broadcasts INSERT
    ↓
useNotifications hook receives realtime update
    ↓
Transforms to AppNotification format
    ↓
NotificationBell component displays
```

---

## 🔴 CRITICAL GAPS (MUST FIX)

### **GAP #1: Family Link Notifications Never Created**

**Issue:** Table `family_link_notifications` exists but **no API route writes to it**.

**Evidence:**
```sql
-- Migration 010 creates the table:
CREATE TABLE IF NOT EXISTS public.family_link_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID REFERENCES public.family_links(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('link_requested', 'link_accepted', 'link_rejected', 'link_revoked')),
  recipient_family_id UUID REFERENCES public.families(id),
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Problem:** 
- ❌ `/api/families/link-request/route.ts` - Creates link but NO notification
- ❌ `/api/family-links/[id]/respond/route.ts` - Accepts/rejects but NO notification
- ❌ `/api/family-links/[id]/revoke/route.ts` - Revokes but NO notification

**Impact:** 
- Admins don't know when another family wants to link
- No notification when link is accepted/rejected
- Silent revocations

**Fix Required:**

```typescript
// In app/api/families/link-request/route.ts (after creating link):
await admin.from('family_link_notifications').insert({
  link_id: createdLink.id,
  event_type: 'link_requested',
  recipient_family_id: targetFamily.id,
  created_at: new Date().toISOString()
})

// In app/api/family-links/[id]/respond/route.ts (after accept/reject):
await admin.from('family_link_notifications').insert({
  link_id: linkId,
  event_type: action === 'accept' ? 'link_accepted' : 'link_rejected',
  recipient_family_id: link.family_a_id, // Notify the requester
  created_at: new Date().toISOString()
})

// In app/api/family-links/[id]/revoke/route.ts (after revoke):
const otherFamilyId = isFamilyA ? link.family_b_id : link.family_a_id
await admin.from('family_link_notifications').insert({
  link_id: linkId,
  event_type: 'link_revoked',
  recipient_family_id: otherFamilyId,
  created_at: new Date().toISOString()
})
```

**Also Need:** Add realtime subscription in `use-notifications.ts`:

```typescript
// Around line 700, add:
const familyLinkChannel = supabase
  .channel(`family_link_notifications:${familyId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'family_link_notifications',
      filter: `recipient_family_id=eq.${familyId}`
    },
    (payload) => {
      const notif = payload.new
      // Transform to AppNotification...
    }
  )
  .subscribe()

return () => { familyLinkChannel.unsubscribe() }
```

---

### **GAP #2: Invite Accepted Notifications Missing**

**Issue:** When someone accepts an invite and joins, the **inviter is never notified**.

**Current Flow:**
1. User A creates invite → OK
2. User B accepts invite via `/api/invites/[token]/claim/route.ts`
3. User B joins family → `family_members` INSERT triggers `member_joined` notification
4. ❌ **User A (inviter) never gets "Your invite was accepted" notification**

**Why It Matters:**
- User A has no idea if their invite worked
- No sense of completion for the invite flow

**Fix Required:**

In `/app/api/invites/[token]/claim/route.ts`, after successful claim:

```typescript
// After line ~200 (after member created/claimed):
// Notify the inviter that their invite was accepted
const { data: inviteData } = await admin
  .from('invite_links')
  .select('created_by, family_id')
  .eq('code', normalizedToken)
  .single()

if (inviteData?.created_by) {
  await admin.from('claim_audit_log').insert({
    family_id: inviteData.family_id,
    node_id: memberId,
    actor_user_id: inviteData.created_by,
    action: 'invite_accepted', // NEW action type
    details: {
      invitee_name: name,
      invite_code: normalizedToken
    },
    created_at: new Date().toISOString()
  })
}
```

**Also Need:** Update `claim_audit_log` action constraint:

```sql
-- Add 'invite_accepted' to allowed actions
ALTER TABLE claim_audit_log DROP CONSTRAINT IF EXISTS claim_audit_log_action_check;
ALTER TABLE claim_audit_log ADD CONSTRAINT claim_audit_log_action_check CHECK (
  action IN (
    'submitted', 'pending_admin_review', 'verified', 'approved',
    'rejected', 'revoked', 'abandoned', 'transferred', 'reclaimed',
    'invite_accepted' -- NEW
  )
);
```

---

### **GAP #3: Member Delete/Merge Don't Notify**

**Issue:** When admin deletes a member or merges duplicates, **no notification is sent**.

**Missing Notifications:**
- ❌ Member deleted (no one notified)
- ❌ Duplicates merged (no notification which node was kept/removed)
- ❌ Claim transferred (current code has NO audit log entry)

**Impact:**
- Silent data changes confuse users
- "Where did my profile go?"
- No audit trail for merge operations

**Fix Required:**

**For Member Delete:**
```typescript
// In the delete member API (if it exists):
await admin.from('claim_audit_log').insert({
  family_id: familyId,
  node_id: memberId,
  actor_user_id: user.id,
  action: 'member_deleted', // NEW action
  details: { member_name: member.name },
  created_at: new Date().toISOString()
})
```

**For Duplicate Merge:**
```typescript
// In app/api/members/[id]/merge/route.ts (after merge):
await admin.from('claim_audit_log').insert({
  family_id: primaryFamilyId,
  node_id: primaryId,
  actor_user_id: user.id,
  action: 'duplicates_merged', // NEW action
  details: {
    primary_name: primary.name,
    duplicate_name: duplicate.name,
    duplicate_id: duplicateId
  },
  created_at: new Date().toISOString()
})
```

**For Claim Transfer:**
```typescript
// In app/api/nodes/[id]/transfer-claim/route.ts (currently MISSING):
await admin.from('claim_audit_log').insert({
  family_id: node.family_id,
  node_id: nodeId,
  actor_user_id: user.id,
  action: 'transferred', // Already in constraint but NEVER USED
  details: {
    from_user_id: node.claimed_by_user_id,
    to_user_id: targetUserId,
    reason: body.reason
  },
  created_at: new Date().toISOString()
})
```

---

### **GAP #4: Claim Rejection Doesn't Notify Claimer**

**Issue:** When admin rejects a claim, the **claimer is never notified**.

**Current Flow:**
1. User submits claim → Admin gets notification ✅
2. Admin rejects claim → Updates `claim_requests` table ✅
3. ❌ **User who claimed never knows it was rejected**

**Why It's Bad:**
- User waits forever for approval
- No feedback loop
- Poor UX

**Fix:**

In claim review endpoint (wherever admin approves/rejects):

```typescript
// After rejecting claim:
await admin.from('claim_audit_log').insert({
  family_id: claim.family_id,
  node_id: claim.node_id,
  actor_user_id: claim.claimant_user_id, // Notify the claimer
  action: 'rejected',
  details: {
    rejected_by: adminUserId,
    rejection_reason: reason
  },
  created_at: new Date().toISOString()
})
```

---

### **GAP #5: No Notification When Claim Approved**

**Issue:** Similar to #4 - **user isn't notified when claim is approved**.

**Current:**
- Admin approves → `family_members.claimed_by_user_id` updated
- ❌ No `claim_audit_log` entry with action='approved'
- User has to check dashboard to see if approved

**Fix:**

```typescript
// In claim approval logic:
await admin.from('claim_audit_log').insert({
  family_id: node.family_id,
  node_id: nodeId,
  actor_user_id: claimant.id,
  action: 'approved',
  details: {
    approved_by: adminUserId,
    node_name: node.name
  },
  created_at: new Date().toISOString()
})
```

---

## 🟡 HIGH PRIORITY ISSUES

### **ISSUE #1: Realtime Subscriptions Don't Check family_id Filter**

**Problem:** Some realtime channels don't filter by `family_id`, so users might get notifications from other families.

**Evidence:**

```typescript
// Line 311 - Stories subscription:
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'stories',
  // ❌ NO FILTER! Will receive ALL story inserts across all families
}, ...)
```

**Impact:**
- Privacy leak - user sees notifications from other families
- Noise - irrelevant notifications

**Fix:**

```typescript
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'stories',
  filter: `family_id=eq.${familyId}` // ✅ Add this
}, ...)
```

**Need to check:**
- Line 311: stories subscription ❌ NO FILTER
- Line 361: family_members UPDATE for visibility ❌ NO FILTER
- Line 416: family_members UPDATE for profile changes ❌ NO FILTER
- Line 538: profiles UPDATE ❌ NO FILTER

**All need:** `filter: 'family_id=eq.${familyId}'` or similar

---

### **ISSUE #2: Duplicate Notifications from Multiple Sources**

**Problem:** `member_joined` notification is created TWICE:

1. Realtime subscription fires on `family_members` INSERT (line 268)
2. `claim_audit_log` might also have 'submitted' action for the same member

**Evidence:**

```typescript
// Line 268: Realtime member INSERT
const joinNotifs = useMemo<AppNotification[]>(() => {
  if (!members) return []
  const recent = members.filter(m => {
    if (!m.addedAt) return false
    const added = new Date(m.addedAt)
    return diffDays < 7  // Last 7 days
  })
  // Creates notification for EVERY new member
}, [members, selfMemberId])

// Also: claim_audit_log might have 'submitted' action for same member
```

**Impact:**
- User sees "Member X joined" twice
- Notification bloat

**Fix:**
Deduplicate by `node_id`:

```typescript
const allNotifs = [
  ...claimNotifs,
  ...joinNotifs,
  ...storyNotifs,
  // ...
]

// Deduplicate by node_id (keep highest priority)
const deduped = new Map<string, AppNotification>()
for (const notif of allNotifs) {
  const key = notif.nodeId ?? notif.id
  const existing = deduped.get(key)
  if (!existing || getPriority(notif.type) > getPriority(existing.type)) {
    deduped.set(key, notif)
  }
}
return Array.from(deduped.values())
```

---

### **ISSUE #3: No "Mark as Read" Persistence**

**Current:** Read notifications are stored in `localStorage` only.

**Problem:**
- User marks notifications read on desktop
- Opens mobile app → same notifications show as unread
- No cross-device sync

**Current Implementation:**

```typescript
// Line 83:
const STORAGE_KEY = 'fg_read_notif_ids'
function getReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  const raw = localStorage.getItem(STORAGE_KEY) ?? '[]'
  try {
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}
```

**Better Solution:**

Create `notification_read_status` table:

```sql
CREATE TABLE notification_read_status (
  user_id UUID REFERENCES auth.users(id),
  notification_id TEXT,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_id)
);

-- RLS
CREATE POLICY "users_read_own" ON notification_read_status
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "users_insert_own" ON notification_read_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

Then update `markAllRead` to write to DB:

```typescript
const markAllRead = useCallback(async () => {
  const ids = [/* all notification IDs */]
  
  // Write to database
  await supabase.from('notification_read_status').upsert(
    ids.map(id => ({ user_id: user.id, notification_id: id }))
  )
  
  // Also keep localStorage as fallback
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}, [notifications, user])
```

---

## 🟠 MEDIUM PRIORITY ISSUES

### **ISSUE #4: Member Updated Notifications Too Noisy**

**Current:** Every field update triggers notification (throttled to 5 minutes).

**Problem:**
- Admin updates 10 members in bulk → 10 notifications
- User edits own profile 3 times → 3 notifications (if >5 min apart)

**Current Throttling:**

```typescript
// Line 475:
// Throttle: one notification per member per 5-minute window
const key = `${updated.id}-${Math.floor(new Date(updated.updated_at).getTime() / 300_000)}`
if (seen.has(key)) return null
seen.add(key)
```

**Better Solution:**

Group by actor and time window:

```typescript
// If same user updates multiple members within 5 minutes:
// Show "Admin updated 5 members" instead of 5 separate notifications
```

---

### **ISSUE #5: No Notification Cleanup**

**Issue:** Notifications accumulate forever in `claim_audit_log`.

**Impact:**
- Database bloat
- Slow queries as table grows
- Old notifications never expire

**Fix:**

Add cleanup job (database function + cron):

```sql
-- Delete notifications older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM claim_audit_log
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  DELETE FROM family_link_notifications
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Run daily via pg_cron or Supabase Edge Function
```

---

## 🟢 LOW PRIORITY

### **ISSUE #6: Birthday Notifications Calculate on Every Render**

**Current:** Birthday logic runs on every render of `useNotifications`.

**Optimization:**

```typescript
// Memoize birthday calculations:
const birthdayNotifs = useMemo(() => {
  return members.filter(m => {
    // birthday logic...
  }).map(m => ({
    type: 'birthday_today',
    // ...
  }))
}, [members]) // Only recalculate when members change
```

Currently it's inside a useMemo but could be more efficient.

---

## ✅ WHAT'S WORKING WELL

### **Strengths:**

1. **Claim System Notifications** ✅
   - Uses `claim_audit_log` properly
   - Realtime subscriptions work
   - Admins get notified of pending claims

2. **Realtime Member Updates** ✅
   - New members trigger notifications
   - Story additions work
   - Visibility changes tracked

3. **Privacy-Aware** ✅
   - Uses `privacyAwareName()` to hide private member names
   - Respects visibility settings

4. **Grouped Notifications** ✅
   - Bulk member adds (3+) collapse into one notification
   - Prevents spam

5. **Priority System** ✅
   - High/medium/low priorities implemented
   - Sorted correctly in UI

---

## 🔧 FIXES TO IMPLEMENT

### **Critical Fixes (Before Launch):**

1. ✅ Add family link notification creation in 3 API routes
2. ✅ Add realtime subscription for family link notifications
3. ✅ Add invite accepted notification
4. ✅ Add claim approved/rejected notifications to notify claimer
5. ✅ Add family_id filters to all realtime subscriptions

### **High Priority (Week 1):**

6. ✅ Add duplicate merge notification
7. ✅ Add member delete notification
8. ✅ Add claim transfer audit log entry
9. ✅ Implement notification_read_status table for cross-device sync

### **Medium Priority (Week 2-3):**

10. ✅ Improve member updated grouping
11. ✅ Add notification cleanup job
12. ✅ Deduplicate notifications by node_id

---

## 📊 NOTIFICATION EVENT COVERAGE

### **Events That Trigger Notifications:**

| Event | Notification Type | Status | Priority |
|-------|------------------|--------|----------|
| User claims node | `claim_submitted` | ✅ Working | Medium |
| Admin reviews claim | `claim_pending_admin` | ✅ Working | Medium |
| Claim approved | `claim_approved` | ❌ **MISSING** | High |
| Claim rejected | `claim_rejected` | ❌ **MISSING** | High |
| Claim revoked | `claim_revoked` | ✅ Working | High |
| Member added | `member_joined` | ✅ Working | Medium |
| Member updated | `member_updated` | ⚠️ Noisy | Low |
| Member deleted | `member_deleted` | ❌ **MISSING** | Medium |
| Duplicates merged | `duplicates_merged` | ❌ **MISSING** | Medium |
| Story added | `story_added` | ✅ Working | Medium |
| Visibility changed | `visibility_changed` | ✅ Working | Medium |
| Role changed | `role_changed` | ✅ Working | High |
| Invite accepted | `invite_accepted` | ❌ **MISSING** | High |
| Family link requested | `link_requested` | ❌ **MISSING** | High |
| Family link accepted | `link_accepted` | ❌ **MISSING** | High |
| Family link rejected | `link_rejected` | ❌ **MISSING** | Medium |
| Family link revoked | `link_revoked` | ❌ **MISSING** | Medium |
| Birthday today | `birthday_today` | ✅ Working | Medium |
| Birthday upcoming | `birthday_upcoming` | ✅ Working | Low |
| Anniversary | `anniversary` | ✅ Working | Medium |

**Coverage:** 10/20 events working = **50%**

---

## 🎯 RECOMMENDED ACTION PLAN

### **Before Beta Launch (MUST FIX):**

1. Fix family link notifications (30 minutes)
2. Add family_id filters to realtime subscriptions (15 minutes)
3. Add invite accepted notification (10 minutes)

**Total: 1 hour** - Critical for user trust

### **Week 1 (High Priority):**

4. Add claim approved/rejected notifications (20 minutes)
5. Add notification_read_status table (30 minutes)
6. Add merge/delete notifications (20 minutes)

**Total: 1 hour 10 minutes**

### **Post-Launch (Can Wait):**

7. Notification cleanup job
8. Improved grouping
9. Deduplicate by node_id

---

## ✅ FINAL VERDICT

**Current State:** B (50% coverage)

**Potential:** A+ (95% coverage after fixes)

**Recommendation:** 
Fix the 3 critical issues (1 hour work) before beta launch. The notification system foundation is solid, but several important events don't trigger notifications, which will confuse users.

**Biggest Impact Fix:**
Family link notifications - this feature is completely non-functional without notifications.

---

**END OF AUDIT**
