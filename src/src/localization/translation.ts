import COMMON from './common'
import CATEGORIES from './categories'

const categoryProxies = Object.fromEntries(
  Object.entries(CATEGORIES).map(([categoryKey, categoryName]) => [
    categoryKey,
    new Proxy({}, {
      get(target, key: string) {
        return `${categoryName}.${key}`
      },
    }),
  ]),
) as Record<keyof typeof CATEGORIES, any>

export default {
  ...COMMON,
  ...categoryProxies,
}