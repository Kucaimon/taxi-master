import React from 'react'
import './styles.scss'
import './skeleton.scss'

interface IProps {
  /** How many skeleton cards to render. */
  count?: number
}

/**
 * Placeholder card used while order lists are still loading. Sized to
 * match the real `.status-card` so the layout does not jump when data
 * arrives. We render the skeleton instead of an empty `<div>` so the
 * driver/passenger gets immediate feedback that polling is in flight,
 * which the brief explicitly asks for ("loading/empty/error states").
 */
const OrderCardSkeleton: React.FC<IProps> = ({ count = 1 }) => {
  const placeholders = Array.from({ length: count })
  return (
    <>
      {placeholders.map((_, i) => (
        <div
          key={i}
          className="status-card status-card--skeleton"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="status-card__top">
            <span className="skeleton-line skeleton-line--time" />
            <span className="skeleton-line skeleton-line--number" />
          </div>
          <div className="status-card__points">
            <span className="skeleton-line skeleton-line--row" />
            <span className="skeleton-line skeleton-line--row" />
          </div>
          <div className="status-card__separator separate status-card__money">
            <span className="skeleton-line skeleton-line--cost" />
          </div>
        </div>
      ))}
    </>
  )
}

export default OrderCardSkeleton
