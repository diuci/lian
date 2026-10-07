<script setup lang="ts">
const props = defineProps<{
  units: string[]
  found: number[]
  phase: 'find' | 'order' | 'done'
  order: number[]
  picked: number
  readings: Record<string, { common: string }>
  showTarget: boolean
  showPinyin: boolean
}>()
const emit = defineEmits<{ (e: 'pick', i: number): void }>()

function text(unitIndex: number) { return props.units[unitIndex] }
function pinyin(unitIndex: number) {
  return [...text(unitIndex)].map((ch) => props.readings[ch]?.common || '').join(' ')
}
</script>

<template>
  <div class="strands">
    <template v-if="phase === 'find'">
      <div class="head">
        <b>找句</b>
        <span class="dim">已找到 {{ found.length }} / {{ units.length }}</span>
      </div>
      <ol class="list">
        <li
          v-for="(u, i) in units"
          :key="i"
          :class="['row', found.includes(i) ? 'done' : '']"
          :data-unit="i"
        >
          <span class="no">{{ i + 1 }}</span>
          <span v-if="showTarget" class="txt">
            {{ text(i) }}
            <em v-if="showPinyin" class="pyline">{{ pinyin(i) }}</em>
          </span>
          <span v-else class="txt dim">{{ text(i).length }} 字</span>
          <span v-if="found.includes(i)" class="tick">已连出</span>
        </li>
      </ol>
    </template>

    <template v-else>
      <div class="head">
        <b>排句</b>
        <span class="dim">按原文顺序排好，点两句交换位置</span>
      </div>
      <ol class="list order">
        <li
          v-for="(u, i) in order"
          :key="i"
          :class="['row', 'swappable', picked === i ? 'picked' : '', phase === 'done' ? 'done' : '']"
          :data-unit="u"
          :data-pos="i"
          @click="emit('pick', i)"
        >
          <span class="no">{{ i + 1 }}</span>
          <span class="txt">
            {{ text(u) }}
            <em v-if="showPinyin" class="pyline">{{ pinyin(u) }}</em>
          </span>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.strands{margin-top:18px}
.head{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}
.head b{font-family:var(--round);font-size:15px;letter-spacing:.06em}
.dim{color:var(--ink-faint);font-size:12.5px}
.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.row{
  display:flex;align-items:flex-start;gap:10px;
  padding:8px 10px;border:1px solid var(--line);border-radius:10px;
  background:var(--surface);
}
.row.done{border-color:var(--celadon);background:var(--wash-3)}
.row.picked{border-color:var(--cinnabar);background:var(--wash-2)}
.no{
  flex:none;width:18px;font-size:12px;color:var(--ink-faint);
  font-family:var(--serif);padding-top:2px
}
.txt{font-family:var(--brush);font-size:17px;line-height:1.5;flex:1}
.pyline{display:block;font-style:normal;font-size:11px;color:var(--ink-faint);letter-spacing:.02em}
.tick{flex:none;font-size:11.5px;color:var(--celadon)}
.swappable{cursor:pointer}
</style>
