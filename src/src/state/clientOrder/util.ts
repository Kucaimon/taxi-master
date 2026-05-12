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

function isGruzvillRuntimeConfig() {
  try {
    const params = new URLSearchParams(window.location.search)
    return (params.get('config') || localStorage.getItem('config') || '').toLowerCase().includes('gruzvill')
  } catch {
    return false
  }
}

export function availableCarClasses(
  availableLocationClasses: IBookingLocationClass[],
): ICarClass[] {
  // В gruzvill/Truck режим предложений строится поверх старого candidate-flow.
  // Там клиент должен иметь возможность сам выбрать класс заказа (например,
  // Petit или Grand), иначе заказ создаётся только Grand и водитель с Petit
  // получает ошибку backend: "driver car has wrong class".
  if (isGruzvillRuntimeConfig())
    return Object.values(SITE_CONSTANTS.CAR_CLASSES)

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