import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react'
import _ from 'lodash'

export function useSwipe(
  element: React.RefObject<HTMLElement | null>,
  draggable: React.RefObject<HTMLElement | null> = element,
  minimizedPart?: React.RefObject<HTMLElement | null>,
  noSwipeElements?: React.RefObject<HTMLElement[]>,
  speed = 300,
): {
  isExpanded: boolean,
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>
} {

  const [isExpanded, setIsExpanded] = useState(false)
  const isExpandedRef = useRef(false)
  isExpandedRef.current = isExpanded
  const sheetTouchingRef = useRef(false)

  const syncSheetPhaseClasses = useCallback((
    translate: number,
    min: number,
    max: number,
    touching: boolean,
  ) => {
    const draggableEl = draggable.current
    if (!draggableEl)
      return
    const eps = 4
    const collapsedY = -min
    const expandedY = -max
    const collapsed =
      translate >= collapsedY - eps
    const expanded =
      translate <= expandedY + eps
    const between = !collapsed && !expanded
    draggableEl.classList.toggle(
      'passenger__draggable--sheet-collapsed',
      collapsed,
    )
    draggableEl.classList.toggle(
      'passenger__draggable--sheet-expanded',
      expanded,
    )
    draggableEl.classList.toggle(
      'passenger__draggable--sheet-between',
      between,
    )
    draggableEl.classList.toggle(
      'passenger__draggable--sheet-touching',
      touching,
    )
  }, [draggable])

  const getLiftingHeightBounds = useCallback((): [min: number, max: number] => {
    // `offsetParent` is `null` for `position: fixed` in normal cases.
    // Passenger map fullscreen pins `.passenger__form-container` with
    // `fixed`, which would make the old math bail to `[0, 0]` and
    // freeze the sheet. When that happens, treat `.page-section` as
    // the height box and derive `offsetTop` from bounding rects.
    const el = element.current
    if (!el) return [0, 0]

    const expanded = el.offsetHeight
    const parent = el.offsetParent as HTMLElement | null
    let parentHeight: number
    let relTop: number

    if (parent) {
      parentHeight = parent.offsetHeight
      relTop = el.offsetTop
    } else {
      const layoutRoot = el.closest('.page-section') as HTMLElement | null
      if (!layoutRoot) return [0, 0]
      parentHeight = layoutRoot.offsetHeight
      relTop =
        el.getBoundingClientRect().top
        - layoutRoot.getBoundingClientRect().top
        + layoutRoot.scrollTop
    }

    const visible = parentHeight - relTop

    let minimized = visible
    const minPartEl = minimizedPart?.current
    if (minPartEl) {
      minimized = minPartEl.offsetHeight
      let minimizedParent: HTMLElement | null = minPartEl
      while (minimizedParent && minimizedParent !== el) {
        minimized += minimizedParent.offsetTop
        const next: HTMLElement | null =
          minimizedParent.offsetParent as HTMLElement | null
        if (!next) {
          // Chain can end at `null` before `el` (e.g. `position: fixed` gaps).
          // Falling back to layout rects keeps a real collapsed lift instead of
          // `[0, max]` / duplicate chrome during drag.
          const partRect = minPartEl.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          minimized = partRect.bottom - elRect.top
          break
        }
        minimizedParent = next
      }
    }

    let min = minimized - visible
    const maxLift = expanded - visible
    // Integer layout math can make `minimized` a hair larger than `visible`
    // on real devices; a tiny positive `min` becomes translateY(-min) and
    // lifts the sheet, exposing map tiles in a 1–3px strip at the viewport
    // bottom. Only snap when there is still a meaningful drag range — never
    // zero `min` when that would erase the only collapsed offset.
    if (min > 0 && min <= 3 && maxLift - min >= 16)
      min = 0

    return [min, maxLift]
  }, [element, minimizedPart])

  const transform = useCallback((
    value: number,
    height = getLiftingHeightBounds(),
  ) => {
    if (!element.current || !draggable.current)
      return
    const [min, max] = height
    // Bottom-anchored sheet: never apply positive translateY (that shoves the
    // form below the viewport). When `minimized - visible` is negative —
    // common on mobile when the reserved "peek" is shorter than the slot
    // below the map — the old math produced a positive clamp.
    const translate = Math.min(
      0,
      Math.max(Math.min(value, -min), -max),
    )
    element.current.style.transform = `translateY(${translate}px)`
    syncSheetPhaseClasses(translate, min, max, sheetTouchingRef.current)
    if (translate > -max) {
      draggable.current.style.overflow = 'hidden'
      draggable.current.scrollTop = 0
    } else
      draggable.current.style.overflow = ''
  }, [element, draggable, syncSheetPhaseClasses])

  const update = useCallback(() => {
    sheetTouchingRef.current = false
    transform(isExpandedRef.current ? -Infinity : Infinity)
  }, [transform])

  useLayoutEffect(update, [isExpanded, update])

  useEffect(() => {
    if (!element.current)
      return
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(element.current)
    const section = element.current.closest('.page-section')
    if (section)
      observer.observe(section)
    if (minimizedPart?.current)
      observer.observe(minimizedPart.current)
    return () => {
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [element, minimizedPart, update])

  useEffect(() => {
    if (!element.current || !draggable.current)
      return
    const elementValue = element.current
    const draggableValue = draggable.current

    let
      startY: number,
      startTime: number,
      minHeight: number,
      maxHeight: number,
      currentY = 0,
      deltaY = 0,
      canMove = false

    function start(e: TouchEvent) {
      for (const noSwipeElement of noSwipeElements?.current ?? [])
        if (noSwipeElement.contains(e.target as Node)) {
          canMove = false
          return
        }
      startY = e.touches[0].clientY + draggableValue.scrollTop
      startTime = Date.now()
      ;[minHeight, maxHeight] = getLiftingHeightBounds()
      currentY = isExpandedRef.current ? -maxHeight : -minHeight
      deltaY = 0
      canMove = true
      sheetTouchingRef.current = true
      elementValue.style.transition = 'transform 0.05s linear'
      transform(currentY, [minHeight, maxHeight])
    }

    const move = _.throttle((e: TouchEvent) => {
      if (!canMove) return
      deltaY = e.touches[0].clientY - startY
      transform(currentY + deltaY, [minHeight, maxHeight])
    }, 16)

    function end() {
      if (!canMove) return
      const endTime = Date.now()
      const duration = endTime - startTime
      const center = (maxHeight - minHeight) / 2
      elementValue.style.transition = 'transform 0.3s ease'

      if (
        duration < speed ||
        deltaY > center ||
        deltaY < -center
      ) {
        if (deltaY > 0)
          setIsExpanded(false)
        if (deltaY < 0)
          setIsExpanded(true)
      } else
        transform(currentY)
      sheetTouchingRef.current = false
      canMove = false
    }

    draggableValue.addEventListener('touchstart', start)
    document.addEventListener('touchmove', move)
    document.addEventListener('touchend', end)
    document.addEventListener('touchcancel', end)

    return () => {
      move.cancel()
      draggableValue.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
    }
  }, [
    draggable, element, noSwipeElements, speed,
    getLiftingHeightBounds, transform,
  ])

  return { isExpanded, setIsExpanded }
}