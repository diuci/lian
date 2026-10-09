// tools/check-trad.mjs —— 繁体这一侧的闸门。
//
// 口径与内容仓一致，而且只吃内容仓已经核过的东西：
//   · 繁体形全部来自 k12-chinese-poetry/data/traditional.json（逐字核过来源页）；
//   · 「繁体里不许留下只有简体才用的字」这条闸门，用的也是内容仓那张 STCharacters 表
//     和它登记过的「有意留下的字」（left_behind）—— 本站不自带一份字表，也不自己判哪些字算简体。
//
// 产物只装「和简体不一样的那些」，所以「这句没有繁体形」不能只看产物：
// 必须把内容仓那份完整对照重算一遍，才知道它是本来就同形，还是漏了。
//
//   node tools/check-trad.mjs            体检
//   node tools/check-trad.mjs --selftest 坏样本必须被抓到
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, lineGroups, unitMap } from './build-traditional.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CONTENT = process.env.CONTENT_ROOT || resolve(ROOT, '..', 'k12-chinese-poetry')
const OUT = resolve(ROOT, 'src/data/traditional.json')
const CORPUS = resolve(ROOT, 'src/data/corpus.json')
const STC = resolve(CONTENT, 'data/opencc/STCharacters.txt')
const TSC = resolve(CONTENT, 'data/opencc/TSCharacters.txt')
const SRC = resolve(ROOT, 'src')

function read(p) { return readFileSync(p, 'utf8') }
function readJson(p) { return JSON.parse(read(p)) }
function cpLen(s) { return Array.from(String(s || '')).length }

/** OpenCC 单字表：key 是简体写法，值是繁体候选。key 自己不在候选里 = 只有简体才用这个字。 */
function loadTable(p) {
  const map = new Map()
  for (const line of read(p).split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const [k, v] = line.split('\t')
    if (!k || !v) continue
    map.set(k, v.split(' ').filter(Boolean))
  }
  return map
}
function simpOnlyKeys(table) {
  const out = new Map()
  for (const [k, vs] of table) if (!vs.includes(k)) out.set(k, vs)
  return out
}
/** 内容仓登记过「有意留下」的字（干戈的干、里的里……）：这些不算残留简体。 */
function allowedLeftovers() {
  const doc = readJson(resolve(CONTENT, 'data/traditional.json'))
  const out = new Map()
  for (const x of doc.left_behind || []) out.set(x.char, x.why || '')
  return out
}

/** 内容仓那份完整的句子级繁简对照（含繁简同形的句子）。 */
export function fullUnitMap() {
  const poems = readJson(resolve(CONTENT, 'data/poems.json')).poems
  const rows = {}
  for (const r of readJson(resolve(CONTENT, 'data/traditional.json')).rows || []) rows[r.id] = r
  return unitMap(lineGroups(poems, rows))
}

export function eachUnit(corpus) {
  const seen = new Set()
  const out = []
  const push = (piece, tag) => {
    for (const part of piece.parts || []) {
      for (const u of part.units || []) {
        const key = tag + u
        if (seen.has(key)) continue
        seen.add(key); out.push({ unit: u, tag, title: piece.title })
      }
    }
  }
  for (const p of corpus.pieces) push(p, '')
  for (const rec of (corpus.history && corpus.history.days) || []) {
    const piece = ((corpus.history || {}).pieces || {})[rec.id]
    if (piece) push(piece, '（历史）')
  }
  return out
}

function listSourceFiles(dir, base = '') {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + entry.name : entry.name
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) out.push(...listSourceFiles(full, rel))
    else if (/\.(vue|ts|mjs)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push({ name: rel, text: read(full) })
  }
  return out
}

/** 组件里写的每一个 t('k') / tf('k') 都必须真的在词典里 —— 词典齐了但没人接上，等于没有。 */
export function checkKeysUsed(files, cn, tw) {
  const problems = []
  for (const { name, text } of files) {
    for (const m of text.matchAll(/\btf?\(\s*'([a-z0-9.]+)'/g)) {
      const k = m[1]
      if (!(k in cn)) problems.push(name + ' 用了词典里没有的词条：' + k)
      else if (!(k in tw)) problems.push(name + ' 用了 zh-tw 里没有的词条：' + k)
    }
  }
  return problems
}

export function dictProblems(cn, tw, allow = UI_WORD_ALLOW) {
  const problems = []
  for (const k of Object.keys(cn)) if (!(k in tw)) problems.push('zh-tw 少了界面词条：' + k)
  for (const k of Object.keys(tw)) if (!(k in cn)) problems.push('zh-cn 少了界面词条：' + k)
  for (const k of Object.keys(cn)) {
    if (!(k in tw)) continue
    const a = (cn[k].match(/\{[a-z]+\}/g) || []).sort().join(',')
    const b = (tw[k].match(/\{[a-z]+\}/g) || []).sort().join(',')
    if (a !== b) problems.push('界面词条 ' + k + ' 的参数对不上：简体 [' + a + '] 繁体 [' + b + ']')
  }
  const simpOnly = simpOnlyKeys(loadTable(STC))
  const allowed = allowedLeftovers()
  const usedAllow = new Set()
  for (const [k, v] of Object.entries(tw)) {
    for (const ch of Array.from(v)) {
      if (simpOnly.has(ch) && !allowed.has(ch)) {
        if (k in allow) { usedAllow.add(k); continue }
        problems.push('繁体界面词条 ' + k + ' 里留下简体专用字「' + ch + '」：表要求换成 ' + simpOnly.get(ch).join('/'))
      }
    }
  }
  // 放行表自己也要被审：没写理由、词条已经不存在、值里根本没有该放行的字，都算问题
  for (const [k, why] of Object.entries(allow)) {
    if (!String(why || '').trim()) problems.push('界面词放行表里的「' + k + '」没写为什么放行')
    else if (!(k in tw)) problems.push('界面词放行表里的「' + k + '」在 zh-tw 里已经没有这一条')
    else if (!usedAllow.has(k)) problems.push('界面词放行表里的「' + k + '」已经用不上：值里没有简体专用字，这一条放行该删')
  }
  const tradOnly = simpOnlyKeys(loadTable(TSC))
  for (const [k, v] of Object.entries(cn)) {
    for (const ch of Array.from(v)) if (tradOnly.has(ch)) problems.push('简体界面词条 ' + k + ' 里出现繁体专用字「' + ch + '」')
  }
  return problems
}

/*
  界面词里有意留着的简体字形：按词条放行，每条必须写清为什么。
  lang.toHans —— 繁简钮写的是「切过去那一档」的名字，用那一档自己的字形：
  简体侧写「繁」，繁体侧写「简」。主站、汉兜同一写法；连句若跟着繁体把它写成「簡」，
  四站在繁体侧就长得不一样（线上复核当场抓到过一次，这就是那一条）。
  放行表里的条目用不上也要报：留着一条没人需要的放行，等于给以后随便开后门。
*/
const UI_WORD_ALLOW = {
  'lang.toHans': '钮上是「切过去那一档」的名字，用那一档自己的字形：繁体侧写「简」；四站同一写法（主站、汉兜同）。',
}

/** 一份「产物」过一遍产物闸门（用来喂坏样本，不碰磁盘上的真产物）。 */
export function docProblems(badDoc, corpus, full) {
  const problems = []
  const units = badDoc.units || {}
  const same = new Set(badDoc.same || [])
  const titles = badDoc.titles || {}
  const stages = badDoc.stages || {}
  const volumes = badDoc.volumes || {}
  const unitsAll = eachUnit(corpus)
  for (const { unit, tag, title } of unitsAll) {
    const want = full.get(unit)
    if (want === undefined) { problems.push('内容仓的繁体表覆盖不到：' + tag + title + '「' + unit + '」'); continue }
    const inUnits = unit in units
    const inSame = same.has(unit)
    if (!inUnits && !inSame) { problems.push('没有繁体形：' + tag + title + '「' + unit + '」'); continue }
    if (inUnits && inSame) { problems.push('同一句既算换了形又算同形：「' + unit + '」'); continue }
    if (want === unit) {
      if (inUnits) problems.push('产物里有一条繁简完全相同的映射：「' + unit + '」')
      continue
    }
    const got = units[unit]
    if (inSame) { problems.push('这句在内容仓写作「' + want + '」，产物却登记成繁简同形：「' + unit + '」'); continue }
    if (cpLen(got) !== cpLen(unit)) problems.push('繁简不等长：' + tag + title + '「' + unit + '」/「' + got + '」')
    else if (got !== want) problems.push('与内容仓不一致：' + tag + title + '「' + unit + '」本站作「' + got + '」，内容仓作「' + want + '」')
  }
  for (const u of same) if (full.get(u) !== undefined && full.get(u) !== u) problems.push('同形登记错了：「' + u + '」在内容仓其实写作「' + full.get(u) + '」')
  const known = new Set(unitsAll.map((x) => x.unit))
  for (const [s, t] of Object.entries(units)) if (!known.has(s)) problems.push('产物里有一条词库用不到的映射：「' + s + '」→「' + t + '」')

  const rows = {}
  for (const r of readJson(resolve(CONTENT, 'data/traditional.json')).rows || []) rows[r.id] = r
  for (const p of corpus.pieces) {
    const labels = (rows[p.id] || {}).labels_trad || {}
    if (!Object.keys(labels).length) { problems.push('内容仓没有「' + p.title + '」的繁体标签'); continue }
    for (const field of ['title', 'author', 'dynasty', 'stage', 'volume']) {
      const simp = String(p[field] || '')
      const trad = String(labels[field] || '').replace(/[《》]/g, '')
      if (!simp || !trad || simp === trad) continue
      const got = field === 'stage' ? stages[simp] : field === 'volume' ? volumes[simp] : (titles[p.id] || {})[field]
      if (got !== trad) problems.push('「' + p.title + '」的' + field + '在内容仓写作「' + trad + '」，产物里没有这一条')
    }
  }
  for (const id of Object.keys(titles)) if (!corpus.pieces.some((p) => p.id === id)) problems.push('产物里的篇目标签 ' + id + ' 在词库里没有这篇')

  const simpOnly = simpOnlyKeys(loadTable(STC))
  const allowed = allowedLeftovers()
  const flag = (text, where) => {
    for (const ch of Array.from(text)) {
      if (!simpOnly.has(ch)) continue
      if (allowed.has(ch)) continue
      problems.push('繁体里留下简体专用字「' + ch + '」（' + where + '）：表要求换成 ' + simpOnly.get(ch).join('/'))
    }
  }
  for (const [s, t] of Object.entries(units)) flag(t, '句子「' + s + '」的繁体形')
  for (const [id, got] of Object.entries(titles)) for (const [k, v] of Object.entries(got)) flag(v, '篇目 ' + id + ' 的' + k)
  for (const [k, v] of Object.entries(stages)) flag(v, '学段「' + k + '」的繁体')
  for (const [k, v] of Object.entries(volumes)) flag(v, '册次「' + k + '」的繁体')
  return problems
}

/** 内容仓在不在。CI 里不 clone 内容仓（分站之间零依赖），那就要说清哪一半没跑。 */
export function hasContent() {
  return existsSync(CONTENT) && existsSync(resolve(CONTENT, 'data/traditional.json')) && existsSync(STC)
}

/** 不依赖内容仓的那一半：产物自洽 + 界面词典 + 组件用到的词条。 */
export function localProblems(docOverride) {
  let onDisk
  try { onDisk = read(OUT) } catch { return ['没有 src/data/traditional.json：跑 node tools/build-traditional.mjs'] }
  const doc = docOverride || readJson(OUT)
  const corpus = readJson(CORPUS)
  const problems = []
  const sha256 = (b) => createHash('sha256').update(b).digest('hex')
  if (doc.corpusSha256 !== sha256(readFileSync(CORPUS)))
    problems.push('繁体产物不是按现在这份词库生成的：词库变了而繁体没重算')
  problems.push(...docProblemsLocal(doc, corpus))
  const cn = readJson(resolve(ROOT, 'src/locales/zh-cn.json'))
  const tw = readJson(resolve(ROOT, 'src/locales/zh-tw.json'))
  problems.push(...dictProblemsLocal(cn, tw))
  problems.push(...checkKeysUsed(listSourceFiles(SRC), cn, tw))
  return problems
}

/** 产物自己能不能自证：每一句要么换了形、要么登记为同形，二者取一，且码位等长。 */
function docProblemsLocal(doc, corpus) {
  const problems = []
  const units = doc.units || {}
  const same = new Set(doc.same || [])
  for (const { unit, tag, title } of eachUnit(corpus)) {
    const inUnits = unit in units
    const inSame = same.has(unit)
    if (!inUnits && !inSame) problems.push('没有繁体形：' + tag + title + '「' + unit + '」')
    else if (inUnits && inSame) problems.push('同一句既算换了形又算同形：「' + unit + '」')
    else if (inUnits && cpLen(units[unit]) !== cpLen(unit)) problems.push('繁简不等长：' + tag + title + '「' + unit + '」/「' + units[unit] + '」')
  }
  const known = new Set(eachUnit(corpus).map((x) => x.unit))
  for (const [s, t] of Object.entries(units)) {
    if (!known.has(s)) problems.push('产物里有一条词库用不到的映射：「' + s + '」→「' + t + '」')
    if (s === t) problems.push('产物里有一条繁简完全相同的映射：「' + s + '」')
  }
  for (const id of Object.keys(doc.titles || {})) if (!corpus.pieces.some((p) => p.id === id)) problems.push('产物里的篇目标签 ' + id + ' 在词库里没有这篇')
  return problems
}

/** 词典那一半也不依赖内容仓（除了「简体专用字」那一条）。 */
function dictProblemsLocal(cn, tw) {
  const problems = []
  for (const k of Object.keys(cn)) if (!(k in tw)) problems.push('zh-tw 少了界面词条：' + k)
  for (const k of Object.keys(tw)) if (!(k in cn)) problems.push('zh-cn 少了界面词条：' + k)
  for (const k of Object.keys(cn)) {
    if (!(k in tw)) continue
    const a = (cn[k].match(/\{[a-z]+\}/g) || []).sort().join(',')
    const b = (tw[k].match(/\{[a-z]+\}/g) || []).sort().join(',')
    if (a !== b) problems.push('界面词条 ' + k + ' 的参数对不上：简体 [' + a + '] 繁体 [' + b + ']')
  }
  return problems
}

export function checkAll() {
  let onDisk
  try { onDisk = read(OUT) } catch { return ['没有 src/data/traditional.json：跑 node tools/build-traditional.mjs'] }
  const problems = []
  const fresh = build()
  if (onDisk !== JSON.stringify(fresh, null, 1) + '\n')
    problems.push('繁体产物与重新生成的结果不一致：词库或内容仓变了而本站没重算，或者有人手改了产物')
  const corpus = readJson(CORPUS)
  problems.push(...docProblems(readJson(OUT), corpus, fullUnitMap()))
  const cn = readJson(resolve(ROOT, 'src/locales/zh-cn.json'))
  const tw = readJson(resolve(ROOT, 'src/locales/zh-tw.json'))
  problems.push(...dictProblems(cn, tw))
  problems.push(...checkKeysUsed(listSourceFiles(SRC), cn, tw))
  return problems
}

function selftest() {
  const cases = []
  const corpus = readJson(CORPUS)
  const cn = readJson(resolve(ROOT, 'src/locales/zh-cn.json'))
  const tw = readJson(resolve(ROOT, 'src/locales/zh-tw.json'))
  const good = readJson(OUT)
  const full = hasContent() ? fullUnitMap() : new Map()
  const unitsAll = eachUnit(corpus)
  const changed = unitsAll.find((x) => full.get(x.unit) !== undefined && full.get(x.unit) !== x.unit)
  const same = unitsAll.find((x) => full.get(x.unit) === x.unit)
  const cut = (s, n) => Array.from(s).slice(n).join('')
  const add = (label, got, want) => {
    const hit = got.filter((p) => p.includes(want))
    if (!hit.length) { console.error('[!!] 坏样本「' + label + '」没被抓到（或报的不是那件事）'); process.exitCode = 1; return }
    cases.push(label)
  }
  if (!hasContent()) {
    // 没有内容仓（CI 就是这样）：只跑不依赖它的那几条，并且当场说明另一半没跑
    const changedLocal = eachUnit(corpus).find((x) => good.units[x.unit] !== undefined)
    add('CI 那一半抓得住缺繁体形', docProblemsLocal({ ...good, units: Object.fromEntries(Object.entries(good.units).filter(([k]) => k !== changedLocal.unit)), same: (good.same || []).filter((u) => u !== changedLocal.unit) }, corpus), '没有繁体形')
    add('CI 那一半抓得住词库变了', localProblems({ ...good, corpusSha256: '0'.repeat(64) }), '不是按现在这份词库生成')
    add('CI 那一半抓得住 zh-tw 少词条', dictProblemsLocal(cn, Object.fromEntries(Object.entries(tw).filter(([k]) => k !== Object.keys(tw)[0]))), 'zh-tw 少了界面词条')
    add('CI 那一半抓得住组件用了不存在的词条', checkKeysUsed([{ name: 'X.vue', text: "x = t('no.such.key')" }], cn, tw), '没有的词条')
    const realLocal = localProblems()
    if (realLocal.length) {
      console.error('[!!] 真产物的本地那一半就不合格，selftest 没法自证：')
      for (const p of realLocal.slice(0, 8)) console.error('     ' + p)
      process.exitCode = 1; return 1
    }
    cases.push('真产物的本地那一半不误伤')
    console.log('[ok] check-trad --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
    console.log('     这里没有内容仓：与内容仓逐句比字、简体专用字那几条没跑（CI 就是这样）')
    return process.exitCode || 0
  }
  add('句子缺繁体形', docProblems({ ...good, units: Object.fromEntries(Object.entries(good.units).filter(([k]) => k !== changed.unit)), same: (good.same || []).filter((u) => u !== changed.unit) }, corpus, full), '没有繁体形')
  add('繁简不等长', docProblems({ ...good, units: { ...good.units, [changed.unit]: cut(full.get(changed.unit), 1) } }, corpus, full), '不等长')
  add('繁体形与内容仓不一致', docProblems({ ...good, units: { ...good.units, [changed.unit]: '其' + cut(full.get(changed.unit), 1) } }, corpus, full), '与内容仓不一致')
  add('繁体里留简体专用字', docProblems({ ...good, units: { ...good.units, [changed.unit]: '发' + cut(full.get(changed.unit), 1) } }, corpus, full), '简体专用字')
  add('产物里有多余映射', docProblems({ ...good, units: { ...good.units, '这一句词库里没有': '這一句詞庫裡沒有' } }, corpus, full), '词库用不到')
  add('繁简同形却写进产物', docProblems({ ...good, units: { ...good.units, [same.unit]: same.unit }, same: (good.same || []).filter((u) => u !== same.unit) }, corpus, full), '完全相同')
  add('同形登记错了', docProblems({ ...good, units: Object.fromEntries(Object.entries(good.units).filter(([k]) => k !== changed.unit)), same: [...(good.same || []), changed.unit] }, corpus, full), '登记成繁简同形')
  add('同一句既算换形又算同形', docProblems({ ...good, same: [...(good.same || []), changed.unit] }, corpus, full), '既算换了形又算同形')
  add('内容仓覆盖不到', docProblems(good, { pieces: [{ id: 'nope', title: '没这篇', parts: [{ units: ['这一句内容仓没有'] }] }], history: null }, full), '覆盖不到')
  add('篇目标签漏一条', docProblems({ ...good, titles: Object.fromEntries(Object.entries(good.titles || {}).filter(([k]) => k !== Object.keys(good.titles || {})[0])) }, corpus, full), '产物里没有这一条')
  const k0 = Object.keys(tw)[0]
  const twCut = { ...tw }; delete twCut[k0]
  add('zh-tw 少词条', dictProblems(cn, twCut), 'zh-tw 少了界面词条')
  const kp = Object.keys(cn).find((k) => /\{[a-z]+\}/.test(cn[k]))
  add('参数占位符对不上', dictProblems(cn, { ...tw, [kp]: tw[kp].replace(/\{[a-z]+\}/g, '') }), '参数对不上')
  const kd = Object.keys(tw).find((k) => tw[k] !== cn[k])
  add('繁体界面词条留简体字', dictProblems(cn, { ...tw, [kd]: cn[kd] }), '简体专用字')
  // 放行表这一层也要有坏样本：空着的放行表、没写理由的放行、用不上的放行
  add('放行表空着时繁体界面词条留简体字要被抓', dictProblems(cn, { ...tw, 'lang.toHans': '简' }, {}), '简体专用字')
  add('放行表里没写理由要被抓', dictProblems(cn, { ...tw, 'lang.toHans': '简' }, { 'lang.toHans': '' }), '没写为什么放行')
  add('放行表里留着用不上的条目要被抓', dictProblems(cn, tw, { 'lang.toHans': '写了理由', [Object.keys(tw).find((k) => tw[k] === cn[k]) || Object.keys(tw)[0]]: '写了理由' }), '已经用不上')
  if (dictProblems(cn, tw).length) { console.error('[!!] 真界面词典与放行表不误伤却报了：' + dictProblems(cn, tw)[0]); process.exitCode = 1 }
  else cases.push('真界面词典与放行表不误伤')

  add('组件用了不存在的词条', checkKeysUsed([{ name: 'X.vue', text: "x = t('no.such.key') + tf('game.undo', {})" }], cn, tw), '没有的词条')
  // 没有内容仓时的那一半（CI 跑的就是这一半），也要有坏样本：不然 CI 里那一半就是空过的
  add('CI 那一半也抓得住缺繁体形', docProblemsLocal({ ...good, units: Object.fromEntries(Object.entries(good.units).filter(([k]) => k !== changed.unit)), same: (good.same || []).filter((u) => u !== changed.unit) }, corpus), '没有繁体形')
  add('CI 那一半也抓得住词库变了', localProblems({ ...good, corpusSha256: '0'.repeat(64) }), '不是按现在这份词库生成')
  const real = checkAll()
  if (real.length) {
    console.error('[!!] 真产物本身就不合格，selftest 没法自证：')
    for (const p of real.slice(0, 8)) console.error('     ' + p)
    process.exitCode = 1; return 1
  }
  cases.push('真产物与全部组件不误伤')
  console.log('[ok] check-trad --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
  return process.exitCode || 0
}

function cmdCheck() {
  const needContent = process.argv.includes('--require-content')
  if (!hasContent()) {
    if (needContent) { console.error('[!!] 要查与内容仓比字的那一半，但没有内容仓（设 CONTENT_ROOT）'); return 1 }
    const problems = localProblems()
    if (problems.length) {
      for (const p of problems.slice(0, 25)) console.error('[!!] ' + p)
      if (problems.length > 25) console.error('     …共 ' + problems.length + ' 条')
      console.error('    繁体这一侧没通过')
      return 1
    }
    const doc = readJson(OUT)
    const s = doc.stats || {}
    console.log('[ok] 繁体这一侧通过（不依赖内容仓的那一半）：' + s.unitsTotal + ' 句里 ' + s.unitsChanged + ' 句换了字形、'
      + (s.unitsSame || 0) + ' 句登记为同形，产物自洽；界面词典两边齐、组件用到的词条都在')
    console.log('     这里没有内容仓（CI 不 clone 内容仓），所以「与内容仓逐句比字」和「繁体里不许留简体专用字」这两条没跑。')
    console.log('     那两条要本地跑：CONTENT_ROOT=../k12-chinese-poetry npm run check:trad')
    return 0
  }
  const problems = checkAll()
  if (problems.length) {
    for (const p of problems.slice(0, 25)) console.error('[!!] ' + p)
    if (problems.length > 25) console.error('     …共 ' + problems.length + ' 条')
    console.error('    繁体这一侧没通过')
    return 1
  }
  const doc = readJson(OUT)
  const s = doc.stats || {}
  console.log('[ok] 繁体这一侧通过：' + s.unitsTotal + ' 句里 ' + s.unitsChanged + ' 句字形不同，'
    + s.titlesChanged + ' 篇换了篇名/作者/朝代，' + s.stagesChanged + ' 个学段、' + (s.volumesChanged || 0) + ' 个册次有繁体形')
  console.log('     界面词条 ' + Object.keys(readJson(resolve(ROOT, 'src/locales/zh-cn.json'))).length
    + ' 条，两边一致；闸门用内容仓的 STCharacters 表与它的留字登记')
  return 0
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/check-trad.mjs')) {
  if (process.argv.includes('--selftest')) process.exitCode = selftest()
  else process.exitCode = cmdCheck()
}
