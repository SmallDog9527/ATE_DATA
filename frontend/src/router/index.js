import { createRouter, createWebHistory } from 'vue-router';
const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: () => import('@/views/LoginView.vue'),
            meta: { title: 'Vite Login' },
        },
        {
            path: '/reset-password',
            name: 'reset-password',
            component: () => import('@/views/LoginView.vue'), // 同一页面处理 token
            meta: { title: 'Vite Reset Password' },
        },
        {
            path: '/',
            component: () => import('@/layouts/MainLayout.vue'),
            meta: { requiresAuth: true },
            children: [
                { path: '', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Vite Data' } },
                { path: 'analysis', name: 'data-analysis', component: () => import('@/views/DataAnalysisView.vue'), meta: { title: 'Vite Yield' } },
                { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { title: 'Vite Profile' } },
                { path: 'lot/:id/param/:param', name: 'param', component: () => import('@/views/ParamView.vue'), meta: { title: 'Vite Param' } },
                { path: 'lot/:id', name: 'analysis', component: () => import('@/views/AnalysisView.vue'), meta: { title: 'Vite Analysis' } },
                { path: 'reports', name: 'reports', component: () => import('@/views/ReportCenterView.vue'), meta: { title: 'Vite Report' } },
                { path: 'settings', name: 'settings', component: () => import('@/views/ProfileView.vue'), meta: { title: 'Vite Setup' } },
                { path: 'lot/:id/bin', name: 'bin', component: () => import('@/views/BinView.vue'), meta: { title: 'Vite Bin' } },
                { path: 'multi-analysis', name: 'multi-analysis', component: () => import('@/views/MultiAnalysisView.vue'), meta: { title: 'Vite Multi Analysis' } },
                { path: 'multi-param', name: 'multi-param', component: () => import('@/views/MultiParamView.vue'), meta: { title: 'Vite Hist' } },
                { path: 'multi-bin', name: 'multi-bin', component: () => import('@/views/MultiBinView.vue'), meta: { title: 'Vite Multi Bin' } },
                { path: 'lot/:id/idle-check', name: 'idle-check', component: () => import('@/views/IdleCheckView.vue'), meta: { title: 'Vite Idle' } },
                { path: 'program-changes', name: 'program-changes', component: () => import('@/views/ProgramChangeView.vue'), meta: { title: 'Vite Pgm' } },
                { path: 'program-changes/:productName', name: 'product-programs', component: () => import('@/views/ProductProgramsView.vue'), meta: { title: 'Vite Pgm Product' } },
                { path: 'program-changes/:productName/pgs/:id', name: 'pgs-param', component: () => import('@/views/PgsParamView.vue'), meta: { title: 'Vite Pgm Param' } },
                { path: 'program-changes/:productName/data/:id', name: 'data-program-param', component: () => import('@/views/PgsParamView.vue'), meta: { title: 'Vite Pgm Param' } },
                { path: 'tools', name: 'tools', component: () => import('@/views/ToolsView.vue'), meta: { title: 'Vite Tools' } },
            ],
        },
    ],
});
router.beforeEach((to) => {
    const accessToken = localStorage.getItem('access_token');
    if (to.meta.requiresAuth && !accessToken) {
        return '/login';
    }
    // 已登录时访问 /login，跳首页
    if (to.path === '/login' && accessToken && !to.query.token) {
        return '/';
    }
});
router.afterEach((to) => {
    if (to.meta.title) {
        document.title = to.meta.title;
    }
    else {
        document.title = 'Vite App';
    }
});
export default router;
