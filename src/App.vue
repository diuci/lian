<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import GameView from './components/GameView.vue'
import TabBar from './components/TabBar.vue'
import corpus from '~/data/corpus.json'
import { dayKey, parseDayKey } from '~/logic/daily.mjs'
import { KEYS, loadRecords, loadSettings, loadStage, loadPlayedPieces, saveSettings, saveStage } from '~/logic/store'

type View = 'daily' | 'browse' | 'stats' | 'help'

const pieces = (corpus as any).pieces
const today = dayKey()

const params = new URLSearchParams(location.search)
const view = ref<View>((params.get('view') as View) || 'daily')
const stage = ref(params.get('stage') || loadStage() || '小学')
const practicePiece = ref(params.get('p') || '')
const practicePart = ref(Number(params.get('part') || 0))
const day = (() => {
  const d = parseDayKey(params.get('d'))
  return d ? dayKey(d) : today
})()

const settings = ref(loadSettings())

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
      <a class="brand" href="/">
        <span class="mark">连</span>
        <span class="name">连词成句</span>
      </a>
      <nav class="nav">
        <button :class="['tab', view === 'daily' ? 'on' : '']" @click="backToDaily">今日</button>
        <button :class="['tab', view === 'browse' ? 'on' : '']" @click="view = 'browse'">浏览</button>
        <button :class="['tab', view === 'stats' ? 'on' : '']" @click="view = 'stats'">战绩</button>
        <button :class="['tab', view === 'help' ? 'on' : '']" @click="view = 'help'">玩法</button>
      </nav>
      <button class="theme icon-btn" :title="dark ? '切回宣纸' : '切到夜墨'" @click="toggleTheme">
        <span v-if="dark">☀</span><span v-else>☾</span>
      </button>
    </header>

    <main class="main">
      <GameView
        v-if="view === 'daily'"
        :key="gameDay + '|' + practicePiece + '|' + replayKey"
        :pieces="pieces"
        :day="gameDay"
        :mode="mode"
        :pick="pick"
        :readings="readings.value"
        :show-target="settings.showTarget"
        :show-pinyin="settings.showPinyin"
        @replay="backToDaily"
      />

      <section v-else-if="view === 'browse'" class="panel">
        <h2>按学段挑一篇</h2>
        <p class="lead">
          {{ corpus.count }} 篇能玩的课文，来自课标与统编教材的必背篇目。
          超过一盘的篇目会分成几段，一段一盘。
        </p>
        <div class="stages">
          <button v-for="s in ['小学', '初中', '高中']" :key="s"
            :class="['pill', stage === s ? 'on' : '']" @click="setStage(s)">{{ s }}</button>
          <span class="dim">{{ stageCount }} 篇</span>
        </div>
        <div v-for="[vol, list] in volumes" :key="vol" class="vol">
          <h3>{{ vol }}</h3>
          <ul>
            <li v-for="p in list" :key="p.id">
              <button class="piece" @click="play(p, 0)">
                <b>{{ p.title }}</b>
                <span class="dim">{{ p.dynasty }} · {{ p.author }}</span>
                <span class="tags">
                  <span class="tag">{{ p.totalUnits }} 句</span>
                  <span class="tag">{{ p.totalChars }} 字</span>
                  <span v-if="p.parts.length > 1" class="tag">分 {{ p.parts.length }} 段</span>
                  <span v-if="played[p.id]" class="tag played">玩过 {{ played[p.id] }}</span>
                </span>
              </button>
              <button v-for="pt in p.parts.slice(1)" :key="pt.index" class="partbtn" @click="play(p, pt.index)">
                第 {{ pt.index + 1 }} 段
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section v-else-if="view === 'stats'" class="panel">
        <h2>战绩</h2>
        <p class="lead">只存在这台设备的浏览器里，没有账号，也没有服务器。</p>
        <div class="nums">
          <div><b>{{ dailyCount }}</b><span>每日题</span></div>
          <div><b>{{ solvedCount }}</b><span>连成</span></div>
          <div><b>{{ records.streak }}</b><span>连续天数</span></div>
        </div>
        <h3>最近</h3>
        <ul class="recent">
          <li v-for="(r, i) in records.days.slice(-12).reverse()" :key="i">
            <span class="dim">{{ r.mode === 'daily' ? r.day : '练习' }}</span>
            <b>{{ r.title }}</b>
            <span class="dim">{{ r.units }} 句 · 错 {{ r.mistakes }} 次 · {{ r.solved ? '连成' : '没打完' }}</span>
          </li>
          <li v-if="!records.days.length" class="dim">还没有记录。今天那一题就是第一篇。</li>
        </ul>
        <h3>设置</h3>
        <label class="opt"><input type="checkbox" v-model="settings.showTarget" @change="save"> 找句时显示目标句子</label>
        <label class="opt"><input type="checkbox" v-model="settings.showPinyin" @change="save"> 显示拼音</label>
        <p class="dim">关掉「显示目标句子」后只给字数，难度高一档。</p>
      </section>

      <section v-else class="panel">
        <h2>玩法</h2>
        <ol class="rules">
          <li><b>连句。</b>盘面上每个字都来自这篇课文。点住一个字，拖过<em>相邻</em>的字（横、竖、斜都算），
            一条路不重复经过同一个格。连出来的字串如果正好是还没找到的那一句，它就当场被认出来。</li>
          <li><b>排句。</b>句子全找齐之后，按原文顺序排好 —— 点两句交换位置。这一步靠的是你记不记得课文的先后。</li>
          <li><b>每日一篇。</b>今天所有人玩的是同一篇同一段，题目由日期决定。想补玩过去的某天：<code>?d=2026-10-01</code>。</li>
          <li><b>随便练。</b>「浏览」里按学段册次挑任意一篇，练习不计连续天数。</li>
        </ol>
        <p class="lead">
          篇目来自课标与统编教材的必背范围，原文都是公有领域（判定规则：作者卒年 ≤ 当前年 − 50，逐篇可核验）。
          <a href="https://k12.diuci.com/legal">版权与免责</a> ·
          <a href="mailto:hi@diuci.com">hi@diuci.com</a>
        </p>
      </section>
    </main>

    <footer class="foot">
      <span>丢词夺理 diuci.com · 给孩子的古诗文</span>
      <span>
        <a href="https://k12.diuci.com/legal">原文公有领域 · 注释 CC BY 4.0 · 代码 MIT · 版权与免责</a>
      </span>
      <span class="dim">
        课文快照 {{ corpus.contentVersion }} · 可玩 {{ corpus.count }} 篇
        <template v-if="corpus.sourceTotal">（内容仓 {{ corpus.sourceTotal }} 篇，跳过 {{ (corpus.skipped || []).length }} 篇：太短或句子太少）</template>
      </span>
    </footer>

    <TabBar />
  </div>
</template>

<style scoped>
.shell{min-height:100%;display:flex;flex-direction:column}
.top{
  position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;
  padding:10px 20px;background:var(--nav-bg);backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line)
}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);flex:none}
.mark{
  width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  background:var(--cinnabar);color:var(--on-accent);font-family:var(--brush);font-size:19px
}
.name{font-family:var(--round);font-size:16px;letter-spacing:.04em;white-space:nowrap}
.nav{display:flex;gap:2px;margin-left:auto}
.tab{
  border:0;background:none;color:var(--ink-soft);cursor:pointer;
  font-family:var(--serif);font-size:14px;padding:6px 12px;border-radius:8px;opacity:.6;
  white-space:nowrap
}
.tab:hover{opacity:.9}
.tab.on{opacity:1;background:var(--tag-bg);color:var(--ink)}
.theme{font-size:17px;color:var(--ink-soft)}
.main{flex:1;padding-bottom:78px}
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
.foot{
  border-top:1px solid var(--line);padding:16px 20px 84px;
  display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--ink-soft)
}
.foot a{color:var(--ink-soft)}
@media (max-width:430px){
  .top{padding:10px 12px;gap:8px}
  .name{font-size:15px}
  .nav{gap:0}
  .tab{padding:6px 7px;font-size:13px}
}
@media (min-width:940px){ .main{padding-bottom:20px} .foot{padding-bottom:24px} }
</style>
