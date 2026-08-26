<template>
  <div class="tools-root">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="按小工具名筛选..."
          class="search-input"
        />
        <span class="tool-count">共 {{ filteredTools.length }} 个小工具</span>
      </div>
      <div class="toolbar-right">
        <!-- 预留顶部操作按钮 -->
      </div>
    </div>

    <!-- 隐藏的文件选择框 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".zip,.tar,.gz,.tgz,.7z,.rar"
      style="display: none"
      @change="handleFileSelected"
    />

    <!-- 主表格 -->
    <div class="table-scroll">
      <table class="tools-table">
        <thead>
          <tr>
            <th class="th-no">序号</th>
            <th class="th-name">小工具及操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(tool, index) in filteredTools" :key="tool.id" class="data-row">
            <td class="td-no">{{ index + 1 }}</td>
            <td class="td-content">
              <div class="tool-item-row">
                <span class="tool-title">{{ tool.name }}</span>
                <div class="tool-buttons">
                  <!-- 自定义按键 1 -->
                  <button
                    v-if="tool.btn1?.label"
                    :class="['btn', tool.btn1.className || 'btn-primary', { 'btn-loading': isTool1Busy && tool.id === 1 }]"
                    :disabled="isTool1Busy && tool.id === 1"
                    @click="handleButtonClick(tool, 1)"
                  >
                    <span v-if="isTool1Busy && tool.id === 1" class="loading-spinner"></span>
                    {{ getButton1Label(tool) }}
                  </button>

                  <!-- 自定义按键 2 -->
                  <button
                    v-if="tool.btn2?.label"
                    :class="['btn', tool.btn2.className || 'btn-default']"
                    @click="handleButtonClick(tool, 2)"
                  >
                    {{ tool.btn2.label }}
                  </button>

                  <!-- 自定义按键 3 -->
                  <button
                    v-if="tool.btn3?.label"
                    :class="['btn', tool.btn3.className || 'btn-default']"
                    @click="handleButtonClick(tool, 3)"
                  >
                    {{ tool.btn3.label }}
                  </button>

                  <!-- 自定义按键 4 -->
                  <button
                    v-if="tool.btn4?.label"
                    :class="['btn', tool.btn4.className || 'btn-default']"
                    @click="handleButtonClick(tool, 4)"
                  >
                    {{ tool.btn4.label }}
                  </button>
                </div>
                <span v-if="tool.description" class="tool-desc">{{ tool.description }}</span>
              </div>
            </td>
          </tr>

          <tr v-if="!filteredTools.length">
            <td colspan="2" class="td-empty">
              {{ searchQuery ? '未找到匹配的小工具' : '暂无可用小工具' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 弹窗/操作预留反馈 -->
    <div v-if="activeDialog.show" class="overlay" @click.self="activeDialog.show = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ activeDialog.title }}</h3>
          <button class="close-btn" @click="activeDialog.show = false">✕</button>
        </div>
        <div class="dialog-content">
          <p>{{ activeDialog.content }}</p>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-primary" @click="activeDialog.show = false">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import api from '@/api'

interface ToolButton {
  label: string
  className?: string
  action?: (tool: ToolItem) => void
}

interface ToolItem {
  id: number
  name: string
  description?: string
  btn1?: ToolButton
  btn2?: ToolButton
  btn3?: ToolButton
  btn4?: ToolButton
}

const searchQuery = ref('')
const fileInputRef = ref<HTMLInputElement>()

// 工具1执行状态: 'idle' | 'processing' | 'downloading'
const tool1State = ref<'idle' | 'processing' | 'downloading'>('idle')
const tool1Progress = ref<number | null>(null)

const isTool1Busy = computed(() => tool1State.value !== 'idle')

function getButton1Label(tool: ToolItem): string {
  if (tool.id === 1) {
    if (tool1State.value === 'processing') {
      return '修改中...'
    }
    if (tool1State.value === 'downloading') {
      return tool1Progress.value !== null ? `下载中 (${tool1Progress.value}%)` : '下载中...'
    }
    return tool.btn1?.label || '上传程序'
  }
  return tool.btn1?.label || '按键 1'
}

const toolsList = ref<ToolItem[]>([
  {
    id: 1,
    name: '程序增加Function测试时间',
    description: '上传程序后自动下载，编译测试后在pgs同目录会生成time.csv来查看各个Function的测试时间',
    btn1: {
      label: '上传程序',
      className: 'btn-primary',
      action: () => {
        triggerTool1Upload()
      },
    },
  },
])

const activeDialog = reactive({
  show: false,
  title: '',
  content: '',
})

const filteredTools = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return toolsList.value
  return toolsList.value.filter((item) =>
    item.name.toLowerCase().includes(query) || (item.description && item.description.toLowerCase().includes(query))
  )
})

function triggerTool1Upload() {
  if (isTool1Busy.value) return
  fileInputRef.value?.click()
}

async function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0 || !files[0]) return

  const file = files[0]
  input.value = '' // 清空以允许重复选择同名文件

  const formData = new FormData()
  formData.append('file', file)

  tool1State.value = 'processing'
  tool1Progress.value = null

  try {
    const response: any = await api.post('/tools/add-function-time/process', formData, {
      responseType: 'blob',
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onDownloadProgress: (progressEvent) => {
        tool1State.value = 'downloading'
        if (progressEvent.total && progressEvent.total > 0) {
          tool1Progress.value = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        } else {
          tool1Progress.value = null
        }
      },
    })

    // 从 Content-Disposition 解析文件名
    let downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_with_time.zip`
    const disposition = response.headers?.['content-disposition']
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/)
      if (match && match[1]) {
        downloadFilename = decodeURIComponent(match[1])
      }
    }

    // 触发自动下载
    const blob = new Blob([response.data || response], { type: 'application/zip' })
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = downloadFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(blobUrl)
  } catch (err: any) {
    let errMsg = '程序修改或下载失败'
    if (typeof err === 'string') {
      errMsg = err
    } else if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text()
        const parsed = JSON.parse(text)
        errMsg = parsed.detail || parsed.message || text || errMsg
      } catch {
        try {
          errMsg = (await err.response.data.text()) || errMsg
        } catch {}
      }
    } else if (err.response?.data?.detail) {
      errMsg = err.response.data.detail
    } else if (err.message) {
      errMsg = err.message
    }
    alert(`❌ ${errMsg}`)
  } finally {
    tool1State.value = 'idle'
    tool1Progress.value = null
  }
}

function handleButtonClick(tool: ToolItem, btnSlot: number) {
  const btn = tool[`btn${btnSlot}` as keyof ToolItem] as ToolButton | undefined
  if (btn?.action) {
    btn.action(tool)
    return
  }

  activeDialog.title = `${tool.name} - 按键 ${btnSlot}`
  activeDialog.content = `触发了 [${tool.name}] 的自定义按键 ${btnSlot} (${btn?.label || '未命名'})。此功能后续将在此接入。`
  activeDialog.show = true
}
</script>

<style scoped>
.tools-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: white;
  padding: 10px 16px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-input {
  padding: 6px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  width: 260px;
  outline: none;
  transition: all 0.3s;
}

.search-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.tool-count {
  font-size: 12px;
  color: #888;
}

.table-scroll {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
}

.tools-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  font-size: 13px;
}

.tools-table th {
  background: #f5f7fa;
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  color: #555;
  border-bottom: 1px solid #e8e8e8;
  white-space: nowrap;
}

.tools-table td {
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  color: #333;
  vertical-align: middle;
}

.data-row:hover td {
  background: #f8faff;
}

.th-no,
.td-no {
  width: 60px;
  text-align: center;
  color: #888;
  font-size: 13px;
}

.th-name,
.td-content {
  padding-left: 20px;
}

.tool-item-row {
  display: inline-flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.tool-title {
  font-weight: 600;
  color: #1f2937;
  font-size: 14px;
  white-space: nowrap;
}

.tool-buttons {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.tool-desc {
  font-size: 12px;
  color: #888;
}

.btn {
  padding: 5px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-primary {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
}

.btn-primary:hover:not(:disabled) {
  background: #40a9ff;
  border-color: #40a9ff;
}

.btn-loading {
  background: #e6f7ff !important;
  color: #1890ff !important;
  border-color: #91d5ff !important;
}

.loading-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #1890ff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.btn-default {
  background: #fafafa;
  color: #555;
  border-color: #d9d9d9;
}

.btn-default:hover:not(:disabled) {
  background: #f0f0f0;
  color: #1890ff;
  border-color: #1890ff;
}

.empty-btn-slot {
  color: #ccc;
}

.td-empty {
  text-align: center;
  color: #bbb;
  padding: 40px !important;
}

/* 弹窗样式 */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.dialog {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 440px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #888;
}

.close-btn:hover {
  color: #333;
}

.dialog-content {
  font-size: 14px;
  color: #555;
  line-height: 1.6;
  margin-bottom: 20px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
