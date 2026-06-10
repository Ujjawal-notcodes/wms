/**
 * Root route — redirect to /login.
 * Next.js requires a page.tsx at the app root; without it visiting / returns 404.
 */
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/login')
}
