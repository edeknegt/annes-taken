'use client'

import { useState, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { verifyPin } from './actions'

const PIN_LENGTH = 4

export default function PinPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [pin, setPin] = useState('')
  const [showLoading, setShowLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useCallback(
    (fullPin: string) => {
      setError(null)
      setShowLoading(true)
      const formData = new FormData()
      formData.set('pin', fullPin)
      startTransition(async () => {
        const result = await verifyPin(formData)
        if (result?.error) {
          setShowLoading(false)
          setError(result.error)
          setPin('')
          // Refocus zodat de keyboard direct weer open is voor een nieuwe poging.
          requestAnimationFrame(() => inputRef.current?.focus())
          return
        }
        // Warm de SW-cache met /lijst voordat we navigeren: een hard fetch
        // hier zorgt dat de boodschappenpagina offline beschikbaar is, ook
        // als Anne client-side rondnavigeert en /lijst nooit hard opent.
        try {
          await fetch('/lijst', { credentials: 'include', cache: 'reload' })
        } catch {
          // negeer — als 'ie nu niet lukt, doet de SW het bij eerstvolgende visit
        }
        router.replace('/lijst')
        router.refresh()
      })
    },
    [router]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH)
      setPin(digits)
      if (error) setError(null)
      if (digits.length === PIN_LENGTH) {
        submit(digits)
      }
    },
    [submit, error]
  )

  // Tap ergens op de pagina → input opnieuw focussen zodat de iOS-keyboard
  // weer opent als 'ie ooit dichtging.
  const refocus = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  if (showLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-mint-100 p-4">
        <div className="flex flex-col items-center">
          <div className="loading-avatar w-24 h-24 rounded-2xl border-2 border-mint-300 shadow-sm">
            <img
              src="/logo.png"
              alt=""
              className="w-full h-full object-cover rounded-2xl"
            />
          </div>
          <p className="mt-4 text-sm text-gray-400 font-medium">Laden...</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center bg-mint-100 px-6 pt-[12vh]"
      onClick={refocus}
    >
      {/* Verborgen input die de OS-keyboard activeert. autoFocus opent in PWA-
          modus direct het native dialer-keyboard. Op gewone Safari hoef je
          maximaal 1× op de pagina te tikken om het te activeren — de wrapper
          vangt die tap af en herfocust de input. */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={PIN_LENGTH}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={pin}
        onChange={handleChange}
        aria-label="Pincode"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '1px',
          height: '1px',
          opacity: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '16px',
        }}
      />

      <img
        src="/logo.png"
        alt="Anne&apos;s taken"
        className="w-28 h-28 rounded-2xl shadow-md ring-2 ring-mint-200 mb-6 object-cover"
      />

      <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-10">
        Anne&apos;s taken
      </h1>

      <div className="flex gap-4">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < pin.length
          return (
            <div
              key={i}
              className={`h-3.5 w-3.5 rounded-full transition-all duration-150 ${
                filled
                  ? 'bg-gray-900 scale-110'
                  : 'bg-transparent ring-1 ring-gray-300'
              }`}
            />
          )
        })}
      </div>

      <div className="h-6 mt-4 flex items-center">
        {error ? (
          <p className="text-[13px] text-red-600 font-medium">{error}</p>
        ) : pin.length === 0 ? (
          <p className="text-[13px] text-gray-500 animate-pulse">
            Tik om in te loggen
          </p>
        ) : null}
      </div>
    </div>
  )
}
