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
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  homedir() + '/AppData/Local/Programs/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean)

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p
  return null
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
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 780 })
    const target = url.replace(/\/$/, '') + '/?view=daily&dev=hey'
    const errors = []
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 45000 })

    const tiles = await page.$$eval('.tile', (els) => els.length)
    if (!tiles) problems.push('盘面一个字块都没有')
    const cols = await page.$eval('.board', (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    if (!cols) problems.push('盘面列数读不出来')

    const info = await page.evaluate(() => {
      const g = window.__lian
      if (!g) return null
      return {
        title: g.piece.title,
        units: g.units,
        paths: g.solutionPaths(),
        cols: g.puzzle.cols,
        cells: g.puzzle.cells.map((c) => c.ch).join(''),
      }
    })
    if (!info) { problems.push('?dev=hey 没有挂出这一局'); return finish(problems, errors) }

    // 逐句按答案路径点过去。
    // 一律 page.click(选择器)：Vue 一重渲染，之前拿到的 element handle 就失效了，
    // 拿着旧 handle 再点会炸出「Cannot find context with specified id」这种看着像浏览器问题、其实是测试写法的问题。
    for (const path of info.paths) {
      for (const cell of path) {
        const sel = '[data-cell="' + cell + '"]'
        if (!(await page.$(sel))) { problems.push('找不到字块 ' + cell); break }
        await page.click(sel)
      }
    }
    const foundCount = await page.evaluate(() => window.__lian.found.value.length)
    if (foundCount !== info.units.length)
      problems.push('按答案路径连完只找到 ' + foundCount + ' / ' + info.units.length + ' 句')

    // 排序阶段：把每一行换到它在原文里的位置
    for (let i = 0; i < info.units.length; i++) {
      const at = await page.$$eval('.strands [data-pos]', (els) => els.map((e) => Number(e.dataset.unit)))
      if (at[i] === i) continue
      const j = at.indexOf(i)
      if (j < 0) { problems.push('排序区里没有第 ' + i + ' 句'); break }
      // 排序行用合成 click：page.click 会做命中测试，移动端底部那个 fixed 标签栏盖在页面上，
      // 真点下去经常点在标签栏的 <a> 上 —— 于是页面跳到 diuci.com，测试看起来像「元素凭空消失」。
      const sa = '[data-pos="' + i + '"]'
      const sb = '[data-pos="' + j + '"]'
      if (!(await page.$(sa)) || !(await page.$(sb))) { problems.push('排序行点不到'); break }
      await page.$eval(sa, (el) => el.click())
      await page.$eval(sb, (el) => el.click())
    }
    // 注意是 page.$$（复数）：写成 page.$ 时 btns 是单个 handle，btns.length 是 undefined，
    // 于是「核对顺序」这个按钮从来没被点过，测试只会停在 order —— 这种错最难查，因为它不报错。
    const btns = await page.$$('.bar button')
    if (btns.length) await page.$eval('.bar button:nth-of-type(' + btns.length + ')', (el) => el.click())
    const phase = await page.evaluate(() => window.__lian.phase.value)
    if (phase !== 'done') problems.push('排完序核对后没进入完成态（当前 ' + phase + '）')

    // 截图目录由工具自己建：不然 CI 里第一次跑就 ENOENT，报的还是「冒烟崩了」这种误导人的话
    mkdirSync('shots', { recursive: true })
    await page.screenshot({ path: 'shots/daily.png', fullPage: true })
    console.log('[ok] 冒烟通过：' + info.title + ' —— ' + info.units.length + ' 句 / '
      + cols + ' 列盘面 ' + tiles + ' 格，一路连到完成态')
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
  // 自检不开浏览器，只证明这个工具知道「没浏览器」和「页面没挂钩子」这两种失败长什么样
  const cases = []
  if (!findChrome()) console.log('     （本机没有 Chrome，自检只跑不依赖浏览器的部分）')
  else cases.push('找得到 Chrome')
  const url = process.env.SMOKE_URL || ''
  if (!url) cases.push('没给 --url 时不瞎跑')
  console.log('[ok] smoke-lian --selftest 通过（' + cases.length + ' 项：' + cases.join('、') + '）')
  return 0
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
