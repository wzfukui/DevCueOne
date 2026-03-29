import forms from '@tailwindcss/forms'
import containerQueries from '@tailwindcss/container-queries'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx,vue,svelte}'],
  theme: {
    extend: {
      colors: {
        'on-primary-fixed-variant': '#374955',
        'surface-container-lowest': '#ffffff',
        'surface-variant': '#e3e2e0',
        'on-tertiary-fixed': '#2e1500',
        outline: '#73787b',
        tertiary: '#281200',
        'error-container': '#ffdad6',
        'on-primary-fixed': '#0a1e28',
        'on-error': '#ffffff',
        'on-primary': '#ffffff',
        'outline-variant': '#c3c7cb',
        'on-surface-variant': '#43474b',
        'surface-dim': '#dbdad7',
        'tertiary-fixed': '#ffdcc1',
        'surface-tint': '#4f616d',
        'on-tertiary-fixed-variant': '#663d15',
        'primary-container': '#1d2f3a',
        'on-secondary-fixed-variant': '#663d12',
        'tertiary-fixed-dim': '#f6bb87',
        'secondary-container': '#ffc38c',
        'primary-fixed-dim': '#b6c9d7',
        primary: '#071a25',
        'on-secondary-container': '#7a4e21',
        error: '#ba1a1a',
        'surface-container-high': '#e9e8e5',
        'on-surface': '#1a1c1a',
        'on-secondary': '#ffffff',
        'surface-container-low': '#f4f3f1',
        'on-secondary-fixed': '#2d1600',
        secondary: '#815527',
        'on-tertiary-container': '#be895a',
        background: '#faf9f6',
        surface: '#faf9f6',
        'primary-fixed': '#d2e5f4',
        'inverse-surface': '#2f312f',
        'on-tertiary': '#ffffff',
        'inverse-on-surface': '#f2f1ee',
        'on-primary-container': '#8497a4',
        'inverse-primary': '#b6c9d7',
        'on-background': '#1a1c1a',
        'surface-container-highest': '#e3e2e0',
        'secondary-fixed-dim': '#f6bb84',
        'tertiary-container': '#462400',
        'surface-container': '#efeeeb',
        'surface-bright': '#faf9f6',
        'on-error-container': '#93000a',
        'secondary-fixed': '#ffdcbf'
      },
      fontFamily: {
        headline: ['Newsreader', 'serif'],
        body: ['Public Sans', 'sans-serif'],
        label: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace']
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '2rem',
        xl: '3rem',
        full: '9999px'
      }
    }
  },
  plugins: [forms, containerQueries]
}
