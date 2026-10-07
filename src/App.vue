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
        <span class="mark">连</span>
        <span class="brand-tx">
          <span class="name">连词成句</span>
          <span class="brand-sub">DIUCI</span>
        </span>
      </a>
      <!-- 六个乐园：与主站、汉兜、古诗文库同一组、同一顺序、同一措辞 -->
      <nav class="nav">
        <button :class="['tab', view === 'daily' ? 'on' : '']" @click="backToDaily">今日</button>
        <button :class="['tab', view === 'browse' ? 'on' : '']" @click="view = 'browse'">浏览</button>
        <button :class="['tab', view === 'stats' ? 'on' : '']" @click="view = 'stats'">战绩</button>
        <button :class="['tab', view === 'help' ? 'on' : '']" @click="view = 'help'">玩法</button>
      </nav>
      <nav class="parks" aria-label="六个乐园">
        <a href="https://diuci.com/">首页</a>
        <a href="https://k12.diuci.com/">学古诗</a>
        <a href="https://lian.diuci.com/" aria-current="page" class="on">连词成句</a>
        <a href="https://ink.diuci.com/">丢词大作战</a>
        <a href="https://moon.diuci.com/">遗失月冕</a>
        <a href="https://handle.diuci.com/">汉兜</a>
        <a href="https://github.com/diuci/k12-chinese-poetry">内容仓库</a>
      </nav>
      <button class="theme" type="button" :title="dark ? '切回宣纸' : '切到夜墨'" :aria-label="dark ? '切回宣纸' : '切到夜墨'" @click="toggleTheme">
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
        链接里那一篇（{{ badLink }}）不在这份课文快照里，已经换成今天这一题。
        可能是快照换过版本，去<a href="#" @click.prevent="view = 'browse'">浏览</a>挑一篇。
      </p>
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
      <div class="foot-in">
      <div class="foot-l">
        <a href="https://diuci.com/">丢词夺理 diuci.com</a> · 给孩子的古诗文<br>
        课文快照 {{ corpus.contentVersion }} · 可玩 {{ corpus.count }} 篇
        <template v-if="corpus.sourceTotal">（内容仓 {{ corpus.sourceTotal }} 篇，跳过 {{ (corpus.skipped || []).length }} 篇：太短或句子太少）</template><br>
        <a href="https://k12.diuci.com/legal">原文公有领域 · 注释 CC BY 4.0 · 代码 MIT · 版权与免责</a>
      </div>
      <nav aria-label="六个乐园">
        <a href="https://k12.diuci.com/">学古诗</a>
        <a href="https://lian.diuci.com/">连词成句</a>
        <a href="https://ink.diuci.com/">丢词大作战</a>
        <a href="https://moon.diuci.com/">遗失月冕</a>
        <a href="https://handle.diuci.com/">汉兜</a>
        <a href="https://github.com/diuci/k12-chinese-poetry">内容仓库</a>
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
.brand-sub{display:block;font-family:var(--serif);font-size:10px;letter-spacing:.24em;color:var(--ink-faint);margin-top:1px}
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
