'use client'

import { useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const currentDragY = useRef(0)
  const isDragging = useRef(false)
  const scrollYRef = useRef(0)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Lock body scroll (position: fixed trick for iOS)
  // Only depends on `open` — onClose is accessed via ref to avoid re-running on every render
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
      scrollYRef.current = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollYRef.current}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.overflow = 'hidden'
      document.body.dataset.sheetOpen = ''

      // Reset any stale inline transform from previous drag
      if (sheetRef.current) {
        sheetRef.current.style.transform = ''
      }
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      delete document.body.dataset.sheetOpen
      window.scrollTo(0, scrollYRef.current)
    }
  }, [open])

  // Prevent scroll-chaining on iOS: block scrolling on overlay,
  // and block content scroll at boundaries so it doesn't chain to parent
  useEffect(() => {
    if (!open) return
    const overlay = overlayRef.current
    if (!overlay) return

    let touchStartY = 0

    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY
    }

    const preventScroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      const contentEl = target.closest('[data-sheet-content]') as HTMLElement | null

      if (!contentEl) {
        e.preventDefault()
        return
      }

      // Determine scroll direction
      const touchY = e.touches[0].clientY
      const direction = touchStartY - touchY // positive = finger moving up (scroll down)

      const { scrollTop, scrollHeight, clientHeight } = contentEl
      const isAtTop = scrollTop <= 0
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1

      // Block at boundaries to prevent chaining to overlay/body
      if ((isAtTop && direction < 0) || (isAtBottom && direction > 0)) {
        e.preventDefault()
      }
    }

    overlay.addEventListener('touchstart', onTouchStart, { passive: true })
    overlay.addEventListener('touchmove', preventScroll, { passive: false })
    return () => {
      overlay.removeEventListener('touchstart', onTouchStart)
      overlay.removeEventListener('touchmove', preventScroll)
    }
  }, [open])

  // Swipe-to-dismiss: only from drag handle areas
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-drag-handle]')) return

    isDragging.current = true
    dragStartY.current = e.touches[0].clientY
    currentDragY.current = 0
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none'
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return

    const deltaY = e.touches[0].clientY - dragStartY.current
    if (deltaY < 0) {
      currentDragY.current = 0
      sheetRef.current.style.transform = 'translateY(0)'
      return
    }
    currentDragY.current = deltaY
    sheetRef.current.style.transform = `translateY(${deltaY}px)`
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current || !sheetRef.current) return

    isDragging.current = false
    sheetRef.current.style.transition = ''

    if (currentDragY.current > 100) {
      sheetRef.current.style.transform = ''
      onCloseRef.current()
    } else {
      sheetRef.current.style.transform = ''
    }
    currentDragY.current = 0
  }, [])

  return (
    <div
      ref={overlayRef}
      className={cn(
        'fixed inset-0 z-50 transition-colors duration-200',
        open ? 'bg-black/50 pointer-events-auto' : 'bg-transparent pointer-events-none'
      )}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl transition-transform duration-200 ease-out',
          'max-h-[85vh] flex flex-col',
          open ? 'translate-y-0' : 'translate-y-full',
          className
        )}
      >
        {/* Drag handle */}
        <div data-drag-handle className="flex justify-center pt-3 pb-1 cursor-grab">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        {title && (
          <div data-drag-handle className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
            <h2 id="bottom-sheet-title" className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div data-sheet-content className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-8 safe-area-bottom">
          {children}
        </div>
      </div>
    </div>
  )
}
