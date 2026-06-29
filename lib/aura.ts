export type AuraTier = {
  label: 'Unverified' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
  color: string
  bg: string
  border: string
  glow?: string
}

export function getAuraTier(score: number): AuraTier {
  if (score >= 80) return {
    label: 'Platinum',
    color: '#7C3AED',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    glow: '0 0 12px rgba(124,58,237,0.35)',
  }
  if (score >= 60) return {
    label: 'Gold',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    glow: '0 0 10px rgba(217,119,6,0.25)',
  }
  if (score >= 40) return {
    label: 'Silver',
    color: '#6B7280',
    bg: '#F9FAFB',
    border: '#E5E7EB',
  }
  if (score >= 20) return {
    label: 'Bronze',
    color: '#92400E',
    bg: '#FEF3C7',
    border: '#FCD34D',
  }
  return {
    label: 'Unverified',
    color: '#9CA3AF',
    bg: '#F3F4F6',
    border: '#E5E7EB',
  }
}
