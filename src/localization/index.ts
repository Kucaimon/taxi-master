import store from '../state'
import CATEGORIES from './categories'
import TRANSLATION from './translation'
import { configSelectors } from '../state/config'
import { LANG_VLS_FALLBACKS } from './langVlsFallbacks'

interface IOptions {
  /** Does result.toLowerCase() */
  toLower?: boolean,
  /** Does result.toUpperCase() */
  toUpper?: boolean
}

/**
 * Gets localized text
 *
 * @param id CATEGORY.KEY or just KEY. Default category is lang_vls
 * @param options Result text modificators
 */
function t(id: string, options: IOptions = {}) {
  try {
    if (!id || typeof id !== 'string')
      return 'Error'

    const splittedID = id.split('.')

    const category = splittedID.length === 2 ?
      splittedID[0] :
      CATEGORIES.LANG_VLS
    const key = splittedID[splittedID.length - 1]

    const language = configSelectors.language(store.getState())

    let result = ''

    const _data = (window as any).data

    if (!_data) return 'Error'

    const defaultLangIso = _data.langs?.[_data.default_lang]?.iso
    const pickById = (dictionary: any) => {
      if (!dictionary) return undefined
      return (
        dictionary?.[language?.id] ??
        dictionary?.[String(language?.id)] ??
        dictionary?.[_data.default_lang] ??
        dictionary?.[String(_data.default_lang)] ??
        Object.values(dictionary)[0]
      )
    }
    const pickByIso = (dictionary: any) => {
      if (!dictionary) return undefined
      return (
        dictionary?.[language?.iso] ??
        dictionary?.[defaultLangIso] ??
        Object.values(dictionary)[0]
      )
    }

    const possibleCategories: string[] = Object.values(CATEGORIES)
    if (category === CATEGORIES.LANG_VLS)
      result = pickById(_data[category]?.[key])
    else if (category === CATEGORIES.BOOKING_DRIVER_STATES && key === '0')
      result = pickById(_data.lang_vls?.search)
    else if (possibleCategories.includes(category))
      result = pickByIso(_data[category]?.[key])
    else
      throw new Error(`Unknown category ${category}`)

    if (!result)
      throw new Error('Wrong key')

    if (options.toLower) {
      result = result.toLowerCase()
    }
    if (options.toUpper) {
      result = result.toUpperCase()
    }

    return result
  } catch (error) {
    if (!errorsShown.has(id)) {
      console.warn(
        `Localization error. id: ${id}, options: ${JSON.stringify(options)}`,
        error,
      )
      errorsShown.add(id)
    }
    return 'Error'
  }
}

/** Like `t` for default `lang_vls` keys, with a static fallback when the key is missing server-side. */
function tLangVls(id: string): string {
  const primary = t(id)
  if (primary !== 'Error')
    return primary
  const key = id.split('.').pop() || id
  const fb = LANG_VLS_FALLBACKS[key]
  if (!fb)
    return 'Error'
  const language = configSelectors.language(store.getState())
  const iso = (language?.iso || '').toLowerCase()
  return iso.startsWith('ru') ? fb.ru : fb.en
}

// TODO get back

// const castedTranslation = T as any

export {
  t,
  tLangVls,
  TRANSLATION,
}

const errorsShown = new Set<string>()