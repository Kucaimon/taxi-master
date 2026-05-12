import { shortenAddress } from './../../tools/utils'
import { all, takeEvery, put } from 'redux-saga/effects'
import { ActionTypes } from './constants'
import { EPointType, IAddressPoint } from '../../types/types'
import { TAction } from '../../types'
import { call } from '../../tools/sagaUtils'
import * as API from '../../API'

export const saga = function* () {
  yield all([
    takeEvery(ActionTypes.SET_TAKE_PASSENGER_MODAL_FROM_REQUEST, setPointSaga(EPointType.From)),
    takeEvery(ActionTypes.SET_TAKE_PASSENGER_MODAL_TO_REQUEST, setPointSaga(EPointType.To)),
  ])
}

const setPointSaga = (type: EPointType) => function* (data: TAction) {
  const value: IAddressPoint = { ...data.payload }
  try {
    if (!(value.address || value.shortAddress) && value.latitude && value.longitude) {
      const address = yield* call(
        API.reverseGeocode,
        value.latitude.toString(),
        value.longitude.toString(),
      )
      value.address = address.display_name
      value.shortAddress = shortenAddress(
        address.display_name,
        address.address.city ||
        address.address.country ||
        address.address.village ||
        address.address.town ||
        address.address.state,
      )
    }
  } catch (error) {
    console.error(error)
  }

  yield put({
    type: type === EPointType.From ?
      ActionTypes.SET_TAKE_PASSENGER_MODAL_FROM :
      ActionTypes.SET_TAKE_PASSENGER_MODAL_TO,
    payload: value,
  })
}