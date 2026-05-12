const isDev = process.env.NODE_ENV !== 'production'

function prefix(context?: string): string {
  return context ? `[${context}] ` : ''
}

/**
 * Browser geolocation rejects with codes 2/3 when the OS has no fix
 * (indoors, VPN, simulator); those are not app bugs and were noisy as
 * `console.error`. Permission denied (1) stays visible — user choice.
 */
export function logGeolocationError(
  err: GeolocationPositionError,
  context?: string,
): void {
  const p = prefix(context)
  switch (err.code) {
    case 1:
      console.warn(`${p}User denied geolocation.`)
      return
    case 2:
    case 3:
      if (isDev) console.debug(`${p}${err.message}`)
      return
    default:
      console.warn(`${p}${err.message}`)
  }
}
