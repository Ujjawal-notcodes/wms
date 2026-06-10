/**
 * @fileoverview Next.js middleware.
 *
 * Runs at the edge before every request.
 * Responsibilities:
 *   1. Protect dashboard routes — redirect to /login if no session exists
 *   2. Redirect authenticated users away from /login
 *
 * Session check strategy:
 *   - Use the `refresh_token` cookie (httpOnly, 7-day lifetime) as the session
 *     gate. This is the long-lived session indicator.
 *   - Do NOT gate on `access_token` (15-min lifetime): it expires frequently
 *     and the client-side api-client already handles silent refresh on 401.
 *     Gating on access_token would cause spurious /login redirects every 15
 *     minutes even for active users.
 *   - For the /login redirect-away check, verify the access_token with jose so
 *     we only redirect if the user truly has a valid active token.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = process.env.JWT_SECRET
  ? new TextEncoder().encode(process.env.JWT_SECRET)
  : null

// Routes that require authentication
const PROTECTED_PREFIXES = ['/dashboard', '/inventory', '/skus', '/locations', '/transfers', '/settings']

// Routes accessible only when NOT authenticated
const AUTH_ROUTES = ['/login']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  // ── Session gate: presence of the long-lived refresh_token cookie ──────────
  // The refresh_token cookie is httpOnly and set by the API on login/refresh.
  // Its presence means the user has an active session (even if the access token
  // has expired). The client will silently refresh the access token on the first
  // 401 it receives.
  const hasRefreshToken = Boolean(request.cookies.get('refresh_token')?.value)

  // ── Authenticated check for /login redirect-away: verify access_token ──────
  // Only for the /login page we want to know if the user is *actively* authed
  // with a valid, non-expired access token before redirecting them away.
  let hasValidAccessToken = false
  if (isAuthRoute && JWT_SECRET) {
    const accessToken = request.cookies.get('access_token')?.value
    if (accessToken) {
      try {
        await jwtVerify(accessToken, JWT_SECRET)
        hasValidAccessToken = true
      } catch {
        hasValidAccessToken = false
      }
    }
  }

  // Redirect unauthenticated users (no refresh token = no session) to login
  if (isProtected && !hasRefreshToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from login (only if access token is valid)
  if (isAuthRoute && hasValidAccessToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - api routes (handled by Fastify)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}
