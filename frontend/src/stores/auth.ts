import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api/index'

interface User {
  id: number
  username: string
  email: string
  role: string
  is_active: boolean
  email_verified: boolean
  created_at: string
  last_login_at?: string
  storage_used_bytes?: number
}

export const useAuthStore = defineStore('auth', () => {
  // 从 localStorage 恢复状态（避免刷新丢失）
  const _savedUser = localStorage.getItem('user')
  const user       = ref<User | null>(_savedUser ? JSON.parse(_savedUser) : null)
  const accessToken  = ref<string | null>(localStorage.getItem('access_token'))
  const refreshToken = ref<string | null>(localStorage.getItem('refresh_token'))

  const isLoggedIn = computed(() => !!accessToken.value && !!user.value)
  const isAdmin    = computed(() => user.value?.role === 'admin')
  const isEng      = computed(() => user.value?.role === 'eng')

  async function login(username: string, password: string) {
    const data: any = await api.post('/auth/login', { username, password })
    _setSession(data)
  }

  async function register(username: string, email: string, password: string, code: string) {
    await api.post('/auth/register', { username, email, password, code })
  }

  async function sendVerifyCode(username: string, email: string, password: string) {
    await api.post('/auth/send-verify-code', { username, email, password })
  }

  async function logout() {
    if (refreshToken.value) {
      try { await api.post('/auth/logout', { refresh_token: refreshToken.value }) } catch {}
    }
    _clearSession()
  }

  async function refreshMe() {
    try {
      const data: any = await api.get('/auth/me')
      user.value = data
      localStorage.setItem('user', JSON.stringify(data))
    } catch {}
  }

  function _setSession(data: any) {
    accessToken.value  = data.access_token
    refreshToken.value = data.refresh_token
    user.value         = data.user
    localStorage.setItem('access_token',  data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('user',          JSON.stringify(data.user))
  }

  function _clearSession() {
    accessToken.value  = null
    refreshToken.value = null
    user.value         = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  }

  return {
    user, accessToken, refreshToken,
    isLoggedIn, isAdmin, isEng,
    login, register, sendVerifyCode, logout, refreshMe,
  }
})