import {
  RealtimeEmitter,
  RealtimeEventMap,
  RealtimeEventName,
  RealtimeSendMessage,
  RealtimeTransport,
  Unsubscribe,
} from './transport'

/**
 * `WebSocketTransport` — STUB.
 *
 * TODO(backend): the realtime WS endpoint is not wired yet. Until the
 * server team provides:
 *
 *  - the WS URL (likely `wss://api.taxi-master/realtime` or similar);
 *  - the auth handshake (token via query string vs. first message);
 *  - the event-name + payload shape on the wire (mapping into
 *    `RealtimeEventMap`);
 *
 * this implementation deliberately fails fast on `connect()` so the
 * factory's `'auto'` mode falls back to `PollingTransport` and the app
 * keeps working exactly as today.
 *
 * The class is kept (rather than deleted) so the contract is visible
 * and so the migration to a real WS only touches THIS file — no
 * changes in consumer code or in the factory wiring will be required.
 */
export class WebSocketTransport implements RealtimeTransport {
  private emitter = new RealtimeEmitter()
  private socket: WebSocket | null = null
  private connected = false
  private url: string | null

  constructor(url?: string) {
    this.url = url ?? null
  }

  connect(): void {
    if (this.connected) return
    this.connected = true

    // No endpoint wired yet — emit `error` synchronously (via microtask
    // so consumers that subscribe right after `connect()` still receive
    // it) and stay disconnected. The factory uses this signal to fall
    // back to polling in `'auto'` mode.
    Promise.resolve().then(() => {
      this.emitter.emit('error', {
        source: 'websocket',
        message:
          'WebSocketTransport is not wired yet (backend endpoint pending).',
      })
      this.emitter.emit('close', {
        source: 'websocket',
        reason: 'stub',
      })
    })

    // The block below is intentionally guarded behind `this.url` so it
    // never runs today. It documents the eventual shape and will be
    // activated once the backend ships.
    if (this.url && typeof WebSocket !== 'undefined') {
      try {
        this.socket = new WebSocket(this.url)
        this.socket.addEventListener('open', () => {
          this.emitter.emit('open', undefined)
        })
        this.socket.addEventListener('close', event => {
          this.emitter.emit('close', {
            source: 'websocket',
            reason: event.reason || undefined,
          })
        })
        this.socket.addEventListener('error', () => {
          this.emitter.emit('error', {
            source: 'websocket',
            message: 'WebSocket connection error',
          })
        })
        // TODO(backend): translate inbound `message.data` into
        // `RealtimeEventMap` events once the wire format is known.
      } catch (error) {
        this.emitter.emit('error', {
          source: 'websocket',
          message: 'Failed to construct WebSocket',
          cause: error,
        })
      }
    }
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // ignore — already closed
      }
      this.socket = null
    }
  }

  subscribe<E extends RealtimeEventName>(
    event: E,
    callback: (payload: RealtimeEventMap[E]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, callback)
  }

  send(message: RealtimeSendMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    try {
      this.socket.send(JSON.stringify(message))
    } catch (error) {
      this.emitter.emit('error', {
        source: 'websocket',
        message: 'Failed to serialise outbound message',
        cause: error,
      })
    }
  }
}
