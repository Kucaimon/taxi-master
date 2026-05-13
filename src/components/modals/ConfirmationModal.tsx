import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { IRootState } from '../../state'
import { modalsSelectors } from '../../state/modals'
import { settleConfirmationModal } from './confirmationModalRuntime'
import Overlay from './Overlay'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  modal: modalsSelectors.confirmationModal(state),
})

const connector = connect(mapStateToProps)

type IProps = ConnectedProps<typeof connector>

function ConfirmationModal({ modal }: IProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  const handleCancel = useCallback(() => {
    if (!modal.isOpen) return
    settleConfirmationModal(false)
  }, [modal.isOpen])

  const handleConfirm = useCallback(() => {
    if (!modal.isOpen) return
    settleConfirmationModal(true)
  }, [modal.isOpen])

  useLayoutEffect(() => {
    if (modal.isOpen)
      confirmRef.current?.focus()
  }, [modal.isOpen])

  useEffect(() => {
    if (!modal.isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        settleConfirmationModal(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal.isOpen])

  return (
    <Overlay
      isOpen={modal.isOpen}
      onClick={handleCancel}
      wrapperClassName="confirmation-modal-overlay-host"
    >
      <div
        className={cn(
          'modal',
          'confirmation-modal',
          modal.tone === 'warning' && 'confirmation-modal--warning',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="confirmation-modal-title" className="confirmation-modal__title">
          {modal.title}
        </h3>
        <p className="confirmation-modal__message">
          {modal.message}
        </p>
        <div className="confirmation-modal__actions">
          <button
            type="button"
            className="confirmation-modal__btn confirmation-modal__btn--secondary"
            onClick={handleCancel}
          >
            {modal.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="confirmation-modal__btn confirmation-modal__btn--primary"
            onClick={handleConfirm}
          >
            {modal.confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export default connector(ConfirmationModal)
