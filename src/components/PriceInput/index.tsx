import React, {
  useMemo, useCallback, useRef, useState,
} from 'react'
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

type TPriceLayout = 'single' | 'icons' | 'draftCustomer' | 'onlyCustomer'

function computeLayout(
  showCustomerPrice: boolean,
  customerPrice: number | null,
  draftOpen: boolean,
): TPriceLayout {
  const c = typeof customerPrice === 'number'
  if (!showCustomerPrice)
    return 'single'
  if (c)
    return 'onlyCustomer'
  if (draftOpen)
    return 'draftCustomer'
  return 'icons'
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

  const showCustomerPrice = SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE
  const [draftCustomerOpen, setDraftCustomerOpen] = useState(false)
  const customerInputRef = useRef<HTMLInputElement>(null)

  const layout = useMemo(
    () => computeLayout(showCustomerPrice, customerPrice, draftCustomerOpen),
    [showCustomerPrice, customerPrice, draftCustomerOpen],
  )

  const focusCustomer = useCallback(() => {
    setDraftCustomerOpen(true)
    requestAnimationFrame(() => customerInputRef.current?.focus())
  }, [])

  const scheduleCollapseDraft = useCallback(() => {
    window.setTimeout(() => {
      if (typeof customerPrice !== 'number')
        setDraftCustomerOpen(false)
    }, 200)
  }, [customerPrice])

  const customerShellActive = layout === 'icons'

  const layoutClass = `price-input--l-${layout}`

  return (
    <div className={cn('price-input', layoutClass, className)}>
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
          containerProps={customerShellActive ? {
            role: 'button',
            tabIndex: 0,
            onClick: e => {
              e.preventDefault()
              focusCustomer()
            },
            onKeyDown: e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                focusCustomer()
              }
            },
          } : undefined}
          inputProps={{
            ref: customerInputRef,
            value: customerPrice ?? '',
            placeholder: t(TRANSLATION.CUSTOMER_PRICE),
            onBlur: scheduleCollapseDraft,
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
  containerProps?: React.HTMLAttributes<HTMLDivElement>
}

function PriceInputItem({
  disabled = false,
  variant,
  containerProps,
  children,
  ...inputProps
}: React.PropsWithChildren<IItemProps>) {
  return (
    <div
      {...containerProps}
      className={cn(
        'price-input__container',
        containerProps?.className,
        {
          'price-input__container--disabled': disabled,
          'price-input__container--estimate': variant === 'estimate',
          'price-input__container--customer': variant === 'customer',
        },
      )}
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
