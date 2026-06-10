import type { Metadata } from 'next'
import LoginForm from './login-form'

export const metadata: Metadata = { title: 'Login' }

export default function LoginPage() {
  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl p-8">
      {/* Logo / Title */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-500 shadow-lg">
          <span className="text-2xl font-bold text-white">W</span>
        </div>
        <h1 className="text-2xl font-bold text-white">WMS</h1>
        <p className="mt-1 text-sm text-brand-200">Warehouse Management System</p>
      </div>

      <LoginForm />
    </div>
  )
}
