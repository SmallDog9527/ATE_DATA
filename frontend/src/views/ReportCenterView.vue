<template>
  <div class="report-center">
    <div class="page-header">
      <h2>📊 报表中心</h2>
      <div class="header-actions">
        <div class="filter-group">
          <label class="filter-label">产品名筛选:</label>
          <div class="product-filter-container">
            <label class="all-check">
              <input type="checkbox" :checked="isAllProductsSelected" @change="toggleAllProducts" />
              <span>全选</span>
            </label>
            <div class="product-options">
              <label v-for="prod in uniqueProducts" :key="prod" class="prod-option">
                <input type="checkbox" :value="prod" v-model="selectedProducts" />
                <span>{{ prod }}</span>
              </label>
            </div>
          </div>
        </div>
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="搜索报表名称..." 
          class="search-input"
        />
      </div>
    </div>

    <div class="report-tabs-bar">
      <div class="tabs">
        <button class="tab-btn" :class="{ active: activeTab === 'eng' }" @click="activeTab = 'eng'">ENG</button>
        <button class="tab-btn" :class="{ active: activeTab === 'osat' }" @click="activeTab = 'osat'">OSAT</button>
      </div>
      <div v-if="activeTab === 'osat' && isGlobalViewer" class="osat-update-bar">
        <span class="range-label">最近</span>
        <input v-model.number="osatRangeValue" class="range-input" type="number" min="1" max="52" />
        <select v-model="osatRangeUnit" class="range-select">
          <option value="weeks">周</option>
          <option value="months">月</option>
        </select>
        <button class="update-btn" :disabled="updatingOsat" @click="updateOsatSummary">
          {{ updatingOsat ? 'Updating...' : 'Update' }}
        </button>
        <span v-if="osatUpdateMsg" :class="['update-msg', osatUpdateMsg.ok ? 'ok' : 'error']">{{ osatUpdateMsg.text }}</span>
      </div>
    </div>

    <div class="report-list-card">
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 60px;">No.</th>
            <th @click="sort('product_name')">产品名 <span v-if="sortBy === 'product_name'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></th>
            <th @click="sort('name')">报表名称 <span v-if="sortBy === 'name'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></th>
            <th @click="sort('type')">类型 <span v-if="sortBy === 'type'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></th>
            <th v-if="isGlobalViewer">创建者</th>
            <th v-if="activeTab === 'osat'">数据范围</th>
            <th v-if="activeTab === 'osat'">LOT数量</th>
            <th>分析备注</th>
            <th @click="sort('createTime')">保存时间 <span v-if="sortBy === 'createTime'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(report, index) in filteredReports" :key="report.id">
            <td class="no-cell">{{ index + 1 }}</td>
            <td class="product-cell">{{ report.product_name || '-' }}</td>
            <td class="name-cell">
              <div v-if="editingId === report.id" class="edit-box">
                <input 
                  type="text" 
                  v-model="editName" 
                  @blur="saveEdit(report)" 
                  @keyup.enter="saveEdit(report)" 
                  @mouseleave="saveEdit(report)"
                  class="edit-input"
                  v-focus
                />
              </div>
              <div v-else class="name-display">
                <a :href="report.url" target="_blank" class="report-link">{{ report.name }}</a>
                <button v-if="canModify(report)" class="action-btn rename-small" @click="startEdit(report)" title="重命名">✏️</button>
              </div>
            </td>
            <td><span class="type-badge">{{ report.type }}</span></td>
            <td v-if="isGlobalViewer"><span class="creator-badge">{{ report.username }}</span></td>
            <td v-if="activeTab === 'osat'" class="range-cell">{{ formatOsatRange(report) }}</td>
            <td v-if="activeTab === 'osat'" class="lot-count-cell">{{ report.config_data?.lot_count ?? '-' }}</td>
            <td class="comment-cell">
              <textarea 
                v-model="report.comment" 
                @focus="startCommentEdit(report)"
                @blur="saveComment(report)" 
                @mouseleave="saveComment(report)"
                :disabled="!canModify(report)"
                placeholder="添加分析备注..."
                class="inline-comment-input"
              ></textarea>
            </td>
            <td class="time-cell">{{ report.createTime }}</td>
            <td class="actions-cell">
              <button v-if="canModify(report)" class="action-btn delete" @click="deleteReport(report.id)" title="删除">🗑️</button>
            </td>
          </tr>
          <tr v-if="filteredReports.length === 0">
            <td :colspan="tableColspan" class="empty-state">暂无报表记录</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import api from '@/api'
import { useTimezoneStore } from '@/stores/timezone'
import { fmtDateTz } from '@/utils/dateUtils'

interface Report {
  id: string | number
  name: string
  product_name?: string
  url: string
  createTime: string
  type: string
  source?: 'eng' | 'osat' | string
  comment?: string
  config_data?: Record<string, any>
  username?: string
  created_at: string
}

const reports = ref<Report[]>([])
const searchQuery = ref('')
const sortBy = ref('createTime')
const sortOrder = ref<'asc' | 'desc'>('desc')
const activeTab = ref<'eng' | 'osat'>('eng')
const osatRangeValue = ref(2)
const osatRangeUnit = ref<'weeks' | 'months'>('weeks')
const updatingOsat = ref(false)
const osatUpdateMsg = ref<{ ok: boolean; text: string } | null>(null)

const editingId = ref<string | number | null>(null)
const editName = ref('')
const selectedProducts = ref<string[]>([])

const currentUsername = ref('unknown')
const isGlobalViewer = ref(false)

function loadUserInfo() {
  try {
    const userInfoStr = localStorage.getItem('user')
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr)
      const username = (userInfo.username || '').toLowerCase().trim()
      currentUsername.value = username || 'unknown'
      const role = (userInfo.role || '').toLowerCase().trim()
      isGlobalViewer.value = role === 'admin' || role === 'eng'
    }
  } catch (e) {}
}

function canModify(report: Report) {
  let role = ''
  try {
    const userInfoStr = localStorage.getItem('user')
    if (userInfoStr) {
      role = (JSON.parse(userInfoStr).role || '').toLowerCase().trim()
    }
  } catch (e) {}
  if (role === 'admin') return true
  if ((report.source || 'eng') === 'osat') return false
  
  const loggedInUsername = currentUsername.value.toLowerCase().trim()
  const reportUsername = (report.username || '').toLowerCase().trim()
  return loggedInUsername === reportUsername
}

const allowedReports = computed(() => {
  const sourceReports = reports.value.filter(r => (r.source || 'eng') === activeTab.value)
  if (isGlobalViewer.value) {
    return sourceReports
  }
  const curUser = currentUsername.value.toLowerCase().trim()
  return sourceReports.filter((r: any) => {
    const repUser = (r.username || '').toLowerCase().trim()
    return repUser === curUser
  })
})

const tableColspan = computed(() => {
  let cols = isGlobalViewer.value ? 8 : 7
  if (activeTab.value === 'osat') cols += 2
  return cols
})

const uniqueProducts = computed(() => {
  const prods = new Set<string>()
  allowedReports.value.forEach(r => {
    if (r.product_name) prods.add(r.product_name)
    else prods.add('Unknown')
  })
  return Array.from(prods).sort()
})

// 监听 uniqueProducts 改变，自动并响应式地重置/初始化已选产品过滤器，确保在切换用户或报表加载时永远保持正确同步
watch(uniqueProducts, (newProds) => {
  selectedProducts.value = [...newProds]
}, { immediate: true })

const isAllProductsSelected = computed(() => {
  return selectedProducts.value.length === uniqueProducts.value.length
})

function toggleAllProducts() {
  if (isAllProductsSelected.value) {
    selectedProducts.value = []
  } else {
    selectedProducts.value = [...uniqueProducts.value]
  }
}

const timezoneStore = useTimezoneStore()

function formatDateTime(dateStr: string) {
  return fmtDateTz(dateStr) || '-'
}

function formatOsatRange(report: Report) {
  const cfg = report.config_data || {}
  const value = cfg.range_value
  const unit = cfg.range_unit === 'months' ? '月' : '周'
  if (value) return `最近 ${value} ${unit}`
  return '-'
}

// 监听时区变化，重新格式化所有报表的时间显示
watch(() => timezoneStore.timezone, () => {
  reports.value.forEach(r => {
    r.createTime = formatDateTime((r as any).created_at)
  })
})

async function loadReports() {
  loadUserInfo()
  try {
    const res: any = await api.get('/reports')
    reports.value = res.map((r: any) => ({
      ...r,
      source: r.source || 'eng',
      createTime: formatDateTime(r.created_at)
    }))
  } catch (err: any) {
    console.error('加载报表失败:', err)
  }
}

const filteredReports = computed(() => {
  let list = allowedReports.value.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                         r.type.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchesProduct = selectedProducts.value.includes(r.product_name || 'Unknown')
    return matchesSearch && matchesProduct
  })

  list.sort((a: any, b: any) => {
    let valA = a[sortBy.value]
    let valB = b[sortBy.value]
    if (sortBy.value === 'createTime') {
      valA = new Date(a.created_at).getTime()
      valB = new Date(b.created_at).getTime()
    }
    
    if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1
    if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1
    return 0
  })

  return list
})

async function updateOsatSummary() {
  if (!Number.isFinite(osatRangeValue.value) || osatRangeValue.value < 1) {
    osatUpdateMsg.value = { ok: false, text: '请输入有效的时间范围' }
    return
  }

  updatingOsat.value = true
  osatUpdateMsg.value = null
  try {
    const res: any = await api.post('/reports/osat/update-summary', null, {
      params: {
        range_value: osatRangeValue.value,
        range_unit: osatRangeUnit.value
      }
    })
    osatUpdateMsg.value = {
      ok: true,
      text: `已更新 ${res.updated_count ?? 0} 个产品，覆盖 ${res.lot_count ?? 0} 个 LOT`
    }
    await loadReports()
  } catch (err: any) {
    osatUpdateMsg.value = { ok: false, text: err || 'OSAT Summary 更新失败' }
  } finally {
    updatingOsat.value = false
  }
}

function sort(field: string) {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortOrder.value = 'desc'
  }
}

async function deleteReport(id: string | number) {
  if (confirm('确定要删除该报表记录吗？')) {
    try {
      await api.delete(`/reports/${id}`)
      reports.value = reports.value.filter(r => r.id !== id)
    } catch (err: any) {
      alert(err || '删除失败')
    }
  }
}

function startEdit(report: Report) {
  editingId.value = report.id
  editName.value = report.name
}

const originalComments = ref<Record<string | number, string>>({})

function startCommentEdit(report: Report) {
  if (originalComments.value[report.id] === undefined) {
    originalComments.value[report.id] = report.comment || ''
  }
}

async function saveEdit(report: Report) {
  if (editingId.value !== report.id) return
  if (!editName.value.trim()) {
    editingId.value = null
    return
  }
  const newName = editName.value.trim()
  if (newName === report.name) {
    editingId.value = null
    return
  }
  const oldName = report.name
  report.name = newName
  editingId.value = null
  try {
    await api.put(`/reports/${report.id}`, { name: newName })
  } catch (err: any) {
    report.name = oldName
    alert(err || '重命名失败')
  }
}

async function saveComment(report: Report) {
  const currentComment = report.comment || ''
  const originalComment = originalComments.value[report.id]
  
  if (originalComment === undefined || currentComment === originalComment) {
    return
  }
  
  originalComments.value[report.id] = currentComment
  
  try {
    await api.put(`/reports/${report.id}`, { comment: currentComment })
  } catch (err: any) {
    report.comment = originalComment
    originalComments.value[report.id] = originalComment
    alert(err || '保存备注失败')
  }
}

const vFocus = {
  mounted: (el: HTMLInputElement) => el.focus()
}

onMounted(loadReports)
</script>

<script lang="ts">
export default {
  name: 'ReportCenterView'
}
</script>

<style scoped>
.report-center {
  padding: 24px;
  background: #f0f2f5;
  min-height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #1a1a1a;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 24px;
}

.report-tabs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.tabs {
  display: inline-flex;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  overflow: hidden;
}

.tab-btn {
  border: none;
  background: transparent;
  padding: 8px 18px;
  cursor: pointer;
  color: #555;
  font-weight: 600;
}

.tab-btn.active {
  background: #1890ff;
  color: #fff;
}

.osat-update-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
}

.range-label {
  color: #555;
  font-size: 13px;
}

.range-input {
  width: 64px;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}

.range-select {
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
}

.update-btn {
  border: none;
  background: #1890ff;
  color: #fff;
  border-radius: 4px;
  padding: 7px 14px;
  cursor: pointer;
  font-weight: 600;
}

.update-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.update-msg {
  font-size: 13px;
  white-space: nowrap;
}

.update-msg.ok { color: #237804; }
.update-msg.error { color: #cf1322; }

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
  font-size: 13px;
  color: #666;
  font-weight: 500;
  white-space: nowrap;
}

.product-filter-container {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #d9d9d9;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.product-options {
  display: flex;
  align-items: center;
  gap: 12px;
  border-left: 1px solid #eee;
  padding-left: 12px;
  max-width: 500px;
  overflow-x: auto;
}

.all-check, .prod-option {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.all-check span { font-weight: bold; color: #1890ff; }

.search-input {
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  width: 250px;
  font-size: 14px;
  outline: none;
  transition: all 0.3s;
}
.search-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
}

.report-list-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  overflow: hidden;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.report-table th, .report-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

.report-table th {
  background: #fafafa;
  font-weight: 600;
  color: #555;
  cursor: pointer;
  user-select: none;
}
.report-table th:hover { background: #f0f0f0; }

.report-link {
  color: #1890ff;
  text-decoration: none;
  font-weight: 500;
}
.report-link:hover { text-decoration: underline; }

.type-badge {
  background: #e6f7ff;
  color: #1890ff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid #91d5ff;
}

.creator-badge {
  background: #f5f5f5;
  color: #666;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid #d9d9d9;
}

.time-cell {
  color: #888;
  font-size: 13px;
}

.range-cell,
.lot-count-cell {
  color: #555;
  font-size: 13px;
  white-space: nowrap;
}

.actions-cell {
  display: flex;
  gap: 12px;
}

.action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
}
.action-btn:hover { background: #f5f5f5; }
.action-btn.delete:hover { background: #fff1f0; }

.empty-state {
  text-align: center;
  padding: 40px !important;
  color: #999;
}

.name-cell {
  min-width: 450px;
}

.name-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-box {
  width: 100%;
  display: flex;
}

.edit-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 14px;
  border: 1px solid #1890ff;
  border-radius: 4px;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
  box-sizing: border-box;
}

.rename-small {
  font-size: 12px;
  opacity: 0.3;
  transition: opacity 0.2s;
}

.name-cell:hover .rename-small {
  opacity: 1;
}

.comment-cell {
  width: 300px;
}

.inline-comment-input {
  width: 100%;
  height: 32px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  resize: vertical;
  transition: all 0.2s;
  color: #666;
}

.inline-comment-input:hover {
  background: #f9f9f9;
  border-color: #d9d9d9;
}

.inline-comment-input:focus {
  background: white;
  border-color: #1890ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24,144,255,0.1);
  height: 60px;
}
</style>
