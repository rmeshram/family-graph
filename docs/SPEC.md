# Family Graph — Product Requirements Document
**Version:** 1.0  
**Status:** Living Document — Single Source of Truth  
**Last Updated:** 2026-06-22  
**Owner:** Founder  

---

## How to Use This Document

- Every feature is tagged `[MVP]`, `[V2]`, or `[V3]`
- Every feature that changes existing behavior is tagged with its **feature flag name** (`FF: flag_name`)
- When a feature flag is `OFF` → current behavior runs
- When a feature flag is `ON` → new behavior activates
- **No flag = no merge.** Every PR that touches product behavior must reference a flag from this doc
- This document is the acceptance criteria. QA tests against this. Dev builds against this. If it's not here, it doesn't get built

---

## Table of Contents

1. [Product Vision & Positioning](#1-product-vision--positioning)
2. [Feature Flags Master Registry](#2-feature-flags-master-registry)
3. [Architecture Principles](#3-architecture-principles)
4. [Authentication & Onboarding](#4-authentication--onboarding)
5. [Family Tree & Graph Core](#5-family-tree--graph-core)
6. [Member Management & Claims](#6-member-management--claims)
7. [Biodata & Matrimony](#7-biodata--matrimony)
8. [Matrimony Matching & Discovery](#8-matrimony-matching--discovery)
9. [Trust & Verification System](#9-trust--verification-system)
10. [Kundli & Astrological Compatibility](#10-kundli--astrological-compatibility)
11. [Community Pools & B2B (Sabha OS)](#11-community-pools--b2b-sabha-os)
12. [Viral Loops & Invitations](#12-viral-loops--invitations)
13. [Notifications (WhatsApp-first)](#13-notifications-whatsapp-first)
14. [Payments & Monetization](#14-payments--monetization)
15. [AI Features](#15-ai-features)
16. [Family Timeline & Memories](#16-family-timeline--memories)
17. [Kulgatha PDF & Family Poster](#17-kulgatha-pdf--family-poster)
18. [Admin & Moderation](#18-admin--moderation)
19. [Privacy & Data Security](#19-privacy--data-security)
20. [Performance & Regression Standards](#20-performance--regression-standards)
21. [Edge Cases Master List](#21-edge-cases-master-list)
22. [Test Coverage Requirements](#22-test-coverage-requirements)
23. [Rollout Sequence](#23-rollout-sequence)

---

## 1. Product Vision & Positioning

### 1.1 One-Sentence Pitch
> "The only matrimony platform where every match comes with a verified family tree — not just a profile."

### 1.2 What This Product Is
A **trusted family relationship network** where:
- The **family graph** is the product (moat, lock-in, data asset)
- **Matrimony matching** is the monetization engine (highest WTP event in a family's life)
- **Cultural depth** (gotra, Indian kinship, kundli) is the unfair advantage no Western competitor can copy

### 1.3 What This Product Is NOT
- Not a genealogy app (Ancestry competitor)
- Not a social network (Facebook competitor)
- Not a matrimony profile site (Shaadi.com competitor)
- Not a memory/photo storage app (Google Photos competitor)

### 1.4 Target Users

| Segment | Description | WTP | Priority |
|---|---|---|---|
| NRI families (US/UK/CA/AU) | South Asian diaspora, paying in USD/GBP, high matrimony urgency, embarrassed by Shaadi.com's 2005 UI | $50–200/month | P0 — MVP beachhead |
| Urban Indian families (metros) | Delhi, Mumbai, Bengaluru. English-comfortable, smartphone-native | ₹500–2,000/month | P1 |
| Gotra Sabhas / Caste Associations | Organizations managing 500–5,000 families for matrimony events | ₹50,000–5,00,000/year | P1 — B2B |
| Semi-urban Indian families | Tier 2/3 cities, Hindi-language preference, value-conscious | ₹200–500/month | P2 |

### 1.5 Core Hypothesis
> A match with verified family context (gotra, family tree, elder verification) is 10x more trustworthy than a self-reported profile. Families will pay a premium for that trust.

### 1.6 Success Metrics

| Metric | MVP Target (Month 3) | Growth Target (Month 12) |
|---|---|---|
| Families on platform | 500 | 5,000 |
| Paying families (premium) | 50 | 800 |
| Avg family tree size | 15 members | 30 members |
| Biodata profiles active | 100 | 2,000 |
| Day 7 retention | >40% | >50% |
| WhatsApp biodata shares/week | 50 | 1,000 |
| MRR | ₹50,000 | ₹8,00,000 |

---

## 2. Feature Flags Master Registry

> **Rule:** All flags are defined as TypeScript constants in `lib/feature-flags.ts`. Use `isFeatureEnabled('flagName')` — never hardcode conditionals. Changing a flag requires a code change + redeploy; plan accordingly.

### 2.0 Existing Flags (In Codebase Today)

These flags exist in `lib/feature-flags.ts` right now. Current values shown.

| Flag Name | Current Value | Description |
|---|---|---|
| `enablePhoneOtpAuth` | `true` | Phone OTP sign-in (already live) |
| `enableEmailPasswordAuth` | `true` | Email/password sign-in |
| `enableBiodata` | **`false`** | Biodata profiles — **flip to `true` to ship** |
| `enableAICopilot` | `true` | Gemini-powered AI Copilot |
| `enableHierarchicalTreeView` | `true` | Hierarchical tree view (screenshot layout) |
| `enableGraphView` | `false` | Original force-directed graph (superseded by Universe) |
| `enableOrgChartView` | `false` | Generation-strip org chart (has gen=0 bug) |
| `enableClaimReviewQueue` | `true` | Admin review queue for low-confidence claims |
| `enableModeratorUI` | `true` | Moderator role + /moderation page |
| `enableConflictPanel` | `true` | Graph conflict detection panel in settings |
| `enableBranchAdmin` | `true` | Branch admin scoped permissions |
| `enableRealtimeNotifications` | `true` | Real-time notifications via Supabase Realtime |
| `enableLiveActivityWidget` | `true` | Live activity widget on graph canvas |
| `enablePresenceAvatars` | `true` | Online presence avatars on dashboard |
| `enableAdvancedAnalytics` | `true` | Advanced missing-data analytics panels |
| `enableMilestoneEditor` | `true` | Milestone CRUD on member-detail |
| `enableFamilyPoster` | `true` | Family poster generator |
| `enableFullGraphPdfExport` | `true` | Full multi-page PDF export |
| `enableKulgathaPDF` | `false` | Kulgatha PDF export (not yet production-grade) |
| `enableUpgradeFlow` | `false` | Stripe upgrade flow (not yet integrated) |
| `enableGooglePlaces` | `false` | Google Places autocomplete for locations |
| `enableMigrationMap` | `false` | Family migration map |
| `enableEvents` | `false` | Events calendar page |
| `enableInviteRelationshipStep` | `false` | "How are you related?" step in invite join flow |
| `enableStructuralMappingWizard` | `false` | Relationship mapping wizard (depends on above) |

### 2.1 MVP Flags to Add (Need Implementation)

These flags do not yet exist in `lib/feature-flags.ts` and must be added before the feature is built.

| Flag Name | Default | Description | Blocks |
|---|---|---|---|
| `enableStripePayments` | `false` | Payment processing via Stripe | Revenue |
| `enableMatrimonyPremium` | `false` | Premium paywall at day 7 | Revenue |
| `enableCommunityPools` | `false` | Community matrimony pools | Matching |
| `enableCrossFamilyMatching` | `false` | Show matches outside own family | Matching |
| `enableWhatsAppNotifications` | `false` | WhatsApp Business API notifications | Notifs |
| `enableTrustScore` | `false` | Trust score computation + display on profiles | Trust |
| `enableKundliIntegration` | `false` | Kundli PDF via AstroSage API | Kundli |
| `enableMatrimonyFirstOnboarding` | `false` | Matrimony-first 3-screen onboarding | Onboarding |

### 2.2 V2 Flags (Days 31–90)

| Flag Name | Default | Description |
|---|---|---|
| `enableAssistedMatchmaking` | `false` | Human matchmaker concierge tier |
| `enableSabhaB2B` | `false` | B2B white-label community OS |
| `enableAiOnboarding` | `false` | Conversational AI tree builder |
| `enableAiCompatibilityNarrative` | `false` | AI-generated match compatibility text |
| `enableRelationshipPathNarrative` | `false` | "How you're connected" human-readable text |
| `enableHindiLanguage` | `false` | Hindi UI and AI responses |
| `enableRegionalLanguages` | `false` | Tamil, Telugu, Bengali, Marathi UI |
| `enableBiodataQualityCoach` | `false` | AI nudges to improve biodata completeness |

### 2.3 V3 Flags (Month 4+)

| Flag Name | Default | Description |
|---|---|---|
| `enableMemoryVault` | `false` | Voice notes, stories, photo memories |
| `enableTimeline` | `false` | Family milestone timeline (migration 017 exists) |
| `enableEstatePlanning` | `false` | Property/inheritance tracking layer |
| `enableDiasporaExpansion` | `false` | Pakistan, Bangladesh, Sri Lanka markets |
| `enableFamilyHealthRecords` | `false` | Health history on graph nodes |
| `enableNativeApp` | `false` | Native iOS/Android (vs PWA) |

### 2.4 Flag Implementation Rules

```typescript
// CORRECT — always use the flag utility
import { isFeatureEnabled } from '@/lib/feature-flags'

if (isFeatureEnabled('enableBiodata')) {
  // new behavior
} else {
  // current behavior or null
}

// WRONG — never hardcode
if (process.env.NEXT_PUBLIC_ENABLE_BIODATA === 'true') { ... }
```

- Flags are TypeScript constants in `lib/feature-flags.ts` — changing a flag **requires a code change and redeploy**
- `isFeatureEnabled()` works server-side and client-side (pure TS, no env var required)
- Every flag must have a corresponding entry in this document
- When a flag is permanently enabled and stable for 60+ days, schedule removal of the old code path
- New flags must be added to `lib/feature-flags.ts` AND this registry before any implementation begins

---

## 3. Architecture Principles

### 3.1 Stack (Do Not Change Without Founder Approval)

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Existing codebase |
| Backend | Supabase (Postgres + RLS + Realtime + Auth) | Existing, cost-effective |
| Graph engine | Custom (lib/relationship-engine.ts) | Core moat — do not replace |
| Payments | Stripe | Industry standard, global |
| Transcription | OpenAI Whisper API | Multi-language, accurate |
| AI/LLM | Gemini (existing) + Claude Sonnet for sensitive prompts | Existing + quality |
| Kundli API | AstroSage REST API | V2 |
| WhatsApp | WhatsApp Business API (Meta) | V2 |
| Vector store | Supabase pgvector | V2 (AI matching) |
| CDN/Storage | Supabase Storage | Existing |

### 3.2 Database Principles

- Every table has `created_at`, `updated_at`, `deleted_at` (soft delete only — never hard delete family data)
- RLS policies are the security layer — never bypass with service role on client
- Migrations are sequential and named: `NNN_description.sql` (e.g. `043_family_member_data_quality.sql`) — numeric prefix, not date-based
- No migration may break an existing API contract without a feature flag guarding the change
- All PII fields are encrypted at rest (use Supabase Vault for gotra, income, health data)

### 3.3 API Design Rules

- All API routes return `{ data, error, meta }` shape
- Errors always include a `code` string (e.g. `FAMILY_NOT_FOUND`, `UNAUTHORIZED_CLAIM`)
- Paginated endpoints always return `{ data[], total, page, pageSize, hasMore }`
- Rate limiting: 100 req/min per authenticated user, 10 req/min unauthenticated
- All write operations are idempotent where possible (use `upsert` not `insert` for claims)

### 3.4 Performance Budgets

| Metric | Target | Hard Limit |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.0s | 3.0s |
| Graph render (50 nodes) | < 500ms | 1000ms |
| Biodata PDF generation | < 5s | 10s |
| API response (read) | < 200ms | 500ms |
| API response (write) | < 500ms | 1000ms |
| Kundli calculation | < 3s | 8s |

---

## 4. Authentication & Onboarding

### 4.1 Current State (FF: all auth flags default)

- Email/password sign-in with forgot/reset password flow
- Role-based access (Admin, Moderator, Branch Admin, Contributor, Viewer)
- Session management via Supabase auth provider

### 4.2 [MVP] Phone OTP Auth
**FF: `enablePhoneOtpAuth`**

**Why:** Every Indian user expects phone-based login. Email auth costs 30%+ conversion on mobile.

#### Flow
```
Landing page
  → "Continue with Phone" button (primary CTA)
  → Enter phone number (+91 or international)
  → OTP sent via SMS (primary) / WhatsApp (secondary, if WA API enabled)
  → 6-digit OTP entry, 5-minute expiry, 3 attempts max
  → On success: check if phone maps to existing node in any family graph
    → YES: show "Welcome back, [Name]. Your family invited you." → auto-claim flow
    → NO: show new user onboarding
  → Email/password remains as secondary option ("Sign in with email instead")
```

#### Edge Cases
- User changes phone number: requires admin approval + old number deactivation (7-day grace period)
- OTP not received: "Resend in 30s" button, max 5 resends/hour per number
- International numbers: validate with libphonenumber, show country flag
- Existing email account + same phone: merge accounts, prompt user to confirm
- Blocked numbers (spam detected): show "Contact support" message, do not reveal block reason

#### Acceptance Criteria
- [ ] Phone OTP login works for Indian (+91) and international numbers
- [ ] Failed OTP shows attempt count remaining ("2 attempts left")
- [ ] Successful phone login that matches a pending node auto-triggers claim flow
- [ ] Fallback to email login is always visible but de-emphasized
- [ ] OTP rate limiting blocks after 5 resends/hour silently (no error that reveals limit)

### 4.3 [MVP] Matrimony-First Onboarding
**FF: `enableMatrimonyFirstOnboarding`**

**Why:** Current onboarding leads with "build your family tree." Matrimony intent brings users in — tree is the mechanism, not the pitch.

#### New Onboarding Flow (3 screens max)

**Screen 1 — Intent**
```
"Who are you looking for?"
○ A match for my son / daughter
○ A match for myself
○ Building my family record (no matrimony)

[Continue]
```

**Screen 2 — Community (shown only for matrimony intent)**
```
"Your community"
Community / Gotra: [text field with autocomplete from existing gotra DB]
Location: [city autocomplete]

[Continue]
```

**Screen 3 — Quick profile**
```
"Tell us about [son/daughter/yourself]"
Name: [field]
Age: [field]
Photo: [upload — optional, skip available]

[Create profile →]
```

After screen 3:
- Create user + family node
- Show dashboard with empty family graph
- Show prompt: "Invite your parents to verify your profile and unlock more matches"

#### Edge Cases
- User selects "no matrimony" → onboarding skips community/gotra screen → goes to standard family tree builder
- User skips photo → show placeholder avatar, show "Add photo" nudge on dashboard
- Gotra not in autocomplete list → allow free text entry, flag for review
- User goes back mid-onboarding → preserve all entered data
- User closes app mid-onboarding → resume on next open from last completed screen

#### Acceptance Criteria
- [ ] Onboarding completes in under 2 minutes on 4G mobile
- [ ] "No matrimony" path skips community fields
- [ ] Gotra autocomplete shows results within 300ms
- [ ] Partially completed onboarding resumes correctly
- [ ] Photo upload optional with clear skip affordance

---

## 5. Family Tree & Graph Core

### 5.1 Current State (Stable — No Flag Needed)
The following are production-ready and must not regress:
- Force-directed graph with drag-and-drop
- Hierarchical vertical tree view
- Relationship "universe" radial view
- Multi-perspective relationship engine (kinship from any node's POV)
- Indian kinship terms (Chacha, Mama, Bua, Mausi, Jija, Bhabhi — paternal/maternal distinction)
- Virtual node synthesis for isolated relatives
- Real-time graph updates via Supabase Realtime

### 5.2 [MVP] Graph Data Model

**Table: `family_members`** (nodes — in Supabase)

```typescript
// Key columns — see supabase/migrations/ for full schema
{
  id: uuid,
  family_id: uuid,
  name: text,                         // Display name
  birth_year: integer | null,
  date_of_birth: date | null,         // Optional full date (for kundli)
  birth_month: smallint | null,       // 1–12 (for birthday notifications)
  birth_day: smallint | null,         // 1–31
  death_year: integer | null,
  gender: 'male' | 'female' | 'other' | null,
  gotra: text | null,
  caste: text | null,
  is_alive: boolean,                  // default true
  is_deceased: boolean,               // default false
  show_as_anonymous: boolean,         // "? Member" to non-admins
  visibility: 'public' | 'family' | 'private',   // default 'family'
  is_biodata_visible: boolean,        // visible in matrimony search

  // Relationships — stored as arrays, NOT a separate edge table
  parent_ids: uuid[],                 // max 2 biological parents (enforced by trigger)
  spouse_ids: uuid[],                 // bidirectional (enforced by normalization)
  generation: integer,               // auto-computed from parents (migration 043)

  // Claim state
  claimed_by_user_id: uuid | null,    // auth user who claimed this node
  is_claimed: boolean,                // quick flag
  claim_status: 'unclaimed' | 'invite_sent' | 'claim_pending' | 'claimed' | 'rejected' | 'revoked',
  identity_state: 'unclaimed' | 'invited' | 'claim_pending' | 'soft_match' | 'verified' | 'claimed' | 'revoked' | 'disputed' | 'merged',
  claimed_at: timestamptz | null,
  guardian_user_id: uuid | null,      // for proxy/guardian claims

  // Contact (PII — never returned to non-admins via API)
  phone: text | null,
  normalized_phone: text | null,      // E.164, indexed, unique
  email: text | null,

  // Soft delete — NEVER hard delete
  deleted_at: timestamptz | null,     // NULL = active
  deleted_by: uuid | null,

  added_at: timestamptz,
  updated_at: timestamptz
}
```

**How relationships are stored:**

> **There is NO separate edges/relationships table.** All graph edges are stored as `uuid[]` arrays directly on `family_members`:
>
> - `parent_ids[]` — up to 2 biological parents (trigger enforces max 2)
> - `spouse_ids[]` — bidirectional (normalization engine enforces A↔B symmetry)
> - `sibling` relationships are **inferred** at read time (shared parents), never stored
> - All complex Indian kinship terms (Chacha, Mama, Bua, etc.) are **computed** by `lib/relationship-engine.ts` at read time, never stored

**Rule:** Only the three primitives matter for the graph: parent-of, spouse-of, and inferred sibling. Everything else is derived.

### 5.3 [V2] Trust Score Computation
**FF: `enableTrustScore`** — **Column does not yet exist in DB. Add migration when implementing.**

When `enableTrustScore` is ON, add a `trust_score integer DEFAULT 0` column to `family_members` and compute it asynchronously on every node update.

```
Trust Score (0–100) = sum of:
  + 10  Node has been claimed by a real user
  + 15  Claimant verified phone number
  + 15  Has a photo
  + 10  Birth date filled
  + 10  Gotra filled
  + 15  Has at least 1 parent node claimed by a real user
  + 10  Has at least 3 family members in the graph
  + 15  Biodata profile active and complete (>80% fields filled)
  ───
  = 100 max
```

- Trust score is recomputed on every node update (async, not blocking)
- Displayed as a percentage badge on profile and match cards
- Used as a sort signal in match discovery (higher trust = higher in feed)

### 5.4 Graph Integrity Rules (Always On)

These run on every graph mutation and must never be bypassed. Violations are stored in the `pending_conflicts` table (`conflict_type`, `severity`, `status` fields).

| Rule | `conflict_type` in DB | Severity | Behavior |
|---|---|---|---|
| Node cannot be its own parent | `self_parent` | error | Reject write |
| Node cannot be its own spouse | `self_spouse` | error | Reject write |
| No cycles in parent-child edges | `cycle_detected` | error | Reject write |
| Person cannot have >2 parents | `too_many_parents` | error | Reject write |
| Birth year must be < death year | `birth_year_impossible` | error | Reject write |
| Parent must be born ≥ 12 years before child | `birth_year_gap` | warning | Warn, allow |
| Spouses must be same generation (±2 levels) | `spouse_generation_mismatch` | warning | Warn, allow |
| One-way spouse link (A→B but not B→A) | `unidirectional_spouse` | error | Auto-fixed by normalization engine |
| Spouse is also listed as parent | `child_as_spouse` | error | Normalization removes spouse link |
| Parents from conflicting family clusters | `conflicting_parentage` | error | Flagged for admin |
| Duplicate detection on name + birth year | `duplicate_identity` | warning | Surface merge UI |

---

## 6. Member Management & Claims

### 6.1 Current State (Stable)
- Node claim system with identity scoring
- General 50-use family links + single-use targeted node-claim invites
- Claim review queue for low-confidence matches
- Revoke/transfer/unclaim claims
- Duplicate detection and merge with edge consolidation

### 6.2 [MVP] Claim Confidence Scoring

Scoring is computed in `lib/match-detection.ts`. Exact weights (do not change without updating this spec):

```
Contact signals (strongest — bypass invite requirement if matched):
  + 60  Phone number exact match (digit-normalized, E.164)
  + 55  Email exact match (case-insensitive)

Name signals:
  + 15  Exact name match (normalized)
  + 10  Fuzzy name match (Levenshtein ≤ 2, name length ≥ 4)
  +  8  Phonetic match via Soundex (first names only)
  +  6  First name match only (≥ 3 chars)

Birth year signals:
  + 20  Exact birth year match
  + 12  Birth year within ± 2 years

Structural context bonus (when graph position is known):
  + 35  Candidate is already a parent of a sibling node ("structural_parent")
  + 30  Candidate is already a spouse of the adder ("structural_spouse")
  ───
  Maximum score: 100 (capped)
  Minimum to surface result: 40 (MIN_SCORE)
```

**Tier assignment:**

| Score | Tier | Action |
|---|---|---|
| ≥ 80 | `high` | Auto-approve claim |
| 60–79 | `medium` | Queue for family admin review |
| 40–59 | `low` | Queue for family admin review |
| < 40 | — | Reject: return `IDENTITY_MISMATCH`, record attempt |

**Rate limiting & lockout (enforced in `POST /api/nodes/[id]/claim`):**
- 5 failed attempts within 1 hour → `429 RATE_LIMITED` (retryAfter: 3600s)
- 3 consecutive identity failures → `423 LOCKED_OUT` for 24 hours

### 6.3 [MVP] Claim Edge Cases

| Scenario | Behavior |
|---|---|
| Two users claim same node | Second claim queued (`CLAIM_PENDING_ANOTHER_USER` 409); first claimant notified. DB enforces one pending claim per node via unique partial index. |
| Node already claimed by another user | Return `409 ALREADY_CLAIMED` immediately (optimistic lock: `is_claimed=false` condition on UPDATE) |
| Claimant dies / account deleted | Node reverts to unclaimed, family admin notified |
| Disputed claim (family disagrees) | Admin can override; disputed claim logged in `claim_audit_log` |
| Minor claimed by parent | Parent can claim on behalf (`guardian_claim`), flagged as proxy claim via `guardian_user_id` |
| Guardian tries to claim adult node | Blocked: `422 GUARDIAN_CLAIM_INVALID` |
| Node has wrong birth year | Claimant can suggest correction; admin approves |
| Cross-family claim (node exists in another family's tree) | `409 CROSS_FAMILY_CLAIM` — triggers family-link flow; both family admins notified |
| User has active claim in another family | `409 SUGGEST_FAMILY_LINK` — user must merge families or abandon old claim |
| Revoked node re-claim | Blocked unless admin re-sends a targeted `node_claim` invite OR claimer's phone matches |
| Deceased node | `409 NODE_DECEASED` — cannot be claimed |
| Archived / soft-deleted node | `410 NODE_ARCHIVED` — cannot be claimed |
| Phone-verified user, no invite | Phone match (normalized) bypasses invite requirement entirely — high-confidence auto-approve |
| No DOB hint on invite (EC-03) | Full name match required (no partial match accepted) as minimum bar |
| 5 failed attempts within 1 hour | `429 RATE_LIMITED` — retryAfter: 3600s |
| 3 consecutive identity failures | `423 LOCKED_OUT` — account locked for 24 hours |
| Invite not for this node | `422 INVITE_NODE_MISMATCH` |
| Invite already consumed | `410 INVITE_ALREADY_USED` |
| Invite expired | `410 INVITE_EXPIRED` |
| Stale user_node_links (claim orphan) | Auto-healed: stale link cleared before claim proceeds |

### 6.4 Merge Rules

Merge is handled by `POST /api/members/[id]/merge` (admin-only) using helpers in `lib/graph-merge.ts`.

When two nodes are merged:
1. **Who wins:** Node with higher trust score (or the one explicitly designated as primary by admin) is kept
2. **Scalar fields:** Primary's data wins; all conflicts logged in `claim_audit_log` metadata for admin review
3. **Edges merged:** `lib/graph-merge.ts` `unionMemberIds()` deduplicates `parent_ids[]` and `spouse_ids[]` from both nodes
4. **All graph references remapped:** Every member in the family that referenced the duplicate has its `parent_ids`/`spouse_ids` remapped to the primary via `remapMemberIds()`
5. **Claim transferred:** If duplicate was claimed but primary was not, claim is transferred to primary (`profiles.member_id` + `user_node_links` updated)
6. **Blocks if both claimed by different users:** Returns `409 BOTH_CLAIMED` — cannot auto-merge identity-destructive changes
7. **Duplicate soft-deleted:** `deleted_at` set — never hard deleted
8. **Dependent records transferred:** `stories`, `memories`, `voice_notes`, `milestones`, `claim_requests`, `user_node_links` all remapped to primary
9. **Stale invites:** All `invite_links` pointing to duplicate are marked `consumed_at` to prevent reuse
10. **Generation cascade:** Descendants recomputed via BFS (capped at 500 nodes)
11. **Merged-away node ID must never 404:** Remapped references ensure all edges point to primary; old ID soft-deleted
12. **Optimistic lock on merge:** `updated_at` checked; concurrent merges return `409 MERGE_CONFLICT`

---

## 7. Biodata & Matrimony

### 7.1 Current State
Biodata feature exists but is gated behind `enableBiodata: false`. This flag **must be set to `true` immediately.**

### 7.2 [MVP] Biodata Profile

A biodata profile is created on top of a graph node for matrimony-eligible members.

#### 7.2.1 Required Fields (must be filled to activate biodata)
- Full name
- Date of birth
- Gender
- Photo (at least 1)
- Gotra
- Community / caste
- City of residence
- Highest education
- Occupation
- Family contact (parent/guardian phone number)

#### 7.2.2 Optional Fields (improve trust score and match quality)
- Additional photos (up to 8)
- Height
- Complexion (dropdown — include option to leave blank)
- Diet (vegetarian / non-vegetarian / eggetarian / jain)
- Mother tongue
- Languages spoken
- Annual income range
- Father's name and occupation
- Mother's name and occupation
- Number of siblings
- Property ownership (family-level)
- NRI status and country
- Manglik status
- Rashi (zodiac sign)
- Nakshatra (birth star)
- About me (free text, max 500 chars)
- Partner expectations (free text, max 500 chars)

#### 7.2.3 Biodata Visibility Rules

| Biodata Status | Visible To | Notes |
|---|---|---|
| Draft | Own family only | Incomplete profiles |
| Active (Free tier) | Own family + community admins | Cannot appear in cross-family discovery |
| Active (Premium) | All verified families in matching pool | Full cross-family discovery |
| Paused | Nobody except self | User can pause during sensitive periods |
| Archived | Admin only | After match completed |

#### 7.2.4 Biodata PDF Generation

When user taps "Share Biodata":
1. Generate PDF from template (current implementation)
2. Include: photo, personal details, family background, gotra, education, contact
3. Add watermark: "Shared via FamilyGraph — Verified Family Network"
4. PDF expires in 7 days (new link generated each time)
5. Track: who generated, when, how many views (for analytics and trust)
6. WhatsApp share button generates deep link + PDF simultaneously

#### 7.2.5 Biodata Edge Cases

| Scenario | Behavior |
|---|---|
| User under 18 | Biodata creation blocked, show "Must be 18+" |
| Photo of minor uploaded | Flag for review, do not display, notify admin |
| Biodata field contains phone/email (spam) | AI content moderation flags, queued for review |
| Duplicate biodata (same person, two accounts) | Merge flow triggered, user notified |
| Family admin deactivates member's biodata | Member notified, biodata paused immediately |
| User deletes account | Biodata anonymized (not deleted), family graph node preserved as placeholder |
| Premium lapses | Biodata remains but removed from cross-family discovery, user notified |

---

## 8. Matrimony Matching & Discovery

### 8.1 [MVP] Community Pools
**FF: `enableCommunityPools`**

A community pool is a named group of families that have opted in to share biodata with each other.

#### Pool Creation
- Admin or Sabha admin creates a pool with: name, community, gotra restrictions, geographic scope
- Pool can be `open` (any premium family can join) or `invite-only` (admin approves)
- Examples: "Khatri - Delhi NCR", "Agarwal - Mumbai", "Iyer - Global NRI"

#### Pool Membership
- Family admin opts family into a pool
- Opt-in shows a consent dialog: "Your active biodata profiles will be visible to all verified families in this pool"
- Family can be in multiple pools simultaneously
- Opting out removes from discovery immediately (within 1 minute)

#### Pool Edge Cases
| Scenario | Behavior |
|---|---|
| Pool has fewer than 10 families | Show "Pool growing — invite others" state, no matches shown |
| Family gotra conflicts with pool gotra restriction | Rejection shown with explanation |
| Pool admin disbands pool | All member families notified 7 days in advance |
| Family blocked by another family in same pool | Blocked family's profiles not visible to blocker |

### 8.2 [MVP] Cross-Family Match Discovery
**FF: `enableCrossFamilyMatching`**

#### Match Feed Algorithm (Priority Order)
1. Gotra compatibility confirmed (not same gotra for families where this is restricted)
2. Community pool overlap (in same pool)
3. Geographic proximity (city / country match)
4. Age range compatibility (partner preference ± 5 years)
5. Trust score (higher trust = higher in feed)
6. Education level compatibility
7. Profile completeness

#### Match Card — Information Shown
- Name, age, city
- Photo (blurred for free tier if candidate is premium-only)
- "How you're connected" — graph path if within 4 degrees
- Trust score badge
- Community / gotra
- Education + occupation summary
- Number of family members verified on platform
- Kundli compatibility score (if `enableKundliIntegration` is ON)

#### Expressing Interest
1. User taps "Send Interest"
2. System sends notification to: candidate + candidate's designated family contact
3. If candidate's family reciprocates → "Mutual Interest" state
4. Mutual interest unlocks: full biodata, family tree view, WhatsApp contact sharing
5. No interest from either side in 30 days → interest auto-expires, both parties notified

#### Match Edge Cases
| Scenario | Behavior |
|---|---|
| Same gotra match suggested | Block match, show "Gotra conflict — not a compatible match" |
| User sends interest to relative (graph path ≤ 2 degrees) | Block, show "This person is in your close family" |
| User blocks another user | Neither can see the other in any context |
| Candidate profile is paused | Remove from feed immediately, pending interests notified |
| Both parties interested but one's premium lapses | Match preserved for 30 days, then archived if not renewed |
| Family admin rejects interest on behalf of family | Candidate's family notified politely, no reason required |

### 8.3 [MVP] Family Trust Layer in Matching

This is the core differentiator. Every match card shows:

```
[Trust Badge: 78%]
✓ Phone verified
✓ 4 family members on platform
✓ Father profile verified
✓ Gotra confirmed: Kashyap
```

Families with trust score < 40% are:
- Shown at bottom of match feed
- Cannot initiate interests (only receive them)
- Shown "Complete your profile to send interests" prompt

---

## 9. Trust & Verification System

### 9.1 [MVP] Verification Tiers

| Tier | Requirements | Badge |
|---|---|---|
| Basic | Phone OTP verified | ● Grey |
| Family | ≥1 parent/sibling also on platform | ● Blue |
| Verified | Family tier + at least 1 elder manually verified by platform | ● Green |
| Community | Verified by a Sabha admin or community leader | ● Gold |

### 9.2 [MVP] Family Verification Flow

When a parent joins and claims their node:
1. Parent's node trust score increases
2. Child's trust score increases (parent node now verified)
3. Both receive in-app notification: "Your family trust score increased to X%"
4. WhatsApp message (if WA enabled): "Your profile is now more visible to potential matches"

### 9.3 [V2] Identity Verification
**FF: `enableIdentityVerification`**

- Aadhaar-based verification for Indian users (via DigiLocker API)
- Passport-based for NRI users
- Verification adds +25 to trust score (not included in MVP trust score formula above)
- Verified badge permanently displayed even if other trust factors change

### 9.4 Verification Edge Cases

| Scenario | Behavior |
|---|---|
| Parent joins but disputes child's details | Flagged for family admin resolution |
| Verified user found to have fake profile | Verification revoked, all matches notified |
| Community leader endorses user | +15 trust score, "Endorsed by [Name], [Role]" on profile |
| User tries to verify as multiple different people | Account flagged, manual review required |

---

## 10. Kundli & Astrological Compatibility

### 10.1 [V2] Kundli Integration
**FF: `enableKundliIntegration`**

**Why:** 60–70% of Hindu matrimony decisions require kundli compatibility. Without this, the product is invisible to the most active segment.

**Implementation:** AstroSage REST API (or equivalent). Partner API — do not build from scratch.

#### Required Input Fields (already in biodata)
- Date of birth (full date, not just year)
- Time of birth (optional but improves accuracy)
- Place of birth (city)

#### Kundli Output Shown
- Guna Milan score (out of 36)
- Compatibility grade: Excellent (28–36) / Good (18–27) / Average (10–17) / Not Compatible (<10)
- Manglik status check (both parties)
- Rashi compatibility
- Nadi dosha check (critical in Indian matrimony — same Nadi = traditionally incompatible)
- One-paragraph compatibility summary (AI-generated from raw kundli data)

#### Kundli Edge Cases
| Scenario | Behavior |
|---|---|
| Time of birth unknown | Calculate without it, show "Approximate — time of birth not provided" disclaimer |
| Place of birth not in API database | Fall back to nearest major city, flag this to user |
| Nadi dosha found | Show warning prominently: "Traditional guidance recommends consulting a pandit" |
| API unavailable | Show "Kundli temporarily unavailable, please try again later" — never fail silently |
| Both manglik | Show "Both manglik — traditionally considered compatible" (common misconception handled) |

#### Monetization
- Kundli compatibility score (number only) → visible to all premium users
- Full kundli report PDF → premium feature, ₹99 one-time or included in higher tier
- Auto-generated kundli for every biodata + every match pair

---

## 11. Community Pools & B2B (Sabha OS)

### 11.1 [V2] B2B Sabha OS
**FF: `enableSabhaB2B`**

**What it is:** A white-label version of FamilyGraph sold to Gotra Sabhas, caste associations, and NRI community organizations. They bring their member database. Matrimony matching happens within their trusted pool.

**Why it matters:** One Sabha = 500–5,000 families instantly. Solves the cold-start problem without any consumer marketing spend.

#### B2B Product Features
- Custom subdomain: `[sabhaname].familygraph.app`
- Custom branding: logo, colors, community name
- Sabha admin dashboard: manage members, approve joiners, view aggregate stats
- Bulk member import: CSV upload with name, phone, gotra, city
- AI-assisted import: "Paste your WhatsApp group message and we'll extract members"
- Private matrimony pool (Sabha members only)
- Annual membership fee collection via platform (Sabha sets price, platform takes 10%)
- Analytics: member growth, match interest rates, marriages completed

#### Sabha Admin Roles
- `Sabha Admin`: full access, billing, member management
- `Sabha Moderator`: can approve members, cannot change billing
- `Sabha Member`: standard family access within Sabha pool

#### B2B Pricing
| Tier | Price | Includes |
|---|---|---|
| Sabha Starter | ₹50,000/year | Up to 200 families, basic matching |
| Sabha Growth | ₹1,50,000/year | Up to 1,000 families, full matching, analytics |
| Sabha Enterprise | ₹5,00,000/year | Unlimited families, white-label, dedicated support |

#### B2B Edge Cases
| Scenario | Behavior |
|---|---|
| Sabha doesn't renew | 30-day grace period, members notified, data preserved for 1 year |
| Sabha member also on consumer platform | Profiles linked, data not duplicated, user controls which pool is active |
| Sabha admin abuses member data | Audit log captures all admin actions, report mechanism available |
| Two Sabhas want to share a pool | Cross-Sabha pool possible with both admin approvals |

---

## 12. Viral Loops & Invitations

### 12.1 Current State (Stable — enhance, don't replace)
- General 50-use family links
- Single-use targeted node-claim invites
- QR codes
- WhatsApp sharing

### 12.2 [MVP] Trust Score Viral Loop

**Trigger:** After user creates profile
**Message (in-app):** "Your profile trust score is 34%. Invite your parents to reach 80% and appear in premium match results."

**Mechanism:**
1. User sees trust score prominently on dashboard
2. "Increase trust score" button opens invite flow
3. Pre-filled WhatsApp message: "Hi [Parent name], I've added you to our family profile on FamilyGraph. Please join to verify my profile: [link]"
4. When parent joins → trust score updates in real-time → user notified

### 12.3 [MVP] "Your Network Found Matches" Trigger

**Trigger:** New family joins a community pool that a user is in
**Channel:** WhatsApp (if enabled) or in-app notification
**Message:** "3 new verified families joined your Khatri - Delhi NCR pool this week. Tap to see if there's a match for your family."

This notification is sent maximum once per week per user to prevent fatigue.

### 12.4 [MVP] Marriage Outcome → Tree Merge Viral Loop

When a match results in a marriage:
1. Platform congratulates both families
2. Prompt: "Mark this as a family milestone and merge your family trees"
3. On merge: extended family on both sides (up to 3 degrees) receives invite
4. WhatsApp: "The [Family A] and [Family B] families have joined. You've been added to the combined family network."
5. Each marriage generates an estimated 40–80 invite events

### 12.5 Invite Edge Cases

| Scenario | Behavior |
|---|---|
| Invite link expires | Show "This link has expired. Ask [Name] to send a new one." |
| Same person invited twice | Second invite shows "You're already connected to this family" |
| Invite accepted by wrong person | "That's not me" option → creates new node, does not claim the intended one |
| Invite from blocked family | Do not show invite, silently discard |
| Mass invite abuse (spam) | Rate limit: 20 invites/day per user, 50/day per family admin |

---

## 13. Notifications (WhatsApp-first)

### 13.1 [V2] WhatsApp Business API
**FF: `enableWhatsAppNotifications`**

**Why:** Indians check WhatsApp 50x/day, email once. All engagement-critical notifications must go to WhatsApp first.

#### Notification Types & Channels

| Event | WhatsApp | In-App | Email |
|---|---|---|---|
| New match interest received | ✓ (immediate) | ✓ | ✗ |
| Mutual interest | ✓ (immediate) | ✓ | ✗ |
| Family member joined | ✓ | ✓ | ✗ |
| Trust score increased | ✗ | ✓ | ✗ |
| New families in pool | ✓ (weekly max) | ✓ | ✗ |
| Biodata viewed | ✗ | ✓ | ✗ |
| Premium expiring in 7 days | ✓ | ✓ | ✓ |
| Premium expired | ✓ | ✓ | ✓ |
| Birthday of family member | ✓ | ✓ | ✗ |
| OTP | ✓ or SMS | ✗ | ✗ |
| Account security alert | ✓ | ✓ | ✓ |

#### WhatsApp Message Rules
- All WhatsApp messages use pre-approved templates (Meta requirement)
- User must opt-in to WhatsApp notifications explicitly (GDPR + Meta policy)
- Opt-out via "Reply STOP" must be honoured immediately
- Maximum 2 marketing messages per week per user (Meta policy)
- Transactional messages (OTP, security) have no frequency limit

### 13.2 [MVP] In-App Notifications

In-app notification center shows all notifications regardless of WhatsApp status. Unread count shown on bell icon. Notifications are grouped by type, not chronological, to reduce overwhelm.

---

## 14. Payments & Monetization

### 14.1 [MVP] Stripe Integration
**FF: `enableStripePayments`**  
**Status: MUST BE ENABLED IMMEDIATELY**

#### Payment Methods
- Cards (Visa, Mastercard, Amex)
- UPI (via Stripe's India integration)
- Net banking
- International cards for NRI users

#### Plans & Pricing

**Free Tier (always available)**
- Build family tree up to 50 members
- Basic biodata profile (visible to own family only)
- Kulgatha PDF with watermark
- Cannot appear in cross-family discovery

**Premium — Matrimony Active**
- Monthly: ₹999/month (NRI: $15/month)
- Annual: ₹7,999/year (NRI: $120/year) — saves ~33%, highlighted as "Best Value"
- Biodata visible in community pools
- Cross-family match discovery
- Send up to 20 interests/month
- Kundli compatibility score on all matches
- Full family tree view of mutual interest matches
- WhatsApp biodata sharing with analytics
- Kulgatha PDF without watermark

**Premium Plus (V2)**
- ₹1,999/month (NRI: $30/month)
- Everything in Premium
- Full kundli report PDF per match
- 50 interests/month
- "Priority" placement in match feed
- Biodata quality coaching (AI)

**Assisted Matchmaking — Concierge (V2)**
- ₹15,000–50,000 one-time
- Human matchmaker curates 15–25 families
- Manages introductions
- 3-month engagement

**B2B Sabha OS**
- See Section 11

### 14.2 [MVP] Paywall Trigger — Day 7
**FF: `enableMatrimonyPremium`**

**Logic:**
- Day 0–7: Full free access (let users build tree and feel value)
- Day 7: Premium paywall activates for cross-family features
- User sees: "You've built a family profile. Upgrade to connect with verified families."
- Paywall shown on: match discovery, sending interests, viewing match family tree
- Paywall is NOT shown on: own family tree, own biodata, invite sending, Kulgatha PDF

**Why day 7:** Enough time to build a tree (avg 5–7 sessions), feel invested, understand the value. Not so long that they forget they were going to pay.

### 14.3 Payment Edge Cases

| Scenario | Behavior |
|---|---|
| Payment fails (card declined) | Retry with different method, 3-day grace before downgrade |
| Annual subscription mid-year cancellation | Refund prorated, downgrade at end of current month |
| Premium lapses | Keep biodata active for 30 days (grace), remove from discovery on day 1 |
| Duplicate charge | Auto-refund within 24 hours, email confirmation |
| NRI paying in INR | Allow, but show USD pricing prominently |
| Family wants one subscription for whole family | "Family Premium" concept — V2 feature |
| Chargeback / dispute | Suspend account pending resolution, preserve data |
| Subscription started during trial (if trial exists) | Trial converts, charge on day 8 |

### 14.4 Revenue Reporting

Admin dashboard shows (internal only):
- MRR, ARR
- Plan breakdown (monthly vs annual)
- Churn rate (monthly)
- Failed payment rate
- LTV by acquisition channel
- B2B vs consumer revenue split

---

## 15. AI Features

### 15.1 AI Prioritization Principle

> Build AI only where it removes friction from the core matrimony funnel or creates a measurable improvement in match quality. No AI for novelty.

### 15.2 [V2] Conversational Family Tree Builder
**FF: `enableAiOnboarding`**

**Problem it solves:** Data entry abandonment. Building a family tree via forms takes 2+ hours. Most users quit after 5–10 nodes.

**Solution:** Chat-based onboarding.

```
AI: "Tell me about your family. Start with your parents — what are their names?"
User: "My father is Ramesh Sharma and my mother is Sunita Devi"
AI: "Got it. Where are they from, and do you know your father's parents' names?"
User: "They're from Jaipur. My daada was Govind Sharma, daadi was Savitri"
AI: "I've added Govind Sharma and Savitri to your family tree as your paternal grandparents. 
     Do you have any siblings?"
```

**Implementation:**
- Use Claude Sonnet for conversation (better at structured extraction than Gemini for this use case)
- Extract: name, relationship to root node, birth year (if mentioned), location
- Create graph nodes and edges in real-time as user speaks
- Show live graph updating as conversation progresses
- Allow user to correct: "Actually my daada's name was Govardhan, not Govind"
- Session is resumable — user can stop and continue next day

**Acceptance Criteria:**
- [ ] Conversation correctly maps at least 10 Indian kinship terms (Daada, Daadi, Nana, Nani, Chacha, Mama, Bua, Mausi, Tauji, Bhabhi)
- [ ] Graph updates visible within 2 seconds of AI extracting a name
- [ ] User corrections propagate correctly to graph
- [ ] Conversation is resumable across sessions
- [ ] AI does not create duplicate nodes for same person mentioned twice

### 15.3 [V2] AI Compatibility Narrative
**FF: `enableAiCompatibilityNarrative`**

Instead of a compatibility score, generate a human-readable paragraph:

> "The Sharma and Verma families share similar educational backgrounds, with both families based in Delhi NCR. Gotra compatibility is confirmed (different gotras). The kundli shows strong compatibility at 29/36 points. Both families have similar family sizes — 4-member nuclear families with active grandparents."

This narrative is:
- Generated per match pair (cached for 30 days, regenerated on profile change)
- Max 150 words
- Never mentions negatives explicitly — frames everything constructively
- Shown on match detail page after mutual interest

### 15.4 [V2] Relationship Path Narrative
**FF: `enableRelationshipPathNarrative`**

Your graph engine already computes BFS paths. AI converts to plain language:

> "This family is connected to yours: your maternal uncle Vikram's colleague Suresh Mehta's daughter is the candidate's mother. Your families have attended the same community events in Pune."

This makes every match feel like a warm referral, not a cold profile.

**Edge Case:** If graph path > 5 degrees, show "No direct connection found — new connection" rather than a strained 6-degree path that feels forced.

### 15.5 [V2] Biodata Quality Coach
**FF: `enableBiodataQualityCoach`**

After biodata creation, AI reviews and prompts:
- "Profiles with a family photo get 4x more interest. Add a family photo?"
- "Your father's occupation is missing — adding it increases trust score by 10 points"
- "Your 'about me' is empty. Families that write 3+ sentences get 60% more matches"

Prompts shown as non-blocking nudges, dismissable, max 1 per session.

### 15.6 AI Safety Rules

- AI must never generate content that reinforces caste discrimination
- AI must never suggest a match is "better" or "worse" based on caste — only on stated compatibility factors
- AI responses containing personal information must never be logged in plain text
- AI-generated kundli narratives must include: "Consult a pandit for important decisions"
- AI must not autonomously create or modify graph nodes — only suggest, human confirms

---

## 16. Family Timeline & Memories

**FF: `enableTimeline`, `enableMemoryVault`**  
**Status: DEFERRED to V3**

These features exist in code but must remain behind feature flags until:
1. Platform has 10,000+ active families
2. Core matrimony flow is stable and generating revenue
3. Dedicated content moderation is in place

When enabled:
- Timeline shows family milestones (birth, marriage, graduation, death)
- Memory vault stores photos, voice notes (transcribed via Whisper), written stories
- Voice notes are automatically transcribed and tagged with mentioned names
- Privacy: memories default to `family` visibility, owner can set `private` or `public`

---

## 17. Kulgatha PDF & Family Poster

### 17.1 [MVP] Kulgatha PDF
**Status: Already built — make it production-grade**

**Kulgatha PDF must include:**
- Family name header with gotra
- Family tree visualization (top 4 generations)
- All living members with photos
- Family statistics: total members, generations, geographic spread
- FamilyGraph branding (watermark for free, subtle footer for premium)
- Generated date

**Quality bar:** A family must want to print this and display it in their home. If the design does not meet that bar, do not ship it.

**Performance:** PDF generation must complete in < 5 seconds for trees up to 200 nodes.

### 17.2 [MVP] Family Poster

A single-page shareable image (not PDF) optimized for:
- WhatsApp sharing (1080×1080px)
- Instagram sharing (1080×1080px)
- Print (A4, 300dpi)

**Must be genuinely beautiful.** This is the primary zero-cost acquisition channel. A stunning visual that families want to share on Diwali, anniversaries, and weddings is worth more than any paid ad.

**Poster variations:**
- Diwali edition (seasonal)
- Wedding anniversary edition
- New member welcome edition ("Welcome to the family, [Name]!")

**Edge Cases:**
- Tree too large for poster (>50 members): show closest 3 generations only
- Missing photos: use tasteful illustrated avatars (not grey silhouettes)
- Long names: truncate at 15 characters with ellipsis
- Non-Latin scripts (Hindi names): ensure font supports Devanagari

---

## 18. Admin & Moderation

### 18.1 Admin Dashboard (Internal — Not User-Facing)

**Access:** Requires `role = admin` at platform level (not family level)

**Functions:**
- User management (search, suspend, delete)
- Content moderation queue (flagged biodata, photos, messages)
- Graph integrity reports (dangling refs, cycles, orphans)
- Payment management (refunds, plan overrides)
- Feature flag management (toggle flags without deployment)
- Analytics (MRR, DAU, match success rate)
- Sabha management (B2B accounts)

### 18.2 Content Moderation Rules

**Auto-flagged content (queued for human review):**
- Biodata photos containing minors (detected via ML)
- About-me text containing phone numbers or email addresses
- Partner expectations text containing discriminatory language (caste-based hate)
- Any text mentioning dowry demand

**Auto-rejected content (immediate, no review):**
- NSFW images (detected via ML)
- Child sexual abuse material (reported to NCMEC immediately, mandatory)
- Doxxing (another person's private information without consent)

**Moderation SLA:**
- Auto-flagged content: reviewed within 24 hours
- User reports: reviewed within 48 hours
- Appeals: reviewed within 72 hours

---

## 19. Privacy & Data Security

### 19.1 Data Classification

| Data Type | Classification | Storage | Encryption |
|---|---|---|---|
| Name, photo | Personal | Supabase | At rest (standard) |
| Phone number | Sensitive | Supabase Vault | At rest + in transit |
| Gotra, caste | Sensitive (DPDP Act) | Supabase Vault | At rest + in transit |
| Income range | Sensitive | Supabase Vault | At rest + in transit |
| Kundli / birth data | Sensitive | Supabase Vault | At rest + in transit |
| Health data (V3) | Highly sensitive | Supabase Vault | At rest + in transit |
| Payment data | PCI DSS | Stripe (never stored locally) | N/A |

### 19.2 DPDP Act 2023 Compliance (India)

- Explicit consent required before collecting: caste, gotra, manglik status, income
- Consent must be specific (not bundled in ToS)
- Users can download all their data (export within 72 hours of request)
- Users can delete all their data (full deletion within 30 days, except graph nodes which are anonymized)
- Data processing purposes must be declared and adhered to
- No third-party data selling under any circumstances

### 19.3 Privacy Modes

| Mode | Who Can See Family | Who Can See Biodata |
|---|---|---|
| Open | Anyone with link | Premium users in matching pool |
| Protected (default) | Invited family members only | Premium users in same community pool |
| Closed | Only claimed members | Nobody outside family |

### 19.4 Right to Be Forgotten

When user requests account deletion:
1. All personally identifiable information removed within 30 days
2. Graph node preserved as anonymous placeholder ("Member — [Year of Birth]")
3. All biodata removed immediately
4. All matches and interests archived (anonymized)
5. Audit log entries preserved (legal requirement, anonymized)
6. User notified at each stage of deletion process

---

## 20. Performance & Regression Standards

### 20.1 No-Regression Rules

Every PR must:
1. Pass all existing unit tests (no test deletion without written justification)
2. Pass existing integration tests
3. Not increase bundle size by more than 5KB without justification
4. Not change any API response shape without a feature flag guarding the change
5. Not modify database schema without a corresponding migration file
6. Be reviewed against this PRD for requirement alignment

### 20.2 Critical Path Tests (Must Never Break)

These test suites must pass on every merge to main:

| Test Suite | What it covers |
|---|---|
| `auth.test.ts` | Login, OTP, session management |
| `graph-integrity.test.ts` | Cycle detection, self-reference, age gaps |
| `claim-flow.test.ts` | Claim confidence scoring, auto-approve, queue |
| `biodata-visibility.test.ts` | Who can see what based on plan and privacy mode |
| `merge.test.ts` | Node merge, edge consolidation, ID redirect |
| `payment.test.ts` | Stripe webhook handling, plan transitions |
| `trust-score.test.ts` | Score computation, recomputation on update |
| `invite.test.ts` | Link generation, expiry, claim connection |
| `pdf-generation.test.ts` | Kulgatha and biodata PDF completeness |
| `matching.test.ts` | Gotra blocking, interest flow, mutual interest |

### 20.3 Feature Flag Regression Standard

When a feature flag is flipped:
- Run flag-specific test suite (`FF_[flagname].test.ts`)
- Run full critical path suite above
- Smoke test the affected user journeys manually
- Document the flip in the changelog

---

## 21. Edge Cases Master List

### 21.1 Graph Edge Cases

| ID | Scenario | Expected Behavior |
|---|---|---|
| G01 | User adds themselves as their own parent | Block: `SELF_REFERENCE` error |
| G02 | User creates circular chain A→B→A (grandparent loop) | Block: `CYCLE_DETECTED` error |
| G03 | Node has 3 parents added | Block third parent: `TOO_MANY_PARENTS` |
| G04 | Child born before parent (birth year) | Warn but allow: `IMPOSSIBLE_AGE_GAP` |
| G05 | Spouse nodes are siblings in same tree | Warn but allow (historical/regional cases) |
| G06 | Person added to two separate family trees | Triggers cross-family claim and merge review |
| G07 | Family graph exceeds 1,000 nodes | Progressive loading, paginate graph render |
| G08 | Real-time update conflicts (two users edit same node simultaneously) | Last-write-wins with audit log, notify both |
| G09 | Node deleted that has dependent edges | Soft delete node, edges become dangling — surfaced in integrity report |
| G10 | Placeholder node gets claimed by two users | Queue second claim, notify first claimant |

### 21.2 Matrimony Edge Cases

| ID | Scenario | Expected Behavior |
|---|---|---|
| M01 | Same-gotra match suggested | Block entirely, never show in feed |
| M02 | Match is a cousin (2nd degree relative) | Block: "This person is in your close family" |
| M03 | Match is a 3rd cousin | Warn: "This match is a distant relative" — allow |
| M04 | User sends interest to their own node | Block |
| M05 | User has no active biodata but tries to send interest | Block: "Complete your biodata first" |
| M06 | Premium lapses mid-conversation | Keep conversation, remove from new discovery |
| M07 | Both parties express interest simultaneously | "Mutual Interest" fires once, not twice |
| M08 | Family admin sends interest on behalf of candidate | Allowed, logged as "Interest by [Admin name] on behalf of [Candidate]" |
| M09 | User tries to see match's full family tree without mutual interest | Show blurred preview, prompt to upgrade/express interest |
| M10 | Candidate deactivates biodata after interest sent | Interest expires, both notified: "Profile unavailable" |

### 21.3 Payment Edge Cases

| ID | Scenario | Expected Behavior |
|---|---|---|
| P01 | Webhook arrives out of order (upgrade before payment confirmed) | Queue webhook, process in order |
| P02 | User upgrades, immediately requests refund | Refund within 24 hours, downgrade immediately |
| P03 | Annual user wants to switch to monthly | Switch at renewal date, no mid-cycle change |
| P04 | UPI payment pending (common in India) | Show "Payment processing" state, activate plan on confirmation |
| P05 | Duplicate Stripe webhook | Idempotency key prevents double processing |
| P06 | Sabha subscription and family premium overlap | Both active, Sabha pool access + consumer pool access |
| P07 | Family has multiple premium members | Each member has own subscription, no family sharing (V2 feature) |

### 21.4 Auth Edge Cases

| ID | Scenario | Expected Behavior |
|---|---|---|
| A01 | OTP entered after 5-minute expiry | "Code expired — request a new one" |
| A02 | User tries 4th OTP attempt | "Too many attempts — request new code" |
| A03 | Same phone number registered twice | Merge accounts, notify user |
| A04 | User deletes account, re-registers same phone | New account, no data from old account visible |
| A05 | Session expires mid-action (long form) | Preserve form data in localStorage, prompt re-login |
| A06 | Admin account compromised | 2FA required for all admin actions (not family admin — platform admin) |

---

## 22. Test Coverage Requirements

### 22.1 Coverage Minimums

| Layer | Minimum Coverage |
|---|---|
| lib/ (relationship engine, trust score, merge) | 90% |
| API routes | 85% |
| Auth flows | 95% |
| Payment flows | 95% |
| Graph integrity rules | 100% |
| Feature flag switching | 80% |
| UI components | 70% |

### 22.2 Test Types Required

**Unit tests** — for all pure functions in `lib/`  
**Integration tests** — for all API routes (test against Supabase test instance)  
**E2E tests** — for critical user journeys (Playwright):
- Sign up → onboarding → create biodata → send interest
- Invite → join → claim node → trust score update
- Free → premium upgrade → access match discovery
- Payment failure → retry → success

### 22.3 Pre-Merge Checklist

```
Before merging any PR:
□ Feature flag referenced (if behavior change)
□ PRD section cited in PR description
□ Unit tests added/updated for changed functions
□ No existing tests deleted without justification
□ API contract unchanged OR flag-gated
□ DB migration included if schema changed
□ Edge cases from Section 21 verified for affected area
□ Performance budget not exceeded
□ No PII logged in console or error messages
```

---

## 23. Rollout Sequence

### Phase 1 — Enable What's Built (Week 1–2)
Priority: Ship zero new code. Enable what already exists.

| Action | Flag | Day |
|---|---|---|
| Enable biodata profiles | `enableBiodata: true` | Day 1 |
| Enable Stripe payments | `enableStripePayments: true` | Day 1 |
| Enable premium paywall | `enableMatrimonyPremium: true` | Day 2 |
| Enable phone OTP as default | `enablePhoneOtpAuth: true` | Day 3 |
| Enable trust score display | `enableTrustScore: true` | Day 5 |
| Enable cross-family matching | `enableCrossFamilyMatching: true` | Day 7 |

**Acceptance gate:** At least 1 paying customer before proceeding to Phase 2.

### Phase 2 — Core Matrimony Loop (Week 3–6)

| Feature | Flag | Week |
|---|---|---|
| Community pools (open pools) | `enableCommunityPools: true` | Week 3 |
| Matrimony-first onboarding | `enableMatrimonyFirstOnboarding: true` | Week 3 |
| WhatsApp notifications | `enableWhatsAppNotifications: true` | Week 4 |
| Kundli integration | `enableKundliIntegration: true` | Week 5 |
| AI compatibility narrative | `enableAiCompatibilityNarrative: true` | Week 6 |

**Acceptance gate:** 50 paying families before proceeding to Phase 3.

### Phase 3 — Growth & B2B (Month 2–3)

| Feature | Flag | Month |
|---|---|---|
| Sabha B2B OS | `enableSabhaB2B: true` | Month 2 |
| AI tree builder (onboarding) | `enableAiOnboarding: true` | Month 2 |
| Assisted matchmaking tier | `enableAssistedMatchmaking: true` | Month 3 |
| Relationship path narrative | `enableRelationshipPathNarrative: true` | Month 3 |
| Hindi language UI | `enableHindiLanguage: true` | Month 3 |

**Acceptance gate:** ₹10L MRR before proceeding to Phase 4.

### Phase 4 — Platform & Retention (Month 4–6)

| Feature | Flag | Month |
|---|---|---|
| Memory vault | `enableMemoryVault: true` | Month 4 |
| Family timeline | `enableTimeline: true` | Month 4 |
| Identity verification (Aadhaar) | `enableIdentityVerification: true` | Month 5 |
| Regional languages | `enableRegionalLanguages: true` | Month 5 |
| Native mobile app | `enableNativeApp: true` | Month 6 |

---

## Appendix A — Gotra Reference Database

A curated list of Hindu gotras (seeded in DB) for autocomplete. Initial list includes the most common 200 gotras across major communities. User can add custom gotra if not found. Custom gotras are reviewed and added to master list if valid.

## Appendix B — Indian Kinship Terms Reference

| Term | Relationship | Paternal/Maternal |
|---|---|---|
| Daada / Dada | Father's Father | Paternal |
| Daadi / Dadi | Father's Mother | Paternal |
| Nana | Mother's Father | Maternal |
| Nani | Mother's Mother | Maternal |
| Chacha | Father's younger Brother | Paternal |
| Tauji / Tau | Father's elder Brother | Paternal |
| Bua / Phuphi | Father's Sister | Paternal |
| Mama | Mother's Brother | Maternal |
| Mausi / Mausa | Mother's Sister | Maternal |
| Jija | Sister's Husband | — |
| Bhabhi | Brother's Wife | — |
| Devar | Husband's younger Brother | — |
| Jeth | Husband's elder Brother | — |
| Nanad | Husband's Sister | — |
| Sala | Wife's Brother | — |
| Sali | Wife's Sister | — |

All computed by relationship engine — never stored as edge types.

## Appendix C — API Error Codes

All routes return `{ error: { code, message } }` on failure.

| Code | HTTP | Route(s) | Meaning |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | All | Not logged in / session expired |
| `FORBIDDEN` | 403 | All write routes | Logged in but insufficient permission |
| `ADMIN_REQUIRED` | 403 | merge, integrity | Requires family admin role |
| `NOT_ADMIN` | 403 | family-links respond | Responder is not admin of their family |
| `CANNOT_ACCEPT_OWN_REQUEST` | 403 | family-links respond | Initiating family cannot accept their own link |
| `FAMILY_NOT_FOUND` | 404 | join-create | Family ID doesn't exist |
| `NODE_NOT_FOUND` | 404 | claim, unclaim, merge | Node ID doesn't exist |
| `INVITE_NOT_FOUND` | 404 | claim, unclaimed, join-create | Invite code doesn't exist |
| `NOT_FOUND` | 404 | family-links respond | Link ID doesn't exist |
| `JUNCTION_MEMBER_NOT_FOUND` | 404 | family-links respond | Junction member ID doesn't exist |
| `NODE_ARCHIVED` | 410 | claim | Node is soft-deleted (`deleted_at IS NOT NULL`) |
| `INVITE_ALREADY_USED` | 410 | claim | Invite `consumed_at IS NOT NULL` |
| `INVITE_CONSUMED` | 409 | invites/[token]/claim | Same as above (token route variant) |
| `INVITE_EXPIRED` | 410 | claim, unclaimed, join-create | Invite past `expires_at` |
| `INVITE_AT_LIMIT` | 409 | join-create | `used_count >= max_uses` |
| `SELF_REFERENCE` | 422 | graph mutations | Node trying to be its own parent or spouse |
| `CYCLE_DETECTED` | 422 | graph mutations | Parent-child cycle would be created |
| `TOO_MANY_PARENTS` | 422 | graph mutations | Node already has 2 biological parents |
| `INVALID_DATES` | 422 | graph mutations | Birth year after death year |
| `INVALID_EDGE_IDS` | 422 | join-create | `parentIds`/`spouseIds` reference nodes from a different family |
| `WRONG_INVITE_TYPE` | 422 | join-create | Invite is `node_claim` type; use claim flow instead |
| `INVALID_INVITE_TYPE` | 422 | claim | Invite type doesn't match expected |
| `INVITE_NODE_MISMATCH` | 422 | claim | Invite is for a different node |
| `IDENTITY_MISMATCH` | 422 | claim | Confidence score too low (< 40); identity not verified |
| `GUARDIAN_CLAIM_INVALID` | 422 | claim | Guardian tried to claim an adult node |
| `INVALID_ACTION` | 400 | family-links respond | `action` not in `['accept', 'reject']` |
| `INVALID_JUNCTION_MEMBER` | 400 | family-links respond | Junction member doesn't belong to responding family |
| `CONFIRMATION_REQUIRED` | 400 | unclaim | `{ confirm: true }` not passed in request body |
| `NOT_NODE_CLAIM_INVITE` | 400 | invites/[token]/claim | Invite is a family invite, not node-claim |
| `DUPLICATE_CANDIDATE` | 409 | graph mutations | Potential duplicate node detected |
| `CLAIM_CONFLICT` | 409 | claim | Generic claim conflict |
| `ALREADY_CLAIMED` | 409 | claim | Node already claimed by another user |
| `CLAIM_PENDING_ANOTHER_USER` | 409 | claim | Another user's claim is pending for this node |
| `NODE_DECEASED` | 409 | claim | Node marked `is_deceased=true` |
| `NODE_REVOKED` | 409 | claim | Node claim was revoked; re-invite required |
| `CROSS_FAMILY_CLAIM` | 409 | claim | Node belongs to a different family tree |
| `SUGGEST_FAMILY_LINK` | 409 | claim | User already has a primary node in another family |
| `ALREADY_LINKED_ACCOUNT` | 409 | claim | Account already linked to a node in this family |
| `NOT_CLAIMED` | 409 | unclaim | Node is not currently claimed |
| `GRACE_PERIOD_EXPIRED` | 409 | unclaim | Self-unclaim attempted after 7-day grace window |
| `NOT_PENDING` | 409 | family-links respond | Link is not in `pending` status |
| `ALREADY_PROCESSED` | 409 | family-links respond | Link was accepted/rejected by a concurrent request |
| `BOTH_CLAIMED` | 409 | merge | Both nodes are claimed by different users — cannot merge |
| `PRIMARY_ARCHIVED` | 409 | merge | Primary node is soft-deleted |
| `DUPLICATE_ARCHIVED` | 409 | merge | Duplicate node is soft-deleted |
| `MERGE_CONFLICT` | 409 | merge | Concurrent merge detected (optimistic lock on `updated_at`) |
| `GOTRA_CONFLICT` | 422 | matching | Same-gotra match attempted |
| `UNDERAGE_BIODATA` | 422 | biodata | User under 18 trying to create biodata |
| `PREMIUM_REQUIRED` | 402 | matching, discovery | Feature requires premium subscription |
| `RATE_LIMITED` | 429 | claim | 5+ claim attempts within 1 hour |
| `LOCKED_OUT` | 423 | claim | 3+ consecutive identity failures; locked for 24 hours |
| `NO_FAMILY` | 400 | admin routes | Caller has no `family_id` in their profile |
| `SERVER_MISCONFIGURED` | 503 | unclaim, admin | `SUPABASE_SERVICE_ROLE_KEY` not set |

---

*End of Document*  
*Version 1.0 — 2026-06-22*  
*All changes to this document must be reviewed by the product owner.*  
*All feature work must reference a section of this document.*