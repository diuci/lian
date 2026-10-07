// tools/sync-corpus.mjs —— 从内容仓快照课文数据到本站。
//
// 为什么是快照不是直连：内容仓是唯一的真源，本站必须能离线构建，
// 而且线上玩到的每一篇都要能说出「它是哪个版本、凭什么说它是公有领域」。
// 所以快照里带 contentVersion、来源文件的 sha256、每篇的 authorDied / authorEraEnd。
//
// 用法：
//   node tools/sync-corpus.mjs           重新快照并写入
//   node tools/sync-corpus.mjs --check   只比对，不写；漂移就失败
//   node tools/sync-corpus.mjs --selftest 用假数据证明过滤逻辑真的会拒

import { createHash } from 'node:crypto'
import { readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chunkUnits, splitUnits, usability } from '../src/logic/layout.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CONTENT_ROOT = process.env.CONTENT_ROOT || resolve(ROOT, '../k12-chinese-poetry')
const SOURCE = resolve(CONTENT_ROOT, 'data/poems.json')
const OUT_CORPUS = resolve(ROOT, 'src/data/corpus.json')
const OUT_LEGACY = resolve(ROOT, 'src/data/corpus-snapshot.json')

function readSource() {
  let raw
  try { raw = readFileSync(SOURCE) }
  catch { throw new Error('读不到内容仓数据：' + SOURCE + '（设 CONTENT_ROOT 指向内容仓）') }
  const data = JSON.parse(raw.toString('utf8'))
  if (!Array.isArray(data.poems)) throw new Error('内容仓数据里没有 poems 数组')
  return { data, sha256: createHash('sha256').update(raw).digest('hex') }
}

/** 一篇 → 可玩的段；不可玩给出原因，不静默丢掉。 */
export function buildPiece(poem) {
  const lines = Array.isArray(poem.linesPunct) && poem.linesPunct.length ? poem.linesPunct : (poem.lines || [])
  if (!lines.length) return { ok: false, reason: '没有原文行', parts: [] }
  const units = splitUnits(lines)
  const whole = usability(units)
  if (!whole.ok) return { ok: false, reason: whole.reason, parts: [] }
  const parts = chunkUnits(units).map((u, i) => {
    const u2 = usability(u)
    return { index: i, units: u, chars: u2.chars, ok: u2.ok, reason: u2.reason }
  })
  const usable = parts.filter((p) => p.ok)
  if (!usable.length) return { ok: false, reason: '每一段都不够玩', parts }
  return {
    ok: true,
    reason: '',
    parts: usable.map((p) => ({ index: p.index, units: p.units, chars: p.chars })),
    totalUnits: units.length,
    totalChars: whole.chars,
  }
}

export function buildSnapshot() {
  const { data, sha256 } = readSource()
  const pieces = []
  const skipped = []
  for (const poem of data.poems) {
    const built = buildPiece(poem)
    if (!built.ok) { skipped.push({ id: poem.id, title: poem.title, reason: built.reason }); continue }
    pieces.push({
      id: poem.id,
      title: poem.title,
      subtitle: poem.subtitle || '',
      author: poem.author,
      dynasty: poem.dynasty,
      stage: poem.stage,
      grade: poem.grade,
      volume: poem.volume,
      form: poem.form,
      // 公有领域证据：跟着数据一起发布，不只在内容仓里
      authorDied: poem.authorDied ?? null,
      authorEraEnd: poem.authorEraEnd ?? null,
      license: poem.license,
      tags: poem.tags || [],
      parts: built.parts,
      totalUnits: built.totalUnits,
      totalChars: built.totalChars,
    })
  }
  pieces.sort((a, b) => a.stage.localeCompare(b.stage, 'zh')
    || Number(a.grade) - Number(b.grade)
    || String(a.volume).localeCompare(String(b.volume), 'zh')
    || a.title.localeCompare(b.title, 'zh'))
  const skippedSorted = skipped.slice().sort((a, b) => a.id.localeCompare(b.id))
  // 摘要内联进同一个文件：跳过了哪几篇、为什么，和篇目本身放在一起。
  // 之前另写一份 corpus-snapshot.json，两处版本号有可能对不上，等于多一个会自己说谎的文件。
  return {
    contentVersion: data.contentVersion,
    sourceSha256: sha256,
    count: pieces.length,
    sourceTotal: data.poems.length,
    skipped: skippedSorted,
    stages: pieces.reduce((m, p) => { m[p.stage] = (m[p.stage] || 0) + 1; return m }, {}),
    pieces,
  }
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

function check() {
  const corpus = buildSnapshot()
  let existing
  try { existing = JSON.parse(readFileSync(OUT_CORPUS, 'utf8')) }
  catch { console.error('[!!] 缺 ' + OUT_CORPUS + '：先跑 node tools/sync-corpus.mjs'); return 1 }
  const problems = []
  if (existing.contentVersion !== corpus.contentVersion)
    problems.push('contentVersion 漂移：快照 ' + existing.contentVersion + '，内容仓 ' + corpus.contentVersion)
  if (existing.sourceSha256 !== corpus.sourceSha256)
    problems.push('来源文件 sha256 漂移：内容仓 poems.json 变了但快照没重跑')
  if (!same(existing.pieces, corpus.pieces)) problems.push('篇目内容与内容仓不一致')
  if (!same(existing.skipped, corpus.skipped)) problems.push('跳过清单与重新生成结果不一致')
  if (problems.length) {
    for (const p of problems) console.error('[!!] ' + p)
    console.error('    跑 node tools/sync-corpus.mjs 重新快照')
    return 1
  }
  console.log('[ok] 课文快照与内容仓一致：' + corpus.count + ' 篇可玩 / 内容仓 '
    + corpus.sourceTotal + ' 篇（跳过 ' + corpus.skipped.length + '），contentVersion ' + corpus.contentVersion)
  return 0
}

function selftest() {
  const cases = []
  const add = (name, fn) => { const r = fn(); if (r !== true) { console.error('[!!] ' + r); process.exitCode = 1; return } cases.push(name) }

  add('太短被拒', () => {
    const r = buildPiece({ id: 'x', title: '短', linesPunct: ['床前明月光。'] })
    return r.ok ? '一句本该被拒' : true
  })
  add('没有原文被拒', () => {
    const r = buildPiece({ id: 'y', title: '空', linesPunct: [] })
    return r.ok ? '没有原文本该被拒' : true
  })
  add('三句可玩', () => {
    const r = buildPiece({ id: 'z', title: '可玩', linesPunct: ['床前明月光，疑是地上霜。', '举头望明月，低头思故乡。'] })
    return r.ok && r.parts.length === 1 && r.totalUnits === 4 ? true : '可玩篇目被判不可玩：' + JSON.stringify(r)
  })
  add('超长切段', () => {
    const line = Array.from({ length: 24 }, (_, i) => '之'.repeat(5)).join('，') + '。'
    const r = buildPiece({ id: 'long', title: '长', linesPunct: [line] })
    if (!r.ok) return '超长篇本该可玩：' + r.reason
    if (r.parts.length < 2) return '没切段'
    if (r.parts.some((p) => p.chars > 96)) return '有一段超过 96 字'
    const flat = r.parts.flatMap((p) => p.units).join('')
    return flat.length === r.totalChars ? true : '切段后字数对不上'
  })
  add('半角标点也拆', () => {
    const r = buildPiece({ id: 'p', title: '标点', linesPunct: ['a,b,c,d,e,f,g,h,i,j,k,l'.replace(/[a-z]/g, '字')] })
    return r.ok ? '全是单字本该被拒' : true
  })
  console.log('[ok] sync-corpus --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
  return process.exitCode || 0
}

const isEntry = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/sync-corpus.mjs')
if (isEntry) {
  if (process.argv.includes('--selftest')) process.exitCode = selftest()
  else if (process.argv.includes('--check')) process.exitCode = check()
  else {
    const corpus = buildSnapshot()
    mkdirSync(dirname(OUT_CORPUS), { recursive: true })
    writeFileSync(OUT_CORPUS, JSON.stringify(corpus) + '\n', 'utf8')
    // 旧的摘要文件如果还在，删掉：留着它，下一个读它的人不知道该信哪个
    try { unlinkSync(OUT_LEGACY) } catch {}
    console.log('[ok] 已快照 ' + corpus.count + ' 篇 / 内容仓 ' + corpus.sourceTotal + ' 篇（跳过 '
      + corpus.skipped.length + '），contentVersion ' + corpus.contentVersion)
    console.log('     ' + Object.entries(corpus.stages).map(([k, v]) => k + ' ' + v).join(' · '))
    process.exitCode = 0
  }
}
