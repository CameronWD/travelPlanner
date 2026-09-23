# Teepee logo — install into Next.js 15

Copy into `public/`:
- `favicon/favicon.svg` → `public/favicon.svg` (adapts to light/dark tab bars)
- `favicon/favicon-32.png`, `favicon-16.png` → `public/`
- `favicon/safari-pinned-tab.svg` → `public/`
- `app-icon/apple-touch-icon-180.png` → `public/apple-touch-icon.png`
- `app-icon/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` → `public/icons/`

`app/layout.tsx`:
```ts
export const metadata = {
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon-32.png', sizes: '32x32' }],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
};
export const viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#FFFBF3' }, { media: '(prefers-color-scheme: dark)', color: '#211F1B' }] };
```

`app/manifest.ts`:
```ts
export default function manifest() {
  return {
    name: 'Teepee', short_name: 'Teepee', start_url: '/', display: 'standalone',
    background_color: '#FFD166', theme_color: '#FFFBF3',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

Mark in UI: inline `mark/tent-pin-mono.svg` (uses `currentColor`) as a Server Component `<Logo />`.

Note: `lockup/*.svg` set the wordmark as live text in Bricolage Grotesque — outline to paths once the final font file is licensed (handoff step 11).
