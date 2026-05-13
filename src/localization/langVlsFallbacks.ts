/**
 * `lang_vls` keys not yet provisioned on the server — short UI fallbacks so
 * placeholders do not show as `Error` while translators catch up.
 */
export const LANG_VLS_FALLBACKS: Record<string, { ru: string; en: string }> = {
  cancel: { ru: 'Отмена', en: 'Cancel' },
  confirm: { ru: 'Подтвердить', en: 'Confirm' },
  pickup_tip: { ru: 'На подачу', en: 'Pickup tip' },
  pickup_tip_active_label: { ru: 'Чаевые за подачу', en: 'Pickup tip' },
  pickup_tip_confirm_body: {
    ru: 'Счётчик включается только при посадке, поэтому водители могут отказываться от заказов вдали от основных дорог. Эта сумма — чаевые водителю за подачу к месту вызова. Уменьшить её нельзя.',
    en: 'The meter starts only after pickup, so drivers may decline orders far from main roads. This amount is a gratuity for driving to the pickup point. It cannot be reduced.',
  },
  pickup_tip_confirm_new_total: { ru: 'Новая сумма', en: 'New total' },
  pickup_tip_confirm_title: {
    ru: 'Подтверждение чаевых на подачу',
    en: 'Confirm pickup tip',
  },
}
