Let me read the key flows to give you an accurate picture of what's actually built.

Completed Task: "Map complete user journey across all pages"

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/auth/signin/page.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/auth/signup/page.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/onboarding/page.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/%28app%29/dashboard/page.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/%28app%29/invite/page.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/%28app%29/matches/page.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/%28app%29/matches/inbox/page.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/%28app%29/biodata/page.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/%28app%29/layout.tsx)

Read [](file:///Users/rahul/Downloads/family-graph-business-plan/app/%28app%29/members/page.tsx)

Here's the complete end-to-end journey based on the actual code:

---

## Entry Points

There are three ways someone enters the product:

**1. Direct signup** → `/auth/signup` or `/auth/signin`
**2. Invite link** → `/join/{code}` (received via WhatsApp/QR)
**3. Demo mode** → any URL with `?demo=1` — no auth required, uses sample data throughout

---

## Case 1: New User — Matrimony Intent

**Step 1 — Auth** (`/auth/signin` or `/auth/signup`)
- Three methods: Phone OTP, Email+Password, Google OAuth
- Phone OTP requires an SMS gateway configured in Supabase (if not configured, shows a friendly error and falls back to email)
- Google is the fastest path (one tap)
- Any `?next` param in the URL is preserved throughout — critical for invite links

**Step 2 — Onboarding** (`/onboarding`) — 3 screens
- Screen 1: Name, gender, birth year, optional photo upload
- Screen 2: Intent selector → "Find a match" / "Build family tree" / "Both"
- Screen 3: City, gotra (with autocomplete), religion (only shown if matrimony/both)
- On completion: creates a `families` row, a `profiles` row, a `family_members` row (self node, generation 3, role admin), and sets `is_biodata_visible = true` if matrimony intent
- Routes to → `/biodata/setup`

**Step 3 — Biodata Setup** (`/biodata/setup`)
- User fills in professional fields (occupation, education, height, income range, partner expectations)
- This populates their own `family_members` node

**Step 4 — Dashboard** (`/dashboard`)
- If 0 other members added: sees ghost-node empty state (Add Father, Add Mother, Add Sibling nodes with pulsing dashed borders) + trust score motivation
- Dashboard shows the family tree canvas (hierarchical view is default)
- Mobile FAB (+) always visible for quick-add

**Step 5 — Invite Family** (`/invite`)
- Generates invite links with role (Viewer/Contributor/Admin) and expiry
- WhatsApp share includes family stats ("5 members already here")
- QR code downloadable as SVG
- Active links tracked with revoke capability

**Step 6 — Browse Matches** (`/matches`)
- Shows one match card at a time (vertical browse, not swipe)
- Each card shows: name, age, occupation, city, gotra compatibility, family member count + verified count, mutual relatives
- Three actions per card: Pass (❌), Request Intro (💬 opens message dialog), Interested (❤️)
- Trust score strip shown at top if score < 70, with specific `+pts` actions
- Search panel: filter by name, gotra, city, age range

**Step 7 — Inbox** (`/matches/inbox`)
- **Introductions tab**: Requests received from other families with their message — Accept / Decline
- **Interests tab**: Likes received — "Like back" links back to their card in the feed
- **Mutual tab**: Both families liked each other → "Connect" button opens WhatsApp with a pre-filled intro message
- Empty states on each tab show trust score improvement actions

---

## Case 2: New User — Family Tree Intent

Same auth + onboarding, but:
- Onboarding routes to `/dashboard?welcome=1` (skips biodata setup)
- `is_biodata_visible` stays false — they don't appear in the matrimony feed
- They can still go to `/biodata` later to opt in

---

## Case 3: Invited Family Member (Claim Flow)

Someone receives a WhatsApp invite link → clicks `/join/{code}`

1. **If not signed in**: Redirects to `/auth/signin?next=/join/{code}` — the `?next` is preserved through signup/signin
2. **After auth**: Lands on join page — sees which family they're joining and what role they're being given
3. **Claim their node**: If a node already exists for them (added by the family admin), they can claim it — enters name + DOB to verify against the existing node data
4. **Node claim confidence**: High confidence (name + DOB match) → likely auto-approved; low confidence → goes to admin claim review queue (`enableClaimReviewQueue: true`)
5. **After claim**: Their `family_members` row gets `is_claimed = true`, `claimed_by_user_id = their_user_id`
6. **Trust score impact**: The original member's `parent_claimed` signal fires → their score jumps +15 pts

---

## Case 4: Admin Managing the Tree

- **Add member**: QuickAddMemberDialog (father/mother/son/daughter/spouse/sibling shortcuts) or full AddMemberDialog
- **Members list** (`/members`): Filter by generation, side (paternal/maternal/spouse), search by name. Color-coded badges per side.
- **Invite management** (`/invite`): See all active invite codes, used counts, revoke any link
- **Claim review**: If `enableClaimReviewQueue` is on, admin sees pending claims and approves/rejects
- **Moderation** (`/moderation`): For moderator role — conflict resolution, pending claims UI

---

## Case 5: Demo Mode (No Auth)

Any page with `?demo=1` or when not logged in:
- Uses `sampleFamilyMembers` (hardcoded dataset)
- All pages fully functional — tree, biodata, matches, inbox all show sample data
- Write operations (create member, send interest, update visibility) show toast: "Sign in to save changes"
- Demo session stored in `sessionStorage` so it persists across page navigations within a session

---

## Case 6: Returning User (Day 2+)

- Auth session persists (Supabase JWT)
- Lands on `/dashboard` — sees their family tree
- Inbox badge on sidebar/mobile nav shows unread interest count
- Trust score strip on matches page visible if score < 70
- If they invited someone who claimed their node → trust score updated, new matches may appear

---

## Role-Based Differences

| Capability | Viewer | Contributor | Admin |
|---|---|---|---|
| Browse family tree | ✅ | ✅ | ✅ |
| Add family members | ❌ | ✅ | ✅ |
| Create invite links | ❌ | Viewer/Contributor only | All roles |
| Revoke invite links | ❌ | ❌ | ✅ |
| Approve/reject claims | ❌ | ❌ | ✅ |
| Biodata visibility toggle | ❌ | ❌ | ✅ (or own node) |

---

## Trust Score — How It Changes Across the Journey

| Moment | Score change |
|---|---|
| Signs up (claimed self) | +10 |
| Verifies phone | +15 |
| Adds photo | +15 |
| Fills birth date | +10 |
| Fills gotra | +10 |
| A parent claims their node | +15 |
| Family reaches 3+ members | +10 |
| Biodata active + >80% complete | +15 |
| **Max possible** | **100** |

The score directly affects match visibility — low-score profiles appear less in other families' feeds.

---

## Known Gaps (Built but not wired, or explicitly disabled)

| Gap | State |
|---|---|
| Photo is optional — initials shown if no photo | UI soft-enforced only |
| Mutual match → no celebration moment | Empty tab state only |
| After mutual match → no structured family-to-family contact facilitation | Not built |
| OTP expired / wrong code error handling | Partially implemented |
| Offline state | No banner, changes may fail silently |
| `enableStripePayments: false` | No paywall, full access to everything |