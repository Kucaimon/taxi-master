import 'core-js/features/object/assign'
import 'core-js/features/object/values'
// Side-effect: install global axios timeout + retry/backoff interceptors.
// Must run before any module imports `axios` and triggers a request.
import './API/http'
import React from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { HelmetProvider } from 'react-helmet-async'
import store from './state'
import App from './App'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment'
import version from './version.json'

import * as serviceWorker from './serviceWorker'

// Sentry is enabled in production only. `release` is tied to the bundle
// version so issues can be matched to a specific deploy; we keep the
// trace sample low because the API does aggressive polling and otherwise
// floods the Sentry quota.
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: 'https://8181d1719b4f41e0b4f6c2c8c449e0f7@o1155911.ingest.sentry.io/6236737',
    release: `${version.name}@${version.version}`,
    environment: 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.captureConsoleIntegration({
        levels: ['error'],
      }),
    ],
    tracesSampleRate: 0.1,
  })
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Provider store={store}>
        <LocalizationProvider dateAdapter={AdapterMoment}>
          <HelmetProvider>
            <Sentry.ErrorBoundary>
              <App/>
            </Sentry.ErrorBoundary>
          </HelmetProvider>
        </LocalizationProvider>
      </Provider>
    </BrowserRouter>
  </React.StrictMode>,
)

// Service worker disabled: it caches API responses and stale builds,
// which causes "infinite spinner" symptoms on Vercel after a redeploy
// or when the upstream API is down. Use unregister() to also evict any
// previously installed SW from users who visited an earlier deploy.
serviceWorker.unregister()
