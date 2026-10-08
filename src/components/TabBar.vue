<script setup lang="ts">
// 移动端底部标签栏：与主站 diuci.com、k12.diuci.com、汉兜完全同一组、同一顺序、同一图标路径。
import { t } from '~/logic/locale'
// （之前这里的「连句 / 对战 / 月光 / 汉兜」是另一套画法，四站四样，
//  孩子在手机上来回换站要重新认一遍图标。）
// 六个乐园入口，桌面端由 CSS 隐藏（顶栏已经有导航）。
const tabs = [
  { href: 'https://diuci.com/', key: 'tabbar.home', paths: ['M3.6 10.4 12 3.8l8.4 6.6', 'M5.8 9.2V19a1.4 1.4 0 0 0 1.4 1.4h9.6a1.4 1.4 0 0 0 1.4-1.4V9.2', 'M10 20.4v-5.2h4v5.2'] },
  { href: 'https://k12.diuci.com/', key: 'tabbar.k12', paths: ['M4 5.2A1.4 1.4 0 0 1 5.4 3.8H11a2 2 0 0 1 2 2v13a1.6 1.6 0 0 0-1.6-1.4H4z', 'M20 5.2a1.4 1.4 0 0 0-1.4-1.4H15a2 2 0 0 0-2 2v13a1.6 1.6 0 0 1 1.6-1.4H20z'] },
  { href: 'https://lian.diuci.com/', key: 'tabbar.lian', on: true, paths: ['M5.4 6.6a2.3 2.3 0 1 0 0.01 0', 'M12 12a2.3 2.3 0 1 0 0.01 0', 'M18.6 17.4a2.3 2.3 0 1 0 0.01 0', 'M7.1 8.3l3.5 2.4M13.4 13.3l3.5 2.4'] },
  { href: 'https://handle.diuci.com/', key: 'tabbar.handle', paths: ['M5.6 3.6h3.6a2 2 0 0 1 2 2v3.6a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V5.6a2 2 0 0 1 2-2z', 'M14.8 3.6h3.6a2 2 0 0 1 2 2v3.6a2 2 0 0 1-2 2h-3.6a2 2 0 0 1-2-2V5.6a2 2 0 0 1 2-2z', 'M5.6 12.8h3.6a2 2 0 0 1 2 2v3.6a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2v-3.6a2 2 0 0 1 2-2z', 'M14.8 12.8h3.6a2 2 0 0 1 2 2v3.6a2 2 0 0 1-2 2h-3.6a2 2 0 0 1-2-2v-3.6a2 2 0 0 1 2-2z'] },
  { href: 'https://moon.diuci.com/', key: 'tabbar.moon', paths: ['M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z', 'M17.6 3.2 16.8 5M20.8 6.4 18.6 6.9M14.6 2.4l.5 1.8'] },
  { href: 'https://ink.diuci.com/', key: 'tabbar.ink', paths: ['M14.2 3.6H20a.4.4 0 0 1 .4.4v5.8', 'M20.4 3.6 11.2 12.8a2 2 0 0 0-.5 1l-.8 3.4a.5.5 0 0 0 .6.6l3.4-.8a2 2 0 0 0 1-.5l9.2-9.2', 'M15.6 8.4 5.2 18.8a2 2 0 0 1-1 .5l-2 .6a.5.5 0 0 1-.6-.6l.6-2a2 2 0 0 1 .5-1L13 5.6'] },
]
</script>

<template>
  <nav class="dc-tabbar" :aria-label="t('tabbar.aria')">
    <a v-for="tab in tabs" :key="tab.href" :class="['dc-tab', tab.on ? 'on' : '']" :href="tab.href" :aria-current="tab.on ? 'page' : undefined">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
        <path v-for="(d, i) in tab.paths" :key="i" :d="d" />
      </svg>
      <span class="tx">{{ t(tab.key) }}</span>
    </a>
  </nav>
</template>

<style scoped>
/* 与主站 .dc-tabbar 逐值一致：58px 高、blur(18px) saturate(1.4)、
   图标 22px / 描边 1.6（当前项 2）、标签圆体 10.5px 字距 .06em。
   注意 top:auto —— 满宽 fixed 元素会被 sticky 顶栏的 top:0 继承拉到页面顶部。 */
.dc-tabbar{
  position:fixed;left:0;right:0;bottom:0;top:auto;z-index:70;
  display:flex;align-items:stretch;
  height:calc(58px + env(safe-area-inset-bottom,0px));
  padding:0 4px;padding-bottom:env(safe-area-inset-bottom,0px);
  background:var(--nav-bg);
  backdrop-filter:blur(18px) saturate(1.4);
  -webkit-backdrop-filter:blur(18px) saturate(1.4);
  border-top:1px solid var(--line);
  box-shadow:0 -2px 18px -8px rgba(36,31,26,.28)
}
.dc-tab{
  flex:1 1 0;min-width:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  text-decoration:none;color:var(--ink-faint);
  transition:color .2s,transform .12s;
  -webkit-tap-highlight-color:transparent
}
.dc-tab:active{transform:scale(.9)}
.dc-tab .ic{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.dc-tab .tx{font-family:var(--round);font-size:10.5px;letter-spacing:.06em;line-height:1}
.dc-tab.on{color:var(--cinnabar)}
.dc-tab.on .ic{stroke-width:2}
@media (min-width:940px){ .dc-tabbar{display:none} }
</style>
