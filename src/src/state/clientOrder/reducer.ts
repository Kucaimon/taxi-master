import { Record } from 'immutable'
import { createSelector } from 'reselect'
import SITE_CONSTANTS from '../../siteConstants'
import { TAction } from '../../types'
import { EStatuses } from '../../types/types'
import { firstItem } from '../../tools/utils'
import { getItem } from '../../tools/localStorage'
import { configConstants } from '../config'
import * as util from './util'
import { polygonsLocationClasses } from './util'
import { ActionTypes, IClientOrderState } from './constants'

const defaultRecord: IClientOrderState = {
  from: null,
  fromPolygons: null,
  fromLoading: false,

  to: null,
  toPolygons: null,
  toLoading: false,

  carClass: SITE_CONSTANTS.DEFAULT_CAR_CLASS,
  seats: 1,
  comments: {
    custom: '',
    flightNumber: '',
    placard: '',
    ids: [],
  },
  time: 'now',
  locationClass: SITE_CONSTANTS.DEFAULT_BOOKING_LOCATION_CLASS,
  phone: null,
  phoneEdited: false,
  customerPrice: null,
  selectedOrder: null,
  status: EStatuses.Default,
  message: '',
}

const record = Record<IClientOrderState>({
  ...defaultRecord,
  from: getItem('state.clientOrder.from', defaultRecord.from),
  to: getItem('state.clientOrder.to', defaultRecord.to),
  time: getItem('state.clientOrder.time', defaultRecord.time),
  phone: getItem('state.clientOrder.phone', defaultRecord.phone),
  customerPrice:
    getItem('state.clientOrder.customerPrice', defaultRecord.customerPrice),
})

export default function reducer(
  state = new record(),
  action: TAction,
  performedActions = new Set<string>(),
) {
  const { type, payload } = action
  if (performedActions.has(type))
    return state
  performedActions.add(type)

  if (type === configConstants.ActionTypes.SET_CONFIG_SUCCESS) {
    defaultRecord.carClass = SITE_CONSTANTS.DEFAULT_CAR_CLASS
    defaultRecord.locationClass = SITE_CONSTANTS.DEFAULT_BOOKING_LOCATION_CLASS
    state = reducer(state, {
      type: ActionTypes.SET_CAR_CLASS,
      payload: state.carClass,
    }, performedActions)
    state = reducer(state, {
      type: ActionTypes.SET_SEATS,
      payload: state.seats,
    }, performedActions)
    state = reducer(state, {
      type: ActionTypes.SET_COMMENTS,
      payload: state.comments,
    }, performedActions)
    state = reducer(state, {
      type: ActionTypes.SET_LOCATION_CLASS,
      payload: state.locationClass,
    }, performedActions)
    return state
  }

  if (type === ActionTypes.SET_CAR_CLASS) {
    const available = availableCarClassesIds(state)
    const carClass = available.has(payload) ?
      payload :
      firstItem(available) ?? defaultRecord.carClass
    const carClassData = SITE_CONSTANTS.CAR_CLASSES[carClass]
    state = state
      .set('carClass', carClass)
    state = reducer(state, {
      type: ActionTypes.SET_SEATS,
      payload: Math.min(state.seats, carClassData.seats),
    }, performedActions)
    state = reducer(state, {
      type: ActionTypes.SET_LOCATION_CLASS,
      payload:
        carClassData.booking_location_classes === null ||
        carClassData.booking_location_classes.includes(state.locationClass) ?
          state.locationClass :
          [...availableLocationClassesIds(state)].find(id =>
            carClassData.booking_location_classes!.includes(id),
          ) ?? defaultRecord.locationClass,
    }, performedActions)
    return state
  }

  if (type === ActionTypes.SET_SEATS) {
    const seats = Math.min(payload, maxAvailableSeats(state))
    state = state
      .set('seats', seats)
    state = reducer(state, {
      type: ActionTypes.SET_CAR_CLASS,
      payload: SITE_CONSTANTS.CAR_CLASSES[state.carClass].seats < seats ?
        availableCarClasses(state).find(cc => cc.seats >= seats)?.id ??
          defaultRecord.carClass :
        state.carClass,
    }, performedActions)
    return state
  }

  if (type === ActionTypes.SET_COMMENTS) {
    return state
      .set('comments', {
        ...payload,
        ids: payload.ids
          .filter((id: string) => id in SITE_CONSTANTS.BOOKING_COMMENTS),
      })
  }

  if (type === ActionTypes.SET_LOCATION_CLASS) {
    const available = availableLocationClassesIds(state)
    const locationClass = available.has(payload) ?
      payload :
      firstItem(available) ?? defaultRecord.locationClass
    const carClassData = SITE_CONSTANTS.CAR_CLASSES[state.carClass]
    state = state
      .set('locationClass', locationClass)
    state = reducer(state, {
      type: ActionTypes.SET_CAR_CLASS,
      payload:
        carClassData.booking_location_classes === null ||
        carClassData.booking_location_classes.includes(locationClass) ?
          state.carClass :
          availableCarClasses(state).find(cc =>
            cc.booking_location_classes === null ||
            cc.booking_location_classes.includes(locationClass),
          )?.id ?? defaultRecord.carClass,
    }, performedActions)
    return state
  }

  if (
    type === ActionTypes.SET_FROM_POLYGONS ||
    type === ActionTypes.SET_TO_POLYGONS
  ) {
    state = state
      .set(
        type === ActionTypes.SET_FROM_POLYGONS ? 'fromPolygons' : 'toPolygons',
        payload,
      )
    state = reducer(state, {
      type: ActionTypes.SET_LOCATION_CLASS,
      payload: state.locationClass,
    }, performedActions)
    return state
  }

  switch (type) {
    case ActionTypes.SET_FROM_REQUEST:
      return state
        .set('fromPolygons', defaultRecord.fromPolygons)
        .set('fromLoading', true)
    case ActionTypes.SET_FROM:
      return state
        .set('from', payload)
    case ActionTypes.SET_FROM_SUCCESS:
      return state
        .set('fromLoading', false)
    case ActionTypes.SET_TO_REQUEST:
      return state
        .set('toPolygons', defaultRecord.toPolygons)
        .set('toLoading', true)
    case ActionTypes.SET_TO:
      return state
        .set('to', payload)
    case ActionTypes.SET_TO_SUCCESS:
      return state
        .set('toLoading', false)
    case ActionTypes.SET_TIME:
      return state
        .set('time', payload)
    case ActionTypes.SET_PHONE:
      return state
        .set('phone', payload)
        .set('phoneEdited', state.phoneEdited || payload !== state.phone)
    case ActionTypes.SET_CUSTOMER_PRICE:
      return state
        .set('customerPrice', payload)
    case ActionTypes.SET_SELECTED_ORDER:
      return state
        .set('selectedOrder', payload)
    case ActionTypes.SET_STATUS:
      return state
        .set('status', payload)
    case ActionTypes.SET_MESSAGE:
      return state
        .set('message', payload)
    case ActionTypes.RESET:
      return state
        .set('carClass', defaultRecord.carClass)
        .set('seats', defaultRecord.seats)
        .set('to', defaultRecord.to)
        .set('toPolygons', defaultRecord.toPolygons)
        .set('comments', defaultRecord.comments)
        .set('time', defaultRecord.time)
        .set('customerPrice', defaultRecord.customerPrice)
    default:
      return state
  }
}

const fromPolygons = (state: IClientOrderState) => state.fromPolygons
const toPolygons = (state: IClientOrderState) => state.toPolygons
const availableLocationClassesIds = createSelector(
  [fromPolygons, toPolygons],
  (fromPolygons, toPolygons) => new Set((
    fromPolygons && toPolygons ?
      polygonsLocationClasses(fromPolygons, toPolygons) :
      SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
  ).map(({ id }) => id)),
)
const availableCarClasses = createSelector(
  availableLocationClassesIds,
  ids => util.availableCarClasses(
    SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.filter(({ id }) => ids.has(id)),
  ),
)
const availableCarClassesIds = createSelector(
  availableCarClasses,
  carClasses => new Set(carClasses.map(({ id }) => id)),
)
const maxAvailableSeats = createSelector(
  availableCarClasses,
  carClasses => util.maxAvailableSeats(carClasses),
)