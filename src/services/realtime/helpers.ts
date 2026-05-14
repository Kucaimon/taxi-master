/**
 * Convenience subscribers over the singleton `RealtimeTransport`.
 *
 * Consumer code should prefer these helpers over manually calling
 * `getRealtimeTransport().subscribe('orderUpdated', ...)` for three
 * reasons:
 *
 *  1. The event-name string disappears from the call site, so there is
 *     no place to typo it.
 *  2. The callback payload is typed end-to-end via `RealtimeEventMap`,
 *     so changes to the payload shape break consumers at compile time.
 *  3. Switching the transport (polling ↔ websocket) stays a single env
 *     flag — consumers never reach into the transport API.
 *
 * Each helper returns an `Unsubscribe` you must call to detach (e.g.
 * inside a React effect cleanup or a saga `eventChannel` teardown).
 */

import { getRealtimeTransport } from './factory'
import {
  DriverMovedPayload,
  OrderUpdatedPayload,
  StatusChangedPayload,
  TripStartedPayload,
  Unsubscribe,
} from './transport'

export const onOrderUpdated = (
  callback: (payload: OrderUpdatedPayload) => void,
): Unsubscribe => getRealtimeTransport().subscribe('orderUpdated', callback)

export const onDriverMoved = (
  callback: (payload: DriverMovedPayload) => void,
): Unsubscribe => getRealtimeTransport().subscribe('driverMoved', callback)

export const onTripStarted = (
  callback: (payload: TripStartedPayload) => void,
): Unsubscribe => getRealtimeTransport().subscribe('tripStarted', callback)

export const onStatusChanged = (
  callback: (payload: StatusChangedPayload) => void,
): Unsubscribe => getRealtimeTransport().subscribe('statusChanged', callback)
