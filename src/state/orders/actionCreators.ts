import { ParametersExceptFirst, TAction } from '../../types'
import { IOrder } from '../../types/types'
import { IResponse } from '../../types/api'
import { candidateMode }  from '../../tools/order'
import * as API from '../../API'
import { IRootState, IDispatch } from '..'
import { watch as watchGeolocation } from '../geolocation/actionCreators'
import { ActionTypes } from './constants'
import { order as orderSelector } from './selectors'

const READY_ORDERS_GEOLOCATION_INTERVAL = 1000 * 60 * 60

export const watchActiveOrders = () => (dispatch: IDispatch) => {
  dispatch({ type: ActionTypes.WATCH_ACTIVE_ORDERS })
  return () => {
    dispatch({ type: ActionTypes.UNWATCH_ACTIVE_ORDERS })
  }
}
export const watchReadyOrders = () => (dispatch: IDispatch) => {
  const unwatch = dispatch(watchGeolocation({
    interval: READY_ORDERS_GEOLOCATION_INTERVAL,
  }))
  dispatch({ type: ActionTypes.WATCH_READY_ORDERS })
  return () => {
    dispatch({ type: ActionTypes.UNWATCH_READY_ORDERS })
    unwatch()
  }
}
export const watchHistoryOrders = () => (dispatch: IDispatch) => {
  dispatch({ type: ActionTypes.WATCH_HISTORY_ORDERS })
  return () => {
    dispatch({ type: ActionTypes.UNWATCH_HISTORY_ORDERS })
  }
}

export const watchOrder = (
  payload: IOrder['b_id'],
) => (dispatch: IDispatch) => {
  dispatch({ type: ActionTypes.WATCH_ORDER, payload })
  return () => {
    dispatch({ type: ActionTypes.UNWATCH_ORDER, payload })
  }
}

export const clearOrders = (): TAction => ({ type: ActionTypes.CLEAR })

/**
 * Manual refresh triggers used by error banners ("couldn't load, retry").
 * They reuse the same REQUEST actions the saga dispatches in its polling
 * loop, so a successful retry naturally clears the list-level error
 * marker via the SUCCESS reducer branch.
 */
export const refetchActiveOrders = (): TAction =>
  ({ type: ActionTypes.GET_ACTIVE_ORDERS_REQUEST })
export const refetchReadyOrders = (): TAction =>
  ({ type: ActionTypes.GET_READY_ORDERS_REQUEST })
export const refetchHistoryOrders = (): TAction =>
  ({ type: ActionTypes.GET_HISTORY_ORDERS_REQUEST })

export const create = (
  ...params: Parameters<typeof API.postDrive>
) => async(dispatch: IDispatch) => {
  const record = await API.postDrive(...params)
  dispatch({ type: ActionTypes.CREATE_SUCCESS, payload: record.b_id })
  return record
}
export const cancel = (
  id: IOrder['b_id'],
  ...params: ParametersExceptFirst<typeof API.cancelDrive>
) => APIMutationThunk(() => API.cancelDrive(id, ...params), id)

export const raisePickupTip = (
  id: IOrder['b_id'],
  pickup_tip: number,
) => async(dispatch: IDispatch) => {
  dispatch({ type: ActionTypes.MUTATION_START, payload: id })
  try {
    await API.raiseBookingPickupTip(id, pickup_tip)
    dispatch({ type: ActionTypes.UPDATE_SUCCESS, payload: id })
  } catch (error) {
    dispatch({ type: ActionTypes.MUTATION_FAIL, payload: id })
    throw error
  }
}

export const take = (
  id: IOrder['b_id'],
  options: Parameters<typeof API.takeOrder>[1],
) => (
  dispatch: IDispatch,
  getState: () => IRootState,
) => mutationThunk(() => API.takeOrder(
  id,
  options,
  candidateMode(orderSelector(getState(), id) ?? undefined),
), id)(dispatch)
export const setState = (
  id: IOrder['b_id'],
  ...params: ParametersExceptFirst<typeof API.setOrderState>
) => APIMutationThunk(() => API.setOrderState(id, ...params), id)

function mutationThunk<TReturn>(
  mutation: () => Promise<TReturn>,
  id: IOrder['b_id'],
  isFail: (value: TReturn) => boolean = () => false,
) {
  return async(dispatch: IDispatch): Promise<TReturn> => {
    dispatch({ type: ActionTypes.MUTATION_START, payload: id })
    try {
      const result = await mutation()
      dispatch({
        type: isFail(result) ?
          ActionTypes.MUTATION_FAIL :
          ActionTypes.UPDATE_SUCCESS,
        payload: id,
      })
      return result
    } catch (error) {
      dispatch({ type: ActionTypes.MUTATION_FAIL, payload: id })
      throw error
    }
  }
}
const APIMutationThunk = <TReturn extends IResponse<string, unknown>>(
  mutation: () => Promise<TReturn>,
  id: IOrder['b_id'],
) => mutationThunk(mutation, id, value => value.code !== '200')