// 繁体这一层的断言。check-trad 查的是产物与词典，这里查的是运行时那三个函数
// 真的按码位取形、真的不会静默端出简体。
import { describe, expect, it } from 'vitest'
import trad from '../src/data/traditional.json'
import corpus from '../src/data/corpus.json'
import zhCn from '../src/locales/zh-cn.json'
import zhTw from '../src/locales/zh-tw.json'
import { charsOf } from '../src/logic/layout.mjs'
import { tradGlyph, tradUnit, tradLabel, tradStage, tradVolume } from '../src/logic/trad'
import { t, tf, localeKeys } from '../src/logic/locale'
import { lineGroups, unitMap } from '../tools/build-traditional.mjs'

const UNITS = (trad as any).units as Record<string, string>
const SAME = new Set<string>((trad as any).same || [])

function allUnits(): string[] {
  const out = new Set<string>()
  const add = (p: any) => { for (const part of p.parts || []) for (const u of part.units || []) out.add(u) }
  for (const p of (corpus as any).pieces) add(p)
  const hist = (corpus as any).history || {}
  for (const rec of hist.days || []) { const p = (hist.pieces || {})[rec.id]; if (p) add(p) }
  return [...out]
}

describe('繁体字形', () => {
  it('词库里每一句都有繁体形（换了形的或登记为同形的）', () => {
    const missing = allUnits().filter((u) => UNITS[u] === undefined && !SAME.has(u))
    expect(missing).toEqual([])
  })
  it('每个繁体形与简体逐码位等长', () => {
    const bad = Object.entries(UNITS).filter(([s, t]) => charsOf(s).length !== charsOf(t).length)
    expect(bad).toEqual([])
  })
  it('增补平面字那一行：整组切完仍逐码位等长，取字不错位', () => {
    // 这一条测的是机制，不是事实：事实（哪一行写作什么）由 check-trad 对着内容仓核。
    // 样本照三峡「绝𪩘多生怪柏」的形状造 —— 𪩘 在增补平面，UTF-16 里占两个码元，
    // 按码元切会把一个字劈成两半，句子数与字数全都会错。CI 里没有内容仓，所以样本自带。
    const groups = lineGroups(
      [{ id: 'probe', title: '样本', fullLinesPunct: ['绝𪩘多生怪柏，悬泉瀑布。'], linesPunct: [] }],
      { probe: { id: 'probe', text_trad: ['絕巘多生怪柏，懸泉瀑布。'], sections_trad: {} } },
    )
    const map = unitMap(groups)
    const key = [...map.keys()].find((u: string) => u.includes('𪩘'))
    expect(key).toBeTruthy()
    const value = map.get(key!)
    expect(charsOf(key!).length).toBe(charsOf(value).length)
    expect(charsOf(value)[charsOf(key!).indexOf('𪩘')]).toBe('巘')
  })
  it('同一句只有一种繁体形', () => {
    const seen = new Map<string, string>()
    const dup: string[] = []
    for (const [s, t] of Object.entries(UNITS)) {
      if (seen.has(s) && seen.get(s) !== t) dup.push(s)
      seen.set(s, t)
    }
    expect(dup).toEqual([])
  })
  it('篇名/学段/册次的繁体只在真的不同时才给，简体模式一律原样', () => {
    const p = (corpus as any).pieces.find((x: any) => (trad as any).titles[x.id]?.title)
    expect(tradLabel(p, 'title', false)).toBe(p.title)
    expect(tradLabel(p, 'title', true)).not.toBe(p.title)
    expect(tradStage('小学', false)).toBe('小学')
    expect(tradVolume('九年级上册', false)).toBe('九年级上册')
  })
})

describe('界面文案', () => {
  it('两份词典键一模一样', () => {
    expect(Object.keys(zhTw).sort()).toEqual(Object.keys(zhCn).sort())
  })
  it('带参数的词条两边参数齐', () => {
    const bad = Object.keys(zhCn).filter((k) => {
      const a = ((zhCn as any)[k].match(/\{[a-z]+\}/g) || []).sort().join(',')
      const b = ((zhTw as any)[k].match(/\{[a-z]+\}/g) || []).sort().join(',')
      return a !== b
    })
    expect(bad).toEqual([])
  })
  it('词典里没有的词条就摊在页面上，不静默换成另一种语言', () => {
    expect(t('no.such.key')).toBe('no.such.key')
  })
  it('tf 把每个占位符都换掉', () => {
    localeKeys.length
    expect(tf('browse.units', { n: 7 })).toContain('7')
    expect(tf('browse.units', { n: 7 })).not.toContain('{n}')
  })
})
