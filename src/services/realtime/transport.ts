/**
 * # RealtimeTransport — client-side realtime data abstraction
 *
 * Phase 1 (this commit): polling stays the default, WebSocket is stubbed.
 * The transport is a single, swappable layer so consumer code never needs
 * to know whether updates come from `setInterval` + axios or from a long-
 * lived WS connection. To migrate later phases to WS, only the transport
 * implementation has to change.
 *
 * ## Client contract (verbatim from the architecture brief)
 *
 *     interface RealtimeTransport {
 *       connect(): void
 *       disconnect(): void
 *       subscribe(event: string, cb: Function): void
 *       send(data: any): void
 *     }
 *
 * The interface below honours that contract, with two ergonomic upgrades
 * that are pure type-level wins (no behavioural change):
 *
 *  1. `subscribe(...)` returns an `Unsubscribe` function instead of
 *     `void`. Calling it tears the listener down — much cleaner than the
 *     "pass the same callback back to `off`" pattern. Code that does not
 *     need to unsubscribe can simply discard the return value.
 *  2. `subscribe` and `send` are generic over the event map, so consumers
 *     get autocomplete and compile-time safety on event names and
 *     payloads.
 *
 * ## How to migrate a feature off direct polling
 *
 *  1. Identify the existing polling source (e.g. a `useInterval` in a
 *     component, or a `delayPausable` loop in a saga). Pick a high-level
 *     event name from `RealtimeEventMap` below, or add a new one if your
 *     feature does not fit.
 *  2. In the polling implementation (`./polling.ts`), register a feature
 *     poller that calls the existing API helper and emits the event on
 *     success / `error` on failure. Do NOT duplicate the request logic —
 *     re-use the helpers from `src/API`.
 *  3. In the consumer, replace the timer with:
 *
 *         const transport = getRealtimeTransport()
 *         const off = transport.subscribe('orderUpdated', payload => {...})
 *         return () => off()
 *
 *     Inside a saga, wrap the subscription with `eventChannel` and `take`
 *     from it (see `src/state/orders/sagas.ts` for the active-orders
 *     example).
 *  4. Remove the original polling loop in the same change set so the
 *     transport becomes the SINGLE source of truth for the feature.
 *
 * The driver-side polling (driver location, `READY` order list) is owned
 * by another colleague and is intentionally NOT migrated in this phase.
 */

/** Cleanup handle returned by `subscribe`. Calling it removes the listener. */
export type Unsubscribe = () => void

/**
 * Logical scope of an `orderUpdated` event. Mirrors the three poll
 * targets in `state/orders/sagas.ts` plus a per-id case.
 */
export type OrderUpdateScope = 'active' | 'ready' | 'history' | 'single'

/** Payload for `orderUpdated`. */
export interface OrderUpdatedPayload {
  scope: OrderUpdateScope
  /** Present when `scope === 'single'`. The id of the updated order. */
  orderId?: string
}

/** Payload for `driverMoved`. Coordinates are WGS-84 degrees. */
export interface DriverMovedPayload {
  driverId: string
  latitude: number
  longitude: number
  /** Optional client-side timestamp (ms since epoch). */
  at?: number
}

/** Payload for `tripStarted`. */
export interface TripStartedPayload {
  orderId: string
}

/**
 * Payload for `statusChanged` — used for booking state transitions
 * (`EBookingStates`) or driver state transitions (`EBookingDriverState`).
 */
export interface StatusChangedPayload {
  orderId: string
  /** Numeric enum value. Kept as `number` to avoid a cyclic import. */
  status: number
  /** `'booking'` for `b_state`, `'driver'` for `c_state`. */
  kind: 'booking' | 'driver'
}

/** Payload for the `error` event emitted on transport failure. */
export interface RealtimeErrorPayload {
  source: 'polling' | 'websocket'
  /** Best-effort error description; never user-facing. */
  message: string
  cause?: unknown
}

/** Payload for the `close` event. */
export interface RealtimeClosePayload {
  source: 'polling' | 'websocket'
  reason?: string
}

/**
 * Event map shared by all transport implementations. Adding an event
 * here is the way to declare new realtime channels — the type system
 * then forces every implementation to either emit it or leave it
 * un-emitted (subscribing is always safe).
 */
export interface RealtimeEventMap {
  orderUpdated: OrderUpdatedPayload
  driverMoved: DriverMovedPayload
  tripStarted: TripStartedPayload
  statusChanged: StatusChangedPayload
  /** Emitted once after a successful `connect()`. */
  open: undefined
  /** Emitted when the transport tears down. */
  close: RealtimeClosePayload
  /** Emitted on any transport-level failure (network down, WS error). */
  error: RealtimeErrorPayload
}

export type RealtimeEventName = keyof RealtimeEventMap

/**
 * Outbound message shape for `send`. The polling transport ignores it;
 * the WebSocket transport will eventually serialise this to JSON.
 */
export interface RealtimeSendMessage {
  type: string
  payload?: unknown
}

export interface RealtimeTransport {
  /** Start the transport. Must be idempotent. */
  connect(): void
  /** Stop the transport and release all internal resources. */
  disconnect(): void
  /**
   * Subscribe to an event. Returns a function that removes the listener.
   * Calling `subscribe` before `connect` is allowed; the listener will
   * start receiving events once the transport is connected.
   */
  subscribe<E extends RealtimeEventName>(
    event: E,
    callback: (payload: RealtimeEventMap[E]) => void,
  ): Unsubscribe
  /** Best-effort outbound message. Polling transport is a no-op. */
  send(message: RealtimeSendMessage): void
}

/**
 * Modes accepted by `transportFactory`. `'auto'` tries WS first and
 * falls back to polling — useful once the WS backend exists. Today it
 * resolves to polling because the WS endpoint is not wired yet.
 */
export type RealtimeMode = 'polling' | 'websocket' | 'auto'

/**
 * Minimal pub/sub used by both transport implementations. Kept here so
 * the two files do not need an extra shared utility module.
 *
 * `unknown`-typed payloads are intentional: the public surface is fully
 * typed via `RealtimeEventMap`, but the emitter itself stores listeners
 * in a single map keyed by event name.
 */
export class RealtimeEmitter {
  private listeners = new Map<RealtimeEventName, Set<(payload: unknown) => void>>()

  on<E extends RealtimeEventName>(
    event: E,
    callback: (payload: RealtimeEventMap[E]) => void,
  ): Unsubscribe {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(callback as (payload: unknown) => void)
    return () => {
      const current = this.listeners.get(event)
      if (!current) return
      current.delete(callback as (payload: unknown) => void)
      if (current.size === 0) this.listeners.delete(event)
    }
  }

  emit<E extends RealtimeEventName>(
    event: E,
    payload: RealtimeEventMap[E],
  ): void {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return
    for (const cb of [...set]) {
      try {
        cb(payload)
      } catch (error) {
        console.error('[realtime] listener for', event, 'threw', error)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
