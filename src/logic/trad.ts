import trad from '~/data/traditional.json'
import { charsOf } from './layout.mjs'

// 繁体字形全部来自 ~/data/traditional.json —— 那份是 tools/build-traditional.mjs
// 从内容仓派生好的繁体（逐字核过来源页）里取的。本站不第二次转换。
const DOC = trad as any
const UNITS = (DOC.units || {}) as Record<string, string>
// 繁简本来就同形的句子：不写进 units（省体积），但要登记在这里。
// 没有这份登记，运行时分不清「这句繁简一样」与「这句漏了」——漏了就该说话。
const SAME = new Set<string>(DOC.same || [])
const TITLES = (DOC.titles || {}) as Record<string, Record<string, string>>
const STAGES = (DOC.stages || {}) as Record<string, string>

const warned = new Set<string>()

/** 整句的繁体形。找不到就照简体摆，并且当场说话 —— 半简半繁的一盘比没繁体更糟。 */
export function tradUnit(unit: string, isHant: boolean): string {
  if (!isHant) return unit
  const t = UNITS[unit]
  if (t !== undefined) return t
  if (SAME.has(unit)) return unit
  if (!warned.has(unit)) { warned.add(unit); console.error('[!!] 这句没有繁体形，只能照简体摆：' + unit) }
  return unit
}

/** 盘面上一个格的字形：按码位取，所以「绝𪩘」这种增补平面字不会错位。 */
export function tradGlyph(unit: string, k: number, isHant: boolean): string {
  const plain = charsOf(unit)
  if (!isHant) return plain[k]
  const t = UNITS[unit]
  if (t === undefined) {
    if (!SAME.has(unit) && !warned.has(unit)) { warned.add(unit); console.error('[!!] 这句没有繁体形，只能照简体摆：' + unit) }
    return plain[k]
  }
  const arr = charsOf(t)
  return arr[k] !== undefined ? arr[k] : plain[k]
}

export function tradLabel(piece: any, field: string, isHant: boolean): string {
  const plain = String((piece || {})[field] || '')
  if (!isHant) return plain
  const got = (TITLES[piece.id] || {})[field]
  return got !== undefined ? got : plain
}

export function tradStage(stage: string, isHant: boolean): string {
  if (!isHant) return stage
  return STAGES[stage] !== undefined ? STAGES[stage] : stage
}

export function tradVolume(volume: string, isHant: boolean): string {
  if (!isHant) return volume
  const v = (DOC.volumes || {})[volume]
  return v !== undefined ? v : volume
}

export const tradDoc = DOC
export const tradUnitCount = Object.keys(UNITS).length
export const hasTradUnit = (u: string) => UNITS[u] !== undefined
export const isTradSame = (u: string) => SAME.has(u)
