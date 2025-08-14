import type { ParentProps } from 'solid-js'
import { UIStoreProvider } from './ui'

export function RootProviders(props: ParentProps) {
  return (
    <UIStoreProvider>
      {props.children}
    </UIStoreProvider>
  )
}
