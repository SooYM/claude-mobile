import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        system: {
          background: 'var(--background)',
          foreground: 'var(--foreground)',
          card: 'var(--card)',
          border: 'var(--border)',
          accent: 'var(--accent)',
          userBubble: 'var(--user-bubble)',
          assistantBubble: 'var(--assistant-bubble)',
        },
      },
      boxShadow: {
        soft: '0 24px 60px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
