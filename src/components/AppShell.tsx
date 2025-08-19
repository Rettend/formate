import type { ParentProps } from 'solid-js'
import { createMemo, Show } from 'solid-js'
import { AppHeader } from '~/components/AppHeader'
import { AppMobileNav, AppSidebar } from '~/components/AppNav'

export function AppShell(props: ParentProps & { showSidebar?: boolean }) {
  const showSidebar = createMemo(() => props.showSidebar ?? true)

  return (
    <main class="min-h-screen flex flex-col">
      <AppHeader />
      <div class="mx-auto max-w-6xl w-full flex-1 px-4 py-6 pb-20 sm:pb-6">
        <div class="flex gap-4">
          <Show when={showSidebar()}>
            <AppSidebar />
          </Show>
          <div class="min-w-0 flex-1">{props.children}</div>
        </div>
      </div>
      <Show when={showSidebar()}>
        <AppMobileNav />
      </Show>
    </main>
  )
}
