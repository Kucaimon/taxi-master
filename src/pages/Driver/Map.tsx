import React, { useState, useEffect, useMemo, useRef } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import {
  MapContainer, Marker, TileLayer, Polyline,
  useMap,
} from 'react-leaflet'
import Fullscreen from 'react-leaflet-fullscreen-plugin'
import {
  EBookingDriverState,
  EOrderProfitRank,
  IOrder,
  IUser,
  EStatuses,
} from '../../types/types'
import { useCachedState } from '../../tools/hooks'
import images from '../../constants/images'
import {
  dateFormatTime,
  getAngle,
  getAttribution,
  getTileServerUrl,
  formatCurrency,
} from '../../tools/utils'
import { formatAddress } from '../../tools/format'
import { useInterval } from '../../tools/hooks'
import SITE_CONSTANTS from '../../siteConstants'
import * as API from '../../API'
import { orderActionCreators } from '../../state/order'
import { modalsActionCreators } from '../../state/modals'
import { t, TRANSLATION } from '../../localization'
import PageSection from '../../components/PageSection'
import Button from '../../components/Button'
import { EDriverTabs } from '.'
import './styles.scss'

const cachedDriverMapStateKey = 'cachedDriverMapState'

/**
 * Escape user/API-provided text before injecting it into a Leaflet
 * marker `html` string. The popup HTML is built via template literals,
 * so without this `b_destination_address` containing an angle bracket
 * (or, more commonly, the literal `undefined` when the address is
 * missing) leaks into the DOM unsanitised. Cheap, sync, no DOMParser.
 */
const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const mapDispatchToProps = {
  getOrder: orderActionCreators.getOrder,
  setRatingModal: modalsActionCreators.setRatingModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setOrderCardModal: modalsActionCreators.setOrderCardModal,
}

const connector = connect(null, mapDispatchToProps)

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
}: IContentProps) {

  const navigate = useNavigate()
  const map = useMap()

  const [lastPositions, setLastPositions] = useState<[number, number][]>([])
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
        timeout: Infinity,
        enableHighAccuracy: true,
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
      { enableHighAccuracy: true },
    )
  }, 2000)

  const performingOrder = activeOrders
    ?.find(item => ([
      EBookingDriverState.Performer, EBookingDriverState.Arrived,
    ] as any[]).includes(
      item.drivers?.find(item => item.u_id === user?.u_id)?.c_state),
    )

  const currentOrder = activeOrders
    ?.find(item =>
      item.drivers?.find(item => item.u_id === user?.u_id)?.c_state === EBookingDriverState.Started,
    )

  const onCompleteOrderClick = () => {
    if (!currentOrder) return

    API.setOrderState(currentOrder.b_id, EBookingDriverState.Finished)
      .then(() => {
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
  const currentPosition = useMemo(() => {
    if (!lastPositions || !lastPositions.length) return null
    const last = lastPositions[lastPositions.length - 1]
    return [last[0], last[1]] as L.LatLngExpression
  }, [lastPositions])


  return (
    <>
      <TileLayer
        attribution={getAttribution()}
        url={getTileServerUrl()}
      />
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
                        ${escapeHtml(formatAddress(
                          {
                            address: item.b_destination_address,
                            latitude: item.b_destination_latitude,
                            longitude: item.b_destination_longitude,
                          },
                          { short: true, withCoords: true },
                        ))}
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