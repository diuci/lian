// 连词成句：盘面生成器。客户端与 tools/ 共用这一份，不各写一份。
//
// 为什么共用：每日题在浏览器里生成一次，CI 必须能复现同一盘面。
// 两边各写一份，迟早一份能过检查、另一份在线上生成出连不出的题。
//
// 规则（与玩法规则一一对应，改这里等于改玩法）：
//   1. 一篇课文按标点拆成「句」，单字并入相邻句；
//   2. 盘面是 cols × rows 的方格：列数按 [6,7,5,8,4] 试，行数 ≤ 12，格子总数 ≤ 96；
//   3. 每句占一条不自交的路径，八向相邻（含斜角），同一格不得被两句共用；
//   4. 摆法：先在盘面上找一条随机哈密顿路径（每格恰好经过一次），
//      把句子按随机次序沿这条路径铺开 —— 这样任何长短组合都保证铺得满；
//      找不到随机路径就退回蛇形路径（蛇形对任何矩形都存在），绝不静默给出坏盘面；
//   5. 装不满的格子填本篇出现过的字作干扰块，空洞不足一整行；
//   6. 同一个 seed 必须生成同一个盘面：每日题要能复现、能校验、能分享。

import seedrandom from 'seedrandom'

export const COLS_LADDER = [6, 7, 5, 8, 4]
export const MAX_ROWS = 12
export const MAX_AREA = 96
export const MAX_CHARS = 96
export const MIN_UNITS = 3
// 20 改 18：《咏鹅》正文 18 字（鹅鹅鹅／曲项向天歌／白毛浮绿水／红掌拨清波），
// 一年级必背篇目，6×3 的盘恰好铺满。卡在 20 字等于把这篇挡在门外，
// 而它玩起来一点都不比 20 字的篇目差。
export const MIN_CHARS = 18
export const MAX_ATTEMPTS = 40
export const DFS_BUDGET = 40000

// 拆句用的标点集：中文全角为主，半角一并容错。
export const PUNCT = /[，。；？！、：;!?“”‘’「」『』《》〈〉（）()【】[\]·—…\s]+/
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export class PuzzleError extends Error {}

/** 一篇课文 → 句块列表（保持原文顺序，重复句保留）。 */
export function splitUnits(lines) {
  const out = []
  for (const raw of lines) {
    for (const piece of String(raw).split(PUNCT)) {
      const cleaned = [...piece].filter((c) => HAN.test(c)).join('')
      if (!cleaned) continue
      // 单字不配成为一块：并进前一句
      if (cleaned.length === 1 && out.length) out[out.length - 1] += cleaned
      else out.push(cleaned)
    }
  }
  // 首句就是单字：并进第二句
  if (out.length > 1 && out[0].length === 1) {
    out[1] = out[0] + out[1]
    out.shift()
  }
  return out
}

/** 这篇能不能玩：至少 3 句、至少 20 字，且没有单字块。 */
export function usability(units) {
  const chars = units.reduce((n, u) => n + u.length, 0)
  if (units.length < MIN_UNITS) return { ok: false, reason: '句数不足 ' + MIN_UNITS, units, chars }
  if (chars < MIN_CHARS) return { ok: false, reason: '字数不足 ' + MIN_CHARS, units, chars }
  if (units.some((u) => u.length < 2)) return { ok: false, reason: '有单字句块', units, chars }
  return { ok: true, reason: '', units, chars }
}

/**
 * 超过盘面容量的篇目按句边界切段。
 * 先算最少段数，再按目标长度贪心装：切在句边界上，绝不把一句劈开。
 */
export function chunkUnits(units, maxChars = MAX_CHARS) {
  const total = units.reduce((n, u) => n + u.length, 0)
  if (total <= maxChars) return [units.slice()]
  // 段数只能往多了试，不能定死：定死成 ceil(总字数 / 容量) 时，贪心装到最后一句
  // 会溢出（《登泰山记》全文 448 字按 5 段切，最后一段 101 字 > 96），
  // 而溢出的一段在盘面上根本摆不出来。多切一段就装得下了。
  for (let parts = Math.ceil(total / maxChars); parts <= units.length; parts++) {
    const target = Math.ceil(total / parts)
    const out = [[]]
    let len = 0
    for (const u of units) {
      if (len && len + u.length > target && out.length < parts) {
        out.push([])
        len = 0
      }
      out[out.length - 1].push(u)
      len += u.length
    }
    const segs = out.filter((p) => p.length)
    const worst = Math.max(...segs.map((s) => s.reduce((n, u) => n + u.length, 0)))
    if (worst <= maxChars) return segs
  }
  // 走到这里说明某一句本身就比整块盘还长：句子不许劈开，那就没法玩，照实返回
  return [units.slice()]
}

export function neighbors(cell, cols, rows) {
  const r = Math.floor(cell / cols)
  const c = cell % cols
  const out = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      out.push(nr * cols + nc)
    }
  }
  return out
}

/** 给定列数与字数，行数取刚好装得下的最小值；装不下返回 null。 */
export function boardFor(cols, chars) {
  const rows = Math.ceil(chars / cols)
  if (rows < 2 || rows > MAX_ROWS) return null
  const area = cols * rows
  if (area > MAX_AREA) return null
  if (area - chars >= cols) return null // 空洞不能达到一整行
  return { cols, rows, area }
}

function degree(cell, cols, rows, visited) {
  let n = 0
  for (const nb of neighbors(cell, cols, rows)) if (!visited.has(nb)) n++
  return n
}

/**
 * 随机哈密顿路径：从随机起点出发，Warnsdorff 启发（先走出口最少的格子）+ 回溯。
 * 八向相邻让这条路在矩形网格上几乎总能找到；找不到就返回 null 交给蛇形兜底。
 */
export function hamiltonianPath(cols, rows, rng, budget = DFS_BUDGET) {
  const total = cols * rows
  const visited = new Set()
  const path = []
  let steps = 0
  const dfs = (cell) => {
    if (steps++ > budget) return false
    path.push(cell)
    visited.add(cell)
    if (path.length === total) return true
    const opts = neighbors(cell, cols, rows).filter((n) => !visited.has(n))
    opts.sort((a, b) => (degree(a, cols, rows, visited) - degree(b, cols, rows, visited)) + (rng() - 0.5) * 2)
    for (const n of opts) if (dfs(n)) return true
    path.pop()
    visited.delete(cell)
    return false
  }
  const starts = shuffle([...Array(total).keys()], rng)
  for (const s of starts) {
    if (dfs(s)) return path
    path.length = 0
    visited.clear()
    if (steps > budget * 3) break
  }
  return null
}

/** 蛇形路径：对任何 cols × rows 都存在，是随机路径失败时的兜底。 */
export function serpentinePath(cols, rows, rng) {
  const vertical = rng() < 0.35
  const flip = rng() < 0.5
  const path = []
  if (!vertical) {
    for (let r = 0; r < rows; r++) {
      const cells = []
      for (let c = 0; c < cols; c++) cells.push(r * cols + c)
      const back = (r + (flip ? 1 : 0)) % 2 === 1
      path.push(...(back ? cells.reverse() : cells))
    }
    return path
  }
  for (let c = 0; c < cols; c++) {
    const cells = []
    for (let r = 0; r < rows; r++) cells.push(r * cols + c)
    const back = (c + (flip ? 1 : 0)) % 2 === 1
    path.push(...(back ? cells.reverse() : cells))
  }
  return path
}

export function shuffle(arr, rng) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

/**
 * 生成一个盘面。seed 相同 → 盘面相同。
 * 摆不出抛 PuzzleError，不静默降级。
 */
export function makePuzzle(units, seed, rngFactory = (s) => seedrandom(s)) {
  const chars = units.reduce((n, u) => n + u.length, 0)
  const rng = rngFactory(seed)
  for (const cols of COLS_LADDER) {
    const board = boardFor(cols, chars)
    if (!board) continue
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const path = hamiltonianPath(board.cols, board.rows, rng) || serpentinePath(board.cols, board.rows, rng)
      const built = layAlong(path, units, board, rng)
      if (built) {
        const problems = verifyPuzzle(built, units)
        if (!problems.length) return built
      }
    }
  }
  throw new PuzzleError('摆不出盘面：' + chars + ' 字 / ' + units.length + ' 句')
}

/** 沿路径铺开：句子按随机次序上盘，空格填本篇的字作干扰块。 */
function layAlong(path, units, board, rng) {
  const area = board.cols * board.rows
  const chars = units.reduce((n, u) => n + u.length, 0)
  const holes = area - chars
  if (holes < 0 || holes >= board.cols) return null
  const order = shuffle(units.map((_, i) => i), rng)
  // 干扰块插在句子之间的缝隙里，不插进句子中间
  const gaps = shuffle(order.map((_, i) => i), rng).slice(0, holes)
  const cells = new Array(area)
  const placements = []
  const pool = [...units.join('')]
  let p = 0
  order.forEach((unitIndex, position) => {
    const text = units[unitIndex]
    const cellsOfUnit = []
    for (let k = 0; k < text.length; k++) {
      const cell = path[p++]
      if (cell === undefined) return null
      cells[cell] = { ch: text[k], unit: unitIndex, k }
      cellsOfUnit.push(cell)
    }
    placements.push({ unit: unitIndex, path: cellsOfUnit })
    if (gaps.includes(position)) {
      const cell = path[p++]
      if (cell === undefined) return null
      cells[cell] = { ch: pool[Math.floor(rng() * pool.length)], unit: -1, k: -1 }
    }
  })
  if (p !== area) return null
  return {
    cols: board.cols,
    rows: board.rows,
    cells,
    // 答案顺序 = 原文顺序；上盘顺序是打乱的，这是玩法的一部分
    answer: units.map((u, i) => ({ unit: i, text: u })),
    placements,
    decoys: cells.map((c, i) => (c.unit === -1 ? i : -1)).filter((i) => i >= 0),
  }
}

/** 校验一个盘面是否真的可玩：每句都有一条连续的八向路径，格子不重复。 */
export function verifyPuzzle(puzzle, units) {
  const problems = []
  const seen = new Set()
  for (const p of puzzle.placements) {
    if (p.unit < 0 || p.unit >= units.length) { problems.push('摆法引用了不存在的句 ' + p.unit); continue }
    if (p.path.length !== units[p.unit].length) problems.push('第 ' + p.unit + ' 句长度不符')
    for (let i = 1; i < p.path.length; i++) {
      if (!neighbors(p.path[i - 1], puzzle.cols, puzzle.rows).includes(p.path[i]))
        problems.push('第 ' + p.unit + ' 句在 ' + p.path[i - 1] + '→' + p.path[i] + ' 处不相邻')
    }
    for (const c of p.path) {
      if (seen.has(c)) problems.push('格子 ' + c + ' 被两句共用')
      seen.add(c)
    }
  }
  const chars = units.reduce((n, u) => n + u.length, 0)
  if (puzzle.cells.length > MAX_AREA) problems.push('盘面超过 ' + MAX_AREA + ' 格')
  if (puzzle.rows > MAX_ROWS) problems.push('行数超过 ' + MAX_ROWS)
  if (puzzle.cells.length - chars >= puzzle.cols) problems.push('空洞达到一整行')
  // 盘面上的字必须都来自本篇：不往盘面上放本篇没有的字
  const allowed = new Set([...units.join('')])
  puzzle.cells.forEach((c, i) => { if (!allowed.has(c.ch)) problems.push('格子 ' + i + ' 出现了本篇之外的字 ' + c.ch) })
  // 每句的字必须真的落在它那条路径上
  for (const p of puzzle.placements) {
    if (p.unit < 0) continue
    p.path.forEach((cell, k) => {
      if (puzzle.cells[cell].ch !== units[p.unit][k]) problems.push('第 ' + p.unit + ' 句第 ' + k + ' 字与盘面不符')
    })
  }
  return problems
}
