import { ref } from 'vue'
import zhCn from '~/locales/zh-cn.json'
import zhTw from '~/locales/zh-tw.json'

// 界面文案的繁简。课文的字形不在这里 —— 那份在 ~/data/traditional.json，
// 由 tools/build-traditional.mjs 从内容仓派生好的繁体里取，本站不自己转。
export const LOCALE_KEY = 'lian-locale'
export type Locale = 'hans' | 'hant'

const HANS = zhCn as Record<string, string>
const HANT = zhTw as Record<string, string>

function detect(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved === 'hant' || saved === 'hans') return saved
  } catch {}
  const nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []
  return nav.some((l) => /zh-(tw|hk|mo)/i.test(String(l || ''))) ? 'hant' : 'hans'
}

export const locale = ref<Locale>(detect())

export function setLocale(l: Locale) {
  locale.value = l
  try { localStorage.setItem(LOCALE_KEY, l) } catch {}
}
export function toggleLocale() { setLocale(locale.value === 'hant' ? 'hans' : 'hant') }
export function hant() { return locale.value === 'hant' }

/** 词典里没有这个 key 就把 key 摊在页面上：静默退回另一种语言，等于悄悄少了一块。 */
export function t(key: string): string {
  const table = locale.value === 'hant' ? HANT : HANS
  if (table[key] !== undefined) return table[key]
  return key
}

export function tf(key: string, args: Record<string, string | number> = {}): string {
  let s = t(key)
  for (const [k, v] of Object.entries(args)) s = s.split('{' + k + '}').join(String(v))
  return s
}

export const localeKeys = Object.keys(HANS).sort()
export const hasKey = (k: string) => HANS[k] !== undefined && HANT[k] !== undefined
