import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/LoginView.vue'),  // 同一页面处理 token
    },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '',          name: 'home',          component: () => import('@/views/HomeView.vue') },
        { path: 'analysis',  name: 'data-analysis', component: () => import('@/views/DataAnalysisView.vue') },
        { path: 'profile',   name: 'profile',       component: () => import('@/views/ProfileView.vue') },
        { path: 'lot/:id/param/:param', name: 'param', component: () => import('@/views/ParamView.vue') },
        { path: 'lot/:id',   name: 'analysis',      component: () => import('@/views/AnalysisView.vue') },
        { path: 'reports',   name: 'reports',       component: () => import('@/views/ReportCenterView.vue') },
        { path: 'settings',  name: 'settings',      component: () => import('@/views/ProfileView.vue') },
        { path: 'lot/:id/bin', name: 'bin',         component: () => import('@/views/BinView.vue') },
        { path: 'multi-analysis', name: 'multi-analysis', component: () => import('@/views/MultiAnalysisView.vue') },
        { path: 'multi-param',    name: 'multi-param',    component: () => import('@/views/MultiParamView.vue') },
        { path: 'multi-bin',      name: 'multi-bin',      component: () => import('@/views/MultiBinView.vue') },
        { path: 'lot/:id/idle-check', name: 'idle-check', component: () => import('@/views/IdleCheckView.vue') },
        { path: 'program-changes', name: 'program-changes', component: () => import('@/views/ProgramChangeView.vue') },
        { path: 'program-changes/:productName', name: 'product-programs', component: () => import('@/views/ProductProgramsView.vue') },
        { path: 'program-changes/:productName/pgs/:id', name: 'pgs-param', component: () => import('@/views/PgsParamView.vue') },
        { path: 'program-changes/:productName/data/:id', name: 'data-program-param', component: () => import('@/views/PgsParamView.vue') },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const accessToken = localStorage.getItem('access_token')
  if (to.meta.requiresAuth && !accessToken) {
    return '/login'
  }
  // 已登录时访问 /login，跳首页
  if (to.path === '/login' && accessToken && !to.query.token) {
    return '/'
  }

})

export default router
