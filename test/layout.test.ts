import { describe, expect, it } from 'vitest'
import seedrandom from 'seedrandom'
import {
  MAX_AREA, MAX_CHARS, MAX_ROWS, PuzzleError,
  boardFor, chunkUnits, makePuzzle, splitUnits, usability, verifyPuzzle,
} from '../src/logic/layout.mjs'

const rng = (s: string) => seedrandom(s)
const SAMPLE = ['水满田畴稻叶齐', '日光穿树晓烟低', '黄莺也爱新凉好', '飞过青山影里啼']

// 这 11 项原来在 tools/layout-lib.mjs 里。搬进 vitest 是因为同一个仓里跑两套 runner
// 只会让「跑过了」这句话有两个含义。断言一条没少。
describe('拆句', () => {
  it('标点切开，句号丢掉', () => {
    expect(splitUnits(['先天下之忧而忧，后天下之乐而乐。'])).toEqual(['先天下之忧而忧', '后天下之乐而乐'])
  })
  it('单字并进前一句，不留下单字块', () => {
    const b = splitUnits(['山，不在高，有仙则名。'])
    expect(b.some((u) => u.length < 2)).toBe(false)
    expect(b[0]).toBe('山不在高')
  })
})

describe('切段与容量', () => {
  it('超长篇切在句边界，段数最少，拼回去序列不变', () => {
    const many = Array.from({ length: 22 }, (_, i) => '字'.repeat(4 + (i % 3)))
    const parts = chunkUnits(many, MAX_CHARS)
    expect(parts.length).toBeGreaterThanOrEqual(2)
    for (const p of parts) expect(p.reduce((n, u) => n + u.length, 0)).toBeLessThanOrEqual(MAX_CHARS)
    expect(parts.flat().join('')).toBe(many.join(''))
  })
  it('切段不许留下比整块盘还长的一段（登泰山记那种形状）', () => {
    // 《登泰山记》全文切出来是 90 句 448 字。按最少段数（5 段）贪心装，最后一段溢出到 101 字 ——
    // 盘面最多 96 格，那一段根本摆不出来。多切一段才装得下。
    const lens = [4, 4, 2, 4, 5, 5, 6, 4, 5, 7, 11, 6, 3, 2, 6, 5, 4, 4, 12, 4, 6, 6, 8, 7, 8, 5, 3, 3, 4, 4, 4, 4, 4, 3, 7, 5, 8, 5, 7, 6, 5, 3, 4, 4, 6, 2, 4, 8, 3, 2, 7, 3, 7, 8, 12, 2, 7, 5, 2, 4, 8, 2, 4, 7, 5, 4, 4, 5, 7, 11, 7, 6, 7, 5, 4, 3, 2, 4, 3, 2, 3, 2, 3, 3, 2, 3, 5, 8, 6, 5]
    const units = lens.map((n) => '字'.repeat(n))
    const parts = chunkUnits(units, MAX_CHARS)
    for (const p of parts) expect(p.reduce((n, u) => n + u.length, 0)).toBeLessThanOrEqual(MAX_CHARS)
    expect(parts.flat().join('')).toBe(units.join(''))
  })
  it('装不下的就是装不下', () => {
    expect(boardFor(8, 97)).toBeFalsy()
    const ok = boardFor(8, 96)
    expect(ok).toBeTruthy()
    expect(ok!.rows).toBeLessThanOrEqual(MAX_ROWS)
    expect(ok!.area).toBeLessThanOrEqual(MAX_AREA)
  })
  it('可用性判定看句数也看字数', () => {
    expect(usability(['abcdefghij', 'klmnopqrst']).ok).toBe(false)
    expect(usability(['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡']).ok).toBe(true)
    expect(usability(['床前明月光', '疑是地上霜', '举头望明月']).ok).toBe(false)
  })
})

describe('盘面生成与校验', () => {
  it('同 seed 生成同一个盘面、同一种摆法', () => {
    const p1 = makePuzzle(SAMPLE, 'lian-selftest', rng)
    const p2 = makePuzzle(SAMPLE, 'lian-selftest', rng)
    expect(p1.cells.map((c) => c.ch).join('')).toBe(p2.cells.map((c) => c.ch).join(''))
    expect(JSON.stringify(p1.placements)).toBe(JSON.stringify(p2.placements))
  })
  it('生成的盘面自己通过校验', () => {
    expect(verifyPuzzle(makePuzzle(SAMPLE, 'lian-selftest', rng), SAMPLE)).toEqual([])
  })
  it('抓到不相邻的摆法', () => {
    const p = makePuzzle(SAMPLE, 'lian-selftest', rng)
    const broken = JSON.parse(JSON.stringify(p))
    broken.placements[0].path = broken.placements[0].path.map((c: number, i: number) => (i === 1 ? (c + 1) % broken.cells.length : c))
    expect(verifyPuzzle(broken, SAMPLE).length).toBeGreaterThan(0)
  })
  it('抓到两句共用同一个格子', () => {
    const p = makePuzzle(SAMPLE, 'lian-selftest', rng)
    const shared = JSON.parse(JSON.stringify(p))
    shared.placements[1].path = shared.placements[0].path.slice()
    expect(verifyPuzzle(shared, SAMPLE).length).toBeGreaterThan(0)
  })
  it('抓到本篇之外的字', () => {
    const p = makePuzzle(SAMPLE, 'lian-selftest', rng)
    const foreign = JSON.parse(JSON.stringify(p))
    foreign.cells[0] = { ch: '龘', unit: -1, k: -1 }
    expect(verifyPuzzle(foreign, SAMPLE).length).toBeGreaterThan(0)
  })
  it('摆不出必须抛 PuzzleError，不能静默给一个坏盘面', () => {
    expect(() => makePuzzle(['字'.repeat(50), '字'.repeat(50), '字'.repeat(2)], 'lian-impossible', rng)).toThrow(PuzzleError)
  })
})
