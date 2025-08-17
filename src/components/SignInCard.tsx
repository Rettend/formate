import { Button } from '~/components/ui/button'
import { useAuth } from '~/lib/auth'

interface SignInCardProps {
  redirectTo?: string
}

export function SignInCard(props: SignInCardProps) {
  const auth = useAuth()

  const handle = (provider: 'github' | 'google') => {
    if (props.redirectTo)
      auth.signIn(provider, { redirectTo: props.redirectTo })
    else
      auth.signIn(provider)
  }

  return (
    <div class="border rounded-lg bg-card p-6 text-card-foreground shadow-sm space-y-6">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold tracking-tight">Welcome</h1>
        <p class="text-sm text-muted-foreground">Sign in to continue</p>
      </div>
      <div class="flex flex-col items-center gap-2">
        <Button
          variant="default"
          size="sm"
          class="w-full gap-3 text-sm"
          onClick={() => handle('github')}
        >
          <span class="i-ph:github-logo-bold size-5" />
          <span class="font-medium">Continue with GitHub</span>
        </Button>
        <Button
          variant="default"
          size="sm"
          class="w-full gap-3 text-sm"
          onClick={() => handle('google')}
        >
          <span class="i-ph:google-logo-bold size-5" />
          <span class="font-medium">Continue with Google</span>
        </Button>
      </div>
      <p class="text-center text-xs text-muted-foreground leading-relaxed">
        By continuing you agree to our Terms &amp; Privacy Policy.
      </p>
    </div>
  )
}
