export const colors = {
  background: '#0B0D14',
  surface: '#151824',
  surfaceElevated: '#1E2233',
  border: '#2A2E42',
  textPrimary: '#F2F1ED',
  textSecondary: '#9497AA',
  accentAmber: '#E8A33D',
  accentViolet: '#7B61FF',
  statusSuccess: '#4ADE80',
  statusWarning: '#FBBF24',
  statusError: '#F87171',
} as const;

export type ColorToken = keyof typeof colors;
