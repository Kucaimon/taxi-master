import React, { useState, useEffect, useMemo, useRef } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import {
  MapContainer, Marker, TileLayer, Polyline,
  Popup, Tooltip, useMap,
} from 'react-leaflet'
import Fullscreen from 'react-leaflet-fullscreen-plugin'
import {
  EBookingDriverState,
  EOrderProfitRank,
  IAddressPoint,
  IOrder,
  IRouteInfo,
  IUser,
  EStatuses,
} from '../../types/types'
import { IWayGraph } from '../../tools/maps'
import { useCachedState } from '../../tools/hooks'
import images from '../../constants/images'
import {
  dateFormatTime,
  distanceBetweenEarthCoordinates,
  getAngle,
  getAttribution,
  getTileServerUrl,
  formatCurrency,
  HIGH_ACCURACY_GEOLOCATION_OPTIONS,
} from '../../tools/utils'
import { useInterval } from '../../tools/hooks'
import SITE_CONSTANTS from '../../siteConstants'
import * as API from '../../API'
import { orderActionCreators } from '../../state/order'
import { modalsActionCreators } from '../../state/modals'
import { areasActionCreators, areasSelectors } from '../../state/areas'
import { IRootState } from '../../state'
import { t, TRANSLATION } from '../../localization'
import PageSection from '../../components/PageSection'
import Button from '../../components/Button'
import { EDriverTabs } from '.'
import './styles.scss'

const cachedDriverMapStateKey = 'cachedDriverMapState'
const DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY = 'driverStartedVotingOrderIds'

function getStoredStartedVotingOrderIds(): string[] {
  try {
    const value = localStorage.getItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function removeStoredStartedVotingOrderId(orderId: IOrder['b_id']) {
  const nextIds = getStoredStartedVotingOrderIds().filter(id => id !== orderId)
  localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

const mapDispatchToProps = {
  getOrder: orderActionCreators.getOrder,
  setRatingModal: modalsActionCreators.setRatingModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setOrderCardModal: modalsActionCreators.setOrderCardModal,
  getAreasBetweenPoints: areasActionCreators.getAreasBetweenPoints,
}

const mapStateToProps = (state: IRootState) => ({
  wayGraph: areasSelectors.wayGraph(state),
})

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  user: IUser,
  activeOrders: IOrder[] | null,
  readyOrders: IOrder[] | null,
}

function DriverOrderMapMode(props: IProps) {
  const [position, setPosition] = useCachedState<L.LatLngExpression | undefined>(
    `${cachedDriverMapStateKey}.position`,
  )
  const [zoom, setZoom] = useCachedState<number>(
    `${cachedDriverMapStateKey}.zoom`,
    15,
  )

  return (
    <PageSection className="driver-order-map-mode">
      <MapContainer
        center={position ?? SITE_CONSTANTS.DEFAULT_POSITION}
        zoom={zoom}
        className='map'
        attributionControl={false}
      >
        <DriverOrderMapModeContent
          {...props}
          locate={!position}
          {...{ setPosition, setZoom }}
        />
      </MapContainer>
    </PageSection>
  )
}

interface IContentProps extends IProps {
  locate: boolean,
  setZoom: (zoom: number) => void
  setPosition: (position: L.LatLngExpression) => void
}

function DriverOrderMapModeContent({
  user,
  activeOrders,
  readyOrders,
  locate,
  setPosition,
  setZoom,
  getOrder,
  setRatingModal,
  setMessageModal,
  setOrderCardModal,
  getAreasBetweenPoints,
  wayGraph,
}: IContentProps) {

  const navigate = useNavigate()
  const map = useMap()

  const [lastPositions, setLastPositions] = useState<[number, number][]>([])
  const [activeDriveRouteInfo, setActiveDriveRouteInfo] = useState<IRouteInfo | null>(null)
  const [startedVotingOrderIds, setStartedVotingOrderIds] = useState(() =>
    getStoredStartedVotingOrderIds(),
  )
  const fittedDestinationOrderRef = useRef<IOrder['b_id'] | null>(null)
  const lastRoutePointRef = useRef<IAddressPoint | null>(null)
  const lastRouteTargetRef = useRef<IAddressPoint | null>(null)
  const lastRouteGraphRef = useRef<IWayGraph | null>(null)
  // Заместо useState используем useRef чтобы не пересоздавать иконку каждый раз
  const arrowIconRef = useRef(
    new L.DivIcon({
      className: 'driver-arrow-divicon',
      iconAnchor: [20, 40],
      popupAnchor: [0, -35],
      iconSize: [40, 40],
      // TODO: Убрать id, сделать стили через класс
      html: `
        <img
          id="driver-arrow"
          src="${images.mapArrow}"
          style="
            transition: transform 0.15s linear;
            display: block;
            width: 100%;
            height: auto;
          "
        />
      `,
    }),
  )

  useEffect(() => {
    if (map) {
      map.once('locationfound', (e: L.LocationEvent) => {
        setLastPositions([[e.latlng.lat, e.latlng.lng]])
        if (locate)
          map.setView(e.latlng)
      })
      map.once('locationerror', (e: L.ErrorEvent) => console.error(e.message))
      map.locate({
        ...HIGH_ACCURACY_GEOLOCATION_OPTIONS,
      })

      map.on(
        'click',
        (e: L.LeafletMouseEvent) => {
          if (!(e.originalEvent?.target as HTMLDivElement)?.classList?.contains('map')) return

          if (user && window.confirm(`${t(TRANSLATION.CONFIRM_LOCATION)}?`)) {
            API.notifyPosition({ latitude: e.latlng.lat, longitude: e.latlng.lng })
          }
        },
      )
      map.on(
        'zoomend', () => {
          setZoom(map.getZoom())
        },
      )
      map.on(
        'moveend', () => {
          setPosition(map.getCenter())
        },
      )
    }
  }, [map])

  useInterval(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLastPositions(prev => {
          if (prev.length) {
            let newPositions = [
              ...prev.reverse().slice(0, 2).reverse(),
              [coords.latitude, coords.longitude],
            ]
            const p1 = newPositions[newPositions.length - 2]
            const p2 = newPositions[newPositions.length - 1]
            const angle = getAngle(
              {
                latitude: p1[0],
                longitude: p1[1],
              }, {
                latitude: p2[0],
                longitude: p2[1],
              },
            )
            // Обновляем только transform, а не пересоздаем иконку каждый раз
            const img = document.getElementById('driver-arrow') as HTMLImageElement | null
            if (img)
              img.style.transform = `rotate(${angle}deg)`
            return newPositions as typeof prev
          }
          return [[coords.latitude, coords.longitude]] as typeof prev
        })
      },
      error => console.error(error),
      HIGH_ACCURACY_GEOLOCATION_OPTIONS,
    )
  }, 2000)

  const activeDriverOrder = useMemo(() => {
    const navigationStates = [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
    ]

    const order = activeOrders?.find(item => {
      const driver = item.drivers?.find(item => item.u_id === user?.u_id)
      return !!driver && navigationStates.includes(driver.c_state)
    })

    if (!order) return null

    const driver = order.drivers?.find(item => item.u_id === user?.u_id) ?? null
    return { order, driver }
  }, [activeOrders, user?.u_id])

  const isStartedVotingOrder = Boolean(
    activeDriverOrder?.order.b_id &&
    startedVotingOrderIds.includes(activeDriverOrder.order.b_id),
  )

  const isRouteToDestination = Boolean(
    activeDriverOrder?.driver?.c_state === EBookingDriverState.Started ||
    isStartedVotingOrder,
  )

  const performingOrder = !isRouteToDestination ? activeDriverOrder?.order : undefined
  const currentOrder = isRouteToDestination ? activeDriverOrder?.order : undefined
  const routeOrder = activeDriverOrder?.order ?? null

  const onCompleteOrderClick = () => {
    if (!currentOrder) return

    API.setOrderState(currentOrder.b_id, EBookingDriverState.Finished)
      .then(() => {
        setStartedVotingOrderIds(removeStoredStartedVotingOrderId(currentOrder.b_id))
        getOrder(currentOrder.b_id)
        navigate(`/driver-order?tab=${EDriverTabs.Lite}`)
        setRatingModal({ isOpen: true })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({ isOpen: true, status: EStatuses.Fail, message: t(TRANSLATION.ERROR) })
      })
  }

  // Мемоизируем текущую позицию маркера (чтобы React не пересоздавал <Marker> из-за новой ссылки на массив)
  const currentPosition = useMemo((): [number, number] | null => {
    if (!lastPositions || !lastPositions.length) return null
    const last = lastPositions[lastPositions.length - 1]
    return [last[0], last[1]]
  }, [lastPositions])

  const centerOnDriver = () => {
    if (!currentPosition) return
    map.setView(currentPosition, Math.max(map.getZoom(), 16))
  }

  const currentOrderDestination = useMemo((): [number, number] | null => {
    if (!routeOrder?.b_destination_latitude || !routeOrder?.b_destination_longitude) return null
    return [
      routeOrder.b_destination_latitude,
      routeOrder.b_destination_longitude,
    ]
  }, [routeOrder?.b_destination_latitude, routeOrder?.b_destination_longitude])

  const currentOrderStart = useMemo((): [number, number] | null => {
    if (!routeOrder?.b_start_latitude || !routeOrder?.b_start_longitude) return null
    return [
      routeOrder.b_start_latitude,
      routeOrder.b_start_longitude,
    ]
  }, [routeOrder?.b_start_latitude, routeOrder?.b_start_longitude])

  const currentRouteTarget = useMemo((): [number, number] | null => {
    if (isRouteToDestination)
      return currentOrderDestination

    return currentOrderStart
  }, [isRouteToDestination, currentOrderDestination, currentOrderStart])

  const currentRouteStart = useMemo((): [number, number] | null => {
    if (currentPosition)
      return currentPosition

    return currentOrderStart
  }, [currentPosition, currentOrderStart])

  const routeAreasRequestKey = useMemo(() => {
    if (!currentRouteStart || !currentRouteTarget) return ''

    return [
      ...currentRouteStart,
      ...currentRouteTarget,
    ].map(value => value.toFixed(4)).join(';')
  }, [currentRouteStart, currentRouteTarget])

  useEffect(() => {
    if (!currentRouteStart || !currentRouteTarget) return

    getAreasBetweenPoints([currentRouteStart, currentRouteTarget])
  }, [routeAreasRequestKey, getAreasBetweenPoints])

  useEffect(() => {
    if (!currentRouteTarget) return
    if (fittedDestinationOrderRef.current === routeOrder?.b_id) return

    fittedDestinationOrderRef.current = routeOrder?.b_id ?? null

    if (currentRouteStart) {
      map.fitBounds([currentRouteStart, currentRouteTarget], {
        padding: [60, 90],
        maxZoom: 16,
      })
      return
    }

    map.setView(currentRouteTarget, Math.max(map.getZoom(), 15))
  }, [map, routeOrder?.b_id, currentRouteTarget, currentRouteStart])

  useEffect(() => {
    if (!currentRouteStart || !currentRouteTarget) {
      setActiveDriveRouteInfo(null)
      lastRoutePointRef.current = null
      lastRouteTargetRef.current = null
      lastRouteGraphRef.current = null
      return
    }

    const from: IAddressPoint = {
      latitude: currentRouteStart[0],
      longitude: currentRouteStart[1],
    }
    const to: IAddressPoint = {
      latitude: currentRouteTarget[0],
      longitude: currentRouteTarget[1],
    }

    const lastRoutePoint = lastRoutePointRef.current
    const lastRouteTarget = lastRouteTargetRef.current
    if (
      lastRoutePoint &&
      lastRouteTarget &&
      lastRouteGraphRef.current === wayGraph &&
      distanceBetweenEarthCoordinates(
        lastRoutePoint.latitude!,
        lastRoutePoint.longitude!,
        from.latitude!,
        from.longitude!,
      ) < 0.05 &&
      distanceBetweenEarthCoordinates(
        lastRouteTarget.latitude!,
        lastRouteTarget.longitude!,
        to.latitude!,
        to.longitude!,
      ) < 0.05
    ) return

    let changed = false
    lastRoutePointRef.current = from
    lastRouteTargetRef.current = to
    lastRouteGraphRef.current = wayGraph

    makeRoutePointsSafe(from, to, wayGraph)
      .then((info) => {
        if (changed) return
        setActiveDriveRouteInfo(info)
      })
      .catch((error) => {
        console.error(error)
        if (!changed)
          setActiveDriveRouteInfo(null)
      })

    return () => {
      changed = true
    }
  }, [currentRouteStart, currentRouteTarget, wayGraph])


  return (
    <>
      <TileLayer
        attribution={getAttribution()}
        url={getTileServerUrl()}
      />
      {currentPosition && (
        <button
          type="button"
          className="driver-order-map-mode__locate-button"
          onClick={centerOnDriver}
          aria-label="Show my location"
        >
          <span />
        </button>
      )}
      {
        // Заменяем lastPositions.map() на одиночный <Marker> с мемоизированной позицией и arrowIconRef.current
        currentPosition && (
          <Marker
            position={currentPosition}
            icon={arrowIconRef.current}
            key="driver-arrow"
          />
        )
      }
      {
        !!lastPositions.length &&
        <Polyline positions={lastPositions} />
      }
      {
        activeDriveRouteInfo && (
          <Polyline
            positions={activeDriveRouteInfo.points}
            pathOptions={{
              color: '#0D47A1',
              weight: 5,
            }}
          />
        )
      }
      {
        currentOrderDestination && (
          <Marker
            position={currentOrderDestination}
            icon={new L.Icon({
              iconUrl: images.markerTo,
              iconSize: [36, 41],
              iconAnchor: [18, 41],
              popupAnchor: [0, -35],
            })}
          >
            <Tooltip direction="top" offset={[0, -40]} opacity={1} permanent>
              {t(TRANSLATION.TO)}
            </Tooltip>
            <Popup>
              {t(TRANSLATION.TO)}
              {!!routeOrder?.b_destination_address && `: ${routeOrder.b_destination_address}`}
            </Popup>
          </Marker>
        )
      }
      {
        currentOrderStart && (
          <Marker
            position={currentOrderStart}
            icon={new L.Icon({
              iconUrl: images.markerFrom,
              iconSize: [35, 41],
              iconAnchor: [18, 41],
              popupAnchor: [0, -35],
            })}
          >
            <Popup>
              {t(TRANSLATION.FROM)}
              {!!routeOrder?.b_start_address && `: ${routeOrder.b_start_address}`}
            </Popup>
          </Marker>
        )
      }
      {
        [
          ...(readyOrders || []),
          ...(performingOrder ? [performingOrder] : []),
        ]
          .filter(item => item.b_start_latitude && item.b_start_longitude)
          .map(item =>
            <Marker
              position={[item.b_start_latitude, item.b_start_longitude] as L.LatLngExpression}
              icon={new L.DivIcon({
                iconAnchor: [20, 40],
                popupAnchor: [0, -35],
                iconSize: [50, 50],
                shadowSize: [29, 40],
                shadowAnchor: [7, 40],
                html: `<div class='order-marker${
                  item.profitRank !== undefined ?
                    ' order-marker--profit--' + {
                      [EOrderProfitRank.Low]: 'low',
                      [EOrderProfitRank.Medium]: 'medium',
                      [EOrderProfitRank.High]: 'high',
                    }[item.profitRank] :
                    ''
                }'>
                    <div class='order-marker-hint'>
                      <div class='row-info'>
                        ${item.b_destination_address}
                      </div>
                      <div class='row-info'>
                        <div>${item.b_start_datetime.format(dateFormatTime)}</div>
                        <div class='competitors-num'>${item.drivers?.length || 0}</div>
                      </div>
                      <div class='row-info'>
                        <div class='price'>${item.b_price_estimate || 0}</div>
                        <div class='tips'>${item.b_tips || 0}</div>
                        <img
                          src='${images.mapMarkerProfit}'
                        />
                        <div class='order-profit'>${item.b_passengers_count || 0}</div>
                      </div>
                      <div class='row-info'>
                        <img
                          src='${images.mapMarkerProfit}'
                        />
                        <div class='order-profit-estimation'>${
                          item.profit !== undefined ?
                            formatCurrency(item.profit, {
                              signDisplay: 'always',
                              currencyDisplay: 'none',
                            }) :
                            '+?'
                        }</div>
                      </div>
                    </div>
                    <img
                      src='${
                        item === performingOrder ?
                          images.mapOrderPerforming :
                          item.b_voting ?
                          images.mapOrderVoting :
                            images.mapOrderWating
                      }'
                    >
                  </div>`,
              })}
              eventHandlers={{
                click: () =>
                  setOrderCardModal({ isOpen: true, orderId: item.b_id }),
              }}
              key={item.b_id}
            />,
          )
      }
      <Fullscreen
        position="topleft"
      />
      <button
        className='no-coords-orders'
        onClick={() => navigate(`?tab=${EDriverTabs.Detailed}`)}
      >
        {
          (
            !!readyOrders && readyOrders
              .filter(item => !item.b_start_latitude || !item.b_start_longitude)
              .length
          ) || 0
        }
      </button>
      {
        currentOrder && (
          <Button
            text={t(TRANSLATION.CLOSE_DRIVE)}
            className="finish-drive-button"
            onClick={onCompleteOrderClick}
          />
        )
      }
      {/* {
        !!activeOrders?.length && (
          <div
            style={{
              zIndex: 400,
              position: 'absolute',
              left: '70px',
              right: '70px',
            }}
          >
            {
              activeOrders.map(order => (
                <ChatToggler
                  anotherUserID={order.u_id}
                  orderID={order.b_id}
                  key={order.b_id}
                />
              ))
            }
          </div>
        )
      } */}
    </>
  )
}

export default connector(DriverOrderMapMode)

async function makeRoutePointsSafe(
  from: IAddressPoint,
  to: IAddressPoint,
  wayGraph?: IWayGraph,
): Promise<IRouteInfo | null> {
  try {
    const apiRoute = await API.makeRoutePoints(from, to)
    if (isUsableRouteInfo(apiRoute))
      return apiRoute
  } catch (error) {
    console.error(error)
  }

  const localRoute = makeLocalRoutePoints(from, to, wayGraph)
  if (localRoute)
    return localRoute

  return null
}

function isUsableRouteInfo(route: IRouteInfo | null | undefined): route is IRouteInfo {
  return Boolean(
    route &&
    Array.isArray(route.points) &&
    route.points.length > 2 &&
    route.points.every(point =>
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
    ),
  )
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
  if (path.length < 2 || !Number.isFinite(distanceMeters))
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
