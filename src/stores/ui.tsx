import type { ParentProps } from 'solid-js'
import type { SetStoreFunction, Store } from 'solid-js/store'
import type { Mode } from '~/lib/constants'
import { makePersisted, storageSync } from '@solid-primitives/storage'
import { createContext, createEffect, onCleanup, onMount, useContext } from 'solid-js'
import { createStore } from 'solid-js/store'
import { isServer } from 'solid-js/web'

interface StoreState {
  mode: Mode
  apiKeys: Record<string, string>
}

type StoreContextType = [Store<StoreState>, SetStoreFunction<StoreState>]

const StoreContext = createContext<StoreContextType>()

export function UIStoreProvider(props: ParentProps) {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  const storage = isBrowser ? window.localStorage : undefined

  const [baseState, setBaseState] = createStore<StoreState>({ mode: 'system', apiKeys: {} })
  const [state, setState] = makePersisted([baseState, setBaseState], {
    name: 'ui',
    storage,
    sync: isBrowser ? storageSync : undefined,
  })

  const apply = (mode: Mode) => {
    if (isServer)
      return
    const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    const dark = mode === 'dark' || (mode === 'system' && prefersDark)
    document.documentElement.classList.toggle('dark', dark)
  }

  createEffect(() => apply(state.mode))

  const handleChange = () => {
    if (state.mode === 'system')
      apply('system')
  }

  onMount(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', handleChange)
    onCleanup(() => media.removeEventListener('change', handleChange))
  })

  return (
    <StoreContext.Provider value={[state, setState]}>
      {props.children}
    </StoreContext.Provider>
  )
}

export function useUIStore() {
  const context = useContext(StoreContext)
  if (!context)
    throw new Error('useUIStore must be used within a UIStoreProvider')
  return context
}
