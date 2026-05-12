import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { EBookingDriverState, EStatuses, IOrder } from '../../types/types'
import { candidateMode } from '../../tools/order'
import { useSwipe } from '../../tools/swipe'
import * as API from '../../API'
import { IRootState } from '../../state'
import {
  clientOrderSelectors,
  clientOrderActionCreators,
} from '../../state/clientOrder'
import { ordersSelectors, ordersActionCreators } from '../../state/orders'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import MiniOrders from '../../components/MiniOrders'
import Map from '../../components/Map'
import Layout from '../../components/Layout'
import PageSection from '../../components/PageSection'
import BoundaryButtons from '../../components/BoundaryButtons'
import VotingForm from './VotingForm'
import './styles.scss'
import { t, TRANSLATION } from '../../localization'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  user: userSelectors.user(state),
})

const mapDispatchToProps = {
  setVoteModal: modalsActionCreators.setVoteModal,
  setDriverModal: modalsActionCreators.setDriverModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setOnTheWayModal: modalsActionCreators.setOnTheWayModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  setCandidatesModal: modalsActionCreators.setCandidatesModal,
  watchActiveOrders: ordersActionCreators.watchActiveOrders,
  setFrom: clientOrderActionCreators.setFrom,
  setTo: clientOrderActionCreators.setTo,
  setSelectedOrder: clientOrderActionCreators.setSelectedOrder,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> { }

function Passenger({
  activeOrders,
  selectedOrder: selectedOrderID,
  user,
  setVoteModal,
  setDriverModal,
  setMessageModal,
  setOnTheWayModal,
  setRatingModal,
  setCandidatesModal,
  watchActiveOrders,
  setFrom,
  setTo,
  setSelectedOrder,
}: IProps) {

  const mapCenter = useRef<[lat: number, lng: number]>(null)
  const setMapCenter = useCallback((value: [number, number]) => {
    mapCenter.current = value
  }, [])

  const formContainerRef = useRef<HTMLDivElement>(null)
  const draggableRef = useRef<HTMLDivElement>(null)
  const minimizedPartRef = useRef<HTMLElement>(null)
  const formSlidersRef = useRef<HTMLElement[]>([])
  const { isExpanded, setIsExpanded } = useSwipe(
    formContainerRef, draggableRef,
    minimizedPartRef, formSlidersRef,
  )

  const setFromAsMapCenter = useCallback(() => {
    if (mapCenter.current) {
      const [latitude, longitude] = mapCenter.current
      setFrom({ latitude, longitude })
    }
    setIsExpanded(false)
  }, [setFrom, setIsExpanded])
  const setToAsMapCenter = useCallback(() => {
    if (mapCenter.current) {
      const [latitude, longitude] = mapCenter.current
      setTo({ latitude, longitude })
    }
    setIsExpanded(false)
  }, [setTo, setIsExpanded])

  const selectedOrder = useMemo(() =>
    activeOrders?.find((item) => item.b_id === selectedOrderID) ?? null
  , [activeOrders, selectedOrderID])
  const selectedOrderDriver = useMemo(() =>
    selectedOrder?.drivers &&
    selectedOrder?.drivers.find(
      (item) => selectedOrder.b_voting ?
        isVotingDriverVisible(item.c_state) :
        item.c_state > EBookingDriverState.Canceled,
    )
  , [selectedOrder])

  useEffect(watchActiveOrders, [])

  const openCurrentModal = () => {
    if (!selectedOrder) {
      setVoteModal(false)
      setDriverModal(false)
      setOnTheWayModal(false)
      setCandidatesModal(false)
    }

    else if (
      candidateMode(selectedOrder) && !selectedOrderDriver &&
      (selectedOrder.drivers?.length ?? 0) > 0
    )
      setCandidatesModal(true)

    else if (
      selectedOrder.b_voting &&
      isVotingWaitingState(selectedOrderDriver?.c_state)
    )
      setVoteModal(true)

    else
      onDriverStateChange()
  }

  useEffect(() => {
    onDriverStateChange()
  }, [selectedOrderDriver?.c_state])

  const onDriverStateChange = () => {
    if (
      selectedOrder?.b_voting &&
      isVotingWaitingState(selectedOrderDriver?.c_state)
    ) {
      setVoteModal(true)
      setDriverModal(false)
      setOnTheWayModal(false)
      setCandidatesModal(false)
      return
    }

    if (
      !selectedOrderDriver ||
      selectedOrderDriver.c_state === EBookingDriverState.Finished
    ) {
      setVoteModal(false)
      setDriverModal(false)
      setOnTheWayModal(false)
      setCandidatesModal(false)
      return
    }

    if (
      [
        EBookingDriverState.Performer,
        EBookingDriverState.Arrived,
      ].includes(selectedOrderDriver.c_state)
    ) {
      setVoteModal(false)
      setDriverModal(true)
    } else if (
      selectedOrderDriver?.c_state === EBookingDriverState.Started
    ) {
      setVoteModal(false)
      setDriverModal(false)
      setOnTheWayModal(true)
      setCandidatesModal(false)
    }
  }

  const [orderReselected, setOrderReselected] = useState(false)
  useEffect(() => {
    if (orderReselected) {
      openCurrentModal()
      setOrderReselected(false)
    }
  }, [orderReselected])

  const prevActiveOrders = useRef<IOrder[]>([])
  const previousDriverStates = useRef<Record<string, EBookingDriverState>>({})
  useEffect(() => {
    (async() => {

      const activeOrdersIds = new Set(
        activeOrders?.map(order => order.b_id) ?? [],
      )
      for (const order of prevActiveOrders.current) {
        if (activeOrdersIds.has(order.b_id))
          continue

        const driver = order.drivers
          ?.find(item => item.c_state !== EBookingDriverState.Canceled)
        if (!driver)
          return

        if (driver.c_state <= EBookingDriverState.Started) {
          try {
            const res = await API.getOrder(order.b_id)
            const resDriver = res?.drivers
              ?.find(item => item.c_state !== EBookingDriverState.Canceled)
            if (resDriver?.c_state === EBookingDriverState.Finished) {
              setRatingModal({ isOpen: true, orderID: order.b_id })
              break
            }
          } catch (error) {
            console.error(error)
          }
        }
      }

    })()

    const nextDriverStates: Record<string, EBookingDriverState> = {}
    for (const order of activeOrders ?? []) {
      for (const driver of order.drivers ?? []) {
        const key = `${order.b_id}:${driver.u_id}`
        const previousState = previousDriverStates.current[key]
        nextDriverStates[key] = driver.c_state

        if (
          previousState &&
          previousState !== EBookingDriverState.Arrived &&
          driver.c_state === EBookingDriverState.Arrived
        ) {
          setSelectedOrder(order.b_id)
          setMessageModal({
            isOpen: true,
            status: EStatuses.Success,
            message: t(TRANSLATION.CLIENT_DRIVER_ARRIVED),
          })
        }
      }
    }
    previousDriverStates.current = nextDriverStates
    prevActiveOrders.current = activeOrders ?? []
  }, [activeOrders])

  const handleOrderClick = useCallback((order: IOrder) => {
    setSelectedOrder(order.b_id)
    setOrderReselected(true)
  }, [setSelectedOrder])

  const submittedOrderId = useRef<IOrder['b_id'] | null>(null)
  const onSubmit = useCallback((data: { b_id: IOrder['b_id'] }) => {
    submittedOrderId.current = data.b_id
    setSelectedOrder(data.b_id)
    setIsExpanded(false)
  }, [setSelectedOrder, setIsExpanded])
  useEffect(() => {
    if (submittedOrderId.current === null)
      return
    for (const order of activeOrders ?? [])
      if (order.b_id === submittedOrderId.current) {
        if (order.b_id === selectedOrderID)
          openCurrentModal()
        submittedOrderId.current = null
      }
  }, [activeOrders])

  return (
    <Layout>
      <PageSection className="passenger" scrollable={false}>

        {useMemo(() =>
          <MiniOrders
            className="passenger__mini-orders"
            handleOrderClick={handleOrderClick}
          />
        , [handleOrderClick])}

        {useMemo(() =>
          <Map
            containerClassName="passenger__form-map-container"
            setCenter={setMapCenter}
          />
        , [setMapCenter])}

        <div className="passenger__form-placeholder" />

        <div
          ref={formContainerRef}
          className="passenger__form-container"
        >
          {useMemo(() => <BoundaryButtons />, [])}
          <div
            className="passenger__draggable"
            ref={draggableRef}
          >
            <div className="passenger__swipe-line"></div>

            {useMemo(() =>
              <VotingForm
                isExpanded={isExpanded}
                setIsExpanded={setIsExpanded}
                syncFrom={setFromAsMapCenter}
                syncTo={setToAsMapCenter}
                onSubmit={onSubmit}
                minimizedPartRef={minimizedPartRef}
                noSwipeElementsRef={formSlidersRef}
              />
            , [
              isExpanded, setIsExpanded,
              setFromAsMapCenter, setToAsMapCenter,
              onSubmit,
            ])}
          </div>
        </div>

      </PageSection>
    </Layout>
  )
}

export default connector(Passenger)

function isVotingDriverVisible(state: EBookingDriverState) {
  return [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
  ].includes(state)
}

function isVotingWaitingState(state?: EBookingDriverState) {
  return !state || [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
  ].includes(state)
}
