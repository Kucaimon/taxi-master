import store from '../../state'
import { modalsActionCreators } from '../../state/modals'
import { defaultConfirmationModal } from '../../state/modals/constants'

export type TConfirmationTone = 'info' | 'warning'

export interface IConfirmationOpenPayload {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  tone?: TConfirmationTone
}

let pendingResolve: ((value: boolean) => void) | null = null

export function openConfirmationModal(
  payload: IConfirmationOpenPayload,
): Promise<boolean> {
  if (pendingResolve)
    return Promise.reject(new Error('confirmation_modal_already_open'))
  return new Promise<boolean>(resolve => {
    pendingResolve = resolve
    store.dispatch(modalsActionCreators.setConfirmationModal({
      isOpen: true,
      tone: payload.tone ?? 'info',
      title: payload.title,
      message: payload.message,
      confirmLabel: payload.confirmLabel,
      cancelLabel: payload.cancelLabel,
    }))
  })
}

export function settleConfirmationModal(confirmed: boolean) {
  const resolve = pendingResolve
  pendingResolve = null
  store.dispatch(modalsActionCreators.setConfirmationModal({
    ...defaultConfirmationModal,
  }))
  resolve?.(confirmed)
}
