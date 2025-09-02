// @refresh reload
import { AuthProvider } from '@rttnd/gau/client/solid'
import { Link, Meta, MetaProvider, Title } from '@solidjs/meta'
import { Router } from '@solidjs/router'
import { FileRoutes } from '@solidjs/start/router'
import { Suspense } from 'solid-js'
import { Toaster } from '~/components/ui/sonner'
import { RootStoreProvider } from '~/stores/root'
import '@fontsource-variable/league-spartan'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

export default function App() {
  return (
    <AuthProvider>
      <MetaProvider>
        {/* App-level defaults */}
        <Title>Formate — LLM-powered conversational form builder</Title>
        <Meta name="description" content="Formate lets you design and run conversational, interview-style surveys powered by LLMs." />
        <Meta name="theme-color" content="#0ea5e9" />
        <Meta name="mobile-web-app-capable" content="yes" />
        <Meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* OpenGraph defaults */}
        <Meta property="og:site_name" content="Formate" />
        <Meta property="og:type" content="website" />
        <Meta property="og:title" content="Formate — LLM-powered conversational form builder" />
        <Meta property="og:description" content="Design and run conversational, interview-style surveys powered by LLMs." />
        <Meta property="og:image" content="/thumbnail.svg" />

        {/* Twitter defaults */}
        <Meta name="twitter:card" content="summary_large_image" />
        <Meta name="twitter:title" content="Formate — LLM-powered conversational form builder" />
        <Meta name="twitter:description" content="Design and run conversational, interview-style surveys powered by LLMs." />
        <Meta name="twitter:image" content="/thumbnail.svg" />
        <Link rel="icon" type="image/svg+xml" href="/formate.svg" />

        <Router
          root={props => (
            <>
              <RootStoreProvider>
                <Suspense>{props.children}</Suspense>
                <Toaster position="bottom-right" richColors closeButton />
              </RootStoreProvider>
            </>
          )}
        >
          <FileRoutes />
        </Router>
      </MetaProvider>
    </AuthProvider>
  )
}
