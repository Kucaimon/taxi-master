import React, { useRef } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { createSelector } from 'reselect'
import { IRootState } from '../../state'
import { modalsSelectors } from '../../state/modals'
import Chat from '../Chat'
import CancelOrderModal from './CancelModal'
import TimerModal from './PickTimeModal'
import CommentsModal from './CommentsModal'
import DriverModal from './DriverModal'
import RatingModal from './RatingModal'
import OnTheWayModal from './OnTheWayModal'
import TieCardModal from './TieCardModal'
import CardDetailsModal from './CardDetailsModal'
import VoteModal from './VoteModal'
import PlaceModal from './SeatsModal'
import LoginModal from './LoginModal'
import AlarmModal from './AlarmModal'
import MapModal from './MapModal'
import TakePassengerModal from './TakePassengerModal'
import CancelDriverOrderModal from './DriverCancelModal'
import ProfileModal from './ProfileModal'
import CandidatesModal from './CandidatesModal'
import MessageModal from './MessageModal'
import WACodeModal from './LoginModal/WACodeModal'
import RefCodeModal from './LoginModal/RefCodeModal'
import CardModal from './CardModal'

const COMPONENTS = [
  [Chat, modalsSelectors.activeChat],
  [CancelOrderModal, modalsSelectors.isCancelModalOpen],
  [TimerModal, modalsSelectors.isPickTimeModalOpen],
  [CommentsModal, modalsSelectors.isCommentsModalOpen],
  [DriverModal, modalsSelectors.isDriverModalOpen],
  [RatingModal, modalsSelectors.isRatingModalOpen],
  [OnTheWayModal, modalsSelectors.isOnTheWayModalOpen],
  [TieCardModal, modalsSelectors.isTieCardModalOpen],
  [CardDetailsModal, modalsSelectors.isCardDetailsModalOpen],
  [VoteModal, modalsSelectors.isVoteModalOpen],
  [PlaceModal, modalsSelectors.isSeatsModalOpen],
  [LoginModal, modalsSelectors.isLoginModalOpen],
  [AlarmModal, modalsSelectors.isAlarmModalOpen],
  [MapModal, modalsSelectors.isMapModalOpen],
  [TakePassengerModal, modalsSelectors.isTakePassengerModalOpen],
  [CancelDriverOrderModal, modalsSelectors.isDriverCancelModalOpen],
  [ProfileModal, modalsSelectors.isProfileModalOpen],
  [CandidatesModal, modalsSelectors.isCandidatesModalOpen],
  [MessageModal, modalsSelectors.isMessageModalOpen],
  [WACodeModal, modalsSelectors.isWACodeModalOpen],
  [RefCodeModal, modalsSelectors.isRefCodeModalOpen],
  [CardModal, modalsSelectors.isOrderCardModalOpen],
] as const

const modalsSelector = createSelector(
  (state: IRootState) => state,
  state => new Map<React.ComponentType, boolean>(COMPONENTS.map(
    ([Component, selector]) => [Component, !!selector(state)],
  )),
  { memoizeOptions: {
    resultEqualityCheck: (oldValue, newValue) => [...newValue]
      .every(([Component, isOpen]) => oldValue.get(Component) === isOpen),
  } },
)

const mapStateToProps = (state: IRootState) => ({
  modals: modalsSelector(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function ModalStack({ modals }: IProps) {
  const order = useRef<React.ComponentType[]>([])
  const prevModals = useRef<typeof modals | undefined>(undefined)

  if (modals !== prevModals.current) {
    for (const [index, [Component]] of COMPONENTS.entries()) {
      const isOpen = !!modals.get(Component)
      const wasOpen = !!prevModals.current?.get(Component)
      if (isOpen && !wasOpen) {
        order.current = order.current.filter(C => C !== Component)
        order.current.push(Component)
      }
      if (!isOpen && wasOpen) {
        order.current = order.current.filter(C => C !== Component)
      }
    }
    prevModals.current = modals
  }

  return order.current.map(Component => {
    const componentIndex = COMPONENTS.findIndex(([Item]) => Item === Component)
    return <Component key={componentIndex} />
  })
}

export default connector(ModalStack)
