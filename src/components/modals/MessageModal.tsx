import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import './styles.scss'
import { defaultMessageModal } from '../../state/modals/reducer'
import Overlay from './Overlay'
import cn from 'classnames'
import { getStatusClassName } from '../../tools/utils'
import { EColorTypes } from '../../types/types'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isMessageModalOpen(state),
  message: modalsSelectors.messageModalMessage(state),
  status: modalsSelectors.messageModalStatus(state),
})

const mapDispatchToProps = {
  setMessageModal: modalsActionCreators.setMessageModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const MessageModal: React.FC<IProps> = ({
  isOpen,
  message,
  status,
  setMessageModal,
}) => {
  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setMessageModal({ ...defaultMessageModal })}
    >
      <div className="modal message-modal">
        <div className={cn('message-modal__text', { [`message-modal__text--${status && getStatusClassName(status)}`]: status })}>
          {message}
        </div>
        <Button
          text={t(TRANSLATION.OK)}
          skipHandler
          colorType={EColorTypes.Accent}
          onClick={() => setMessageModal({ ...defaultMessageModal })}
        />
      </div>
    </Overlay>
  )
}

export default connector(MessageModal)
