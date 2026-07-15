import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrepTime(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}u${m > 0 ? `${m}m` : ''}`
  }
  return `${minutes} min`
}

export function formatPrepTimeLong(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h} uur${m > 0 ? ` ${m} min` : ''}`
  }
  return `${minutes} min`
}
