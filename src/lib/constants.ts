export const modes = [
  'light',
  'dark',
  'system',
] as const

export type Mode = typeof modes[number]
