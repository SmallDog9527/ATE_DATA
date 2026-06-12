import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import './assets/main.css'

// 注册 AG Grid 模块
ModuleRegistry.registerModules([AllCommunityModule])

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')