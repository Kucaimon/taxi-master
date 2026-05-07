/**
 * Defensive formatters for user-facing strings.
 *
 * The taxi backend (and the geocoder) routinely returns partial or null
 * data: missing addresses, missing city translations, untranslated
 * languages, etc. The brief explicitly calls this out, so all UI
 * components should funnel through these helpers instead of poking at
 * `window.data` / nested address fields directly.
 */
import { IAddressPoint, ILanguage, IUser } from '../types/types'

const FALLBACK_DASH = '\u2014'

const trimOrUndefined = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

interface FormatAddressOptions {
  /** Prefer the short version when available. */
  short?: boolean
  /** Returned when neither `address` nor `shortAddress` are set. */
  fallback?: string
  /** When `true`, returns `lat, lng` as a fallback if address is missing. */
  withCoords?: boolean
}

/**
 * Stable address renderer for both passenger and driver UI.
 *
 * Returns the best-known string for the point, in this order:
 *  1. `shortAddress` when `short=true`
 *  2. `address`
 *  3. `shortAddress`
 *  4. coordinates (when `withCoords=true`)
 *  5. provided `fallback` or em-dash
 *
 * Never returns `undefined` so it can be used directly inside JSX.
 */
export const formatAddress = (
  point: IAddressPoint | null | undefined,
  options: FormatAddressOptions = {},
): string => {
  const fallback = options.fallback ?? FALLBACK_DASH
  if (!point) return fallback

  const short = trimOrUndefined(point.shortAddress)
  const full = trimOrUndefined(point.address)

  if (options.short && short) return short
  if (full) return full
  if (short) return short

  if (
    options.withCoords &&
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number'
  ) {
    return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
  }

  return fallback
}

/**
 * Picks a human-readable city label for a user, defensively walking the
 * `window.data.cities[u_city][lang]` map: any of those keys may be
 * missing in a stale or partial cache.
 *
 * Falls back through:
 *  - active language ISO,
 *  - default site language ISO,
 *  - first available translation entry for that city,
 *  - empty string (so the caller can decide whether to render a comma).
 */
export const formatCity = (
  user: IUser | null | undefined,
  language: ILanguage | null | undefined,
): string => {
  if (!user?.u_city) return ''
  const win = (typeof window !== 'undefined' ? window : undefined) as
    | (Window & { data?: any; default_lang?: string })
    | undefined
  const cityMap = win?.data?.cities?.[user.u_city]
  if (!cityMap || typeof cityMap !== 'object') return ''

  const activeIso = trimOrUndefined(language?.iso)
  if (activeIso) {
    const named = trimOrUndefined(cityMap[activeIso])
    if (named) return named
  }

  const defaultLangKey = win?.default_lang
  const defaultIso = defaultLangKey
    ? trimOrUndefined(win?.data?.langs?.[defaultLangKey]?.iso)
    : undefined
  if (defaultIso && defaultIso !== activeIso) {
    const named = trimOrUndefined(cityMap[defaultIso])
    if (named) return named
  }

  for (const key of Object.keys(cityMap)) {
    const value = trimOrUndefined(cityMap[key])
    if (value) return value
  }

  return ''
}

/** Tiny coords formatter used as a last-resort fallback in popups. */
export const formatCoords = (
  latitude: number | undefined | null,
  longitude: number | undefined | null,
  digits = 5,
): string => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return ''
  return `${latitude.toFixed(digits)}, ${longitude.toFixed(digits)}`
}
