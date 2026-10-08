// 本地存档。全部在浏览器 localStorage，没有账号、没有服务器。
// 键名固定：lian-stage / lian-settings / lian-records / lian-pieces。
// 改键名等于把所有人的战绩清零，所以这里只加不改。

import { t, tf } from './locale'

export const KEYS = {
  theme: 'dc-theme',
  stage: 'lian-stage',
  settings: 'lian-settings',
  records: 'lian-records',
  pieces: 'lian-pieces',
}

export type Settings = {
  /** 找句阶段是否直接显示目标句子。关掉就是「只给字数」的硬模式。 */
  showTarget: boolean
  /** 是否显示拼音 */
  showPinyin: boolean
}

export const DEFAULT_SETTINGS: Settings = { showTarget: true, showPinyin: false }

export type Record_ = {
  day: string
  pieceId: string
  title: string
  part: number
  units: number
  chars: number
  mistakes: number
  orderAttempts: number
  seconds: number
  solved: boolean
  mode: 'daily' | 'practice'
}

export type Records = {
  version: 1
  days: Record_[]
  streak: number
  lastDaily: string | null
}

export const EMPTY_RECORDS: Records = { version: 1, days: [], streak: 0, lastDaily: null }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    // 版本对不上就当没有：旧格式不该把新格式带崩
    if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version !== (fallback as any).version)
      return fallback
    return parsed
  }
  catch { return fallback }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch { /* 隐私模式 / 配额满：玩不了存档，但游戏本身不该崩 */ }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, { ...DEFAULT_SETTINGS, version: 1 }) }
}
export function saveSettings(s: Settings) { write(KEYS.settings, { ...s, version: 1 }) }

export function loadStage(): string {
  try { return localStorage.getItem(KEYS.stage) || '' } catch { return '' }
}
export function saveStage(stage: string) { try { localStorage.setItem(KEYS.stage, stage) } catch {} }

export function loadRecords(): Records {
  const r = read<Records>(KEYS.records, { ...EMPTY_RECORDS })
  if (!Array.isArray(r.days)) return { ...EMPTY_RECORDS }
  return r
}

/** 每日题连续天数：只在「今天比上次记录晚一天」时累加，补玩过去某天不加分。 */
export function pushRecord(rec: Record_): Records {
  const all = loadRecords()
  const days = all.days.slice()
  if (rec.mode === 'daily') {
    const already = days.find((d) => d.mode === 'daily' && d.day === rec.day)
    if (already) Object.assign(already, rec)
    else days.push(rec)
  }
  else {
    days.push(rec)
  }
  const dailySorted = days.filter((d) => d.mode === 'daily').sort((a, b) => a.day.localeCompare(b.day))
  const lastDaily = dailySorted.length ? dailySorted[dailySorted.length - 1].day : null
  return {
    version: 1,
    days: days.slice(-500),
    streak: streakOf(dailySorted),
    lastDaily,
  }
}

function dayDiff(a: string, b: string) {
  const pa = a.split('-').map(Number)
  const pb = b.split('-').map(Number)
  const da = Date.UTC(pa[0], pa[1] - 1, pa[2])
  const db = Date.UTC(pb[0], pb[1] - 1, pb[2])
  return Math.round((da - db) / 86400000)
}

function streakOf(daily: Record_) {
  if (!daily.length) return 0
  let streak = 0
  for (let i = daily.length - 1; i >= 0; i--) {
    if (i === daily.length - 1) { streak = 1; continue }
    if (dayDiff(daily[i + 1].day, daily[i].day) === 1) streak++
    else break
  }
  return streak
}

/** 练过哪些篇目：浏览页要标出「这篇玩过」。 */
export function loadPlayedPieces(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEYS.pieces)
    if (!raw) return {}
    const o = JSON.parse(raw)
    return o && typeof o === 'object' ? o : {}
  }
  catch { return {} }
}
export function markPlayed(pieceId: string) {
  const o = loadPlayedPieces()
  o[pieceId] = (o[pieceId] || 0) + 1
  try { localStorage.setItem(KEYS.pieces, JSON.stringify(o)) } catch {}
}

export function shareText(rec: Record_, url: string) {
  const lines = [
    t('share.title') + ' ' + (rec.mode === 'daily' ? rec.day : t('share.practice')),
    '《' + rec.title + '》' + (rec.part > 0 ? tf('share.partN', { n: rec.part + 1 }) : ''),
    rec.solved
      ? tf('share.solved', { units: rec.units, mistakes: rec.mistakes, orders: rec.orderAttempts, time: fmtTime(rec.seconds) })
      : tf('share.unsolved', { units: rec.units }),
    url,
  ]
  return lines.join('\n')
}

export function fmtTime(s: number) {
  if (s < 60) return tf('time.sec', { n: s })
  return tf('time.min', { m: Math.floor(s / 60), s: s % 60 })
}
