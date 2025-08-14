// @refresh reload
import { AuthProvider } from '@rttnd/gau/client/solid'
import { Router } from '@solidjs/router'
import { FileRoutes } from '@solidjs/start/router'
import { Suspense } from 'solid-js'
import { RootProviders } from '~/stores/root'
import { clientEnv } from './env/client'
import '@fontsource-variable/league-spartan'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

export default function App() {
  return (
    <AuthProvider baseUrl={clientEnv.VITE_API_URL}>
      <Router
        root={props => (
          <>
            <RootProviders>
              <Suspense>{props.children}</Suspense>
            </RootProviders>
          </>
        )}
      >
        <FileRoutes />
      </Router>
    </AuthProvider>
  )
}
