import React, { useCallback, useEffect, useState } from 'react'
import { useMap } from 'react-leaflet'
import * as storage from '../../tools/localStorage'
import { logGeolocationError } from '../../tools/geoLog'

/**
 * Shared fullscreen + "my location" controls used by every page that
 * shows a Leaflet map (passenger order, driver order map, future
 * dispatcher screens). Lives in `components/Map/` rather than being
 * inlined in `Map/index.tsx` so the driver and passenger flows render
 * the *same* widget in the *same* corner with the *same* styling —
 * "интерфейс должен быть единым на всех страницах".
 *
 * Renders the buttons as plain absolutely-positioned DOM elements
 * inside the surrounding `<MapContainer>`. Leaflet's plugin Fullscreen
 * control is intentionally NOT used, because the plugin produces a
 * differently-styled square in `.leaflet-control-zoom` font that does
 * not match the rest of the design.
 */

const CACHED_POSITION_KEY = 'map.lastKnownPosition'
const CACHED_POSITION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface ICachedPosition {
  latitude: number
  longitude: number
  ts: number
}

const writeCachedPosition = (latitude: number, longitude: number) => {
  storage.setItem<ICachedPosition>(CACHED_POSITION_KEY, {
    latitude,
    longitude,
    ts: Date.now(),
  })
}

interface IProps {
  /**
   * Initial coordinates to keep highlighted. The passenger map already
   * tracks its own `userCoordinates` state; passing them in lets the
   * "my location" button feel instant (it flies to the cached fix
   * before high-accuracy geolocation resolves). When omitted, the
   * button simply requests the position on click.
   */
  initialCoordinates?: { latitude: number; longitude: number } | null
  /**
   * Optional callback fired with the freshest coordinates whenever the
   * user taps "my location" and the OS returns a fix. Useful for
   * consumer pages that paint their own marker (passenger has a
   * CircleMarker at the same lat/lng).
   */
  onLocate?: (coords: {
    latitude: number
    longitude: number
    accuracy: number
  }) => void
}

export default function MapCustomControls({
  initialCoordinates = null,
  onLocate,
}: IProps) {
  const map = useMap()

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => {
      // Track *any* fullscreen ancestor that contains the map. Native
      // Fullscreen API may be on `.page-section`, not the map itself.
      const fsEl = document.fullscreenElement as Element | null
      const mapEl = map.getContainer()
      const inNative = !!(fsEl && fsEl.contains(mapEl))
      setIsFullscreen(inNative || isPseudoFullscreen)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [map, isPseudoFullscreen])

  useEffect(() => {
    const host = map.getContainer()
    host.classList.toggle('map-container--pseudo-fullscreen', isPseudoFullscreen)
    // `map-fullscreen-active` is applied ONLY for the pseudo path. Native
    // fullscreen renders just the `.page-section` subtree, so the global
    // `.layout__header` is already hidden by the browser — applying the
    // body class on top of it caused a second layout shift on the way
    // INTO native fullscreen on iOS Safari (client report, May 14: "при
    // переходе в полноэкранный режим экран прыгает"). One path per
    // device = one animated layout transformation.
    document.body.classList.toggle('map-fullscreen-active', isPseudoFullscreen)
    return () => {
      host.classList.remove('map-container--pseudo-fullscreen')
      document.body.classList.remove('map-fullscreen-active')
    }
  }, [map, isPseudoFullscreen])

  // Defer `map.invalidateSize()` until after the CSS transition (220ms)
  // settles. Calling it synchronously with the state change made Leaflet
  // re-snap tile positions mid-animation, which was the loudest source
  // of the "jump" effect when entering or leaving fullscreen.
  useEffect(() => {
    if (!map) return
    const handle = window.setTimeout(() => map.invalidateSize(), 250)
    return () => window.clearTimeout(handle)
  }, [map, isFullscreen])

  const toggleFullscreen = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      // Prefer the surrounding `<section.page-section>` over the bare
      // map container — native fullscreen renders only the requested
      // element, and on iOS Safari fullscreening the map alone hides
      // the rest of the page chrome (active orders, bottom sheet).
      // The section contains both, so going fullscreen on it keeps
      // everything visible while the browser still removes its URL
      // bar and OS chrome.
      const mapEl = map.getContainer()
      const target =
        (mapEl.closest('.page-section') as HTMLElement | null) ?? mapEl
      const element = target as any
      const doc = document as any

      if (isPseudoFullscreen) {
        setIsPseudoFullscreen(false)
        setIsFullscreen(false)
        return
      }

      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen()
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen()
        return
      }

      const fellBackToPseudo = () => {
        if (
          !document.fullscreenElement ||
          !(document.fullscreenElement as Element).contains(mapEl)
        ) {
          setIsPseudoFullscreen(true)
          setIsFullscreen(true)
        }
      }

      try {
        if (element.requestFullscreen) {
          await element.requestFullscreen()
          setTimeout(fellBackToPseudo, 150)
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen()
          setTimeout(fellBackToPseudo, 150)
        } else {
          setIsPseudoFullscreen(true)
          setIsFullscreen(true)
        }
      } catch (error) {
        setIsPseudoFullscreen(true)
        setIsFullscreen(true)
      }
    },
    [map, isPseudoFullscreen],
  )

  const handleMyLocation = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      // Snapshot whatever fix we already have so the camera moves
      // immediately and the user gets feedback even if the
      // high-accuracy request takes a few seconds.
      if (initialCoordinates?.latitude && initialCoordinates?.longitude) {
        map.flyTo(
          [initialCoordinates.latitude, initialCoordinates.longitude],
          Math.max(map.getZoom(), 16),
        )
      }

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (coords.accuracy && coords.accuracy < 1000)
            writeCachedPosition(coords.latitude, coords.longitude)
          map.flyTo(
            [coords.latitude, coords.longitude],
            Math.max(map.getZoom(), 16),
          )
          onLocate?.({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          })
        },
        (err) => logGeolocationError(err, 'map:myLocation'),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      )
    },
    [map, initialCoordinates, onLocate],
  )

  return (
    <div className="map-container__custom-controls">
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? '⤢' : '⛶'}
      </button>
      <button
        type="button"
        aria-label="Show my location"
        onClick={handleMyLocation}
      >
        ◎
      </button>
    </div>
  )
}
