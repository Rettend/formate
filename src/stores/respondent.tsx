import type { ParentProps } from 'solid-js'
import type { SetStoreFunction, Store } from 'solid-js/store'
import { makePersisted, storageSync } from '@solid-primitives/storage'
import { createContext, useContext } from 'solid-js'
import { createStore } from 'solid-js/store'

export interface RespondentLocalState {
  byForm: Record<string, {
    byUser: Record<string, {
      conversationId?: string
      backRemaining?: number | null
    }>
  }>
  draftsByConversation?: Record<string, Record<string, unknown>>
  byConversation?: Record<string, {
    backRemaining?: number | null
  }>
}

const LocalCtx = createContext<[Store<RespondentLocalState>, SetStoreFunction<RespondentLocalState>]>()

export function RespondentStoreProvider(props: ParentProps) {
  const isBrowser = typeof window !== 'undefined'
  const localStorage = isBrowser ? window.localStorage : undefined

  const [localStore, setLocalStore] = createStore<RespondentLocalState>({
    byForm: {},
    draftsByConversation: {},
    byConversation: {},
  })

  const [localState, setLocalState] = makePersisted([localStore, setLocalStore], {
    name: 'respondent',
    storage: localStorage,
    sync: isBrowser ? storageSync : undefined,
  })

  return (
    <LocalCtx.Provider value={[localState, setLocalState]}>
      {props.children}
    </LocalCtx.Provider>
  )
}

export function initProgress(set: SetStoreFunction<RespondentLocalState>, formId: string, userId: string) {
  set('draftsByConversation', prev => prev ?? ({}))
  set('byForm', formId, prev => prev ?? ({ byUser: {} }))
  set('byForm', formId, 'byUser', prev => prev ?? ({}))
  set('byForm', formId, 'byUser', userId, prev => prev ?? ({
    conversationId: undefined,
    backRemaining: null,
  }))
}

export function useRespondentLocalStore() {
  const ctx = useContext(LocalCtx)
  if (!ctx)
    throw new Error('useRespondentLocalStore must be used within RespondentStoreProvider')
  return ctx
}
