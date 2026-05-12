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

  // Mixed layout per latest customer feedback (Валентин, 8 May 2026):
  //  • Customer-price empty → keep the original layout: estimate fills
  //    the row, customer-price collapses to a small icon-only bubble.
  //  • Customer-price entered → both segments share the row 50/50 so
  //    the user's offer stays visible alongside the estimate.
  // The toggle behaviour ("active" segment grows, inactive collapses)
  // is reproduced via CSS modifier classes — no more `useState` so the
  // layout is derived purely from the entered value.
  const showCustomerPrice = SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE
  const hasCustomerPrice = typeof customerPrice === 'number'

  return (
    <div
      className={cn('price-input', {
        'price-input--single': !showCustomerPrice,
        'price-input--both': showCustomerPrice && hasCustomerPrice,
        'price-input--estimate-focused':
          showCustomerPrice && !hasCustomerPrice,
      }, className)}
    >
      <PriceInputItem
        disabled
        variant="estimate"
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
          variant="customer"
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
  variant?: 'estimate' | 'customer'
}

function PriceInputItem({
  disabled = false,
  variant,
  children,
  ...inputProps
}: React.PropsWithChildren<IItemProps>) {
  return (
    <div
      className={cn('price-input__container', {
        'price-input__container--disabled': disabled,
        'price-input__container--estimate': variant === 'estimate',
        'price-input__container--customer': variant === 'customer',
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