import { describe, expect, it } from 'vitest'
import seedrandom from 'seedrandom'
import { makePuzzle, verifyPuzzle } from '../src/logic/layout.mjs'
import { dayKey, parseDayKey, pickDaily, puzzleFor } from '../src/logic/daily.mjs'
import { buildGame, buildPieceGame, useGame } from '../src/logic/game'

const corpus = {
  contentVersion: 'test',
  pieces: [
    { id: 'xinliang', title: '新凉', author: '徐玑', dynasty: '宋', stage: '小学', grade: 5, volume: '五年级下册',
      parts: [{ index: 0, chars: 28, units: ['水满田畴稻叶齐', '日光穿树晓烟低', '黄莺也爱新凉好', '飞过青山影里啼'] }] },
    { id: 'yueyang', title: '岳阳楼记', author: '范仲淹', dynasty: '宋', stage: '初中', grade: 8, volume: '九年级上册',
      parts: [{ index: 0, chars: 48, units: ['先天下之忧而忧', '后天下之乐而乐', '不以物喜', '不以己悲', '政通人和', '百废具兴'] }] },
  ],
}

describe('盘面', () => {
  it('每篇都能生成，且生成出来就自洽', () => {
    for (const piece of corpus.pieces) {
      for (const part of piece.parts) {
        const p = makePuzzle(part.units, 't:' + piece.id, (s) => seedrandom(s))
        expect(verifyPuzzle(p, part.units)).toEqual([])
      }
    }
  })
  it('同 seed 同盘面', () => {
    const u = corpus.pieces[1].parts[0].units
    const a = makePuzzle(u, 'same', (s) => seedrandom(s))
    const b = makePuzzle(u, 'same', (s) => seedrandom(s))
    expect(a.cells.map((c) => c.ch).join('')).toBe(b.cells.map((c) => c.ch).join(''))
  })
})

describe('每日题', () => {
  it('同一天两次选篇一致', () => {
    const a = pickDaily(corpus.pieces, '2026-10-06')
    const b = pickDaily(corpus.pieces, '2026-10-06')
    expect(a.piece.id).toBe(b.piece.id)
    expect(a.part).toBe(b.part)
  })
  it('不同天大概率不同篇', () => {
    const days = new Set<string>()
    for (let i = 0; i < 12; i++) days.add(pickDaily(corpus.pieces, '2026-10-' + String(i + 1).padStart(2, '0')).piece.id)
    expect(days.size).toBeGreaterThan(1)
  })
  it('非法日期不能变成 NaN 日期', () => {
    expect(parseDayKey('2026-13-45')).toBeNull()
    expect(parseDayKey('2026-02-30')).toBeNull()
    expect(parseDayKey('x')).toBeNull()
    expect(parseDayKey('2026-10-06')).not.toBeNull()
  })
  it('dayKey 用本地日期', () => {
    expect(dayKey(new Date(2026, 9, 6))).toBe('2026-10-06')
  })
})

describe('玩法', () => {
  it('按答案路径逐句连，能一路连到排序阶段', () => {
    const g = useGame(corpus.pieces, '2026-10-06', { pieceId: 'yueyang', part: 0 })
    for (const path of g.solutionPaths()) {
      for (const cell of path) g.tap(cell)
      g.commit()
    }
    expect(g.found.value.length).toBe(g.units.length)
    expect(g.phase.value).toBe('order')
  })
  it('连错了计一次，不会把句子算成找到', () => {
    const g = useGame(corpus.pieces, '2026-10-06', { pieceId: 'yueyang', part: 0 })
    // 走一条明显不是任何句的路径：取盘面前三格，拼出来大概率不是句
    const cells = [0, 1, 2]
    for (const c of cells) g.tap(c)
    const text = g.currentString.value
    if (!g.units.includes(text)) {
      g.commit()
      expect(g.mistakes.value).toBe(1)
      expect(g.found.value.length).toBe(0)
    }
  })
  it('不相邻的格子接不上', () => {
    const g = useGame(corpus.pieces, '2026-10-06', { pieceId: 'yueyang', part: 0 })
    g.tap(0)
    const far = g.puzzle.cells.length - 1
    if (far !== 0 && !g.canExtend(far)) { g.tap(far); expect(g.path.value.length).toBe(1) }
  })
  it('排序正确才算完成', () => {
    const g = useGame(corpus.pieces, '2026-10-06', { pieceId: 'yueyang', part: 0 })
    for (const path of g.solutionPaths()) { for (const c of path) g.tap(c); g.commit() }
    g.order.value = g.units.map((_, i) => i).reverse()
    expect(g.checkOrder()).toBe(false)
    expect(g.phase.value).toBe('order')
    g.order.value = g.units.map((_, i) => i)
    expect(g.checkOrder()).toBe(true)
    expect(g.phase.value).toBe('done')
  })
  it('已连出的句子占的格子不能再被踩', () => {
    const g = useGame(corpus.pieces, '2026-10-06', { pieceId: 'yueyang', part: 0 })
    const first = g.solutionPaths()[0]
    for (const c of first) g.tap(c)
    g.commit()
    for (const c of first) expect(g.lockedCells.value.has(c)).toBe(true)
  })
  it('练习模式选指定篇目，盘面照样自洽', () => {
    const built = buildPieceGame(corpus.pieces, 'xinliang', 0, '2026-10-06')
    expect(built.piece.id).toBe('xinliang')
    expect(verifyPuzzle(built.puzzle, built.units)).toEqual([])
    expect(() => buildPieceGame(corpus.pieces, '不存在', 0, '2026-10-06')).toThrow()
  })
  it('每日题生成出来必须自洽（buildGame 内部已校验）', () => {
    const g = buildGame(corpus, '2026-10-06')
    expect(verifyPuzzle(g.puzzle, g.units)).toEqual([])
    expect(() => puzzleFor([], '2026-10-06')).toThrow()
  })
  it('冻在记录里的日子，回放必须是记录里那一篇那一段', () => {
    const withHistory = {
      ...corpus,
      history: {
        since: '2026-10-06', through: '2026-10-06',
        days: [{ day: '2026-10-06', id: 'yueyang', part: 0 }],
        pieces: { yueyang: corpus.pieces[1] },
      },
    }
    const g = buildGame(withHistory, '2026-10-06')
    expect(g.piece.id).toBe('yueyang')
    expect(g.units).toEqual(corpus.pieces[1].parts[0].units)
  })
})
