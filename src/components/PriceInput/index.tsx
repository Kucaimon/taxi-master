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
import { t, tLangVls, TRANSLATION } from '../../localization'
import Input, { EInputTypes, EInputStyles } from '../Input'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  from: clientOrderSelectors.from(state),
  to: clientOrderSelectors.to(state),
  time: clientOrderSelectors.time(state),
  carClass: clientOrderSelectors.carClass(state),
  customerPrice: clientOrderSelectors.customerPrice(state),
  pickupTip: clientOrderSelectors.pickupTip(state),
})

const mapDispatchToProps = {
  setCustomerPrice: clientOrderActionCreators.setCustomerPrice,
  setPickupTip: clientOrderActionCreators.setPickupTip,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
}

type TPriceLayout =
  | 'single'
  | 'icons'
  | 'draftCustomer'
  | 'draftPickup'
  | 'onlyCustomer'
  | 'onlyPickup'
  | 'both'
  | 'oneFilledDraftOther'

function computeLayout(
  showExtras: boolean,
  customerPrice: number | null,
  pickupTip: number | null,
  draftOpen: 'customer' | 'pickup' | null,
): TPriceLayout {
  const c = typeof customerPrice === 'number'
  const p = typeof pickupTip === 'number'
  if (!showExtras)
    return 'single'
  if (c && p)
    return 'both'
  if (
    (c && !p && draftOpen === 'pickup') ||
    (!c && p && draftOpen === 'customer')
  )
    return 'oneFilledDraftOther'
  if (!c && !p && draftOpen === 'customer')
    return 'draftCustomer'
  if (!c && !p && draftOpen === 'pickup')
    return 'draftPickup'
  if (c && !p && draftOpen === null)
    return 'onlyCustomer'
  if (!c && p && draftOpen === null)
    return 'onlyPickup'
  return 'icons'
}

function PriceInput({
  from,
  to,
  time,
  carClass,
  customerPrice,
  pickupTip,
  setCustomerPrice,
  setPickupTip,
  className,
}: IProps) {
  const { value: payment } = useMemo(() => getPayment(
    null,
    [from ?? {}, to ?? {}],
    undefined,
    time === 'now' ? moment() : time,
    carClass,
  ), [from, to, time, carClass])

  const showExtras = SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE
  const [draftOpen, setDraftOpen] = useState<'customer' | 'pickup' | null>(null)
  const customerInputRef = useRef<HTMLInputElement>(null)
  const pickupInputRef = useRef<HTMLInputElement>(null)

  const layout = useMemo(
    () => computeLayout(showExtras, customerPrice, pickupTip, draftOpen),
    [showExtras, customerPrice, pickupTip, draftOpen],
  )

  const focusCustomer = useCallback(() => {
    setDraftOpen('customer')
    requestAnimationFrame(() => customerInputRef.current?.focus())
  }, [])

  const focusPickup = useCallback(() => {
    setDraftOpen('pickup')
    requestAnimationFrame(() => pickupInputRef.current?.focus())
  }, [])

  const scheduleCollapseDraft = useCallback((
    kind: 'customer' | 'pickup',
  ) => {
    window.setTimeout(() => {
      if (kind === 'customer' && typeof customerPrice !== 'number')
        setDraftOpen(d => (d === 'customer' ? null : d))
      if (kind === 'pickup' && typeof pickupTip !== 'number')
        setDraftOpen(d => (d === 'pickup' ? null : d))
    }, 200)
  }, [customerPrice, pickupTip])

  const customerShellActive =
    layout === 'icons' ||
    layout === 'draftPickup' ||
    layout === 'onlyPickup'
  const pickupShellActive =
    layout === 'icons' ||
    layout === 'draftCustomer' ||
    layout === 'onlyCustomer'

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
      {showExtras && (
        <>
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
              onBlur: () => scheduleCollapseDraft('customer'),
            }}
            onChange={value => {
              setCustomerPrice(value as number | null)
            }}
            inputType={EInputTypes.Number}
          />
          <PriceInputItem
            variant="pickup"
            containerProps={pickupShellActive ? {
              role: 'button',
              tabIndex: 0,
              onClick: e => {
                e.preventDefault()
                focusPickup()
              },
              onKeyDown: e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  focusPickup()
                }
              },
            } : undefined}
            inputProps={{
              ref: pickupInputRef,
              value: pickupTip ?? '',
              placeholder: tLangVls(TRANSLATION.PICKUP_TIP),
              onBlur: () => scheduleCollapseDraft('pickup'),
            }}
            onChange={value => {
              setPickupTip(value as number | null)
            }}
            inputType={EInputTypes.Number}
          />
        </>
      )}
    </div>
  )
}

export default connector(PriceInput)

interface IItemProps extends React.ComponentProps<typeof Input> {
  disabled?: boolean
  variant?: 'estimate' | 'customer' | 'pickup'
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
          'price-input__container--pickup': variant === 'pickup',
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
