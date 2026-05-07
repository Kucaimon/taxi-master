import React, { useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import cn from 'classnames'
import moment from 'moment'
import { EBookingDriverState, EUserRoles, ILanguage } from '../../types/types'
import config from '../../config'
import images from '../../constants/images'
import SITE_CONSTANTS from '../../siteConstants'
import { useInterval } from '../../tools/hooks'
import { setCookie } from '../../utils/cookies'
import { IRootState } from '../../state'
import { configSelectors, configActionCreators } from '../../state/config'
import { modalsActionCreators } from '../../state/modals'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import { userSelectors } from '../../state/user'
import { t, TRANSLATION } from '../../localization'
import { Burger } from '../Burger/Burger'
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
})

const mapDispatchToProps = {
  setLanguage: configActionCreators.setLanguage,
  setLoginModal: modalsActionCreators.setLoginModal,
  setProfileModal: modalsActionCreators.setProfileModal,
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
  setLanguage,
  setLoginModal,
  setProfileModal,
  className,
}: IProps) {
  const [languagesOpened, setLanguagesOpened] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [menuOpened, setMenuOpened] = useState(false)
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

  const languages = SITE_CONSTANTS.LANGUAGES
    .filter(x => x.iso !== (config.SavedConfig !== 'children' ? ' ' : 'ru'))

  const cityLabel = user?.u_city ?
    ((window as any).data?.cities?.[user.u_city]?.[
      language.iso ?? (window as any).data?.langs?.[(window as any).default_lang]?.iso
    ] ?? '') :
    ''

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
        <span className='header-user-name'>{cityLabel ? `${cityLabel},` : ''}</span>
        <span className='header-user-lng'>{language.iso.toUpperCase()}</span>
        <div
          className="avatar"
          onClick={e => setLoginModal(true)}
          style={{
            backgroundSize: avatarSize,
            backgroundImage: `url(${avatar})`,
          }}
        />

      </div>
    </header>
  )
}

export default connector(Header)