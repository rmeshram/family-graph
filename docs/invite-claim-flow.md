# Invite & Claim Flow — Complete Reference

> Last updated: May 2026  
> Files: `app/join/[code]/page.tsx`, `hooks/use-invites.ts`, `app/api/nodes/[id]/claim/route.ts`

---

## Two Types of Invite Links

| Type | `invite_type` DB field | Created by | `max_uses` | Purpose |
|------|----------------------|------------|-----------|---------|
| **General invite** | `null` | Invite widget / `/invite` page | 50 | Anyone can join the family. No identity verification. |
| **Node-claim invite** | `node_claim` | Member detail panel → "Invite to claim" | 1 | Targeted: sent to a specific person so they can claim an existing node. Single-use, identity-verified. |

---

## Flow A — General Invite (multi-use link)

### What the new user sees, step by step

```
Step 1 — Preview screen (status = 'preview')
  - Family name, member count, generation count
  - Inviter name (if known)
  - Recent first-names (only if family privacy_mode = 'open'; hidden if 'protected' or 'closed')
  - "Join family tree" CTA

  → user clicks "Join the family tree"
  → if not signed in: redirect to /auth/signin?next=/join/<code>, returns here after login

Step 2 — Relationship picker (status = 'relate')
  CURRENTLY SKIPPED — FEATURE_FLAGS.enableInviteRelationshipStep = false
  When enabled, user picks: Spouse / Son+Daughter / Father+Mother / Sibling / Relative / Skip

Step 3 — Claim step (status = 'claim')
  [the newly redesigned "Is this you?" screen]
  
  Case A — Unclaimed nodes exist in the family:
    - Scores every unclaimed node against the joining user (name + birth year + phone + email)
    - If top match passes isRecommendedClaimMatch() threshold → auto-pre-selects it
    - Shows ONLY the top-scored node as a big "Is this you?" card:
        - Avatar initials + full name + relationship + confidence tier badge
        - Tap to select (checkbox circle)
    - Below the card: "That's not me — create a new profile" (secondary option)
    - If no strong match: neither option is pre-selected; user must choose explicitly

  Case B — No unclaimed nodes in the family:
    - Shows "Join the family tree" form directly
    - Name input + gender picker
    - "Join Family Tree" button

Step 4 — Joining spinner (status = 'joining')
  Calls joinWithCode() in hooks/use-invites.ts

Step 5 — Success (status = 'success')
  - 2 second delay
  - window.location.href = '/dashboard'  ← FULL page reload (forces profile re-fetch)
```

### What `joinWithCode()` does (the DB writes)

**If the user picked an existing node (claimed)**
1. Sets `profiles.family_id` = family's ID, `profiles.role` = invite's role
2. Updates `family_members` → `claimed_by_user_id = userId`, `is_claimed = true`
3. Updates `profiles` → `member_id = claimedNodeId`, `display_name = ...`
4. Writes to `claim_audit_log`
5. Increments `invite_links.used_count`

**If the user chose "create new profile"**
1. Sets `profiles.family_id` = family's ID, `profiles.role` = invite's role
2. Inserts a NEW row in `family_members` (name, gender, generation, network_group)
   - If relationship step is enabled: derives `parentIds` / `spouseIds` / `generation` from inviter's node
   - If skipped: `generation = 3`, no `parentIds`, no `spouseIds`
3. Updates `profiles` → `member_id = newMember.id`, `display_name = ...`
4. Increments `invite_links.used_count`

---

## Flow B — Node-Claim Invite (single-use, identity-verified)

Sent by an admin to a specific person whose node already exists in the tree.

### What the invited user sees

```
Step 1 — Identity verification screen (status = 'node_claim')
  Shows immediately — no Preview or Relate steps.
  
  - "Verify your identity" heading
  - Identity hint (node name) from invite_links.identity_hint
  - Two fields pre-filled from user's profile:
      · Your name (ncName) ← pre-filled from profiles.display_name (fixed May 2026)
      · Birth year (ncBirthYear) ← blank, optional
  - Remaining attempts shown if prior failures exist
  - "Verify & Join" button

Step 2 — POST /api/nodes/<nodeId>/claim
  Server-side identity scoring (see section below)
  On success → update profiles.family_id + role, consume invite → redirect to /dashboard
  On failure → show error + decrement remaining attempts (max 3 tries, then 24h lockout)
```

### Identity scoring (server-side, `scoreIdentity()`)

```
Input: node.name, node.birth_year, submitted name, submitted birth year

Scoring:
  +60  exact full-name match            → passes alone (60 ≥ threshold 40)
  +45  fuzzy match (Levenshtein ≤ 2)    → passes alone
  +30  first-name only match            → needs birth year to reach 40
  +40  exact birth year
  +25  birth year within ±2 years

Fail conditions:
  - name mismatch (no partial match found at all)  → always reject
  - score < 40                                      → reject

Examples:
  "Rahul Meshram" vs "Rahul Meshram"  → 60pts  ✅ PASS
  "Rahul" vs "Rahul Meshram"          → 30pts  ❌ needs birth year (+10 or more)
  "Rahul" vs "Rahul" + birth year ±0  → 70pts  ✅ PASS
  "Rahul" vs "Rahu1" (typo, edit=1)   → 45pts  ✅ PASS
  "Suresh" vs "Ramesh"                → 0pts   ❌ FAIL (name mismatch)
```

### What `handleNodeClaim()` does (the DB writes)

1. POST `/api/nodes/<nodeId>/claim` (identity scoring happens server-side)
2. On 200: client sets `profiles.family_id = nodeClaim.familyId`, `role = 'contributor'`
3. Marks `invite_links.consumed_at` (single-use — now permanently consumed)
4. Server (inside the API route) also: inserts `user_node_links`, updates `family_members.claim_status = 'claimed'`, updates `profiles.member_id = nodeId`
5. `window.location.href = '/dashboard'` (full page reload)

---

## What the New User Sees on the Dashboard

### After a successful claim (either flow A with claim, or flow B)

The joiner's `profiles` row now has:
- `family_id` = the family they joined
- `member_id` = the existing node they claimed
- `role` = contributor (or as set in invite)

On the dashboard:
- `useMembers(familyId)` fetches ALL `family_members` WHERE `family_id = X` → joiner **sees the full tree**
- Their node (`member_id`) is already placed with `parent_ids` / `spouse_ids` set by the admin → **they appear in the correct position in the tree**
- `selfMember` is resolved as the node matching `profile.member_id` → profile completeness bar shows their own missing data

✅ **The joiner sees the complete, connected family tree immediately.**

### After "create new profile" (flow A, no claim)

The joiner's `profiles` row now has:
- `family_id` = the family they joined
- `member_id` = the newly created node (a brand-new row)
- `role` = contributor

On the dashboard:
- They see ALL existing members of the family ✅
- Their own new node has **no `parent_ids`, no `spouse_ids`** (unless relationship step was enabled and they picked one)
- Their node appears as an **isolated floating node** in the graph — visible but disconnected
- An admin needs to manually connect it via "Add Relative" → their position in the tree

### ⚠️ The visibility problem (root cause)

**Why new joiners sometimes see an empty tree / only demo data:**

The dashboard checks `isDemoMode = !authLoading && !user`. If the user is logged in but:

1. `profile.family_id` is null → `useMembers(null)` returns `[]` → only demo data shown
2. RLS policy blocks the read → `dbError` banner shown, members = `[]`

**When does (1) happen?**  
- Onboarding not completed (user signed up directly without an invite)  
- The join API failed silently (session expired mid-flow, now fixed with `refreshSession()`)  
- The identity scoring always rejected the claim (was broken — max score was 35 pts but threshold was 40; fixed May 2026)  

**The full-page redirect fixes stale profile data:**  
`window.location.href = '/dashboard'` (not `router.push`) forces a hard reload so `AuthProvider` re-fetches the profile with the updated `family_id` and `member_id`.

---

## Unclaim / Admin Revoke

There is no self-service "unclaim" button for end users. An admin can:

1. Open the member's detail panel → "Revoke claim" (calls `handleRevokeClaim` in dashboard)
2. This calls `setAnonymous` / `claimMember` from `useMembers` which:
   - Sets `family_members.claimed_by_user_id = null`, `is_claimed = false`
   - (Does NOT delete the node — the placeholder remains for someone else to claim)
3. The previously-bound user loses `profiles.member_id` reference but keeps `profiles.family_id` → they still see the tree as a floating node

---

## Data Flow Diagram

```
Admin creates family
        │
        ▼
Admin adds node "Rahul Meshram" (unclaimed, no user account)
  ┌─────────────────────────────────┐
  │ family_members row:             │
  │   name = "Rahul Meshram"        │
  │   parent_ids = ["dad-id"]       │
  │   spouse_ids = ["wife-id"]      │
  │   is_claimed = false            │
  │   claim_status = "unclaimed"    │
  └─────────────────────────────────┘
        │
        ▼
Admin sends invite (two options):
  
  Option A — General link (/join/ABCD1234)
    → Rahul opens link → sees family preview
    → Claim step: "Is this you? Rahul Meshram · Father"  [Yes] [Not me]
    → Clicks Yes → joinWithCode(claimMemberId = "rahul-node-id")
    → profiles.member_id = "rahul-node-id"
    → family_members.is_claimed = true
    → Dashboard: Rahul sees full tree, connected at correct position ✅

  Option B — Node-claim link (/join/XY123456, single-use)
    → Rahul opens link → sees identity form (pre-filled "Rahul Meshram")
    → Enters birth year → server scores: 60+40 = 100pts → PASS
    → POST /api/nodes/rahul-node-id/claim → success
    → profiles.family_id + member_id set
    → Dashboard: Rahul sees full tree, connected at correct position ✅

  Option C — No claim (new member)
    → Rahul opens general link, taps "That's not me"
    → New node created: name="Rahul", no parent_ids, generation=3
    → Dashboard: Rahul sees full tree, his node is a floating island ⚠️
    → Admin must manually connect his node to complete the tree
```

---

## Key Files

| File | Role |
|------|------|
| `app/join/[code]/page.tsx` | UI for entire join flow (all steps) |
| `hooks/use-invites.ts` — `useJoinFamily.joinWithCode()` | DB writes for general invite join |
| `app/api/nodes/[id]/claim/route.ts` | Server-side identity scoring + node_claim writes |
| `lib/match-detection.ts` | Client-side scoring for claim step UI (shows "high/medium/low" confidence) |
| `hooks/use-members.ts` | `useMembers(familyId)` — fetches all tree members post-join |
| `app/(app)/dashboard/page.tsx` — `selfMember` | Resolves which node is "you" via `profile.member_id` |

---

## Shared Relationship Graph Architecture

### One graph, many perspectives

The family tree is a **single shared graph** — not a separate tree per user. Every person
is one unique node. Relationships are stored as normalized, structural graph edges on each
`family_members` row:

```
family_members
  id           UUID
  name         TEXT
  parent_ids   UUID[]    ← structural edges: parent pointers
  spouse_ids   UUID[]    ← structural edges: spouse links
  generation   INT       ← 0 = great-grandparents, 3 = "you" layer, 4 = children, …
  relationship TEXT      ← convenience label stored at insert time (admin's perspective)
  gender       TEXT
  …
```

The `relationship` text field (e.g. `'father'`, `'aunt'`) is only a **snapshot label** from
the perspective of whoever added the node. It is NOT used to compute what another user sees.
The live, per-viewer label is always recomputed dynamically from the graph edges.

---

### How relationship labels are computed per viewer

**File: `lib/relation-engine.ts` — `computeRelationLabel(fromId, toId, members)`**

1. **BFS with edge-type encoding** — walks the graph from the viewer's own node (`fromId`) to the
   target node (`toId`), recording each hop as one of three edge types:
   - `UP` — moved to a parent
   - `DOWN` — moved to a child
   - `SPOUSE` — moved to a spouse

2. **Path → label** — the ordered sequence of edge types is pattern-matched to a human label,
   taking the target node's gender into account:

   ```
   UP            → Father / Mother
   DOWN          → Son / Daughter
   SPOUSE        → Husband / Wife
   UP,UP         → Grandfather (Dada/Nana) / Grandmother (Dadi/Nani)
   UP,UP,DOWN    → Uncle (Chacha/Mama) / Aunt (Bua/Mausi)
   UP,DOWN       → Brother / Sister
   UP,DOWN,DOWN  → Nephew (Bhatija) / Niece (Bhatiji)
   UP,UP,DOWN,DOWN → First Cousin (Bhai/Behen)
   SPOUSE,UP     → Father-in-law / Mother-in-law
   SPOUSE,UP,DOWN → Brother-in-law (Saala/Devar) / Sister-in-law (Saali/Nanad)
   … and 30+ more patterns
   ```

   Indian kinship terms (Chacha, Mama, Bua, Mausi, Bhabhi, Jija, Saala, Nanad, etc.) are
   automatically included in the label where the path unambiguously identifies them.

3. **Paternal vs maternal distinction** — for 3-step uncle/aunt paths (`UP,UP,DOWN`), the
   engine inspects which grandparent node is in the path to resolve `Paternal Uncle (Chacha/Tau)`
   vs `Maternal Uncle (Mama)` and `Paternal Aunt (Bua)` vs `Maternal Aunt (Mausi/Mami)`.

4. **Fallback** — unrecognised paths return `"N-step relative"`.

**Concrete example:**

```
Rahul adds Sunita as his Mother.
Stored edges: Rahul.parent_ids = [..., sunita-id]

When Sunita logs in and views the tree:
  computeRelationLabel(sunita-id, rahul-id, members)
  BFS from Sunita → Rahul: hop is DOWN (Sunita is a parent, Rahul is her child)
  seq = 'DOWN', target gender = male → "Son"
  ✅ Sunita sees Rahul as "Son" automatically.

When Rahul's paternal aunt logs in and views Rahul:
  BFS from aunt → (shared grandparent) → Rahul's father → Rahul
  seq = 'DOWN,DOWN', target gender = male → "Nephew (Bhatija/Bhanja)"
  ✅ She sees Rahul as her nephew automatically.
```

---

### Handling nodes with no structural edges (isolated nodes)

**File: `lib/relation-engine.ts` — `enrichMembersWithDerivedEdges(members, selfId)`**

When an admin adds a member with only a `relationship` label and no explicit `parent_ids` /
`spouse_ids` (which is common for distant relatives), the engine synthesises **virtual
intermediate nodes** so that BFS still has a traversable path.

```
Admin adds "Kantabai" with relationship = "aunt"
  → no parent_ids, no spouse_ids stored

enrichMembersWithDerivedEdges() sees "aunt" on an isolated node:
  → creates virtual grandparent node __virt_gp_<selfId>
  → sets Kantabai.parent_ids = [__virt_gp_<selfId>]
  → sets Rahul's parent.parent_ids = [__virt_gp_<selfId>]

BFS from Rahul → Kantabai now finds the path:
  Rahul →UP→ Rahul's parent →UP→ VGP →DOWN→ Kantabai
  seq = UP,UP,DOWN → "Aunt"
```

Virtual nodes are transparent to the UI — `members.find()` returns `undefined` for them,
so they are never rendered as cards or listed in sidebars.

---

### Inverse relationship engine

**File: `lib/relationship-engine.ts` — `getInverseRelationship(label, gender)`**

Used when adding a member to automatically suggest the reverse label. The table covers
100+ relationship types, all gender-aware:

```
getInverseRelationship('father', 'male')    → 'son'
getInverseRelationship('father', 'female')  → 'daughter'
getInverseRelationship('uncle', 'male')     → 'nephew'
getInverseRelationship('aunt', 'female')    → 'niece'
getInverseRelationship('brother', 'female') → 'sister'
```

---

### Auto-suggestions after adding a member

**File: `lib/relationship-engine.ts` — `computePostAddSuggestions()`**

After any new node is added, the engine runs three checks and surfaces confirmation prompts
to the admin (never auto-applied):

1. **Co-parent spouse suggestion** — if two nodes share a `parent_ids` child but are not
   yet linked as spouses, suggest connecting them as husband/wife.
2. **Sibling suggestion** — if two members share the same `parent_ids` but have no explicit
   sibling edge, offer to label them as siblings.
3. **In-law chain suggestion** — when a spouse is added, check for unlinked in-law
   relationships that should now exist.

---

### Why there is no duplication of trees

Because `parent_ids` and `spouse_ids` are stored on **nodes** (not on relationships keyed to
a viewer), a single write is sufficient for all viewers:

```
Rahul.parent_ids = [dad-id, mom-id]

Any user who opens the tree:
  → computeRelationLabel(their-own-id, rahul-id, allMembers)
  → BFS finds the correct path from their node to Rahul
  → Returns the correct label for their perspective

No second tree, no copy, no per-user mapping tables needed.
```

Real-time sync is automatic: all members query `family_members WHERE family_id = X`.
When any node is updated (new parent added, spouse linked), the Supabase Realtime
subscription in `useMembers()` pushes the change to all active sessions immediately.

---

### Limitations of the current implementation

| Limitation | Details |
|-----------|---------|
| **Step-relative ambiguity** | Paths longer than ~4 hops fall back to `"N-step relative"` — extended cousin chains beyond 2nd cousin are not labelled precisely |
| **Isolated nodes depend on `relationship` label** | Nodes with no structural edges AND a missing/wrong relationship label will be attached to a virtual parent of `self`, possibly mis-placed in the graph |
| **One `relationship` stored per node** | The field reflects the perspective of whoever added the node. It is a UI hint only and does not affect BFS computation |
| **Virtual nodes are not persisted** | `enrichMembersWithDerivedEdges` runs client-side on every render. Structural `parent_ids` should be set properly for robust graph traversal |
