import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import Vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Unocss from 'unocss/vite'

const src = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  base: '/',
  resolve: {
    alias: {
      '~/': src + '/',
    },
  },
  plugins: process.env.TEST
    ? []
    : [
      Vue(),
      AutoImport({ imports: ['vue', '@vueuse/core'], dts: true }),
      Components({ dts: true }),
      Unocss(),
    ],
  build: {
    chunkSizeWarningLimit: 1000,
    // Vite 8 默认用 lightningcss 压 CSS：把标准 backdrop-filter 删掉只留 -webkit- 前缀版，
    // 而 Chromium 不认孤立的前缀声明——顶栏毛玻璃整个失效（handle 先踩，实抓）。
    // 切回 esbuild 压缩（配 cssTarget=chrome106 实测两行都保留）。
    cssTarget: 'chrome106',
    cssMinify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('locale')) return 'locale'
          if (id.includes('corpus.json')) return 'corpus'
          // readings.json 故意不并进任何 chunk：它只被动态 import，
          // 钉进 'corpus' 就等于跟着 corpus 一起被首屏拉走，懒加载白做。
          if (id.includes('node_modules') && !id.endsWith('.css')) return 'vendor'
        },
      },
    },
  },
})
