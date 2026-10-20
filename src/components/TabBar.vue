<script setup lang="ts">
// 移动端底部标签栏：八站数据单源 core/tabbar.json（正本 _deploy，sync 拷贝，
// check-core R3 钉结构）。当前项按 hostname 判定。
import { t } from '~/logic/locale'
import tabbarData from '../../core/tabbar.json'

const tabs = tabbarData.tabs.map((x: any) => ({
  ...x,
  on: typeof location !== 'undefined' && x.href.includes(location.hostname),
}))
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
