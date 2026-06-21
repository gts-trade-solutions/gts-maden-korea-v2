'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function signup(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  // Basic guard
  if (!email || !password) {
    redirect(`/auth/register?error=${encodeURIComponent('Email and password are required')}`)
  }

  const supabase = await createClient()

  // Store name/role in user_metadata so it travels with the auth user
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name, role: 'customer' },
      // If you use email confirmation, send them back here after clicking the email link:
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/confirm`
    }
  })

  if (error) {
    redirect(`/auth/register?error=${encodeURIComponent(error.message)}`)
  }

  // If confirmations are OFF, a session exists now. Try to mirror full_name into public.profiles.
  const { data: { user } } = await supabase.auth.getUser()
  if (user && name) {
    await supabase.from('profiles').update({ full_name: name }).eq('id', user.id)
    // Ignore errors—RLS will block this when confirmations are ON.
  }

  // Decide where to go next:
  // - If confirmations ON: show a “Check email” screen
  // - If confirmations OFF: take them to the account page
  if (!user) redirect('/check-email')
  redirect('/account')
}
