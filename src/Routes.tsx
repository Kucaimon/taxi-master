import React, { Suspense, lazy } from 'react'
import { Route, Routes, Navigate, useLocation } from 'react-router-dom'
import {
  configSelectors,
} from './state/config'
import { connect, ConnectedProps } from 'react-redux'
import images from './constants/images'
import { t, TRANSLATION } from './localization'
import { IRootState } from './state'
import { EStatuses, EUserRoles, IUser } from './types/types'
import { userSelectors } from './state/user'
import Sandbox from './pages/Sandbox'
import PageSection from './components/PageSection'

const PassengerOrder = lazy(() => import('./pages/Passenger'))
const Order = lazy(() => import('./pages/Order'))
const DriverOrder = lazy(() => import('./pages/Driver'))
const ConfigHud = lazy(() => import('./pages/ConfigHud'))

const mapStateToProps = (state: IRootState) => ({
  status: configSelectors.status(state),
  user: userSelectors.user(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {

}

const AppRoutesWrapper: React.FC<IProps> = ({ status, user }) => {
  // /config must stay reachable even when the upstream config is broken,
  // otherwise QA/admins cannot recover from the "DB unavailable" screen.
  const location = useLocation()
  if (location.pathname === '/config') {
    return <Suspense fallback={null}><ConfigHud /></Suspense>
  }
  return status === EStatuses.Success ?
    <Suspense fallback={null}><AppRoutes user={user}/></Suspense> :
    <UnavailableBase/>
}

const UnavailableBase = () => {
  return <PageSection>
    <div className="loading-frame">
      <img src={images.error} alt={t(TRANSLATION.ERROR)}/>
      <div className="loading-frame__title">{t(TRANSLATION.DATABASE_IS_UNAVAILABLE)}</div>
    </div>
  </PageSection>
}

const AppRoutes = ({ user }: {user: IUser | null}) => (
  <Routes>
    <Route
      path="/*"
      element={<>
        <Navigate
          replace
          to={
            [
              EUserRoles.Client,
              EUserRoles.Agent,
            ].includes(user?.u_role as EUserRoles) ?
              '/passenger-order' :
              user?.u_role === EUserRoles.Driver ?
                '/driver-order' :
                '/'
          }
        />
        <PassengerOrder />
      </>}
    />
    <Route path="/passenger-order" element={<PassengerOrder />} />
    <Route path="/driver-order/:id" element={<Order />} />
    <Route path="/driver-order" element={<DriverOrder />} />
    <Route path="/driver-order-test" element={<DriverOrder />} />
    <Route path="/sandbox" element={<Sandbox />} />
    <Route path="/config" element={<ConfigHud />} />
  </Routes>
)

export default connector(AppRoutesWrapper)
