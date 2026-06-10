import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Providers from './providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: { default: 'WMS — Warehouse Management System', template: '%s | WMS' },
  description: 'Custom Warehouse Management System for industrial manufacturing operations.',
  robots: { index: false, follow: false }, // internal tool — no indexing
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
