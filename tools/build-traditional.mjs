// tools/build-traditional.mjs —— 连词成句的繁体字形。
//
// 本站不做第二次繁简转换。用的是内容仓已经派生好的那一份（data/traditional.json）：
// 那一遍逐字核过来源页 —— 来源页写作什么就是什么，表只是兜底。
// 本站再转一遍，等于凭空多出一套答案：同一篇课文可能出现两种繁体形（事实发生过一次：
// 「西取由余于戎」在全文里被表换成「由餘」、在名句里照页作「由余」）。
//
//   node tools/build-traditional.mjs           生成 src/data/traditional.json
//   node tools/build-traditional.mjs --check   重算一遍，逐字节比对
//   node tools/build-traditional.mjs --selftest 坏样本必须被抓到
//
// 产物只装「和简体不一样的那些」：
//   units  简体句子 → 繁体句子（盘面按位置取字形，所以两边必须逐码位等长）
//   titles 篇名 / 作者 / 朝代 / 学段
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitUnits } from '../src/logic/layout.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CONTENT = process.env.CONTENT_ROOT || resolve(ROOT, '..', 'k12-chinese-poetry')
const CORPUS = resolve(ROOT, 'src/data/corpus.json')
const OUT = resolve(ROOT, 'src/data/traditional.json')

export class TradError extends Error {}

function die(msg) { throw new TradError(msg) }

function readJson(p, what) {
  try { return JSON.parse(readFileSync(p, 'utf8')) }
  catch (e) { die('读不到' + what + '（' + p + '）：' + e.message) }
}

function sha256(buf) { return createHash('sha256').update(buf).digest('hex') }

// 按码位算长度：三峡的「绝𪩘」、劝学的「𫐐」、谏逐客书的「𫘝𫘨」都在增补平面，
// UTF-16 里一个字占两个码元，按码元比长度会把一次正当的 1:1 换字判成字数不齐。
function cpLen(s) { return Array.from(String(s || '')).length }

/**
 * 内容仓里逐行对齐的繁简行组。
 * 必须整组交给 splitUnits：单字块会被并进前一句，这一并就跨到下一行了 ——
 * 逐行切会把「……都做了土。／兴，百姓苦」切成跟词库不一样的句子。
 */
export function lineGroups(poems, rows) {
  const out = []
  for (const poem of poems) {
    const row = rows[poem.id]
    if (!row) die('内容仓的繁体表里没有「' + poem.title + '」（' + poem.id + '）：本站不许自己转一遍补上')
    const secs = row.sections_trad || {}
    const raw = [
      [poem.fullLinesPunct || [], row.text_trad || [], '全文'],
      [secs['必背名句'] ? (poem.linesPunct || []) : [], secs['必背名句'] || [], '必背名句'],
      [secs['正文'] ? (poem.linesPunct || []) : [], secs['正文'] || [], '正文'],
      [secs['全文'] ? (poem.fullLinesPunct || []) : [], secs['全文'] || [], '全文小节'],
      [secs['必背全文'] ? (poem.fullLinesPunct || []) : [], secs['必背全文'] || [], '必背全文'],
    ]
    for (const [simp, trad, from] of raw) {
      if (!simp.length && !trad.length) continue
      if (simp.length !== trad.length)
        die('「' + poem.title + '」的' + from + '：简体 ' + simp.length + ' 行，繁体 ' + trad.length + ' 行，对不上')
      for (let i = 0; i < simp.length; i++) {
        if (cpLen(simp[i]) !== cpLen(trad[i]))
          die('「' + poem.title + '」' + from + '第 ' + (i + 1) + ' 行字数不齐：「' + simp[i] + '」/「' + trad[i] + '」')
      }
      out.push({ id: poem.id, title: poem.title, from, simp, trad })
    }
  }
  return out
}

/** 行组 → 句子级的繁简对照。同一句出现两种繁体形就是矛盾，必须停。 */
export function unitMap(groups) {
  const map = new Map()
  for (const g of groups) {
    const su = splitUnits(g.simp)
    const tu = splitUnits(g.trad)
    if (su.length !== tu.length)
      die('「' + g.title + '」的' + g.from + '切出来的句子数不齐：简体 ' + su.length + ' 句，繁体 ' + tu.length + ' 句')
    for (let i = 0; i < su.length; i++) {
      if (cpLen(su[i]) !== cpLen(tu[i]))
        die('「' + g.title + '」第 ' + (i + 1) + ' 句繁简不等长：「' + su[i] + '」/「' + tu[i] + '」')
      const prev = map.get(su[i])
      if (prev !== undefined && prev !== tu[i])
        die('同一句在内容仓里有两种繁体形：「' + su[i] + '」写作「' + prev + '」又写作「' + tu[i] + '」')
      map.set(su[i], tu[i])
    }
  }
  return map
}

export function build() {
  const corpus = readJson(CORPUS, '本站词库')
  if (!corpus.pieces || !corpus.pieces.length) die('词库是空的，派生不出任何东西')
  const srcDir = resolve(CONTENT, 'data')
  const poemsRaw = readFileSync(resolve(srcDir, 'poems.json'), 'utf8')
  const tradRaw = readFileSync(resolve(srcDir, 'traditional.json'), 'utf8')
  const poems = JSON.parse(poemsRaw).poems
  const rows = {}
  for (const r of JSON.parse(tradRaw).rows || []) rows[r.id] = r
  const groups = lineGroups(poems, rows)
  const units = unitMap(groups)

  const outUnits = {}
  const sameUnits = new Set()
  const missing = []
  const take = (piece, tag) => {
    for (const part of piece.parts || []) {
      for (const u of part.units || []) {
        const t = units.get(u)
        if (t === undefined) { missing.push(tag + piece.title + '：' + u); continue }
        if (t !== u) outUnits[u] = t
        else sameUnits.add(u) // 繁简本来就同形：不写进 units，但要登记，否则运行时分不清「同形」与「漏了」
      }
    }
  }
  for (const p of corpus.pieces) take(p, '')
  for (const rec of (corpus.history && corpus.history.days) || []) {
    const piece = ((corpus.history || {}).pieces || {})[rec.id]
    if (piece) take(piece, '（历史）')
  }
  if (missing.length)
    die('内容仓的繁体表覆盖不到这些句子（' + missing.length + ' 句，前几条：'
      + missing.slice(0, 5).join(' / ') + '）：宁可停，不许本站现编一个繁体形')

  const titles = {}
  for (const p of corpus.pieces) {
    const labels = (rows[p.id] || {}).labels_trad || {}
    const got = {}
    for (const f of ['title', 'author', 'dynasty', 'stage']) {
      const simp = String(p[f] || '')
      const trad = String(labels[f] || '').replace(/[《》]/g, '')
      if (!simp) continue
      if (!trad) die('内容仓的繁体标签里没有「' + p.title + '」的' + f + '：标签也得有出处')
      if (trad !== simp) got[f] = trad
    }
    if (Object.keys(got).length) titles[p.id] = got
  }
  const volumes = {}
  for (const p of corpus.pieces) {
    const labels = (rows[p.id] || {}).labels_trad || {}
    const simp = String(p.volume || '')
    const tradV = String(labels.volume || '')
    if (simp && tradV && tradV !== simp) volumes[simp] = tradV
  }
  const stages = {}
  for (const p of corpus.pieces) {
    const labels = (rows[p.id] || {}).labels_trad || {}
    const simp = String(p.stage || '')
    const trad = String(labels.stage || '')
    if (simp && trad && trad !== simp) stages[simp] = trad
  }
  return {
    contentVersion: corpus.contentVersion,
    corpusSha256: sha256(readFileSync(CORPUS)),
    sourceFile: 'k12-chinese-poetry/data/traditional.json',
    sourceSha256: sha256(tradRaw),
    note: '繁体形全部取自内容仓派生好的那一份；本站不第二次转换。',
    units: outUnits,
    same: [...sameUnits].sort(),
    titles,
    stages,
    volumes,
    stats: {
      groups: groups.length,
      lines: groups.reduce((n, g) => n + g.simp.length, 0),
      unitsKnown: units.size,
      unitsTotal: new Set(corpus.pieces.flatMap((p) => p.parts.flatMap((x) => x.units))).size,
      unitsChanged: Object.keys(outUnits).length,
      unitsSame: sameUnits.size,
      titlesChanged: Object.keys(titles).length,
      stagesChanged: Object.keys(stages).length,
      volumesChanged: Object.keys(volumes).length,
    },
  }
}

function dump(doc) { return JSON.stringify(doc, null, 1) + '\n' }

function cmdBuild() {
  const doc = build()
  writeFileSync(OUT, dump(doc), 'utf8')
  const s = doc.stats
  console.log('[ok] 繁体取自内容仓：' + s.unitsTotal + ' 句里 ' + s.unitsChanged + ' 句字形不同；篇名/作者/朝代换了 ' + s.titlesChanged + ' 篇')
  console.log('     对齐核过 ' + s.groups + ' 组 / ' + s.lines + ' 行，内容仓繁体指纹 ' + doc.sourceSha256.slice(0, 12))
  return 0
}

function cmdCheck() {
  const doc = build()
  let old = null
  try { old = readFileSync(OUT, 'utf8') } catch { die('还没有 src/data/traditional.json：跑一次 node tools/build-traditional.mjs') }
  if (old !== dump(doc)) die('繁体产物与重新生成的结果不一致：词库或内容仓变了，而本站没重算（或者有人手改了产物）')
  console.log('[ok] 繁体产物与词库、内容仓一致：' + doc.stats.unitsChanged + ' 句字形不同，contentVersion ' + doc.contentVersion)
  return 0
}

function selftest() {
  const cases = []
  const add = (label, fn, want) => {
    try { fn() } catch (e) {
      if (!(e instanceof TradError)) { die('「' + label + '」报的不是 TradError：' + e.message) }
      if (want && !String(e.message).includes(want)) die('「' + label + '」抓是抓到了，报的却不是那件事：' + e.message)
      cases.push(label)
      return
    }
    die('坏样本「' + label + '」没有被抓到')
  }
  const poem = { id: 'a', title: '静夜思', linesPunct: ['床前明月光，疑是地上霜。'], fullLinesPunct: [] }
  const row = { id: 'a', sections_trad: { 正文: ['床前明月光，疑是地上霜。'] }, labels_trad: { title: '靜夜思', author: '李白', dynasty: '唐', stage: '小學' } }
  add('行数不齐被抓', () => lineGroups([poem], { a: { ...row, sections_trad: { 正文: ['床前明月光，疑是地上霜。', '多出来的一行。'] } } }), '对不上')
  add('字数不齐被抓', () => lineGroups([poem], { a: { ...row, sections_trad: { 正文: ['床前明月光，疑是地上双霜。'] } } }), '字数不齐')
  add('内容仓缺篇被抓', () => lineGroups([poem], {}), '不许自己转')
  add('同一句两种繁体形被抓', () => unitMap([
    { id: 'a', title: '甲', from: '全文', simp: ['床前明月光，疑是地上霜。'], trad: ['床前明月光，疑是地上霜。'] },
    { id: 'b', title: '乙', from: '全文', simp: ['床前明月光，疑是地上霜。'], trad: ['牀前明月光，疑是地上霜。'] },
  ]), '两种繁体形')
  add('句子数不齐被抓', () => unitMap([{ id: 'a', title: '甲', from: '全文', simp: ['甲乙丙丁，丁戊己庚。'], trad: ['甲乙丙丁丁戊己庚。'] }]), '句子数不齐')
  // 单字块跨行合并：整组切才对得上
  const cross = { id: 'c', title: '山坡羊', linesPunct: ['峰峦如聚，波涛如怒，山河表里潼关路。', '宫阙万间都做了土。', '兴，百姓苦；亡，百姓苦。'], fullLinesPunct: [] }
  const crossRow = { id: 'c', sections_trad: { 必背名句: ['峰巒如聚，波濤如怒，山河表裏潼關路。', '宮闕萬間都做了土。', '興，百姓苦；亡，百姓苦。'] }, labels_trad: { title: '山坡羊', author: '張養浩', dynasty: '元', stage: '初中' } }
  const map = unitMap(lineGroups([cross], { c: crossRow }))
  if (!map.has('宫阙万间都做了土兴')) die('跨行合并的句子没进对照表：切法与词库不一致')
  if (map.get('宫阙万间都做了土兴') !== '宮闕萬間都做了土興') die('跨行合并的句子繁体形不对')
  cases.push('跨行合并与词库同切法')
  const ok = unitMap(lineGroups([poem], { a: row }))
  if (ok.get('床前明月光') !== '床前明月光') die('合法的行组被切错了')
  cases.push('合法行组不误伤')
  console.log('[ok] build-traditional --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
  return 0
}

const isEntry = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/build-traditional.mjs')
if (isEntry) {
  if (process.argv.includes('--selftest')) process.exitCode = selftest()
  else if (process.argv.includes('--check')) process.exitCode = cmdCheck()
  else process.exitCode = cmdBuild()
}
