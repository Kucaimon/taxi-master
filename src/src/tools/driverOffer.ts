import SITE_CONSTANTS from '../siteConstants'
import { candidateMode } from './order'
import {
  EBookingDriverState,
  EBookingLocationKinds,
  EDriverResponseModes,
  IOrder,
  IUser,
} from '../types/types'

export const ORDER_MODE_OFFER = 'OFFER'
export const DRIVER_OFFER_LIFETIME_MS = 15 * 60 * 1000

const DRIVER_OFFERS_STORAGE_KEY = 'driverOffers'

export type DriverOfferStatus = 'sent' | 'accepted' | 'rejected' | 'expired' | string

export interface IDriverOfferPayload {
  price: number
  eta: string
  freeSeats: number
  comment?: string
}

export interface IStoredDriverOffer extends IDriverOfferPayload {
  orderId: IOrder['b_id']
  userId?: IUser['u_id']
  status: DriverOfferStatus
  createdAt: number
  expiresAt: number
}

function normalizeMode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function getRuntimeConfigName() {
  try {
    const params = new URLSearchParams(window.location.search)
    return (params.get('config') || localStorage.getItem('config') || '').toLowerCase()
  } catch {
    return ''
  }
}

export function isGruzvillConfig() {
  return getRuntimeConfigName().includes('gruzvill')
}

function isIntercityLocationClass(locationClassId?: unknown) {
  if (locationClassId === null || locationClassId === undefined || locationClassId === '')
    return false

  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.some(item =>
    String(item.id) === String(locationClassId) &&
    item.kind === EBookingLocationKinds.Intercity,
  )
}


function normalizeResponseMode(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : value
}

export function getIntercityLocationClassIds() {
  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
    .filter(item => item.kind === EBookingLocationKinds.Intercity)
    .map(item => item.id)
}

export function getDefaultIntercityLocationClassId() {
  return getIntercityLocationClassIds()[0]
}

export function getDefaultCityLocationClassId() {
  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
    .find(item => item.kind === EBookingLocationKinds.City)?.id ??
    SITE_CONSTANTS.DEFAULT_BOOKING_LOCATION_CLASS
}

export function getCandidateResponseBookingCommentIds() {
  return Object.values(SITE_CONSTANTS.BOOKING_COMMENTS)
    .filter(comment => normalizeResponseMode(comment.responseMode) === EDriverResponseModes.Candidate)
    .map(comment => comment.id)
}

export function getOfferResponseBookingCommentIds() {
  const candidateIds = getCandidateResponseBookingCommentIds()
  if (candidateIds.length)
    return candidateIds

  // В старом Truck-flow часть конфигов помечала отклик водителя
  // комментариями 95/96. Используем их только если они реально есть
  // в текущем справочнике, чтобы не создавать новую схему поверх backend.
  if (isGruzvillConfig())
    return ['95', '96'].filter(id => id in SITE_CONSTANTS.BOOKING_COMMENTS)

  return normalizeResponseMode(SITE_CONSTANTS.DRIVER_RESPONSE_MODE) === EDriverResponseModes.ByOrder ?
    candidateIds :
    []
}

export function hasOfferOrderSupport() {
  const responseMode = normalizeResponseMode(SITE_CONSTANTS.DRIVER_RESPONSE_MODE)

  return (
    isGruzvillConfig() ||
    responseMode === EDriverResponseModes.Candidate ||
    (
      responseMode === EDriverResponseModes.ByOrder &&
      getCandidateResponseBookingCommentIds().length > 0
    )
  )
}

export function isIntercityOrderLocationClass(locationClassId?: unknown) {
  return isIntercityLocationClass(locationClassId)
}

function hasIntercityLocationClass(order: IOrder | null) {
  return isIntercityLocationClass(order?.b_location_class)
}

function hasIntercityCarClass(order: IOrder | null) {
  if (!order?.b_car_class)
    return false

  const carClass = SITE_CONSTANTS.CAR_CLASSES[String(order.b_car_class)]
  if (!carClass?.booking_location_classes?.length)
    return false

  return carClass.booking_location_classes.some(isIntercityLocationClass)
}

export function getOrderMode(order: IOrder | null) {
  const rawOrder = order as any
  return normalizeMode(
    rawOrder?.order_mode ??
    rawOrder?.b_order_mode ??
    rawOrder?.b_mode ??
    rawOrder?.mode ??
    rawOrder?.b_options?.order_mode ??
    rawOrder?.b_options?.b_order_mode ??
    rawOrder?.b_options?.mode,
  )
}

function hasOfferMarkerComment(order: IOrder | null) {
  const ids = getOfferResponseBookingCommentIds()
  return !!ids.length && !!order?.b_comments?.some(id => ids.includes(String(id)))
}

export function isOfferOrder(order: IOrder | null) {
  const mode = getOrderMode(order)
  if (mode)
    return mode === ORDER_MODE_OFFER

  const options = (order?.b_options ?? {}) as any

  if (!order?.b_voting && hasOfferMarkerComment(order))
    return true

  if (options.customer_price !== undefined || options.customerPrice !== undefined)
    return true

  if ((order as any)?.b_only_offer === true || Number((order as any)?.b_only_offer) === 1)
    return true

  if (
    options.offer_mode === true ||
    options.driver_offer_mode === true ||
    options.driver_offer === true ||
    normalizeMode(options.offer_mode) === ORDER_MODE_OFFER ||
    normalizeMode(options.driver_offer_mode) === ORDER_MODE_OFFER
  )
    return true

  // В конфиге Truck уже есть режим откликов водителей через site_constants:
  // mode_response / mode_response_other -> candidateMode(order).
  // OFFER не делаем отдельной сущностью на фронте: распознаём его поверх
  // старого candidate-flow и старого признака b_cars_count=0, который в Truck
  // используется для заказа без немедленного закрепления исполнителя.
  if (
    isGruzvillConfig() &&
    !order?.b_voting &&
    !!order?.b_destination_address &&
    Number(order?.b_cars_count) === 0
  )
    return true

  if (!candidateMode(order ?? undefined))
    return false

  if (isGruzvillConfig() && !order?.b_voting && !!order?.b_destination_address)
    return true

  return hasIntercityLocationClass(order) || hasIntercityCarClass(order)
}

function storageKey(orderId: IOrder['b_id'], userId?: IUser['u_id']) {
  return `${userId || 'anonymous'}:${orderId}`
}

function readAllStoredOffers(): Record<string, IStoredDriverOffer> {
  try {
    const value = localStorage.getItem(DRIVER_OFFERS_STORAGE_KEY)
    return value ? JSON.parse(value) : {}
  } catch {
    return {}
  }
}

function writeAllStoredOffers(value: Record<string, IStoredDriverOffer>) {
  localStorage.setItem(DRIVER_OFFERS_STORAGE_KEY, JSON.stringify(value))
}

export function getStoredDriverOffer(
  orderId: IOrder['b_id'],
  userId?: IUser['u_id'],
) {
  return readAllStoredOffers()[storageKey(orderId, userId)] ?? null
}

export function saveStoredDriverOffer(
  orderId: IOrder['b_id'],
  userId: IUser['u_id'] | undefined,
  payload: IDriverOfferPayload,
  status: DriverOfferStatus = 'sent',
) {
  const all = readAllStoredOffers()
  const now = Date.now()
  const offer: IStoredDriverOffer = {
    ...payload,
    orderId,
    userId,
    status,
    createdAt: now,
    expiresAt: now + DRIVER_OFFER_LIFETIME_MS,
  }
  all[storageKey(orderId, userId)] = offer
  writeAllStoredOffers(all)
  return offer
}

export function updateStoredDriverOfferStatus(
  orderId: IOrder['b_id'],
  userId: IUser['u_id'] | undefined,
  status: DriverOfferStatus,
) {
  const all = readAllStoredOffers()
  const key = storageKey(orderId, userId)
  const offer = all[key]
  if (!offer)
    return null

  const nextOffer = { ...offer, status }
  all[key] = nextOffer
  writeAllStoredOffers(all)
  return nextOffer
}

export function removeStoredDriverOffer(
  orderId: IOrder['b_id'],
  userId?: IUser['u_id'],
) {
  const all = readAllStoredOffers()
  delete all[storageKey(orderId, userId)]
  writeAllStoredOffers(all)
}

export function isDriverOfferExpired(offer?: Pick<IStoredDriverOffer, 'expiresAt' | 'status'> | null) {
  if (!offer)
    return false

  return offer.status === 'expired' || Date.now() >= offer.expiresAt
}

function numberFromUnknown(value: unknown) {
  if (value === null || value === undefined || value === '')
    return undefined

  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function normalizeOfferStatus(value: unknown): DriverOfferStatus | undefined {
  const status = normalizeMode(value).toLowerCase()
  if (!status)
    return undefined

  if (status.includes('accept')) return 'accepted'
  if (status.includes('reject') || status.includes('cancel')) return 'rejected'
  if (status.includes('expire')) return 'expired'
  if (status.includes('sent') || status.includes('pending') || status.includes('wait')) return 'sent'
  return status
}

export function getOfferEvent(order: IOrder | null, userId?: IUser['u_id']) {
  const rawOrder = order as any
  const rawDriver = order?.drivers?.find(driver => driver.u_id === userId) as any

  if (rawDriver?.c_state === EBookingDriverState.Canceled)
    return 'rejected'

  return normalizeOfferStatus(
    rawOrder?.offer_event ??
    rawOrder?.driver_offer_event ??
    rawOrder?.event?.type ??
    rawOrder?.last_event?.type ??
    rawOrder?.b_options?.offer_event ??
    rawOrder?.b_options?.driver_offer_event ??
    rawDriver?.offer_event ??
    rawDriver?.c_options?.offer_event,
  )
}

export function getBackendDriverOffer(order: IOrder | null, userId?: IUser['u_id']) {
  const rawOrder = order as any
  const rawDriver = order?.drivers?.find(driver => driver.u_id === userId) as any
  const rawCandidateOffer = rawDriver?.c_options && (
    rawDriver.c_options.driver_offer_mode === ORDER_MODE_OFFER ||
    rawDriver.c_options.driver_offer_price !== undefined ||
    rawDriver.c_options.driver_offer_eta !== undefined ||
    rawDriver.c_options.driver_offer_free_seats !== undefined ||
    rawDriver.c_options.driver_offer_comment !== undefined ||
    rawDriver.c_options.performers_price !== undefined
  ) ? {
      price: rawDriver.c_options.driver_offer_price ?? rawDriver.c_options.performers_price,
      eta: rawDriver.c_options.driver_offer_eta ?? rawDriver.c_options.eta ?? rawDriver.c_options.pickup_time,
      freeSeats: rawDriver.c_options.driver_offer_free_seats ?? rawDriver.c_options.free_seats ?? rawDriver.c_options.seats,
      comment: rawDriver.c_options.driver_offer_comment ?? rawDriver.c_options.comment,
      status: rawDriver.c_state === EBookingDriverState.Canceled ? 'rejected' : 'sent',
    } : null

  const rawOffer =
    rawOrder?.driver_offer ??
    rawOrder?.my_offer ??
    rawOrder?.offer ??
    rawOrder?.b_options?.driver_offer ??
    rawOrder?.b_options?.my_offer ??
    rawDriver?.driver_offer ??
    rawDriver?.offer ??
    rawDriver?.c_options?.driver_offer ??
    rawDriver?.c_options?.offer ??
    rawCandidateOffer

  if (!rawOffer)
    return null

  const createdAt = Number(new Date(
    rawOffer.createdAt ?? rawOffer.created_at ?? rawOffer.datetime ?? rawOffer.date ?? Date.now(),
  ))
  const expiresAt = Number(new Date(
    rawOffer.expiresAt ?? rawOffer.expires_at ?? rawOffer.expired_at ?? rawOffer.expire_datetime ?? 0,
  ))

  return {
    orderId: order?.b_id ?? rawOffer.orderId ?? rawOffer.order_id,
    userId,
    price: numberFromUnknown(rawOffer.price ?? rawOffer.driver_price ?? rawOffer.performers_price) ?? 0,
    eta: String(rawOffer.eta ?? rawOffer.pickup_time ?? rawOffer.arrival_time ?? rawOffer.time ?? ''),
    freeSeats: numberFromUnknown(rawOffer.freeSeats ?? rawOffer.free_seats ?? rawOffer.seats) ?? 0,
    comment: rawOffer.comment ?? rawOffer.driver_comment ?? '',
    status: normalizeOfferStatus(rawOffer.status ?? rawOffer.state ?? rawOffer.type) ?? 'sent',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : Date.now() + DRIVER_OFFER_LIFETIME_MS,
  } as IStoredDriverOffer
}

export function getOfferCount(order: IOrder | null) {
  const rawOrder = order as any
  return numberFromUnknown(
    rawOrder?.offers_count ??
    rawOrder?.offer_count ??
    rawOrder?.driver_offers_count ??
    rawOrder?.b_options?.offers_count ??
    rawOrder?.b_options?.offer_count,
  )
}

export function isOfferAcceptedForDriver(order: IOrder | null, userId?: IUser['u_id']) {
  const driver = order?.drivers?.find(item => item.u_id === userId)
  // Для OFFER состояние Considering означает только отправленное предложение.
  // Назначенной поездкой считаем только Performer и следующие состояния.
  return !!driver && driver.c_state >= EBookingDriverState.Performer
}
