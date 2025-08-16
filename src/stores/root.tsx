import type { ParentProps } from 'solid-js'
import { RespondentStoreProvider } from './respondent'
import { UIStoreProvider } from './ui'

export function RootStoreProvider(props: ParentProps) {
  return (
    <RespondentStoreProvider>
      <UIStoreProvider>
        {props.children}
      </UIStoreProvider>
    </RespondentStoreProvider>
  )
}
