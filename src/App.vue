<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import GameView from './components/GameView.vue'
import TabBar from './components/TabBar.vue'
import corpus from '~/data/corpus.json'
import { dayKey, parseDayKey } from '~/logic/daily.mjs'
import { KEYS, loadRecords, loadSettings, loadStage, loadPlayedPieces, saveSettings, saveStage } from '~/logic/store'
import { hant, locale, setLocale, t, tf, toggleLocale } from '~/logic/locale'
import { tradLabel, tradStage, tradVolume } from '~/logic/trad'

type View = 'daily' | 'browse' | 'stats' | 'help'

const pieces = (corpus as any).pieces
const today = dayKey()

const params = new URLSearchParams(location.search)
const view = ref<View>((params.get('view') as View) || 'daily')
const stage = ref(params.get('stage') || loadStage() || '小学')
// 链接里的篇目 id 必须先对得上快照。对不上就当没这个参数：
// 之前直接把 URL 上的字符串交给 useGame，快照里没有这篇就抛错，
// 整个组件树在 setup 里炸掉 —— 一个打错的分享链接能让整页变白。
const wantedPiece = params.get('p') || ''
const knownPiece = pieces.find((x: any) => x.id === wantedPiece)
const practicePiece = ref(knownPiece ? wantedPiece : '')
const badLink = ref(knownPiece || !wantedPiece ? '' : wantedPiece)
const practicePart = ref(knownPiece
  ? Math.max(0, Math.min(Number(params.get('part') || 0), (knownPiece.parts || []).length - 1))
  : 0)
const day = (() => {
  const d = parseDayKey(params.get('d'))
  return d ? dayKey(d) : today
})()

const settings = ref(loadSettings())
const isHant = computed(() => hant())
const pieceById = new Map(pieces.map((p: any) => [p.id, p]))
// 战绩里存的是简体篇名；繁体那一遍按 id 找回这篇的繁体标签，找不回就照简体摆。
function titleOf(rec: any) {
  const p = pieceById.get(rec.pieceId)
  return p ? tradLabel(p, 'title', isHant.value) : rec.title
}

// 拼音是可选显示，默认关。所以读音表不在首屏包里：151 KB 的表不该为一个人不看的开关先下载。
// 打开开关时才 import，Vite 会把它切成单独的 chunk。
const readings = ref<Record<string, { common: string }>>({})
async function ensureReadings() {
  if (Object.keys(readings.value).length) return
  const mod: any = await import('~/data/readings.json')
  readings.value = (mod.default && mod.default.chars) || mod.chars || {}
}
watch(settings, (v) => { if (v.showPinyin) ensureReadings() }, { immediate: true })
const records = ref(loadRecords())
const played = ref(loadPlayedPieces())
const dark = ref(document.documentElement.dataset.theme === 'dark')
const replayKey = ref(0)

const mode = computed(() => (practicePiece.value ? 'practice' : 'daily'))
const gameDay = computed(() => (mode.value === 'daily' ? day : today))
const pick = computed(() => (practicePiece.value ? { pieceId: practicePiece.value, part: practicePart.value } : undefined))

const volumes = computed(() => {
  const map = new Map<string, any[]>()
  for (const p of pieces) {
    if (p.stage !== stage.value) continue
    if (!map.has(p.volume)) map.set(p.volume, [])
    map.get(p.volume)!.push(p)
  }
  return [...map.entries()]
})
const stageCount = computed(() => pieces.filter((p: any) => p.stage === stage.value).length)

function setStage(s: string) { stage.value = s; saveStage(s) }
function play(p: any, part = 0) {
  practicePiece.value = p.id
  practicePart.value = part
  view.value = 'daily'
  replayKey.value++
  history.replaceState(null, '', '?view=daily&p=' + encodeURIComponent(p.id) + '&part=' + part)
}
function backToDaily() {
  practicePiece.value = ''
  practicePart.value = 0
  replayKey.value++
  history.replaceState(null, '', '?view=daily')
}
function toggleTheme() {
  dark.value = !dark.value
  const t = dark.value ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
  document.documentElement.classList.toggle('dark', dark.value)
  try { localStorage.setItem(KEYS.theme, t) } catch {}
  const meta = document.getElementById('metaTheme')
  if (meta) meta.setAttribute('content', dark.value ? '#17140f' : '#f4ede0')
}
function save() { saveSettings(settings.value) }
function refreshRecords() { records.value = loadRecords(); played.value = loadPlayedPieces() }

watch(view, (v) => { if (v === 'stats') refreshRecords() })

const solvedCount = computed(() => records.value.days.filter((d: any) => d.solved).length)
const dailyCount = computed(() => records.value.days.filter((d: any) => d.mode === 'daily').length)

onMounted(() => { if (view.value === 'stats') refreshRecords() })
</script>

<template>
  <div class="shell">
    <header class="top">
      <!-- 主站的顶栏是「满宽的条 + 1160 网格的内层」两层：
           背景与毛玻璃铺满视口，内容落在 1160 网格、左右 24px。
           之前这里只有一层 padding:10px 20px，整条顶栏贴到屏幕边，印章在 19px，
           主站在 84px，同一排链接的位置自然对不上。 -->
      <div class="top-in">
      <a class="brand" href="/">
        <span class="mark">{{ t('brand.mark') }}</span>
        <span class="brand-tx">
          <span class="name">{{ t('brand.name') }}</span>
          <span class="brand-sub">DIUCI</span>
        </span>
      </a>
      <!-- 六个乐园：与主站、汉兜、古诗文库同一组、同一顺序、同一措辞 -->
      <nav class="nav">
        <button :class="['tab', view === 'daily' ? 'on' : '']" @click="backToDaily">{{ t('nav.daily') }}</button>
        <button :class="['tab', view === 'browse' ? 'on' : '']" @click="view = 'browse'">{{ t('nav.browse') }}</button>
        <button :class="['tab', view === 'stats' ? 'on' : '']" @click="view = 'stats'">{{ t('nav.stats') }}</button>
        <button :class="['tab', view === 'help' ? 'on' : '']" @click="view = 'help'">{{ t('nav.help') }}</button>
      </nav>
      <nav class="parks" :aria-label="t('parks.aria')">
        <a href="https://diuci.com/">{{ t('parks.home') }}</a>
        <a href="https://k12.diuci.com/">{{ t('parks.k12') }}</a>
        <a href="https://lian.diuci.com/" aria-current="page" class="on">{{ t('parks.lian') }}</a>
        <a href="https://handle.diuci.com/">{{ t('parks.handle') }}</a>
        <a href="https://moon.diuci.com/">{{ t('parks.moon') }}</a>
        <a href="https://ink.diuci.com/">{{ t('parks.ink') }}</a>
      </nav>
      <button class="lang" type="button" :title="t('lang.aria')" :aria-label="t('lang.aria')" @click="toggleLocale">
        {{ isHant ? t('lang.toHans') : t('lang.toHant') }}
      </button>
      <button class="theme" type="button" :title="dark ? t('theme.light') : t('theme.dark')" :aria-label="dark ? t('theme.light') : t('theme.dark')" @click="toggleTheme">
        <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2"/>
          <path d="M12 2.4v2.1M12 19.5v2.1M2.4 12h2.1M19.5 12h2.1M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5"/>
        </svg>
        <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z"/>
        </svg>
      </button>
      </div>
    </header>

    <main class="main">
      <p v-if="badLink" class="notice">
        {{ tf('notice.badLink', { id: badLink }) }}
        {{ t('notice.maybeVersion') }}<a href="#" @click.prevent="view = 'browse'">{{ t('notice.browse') }}</a>{{ t('notice.pickTail') }}
      </p>
      <GameView
        v-if="view === 'daily'"
        :key="gameDay + '|' + practicePiece + '|' + replayKey"
        :source="corpus"
        :day="gameDay"
        :mode="mode"
        :pick="pick"
        :readings="readings.value"
        :show-target="settings.showTarget"
        :show-pinyin="settings.showPinyin"
        @replay="backToDaily"
      />

      <section v-else-if="view === 'browse'" class="panel">
        <h2>{{ t('browse.title') }}</h2>
        <p class="lead">{{ tf('browse.lead', { count: corpus.count }) }}</p>
        <div class="stages">
          <button v-for="s in ['小学', '初中', '高中']" :key="s"
            :class="['pill', stage === s ? 'on' : '']" @click="setStage(s)">{{ tradStage(s, isHant) }}</button>
          <span class="dim">{{ tf('browse.count', { n: stageCount }) }}</span>
        </div>
        <div v-for="[vol, list] in volumes" :key="vol" class="vol">
          <h3>{{ tradVolume(vol, isHant) }}</h3>
          <ul>
            <li v-for="p in list" :key="p.id">
              <button class="piece" @click="play(p, 0)">
                <b>{{ tradLabel(p, 'title', isHant) }}</b>
                <span class="dim">{{ tradLabel(p, 'dynasty', isHant) }} · {{ tradLabel(p, 'author', isHant) }}</span>
                <span class="tags">
                  <span class="tag">{{ tf('browse.units', { n: p.totalUnits }) }}</span>
                  <span class="tag">{{ tf('browse.chars', { n: p.totalChars }) }}</span>
                  <span v-if="p.parts.length > 1" class="tag">{{ tf('browse.parts', { n: p.parts.length }) }}</span>
                  <span v-if="played[p.id]" class="tag played">{{ tf('browse.played', { n: played[p.id] }) }}</span>
                </span>
              </button>
              <button v-for="pt in p.parts.slice(1)" :key="pt.index" class="partbtn" @click="play(p, pt.index)">
                {{ tf('browse.partN', { n: pt.index + 1 }) }}
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section v-else-if="view === 'stats'" class="panel">
        <h2>{{ t('nav.stats') }}</h2>
        <p class="lead">{{ t('stats.lead') }}</p>
        <div class="nums">
          <div><b>{{ dailyCount }}</b><span>{{ t('stats.daily') }}</span></div>
          <div><b>{{ solvedCount }}</b><span>{{ t('stats.solved') }}</span></div>
          <div><b>{{ records.streak }}</b><span>{{ t('stats.streak') }}</span></div>
        </div>
        <h3>{{ t('stats.recent') }}</h3>
        <ul class="recent">
          <li v-for="(r, i) in records.days.slice(-12).reverse()" :key="i">
            <span class="dim">{{ r.mode === 'daily' ? r.day : t('stats.practice') }}</span>
            <b>{{ titleOf(r) }}</b>
            <span class="dim">{{ tf('stats.line', { units: r.units, mistakes: r.mistakes, state: r.solved ? t('stats.done') : t('stats.undone') }) }}</span>
          </li>
          <li v-if="!records.days.length" class="dim">{{ t('stats.empty') }}</li>
        </ul>
        <h3>{{ t('stats.settings') }}</h3>
        <label class="opt"><input type="checkbox" v-model="settings.showTarget" @change="save"> {{ t('stats.optTarget') }}</label>
        <label class="opt"><input type="checkbox" v-model="settings.showPinyin" @change="save"> {{ t('stats.optPinyin') }}</label>
        <p class="dim">{{ t('stats.optNote') }}</p>
        <p class="dim">{{ t('stats.locale') }}</p>
        <div class="langs">
          <button :class="['pill', !isHant ? 'on' : '']" @click="setLocale('hans')">{{ t('lang.hans') }}</button>
          <button :class="['pill', isHant ? 'on' : '']" @click="setLocale('hant')">{{ t('lang.hant') }}</button>
        </div>
      </section>

      <section v-else class="panel">
        <h2>{{ t('nav.help') }}</h2>
        <ol class="rules">
          <li><b>{{ t('help.r1b') }}</b>{{ t('help.r1a') }}<em>{{ t('help.r1em') }}</em>{{ t('help.r1z') }}</li>
          <li><b>{{ t('help.r2b') }}</b>{{ t('help.r2') }}</li>
          <li><b>{{ t('help.r3b') }}</b>{{ t('help.r3') }}<code>?d=2026-10-01</code>。</li>
          <li><b>{{ t('help.r4b') }}</b>{{ t('help.r4') }}</li>
        </ol>
        <p class="lead">
          {{ t('help.lead') }}
          <a href="https://k12.diuci.com/legal">{{ t('help.legal') }}</a> ·
          <a href="mailto:hi@diuci.com">hi@diuci.com</a>
        </p>
      </section>
    </main>

    <footer class="foot">
      <div class="foot-in">
      <div class="foot-l">
        <a href="https://diuci.com/">{{ t('foot.brand') }}</a> · {{ t('foot.sub') }}<br>
        {{ tf('foot.snapshot', { version: corpus.contentVersion, count: corpus.count }) }}
        <template v-if="corpus.sourceTotal">{{ tf('foot.repo', { total: corpus.sourceTotal, skipped: (corpus.skipped || []).length }) }}</template><br>
        <a href="https://k12.diuci.com/legal">{{ t('foot.license') }}</a>
      </div>
      <nav :aria-label="t('parks.aria')">
        <a href="https://k12.diuci.com/">{{ t('parks.k12') }}</a>
        <a href="https://lian.diuci.com/">{{ t('parks.lian') }}</a>
        <a href="https://handle.diuci.com/">{{ t('parks.handle') }}</a>
        <a href="https://moon.diuci.com/">{{ t('parks.moon') }}</a>
        <a href="https://ink.diuci.com/">{{ t('parks.ink') }}</a>
        <a href="https://github.com/diuci/k12-chinese-poetry">{{ t('foot.contentRepo') }}</a>
      </nav>
      </div>
    </footer>

    <TabBar />
  </div>
</template>

<style scoped>
.shell{min-height:100%;display:flex;flex-direction:column}
.top{
  position:sticky;top:0;z-index:20;
  background:var(--nav-bg);backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line)
}
/* 与主站 .wrap.nav-in 逐值一致：1160px 网格、24px 内边距、66px 栏高 */
.top-in{
  display:flex;align-items:center;gap:28px;
  height:66px;max-width:1160px;margin:0 auto;padding:0 24px;box-sizing:border-box
}
/* 牌子与主站逐值一致：印章 40px、渐变、-4° 倾角、站名 21px、DIUCI 10px */
.brand{display:flex;align-items:center;gap:11px;text-decoration:none;color:var(--ink);flex:none}
.mark{
  width:40px;height:40px;flex:0 0 40px;border-radius:9px;display:grid;place-items:center;
  background:linear-gradient(155deg,var(--cinnabar),var(--cinnabar-deep));
  color:var(--on-accent);font-family:var(--round);font-size:23px;line-height:1;
  box-shadow:0 3px 10px -2px rgba(200,68,46,.5);transform:rotate(-4deg)
}
.brand-tx{display:block}
.name{display:block;font-family:var(--round);font-size:21px;letter-spacing:.04em;line-height:1.25;white-space:nowrap}
/* 主站的 brand-s 没有单独指定字体，跟着正文走衬线 */
/* DIUCI 跟着站名同一只笔：圆体 ZCOOL KuaiLe，四站的副标都是这一款。 */
.brand-sub{display:block;font-family:var(--round);font-size:10px;letter-spacing:.24em;color:var(--ink-faint);margin-top:1px}
/* 六个乐园：主站 .nav-links 那套（26px 间距、衬线 14.5px、悬停朱砂 + 下划线展开） */
.parks{display:flex;gap:26px;margin-left:auto}
.parks a{
  font-family:var(--serif);font-size:14.5px;color:var(--ink-soft);text-decoration:none;
  border-bottom:0;position:relative;padding:4px 0;transition:color .22s;white-space:nowrap
}
.parks a::after{
  content:'';position:absolute;left:0;bottom:0;width:0;height:2px;
  background:var(--cinnabar);transition:width .28s cubic-bezier(.4,0,.2,1)
}
.parks a:hover{color:var(--cinnabar);border-bottom-color:transparent}
.parks a:hover::after{width:100%}
.parks a.on{color:var(--cinnabar)}
.parks a.on::after{width:100%}
.nav{display:flex;gap:2px}
.tab{
  border:0;background:none;color:var(--ink-soft);cursor:pointer;
  font-family:var(--serif);font-size:14px;padding:6px 12px;border-radius:8px;opacity:.6;
  white-space:nowrap
}
.tab:hover{opacity:.9}
.tab.on{opacity:1;background:var(--tag-bg);color:var(--ink)}
/* 主站那枚圆钮：38px、描边、surface 底、太阳/月亮 SVG 互换 */
.theme{
  width:38px;height:38px;flex:0 0 38px;border-radius:50%;cursor:pointer;padding:0;
  background:var(--surface);border:1px solid var(--line);color:var(--ink);
  display:grid;place-items:center;
  transition:transform .3s cubic-bezier(.34,1.56,.64,1),background .25s,border-color .25s,color .25s
}
.theme:hover{color:var(--cinnabar);border-color:var(--cinnabar);transform:rotate(18deg) scale(1.08)}
/* 繁简那一枚：与主题钮同尺寸，字用圆体 */
.lang{
  width:38px;height:38px;flex:0 0 38px;border-radius:50%;cursor:pointer;padding:0;
  background:var(--surface);border:1px solid var(--line);color:var(--ink);
  font-family:var(--round);font-size:15px;display:grid;place-items:center
}
.lang:hover{color:var(--cinnabar);border-color:var(--cinnabar)}
.langs{display:flex;gap:8px;margin-top:6px}
.theme svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.theme .i-sun{display:block}
.theme .i-moon{display:none}
:root[data-theme="dark"] .theme .i-sun{display:none}
:root[data-theme="dark"] .theme .i-moon{display:block}
.main{flex:1;padding-bottom:78px}
.notice{
  margin:0 0 14px;padding:10px 14px;border-radius:10px;
  border:1px solid var(--line);background:var(--surface-3);
  font-size:13.5px;color:var(--ink-soft);line-height:1.7
}
.notice a{color:var(--cinnabar)}
.panel{max-width:640px;margin:0 auto;padding:22px 20px}
.panel h2{font-family:var(--round);font-size:21px;margin:0 0 6px}
.panel h3{font-family:var(--round);font-size:15px;margin:22px 0 8px}
.lead{color:var(--ink-soft);font-size:13.5px;margin:0 0 14px}
.dim{color:var(--ink-faint);font-size:12.5px}
.stages{display:flex;gap:8px;align-items:center;margin-bottom:6px}
.pill{
  border:1px solid var(--line);background:var(--surface);color:var(--ink-soft);
  border-radius:999px;padding:5px 14px;cursor:pointer;font-family:var(--serif);font-size:13.5px
}
.pill.on{background:var(--cinnabar);border-color:var(--cinnabar);color:var(--on-accent)}
.vol h3{margin:18px 0 6px}
.vol ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.piece{
  width:100%;text-align:left;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;
  border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:9px 12px;cursor:pointer
}
.piece b{font-family:var(--brush);font-size:17px;font-weight:600}
.tags{display:flex;gap:5px;margin-left:auto}
.tag{font-size:11px;color:var(--ink-faint);border:1px solid var(--line);border-radius:6px;padding:1px 6px}
.tag.played{color:var(--celadon);border-color:var(--celadon)}
.partbtn{
  border:1px dashed var(--line);background:none;color:var(--ink-faint);border-radius:8px;
  padding:4px 10px;font-size:12px;cursor:pointer;margin-top:4px
}
.nums{display:flex;gap:10px;margin:14px 0}
.nums div{flex:1;border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center;background:var(--surface)}
.nums b{display:block;font-family:var(--round);font-size:24px}
.nums span{font-size:12px;color:var(--ink-faint)}
.recent{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:13px}
.recent li{display:flex;gap:8px;align-items:baseline;border-bottom:1px dashed var(--line);padding:6px 0}
.opt{display:flex;gap:8px;align-items:center;font-size:14px;margin:6px 0}
.rules{padding-left:18px;line-height:1.9;font-size:14.5px}
.rules b{font-family:var(--round)}
.rules em{font-style:normal;border-bottom:2px solid var(--gold)}
code{background:var(--tag-bg);padding:1px 6px;border-radius:6px;font-size:12.5px}
/* 主站页脚：上边框 + 左块三行 + 右侧六个乐园 */
/* 主站页脚：满宽的 footer + 1160 网格的内层（padding 38px 0，内层 0 24px） */
.foot{
  border-top:1px solid var(--line);margin-top:34px;
  background:var(--surface-3);padding:38px 0 84px
}
.foot-in{
  max-width:1160px;margin:0 auto;padding:0 24px;box-sizing:border-box;
  display:flex;flex-wrap:wrap;gap:16px 30px;align-items:center;justify-content:space-between;
  font-size:13.4px;color:var(--ink-faint)
}
.foot-l{line-height:1.9}
.foot-l a{color:var(--cinnabar);border-bottom:0}
.foot-l a:hover{text-decoration:underline}
.foot nav{display:flex;flex-wrap:wrap;gap:20px}
.foot nav a{font-size:13.6px;color:var(--ink-soft);border-bottom:0;text-decoration:none;transition:color .2s}
.foot nav a:hover{color:var(--cinnabar)}
/* 乐园那一排在窄屏让位给底部标签栏（与汉兜、主站同一处理） */
@media (max-width:1080px){ .parks{display:none} }
@media (max-width:430px){
  .top-in{padding:0 16px;gap:10px;height:56px}
  .mark{width:34px;height:34px;flex:0 0 34px;font-size:20px}
  .name{font-size:18px}
  .brand-sub{font-size:9px;letter-spacing:.2em}
  .theme{width:34px;height:34px;flex:0 0 34px}
  .theme svg{width:17px;height:17px}
  .nav{gap:0}
  .tab{padding:6px 7px;font-size:13px}
}
@media (min-width:940px){ .main{padding-bottom:20px} .foot{padding-bottom:24px} }
</style>
