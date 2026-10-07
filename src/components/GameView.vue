<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BoardGrid from './BoardGrid.vue'
import StrandPanel from './StrandPanel.vue'
import { useGame } from '~/logic/game'
import { fmtTime, markPlayed, pushRecord, shareText } from '~/logic/store'

const props = defineProps<{
  pieces: any[]
  day: string
  mode: 'daily' | 'practice'
  readings: Record<string, { common: string }>
  showTarget: boolean
  showPinyin: boolean
}>()
const emit = defineEmits<{ (e: 'replay'): void }>()

const game = useGame(props.pieces, props.day)
const picked = ref(-1)
const copied = ref(false)
const orderWrong = ref(false)

const pieceLabel = computed(() => {
  const p = game.piece
  const who = [p.dynasty, p.author].filter(Boolean).join(' · ')
  return { title: p.title, who, where: p.stage + ' ' + p.volume, part: game.part }
})

function tap(cell: number) {
  game.tap(cell)
  // 连对了就当场认出来，不用玩家再按一次按钮
  const s = game.currentString.value
  if (s && game.units.includes(s) && !game.found.value.includes(game.units.indexOf(s))) game.commit()
}

function pick(i: number) {
  if (picked.value < 0) { picked.value = i; return }
  if (picked.value === i) { picked.value = -1; return }
  game.swap(picked.value, i)
  picked.value = -1
  orderWrong.value = false
}

function check() {
  const ok = game.checkOrder()
  orderWrong.value = !ok
  if (ok) {
    markPlayed(game.piece.id)
    pushRecord({
      day: game.day,
      pieceId: game.piece.id,
      title: game.piece.title,
      part: game.part,
      units: game.units.length,
      chars: game.units.join('').length,
      mistakes: game.mistakes.value,
      orderAttempts: game.orderAttempts.value,
      seconds: game.seconds.value,
      solved: true,
      mode: props.mode,
    })
  }
}

async function share() {
  const text = shareText({
    day: game.day, pieceId: game.piece.id, title: game.piece.title, part: game.part,
    units: game.units.length, chars: game.units.join('').length,
    mistakes: game.mistakes.value, orderAttempts: game.orderAttempts.value,
    seconds: game.seconds.value, solved: game.phase.value === 'done', mode: props.mode,
  }, location.origin + '/?d=' + game.day)
  try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false }, 2000) }
  catch { window.prompt('复制这段：', text) }
}

// 换题（换日期 / 换篇目）时把状态清干净
watch(() => props.day + '|' + props.mode, () => emit('replay'))

onMounted(() => {
  const problems = game.selfVerify()
  if (problems.length) console.error('[!!] 本局盘面不自洽：' + problems[0])
  // 冒烟测试钩子：只有显式带 ?dev=hey 才挂出来。线上默认没有这个口子。
  if (location.search.includes('dev=hey')) (window as any).__lian = game
})

defineExpose({ game })
</script>

<template>
  <section class="game">
    <header class="meta">
      <div class="meta-l">
        <span class="badge">{{ mode === 'daily' ? '今日 · ' + day : '练习 · ' + day }}</span>
        <h2>{{ pieceLabel.title }}<em v-if="pieceLabel.part">第 {{ pieceLabel.part + 1 }} 段</em></h2>
        <p class="who">{{ pieceLabel.who }} · {{ pieceLabel.where }}</p>
      </div>
      <div class="meta-r">
        <span>{{ game.units.length }} 句 · {{ game.units.join('').length }} 字</span>
        <span v-if="game.mistakes.value" class="mis">连错 {{ game.mistakes.value }} 次</span>
        <span v-if="game.phase.value === 'done'">{{ fmtTime(game.seconds.value) }}</span>
      </div>
    </header>

    <BoardGrid
      :cols="game.puzzle.cols"
      :rows="game.puzzle.rows"
      :cells="game.puzzle.cells"
      :locked="game.lockedCells.value"
      :path="game.path.value"
      :flash="game.flash.value"
      :readings="readings"
      :show-pinyin="showPinyin"
      @tap="tap"
    />

    <div class="bar">
      <template v-if="game.phase.value === 'find'">
        <button class="btn ghost" :disabled="!game.path.value.length" @click="game.undo()">撤销</button>
        <button class="btn ghost" :disabled="!game.path.value.length" @click="game.clearPath()">清空</button>
        <span class="cur">{{ game.currentString.value || '在盘面上连出一条相邻的字' }}</span>
        <button class="btn" :disabled="!game.path.value.length" @click="game.commit()">连好了</button>
      </template>
      <template v-else-if="game.phase.value === 'order'">
        <span class="cur">{{ orderWrong ? '顺序还不对，再排一次' : '句子都连出来了，接下来排回原文顺序' }}</span>
        <button class="btn" @click="check">核对顺序</button>
      </template>
      <template v-else>
        <span class="cur okline">连好了。{{ game.mistakes.value }} 次连错，排序试了 {{ game.orderAttempts.value }} 次。</span>
        <button class="btn ghost" @click="share">{{ copied ? '已复制' : '分享' }}</button>
        <button class="btn" @click="emit('replay')">再来一篇</button>
      </template>
    </div>

    <StrandPanel
      :units="game.units"
      :found="game.found.value"
      :phase="game.phase.value"
      :order="game.order.value"
      :picked="picked"
      :readings="readings"
      :show-target="showTarget"
      :show-pinyin="showPinyin"
      @pick="pick"
    />
  </section>
</template>

<style scoped>
.game{max-width:640px;margin:0 auto;padding:0 20px}
.meta{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:flex-end;margin:14px 0 16px}
.badge{
  display:inline-block;font-size:11.5px;letter-spacing:.12em;color:var(--cinnabar);
  border:1px solid var(--line);border-radius:999px;padding:2px 10px;background:var(--surface)
}
.meta h2{margin:6px 0 2px;font-family:var(--round);font-size:22px;font-weight:600}
.meta h2 em{font-style:normal;font-size:12px;color:var(--ink-faint);margin-left:8px}
.who{margin:0;font-size:13px;color:var(--ink-soft)}
.meta-r{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:12.5px;color:var(--ink-faint)}
.mis{color:var(--gold)}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
.cur{flex:1;min-width:160px;font-size:13.5px;color:var(--ink-soft);font-family:var(--brush);font-size:16px}
.okline{color:var(--celadon)}
.btn.ghost{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
</style>
