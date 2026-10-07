// tools/build-readings.mjs —— 把课文里每个汉字的读音在构建期算好，落成离线快照。
//
// 为什么是离线快照，不是运行时查字典：
//   1. 线上不联网，也不该把 pinyin 的词典塞进前端包。dict-zi 是十几万条目的表，
//      玩法包只带课文和读音，不带词典；运行时查字典等于把词典搬进浏览器。
//   2. 读音必须可复现。同一篇课文今天读和明天读得是同一份读音，玩家分享的截图、
//      每日题的注音不能因为上游词典换版本而变。所以快照带 contentVersion / sourceSha256，
//      --check 用「重算一遍、逐字节比对」把关，不靠人肉看。
//   3. 多音字要看得见。一个字的候选读音一次列全，界面才说得出「这个字还有别的读法」。
//      运行时查字典只给首读，多音字就悄悄读错了——handle-site 为同一件事把答案读音钉死过。
//
// 读音以教材为准。本工具只保证「与 pinyin 词典一致、与课文同一版本」，
// 不担保每个字在每篇课文里都取教材那个音（多音字取哪个音要人裁决）。
//
// 用法：
//   node tools/build-readings.mjs            生成 src/data/readings.json
//   node tools/build-readings.mjs --check    重算并与已提交文件逐字节比对，漂移就失败（CI 用）
//   node tools/build-readings.mjs --report   出多音字报告（人看的，CI 不跑）
//   node tools/build-readings.mjs --selftest 用假数据证明上面这些断言真的会失败

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import pinyin from 'pinyin'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CORPUS = resolve(ROOT, 'src/data/corpus.json')
const OUT = resolve(ROOT, 'src/data/readings.json')

// 与 src/logic/layout.mjs 的 HAN 同一套范围：CJK 基本区 + 扩展 A + 兼容表意文字。
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
// 带调拼音的合法形式：小写字母加带调元音；轻声没有声调符号，也算合法。
const VALID_READING = /^[a-zàáǎāēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+$/

/** 构建失败统一抛这个；CLI 出口负责打印与退出码，自检可以直接 catch。 */
export class ReadingError extends Error {}

/** 按码位排：不用 localeCompare，不受 locale 影响，换台机器也是同一个顺序。 */
function byCodepoint(a, b) { return a.codePointAt(0) - b.codePointAt(0) }

export function loadCorpus(path = CORPUS) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch { throw new ReadingError('读不到 ' + path + '：先跑 node tools/sync-corpus.mjs') }
}

/**
 * 课文句块里出现过的汉字 → 出现次数。
 * 读音快照的范围就是这一份：不多一个（陈旧条目），不少一个（线上撞见空白）。
 * 句块本该是 layout.mjs 滤过标点的纯汉字，撞见非汉字就是上游坏了，必须报出来。
 */
export function corpusChars(corpus) {
  if (!corpus || !Array.isArray(corpus.pieces)) throw new ReadingError('corpus.json 顶层没有 pieces 数组')
  const counts = new Map()
  for (const piece of corpus.pieces) {
    for (const part of piece.parts || []) {
      for (const unit of part.units || []) {
        for (const ch of String(unit)) {
          if (!HAN.test(ch))
            throw new ReadingError('句块里有非汉字 ' + JSON.stringify(ch) + '（' + (piece.id || piece.title) + '）：拆句该把它滤掉')
          counts.set(ch, (counts.get(ch) || 0) + 1)
        }
      }
    }
  }
  if (!counts.size) throw new ReadingError('课文里一个汉字都没有')
  return counts
}

/** 词典查询：pinyin 的默认风格（带调拼音），heteronym 取全部候选。 */
export function queryPinyin(ch) {
  const all = pinyin(ch, { heteronym: true })
  const first = pinyin(ch)
  return {
    candidates: (Array.isArray(all[0]) ? all[0] : []).map(String),
    first: String((Array.isArray(first[0]) ? first[0] : [])[0] || ''),
  }
}

/**
 * 一个字的全部候选读音 + 最常用的那个（词典首读）。
 * 查不到、形式不像拼音、首读不在候选里——一律抛错，绝不往快照里写空条目。
 * query 可注入：自检喂一个假词典，才能证明这几条断言真的会拒。
 */
export function readingsFor(ch, query = queryPinyin) {
  const { candidates, first } = query(ch)
  const readings = []
  for (const item of candidates) {
    const s = String(item).trim()
    if (!s) continue
    if (s === ch) continue // 词典查不到时 pinyin 把原字吐回来
    if (!VALID_READING.test(s))
      throw new ReadingError('「' + ch + '」的词典候选里有非法形式 ' + JSON.stringify(s) + '：不是带调拼音，不收')
    if (!readings.includes(s)) readings.push(s)
  }
  if (!readings.length)
    throw new ReadingError('「' + ch + '」(U+' + ch.codePointAt(0).toString(16).toUpperCase() + ') 算不出读音：词典里没有这个字')
  const common = String(first).trim()
  if (!readings.includes(common))
    throw new ReadingError('「' + ch + '」的首读 ' + JSON.stringify(common) + ' 不在候选 [' + readings.join('/') + '] 里')
  return { readings: readings.slice().sort(byCodepoint), common }
}

/**
 * 整份快照。确定性靠三件事：字符按码位排、读音按码位排、不写时间戳。
 * 篇目顺序、句块顺序都不参与——去重之后，输入相同就必须输出相同。
 */
export function buildDocument(corpus, query = queryPinyin) {
  const counts = corpusChars(corpus)
  const chars = {}
  for (const ch of [...counts.keys()].sort(byCodepoint)) {
    const { readings, common } = readingsFor(ch, query)
    chars[ch] = { readings, common }
  }
  return {
    contentVersion: corpus.contentVersion,
    sourceSha256: corpus.sourceSha256,
    count: Object.keys(chars).length,
    chars,
  }
}

export function serialize(doc) { return JSON.stringify(doc, null, 2) + '\n' }

/** 已提交文件与重算结果的差异，逐条说清差在哪。 */
export function diffDocuments(committed, fresh) {
  const problems = []
  if (!committed || typeof committed !== 'object' || Array.isArray(committed)) { problems.push('已提交文件不是一个对象'); return problems }
  const oldChars = committed.chars && typeof committed.chars === 'object' ? committed.chars : {}
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
  for (const k of ['contentVersion', 'sourceSha256'])
    if (committed[k] !== fresh[k]) problems.push(k + ' 漂移：已提交 ' + JSON.stringify(committed[k]) + '，重算 ' + JSON.stringify(fresh[k]))
  if (committed.count !== fresh.count) problems.push('count 漂移：已提交 ' + committed.count + '，重算 ' + fresh.count)
  const oldKeys = Object.keys(oldChars)
  const newKeys = Object.keys(fresh.chars)
  const missing = newKeys.filter((k) => !has(oldChars, k))
  const stale = oldKeys.filter((k) => !has(fresh.chars, k))
  if (missing.length) problems.push('缺 ' + missing.length + ' 个字的条目：' + missing.slice(0, 20).join(' '))
  if (stale.length) problems.push('有 ' + stale.length + ' 个课文之外的陈旧条目：' + stale.slice(0, 20).join(' '))
  const changed = newKeys.filter((k) => oldChars[k] && JSON.stringify(oldChars[k]) !== JSON.stringify(fresh.chars[k]))
  if (changed.length)
    problems.push('读音内容不一致 ' + changed.length + ' 个字：'
      + changed.slice(0, 6).map((k) => k + ' 已提交 ' + JSON.stringify(oldChars[k]) + ' / 重算 ' + JSON.stringify(fresh.chars[k])).join('；'))
  if (oldKeys.join(' ') !== newKeys.join(' ')) {
    let i = 0
    while (i < oldKeys.length && i < newKeys.length && oldKeys[i] === newKeys[i]) i++
    problems.push('条目顺序不同（必须按码位排序）：第 ' + (i + 1) + ' 个起不一致，已提交 '
      + oldKeys.slice(i, i + 10).join('') + ' … / 重算 ' + newKeys.slice(i, i + 10).join('') + ' …')
  }
  return problems
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return n
}

/** 重算 + 逐字节比对。自检拿它比对临时文件，正式跑拿它比对已提交文件。 */
export function checkFiles(corpusPath = CORPUS, outPath = OUT) {
  const corpus = loadCorpus(corpusPath)
  const fresh = serialize(buildDocument(corpus))
  let committed
  try { committed = readFileSync(outPath, 'utf8') }
  catch { return { code: 1, count: 0, problems: ['缺 ' + outPath + '：先跑 node tools/build-readings.mjs'] } }
  if (committed === fresh) return { code: 0, count: JSON.parse(fresh).count, problems: [] }
  let parsed
  try { parsed = JSON.parse(committed) }
  catch (e) { return { code: 1, count: 0, problems: ['已提交文件不是合法 JSON：' + e.message] } }
  const problems = diffDocuments(parsed, JSON.parse(fresh))
  if (!problems.length)
    problems.push('内容相同但逐字节不一致（缩进 / 换行 / 尾随空白被改过）：已提交 '
      + Buffer.byteLength(committed) + ' 字节，重算 ' + Buffer.byteLength(fresh)
      + ' 字节，首个差异在第 ' + (firstDiff(committed, fresh) + 1) + ' 字节')
  return { code: 1, problems, count: 0 }
}

function check() {
  const r = checkFiles()
  if (r.code !== 0) {
    for (const p of r.problems) console.error('[!!] ' + p)
    console.error('    跑 node tools/build-readings.mjs 重新生成')
    return 1
  }
  const corpus = loadCorpus()
  console.log('[ok] 读音快照与重算结果逐字节一致：' + r.count + ' 个汉字（contentVersion '
    + corpus.contentVersion + '，来源 sha256 ' + String(corpus.sourceSha256).slice(0, 12) + '）')
  return 0
}

/** 多音字报告：给人看的，不参与 CI。读音以教材为准，这里只把候选摊开。 */
export function readingsReport(corpus, doc, top = 20) {
  const counts = corpusChars(corpus)
  const used = [...counts.keys()].sort(byCodepoint)
  const entries = doc.chars || {}
  const poly = used.filter((c) => entries[c] && entries[c].readings.length > 1)
  const list = poly
    .map((c) => ({ ch: c, n: counts.get(c), readings: entries[c].readings, common: entries[c].common }))
    .sort((a, b) => b.n - a.n || byCodepoint(a.ch, b.ch))
  let maxEntry = null
  for (const c of used) {
    const v = entries[c]
    if (v && (!maxEntry || v.readings.length > maxEntry.readings.length)) maxEntry = { ch: c, readings: v.readings }
  }
  const totalChars = [...counts.values()].reduce((n, v) => n + v, 0)
  console.log('[report] 课文 ' + corpus.pieces.length + ' 篇：' + totalChars + ' 字 / ' + counts.size
    + ' 个不同汉字（去重），readings.json 条目 ' + Object.keys(entries).length + ' 个')
  console.log('     多音字（候选不止一个）' + poly.length + ' 个，占去重汉字 '
    + (counts.size ? (poly.length / counts.size) * 100 : 0).toFixed(2) + '%'
    + (maxEntry ? '；候选最多 ' + maxEntry.readings.length + ' 个：' + maxEntry.ch + ' [' + maxEntry.readings.join('/') + ']' : ''))
  const shown = Math.min(top, list.length)
  console.log('     课文里出现最多的多音字（前 ' + shown + '，按出现次数）：')
  for (const x of list.slice(0, shown))
    console.log('       ' + x.ch + '  ' + String(x.n).padStart(4) + ' 次  [' + x.readings.join('/') + ']  快照取 ' + x.common)
  console.log('     读音以教材为准：这里只把候选摊开，不担保每篇课文的取音。')
  return { unique: counts.size, poly: poly.length, totalChars }
}

function selftest() {
  const cases = []
  const add = (name, fn) => {
    const r = fn()
    if (r !== true) { console.error('[!!] build-readings --selftest 失败：' + r); process.exitCode = 1; return }
    cases.push(name)
  }
  const fakeCorpus = (units, version = 'selftest') => ({
    contentVersion: version,
    sourceSha256: 'ab'.repeat(32),
    count: 1,
    pieces: [{ id: 'fake', title: '假课文', parts: [{ index: 0, units, chars: units.join('').length }] }],
  })
  const GOOD = ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡']

  // 1. 真词典里查不到的字必须报错，不能写个空条目蒙过去
  add('查不到读音报错', () => {
    let threw = false
    try { readingsFor('兙') } catch (e) { threw = e instanceof ReadingError }
    if (!threw) return '「兙」（词典里没有）没有抛 ReadingError'
    threw = false
    try { buildDocument(fakeCorpus(['兙兙兙兙兙兙兙兙兙兙兙兙'])) } catch (e) { threw = e instanceof ReadingError }
    if (!threw) return '含「兙」的课文没有在建文档时被拒'
    return true
  })

  // 2. 假词典给个不像拼音的东西 / 什么都不给，都必须被拒
  add('非法读音被拒', () => {
    let threw = false
    try { readingsFor('月', () => ({ candidates: ['不是拼音'], first: '不是拼音' })) }
    catch (e) { threw = e instanceof ReadingError }
    if (!threw) return '非法读音形式没被拒'
    threw = false
    try { readingsFor('月', () => ({ candidates: [], first: '' })) }
    catch (e) { threw = e instanceof ReadingError }
    if (!threw) return '空候选没被拒'
    threw = false
    try { readingsFor('月', () => ({ candidates: ['yuè'], first: 'not-yue' })) }
    catch (e) { threw = e instanceof ReadingError }
    if (!threw) return '首读不在候选里却没被拒'
    return true
  })

  // 3. 同一输入两次生成必须逐字节相同；篇目顺序、句块顺序不参与结果
  add('确定性', () => {
    const a = serialize(buildDocument(fakeCorpus(GOOD)))
    const b = serialize(buildDocument(fakeCorpus(GOOD)))
    if (a !== b) return '同一输入两次生成不一致'
    const shuffled = {
      contentVersion: 'selftest', sourceSha256: 'ab'.repeat(32), count: 1,
      pieces: [{ id: 'fake', title: '假课文', parts: [
        { index: 1, units: [GOOD[3]], chars: 5 },
        { index: 0, units: [GOOD[2], GOOD[0], GOOD[1]], chars: 15 },
      ] }],
    }
    if (a !== serialize(buildDocument(shuffled))) return '句块换了顺序结果就变了（去重后不该依赖遍历顺序）'
    if (/\d{4}-\d{2}-\d{2}T|"builtAt"|"generatedAt"|"timestamp"/.test(a)) return '输出里有时间戳'
    const doc = JSON.parse(a)
    const keys = Object.keys(doc.chars)
    if (keys.join('') !== keys.slice().sort(byCodepoint).join('')) return '条目没按码位排序'
    for (const v of Object.values(doc.chars))
      if (v.readings.join('') !== v.readings.slice().sort(byCodepoint).join('')) return '候选没按码位排序'
    return true
  })

  // 4. 已提交文件被改动后 --check 必须失败（临时文件写在系统 tmp，不进本仓）
  add('改动后 check 失败', () => {
    const tmp = mkdtempSync(resolve(os.tmpdir(), 'lian-readings-'))
    try {
      const corpusPath = resolve(tmp, 'corpus.json')
      const outPath = resolve(tmp, 'readings.json')
      const corpus = fakeCorpus(GOOD)
      writeFileSync(corpusPath, JSON.stringify(corpus) + '\n', 'utf8')
      const fresh = serialize(buildDocument(corpus))
      writeFileSync(outPath, fresh, 'utf8')
      const clean = checkFiles(corpusPath, outPath)
      if (clean.code !== 0) return '没被改动的文件 --check 反而失败了：' + clean.problems.join('；')
      const tampers = [
        ['改一个字的读音', () => { const d = JSON.parse(fresh); d.chars['月'].readings = ['ruè', 'yuè']; writeFileSync(outPath, serialize(d), 'utf8') }],
        ['删一个条目', () => { const d = JSON.parse(fresh); delete d.chars['月']; d.count -= 1; writeFileSync(outPath, serialize(d), 'utf8') }],
        ['版本不一致', () => { const d = JSON.parse(fresh); d.contentVersion = '上一版'; writeFileSync(outPath, serialize(d), 'utf8') }],
        ['来源 sha256 不一致', () => { const d = JSON.parse(fresh); d.sourceSha256 = 'ff'.repeat(32); writeFileSync(outPath, serialize(d), 'utf8') }],
        ['只加一个尾随空格', () => { writeFileSync(outPath, fresh + ' ', 'utf8') }],
        ['条目顺序被打乱', () => { const d = JSON.parse(fresh); const chars = {}; for (const k of Object.keys(d.chars).reverse()) chars[k] = d.chars[k]; d.chars = chars; writeFileSync(outPath, serialize(d), 'utf8') }],
      ]
      for (const [name, tamper] of tampers) {
        tamper()
        const r = checkFiles(corpusPath, outPath)
        if (r.code === 0) return name + ' 之后 --check 居然过了'
        if (!r.problems.length) return name + ' 之后 --check 失败了却说不出差在哪'
      }
      return true
    } finally { rmSync(tmp, { recursive: true, force: true }) }
  })

  // 5. 句块里的非汉字必须报出来（快照的范围不能靠运气）
  add('非汉字被拒', () => {
    let threw = false
    try { corpusChars(fakeCorpus(['床前明月光，疑是地上霜', '举头望明月低头思故乡'])) }
    catch (e) { threw = e instanceof ReadingError }
    if (!threw) return '句块里的标点没有被抓到'
    threw = false
    try { corpusChars({ contentVersion: 'x', pieces: [] }) } catch (e) { threw = e instanceof ReadingError }
    if (!threw) return '空课文没有被抓到'
    return true
  })

  // 6. 首读必须落在候选里，多音字候选确实取得到
  add('首读在候选里', () => {
    for (const ch of ['燕', '都', '大', '和', '家', '长', '落', '月']) {
      const r = readingsFor(ch)
      if (!r.readings.includes(r.common)) return ch + ' 的首读不在候选里：' + JSON.stringify(r)
      if (r.readings.join('') !== r.readings.slice().sort(byCodepoint).join('')) return ch + ' 的候选没按码位排：' + r.readings.join('/')
    }
    if (readingsFor('燕').readings.length < 2) return '取不到「燕」的多音候选'
    if (readingsFor('月').readings.length !== 1) return '「月」不该被判成多音字：' + readingsFor('月').readings.join('/')
    return true
  })

  if (!process.exitCode) console.log('[ok] build-readings --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
  return process.exitCode || 0
}

const isEntry = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/build-readings.mjs')
if (isEntry) {
  try {
    if (process.argv.includes('--selftest')) process.exitCode = selftest()
    else if (process.argv.includes('--check')) process.exitCode = check()
    else if (process.argv.includes('--report')) {
      const corpus = loadCorpus()
      const doc = JSON.parse(readFileSync(OUT, 'utf8'))
      const r = readingsReport(corpus, doc)
      // 报告顺手核对覆盖率：课文用到的字少一个，报告就该失败，不然它只是一份好看的统计
      const missing = [...corpusChars(corpus).keys()].filter((c) => !doc.chars[c])
      if (missing.length) {
        console.error('[!!] 有 ' + missing.length + ' 个课文用到的字没有读音条目：' + missing.slice(0, 30).join(' '))
        process.exitCode = 1
      } else process.exitCode = 0
    }
    else {
      const corpus = loadCorpus()
      const doc = buildDocument(corpus)
      const body = serialize(doc)
      mkdirSync(dirname(OUT), { recursive: true })
      writeFileSync(OUT, body, 'utf8')
      const poly = Object.values(doc.chars).filter((v) => v.readings.length > 1).length
      console.log('[ok] 已生成 ' + doc.count + ' 个汉字的读音（课文 ' + corpus.count + ' 篇，contentVersion '
        + doc.contentVersion + '），其中多音字 ' + poly + ' 个')
      console.log('     ' + OUT + ' ' + Buffer.byteLength(body) + ' 字节')
      process.exitCode = 0
    }
  }
  catch (e) {
    console.error('[!!] build-readings 失败：' + (e instanceof ReadingError ? e.message : (e && e.stack) || e))
    process.exitCode = 1
  }
}
