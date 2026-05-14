import { all, takeEvery, put } from 'redux-saga/effects'
import * as Sentry from '@sentry/react'
import { TAction } from '../../types'
import { EStatuses, EUserRoles, ITokens } from '../../types/types'
import {
  setCookie,
  getCookie,
  deleteCookie,
  OAUTH_RETURN_PATH_COOKIE,
  setShortLivedCookie,
} from '../../utils/cookies'
import { call, putResolve } from '../../tools/sagaUtils'
import {
  clearRedirectTarget,
  clearStoredTokens,
  clearStoredUser,
  getRedirectModule,
  getRedirectPath,
  getStoredTokens,
  isRedirectFresh,
  setRedirectTarget,
  setStoredTokens,
} from '../../utils/storage'
import SITE_CONSTANTS from '../../siteConstants'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
import { ActionTypes as ConfigActionTypes } from '../config/constants'
import { clearOrders } from '../orders/actionCreators'
import { createUserCar } from '../cars/actionCreators'
import {
  setLoginModal, setMessageModal, setRefCodeModal,
} from '../modals/actionCreators'
import { uploadRegisterFiles, uploadFiles } from './helpers'
import { ActionTypes } from './constants'
import { setUser } from './actionCreators'
import { ActionTypes as ClientOrderActionTypes } from '../clientOrder/constants'

export const saga = function* () {
  yield all([
    takeEvery(ActionTypes.LOGIN_REQUEST, loginSaga),
    takeEvery(ActionTypes.GOOGLE_LOGIN_REQUEST, googleLoginSaga),
    takeEvery(ActionTypes.REGISTER_REQUEST, registerSaga),
    takeEvery(ActionTypes.LOGOUT_REQUEST, logoutSaga),
    takeEvery(ActionTypes.REMIND_PASSWORD_REQUEST, remindPasswordSaga),
    takeEvery(ActionTypes.INIT_USER, initUserSaga),
    takeEvery(ActionTypes.WHATSAPP_SIGNUP_REQUEST, whatsappSignUpSaga),
    call(handleRedirectSaga),
  ])
}

function* loginSaga(data: TAction) {
  yield put({ type: ActionTypes.LOGIN_START })
  try {
    const result = yield* call(API.login, data.payload)
    if (!result) throw new Error('wrong login response')

    if(result.data === 'wrong login') {
      yield put({ type: ActionTypes.LOGIN_FAIL, payload: result.data })
      throw new Error('wrong login')
    }
    if(result.data === 'wrong password') {
      yield put({ type: ActionTypes.LOGIN_FAIL, payload: result.data })
      throw new Error('wrong password')
    }

    if(result.data !== null && result.data === 'wrong phone') {
      yield put({ type: ActionTypes.WHATSAPP_SIGNUP_START, payload: data.payload.login })
      yield put(setLoginModal(false))
      yield put(setRefCodeModal({ isOpen: true }))
      return
    }

    if(result.data !== null && result.data === 'code sent') {
      yield put({ type: ActionTypes.LOGIN_WHATSAPP })
      return
    }

    if (result.user === null) throw new Error('wrong login response')

    setStoredTokens(result.tokens)


    if(result.user.u_role === EUserRoles.Client || result.user.u_role === EUserRoles.Agent) {
      data.payload.navigate('/passenger-order')
    } else if(result.user.u_role === EUserRoles.Driver) {
      data.payload.navigate('/driver-order')
    }

    yield put({
      type: ActionTypes.LOGIN_SUCCESS,
      payload: result,
    })
    yield put(setLoginModal(false))
  } catch (error: any) {
    console.error('catch', error)
    yield put({
      type: ActionTypes.LOGIN_FAIL,
      payload: error.message,
    })
  }
}

function* googleLoginSaga(data: TAction) {
  yield put({ type: ActionTypes.GOOGLE_LOGIN_START })
  try {

    const result = yield* call(API.googleLogin, data.payload)

    if (!result) throw new Error('Wrong login response')
    setStoredTokens(result.tokens)

    yield put({
      type: ActionTypes.GOOGLE_LOGIN_SUCCESS,
      payload: result,
    })
    yield put(setLoginModal(false))
    yield put(setRefCodeModal({ isOpen: false }))

    const redirectModule = getRedirectModule()
    let redirectPath = getRedirectPath()
    const cookiePath = getCookie(OAUTH_RETURN_PATH_COOKIE)
    if (!redirectPath && cookiePath) {
      try {
        redirectPath = decodeURIComponent(cookiePath)
      } catch {
        redirectPath = cookiePath
      }
    }
    clearRedirectTarget()
    deleteCookie(OAUTH_RETURN_PATH_COOKIE)

    if (redirectPath) {
      window.location.replace(redirectPath)
      return
    }
    if (redirectModule === 'passenger') {
      window.location.replace('/passenger-order')
      return
    }
    if (redirectModule === 'driver') {
      window.location.replace('/driver-order')
      return
    }

    // Default to passenger when OAuth did not provide explicit module state.
    window.location.replace('/passenger-order')
  } catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GOOGLE_LOGIN_FAIL })
  }
}

function* registerSaga(data: TAction) {
  yield put({ type: ActionTypes.REGISTER_START })
  try {
    const { uploads, u_details, u_car, ...payload } = data.payload

    const response: any = yield* call(API.register, { ...payload, st: 1 })
    if (response.error) {
      yield put({ type: ActionTypes.REGISTER_FAIL, payload: response.error })
      throw new Error(response.error)
    }

    const tokens = {
      token: response.token,
      u_hash: response.u_hash,
    }
    setStoredTokens(tokens)

    if (data.payload?.u_role === 2) {
      if (uploads) {
        yield* call(uploadRegisterFiles, { filesToUpload: uploads, response, u_details })
      } else {
        const { passport_photo, driver_license_photo, license_photo, ...details } = u_details
        const files = { passport_photo, driver_license_photo, license_photo }
        const t = { ...tokens, u_id: response.u_id }
        yield* call(uploadFiles, { files, u_details: details, tokens: t })
      }
    }
    yield put({ type: ActionTypes.REGISTER_SUCCESS, payload: response })
    yield* call(initUserSaga)
    yield put(setLoginModal(false))

    const carResponse = u_car && payload.u_role === EUserRoles.Driver ?
      (yield* putResolve(createUserCar({
        ...u_car,
        country: SITE_CONSTANTS.CITIES[payload.u_city ?? u_details.city]
          ?.country,
      }))) :
      null

    const isCarError = carResponse?.status === 'error'
    const messageStatus = isCarError ? EStatuses.Warning : EStatuses.Success
    const messageText = isCarError ? TRANSLATION.REGISTER_CAR_FAIL : TRANSLATION.SUCCESS_REGISTER_MESSAGE
    yield put(setMessageModal({
      isOpen: true,
      status: messageStatus,
      message: t(messageText),
    }))
  } catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.REGISTER_FAIL, payload: error })
  }
}

function* logoutSaga() {
  yield put({ type: ActionTypes.LOGOUT_START })
  try {
    clearStoredUser()
    clearStoredTokens()
    yield put(clearOrders())
    yield put({ type: ClientOrderActionTypes.RESET })

    yield* call(API.logout)
    yield put({ type: ActionTypes.LOGOUT_SUCCESS })
    try {
      Sentry.setUser(null)
    } catch {
      // Sentry may not be initialised in dev; ignore.
    }
  } catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.LOGOUT_FAIL })
  }
}

function* remindPasswordSaga(data: TAction) {
  yield put({ type: ActionTypes.REMIND_PASSWORD_START })
  try {
    yield* call(API.remindPassword, data.payload)
    yield put({ type: ActionTypes.REMIND_PASSWORD_SUCCESS })
  } catch (error) {
    yield put({ type: ActionTypes.REMIND_PASSWORD_FAIL })
  }
}

function* initUserSaga() {
  try {
    const stored = getStoredTokens()
    const tokens: ITokens = (stored ?? {}) as ITokens
    if (!tokens.token || !tokens.u_hash) {
      // Проверяем язык в куках
      const savedLang = getCookie('user_lang')
      if (savedLang) {
        const language = SITE_CONSTANTS.LANGUAGES.find(i => i.iso === savedLang)
        if (language) {
          yield put({
            type: ConfigActionTypes.SET_LANGUAGE,
            payload: language,
          })
        }
      }
      return
    }
    yield put({ type: ActionTypes.SET_TOKENS, payload: tokens })

    const user = yield* call(API.getAuthorizedUser)
    if (!user) {
      clearStoredTokens()
      return
    }

    // Устанавливаем язык из пользователя или из куки
    if (user?.u_lang) {
      const language = SITE_CONSTANTS.LANGUAGES.find(i => {
        return i.id.toString() === user.u_lang?.toString()
      })
      if (language) {
        setCookie('user_lang', language.iso)
        yield put({
          type: ConfigActionTypes.SET_LANGUAGE,
          payload: language,
        })
      }
    } else {
      const savedLang = getCookie('user_lang')
      if (savedLang) {
        const language = SITE_CONSTANTS.LANGUAGES.find(i => i.iso === savedLang)
        if (language) {
          yield put({
            type: ConfigActionTypes.SET_LANGUAGE,
            payload: language,
          })
        }
      }
    }
    yield put(setUser(user))
    try {
      // Sentry context: id + role only (no PII like phone/email).
      Sentry.setUser({
        id: user.u_id ? String(user.u_id) : undefined,
        username: user.u_role !== undefined ? `role-${user.u_role}` : undefined,
      })
    } catch {
      // Sentry may not be initialised in dev; ignore.
    }

    // Safety-net for OAuth callbacks: if backend redirects user to a wrong
    // module path, enforce the module that was requested before OAuth.
    let redirectPath = getRedirectPath()
    const cookiePath = getCookie(OAUTH_RETURN_PATH_COOKIE)
    if (!redirectPath && cookiePath) {
      try {
        redirectPath = decodeURIComponent(cookiePath)
      } catch {
        redirectPath = cookiePath
      }
    }
    if (redirectPath) {
      clearRedirectTarget()
      deleteCookie(OAUTH_RETURN_PATH_COOKIE)
      if (window.location.pathname !== redirectPath) {
        window.location.replace(redirectPath)
        return
      }
    }
  } catch (error) {
    console.error('Error in initUserSaga:', error)
    clearStoredTokens()
  }
}

function* whatsappSignUpSaga(data: TAction) {
  try {
    const result = yield* call(API.whatsappSignUp, data.payload)
    if (!result) throw new Error('Wrong whatsappSignUp response')

    yield put(setRefCodeModal({ isOpen: false }))
    yield put({ type: ActionTypes.WHATSAPP_SIGNUP_SUCCESS, payload: result })
    yield* call(loginSaga, {
      type: ActionTypes.LOGIN_REQUEST,
      payload: {
        login: data.payload.login,
        type: data.payload.type,
        navigate: data.payload.navigate,
      },
    })

  } catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.WHATSAPP_SIGNUP_FAIL })
  }
}

function* handleRedirectSaga() {
  const params = new URLSearchParams(window.location.search)
  const authHash = params.get('auth_hash')
  const state = params.get('state')

  // Client reported (May 7): incognito → passenger, normal browser →
  // driver. Difference is that the backend, in normal mode, recognises
  // the email as an existing Driver account via cookies and echoes
  // `state=driver` back regardless of what the SPA originally sent.
  //
  // The SPA already stored the *intended* module before the OAuth
  // redirect (`Login.tsx → setRedirectTarget`). Treat that as the
  // ground truth when it is fresh — only fall back to the callback's
  // `state` when there is no recent click on file (deep-link entry,
  // stale tab, etc.). This is a frontend-only fix per the client's
  // and backend dev's preference.
  const hasFreshIntent = isRedirectFresh()
  if (!authHash && !hasFreshIntent) {
    // Defensive cleanup at app boot: there is no OAuth in flight and
    // no fresh click, so any leftover redirect target is stale and
    // must not influence the next session's routing.
    clearRedirectTarget()
    deleteCookie(OAUTH_RETURN_PATH_COOKIE)
  }
  if (
    !hasFreshIntent &&
    (state === 'passenger' || state === 'driver')
  ) {
    const path = state === 'driver' ? '/driver-order' : '/passenger-order'
    setRedirectTarget(state, path)
    deleteCookie(OAUTH_RETURN_PATH_COOKIE)
    setShortLivedCookie(OAUTH_RETURN_PATH_COOKIE, path, 600)
  }
  if (authHash)
    yield put({
      type: ActionTypes.GOOGLE_LOGIN_REQUEST,
      payload: {
        data: null,
        auth_hash: decodeURIComponent(authHash),
      },
    })
}