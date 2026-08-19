<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="card-header">
        <div class="form-top-title">
          <span v-if="mode === 'login'">欢迎回来</span>
          <span v-else-if="mode === 'register' && regStep === 1">创建账号</span>
          <span v-else-if="mode === 'register' && regStep === 2">验证邮箱</span>
          <span v-else-if="mode === 'forgot'">重置密码</span>
          <span v-else-if="mode === 'reset'">设置新密码</span>
        </div>
        <div class="logo-area">
          <span class="logo-icon">⚡</span>
          <h1 class="logo-title">Data & Knowledge Platform</h1>
          <div class="logo-subtitle">企业ATE测试数据资产平台</div>
        </div>
      </div>

      <!-- 登录 -->
      <div v-if="mode === 'login'" class="form-section">
        
        <form @submit.prevent="handleLogin">
          <div class="field">
            <label>用户名</label>
            <input v-model="loginForm.username" type="text" placeholder="请输入用户名" required autocomplete="username" />
          </div>
          <div class="field">
            <label>密码</label>
            <input v-model="loginForm.password" type="password" placeholder="请输入密码" required autocomplete="current-password" />
          </div>
          <div v-if="error" class="msg error">{{ error }}</div>
          <button type="submit" class="btn-primary" :disabled="loading">
            {{ loading ? '登录中...' : '登 录' }}
          </button>
          <div class="links">
            <span @click="mode = 'forgot'" class="link">忘记密码？</span>
            <span @click="mode = 'register'; error=''" class="link">注册账号</span>
          </div>
        </form>
      </div>

      <!-- 注册 Step 1：填写信息 + 发验证码 -->
      <div v-else-if="mode === 'register' && regStep === 1" class="form-section">
        
        <form @submit.prevent="handleSendCode">
          <div class="field">
            <label>用户名</label>
            <input v-model="regForm.username" type="text" placeholder="至少3个字符" required minlength="3" />
          </div>
          <div class="field">
            <label>邮箱</label>
            <input v-model="regForm.email" type="email" placeholder="用于接收验证码" required />
          </div>
          <div class="field">
            <label>密码</label>
            <input v-model="regForm.password" type="password" placeholder="至少8位，含字母和数字" required />
            <div class="hint">{{ passwordHint }}</div>
          </div>
          <div v-if="error" class="msg error">{{ error }}</div>
          <button type="submit" class="btn-primary" :disabled="loading || codeCooldown > 0">
            {{ loading ? '发送中...' : codeCooldown > 0 ? `重新发送 (${codeCooldown}s)` : '发送验证码' }}
          </button>
          <div class="links">
            <span @click="mode = 'login'; error=''" class="link">已有账号？去登录</span>
          </div>
        </form>
      </div>

      <!-- 注册 Step 2：输入验证码 -->
      <div v-else-if="mode === 'register' && regStep === 2" class="form-section">
        
        <p class="sub-text">验证码已发送至 <strong>{{ regForm.email }}</strong>，10分钟内有效</p>
        <form @submit.prevent="handleRegister">
          <div class="field">
            <label>验证码</label>
            <div class="code-row">
              <input v-model="regForm.code" type="text" placeholder="请输入6位验证码"
                     maxlength="6" inputmode="numeric" required class="code-input" />
              <button type="button" class="btn-outline" :disabled="codeCooldown > 0" @click="handleSendCode">
                {{ codeCooldown > 0 ? `${codeCooldown}s` : '重发' }}
              </button>
            </div>
          </div>
          <div v-if="error" class="msg error">{{ error }}</div>
          <div v-if="successMsg" class="msg success">{{ successMsg }}</div>
          <button type="submit" class="btn-primary" :disabled="loading">
            {{ loading ? '注册中...' : '完成注册' }}
          </button>
          <div class="links">
            <span @click="regStep = 1; error=''" class="link">← 返回修改</span>
          </div>
        </form>
      </div>

      <!-- 忘记密码 -->
      <div v-else-if="mode === 'forgot'" class="form-section">
        
        <form @submit.prevent="handleForgot">
          <div class="field">
            <label>注册邮箱</label>
            <input v-model="forgotEmail" type="email" placeholder="请输入您的注册邮箱" required />
          </div>
          <div v-if="error" class="msg error">{{ error }}</div>
          <div v-if="successMsg" class="msg success">{{ successMsg }}</div>
          <button type="submit" class="btn-primary" :disabled="loading">
            {{ loading ? '发送中...' : '发送重置链接' }}
          </button>
          <div class="links">
            <span @click="mode = 'login'; error=''; successMsg=''" class="link">← 返回登录</span>
          </div>
        </form>
      </div>

      <!-- 重置密码（从邮件链接进入） -->
      <div v-else-if="mode === 'reset'" class="form-section">
        
        <form @submit.prevent="handleReset">
          <div class="field">
            <label>新密码</label>
            <input v-model="resetForm.password" type="password" placeholder="至少8位，含字母和数字" required />
          </div>
          <div class="field">
            <label>确认新密码</label>
            <input v-model="resetForm.confirm" type="password" placeholder="再次输入新密码" required />
          </div>
          <div v-if="error" class="msg error">{{ error }}</div>
          <div v-if="successMsg" class="msg success">{{ successMsg }}</div>
          <button type="submit" class="btn-primary" :disabled="loading">
            {{ loading ? '重置中...' : '确认重置' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api/index'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

const router   = useRouter()
const route    = useRoute()
const authStore = useAuthStore()

const mode       = ref<Mode>('login')
const regStep    = ref(1)
const loading    = ref(false)
const error      = ref('')
const successMsg = ref('')
const codeCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const loginForm = ref({ username: '', password: '' })
const regForm   = ref({ username: '', email: '', password: '', code: '' })
const forgotEmail = ref('')
const resetForm = ref({ password: '', confirm: '' })
const resetToken = ref('')

const passwordHint = computed(() => {
  const p = regForm.value.password
  if (!p) return ''
  if (p.length < 8) return '❌ 至少8位'
  const hasLetter = /[a-zA-Z]/.test(p)
  const hasDigit  = /\d/.test(p)
  if (!hasLetter || !hasDigit) return '❌ 必须包含字母和数字'
  return '✅ 密码强度良好'
})

onMounted(() => {
  // 检测是否是重置密码链接
  const token = route.query.token as string
  if (token) {
    resetToken.value = token
    mode.value = 'reset'
  }
})

function startCooldown() {
  codeCooldown.value = 60
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    codeCooldown.value--
    if (codeCooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
    }
  }, 1000)
}

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await authStore.login(loginForm.value.username, loginForm.value.password)
    router.push('/')
  } catch (e: any) {
    error.value = e || '用户名或密码错误，请重试'
    loginForm.value.password = ''
  } finally {
    loading.value = false
  }
}

async function handleSendCode() {
  error.value = ''
  if (!regForm.value.username || !regForm.value.email || !regForm.value.password) {
    error.value = '请填写所有字段'; return
  }
  if (regForm.value.password.length < 8) {
    error.value = '密码至少8位'; return
  }
  loading.value = true
  try {
    await authStore.sendVerifyCode(regForm.value.username, regForm.value.email, regForm.value.password)
    regStep.value = 2
    startCooldown()
  } catch (e: any) {
    error.value = e || '发送失败'
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  error.value = ''
  loading.value = true
  try {
    await authStore.register(
      regForm.value.username,
      regForm.value.email,
      regForm.value.password,
      regForm.value.code,
    )
    successMsg.value = '注册成功，正在为您自动登录...'
    await authStore.login(regForm.value.username, regForm.value.password)
    router.push('/')
  } catch (e: any) {
    error.value = e || '注册失败'
  } finally {
    loading.value = false
  }
}

async function handleForgot() {
  error.value = ''
  loading.value = true
  try {
    await api.post('/auth/forgot-password', { email: forgotEmail.value })
    successMsg.value = '如果该邮箱已注册，重置链接将发送至您的邮箱，请查收。'
  } catch (e: any) {
    error.value = e || '操作失败'
  } finally {
    loading.value = false
  }
}

async function handleReset() {
  error.value = ''
  if (resetForm.value.password !== resetForm.value.confirm) {
    error.value = '两次输入的密码不一致'; return
  }
  loading.value = true
  try {
    await api.post('/auth/reset-password', {
      token: resetToken.value,
      new_password: resetForm.value.password,
    })
    successMsg.value = '密码已重置！3秒后跳转到登录页...'
    setTimeout(() => {
      router.replace('/login')
      mode.value = 'login'
    }, 3000)
  } catch (e: any) {
    error.value = e || '重置失败，链接可能已过期'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
}

.auth-card {
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px;
  width: 420px;
  padding: 40px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.4);
  color: white;
}

.card-header {
  margin-bottom: 28px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.form-top-title {
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 18px;
  letter-spacing: 1px;
}
.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.logo-icon {
  font-size: 32px;
  margin-bottom: 2px;
}
.logo-title {
  font-size: 24px;
  font-weight: 700;
  color: white;
  margin: 0;
  line-height: 1.2;
  text-align: center;
}
.logo-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
  font-weight: 400;
  text-align: center;
}

.form-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 24px;
  color: white;
}

.sub-text { color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 20px; }
.sub-text strong { color: #60a5fa; }

.field { margin-bottom: 18px; }
.field label { display: block; font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 6px; }
.field input {
  width: 100%;
  padding: 11px 14px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  color: white;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.field input::placeholder { color: rgba(255,255,255,0.35); }
.field input:focus { outline: none; border-color: #60a5fa; background: rgba(255,255,255,0.12); }
.hint { font-size: 12px; margin-top: 5px; color: rgba(255,255,255,0.5); min-height: 16px; }

.code-row { display: flex; gap: 8px; }
.code-input { flex: 1; letter-spacing: 4px; font-size: 16px; text-align: center; }

.btn-primary {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  transition: opacity 0.2s, transform 0.1s;
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-outline {
  padding: 11px 16px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 10px;
  color: rgba(255,255,255,0.7);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.2s;
}
.btn-outline:hover:not(:disabled) { border-color: #60a5fa; color: #60a5fa; }
.btn-outline:disabled { opacity: 0.4; cursor: not-allowed; }

.links {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}
.link {
  font-size: 13px;
  color: #60a5fa;
  cursor: pointer;
  transition: opacity 0.2s;
}
.link:hover { opacity: 0.8; text-decoration: underline; }

.msg { font-size: 13px; margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; }
.msg.error   { background: rgba(239,68,68,0.15);  color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
.msg.success { background: rgba(34,197,94,0.15);  color: #86efac;  border: 1px solid rgba(34,197,94,0.3); }
</style>