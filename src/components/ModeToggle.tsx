import type { Mode } from '~/lib/constants'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

export function ModeToggle(props: { set: (mode: Mode) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger as={Button<'button'>} variant="ghost" size="sm" class="relative w-9 px-0">
        <span class="i-ph:sun-horizon-duotone size-6 rotate-0 scale-100 transition-all dark:scale-0 dark:-rotate-90" />
        <span class="i-ph:moon-stars-duotone absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span class="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => props.set('light')}>
          <span class="i-ph:sun-duotone mr-2 size-5" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.set('dark')}>
          <span class="i-ph:moon-duotone mr-2 size-5" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.set('system')}>
          <span class="i-ph:desktop-duotone mr-2 size-5" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
