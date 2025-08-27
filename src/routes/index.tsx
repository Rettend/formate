import { Show } from 'solid-js'
import { AppHeader } from '~/components/AppHeader'
import { SignInCard } from '~/components/SignInCard'
import { useAuth } from '~/lib/auth'

export default function Home() {
  const auth = useAuth()

  return (
    <main class="min-h-screen flex flex-col">
      <AppHeader />
      <section class="flex flex-1 items-center justify-center px-4 pb-12">
        <div class="mx-auto max-w-2xl w-full text-center space-y-4">
          <div class="flex items-center justify-center gap-2">
            <img src="/formate.svg" alt="Formate" class="h-8 w-8" />
            <h1 class="text-2xl font-semibold tracking-tight">Formate</h1>
          </div>
          <p class="text-sm text-muted-foreground">LLM-powered form builder for conversational, interview-style surveys.</p>
          <Show when={!auth.session().user}>
            <div class="mx-auto mt-6 max-w-sm">
              <SignInCard redirectTo="/dashboard" />
            </div>
          </Show>
        </div>
      </section>
    </main>
  )
}
