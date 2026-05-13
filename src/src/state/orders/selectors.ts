import { List as ImmutableList, is } from 'immutable'
import { createSelector, weakMapMemoize } from 'reselect'
import { IOrder, ICar } from '../../types/types'
import { estimateOrder } from '../../tools/order'
import {
  IWayGraph,
  calculateDistance, geopositionToPoint,
} from '../../tools/maps'
import { IRootState } from '../'
import { geoposition } from '../geolocation/selectors'
import { userPrimaryCar } from '../cars/selectors'
import { wayGraph } from '../areas/selectors'
import { moduleName } from './constants'

const GEOLOCATION_CHANGE_THRESHOLD_METERS = 100

export const moduleSelector = (state: IRootState) => state[moduleName]

const ordersData = (state: IRootState) => moduleSelector(state).orders
export const orders = createSelector(
  ordersData,
  orders => orders.map(order => order.value ?? order.partial).filter(Boolean),
  { memoizeOptions: {
    resultEqualityCheck: (oldValue, newValue) => newValue.equals(oldValue),
  } },
)
export function order(
  state: IRootState,
  id: IOrder['b_id'],
): IOrder | undefined {
  const orderData = ordersData(state).get(id)
  return orderData?.value ?? orderData?.partial ?? undefined
}

export const orderMutates = (state: IRootState, id: IOrder['b_id']) => {
  const orderData = ordersData(state).get(id)
  return !!(orderData?.mutations || orderData?.stale)
}

const estimatedOrder = createSelector(
  [
    (order) => order,
    (_, geolocation) => geolocation,
    (_, __, car) => car,
    (_, __, ___, graph) => graph,
  ],
  (
    order: IOrder,
    geolocation: [number, number],
    car: ICar,
    graph: IWayGraph,
  ) => ({
    ...order,
    ...estimateOrder(order, car, geolocation, graph),
  }),
  { memoize: weakMapMemoize },
)
const estimatedOrders = (
  orders: ImmutableList<IOrder> | undefined,
  geolocation: [number, number] | undefined,
  car: ICar | null | undefined,
  graph: IWayGraph,
): ImmutableList<IOrder> | null =>
  orders && geolocation && car ?
    orders.map(order => estimatedOrder(order, geolocation, car, graph)) :
    (orders ?? null)
const approximatedCoords = createSelector(
  geoposition,
  geoposition => geoposition && geopositionToPoint(geoposition),
  { memoizeOptions: {
    resultEqualityCheck: (oldValue, newValue) => !!(
      oldValue === newValue || (oldValue && newValue && (
        (oldValue[0] === newValue[0] && oldValue[1] === newValue[1]) ||
        calculateDistance(oldValue, newValue) <
          GEOLOCATION_CHANGE_THRESHOLD_METERS
      ))
    ),
  } },
)

const ordersGroupSelector = (
  idsSelector: (state: IRootState) => ImmutableList<IOrder['b_id']> | null,
) => createSelector(
  [ordersData, idsSelector],
  (orders, ids) => ids?.map(id => orders.get(id)!.partial!).filter(Boolean),
  { memoizeOptions: { resultEqualityCheck: is } },
)

const activeOrdersIds = (state: IRootState) =>
  moduleSelector(state).activeOrders
const pureActiveOrders = ordersGroupSelector(activeOrdersIds)
export const activeOrders = createSelector(
  pureActiveOrders,
  (orders): IOrder[] | null => orders?.toArray() ?? null,
)

const readyOrdersIds = (state: IRootState) =>
  moduleSelector(state).readyOrders
const pureReadyOrders = ordersGroupSelector(readyOrdersIds)
export const readyOrders = createSelector(
  [pureReadyOrders, approximatedCoords, userPrimaryCar, wayGraph],
  (...args): IOrder[] | null => estimatedOrders(...args)?.toArray() ?? null,
)

const historyOrdersIds = (state: IRootState) =>
  moduleSelector(state).historyOrders
const pureHistoryOrders = ordersGroupSelector(historyOrdersIds)
export const historyOrders = createSelector(
  pureHistoryOrders,
  (orders): IOrder[] | null => orders?.toArray() ?? null,
)