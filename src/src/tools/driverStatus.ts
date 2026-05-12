import { EUserCheckStates, EUserRoles, ICar, IOrder, IUser } from '../types/types'

export type TDriverStatus =
  'active' |
  'approved-offline' |
  'inactive-with-car' |
  'inactive-no-car'

const getCarCheckValue = (car?: ICar | null) => (
  (car as any)?.check_state ??
  (car as any)?.c_check_state ??
  (car as any)?.c_check ??
  (car as any)?.check ??
  (car as any)?.state ??
  (car as any)?.status ??
  (car as any)?.details?.check_state ??
  (car as any)?.details?.c_check_state ??
  (car as any)?.details?.status
)

export const isDriverProfileApproved = (user?: IUser | null) =>
  Number(user?.u_check_state) === EUserCheckStates.Active

export const isDriverCarAdded = (car?: ICar | null) => {
  return !!String(car?.registration_plate ?? '').trim()
}

export const isDriverCarApproved = (car?: ICar | null) => {
  if (!isDriverCarAdded(car)) return false

  const value = getCarCheckValue(car)
  if (value === undefined || value === null || value === '') return true

  const numericValue = Number(value)
  if (!Number.isNaN(numericValue)) return numericValue === EUserCheckStates.Active

  const stringValue = String(value).toLowerCase()
  return ['active', 'approved', 'accepted', 'verified', 'success'].includes(stringValue)
}

export const isDriverOnline = (user?: IUser | null) => {
  const value = user?.u_active
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value

  const stringValue = String(value).trim().toLowerCase()
  if (['0', 'false', 'offline', 'inactive', 'no'].includes(stringValue)) return false
  if (['1', 'true', 'online', 'active', 'yes'].includes(stringValue)) return true

  return false
}

export const getDriverStatus = ({
  user,
  car,
}: {
  user?: IUser | null,
  car?: ICar | null,
  activeOrders?: IOrder[] | null,
}): TDriverStatus => {
  if (user?.u_role !== EUserRoles.Driver) return 'inactive-no-car'

  const hasCar = isDriverCarAdded(car)
  if (!hasCar) return 'inactive-no-car'

  const isProfileApproved = isDriverProfileApproved(user)
  const isCarApproved = isDriverCarApproved(car)
  const isOnLine = isDriverOnline(user)

  if (!isProfileApproved || !isCarApproved) return 'inactive-with-car'
  if (isOnLine) return 'active'
  return 'approved-offline'
}
