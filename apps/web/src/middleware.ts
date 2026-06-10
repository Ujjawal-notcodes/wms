/**
 * @fileoverview Next.js edge middleware — route protection.
 *
 * Design decisions (stable baseline):
 *
 * 1. Gate protected routes on the PRESENCE of either cookie:
 *    - `access_token`  (15-min JWT,  set by API on login/refresh)
 *    - `refresh_token` (7-day token, set by API on login/refresh)
 *    Either cookie means the user has logged in at some point this session.
 *    If the access token is expired the api-client does a silent /auth/refresh
 *    automatically on the first 401 it receives — no middleware redirect needed.
 *
 * 2. Both cookies are httpOnly and scoped to the API origin (localhost:3001).
 *    The middleware runs on the Next.js origin (localhost:3000).
 *    Cross-origin cookies are NOT sent by the browser, so the middleware can
 *    ONLY read cookies that Next.js itself set (or that were proxied through it).
 *    To work around this, we store a thin non-httpOnly session marker cookie
 *    named `wms_session` that is set by the login form after a successful login
 *    and cleared on logout. This is the middleware-visible session signal.
 *
 * 3. The middleware does NOT attempt JWT verification — that is the API's job.
 *    Verifying here would require sharing the JWT_SECRET with the edge runtime
 *    and would add latency to every request. Let the API return 401 and let the
 *    client refresh silently.
 *
 * 4. /login redirect-away: redirect authenticated users (cookie present) away
 *    from /login so they don't see the form after already logging in.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that require a session
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/inventory',
  '/skus',
  '/locations',
  '/transfers',
  '/settings',
]

// Routes that redirect to /dashboard when already authenticated
const AUTH_ONLY_ROUTES = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isAuthOnly = AUTH_ONLY_ROUTES.some((p) => pathname.startsWith(p))

  // `wms_session` is a non-httpOnly cookie set by the login form on the
  // Next.js origin so the middleware can detect an active session.
  const hasSession = Boolean(request.cookies.get('wms_session')?.value)

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthOnly && hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static files.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
