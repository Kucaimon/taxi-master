import React, { useEffect, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import './styles.scss'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
import SITE_CONSTANTS from '../../siteConstants'
import { IRootState } from '../../state'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import moment from 'moment'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { useInterval } from '../../tools/hooks'
import images from '../../constants/images'
import Overlay from './Overlay'
import { EColorTypes } from '../../types/types'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isVoteModalOpen(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  activeOrders: ordersSelectors.activeOrders(state),
})

const mapDispatchToProps = {
  setVoteModal: modalsActionCreators.setVoteModal,
  setCancelModal: modalsActionCreators.setCancelModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const VoteModal: React.FC<IProps> = ({
  isOpen,
  selectedOrder,
  activeOrders,
  setVoteModal,
  setCancelModal,
}) => {
  const order = activeOrders?.find(item => item.b_id === selectedOrder)

  const [sumSeconds, setSumSeconds] = useState(order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)
  const [seconds, setSeconds] = useState(
    order?.b_start_datetime ?
      (sumSeconds - moment().diff(order?.b_start_datetime, 'seconds')) :
      sumSeconds,
  )

  useInterval(() => {
    const newSeconds = order?.b_start_datetime ?
      ((sumSeconds || SITE_CONSTANTS.WAITING_INTERVAL) - moment().diff(order?.b_start_datetime, 'seconds')) :
      sumSeconds || SITE_CONSTANTS.WAITING_INTERVAL
    if (newSeconds <= 0 && isOpen) {
      console.error('Seconds is less then 0')
      setVoteModal(false)
      setSeconds(order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)
      setSumSeconds(order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)
      return
    }
    setSeconds(newSeconds)
  }, 1000)

  useEffect(() => {
    if (isOpen) {
      setSeconds(
        order?.b_start_datetime ?
          ((sumSeconds || SITE_CONSTANTS.WAITING_INTERVAL) - moment().diff(order?.b_start_datetime, 'seconds')) :
          sumSeconds || SITE_CONSTANTS.WAITING_INTERVAL,
      )
      setSumSeconds(order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)
    }
  }, [isOpen, selectedOrder])

  const onWaiting = () => {
    if (!selectedOrder) return

    // TODO use waiting_interval_add
    const additionalTime = 180

    API.setWaitingTime(selectedOrder, sumSeconds)
      .then(() => {
        setSumSeconds(prev => prev + additionalTime)
        setSeconds(prev => prev + additionalTime)
      })
      .catch(error => console.error(error))
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setVoteModal(false)}
    >
      <div
        className="modal vote-modal"
      >
        <form>
          <fieldset>
            <legend>
              {/* TODO replace spaces by margin */}
              {t(TRANSLATION.ORDER)} №{selectedOrder}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              {t(TRANSLATION.DRIVE)} №{order?.b_driver_code}
            </legend>
            <div className="timer-block">
              <img src={images.timer} className="timer-block_timer-img" alt={t(TRANSLATION.TIMER)} style={{ display: 'flex',margin: '0 auto' }} />
              <div className="article-container" style={{ display: 'flex',margin: '10px 0' }}>
                <article className="colored" style={{ display: 'flex',margin: '0 auto' }}>
                  {t(TRANSLATION.LEFT)} <span style={{ marginLeft: '5px', marginRight: '5px' }}>{seconds}</span> {t(TRANSLATION.SECONDS)}
                </article>
              </div>

              <Button
                text={t(TRANSLATION.CONTINUE_WAITING)}
                className="vote-modal-btn"
                onClick={onWaiting}
              />
              <div className='groupped-buttons'>
                <Button
                  type="button"
                  text={t(TRANSLATION.CANCEL)}
                  className='vote-modal-btn cancel'
                  colorType={EColorTypes.Accent}
                  onClick={() => {
                    setVoteModal(false)
                    setCancelModal(true)
                  }}
                />
              </div>
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(VoteModal)

