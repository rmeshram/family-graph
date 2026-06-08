import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import { AuthProvider } from '@/hooks/use-auth'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Outverse - The Living Family Intelligence Network',
  description: 'Visualize, preserve, and understand your family heritage across generations with AI-powered insights.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  keywords: ['family tree', 'genealogy', 'family history', 'Indian families', 'gotra', 'relationship mapping', 'AI family tree'],
  authors: [{ name: 'Outverse' }],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://outverse.in',
    title: 'Outverse - Map Your Entire Family Network',
    description: 'India\'s first AI-powered family intelligence platform. Discover lost relatives, check gotra compatibility, preserve elder stories. Free during beta.',
    siteName: 'Outverse',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Outverse - Your Family\'s Digital Legacy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Outverse - Map Your Entire Family Network',
    description: 'India\'s first AI-powered family intelligence platform. Discover lost relatives, check gotra compatibility, preserve elder stories.',
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Restore theme before first paint — raw script runs synchronously, no FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('fg-theme');if(t!=='dark')document.documentElement.classList.add('light-theme');}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-background text-foreground">
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
