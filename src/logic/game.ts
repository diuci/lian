// 一局游戏的规则与状态。组件只负责画，规则全在这里 —— 这样玩法能被 vitest 直接测。
//
// 两阶段：
//   找句：在盘面上连出一条八向相邻、不重复经过同一格的路径，拼出一句。
//   排句：把找到的句子按原文顺序排好。这一步才是背课文的那一步。

import { computed, ref } from 'vue'
import seedrandom from 'seedrandom'
import { neighbors } from './layout.mjs'
import { makePuzzle, verifyPuzzle } from './layout.mjs'
import { puzzleFor, seedFor } from './daily.mjs'

export type Cell = { ch: string, unit: number, k: number }
export type Puzzle = {
  cols: number
  rows: number
  cells: Cell[]
  answer: { unit: number, text: string }[]
  placements: { unit: number, path: number[] }[]
  decoys: number[]
}
export type Phase = 'find' | 'order' | 'done'

export function buildGame(pieces: any[], day: string) {
  const { piece, part, units, puzzle, seed } = puzzleFor(pieces, day)
  return { piece, part, units, puzzle: puzzle as Puzzle, seed, day }
}

/** 练习模式：指定篇目与段号。日期只影响种子，不影响选哪篇。 */
export function buildPieceGame(pieces: any[], pieceId: string, part: number, day: string) {
  const piece = pieces.find((x) => x.id === pieceId)
  if (!piece) throw new Error('快照里没有这篇：' + pieceId)
  const idx = Math.max(0, Math.min(part, piece.parts.length - 1))
  const units = piece.parts[idx].units
  const seed = seedFor(day, piece.id, idx)
  const puzzle = makePuzzle(units, seed, (x: string) => seedrandom(x)) as Puzzle
  const problems = verifyPuzzle(puzzle, units)
  if (problems.length) throw new Error('盘面不自洽：' + piece.title + ' —— ' + problems[0])
  return { piece, part: idx, units, puzzle, seed, day }
}

export function useGame(pieces: any[], day: string, pick?: { pieceId: string, part?: number }) {
  const built = pick
    ? buildPieceGame(pieces, pick.pieceId, pick.part || 0, day)
    : buildGame(pieces, day)
  const units = built.units
  const puzzle = built.puzzle

  const phase = ref<Phase>('find')
  const path = ref<number[]>([])
  const found = ref<number[]>([])          // 已找到的句序号，按找到的先后
  const mistakes = ref(0)
  const orderAttempts = ref(0)
  const order = ref<number[]>([])
  const startedAt = Date.now()
  const elapsed = ref(0)
  const flash = ref<'ok' | 'mis' | ''>('')
  const lastWrong = ref('')

  const foundSet = computed(() => new Set(found.value))
  const lockedCells = computed(() => {
    const map = new Map<number, number>()
    for (const u of found.value) {
      const p = puzzle.placements.find((x) => x.unit === u)
      if (p) for (const c of p.path) map.set(c, u)
    }
    return map
  })
  const pathSet = computed(() => new Set(path.value))
  const remaining = computed(() => units.length - found.value.length)
  const currentString = computed(() => path.value.map((c) => puzzle.cells[c].ch).join(''))
  const seconds = computed(() => Math.max(0, Math.round((elapsed.value - startedAt) / 1000)))

  function cellOf(i: number) { return puzzle.cells[i] }

  function canExtend(cell: number) {
    if (lockedCells.value.has(cell)) return false
    if (pathSet.value.has(cell)) return false
    if (!path.value.length) return true
    const last = path.value[path.value.length - 1]
    return neighbors(last, puzzle.cols, puzzle.rows).includes(cell)
  }

  /** 点一下：能接就接；点的正是上一格就退一步。 */
  function tap(cell: number) {
    if (phase.value === 'done') return
    if (path.value.length && path.value[path.value.length - 1] === cell) { undo(); return }
    if (!path.value.length) { path.value = [cell]; return }
    if (canExtend(cell)) path.value = [...path.value, cell]
    else flashWith('mis')
  }

  function undo() {
    if (path.value.length) path.value = path.value.slice(0, -1)
  }

  function clearPath() { path.value = [] }

  function flashWith(kind: 'ok' | 'mis') {
    flash.value = kind
    setTimeout(() => { if (flash.value === kind) flash.value = '' }, 420)
  }

  /** 提交当前路径：拼出的必须是还没找到的那一句。 */
  function commit() {
    const text = currentString.value
    if (!path.value.length) return { ok: false, reason: 'empty' }
    const target = units.findIndex((u, i) => u === text && !found.value.includes(i))
    if (target < 0) {
      mistakes.value++
      lastWrong.value = text
      flashWith('mis')
      path.value = []
      return { ok: false, reason: 'wrong' }
    }
    found.value = [...found.value, target]
    path.value = []
    flashWith('ok')
    if (found.value.length === units.length) {
      phase.value = 'order'
      order.value = found.value.slice()
    }
    return { ok: true, unit: target }
  }

  function swap(i: number, j: number) {
    if (phase.value === 'done') return
    if (i === j || i < 0 || j < 0) return
    const next = order.value.slice()
    const t = next[i]
    next[i] = next[j]
    next[j] = t
    order.value = next
  }

  function move(i: number, to: number) {
    if (phase.value === 'done') return
    const next = order.value.slice()
    const [x] = next.splice(i, 1)
    next.splice(Math.max(0, Math.min(to, next.length)), 0, x)
    order.value = next
  }

  /** 核对顺序：这一步不惩罚试错，试错次数只进统计。 */
  function checkOrder() {
    if (phase.value !== 'order') return false
    orderAttempts.value++
    const right = order.value.length === units.length
      && order.value.every((u, i) => u === i)
    if (right) {
      phase.value = 'done'
      elapsed.value = Date.now()
      return true
    }
    flashWith('mis')
    return false
  }

  /** 答案路径：CI 冒烟用它把当天这题真的通关一遍，证明题是能通的。 */
  function solutionPaths() {
    return puzzle.placements.map((p) => p.path)
  }

  function selfVerify() {
    return verifyPuzzle(puzzle, units)
  }

  return {
    piece: built.piece,
    part: built.part,
    day: built.day,
    seed: built.seed,
    units,
    puzzle,
    phase, path, found, mistakes, orderAttempts, order, seconds, flash, lastWrong,
    foundSet, lockedCells, pathSet, remaining, currentString,
    cellOf, canExtend, tap, undo, clearPath, commit, swap, move, checkOrder,
    solutionPaths, selfVerify,
  }
}
