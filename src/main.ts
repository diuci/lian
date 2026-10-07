import { createApp } from 'vue'
import '@unocss/reset/normalize.css'
import 'virtual:uno.css'
import '~/styles/tokens.css'
import '~/styles/main.css'
import App from './App.vue'

// 视口高度：移动端浏览器工具栏会吃掉一段，用 --vh 把真实高度交给 CSS
function setVh() {
  const h = window.innerHeight * 0.01
  document.documentElement.style.setProperty('--vh', h + 'px')
}
setVh()
window.addEventListener('resize', setVh)
window.addEventListener('orientationchange', setVh)

createApp(App).mount('#app')
