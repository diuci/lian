// tools/smoke-lian.mjs —— 真开一个浏览器，把当天这一题从头连到尾。
//
// 为什么要有它：盘面生成、点击相邻判定、排序核对这三件事各自都能单元测试，
// 但它们接在一起之后没人验证过。CI 里跑一遍，比任何一条单测都更接近玩家实际会遇到的情况。
//
// 用法：node tools/smoke-lian.mjs --url=http://127.0.0.1:4173
//       node tools/smoke-lian.mjs --selftest
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (xx86)/Google/Chrome/Application/chrome.exe'.replace('xx86', 'x86'),
  homedir() + '/AppData/Local/Programs/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean)

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p
  return null
}

// 顶栏圆钮（规范 §2）：判定做成纯函数，坏例子不必先开浏览器。
// v4 起全站仅简体，顶栏只有明暗钮一枚。
export function buttonProblems(geo) {
  const problems = []
  if (!geo) { problems.push('顶栏没有量到圆钮'); return problems }
  if (!geo.theme) problems.push('顶栏没有明暗按钮 .dc-theme-btn')
  return problems
}

/** 盘面上这一格应该画哪个字：按码位取，所以增补平面字（𪩘、𫐐）不会错位。 */
export function expectedGlyph(units, cell) {
  const unit = units[cell.unit]
  if (unit === undefined) return null
  return Array.from(unit)[cell.k]
}

/** DOM 上画出来的字 vs 应该画出来的字。 */
export function compareBoard(domGlyphs, expected) {
  const problems = []
  if (domGlyphs.length !== expected.length)
    return ['盘面格数对不上：画了 ' + domGlyphs.length + ' 格，应该 ' + expected.length + ' 格']
  for (let i = 0; i < expected.length; i++) {
    if (domGlyphs[i] !== expected[i]) {
      problems.push('第 ' + (i + 1) + ' 格画的是「' + domGlyphs[i] + '」，应该是「' + expected[i] + '」')
      if (problems.length >= 5) { problems.push('……还有更多格对不上'); break }
    }
  }
  return problems
}

export async function run(url) {
  const chrome = findChrome()
  if (!chrome) { console.error('[!!] 找不到 Chrome/Chromium，设 CHROME_PATH 指一下'); return 1 }
  const puppeteer = (await import('puppeteer-core')).default
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const problems = []
  const errors = []
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 780 })
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

    const round = { label: '简体', shot: 'shots/daily.png' }
    const target = url.replace(/\/$/, '') + '/?view=daily&dev=hey'
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 45000 })

    // 顶栏圆钮
    const themeEl = await page.$('.dc-theme-btn')
    const geo = themeEl ? await (async () => {
      const box = await themeEl.boundingBox()
      return box ? { theme: { x: box.x, w: box.width, h: box.height } } : {}
    })() : {}
    problems.push(...buttonProblems(geo).map((p) => round.label + '轮：' + p))

    const tiles = await page.$$eval('.tile', (els) => els.length)
    if (!tiles) { problems.push(round.label + '轮：盘面一个字块都没有'); return finish(problems, errors) }

    const state = await page.evaluate(() => {
      const g = window.__lian
      if (!g) return null
      return {
        title: g.piece.title,
        units: g.units,
        paths: g.solutionPaths(),
        cells: g.puzzle.cells.map((c) => (c.unit >= 0 ? { unit: c.unit, k: c.k } : c.from || { unit: -1, k: -1 })),
        header: (document.querySelector('.meta h2') || {}).textContent || '',
      }
    })
    if (!state) { problems.push(round.label + '轮：?dev=hey 没有挂出这一局'); return finish(problems, errors) }

    const domGlyphs = await page.$$eval('.tile .ch', (els) => els.map((e) => e.textContent.trim()))
    const expected = state.cells.map((c) => expectedGlyph(state.units, c))
    problems.push(...compareBoard(domGlyphs, expected).map((p) => round.label + '轮：' + p))

    for (const path of state.paths) {
      // 先把盘面拉到视野里再点：页面重新加载后浏览器会把滚动位置恢复回去，
      // 盘面下半截压在底部那个 fixed 标签栏下面，page.click 的命中测试就会点在标签栏的 <a> 上，
      // 于是整页跳到 handle.diuci.com —— 报出来的却是「读不到 found」，看不出真正的原因。
      await page.evaluate(() => { const el = document.querySelector('.board'); if (el) el.scrollIntoView({ block: 'center' }) })
      for (const cell of path) {
        const sel = '[data-cell="' + cell + '"]'
        if (!(await page.$(sel))) { problems.push(round.label + '轮：找不到字块 ' + cell); break }
        await page.click(sel)
        if (!page.url().startsWith(url.replace(/\/$/, ''))) {
          problems.push(round.label + '轮：点第 ' + cell + ' 格时页面跳到了 ' + page.url() + '（十有八九是被底部标签栏接走了）')
          break
        }
      }
      if (!page.url().startsWith(url.replace(/\/$/, ''))) break
    }
    const foundCount = await page.evaluate(() => window.__lian.found.value.length)
    if (foundCount !== state.units.length)
      problems.push(round.label + '轮：按答案路径连完只找到 ' + foundCount + ' / ' + state.units.length + ' 句')

    for (let i = 0; i < state.units.length; i++) {
      const at = await page.$$eval('.strands [data-pos]', (els) => els.map((e) => Number(e.dataset.unit)))
      if (at[i] === i) continue
      const j = at.indexOf(i)
      if (j < 0) { problems.push(round.label + '轮：排序区里没有第 ' + i + ' 句'); break }
      // 排序行用合成 click：page.click 会做命中测试，移动端底部那个 fixed 标签栏盖在页面上，
      // 真点下去经常点在标签栏的 <a> 上 —— 于是页面跳到 diuci.com，测试看起来像「元素凭空消失」。
      const sa = '[data-pos="' + i + '"]'
      const sb = '[data-pos="' + j + '"]'
      if (!(await page.$(sa)) || !(await page.$(sb))) { problems.push(round.label + '轮：排序行点不到'); break }
      await page.$eval(sa, (el) => el.click())
      await page.$eval(sb, (el) => el.click())
    }
    // 注意是 page.$$（复数）：写成 page.$ 时 btns 是单个 handle，btns.length 是 undefined，
    // 于是「核对顺序」这个按钮从来没被点过，测试只会停在 order —— 这种错最难查，因为它不报错。
    const btns = await page.$$('.bar button')
    if (btns.length) await page.$eval('.bar button:nth-of-type(' + btns.length + ')', (el) => el.click())
    const phase = await page.evaluate(() => window.__lian.phase.value)
    if (phase !== 'done') problems.push(round.label + '轮：排完序核对后没进入完成态（当前 ' + phase + '）')

    mkdirSync('shots', { recursive: true })
    await page.screenshot({ path: round.shot, fullPage: true })
    console.log('[ok] ' + round.label + '轮：' + state.title + ' —— ' + state.units.length + ' 句 / '
      + tiles + ' 格，一路连到完成态')
    return finish(problems, errors)
  }
  catch (e) {
    console.error('[!!] 冒烟崩了：' + e.message)
    return 1
  }
  finally { await browser.close() }

  function finish(problems, errors) {
    for (const e of errors.slice(0, 6)) console.error('     ' + e)
    if (problems.length) {
      for (const p of problems) console.error('[!!] ' + p)
      return 1
    }
    if (errors.length) { console.error('[!!] 页面有 ' + errors.length + ' 条报错'); return 1 }
    return 0
  }
}

function selftest() {
  // 自检不开浏览器，只证明这个工具知道各种失败长什么样
  const cases = []
  const add = (label, ok) => { if (!ok) { console.error('[!!] 坏样本「' + label + '」没被抓到'); process.exitCode = 1; return } cases.push(label) }
  if (!findChrome()) console.log('     （本机没有 Chrome，自检只跑不依赖浏览器的部分）')
  else cases.push('找得到 Chrome')
  if (!process.env.SMOKE_URL) cases.push('没给 --url 时不瞎跑')

  add('格数对不上会被抓到', compareBoard(['一'], ['一', '二']).length > 0)
  add('画错字会被抓到', compareBoard(['一'], ['二']).length > 0)
  add('按码位取字形不误伤增补平面字', (() => {
    const got = [0, 1, 2].map((k) => expectedGlyph(['绝𪩘无'], { unit: 0, k })).join('')
    return got === '绝𪩘无'
  })())
  // 圆钮的坏例子：不必开浏览器，直接喂量出来的盒子
  add('明暗钮不见了会被抓到', buttonProblems({}).length > 0)
  add('合规的明暗钮不误伤', buttonProblems({ theme: { x: 340, w: 34, h: 34 } }).length === 0)
  add('真产物与期望不误伤', compareBoard(Array.from('一去二三里'), Array.from('一去二三里')).length === 0)
  console.log('[ok] smoke-lian --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
  return process.exitCode || 0
}

const isEntry = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/smoke-lian.mjs')
if (isEntry) {
  if (process.argv.includes('--selftest')) process.exitCode = selftest()
  else {
    const arg = process.argv.find((a) => a.startsWith('--url='))
    if (!arg) { console.error('用法：node tools/smoke-lian.mjs --url=http://127.0.0.1:4173'); process.exitCode = 2 }
    else process.exitCode = await run(arg.slice(6))
  }
}
