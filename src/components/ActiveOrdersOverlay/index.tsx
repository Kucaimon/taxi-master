import React, { useCallback, useEffect, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { IOrder } from '../../types/types'
import { EStatuses } from '../../types/types'
import { IRootState } from '../../state'
import { ordersSelectors, ordersActionCreators } from '../../state/orders'
import { clientOrderActionCreators } from '../../state/clientOrder'
import { modalsActionCreators } from '../../state/modals'
import { formatCurrency } from '../../tools/utils'
import { t, tLangVls, TRANSLATION } from '../../localization'
import { openConfirmationModal } from '../modals/confirmationModalRuntime'
import ActiveOrderCard from './Card'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
})

const mapDispatchToProps = {
  setSelectedOrder: clientOrderActionCreators.setSelectedOrder,
  setCancelModal: modalsActionCreators.setCancelModal,
  raisePickupTip: ordersActionCreators.raisePickupTip,
  setMessageModal: modalsActionCreators.setMessageModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
  onOrderSelect: (order: IOrder) => void
}

function ActiveOrdersOverlay({
  activeOrders,
  className,
  onOrderSelect,
  setSelectedOrder,
  setCancelModal,
  raisePickupTip,
  setMessageModal,
}: IProps) {
  // Single-card-at-a-time expansion: tracking it locally (not in
  // Redux) keeps the open-state purely visual and avoids polluting
  // global state with what is effectively transient UI affordance.
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  // If the order being expanded disappears (Finished / Cancelled /
  // server cleanup), close the panel rather than leaving an
  // orphaned id that would never match any rendered card again.
  useEffect(() => {
    if (!expandedOrderId) return
    const stillThere = activeOrders?.some(o => o.b_id === expandedOrderId)
    if (!stillThere)
      setExpandedOrderId(null)
  }, [activeOrders, expandedOrderId])

  const handleToggleExpand = useCallback((order: IOrder) => {
    setExpandedOrderId(prev => prev === order.b_id ? null : order.b_id)
  }, [])

  const handleOpenDetails = useCallback((order: IOrder) => {
    // Match the legacy modal-flow handshake: marking the order as
    // selected drives `Passenger/index.tsx` to call
    // `openCurrentModal()` and route the user to the modal that
    // matches the current driver state (vote / candidates /
    // performer / on-the-way).
    onOrderSelect(order)
  }, [onOrderSelect])

  const handleCancel = useCallback((order: IOrder) => {
    // Open the existing CancelModal so the reason picker still gates
    // the destructive action — the new × button is only the entry
    // point, not an instant-cancel.
    setSelectedOrder(order.b_id)
    setCancelModal(true)
  }, [setSelectedOrder, setCancelModal])

  const handlePickupTipPlus = useCallback(async(order: IOrder) => {
    const current = Number(order.b_options?.submitPrice) || 0
    const next = current + 1
    const body = [
      tLangVls(TRANSLATION.PICKUP_TIP_CONFIRM_BODY),
      '',
      `${tLangVls(TRANSLATION.PICKUP_TIP_CONFIRM_NEW_TOTAL)}: ${
        formatCurrency(next)
      }`,
    ].join('\n')
    try {
      const ok = await openConfirmationModal({
        title: tLangVls(TRANSLATION.PICKUP_TIP_CONFIRM_TITLE),
        message: body,
        confirmLabel: tLangVls(TRANSLATION.CONFIRM),
        cancelLabel: tLangVls(TRANSLATION.CANCEL),
        tone: 'info',
      })
      if (!ok) return
      try {
        await raisePickupTip(order.b_id, next)
      } catch (error) {
        const message =
          error instanceof Error ?
            error.message :
            t(TRANSLATION.ERROR)
        setMessageModal({
          isOpen: true,
          message,
          status: EStatuses.Fail,
        })
      }
    } catch {
      // Concurrent confirmation modal.
    }
  }, [raisePickupTip, setMessageModal])

  if (!activeOrders?.length) return null

  return (
    <div
      className={cn('active-orders-overlay', className)}
      role="region"
      aria-label="Active orders"
    >
      <div className="active-orders-overlay__strip">
        {activeOrders.map(order => (
          <ActiveOrderCard
            key={order.b_id}
            order={order}
            isExpanded={expandedOrderId === order.b_id}
            onToggleExpand={handleToggleExpand}
            onOpenDetails={handleOpenDetails}
            onCancel={handleCancel}
            onPickupTipPlus={handlePickupTipPlus}
          />
        ))}
      </div>
    </div>
  )
}

export default connector(ActiveOrdersOverlay)
