import { EBookingDriverState, IOrder } from '../../types/types'
import { t, TRANSLATION } from '../../localization'

/**
 * One of the seven UI-level statuses an active order can be in. Maps
 * loosely onto `EBookingDriverState`, with two synthetic states that
 * exist only on the client:
 *  - `searching`: no driver has accepted yet, server hasn't moved the
 *    order to `Considering` and there is no `b_voting` flag either;
 *  - `voting`: passenger created the order in voting mode and is
 *    waiting for one of several considering drivers.
 *
 * The `dot` value is mapped to a CSS color in `./styles.scss`. We
 * deliberately keep the mapping in TS (not just CSS) so callers can
 * use the same key for `aria-label` text and analytics later.
 */
export type StatusKey =
  | 'searching'
  | 'voting'
  | 'considering'
  | 'performer'
  | 'arrived'
  | 'started'
  | 'problem'

export interface IStatusInfo {
  key: StatusKey
  label: string
}

function pickDriverStateLabel(state: EBookingDriverState): string {
  // The translation lookup uses `BOOKING_DRIVER_STATES.<state>` and
  // already falls back to `lang_vls.search` for the special key '0'
  // in `localization/index.ts`. For the rest we trust whatever the
  // backend ships per locale.
  return t(TRANSLATION.BOOKING_DRIVER_STATES[state])
}

export function getOrderStatus(order: IOrder): IStatusInfo {
  const driver = order.drivers?.find(
    d => d.c_state !== EBookingDriverState.Canceled,
  )

  if (driver) {
    switch (driver.c_state) {
      case EBookingDriverState.Performer:
        return { key: 'performer', label: pickDriverStateLabel(driver.c_state) }
      case EBookingDriverState.Arrived:
        return { key: 'arrived', label: pickDriverStateLabel(driver.c_state) }
      case EBookingDriverState.Started:
        return { key: 'started', label: pickDriverStateLabel(driver.c_state) }
      case EBookingDriverState.Considering:
      default:
        return {
          key: 'considering',
          label: pickDriverStateLabel(EBookingDriverState.Considering),
        }
    }
  }

  if (order.b_voting)
    return { key: 'voting', label: t(TRANSLATION.VOTER) }

  return { key: 'searching', label: t(TRANSLATION.SEARCH) }
}

export function consideringDriversCount(order: IOrder): number {
  return (
    order.drivers?.filter(d => d.c_state === EBookingDriverState.Considering)
      .length ?? 0
  )
}
