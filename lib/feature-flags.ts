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
  /** Migration map page — read-only, no real data wiring */
  enableMigrationMap: true,
  /** Family Poster generator — not yet production-ready */
  enableFamilyPoster: true,
  /** Kulgatha PDF export — not yet production-ready */
  enableKulgathaPDF: true,
  /** Live Activity widget on the graph canvas. Off by default for MVP — noise > signal until graph has scale. */
  enableLiveActivityWidget: false,
  /** Presence avatars (who's online) on the dashboard header. Off until realtime presence is wired. */
  enablePresenceAvatars: true,
  /** Advanced analytics / missing-data intelligence panels beyond the basic overview. */
  enableAdvancedAnalytics: true,
  /** Editable milestone CRUD on member-detail. ON — migration 017 adds the milestones table. */
  enableMilestoneEditor: true,
  /** Google Places autocomplete for location fields. Off until GOOGLE_MAPS_API_KEY is configured. */
  enableGooglePlaces: false,
  /** Full multipage PDF export of the entire graph universe. Off until export pipeline ships. */
  enableFullGraphPdfExport: false,
  /** Asks "how are you related to the inviter?" during the /join flow. */
  /** Per DECISION 1 (claim = join) this step is removed; relationship is set during node creation. */
  enableInviteRelationshipStep: false,  // HIGH-08: was true, conflicts with DECISION 1 comment
  /** Admin review queue for low-confidence claims. ON — already shipped in settings dialog. */
  enableClaimReviewQueue: true,
  /** Moderator role: dedicated claim review + conflict resolution UI (/admin/moderation). */
  enableModeratorUI: true,
  /** Graph conflict detection panel in settings — shows pending_conflicts from DB. */
  enableConflictPanel: true,
  /** Relationship step wizard during invite join — requires enableInviteRelationshipStep to also be true. */
  enableStructuralMappingWizard: false,
  /** branch_admin role: scoped edit permissions on a subtree. */
  enableBranchAdmin: false,
  /** Realtime notifications driven by claim_audit_log + family_members inserts. */
  enableRealtimeNotifications: true,
  /** Phone number + OTP sign-in / sign-up (WhatsApp / SMS).
   *  Requires Supabase Phone provider + an SMS/WhatsApp gateway configured in the Dashboard.
   *  Keep false until the gateway is ready — email auth continues to work independently. */
  enablePhoneOtpAuth: false,
  /** Email + password authentication. Disable only if switching 100% to phone OTP. */
  enableEmailPasswordAuth: true,
  /** Hierarchical family tree view — screenshot-faithful layout (grandparents → parents → You → children).
   *  Includes ghost-slot onboarding guide for 2-minute family setup.
   *  Set to true to show the "Tree" tab in the dashboard view switcher. */
  enableHierarchicalTreeView: true,
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

/** Type-safe accessor with explicit return type for compile-time narrowing. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] === true
}

