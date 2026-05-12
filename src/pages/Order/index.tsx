import React, { useEffect, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useParams, useNavigate } from 'react-router-dom'
import PageSection from '../../components/PageSection'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { addHiddenOrder, distanceBetweenEarthCoordinates } from '../../tools/utils'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
import ClientInfo from '../../components/order/ClientInfo'
import OrderInfo from '../../components/order/orderInfo/index'
import LoadFrame from '../../components/LoadFrame'
import { IRootState } from '../../state'
import { useInterval } from '../../tools/hooks'
import { EBookingDriverState, EBookingStates, EColorTypes, EStatuses } from '../../types/types'
import images from '../../constants/images'
import { useForm } from 'react-hook-form'
import './styles.scss'
import ChatToggler from '../../components/Chat/Toggler'
import { orderSelectors, orderActionCreators } from '../../state/order'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import {
  geolocationActionCreators,
  geolocationSelectors,
} from '../../state/geolocation'
import { EMapModalTypes } from '../../state/modals/constants'
import { withLayout } from '../../HOCs/withLayout'

const mapStateToProps = (state: IRootState) => ({
  order: orderSelectors.order(state),
  client: orderSelectors.client(state),
  start: orderSelectors.start(state),
  destination: orderSelectors.destination(state),
  status: orderSelectors.status(state),
  message: orderSelectors.message(state),
  user: userSelectors.user(state),
  geoposition: geolocationSelectors.geoposition(state),
})

const mapDispatchToProps = {
  getOrder: orderActionCreators.getOrder,
  setOrder: orderActionCreators.setOrder,
  setCancelDriverOrderModal: modalsActionCreators.setDriverCancelModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  setAlarmModal: modalsActionCreators.setAlarmModal,
  setLoginModal: modalsActionCreators.setLoginModal,
  setMapModal: modalsActionCreators.setMapModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  watchGeolocation: geolocationActionCreators.watch,
  activateGeolocationSending: geolocationActionCreators.activateSending,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IFormValues {
  votingNumber: number
  performers_price: number
}

interface IProps extends ConnectedProps<typeof connector> {}

const DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY = 'driverStartedVotingOrderIds'

function saveStartedVotingOrderId(orderId: string) {
  try {
    const value = localStorage.getItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY)
    const ids: string[] = value ? JSON.parse(value) : []
    const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
    localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify(nextIds))
  } catch {
    localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify([orderId]))
  }
}

const Order: React.FC<IProps> = ({
  order,
  client,
  start,
  destination,
  status,
  message,
  user,
  geoposition,
  getOrder,
  setOrder,
  setMapModal,
  setRatingModal,
  setCancelDriverOrderModal,
  setMessageModal,
  setAlarmModal,
  watchGeolocation,
  activateGeolocationSending,
}) => {
  const [isFromAddressShort, setIsFromAddressShort] = useState(true)
  const [isToAddressShort, setIsToAddressShort] = useState(true)
  const [votingParticipationIds, setVotingParticipationIds] = useState(() =>
    getStoredVotingParticipationIds(),
  )
  const [votingArrivedIds, setVotingArrivedIds] = useState(() =>
    getStoredVotingArrivedIds(),
  )
  const [now, setNow] = useState(Date.now())
  const [votingCloseHandled, setVotingCloseHandled] = useState(false)

  const id = useParams().id as string
  const navigate = useNavigate()

  const driver = order?.drivers?.find(item => order.b_voting ?
    isVotingDriverParticipating(item) :
    item.c_state > EBookingDriverState.Canceled)
  const userAsDriver = order?.drivers?.find(item => item.u_id === user?.u_id)
  const isVotingParticipant = Boolean(
    order?.b_voting &&
    (
      votingParticipationIds.includes(id) ||
      isVotingDriverParticipating(userAsDriver)
    ),
  )
  const isVotingArrived = Boolean(
    order?.b_voting &&
    (userAsDriver?.c_state === EBookingDriverState.Arrived || votingArrivedIds.includes(id)),
  )
  const votingInfo = getVotingInfo(order, user?.u_id, now)

  const { register, formState: { errors }, handleSubmit: formHandleSubmit, getValues } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'onSubmit',
  })

  const orderMapFromPoint = start?.latitude && start.longitude ? start : (
    order?.b_start_latitude && order.b_start_longitude ? {
      address: order.b_start_address,
      latitude: order.b_start_latitude,
      longitude: order.b_start_longitude,
    } : null
  )
  const orderMapToPoint = destination?.latitude && destination.longitude ? destination : (
    order?.b_destination_latitude && order.b_destination_longitude ? {
      address: order.b_destination_address,
      latitude: order.b_destination_latitude,
      longitude: order.b_destination_longitude,
    } : null
  )
  const openOrderPointOnMap = (highlight: 'from' | 'to') => {
    const point = highlight === 'from' ? orderMapFromPoint : orderMapToPoint

    setMapModal({
      isOpen: true,
      type: EMapModalTypes.OrderDetails,
      defaultCenter: point?.latitude && point.longitude ?
        [point.latitude, point.longitude] :
        null,
      from: orderMapFromPoint,
      to: orderMapToPoint,
      highlight,
    })
  }

  useEffect(() => {
    getOrder(id)
    return () => {
      setOrder(null)
    }
  }, [])

  useInterval(() => {
    getOrder(id)
  }, 3000)

  useEffect(() => {
    if (!order?.b_voting)
      return

    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [order?.b_voting])

  useEffect(() => {
    if (!isVotingParticipant)
      return

    const unwatch = watchGeolocation({ interval: 3000 })
    const deactivateSending = activateGeolocationSending()

    return () => {
      deactivateSending()
      unwatch()
    }
  }, [isVotingParticipant, watchGeolocation, activateGeolocationSending])

  useEffect(() => {
    if (order || !votingParticipationIds.includes(id))
      return

    setVotingParticipationIds(removeVotingParticipationId(id))
    setVotingArrivedIds(removeVotingArrivedId(id))
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message: t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_CLIENT),
    })
    navigate('/driver-order')
  }, [order, id, votingParticipationIds])

  useEffect(() => {
    if (!order?.b_voting || !isVotingParticipant || votingCloseHandled)
      return

    const closeReason = getVotingCloseMessage(order, user?.u_id)
    if (!closeReason)
      return

    setVotingCloseHandled(true)
    setVotingParticipationIds(removeVotingParticipationId(id))
    setVotingArrivedIds(removeVotingArrivedId(id))
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message: closeReason,
    })
    navigate('/driver-order')
  }, [order, isVotingParticipant, votingCloseHandled, user?.u_id])

  const handleSubmit = () => {
    const isCandidate = ['96', '95'].some(item => order?.b_comments?.includes(item))

    if (order?.b_voting) {
      if (isVotingDriverParticipating(userAsDriver)) {
        const nextIds = saveVotingParticipationId(id)
        setVotingParticipationIds(nextIds)
        return
      }

      API.participateVotingOrder(id, getValues().performers_price)
        .then(() => {
          const nextIds = saveVotingParticipationId(id)
          setVotingParticipationIds(nextIds)
          getOrder(id)
          setMessageModal({
            isOpen: true,
            status: EStatuses.Success,
            message: t(TRANSLATION.DRIVER_VOTING_READY_SENT),
          })
        })
        .catch(error => {
          if (isAlreadyVotingParticipantError(error)) {
            const nextIds = saveVotingParticipationId(id)
            setVotingParticipationIds(nextIds)
            getOrder(id)
            setMessageModal({
              isOpen: true,
              status: EStatuses.Success,
              message: t(TRANSLATION.DRIVER_VOTING_READY_SENT),
            })
            return
          }
          console.error(error)
          setMessageModal({
            isOpen: true,
            message: error.toString() || t(TRANSLATION.ERROR),
            status: EStatuses.Fail,
          })
        })
      return
    }

    API.takeOrder(id, { ...getValues() }, isCandidate)
      .then(() => {
        getOrder(id)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: isCandidate ? t(TRANSLATION.YOUR_OFFER_SENT) : t(TRANSLATION.YOUR_ORDER_DESCRIPTION),
        })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: error.toString() || t(TRANSLATION.ERROR),
          status: EStatuses.Fail,
        })
      })
  }

  const onHideOrder = () => {
    addHiddenOrder(id, user?.u_id)
    navigate('/driver-order')
  }

  const onArrivedClick = () =>
    API.setOrderState(id, EBookingDriverState.Arrived)
      .then(() => getOrder(id))
      .catch(error => {
        console.error(error)
        setMessageModal({ isOpen: true, message: t(TRANSLATION.ERROR), status: EStatuses.Fail })
      })

  const onStartedClick = () =>
    API.setOrderState(id, EBookingDriverState.Started)
      .then(() => {
        getOrder(id)
        navigate('/driver-order?tab=map')
      })

  const onCompleteOrderClick = () => {
    if (!driver?.c_started) {
      setMessageModal({ 
        isOpen: true, 
        status: EStatuses.Fail, 
        message: t(TRANSLATION.ERROR)
      })
      return
    }

    
    API.setOrderState(id, EBookingDriverState.Finished)
      .then(() => {
        getOrder(id)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.TRIP, { })
        })
        setRatingModal({ isOpen: true })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({ 
          isOpen: true, 
          status: EStatuses.Fail, 
          message: t(TRANSLATION.ERROR) 
        })
      })
  }

  const onAlarmClick = () =>
    setAlarmModal({ isOpen: true })

  const onRateOrderClick = () =>
    setRatingModal({ isOpen: true })

  const onExit = () =>
    navigate('/driver-order')

  const onVotingCancelDeparture = () => {
    API.cancelVotingParticipation(id)
      .then(() => {
        const nextIds = removeVotingParticipationId(id)
        const nextArrivedIds = removeVotingArrivedId(id)
        setVotingParticipationIds(nextIds)
        setVotingArrivedIds(nextArrivedIds)
        getOrder(id)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.DRIVER_VOTING_CANCELLED),
        })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: t(TRANSLATION.ERROR),
        })
      })
  }

  const onVotingArrived = () => {
    Promise.resolve()
      .then(() => {
        if (
          userAsDriver?.c_state === EBookingDriverState.Performer ||
          userAsDriver?.c_state === EBookingDriverState.Started
        )
          return API.setOrderState(id, EBookingDriverState.Arrived)
      })
      .catch(error => {
        if (!isNotAppointedPerformerError(error))
          throw error
      })
      .then(() => API.arrivedVotingOrder(id))
      .catch(error => {
        if (!isNotAppointedPerformerError(error))
          throw error
      })
      .then(() => {
        const nextIds = saveVotingArrivedId(id)
        setVotingArrivedIds(nextIds)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.DRIVER_VOTING_ARRIVED_SENT),
        })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: t(TRANSLATION.ERROR),
        })
      })
  }

  const onVotingNavigation = () => {
    setMapModal({
      isOpen: true,
      type: EMapModalTypes.VotingNavigation,
      defaultCenter: order?.b_start_latitude &&
        order?.b_start_longitude ?
        [order.b_start_latitude, order.b_start_longitude] :
        null,
      from: geoposition ? {
        latitude: geoposition.coords.latitude,
        longitude: geoposition.coords.longitude,
      } : null,
      to: order?.b_start_latitude && order?.b_start_longitude ? {
        address: order.b_start_address,
        latitude: order.b_start_latitude,
        longitude: order.b_start_longitude,
      } : null,
    })
  }

  const onVotingConfirmCode = () => {
    const isCandidate = ['96', '95'].some(item => order?.b_comments?.includes(item))

    API.takeOrder(id, { ...getValues() }, isCandidate)
      .then(() => API.confirmVotingCode(id, getValues().votingNumber))
      .then(() => API.setOrderState(id, EBookingDriverState.Started))
      .then(() => {
        saveStartedVotingOrderId(id)
        setVotingParticipationIds(removeVotingParticipationId(id))
        setVotingArrivedIds(removeVotingArrivedId(id))
        getOrder(id)
        navigate('/driver-order?tab=map')
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: error.toString() || t(TRANSLATION.ERROR),
          status: EStatuses.Fail,
        })
      })
  }

  const getButtons = () => {
    if (!order) return (
      <Button
        text={t(TRANSLATION.EXIT_NOT_AVIABLE)}
        className="order_take-order-btn"
        onClick={onExit}
        label={message}
        status={status}
      />
    )

    if (driver?.c_state === EBookingDriverState.Finished && driver?.c_rating) return (
      <Button
        text={t(TRANSLATION.EXIT)}
        className="order_take-order-btn"
        onClick={onExit}
        label={message}
        status={status}
      />)
    if (order.b_state === EBookingStates.Canceled) return (
      <Button
        text={t(TRANSLATION.EXIT_USER_CANCELLED)}
        className="order_take-order-btn"
        onClick={onExit}
        label={message}
        status={status}
      />
    )
    if (order?.b_voting && isVotingParticipant) return <>
      <div className="voting-participation order__voting-participation">
        <div className="voting-participation__status">
          {votingInfo.remaining ?
            `${t(TRANSLATION.DRIVER_VOTING_WAITING)}: ${votingInfo.remaining}` :
            t(TRANSLATION.DRIVER_VOTING_STATUS_PARTICIPATING)
          }
        </div>
        <div>{t(TRANSLATION.DRIVER_VOTING_COMPETITORS)}: {votingInfo.competitorsCount}</div>
        {!!votingInfo.nearestCompetitors.length &&
          <div className="voting-participation__nearest">
            <div>{t(TRANSLATION.DRIVER_VOTING_NEAREST_COMPETITORS)}:</div>
            <ul>
              {votingInfo.nearestCompetitors.map((item: { name: string, distance: string }) =>
                <li key={`${item.name}-${item.distance}`}>
                  <span>{item.name}</span>
                  <b>{item.distance}</b>
                </li>,
              )}
            </ul>
          </div>
        }
      </div>
      <Button
        text={t(TRANSLATION.DRIVER_VOTING_NAVIGATION)}
        className="order_take-order-btn"
        onClick={onVotingNavigation}
        disabled={!canOpenVotingNavigation(order, geoposition)}
        label={message}
        status={status}
      />
      {isVotingArrived && (
        <Input
          inputProps={{
            ...register('votingNumber', {
              required: t(TRANSLATION.REQUIRED_FIELD),
              min: 0,
              max: 9,
              valueAsNumber: true,
            }),
            type: 'number',
            min: 0,
            max: 9,
          }}
          error={errors?.votingNumber?.message}
          label={t(TRANSLATION.DRIVE_NUMBER)}
        />
      )}
      {isVotingArrived && (
        <Button
          text={t(TRANSLATION.DRIVER_VOTING_CONFIRM_CODE)}
          className="order_take-order-btn"
          onClick={onVotingConfirmCode}
          label={message}
          status={status}
        />
      )}
      {!isVotingArrived && (
        <Button
          text={t(TRANSLATION.DRIVER_VOTING_ARRIVED)}
          className="order_take-order-btn"
          onClick={onVotingArrived}
          disabled={!canMarkVotingArrived(order, geoposition, user?.u_id)}
          label={message}
          status={status}
        />
      )}
      <Button
        text={t(TRANSLATION.DRIVER_VOTING_CANCEL_DEPARTURE)}
        className="order_hide-order-btn"
        onClick={onVotingCancelDeparture}
        label={message}
        status={status}
      />
    </>

    if (!driver || order?.b_voting) return <>
      {['96', '95'].some(item => order?.b_comments?.includes(item)) && (
        <Input
          inputProps={{
            ...register('performers_price', { required: t(TRANSLATION.REQUIRED_FIELD), min: 0, valueAsNumber: true }),
            type: 'number',
            min: 0,
          }}
          error={errors?.performers_price?.message}
          label={t(TRANSLATION.PRICE_PERFORMER)}
          oneline
        />
      )}
      {order.drivers?.find(i => i.u_id === user?.u_id)?.c_state !== EBookingDriverState.Considering && (<>
        <Button
          text={t(
            order?.b_voting ?
              TRANSLATION.DRIVER_VOTING_GOING_ACTION :
              ['96', '95'].some(item => order?.b_comments?.includes(item)) ?
                TRANSLATION.MAKE_OFFER :
                TRANSLATION.TAKE_ORDER,
          )}
          type="submit"
          className="order_take-order-btn"
          label={message}
          status={status}
        />
        <Button
          text={t(TRANSLATION.HIDE_ORDER)}
          className="order_hide-order-btn"
          onClick={onHideOrder}
        />
      </>)}
    </>
    if (driver?.c_state === EBookingDriverState.Performer) return (
      <Button
        text={t(TRANSLATION.ARRIVED)}
        className="order_take-order-btn"
        onClick={onArrivedClick}
        label={message}
        status={status}
      />
    )
    if (driver?.c_state === EBookingDriverState.Arrived) return <>
      <Button
        text={t(TRANSLATION.WENT)}
        className="order_take-order-btn"
        onClick={onStartedClick}
        label={message}
        status={status}
      />
      <Button
        text={t(TRANSLATION.CANCEL_ORDER)}
        className="order_hide-order-btn"
        onClick={() => setCancelDriverOrderModal(true)}
        label={message}
        status={status}
      />
    </>
    if (driver?.c_state === EBookingDriverState.Started) return <>
      <Button
        text={t(TRANSLATION.CLOSE_DRIVE)}
        className="order_take-order-btn"
        onClick={onCompleteOrderClick}
        label={message}
        status={status}
      />
      <Button
        text={`${t(TRANSLATION.ALARM)}`}
        className="order_alarm-btn"
        onClick={onAlarmClick}
        colorType={EColorTypes.Accent}
        label={message}
        status={status}
      />
    </>
    if (driver?.c_state === EBookingDriverState.Finished) return <>
      <Button
        text={t(TRANSLATION.RATE_DRIVE)}
        className="order_take-order-btn"
        onClick={onRateOrderClick}
        label={message}
        status={status}
      />
    </>
  }

  return status === EStatuses.Loading && !order ?
    <LoadFrame/> :
    <PageSection className="order">
      {!!order ?
        (
          <form onSubmit={formHandleSubmit(handleSubmit)}>
            <ClientInfo order={order} client={client} user={user}/>
            <div className="order__from-to colored">
              <div className='estimate-time'>
                {t(TRANSLATION.ESTIMATE_TIME)}:&nbsp;
                {order.b_estimate_waiting || 0 / 60} {t(TRANSLATION.MINUTES)}
              </div>
              <h3>{order.b_options?.object ? `${t(TRANSLATION.PICK_UP_PACKAGE)}:` : t(TRANSLATION.ADDRESSES)}</h3>
              <div className='from'>
                <label>
                  {isFromAddressShort && start?.shortAddress ? start?.shortAddress : start?.address}
                </label>
                <div className="from__buttons">
                  {start?.shortAddress && (
                    <img
                      src={isFromAddressShort ? images.minusIcon : images.plusIcon}
                      onClick={(e) => setIsFromAddressShort(prev => !prev)}
                      alt='change address mode'
                    />
                  )}
                  <img
                    src={images.markerYellow}
                    alt="marker"
                    className='address-marker'
                    onClick={() => {
                      openOrderPointOnMap('from')
                    }}
                  />
                </div>
              </div>
              <div className="order-fields">
                <label>
                  {
                    !!order.b_options?.from_tel &&(
                      <a
                        className="phone-link"
                        href={`tel:${order.b_options.from_tel}`}
                      >{order.b_options.from_tel}</a>
                    )
                  }
                </label>
              </div>
              <div className='from-delivery'>
                {
                  order.b_options?.from_porch &&
                      (
                        <div className='group'>
                          <span>{t(TRANSLATION.PORCH)} <b>{order.b_options.from_porch}</b></span>
                          <span>{t(TRANSLATION.FLOOR)} <b>{order.b_options.from_floor}</b></span>
                          <span>{t(TRANSLATION.ROOM)} <b>{order.b_options.from_room}</b></span>
                        </div>
                      )
                }
                {
                  order.b_options?.from_way && (
                    <span className='way'>
                      <b>{t(order.b_comments?.includes('96') ? TRANSLATION.COMMENT : TRANSLATION.WAY)}:</b>&nbsp;
                      {order.b_options.from_way || t(TRANSLATION.NOT_SPECIFIED, { toLower: true })}
                    </span>
                  )
                }
                {
                  !order.b_comments?.includes('96') && order.b_options?.from_day && (
                    <span
                      className='time'
                    >
                      <b>{t(TRANSLATION.TAKE)}:</b>&nbsp;
                      {order.b_options.from_day}, {t(TRANSLATION.TIME_FROM, { toLower: true })}&nbsp;
                      {order.b_options.from_time_from} {t(TRANSLATION.TIME_TILL, { toLower: true })}&nbsp;
                      {order.b_options.from_time_to || t(TRANSLATION.NO_MATTER, { toLower: true })}
                    </span>
                  )
                }
                {
                  order.b_options?.from_tel && (
                    <span className='way'><b>{t(TRANSLATION.PHONE_TO_CALL)}:</b> {order.b_options.from_tel}
                      <img
                        src={images.phone}
                        alt={t(TRANSLATION.PHONE)}
                      />
                    </span>
                  )
                }
                {/* <div className="order__separator"/> */}
              </div>
              {order.b_options?.object &&
                <h3>{`${t(TRANSLATION.DELIVER_PACKAGE)}:`}</h3>}
              {(destination?.address || destination?.latitude || destination?.longitude) && (
                <div className='to'>
                  <label>
                    {isToAddressShort && destination?.shortAddress ? destination?.shortAddress : destination?.address}
                  </label>
                  <div className="to__buttons">
                    {destination?.shortAddress && (
                      <img
                        src={isToAddressShort ? images.minusIcon : images.plusIcon}
                        onClick={() => setIsToAddressShort(prev => !prev)}
                        alt='change address mode'
                      />
                    )}
                    <img
                      src={images.markerGreen}
                      alt="marker"
                      className='address-marker'
                      onClick={
                        () => {
                          openOrderPointOnMap('to')
                        }
                      }
                    />
                  </div>
                </div>
              )}
              <div className='to-delivery'>
                {
                  order.b_options?.to_porch &&
                    (
                      <div className='group'>
                        <span>{t(TRANSLATION.PORCH)} <b>{order.b_options.to_porch}</b></span>
                        <span>{t(TRANSLATION.FLOOR)} <b>{order.b_options.to_floor}</b></span>
                        <span>{t(TRANSLATION.ROOM)} <b>{order.b_options.to_room}</b></span>
                      </div>
                    )
                }
                {
                  order.b_options?.to_way && (
                    <span className='way'>
                      <b>{t(order.b_comments?.includes('96') ? TRANSLATION.COMMENT : TRANSLATION.WAY)}:</b>&nbsp;
                      {order.b_options.to_way || t(TRANSLATION.NOT_SPECIFIED, { toLower: true })}
                    </span>
                  )
                }
                {
                  !order.b_comments?.includes('96') && order.b_options?.to_day && (
                    <span
                      className='time'
                    >
                      <b>{t(TRANSLATION.TAKE)}:</b>&nbsp;
                      {order.b_options.to_day}, {t(TRANSLATION.TIME_FROM, { toLower: true })}&nbsp;
                      {order.b_options.to_time_from} {t(TRANSLATION.TIME_TILL, { toLower: true })}&nbsp;
                      {order.b_options.to_time_to || t(TRANSLATION.NO_MATTER, { toLower: true })}
                    </span>
                  )
                }
                {
                  order.b_options?.to_tel && (
                    <span className='way'><b>{t(TRANSLATION.PHONE_TO_CALL)}:</b> {order.b_options.to_tel}
                      <img
                        src={images.phone}
                        alt={t(TRANSLATION.PHONE)}
                      />
                    </span>
                  )
                }
              </div>
            </div>
            <div className="order__separator"/>

            <OrderInfo order={order}/>
            {getButtons()}
            {
              driver && driver.u_id === user?.u_id && (
                <ChatToggler
                  anotherUserID={order.u_id}
                  orderID={order.b_id}
                />
              )
            }
          </form>
        ) :
        t(TRANSLATION.NOT_AVIABLE_ORDER)
      }
    </PageSection>
}

export default withLayout(connector(Order))

const VOTING_PARTICIPATION_STORAGE_KEY = 'driverVotingParticipations'
const VOTING_ARRIVED_STORAGE_KEY = 'driverVotingArrived'

function getStoredVotingParticipationIds(): string[] {
  try {
    const value = localStorage.getItem(VOTING_PARTICIPATION_STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function saveVotingParticipationId(orderId: string) {
  const ids = getStoredVotingParticipationIds()
  const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
  localStorage.setItem(VOTING_PARTICIPATION_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function removeVotingParticipationId(orderId: string) {
  const nextIds = getStoredVotingParticipationIds().filter(id => id !== orderId)
  localStorage.setItem(VOTING_PARTICIPATION_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function getStoredVotingArrivedIds(): string[] {
  try {
    const value = localStorage.getItem(VOTING_ARRIVED_STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function saveVotingArrivedId(orderId: string) {
  const ids = getStoredVotingArrivedIds()
  const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
  localStorage.setItem(VOTING_ARRIVED_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function removeVotingArrivedId(orderId: string) {
  const nextIds = getStoredVotingArrivedIds().filter(id => id !== orderId)
  localStorage.setItem(VOTING_ARRIVED_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function hasAnotherVotingDriverReached(order?: any, userId?: string) {
  return order?.drivers?.some((driver: any) =>
    driver.u_id !== userId &&
    [
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(driver.c_state),
  ) ?? false
}

function canMarkVotingArrived(order?: any, geoposition?: GeolocationPosition, userId?: string) {
  if (!order?.b_start_latitude || !order.b_start_longitude || !geoposition)
    return false
  if (hasAnotherVotingDriverReached(order, userId))
    return false

  const distanceMeters = distanceBetweenEarthCoordinates(
    geoposition.coords.latitude,
    geoposition.coords.longitude,
    order.b_start_latitude,
    order.b_start_longitude,
  ) * 1000

  return distanceMeters <= 100
}

function canOpenVotingNavigation(order?: any, geoposition?: GeolocationPosition) {
  return Boolean(
    order?.b_start_latitude &&
    order.b_start_longitude,
  )
}

function isVotingDriverParticipating(driver?: { c_state?: EBookingDriverState } | null) {
  return !!driver && [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
  ].includes(driver.c_state!)
}

function getVotingInfo(
  order: any,
  userId: string | undefined,
  now: number,
) {
  const competitors = order?.drivers?.filter((driver: any) =>
    driver.u_id !== userId &&
    isVotingDriverParticipating(driver),
  ) ?? []
  const distances = competitors
    .map((driver: any) => {
      if (
        !driver.c_latitude ||
        !driver.c_longitude ||
        !order?.b_start_latitude ||
        !order.b_start_longitude
      )
        return null

      return {
        name: getVotingDriverName(driver),
        distance: distanceBetweenEarthCoordinates(
          driver.c_latitude,
          driver.c_longitude,
          order.b_start_latitude,
          order.b_start_longitude,
        ) * 1000,
      }
    })
    .filter((item: unknown): item is { name: string, distance: number } => !!item)
    .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)

  return {
    competitorsCount: competitors.length,
    nearestCompetitor: distances[0] ? formatVotingDistance(distances[0].distance) : '',
    nearestCompetitors: distances.slice(0, 3).map((item: { name: string, distance: number }) => ({
      name: item.name,
      distance: formatVotingDistance(item.distance),
    })),
    remaining: formatVotingRemaining(order, now),
  }
}

function getVotingDriverName(driver: any) {
  const name = [
    driver?.u_name,
    driver?.u_family,
    driver?.user?.u_name,
    driver?.user?.u_family,
  ].filter(Boolean).join(' ').trim()

  return name || t(TRANSLATION.DRIVER)
}

function formatVotingDistance(distanceMeters: number) {
  if (distanceMeters < 1000)
    return `${Math.round(distanceMeters / 10) * 10} м`

  return `${(distanceMeters / 1000).toFixed(1)} км`
}

function formatVotingRemaining(order: any, now: number) {
  if (typeof order?.remaining_lifetime_seconds === 'number')
    return formatSeconds(Math.max(order.remaining_lifetime_seconds, 0))

  if (!order?.b_max_waiting || !order.b_created)
    return ''

  const createdAt = order.b_created.valueOf()
  const remainingSeconds = Math.max(
    Math.round(order.b_max_waiting - (now - createdAt) / 1000),
    0,
  )
  return formatSeconds(remainingSeconds)
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getVotingCloseMessage(order: any, userId?: string) {
  const currentDriver = order.drivers?.find((driver: any) => driver.u_id === userId)
  const anotherDriverStarted = order.drivers?.some((driver: any) =>
    driver.u_id !== userId &&
    [
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(driver.c_state),
  )
  if (
    currentDriver &&
    isVotingDriverParticipating(currentDriver) &&
    anotherDriverStarted
  )
    return t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_OTHER)

  if (order.b_state === EBookingStates.Canceled)
    return t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_CLIENT)

  if (order.b_state === EBookingStates.Completed)
    return t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_OTHER)

  if (typeof order.remaining_lifetime_seconds === 'number' &&
    order.remaining_lifetime_seconds <= 0)
    return t(TRANSLATION.DRIVER_VOTING_CLOSED_TIMEOUT)

  return ''
}

function getApiErrorText(error: any) {
  return [
    error?.message,
    error?.error,
    error?.info,
    error?.data?.message,
    error?.data?.error,
    error?.data?.info,
    JSON.stringify(error),
  ].filter(Boolean).join(' ').toLowerCase()
}

function isAlreadyVotingParticipantError(error: any) {
  const text = getApiErrorText(error)
  return text.includes('already performer') || text.includes('booking driver state 2')
}

function isNotAppointedPerformerError(error: any) {
  return getApiErrorText(error).includes('not appointed performer')
}
