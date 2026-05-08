import { channel } from 'redux-saga'
import { all, race, take, takeEvery, put, delay } from 'redux-saga/effects'
import { TAction } from '../../types'
import { getCurrentPosition } from '../../tools/utils'
import {
  select, call, whileWatching,
  getWakeChannel, isHidden,
} from '../../tools/sagaUtils'
import { sendPosition } from '../../API/location'
import { ActionTypes } from './constants'
import { geoposition as geopositionSelector } from './selectors'

/**
 * Maximum acceptable horizontal accuracy in metres. Browser geolocation
 * occasionally returns readings with `accuracy` of several kilometres
 * (Wi-Fi based fix in poor coverage); these snap the map to a
 * neighbouring city and are useless for taxi pick-up. Anything coarser
 * than this is treated as "no fresh position" and the previously
 * accepted reading is kept.
 */
const MAX_ACCURACY_M = 200

/**
 * Maximum realistic horizontal speed between two consecutive readings
 * (m/s). 70 m/s ≈ 252 km/h — comfortably above any car speed but cuts
 * off teleport-style glitches we have seen in field reports.
 */
const MAX_JUMP_MPS = 70

const haversineMeters = (a: GeolocationCoordinates, b: GeolocationCoordinates) => {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const isAcceptableReading = (
  next: GeolocationPosition,
  prev: GeolocationPosition | undefined,
): boolean => {
  if (next.coords.accuracy > MAX_ACCURACY_M) return false
  if (!prev) return true
  const dt = Math.max((next.timestamp - prev.timestamp) / 1000, 0.001)
  const distance = haversineMeters(prev.coords, next.coords)
  if (distance / dt > MAX_JUMP_MPS) return false
  return true
}

export function* saga() {
  yield all([
    call(geolocationSaga),
  ])
}

function* geolocationSaga() {
  let latestGet = 0
  let latestSent: GeolocationPosition | undefined
  let latestAccepted: GeolocationPosition | undefined
  const listeners = new Map<number, number>()
  let pollInterval = Infinity
  const intervalChangeChannel = yield* call(channel)
  const wakeChannel = getWakeChannel()

  yield all([
    call(function*() {
      while (true) {
        if (pollInterval === Infinity) {
          yield take(intervalChangeChannel)
          continue
        }

        // While the tab is hidden we don't poll at all (battery + privacy
        // + bandwidth). The geolocation provider also throttles or
        // refuses requests in some mobile browsers when the page is
        // backgrounded, which used to flood Sentry with `GET_FAIL`.
        if (isHidden()) {
          yield race([
            take(wakeChannel),
            take(intervalChangeChannel),
          ])
          // After waking up: if there is an active interval, refresh
          // immediately rather than waiting out the previous slot.
          if (pollInterval !== Infinity) {
            yield* getGeopositionSaga(latestAccepted)
            const accepted = yield* select(geopositionSelector)
            if (accepted) latestAccepted = accepted
            latestGet = Date.now()
          }
          continue
        }

        const [timePassed] = yield race([
          delay(Math.max(latestGet + pollInterval - Date.now(), 0), true),
          take(intervalChangeChannel),
          take(wakeChannel),
        ])
        if (!timePassed)
          continue

        yield* getGeopositionSaga(latestAccepted)
        const accepted = yield* select(geopositionSelector)
        if (accepted) latestAccepted = accepted
        latestGet = Date.now()
      }
    }),

    takeEvery(ActionTypes.WATCH, function*({ payload: { interval } }: TAction) {
      listeners.set(interval, (listeners.get(interval) ?? 0) + 1)
      if (interval < pollInterval) {
        pollInterval = interval
        yield put(intervalChangeChannel, {})
      }
    }),

    takeEvery(ActionTypes.UNWATCH, function*({
      payload: { interval },
    }: TAction) {
      const listenersWithInterval = listeners.get(interval)!
      if (listenersWithInterval > 1)
        listeners.set(interval, listenersWithInterval - 1)
      else {
        listeners.delete(interval)
        if (interval === pollInterval) {
          pollInterval = [...listeners.keys()].reduce(
            (min, interval) => interval < min ? interval : min,
            Infinity,
          )
          yield put(intervalChangeChannel, {})
        }
      }
    }),

    whileWatching(
      ActionTypes.ACTIVATE_SENDING,
      ActionTypes.DEACTIVATE_SENDING,

      function*() {
        latestSent = yield* sendPositionSaga(latestSent)
        yield take(ActionTypes.GET_SUCCESS)
      },
    ),
  ])
}

function* getGeopositionSaga(prev: GeolocationPosition | undefined) {
  try {
    const geoposition = yield* call(getCurrentPosition)
    if (!isAcceptableReading(geoposition, prev)) {
      // Bad reading: keep last accepted state, do not flip the UI to a
      // wildly wrong location. We still emit FAIL so any UI that wants
      // to show a "stale fix" badge can react.
      yield put({
        type: ActionTypes.GET_FAIL,
        payload: new Error('Geolocation reading rejected (accuracy or jump)'),
      })
      return
    }
    yield put({ type: ActionTypes.GET_SUCCESS, payload: geoposition })
  } catch (error) {
    yield put({ type: ActionTypes.GET_FAIL, payload: error })
  }
}

function* sendPositionSaga(latestSent?: GeolocationPosition) {
  const geoposition = yield* select(geopositionSelector)
  if (!geoposition || (
    geoposition.coords.latitude === latestSent?.coords.latitude &&
    geoposition.coords.longitude === latestSent?.coords.longitude
  ))
    return latestSent
  const response = yield* call(sendPosition, geoposition.coords)
  if (response.code !== '200')
    console.error(response)
  return geoposition
}
