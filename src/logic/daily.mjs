// 每日题的选篇与种子。客户端与 tools/ 共用这一份。
//
// 规则：同一天永远同一篇、同一段；日期可回放（?d=YYYY-MM-DD）。
// 选篇不排难度、不排重：rng 由日期决定，人不能挑，挑了就不是「今天这一题」。
//
// 已经发出去的日子记在 data/daily-history.json 里，回放一律按那份记录走。
// 为什么必须记下来：选篇是「日期 → 词库里的第几篇」，词库一变（内容仓补了篇目、
// 改了顺序、改了正文），同一天的题就跟着变。玩家上周玩过的那一题，这周回放变成另一篇，
// 那不叫回放，那叫换题。所以过去的日子钉死在记录里，只有还没玩过的日子跟着词库走。

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

/** 这一天冻在记录里吗？冻着就必须按记录的那一篇那一段出，不许重新摇。 */
export function frozenFor(source, day) {
  const h = source && !Array.isArray(source) ? source.history : null
  if (!h || !Array.isArray(h.days)) return null
  const hit = h.days.find((x) => x.day === day)
  if (!hit) return null
  const piece = (h.pieces || {})[hit.id]
  if (!piece) throw new PuzzleError(day + ' 冻在记录里，指向「' + hit.id + '」，可记录里没有这篇的正文')
  if (!Array.isArray(piece.parts) || !piece.parts.length) throw new PuzzleError(day + ' 冻的那一篇（' + piece.title + '）没有段')
  const part = Math.min(hit.part, piece.parts.length - 1)
  return { piece, part }
}

/** 一个可玩的题面：选篇 + 生成 + 自检。CI 与客户端走同一条路。 */
export function puzzleFor(source, day) {
  const pieces = Array.isArray(source) ? source : (source && source.pieces)
  if (!pieces || !pieces.length) throw new PuzzleError('课文快照是空的')
  const frozen = frozenFor(source, day)
  const { piece, part } = frozen || pickDaily(pieces, day)
  const units = piece.parts[part].units
  const seed = seedFor(day, piece.id, part)
  const puzzle = makePuzzle(units, seed, (s) => seedrandom(s))
  const problems = verifyPuzzle(puzzle, units)
  if (problems.length) throw new PuzzleError('盘面不自洽：' + piece.title + ' —— ' + problems[0])
  return { piece, part, units, puzzle, seed, frozen: !!frozen }
}

export { COLS_LADDER, MAX_AREA, MAX_CHARS, MAX_ROWS, boardFor, chunkUnits, splitUnits, usability }
