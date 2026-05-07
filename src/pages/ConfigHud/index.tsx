import React, { useEffect, useState } from 'react'
import config from '../../config'
import version from '../../version.json'
import './styles.scss'

/**
 * Internal HUD page at `/config` that lets QA / admins inspect and
 * change the active backend config without hand-editing query
 * parameters. The brief asks for "понятная структура, минимум магии":
 * URL-only switching is fine for engineers but invisible for
 * non-technical operators (and impossible to discover from the running
 * app). This page surfaces the same controls in plain UI.
 *
 * The page is intentionally minimal — no Redux, no localization — so it
 * keeps working even when the upstream config failed to load and the
 * rest of the app falls back to the "DB unavailable" screen.
 */
const KNOWN_CONFIGS: { id: string; label: string }[] = [
  { id: 'default', label: 'default (`/c/0`)' },
  { id: 'children', label: 'children (`/c/2`)' },
]

interface RuntimeMeta {
  buildId?: string
  version?: string
  builtAt?: string
}

const readBuildKey = (): string | null => {
  try {
    return localStorage.getItem('__taxi_build_id__')
  } catch {
    return null
  }
}

const ConfigHud: React.FC = () => {
  const [meta, setMeta] = useState<RuntimeMeta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [persist, setPersist] = useState(false)
  const [customConfig, setCustomConfig] = useState('')
  const savedConfig = config.SavedConfig

  useEffect(() => {
    let cancelled = false
    fetch(`/version.json?cb=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json: RuntimeMeta) => {
        if (!cancelled) setMeta(json)
      })
      .catch(err => {
        if (!cancelled) setMetaError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const apply = (name: string) => {
    const url = new URL(window.location.href)
    url.pathname = '/'
    url.searchParams.delete('clearConfig')
    url.searchParams.delete('persistConfig')
    url.searchParams.set('config', name)
    if (persist) url.searchParams.set('persistConfig', '')
    window.location.assign(url.toString())
  }

  const clear = () => {
    const url = new URL(window.location.href)
    url.pathname = '/'
    url.searchParams.delete('config')
    url.searchParams.delete('persistConfig')
    url.searchParams.set('clearConfig', '')
    window.location.assign(url.toString())
  }

  const reloadHard = () => {
    try {
      localStorage.removeItem('__taxi_build_id__')
      sessionStorage.removeItem('__taxi_build_reload_once__')
    } catch {
      // ignored
    }
    window.location.reload()
  }

  return (
    <div className="config-hud">
      <h1>Config &amp; Build HUD</h1>
      <p className="config-hud__hint">
        Internal page. Changes the upstream API config without editing the URL.
      </p>

      <section className="config-hud__section">
        <h2>Build</h2>
        <dl>
          <dt>Bundle version</dt>
          <dd>{`${version.name} @ ${version.version}`}</dd>
          <dt>Bundle built</dt>
          <dd>{new Date(version.buildTimestamp).toLocaleString()}</dd>
          <dt>Runtime buildId (public/version.json)</dt>
          <dd>
            {metaError ?
              <em>error: {metaError}</em> :
              meta ? meta.buildId ?? '—' : 'loading...'}
          </dd>
          <dt>Last applied buildId (localStorage)</dt>
          <dd>{readBuildKey() ?? '—'}</dd>
        </dl>
        <button type="button" onClick={reloadHard} className="config-hud__btn">
          Force reload &amp; reset cache marker
        </button>
      </section>

      <section className="config-hud__section">
        <h2>API config</h2>
        <dl>
          <dt>Active config</dt>
          <dd>{savedConfig || '(default)'}</dd>
          <dt>Server URL</dt>
          <dd>
            <code>{config.SERVER_URL}</code>
          </dd>
        </dl>

        <label className="config-hud__row">
          <input
            type="checkbox"
            checked={persist}
            onChange={e => setPersist(e.target.checked)}
          />
          Persist across reloads (writes <code>localStorage.config</code>).
        </label>

        <div className="config-hud__buttons">
          {KNOWN_CONFIGS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => apply(item.id)}
              className="config-hud__btn"
            >
              Apply <strong>{item.label}</strong>
            </button>
          ))}
          <button
            type="button"
            onClick={clear}
            className="config-hud__btn config-hud__btn--danger"
          >
            Clear saved config
          </button>
        </div>

        <div className="config-hud__row config-hud__row--inline">
          <input
            type="text"
            value={customConfig}
            placeholder="Custom config name"
            onChange={e => setCustomConfig(e.target.value.trim())}
            className="config-hud__input"
          />
          <button
            type="button"
            disabled={!customConfig}
            onClick={() => customConfig && apply(customConfig)}
            className="config-hud__btn"
          >
            Apply custom
          </button>
        </div>
      </section>
    </div>
  )
}

export default ConfigHud
