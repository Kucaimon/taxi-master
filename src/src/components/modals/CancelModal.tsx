import React, { useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { ArrayValue } from '../../types'
import SITE_CONSTANTS from '../../siteConstants'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersActionCreators } from '../../state/orders'
import Button from '../Button'
import Overlay from './Overlay'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  isOpen: modalsSelectors.isCancelModalOpen(state),
})

const mapDispatchToProps = {
  setCancelModal: modalsActionCreators.setCancelModal,
  setVoteModal: modalsActionCreators.setVoteModal,
  setDriverModal: modalsActionCreators.setDriverModal,
  setOnTheWayModal: modalsActionCreators.setOnTheWayModal,
  cancelOrder: ordersActionCreators.cancel,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const CancelOrderModal: React.FC<IProps> = ({
  selectedOrder,
  isOpen,
  setCancelModal,
  setVoteModal,
  setDriverModal,
  setOnTheWayModal,
  cancelOrder,
}) => {
  const REASONS = [
    { id: 0, label: t(TRANSLATION.MISTAKENLY_ORDERED) },
    { id: 1, label: t(TRANSLATION.WAITING_FOR_LONG) },
    { id: 2, label: t(TRANSLATION.CONFLICT_WITH_RIDER) },
    { id: 3, label: t(TRANSLATION.VERY_EXPENSIVE) },
  ] as const
  const REASONS_IDS = REASONS.map(item => item.id)

  const [reason, setReason] = useState<ArrayValue<typeof REASONS_IDS>>(REASONS[0].id)

  function onDenial() {
    if (selectedOrder)
      cancelOrder(
        selectedOrder,
        REASONS.find(item => item.id === reason)?.label,
      )
    setCancelModal(false)
    setVoteModal(false)
    setDriverModal(false)
    setOnTheWayModal(false)
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setCancelModal(false)}
    >
      <div className="modal cancel-order-modal message-window">
        {
          REASONS.map(item => {
            const active = reason === item.id ? ' active' : ''
            return (
              <div
                key={item.id}
                onClick={e => setReason(item.id)}
                className={cn('reason-item', { 'reason-item--active': active } )}
                style={{ color: active ? SITE_CONSTANTS.PALETTE.primary.dark : undefined }}
              >
                {item.label}
              </div>
            )
          })
        }
        <div className="modal__buttons-block">
          <Button
            text={t(TRANSLATION.CANCEL_ORDER)}
            onClick={onDenial}
          />
          <Button
            text={t(TRANSLATION.CANCEL)}
            onClick={() => setCancelModal(false)}
          />
        </div>
      </div>
    </Overlay>
  )
}

export default connector(CancelOrderModal)
