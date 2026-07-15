import { NextResponse, type NextRequest } from 'next/server'

// Geeft het publieke IP terug zoals de server dat ziet. Handig om te
// bepalen wat je in TRUSTED_IPS moet zetten.
export function GET(request: NextRequest) {
  const xff = request.headers.get('x-forwarded-for')
  const ip =
    (xff ? xff.split(',')[0].trim() : null) ||
    request.headers.get('x-real-ip') ||
    null

  const trusted = (process.env.TRUSTED_IPS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  return NextResponse.json({
    ip,
    isTrusted: ip !== null && trusted.includes(ip),
    trustedCount: trusted.length,
  })
}
