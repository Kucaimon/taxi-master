import {
  ICarClass,
  EBookingLocationKinds, IBookingLocationClass,
} from '../../types/types'
import { IPolygon } from '../../types/polygon'
import SITE_CONSTANTS from '../../siteConstants'

export function polygonsLocationClasses(
  fromPolygons: IPolygon['id'][],
  toPolygons: IPolygon['id'][],
): IBookingLocationClass[] {
  const fromPolygonsSet = new Set(fromPolygons)
  const isCity = toPolygons.some(id => fromPolygonsSet.has(id))
  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.filter(({ kind }) =>
    isCity ?
      kind === EBookingLocationKinds.City :
      kind !== EBookingLocationKinds.City,
  )
}

export function availableCarClasses(
  availableLocationClasses: IBookingLocationClass[],
): ICarClass[] {
  const ids = new Set(availableLocationClasses.map(({ id }) => id))
  return Object.values(SITE_CONSTANTS.CAR_CLASSES).filter(cc =>
    cc.booking_location_classes === null ||
    cc.booking_location_classes.some(id => ids.has(id)),
  )
}

export function maxAvailableSeats(
  availableCarClasses: ICarClass[],
): number {
  let value = 1
  for (const carClass of availableCarClasses)
    if (carClass.seats > value)
      value = carClass.seats
  return value
}