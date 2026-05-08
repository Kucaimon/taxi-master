import React, { useMemo } from 'react'
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
}

function PriceInput({
  from,
  to,
  time,
  carClass,
  customerPrice,
  setCustomerPrice,
  className,
}: IProps) {
  const { value: payment } = useMemo(() => getPayment(
    null,
    [from ?? {}, to ?? {}],
    undefined,
    time === 'now' ? moment() : time,
    carClass,
  ), [from, to, time, carClass])

  // The previous toggle UI hid one of the two values behind a 40px
  // icon-only bubble; once the user typed a customer price and looked
  // at the estimate, their input became invisible and felt lost. Both
  // segments are now rendered side-by-side so both values stay
  // readable at all times. The customer price is still optional —
  // when it's empty the estimate is the only number on screen.
  const showCustomerPrice = SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE

  return (
    <div
      className={cn('price-input', {
        'price-input--single': !showCustomerPrice,
      }, className)}
    >
      <PriceInputItem
        disabled
        inputProps={{
          value: `${
            t(TRANSLATION.COST)
          }: ${
            typeof payment === 'number' ? formatCurrency(payment) : payment
          }`,
        }}
      />
      {showCustomerPrice && (
        <PriceInputItem
          inputProps={{
            value: customerPrice ?? '',
            placeholder: t(TRANSLATION.CUSTOMER_PRICE),
          }}
          onChange={value => {
            setCustomerPrice(value as number | null)
          }}
          inputType={EInputTypes.Number}
        />
      )}
    </div>
  )
}

export default connector(PriceInput)

interface IItemProps extends React.ComponentProps<typeof Input> {
  disabled?: boolean
}

function PriceInputItem({
  disabled = false,
  children,
  ...inputProps
}: React.PropsWithChildren<IItemProps>) {
  return (
    <div
      className={cn('price-input__container', {
        'price-input__container--disabled': disabled,
      })}
    >
      <Input
        fieldWrapperClassName="price-input__segment"
        style={EInputStyles.RedDesign}
        {...inputProps}
        inputProps={{ disabled, ...(inputProps.inputProps ?? {}) }}
      />
      <img src={images.dollarIcon} alt="" className="price-input__icon" />
    </div>
  )
}