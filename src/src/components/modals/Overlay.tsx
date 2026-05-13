import cn from 'classnames'
import React from 'react'
import './styles.scss'
import { Helmet } from 'react-helmet-async'
import SITE_CONSTANTS from '../../siteConstants'

interface IProps {
  isOpen: boolean,
  onClick?: () => any,
  children: React.ReactNode
}

const Overlay: React.FC<IProps> = ({ isOpen, onClick, children }) => (
  <div
    className={cn('overlay__wrapper', { 'overlay__wrapper--active': isOpen })}
  >
    <Helmet>
      <style>
        {`
        .modal form fieldset, .login-modal fieldset {
          border: 2px solid ${SITE_CONSTANTS.PALETTE.primary.main};
        }
        .modal form fieldset legend, .login-modal fieldset legend {
          color: ${SITE_CONSTANTS.PALETTE.primary.dark};
        }
        `}
      </style>
    </Helmet>
    <div
      className="overlay"
      onClick={onClick}
    />

    {children}
  </div>
)

export default Overlay