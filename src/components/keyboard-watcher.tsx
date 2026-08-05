'use client'

import { useEffect } from 'react'

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return type !== 'button' && type !== 'submit' && type !== 'reset' && type !== 'checkbox' && type !== 'radio'
  }
  return target.tagName === 'TEXTAREA' || target.isContentEditable
}

export function KeyboardWatcher() {
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target)) {
        document.body.setAttribute('data-keyboard-open', '')
      }
    }

    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (!isEditable(document.activeElement)) {
          document.body.removeAttribute('data-keyboard-open')
        }
      })
    }

    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)

    // Sommige mobiele browsers (vooral iOS Safari) passen `fixed`-elementen
    // niet correct aan wanneer het software-keyboard opent — ze blijven op
    // hun oorspronkelijke plek staan en raken zo achter het keyboard verstopt.
    // We meten het verschil tussen de volledige en de zichtbare viewport en
    // zetten dat als CSS-variabele, zodat bottom-fixed elementen (nav bar,
    // FAB's) zichzelf omhoog kunnen schuiven boven het keyboard.
    const visualViewport = window.visualViewport
    const updateKeyboardInset = () => {
      if (!visualViewport) return
      const inset = Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
    }

    visualViewport?.addEventListener('resize', updateKeyboardInset)
    visualViewport?.addEventListener('scroll', updateKeyboardInset)
    updateKeyboardInset()

    return () => {
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.body.removeAttribute('data-keyboard-open')
      visualViewport?.removeEventListener('resize', updateKeyboardInset)
      visualViewport?.removeEventListener('scroll', updateKeyboardInset)
      document.documentElement.style.removeProperty('--keyboard-inset')
    }
  }, [])

  return null
}
