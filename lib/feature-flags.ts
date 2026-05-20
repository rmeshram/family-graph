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
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS
