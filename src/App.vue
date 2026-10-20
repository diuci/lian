<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import GameView from './components/GameView.vue'
import TabBar from './components/TabBar.vue'
import corpus from '~/data/corpus.json'
import { dayKey, parseDayKey } from '~/logic/daily.mjs'
import { KEYS, loadRecords, loadSettings, loadStage, loadPlayedPieces, saveSettings, saveStage } from '~/logic/store'
import { toggleTheme as coreToggle } from '../core/theme.mjs'
import { t, tf } from '~/logic/locale'
import parksData from '../core/parks.json'

type View = 'daily' | 'browse' | 'stats' | 'help'

const pieces = (corpus as any).pieces
const today = dayKey()

// 顶栏乐园数据单源 core/parks.json（当前项按 hostname 判定）
const PARKS = parksData.parks.map((p: any) => ({
  ...p,
  on: typeof location !== 'undefined' && p.href.includes(location.hostname),
}))

// 顶部菜单（v4.1）：小屏点开全部八站（含月冕/大作战——底栏不摆它们）；点外/Escape 收起
const menuOpen = ref(false)
function toggleMenu() { menuOpen.value = !menuOpen.value }
onMounted(() => {
  document.addEventListener('click', (e) => {
    const n = e.target as Element | null
    if (menuOpen.value && n && !n.closest('.dc-menu') && !n.closest('.dc-menu-btn')) menuOpen.value = false
  })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menuOpen.value = false })
})

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
const pieceById = new Map(pieces.map((p: any) => [p.id, p]))
function titleOf(rec: any) {
  const p = pieceById.get(rec.pieceId)
  return p ? p.title : rec.title
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
  // 切换走统一核心 core/theme（PLAN-全站统一-v2 追加）：data-theme/双 class/地址栏色全由 core 管
  dark.value = coreToggle() === 'dark'
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
    <!-- 顶栏：结构与样式单源 core/chrome.css（PLAN-全站统一-v3）。
         本站站内视图 tab（每日/浏览/战绩/说明）摆在牌子后，乐园整组靠右——
         八项乐园的起点与主站、汉兜对齐。 -->
    <header class="dc-nav">
      <div class="dc-nav-in">
      <a class="dc-brand" href="/">
        <span class="dc-seal">{{ t('brand.mark') }}</span>
        <span class="dc-brand-tx">
          <span class="dc-brand-t">{{ t('brand.name') }}</span>
          <span class="dc-brand-s">DIUCI</span>
        </span>
      </a>
      <!-- 站内视图：与主站、汉兜、古诗文库同一组、同一顺序、同一措辞 -->
      <nav class="nav">
        <button :class="['tab', view === 'daily' ? 'on' : '']" @click="backToDaily">{{ t('nav.daily') }}</button>
        <button :class="['tab', view === 'browse' ? 'on' : '']" @click="view = 'browse'">{{ t('nav.browse') }}</button>
        <button :class="['tab', view === 'stats' ? 'on' : '']" @click="view = 'stats'">{{ t('nav.stats') }}</button>
        <button :class="['tab', view === 'help' ? 'on' : '']" @click="view = 'help'">{{ t('nav.help') }}</button>
      </nav>
      <!-- 六个乐园：数据单源 core/parks.json（label 走词典 key，繁体由 i18n 接管），
           样式单源 chrome.css 的 .dc-nav-links -->
      <nav class="dc-nav-links" :aria-label="t('parks.aria')">
        <a v-for="p in PARKS" :key="p.href" :href="p.href"
           :aria-current="p.on ? 'page' : undefined" :class="{ on: p.on }">{{ t(p.key) }}</a>
      </nav>
      <button class="dc-menu-btn" type="button" :aria-label="t('parks.aria')" :title="t('parks.aria')"
              :aria-expanded="menuOpen ? 'true' : 'false'" @click.stop="toggleMenu">
        <svg class="i-bars" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6.8h16M4 12h16M4 17.2h16"/>
        </svg>
        <svg class="i-x" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
      <button class="dc-theme-btn" type="button" :title="dark ? t('theme.light') : t('theme.dark')" :aria-label="dark ? t('theme.light') : t('theme.dark')" @click="toggleTheme">
        <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2"/>
          <path d="M12 2.4v2.1M12 19.5v2.1M2.4 12h2.1M19.5 12h2.1M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5"/>
        </svg>
        <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z"/>
        </svg>
      </button>
      <nav class="dc-menu" :hidden="!menuOpen" :aria-label="t('parks.aria')">
        <div class="dc-menu-in">
          <a v-for="p in PARKS" :key="p.href" :href="p.href"
             :aria-current="p.on ? 'page' : undefined" :class="{ on: p.on }">{{ t(p.key) }}</a>
        </div>
      </nav>
      </div>
    </header>

    <main class="main dc-page-in">
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
            :class="['pill', stage === s ? 'on' : '']" @click="setStage(s)">{{ s }}</button>
          <span class="dim">{{ tf('browse.count', { n: stageCount }) }}</span>
        </div>
        <div v-for="[vol, list] in volumes" :key="vol" class="vol">
          <h3>{{ vol }}</h3>
          <ul>
            <li v-for="p in list" :key="p.id">
              <button class="piece" @click="play(p, 0)">
                <b>{{ p.title }}</b>
                <span class="dim">{{ p.dynasty }} · {{ p.author }}</span>
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

    <footer class="dc-foot">
      <div class="dc-foot-in">
      <div class="dc-foot-l">
        <a href="https://diuci.com/">{{ t('foot.brand') }}</a> · 课文来自内容仓必背篇目 · 注释 CC BY 4.0 · 代码 MIT ·
        <a href="https://k12.diuci.com/legal">{{ t('help.legal') }}</a>
      </div>
      <nav :aria-label="t('parks.aria')">
        <a v-for="p in PARKS" :key="p.href" :href="p.href">{{ p.label }}</a>
        <a href="mailto:hi@diuci.com">hi@diuci.com</a>
      </nav>
      </div>
    </footer>

    <TabBar />
  </div>
</template>

<style scoped>
.shell{min-height:100%;display:flex;flex-direction:column}
/* 顶栏/页脚/圆钮样式单源 core/chrome.css（v3）——这里只留本站特有的视图 tab。 */
.nav{display:flex;gap:2px}
.tab{
  border:0;background:none;color:var(--ink-soft);cursor:pointer;
  font-family:var(--serif);font-size:14px;padding:6px 12px;border-radius:8px;opacity:.6;
  white-space:nowrap
}
.tab:hover{opacity:.9}
.tab.on{opacity:1;background:var(--tag-bg);color:var(--ink)}
.langs{display:flex;gap:8px;margin-top:6px}
/* 本站顶栏比别站多一组视图 tab：≤560px 站名文字让位（印章保留），tab 行可滑动兜底，
   不许把布局视口撑出横向溢出（实测会连带 fixed 底栏一起跑出屏）。 */
@media (max-width:560px){
  .dc-brand-tx{display:none}
}
.nav{display:flex;gap:2px;min-width:0;overflow-x:auto;scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.tab{flex:none}
/* 本站顶栏比别站多一组视图 tab，乐园整组 ≤1080px 让位（chrome 的 768 断点之上） */
@media (max-width:1080px){ .dc-nav-links{display:none} }
.main{flex:1;padding-bottom:20px}
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
/* 页脚样式单源 core/chrome.css（v3） */
/* 乐园那一排与窄屏处理：chrome 768 断点 + 本站 1080 让位（上方） */
@media (max-width:430px){
  .nav{gap:0}
  .tab{padding:6px 7px;font-size:13px}
}
</style>
