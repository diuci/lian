// tools/sync-corpus.mjs —— 从内容仓快照课文数据到本站。
//
// 为什么是快照不是直连：内容仓是唯一的真源，本站必须能离线构建，
// 而且线上玩到的每一篇都要能说出「它是哪个版本、凭什么说它是公有领域」。
// 所以快照里带 contentVersion、来源文件的 sha256、每篇的 authorDied / authorEraEnd。
//
// 用法：
//   node tools/sync-corpus.mjs           重新快照并写入（先把已发出的日子冻进 history）
//   node tools/sync-corpus.mjs --check   只比对，不写；漂移就失败
//   node tools/sync-corpus.mjs --selftest 用假数据证明过滤逻辑真的会拒

import { createHash } from 'node:crypto'
import { readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_CHARS, chunkUnits, splitUnits, usability } from '../src/logic/layout.mjs'
import { DAY_MS, dayKey, pickDaily } from '../src/logic/daily.mjs'

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

/**
 * 这一篇玩的是哪一份正文。口径跟着内容仓的 recite（教材的背诵要求），不自作主张：
 *   recite=full   → 教材要求背诵全文，玩的就是全文（fullLinesPunct）；
 *   recite=section/line/none → 教材只要求背段落或名句，玩的是必背单元（linesPunct）。
 * 之前一律玩 linesPunct：醉翁亭记、将进酒、蜀道难这些写着「背全文」的篇目，
 * 在站上只连得出 44 字的名句——那是把「背全文」悄悄缩成「背两句」。
 */
export function textLinesFor(poem) {
  const full = (Array.isArray(poem.fullLinesPunct) ? poem.fullLinesPunct : []).filter((x) => String(x || '').trim())
  const mingju = Array.isArray(poem.linesPunct) && poem.linesPunct.length ? poem.linesPunct : (poem.lines || [])
  if (poem.recite === 'full' && full.length) return { lines: full, source: 'full' }
  return { lines: mingju, source: 'mingju' }
}

/** 一篇 → 可玩的段；不可玩给出原因，不静默丢掉。 */
export function buildPiece(poem) {
  const picked = textLinesFor(poem)
  const lines = picked.lines
  if (!lines.length) return { ok: false, reason: '没有原文行', parts: [], textSource: picked.source }
  const units = splitUnits(lines)
  const whole = usability(units)
  if (!whole.ok) return { ok: false, reason: whole.reason + '（' + picked.source + ' ' + whole.chars + ' 字）', parts: [], textSource: picked.source, playedChars: whole.chars }
  const parts = chunkUnits(units).map((u, i) => {
    const u2 = usability(u)
    // 切完还得再卡一次盘面容量：贪心切段可能留下一段比整块盘还长
    const fits = u2.ok && u2.chars <= MAX_CHARS
    return { index: i, units: u, chars: u2.chars, ok: fits, reason: fits ? u2.reason : '这一段 ' + u2.chars + ' 字，超过盘面容量 ' + MAX_CHARS }
  })
  const usable = parts.filter((p) => p.ok)
  if (!usable.length) return { ok: false, reason: '每一段都不够玩', parts, textSource: picked.source }
  return {
    ok: true,
    reason: '',
    textSource: picked.source,
    playedChars: whole.chars,
    parts: usable.map((p) => ({ index: p.index, units: p.units, chars: p.chars })),
    totalUnits: units.length,
    totalChars: whole.chars,
  }
}

export function buildSnapshot() {
  const { data, sha256 } = readSource()
  const pieces = []
  const skipped = []
  const skippedNote = []
  for (const poem of data.poems) {
    const built = buildPiece(poem)
    if (!built.ok) { skipped.push({ id: poem.id, title: poem.title, reason: built.reason }); continue }
    // 只有「仓内另有更长的正文、而本站玩的是短的那份」才算范围偏窄。
    // 小学那些短篇没有全文小节，linesPunct 本身就是全文——把它们列进这份清单，
    // 等于对着读者喊「这里少了」，其实一个字没少。
    const avail = [built.linesChars || 0,
      (poem.fullLinesPunct || []).reduce((n, x) => n + [...String(x || '')].filter((c) => /[\\u3400-\\u9fff]/.test(c)).length, 0)]
    if (poem.recite === 'full' && built.ok && built.playedChars < Math.max(...avail))
      skippedNote.push({ id: poem.id, title: poem.title, reason: '教材要求背诵全文，本站只连得出 ' + built.playedChars + ' 字（仓内另有 ' + Math.max(...avail) + ' 字）' })
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
      // 玩的是全文还是必背单元，跟着每篇写清楚：读者问「这段是不是课文」时有据可查
      textSource: built.textSource,
      // 切出来太长、装不进盘面的段：不静默丢，写下为什么丢
      dropped: (built.parts || []).filter((p) => !p.ok).map((p) => ({ index: p.index, chars: p.chars, reason: p.reason })),
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
    // 只登记不丢件：这类篇目照样能玩，玩的范围比教材要求窄，必须写在明面上
    narrow: skippedNote,
    stages: pieces.reduce((m, p) => { m[p.stage] = (m[p.stage] || 0) + 1; return m }, {}),
    pieces,
  }
}

/** 逐日枚举：冻结记录必须一天不漏，所以按日期走，不按数组走。 */
export function eachDay(since, through) {
  const start = new Date(since + 'T00:00:00')
  const end = new Date(through + 'T00:00:00')
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const out = []
  for (let d = start; d <= end; d = new Date(d.getTime() + DAY_MS)) out.push(dayKey(d))
  return out
}

/**
 * 把已经发出去的日子冻进 history：用「旧的」词库算出每一天摇到哪一篇哪一段。
 * 必须在写新词库之前做——先写新的再算，算出来的是新词库的题，历史就被就地改了。
 */
export function freezeHistory(oldCorpus, oldHistory, today) {
  const days = oldHistory && Array.isArray(oldHistory.days) ? oldHistory.days.slice() : []
  const pieces = oldHistory && oldHistory.pieces ? Object.assign({}, oldHistory.pieces) : {}
  const since = (oldHistory && oldHistory.since) || today
  const have = new Set(days.map((d) => d.day))
  let added = 0
  if (oldCorpus && Array.isArray(oldCorpus.pieces) && oldCorpus.pieces.length) {
    for (const day of eachDay(since, today)) {
      if (have.has(day)) continue
      const { piece, part } = pickDaily(oldCorpus.pieces, day)
      days.push({ day, id: piece.id, part })
      if (!pieces[piece.id]) pieces[piece.id] = piece
      added++
    }
  }
  days.sort((a, b) => a.day.localeCompare(b.day))
  return { since, through: today, added, days, pieces }
}

/** 历史本身合不合法：日子必须连续、每条必须还能解出正文、昨天必须已经冻上。 */
export function checkHistory(h, today) {
  const problems = []
  if (!h || !Array.isArray(h.days) || !h.days.length)
    return ['快照里没有 history：每日题的历史冻结没接上（跑一次 node tools/sync-corpus.mjs 会补上）']
  const want = eachDay(h.since, h.through)
  if (want.length !== h.days.length)
    problems.push('history 有洞：' + h.since + ' 到 ' + h.through + ' 应有 ' + want.length + ' 天，记录里 ' + h.days.length + ' 天')
  else {
    for (let i = 0; i < want.length; i++) {
      if (h.days[i].day !== want[i]) { problems.push('history 第 ' + (i + 1) + ' 天应是 ' + want[i] + '，记录里是 ' + h.days[i].day); break }
    }
  }
  for (const rec of h.days) {
    if (!(h.pieces || {})[rec.id]) problems.push('history 里 ' + rec.day + ' 指向「' + rec.id + '」，可记录里没有这篇的正文')
  }
  const yesterday = dayKey(new Date(new Date(today + 'T00:00:00').getTime() - DAY_MS))
  if (String(h.through) < yesterday)
    problems.push('history 只冻到 ' + h.through + '，昨天（' + yesterday + '）还没冻：词库一改，已经玩过的日子会被换题')
  if (String(h.through) > today) problems.push('history 冻到了未来：' + h.through + ' 晚于今天 ' + today)
  return problems
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
  if (!same(existing.narrow || [], corpus.narrow)) problems.push('「玩的范围比教材窄」这份清单与重新生成结果不一致')
  for (const q of checkHistory(existing.history, dayKey(new Date()))) problems.push(q)
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
    // 先拿旧词库把已发出的日子冻下来，再写新词库
    let oldCorpus = null
    try { oldCorpus = JSON.parse(readFileSync(OUT_CORPUS, 'utf8')) } catch {}
    const corpus = buildSnapshot()
    const history = freezeHistory(oldCorpus, oldCorpus && oldCorpus.history, dayKey(new Date()))
    corpus.history = history
    mkdirSync(dirname(OUT_CORPUS), { recursive: true })
    writeFileSync(OUT_CORPUS, JSON.stringify(corpus) + '\n', 'utf8')
    // 旧的摘要文件如果还在，删掉：留着它，下一个读它的人不知道该信哪个
    try { unlinkSync(OUT_LEGACY) } catch {}
    console.log('[ok] 已快照 ' + corpus.count + ' 篇 / 内容仓 ' + corpus.sourceTotal + ' 篇（跳过 '
      + corpus.skipped.length + '），contentVersion ' + corpus.contentVersion)
    console.log('     ' + Object.entries(corpus.stages).map(([k, v]) => k + ' ' + v).join(' · '))
    console.log('     每日题历史冻到 ' + history.through + '（' + history.since + ' 起共 ' + history.days.length + ' 天，本次新增 ' + history.added + ' 天）')
    if (corpus.narrow.length)
      console.log('     教材要求背全文、仓内没有全文正文因而退回必背单元：' + corpus.narrow.map((x) => x.title).join('、'))
    process.exitCode = 0
  }
}
