/**
 * Global axios configuration and a lightweight retry/backoff policy for
 * read requests. Designed for the "weak mobile network" scenario from the
 * project brief: brief drops should not leave the UI stuck or hammer the
 * API immediately.
 *
 * Side-effect-only module: importing it once (early in src/index.tsx)
 * mutates global axios defaults and installs interceptors used by every
 * existing call site (src/API/* still use bare `axios.get/post`).
 */
import axios, { AxiosError, AxiosRequestConfig } from 'axios'

/** Global request timeout for every axios call that does not override it. */
const DEFAULT_TIMEOUT_MS = 25_000

/** Max retry attempts for safe (idempotent) requests. */
const MAX_RETRIES = 2

/** Base delay before the first retry, multiplied for the next attempt. */
const BASE_BACKOFF_MS = 400

/** HTTP statuses we retry on (transient). */
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

interface RetryConfig extends AxiosRequestConfig {
  /** internal counter to avoid retry storms */
  __retryCount?: number
  /** explicit per-call opt-out */
  __noRetry?: boolean
}

const isRetriableMethod = (config: RetryConfig | undefined): boolean => {
  if (!config) return false
  const method = (config.method || 'get').toLowerCase()
  return method === 'get' || method === 'head' || method === 'options'
}

const isRetriableError = (error: AxiosError): boolean => {
  // Network failure or aborted by browser (no `response` field).
  if (!error.response) return true
  return RETRY_STATUSES.has(error.response.status)
}

const computeBackoff = (attempt: number): number => {
  // Exponential backoff with mild jitter to avoid synchronized retry waves.
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt)
  const jitter = Math.floor(Math.random() * 200)
  return base + jitter
}

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms))

axios.defaults.timeout = DEFAULT_TIMEOUT_MS

axios.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined
    if (!config || config.__noRetry) return Promise.reject(error)
    if (!isRetriableMethod(config)) return Promise.reject(error)
    if (!isRetriableError(error)) return Promise.reject(error)

    const attempt = config.__retryCount ?? 0
    if (attempt >= MAX_RETRIES) return Promise.reject(error)

    config.__retryCount = attempt + 1
    await sleep(computeBackoff(attempt))
    return axios.request(config)
  },
)

export {}
