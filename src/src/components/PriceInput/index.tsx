import React, { useState, useMemo } from 'react'
import cn from 'classnames'
import { connect, ConnectedProps } from 'react-redux'
import moment from 'moment'
import { getPayment, formatCurrency } from '../../tools/utils'
import images from '../../constants/images'
import SITE_CONSTANTS from '../../siteConstants'
import { IRootState } from '../../state'
import {
  clientOrderSelectors,
  clientOrderActionCreators,
} from '../../state/clientOrder'
import { t, TRANSLATION } from '../../localization'
import Input, { EInputTypes, EInputStyles } from '../Input'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  from: clientOrderSelectors.from(state),
  to: clientOrderSelectors.to(state),
  time: clientOrderSelectors.time(state),
  carClass: clientOrderSelectors.carClass(state),
  customerPrice: clientOrderSelectors.customerPrice(state),
})

const mapDispatchToProps = {
  setCustomerPrice: clientOrderActionCreators.setCustomerPrice,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
  forceCustomerPrice?: boolean
  offerMode?: boolean
}

function PriceInput({
  from,
  to,
  time,
  carClass,
  customerPrice,
  setCustomerPrice,
  className,
  forceCustomerPrice = false,
  offerMode = false,
}: IProps) {
  const { value: payment } = useMemo(() => getPayment(
    null,
    [from ?? {}, to ?? {}],
    undefined,
    time === 'now' ? moment() : time,
    carClass,
  ), [from, to, time, carClass])

  const [active, setActive] = useState(offerMode ? 1 : 0)

  return (
    <div className={cn('price-input', className)}>
      {useMemo(() => !offerMode &&
        <PriceInputItem
          disabled
          active={active === 0}
          setActive={() => setActive(0)}
          inputProps={{
            value: `${
              t(TRANSLATION.COST)
            }: ${
              typeof payment === 'number' ? formatCurrency(payment) : payment
            }`,
          }}
        />
      , [active === 0 && payment, offerMode])}
      {useMemo(() => (SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE || forceCustomerPrice || offerMode) &&
        <PriceInputItem
          active={offerMode || active === 1}
          setActive={() => setActive(1)}
          inputProps={{
            value: customerPrice ?? '',
            placeholder: offerMode ? t(TRANSLATION.CLIENT_OFFER_DESIRED_PRICE_LABEL) : t(TRANSLATION.CUSTOMER_PRICE),
          }}
          onChange={value => {
            setCustomerPrice(value as number | null)
          }}
          inputType={EInputTypes.Number}
        />
      , [active === 1 && customerPrice, forceCustomerPrice, offerMode])}
    </div>
  )
}

export default connector(PriceInput)

interface IItemProps extends React.ComponentProps<typeof Input> {
  disabled?: boolean
  active: boolean
  setActive: React.Dispatch<React.SetStateAction<unknown>>
}

function PriceInputItem({
  disabled = false,
  active,
  setActive,
  children,
  ...inputProps
}: React.PropsWithChildren<IItemProps>) {
  return (
    <div
      className={cn('price-input__container', {
        'price-input__container--disabled': disabled,
        'price-input__container--active': active,
      })}
      onClick={setActive}
    >
      <Input
        fieldWrapperClassName={cn('price-input__segment', {
          'price-input__segment--active': active,
        })}
        style={EInputStyles.RedDesign}
        {...inputProps}
        inputProps={{ disabled, ...(inputProps.inputProps ?? {}) }}
      />
      <img src={images.dollarIcon} alt="" className="price-input__icon" />
    </div>
  )
}