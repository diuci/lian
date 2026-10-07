// tools/check-build.mjs —— 构建产物体检。
// 构建成功不等于产物能用：base 写错、数据没打进去、标题被覆盖，都能绿着上线。

import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(HERE, '../dist')
const TOKENS = resolve(HERE, '../src/styles/tokens.css')

const ANCHORS = [
  '<title>连词成句 · 把必背课文连出来 | 丢词夺理</title>',
  'lian.diuci.com',
  'dc-theme',
  'https://k12.diuci.com/legal',
  'https://handle.diuci.com/',
  'https://diuci.com/',
]

// 与主站 _deploy/index.html、k12-site、汉兜的 :root 逐值一致
const LIGHT = {
  '--paper': '#f4ede0',
  '--paper-2': '#eae0cd',
  '--ink': '#241f1a',
  '--ink-soft': '#5b5147',
  '--ink-faint': '#8a7f72',
  '--cinnabar': '#c8442e',
  '--cinnabar-deep': '#a33524',
  '--celadon': '#5f8d7d',
  '--indigo': '#3c5a78',
  '--gold': '#c08a2e',
  '--line': '#d8cbb4',
  '--radius': '14px',
}
const DARK = {
  '--paper': '#17140f',
  '--paper-2': '#241f18',
  '--ink': '#f0e7d6',
  '--ink-soft': '#c3b8a5',
  '--ink-faint': '#948a79',
  '--cinnabar': '#e2694c',
  '--cinnabar-deep': '#f07f61',
  '--celadon': '#7fae9c',
  '--indigo': '#7d9dc0',
  '--gold': '#d3a44a',
  '--line': '#3b342a',
}

/**
 * 取某个选择器紧跟的那个块。
 * 只认「行首就是这个选择器」：文件顶部的注释里也写着这两个选择器，
 * 直接 indexOf 会先撞上注释，然后把亮色块当成暗色块。
 */
function parseBlock(css, selector) {
  const lines = css.split('\n')
  let hit = ''
  for (const line of lines) {
    if (line.trimStart().startsWith(selector)) { hit = line; break }
  }
  if (!hit) return null
  const openAt = css.indexOf('{', css.indexOf(hit))
  const closeAt = css.indexOf('}', openAt)
  if (openAt < 0 || closeAt < 0) return null
  const body = css.slice(openAt + 1, closeAt)
  const out = {}
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

export function checkText(css) {
  const problems = []
  const light = parseBlock(css, ':root{')
  const dark = parseBlock(css, ':root[data-theme="dark"]')
  if (!light) problems.push('找不到行首的 :root 块')
  if (!dark) problems.push('找不到行首的 :root[data-theme="dark"] 块')
  if (!/^\s*html\.dark/m.test(css)) problems.push('缺 html.dark 选择器：UnoCSS 的 dark: 变体靠它，主题会漏配')
  for (const [k, v] of Object.entries(LIGHT)) {
    if (!light) break
    if (light[k] !== v) problems.push('亮色 ' + k + ' 应为 ' + v + '，实际 ' + light[k])
  }
  for (const [k, v] of Object.entries(DARK)) {
    if (!dark) break
    if (dark[k] !== v) problems.push('暗色 ' + k + ' 应为 ' + v + '，实际 ' + dark[k])
  }
  return problems
}


export function checkDir(dir) {
  const problems = []
  const htmlPath = resolve(dir, 'index.html')
  if (!existsSync(htmlPath)) return ['dist/index.html 不存在']
  const html = readFileSync(htmlPath, 'utf8')
  // 单页应用：站内链接在 js 里，不在 index.html 里。只查 html 会把正常的产物判成坏的。
  let bundle = html
  const assetsDir0 = resolve(dir, 'assets')
  if (existsSync(assetsDir0)) {
    for (const f of readdirSync(assetsDir0)) if (f.endsWith('.js')) bundle += readFileSync(resolve(assetsDir0, f), 'utf8')
  }
  for (const a of ANCHORS) if (!bundle.includes(a)) problems.push('产物里缺锚点：' + a)
  // 单页应用：资源必须是相对根路径，base 写错时页面能打开但一片空白
  const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
  if (!assets.length) problems.push('产物里找不到 /assets/ 下的 js 或 css')
  for (const a of assets) if (!existsSync(resolve(dir, a.replace(/^\//, '')))) problems.push('产物引用了不存在的文件：' + a)
  const assetsDir = resolve(dir, 'assets')
  if (!existsSync(assetsDir)) problems.push('缺 dist/assets')
  else {
    const files = readdirSync(assetsDir)
    if (!files.some((f) => f.endsWith('.js'))) problems.push('dist/assets 里没有 js')
    if (!files.some((f) => f.endsWith('.css'))) problems.push('dist/assets 里没有 css')
    if (!files.some((f) => /corpus/i.test(f))) problems.push('课文快照没有单独成块（corpus chunk）')
  }
  if (!existsSync(resolve(dir, 'CNAME'))) problems.push('缺 dist/CNAME，自定义域名会失效')
  if (!existsSync(resolve(dir, 'favicon.svg'))) problems.push('缺 favicon')
  // 颜色也在这里核对：五个站共用一套值，单独配一个工具不值得，但「有人顺手调好看一点」必须被抓到
  let css = null
  try { css = readFileSync(TOKENS, 'utf8') } catch { problems.push('读不到 src/styles/tokens.css') }
  if (css !== null) for (const p of checkText(css)) problems.push(p)
  return problems
}

function selftest() {
  const cases = []
  const bad = checkDir(resolve(HERE, '../no-such-dist'))
  if (!bad.length) { console.error('[!!] 不存在的 dist 没被抓到'); return 1 }
  cases.push('缺 dist 被抓')
  const dir = mkdtempSync(resolve(tmpdir(), 'lian-check-'))
  writeFileSync(resolve(dir, 'index.html'), '<html><head><title>错的</title></head><body>x</body></html>')
  const r = checkDir(dir)
  if (r.length < 3) { console.error('[!!] 坏产物只报了 ' + r.length + ' 条：' + r.join(' / ')); return 1 }
  cases.push('坏产物被抓（' + r.length + ' 条）')
  const goodTokens = readFileSync(TOKENS, 'utf8')
  if (checkText(goodTokens).length) { console.error('[!!] 本站 tokens.css 本身就不合格：' + checkText(goodTokens)[0]); return 1 }
  if (!checkText(goodTokens.replace('#c8442e', '#ff0000')).length) { console.error('[!!] 改了主色没被抓到'); return 1 }
  cases.push('改色被抓')
  if (!checkText(':root{--paper:#fff}').length) { console.error('[!!] 缺暗色块没被抓到'); return 1 }
  cases.push('缺暗色被抓')
  console.log('[ok] check-build --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
  return 0
}

const isEntry = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/check-build.mjs')
if (isEntry) {
  if (process.argv.includes('--selftest')) process.exitCode = selftest()
  else {
    const problems = checkDir(DIST)
    if (problems.length) { for (const p of problems) console.error('[!!] ' + p); process.exitCode = 1 }
    else console.log('[ok] 产物体检：dist 齐（' + ANCHORS.length + ' 个锚点、CNAME、favicon、corpus chunk）\n'
      + '     色值 ' + Object.keys(LIGHT).length + ' 个亮色 + ' + Object.keys(DARK).length + ' 个暗色与主站逐值一致')
  }
}
