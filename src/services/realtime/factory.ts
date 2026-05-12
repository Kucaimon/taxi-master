import { PollingTransport } from './polling'
import {
  RealtimeEventMap,
  RealtimeEventName,
  RealtimeMode,
  RealtimeSendMessage,
  RealtimeTransport,
  Unsubscribe,
} from './transport'
import { WebSocketTransport } from './websocket'

/**
 * How long to wait for a WS `open` event in `'auto'` mode before
 * giving up and switching to polling. Kept short because today the
 * stub emits `error` on the next microtask, so the timeout is a
 * defensive upper bound rather than the actual wait time.
 */
const AUTO_FALLBACK_TIMEOUT_MS = 5000

/**
 * Resolve the requested mode from a value, the `REACT_APP_REALTIME_MODE`
 * env var, or the default. Validation keeps the rest of the module from
 * having to guard against typos in `.env`.
 */
const resolveMode = (mode?: RealtimeMode): RealtimeMode => {
  if (mode) return mode
  const fromEnv = process.env.REACT_APP_REALTIME_MODE
  if (fromEnv === 'polling' || fromEnv === 'websocket' || fromEnv === 'auto')
    return fromEnv
  return 'auto'
}

/**
 * `RealtimeTransport` that prefers the primary implementation and
 * transparently falls back to the secondary on `error` / `close` /
 * timeout-without-`open`. Used by `'auto'` mode (WS → polling).
 *
 * Subscribers are kept in this wrapper so they survive the swap. Each
 * subscription is mirrored on whichever transport is active at the
 * moment of subscribing, and re-attached on fallback so listener
 * registration is order-independent.
 */
class FallbackTransport implements RealtimeTransport {
  private primary: RealtimeTransport
  private secondary: RealtimeTransport
  private active: RealtimeTransport
  private subs: Array<{
    event: RealtimeEventName
    callback: (payload: unknown) => void
    detach: Unsubscribe
  }> = []
  private hasOpened = false
  private fallenBack = false
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null

  constructor(primary: RealtimeTransport, secondary: RealtimeTransport) {
    this.primary = primary
    this.secondary = secondary
    this.active = primary
  }

  connect(): void {
    // Listen for the primary's own lifecycle to decide whether to fall
    // back. These listeners are NOT exposed to consumers — they are
    // internal to the wrapper.
    this.primary.subscribe('open', () => {
      this.hasOpened = true
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer)
        this.fallbackTimer = null
      }
    })
    const onPrimaryFailure = () => this.fallback()
    this.primary.subscribe('error', onPrimaryFailure)
    this.primary.subscribe('close', () => {
      if (!this.hasOpened) this.fallback()
    })

    this.primary.connect()

    this.fallbackTimer = setTimeout(() => {
      if (!this.hasOpened) this.fallback()
    }, AUTO_FALLBACK_TIMEOUT_MS)
  }

  disconnect(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
    this.primary.disconnect()
    this.secondary.disconnect()
    for (const sub of this.subs) sub.detach()
    this.subs = []
  }

  subscribe<E extends RealtimeEventName>(
    event: E,
    callback: (payload: RealtimeEventMap[E]) => void,
  ): Unsubscribe {
    const sub = {
      event,
      callback: callback as (payload: unknown) => void,
      detach: this.active.subscribe(event, callback),
    }
    this.subs.push(sub)
    return () => {
      sub.detach()
      const i = this.subs.indexOf(sub)
      if (i !== -1) this.subs.splice(i, 1)
    }
  }

  send(message: RealtimeSendMessage): void {
    this.active.send(message)
  }

  private fallback(): void {
    if (this.fallenBack) return
    this.fallenBack = true
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
    try {
      this.primary.disconnect()
    } catch (error) {
      console.warn('[realtime] primary.disconnect threw on fallback', error)
    }
    for (const sub of this.subs) {
      sub.detach()
      // Forwarding a previously-typed callback through the generic
      // `subscribe` signature loses its per-event narrowing at this
      // seam, so we drop into an untyped variant. The original
      // callback was registered with the correct payload type and
      // we are passing it through verbatim, so this is safe.
      type LooseSubscribe = (
        event: string,
        cb: (payload: unknown) => void,
      ) => Unsubscribe
      sub.detach = (this.secondary.subscribe as unknown as LooseSubscribe)(
        sub.event,
        sub.callback,
      )
    }
    this.active = this.secondary
    this.secondary.connect()
  }
}

let _instance: RealtimeTransport | null = null
let _instanceMode: RealtimeMode | null = null

/**
 * Build (or return the cached) realtime transport instance.
 *
 * Singleton-per-process so subscribers across the app share the same
 * underlying connection / timers. Pass an explicit `mode` to bypass
 * the env var (mainly useful for tests).
 */
export const transportFactory = (mode?: RealtimeMode): RealtimeTransport => {
  const resolved = resolveMode(mode)
  if (_instance && _instanceMode === resolved) return _instance
  if (_instance) {
    _instance.disconnect()
    _instance = null
  }

  let transport: RealtimeTransport
  switch (resolved) {
    case 'polling':
      transport = new PollingTransport()
      break
    case 'websocket':
      transport = new WebSocketTransport()
      break
    case 'auto':
    default:
      transport = new FallbackTransport(
        new WebSocketTransport(),
        new PollingTransport(),
      )
      break
  }

  _instance = transport
  _instanceMode = resolved
  return transport
}

/**
 * Convenience accessor used by consumer code (sagas, hooks). Hides the
 * factory mechanics so callers do not have to import `RealtimeMode`.
 */
export const getRealtimeTransport = (): RealtimeTransport => transportFactory()

/** Exposed for tests; resets the singleton so the next call rebuilds it. */
export const _resetRealtimeTransportForTests = (): void => {
  if (_instance) _instance.disconnect()
  _instance = null
  _instanceMode = null
}
