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

  // No server-side session from a server action — send them to sign in.
  redirect('/auth/login')
}
