import React, { useState, useEffect, useMemo } from 'react'
import cn from 'classnames'
import L from 'leaflet'
import {
  MapContainer, TileLayer,
  Marker, CircleMarker, Popup, Tooltip, Polyline,
  useMap,
} from 'react-leaflet'
import Fullscreen from 'react-leaflet-fullscreen-plugin'
import { connect, ConnectedProps } from 'react-redux'
import {
  EBookingDriverState,
  IAddressPoint,
  IOrder,
  IRouteInfo,
  IStaticMarker,
} from '../../types/types'
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
import { ordersSelectors } from '../../state/orders'
import { areasSelectors } from '../../state/areas'
import { IWayGraph } from '../../tools/maps'
import { orderSelectors } from '../../state/order'
import './styles.scss'

const defaultZoom = 15
const ACCEPTABLE_GEOLOCATION_ACCURACY_METERS = 200

const mapStateToProps = (state: IRootState) => ({
  type: modalsSelectors.mapModalType(state),
  defaultCenter: modalsSelectors.mapModalDefaultCenter(state),
  modalFrom: modalsSelectors.mapModalFrom(state),
  modalTo: modalsSelectors.mapModalTo(state),
  modalHighlight: modalsSelectors.mapModalHighlight(state),
  clientFrom: clientOrderSelectors.from(state),
  clientTo: clientOrderSelectors.to(state),
  detailedOrderStart: orderSelectors.start(state),
  detailedOrderDestination: orderSelectors.destination(state),
  takePassengerFrom: modalsSelectors.takePassengerModalFrom(state),
  takePassengerTo: modalsSelectors.takePassengerModalTo(state),
  activeOrders: ordersSelectors.activeOrders(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  wayGraph: areasSelectors.wayGraph(state),
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
  modalFrom,
  modalTo,
  modalHighlight,
  detailedOrderStart,
  detailedOrderDestination,
  takePassengerFrom,
  takePassengerTo,
  activeOrders,
  selectedOrder,
  wayGraph,
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
  const [driverRouteInfoById, setDriverRouteInfoById] =
    useState<Record<string, IRouteInfo | null>>({})
  const [showRouteInfo, setShowRouteInfo] = useState(false)
  const selectedActiveOrder = useMemo(
    () => activeOrders?.find(order => order.b_id === selectedOrder) ?? null,
    [activeOrders, selectedOrder],
  )
  const selectedOrderDrivers = useMemo(
    () => selectedActiveOrder?.drivers?.filter(driver =>
      (selectedActiveOrder.b_voting ?
        isVotingDriverVisible(driver.c_state) :
        driver.c_state > EBookingDriverState.Canceled) &&
      !!driver.c_latitude &&
      !!driver.c_longitude,
    ) ?? [],
    [selectedActiveOrder],
  )
  const shouldShowCenterMarker =
    type === EMapModalTypes.TakePassenger ||
    (type === EMapModalTypes.Client && !selectedActiveOrder)
  const shouldShowFromMarker = type !== EMapModalTypes.VotingNavigation

  let from: IAddressPoint | null = null,
    to: IAddressPoint | null = null
  switch (type) {
    case EMapModalTypes.Client:
      from = selectedActiveOrder?.b_start_latitude && selectedActiveOrder.b_start_longitude ? {
        latitude: selectedActiveOrder.b_start_latitude,
        longitude: selectedActiveOrder.b_start_longitude,
        address: selectedActiveOrder.b_start_address,
      } : clientFrom
      to = selectedActiveOrder?.b_destination_latitude && selectedActiveOrder.b_destination_longitude ? {
        latitude: selectedActiveOrder.b_destination_latitude,
        longitude: selectedActiveOrder.b_destination_longitude,
        address: selectedActiveOrder.b_destination_address,
      } : clientTo
      break
    case EMapModalTypes.OrderDetails:
      from = modalFrom || detailedOrderStart
      to = modalTo || detailedOrderDestination
      break
    case EMapModalTypes.VotingNavigation:
      from = modalFrom || userCoordinates || null
      to = modalTo || detailedOrderStart || null
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

    makeRoutePointsSafe(from, to, wayGraph)
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
  }, [from, to, wayGraph])

  useEffect(() => {
    if (!selectedActiveOrder || !selectedOrderDrivers.length) {
      setDriverRouteInfoById({})
      return
    }

    let changed = false
    const targetForDriver = (driverState: EBookingDriverState): IAddressPoint | null => {
      if (
        driverState === EBookingDriverState.Started &&
        selectedActiveOrder.b_destination_latitude &&
        selectedActiveOrder.b_destination_longitude
      ) {
        return {
          latitude: selectedActiveOrder.b_destination_latitude,
          longitude: selectedActiveOrder.b_destination_longitude,
          address: selectedActiveOrder.b_destination_address,
        }
      }

      if (selectedActiveOrder.b_start_latitude && selectedActiveOrder.b_start_longitude) {
        return {
          latitude: selectedActiveOrder.b_start_latitude,
          longitude: selectedActiveOrder.b_start_longitude,
          address: selectedActiveOrder.b_start_address,
        }
      }

      return null
    }

    Promise.all(
      selectedOrderDrivers.map(async(driver) => {
        const to = targetForDriver(driver.c_state)
        if (!to || !driver.c_latitude || !driver.c_longitude)
          return [driver.u_id, null] as const

        try {
          const route = await makeRoutePointsSafe(
            { latitude: driver.c_latitude, longitude: driver.c_longitude },
            to,
            wayGraph,
          )
          return [driver.u_id, route] as const
        } catch (error) {
          console.error(error)
          return [driver.u_id, null] as const
        }
      }),
    ).then(items => {
      if (changed) return
      setDriverRouteInfoById(Object.fromEntries(items))
    })

    return () => {
      changed = true
    }
  }, [
    selectedActiveOrder?.b_id,
    selectedActiveOrder?.b_start_latitude,
    selectedActiveOrder?.b_start_longitude,
    selectedActiveOrder?.b_destination_latitude,
    selectedActiveOrder?.b_destination_longitude,
    selectedOrderDrivers.map(driver =>
      `${driver.u_id}:${driver.c_state}:${driver.c_latitude}:${driver.c_longitude}`,
    ).join('|'),
    wayGraph,
  ])

  const duration = [
    !!routeInfo?.time.hours && `${routeInfo?.time.hours} h`,
    !!routeInfo?.time.minutes && `${routeInfo?.time.minutes} min`,
  ].filter(part => part).join(' ')
  const formatRouteDuration = (routeInfo?: IRouteInfo | null) => [
    !!routeInfo?.time.hours && `${routeInfo.time.hours} h`,
    !!routeInfo?.time.minutes && `${routeInfo.time.minutes} min`,
  ].filter(part => part).join(' ')
  const centerOnUser = () => {
    if (!userCoordinates?.latitude || !userCoordinates.longitude)
      return
    map.setView([userCoordinates.latitude, userCoordinates.longitude], Math.max(map.getZoom(), 16))
  }

  return (
    <>
      {!!userCoordinates?.latitude && !!userCoordinates.longitude &&
        <button
          type="button"
          className="map-container__locate-button"
          onClick={centerOnUser}
          aria-label="Show my location"
        >
          <span />
        </button>
      }
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
      {!!userCoordinates?.latitude &&
        !!userCoordinates?.longitude &&
        <CircleMarker
          className="map-container__user-marker"
          radius={6}
          weight={3}
          pathOptions={{
            color: '#FFFFFF',
            fillColor: '#1E88FF',
            fillOpacity: 1,
          }}
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
      {selectedOrderDrivers.map((driver) => {
        const driverRouteInfo = driverRouteInfoById[driver.u_id]
        const routeDuration = formatRouteDuration(driverRouteInfo)

        return (
          <React.Fragment key={`driver-${driver.u_id}`}>
            {!!driverRouteInfo?.points && (
              <Polyline
                positions={driverRouteInfo.points}
                pathOptions={{
                  color: driver.c_state === EBookingDriverState.Started ? '#0D47A1' : '#FF8F00',
                  weight: 4,
                }}
              />
            )}
            <Marker
              position={[driver.c_latitude!, driver.c_longitude!]}
              icon={new L.DivIcon({
                className: 'client-driver-marker',
                iconAnchor: [20, 20],
                popupAnchor: [0, -22],
                iconSize: [40, 40],
                html: `<img src="${images.mapArrowVoting || images.mapArrow}" />`,
              })}
            >
              <Popup>
                {getDriverDisplayName(driver)}<br />
                {t(TRANSLATION.BOOKING_DRIVER_STATES[driver.c_state])}
                {routeDuration && <><br />{t(TRANSLATION.DRIVER_ROUTE_TIME)}: {routeDuration}</>}
              </Popup>
            </Marker>
          </React.Fragment>
        )
      })}
      {shouldShowFromMarker && !!from?.latitude && !!from?.longitude &&
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
      {modalHighlight === 'from' && !!from?.latitude && !!from.longitude &&
        <CircleMarker
          center={[from.latitude, from.longitude]}
          radius={24}
          weight={4}
          pathOptions={{
            color: '#FF9900',
            fillColor: '#FF9900',
            fillOpacity: .12,
          }}
        />
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
      {modalHighlight === 'to' && !!to?.latitude && !!to.longitude &&
        <CircleMarker
          center={[to.latitude, to.longitude]}
          radius={24}
          weight={4}
          pathOptions={{
            color: '#00B100',
            fillColor: '#00B100',
            fillOpacity: .12,
          }}
        />
      }
      {shouldShowCenterMarker && <img
        src="https://unpkg.com/leaflet@1.6.0/dist/images/marker-icon-2x.png"
        className="leaflet-marker-icon leaflet-zoom-animated leaflet-interactive"
        alt="Центр"
        tabIndex={0}
      />}
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

function isVotingDriverVisible(state: EBookingDriverState) {
  return [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
  ].includes(state)
}

function getDriverDisplayName(driver: any) {
  return [
    driver?.u_name,
    driver?.u_family,
    driver?.user?.u_name,
    driver?.user?.u_family,
  ].find(Boolean) || 'Водитель'
}

async function makeRoutePointsSafe(
  from: IAddressPoint,
  to: IAddressPoint,
  wayGraph?: IWayGraph,
): Promise<IRouteInfo> {
  try {
    return await API.makeRoutePoints(from, to)
  } catch (error) {
    const localRoute = makeLocalRoutePoints(from, to, wayGraph)
    if (localRoute)
      return localRoute

    throw error
  }
}

function makeLocalRoutePoints(
  from: IAddressPoint,
  to: IAddressPoint,
  wayGraph?: IWayGraph,
): IRouteInfo | null {
  if (!wayGraph || !from.latitude || !from.longitude || !to.latitude || !to.longitude)
    return null

  const [startNode] = wayGraph.findClosestNode(from.latitude, from.longitude)
  const [endNode] = wayGraph.findClosestNode(to.latitude, to.longitude)
  if (!startNode || !endNode)
    return null

  const [path, distanceMeters] = wayGraph.findShortestPath(startNode.id, endNode.id)
  if (!path.length || !Number.isFinite(distanceMeters))
    return null

  const minutes = Math.max(1, Math.round(distanceMeters / 1000 / 35 * 60))
  return {
    distance: parseFloat((distanceMeters / 1000).toFixed(2)),
    time: {
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
    },
    points: [
      [from.latitude, from.longitude],
      ...path.map(node => [node.latitude, node.longitude] as [number, number]),
      [to.latitude, to.longitude],
    ],
  }
}
