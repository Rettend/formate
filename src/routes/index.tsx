import { A } from '@solidjs/router'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { AppHeader } from '~/components/AppHeader'
import { SignInCard } from '~/components/SignInCard'
import { Button } from '~/components/ui/button'
import { useAuth } from '~/lib/auth'

export default function Home() {
  const auth = useAuth()
  let howItWorksContainerEl: HTMLDivElement | undefined
  let firstStepRowEl: HTMLDivElement | undefined
  let lastStepRowEl: HTMLDivElement | undefined
  const [verticalLineInset, setVerticalLineInset] = createSignal<{ top: number, bottom: number }>({ top: 0, bottom: 0 })

  onMount(() => {
    const updateVerticalLineInset = () => {
      if (!howItWorksContainerEl || !firstStepRowEl || !lastStepRowEl)
        return
      const containerRect = howItWorksContainerEl.getBoundingClientRect()
      const firstRect = firstStepRowEl.getBoundingClientRect()
      const lastRect = lastStepRowEl.getBoundingClientRect()
      const firstMid = (firstRect.top - containerRect.top) + (firstRect.height / 2)
      const lastMid = (lastRect.top - containerRect.top) + (lastRect.height / 2)
      const top = Math.max(0, Math.round(firstMid))
      const bottom = Math.max(0, Math.round(containerRect.height - lastMid))
      setVerticalLineInset({ top, bottom })
    }

    updateVerticalLineInset()
    const resizeObserver = new ResizeObserver(() => updateVerticalLineInset())
    if (howItWorksContainerEl)
      resizeObserver.observe(howItWorksContainerEl)
    window.addEventListener('resize', updateVerticalLineInset)

    onCleanup(() => {
      window.removeEventListener('resize', updateVerticalLineInset)
      resizeObserver.disconnect()
    })
  })

  return (
    <main class="min-h-screen flex flex-col">
      <AppHeader />
      {/* Hero */}
      <section class="relative px-4">
        <div class="mx-auto max-w-6xl w-full py-14 sm:py-20">
          <div class="grid items-center gap-8 lg:grid-cols-12">
            {/* Copy */}
            <div class="lg:col-span-6 xl:col-span-7 space-y-5">
              <div class="inline-flex items-center gap-2 rounded-full bg-muted/40 px-3 py-1 text-sm text-muted-foreground">
                <span class="i-ph:github-logo-duotone text-base" />
                <span>Open source on <A href="https://github.com/Rettend/formate" class="font-medium underline" target="_blank">GitHub</A></span>
              </div>
              <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
                Build interview-style surveys that adapt in real-time
              </h1>
              <p class="max-w-prose text-sm text-muted-foreground sm:text-base">
                The idea behind Formate is simple: an LLM creates the next question while the form is being filled out.
              </p>
            </div>
            <div class="lg:col-span-6 xl:col-span-5">
              <Show
                when={!auth.session().user}
                fallback={(
                  <div class="flex items-center gap-3">
                    <A href="/dashboard" class="inline-flex">
                      <Button class="bg-primary-gradient">
                        <span>Go to dashboard</span>
                        <span class="i-ph:arrow-right-bold ml-2" />
                      </Button>
                    </A>
                    <A href="/forms" class="hidden sm:inline-flex">
                      <Button variant="ghost">View your forms</Button>
                    </A>
                  </div>
                )}
              >
                <div class="mx-auto max-w-md">
                  <SignInCard redirectTo="/dashboard" />
                </div>
              </Show>
            </div>
          </div>
        </div>
      </section>

      {/* Features (Mosaic layout) */}
      <section class="px-4 py-10 sm:py-14">
        <div class="mx-auto max-w-6xl">
          <div class="mb-6 flex items-end justify-between">
            <h2 class="text-lg font-semibold tracking-tight sm:text-xl">Why Formate</h2>
          </div>
          {/* Responsive mosaic grid with varied spans/styles */}
          <div class="grid auto-rows-[1fr] gap-4 lg:grid-cols-6 sm:grid-cols-2">
            <div class="lg:col-span-3 sm:col-span-2">
              <Feature
                icon="i-ph:brain-duotone"
                title="LLM-driven follow-ups"
                desc="Ask the right next question based on each answer, instead of pre-made questions."
                variant="accent"
              />
            </div>
            <div class="lg:col-span-3 sm:col-span-1">
              <Feature
                icon="i-ph:chart-line-up-duotone"
                title="Built-in analytics"
                desc="Track completions, analyze responses, and create reports with LLMs."
                variant="glow"
              />
            </div>
            <div class="lg:col-span-2 sm:col-span-1">
              <Feature
                icon="i-ph:cpu-duotone"
                title="LLM controls"
                desc="You can control the LLM's behavior, and parameters like temperature and reasoning effort."
                variant="outline"
              />
            </div>
            <div class="lg:col-span-2 sm:col-span-2">
              <Feature
                icon="i-ph:link-simple-duotone"
                title="Invites & access"
                desc="Generate single-use invite links, or let anyone fill out your form by signing in."
                variant="glow"
              />
            </div>
            <div class="lg:col-span-2 sm:col-span-2">
              <Feature
                icon="i-ph:lock-duotone"
                title="Privacy first"
                desc="API keys are encrypted, not shared with respondents, and respondent data is scoped to your forms."
                variant="outline"
              />
            </div>
            <div class="lg:col-span-6 sm:col-span-2">
              <Feature
                icon="i-ph:circles-three-plus-duotone"
                title="Bring your LLM"
                desc="Use the Formate provider or bring your own LLM API keys from OpenAI/Google/Anthropic and more."
                variant="accent-alt"
              />
            </div>
          </div>
        </div>
      </section>

      {/* How it works (Vertical zig-zag with 90° connectors) */}
      <section class="px-4 pb-16 sm:pb-20">
        <div class="mx-auto max-w-6xl">
          <h2 class="text-lg font-semibold tracking-tight sm:text-xl">How it works</h2>
          <div class="relative mt-6" ref={howItWorksContainerEl}>
            {/* Center timeline */}
            <div
              class="pointer-events-none absolute left-1/2 hidden w-px bg-border sm:block -translate-x-1/2"
              style={{ top: `${verticalLineInset().top}px`, bottom: `${verticalLineInset().bottom}px` }}
            />

            <div class="grid gap-y-10 sm:gap-y-4">
              {/* Step 1 (left) */}
              <div class="relative grid items-center sm:grid-cols-2" ref={firstStepRowEl}>
                <div class="sm:pr-10">
                  <Step n={1} title="Set your goal" desc="Describe your form's goal in an initial prompt." />
                </div>
                <div />
                {/* Connector to center */}
                <div class="absolute right-1/2 top-1/2 z-10 hidden h-px w-8 bg-border sm:block" />
              </div>

              {/* Step 2 (right) */}
              <div class="relative grid items-center sm:grid-cols-2">
                <div class="hidden sm:block" />
                <div class="sm:pl-10">
                  <Step n={2} title="Configure form" desc="Pick models, provider keys, and stopping criteria." />
                </div>
                {/* Connector to center */}
                <div class="absolute left-1/2 top-1/2 z-10 hidden h-px w-8 bg-border sm:block" />
              </div>

              {/* Step 3 (left) */}
              <div class="relative grid items-center sm:grid-cols-2">
                <div class="sm:pr-10">
                  <Step n={3} title="Share with people" desc="Publish via public slug or generate invite links." />
                </div>
                <div />
                {/* Connector to center */}
                <div class="absolute right-1/2 top-1/2 z-10 hidden h-px w-8 bg-border sm:block" />
              </div>

              {/* Step 4 (right) */}
              <div class="relative grid items-center sm:grid-cols-2" ref={lastStepRowEl}>
                <div class="hidden sm:block" />
                <div class="sm:pl-10">
                  <Step n={4} title="Learn & iterate" desc="Analyze responses, adjust questions, and improve your form's prompt." />
                </div>
                {/* Connector to center */}
                <div class="absolute left-1/2 top-1/2 z-10 hidden h-px w-8 bg-border sm:block" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function Feature(props: {
  icon: string
  title: string
  desc: string
  variant?: 'accent' | 'accent-alt' | 'glow' | 'outline'
  span?: 'tall' | 'wide'
}) {
  const variantClasses = () => {
    switch (props.variant) {
      case 'accent':
        return 'bg-primary-gradient text-primary-foreground shadow-md'
      case 'accent-alt':
        return 'bg-gradient-to-r from-primary/15 via-primary/5 to-transparent dark:from-primary/25 dark:via-primary/10 text-card-foreground'
      case 'glow':
        return 'bg-card/80 backdrop-blur shadow-[0_0_0_1px_hsl(var(--ring)/0.06)] hover:shadow-[0_0_0_1px_hsl(var(--ring)/0.12),0_30px_60px_-20px_hsl(var(--primary)/0.25)]'
      case 'outline':
      default:
        return 'bg-card border-muted/60'
    }
  }
  const spanClasses = () => {
    switch (props.span) {
      case 'tall':
        return 'min-h-[220px] sm:min-h-[260px] lg:min-h-[320px]'
      case 'wide':
        return 'lg:col-span-2'
      default:
        return ''
    }
  }

  return (
    <div
      class={`relative h-full overflow-hidden border rounded-xl p-5 transition will-change-transform sm:p-6 hover:-translate-y-0.5 ${variantClasses()}  ${spanClasses()}`}
    >
      <div class="pointer-events-none absolute hidden size-[220px] rounded-full bg-primary/15 opacity-70 blur-3xl -right-16 -top-16 sm:block" />
      <div class="pointer-events-none absolute hidden size-[240px] rounded-full bg-primary/10 opacity-60 blur-3xl -bottom-24 -left-24 dark:sm:block" />
      <div class="relative flex items-center gap-3">
        <span class={`${props.icon} text-xl sm:text-2xl ${props.variant === 'accent' ? 'text-primary-foreground' : 'text-primary'}`} />
        <div class="text-base font-semibold leading-tight">{props.title}</div>
      </div>
      <p class={`relative mt-2 text-sm ${props.variant === 'accent' ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>{props.desc}</p>
    </div>
  )
}

function Step(props: { n: number, title: string, desc: string }) {
  return (
    <div class="relative border rounded-xl bg-card/80 p-4 text-card-foreground shadow-sm transition hover:shadow-md">
      <div class="flex items-center gap-3">
        <div class="size-8 flex items-center justify-center rounded-full bg-primary/10 text-sm text-primary font-semibold leading-none">
          <p class="h-2.5">{props.n}</p>
        </div>
        <div class="text-sm font-medium leading-tight sm:text-base">{props.title}</div>
      </div>
      <p class="ml-10 mt-1.5 text-sm text-muted-foreground">{props.desc}</p>
    </div>
  )
}
