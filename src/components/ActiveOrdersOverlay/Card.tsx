import React, { useCallback, useMemo } from 'react'
import cn from 'classnames'
import { EBookingDriverState, IOrder } from '../../types/types'
import {
  EPaymentType,
  getPayment,
  formatCurrency,
} from '../../tools/utils'
import { formatAddress } from '../../tools/format'
import { t, tLangVls, TRANSLATION } from '../../localization'
import { getOrderStatus, consideringDriversCount } from './status'

interface IProps {
  order: IOrder
  isExpanded: boolean
  onToggleExpand: (order: IOrder) => void
  onOpenDetails: (order: IOrder) => void
  onCancel: (order: IOrder) => void
  onPickupTipPlus: (order: IOrder) => void
}

function ActiveOrderCardImpl({
  order,
  isExpanded,
  onToggleExpand,
  onOpenDetails,
  onCancel,
  onPickupTipPlus,
}: IProps) {
  const status = getOrderStatus(order)
  const candidates = consideringDriversCount(order)

  // `getPayment` reads several derived fields off the order; recompute
  // it only when the inputs that actually feed the price change. The
  // memo key matches the same fields the parent uses to decide whether
  // to re-render the whole card.
  const payment = useMemo(
    () => getPayment(order),
    [
      order.b_id,
      order.b_options?.customer_price,
      order.b_car_class,
    ],
  )

  // Tap on the card body now toggles the in-place expansion instead
  // of immediately routing to a fullscreen modal. The "Open" action
  // inside the expanded state still triggers the legacy modal flow,
  // so the long-running stateful behaviour (poll → driver tracking →
  // modal swap on `c_state` change) is preserved end-to-end.
  const handleToggle = useCallback(
    () => onToggleExpand(order),
    [order, onToggleExpand],
  )

  const handleOpenDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenDetails(order)
  }, [order, onOpenDetails])

  const handleCancel = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    // Stop propagation so the underlying card click handler doesn't
    // also fire and accidentally re-open the order detail modal.
    e.stopPropagation()
    onCancel(order)
  }, [order, onCancel])

  // ETA is shipped under `b_estimate_waiting`. Existing screens treat
  // the field as already-in-minutes (see `pages/Order/index.tsx:310`);
  // we follow the same convention. Hide entirely when the value is 0
  // or absent so the row doesn't read as "0 min" while polling.
  const etaMinutes = order.b_estimate_waiting && order.b_estimate_waiting > 0
    ? order.b_estimate_waiting
    : null

  const passengers = order.b_passengers_count ?? 1

  // `~` is shorthand for "estimated", `⥮` flags a passenger-set price
  // (see `EPaymentType.Customer` rendering in MiniOrders/CardModal).
  const priceText = `${payment.type === EPaymentType.Customer ? '⥮' : '~'}${
    typeof payment.value === 'number' ?
      formatCurrency(payment.value) :
      payment.value
  }`

  const statusForAria = `${status.label}, #${order.b_id}`

  // Expanded-mode payload. We pull straight off the `IOrder` shape
  // (no extra reverse-geocode round-trip) — the addresses already
  // appear on screen elsewhere and the same fields back the legacy
  // detail modal, so the data is at least as fresh here as anywhere
  // else without piling on extra requests.
  const startAddress = formatAddress({
    address: order.b_start_address,
    latitude: order.b_start_latitude,
    longitude: order.b_start_longitude,
  }, { withCoords: true })
  const destinationAddress = formatAddress({
    address: order.b_destination_address,
    latitude: order.b_destination_latitude,
    longitude: order.b_destination_longitude,
  }, { withCoords: true })

  // Driver info — only render the line when an actual non-cancelled
  // driver exists. `IDriver` doesn't carry the human-friendly name
  // directly; the legacy modal looks up the user record via Redux.
  // Inside this compact card we settle for the short-form data we
  // already have (driver id) so we don't need another selector
  // hookup. The expanded "Open" CTA escalates to the full modal
  // when the user actually wants the rich view.
  const assignedDriver = order.drivers?.find(
    d => d.c_state !== EBookingDriverState.Canceled &&
         d.c_state >= EBookingDriverState.Performer,
  )

  const handlePickupTipPlus = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onPickupTipPlus(order)
  }, [order, onPickupTipPlus])

  const pickupTipCurrent = Number(order.b_options?.submitPrice) || 0

  return (
    <article
      className={cn(
        'active-order-card',
        `active-order-card--${status.key}`,
        { 'active-order-card--expanded': isExpanded },
      )}
    >
      <button
        type="button"
        className="active-order-card__main"
        onClick={handleToggle}
        aria-label={statusForAria}
        aria-expanded={isExpanded}
      >
        <span className="active-order-card__indicator" aria-hidden />
        <span className="active-order-card__body">
          <span className="active-order-card__row-top">
            <span className="active-order-card__status">{status.label}</span>
            <span className="active-order-card__price">{priceText}</span>
          </span>
          <span className="active-order-card__row-bottom">
            <span className="active-order-card__id">#{order.b_id}</span>
            <span className="active-order-card__sep" aria-hidden>·</span>
            <span className="active-order-card__passengers">
              {passengers} {t(TRANSLATION.PASSENGER)}
            </span>
            {etaMinutes !== null && (
              <>
                <span className="active-order-card__sep" aria-hidden>·</span>
                <span className="active-order-card__eta">
                  ~{etaMinutes} {t(TRANSLATION.MINUTES)}
                </span>
              </>
            )}
            {candidates > 0 && status.key !== 'performer' &&
              status.key !== 'arrived' && status.key !== 'started' && (
              <>
                <span className="active-order-card__sep" aria-hidden>·</span>
                <span className="active-order-card__candidates">
                  {candidates} {t(TRANSLATION.DRIVER)}
                </span>
              </>
            )}
          </span>
        </span>
        <span
          className="active-order-card__chevron"
          aria-hidden
        >
          {isExpanded ? '⌃' : '⌄'}
        </span>
      </button>

      {isExpanded && (
        <div className="active-order-card__details">
          <div className="active-order-card__route">
            <div className="active-order-card__route-row">
              <span className="active-order-card__dot active-order-card__dot--from" aria-hidden />
              <span className="active-order-card__route-label">
                {t(TRANSLATION.FROM)}
              </span>
              <span className="active-order-card__route-value">
                {startAddress || '—'}
              </span>
            </div>
            <div className="active-order-card__route-row">
              <span className="active-order-card__dot active-order-card__dot--to" aria-hidden />
              <span className="active-order-card__route-label">
                {t(TRANSLATION.TO)}
              </span>
              <span className="active-order-card__route-value">
                {destinationAddress || '—'}
              </span>
            </div>
          </div>

          {assignedDriver && (
            <div className="active-order-card__driver">
              <span className="active-order-card__driver-label">
                {t(TRANSLATION.DRIVER)}
              </span>
              <span className="active-order-card__driver-value">
                #{assignedDriver.c_id || assignedDriver.u_id}
              </span>
            </div>
          )}

          <div className="active-order-card__pickup-tip">
            <span className="active-order-card__pickup-tip-label">
              {tLangVls(TRANSLATION.PICKUP_TIP_ACTIVE_LABEL)}
            </span>
            <span className="active-order-card__pickup-tip-value">
              {formatCurrency(pickupTipCurrent)}
            </span>
            <button
              type="button"
              className="active-order-card__pickup-tip-plus"
              aria-label={tLangVls(TRANSLATION.PICKUP_TIP_ACTIVE_LABEL)}
              onClick={handlePickupTipPlus}
            >
              +
            </button>
          </div>

          <div className="active-order-card__actions">
            <button
              type="button"
              className="active-order-card__open"
              onClick={handleOpenDetails}
            >
              {t(TRANSLATION.MORE)}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="active-order-card__close"
        aria-label={t(TRANSLATION.CANCEL_ORDER)}
        onClick={handleCancel}
      >
        ×
      </button>
    </article>
  )
}

// The order list comes through Redux on every poll tick; even when
// nothing changed, the array reference is fresh and parent renders
// would propagate down here. `React.memo` with a structural compare
// keeps the card pinned to actually-relevant fields. The list is
// fixed-size and shallow, so this is dramatically cheaper than the
// re-render cost it avoids.
const ActiveOrderCard = React.memo(ActiveOrderCardImpl, (prev, next) => {
  if (
    prev.onToggleExpand !== next.onToggleExpand ||
    prev.onOpenDetails !== next.onOpenDetails ||
    prev.onCancel !== next.onCancel ||
    prev.onPickupTipPlus !== next.onPickupTipPlus ||
    prev.isExpanded !== next.isExpanded
  )
    return false
  const a = prev.order
  const b = next.order
  if (a === b) return true
  if (a.b_id !== b.b_id) return false
  if (a.b_estimate_waiting !== b.b_estimate_waiting) return false
  if (a.b_passengers_count !== b.b_passengers_count) return false
  if (a.b_voting !== b.b_voting) return false
  if (a.b_options?.customer_price !== b.b_options?.customer_price) return false
  if (a.b_options?.submitPrice !== b.b_options?.submitPrice) return false
  if (a.b_car_class !== b.b_car_class) return false
  if (a.b_start_address !== b.b_start_address) return false
  if (a.b_destination_address !== b.b_destination_address) return false
  const aDrivers = a.drivers ?? []
  const bDrivers = b.drivers ?? []
  if (aDrivers.length !== bDrivers.length) return false
  for (let i = 0; i < aDrivers.length; i++)
    if (aDrivers[i].c_state !== bDrivers[i].c_state)
      return false
  return true
})

export default ActiveOrderCard
