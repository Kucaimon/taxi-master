import React, { useEffect, useMemo, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import cn from 'classnames'
import * as API from '../../API'
import {
  EBookingDriverState,
  EBookingStates,
  EColorTypes,
  EPaymentWays,
  EStatuses,
  EOrderProfitRank,
  IAddressDetails,
  IOrder,
} from '../../types/types'
import images from '../../constants/images'
import SITE_CONSTANTS, { CURRENCY } from '../../siteConstants'
import {
  addHiddenOrder,
  dateFormatDate,
  dateShowFormat,
  formatCommentWithEmoji,
  getOrderCount,
  getPayment,
  formatCurrency,
  distanceBetweenEarthCoordinates,
} from '../../tools/utils'
import {
  calculateFinalPrice,
  calculateFinalPriceFormula,
  candidateMode,
} from '../../tools/order'
import { getApiErrorMessage } from '../../tools/apiMessages'
import { useCachedState, useSelector } from '../../tools/hooks'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { EMapModalTypes } from '../../state/modals/constants'
import { ordersSelectors, ordersActionCreators } from '../../state/orders'
import { orderActionCreators } from '../../state/order'
import {
  geolocationActionCreators,
  geolocationSelectors,
} from '../../state/geolocation'
import {
  ordersDetailsSelectors,
  ordersDetailsActionCreators,
} from '../../state/ordersDetails'
import { userSelectors } from '../../state/user'
import { configSelectors } from '../../state/config'
import { EDriverTabs } from '../../pages/Driver'
import Icon from '../Icon'
import Button from '../Button'
import Input from '../Input'
import { Loader } from '../loader/Loader'
import '../Card/styles.scss'

const bookingStates: Record<number, keyof typeof EBookingStates> = {
  1: 'Processing',
  2: 'Approved',
  3: 'Canceled',
  4: 'Completed',
  5: 'PendingActivation',
  6: 'OfferedToDrivers',
}

const VOTING_PARTICIPATION_STORAGE_KEY = 'driverVotingParticipations'
const VOTING_ARRIVED_STORAGE_KEY = 'driverVotingArrived'
const DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY = 'driverStartedVotingOrderIds'

function getStoredVotingParticipationIds(): string[] {
  try {
    const value = localStorage.getItem(VOTING_PARTICIPATION_STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function saveVotingParticipationId(orderId: IOrder['b_id']) {
  const ids = getStoredVotingParticipationIds()
  const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
  localStorage.setItem(VOTING_PARTICIPATION_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function removeVotingParticipationId(orderId: IOrder['b_id']) {
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

function saveVotingArrivedId(orderId: IOrder['b_id']) {
  const ids = getStoredVotingArrivedIds()
  const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
  localStorage.setItem(VOTING_ARRIVED_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function removeVotingArrivedId(orderId: IOrder['b_id']) {
  const nextIds = getStoredVotingArrivedIds().filter(id => id !== orderId)
  localStorage.setItem(VOTING_ARRIVED_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function saveStartedVotingOrderId(orderId: IOrder['b_id']) {
  try {
    const value = localStorage.getItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY)
    const ids: string[] = value ? JSON.parse(value) : []
    const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
    localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify(nextIds))
  } catch {
    localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify([orderId]))
  }
}

function hasAnotherVotingDriverReached(order: IOrder | null, userId?: string) {
  return order?.drivers?.some(driver =>
    driver.u_id !== userId &&
    [
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(driver.c_state),
  ) ?? false
}

function canMarkVotingArrived(
  order: IOrder | null,
  geoposition?: GeolocationPosition,
  userId?: string,
) {
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

function canOpenVotingNavigation(order: IOrder | null, geoposition?: GeolocationPosition) {
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
  order: IOrder | null,
  userId: string | undefined,
  now: number,
) {
  const competitors = order?.drivers?.filter(driver =>
    driver.u_id !== userId &&
    isVotingDriverParticipating(driver),
  ) ?? []
  const distances = competitors
    .map(driver => {
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
    .filter((item): item is { name: string, distance: number } => !!item)
    .sort((a, b) => a.distance - b.distance)

  return {
    competitorsCount: competitors.length,
    nearestCompetitor: distances[0] ? formatVotingDistance(distances[0].distance) : '',
    nearestCompetitors: distances.slice(0, 3).map(item => ({
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

  return name || 'Водитель'
}

function formatVotingDistance(distanceMeters: number) {
  if (distanceMeters < 1000)
    return `${Math.round(distanceMeters / 10) * 10} м`

  return `${(distanceMeters / 1000).toFixed(1)} км`
}

function formatVotingRemaining(order: IOrder | null, now: number) {
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

function getVotingCloseMessage(order: IOrder, userId?: string) {
  const currentDriver = order.drivers?.find(driver => driver.u_id === userId)
  const anotherDriverStarted = order.drivers?.some(driver =>
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

const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
  modal: modalsSelectors.orderCardModal(state),
  activeChat: modalsSelectors.activeChat(state),
  geoposition: geolocationSelectors.geoposition(state),
})

const mapDispatchToProps = {
  watchOrder: ordersActionCreators.watchOrder,
  takeOrder: ordersActionCreators.take,
  setOrderState: ordersActionCreators.setState,
  cancelOrder: ordersActionCreators.cancel,
  getOrderStart: ordersDetailsActionCreators.getOrderStart,
  getOrderDestination: ordersDetailsActionCreators.getOrderDestination,
  setSelectedOrderId: orderActionCreators.setSelectedOrderId,
  setModal: modalsActionCreators.setOrderCardModal,
  setCancelDriverOrderModal: modalsActionCreators.setDriverCancelModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  setAlarmModal: modalsActionCreators.setAlarmModal,
  setLoginModal: modalsActionCreators.setLoginModal,
  setMapModal: modalsActionCreators.setMapModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setActiveChat: modalsActionCreators.setActiveChat,
  watchGeolocation: geolocationActionCreators.watch,
  activateGeolocationSending: geolocationActionCreators.activateSending,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IFormValues {
  votingNumber: number
  performers_price: number
}

interface IProps extends ConnectedProps<typeof connector> {}

function CardModal({ modal, ...props }: IProps) {
  return modal.orderId &&
    <CardModalContent {...modal} {...props} />
}

interface IContentProps extends Omit<ConnectedProps<typeof connector>,
  'modal'
> {
  isOpen: boolean
  orderId: IOrder['b_id']
}

function CardModalContent({
  isOpen: active,
  orderId,
  setModal,
  user,
  activeChat,
  watchOrder,
  takeOrder,
  setOrderState,
  cancelOrder,
  getOrderStart,
  getOrderDestination,
  setSelectedOrderId,
  setMapModal,
  setRatingModal,
  setCancelDriverOrderModal,
  setMessageModal,
  setAlarmModal,
  setActiveChat,
  geoposition,
  watchGeolocation,
  activateGeolocationSending,
}: IContentProps) {

  const avatar = images.avatar
  const avatarSize = '48px'
  const closeModal = () => setModal({ isOpen: false, orderId })

  useEffect(() => active ? watchOrder(orderId) : undefined, [orderId, active])
  const order = useSelector(ordersSelectors.order, orderId) ?? null
  const orderMutates = useSelector(ordersSelectors.orderMutates, orderId)
  const inCandidateMode = useMemo(() =>
    candidateMode(order ?? undefined)
  , [order])

  useEffect(() => {
    if (order) {
      getOrderStart(order)
      getOrderDestination(order)
    }
  }, [order])
  let address = useSelector(ordersDetailsSelectors.start, orderId)
  if (address && 'details' in address)
    address = {
      ...address,
      shortAddress: formatShortAddress(address.details),
    }
  let destinationAddress =
    useSelector(ordersDetailsSelectors.destination, orderId)
  if (destinationAddress)
    destinationAddress = {
      ...destinationAddress,
      address: getSafeAddressValue(destinationAddress.address) ?? '',
      shortAddress: getSafeAddressValue(
        'details' in destinationAddress ?
          formatShortAddress(destinationAddress.details) :
          destinationAddress.shortAddress,
        destinationAddress.shortAddress,
      ),
    }

  const driver = useMemo(() =>
    order?.drivers?.find(item => order.b_voting ?
      isVotingDriverParticipating(item) :
      item.c_state > EBookingDriverState.Canceled)
  , [order?.drivers])
  const userAsDriver = useMemo(() =>
    user && order?.drivers?.find(i => i.u_id === user.u_id)
  , [order?.drivers])
  const currentLanguage = useSelector(configSelectors.language)
  const [votingParticipationIds, setVotingParticipationIds] = useState(() =>
    getStoredVotingParticipationIds(),
  )
  const [votingArrivedIds, setVotingArrivedIds] = useState(() =>
    getStoredVotingArrivedIds(),
  )
  const [now, setNow] = useState(Date.now())
  const [votingCloseHandled, setVotingCloseHandled] = useState(false)

  const [isFromAddressShort, setIsFromAddressShort] = useCachedState(
    'components.modals.CardModal.isFromAddressShort',
    false,
  )

  const navigate = useNavigate()

  const { register, formState: { errors }, handleSubmit: formHandleSubmit, getValues } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (active && orderId)
      setSelectedOrderId(orderId)
  }, [active, orderId])

  useEffect(() => {
    if (!active || order)
      return

    const wasVotingParticipant = votingParticipationIds.includes(orderId)
    if (!wasVotingParticipant)
      return

    setVotingParticipationIds(removeVotingParticipationId(orderId))
    setVotingArrivedIds(removeVotingArrivedId(orderId))
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message: t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_CLIENT),
    })
    closeModal()
  }, [active, order, orderId, votingParticipationIds])

  useEffect(() => {
    if (!active || !order?.b_voting)
      return

    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [active, order?.b_voting])

  const votingParticipationByState = Boolean(
    order?.b_voting &&
    userAsDriver &&
    isVotingDriverParticipating(userAsDriver),
  )
  const isVotingParticipant = Boolean(
    order?.b_voting &&
    (votingParticipationByState || votingParticipationIds.includes(orderId)),
  )
  const isVotingArrived = Boolean(
    order?.b_voting &&
    (userAsDriver?.c_state === EBookingDriverState.Arrived || votingArrivedIds.includes(orderId)),
  )

  useEffect(() => {
    if (!active || !isVotingParticipant)
      return

    const unwatch = watchGeolocation({ interval: 3000 })
    const deactivateSending = activateGeolocationSending()

    return () => {
      deactivateSending()
      unwatch()
    }
  }, [active, isVotingParticipant, watchGeolocation, activateGeolocationSending])

  useEffect(() => {
    if (!active || !order?.b_voting || !isVotingParticipant || votingCloseHandled)
      return

    const closeReason = getVotingCloseMessage(order, user?.u_id)
    if (!closeReason)
      return

    setVotingCloseHandled(true)
    setVotingParticipationIds(removeVotingParticipationId(orderId))
    setVotingArrivedIds(removeVotingArrivedId(orderId))
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message: closeReason,
    })
    closeModal()
  }, [active, order, isVotingParticipant, votingCloseHandled, user?.u_id])

  const handleSubmit = () => orderMutation(async() => {
    if (order?.b_voting) {
      if (isVotingDriverParticipating(userAsDriver)) {
        const nextIds = saveVotingParticipationId(orderId)
        setVotingParticipationIds(nextIds)
        return
      }

      try {
        await API.participateVotingOrder(orderId, getValues().performers_price)
      } catch (error) {
        if (!isAlreadyVotingParticipantError(error))
          throw error
      }
      const nextIds = saveVotingParticipationId(orderId)
      setVotingParticipationIds(nextIds)
      setMessageModal({
        isOpen: true,
        status: EStatuses.Success,
        message: t(TRANSLATION.DRIVER_VOTING_READY_SENT),
      })
      return
    }

    await takeOrder(orderId, { ...getValues() })
  })

  const onArrivedClick = () => orderMutation(async() => {
    await setOrderState(orderId, EBookingDriverState.Arrived)
  })

  const onHideOrder = () => {
    addHiddenOrder(orderId, user?.u_id)
  }

  const onStartedClick = () => orderMutation(async() => {
    await setOrderState(orderId, EBookingDriverState.Started)
    navigate('/driver-order?tab=map')
    closeModal()
  })

  const onCompleteOrderClick = () => orderMutation(async() => {
    await setOrderState(orderId, EBookingDriverState.Finished)
    navigate(`/driver-order?tab=${EDriverTabs.Lite}`)
    setRatingModal({ isOpen: true, orderID: orderId })
    closeModal()
  })

  const cancelAndClose = () => orderMutation(async() => {
    await cancelOrder(orderId)
    closeModal()
  })

  const cancelVotingDeparture = () => orderMutation(async() => {
    await API.cancelVotingParticipation(orderId)
    const nextIds = removeVotingParticipationId(orderId)
    const nextArrivedIds = removeVotingArrivedId(orderId)
    setVotingParticipationIds(nextIds)
    setVotingArrivedIds(nextArrivedIds)
    setMessageModal({
      isOpen: true,
      status: EStatuses.Success,
      message: t(TRANSLATION.DRIVER_VOTING_CANCELLED),
    })
  })

  const arrivedVotingOrder = () => orderMutation(async() => {
    if (userAsDriver?.c_state !== EBookingDriverState.Arrived) {
      try {
        if (
          userAsDriver?.c_state === EBookingDriverState.Performer ||
          userAsDriver?.c_state === EBookingDriverState.Started
        )
          await setOrderState(orderId, EBookingDriverState.Arrived)
      } catch (error) {
        if (!isNotAppointedPerformerError(error))
          throw error
      }
    }
    try {
      await API.arrivedVotingOrder(orderId)
    } catch (error) {
      if (!isNotAppointedPerformerError(error))
        throw error
    }
    const nextIds = saveVotingArrivedId(orderId)
    setVotingArrivedIds(nextIds)
    setMessageModal({
      isOpen: true,
      status: EStatuses.Success,
      message: t(TRANSLATION.DRIVER_VOTING_ARRIVED_SENT),
    })
  })

  const openVotingNavigation = () => {
    setMapModal({
      isOpen: true,
      type: EMapModalTypes.VotingNavigation,
      defaultCenter: order?.b_start_latitude && order?.b_start_longitude ?
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

  const confirmVotingCode = () => orderMutation(async() => {
    await takeOrder(orderId, { ...getValues() })
    await API.confirmVotingCode(orderId, getValues().votingNumber)
    await setOrderState(orderId, EBookingDriverState.Started)
    saveStartedVotingOrderId(orderId)
    setVotingParticipationIds(removeVotingParticipationId(orderId))
    setVotingArrivedIds(removeVotingArrivedId(orderId))
    navigate('/driver-order?tab=map')
    closeModal()
  })

  async function orderMutation(mutation: () => Promise<void>) {
    try {
      await mutation()
    } catch (error) {
      console.error(error)
      setMessageModal({
        isOpen: true,
        message: getApiErrorMessage(error, { context: 'driver-order' }),
        status: EStatuses.Fail,
      })
    }
  }

  const onAlarmClick = () => {
    setAlarmModal({ isOpen: true })
  }

  const onRateOrderClick = () => {
    setRatingModal({ isOpen: true, orderID: orderId })
  }

  const openChatModal = () => {
    // Если клиент на сайте, используем стандартный чат
    if (!order?.b_options?.createdBy) {
      const from = `${user?.u_id}_${orderId}`
      const to = `${order?.u_id}_${orderId}`
      const chatID = `${from};${to}`
      setActiveChat(activeChat === chatID ? null : chatID)
      return
    }

    // Ищем профиль клиента
    if (!order.user) return

    // В зависимости от типа контакта формируем соответствующую ссылку
    switch (order.b_options.createdBy) {
      case 'sms':
        // Ссылка на приложение для звонков
        window.location.href = `tel:${order.user?.u_phone}`
        break
      case 'whatsapp':
        window.location.href = `https://wa.me/${order.user?.u_phone}`
        break
      default:
        // Для неизвестных типов используем стандартный чат
        const from = `${user?.u_id}_${orderId}`
        const to = `${order?.u_id}_${orderId}`
        const chatID = `${from};${to}`
        setActiveChat(activeChat === chatID ? null : chatID)
    }
  }

  const getButtons = () => {
    const buttonProps = {
      className: 'order_take-order-btn',
    }
    const actionButtonProps = {
      ...buttonProps,
      disabled: orderMutates,
    }
    const submitButtonProps = {
      ...actionButtonProps,
      type: 'submit' as const,
    }

    if (!order)
      return (
        <Button
          {...buttonProps}
          text={t(TRANSLATION.EXIT_NOT_AVIABLE)}
          onClick={closeModal}
        />
      )

    if (order.b_state === EBookingStates.Canceled)
      return (
        <Button
          {...buttonProps}
          text={t(TRANSLATION.EXIT_USER_CANCELLED)}
          onClick={closeModal}
        />
      )

    if (order?.b_voting && isVotingParticipant)
      return <>
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
        {!isVotingArrived && (
          <Button
            {...actionButtonProps}
            text={t(TRANSLATION.DRIVER_VOTING_ARRIVED)}
            onClick={arrivedVotingOrder}
            disabled={orderMutates || !canMarkVotingArrived(order, geoposition, user?.u_id)}
          />
        )}
        {isVotingArrived && (
          <Button
            {...actionButtonProps}
            text={t(TRANSLATION.DRIVER_VOTING_CONFIRM_CODE)}
            onClick={confirmVotingCode}
          />
        )}
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.DRIVER_VOTING_NAVIGATION)}
          onClick={openVotingNavigation}
          disabled={orderMutates || !canOpenVotingNavigation(order, geoposition)}
        />
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.DRIVER_VOTING_CANCEL_DEPARTURE)}
          onClick={cancelVotingDeparture}
        />
      </>

    if (userAsDriver?.c_state === EBookingDriverState.Performer)
      return <>
        <Button
          {...actionButtonProps}
          svg={<Icon src="whatsapp" width="20" height="20" fill="white" />}
          onClick={openChatModal}
          wrapperProps={{ style: { maxWidth: '20%' } }}
        />
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.ARRIVED)}
          onClick={onArrivedClick}
        />
        <Button
          {...actionButtonProps}
          svg={<Icon src="chat" width="20" height="20" fill="white" />}
          onClick={() => setCancelDriverOrderModal(true)}
          wrapperProps={{ style: { maxWidth: '20%' } }}
        />
      </>
    if (userAsDriver?.c_state === EBookingDriverState.Arrived)
      return <>
        <Button
          {...actionButtonProps}
          svg={<Icon src="whatsapp" width="20" height="20" fill="white" />}
          onClick={openChatModal}
          wrapperProps={{ style: { maxWidth: '20%' } }}
        />
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.WENT)}
          onClick={onStartedClick}
        />
        <Button
          {...actionButtonProps}
          svg={<Icon src="chat" width="20" height="20" fill="white" />}
          onClick={() => setCancelDriverOrderModal(true)}
          wrapperProps={{ style: { maxWidth: '20%' } }}
        />
      </>
    if (userAsDriver?.c_state === EBookingDriverState.Started)
      return <>
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.CLOSE_DRIVE)}
          onClick={onCompleteOrderClick}
        />
        <Button
          {...actionButtonProps}
          className="order_alarm-btn"
          text={`${t(TRANSLATION.ALARM)}`}
          onClick={onAlarmClick}
          colorType={EColorTypes.Accent}
        />
      </>
    if (userAsDriver?.c_state === EBookingDriverState.Finished)
      return <>
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.RATE_DRIVE)}
          onClick={onRateOrderClick}
        />
      </>

    if (userAsDriver?.c_state === EBookingDriverState.Considering)
      return (
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.CANCEL_AND_CLOSE)}
          onClick={cancelAndClose}
        />
      )

    if (!driver || order?.b_voting)
      return <>
        {SITE_CONSTANTS.C_OPTIONS_VALID_KEYS.performers_price &&
          inCandidateMode &&
          <Input
            inputProps={{
              ...register('performers_price', {
                required: t(TRANSLATION.REQUIRED_FIELD),
                min: 0,
                valueAsNumber: true,
              }),
              type: 'number',
              min: 0,
            }}
            error={errors?.performers_price?.message}
            label={t(TRANSLATION.PRICE_PERFORMER)}
            oneline
          />
        }
        <Button
          {...submitButtonProps}
          text={t(
            order?.b_voting ?
              TRANSLATION.DRIVER_VOTING_GOING_ACTION :
              inCandidateMode ?
                TRANSLATION.MAKE_OFFER :
                TRANSLATION.TAKE_ORDER,
          )}
        />
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.HIDE_ORDER)}
          onClick={onHideOrder}
        />
      </>

    return (
      <Button
        {...buttonProps}
        text={t(TRANSLATION.EXIT)}
        onClick={closeModal}
      />
    )
  }

  const outsideClick = ( e: React.MouseEvent<HTMLDivElement, MouseEvent> ) => {
    if ( e.currentTarget === e.target ) {
      closeModal()
    }
  }

  const shortAddressHandler = () => {
    setIsFromAddressShort(prev => !prev)
  }

  const getStatusText = () => {
    if (order?.b_voting) return t(TRANSLATION.VOTER)
    return ''
  }

  const getStatusTextColor = () => {
    if (order?.b_voting) return '#FF2400'
    // 'reccomended': return '#00A72F'\
    return 'rgba(0, 0, 0, 0.25)'
  }
  const price = calculateFinalPrice(order)
  const payment = getPayment(order)
  const paymentAmount = getSafePaymentAmount(price, payment.value)
  const votingInfo = getVotingInfo(order, user?.u_id, now)
  const orderMapFromPoint = address?.latitude && address.longitude ? address : (
    order?.b_start_latitude && order.b_start_longitude ? {
      address: order.b_start_address,
      latitude: order.b_start_latitude,
      longitude: order.b_start_longitude,
    } : null
  )
  const orderMapToPoint = destinationAddress?.latitude && destinationAddress.longitude ? destinationAddress : (
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

  const _type = order?.b_payment_way === EPaymentWays.Credit ?
    TRANSLATION.CARD :
    TRANSLATION.CASH
  const _value = order?.b_options?.customer_price ?
    (
      t(_type) + '. ' +
      t(TRANSLATION.CUSTOMER_PRICE) +
      ` ${order.b_options.customer_price} ${CURRENCY.SIGN}`
    ) :
    (
      t(_type) + '. ' +
      t(TRANSLATION.FIXED) + '. ' +
      formatPaymentAmount(paymentAmount)
    )

  return (
    <div
      className={cn(
        'status-card__modal',
        order?.profitRank !== undefined && `status-card__modal--profit--${{
          [EOrderProfitRank.Low]: 'low',
          [EOrderProfitRank.Medium]: 'medium',
          [EOrderProfitRank.High]: 'high',
        }[order.profitRank]}`,
      )}
      data-active={active}
      onClick={outsideClick}
    >
      <div>

        <div className='top' >
          <div
            className="avatar"
            style={{
              backgroundSize: avatarSize,
              backgroundImage: `url(${avatar})`,
            }}
          />
          <div className="name" >
            <p>
              {order?.user?.u_family?.trimStart()}
              {order?.user?.u_name?.trimStart()}
              {order?.user?.u_middle?.trimStart()}
              <span>
                ({order?.u_id}) ({bookingStates[order?.b_state as any]})
              </span>
            </p>
          </div>
          <div className='stars' >
            {[1,2,3,4].map(num =>
              <Icon
                key={num}
                src="filledStar"
                width="10"
                height="10"
                fill="#FF2400"
              />,
            )}
            {[1].map(num =>
              <Icon
                key={num}
                src="star"
                width="10"
                height="10"
                stroke="#FF2400"
              />,
            )}
            <span>24/20</span>
          </div>
          <b style={{ color: getStatusTextColor() }}>№{order?.b_id} {getStatusText()}</b>
        </div>

        <div className='address' >
          <b>{translateWithFallback(TRANSLATION.APPROXIMATE_TIME, currentLanguage, { ru: 'Ожидаемое время', en: 'Estimate time' })}: {(Math.trunc(order?.b_options?.pricingModel?.options?.duration) || 0)} min</b>
          <div className="address__content">
            <div className="address__title">
              {translateWithFallback(TRANSLATION.ADDRESSES, currentLanguage, { ru: 'Адрес отправления и прибытия', en: 'Departure and Arrival Address' })}
            </div>

            <div className="address__row address__row--from">
              <span className="address__label">{t(TRANSLATION.FROM)}:</span>
              {getSafeAddressValue(
                isFromAddressShort ? address?.shortAddress : address?.address,
                isFromAddressShort ? address?.address : address?.shortAddress,
                order?.b_start_address,
                getCoordinatesAddress(order?.b_start_latitude, order?.b_start_longitude),
                getCoordinatesAddress(address?.latitude, address?.longitude),
              ) ?
                <>
                  <span className="address__value">{getSafeAddressText(currentLanguage,
                    isFromAddressShort ? address?.shortAddress : address?.address,
                    isFromAddressShort ? address?.address : address?.shortAddress,
                    order?.b_start_address,
                    getCoordinatesAddress(order?.b_start_latitude, order?.b_start_longitude),
                    getCoordinatesAddress(address?.latitude, address?.longitude),
                  )}</span>
                  {(address?.shortAddress || address?.address) ?
                    <img
                      className="address__toggle"
                      src={isFromAddressShort ? images.plusIcon : images.minusIcon}
                      onClick={shortAddressHandler}
                      alt='change address mode'
                    /> :
                    <span />
                  }
                </> :
                <>
                  <div className="address__value"><Loader /></div>
                  <span />
                </>
              }
              <span
                onClick={() => {
                  openOrderPointOnMap('from')
                }}
                className="svg"
              >
                <Icon
                  src="locationPoint"
                  width="18"
                  height="19"
                  fill="#FF9900"
                />
              </span>
            </div>

            <div className="address__row address__row--to">
              <span className="address__label">{t(TRANSLATION.TO)}:</span>
              <span className="address__value">
                {getSafeAddressText(currentLanguage,
                  isFromAddressShort ? destinationAddress?.shortAddress : destinationAddress?.address,
                  isFromAddressShort ? destinationAddress?.address : destinationAddress?.shortAddress,
                  order?.b_destination_address,
                  getCoordinatesAddress(order?.b_destination_latitude, order?.b_destination_longitude),
                  getCoordinatesAddress(destinationAddress?.latitude, destinationAddress?.longitude),
                )}
              </span>
              <span />
              <span
                onClick={() => {
                  openOrderPointOnMap('to')
                }}
                className="svg"
              >
                <Icon
                  src="locationPoint"
                  width="18"
                  height="19"
                  fill="#00B100"
                />
              </span>
            </div>
          </div>
        </div>

        <div className="time" >
          <Icon src="clock" width="18" height="19" stroke="#FF2400" />
          <p>{t(TRANSLATION.START_TIME)}: <span>{order?.b_start_datetime?.format(
            order.b_options?.time_is_not_important ? dateFormatDate : dateShowFormat,
          )}</span></p>
        </div>

        <div className="payment" >
          <Icon src="moneyCircle" width="18" height="19" stroke="#FF2400" />
          <div>
            <p>{t(TRANSLATION.PAYMENT_WAY)}: {_value}{order?.b_options?.pricingModel?.calculationType === 'incomplete' ? ' + ?' : ''}</p>
            <p>{translateWithFallback(TRANSLATION.CALCULATION, currentLanguage, { ru: 'Расчёт', en: 'Calculation' })}: {getSafeCalculationText(order, currentLanguage)}</p>
            {order?.profit &&
              <p className='status-card__profit'>
                {formatCurrency(order.profit, { signDisplay: 'always' })}
              </p>
            }
          </div>
        </div>

        <div className="client" >
          {order?.b_voting && isVotingParticipant &&
            <div className="voting-participation">
              <div className="voting-participation__status">
                {votingInfo.remaining ?
                  `${t(TRANSLATION.DRIVER_VOTING_WAITING)}: ${votingInfo.remaining}` :
                  t(TRANSLATION.DRIVER_VOTING_STATUS_PARTICIPATING)
                }
              </div>
              <div>
                {t(TRANSLATION.DRIVER_VOTING_COMPETITORS)}: {votingInfo.competitorsCount}
              </div>
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
          }

          <div className="comments" data-active={false} onClick={e => e.currentTarget.dataset.active=e.currentTarget.dataset.active==='false'?'true':'false'} >
            {order?.u_id &&
              formatCommentWithEmoji(order.b_comments)?.map(({
                id, src, hint,
              }) =>
                <p><img key={id} src={src} alt="" /><span>{hint}</span></p>,
              )
            }
          </div>

          {order &&
            <span className='status-card__seats'>
              <Icon src="people" width="16" height="16" stroke="#FF2400" />
              <label>{getOrderCount(order)}</label>
            </span>
          }

          <form onSubmit={formHandleSubmit(handleSubmit)} >
            <div className="btns" >
              {getButtons()}
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}

export default connector(CardModal)

function formatShortAddress(address: IAddressDetails) {
  const { road, suburb, city, county, state, country } = address
  const parts = [road, suburb, city, county, state, country].filter(Boolean)
  return parts.join(', ')
}

function getCoordinatesAddress(latitude?: number, longitude?: number) {
  return latitude !== undefined && longitude !== undefined ?
    `${latitude}, ${longitude}` :
    undefined
}

function isSafeAddress(address?: string | null) {
  if (!address) return false

  const normalized = String(address).trim().toLowerCase()

  return Boolean(normalized) &&
    normalized !== 'undefined' &&
    normalized !== 'undefined, undefined' &&
    normalized !== 'null' &&
    normalized !== 'null, null' &&
    !normalized.includes('undefined') &&
    !normalized.includes('null')
}

function getSafeAddressValue(...addresses: Array<string | undefined | null>): string | undefined {
  return addresses.find((address): address is string => isSafeAddress(address))?.trim()
}

function getSafeAddressText(language: { iso?: string } | undefined, ...addresses: Array<string | undefined | null>) {
  return getSafeAddressValue(...addresses)?.trim() ?? translateWithFallback(
    TRANSLATION.ADDRESS_NOT_SPECIFIED,
    language,
    { ru: 'Адрес не указан', en: 'Address not specified' },
  )
}

function translateWithFallback(
  key: string,
  language: { iso?: string } | undefined,
  fallback: { ru: string, en: string, [key: string]: string },
) {
  const translated = t(key)

  const normalized = String(translated || '').trim().toLowerCase()

  if (translated && translated !== key && normalized !== 'error' && normalized !== 'err')
    return translated

  const iso = language?.iso?.toLowerCase() || 'ru'
  return fallback[iso] || fallback.en || fallback.ru
}

function isValidCalculationValue(value: unknown): boolean {
  if (value === undefined || value === null) return false

  const normalized = String(value).trim().toLowerCase()

  return Boolean(normalized) &&
    normalized !== 'err' &&
    !normalized.startsWith('err') &&
    normalized !== 'error' &&
    normalized !== 'nan' &&
    normalized !== 'infinity' &&
    !normalized.includes('error: err') &&
    !normalized.includes('referenceerror') &&
    !normalized.startsWith('error_') &&
    normalized !== 'undefined' &&
    normalized !== 'null'
}

function getSafePaymentAmount(...values: unknown[]) {
  return values.find(isValidCalculationValue)
}

function formatPaymentAmount(value: unknown) {
  if (!isValidCalculationValue(value))
    return '-'

  return `${value} ${CURRENCY.SIGN}`.trim()
}

function getSafeCalculationText(order: IOrder | null, language: { iso?: string } | undefined) {
  const formula = calculateFinalPriceFormula(order)
  if (isValidCalculationValue(formula))
    return formula

  const price = order?.b_options?.pricingModel?.price ??
    order?.b_options?.customer_price ??
    order?.b_price_estimate ??
    order?.b_options?.submitPrice

  if (isValidCalculationValue(price))
    return typeof price === 'number' ? formatCurrency(price) : String(price)

  const payment = getPayment(order)
  if (isValidCalculationValue(payment.text))
    return payment.text
  if (isValidCalculationValue(payment.value))
    return formatPaymentAmount(payment.value)

  if (typeof order?.profit === 'number')
    return `${translateWithFallback(
      TRANSLATION.DRIVER_PROFIT,
      language,
      { ru: 'Выгода водителя', en: 'Driver profit' },
    )}: ${formatCurrency(order.profit, { signDisplay: 'always' })}`

  return translateWithFallback(
    TRANSLATION.CALCULATION_NO_DATA,
    language,
    { ru: 'нет данных для расчёта', en: 'No calculation data' },
  )
}
