import { NextResponse, type NextRequest } from 'next/server'

// 4 dagen: lang genoeg om PWA-gebruik in winkels (offline, geen middleware-
// refresh) te overbruggen, kort genoeg om bij verlies van toestel niet
// eindeloos geldig te blijven.
const SESSION_MAX_AGE = 60 * 60 * 24 * 4

// Komma-gescheiden lijst van publieke IP's die PIN-vrij door mogen (bv. thuis-wifi).
const TRUSTED_IPS = (process.env.TRUSTED_IPS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const AUTH_COOKIE = {
  name: 'annes-taken-auth',
  value: 'authenticated',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_MAX_AGE,
  path: '/',
}

function getClientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') || null
}

function isTrustedIp(request: NextRequest): boolean {
  if (TRUSTED_IPS.length === 0) return false
  const ip = getClientIp(request)
  return ip !== null && TRUSTED_IPS.includes(ip)
}

export function middleware(request: NextRequest) {
  const pinCookie = request.cookies.get(AUTH_COOKIE.name)
  const path = request.nextUrl.pathname
  const isOnPinPage = path === '/pin'
  const isWhoamiApi = path === '/api/whoami'

  // whoami is bewust publiek zodat je je IP kunt opzoeken voor TRUSTED_IPS.
  if (isWhoamiApi) {
    return NextResponse.next()
  }

  // Geen cookie, niet op /pin: probeer trusted-IP auto-auth, anders naar /pin
  if (!pinCookie && !isOnPinPage) {
    if (isTrustedIp(request)) {
      const response = NextResponse.next()
      response.cookies.set(AUTH_COOKIE)
      return response
    }
    const url = request.nextUrl.clone()
    url.pathname = '/pin'
    return NextResponse.redirect(url)
  }

  // Geen cookie, wel op /pin, maar vertrouwd IP: meteen inloggen en naar home
  if (!pinCookie && isOnPinPage && isTrustedIp(request)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    const response = NextResponse.redirect(url)
    response.cookies.set(AUTH_COOKIE)
    return response
  }

  if (pinCookie && isOnPinPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Ververs de cookie bij elke request (rolling session)
  if (pinCookie && !isOnPinPage) {
    const response = NextResponse.next()
    response.cookies.set(AUTH_COOKIE)
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
