<script setup lang="ts">
// 移动端底部标签栏：与主站 diuci.com、k12.diuci.com 同一套视觉语言。
// 六个乐园入口，桌面端由 CSS 隐藏（顶栏已经有导航）。
const tabs = [
  { href: 'https://diuci.com/', label: '首页', path: 'M3.6 10.4 12 3.8l8.4 6.6|M5.8 9.2V19a1.4 1.4 0 0 0 1.4 1.4h9.6a1.4 1.4 0 0 0 1.4-1.4V9.2|M10 20.4v-5.2h4v5.2' },
  { href: 'https://k12.diuci.com/', label: '古诗文', path: 'M4 5.2A1.4 1.4 0 0 1 5.4 3.8H11a2 2 0 0 1 2 2v13a1.6 1.6 0 0 0-1.6-1.4H4z|M20 5.2a1.4 1.4 0 0 0-1.4-1.4H15a2 2 0 0 0-2 2v13a1.6 1.6 0 0 1 1.6-1.4H20z' },
  { href: 'https://lian.diuci.com/', label: '连句', path: 'M4 7h6l3 5 3-5h4|M4 17h6l3-5|M13 17h7', on: true },
  { href: 'https://ink.diuci.com/', label: '对战', path: 'M14.2 3.6H20a.4.4 0 0 1 .4.4v5.8|M20.4 3.6 11.2 12.8a2 2 0 0 0-.5 1l-.8 3.4a.5.5 0 0 0 .6.6l3.4-.8a2 2 0 0 0 1-.5l9.2-9.2' },
  { href: 'https://moon.diuci.com/', label: '月光', path: 'M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z' },
  { href: 'https://handle.diuci.com/', label: '汉兜', path: 'M3.6 3.6h7.6v7.6H3.6z|M12.8 3.6h7.6v7.6h-7.6z|M3.6 12.8h7.6v7.6H3.6z|M12.8 12.8h7.6v7.6h-7.6z' },
]
</script>

<template>
  <nav class="dc-tabbar" aria-label="快捷导航">
    <a v-for="t in tabs" :key="t.href" :class="['dc-tab', t.on ? 'on' : '']" :href="t.href">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
        <path v-for="(d, i) in t.path.split('|')" :key="i" :d="d" />
      </svg>
      <span class="tx">{{ t.label }}</span>
    </a>
  </nav>
</template>

<style scoped>
.dc-tabbar{
  position:fixed;left:0;right:0;bottom:0;z-index:30;
  display:flex;justify-content:space-around;align-items:stretch;
  padding:6px 4px calc(6px + env(safe-area-inset-bottom));
  background:var(--nav-bg);backdrop-filter:blur(12px);
  border-top:1px solid var(--line)
}
.dc-tab{
  flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
  text-decoration:none;color:var(--ink-faint);font-size:11px;padding:2px 0
}
.dc-tab .ic{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.dc-tab.on{color:var(--cinnabar)}
.dc-tab .tx{letter-spacing:.04em}
@media (min-width:940px){ .dc-tabbar{display:none} }
</style>
