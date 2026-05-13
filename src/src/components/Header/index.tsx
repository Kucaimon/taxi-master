import React, { useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import cn from 'classnames'
import moment from 'moment'
import { EBookingDriverState, EUserRoles, ILanguage, EStatuses } from '../../types/types'
import config from '../../config'
import images from '../../constants/images'
import SITE_CONSTANTS from '../../siteConstants'
import * as API from '../../API'
import { useInterval } from '../../tools/hooks'
import { setCookie } from '../../utils/cookies'
import { IRootState } from '../../state'
import { configSelectors, configActionCreators } from '../../state/config'
import { modalsActionCreators } from '../../state/modals'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import { userSelectors, userActionCreators } from '../../state/user'
import { carsSelectors } from '../../state/cars'
import {
  getDriverStatus,
  isDriverCarAdded,
  isDriverCarApproved,
  isDriverOnline,
  isDriverProfileApproved,
} from '../../tools/driverStatus'
import { getApiErrorMessage } from '../../tools/apiMessages'
import { t, TRANSLATION } from '../../localization'
import { Burger } from '../Burger/Burger'
import DriverStatusAvatar from '../DriverStatusAvatar'
import './styles.scss'

const FLAGS_IMAGES: Record<string, string> = {
  ru: images.flagRu,
  gb: images.flagGb,
  fr: images.flagFr,
  ma: images.flagMar,
}

interface IMenuItem {
  label: string
  action?: (index: number) => any
  href?: string,
  type?: string
}

const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
  language: configSelectors.language(state),
  activeOrders: ordersSelectors.activeOrders(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  primaryCar: carsSelectors.userPrimaryCar(state),
})

const mapDispatchToProps = {
  setLanguage: configActionCreators.setLanguage,
  setLoginModal: modalsActionCreators.setLoginModal,
  setProfileModal: modalsActionCreators.setProfileModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  updateUser: userActionCreators.initUser,
  logout: userActionCreators.logout,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
}

function Header({
  user,
  language,
  activeOrders,
  selectedOrder,
  primaryCar,
  setLanguage,
  setLoginModal,
  setProfileModal,
  setMessageModal,
  updateUser,
  logout,
  className,
}: IProps) {
  const [languagesOpened, setLanguagesOpened] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [menuOpened, setMenuOpened] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  if (!menuOpened && languagesOpened)
    setLanguagesOpened(false)

  const location = useLocation()
  const navigate = useNavigate()

  const clientOrder = activeOrders?.find(item => item.b_id === selectedOrder)
  const driver = clientOrder?.drivers?.find(item =>
    item.c_state > EBookingDriverState.Canceled || item.c_state === EBookingDriverState.Considering,
  )

  const menuItems: IMenuItem[] = []
  menuItems.push({
    label: t('profile'),
    action: () => {
      setProfileModal({ isOpen: true })
      setMenuOpened(false)
    },
  })

  menuItems.push({
    label: t('language'),
    type: 'language',
    action: () => {
      setLanguagesOpened(prev => !prev)
    },
  })

  useInterval(() => {
    if (clientOrder) {
      if (driver) return setSeconds(0)
      const _seconds = moment().diff(clientOrder?.b_start_datetime, 'seconds')
      if (_seconds > (clientOrder?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)) return setSeconds(0)
      setSeconds(_seconds)
    } else if (seconds !== 0) setSeconds(0)
  }, 1000)

  const onReturn = () => {
    navigate(-1)
  }

  const toggleMenuOpened = () => {
    setMenuOpened(prev => !prev)
  }

  const detailedOrderID = matchPath({ path: '/driver-order/:id' }, location.pathname)?.params.id

  let avatar = images.noUserAvatar
  let avatarSize = '24px'
  if (user) {
    avatar = user.u_photo || images.noImgAvatar
    avatarSize = user.u_photo ? 'cover' : '24px'
  }

  const isDriver = user?.u_role === EUserRoles.Driver
  const hasCar = isDriverCarAdded(primaryCar)
  const isApprovedDriver = isDriverProfileApproved(user)
  const isApprovedCar = isDriverCarApproved(primaryCar)
  const isOnlineDriver = isDriverOnline(user)
  const driverStatus = getDriverStatus({
    user,
    car: primaryCar,
    activeOrders,
  })
  const driverVisualStatus = !hasCar ?
    'inactive-no-car' :
    (!isApprovedDriver || !isApprovedCar) ?
      'inactive-with-car' :
      isOnlineDriver ? 'active' : 'approved-offline'

  const driverStatusText = !hasCar ?
    `${t('driver_line_no_car')}. ${t('driver_status_need_car')}` :
    !isApprovedDriver ?
      `${t('driver_profile_pending_label')}. ${t('driver_status_hint_profile_check')}` :
      !isApprovedCar ?
        `${t(TRANSLATION.DRIVER_STATUS_INACTIVE_WITH_CAR)}. ${t(TRANSLATION.DRIVER_STATUS_INACTIVE_WITH_CAR_DESCRIPTION)}` :
        driverVisualStatus === 'active' ?
        `${t(TRANSLATION.DRIVER_STATUS_ACTIVE)}. ${t(TRANSLATION.DRIVER_STATUS_ACTIVE_DESCRIPTION)}` :
        `${t('driver_line_offline')}. ${t('driver_status_hint_header_change')}`

  const driverStatusMenuHint = !hasCar ?
    t('driver_status_need_car') :
    (!isApprovedDriver || !isApprovedCar) ?
      t('driver_status_hint_profile_check') :
      t('driver_status_hint_header_change')

  const canChangeAvailability = isDriver &&
    hasCar &&
    isApprovedDriver &&
    isApprovedCar

  const changeDriverAvailability = async(active: boolean) => {
    setStatusMenuOpen(false)

    if (statusChanging || isDriverOnline(user) === active) return

    if (!canChangeAvailability) {
      setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: !hasCar ?
          getApiErrorMessage({ message: 'car not found' }, { context: 'car-profile' }) :
          getApiErrorMessage({ message: 'wrong user check state' }, { context: 'driver-order' }),
      })
      return
    }

    setStatusChanging(true)
    try {
      const response = await API.editUser({ u_active: active as any })
      if (response?.status === 'error' || (response?.code && String(response.code) !== '200')) {
        throw new Error(response?.message || t('driver_status_change_failed'))
      }
      updateUser()
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.includes('user or modified data not found')) return

      setMessageModal({
        isOpen: true,
        status: EStatuses.Fail,
        message: getApiErrorMessage({ message: error?.message || 'driver status change failed' }),
      })
    } finally {
      setStatusChanging(false)
    }
  }

  const languages = SITE_CONSTANTS.LANGUAGES
    .filter(x => x.iso !== (config.SavedConfig !== 'children' ? ' ' : 'ru'))

  const handleLanguageChange = (lang: ILanguage) => {
    setCookie('user_lang', lang.iso)
    setLanguage(lang)
    setLanguagesOpened(false)
  }

  return (
    <header className={cn('header', className)}>
      <div className="burger-wrapper">
        <div className="column">
          {
            detailedOrderID ?
              <img src={images.returnIcon} className="menu-icon" alt={t(TRANSLATION.RETURN)} onClick={onReturn} /> :
              (
                <div className="menu__wrapper">
                  <Burger onClick={toggleMenuOpened} isOpen={menuOpened} />
                  <ul
                    className={cn('menu__list', {
                      'menu__list--active': menuOpened,
                      'menu__list--expanded': languagesOpened,
                    })}
                  >
                    {menuItems.map((item, index) => (
                      <li key={index} className="menu__item">
                        <button
                          onClick={() =>
                            item.href ?
                              navigate(item.href) :
                              item.action?.(index)
                          }
                          className="menu__button"
                        >
                          {item.label}
                        </button>
                        {item.type === 'language' && languagesOpened && (
                          <ul className="menu__languages">
                            {languages.map(item =>
                              <li
                                key={item.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleLanguageChange(item)
                                }}
                                className="menu__language-flag"
                              >
                                {item.logo in FLAGS_IMAGES &&
                                  <img
                                    src={FLAGS_IMAGES[item.logo]}
                                    alt=""
                                    className="menu__language-flag-icon"
                                  />
                                }
                                <span className="menu__language-flag-text">
                                  {item.native}
                                </span>
                              </li>,
                            )}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
          }
        </div>
        {(user?.u_role === EUserRoles.Client) && <button className={'vote-button'}>
          <img height={24} src={images.handUp} alt='' />
        </button>}
      </div>
      <div className='header-logo'><img src={images.logo} alt="" /></div>
      <div className='header-avatar-wrapper'>
        <span className='header-user-name'>{user?.u_city ? `${((window as any).data.cities[user?.u_city][language.iso ?? (window as any).data.langs[(window as any).default_lang].iso])},` : ''}</span>
        <span className='header-user-lng'>{language.iso.toUpperCase()}</span>
        <div
          className={cn('header-avatar-status', { 'header-avatar-status--driver': isDriver })}
        >
          {isDriver ? (
            <>
              <button
                type="button"
                className={`header-driver-status header-driver-status--${driverStatus}`}
                aria-label={driverStatusText}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setStatusMenuOpen(prev => !prev)
                }}
                disabled={statusChanging}
              >
                <DriverStatusAvatar
                  status={driverVisualStatus}
                  src={user?.u_photo}
                  size="header"
                  className="header-driver-status__image"
                  title={driverStatusText}
                />
              </button>

              {statusMenuOpen && (
                <div className="header-driver-status-menu">
                  <button
                    type="button"
                    className={cn('header-driver-status-menu__item', {
                      'header-driver-status-menu__item--active': isApprovedDriver && driverStatus === 'active',
                    })}
                    onClick={() => changeDriverAvailability(true)}
                    disabled={statusChanging || !canChangeAvailability}
                  >
                    {t('driver_line_online')}
                  </button>
                  <button
                    type="button"
                    className={cn('header-driver-status-menu__item', {
                      'header-driver-status-menu__item--active': isApprovedDriver && driverStatus === 'approved-offline',
                    })}
                    onClick={() => changeDriverAvailability(false)}
                    disabled={statusChanging || !canChangeAvailability}
                  >
                    {t('driver_line_offline')}
                  </button>
                  <button
                    type="button"
                    className="header-driver-status-menu__item header-driver-status-menu__item--logout"
                    onClick={() => {
                      setStatusMenuOpen(false)
                      logout()
                    }}
                  >
                    {t(TRANSLATION.LOGOUT)}
                  </button>
                  {!canChangeAvailability && (
                    <span className="header-driver-status-menu__hint">
                      {driverStatusMenuHint}
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              className="avatar"
              onClick={e => setLoginModal(true)}
              style={{
                backgroundSize: avatarSize,
                backgroundImage: `url(${avatar})`,
              }}
            />
          )}
        </div>

      </div>
    </header>
  )
}

export default connector(Header)
