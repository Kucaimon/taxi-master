import React, {
  useState, useRef, useEffect, useLayoutEffect,
  useMemo, useCallback, useImperativeHandle,
} from 'react'
import { connect, ConnectedProps, useStore } from 'react-redux'
import moment from 'moment'
import { EPointType, EPaymentWays } from '../../types/types'
import images from '../../constants/images'
import SITE_CONSTANTS from '../../siteConstants'
import { getPhoneNumberError } from '../../tools/utils'
import * as API from '../../API'
import { t, tLangVls, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import { ordersSelectors, ordersActionCreators } from '../../state/orders'
import {
  clientOrderSelectors,
  clientOrderActionCreators,
} from '../../state/clientOrder'
import Icon from '../../components/Icon'
import Input, { EInputTypes, EInputStyles } from '../../components/Input'
import Button, { EButtonStyles } from '../../components/Button'
import {
  getItem as getLocalItem,
  setItem as setLocalItem,
  removeItem as removeLocalItem,
} from '../../tools/localStorage'
import LocationInput from '../../components/LocationInput'
import ShortInfo from '../../components/ShortInfo'
import SeatSlider from '../../components/SeatSlider'
import CarClassSlider from '../../components/CarClassSlider'
import PriceInput from '../../components/PriceInput'
import { openConfirmationModal } from '../../components/modals/confirmationModalRuntime'
import './voting-form.scss'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
  from: clientOrderSelectors.from(state),
  to: clientOrderSelectors.to(state),
  comments: clientOrderSelectors.comments(state),
  time: clientOrderSelectors.time(state),
  phone: clientOrderSelectors.phone(state),
  user: userSelectors.user(state),
  pickupTip: clientOrderSelectors.pickupTip(state),
})

const mapDispatchToProps = {
  setPickTimeModal: modalsActionCreators.setPickTimeModal,
  setCommentsModal: modalsActionCreators.setCommentsModal,
  setLoginModal: modalsActionCreators.setLoginModal,
  watchActiveOrders: ordersActionCreators.watchActiveOrders,
  createOrder: ordersActionCreators.create,
  setPhone: clientOrderActionCreators.setPhone,
  resetClientOrder: clientOrderActionCreators.reset,
  setPickupTip: clientOrderActionCreators.setPickupTip,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  isExpanded: boolean
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>
  syncFrom: () => void
  syncTo: () => void
  onSubmit: (data: Awaited<ReturnType<typeof API.postDrive>>) => void
  minimizedPartRef: React.Ref<HTMLElement>
  noSwipeElementsRef: React.Ref<HTMLElement[]>
}

const VotingForm = function VotingForm({
  activeOrders,
  from,
  to,
  comments,
  time,
  phone,
  user,
  pickupTip,
  setPickTimeModal,
  setCommentsModal,
  setLoginModal,
  watchActiveOrders,
  createOrder,
  setPhone,
  resetClientOrder,
  setPickupTip,
  isExpanded,
  setIsExpanded,
  syncFrom,
  syncTo,
  onSubmit,
  minimizedPartRef,
  noSwipeElementsRef,
}: IProps) {

  const carSliderRef = useRef<HTMLDivElement>(null)
  const seatSliderRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(noSwipeElementsRef, () => [
    carSliderRef.current!,
    seatSliderRef.current!,
  ].filter(Boolean))

  useEffect(watchActiveOrders, [])
  const available = useMemo(() =>
    !activeOrders?.some(order => order.b_voting)
  , [activeOrders])

  const [fromError, setFromError] = useState<string | null>(null)
  useLayoutEffect(() => { setFromError(null) }, [from])
  const [toError, setToError] = useState<string | null>(null)
  useLayoutEffect(() => { setToError(null) }, [to])
  const [phoneError, setPhoneError] = useState<string | null>(null)
  useLayoutEffect(() => { setPhoneError(null) }, [phone])

  // "Remember this phone" toggle. When the star is filled, the typed
  // phone is mirrored into a dedicated localStorage key and is restored
  // by `loadFromStorageSaga` on the next visit. Keeps the user from
  // re-typing a non-registration phone every time and is intentionally
  // separate from the per-keystroke `state.clientOrder.phone` draft —
  // that one gets wiped on redeploy by the build-version logic.
  const REMEMBERED_PHONE_KEY = 'state.clientOrder.rememberedPhone'
  const [isPhoneRemembered, setIsPhoneRemembered] = useState<boolean>(
    () => getLocalItem<number>(REMEMBERED_PHONE_KEY) !== undefined,
  )

  useEffect(() => {
    if (isPhoneRemembered && typeof phone === 'number')
      setLocalItem(REMEMBERED_PHONE_KEY, phone)
  }, [isPhoneRemembered, phone])

  const togglePhoneRemember = useCallback(() => {
    setIsPhoneRemembered(prev => {
      if (prev) {
        removeLocalItem(REMEMBERED_PHONE_KEY)
        return false
      }
      if (typeof phone !== 'number') {
        setPhoneError(t(TRANSLATION.REQUIRED_FIELD))
        return prev
      }
      setLocalItem(REMEMBERED_PHONE_KEY, phone)
      return true
    })
  }, [phone])

  const store = useStore<IRootState>()
  const lastConfirmedPickupTipRef = useRef(0)

  useEffect(() => {
    if (pickupTip === null || pickupTip === 0)
      lastConfirmedPickupTipRef.current = 0
  }, [pickupTip])

  const buildPickupTipConfirmModal = useCallback(() => ({
    title: tLangVls(TRANSLATION.PICKUP_TIP_CONFIRM_TITLE),
    message: tLangVls(TRANSLATION.PICKUP_TIP_CONFIRM_BODY),
    confirmLabel: tLangVls(TRANSLATION.CONFIRM),
    cancelLabel: tLangVls(TRANSLATION.CANCEL),
    tone: 'info' as const,
  }), [])

  const handlePickupTipBlur = useCallback(async () => {
    const state = store.getState()
    const tipRaw = clientOrderSelectors.pickupTip(state)
    const tip = tipRaw ?? 0
    if (tip <= 0) return
    if (lastConfirmedPickupTipRef.current === tip) return
    try {
      const ok = await openConfirmationModal(buildPickupTipConfirmModal())
      if (ok)
        lastConfirmedPickupTipRef.current = tip
      else
        setPickupTip(
          lastConfirmedPickupTipRef.current > 0 ?
            lastConfirmedPickupTipRef.current :
            null,
        )
    } catch {
      // Another confirmation is already open.
    }
  }, [store, setPickupTip, buildPickupTipConfirmModal])

  const submit = useCallback(async(voting = false) => {
    setSubmitError(null)

    const state = store.getState()
    const carClass = clientOrderSelectors.carClass(state)
    const seats = clientOrderSelectors.seats(state)
    const customerPrice = clientOrderSelectors.customerPrice(state)
    const pickupTipValue = clientOrderSelectors.pickupTip(state) ?? 0

    let error = false
    if (!from?.address) {
      setFromError(t(TRANSLATION.MAP_FROM_NOT_SPECIFIED_ERROR))
      error = true
    }
    if (!voting && !to?.address) {
      setToError(t(TRANSLATION.MAP_TO_NOT_SPECIFIED_ERROR))
      error = true
    }
    const phoneError = getPhoneNumberError(phone)
    if (phoneError) {
      setPhoneError(phoneError)
      setIsExpanded(true)
      error = true
    }
    if (error)
      return

    if (!user) {
      setLoginModal(true)
      return
    }

    const commentObj: any = {}
    commentObj['b_comments'] = comments.ids || []
    comments.custom &&
      (commentObj['b_custom_comment'] = comments.custom)
    comments.flightNumber &&
      (commentObj['b_flight_number'] = comments.flightNumber)
    comments.placard && (commentObj['b_placard'] = comments.placard)

    const startTime = moment(voting || time === 'now' ? undefined : time)

    if (
      pickupTipValue > 0 &&
      lastConfirmedPickupTipRef.current !== pickupTipValue
    ) {
      try {
        const ok = await openConfirmationModal(buildPickupTipConfirmModal())
        if (!ok) return
        lastConfirmedPickupTipRef.current = pickupTipValue
      } catch {
        return
      }
    }

    setSubmitting(true)
    try {
      const data = await createOrder({
        b_start_address: from!.address,
        b_start_latitude: from!.latitude,
        b_start_longitude: from!.longitude,
        b_destination_address: to?.address,
        b_destination_latitude: to?.latitude,
        b_destination_longitude: to?.longitude,
        ...commentObj,
        b_contact: phone! + '',
        b_start_datetime: startTime,
        b_passengers_count: seats,
        b_car_class: carClass,
        b_payment_way: EPaymentWays.Cash,
        b_max_waiting: voting ? SITE_CONSTANTS.WAITING_INTERVAL : 7200,
        b_options: {
          fromShortAddress: from?.shortAddress,
          toShortAddress: to?.shortAddress,
          customer_price: customerPrice,
          // Backend's existing key for the pickup tip — see chat 13 May.
          submitPrice: pickupTipValue,
        },
        b_voting: voting,
      })

      resetClientOrder()
      onSubmit(data)
    } catch (error) {
      const message =
        error instanceof Error ?
          error.message :
          typeof error === 'string' ? error : ''
      setSubmitError(message || t(TRANSLATION.ERROR))
      console.error(error)
    }
    setSubmitting(false)
  }, [
    from, to, comments, time, phone, user,
    store, setLoginModal, createOrder, resetClientOrder,
    setIsExpanded, onSubmit, buildPickupTipConfirmModal,
  ])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const submitButtons = (
    <div className="passenger-voting-form__order-button-wrapper">
      {useMemo(() =>
        <>
          <Button
            wrapperProps={{ className: 'passenger-voting-form__order-button' }}
            buttonStyle={EButtonStyles.RedDesign}
            type="submit"
            checkLogin={false}
            text={t(TRANSLATION.VOTE, { toUpper: false })}
            onClick={() => submit(true)}
            disabled={!available || submitting}
          />
          <Button
            wrapperProps={{ className: 'passenger-voting-form__order-button' }}
            buttonStyle={EButtonStyles.RedDesign}
            type="submit"
            checkLogin={false}
            text={t(TRANSLATION.TO_ORDER, { toUpper: false })}
            onClick={() => submit()}
            disabled={!available || submitting}
          />
        </>
      , [available, submitting, submit])}
      {submitError &&
        <span className="passenger-voting-form__order-button-error">
          {submitError}
        </span>
      }
    </div>
  )

  return (
    <form
      className="passenger-voting-form"
      onSubmit={event => {
        event.preventDefault()
      }}
    >
      <div
        ref={minimizedPartRef as React.Ref<HTMLDivElement>}
        className="passenger-voting-form__group"
      >
        <div className="passenger-voting-form__location-wrapper">
          {useMemo(() =>
            <LocationInput
              className="passenger-voting-form__input"
              type={EPointType.From}
              onOpenMap={syncFrom}
              error={fromError ?? undefined}
            />
          , [syncFrom, fromError])}
          {useMemo(() =>
            <LocationInput
              className="passenger-voting-form__input"
              type={EPointType.To}
              onOpenMap={syncTo}
              error={toError ?? undefined}
            />
          , [syncTo, toError])}
        </div>

        {useMemo(() => !isExpanded && <ShortInfo />, [isExpanded])}

        {!isExpanded && submitButtons}
      </div>

      <div className="passenger-voting-form__seats-and-time">
        {useMemo(() =>
          <div className="passenger-voting-form__seats">
            <span className="passenger-voting-form__seats-title">
              {t(TRANSLATION.SEATS)}
            </span>
            <div ref={seatSliderRef}>
              <SeatSlider />
            </div>
          </div>
        , [])}

        {useMemo(() =>
          <div className="passenger-voting-form__time">
            <div className="passenger-voting-form__time-wrapper">
              <span className="passenger-voting-form__time-title">
                {t(TRANSLATION.START_TIME)}
              </span>
              <span className="passenger-voting-form__time-value">
                {time === 'now' ?
                  t(TRANSLATION.NOW) :
                  time.format('D MMM, H:mm')
                }
              </span>
            </div>
            <button
              className="passenger-voting-form__time-btn"
              onClick={() => setPickTimeModal(true)}
            >
              <Icon src="alarm" className="passenger-voting-form__time-icon" />
            </button>
          </div>
        , [time, setPickTimeModal])}
      </div>

      {useMemo(() =>
        <div className="passenger-voting-form__car-class">
          <div className="passenger-voting-form__car-class-header">
            <span className="passenger-voting-form__car-class-title">
              {t(TRANSLATION.AUTO_CLASS)}
            </span>
            <div className="passenger-voting-form__car-nearby-info">
              <Icon
                src="carNearby"
                className="passenger-voting-form__car-nearby-icon"
              />
              <span className="passenger-voting-form__car-nearby-info-text">{7} автомобилей рядом</span>
            </div>
            <div className="passenger-voting-form__car-nearby-info">
              <Icon
                src="timeWait"
                className="passenger-voting-form__waiting-time-icon"
              />
              <span className="passenger-voting-form__car-nearby-info-text">~{5} минут</span>
            </div>
          </div>
          <div ref={carSliderRef}>
            <CarClassSlider />
          </div>
        </div>
      , [])}

      {useMemo(() => {
        // Render preset checkbox labels together with the free-form
        // text fields the modal collects: previously only `ids` were
        // shown, so a user-typed comment looked lost the moment the
        // modal closed (see customer screenshot, "Поорртл" disappearing).
        const idLabels = comments.ids.map(id =>
          t(TRANSLATION.BOOKING_COMMENTS[id]),
        )
        const planeParts: string[] = []
        if (comments.flightNumber)
          planeParts.push(`№ ${t(TRANSLATION.FLIGHT)} ${comments.flightNumber}`)
        if (comments.placard)
          planeParts.push(comments.placard)
        const summary = [
          ...idLabels,
          ...planeParts,
          comments.custom?.trim() || '',
        ].filter(Boolean).join(', ')
        return (
          <div className="passenger-voting-form__comments">
            <div className="passenger-voting-form__comments-wrapper">
              <span className="passenger-voting-form__comments-title">
                {t(TRANSLATION.COMMENT)}
              </span>
              <span
                className="passenger-voting-form__comments-value"
                title={summary || undefined}
              >
                {summary || '-'}
              </span>
            </div>
            <button
              className="passenger-voting-form__comments-btn"
              onClick={() => setCommentsModal(true)}
            >
              <img src={images.seatSliderArrowRight} width={16} />
            </button>
          </div>
        )
      }, [comments, setCommentsModal])}

      {useMemo(() => {
        const phoneButtons: { src: string; onClick: () => void; alt?: string }[] = []
        if (user?.u_phone)
          phoneButtons.push({
            src: images.checkMarkRed,
            onClick: () => setPhone(+user!.u_phone!),
            alt: 'Use registration phone',
          })
        // Star toggle: persist current phone for next orders. Filled =
        // remembered, empty = ad-hoc.
        phoneButtons.push({
          src: isPhoneRemembered ? images.starFull : images.starEmpty,
          onClick: togglePhoneRemember,
          alt: isPhoneRemembered ?
            'Forget remembered phone' :
            'Remember this phone for next orders',
        })
        return (
          <Input
            fieldWrapperClassName="passenger-voting-form__input"
            inputProps={{
              value: phone ?? '',
            }}
            inputType={EInputTypes.MaskedPhone}
            style={EInputStyles.RedDesign}
            buttons={phoneButtons}
            error={phoneError ?? undefined}
            onChange={(e) => {
              setPhone(e as number)
            }}
          />
        )
      }, [phone, setPhone, user, phoneError, isPhoneRemembered, togglePhoneRemember])}
      {useMemo(() => SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE &&
        <PriceInput
          className="passenger-voting-form__input"
          onPickupTipBlur={handlePickupTipBlur}
        />
      , [handlePickupTipBlur])}

      {isExpanded && submitButtons}

    </form>
  )
}

export default connector(VotingForm)