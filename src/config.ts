import { getCacheVersion } from './API/cacheVersion'
import store from './state'
import { setConfigError, setConfigLoaded } from './state/config/actionCreators'
import { DEFAULT_CONFIG_NAME } from './constants'

let _configName: string
let _hardTimeoutFired = false

const removePreloader = () => {
  ;(window as any).preloader?.classList.remove('active')
  const el = document.getElementById('preloader')
  if (el) el.classList.remove('active')
}

const HARD_CONFIG_TIMEOUT_MS = 30000

const startHardTimeout = () => {
  setTimeout(() => {
    if (_hardTimeoutFired) return
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
      if (_hardTimeoutFired) return
      store.dispatch(setConfigLoaded())
    }
    script.onerror = () => {
      if (_hardTimeoutFired) return
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
      clearConfigParam = params.get('clearConfig') !== null

    if (clearConfigParam) {
      this.clearConfig()
    } else {
      if (configParam) {
        this.setConfig(configParam)
      }
    }

    if (!!configParam) {
      params.delete('config')
    }
    if (!!clearConfigParam) {
      params.delete('clearConfig')
    }

    if (configParam || clearConfigParam) {
      const _path = window.location.origin + window.location.pathname
      let _newUrl = params.toString() ?
        _path + '?' + params.toString() :
        _path
      window.history.replaceState({}, document.title, _newUrl)
    } else {
      let _savedConfig = this.SavedConfig
      if (!!_savedConfig) {
        this.setConfig(_savedConfig)
      } else {
        this.setDefaultName()
      }
    }
  }

  setConfig(name: string) {
    localStorage.setItem('config', name)
    _configName = name
    applyConfigName(this.API_URL, name)
  }

  clearConfig() {
    localStorage.removeItem('config')
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