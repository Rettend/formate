import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function minify(strings: TemplateStringsArray, ...values: any[]): string {
  let result = strings[0]
  for (let i = 0; i < values.length; i++)
    result += values[i] + strings[i + 1]

  return result
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .trim()
}
