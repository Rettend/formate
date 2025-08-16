import type { ParentProps } from 'solid-js'
import type { SetStoreFunction, Store } from 'solid-js/store'
import { makePersisted, storageSync } from '@solid-primitives/storage'
import { createContext, useContext } from 'solid-js'
import { createStore } from 'solid-js/store'

export interface RespondentState {
  byForm: Record<string, {
    byUser: Record<string, {
      conversationId?: string
      currentIndex: number
      answers: Record<string, unknown>
      startedAt: string
      version: number
    }>
  }>
}

const DEFAULT_VERSION = 1

const Ctx = createContext<[Store<RespondentState>, SetStoreFunction<RespondentState>]>()

export function RespondentStoreProvider(props: ParentProps) {
  const isBrowser = typeof window !== 'undefined'
  const storage = isBrowser ? window.localStorage : undefined
  const [store, setStore] = createStore<RespondentState>({ byForm: {} })
  const [state, setState] = makePersisted([store, setStore], {
    name: 'respondent',
    storage,
    sync: isBrowser ? storageSync : undefined,
  })
  return (
    <Ctx.Provider value={[state, setState]}>
      {props.children}
    </Ctx.Provider>
  )
}

export function useRespondentStore() {
  const ctx = useContext(Ctx)
  if (!ctx)
    throw new Error('useRespondentStore must be used within RespondentStoreProvider')
  return ctx
}

export function initProgress(set: SetStoreFunction<RespondentState>, formId: string, userId: string) {
  set('byForm', formId, 'byUser', userId, prev => prev ?? ({
    conversationId: undefined,
    currentIndex: 0,
    answers: {},
    startedAt: new Date().toISOString(),
    version: DEFAULT_VERSION,
  }))
}
