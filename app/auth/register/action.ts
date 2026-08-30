'use server'

import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'

// Legacy server-action signup. Creates the account directly in MySQL
// (NextAuth user row + profiles row, same id) — no Supabase.
//
// A server action cannot establish a NextAuth session on its own, so on
// success we hand off to the login page (with the email prefilled context)
// rather than dropping the user on /account with no session. bcrypt rounds
// = 10 to match lib/auth/authOptions.ts.
export async function signup(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  // Basic guard
  if (!email || !password) {
    redirect(`/auth/register?error=${encodeURIComponent('Email and password are required')}`)
  }

  // Reject duplicate emails up front.
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    redirect(`/auth/register?error=${encodeURIComponent('An account with this email already exists')}`)
  }

  const id = randomUUID()
  try {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: { id, email, name: name || null, passwordHash },
    })
    await prisma.profiles.upsert({
      where: { id },
      update: { full_name: name || null },
      create: { id, full_name: name || null },
    })
  } catch (e) {
    console.error('[register/action] MySQL create failed:', e)
    redirect(`/auth/register?error=${encodeURIComponent('Could not create your account. Please try again.')}`)
  }

  // K-Points signup bonus. The third door into account creation, and the third
  // place this has to be said: /api/auth/register grants it, authOptions'
  // createUser grants it for OAuth, and this legacy action did not — so anyone
  // arriving through here started with nothing. Best-effort and idempotent per
  // user, so a points failure never costs them the account they just made.
  try {
    const { getEarnRule } = await import('@/lib/k-points/config')
    const { earn } = await import('@/lib/k-points/service')
    const rule = await getEarnRule('signup')
    if (rule.enabled && rule.value > 0) {
      await earn({
        userId: id,
        points: Math.floor(rule.value),
        reason: 'signup',
        sourceType: 'user',
        sourceId: id,
      })
    }
  } catch (e) {
    console.error('[register/action] k-points signup bonus failed:', e)
  }

  // No server-side session from a server action — send them to sign in.
  redirect('/auth/login')
}
