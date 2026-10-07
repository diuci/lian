// tools/check-puzzle.mjs —— 每一篇、每一段、最近若干天的题，都必须真的连得出来。
//
// 为什么全量而不是抽样：可玩的篇目只有 245 篇，全跑一遍几十秒。
// 抽样会漏掉「只有某一篇摆不出」这种故障，而它恰好是最常见的那种
// ——某篇的句子长短刚好卡进盘面的死角。

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import seedrandom from 'seedrandom'
import { PuzzleError, boardFor, makePuzzle, verifyPuzzle } from '../src/logic/layout.mjs'
import { DAY_MS, dayKey, parseDayKey, puzzleFor } from '../src/logic/daily.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CORPUS = resolve(HERE, '../src/data/corpus.json')

function loadCorpus() {
  try { return JSON.parse(readFileSync(CORPUS, 'utf8')) }
  catch { throw new Error('读不到 ' + CORPUS + '：先跑 node tools/sync-corpus.mjs') }
}

export function run(days = 30) {
  const corpus = loadCorpus()
  const problems = []
  let boards = 0
  const colsHist = {}
  let maxRows = 0
  let maxChars = 0

  for (const piece of corpus.pieces) {
    for (const part of piece.parts) {
      boards++
      const seed = 'lian:check:' + piece.id + ':' + part.index
      let puzzle
      try { puzzle = makePuzzle(part.units, seed, (s) => seedrandom(s)) }
      catch (e) { problems.push(piece.title + ' 第 ' + (part.index + 1) + ' 段摆不出：' + e.message); continue }
      const bad = verifyPuzzle(puzzle, part.units)
      for (const b of bad) problems.push(piece.title + ' 第 ' + (part.index + 1) + ' 段：' + b)
      colsHist[puzzle.cols] = (colsHist[puzzle.cols] || 0) + 1
      maxRows = Math.max(maxRows, puzzle.rows)
      maxChars = Math.max(maxChars, part.chars)
    }
  }

  // 最近 days 天：每天那一题必须生成得出来，且同一天两次生成完全一样
  const today = new Date()
  for (let i = 0; i < days; i++) {
    const day = dayKey(new Date(today.getTime() - i * DAY_MS))
    let first
    try { first = puzzleFor(corpus.pieces, day) }
    catch (e) { problems.push(day + ' 的每日题生成失败：' + e.message); continue }
    const again = puzzleFor(corpus.pieces, day)
    if (first.piece.id !== again.piece.id || first.part !== again.part)
      problems.push(day + ' 两次选篇不一致')
    if (first.puzzle.cells.map((c) => c.ch).join('') !== again.puzzle.cells.map((c) => c.ch).join(''))
      problems.push(day + ' 两次生成的盘面不一样')
  }

  if (problems.length) {
    for (const p of problems.slice(0, 40)) console.error('[!!] ' + p)
    if (problems.length > 40) console.error('    …共 ' + problems.length + ' 条')
    return 1
  }
  console.log('[ok] 盘面体检通过：' + boards + ' 个盘面（' + corpus.pieces.length + ' 篇 / '
    + corpus.contentVersion + '），最大 ' + maxChars + ' 字、最多 ' + maxRows + ' 行')
  console.log('     列数分布：' + Object.entries(colsHist).sort((a, b) => a[0] - b[0])
    .map(([c, n]) => c + ' 列 ' + n).join(' · '))
  console.log('     最近 ' + days + ' 天的每日题都能生成，且可复现')
  return 0
}

function selftest() {
  const cases = []
  const corpus = { contentVersion: 'selftest', pieces: [
    { id: 'good', title: '能玩的', parts: [{ index: 0, units: ['水满田畴稻叶齐', '日光穿树晓烟低', '黄莺也爱新凉好', '飞过青山影里啼'], chars: 28 }] },
    { id: 'bad', title: '摆不出的', parts: [{ index: 0, units: ['字'.repeat(50), '字'.repeat(50), '字'.repeat(2)], chars: 102 }] },
  ] }
  // 坏样本必须被抓到
  let caught = false
  try { makePuzzle(corpus.pieces[1].parts[0].units, 'x', (s) => seedrandom(s)) }
  catch (e) { caught = e instanceof PuzzleError }
  if (!caught) { console.error('[!!] 摆不出的样本没有抛错'); return 1 }
  cases.push('摆不出被抓')
  // 坏盘面必须被 verify 抓到
  const good = makePuzzle(corpus.pieces[0].parts[0].units, 'y', (s) => seedrandom(s))
  const broken = JSON.parse(JSON.stringify(good))
  broken.cells[3] = { ch: '龘', unit: -1, k: -1 }
  if (!verifyPuzzle(broken, corpus.pieces[0].parts[0].units).length) {
    console.error('[!!] 外来字没被抓到'); return 1
  }
  cases.push('外来字被抓')
  // 空快照必须抛错，不能返回一个「看起来没问题」的结果
  try { puzzleFor([], '2026-01-01'); console.error('[!!] 空快照没有抛错'); return 1 }
  catch { cases.push('空快照抛错') }
  // 日期解析：非法输入不能变成 NaN 日期

  if (parseDayKey('2026-13-45') === null && parseDayKey('不是日期') === null) cases.push('非法日期被拒')
  else { console.error('[!!] 非法日期没被拒'); return 1 }
  if (parseDayKey('2026-10-06') === null) { console.error('[!!] 合法日期被误拒'); return 1 }
  console.log('[ok] check-puzzle --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
  return 0
}


const isEntry = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/check-puzzle.mjs')
if (isEntry) {
  const arg = process.argv.find((a) => a.startsWith('--days='))
  process.exitCode = process.argv.includes('--selftest') ? selftest() : run(arg ? Number(arg.split('=')[1]) : 30)
}
