import moment from 'moment'
import SITE_CONSTANTS from '../siteConstants'
import { DEFAULT_CITY_ID, PROFIT_RANKS } from '../constants/orders'
import {
  EBookingStates,
  EDriverResponseModes,
  EOrderProfitRank,
  IOrder,
  ICar,
  IOrderEstimation,
} from '../types/types'
import { IWayGraph, IWayGraphNode } from './maps'

export function getOrderDriveStartedAt(order?: IOrder | null) {
  return order?.drivers?.find(driver => driver.c_started)?.c_started
}

export function updateCompletedOrderDuration(order: IOrder): IOrder {
  const driveStartedAt = getOrderDriveStartedAt(order)
  if (
    order.b_state === EBookingStates.Completed &&
    order.b_options?.pricingModel &&
    driveStartedAt
  ) {
    order = {
      ...order,
      b_options: {
        ...order.b_options,
        pricingModel: {
          ...order.b_options.pricingModel,
          options: {
            ...(order.b_options.pricingModel.options || {}),
            duration: moment(order.b_completed)
              .diff(driveStartedAt, 'minutes'),
          },
        },
      },
    }
    const newPrice = calculateFinalPrice(order)
    if (typeof newPrice === 'number')
      order.b_options!.pricingModel!.price = newPrice
  }
  return order
}

export const calculateFinalPriceFormula = (order: IOrder | null) => {
  if (!order) {
    return 'err'
  }
  if (!order?.b_options?.pricingModel?.formula) {
    return 'err'
  }
  let formula = order.b_options?.pricingModel?.formula
  let options = order.b_options?.pricingModel?.options || {}

  // pick up submitPrice from b_options
  options = {
    ...options,
    ...{
      submit_price: order.b_options?.submitPrice,
      distance: order.b_options?.pricingModel?.calculationType === 'incomplete'? '?' : order.b_options?.pricingModel?.options?.distance,
      duration:  order.b_options?.pricingModel?.calculationType === 'incomplete' && order.b_options?.pricingModel?.options?.duration === 0? '?' : order.b_options?.pricingModel?.options?.duration,
    },
  }
  // Replace all placeholders in the formula with their values
  Object.entries(options).forEach(([key, value]) => {
    const placeholder = `${key}`
    formula = (formula || 'error_0x01').replace(new RegExp(placeholder, 'g'), value === '?' ? '?' :Math.trunc(value)?.toString() || '0')
  })

  const timeRatioMatch = (formula || 'error_0x02').match(/\(([^)]+)\)\*(\d+(?:\.\d+)?)/)
  if (timeRatioMatch) {
    const coefficient = parseFloat(timeRatioMatch[2])
    if (coefficient === 1) {
      // If coefficient is 1, remove parentheses and multiplication
      formula = (formula || 'error_0x03').replace(/\(([^)]+)\)\*\d+(?:\.\d+)?/, '$1')
    }
  }

  return formula
}

export const calculateFinalPrice = (order: IOrder | null) => {
  if (!order) {
    return 'err'
  }
  if(!order.b_options?.pricingModel?.formula) {
    return 'err'
  }
  if(order.b_options?.pricingModel?.formula === '-') {
    return '-'
  }
  let formula  = order.b_options?.pricingModel?.formula
  let options = order.b_options?.pricingModel?.options || {}

  // pick up submitPrice from b_options
  options = {
    ...options,
    ...{
      submit_rice: order.b_options?.submitPrice,
    },
  }
  if (!formula || formula === 'err') {
    return 'err'
  }
  Object.entries(options).forEach(([key, value]) => {
    const placeholder = `${key}`
    formula = formula.replace(new RegExp(placeholder, 'g'), value?.toString() || '0')
  })
  try {
    const result = eval(formula)
    console.log('FINAL FORMULA', formula, '=', result, ' ~ ', Math.trunc(result))
    return Math.trunc(result).toString()
  } catch (e) {
    return 'err'
  }
}

export function candidateMode(order?: IOrder): boolean {
  switch (SITE_CONSTANTS.DRIVER_RESPONSE_MODE) {
    case EDriverResponseModes.Performer:
      return false
    case EDriverResponseModes.Candidate:
      return true
    case EDriverResponseModes.ByOrder:
      for (const id of order?.b_comments ?? [])
        switch (SITE_CONSTANTS.BOOKING_COMMENTS[id].responseMode) {
          case EDriverResponseModes.Performer:
            return false
          case EDriverResponseModes.Candidate:
            return true
        }
      return false
    default:
      throw new Error('Not implemented')
  }
}

export function estimateOrder(
  order: IOrder,
  car: ICar,
  startingPoint: [lat: number, lng: number],
  graph: IWayGraph,
): IOrderEstimation {
  const profit = estimateProfit(order, car, startingPoint, graph)
  const profitRank = profit && rankProfit(profit)
  return { profit, profitRank }
}

export function estimateProfit(
  order: IOrder,
  car: ICar,
  startingPoint: [lat: number, lng: number],
  graph: IWayGraph,
): number | undefined {
  let factors = SITE_CONSTANTS.CALCULATION_BENEFITS
    [DEFAULT_CITY_ID]?.[car.cc_id]
  if (!factors)
    return
  const distance = calculateDistance(order, startingPoint, graph)
  if (!distance)
    return

  const orderTime = moment(0)
  for (const part of ['hours', 'minutes', 'seconds'] as const)
    orderTime.set(part, order.b_start_datetime.get(part))
  const factorsModification = factors.time_modifications.find(({
    start, end,
  }) =>
    start < end ?
      start < orderTime && orderTime < end :
      end < orderTime && orderTime < start,
  )
  if (factorsModification)
    factors = { ...factors, ...factorsModification }

  const [startingPointToOrder, startToDestination] = distance
    .map(distance => distance / 1000)
  const { fuel_cost, rate, base_fare, min_fare } = factors
  const income = Math.max(base_fare + rate * startToDestination, min_fare)
  const cost = fuel_cost * (startingPointToOrder + startToDestination)
  return income - cost
}

export function rankProfit(profit: number): EOrderProfitRank {
  const ranks = [...PROFIT_RANKS].sort(([, a], [, b]) => a - b)
  let rank = EOrderProfitRank.Low
  for (const [minProfitRank, minProfit] of ranks)
    if (profit >= minProfit)
      rank = minProfitRank
  return rank
}

export function calculateDistance(
  order: IOrder,
  startingPoint: [lat: number, lng: number],
  graph: IWayGraph,
): [startingPointToOrder: number, startToDestination: number] | undefined {
  if (!(
    order.b_start_latitude && order.b_start_longitude &&
    order.b_destination_latitude && order.b_destination_longitude
  ))
    return

  const nodes: IWayGraphNode[] = []
  for (const [lat, lng] of [
    startingPoint,
    [order.b_start_latitude, order.b_start_longitude],
    [order.b_destination_latitude, order.b_destination_longitude],
  ]) {
    const [node] = graph.findClosestNode(lat, lng)
    if (!node)
      return
    nodes.push(node)
  }
  const [startNode, orderStartNode, destinationNode] = nodes

  const distances: number[] = []
  for (const [start, destination] of [
    [startNode, orderStartNode],
    [orderStartNode, destinationNode],
  ]) {
    const [, distance] = graph.findShortestPath(start.id, destination.id)
    if (distance === Infinity)
      return
    distances.push(distance)
  }
  const [startingPointToOrder, startToDestination] = distances

  return [startingPointToOrder, startToDestination]
}
