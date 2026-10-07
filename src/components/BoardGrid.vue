<script setup lang="ts">
import { computed } from 'vue'
import type { Cell } from '~/logic/game'

const props = defineProps<{
  cols: number
  rows: number
  cells: Cell[]
  locked: Map<number, number>
  path: number[]
  flash: '' | 'ok' | 'mis'
  readings: Record<string, { common: string }>
  showPinyin: boolean
}>()
const emit = defineEmits<{ (e: 'tap', cell: number): void }>()

const vw = typeof window !== 'undefined' ? window.innerWidth : 420
// 字块尺寸：列多就缩缝，最小 30px 保证手机上还认得出字，最大 56px 免得平板上一片空白
const gap = computed(() => (props.cols >= 7 ? 3 : 6))
const tile = computed(() => {
  const available = Math.min(vw, 640) - 40
  const raw = Math.floor((available - (props.cols - 1) * gap.value) / props.cols)
  return Math.max(30, Math.min(56, raw))
})

const pathIndex = computed(() => {
  const m = new Map<number, number>()
  props.path.forEach((c, i) => m.set(c, i))
  return m
})

function cls(cell: number) {
  const inPath = pathIndex.value.has(cell)
  const lockedBy = props.locked.get(cell)
  return [
    'tile',
    inPath ? 'on' : '',
    lockedBy !== undefined ? 'locked' : '',
    props.flash === 'mis' && inPath ? 'mis' : '',
    props.flash === 'ok' && inPath ? 'ok' : '',
    lockedBy === undefined ? 'free' : '',
  ].filter(Boolean).join(' ')
}

let dragging = false
function down(cell: number, e: PointerEvent) {
  dragging = true
  e.preventDefault()
  emit('tap', cell)
}
function over(cell: number) {
  if (!dragging) return
  emit('tap', cell)
}
function up() { dragging = false }
if (typeof window !== 'undefined') {
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
</script>

<template>
  <div
    class="board"
    :style="{
      gridTemplateColumns: 'repeat(' + cols + ', ' + tile + 'px)',
      gap: gap + 'px',
    }"
  >
    <button
      v-for="(c, i) in cells"
      :key="i"
      type="button"
      :class="cls(i)"
      :style="{ width: tile + 'px', height: tile + 'px', fontSize: Math.round(tile * 0.62) + 'px' }"
      :disabled="locked.has(i)"
      :data-cell="i"
      :data-order="pathIndex.get(i)"
      @pointerdown="down(i, $event)"
      @pointerenter="over(i)"
      @click="over(i)"
    >
      <span v-if="showPinyin && readings[c.ch]" class="py">{{ readings[c.ch].common }}</span>
      <span class="ch">{{ c.ch }}</span>
      <span v-if="pathIndex.has(i)" class="ord">{{ pathIndex.get(i)! + 1 }}</span>
    </button>
  </div>
</template>

<style scoped>
.board{display:grid;justify-content:center;touch-action:none;user-select:none}
.tile{
  position:relative;flex:none;
  border:1px solid var(--line);
  background:var(--surface-hi);
  color:var(--ink);
  border-radius:10px;
  font-family:var(--brush);
  line-height:1;
  display:flex;align-items:center;justify-content:center;
  transition:transform .12s ease,background-color .18s ease,border-color .18s ease,box-shadow .18s ease;
  cursor:pointer;padding:0;
}
.tile.free:hover{border-color:var(--cinnabar);background:var(--wash-2)}
.tile.on{
  background:var(--cinnabar);border-color:var(--cinnabar-deep);color:var(--on-accent);
  transform:translateY(-2px);box-shadow:0 6px 14px -8px rgba(200,68,46,.7);
}
.tile.ok{background:var(--celadon);border-color:var(--celadon);color:var(--on-accent)}
.tile.mis{background:var(--gold);border-color:var(--gold);color:var(--on-accent)}
.tile.locked{
  background:var(--surface-3);border-color:var(--line);color:var(--ink-faint);
  cursor:default;opacity:.72;
}
.tile:disabled{cursor:default}
.ch{position:relative;z-index:1}
.py{
  position:absolute;top:3px;left:0;right:0;text-align:center;
  font-size:9px;color:var(--ink-faint);font-family:var(--serif);z-index:1;
}
.tile.on .py,.tile.ok .py{color:var(--on-accent);opacity:.8}
.ord{
  position:absolute;right:3px;bottom:2px;font-size:9px;opacity:.75;
  font-family:var(--serif);z-index:1;
}
</style>
