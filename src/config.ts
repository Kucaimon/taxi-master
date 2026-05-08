import { getCacheVersion } from './API/cacheVersion'
import store from './state'
import { setConfigError, setConfigLoaded } from './state/config/actionCreators'
import { DEFAULT_CONFIG_NAME } from './constants'

let _configName: string
let _hardTimeoutFired = false
let _configLoaded = false

const removePreloader = () => {
  ;(window as any).preloader?.classList.remove('active')
  const el = document.getElementById('preloader')
  if (el) el.classList.remove('active')
}

const HARD_CONFIG_TIMEOUT_MS = 30000

const startHardTimeout = () => {
  setTimeout(() => {
    if (_hardTimeoutFired || _configLoaded) return
    _hardTimeoutFired = true
    console.warn(
      `[config] Upstream config did not load in ${HARD_CONFIG_TIMEOUT_MS}ms, ` +
        `falling back to defaults so the UI is not stuck on the spinner.`,
    )
    store.dispatch(setConfigError())
    removePreloader()
  }, HARD_CONFIG_TIMEOUT_MS)
}

const applyConfigName = (url: string, name?: string) => {
  startHardTimeout()

  const script = document.createElement('script'),
    _name = name ? `data_${name}.js` : 'data.js'

  const loadScript = (ver: string | number | undefined) => {
    script.src = `https://ibronevik.ru/taxi/cache/${_name}${
      ver !== undefined ? `?ver=${ver}` : ''
    }`
    script.async = true
    script.onload = () => {
      if (_configLoaded) return
      _configLoaded = true
      store.dispatch(setConfigLoaded())
    }
    script.onerror = () => {
      if (_configLoaded || _hardTimeoutFired) return
      _hardTimeoutFired = true
      store.dispatch(setConfigError())
      removePreloader()
    }

    document.body.appendChild(script)
  }

  getCacheVersion(url)
    .then(ver => loadScript(ver))
    .catch(() => loadScript(undefined))
}

class Config {
  constructor() {
    let params = new URLSearchParams(window.location.search),
      configParam = params.get('config'),
      clearConfigParam = params.get('clearConfig') !== null,
      // Opt-in flag to also persist the chosen config across reloads.
      // Without this flag the chosen config applies only to the current
      // page load, which avoids the surprising "config sticks even though
      // I opened the bare URL" behaviour.
      persistConfigParam = params.get('persistConfig') !== null

    if (clearConfigParam) {
      this.clearConfig()
    } else if (configParam) {
      this.setConfig(configParam, { persist: persistConfigParam })
    }

    if (configParam) params.delete('config')
    if (clearConfigParam) params.delete('clearConfig')
    if (persistConfigParam) params.delete('persistConfig')

    if (configParam || clearConfigParam || persistConfigParam) {
      const _path = window.location.origin + window.location.pathname
      let _newUrl = params.toString() ?
        _path + '?' + params.toString() :
        _path
      window.history.replaceState({}, document.title, _newUrl)
    }

    if (!configParam && !clearConfigParam) {
      // One-time legacy cleanup: previous behaviour silently persisted
      // ?config=... in localStorage and re-applied it on every bare-URL
      // visit. Clients reported this is surprising. Drop the stored
      // value unless persistence was explicitly opted in this session,
      // and also drop the cached order draft because it is tied to the
      // previous config's market (currency / city / language) and shows
      // up as a frankenstein state if it survives.
      const _savedConfig = this.SavedConfig
      if (_savedConfig) {
        localStorage.removeItem('config')
        Config.dropOrderDraft()
      }
      this.setDefaultName()
    }
  }

  /**
   * Removes per-session order-draft keys that mirror config-specific
   * data. Kept on the class because both the legacy-cleanup path above
   * and `clearConfig()` need it.
   */
  static dropOrderDraft() {
    const keys = [
      'state.clientOrder.from',
      'state.clientOrder.to',
      'state.clientOrder.comments',
      'state.clientOrder.time',
      'state.clientOrder.phone',
      'state.clientOrder.customerPrice',
      'state.clientOrder.carClass',
      'state.clientOrder.seats',
      'state.clientOrder.locationClass',
    ]
    try {
      for (const key of keys) localStorage.removeItem(key)
    } catch {
      // private mode / quota — best effort
    }
  }

  setConfig(name: string, options: { persist?: boolean } = {}) {
    if (options.persist) {
      localStorage.setItem('config', name)
    }
    _configName = name
    applyConfigName(this.API_URL, name)
  }

  clearConfig() {
    localStorage.removeItem('config')
    Config.dropOrderDraft()
    _configName = ''
    applyConfigName(this.API_URL)
  }

  setDefaultName() {
    applyConfigName(this.API_URL)
  }

  get API_URL() {
    return `${this.SERVER_URL}/api/v1`
  }

  get SERVER_URL() {
    return `https://ibronevik.ru/taxi/c/${_configName || DEFAULT_CONFIG_NAME}`
  }

  get SavedConfig() {
    return localStorage.getItem('config')
  }
}

const config = new Config()

export default config