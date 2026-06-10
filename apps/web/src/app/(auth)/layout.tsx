import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900">
      <div className="w-full max-w-md px-4">
        {children}
      </div>
    </div>
  )
}
