// 每日题的选篇与种子。客户端与 tools/ 共用这一份。
//
// 规则：同一天永远同一篇、同一段；日期可回放（?d=YYYY-MM-DD）。
// 选篇不排难度、不排重：rng 由日期决定，人不能挑，挑了就不是「今天这一题」。

import seedrandom from 'seedrandom'
import { COLS_LADDER, MAX_AREA, MAX_CHARS, MAX_ROWS, PuzzleError, boardFor, chunkUnits, makePuzzle, splitUnits, usability, verifyPuzzle } from './layout.mjs'

export const DAY_MS = 86400000

/** 本地日期 → YYYY-MM-DD。用本地时区：「今天这一题」按玩家所在的日子算。 */
export function dayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

export function parseDayKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const day = Number(m[3])
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null
  const dt = new Date(y, mo - 1, day)
  // 2026-02-30 这种日期 new Date 会滚到 3 月 2 日：滚了就是非法输入
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== day) return null
  return dt
}
export function seedFor(day, pieceId, part) {
  return 'lian:' + day + ':' + pieceId + ':' + part
}

/** 当天玩哪一篇哪一段：完全由日期决定。 */
export function pickDaily(pieces, day) {
  if (!pieces.length) throw new PuzzleError('课文快照是空的')
  const rng = seedrandom('lian-daily:' + day)
  const piece = pieces[Math.floor(rng() * pieces.length)]
  const part = Math.floor(rng() * piece.parts.length)
  return { piece, part: Math.min(part, piece.parts.length - 1), day }
}

/** 一个可玩的题面：选篇 + 生成 + 自检。CI 与客户端走同一条路。 */
export function puzzleFor(pieces, day) {
  const { piece, part } = pickDaily(pieces, day)
  const units = piece.parts[part].units
  const seed = seedFor(day, piece.id, part)
  const puzzle = makePuzzle(units, seed, (s) => seedrandom(s))
  const problems = verifyPuzzle(puzzle, units)
  if (problems.length) throw new PuzzleError('盘面不自洽：' + piece.title + ' —— ' + problems[0])
  return { piece, part, units, puzzle, seed }
}

export { COLS_LADDER, MAX_AREA, MAX_CHARS, MAX_ROWS, boardFor, chunkUnits, splitUnits, usability }
