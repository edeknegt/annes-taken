'use server'

import { cookies } from 'next/headers'

export async function verifyPin(formData: FormData) {
  const pin = formData.get('pin') as string
  const correctPin = process.env.APP_PIN

  if (!correctPin) {
    return { error: 'PIN is niet geconfigureerd. Neem contact op met de beheerder.' }
  }

  if (pin !== correctPin) {
    return { error: 'Onjuiste pincode' }
  }

  const cookieStore = await cookies()
  cookieStore.set('annes-taken-auth', 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 15, // 15 minuten (wordt verlengd bij elke paginalading)
    path: '/',
  })

  return { ok: true }
}
