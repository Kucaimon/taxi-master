import React, { useState, useEffect, useCallback } from 'react'
import cn from 'classnames'
import L from 'leaflet'
import {
  MapContainer, TileLayer,
  Marker, CircleMarker, Circle, Popup, Tooltip, Polyline,
  useMap,
} from 'react-leaflet'
import { connect, ConnectedProps } from 'react-redux'
import { IAddressPoint, IRouteInfo, IStaticMarker } from '../../types/types'
import { getAttribution, getTileServerUrl } from '../../tools/utils'
import { formatAddress } from '../../tools/format'
import { useInterval } from '../../tools/hooks'
import SITE_CONSTANTS from '../../siteConstants'
import images from '../../constants/images'
import { t, TRANSLATION } from '../../localization'
import * as API from '../../API'
import { IRootState } from '../../state'
import { modalsSelectors } from '../../state/modals'
import { EMapModalTypes } from '../../state/modals/constants'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import { orderSelectors } from '../../state/order'
import * as storage from '../../tools/localStorage'
import { logGeolocationError } from '../../tools/geoLog'
import './styles.scss'

const defaultZoom = 15

// Persisted "last known position" so the map opens centered on the user's
// real area instead of the country-level default while geolocation is
// still resolving. Anything older than a week is considered stale and is
// ignored — by then the user could realistically be anywhere.
const CACHED_POSITION_KEY = 'map.lastKnownPosition'
const CACHED_POSITION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface ICachedPosition {
  latitude: number
  longitude: number
  ts: number
}

function readCachedPosition(): [number, number] | null {
  const cached = storage.getItem<ICachedPosition | null>(CACHED_POSITION_KEY, null)
  if (
    cached &&
    typeof cached.latitude === 'number' &&
    typeof cached.longitude === 'number' &&
    typeof cached.ts === 'number' &&
    Date.now() - cached.ts < CACHED_POSITION_MAX_AGE_MS
  )
    return [cached.latitude, cached.longitude]
  return null
}

function writeCachedPosition(latitude: number, longitude: number) {
  storage.setItem<ICachedPosition>(CACHED_POSITION_KEY, {
    latitude,
    longitude,
    ts: Date.now(),
  })
}

const mapStateToProps = (state: IRootState) => ({
  type: modalsSelectors.mapModalType(state),
  defaultCenter: modalsSelectors.mapModalDefaultCenter(state),
  clientFrom: clientOrderSelectors.from(state),
  clientTo: clientOrderSelectors.to(state),
  selectedOrderId: clientOrderSelectors.selectedOrder(state),
  activeOrders: ordersSelectors.activeOrders(state),
  detailedOrderStart: orderSelectors.start(state),
  detailedOrderDestination: orderSelectors.destination(state),
  takePassengerFrom: modalsSelectors.takePassengerModalFrom(state),
  takePassengerTo: modalsSelectors.takePassengerModalTo(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {
  isOpen?: boolean;
  disableButtons?: boolean;
  isModal?: boolean;
  onClose?: () => void
  containerClassName?: string
  setCenter?: (coordinates: [lat: number, lng: number]) => void
}

function Map({
  isOpen = true,
  defaultCenter,
  isModal,
  containerClassName,
  ...props
}: IProps) {
  return (
    <div
      className={cn('map-container', containerClassName, { 'map-container--active': isOpen, 'map-container--modal': isModal })}
      key={SITE_CONSTANTS.MAP_MODE}
    >
      <MapContainer
        center={
          defaultCenter ||
          readCachedPosition() ||
          SITE_CONSTANTS.DEFAULT_POSITION
        }
        zoom={defaultZoom}
        className='map'
        attributionControl={false}
      >
        <MapContent
          {...{ isOpen, defaultCenter, isModal, containerClassName }}
          {...props}
        />
      </MapContainer>
    </div>
  )
}

function MapContent({
  isOpen = true,
  type,
  defaultCenter,
  clientFrom,
  clientTo,
  selectedOrderId,
  activeOrders,
  detailedOrderStart,
  detailedOrderDestination,
  takePassengerFrom,
  takePassengerTo,
  disableButtons,
  isModal,
  onClose,
  containerClassName,
  setCenter = () => {},
}: IProps) {

  const map = useMap()

  const [staticMarkers, setStaticMarkers] = useState<IStaticMarker[]>([])
  const [userCoordinates, setUserCoordinates] =
    useState<IAddressPoint | null>(null)
  const [userCoordinatesAccuracy, setUserCoordinatesAccuracy] =
    useState<number | null>(null)
  const [routeInfo, setRouteInfo] = useState<IRouteInfo | null>(null)
  const [showRouteInfo, setShowRouteInfo] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false)

  let from: IAddressPoint | null = null,
    to: IAddressPoint | null = null
  switch (type) {
    case EMapModalTypes.Client:
      from = clientFrom
      to = clientTo
      break
    case EMapModalTypes.OrderDetails:
      from = detailedOrderStart
      to = detailedOrderDestination
      break
    case EMapModalTypes.TakePassenger:
      from = takePassengerFrom || null
      to = takePassengerTo || null
      break
    default:
      console.error('Wrong map type:', type)
      break
  }

  const selectedOrder = activeOrders?.find(
    order => order.b_id === selectedOrderId,
  ) ?? null
  const selectedOrderDriver = selectedOrder?.drivers?.find(
    driver => driver.c_state > 2,
  )
  const driverLatitude = selectedOrderDriver?.c_latitude
  const driverLongitude = selectedOrderDriver?.c_longitude
  const hasDriverMarker =
    type === EMapModalTypes.Client &&
    driverLatitude !== undefined &&
    driverLatitude !== null &&
    driverLongitude !== undefined &&
    driverLongitude !== null

  useEffect(() => {
    if (!isOpen) return
    // The /trip endpoint returns "wash" records with a different shape
    // than IOrder (t_* prefix instead of b_*). API.getWashTrips() is typed
    // as IOrder[], so we narrow at runtime via duck typing and a single
    // `unknown` cast at the boundary.
    interface IWashTrip {
      t_start_latitude: number
      t_start_longitude: number
      t_destination_latitude: number
      t_start_datetime?: { format: (fmt: string) => string }
      t_complete_datetime?: {
        format: (fmt: string) => string
        isAfter: (date: number | Date) => boolean
      }
    }
    API.getWashTrips()
      .then(rawItems => {
        const trips = (rawItems as unknown) as IWashTrip[]
        return trips.filter(item =>
          !!item.t_start_latitude &&
          item.t_start_latitude === item.t_destination_latitude &&
          !!item.t_start_datetime &&
          !!item.t_complete_datetime &&
          item.t_complete_datetime.isAfter(Date.now()),
        )
      })
      .then(items => {
        const markers: IStaticMarker[] = items.map(item => ({
          latitude: item.t_start_latitude,
          longitude: item.t_start_longitude,
          popup: `from ${item.t_start_datetime!.format('HH:mm MM-DD')} to ${item.t_complete_datetime!.format('HH:mm MM-DD')}`,
          tooltip: `until ${item.t_complete_datetime!.format('HH:mm MM-DD')}`,
        }))
        setStaticMarkers(markers)
      })
  }, [isOpen])

  useEffect(() => {
    if (!map) return

    let cancelled = false

    const applyUserCoords = (lat: number, lng: number, accuracy: number) => {
      if (cancelled) return
      setUserCoordinates({ latitude: lat, longitude: lng })
      setUserCoordinatesAccuracy(accuracy)
      // Cache the fix so the next page open starts on the right area
      // rather than the country-level fallback. Only cache reasonably
      // accurate readings — a 5000 m fix would otherwise teach the app
      // the wrong neighborhood.
      if (accuracy && accuracy < 1000)
        writeCachedPosition(lat, lng)
    }

    const shouldAutoCenter = !defaultCenter

    // Avoid sitting on DEFAULT_POSITION for many seconds: Leaflet locate with
    // timeout Infinity waits for a "best" GPS fix. Use a fast cached/coarse
    // read first, then refine with high accuracy.
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        applyUserCoords(coords.latitude, coords.longitude, coords.accuracy)
        if (shouldAutoCenter) {
          map.setView([coords.latitude, coords.longitude], map.getZoom(), {
            animate: false,
          })
        }
      },
      () => {},
      {
        enableHighAccuracy: false,
        maximumAge: 300_000,
        timeout: 4_000,
      },
    )

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        applyUserCoords(coords.latitude, coords.longitude, coords.accuracy)
        if (shouldAutoCenter) {
          map.panTo([coords.latitude, coords.longitude], { animate: false })
        }
      },
      e => logGeolocationError(e, 'map:initial'),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      },
    )

    return () => {
      cancelled = true
    }
  }, [map, defaultCenter])

  useInterval(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
        })
        setUserCoordinatesAccuracy(coords.accuracy)
        if (coords.accuracy && coords.accuracy < 1000)
          writeCachedPosition(coords.latitude, coords.longitude)
      },
      error => logGeolocationError(error, 'map:refresh'),
      { enableHighAccuracy: true },
    )
  }, 20000)

  useEffect(() => {
    defaultCenter && map?.panTo(defaultCenter)
  }, [defaultCenter])

  useEffect(() => {
    map?.invalidateSize()
  }, [isOpen])

  useEffect(() => {
    function moveend() {
      const { lat, lng } = map.getCenter()
      setCenter([lat, lng])
    }
    map.on('moveend', moveend)
    return () => {
      map.off('moveend', moveend)
    }
  }, [map, setCenter])

  useEffect(() => {
    const onChange = () => {
      // The fullscreen target is now the surrounding `<section>`
      // (see `toggleFullscreen` below) so that the bottom form
      // stays visible alongside the map. Compare against any
      // currently-fullscreened ancestor of the map container, not
      // the map container itself.
      const fsEl = document.fullscreenElement as Element | null
      const inFullscreen = !!fsEl && fsEl.contains(map.getContainer())
      setIsFullscreen(inFullscreen || isPseudoFullscreen)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [map, isPseudoFullscreen])

  useEffect(() => {
    const host = map.getContainer().parentElement as HTMLElement | null
    if (!host) return
    host.classList.toggle('map-container--pseudo-fullscreen', isPseudoFullscreen)
    document.body.classList.toggle('map-fullscreen-active', isPseudoFullscreen)
    map.invalidateSize()
    return () => {
      host.classList.remove('map-container--pseudo-fullscreen')
      document.body.classList.remove('map-fullscreen-active')
    }
  }, [map, isPseudoFullscreen])

  useEffect(() => {
    setShowRouteInfo(false)
    setRouteInfo(null)

    if (!from?.latitude || !from?.longitude || !to?.latitude || !to?.longitude)
      return
    let changed = false

    API.makeRoutePoints(from, to)
      .then((info) => {
        if (changed)
          return
        setRouteInfo(info)
        setShowRouteInfo(true)
        setTimeout(() => {
          setShowRouteInfo(false)
        }, 5000)
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      changed = true
    }
  }, [from, to])

  const duration = [
    !!routeInfo?.time.hours && `${routeInfo?.time.hours} h`,
    !!routeInfo?.time.minutes && `${routeInfo?.time.minutes} min`,
  ].filter(part => part).join(' ')

  const toggleFullscreen = useCallback(async(event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    // Target the closest <section.page-section> instead of the bare
    // map container. Native fullscreen renders ONLY the requested
    // element, so on Chrome Android / iOS Safari the bottom order
    // form was being hidden when we fullscreened the map element
    // alone (customer screenshot, May 8). The page section contains
    // both the map and the form, so going fullscreen on it keeps
    // everything visible while the browser still removes its URL
    // bar and OS chrome. The global header sits outside this
    // section and is hidden by the `map-fullscreen-active` CSS as
    // before, which is the desired behaviour.
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
  }, [map, isPseudoFullscreen])

  return (
    <>
      {
        showRouteInfo && (
          <div
            className="map-container__route"
          >

            <b>{t(TRANSLATION.DISTANCE)}</b> {routeInfo?.distance}km<br />
            <b>{t(TRANSLATION.EXPECTED_DURATION)}</b>&nbsp;
            {duration}
          </div>
        )
      }
      {
        routeInfo && (
          <Polyline positions={routeInfo.points} />
        )
      }
      {
        !!userCoordinates?.latitude &&
        !!userCoordinates?.longitude &&
        <CircleMarker
          radius={0}
          weight={10}
          center={[userCoordinates.latitude, userCoordinates.longitude]}
        />
      }
      {
        !!userCoordinates?.latitude &&
        !!userCoordinates?.longitude &&
        !!userCoordinatesAccuracy &&
        <Circle
          radius={userCoordinatesAccuracy}
          center={[userCoordinates.latitude, userCoordinates.longitude]}
        />
      }
      {staticMarkers.map(marker => (
        <Marker
          position={[marker.latitude, marker.longitude]}
          icon={new L.Icon({
            iconUrl: images.activeMarker,
            iconSize: [24, 34],
            iconAnchor: [12, 34],
            popupAnchor: [0, -35],
          })}
        >
          {!!marker.tooltip &&
            <Tooltip direction="top" offset={[0, -40]} opacity={1} permanent>{marker.tooltip}</Tooltip>
          }
          {!!marker.popup && <Popup>{marker.popup}</Popup>}
        </Marker>
      ))}
      {!!from?.latitude && !!from?.longitude &&
        <Marker
          position={[from.latitude, from.longitude]}
          icon={new L.Icon({
            iconUrl: images.markerFrom,
            iconSize: [35, 41],
            iconAnchor: [18, 41],
            popupAnchor: [0, -35],
          })}
        >
          <Popup>{`${t(TRANSLATION.FROM)}: ${formatAddress(from, { short: true, withCoords: true })}`}</Popup>
        </Marker>
      }
      {!!to?.latitude && !!to?.longitude &&
        <Marker
          position={[to.latitude, to.longitude]}
          icon={new L.Icon({
            iconUrl: images.markerTo,
            iconSize: [36, 41],
            iconAnchor: [18, 41],
            popupAnchor: [0, -35],
          })}
        >
          <Popup>{`${t(TRANSLATION.TO)}: ${formatAddress(to, { short: true, withCoords: true })}`}</Popup>
        </Marker>
      }
      {hasDriverMarker && (
        <Marker
          position={[Number(driverLatitude), Number(driverLongitude)]}
          icon={new L.Icon({
            iconUrl: images.carIcon,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14],
          })}
        >
          <Popup>{t(TRANSLATION.DRIVER)}</Popup>
        </Marker>
      )}
      <img
        src="https://unpkg.com/leaflet@1.6.0/dist/images/marker-icon-2x.png"
        className="leaflet-marker-icon leaflet-zoom-animated leaflet-interactive"
        alt="Центр"
        tabIndex={0}
      />
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
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            // Snapshot whatever fix we already have so the camera
            // moves immediately and the user gets feedback even if
            // the high-accuracy request takes a few seconds.
            if (userCoordinates?.latitude && userCoordinates?.longitude) {
              map.flyTo(
                [userCoordinates.latitude, userCoordinates.longitude],
                Math.max(map.getZoom(), 16),
              )
            }
            navigator.geolocation.getCurrentPosition(
              ({ coords }) => {
                setUserCoordinates({
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                })
                setUserCoordinatesAccuracy(coords.accuracy)
                if (coords.accuracy && coords.accuracy < 1000)
                  writeCachedPosition(coords.latitude, coords.longitude)
                map.flyTo(
                  [coords.latitude, coords.longitude],
                  Math.max(map.getZoom(), 16),
                )
              },
              (err) => logGeolocationError(err, 'map:myLocation'),
              { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
            )
          }}
        >
          ◎
        </button>
      </div>
      {/* {!disableButtons && <div className={cn('modal-buttons',{'z-indexed': isModal})}>
        {!!setFrom && (
          <Button
            className='modal-button'
            type="button"
            text={t(TRANSLATION.FROM)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              handleFromClick()}}
          />
        )}
        {!!setTo && (
          <Button
            className='modal-button'
            text={t(TRANSLATION.TO)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              handleToClick()
            }}
          />
        )}
        {!!(from?.latitude && from?.longitude) && !!(to?.latitude && to?.longitude) && (
          <Button
            className='modal-button'
            text={t(TRANSLATION.BUILD_THE_ROUTE)}
            onClick={handleRouteClick}
          />
        )}
        <Button
          className='modal-button'
          skipHandler={true}
          text={t(TRANSLATION.CLOSE)}
          onClick={() => {
            if (onClose) return onClose()
            setMapModal({ ...defaultMapModal })
          }}
        />
      </div>} */}
      <TileLayer
        attribution={getAttribution()}
        url={getTileServerUrl()}
      />
    </>
  )
}

export default connector(Map)
