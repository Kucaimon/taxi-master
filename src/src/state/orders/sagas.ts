import { all, race, fork, take, put, delay } from 'redux-saga/effects'
import moment from 'moment'
import { TAction } from '../../types'
import { EStatuses, EUserRoles, EOrderTypes, IOrder } from '../../types/types'
import SITE_CONSTANTS from '../../siteConstants'
import {
  WatchState,
  select, call, putResolve,
  concurrency, whileWatching,
} from '../../tools/sagaUtils'
import { updateCompletedOrderDuration } from '../../tools/order'
import { geopositionToPoint } from '../../tools/maps'
import { getApiErrorMessage } from '../../tools/apiMessages'
import * as API from '../../API'
import { IRootState } from '..'
import { geoposition as geopositionSelector } from '../geolocation/selectors'
import { user as userSelector } from '../user/selectors'
import { getUserCars, drive as driveCar } from '../cars/actionCreators'
import { userPrimaryCar as userPrimaryCarSelector } from '../cars/selectors'
import { setSelectedOrder } from '../clientOrder/actionCreators'
import { setMessageModal } from '../modals/actionCreators'
import { getAreasBetweenPoints } from '../areas/actionCreators'
import { ActionTypes } from './constants'
import {
  moduleSelector,
  activeOrders, readyOrders, historyOrders,
} from './selectors'

const ACTIVE_ORDERS_POLL_INTERVAL = 5000
const DRIVER_ACTIVE_ORDERS_POLL_INTERVAL = 2000
const READY_ORDERS_POLL_INTERVAL = 3000
const HISTORY_ORDERS_POLL_INTERVAL = 10000
const ORDER_POLL_INTERVAL = 2000

export function* saga() {
  yield all([
    concurrency({
      action: [
        ActionTypes.GET_ACTIVE_ORDERS_REQUEST,
        ActionTypes.CREATE_SUCCESS,
      ],
      saga: getActiveOrdersSaga,
      parallelKey: 0,
      sequenceKey: {},
      leading: ({ type }) => type === ActionTypes.GET_ACTIVE_ORDERS_REQUEST ||
        undefined,
      latest: ({ type }) => type === ActionTypes.CREATE_SUCCESS || undefined,
    }, {
      action: ActionTypes.GET_READY_ORDERS_REQUEST,
      saga: getReadyOrdersSaga,
      parallelKey: 0,
      sequenceKey: {},
      leading: true,
    }, {
      action: ActionTypes.GET_HISTORY_ORDERS_REQUEST,
      saga: getHistoryOrdersSaga,
      parallelKey: 0,
      sequenceKey: {},
      leading: true,
    }, {
      action: [
        ActionTypes.GET_ORDER_REQUEST,
        ActionTypes.UPDATE_SUCCESS,
      ],
      saga: getOrderSaga,
      parallelKey: 1,
      sequenceKey: ({ payload }: TAction) => payload,
      leading: ({ type, payload }: TAction) =>
        type !== ActionTypes.UPDATE_SUCCESS ? payload : undefined,
      latest: ({ type, payload }: TAction) =>
        type === ActionTypes.UPDATE_SUCCESS ? payload : undefined,
    }),
    whileWatching(
      ActionTypes.WATCH_ACTIVE_ORDERS, ActionTypes.UNWATCH_ACTIVE_ORDERS,
      watchActiveOrdersSaga,
    ),
    whileWatching(
      ActionTypes.WATCH_READY_ORDERS, ActionTypes.UNWATCH_READY_ORDERS,
      watchReadyOrdersSaga,
    ),
    whileWatching(
      ActionTypes.WATCH_HISTORY_ORDERS, ActionTypes.UNWATCH_HISTORY_ORDERS,
      watchHistoryOrdersSaga,
    ),
    whileWatching(
      ActionTypes.WATCH_ORDER, ActionTypes.UNWATCH_ORDER,
      watchOrderSaga, ({ payload }: TAction) => payload,
    ),
  ])
}

function* watchActiveOrdersSaga() {
  const user = yield* select(userSelector)
  if (!user) {
    yield take()
    return
  }
  yield put({ type: ActionTypes.GET_ACTIVE_ORDERS_REQUEST })
  yield take([
    ActionTypes.GET_ACTIVE_ORDERS_SUCCESS,
    ActionTypes.GET_ACTIVE_ORDERS_FAIL,
  ])
  const interval = user.u_role === EUserRoles.Driver ?
    DRIVER_ACTIVE_ORDERS_POLL_INTERVAL :
    ACTIVE_ORDERS_POLL_INTERVAL
  yield delay(interval)
}

function* watchReadyOrdersSaga() {
  if (!(yield* select(userSelector))) {
    yield take()
    return
  }
  yield put({ type: ActionTypes.GET_READY_ORDERS_REQUEST })
  yield take([
    ActionTypes.GET_READY_ORDERS_SUCCESS,
    ActionTypes.GET_READY_ORDERS_FAIL,
  ])
  yield delay(READY_ORDERS_POLL_INTERVAL)
}

function* watchHistoryOrdersSaga() {
  if (!(yield* select(userSelector))) {
    yield take()
    return
  }
  yield put({ type: ActionTypes.GET_HISTORY_ORDERS_REQUEST })
  yield take([
    ActionTypes.GET_HISTORY_ORDERS_SUCCESS,
    ActionTypes.GET_HISTORY_ORDERS_FAIL,
  ])
  yield delay(HISTORY_ORDERS_POLL_INTERVAL)
}

function* watchOrderSaga({ key: id }: WatchState<IOrder['b_id']>) {
  yield put({ type: ActionTypes.GET_ORDER_REQUEST, payload: id })
  yield take(({ type, payload }: TAction) =>
    type === ActionTypes.GET_ORDER_SUCCESS ?
      payload.b_id === id :
      type === ActionTypes.GET_ORDER_NOT_FOUND ?
        payload === id :
        type === ActionTypes.GET_ORDER_FAIL ?
          payload.id === id :
          false,
  )
  yield delay(ORDER_POLL_INTERVAL)
}

function* getActiveOrdersSaga() {
  const prev = (yield* select(activeOrders)) ?? []
  try {
    const response = yield* call(API.getOrders, EOrderTypes.Active)
    if (response.code !== '200')
      throw response
    let orders = response.data.booking.map(updateCompletedOrderDuration)

    orders = yield* cancelExpiredOrdersSaga(orders)
    if (orders.length === 1)
      yield put(setSelectedOrder(orders[0].b_id))
    if (orders.length === 0)
      yield put(setSelectedOrder(null))

    yield put({ type: ActionTypes.GET_ACTIVE_ORDERS_SUCCESS, payload: orders })

    const geoposition = yield* select(geopositionSelector)
    if (geoposition) {
      yield put(getAreasBetweenPoints([
        ...orders
          .flatMap(order => [
            [order.b_start_latitude, order.b_start_longitude],
            [order.b_destination_latitude, order.b_destination_longitude],
          ])
          .filter(([lat, lng]) => lat && lng) as [number, number][],
        geopositionToPoint(geoposition),
      ]))
    }

    yield fork(function*() {
      while (orders.length > 0) {
        const [keptOrders] = yield race([
          call(cancelOrdersOnNextExpireSaga, orders),
          take(ActionTypes.GET_ACTIVE_ORDERS_REQUEST),
        ])
        if (!keptOrders)
          break
        orders = keptOrders
        yield put({
          type: ActionTypes.GET_ACTIVE_ORDERS_SUCCESS,
          payload: orders,
        })
      }
    })

    yield* afterOrdersChangeSaga(prev, orders)
  }

  catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GET_ACTIVE_ORDERS_FAIL, payload: error })
  }
}

function* getReadyOrdersSaga() {
  if ((yield* select(userPrimaryCarSelector)) === null)
    return

  const prev = (yield* select(readyOrders)) ?? []
  try {
    const response = yield* call(API.getOrders, EOrderTypes.Ready)

    if (
      response.code === '404' &&
      response.data.detail === 'used_car_not_found'
    ) {
      yield fork(function*() {
        const success = yield* drivePrimaryCarSaga()
        if (success)
          yield put({ type: ActionTypes.GET_READY_ORDERS_REQUEST })
      })
      return
    }

    if (response.code !== '200')
      throw response
    const orders = response.data.booking.map(updateCompletedOrderDuration)
    yield put({ type: ActionTypes.GET_READY_ORDERS_SUCCESS, payload: orders })

    const geoposition = yield* select(geopositionSelector)
    if (geoposition) {
      yield put(getAreasBetweenPoints([
        ...orders
          .flatMap(order => [
            [order.b_start_latitude, order.b_start_longitude],
            [order.b_destination_latitude, order.b_destination_longitude],
          ])
          .filter(([lat, lng]) => lat && lng) as [number, number][],
        geopositionToPoint(geoposition),
      ]))
      yield put(getUserCars())
    }

    yield* afterOrdersChangeSaga(prev, orders)
  }

  catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GET_READY_ORDERS_FAIL, payload: error })
  }
}

function* getHistoryOrdersSaga() {
  const prev = (yield* select(historyOrders)) ?? []
  try {
    const response = yield* call(API.getOrders, EOrderTypes.History)
    if (response.code !== '200')
      throw response
    const orders = response.data.booking.map(updateCompletedOrderDuration)
    yield put({ type: ActionTypes.GET_HISTORY_ORDERS_SUCCESS, payload: orders })

    yield* afterOrdersChangeSaga(prev, orders)
  }

  catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GET_HISTORY_ORDERS_FAIL, payload: error })
  }
}

function* getOrderSaga({ payload: id }: TAction) {
  if (yield* select((state: IRootState) =>
    !moduleSelector(state).orders.get(id)?.mutations,
  )) {
    try {
      const order = yield* call(API.getOrder, id)
      if (order)
        yield put({ type: ActionTypes.GET_ORDER_SUCCESS, payload: order })
      else
        yield put({ type: ActionTypes.GET_ORDER_NOT_FOUND, payload: id })
    } catch (error) {
      yield put({ type: ActionTypes.GET_ORDER_FAIL, payload: { id, error } })
    }
  }
}

function* afterOrdersChangeSaga(prev: IOrder[], current: IOrder[]) {
  const currentIds = new Set(current.map(order => order.b_id))
  const diff = prev.filter(order => !currentIds.has(order.b_id))

  const existing =
    yield* select((state: IRootState) => moduleSelector(state).orders)
  for (const order of diff)
    if (existing.has(order.b_id))
      yield put({ type: ActionTypes.GET_ORDER_REQUEST, payload: order.b_id })
}

function* cancelOrdersOnNextExpireSaga(orders: IOrder[]) {
  const nextCancel = orders.reduce((value, order) =>
    order.b_voting &&
    order.b_start_datetime ?
      Math.min(
        +order.b_start_datetime +
          (order.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL) * 1000,
        value,
      ) :
      value
  , Infinity) - +moment()
  if (nextCancel === Infinity)
    return null
  yield delay(nextCancel)
  return yield* cancelExpiredOrdersSaga(orders)
}

function* cancelExpiredOrdersSaga(orders: IOrder[]) {
  const user = yield* select(userSelector)
  if (!user || user.u_role !== EUserRoles.Client)
    return orders

  const ordersToCancel: IOrder[] = []
  const keptOrders: IOrder[] = []
  for (const order of orders)
    (
      (
        order.b_voting &&
        order.b_start_datetime &&
        (order.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL) <=
          moment().diff(order.b_start_datetime, 'seconds')
      ) ?
        ordersToCancel :
        keptOrders
    ).push(order)

  yield fork(function*() {
    for (const order of ordersToCancel) {
      try {
        yield* call(API.cancelDrive, order.b_id)
      } catch (error) {
        console.error(error)
      }
    }
  })

  return keptOrders
}

function* drivePrimaryCarSaga() {
  let car = yield* select(userPrimaryCarSelector)
  if (car === undefined)
    yield put(getUserCars())
  while (car === undefined) {
    yield take()
    car = yield* select(userPrimaryCarSelector)
  }
  if (car) {
    try {
      const response = yield* putResolve(driveCar(car))
      if (String(response.code) === '200')
        return true
      yield put(setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: getApiErrorMessage(response, { context: 'driver-order' }),
      }))
      return false
    } catch (error) {
      console.error(error)
    }
  }
  return false
}
