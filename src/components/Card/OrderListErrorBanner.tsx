import React from 'react'
import './error-banner.scss'
import { t, TRANSLATION } from '../../localization'

interface IProps {
  /** Human-readable error message from the API or network layer. */
  message?: string
  /**
   * Triggered when the user taps "retry". Should re-dispatch the relevant
   * GET_*_REQUEST action; the saga clears the error on a successful
   * response.
   */
  onRetry: () => void
}

/**
 * Replaces the eternal skeleton when an order list fails to load. Without
 * this banner the reducer ignored *_FAIL and the lists stayed at `null`
 * forever, which the UI rendered as "loading…" with no escape hatch — a
 * confusing failure mode on flaky mobile networks.
 *
 * Strings: `TRANSLATION.ERROR` exists in the dictionary; the retry label is
 * a short literal because the backend `lang_vls` table does not currently
 * carry a "retry/refresh" entry. Keeping it inline avoids the translator
 * warning that masks real localization bugs.
 */
const OrderListErrorBanner: React.FC<IProps> = ({ message, onRetry }) => (
  <div
    className="status-card status-card--error"
    role="alert"
    aria-live="polite"
  >
    <div className="status-card__top">
      <span className="status-card--error__title">
        {t(TRANSLATION.ERROR)}
      </span>
    </div>
    {message ?
      <div className="status-card--error__message">{message}</div> :
      null}
    <button
      type="button"
      className="status-card--error__retry"
      onClick={onRetry}
    >
      Refresh
    </button>
  </div>
)

export default OrderListErrorBanner
