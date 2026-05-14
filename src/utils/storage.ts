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
  // Timestamp (ms since epoch) of the last `setRedirectTarget`. Lets the
  // OAuth callback handler distinguish a fresh, intentional click from
  // stale data left over by a previous (incomplete) session — see the
  // Google-login fix in `state/user/sagas.ts` and `Routes.tsx`.
  redirectAt: 'state.auth.redirectAt',
} as const

/**
 * Treat the stored redirect target as "fresh" for this many ms after
 * `setRedirectTarget`. Ten minutes safely covers a typical Google OAuth
 * round-trip (including 2FA / account picker) and is short enough that
 * forgotten data from a previous session never wins over a new click.
 */
const REDIRECT_FRESHNESS_MS = 10 * 60 * 1000

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

const getRedirectAt = (): number | null => {
  const raw = safeGet(STORAGE_KEYS.redirectAt)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * `true` only when the stored redirect target was set within
 * `REDIRECT_FRESHNESS_MS`. Used to ignore stale leftovers from a
 * previous session and to prevent the OAuth callback from overwriting
 * a freshly clicked intent with whatever the backend echoes back.
 */
export const isRedirectFresh = (): boolean => {
  const at = getRedirectAt()
  if (at === null) return false
  return Date.now() - at < REDIRECT_FRESHNESS_MS
}

/**
 * Returns the stored redirect path only when it is fresh. Designed for
 * synchronous use in render paths (router catch-all) where a stale
 * leftover must NOT silently win over `user.u_role`.
 */
export const getFreshRedirectPath = (): string | null => {
  if (!isRedirectFresh()) return null
  return getRedirectPath()
}

export const setRedirectTarget = (module: string, path: string) => {
  safeSet(STORAGE_KEYS.redirectModule, module)
  safeSet(STORAGE_KEYS.redirectPath, path)
  safeSet(STORAGE_KEYS.redirectAt, String(Date.now()))
}

export const clearRedirectTarget = () => {
  safeRemove(STORAGE_KEYS.redirectModule)
  safeRemove(STORAGE_KEYS.redirectPath)
  safeRemove(STORAGE_KEYS.redirectAt)
}
