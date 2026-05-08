import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  useSelector as useReduxSelector,
  useDispatch as useReduxDispatch,
} from 'react-redux'
import { useLocation } from 'react-router-dom'
import {
  useWatch,
  DeepPartialSkipArrayKey, Control, FieldValues,
} from 'react-hook-form'
import _ from 'lodash'
import { IRootState, IDispatch } from '../state'
import { getItem, setItem } from './localStorage'

interface IAdditionalDataFlags {
  dirty?: boolean,
  previousValue?: boolean
}
interface IAdditionalData {
  dirty?: boolean,
  previousValue?: any
}
/**
 * Works like useState, but also caches value at localStorage
 * @param key localStorage access key. It should follow the format ${objectKey}.${valueKey} or just ${valueKey}
 * @param defaultValue default value will be used if cached value is not found or some error occured
 * @param allowableValues list of allowable values for cached value.
 * @param additionalData object containing data about additional field data passed to return. Do not change at runtime!
 *  If allowableValues does not includes cached value, defaultValue is used
 */
export const useCachedState = <T>(
  key: string,
  defaultValue?: T,
  allowableValues?: T[],
  additionalData: IAdditionalDataFlags = {},
): [T, React.Dispatch<React.SetStateAction<T>>, IAdditionalData] => {
  const [value, setValue] =
    useState<T>(() => getItem(key, defaultValue, allowableValues))

  let dirty: boolean = false
  let setDirty: React.Dispatch<React.SetStateAction<boolean>>
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (additionalData.dirty) [dirty, setDirty] = useState<boolean>(false)

  let previousValue: T | undefined = undefined
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (additionalData.previousValue || additionalData.dirty) previousValue = usePrevious<T>(value)

  useEffect(() => {
    if (additionalData.dirty && !dirty && previousValue !== undefined && !_.isEqual(value, previousValue)) {
      setDirty(true)
    }
  }, [value])

  return [
    value,
    v => {
      if (typeof v === 'function')
        v = (v as (v: T) => T)(value)
      setValue(v)
      setItem(key, v)
    },
    {
      dirty,
      previousValue,
    },
  ]
}

/** Returns value before update */
export const usePrevious = <T = any>(value: any) => {
  const ref = useRef<T>(undefined)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref.current
}

type WatchValuesType = {[x: string]: any}
/** Works like useWatch, but also do actions on some value change */
export const useWatchWithEffect = <T extends FieldValues = FieldValues>(
  props: {
    defaultValue?: DeepPartialSkipArrayKey<T>;
    control?: Control<T>;
    disabled?: boolean;
    exact?: boolean;
  },
  callback: (values: WatchValuesType, previousValues: WatchValuesType | undefined) => void,
) => {
  const values = useWatch(props)
  const previousValues = usePrevious<WatchValuesType>(values)

  useEffect(() => {
    if (!_.isEqual(values, previousValues)) {
      callback(values, previousValues)
    }
  }, [values])

  return values as T
}

/**
 * Polling hook that:
 *  - skips ticks while the tab is hidden (no work, no network) — addresses
 *    the "battery drain + duplicate requests on backgrounded tabs" issue
 *    flagged in the audit;
 *  - resumes immediately once the tab becomes visible (instead of waiting
 *    out the previous interval);
 *  - keeps the original `setInterval`-style call signature so existing
 *    call sites do not need to change.
 *
 * Pass `pauseWhenHidden: false` to opt out (e.g. local UI countdowns that
 * must keep ticking to stay in sync with `b_start_datetime`).
 */
export const useInterval = (
  callback: Function,
  delay: number,
  immediately?: boolean,
  options: { pauseWhenHidden?: boolean } = {},
) => {
  const { pauseWhenHidden = true } = options
  const savedCallback = useRef<Function>(undefined)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) return

    let id: ReturnType<typeof setInterval> | null = null

    const tick = () => {
      if (pauseWhenHidden &&
        typeof document !== 'undefined' &&
        document.hidden) return
      savedCallback.current && savedCallback.current()
    }

    const start = () => {
      if (id !== null) return
      id = setInterval(tick, delay)
    }

    const stop = () => {
      if (id === null) return
      clearInterval(id)
      id = null
    }

    if (immediately) tick()

    if (pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
      // Don't even start the timer until the tab is visible.
    } else {
      start()
    }

    let onVisibility: (() => void) | null = null
    if (pauseWhenHidden && typeof document !== 'undefined') {
      onVisibility = () => {
        if (document.hidden) {
          stop()
        } else {
          tick()
          start()
        }
      }
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      stop()
      if (onVisibility)
        document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [delay, pauseWhenHidden])
}

export const useQuery = () => {
  return Object.fromEntries(new URLSearchParams(useLocation().search).entries())
}

export const useVisibility = (defaultValue: boolean = false): [boolean, () => void] => {
  const [visible, setVisible] = React.useState(defaultValue)

  const toggleVisibility = () => setVisible(!visible)

  return [visible, toggleVisibility]
}

export const useSimpleSelector = useReduxSelector.withTypes<IRootState>()
export const useDispatch = useReduxDispatch.withTypes<IDispatch>()

export function useSelector<
  TSelector extends(state: IRootState, ...args: any[]) => any
>(
  selector: TSelector,
  ...args: Parameters<TSelector> extends [any, ...infer Rest] ? Rest : never
): ReturnType<TSelector> {
  return useReduxSelector(useCallback(
    (state: IRootState) => selector(state, ...args),
    [selector, ...args],
  ))
}