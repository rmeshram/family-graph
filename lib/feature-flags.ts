/**
 * Centralized feature flags for MVP.
 * Set a flag to `true` when the feature is production-ready.
 * All disabled features are hidden from the UI but code is preserved.
 */
export const FEATURE_FLAGS = {
  /** Google Gemini-powered AI Copilot — requires GOOGLE_AI_API_KEY env var */
  enableAICopilot: false,
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
  enablePresenceAvatars: false,
  /** Advanced analytics / missing-data intelligence panels beyond the basic overview. */
  enableAdvancedAnalytics: false,
  /** Editable milestone CRUD on member-detail. Off until backend wiring + table migration ships. */
  enableMilestoneEditor: false,
  /** Google Places autocomplete for location fields. Off until GOOGLE_MAPS_API_KEY is configured. */
  enableGooglePlaces: false,
  /** Full multipage PDF export of the entire graph universe. Off until export pipeline ships. */
  enableFullGraphPdfExport: false,
  /** Asks "how are you related to the inviter?" during the /join flow. */
  /** Per DECISION 1 (claim = join) this step is removed; relationship is set during node creation. */
  enableInviteRelationshipStep: false,
  /** Admin review queue for low-confidence claims. ON — already shipped in settings dialog. */
  enableClaimReviewQueue: true,
  /** Realtime notifications driven by claim_audit_log + family_members inserts. */
  enableRealtimeNotifications: true,
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

/** Type-safe accessor with explicit return type for compile-time narrowing. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] === true
}

