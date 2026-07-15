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

    return () => {
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.body.removeAttribute('data-keyboard-open')
    }
  }, [])

  return null
}
