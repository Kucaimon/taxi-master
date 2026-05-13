import React from 'react'
import { t, TRANSLATION } from '../../../localization'
import { CURRENCY } from '../../../siteConstants'
import { getPayment } from '../../../tools/utils'
import OrderField from './OrderField'
import { EPaymentWays, IOrder } from '../../../types/types'
import images from '../../../constants/images'

interface IProps {
  order: IOrder
}

const Payment: React.FC<IProps> = ({ order }) => {
  const _type = order.b_payment_way === EPaymentWays.Credit ? TRANSLATION.CARD : TRANSLATION.CASH
  const _value = (order && order.b_options && order.b_options.customer_price) ?
    t(_type) + '. ' + t(TRANSLATION.WHAT_WE_DELIVERING) + ` ${order.b_options.customer_price} ${CURRENCY.SIGN}` :
    t(_type) + '. ' + t(TRANSLATION.FIXED) + ` ${getPayment(order).text} ${CURRENCY.SIGN}`

  return <div className="order-info__payment">
    <OrderField image={images.cash} alt={t(TRANSLATION.CARD)} title={t(TRANSLATION.PAYMENT_WAY)} value={_value}/>
  </div>
}

export default Payment