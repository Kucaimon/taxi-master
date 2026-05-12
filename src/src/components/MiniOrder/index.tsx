import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import {
  EBookingDriverState,
  EOrderProfitRank,
  IOrder,
  IUser,
} from '../../types/types'
import images from '../../constants/images'
import { CURRENCY } from '../../siteConstants'
import {
  EPaymentType,
  getOrderCount, getOrderIcon, getPayment,
} from '../../tools/utils'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { t, TRANSLATION } from '../../localization'
import { isOfferOrder } from '../../tools/driverOffer'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  activeChat: modalsSelectors.activeChat(state),
})

const mapDispatchToProps = {
  setActiveChat: modalsActionCreators.setActiveChat,
  setOrderCardModal: modalsActionCreators.setOrderCardModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  user: IUser,
  order: IOrder,
  onClick: (event: React.MouseEvent, id: IOrder['b_id']) => any,
  isHistory?: boolean
}

function MiniOrder({
  user,
  order,
  onClick,
  activeChat,
  setActiveChat,
  setOrderCardModal,
  isHistory,
}: IProps) {

  const payment = getPayment(order)
  const offerOrder = isOfferOrder(order)
  const driver = order?.drivers?.find(item => item.c_state !== EBookingDriverState.Canceled)

  const openChatModal = (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!order?.b_options?.createdBy) {
      const from = `${user?.u_id}_${order.b_id}`
      const to = `${order?.u_id}_${order.b_id}`
      const chatID = `${from};${to}`
      setActiveChat(activeChat === chatID ? null : chatID)
      return
    }

    switch (order.b_options.createdBy.toLowerCase()) {
      case 'sms':
        window.location.href = `tel:${order.user?.u_phone}`
        break
      case 'whatsapp':
        window.location.href = `https://wa.me/${order.user?.u_phone}`
        break
      default:
        const from = `${user?.u_id}_${order.b_id}`
        const to = `${order?.u_id}_${order.b_id}`
        const chatID = `${from};${to}`
        setActiveChat(activeChat === chatID ? null : chatID)
    }
  }


  return (<>
    <div
      className={cn(
        'mini-order',
        { 'mini-order--history': order.b_canceled || order.b_completed },
        order.profitRank !== undefined && `mini-order--profit--${{
          [EOrderProfitRank.Low]: 'low',
          [EOrderProfitRank.Medium]: 'medium',
          [EOrderProfitRank.High]: 'high',
        }[order.profitRank]}`,
      )}
      onClick={() => setOrderCardModal({ isOpen: true, orderId: order.b_id })}
    >
      <span className="colored">№{order.b_id}</span>

      {offerOrder && (
        <span className="mini-order__offer-badge">
          {t(TRANSLATION.CLIENT_OFFER_TITLE)}
        </span>
      )}

      {!isHistory && driver && driver.u_id === user.u_id && driver.c_state !== EBookingDriverState.Started && (
        <span
          className="mini-order__chat-btn"
          onClick={openChatModal}
        >
          {order?.b_options?.createdBy?.toLowerCase() === 'whatsapp' ?
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13.9355 11.7168C13.7227 11.6074 12.6621 11.0879 12.4648 11.0176C12.2676 10.9434 12.123 10.9082 11.9805 11.127C11.8359 11.3438 11.4258 11.8262 11.2969 11.9727C11.1719 12.1172 11.0449 12.1348 10.832 12.0273C9.56641 11.3945 8.73633 10.8984 7.90234 9.4668C7.68164 9.08594 8.12305 9.11328 8.53516 8.29102C8.60547 8.14648 8.57031 8.02344 8.51562 7.91406C8.46094 7.80469 8.03125 6.74609 7.85156 6.31445C7.67773 5.89453 7.49805 5.95312 7.36719 5.94531C7.24219 5.9375 7.09961 5.9375 6.95508 5.9375C6.81055 5.9375 6.57813 5.99219 6.38086 6.20508C6.18359 6.42188 5.62695 6.94336 5.62695 8.00195C5.62695 9.06055 6.39844 10.0859 6.50391 10.2305C6.61328 10.375 8.02148 12.5469 10.1836 13.4824C11.5508 14.0723 12.0859 14.123 12.7695 14.0215C13.1855 13.959 14.043 13.502 14.2207 12.9961C14.3984 12.4922 14.3984 12.0605 14.3457 11.9707C14.293 11.875 14.1484 11.8203 13.9355 11.7168Z" fill="white"></path><path d="M18.0703 6.60938C17.6289 5.56055 16.9961 4.61914 16.1894 3.81055C15.3828 3.00391 14.4414 2.36914 13.3906 1.92969C12.3164 1.47852 11.1758 1.25 9.99999 1.25H9.96093C8.77733 1.25586 7.63085 1.49023 6.55272 1.95117C5.51171 2.39648 4.57811 3.0293 3.77929 3.83594C2.98046 4.64258 2.3535 5.58008 1.91991 6.625C1.47069 7.70703 1.24413 8.85742 1.24999 10.041C1.25585 11.3965 1.58007 12.7422 2.18749 13.9453V16.9141C2.18749 17.4102 2.58983 17.8125 3.08593 17.8125H6.05663C7.25975 18.4199 8.60546 18.7441 9.96093 18.75H10.0019C11.1719 18.75 12.3066 18.5234 13.375 18.0801C14.4199 17.6445 15.3594 17.0195 16.1641 16.2207C16.9707 15.4219 17.6055 14.4883 18.0488 13.4473C18.5098 12.3691 18.7441 11.2227 18.75 10.0391C18.7558 8.84961 18.5254 7.69531 18.0703 6.60938ZM15.1191 15.1641C13.75 16.5195 11.9336 17.2656 9.99999 17.2656H9.96679C8.78905 17.2598 7.61913 16.9668 6.58593 16.416L6.42186 16.3281H3.67186V13.5781L3.58397 13.4141C3.03319 12.3809 2.74022 11.2109 2.73436 10.0332C2.72655 8.08594 3.47069 6.25781 4.83593 4.88086C6.19921 3.50391 8.02147 2.74219 9.96874 2.73438H10.0019C10.9785 2.73438 11.9258 2.92383 12.8183 3.29883C13.6894 3.66406 14.4707 4.18945 15.1426 4.86133C15.8125 5.53125 16.3398 6.31445 16.7051 7.18555C17.084 8.08789 17.2734 9.04492 17.2695 10.0332C17.2578 11.9785 16.4941 13.8008 15.1191 15.1641Z" fill="white"></path></svg> :
            order?.b_options?.createdBy?.toLowerCase() === 'sms' ?
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M17.5 2.5H2.5C1.675 2.5 1 3.175 1 4V16C1 16.825 1.675 17.5 2.5 17.5H17.5C18.325 17.5 19 16.825 19 16V4C19 3.175 18.325 2.5 17.5 2.5ZM17.5 5L10 10L2.5 5V4L10 9L17.5 4V5Z" fill="white"/>
              </svg> :
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M6.5 14.5L14.5 6.5M14.5 6.5L11.5 6M14.5 6.5L14.5 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
          }
        </span>
      )}

      <img src={images.stars} alt={t(TRANSLATION.STARS)}/>
      <span className="mini-order__time colored">0 {t(TRANSLATION.MINUTES)}</span>

      <span className="mini-order__icon">
        <img src={getOrderIcon(order)} alt="clients"/>
        {getOrderCount(order)}
      </span>

      <div className={cn('mini-order__amount', { '_blue': payment.type === EPaymentType.Customer })}>
        <div className="amount__value">{CURRENCY.SIGN}</div>
        <div className="amount__value">
          {payment.value + (order?.b_options?.pricingModel?.calculationType === 'incomplete' ? '+?' : '')}
        </div>
        {offerOrder && (
          <div className="amount__hint">
            {t(TRANSLATION.CLIENT_OFFER_DESIRED_PRICE_LABEL)}
          </div>
        )}
      </div>
    </div>
  </>)
}

export default connector(MiniOrder)