import React, {
  useState, useRef, useEffect, useLayoutEffect,
  useMemo, useCallback, useImperativeHandle,
} from 'react'
import cn from 'classnames'
import { connect, ConnectedProps, useStore } from 'react-redux'
import moment from 'moment'
import { EPointType, EPaymentWays } from '../../types/types'
import images from '../../constants/images'
import SITE_CONSTANTS from '../../siteConstants'
import { getPhoneNumberError } from '../../tools/utils'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
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
import LocationInput from '../../components/LocationInput'
import ShortInfo from '../../components/ShortInfo'
import SeatSlider from '../../components/SeatSlider'
import CarClassSlider from '../../components/CarClassSlider'
import PriceInput from '../../components/PriceInput'
import {
  getDefaultCityLocationClassId,
  getOfferResponseBookingCommentIds,
  hasOfferOrderSupport,
  isGruzvillConfig,
  isIntercityOrderLocationClass,
} from '../../tools/driverOffer'
import './voting-form.scss'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
  from: clientOrderSelectors.from(state),
  to: clientOrderSelectors.to(state),
  comments: clientOrderSelectors.comments(state),
  time: clientOrderSelectors.time(state),
  locationClass: clientOrderSelectors.locationClass(state),
  phone: clientOrderSelectors.phone(state),
  user: userSelectors.user(state),
})

const mapDispatchToProps = {
  setPickTimeModal: modalsActionCreators.setPickTimeModal,
  setCommentsModal: modalsActionCreators.setCommentsModal,
  setLoginModal: modalsActionCreators.setLoginModal,
  watchActiveOrders: ordersActionCreators.watchActiveOrders,
  createOrder: ordersActionCreators.create,
  setPhone: clientOrderActionCreators.setPhone,
  setLocationClass: clientOrderActionCreators.setLocationClass,
  resetClientOrder: clientOrderActionCreators.reset,
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
  locationClass,
  phone,
  user,
  setPickTimeModal,
  setCommentsModal,
  setLoginModal,
  watchActiveOrders,
  createOrder,
  setPhone,
  setLocationClass,
  resetClientOrder,
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

  const offerAvailable = hasOfferOrderSupport()
  const cityLocationClassId = getDefaultCityLocationClassId()
  const isGruzvill = isGruzvillConfig()
  const [manualOfferMode, setManualOfferMode] = useState(() => isGruzvill)
  const isOfferMode = Boolean(
    offerAvailable &&
    (manualOfferMode || (!isGruzvill && isIntercityOrderLocationClass(locationClass))),
  )
  const [luggageCount, setLuggageCount] = useState<number | null>(null)
  const [offerDetailsOpen, setOfferDetailsOpen] = useState(false)


  const commentSummary = useMemo(() => [
    ...comments.ids.map(id => t(TRANSLATION.BOOKING_COMMENTS[id])),
    comments.custom,
  ].filter(Boolean).join(', ') || '-', [comments])

  const nearbyCarsCount = useMemo(() => {
    // Не рисуем выдуманные цифры. Если backend уже вернул реальное число
    // доступных/текущих машин в активных заказах, показываем его; иначе
    // просто скрываем счетчик, чтобы пользователь не видел фейковое «7 авто».
    const values = (activeOrders || [])
      .flatMap((order: any) => [
        order?.current_cars_count,
        order?.currentCarsCount,
        order?.b_current_cars_count,
      ])
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value >= 0)

    return values.length ? Math.max(...values) : null
  }, [activeOrders])

  const setPassengerOrderMode = useCallback((offerMode: boolean) => {
    setManualOfferMode(offerMode)
    setOfferDetailsOpen(false)

    // При выходе из OFFER возвращаем городскую поездку. При входе в OFFER
    // не раскрываем нижнюю панель автоматически: карта должна оставаться видимой,
    // а дополнительные поля открываются отдельной кнопкой настроек.
    if (!offerMode && cityLocationClassId)
      setLocationClass(cityLocationClassId)
  }, [cityLocationClassId, setLocationClass])

  const store = useStore<IRootState>()
  const submit = useCallback(async(voting = false, offerMode = false) => {
    setSubmitError(null)

    const state = store.getState()
    const carClass = clientOrderSelectors.carClass(state)
    const seats = clientOrderSelectors.seats(state)
    const customerPrice = clientOrderSelectors.customerPrice(state)
    const selectedLocationClass = clientOrderSelectors.locationClass(state)
    const shouldCreateOfferOrder = Boolean(offerMode && offerAvailable)
    const orderLocationClass = selectedLocationClass

    let error = false
    if (!from?.address) {
      setFromError(t(TRANSLATION.MAP_FROM_NOT_SPECIFIED_ERROR))
      error = true
    }
    if ((!voting || shouldCreateOfferOrder) && !to?.address) {
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

    const responseCommentIds = shouldCreateOfferOrder ?
      getOfferResponseBookingCommentIds() :
      []
    const bookingCommentIds = Array.from(new Set([
      ...(comments.ids || []),
      ...responseCommentIds,
    ]))

    const commentObj: any = {}
    commentObj['b_comments'] = bookingCommentIds
    comments.custom &&
      (commentObj['b_custom_comment'] = comments.custom)
    comments.flightNumber &&
      (commentObj['b_flight_number'] = comments.flightNumber)
    comments.placard && (commentObj['b_placard'] = comments.placard)

    const startTime = moment(voting || time === 'now' ? undefined : time)

    // Важно: backend для gruzvill/truck строго проверяет b_options.
    // Режим нескольких откликов уже включается старым механизмом через
    // b_location_class + b_comments с responseMode=Candidate, поэтому
    // не отправляем новые служебные ключи в b_options. Иначе API отвечает
    // wrong b_options keys: order_mode, offer_mode, driver_offer_mode...
    const offerOptions = {}

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
        ...(shouldCreateOfferOrder ? { b_luggage_count: luggageCount ?? 0 } : {}),
        ...(shouldCreateOfferOrder ? { b_cars_count: 0 } : {}),
        b_car_class: carClass,
        b_payment_way: EPaymentWays.Cash,
        b_max_waiting: voting ? SITE_CONSTANTS.WAITING_INTERVAL : 7200,
        b_location_class: orderLocationClass,
        b_options: {
          fromShortAddress: from?.shortAddress,
          toShortAddress: to?.shortAddress,
          customer_price: customerPrice,
          ...offerOptions,
        },
        b_voting: shouldCreateOfferOrder ? false : voting,
      })

      resetClientOrder()
      setLuggageCount(null)
      onSubmit(data)
    } catch (error) {
      setSubmitError(
        (error as any)?.message?.toString() ||
        t(TRANSLATION.ERROR),
      )
      console.error(error)
    }
    setSubmitting(false)
  }, [
    from, to, comments, time, phone, user,
    store, setLoginModal, createOrder,
    setIsExpanded, onSubmit, offerAvailable,
    luggageCount,
  ])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const openOfferDetails = useCallback(() => {
    setOfferDetailsOpen(prev => {
      const next = !prev
      // При открытии настроек не поднимаем всю панель на экран.
      // При закрытии возвращаем форму в полностью свернутое состояние.
      setIsExpanded(false)
      return next
    })
  }, [setIsExpanded])

  const offerSummary = isOfferMode ? (
    <div className="passenger-voting-form__offer-compact">
      <div className="passenger-voting-form__offer-compact-text">
        <b>{t(TRANSLATION.CLIENT_OFFER_TITLE)}</b>
        <span>{t(TRANSLATION.CLIENT_OFFER_NOT_FIXED_PRICE)}</span>
      </div>
      <button
        type="button"
        className="passenger-voting-form__offer-toggle"
        onClick={openOfferDetails}
      >
        {t(offerDetailsOpen ? TRANSLATION.CLIENT_OFFER_SETTINGS_CLOSE : TRANSLATION.CLIENT_OFFER_SETTINGS_OPEN)}
      </button>
    </div>
  ) : null

  const offerSettings = isOfferMode && offerDetailsOpen ? (
    <div className="passenger-voting-form__offer-settings">
      <div className="passenger-voting-form__offer-settings-title">
        {t(TRANSLATION.CLIENT_OFFER_TITLE)}
      </div>
      <div className="passenger-voting-form__offer-settings-text">
        {t(TRANSLATION.CLIENT_OFFER_NOT_FIXED_PRICE)}
      </div>

      <PriceInput
        className="passenger-voting-form__input passenger-voting-form__offer-price-input"
        forceCustomerPrice
        offerMode
      />

      <div className="passenger-voting-form__offer-row passenger-voting-form__comments">
        <div className="passenger-voting-form__comments-wrapper">
          <span className="passenger-voting-form__comments-title">
            {t(TRANSLATION.DRIVER_OFFER_CLIENT_COMMENT)}
          </span>
          <span className="passenger-voting-form__comments-value">
            {commentSummary}
          </span>
        </div>
        <button
          type="button"
          className="passenger-voting-form__comments-btn"
          onClick={() => setCommentsModal(true)}
        >
          <img src={images.seatSliderArrowRight} width={16} />
        </button>
      </div>

      <Input
        fieldWrapperClassName="passenger-voting-form__input passenger-voting-form__luggage-input"
        inputType={EInputTypes.Number}
        style={EInputStyles.RedDesign}
        label={t(TRANSLATION.DRIVER_OFFER_LUGGAGE)}
        inputProps={{
          value: luggageCount ?? '',
          min: 0,
          placeholder: '0',
        }}
        onChange={value => setLuggageCount(value as number | null)}
        oneline
      />

      <div className="passenger-voting-form__offer-extra">
        <div className="passenger-voting-form__seats-and-time passenger-voting-form__seats-and-time--offer">
          <div className="passenger-voting-form__seats">
            <span className="passenger-voting-form__seats-title">
              {t(TRANSLATION.SEATS)}
            </span>
            <div ref={seatSliderRef}>
              <SeatSlider />
            </div>
          </div>

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
              type="button"
              className="passenger-voting-form__time-btn"
              onClick={() => setPickTimeModal(true)}
            >
              <Icon src="alarm" className="passenger-voting-form__time-icon" />
            </button>
          </div>
        </div>

        <div className="passenger-voting-form__car-class passenger-voting-form__car-class--offer">
          <div className="passenger-voting-form__car-class-header">
            <span className="passenger-voting-form__car-class-title">
              {t(TRANSLATION.AUTO_CLASS)}
            </span>
            {nearbyCarsCount !== null &&
              <div className="passenger-voting-form__car-nearby-info">
                <Icon
                  src="carNearby"
                  className="passenger-voting-form__car-nearby-icon"
                />
                <span className="passenger-voting-form__car-nearby-info-text">{nearbyCarsCount} автомобилей рядом</span>
              </div>
            }
          </div>
          <div className="passenger-voting-form__offer-class-hint">
            {t(TRANSLATION.CLIENT_OFFER_CLASS_HINT)}
          </div>
          <div ref={carSliderRef}>
            <CarClassSlider />
          </div>
        </div>
      </div>

      <div className="passenger-voting-form__offer-note">
        {t(TRANSLATION.CLIENT_OFFER_HINT)}
      </div>
    </div>
  ) : null

  const submitButtons = (
    <div className="passenger-voting-form__order-button-wrapper">
      {useMemo(() =>
        isOfferMode ?
          <Button
            wrapperProps={{ className: 'passenger-voting-form__order-button' }}
            buttonStyle={EButtonStyles.RedDesign}
            type="submit"
            checkLogin={false}
            text={t(TRANSLATION.CLIENT_OFFER_ORDER_BUTTON, { toUpper: false })}
            onClick={() => submit(false, true)}
            disabled={!available || submitting}
          /> :
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
      , [available, submitting, submit, isOfferMode])}
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
      {offerAvailable &&
        <div className="passenger-voting-form__mode-switch">
          <button
            type="button"
            className={cn('passenger-voting-form__mode-button', {
              'passenger-voting-form__mode-button--active': !isOfferMode,
            })}
            onClick={() => setPassengerOrderMode(false)}
          >
            {t(TRANSLATION.CLIENT_CITY_ORDER_MODE)}
          </button>
          <button
            type="button"
            className={cn('passenger-voting-form__mode-button', {
              'passenger-voting-form__mode-button--active': isOfferMode,
            })}
            onClick={() => setPassengerOrderMode(true)}
          >
            {t(TRANSLATION.CLIENT_OFFER_ORDER_MODE)}
          </button>
        </div>
      }

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

        {offerSummary}

        {offerSettings}

        {useMemo(() => !isExpanded && !isOfferMode && <ShortInfo />, [isExpanded, isOfferMode])}

        {!isExpanded && submitButtons}
      </div>

      {!isOfferMode && <div className="passenger-voting-form__seats-and-time">
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
      </div>}

      {useMemo(() => !isOfferMode &&
        <div className="passenger-voting-form__car-class">
          <div className="passenger-voting-form__car-class-header">
            <span className="passenger-voting-form__car-class-title">
              {t(TRANSLATION.AUTO_CLASS)}
            </span>
            {nearbyCarsCount !== null &&
              <div className="passenger-voting-form__car-nearby-info">
                <Icon
                  src="carNearby"
                  className="passenger-voting-form__car-nearby-icon"
                />
                <span className="passenger-voting-form__car-nearby-info-text">{nearbyCarsCount} автомобилей рядом</span>
              </div>
            }
          </div>
          {isOfferMode &&
            <div className="passenger-voting-form__offer-class-hint">
              {t(TRANSLATION.CLIENT_OFFER_CLASS_HINT)}
            </div>
          }
          <div ref={carSliderRef}>
            <CarClassSlider />
          </div>
        </div>
      , [isOfferMode, nearbyCarsCount])}

      {useMemo(() => !isOfferMode &&
        <div className="passenger-voting-form__comments">
          <div className="passenger-voting-form__comments-wrapper">
            <span className="passenger-voting-form__comments-title">
              {t(TRANSLATION.COMMENT)}
            </span>
            <span className="passenger-voting-form__comments-value">
              {commentSummary}
            </span>
          </div>
          <button
            type="button"
            className="passenger-voting-form__comments-btn"
            onClick={() => setCommentsModal(true)}
          >
            <img src={images.seatSliderArrowRight} width={16} />
          </button>
        </div>
      , [isOfferMode, commentSummary, setCommentsModal])}

      {useMemo(() =>
        <Input
          fieldWrapperClassName="passenger-voting-form__input"
          inputProps={{
            value: phone ?? '',
          }}
          inputType={EInputTypes.MaskedPhone}
          style={EInputStyles.RedDesign}
          buttons={user?.u_phone ?
            [{
              src: images.checkMarkRed,
              onClick() {
                setPhone(+user!.u_phone!)
              },
            }] :
            []
          }
          error={phoneError ?? undefined}
          onChange={(e) => {
            setPhone(e as number)
          }}
        />
      , [phone, setPhone, user, phoneError])}
      {useMemo(() => !isOfferMode && SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE &&
        <PriceInput
          className="passenger-voting-form__input"
        />
      , [isOfferMode])}

      {isExpanded && submitButtons}

    </form>
  )
}

export default connector(VotingForm)