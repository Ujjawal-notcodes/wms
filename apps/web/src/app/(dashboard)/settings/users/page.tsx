'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  Search,
  Plus,
  Loader2,
  Shield,
  UserCheck,
  UserX,
  Phone,
  Mail,
  User as UserIcon,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createUserSchema, type CreateUserInput } from '@wms/shared'

interface Role {
  id: string
  name: string
  description: string | null
}

interface Site {
  id: string
  name: string
  code: string
}

interface User {
  id: string
  email: string
  fullName: string
  phone: string | null
  isActive: boolean
  createdAt: string
  roles: { id: string; name: string; siteId: string | null }[]
}

import { useAuthStore } from '@/store/auth.store'

export default function UsersPage() {
  const queryClient = useQueryClient()
  const { hasPermission, user } = useAuthStore()

  // Search filter
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  if (user && !hasPermission('users', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white border rounded-xl shadow-sm">
        <Shield className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          You do not have the required permissions to view or manage system users.
        </p>
      </div>
    )
  }

  // Queries
  const { data: usersData, isLoading: isUsersLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  })

  const { data: rolesData } = useQuery<Role[]>({
    queryKey: ['roles-lookup'],
    queryFn: () => api.get<Role[]>('/users/roles'),
  })

  const { data: sitesData } = useQuery<Site[]>({
    queryKey: ['sites-lookup'],
    queryFn: () => api.get<Site[]>('/locations/sites'),
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateUserInput) => api.post<any>('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsAddOpen(false)
      setApiError(null)
      addForm.reset()
    },
    onError: (err: any) => {
      setApiError(err.message || 'Failed to create user. Please try again.')
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.put<any>(`/users/${userId}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to update user status')
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => api.delete<any>(`/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to deactivate user')
    },
  })

  // Form setup
  const addForm = useForm<CreateUserInput & { singleRoleId: string }>({
    resolver: zodResolver(
      createUserSchema.extend({
        singleRoleId: createUserSchema.shape.roleIds.element,
      })
    ),
    defaultValues: {
      email: '',
      password: '',
      fullName: '',
      phone: '',
      singleRoleId: '',
      roleIds: [],
      siteId: '',
    },
  })

  const handleOpenAdd = () => {
    setApiError(null)
    addForm.reset({
      email: '',
      password: '',
      fullName: '',
      phone: '',
      singleRoleId: rolesData?.[0]?.id || '',
      roleIds: [],
      siteId: '',
    })
    setIsAddOpen(true)
  }

  const onSubmit = (data: CreateUserInput & { singleRoleId: string }) => {
    setApiError(null)
    const payload: CreateUserInput = {
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      phone: data.phone || undefined,
      roleIds: [data.singleRoleId],
      siteId: data.siteId || undefined,
    }
    createMutation.mutate(payload)
  }

  const handleToggleActive = (user: User) => {
    if (user.isActive) {
      if (confirm(`Are you sure you want to deactivate ${user.fullName}? This will revoke all their active login sessions.`)) {
        deactivateMutation.mutate(user.id)
      }
    } else {
      toggleStatusMutation.mutate({ userId: user.id, isActive: true })
    }
  }

  // Filtering
  const filteredUsers = (usersData ?? []).filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter
      ? u.roles.some((r) => r.id === roleFilter)
      : true
    return matchesSearch && matchesRole
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users & Roles</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your warehouse operators, managers, and system access levels.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white hover:bg-brand-600 transition-colors cursor-pointer text-sm"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search users by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div className="w-full md:w-60">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
          >
            <option value="">All Roles</option>
            {rolesData?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-700 border-b">
              <tr>
                <th scope="col" className="px-6 py-4">User</th>
                <th scope="col" className="px-6 py-4">Contact Info</th>
                <th scope="col" className="px-6 py-4">Roles & Scopes</th>
                <th scope="col" className="px-6 py-4">Status</th>
                <th scope="col" className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">
              {isUsersLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-500" />
                    <span className="text-slate-400 mt-2 block text-sm">Loading users...</span>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <UserIcon className="h-10 w-10 text-slate-300" />
                      <span className="font-medium">No users found</span>
                      <span className="text-xs">Try clearing your search filters or click "Add User" to register a user.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{user.fullName}</div>
                          <div className="text-xs text-slate-400">ID: {user.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span>{user.email}</span>
                      </div>
                      {user.phone && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{user.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {user.roles.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">No assigned roles</span>
                        ) : (
                          user.roles.map((r) => {
                            const scopeSite = sitesData?.find((s) => s.id === r.siteId)
                            return (
                              <span
                                key={r.id}
                                className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
                              >
                                <Shield className="h-3 w-3 text-slate-500" />
                                {r.name}
                                {scopeSite && (
                                  <span className="text-slate-400 font-normal">
                                    ({scopeSite.code})
                                  </span>
                                )}
                              </span>
                            )
                          })
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                          user.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all hover:shadow-sm cursor-pointer ${
                          user.isActive
                            ? 'border-red-200 text-red-600 hover:bg-red-50/50'
                            : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50/50'
                        }`}
                      >
                        {user.isActive ? (
                          <>
                            <UserX className="h-3.5 w-3.5" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="h-3.5 w-3.5" />
                            Activate
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD USER MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg">
                <UserIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Add New User</h2>
                <p className="text-xs text-slate-400">Register and assign role permissions</p>
              </div>
            </div>

            <form
              onSubmit={addForm.handleSubmit(onSubmit)}
              className="p-6 space-y-4"
            >
              {/* API Error banner */}
              {apiError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {apiError}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  {...addForm.register('fullName')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {addForm.formState.errors.fullName && (
                  <p className="text-xs text-red-500 mt-1">
                    {addForm.formState.errors.fullName.message}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="name@company.com"
                  {...addForm.register('email')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {addForm.formState.errors.email && (
                  <p className="text-xs text-red-500 mt-1">
                    {addForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  {...addForm.register('password')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number.
                </p>
                {addForm.formState.errors.password && (
                  <p className="text-xs text-red-500 mt-1">
                    {addForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="+91 99999 99999"
                  {...addForm.register('phone')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  {...addForm.register('singleRoleId')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— Select Role —</option>
                  {rolesData?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {addForm.formState.errors.singleRoleId && (
                  <p className="text-xs text-red-500 mt-1">
                    {addForm.formState.errors.singleRoleId.message}
                  </p>
                )}
              </div>

              {/* Scope Site */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scope Site <span className="text-slate-400 font-normal">(optional — default all sites)</span>
                </label>
                <select
                  {...addForm.register('siteId')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All Sites (Global)</option>
                  {sitesData?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
