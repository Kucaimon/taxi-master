import React, { useCallback, useMemo } from 'react'
import cn from 'classnames'
import { IOrder } from '../../types/types'
import {
  EPaymentType,
  getPayment,
  formatCurrency,
} from '../../tools/utils'
import { t, TRANSLATION } from '../../localization'
import { getOrderStatus, consideringDriversCount } from './status'

interface IProps {
  order: IOrder
  onSelect: (order: IOrder) => void
  onCancel: (order: IOrder) => void
}

function ActiveOrderCardImpl({ order, onSelect, onCancel }: IProps) {
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

  const handleClick = useCallback(() => onSelect(order), [order, onSelect])

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

  return (
    <article
      className={cn(
        'active-order-card',
        `active-order-card--${status.key}`,
      )}
    >
      <button
        type="button"
        className="active-order-card__main"
        onClick={handleClick}
        aria-label={statusForAria}
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
      </button>
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
  if (prev.onSelect !== next.onSelect || prev.onCancel !== next.onCancel)
    return false
  const a = prev.order
  const b = next.order
  if (a === b) return true
  if (a.b_id !== b.b_id) return false
  if (a.b_estimate_waiting !== b.b_estimate_waiting) return false
  if (a.b_passengers_count !== b.b_passengers_count) return false
  if (a.b_voting !== b.b_voting) return false
  if (a.b_options?.customer_price !== b.b_options?.customer_price) return false
  if (a.b_car_class !== b.b_car_class) return false
  const aDrivers = a.drivers ?? []
  const bDrivers = b.drivers ?? []
  if (aDrivers.length !== bDrivers.length) return false
  for (let i = 0; i < aDrivers.length; i++)
    if (aDrivers[i].c_state !== bDrivers[i].c_state)
      return false
  return true
})

export default ActiveOrderCard
