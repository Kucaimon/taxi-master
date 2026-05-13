export enum EBookingActions {
  SetConfirmState = 'set_confirm_state',
  SetWaitingTime = 'set_waiting_time',
  SetPerformer = 'set_performer',
  SetArriveState = 'set_arrive_state',
  SetStartState = 'set_start_state',
  SetCompleteState = 'set_complete_state',
  SetCancelState = 'set_cancel_state',
  SetRate = 'set_rate',
  SetTips = 'set_tips',
  Edit = 'edit',
  /**
   * Passenger raises `b_options.pickup_tip` on an active booking.
   * Backend must accept this action on `POST /drive/get/:id` (see API module).
   */
  RaisePickupTip = 'raise_pickup_tip',
}