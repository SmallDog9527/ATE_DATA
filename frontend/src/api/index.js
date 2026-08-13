import axios from 'axios';
const api = axios.create({
    baseURL: '/api',
    timeout: 0,
});
// ── 请求拦截：自动携带 Access Token ──
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
// ── 响应拦截：401 时自动用 Refresh Token 换新 ──
let isRefreshing = false;
let pendingQueue = [];
api.interceptors.response.use((response) => {
    if (response.config.responseType === 'blob')
        return response;
    return response.data;
}, async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
            _forceLogout();
            return Promise.reject('登录已过期，请重新登录');
        }
        if (isRefreshing) {
            // 等待刷新完成后重试
            return new Promise((resolve, reject) => {
                pendingQueue.push({ resolve, reject });
            }).then(() => api(originalRequest))
                .catch(() => Promise.reject('登录已过期'));
        }
        isRefreshing = true;
        try {
            const data = await axios.post('/api/auth/refresh', { refresh_token: refreshToken });
            const newAccess = data.data.access_token;
            const newRefresh = data.data.refresh_token;
            localStorage.setItem('access_token', newAccess);
            localStorage.setItem('refresh_token', newRefresh);
            api.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`;
            pendingQueue.forEach(p => p.resolve());
            pendingQueue = [];
            originalRequest.headers['Authorization'] = `Bearer ${newAccess}`;
            return api(originalRequest);
        }
        catch {
            pendingQueue.forEach(p => p.reject());
            pendingQueue = [];
            _forceLogout();
            return Promise.reject('登录已过期，请重新登录');
        }
        finally {
            isRefreshing = false;
        }
    }
    return Promise.reject(error.response?.data?.detail || '请求失败');
});
function _forceLogout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}
export { api };
export default api;
