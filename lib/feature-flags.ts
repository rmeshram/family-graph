/**
 * Centralized feature flags for MVP.
 * Set a flag to `true` when the feature is production-ready.
 * All disabled features are hidden from the UI but code is preserved.
 */
export const FEATURE_FLAGS = {
  /** Google Gemini-powered AI Copilot — requires GOOGLE_AI_API_KEY env var */
  enableAICopilot: true,
  /** Stripe subscription / upgrade flow — not yet integrated */
  enableUpgradeFlow: false,
  /** Migration map page — read-only, no real data wiring. Disabled until migration data is properly wired. */
  enableMigrationMap: false,
  /** Family Poster generator — not yet production-ready */
  enableFamilyPoster: true,
  /** Kulgatha PDF export — not yet production-ready */
  enableKulgathaPDF: false,
  /** Live Activity widget on the graph canvas. Off by default for MVP — noise > signal until graph has scale. */
  enableLiveActivityWidget: true,
  /** Presence avatars (who's online) on the dashboard header. Off until realtime presence is wired. */
  enablePresenceAvatars: true,
  /** Advanced analytics / missing-data intelligence panels beyond the basic overview. */
  enableAdvancedAnalytics: true,
  /** Editable milestone CRUD on member-detail. ON — migration 017 adds the milestones table. */
  enableMilestoneEditor: true,
  /** Google Places autocomplete for location fields. Off until GOOGLE_MAPS_API_KEY is configured. */
  enableGooglePlaces: false,
  /** Full multipage PDF export of the entire graph universe. Off until export pipeline ships. */
  enableFullGraphPdfExport: true,
  /** Asks "how are you related to the inviter?" during the /join flow. */
  /** Per DECISION 1 (claim = join) this step is removed; relationship is set during node creation. */
  enableInviteRelationshipStep: false,  // DECISION 1: step removed for MVP. Flip to true to restore.
  /** Admin review queue for low-confidence claims. ON — already shipped in settings dialog. */
  enableClaimReviewQueue: true,
  /** Moderator role: dedicated claim review + conflict resolution UI (/admin/moderation). */
  enableModeratorUI: true,
  /** Graph conflict detection panel in settings — shows pending_conflicts from DB. */
  enableConflictPanel: true,
  /** Relationship step wizard during invite join — requires enableInviteRelationshipStep to also be true. */
  enableStructuralMappingWizard: false,  // Off: depends on enableInviteRelationshipStep which is false per DECISION 1.
  /** branch_admin role: scoped edit permissions on a subtree. */
  enableBranchAdmin: true,
  /** Realtime notifications driven by claim_audit_log + family_members inserts. */
  enableRealtimeNotifications: true,
  /** Phone number + OTP sign-in / sign-up (WhatsApp / SMS).
   *  Requires Supabase Phone provider + an SMS/WhatsApp gateway configured in the Dashboard.
   *  Keep false until the gateway is ready — email auth continues to work independently. */
  enablePhoneOtpAuth: true,
  /** Email + password authentication. Disable only if switching 100% to phone OTP. */
  enableEmailPasswordAuth: true,
  /** Matrimony biodata generation & matching page (/biodata). */
  enableBiodata: true,
  /** Cross-family matrimony match discovery feed (/matches). Requires matrimony_interests migration 046. */
  enableMatrimonyFeed: true,
  /** Hierarchical family tree view — screenshot-faithful layout (grandparents → parents → You → children).
   *  Includes ghost-slot onboarding guide for 2-minute family setup.
   *  Set to true to show the "Tree" tab in the dashboard view switcher. */
  enableHierarchicalTreeView: true,
  /** Original force-directed graph canvas. Superseded by Universe (same concept, more polish).
   *  Disabled — keeping code for potential future differentiation. */
  enableGraphView: false,
  /** Generation-strip org chart view. Has generation label bug (gen=0 maps to Great Grandparents but is actually "You").
   *  Disabled — keeping code in case it's fixed and re-enabled later. */
  enableOrgChartView: false,
  /** Events calendar page. Low value for MVP — re-enable once event RSVP + notifications are wired. */
  enableEvents: false,

  // ─────────────────────────────────────────────────────────────────────────
  // SPEC §2.1 — MVP flags to add (per docs/SPEC.md). Default OFF until built.
  // ─────────────────────────────────────────────────────────────────────────
  /** Payment processing via Stripe. Requires STRIPE_SECRET_KEY + webhook. Revenue — V2. */
  enableStripePayments: false,
  /** Premium matrimony paywall. Free at launch for traction — flip with enableStripePayments. */
  enableMatrimonyPremium: false,
  /** "Share on WhatsApp" button on biodata page. Uses wa.me deep link — no Business API needed. */
  enableBiodataWhatsappShare: true,
  /** Community matrimony pools. */
  enableCommunityPools: false,
  /** Show matrimony matches outside the user's own family. */
  enableCrossFamilyMatching: true,
  /** WhatsApp Business API (Meta) notifications. Requires WhatsApp Business API credentials. */
  enableWhatsAppNotifications: false,
  /** Trust score computation + display on profiles/match cards (SPEC §5.3). */
  enableTrustScore: true,
  /** Kundli PDF via AstroSage API. Requires ASTROSAGE_API_KEY. V3 — post-traction only. */
  enableKundliIntegration: false,
  /** Matrimony-first 3-screen onboarding (SPEC §4.3). */
  enableMatrimonyFirstOnboarding: true,

  // ─────────────────────────────────────────────────────────────────────────
  // SPEC §2.2 — V2 flags (Days 31–90). Default OFF.
  // ─────────────────────────────────────────────────────────────────────────
  /** Human matchmaker concierge tier. */
  enableAssistedMatchmaking: false,
  /** B2B white-label community OS (Sabha OS). */
  enableSabhaB2B: false,
  /** Conversational AI tree builder during onboarding. */
  enableAiOnboarding: false,
  /** AI-generated match compatibility narrative text. */
  enableAiCompatibilityNarrative: false,
  /** "How you're connected" human-readable relationship path narrative. */
  enableRelationshipPathNarrative: false,
  /** Hindi UI and AI responses. */
  enableHindiLanguage: false,
  /** Tamil, Telugu, Bengali, Marathi UI. */
  enableRegionalLanguages: false,
  /** AI nudges to improve biodata completeness. */
  enableBiodataQualityCoach: false,

  // ─────────────────────────────────────────────────────────────────────────
  // SPEC §2.3 — V3 flags (Month 4+). Default OFF.
  // ─────────────────────────────────────────────────────────────────────────
  /** Voice notes, stories, photo memories vault. */
  enableMemoryVault: false,
  /** Family milestone timeline (migration 017 exists). */
  enableTimeline: false,
  /** Property/inheritance tracking layer. */
  enableEstatePlanning: false,
  /** Pakistan, Bangladesh, Sri Lanka market expansion. */
  enableDiasporaExpansion: false,
  /** Health history on graph nodes. */
  enableFamilyHealthRecords: false,
  /** Native iOS/Android app (vs PWA). */
  enableNativeApp: false,
  /** Aadhaar / identity verification (SPEC §23 Phase 4). */
  enableIdentityVerification: false,
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

/** Type-safe accessor with explicit return type for compile-time narrowing. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] === true
}

