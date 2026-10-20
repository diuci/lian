import zhCn from '~/locales/zh-cn.json'

// 界面文案词典（v4 起全站仅简体，繁体半边已下线）。
// 词典里没有这个 key 就把 key 摊在页面上：静默退回，等于悄悄少了一块。
const HANS = zhCn as Record<string, string>

export function t(key: string): string {
  return HANS[key] !== undefined ? HANS[key] : key
}

export function tf(key: string, args: Record<string, string | number> = {}): string {
  let s = t(key)
  for (const [k, v] of Object.entries(args)) s = s.split('{' + k + '}').join(String(v))
  return s
}
