/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: [
    './App.tsx',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        display: ['SpaceGrotesk_600SemiBold'],
        body: ['Inter_400Regular'],
        'body-medium': ['Inter_500Medium'],
        'body-semibold': ['Inter_600SemiBold'],
      },
      boxShadow: {
        elevated: '0 8px 20px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};
