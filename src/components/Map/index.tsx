import React, { useState, useEffect } from 'react'
import cn from 'classnames'
import L from 'leaflet'
import {
  MapContainer, TileLayer,
  Marker, CircleMarker, Circle, Popup, Tooltip, Polyline,
  useMap,
} from 'react-leaflet'
import Fullscreen from 'react-leaflet-fullscreen-plugin'
import { connect, ConnectedProps } from 'react-redux'
import { IAddressPoint, IRouteInfo, IStaticMarker } from '../../types/types'
import { getAttribution, getTileServerUrl } from '../../tools/utils'
import { useInterval } from '../../tools/hooks'
import SITE_CONSTANTS from '../../siteConstants'
import images from '../../constants/images'
import { t, TRANSLATION } from '../../localization'
import * as API from '../../API'
import { IRootState } from '../../state'
import { modalsSelectors } from '../../state/modals'
import { EMapModalTypes } from '../../state/modals/constants'
import { clientOrderSelectors } from '../../state/clientOrder'
import { orderSelectors } from '../../state/order'
import './styles.scss'

const defaultZoom = 15

const mapStateToProps = (state: IRootState) => ({
  type: modalsSelectors.mapModalType(state),
  defaultCenter: modalsSelectors.mapModalDefaultCenter(state),
  clientFrom: clientOrderSelectors.from(state),
  clientTo: clientOrderSelectors.to(state),
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
        center={defaultCenter || SITE_CONSTANTS.DEFAULT_POSITION}
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

  useEffect(() => {
    if (isOpen) {
      API.getWashTrips()
        .then(items => items.filter(item =>
          // @ts-ignore
          item.t_start_latitude && item.t_start_latitude === item.t_destination_latitude &&
          // @ts-ignore
          item.t_start_datetime?.format && item.t_complete_datetime?.format &&
          // @ts-ignore
          item.t_complete_datetime.isAfter(Date.now()),
        ))
        .then(items => {
          // @ts-ignore
          const markers = items.map(item => ({
            // @ts-ignore
            latitude: item.t_start_latitude,
            // @ts-ignore
            longitude: item.t_start_longitude,
            // @ts-ignore
            popup: `from ${item.t_start_datetime.format('HH:mm MM-DD')} to ${item.t_complete_datetime.format('HH:mm MM-DD')}`,
            // @ts-ignore
            tooltip: `until ${item.t_complete_datetime.format('HH:mm MM-DD')}`,
          }))
          setStaticMarkers(markers)
        })
    }
  }, [isOpen])

  useEffect(() => {
    if (!map) return

    map.once('locationfound', (e: L.LocationEvent) => {
      setUserCoordinates({
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
      })
      setUserCoordinatesAccuracy(e.accuracy)
      if (!defaultCenter)
        map.setView(e.latlng)
    })
    map.once('locationerror', (e: L.ErrorEvent) => console.error(e.message))
    map.locate({
      timeout: Infinity,
      enableHighAccuracy: true,
    })
  }, [map])

  useInterval(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
        })
        setUserCoordinatesAccuracy(coords.accuracy)
      },
      error => console.error(error),
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
          <Popup>{t(TRANSLATION.FROM)}{!!from.address && `: ${from.shortAddress || from.address}`}</Popup>
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
          <Popup>{t(TRANSLATION.TO)}{!!to.address && `: ${to.shortAddress || to.address}`}</Popup>
        </Marker>
      }
      <img
        src="https://unpkg.com/leaflet@1.6.0/dist/images/marker-icon-2x.png"
        className="leaflet-marker-icon leaflet-zoom-animated leaflet-interactive"
        alt="Центр"
        tabIndex={0}
      />
      <Fullscreen
        position="topleft"
      />
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
