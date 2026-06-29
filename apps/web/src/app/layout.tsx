import type { Metadata } from 'next'
import '@fontsource/inter'
import Providers from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'WMS — Warehouse Management System',
    template: '%s | WMS',
  },
  description:
    'Custom Warehouse Management System for industrial manufacturing operations.',
  robots: {
    index: false,
    follow: false,
  }, // internal tool — no indexing
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        className="min-h-screen bg-slate-50 antialiased"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}