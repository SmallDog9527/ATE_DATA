import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/api/index';
export const useAuthStore = defineStore('auth', () => {
    // 从 localStorage 恢复状态（避免刷新丢失）
    let _savedUser = null;
    try {
        const raw = localStorage.getItem('user');
        if (raw && raw !== 'undefined' && raw !== 'null') {
            _savedUser = JSON.parse(raw);
        }
    }
    catch (e) {
        console.warn('Failed to parse user from localStorage:', e);
        localStorage.removeItem('user');
    }
    const user = ref(_savedUser);
    const accessToken = ref(localStorage.getItem('access_token'));
    const refreshToken = ref(localStorage.getItem('refresh_token'));
    const isLoggedIn = computed(() => !!accessToken.value && !!user.value);
    const isAdmin = computed(() => user.value?.role === 'admin');
    const isEng = computed(() => user.value?.role === 'eng');
    async function login(username, password) {
        const data = await api.post('/auth/login', { username, password });
        _setSession(data);
    }
    async function register(username, email, password, code) {
        await api.post('/auth/register', { username, email, password, code });
    }
    async function sendVerifyCode(username, email, password) {
        await api.post('/auth/send-verify-code', { username, email, password });
    }
    async function logout() {
        if (refreshToken.value) {
            try {
                await api.post('/auth/logout', { refresh_token: refreshToken.value });
            }
            catch { }
        }
        _clearSession();
    }
    async function refreshMe() {
        try {
            const data = await api.get('/auth/me');
            user.value = data;
            localStorage.setItem('user', JSON.stringify(data));
        }
        catch { }
    }
    function _setSession(data) {
        accessToken.value = data.access_token;
        refreshToken.value = data.refresh_token;
        user.value = data.user;
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));
    }
    function _clearSession() {
        accessToken.value = null;
        refreshToken.value = null;
        user.value = null;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
    }
    return {
        user, accessToken, refreshToken,
        isLoggedIn, isAdmin, isEng,
        login, register, sendVerifyCode, logout, refreshMe,
    };
});
