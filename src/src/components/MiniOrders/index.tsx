import React from 'react'
import { ConnectedProps, connect } from 'react-redux'
import cn from 'classnames'
import { EBookingDriverState, EColorTypes, IOrder } from '../../types/types'
import images from '../../constants/images'
import {
  EPaymentType,
  getOrderCount,
  getOrderIcon,
  getPayment,
  formatCurrency,
} from '../../tools/utils'
import { candidateMode } from '../../tools/order'
import { IRootState } from '../../state'
import { ordersSelectors } from '../../state/orders'
import { clientOrderActionCreators } from '../../state/clientOrder'
import { modalsActionCreators } from '../../state/modals'
import { t, TRANSLATION } from '../../localization'
import Button from '../Button'
import ChatToggler from '../Chat/Toggler'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
})

const mapDispatchToProps = {
  setSelectedOrder: clientOrderActionCreators.setSelectedOrder,
  setCancelModal: modalsActionCreators.setCancelModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
  handleOrderClick: (order: IOrder) => any
}

function MiniOrders({
  activeOrders,
  setSelectedOrder,
  setCancelModal,
  className,
  handleOrderClick,
}: IProps) {
  if (!activeOrders?.length) return null

  return (
    <div className={cn('mini-orders', className)}>
      {
        activeOrders.map(order => {
          const payment = getPayment(order)
          const orderDriver = order?.drivers &&
            order
              ?.drivers
              .find(item => item.c_state !== EBookingDriverState.Canceled)

          return (
            <div
              key={order.b_id}
              className={cn({
                disabled: !order.drivers?.length &&
                  !order.b_voting &&
                  !candidateMode(order),
              })}
              onClick={() => handleOrderClick(order)}
            >
              <span className='order-id'>№ {order.b_id}</span>
              {
                <span>
                  {t(
                    !!order.drivers?.length ?
                      TRANSLATION.BOOKING_DRIVER_STATES[order.drivers[0].c_state || EBookingDriverState.Performer] :
                      TRANSLATION.SEARCH,
                  )}
                </span>
              }
              {/* TODO replace by real rating */}
              <img src={images.stars} alt={t(TRANSLATION.STARS)}/>
              <span>{order.b_estimate_waiting || 0} {t(TRANSLATION.MINUTES)}</span>
              <span>
                <img
                  src={getOrderIcon(order)}
                  width={20}
                  alt="type icon"
                />
                {getOrderCount(order)}
              </span>
              <span className={'order-amount colored' + (payment.type === EPaymentType.Customer ? ' _blue' : '')}>
                {payment.type === EPaymentType.Customer ? '⥮' : '~'}
                {typeof payment.value === 'number' ?
                  formatCurrency(payment.value) :
                  payment.value
                }
              </span>
              <Button
                type="button"
                text={t(TRANSLATION.CANCEL)}
                colorType={EColorTypes.Accent}
                onClick={() => {
                  setSelectedOrder(order.b_id)
                  setCancelModal(true)
                }}
              />
              {
                orderDriver && (
                  <ChatToggler
                    anotherUserID={orderDriver.u_id}
                    orderID={order.b_id}
                  />
                )
              }
            </div>
          )
        })
      }
    </div>
  )
}

export default connector(MiniOrders)