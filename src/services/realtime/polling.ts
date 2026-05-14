import {
  RealtimeEmitter,
  RealtimeEventMap,
  RealtimeEventName,
  RealtimeSendMessage,
  RealtimeTransport,
  Unsubscribe,
} from './transport'

/** Active-orders cadence used by the saga today (`ACTIVE_ORDERS_POLL_INTERVAL`). */
const ACTIVE_ORDERS_INTERVAL_MS = 5000

/**
 * Internal description of a polling feature: how often to tick and what
 * to do on each tick. Implementations are free to call the existing API
 * helpers from `src/API` — we do NOT re-implement request logic here.
 */
interface PollingFeature {
  name: string
  intervalMs: number
  /** Runs one fetch and emits the appropriate event(s). */
  tick: () => Promise<void> | void
}

/**
 * Polling implementation of `RealtimeTransport`.
 *
 * - Visibility-aware: pauses the timer while `document.hidden` is true,
 *   matching the behaviour of `useInterval` and `delayPausable`. This
 *   prevents battery drain and duplicate requests when the tab is
 *   backgrounded.
 * - Wake-aware: an immediate refresh fires when the tab becomes visible
 *   again or the browser regains network connectivity, so a freshly
 *   opened tab does not have to wait out the previous interval.
 * - Idempotent `connect()` / `disconnect()`.
 *
 * Phase 1 owns only the active-orders feature. Additional features will
 * be migrated in later phases (see follow-up list in the PR description).
 */
export class PollingTransport implements RealtimeTransport {
  private emitter = new RealtimeEmitter()
  private features: PollingFeature[] = []
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private connected = false
  private onVisibilityChange: (() => void) | null = null
  private onOnline: (() => void) | null = null

  constructor() {
    this.features.push({
      name: 'activeOrders',
      intervalMs: ACTIVE_ORDERS_INTERVAL_MS,
      tick: () => this.pollActiveOrders(),
    })
  }

  connect(): void {
    if (this.connected) return
    this.connected = true

    if (typeof document !== 'undefined') {
      this.onVisibilityChange = () => {
        if (document.hidden) {
          this.stopAllTimers()
        } else {
          this.startAllTimers({ immediate: true })
        }
      }
      document.addEventListener('visibilitychange', this.onVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      this.onOnline = () => {
        if (!this.isHidden()) this.startAllTimers({ immediate: true })
      }
      window.addEventListener('online', this.onOnline)
    }

    this.emitter.emit('open', undefined)

    if (!this.isHidden()) this.startAllTimers({ immediate: true })
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    this.stopAllTimers()
    if (typeof document !== 'undefined' && this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }
    if (typeof window !== 'undefined' && this.onOnline) {
      window.removeEventListener('online', this.onOnline)
    }
    this.onVisibilityChange = null
    this.onOnline = null
    this.emitter.emit('close', { source: 'polling' })
    // Listeners are useless once disconnected; clear them so a long-lived
    // app does not accumulate dead callbacks across mode swaps.
    this.emitter.clear()
  }

  subscribe<E extends RealtimeEventName>(
    event: E,
    callback: (payload: RealtimeEventMap[E]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, callback)
  }

  // Polling has no upstream channel; the outbound message is ignored
  // intentionally. Kept for interface parity with `WebSocketTransport`.
  send(_message: RealtimeSendMessage): void {
    // no-op
  }

  private isHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden
  }

  private startAllTimers(options: { immediate?: boolean } = {}): void {
    for (const feature of this.features) this.startTimer(feature, options)
  }

  private stopAllTimers(): void {
    for (const [name, id] of this.timers) {
      clearInterval(id)
      this.timers.delete(name)
    }
  }

  private startTimer(
    feature: PollingFeature,
    { immediate = false }: { immediate?: boolean } = {},
  ): void {
    if (this.timers.has(feature.name)) return
    const run = () => {
      if (this.isHidden()) return
      void this.runTick(feature)
    }
    if (immediate) run()
    const id = setInterval(run, feature.intervalMs)
    this.timers.set(feature.name, id)
  }

  private async runTick(feature: PollingFeature): Promise<void> {
    try {
      await feature.tick()
    } catch (error) {
      this.emitter.emit('error', {
        source: 'polling',
        message: `[${feature.name}] tick failed`,
        cause: error,
      })
    }
  }

  /**
   * Active-orders feature. The current saga (`state/orders/sagas.ts`)
   * subscribes to `orderUpdated` with `scope === 'active'` and then
   * dispatches its existing `GET_ACTIVE_ORDERS_REQUEST` — the saga is
   * still the place where the response is post-processed (cancel of
   * expired orders, `setSelectedOrder`, `afterOrdersChangeSaga`).
   *
   * The transport deliberately emits a refresh signal rather than
   * fetching here:
   *  - the API helper (`API.getOrders`) stays the single source of
   *    request logic — we are NOT duplicating it,
   *  - the saga remains the single source of response post-processing,
   *  - and the transport owns the cadence (the timer), so when the WS
   *    backend ships the timer is the only thing that goes away.
   */
  private pollActiveOrders(): void {
    this.emitter.emit('orderUpdated', { scope: 'active' })
  }
}
