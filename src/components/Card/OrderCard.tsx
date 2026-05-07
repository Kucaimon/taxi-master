import React, { useEffect } from 'react'
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
  dateFormatDate,
  dateShowFormat,
  formatCommentWithEmoji,
  getOrderCount,
  getPayment,
  shortenAddress,
  formatCurrency,
} from '../../tools/utils'
import { formatAddress } from '../../tools/format'
import { useSelector } from '../../tools/hooks'
import {
  ordersDetailsSelectors,
  ordersDetailsActionCreators,
} from '../../state/ordersDetails'
import { modalsActionCreators } from '../../state/modals'
import { t, TRANSLATION } from '../../localization'
import { Loader } from '../loader/Loader'
import './styles.scss'

const mapDispatchToProps = {
  getOrderStart: ordersDetailsActionCreators.getOrderStart,
  setOrderCardModal: modalsActionCreators.setOrderCardModal,
}

const connector = connect(undefined, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  user: IUser,
  order: IOrder,
  className?: string,
  style?: React.CSSProperties,
  onClick?: React.PointerEventHandler<HTMLDivElement>,
  showChat?: boolean
}

function OrderCard({
  getOrderStart,
  setOrderCardModal,
  order,
  user,
  className,
  showChat,
  style,
  onClick,
}: IProps) {

  useEffect(() => {
    getOrderStart(order)
  }, [order])
  let address = useSelector(ordersDetailsSelectors.start, order.b_id)
  if (address && 'details' in address)
    address = {
      ...address,
      shortAddress: shortenAddress(
        address.address,
        address.details.city ||
        address.details.town ||
        address.details.village,
      ),
    }

  const getStatusText = () => {
    if (order.b_voting) return t(TRANSLATION.VOTER)
    return ''
  }

  const getStatusTextColor = () => {
    if (order.b_voting) return '#FF2400'
    // 'reccomended': return '#00A72F'\
    return 'rgba(0, 0, 0, 0.25)'
  }

  const driver = order.drivers?.find((item: any) => item.c_state > EBookingDriverState.Canceled)

  return (<>
    <div
      className={cn(
        'status-card colored',
        { 'status-card--history': order.b_canceled || order.b_completed },
        order.profitRank !== undefined && `status-card--profit--${{
          [EOrderProfitRank.Low]: 'low',
          [EOrderProfitRank.Medium]: 'medium',
          [EOrderProfitRank.High]: 'high',
        }[order.profitRank]}`,
        className,
      )}
      style={style}
      // onClick={onClick}
      onClick={() => setOrderCardModal({ isOpen: true, orderId: order.b_id })}
    >
      <div className="status-card__top" >
        <span className="status-card__time">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" ><path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="#FF2400" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.82996 5.33334V8.66668H11.1633" stroke="#FF2400" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <label>
            {
              order.b_voting &&
              driver?.c_state !== EBookingDriverState.Finished ?
                t(TRANSLATION.NOW) :
                order.b_start_datetime?.format(
                  order.b_options?.time_is_not_important ? dateFormatDate : dateShowFormat,
                )
            }
          </label>
        </span>
        <span className="status-card__number" style={{ color: getStatusTextColor() }}>№{order.b_id} {getStatusText()}</span>
      </div>
      <div>
        <span className="status-card__points">
          <div className="status-card__from">
            <span className="status-card__from-address">
              {t(TRANSLATION.FROM)}:
              {address ?
                <span>{formatAddress(address, { short: true })}</span> :
                order.b_start_address ?
                  <span>{order.b_start_address}</span> :
                  <Loader />
              }

              {t(TRANSLATION.TO)}:
              <span>
                {formatAddress(
                  {
                    address: order.b_destination_address,
                    latitude: order.b_destination_latitude,
                    longitude: order.b_destination_longitude,
                  },
                  { withCoords: true },
                )}
              </span>
            </span>
          </div>

          {/* <div className="status-card__to">
            <img src={images.turnBr} alt={t(TRANSLATION.TO)}/>
            <span>
              {order.b_destination_address || `${order.b_destination_latitude}, ${order.b_destination_longitude}`}
            </span>
          </div> */}
        </span>
      </div>
      <div className="status-card__separator separate status-card__money">

        {/* <span style={{ color: SITE_CONSTANTS.PALETTE.primary.light }}> */}
        <span className="status-card__cost">
          <img src={images.dollarMinimalistic} alt={t(TRANSLATION.CASH)}/> {getPayment(order).value} {CURRENCY.NAME}
        </span>

        {order.profit &&
          <span className="status-card__profit">
            {formatCurrency(order.profit, { signDisplay: 'always' })}
          </span>
        }
      </div>
      <div className="status-card__comments">
        <p>{formatCommentWithEmoji(order.b_comments)?.map(({ src }) => <img src={src} />)}</p>
        {
          !(order.b_comments?.includes('97') || order.b_comments?.includes('98')) &&
            <span className='status-card__seats'>
              {/* <img
                src={getOrderIcon(order)}
                alt={t(TRANSLATION.SEATS)}
              /> */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" ><circle cx="6.00004" cy="4.00001" r="2.66667" stroke="#FF2400"/><path d="M10 6C11.1046 6 12 5.10457 12 4C12 2.89543 11.1046 2 10 2" stroke="#FF2400" strokeLinecap="round"/><ellipse cx="6.00004" cy="11.3333" rx="4.66667" ry="2.66667" stroke="#FF2400"/><path d="M12 9.33334C13.1695 9.58981 14 10.2393 14 11C14 11.6862 13.3242 12.282 12.3333 12.5803" stroke="#FF2400" strokeLinecap="round"/></svg>
              <label>{getOrderCount(order)}</label>
            </span>
        }
      </div>
      {
        // driver?.c_state !== EBookingDriverState.Finished && <div className="status-card__other-info">
        //   <span>
        //     {/* TODO real time */}
        //     {t(TRANSLATION.APPROXIMATE_TIME)}: 1 {t(TRANSLATION.HOUR)}
        //     <img src={images.clockGrey} alt={t(TRANSLATION.CLOCK)}/>
        //   </span>
        //   <img src={images.stars} alt={t(TRANSLATION.STARS)}/>
        // </div>
      }
    </div>
  </>)
}

export default connector(OrderCard)