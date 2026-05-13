import React, { createContext, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import DriverOrders from './Orders'
import DriverMap from './Map'
import { t, TRANSLATION } from '../../localization'
import { connect, ConnectedProps } from 'react-redux'
import { IRootState } from '../../state'
import { useQuery } from '../../tools/hooks'
import './styles.scss'
import { ordersSelectors, ordersActionCreators } from '../../state/orders'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import { carsActionCreators } from '../../state/cars'
import { configSelectors } from '../../state/config'
import { EUserRoles, IAddressPoint } from '../../types/types'
import cn from 'classnames'
import ErrorFrame from '../../components/ErrorFrame'
import images from '../../constants/images'
import { withLayout } from '../../HOCs/withLayout'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
  readyOrders: ordersSelectors.readyOrders(state),
  historyOrders: ordersSelectors.historyOrders(state),
  user: userSelectors.user(state),
  language: configSelectors.language(state),
})

const mapDispatchToProps = {
  watchActiveOrders: ordersActionCreators.watchActiveOrders,
  watchReadyOrders: ordersActionCreators.watchReadyOrders,
  watchHistoryOrders: ordersActionCreators.watchHistoryOrders,
  setLoginModal: modalsActionCreators.setLoginModal,
  getUserCars: carsActionCreators.getUserCars,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

export const OrderAddressContext = createContext<{ ordersAddressRef: React.RefObject<{
  [orderId: string]: IAddressPoint;
}> }|null>(null)

export enum EDriverTabs {
  Map = 'map',
  Lite = 'lite',
  Detailed = 'detailed'
}

interface IProps extends ConnectedProps<typeof connector> {}

const Driver: React.FC<IProps> = ({
  activeOrders,
  readyOrders,
  historyOrders,
  user,
  language,
  watchActiveOrders,
  watchHistoryOrders,
  watchReadyOrders,
  setLoginModal,
  getUserCars,
}) => {

  const { tab = EDriverTabs.Lite } = useQuery()

  const navigate = useNavigate()

  const ordersAddressRef = useRef<{ [orderId:string]: IAddressPoint }>({})

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver)
      return
    getUserCars()
    watchActiveOrders()
  }, [user?.u_role, watchActiveOrders, getUserCars])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver)
      return
    watchReadyOrders()
  }, [user?.u_role, watchReadyOrders])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver)
      return
    watchHistoryOrders()
  }, [user?.u_role, watchHistoryOrders])

  if (user?.u_role !== EUserRoles.Driver) {
    return (
      <ErrorFrame
        renderImage={() => (
          <div className="errorIcon" onClick={() => setLoginModal(true)}>
            <img src={images.avatar} alt={t(TRANSLATION.ERROR)} style={{ marginTop: '50px' }}/>
          </div>
        )}
        title={t(TRANSLATION.UNAUTHORIZED_ACCESS)}
      />
    )
  }

  return (
    <>
      <div className="driver-tabs">
        <button
          onClick={() => navigate(`?tab=${EDriverTabs.Lite}`)}
          className={cn('driver-tabs__tab', { 'driver-tabs__tab--active': tab === EDriverTabs.Lite })}
        >
          {t(TRANSLATION.LIGHT)}
        </button>
        <button
          onClick={() => navigate(`?tab=${EDriverTabs.Detailed}`)}
          className={cn('driver-tabs__tab', { 'driver-tabs__tab--active': tab === EDriverTabs.Detailed })}
        >
          {t(TRANSLATION.ALL)}
        </button>
        <button
          onClick={() => navigate(`?tab=${EDriverTabs.Map}`)}
          className={cn('driver-tabs__tab', { 'driver-tabs__tab--active': tab === EDriverTabs.Map })}
        >
          {t(TRANSLATION.MAP)}
        </button>
      </div>
      {(tab === EDriverTabs.Lite || tab === EDriverTabs.Detailed) &&
        <OrderAddressContext.Provider value={{ ordersAddressRef }}>
          <DriverOrders
            key={language?.iso}
            user={user}
            type={tab}
            activeOrders={activeOrders}
            readyOrders={readyOrders}
            historyOrders={historyOrders}
          />
        </OrderAddressContext.Provider>
      }
      {tab === EDriverTabs.Map &&
        <OrderAddressContext.Provider value={{ ordersAddressRef }}>
          <DriverMap
            key={language?.iso}
            user={user}
            activeOrders={activeOrders}
            readyOrders={readyOrders}
          />
        </OrderAddressContext.Provider>
      }
    </>
  )
}

export default withLayout(connector(Driver))
