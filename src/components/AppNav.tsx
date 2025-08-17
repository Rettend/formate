import { A, useLocation } from '@solidjs/router'
import { createMemo, For } from 'solid-js'

interface NavItem {
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: 'i-ph:house-duotone' },
  { href: '/dashboard', label: 'Dashboard', icon: 'i-ph:squares-four-duotone' },
  { href: '/forms', label: 'Forms', icon: 'i-ph:files-duotone' },
  { href: '/analytics', label: 'Analytics', icon: 'i-ph:chart-line-up-duotone' },
  { href: '/invites', label: 'Invites', icon: 'i-ph:ticket-duotone' },
  { href: '/profile', label: 'Profile', icon: 'i-ph:user-circle-duotone' },
]

export function AppSidebar() {
  const location = useLocation()
  const pathname = createMemo(() => location.pathname)

  const isActive = (href: string) => {
    if (href === '/')
      return pathname() === '/'
    return pathname().startsWith(href)
  }

  return (
    <aside class="hidden sm:block lg:w-56 sm:w-14">
      <nav class="sticky top-21 flex flex-col gap-1">
        <For each={NAV_ITEMS}>
          {item => (
            <A
              href={item.href}
              class="group flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-all"
              classList={{
                'text-foreground font-medium': isActive(item.href),
                'text-muted-foreground hover:text-foreground': !isActive(item.href),
              }}
            >
              <span class={`${item.icon} size-5`} />
              <span class="hidden lg:inline">{item.label}</span>
            </A>
          )}
        </For>
      </nav>
    </aside>
  )
}

export function AppMobileNav() {
  const location = useLocation()
  const pathname = createMemo(() => location.pathname)

  const isActive = (href: string) => {
    if (href === '/')
      return pathname() === '/'
    return pathname().startsWith(href)
  }

  return (
    <nav class="fixed inset-x-0 bottom-0 z-40 border-t bg-background/80 backdrop-blur sm:hidden supports-[backdrop-filter]:bg-background/60">
      <ul class="grid grid-cols-6">
        <For each={NAV_ITEMS}>
          {item => (
            <li>
              <A
                href={item.href}
                class="flex flex-col items-center justify-center gap-1 py-2 text-[11px]"
                classList={{
                  'text-foreground': isActive(item.href),
                  'text-muted-foreground': !isActive(item.href),
                }}
              >
                <span class={`${item.icon} size-6`} />
              </A>
            </li>
          )}
        </For>
      </ul>
    </nav>
  )
}
