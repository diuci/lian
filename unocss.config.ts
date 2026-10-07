import type { Theme } from '@unocss/preset-mini'
import { defineConfig, presetAttributify, presetIcons, presetWind3 } from 'unocss'

export default defineConfig({
  shortcuts: [
    {
      'btn': 'px-4 py-1 rounded inline-block bg-primary text-[var(--on-accent)] cursor-pointer tracking-wide op90 hover:op100 disabled:cursor-default disabled:bg-[var(--ink-faint)] disabled:!op50 disabled:pointer-events-none',
      'icon-btn': 'text-1.2em cursor-pointer select-none opacity-75 transition duration-200 ease-in-out hover:opacity-100 hover:text-primary disabled:pointer-events-none',
      'card': 'bg-[var(--surface)] border border-base rounded-[var(--radius)]',
      'bg-base': 'bg-[var(--paper)]',
      'bg-overlay': 'bg-[var(--tag-bg)]',
      'border-base': 'border-[var(--line)]',
    },
    [/^(flex|grid)-center/g, () => 'justify-center items-center'],
  ],
  rules: [
    ['max-h-screen', { 'max-height': 'calc(var(--vh, 1vh) * 100)' }],
    ['h-screen', { height: 'calc(var(--vh, 1vh) * 100)' }],
    ['font-hanzi', { 'font-family': 'var(--brush)' }],
    ['font-round', { 'font-family': 'var(--round)' }],
  ],
  theme: <Theme>{
    colors: {
      'ok': 'var(--c-ok)',
      'primary': 'var(--c-primary)',
      'primary-deep': 'var(--c-primary-deep)',
      'mis': 'var(--c-mis)',
    },
  },
  presets: [
    // dark 显式写死 class：主题由 html[data-theme] / html.dark 控制，不能跟系统偏好走。
    // 主站 / K12 / 汉兜 / 丢词大作战共用这一套，这里不能例外。
    presetWind3({ dark: 'class' }),
    presetAttributify(),
    presetIcons({ scale: 1.2 }),
  ],
})
