/**
 * Typed wrapper around `localStorage` for the small set of cross-cutting
 * keys (auth tokens, OAuth redirect target). The rest of the codebase
 * still uses `tools/localStorage.ts` for component-level cached state;
 * this module is intentionally narrow so the auth-critical keys have a
 * single source of truth and the strings (`state.user.tokens`, etc.) are
 * not duplicated across sagas/components.
 *
 * Why a separate file from `tools/localStorage.ts`:
 *  - `tools/localStorage.ts` is generic JSON storage used by hooks like
 *    `useCachedState`; key names are passed in as strings by call sites.
 *  - This module pins specific keys + value shapes for auth flows. We
 *    want refactors to `redirectModule`/`redirectPath` to ripple through
 *    typescript, not regex-replace.
 */
import { ITokens } from '../types/types'

const STORAGE_KEYS = {
  tokens: 'state.user.tokens',
  user: 'state.user.user',
  redirectModule: 'state.auth.redirectModule',
  redirectPath: 'state.auth.redirectPath',
} as const

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignored: private mode / quota errors
  }
}

const safeRemove = (key: string) => {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignored
  }
}

export const getStoredTokens = (): ITokens | null => {
  const raw = safeGet(STORAGE_KEYS.tokens)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ITokens>
    if (!parsed?.token || !parsed?.u_hash) return null
    return parsed as ITokens
  } catch {
    return null
  }
}

export const setStoredTokens = (tokens: ITokens | null | undefined) => {
  if (!tokens) return
  safeSet(STORAGE_KEYS.tokens, JSON.stringify(tokens))
}

export const clearStoredTokens = () => safeRemove(STORAGE_KEYS.tokens)

export const clearStoredUser = () => safeRemove(STORAGE_KEYS.user)

export const getRedirectModule = (): string | null =>
  safeGet(STORAGE_KEYS.redirectModule)

export const getRedirectPath = (): string | null =>
  safeGet(STORAGE_KEYS.redirectPath)

export const setRedirectTarget = (module: string, path: string) => {
  safeSet(STORAGE_KEYS.redirectModule, module)
  safeSet(STORAGE_KEYS.redirectPath, path)
}

export const clearRedirectTarget = () => {
  safeRemove(STORAGE_KEYS.redirectModule)
  safeRemove(STORAGE_KEYS.redirectPath)
}
