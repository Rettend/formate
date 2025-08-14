import type { ParentProps } from 'solid-js'
import { Navigate } from '@solidjs/router'
import { createMemo } from 'solid-js'
import { AppHeader } from '~/components/AppHeader'
import { AppMobileNav, AppSidebar } from '~/components/AppNav'
import { useAuth } from '~/lib/auth'

export function AppShell(props: ParentProps & { requireAuth?: boolean }) {
  const auth = useAuth()
  const isAuthed = createMemo(() => Boolean(auth.session().user))

  if (props.requireAuth !== false && !isAuthed())
    return <Navigate href="/" />

  return (
    <main class="min-h-screen flex flex-col">
      <AppHeader />
      <div class="mx-auto max-w-6xl w-full flex-1 px-4 py-6 pb-20 sm:pb-6">
        <div class="flex gap-6">
          <AppSidebar />
          <div class="min-w-0 flex-1">
            {props.children}
          </div>
        </div>
      </div>
      <AppMobileNav />
    </main>
  )
}
