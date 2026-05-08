import React, { useCallback } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { IOrder } from '../../types/types'
import { IRootState } from '../../state'
import { ordersSelectors } from '../../state/orders'
import { clientOrderActionCreators } from '../../state/clientOrder'
import { modalsActionCreators } from '../../state/modals'
import ActiveOrderCard from './Card'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
})

const mapDispatchToProps = {
  setSelectedOrder: clientOrderActionCreators.setSelectedOrder,
  setCancelModal: modalsActionCreators.setCancelModal,
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
}: IProps) {
  const handleCancel = useCallback((order: IOrder) => {
    // Open the existing CancelModal so the reason picker still gates
    // the destructive action — the new × button is only the entry
    // point, not an instant-cancel.
    setSelectedOrder(order.b_id)
    setCancelModal(true)
  }, [setSelectedOrder, setCancelModal])

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
            onSelect={onOrderSelect}
            onCancel={handleCancel}
          />
        ))}
      </div>
    </div>
  )
}

export default connector(ActiveOrdersOverlay)
