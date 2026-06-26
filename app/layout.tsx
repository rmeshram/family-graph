import type { Metadata, Viewport } from 'next'
import { Inter, Cormorant_Garamond } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import { AuthProvider } from '@/hooks/use-auth'
import './globals.css'

// SPEC §3.0 — Inter with alternate digits (cv11) and open 'a' (ss01)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
})

// Audit fix: Premium display typeface for hero headlines and biodata.
// Cormorant Garamond is warm, editorial, and carries Indian-luxury aesthetic
// (used in premium fashion/jewellery publishing). Applied via --font-display.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Family Graph — Find matches your family can trust',
  description: 'The only matrimony platform where every match comes with a verified family tree. Gotra matching, family verification, and trusted introductions.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  keywords: ['matrimony', 'Indian matrimony', 'family tree', 'gotra matching', 'verified matches', 'NRI matrimony', 'rishta', 'shaadi'],
  authors: [{ name: 'Family Graph' }],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://familygraph.in',
    title: 'Family Graph — Find matches your family can trust',
    description: 'The only matrimony platform where every match comes with a verified family tree. Gotra compatible. Family verified.',
    siteName: 'Family Graph',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Family Graph — Verified matrimony matches with family trees',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Family Graph — Verified matrimony with verified family trees',
    description: 'The only matrimony platform where every match comes with a verified family tree. Gotra matched. Parents verified.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

// viewport-fit=cover is required for env(safe-area-inset-*) to work on iPhone.
// Without it, the CSS safe-area values are always 0 and zoom controls sit behind
// the home indicator on devices with a notch / Dynamic Island.
export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${cormorant.variable}`}>
      <head>
        {/* Restore theme before first paint — raw script runs synchronously, no FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('fg-theme');if(t!=='dark')document.documentElement.classList.add('light-theme');}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-background text-foreground" style={{ fontFeatureSettings: "'cv11', 'ss01'" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function(){}); }`,
          }}
        />
      </body>
    </html>
  )
}
