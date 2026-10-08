<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import BoardGrid from './BoardGrid.vue'
import StrandPanel from './StrandPanel.vue'
import { useGame } from '~/logic/game'
import { fmtTime, markPlayed, pushRecord, shareText } from '~/logic/store'
import { hant, t, tf } from '~/logic/locale'
import { tradLabel, tradStage, tradVolume } from '~/logic/trad'

const props = defineProps<{
  // 整份课文快照：词库 + 已发出去日子的冻结记录
  source: any
  day: string
  mode: 'daily' | 'practice'
  readings: Record<string, { common: string }>
  showTarget: boolean
  showPinyin: boolean
  pick?: { pieceId: string, part?: number }
}>()
const emit = defineEmits<{ (e: 'replay'): void }>()

const game = useGame(props.source, props.day, props.pick)
const picked = ref(-1)
const copied = ref(false)
const shareBox = ref('')
const shareRef = ref<unknown>(null)
const orderWrong = ref(false)
const isHant = computed(() => hant())

const pieceLabel = computed(() => {
  const p = game.piece
  const who = [tradLabel(p, 'dynasty', isHant.value), tradLabel(p, 'author', isHant.value)].filter(Boolean).join(' · ')
  return {
    title: tradLabel(p, 'title', isHant.value),
    who,
    where: tradStage(p.stage, isHant.value) + ' ' + tradVolume(p.volume, isHant.value),
    part: game.part,
  }
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
    day: game.day, pieceId: game.piece.id, title: tradLabel(game.piece, 'title', isHant.value), part: game.part,
    units: game.units.length, chars: game.units.join('').length,
    mistakes: game.mistakes.value, orderAttempts: game.orderAttempts.value,
    seconds: game.seconds.value, solved: game.phase.value === 'done', mode: props.mode,
  }, location.origin + '/?d=' + game.day)
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    shareBox.value = ''
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // 剪贴板拿不到（非安全上下文、用户没给权限、浏览器直接拒）。
    // window.prompt 在不少浏览器里被抑制，玩家点了「分享」什么也没发生 ——
    // 那就把这段文字摊在页面上，全选好，让他自己复制。
    shareBox.value = text
    nextTick(() => { const el = shareRef.value as HTMLInputElement | null; if (el) { el.focus(); el.select() } })
  }
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
        <span class="badge">{{ tf(mode === 'daily' ? 'game.badgeDaily' : 'game.badgePractice', { day }) }}</span>
        <h2>{{ pieceLabel.title }}<em v-if="pieceLabel.part">{{ tf('game.partN', { n: pieceLabel.part + 1 }) }}</em></h2>
        <p class="who">{{ pieceLabel.who }} · {{ pieceLabel.where }}</p>
      </div>
      <div class="meta-r">
        <span>{{ tf('game.unitsChars', { units: game.units.length, chars: game.units.join('').length }) }}</span>
        <span v-if="game.mistakes.value" class="mis">{{ tf('game.mistakes', { n: game.mistakes.value }) }}</span>
        <span v-if="game.phase.value === 'done'">{{ fmtTime(game.seconds.value) }}</span>
      </div>
    </header>

    <BoardGrid
      :cols="game.puzzle.cols"
      :rows="game.puzzle.rows"
      :cells="game.puzzle.cells"
      :units="game.units"
      :hant="isHant"
      :locked="game.lockedCells.value"
      :path="game.path.value"
      :flash="game.flash.value"
      :readings="readings"
      :show-pinyin="showPinyin"
      @tap="tap"
    />

    <div class="bar">
      <template v-if="game.phase.value === 'find'">
        <button class="btn ghost" :disabled="!game.path.value.length" @click="game.undo()">{{ t('game.undo') }}</button>
        <button class="btn ghost" :disabled="!game.path.value.length" @click="game.clearPath()">{{ t('game.clear') }}</button>
        <span class="cur">{{ game.currentString.value || t('game.hintPath') }}</span>
        <button class="btn" :disabled="!game.path.value.length" @click="game.commit()">{{ t('game.commit') }}</button>
      </template>
      <template v-else-if="game.phase.value === 'order'">
        <span class="cur">{{ orderWrong ? t('game.orderWrong') : t('game.orderHint') }}</span>
        <button class="btn" @click="check">{{ t('game.checkOrder') }}</button>
      </template>
      <template v-else>
        <span class="cur okline">{{ tf('game.finished', { mistakes: game.mistakes.value, orders: game.orderAttempts.value }) }}</span>
        <button class="btn ghost" @click="share">{{ copied ? t('game.copied') : t('game.share') }}</button>
        <button class="btn" @click="emit('replay')">{{ t('game.another') }}</button>
      </template>
    </div>

    <label v-if="shareBox.value" class="share-box">
      <span>{{ t('game.shareLabel') }}</span>
      <input ref="shareRef" readonly :value="shareBox.value" @focus="($event.target as HTMLInputElement).select()" />
    </label>

    <StrandPanel
      :units="game.units"
      :found="game.found.value"
      :phase="game.phase.value"
      :order="game.order.value"
      :picked="picked"
      :hant="isHant"
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
.share-box{display:block;margin-top:10px}
.share-box span{display:block;font-size:12.5px;color:var(--ink-faint);margin-bottom:6px}
.share-box input{
  width:100%;font-family:var(--serif);font-size:13px;color:var(--ink);
  padding:9px 11px;border-radius:10px;border:1px solid var(--line);
  background:var(--surface-3)
}
</style>
