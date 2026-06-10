'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@wms/shared'
import { api, setAccessToken } from '@/lib/api-client'
import { useAuthStore, type AuthUser } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function LoginForm() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginInput) => {
    setError(null)
    setIsLoading(true)

    try {
      const loginRes = await api.post<{ accessToken: string }>('/auth/login', data)

      setAccessToken(loginRes.accessToken)
      const user = await api.get<AuthUser>('/auth/me')

      setAuth(user, loginRes.accessToken)
      router.push('/dashboard')
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err?.message ?? 'Invalid email or password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-brand-100 mb-1">Email</label>
        <input
          type="email"
          placeholder="admin@wms.local"
          disabled={isLoading}
          {...register('email')}
          className={`w-full rounded-lg border bg-white/10 px-3 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-colors ${
            errors.email ? 'border-red-500 focus:ring-red-500' : 'border-white/20'
          }`}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-300">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-brand-100 mb-1">Password</label>
        <input
          type="password"
          placeholder="••••••••"
          disabled={isLoading}
          {...register('password')}
          className={`w-full rounded-lg border bg-white/10 px-3 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-colors ${
            errors.password ? 'border-red-500 focus:ring-red-500' : 'border-white/20'
          }`}
        />
        {errors.password && (
          <p className="mt-1 text-xs text-red-300">{errors.password.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center items-center gap-2 rounded-lg bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-50 disabled:hover:bg-brand-500 transition-colors cursor-pointer"
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {isLoading ? 'Signing In...' : 'Sign In'}
      </button>
    </form>
  )
}
