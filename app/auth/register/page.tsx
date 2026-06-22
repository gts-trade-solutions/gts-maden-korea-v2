export const dynamic = 'force-dynamic'
import React from 'react'
import type { Metadata } from 'next'
import RegisterPage from './register'

// Override the auth segment's default "Sign in" title (set in
// app/auth/layout.tsx) — this is the registration page. Robots
// noindex is inherited from the auth layout.
export const metadata: Metadata = {
  title: 'Create account',
}

const page = () => {
  return (
    <RegisterPage/>
  )
}

export default page