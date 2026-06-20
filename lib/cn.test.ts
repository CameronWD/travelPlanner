import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('merges tailwind classes, last one wins (tailwind-merge)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('filters out falsy values (clsx)', () => {
    const result = cn('text-sm', false && 'hidden', 'font-bold')
    expect(result).toContain('text-sm')
    expect(result).toContain('font-bold')
    expect(result).not.toContain('hidden')
  })

  it('handles undefined and null gracefully', () => {
    expect(cn('text-base', undefined, null as unknown as string)).toBe('text-base')
  })

  it('merges conflicting background colors', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
  })
})
