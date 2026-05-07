import { createSelector } from 'reselect'
import moment from 'moment'
import { ICarClass, IBookingLocationClass } from '../../types/types'
import { getPhoneNumberError } from '../../tools/utils'
import SITE_CONSTANTS from '../../siteConstants'
import { IRootState } from '..'
import { userSelectors } from '../user'
import * as util from './util'
import { polygonsLocationClasses } from './util'
import { moduleName } from './constants'

export const moduleSelector = (state: IRootState) => state[moduleName]
export const carClass = createSelector(moduleSelector, state => state.carClass)
export const seats = createSelector(moduleSelector, state => state.seats)
export const from = createSelector(moduleSelector, state => state.from)
export const to = createSelector(moduleSelector, state => state.to)
export const comments = createSelector(moduleSelector, state => state.comments)
const rawTime = createSelector(moduleSelector, state => state.time)
export const time = createSelector(
  rawTime,
  time => typeof time === 'string' ? time : moment(time),
)
export const locationClass =
  createSelector(moduleSelector, state => state.locationClass)
export const phone = createSelector(
  [moduleSelector, userSelectors.user],
  (state, user): number | null =>
    !state.phoneEdited && getPhoneNumberError(state.phone) ?
      user?.u_phone ? +user.u_phone : null :
      state.phone,
)
export const customerPrice =
  createSelector(moduleSelector, state => state.customerPrice)
export const selectedOrder =
  createSelector(moduleSelector, state => state.selectedOrder)
export const status = createSelector(moduleSelector, state => state.status)
export const message = createSelector(moduleSelector, state => state.message)

const fromLoading = createSelector(moduleSelector, state => state.fromLoading)
const toLoading = createSelector(moduleSelector, state => state.toLoading)
const fromPolygons = createSelector(moduleSelector, state => state.fromPolygons)
const toPolygons = createSelector(moduleSelector, state => state.toPolygons)
export const availableLocationClasses = createSelector(
  [fromLoading, toLoading, fromPolygons, toPolygons],
  (
    fromLoading, toLoading,
    fromPolygons, toPolygons,
  ): IBookingLocationClass[] | null => fromLoading || toLoading ?
    null :
    fromPolygons && toPolygons ?
      polygonsLocationClasses(fromPolygons, toPolygons) :
      SITE_CONSTANTS.BOOKING_LOCATION_CLASSES,
)
export const availableCarClasses = createSelector(
  availableLocationClasses,
  (locationClasses): ICarClass[] | null => locationClasses &&
    util.availableCarClasses(locationClasses),
)
export const maxAvailableSeats = createSelector(
  availableCarClasses,
  (carClasses): number | null => carClasses &&
    util.maxAvailableSeats(carClasses),
)