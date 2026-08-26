<template>
  <div class="lot-list">
    <!-- Tab 切换 -->
    <div class="home-tabs">
      <button :class="['home-tab-btn', { active: activeHomeTab === 'ENG_DATA' }]" @click="activeHomeTab = 'ENG_DATA'">
        📁 ENG_DATA
      </button>
      <button :class="['home-tab-btn', { active: activeHomeTab === 'all' }]" @click="activeHomeTab = 'all'">
        📋 全部数据
      </button>
      <button :class="['home-tab-btn', { active: activeHomeTab === 'FT' }]" @click="activeHomeTab = 'FT'">
        🚀 OSAT_FT
      </button>
      <button :class="['home-tab-btn', { active: activeHomeTab === 'CP' }]" @click="activeHomeTab = 'CP'">
        🔮 OSAT_CP
      </button>
      <button :class="['home-tab-btn', { active: activeHomeTab === 'CP_LOT' }]" @click="activeHomeTab = 'CP_LOT'">
        📦 CP_LOT
      </button>
    </div>

    <!-- 顶部操作栏 -->
    <div class="toolbar" v-if="activeHomeTab !== 'program_change'">
      <div class="toolbar-left">
        <button class="btn btn-primary" @click="showUpload = true">⬆ 上传</button>
        <button class="btn" @click="fetchLots">🔄 刷新</button>
        <button class="btn btn-danger"
                :disabled="!selectedRows.length || (activeHomeTab !== 'ENG_DATA' && !authStore.isAdmin)"
                :title="(activeHomeTab !== 'ENG_DATA' && !authStore.isAdmin) ? '非管理员仅在 ENG_DATA 中可删除个人上传数据' : ''"
                @click="handleDelete">
          🗑 删除 {{ selectedRows.length ? `(${selectedRows.length})` : '' }}
        </button>
        <button class="btn btn-download" :disabled="!selectedRows.length" @click="handleDownload"
                @mouseover="handleMouseOverDownload"
                @mousemove="handleMouseMove"
                @mouseleave="hoverTip = ''">
          ⬇ 下载原数据 {{ selectedRows.length ? `(${selectedRows.length})` : '' }}
        </button>
        <button class="btn btn-merge" :disabled="selectedRows.length < 2" @click="openMergeDialog"
                @mouseover="handleMouseOverMerge"
                @mousemove="handleMouseMove"
                @mouseleave="hoverTip = ''">
          🔗 合并数据 {{ selectedRows.length >= 2 ? `(${selectedRows.length})` : '' }}
        </button>
        <button class="btn btn-merge-many" :disabled="selectedRows.length < 2" @click="openMergeManyDialog"
                @mouseover="handleMouseOverMergeMany"
                @mousemove="handleMouseMove"
                @mouseleave="hoverTip = ''">
          🧩 合多数据 {{ selectedRows.length >= 2 ? `(${selectedRows.length})` : '' }}
        </button>
        <button class="btn btn-multi-analysis" :disabled="selectedRows.length < 2" @click="handleMultiAnalysis"
                @mouseover="handleMouseOverMultiAnalysis"
                @mousemove="handleMouseMove"
                @mouseleave="hoverTip = ''">
          📊 分析数据 {{ selectedRows.length >= 2 ? `(${selectedRows.length})` : '' }}
        </button>
        <button class="btn btn-multi-bin" :disabled="selectedRows.length < 2" @click="handleMultiBin"
                @mouseover="handleMouseOverMultiBin"
                @mousemove="handleMouseMove"
                @mouseleave="hoverTip = ''">
          🗂 分析Bin {{ selectedRows.length >= 2 ? `(${selectedRows.length})` : '' }}
        </button>
        <button class="btn btn-check" @click="handleRecalcCheck" :disabled="!selectedRows.length || recalcChecking"
                @mouseover="handleMouseOverCheck"
                @mousemove="handleMouseMove"
                @mouseleave="hoverTip = ''">
          ⚡ Check {{ recalcChecking ? '重算中...' : '' }}
        </button>
        <button class="btn btn-reparse" @click="handleReparse" :disabled="!selectedRows.length || reparsing"
                @mouseover="handleMouseOverReparse"
                @mousemove="handleMouseMove"
                @mouseleave="hoverTip = ''">
          重新解析 {{ reparsing ? '提交中...' : (selectedRows.length ? `(${selectedRows.length})` : '') }}
        </button>
        <span v-if="uploading" class="uploading-badge">⬆ 上传中...</span>
        <span v-else-if="pollingTimer" class="polling-badge">⏳ 处理中，自动刷新...</span>
      </div>
      <div class="toolbar-right">
        <input
          v-model="filters.product_name"
          placeholder="产品名筛选"
          class="filter-input"
          @input="fetchLotsFromFirstPage"
        />
        <input
          v-model="filters.lot_id"
          placeholder="批号筛选"
          class="filter-input"
          @input="fetchLotsFromFirstPage"
        />
        <select v-model="filters.status" class="filter-select" @change="fetchLotsFromFirstPage">
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="processing">处理中</option>
          <option value="processed">已完成</option>
          <option value="failed">失败</option>
        </select>
      </div>
    </div>

    <!-- 鼠标悬浮提示框 -->
    <div v-if="hoverTip" class="floating-hover-tip" :style="{ left: mouseX + 'px', top: mouseY + 'px' }">
      💡 {{ hoverTip }}
    </div>

    <!-- 表格 -->
    <div class="table-container">
      <ag-grid-vue
        class="ag-theme-alpine"
        :theme="'legacy'"
        :rowData="filteredLots"
        :columnDefs="computedColumnDefs"
        :defaultColDef="defaultColDef"
        :rowSelection="rowSelection"
        :pagination="false"
        @selection-changed="onSelectionChanged"
        @grid-ready="onGridReady"
        @filter-changed="onGridFilterChanged"
        @cell-double-clicked="onCellDoubleClicked"
        style="width: 100%; flex: 1; min-height: 0;"
      />
      <div class="db-page-footer">
        <span class="db-page-size">
          Page Size: {{ backendPageSize }}
        </span>
        <span class="db-page-summary">
          本页 {{ lots.length }}（总 {{ backendTotal }}）
        </span>
        <span class="db-page-range">
          第 {{ backendPageStart }}-{{ backendPageEnd }} 条
        </span>
        <button class="db-page-btn" :disabled="backendPage <= 1" @click="goBackendPage(1)">
          |&lt;
        </button>
        <button class="db-page-btn" :disabled="backendPage <= 1" @click="goBackendPage(backendPage - 1)">
          &lt;
        </button>
        <span>Page {{ backendPage }} of {{ backendTotalPages }}</span>
        <button class="db-page-btn" :disabled="backendPage >= backendTotalPages" @click="goBackendPage(backendPage + 1)">
          &gt;
        </button>
        <button class="db-page-btn" :disabled="backendPage >= backendTotalPages" @click="goBackendPage(backendTotalPages)">
          &gt;|
        </button>
        <label class="db-page-jump">
          跳至
          <input
            type="number"
            :value="backendPage"
            min="1"
            :max="backendTotalPages"
            @keyup.enter="goBackendPage(Number(($event.target as HTMLInputElement).value))"
            @change="goBackendPage(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
    </div>

    <!-- 上传对话框 -->
    <div v-if="showUpload" class="modal-overlay" @click.self="showUpload = false">
      <div class="modal">
        <h3>上传数据文件</h3>
        <div
          class="drop-zone"
          @dragover.prevent
          @drop.prevent="handleDrop"
          @click="fileInput?.click()"
        >
          <p>点击或拖拽文件到此处</p>
          <p class="hint">请上传 .csv / .zip / .rar / .gz / .txt / .xls / .xlsx 格式</p>
          <!-- <p class="hint stdf-hint">⚡ STDF 文件将自动转换为 CSV 后分析</p> -->
        </div>
        <input ref="fileInput" type="file" accept=".csv,.zip,.rar,.stdf,.std,.stdf.gz,.std.gz,.csv.gz,.gz,.txt,.xls,.xlsx" multiple hidden @change="handleFileSelect" />
        <div v-if="uploadFiles.length" class="upload-list">
          <div v-for="f in uploadFiles" :key="f.name" class="upload-item">
            <span>
              {{ f.name }}
              <span v-if="isStdfFile(f.name)" class="stdf-badge">⚡ STDF→CSV</span>
            </span>
            <span class="file-size">{{ formatSize(f.size) }}</span>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="showUpload = false">取消</button>
          <button class="btn btn-primary" :disabled="!uploadFiles.length" @click="handleUpload">开始上传</button>
        </div>
      </div>
    </div>

  <!-- 产品名设置弹窗 -->
  <div v-if="productDialog" class="modal-overlay" @click.self="productDialog = false">
      <div class="modal">
          <h3>设置产品名</h3>
          <div class="field">
              <label>程序名</label>
              <input :value="productForm.program" disabled style="background:#f5f5f5" />
          </div>
          <div class="field">
              <label>匹配前缀</label>
              <input :value="productForm.prefix" disabled style="background:#f5f5f5" />
          </div>
          <div class="field">
              <label>产品名</label>
              <input
                  v-model="productForm.product_name"
                  placeholder="请输入产品名，如 HL5083A-BD"
                  @keyup.enter="saveProductName"
              />
          </div>
          <p style="font-size:12px;color:#999;margin-top:4px">
              保存后所有相同前缀的LOT将自动更新产品名
          </p>
          <div class="modal-actions">
              <button class="btn" @click="productDialog = false">取消</button>
              <button class="btn btn-primary" @click="saveProductName">保存</button>
          </div>
      </div>
  </div>

  <!-- 合并数据弹窗 -->
  <div v-if="showMergeDialog" class="modal-overlay" @click.self="showMergeDialog = false">
    <div class="modal">
      <h3>合并数据</h3>
      <p style="font-size:12px;color:#666;margin-bottom:12px">
        将选中的 {{ selectedRows.length }} 条记录按时间顺序合并，坐标相同时保留最后一次结果
      </p>
      <div class="field">
        <label>新LOT名称 *</label>
        <input v-model="mergeForm.new_name" placeholder="请输入合并后的LOT名称" @keyup.enter="handleMerge" />
      </div>
      <div class="field">
        <label>批号 (Lot ID)</label>
        <input v-model="mergeForm.new_lot_id" placeholder="留空则使用第一条记录的批号" />
      </div>
      <div class="field">
        <label>晶圆编号 (Wafer ID)</label>
        <input v-model="mergeForm.new_wafer_id" placeholder="留空则使用第一条记录的晶圆编号" />
      </div>
      <div v-if="mergeError" class="merge-error">{{ mergeError }}</div>
      <div class="modal-actions">
        <button class="btn" @click="showMergeDialog = false">取消</button>
        <button class="btn btn-primary" :disabled="!mergeForm.new_name || merging" @click="handleMerge">
          {{ merging ? '合并中...' : '开始合并' }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="showMergeManyDialog" class="modal-overlay" @click.self="showMergeManyDialog = false">
    <div class="modal">
      <h3>合多数据</h3>
      <p style="font-size:12px;color:#666;margin-bottom:12px">
        将选中的 {{ selectedRows.length }} 条记录直接拼接为一条新数据，不做坐标去重，坐标信息会留空
      </p>
      <div class="field">
        <label>新LOT名称 *</label>
        <input v-model="mergeManyForm.new_name" placeholder="请输入合并后的LOT名称" @keyup.enter="handleMergeMany" />
      </div>
      <div class="field">
        <label>批号 (Lot ID)</label>
        <input v-model="mergeManyForm.new_lot_id" placeholder="留空则使用第一条记录的批号" />
      </div>
      <div class="field">
        <label>晶圆编号 (Wafer ID)</label>
        <input v-model="mergeManyForm.new_wafer_id" placeholder="留空则使用第一条记录的晶圆编号" />
      </div>
      <div v-if="mergeManyError" class="merge-error">{{ mergeManyError }}</div>
      <div class="modal-actions">
        <button class="btn" @click="showMergeManyDialog = false">取消</button>
        <button class="btn btn-primary" :disabled="!mergeManyForm.new_name || mergingMany" @click="handleMergeMany">
          {{ mergingMany ? '合并中...' : '开始合多' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Idle Check 参数选择弹窗 -->
  <div v-if="checkDialog" class="modal-overlay" @click.self="checkDialog = false">
    <div class="modal check-modal">
      <h3>设置 Check 监控参数 (程序: {{ currentProgram }})</h3>
      <p style="font-size:12px;color:#666;margin-bottom:12px">
        请选择需要参与计算指纹值的寄存器参数。指纹值 = Σ(参数值[i] * (i+1))
      </p>
      
      <div class="param-selector">
        <div class="selector-header">
          <input v-model="paramSearch" placeholder="搜索参数..." class="search-input" />
          <div class="selection-info">已选 {{ selectedParams.length }} 个</div>
        </div>
        <div class="param-list">
          <label v-for="p in filteredParams" :key="p" class="param-item">
            <input type="checkbox" :value="p" v-model="selectedParams" @click="onCheckboxClick($event, p)" />
            <span>{{ p }}</span>
          </label>
        </div>
      </div>

      <div class="field" style="margin-top: 12px;">
        <label>连续重复报警阈值 (颗)</label>
        <input type="number" v-model.number="checkThreshold" min="2" max="10" />
      </div>

      <div v-if="checkError" class="merge-error">{{ checkError }}</div>
      <div class="modal-actions">
        <button class="btn" @click="checkDialog = false">取消</button>
        <button class="btn btn-primary" :disabled="!selectedParams.length || savingConfig" @click="saveCheckConfig">
          {{ savingConfig ? '保存中...' : '开始分析' }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="displayEditDialog.visible" class="modal-overlay" @click.self="closeDisplayEditDialog">
    <div class="modal display-edit-modal" :style="displayEditModalStyle">
      <h3>{{ displayEditDialog.title }}</h3>
      <div class="field">
        <label>{{ displayEditDialog.label }}</label>
        <template v-if="displayEditDialog.field === 'data_type'">
          <select v-model="displayEditDialog.value" ref="displayEditInput" class="field-select" @keyup.enter="saveDisplayEdit">
            <option value="CP">CP</option>
            <option value="FT">FT</option>
            <option value="QA">QA</option>
            <option value="Summary">Summary</option>
            <option value="CP_LOT">CP_LOT</option>
          </select>
        </template>
        <template v-else-if="displayEditDialog.field === 'test_machine'">
          <select v-model="displayEditDialog.value" ref="displayEditInput" class="field-select" @keyup.enter="saveDisplayEdit">
            <option v-for="opt in uniqueColumnOptions('test_machine')" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </template>
        <template v-else>
          <input
            v-model="displayEditDialog.value"
            ref="displayEditInput"
            @keyup.enter="saveDisplayEdit"
            @keyup.esc="closeDisplayEditDialog"
          />
        </template>
      </div>
      <div v-if="displayEditDialog.error" class="merge-error">{{ displayEditDialog.error }}</div>
      <div class="modal-actions">
        <button class="btn" @click="closeDisplayEditDialog">取消</button>
        <button class="btn btn-primary" :disabled="displayEditDialog.saving" @click="saveDisplayEdit">
          {{ displayEditDialog.saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, defineComponent, h } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import type { GridApi, ColDef } from 'ag-grid-community'
import api from '@/api'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTimezoneStore } from '@/stores/timezone'
const authStore = useAuthStore()
const timezoneStore = useTimezoneStore()

const lots = ref<any[]>([])
const backendPage = ref(1)
const backendPageSize = ref(200)
const backendTotal = ref(0)
const selectedRows = ref<any[]>([])
const showUpload = ref(false)
const uploading = ref(false)
const uploadFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement>()
const gridApi = ref<GridApi>()
const filters = ref({ product_name: '', lot_id: '', status: 'processed' })
const backendGridFilters = ref<Record<string, string>>({})
const allOsatNames = ref<string[]>([])
const displayEditInput = ref<HTMLInputElement>()
const displayEditDialog = ref({
  visible: false,
  row: null as any,
  field: '' as 'filename' | 'lot_id' | 'wafer_id' | 'data_type' | 'test_machine' | '',
  title: '',
  label: '',
  value: '',
  error: '',
  saving: false,
})
const displayEditModalStyle = computed(() => {
  if (displayEditDialog.value.field !== 'filename') {
    return {}
  }
  const textWidth = String(displayEditDialog.value.value || '').length * 8 + 120
  return {
    width: `${Math.min(Math.max(textWidth, 640), 1100)}px`,
    maxWidth: '92vw',
  }
})
const productDialog = ref(false)
const productForm = ref({ id: 0, program: '', prefix: '', product_name: '' })
const router = useRouter()
const recalcChecking = ref(false)
const reparsing = ref(false)

const activeHomeTab = ref('ENG_DATA')
const hoverTip = ref('')
const mouseX = ref(0)
const mouseY = ref(0)

const mergeShowCount = ref(0)
const mergeManyShowCount = ref(0)
const downloadShowCount = ref(0)
const multiAnalysisShowCount = ref(0)
const multiBinShowCount = ref(0)
const checkShowCount = ref(0)
const reparseShowCount = ref(0)

function handleMouseMove(e: MouseEvent) {
  mouseX.value = e.clientX + 10
  mouseY.value = e.clientY + 15
}

function handleMouseOverMerge() {
  if (mergeShowCount.value < 3) {
    hoverTip.value = '将一片的多次测试数据合并为完整数据。'
    mergeShowCount.value++
  }
}

function handleMouseOverMergeMany() {
  if (mergeManyShowCount.value < 3) {
    hoverTip.value = '将多片数据合并在一起显示，无坐标。'
    mergeManyShowCount.value++
  }
}

function handleMouseOverDownload() {
  if (downloadShowCount.value < 3) {
    hoverTip.value = '选择一个或多个数据进行原始数据下载。Combine的不可下载。'
    downloadShowCount.value++
  }
}

function handleMouseOverMultiAnalysis() {
  if (multiAnalysisShowCount.value < 3) {
    hoverTip.value = '分析多片数据的参数分析'
    multiAnalysisShowCount.value++
  }
}

function handleMouseOverMultiBin() {
  if (multiBinShowCount.value < 3) {
    hoverTip.value = '分析多片数据的Summary'
    multiBinShowCount.value++
  }
}

function handleMouseOverCheck() {
  if (checkShowCount.value < 3) {
    hoverTip.value = '添加OTP_trim后的参数，以防FT叠片'
    checkShowCount.value++
  }
}

function handleMouseOverReparse() {
  if (reparseShowCount.value < 3) {
    hoverTip.value = '选择一个或多个数据重新解析。'
    reparseShowCount.value++
  }
}

let gridFilterTimer: ReturnType<typeof setTimeout> | null = null

const backendTotalPages = computed(() => Math.max(1, Math.ceil(backendTotal.value / backendPageSize.value)))
const backendPageStart = computed(() => backendTotal.value ? (backendPage.value - 1) * backendPageSize.value + 1 : 0)
const backendPageEnd = computed(() => Math.min(backendPage.value * backendPageSize.value, backendTotal.value))

const filteredLots = computed(() => {
  if (activeHomeTab.value === 'all') {
    return lots.value
  }
  if (activeHomeTab.value === 'ENG_DATA') {
    return lots.value.filter((l: any) => l.data_source === 'manual' && l.user_id === authStore.user?.id && l.data_type !== 'CP_LOT' && l.data_type !== 'MP_Yield')
  }
  if (activeHomeTab.value === 'CP_LOT') {
    return lots.value.filter((l: any) => l.data_type === 'CP_LOT')
  }
  if (activeHomeTab.value === 'CP') {
    return lots.value.filter((l: any) => l.data_source === 'ftp' && l.data_type !== 'CP_LOT' && l.data_type !== 'MP_Yield')
  }
  if (activeHomeTab.value === 'FT') {
    return lots.value.filter((l: any) => l.data_source === 'ftp' && l.data_type !== 'CP_LOT' && l.data_type !== 'MP_Yield')
  }
  return lots.value.filter((l: any) => l.data_source === 'ftp' && l.data_type !== 'MP_Yield')
})

const computedColumnDefs = computed(() => {
  const baseDefs = [...columnDefs]
  if (activeHomeTab.value === 'FT' || activeHomeTab.value === 'CP') {
    if (!baseDefs.some(c => c.field === 'ftp_path')) {
      const osatIdx = baseDefs.findIndex(c => c.field === 'osat_name')
      if (osatIdx !== -1) {
        baseDefs.splice(osatIdx + 1, 0, {
          headerName: 'FTP 路径',
          field: 'ftp_path',
          width: 250,
          filter: 'agTextColumnFilter',
          cellRenderer: (p: any) => {
            if (!p.value) return '<span style="color:#ccc">—</span>'
            return `<span style="font-family:monospace;font-size:11px;color:#666;" title="${p.value}">${p.value}</span>`
          }
        })
      }
    }
  } else {
    const ftpPathIdx = baseDefs.findIndex(c => c.field === 'ftp_path')
    if (ftpPathIdx !== -1) {
      baseDefs.splice(ftpPathIdx, 1)
    }
  }
  return baseDefs
})

const rowSelection = ref<any>('multiple')

// 合并相关
const showMergeDialog = ref(false)
const mergeForm = ref({ new_name: '', new_lot_id: '', new_wafer_id: '' })
const mergeError = ref('')
const merging = ref(false)
const showMergeManyDialog = ref(false)
const mergeManyForm = ref({ new_name: '', new_lot_id: '', new_wafer_id: '' })
const mergeManyError = ref('')
const mergingMany = ref(false)
// Check 相关
const checkDialog = ref(false)
const currentProgram = ref('')
const currentLotId = ref(0)
const selectedParams = ref<string[]>([])
const allParams = ref<string[]>([])
const paramSearch = ref('')
const checkThreshold = ref(2)
const savingConfig = ref(false)
const checkError = ref('')

const filteredParams = computed(() => {
  if (!paramSearch.value) return allParams.value
  const s = paramSearch.value.toLowerCase()
  return allParams.value.filter(p => p.toLowerCase().includes(s))
})

async function handleCheckClick(lotId: number, program: string) {
  currentLotId.value = lotId
  currentProgram.value = program
  checkError.value = ''
  
  try {
    // 1. 获取该程序的配置
    const config: any = await api.get('/analysis/idle_check/config', { params: { program_name: program } })
    
    if (config && config.params && config.params.length > 0) {
      // 已有配置，直接跳转
      const url = router.resolve(`/lot/${lotId}/idle-check`).href
      window.open(url, '_blank')
    } else {
      // 无配置，获取当前 LOT 的参数列表供选择
      const items: any[] = await api.get(`/analysis/lot/${lotId}/items_summary`)
      allParams.value = items.map(it => it.item_name)
      selectedParams.value = []
      checkThreshold.value = 2
      checkDialog.value = true
    }
  } catch (e) {
    alert('获取配置失败')
  }
}

async function saveCheckConfig() {
  savingConfig.value = true
  try {
    await api.post('/analysis/idle_check/config', {
      program_name: currentProgram.value,
      params: selectedParams.value,
      threshold: checkThreshold.value
    })
    checkDialog.value = false
    // 跳转
    const url = router.resolve(`/lot/${currentLotId.value}/idle-check`).href
    window.open(url, '_blank')
  } catch (e) {
    checkError.value = '保存配置失败'
  } finally {
    savingConfig.value = false
  }
}

function openMergeDialog() {
  const currentSelected = getOrderedSelectedRows()
  const firstLot = currentSelected[0]
  if (!firstLot) return
  const waferIds = new Set(currentSelected.map(row => (row.wafer_id || '').trim()))
  if (waferIds.size > 1) {
    alert('所选数据的晶圆编号不一致，无法合并！')
    return
  }
  mergeForm.value = {
    new_name: (firstLot.filename || '') + '_combine',
    new_lot_id: firstLot.lot_id || '',
    new_wafer_id: firstLot.wafer_id || '',
  }
  showMergeDialog.value = true
}

function openMergeManyDialog() {
  const currentSelected = getOrderedSelectedRows()
  const firstLot = currentSelected[0]
  if (!firstLot) return
  mergeManyError.value = ''
  mergeManyForm.value = {
    new_name: (firstLot.filename || '') + '_combine',
    new_lot_id: firstLot.lot_id || '',
    new_wafer_id: firstLot.wafer_id || '',
  }
  showMergeManyDialog.value = true
}

// 轮询相关
const pollingTimer = ref<ReturnType<typeof setInterval> | null>(null)
const pollingLotIds = ref<number[]>([])

function startPolling(lotIds: number[]) {
  pollingLotIds.value = lotIds
  if (pollingTimer.value) clearInterval(pollingTimer.value)
  pollingTimer.value = setInterval(async () => {
    await fetchLots()
    const stillProcessing = lots.value.filter(
      (l: any) => pollingLotIds.value.includes(l.id) &&
                  (l.status === 'pending' || l.status === 'processing')
    )
    if (stillProcessing.length === 0) {
      stopPolling()
    }
  }, 3000)
}

function stopPolling() {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
  pollingLotIds.value = []
}

onUnmounted(stopPolling)

const defaultColDef: ColDef = {
  resizable: true,
  sortable: true,
  filter: true,
  floatingFilter: true,
  suppressFloatingFilterButton: true,
  minWidth: 80,
}

function compareDateOnly(filterLocalDateAtMidnight: Date, cellValue: string) {
  if (!cellValue) return -1
  const date = new Date(cellValue)
  if (Number.isNaN(date.getTime())) return -1
  const cellDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (cellDate < filterLocalDateAtMidnight) return -1
  if (cellDate > filterLocalDateAtMidnight) return 1
  return 0
}

function dateOnlyValue(value: any) {
  if (!value) return null
  const text = String(value).trim()
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    const pad = (n: string) => n.padStart(2, '0')
    return `${match[1]}-${pad(match[2])}-${pad(match[3])}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const dateRangeFilterParams = {
  browserDatePicker: true,
  defaultOption: 'inRange',
  filterOptions: ['inRange'],
  inRangeInclusive: true,
  buttons: ['reset'],
  comparator: compareDateOnly,
}

const OPEN_START_DATE = '0001-01-01'
const OPEN_END_DATE = '9999-12-31'

function modelDate(value: string) {
  return `${value} 00:00:00`
}

function modelToDateOnly(value: any) {
  const date = dateOnlyValue(value)
  if (date === OPEN_START_DATE || date === OPEN_END_DATE) return ''
  return date || ''
}

function uniqueColumnOptions(field: string) {
  const values = new Set<string>()
  for (const row of filteredLots.value) {
    const value = row?.[field]
    if (value !== undefined && value !== null && String(value).trim()) {
      values.add(String(value).trim())
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

const SelectFloatingFilter = defineComponent({
  name: 'SelectFloatingFilter',
  props: ['params'],
  setup(props, { expose }) {
    const selected = ref('')
    let syncing = false

    function applyFilter() {
      if (syncing) return
      props.params.parentFilterInstance((filter: any) => {
        if (!selected.value) {
          filter.setModel(null)
        } else {
          filter.setModel({ type: 'equals', filter: selected.value })
        }
        props.params.api.onFilterChanged()
      })
    }

    function onParentModelChanged(parentModel: any) {
      syncing = true
      selected.value = parentModel?.filter || ''
      syncing = false
    }

    expose({ onParentModelChanged })

    return () => {
      const options = props.params.options?.() || []
      return h('select', {
        class: 'select-floating-filter',
        value: selected.value,
        title: props.params.placeholder || '全部',
        'aria-label': props.params.placeholder || '筛选',
        onChange: (event: Event) => {
          selected.value = (event.target as HTMLSelectElement).value
          applyFilter()
        },
      }, [
        h('option', { value: '' }, '全部'),
        ...options.map((option: any) => {
          const val = typeof option === 'object' ? option.value : option
          const label = typeof option === 'object' ? option.label : option
          return h('option', { value: val }, label)
        }),
      ])
    }
  },
})

const DateRangeFloatingFilter = defineComponent({
  name: 'DateRangeFloatingFilter',
  props: ['params'],
  setup(props, { expose }) {
    const start = ref('')
    const end = ref('')
    let syncing = false

    function applyFilter() {
      if (syncing) return
      props.params.parentFilterInstance((filter: any) => {
        if (!start.value && !end.value) {
          filter.setModel(null)
        } else {
          filter.setModel({
            type: 'inRange',
            dateFrom: modelDate(start.value || OPEN_START_DATE),
            dateTo: modelDate(end.value || OPEN_END_DATE),
          })
        }
        props.params.api.onFilterChanged()
      })
    }

    function onParentModelChanged(parentModel: any) {
      syncing = true
      start.value = modelToDateOnly(parentModel?.dateFrom)
      end.value = modelToDateOnly(parentModel?.dateTo)
      syncing = false
    }

    expose({ onParentModelChanged })

    function renderDateBox(valueRef: typeof start, label: string) {
      return h('label', { class: 'date-range-box', title: label }, [
        h('span', { class: 'date-range-value' }, valueRef.value),
        h('input', {
          type: 'date',
          class: 'date-range-native',
          value: valueRef.value,
          'aria-label': label,
          onInput: (event: Event) => {
            valueRef.value = (event.target as HTMLInputElement).value
            applyFilter()
          },
          onClick: (event: MouseEvent) => {
            const input = event.target as HTMLInputElement
            input.showPicker?.()
          },
        }),
      ])
    }

    return () => h('div', { class: 'date-range-floating' }, [
      renderDateBox(start, '开始日期'),
      h('span', { class: 'date-range-separator' }, '-'),
      renderDateBox(end, '结束日期'),
    ])
  },
})

const columnDefs: ColDef[] = [
  { 
    headerName: '',
    width: 40, 
    pinned: 'left', 
    checkboxSelection: true, 
    headerCheckboxSelection: true,
    filter: false, 
    sortable: false, 
    suppressHeaderMenuButton: true 
  },
  { headerName: '序号', valueGetter: 'node.rowIndex + 1', width: 60, pinned: 'left', filter: false, sortable: false, suppressHeaderMenuButton: true },
  {
    headerName: '操作',
    width: 170,
    pinned: 'left',
    filter: false,
    sortable: false,
    suppressHeaderMenuButton: true,
    cellRenderer: (p: any) => {
      if (!p.data) return ''
      let checkStyle = "color:#722ed1;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:4px;"
      if (p.data.check_status === 'red') {
        checkStyle = "background:#ef4444;color:#ffffff;cursor:pointer;font-size:12px;padding:2px 8px;border-radius:4px;font-weight:500;"
      } else if (p.data.check_status === 'yellow') {
        checkStyle = "background:#0d9488;color:#ffffff;cursor:pointer;font-size:12px;padding:2px 8px;border-radius:4px;font-weight:500;"
      } else if (p.data.check_status === 'green') {
        checkStyle = "background:#22c55e;color:#ffffff;cursor:pointer;font-size:12px;padding:2px 8px;border-radius:4px;font-weight:500;"
      }
      return `
        <div style="display:flex;gap:6px;align-items:center;height:100%">
          <span style="color:#1890ff;cursor:pointer;font-size:12px" data-action="analysis" data-id="${p.data.id}">参数分析</span>
          <span style="color:#52c41a;cursor:pointer;font-size:12px" data-action="bin" data-id="${p.data.id}">BIN分析</span>
          <span style="${checkStyle}" data-action="check" data-id="${p.data.id}" data-program="${p.data.program}">Check</span>
        </div>
      `
    },
    onCellClicked: (p: any) => {
      if (!p.data || !p.event) return
      const target = p.event.target as HTMLElement
      const action = target.dataset.action
      const id = target.dataset.id
      if (action === 'analysis') {
        const url = router.resolve(`/lot/${id}`).href
        window.open(url, '_blank')
      }
      if (action === 'bin') {
        const url = router.resolve(`/lot/${id}/bin`).href
        window.open(url, '_blank')
      }
      if (action === 'check') {
        handleCheckClick(Number(id), target.dataset.program || '')
      }
    }
  },
  {
    headerName: '文件名',
    field: 'filename',
    width: 300,
    pinned: 'left',
    filter: 'agTextColumnFilter',
    cellClass: 'selectable-cell',
  },
  {
      headerName: '产品名',
      field: 'product_name',
      width: 120,
      filter: 'agTextColumnFilter',
      cellRenderer: (p: any) => {
          if (p.value) return p.value
          if (!p.data) return ''
          return `<span style="color:#1890ff;cursor:pointer" data-id="${p.data.id}" data-program="${p.data.program}">点击设置</span>`
      },
      onCellClicked: (p: any) => {
          if (!p.data || !p.data.program) return
          showProductDialog(p.data)
      }
  },
  { headerName: '批号', field: 'lot_id', width: 120, filter: 'agTextColumnFilter', cellClass: 'selectable-cell' },
  { headerName: '晶圆编号', field: 'wafer_id', width: 120, filter: 'agTextColumnFilter', cellClass: 'selectable-cell' },
  { 
    headerName: '测试项', 
    field: 'item_count', 
    width: 100, 
    filter: 'agNumberColumnFilter',
    filterParams: { defaultOption: 'greaterThan', buttons: ['reset'] }
  },
  { 
    headerName: '晶圆数', 
    field: 'die_count', 
    width: 100, 
    filter: 'agNumberColumnFilter',
    filterParams: { defaultOption: 'greaterThan', buttons: ['reset'] }
  },
  { 
    headerName: '良品数', 
    field: 'pass_count', 
    width: 100, 
    filter: 'agNumberColumnFilter',
    filterParams: { defaultOption: 'greaterThan', buttons: ['reset'] }
  },
  {
    headerName: '良率',
    field: 'yield_rate',
    width: 100,
    filter: 'agNumberColumnFilter',
    filterParams: { defaultOption: 'greaterThan', buttons: ['reset'] },
    valueFormatter: (p: any) => p.value ? `${(p.value * 100).toFixed(2)}%` : '-',
    cellStyle: (p: any): any => {
      if (!p.value) return {}
      if (p.value < 0.8) return { color: 'red', fontWeight: 'bold' }
      if (p.value < 0.95) return { color: 'orange' }
      return { color: 'green' }
    }
  },
  {
    headerName: '程序名',
    field: 'program',
    width: 300,
    filter: 'agTextColumnFilter',
    cellClass: 'selectable-cell',
  },
  {
    headerName: '测试机',
    field: 'test_machine',
    width: 100,
    filter: 'agTextColumnFilter',
    cellClass: 'selectable-cell',
    suppressHeaderFilterButton: true,
    floatingFilterComponent: SelectFloatingFilter,
    floatingFilterComponentParams: {
      options: () => uniqueColumnOptions('test_machine'),
      placeholder: '测试机',
    },
  },
  {
    headerName: 'Data Type',
    field: 'data_type',
    width: 100,
    filter: 'agTextColumnFilter',
    suppressHeaderFilterButton: true,
    floatingFilterComponent: SelectFloatingFilter,
    floatingFilterComponentParams: {
      // 固定列表：不受当前 Tab 过滤影响，始终显示所有可能的 Data Type
      options: () => ['CP', 'FT', 'QA', 'Summary', 'CP_LOT', 'MP_Yield'],
      placeholder: 'Data Type',
    },
  },


  {
    headerName: '状态',
    field: 'status',
    width: 100,
    filter: 'agTextColumnFilter',
    suppressHeaderFilterButton: true,
    floatingFilterComponent: SelectFloatingFilter,
    floatingFilterComponentParams: {
      options: () => [
        { value: 'pending', label: '待处理' },
        { value: 'processing', label: '处理中' },
        { value: 'processed', label: '已完成' },
        { value: 'failed', label: '失败' }
      ],
      placeholder: '状态',
    },
    cellRenderer: (p: any) => {
      const map: Record<string, string> = {
        pending: '<span style="color:#888">待处理</span>',
        processing: '<span style="color:#1890ff">处理中</span>',
        processed: '<span style="color:green">已完成</span>',
        failed: '<span style="color:red">失败</span>',
      }
      return map[p.value] || p.value
    }
  },
  { headerName: '文件大小', field: 'file_size', width: 100, filter: false, valueFormatter: (p) => p.value ? formatSize(p.value) : '-' },
  { 
    headerName: '测试日期', 
    field: 'test_date', 
    width: 180, 
    cellDataType: 'dateString',
    filter: 'agDateColumnFilter',
    filterValueGetter: (p: any) => dateOnlyValue(p.data?.test_date),
    filterParams: dateRangeFilterParams,
    floatingFilterComponent: DateRangeFloatingFilter,
    valueFormatter: (p) => formatDateTime(p.value)
  },
  { 
    headerName: '结束日期', 
    field: 'ending_time', 
    width: 180, 
    filter: false,
    floatingFilter: false,
    suppressHeaderMenuButton: true,
    valueFormatter: (p) => formatDateTime(p.value)
  },
  {
    headerName: '测试用时',
    width: 120,
    filter: 'agNumberColumnFilter',
    valueGetter: (p: any) => {
      const ts = p.data?.test_stage;
      if (ts && typeof ts === 'string' && ts.endsWith('S')) {
        return parseInt(ts.slice(0, -1), 10);
      }
      if (p.data?.data_type === 'CP_LOT') {
        return ts ? parseInt(ts, 10) : null;
      } else {
        const start = p.data.beginning_time || p.data.test_date;
        const end = p.data.ending_time;
        if (!start || !end) return null;
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        if (isNaN(startTime) || isNaN(endTime)) return null;
        const diff = endTime - startTime;
        return diff > 0 ? diff / 3600000 : 0;
      }
    },
    valueFormatter: (p: any) => {
      const ts = p.data?.test_stage;
      if (ts && typeof ts === 'string' && ts.endsWith('S')) {
        return p.value != null ? `${p.value}S` : '-';
      }
      if (p.data?.data_type === 'CP_LOT') {
        return p.value != null ? `${p.value}S` : '-';
      }
      return p.value != null ? `${p.value.toFixed(2)} H` : '-';
    }
  },
  { 
    headerName: '上传日期', 
    field: 'upload_date', 
    width: 180, 
    cellDataType: 'dateString',
    filter: 'agDateColumnFilter',
    filterValueGetter: (p: any) => dateOnlyValue(p.data?.upload_date),
    filterParams: dateRangeFilterParams,
    floatingFilterComponent: DateRangeFloatingFilter,
    valueFormatter: (p) => formatDateTime(p.value)
  },
  {
    headerName: 'OSAT',
    field: 'osat_name',
    width: 100,
    filter: 'agTextColumnFilter',
    suppressHeaderFilterButton: true,
    floatingFilterComponent: SelectFloatingFilter,
    floatingFilterComponentParams: {
      options: () => allOsatNames.value,
      placeholder: 'OSAT',
    },
    cellRenderer: (p: any) => {
      if (!p.value) return '<span style="color:#ccc">—</span>'
      return `<span style="background:#f5f3ff;color:#7c3aed;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:500">${p.value}</span>`
    }
  },
  {
    headerName: 'MP Tester',
    field: 'mp_tester',
    width: 120,
    filter: 'agTextColumnFilter',
    cellRenderer: (p: any) => {
      if (!p.value) return '<span style="color:#ccc">—</span>'
      return `<span style="font-size:12px">${p.value}</span>`
    }
  },
  {
    headerName: 'Probecard',
    field: 'probecard',
    width: 120,
    filter: 'agTextColumnFilter',
    cellRenderer: (p: any) => {
      if (!p.value) return '<span style="color:#ccc">—</span>'
      return `<span style="font-size:12px">${p.value}</span>`
    }
  },
]


function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// 监听时区变化，刷新 AG Grid 所有单元格，使时间显示立即更新
watch(() => timezoneStore.timezone, () => {
  gridApi.value?.refreshCells({ force: true })
})

// 监听工具栏“状态”筛选变化，同步更新表格列筛选器状态
watch(() => filters.value.status, (newStatus) => {
  if (!gridApi.value) return
  const model = gridApi.value.getFilterModel() || {}
  const currentModelStatus = model.status?.filter || ''
  if (currentModelStatus !== newStatus) {
    if (!newStatus) {
      delete model.status
    } else {
      model.status = { type: 'equals', filter: newStatus }
    }
    gridApi.value.setFilterModel(model)
  }
})

function formatDateTime(val: any) {
  if (!val) return '-'
  if (val instanceof Date) {
    return formatLocalDateParts(
      val.getFullYear(),
      val.getMonth() + 1,
      val.getDate(),
      val.getHours(),
      val.getMinutes(),
      val.getSeconds(),
    )
  }

  const text = String(val).trim()
  const match = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  )
  if (!match) return text || '-'

  return formatLocalDateParts(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  )
}

function formatLocalDateParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`
}

async function fetchLots() {
  try {
    const params: any = { page: backendPage.value, page_size: backendPageSize.value }
    if (filters.value.product_name) params.product_name = filters.value.product_name
    if (filters.value.lot_id) params.lot_id = filters.value.lot_id
    if (filters.value.status) params.status = filters.value.status
    Object.assign(params, backendGridFilters.value)

    // 根据当前 Tab 加上后端过滤参数，减轻前端过滤压力并解除 200 条限制问题
    if (activeHomeTab.value === 'ENG_DATA') {
      params.data_source = 'manual'
    } else if (activeHomeTab.value === 'FT') {
      params.data_source = 'ftp'
      params.osat_type = 'FT'   // 按 OSAT 配置的 data_type 过滤，而非 lot 自身的 data_type
    } else if (activeHomeTab.value === 'CP') {
      params.data_source = 'ftp'
      params.osat_type = 'CP'   // 按 OSAT 配置的 data_type 过滤，而非 lot 自身的 data_type
    } else if (activeHomeTab.value === 'CP_LOT') {
      params.data_type = 'CP_LOT'
    }

    const data: any = await api.get('/lots', { params })
    console.log('fetchLots response:', data)
    lots.value = data?.items || []
    backendTotal.value = data?.total || 0
    backendPage.value = data?.page || backendPage.value
    backendPageSize.value = data?.page_size || backendPageSize.value
    selectedRows.value = []

    if (backendTotal.value > 0 && backendPage.value > backendTotalPages.value) {
      backendPage.value = backendTotalPages.value
      await fetchLots()
    }
  } catch (e) {
    console.error('fetchLots failed:', e)
    lots.value = []
    backendTotal.value = 0
  }
}

async function fetchOsatNames() {
  try {
    const res: any = await api.get('/lots/osats/names')
    allOsatNames.value = res || []
  } catch (e) {
    console.error('Failed to fetch osat names:', e)
    allOsatNames.value = ["Chipmore", "LBS", "HTKS", "UCD"]
  }
}

async function fetchLotsFromFirstPage() {
  backendPage.value = 1
  await fetchLots()
}

async function goBackendPage(page: number) {
  const nextPage = Math.min(Math.max(1, page), backendTotalPages.value)
  if (nextPage === backendPage.value) return
  backendPage.value = nextPage
  await fetchLots()
  gridApi.value?.deselectAll()
  gridApi.value?.ensureIndexVisible(0, 'top')
}

async function showProductDialog(row: any) {
    const data: any = await api.get('/products/suggest', {
        params: { program: row.program }
    })
    productForm.value = {
        id: row.id,
        program: row.program,
        prefix: data.prefix,
        product_name: data.product_name || ''
    }
    productDialog.value = true
}

async function saveProductName() {
    await api.post('/products/mapping', {
        prefix: productForm.value.prefix,
        product_name: productForm.value.product_name
    })
    productDialog.value = false
    await fetchLots()
}

function onGridReady(params: any) {
  gridApi.value = params.api
  // 初始化表格时，如果默认状态有值，应用到表格列筛选器
  const model = gridApi.value.getFilterModel() || {}
  let changed = false
  if (filters.value.status) {
    model.status = { type: 'equals', filter: filters.value.status }
    changed = true
  }
  if (activeHomeTab.value === 'FT') {
    model.data_type = { type: 'equals', filter: 'FT' }
    changed = true
  } else if (activeHomeTab.value === 'CP') {
    model.data_type = { type: 'equals', filter: 'CP' }
    changed = true
  }
  if (changed) {
    gridApi.value.setFilterModel(model)
  }
}

function textFilterValue(model: any, field: string): string {
  const filterModel = model?.[field]
  if (!filterModel) return ''
  return String(filterModel.filter ?? filterModel.condition1?.filter ?? '').trim()
}

function dateModelValue(value: any): string {
  return dateOnlyValue(value) || ''
}

function extractBackendGridFilters(model: any): Record<string, string> {
  const next: Record<string, string> = {}
  const filename = textFilterValue(model, 'filename')
  const waferId = textFilterValue(model, 'wafer_id')
  const program = textFilterValue(model, 'program')
  const testMachine = textFilterValue(model, 'test_machine')
  const dataType = textFilterValue(model, 'data_type')
  const osatName = textFilterValue(model, 'osat_name')
  if (filename) next.filename = filename
  if (waferId) next.wafer_id = waferId
  if (program) next.program = program
  if (testMachine) next.test_machine = testMachine
  if (dataType) next.data_type = dataType
  if (osatName) next.osat_name = osatName

  const testDate = model?.test_date
  const uploadDate = model?.upload_date
  const testDateFrom = dateModelValue(testDate?.dateFrom)
  const testDateTo = dateModelValue(testDate?.dateTo)
  const uploadDateFrom = dateModelValue(uploadDate?.dateFrom)
  const uploadDateTo = dateModelValue(uploadDate?.dateTo)
  if (testDateFrom && testDateFrom !== OPEN_START_DATE) next.test_date_from = testDateFrom
  if (testDateTo && testDateTo !== OPEN_END_DATE) next.test_date_to = testDateTo
  if (uploadDateFrom && uploadDateFrom !== OPEN_START_DATE) next.upload_date_from = uploadDateFrom
  if (uploadDateTo && uploadDateTo !== OPEN_END_DATE) next.upload_date_to = uploadDateTo
  return next
}

function onGridFilterChanged() {
  if (!gridApi.value) return

  const model = gridApi.value.getFilterModel()
  const nextProductName = textFilterValue(model, 'product_name')
  const nextLotId = textFilterValue(model, 'lot_id')
  const nextStatus = textFilterValue(model, 'status')
  const nextBackendGridFilters = extractBackendGridFilters(model)
  const backendFilterChanged = JSON.stringify(nextBackendGridFilters) !== JSON.stringify(backendGridFilters.value)

  if (
    nextProductName === filters.value.product_name &&
    nextLotId === filters.value.lot_id &&
    nextStatus === filters.value.status &&
    !backendFilterChanged
  ) {
    return
  }

  filters.value.product_name = nextProductName
  filters.value.lot_id = nextLotId
  filters.value.status = nextStatus
  backendGridFilters.value = nextBackendGridFilters

  if (gridFilterTimer) clearTimeout(gridFilterTimer)
  gridFilterTimer = setTimeout(() => {
    fetchLotsFromFirstPage()
  }, 250)
}

function getOrderedSelectedRows(): any[] {
  if (gridApi.value) {
    const ordered: any[] = []
    gridApi.value.forEachNodeAfterFilterAndSort((node: any) => {
      if (node.isSelected() && node.data) {
        ordered.push(node.data)
      }
    })
    if (ordered.length > 0) return ordered
  }
  return selectedRows.value || []
}

function onSelectionChanged() {
  selectedRows.value = getOrderedSelectedRows()
}

function openDisplayEditDialog(row: any, field: 'filename' | 'lot_id' | 'wafer_id' | 'data_type' | 'test_machine') {
  const labels: Record<'filename' | 'lot_id' | 'wafer_id' | 'data_type' | 'test_machine', string> = {
    filename: '数据名',
    lot_id: '批号',
    wafer_id: '晶圆编号',
    data_type: 'Data Type',
    test_machine: '测试机',
  }
  displayEditDialog.value = {
    visible: true,
    row,
    field,
    title: `修改${labels[field]}`,
    label: labels[field],
    value: row?.[field] || '',
    error: '',
    saving: false,
  }
  nextTick(() => {
    displayEditInput.value?.focus()
    displayEditInput.value?.select()
  })
}

function closeDisplayEditDialog() {
  if (displayEditDialog.value.saving) return
  displayEditDialog.value.visible = false
}

async function saveDisplayEdit() {
  const dialog = displayEditDialog.value
  if (!dialog.row || !dialog.field) return
  let value = dialog.value.trim()
  if (dialog.field === 'filename' && !value) {
    dialog.error = '数据名不能为空'
    return
  }
  if (dialog.field === 'data_type') {
    value = value.toUpperCase()
    if (!['CP', 'FT', 'QA'].includes(value)) {
      dialog.error = 'Data Type 只能是 CP / FT / QA'
      return
    }
  }
  dialog.saving = true
  dialog.error = ''
  try {
    const data: any = await api.patch(`/lots/${dialog.row.id}/display`, { [dialog.field]: value })
    dialog.row[dialog.field] = data?.[dialog.field] ?? value
    gridApi.value?.applyTransaction({ update: [dialog.row] })
    gridApi.value?.refreshCells({ columns: [dialog.field], force: true })
    selectedRows.value = gridApi.value?.getSelectedRows() || []
    displayEditDialog.value.visible = false
  } catch (e: any) {
    dialog.error = e?.response?.data?.detail || '保存失败'
  } finally {
    dialog.saving = false
  }
}

function onCellDoubleClicked(params: any) {
  const field = params.colDef?.field
  if (field === 'filename' || field === 'lot_id' || field === 'wafer_id' || field === 'data_type' || field === 'test_machine') {
    openDisplayEditDialog(params.data, field)
    return
  }

  const fields = ['program']
  if (!fields.includes(field)) return

  // Walk up from the click target to find the AG Grid cell value container
  let el = params.event?.target as HTMLElement | null
  while (el && !el.classList.contains('ag-cell-value')) {
    el = el.parentElement
  }
  // Fallback: use the event target itself
  if (!el) el = params.event?.target as HTMLElement
  if (!el) return

  // Select all text inside the container
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
}

function handleDrop(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files || [])
  uploadFiles.value = files.filter(f => isAllowedFile(f.name))
}

function handleFileSelect(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  uploadFiles.value = files.filter(f => isAllowedFile(f.name))
}

function isAllowedFile(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.csv') ||
         lower.endsWith('.zip') ||
         lower.endsWith('.rar') ||
         lower.endsWith('.stdf') ||
         lower.endsWith('.std') ||
         lower.endsWith('.stdf.gz') ||
         lower.endsWith('.std.gz') ||
         lower.endsWith('.csv.gz') ||
         lower.endsWith('.gz') ||
         lower.endsWith('.txt') ||
         lower.endsWith('.xls') ||
         lower.endsWith('.xlsx')
}

function isStdfFile(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.stdf') ||
         lower.endsWith('.std') ||
         lower.endsWith('.stdf.gz') ||
         lower.endsWith('.std.gz')
}

async function handleUpload() {
  const filesToUpload = [...uploadFiles.value]
  showUpload.value = false
  uploadFiles.value = []
  uploading.value = true

  try {
    const formData = new FormData()
    filesToUpload.forEach(f => formData.append('files', f))
    const res: any = await api.post('/lots/upload', formData)
    await fetchLots()
    const uploadResults = res?.results || []
    const failed = uploadResults.filter((r: any) => r.status === 'failed')
    if (failed.length) {
      alert(failed.map((r: any) => `${r.filename}: ${r.error || '解析失败'}`).join('\n'))
    }
    const newIds: number[] = uploadResults.map((r: any) => r.lot_id).filter(Boolean)
    if (newIds.length > 0) {
      startPolling(newIds)
    }
  } catch (e) {
    alert('上传失败')
  } finally {
    uploading.value = false
  }
}

async function handleDelete() {
  if (!selectedRows.value.length) return

  // Non-admin can only delete in ENG_DATA
  if (activeHomeTab.value !== 'ENG_DATA' && !authStore.isAdmin) {
    alert('非管理员用户在全部数据及 OSAT 视图中禁止执行删除操作！')
    return
  }

  // Non-admin can only delete their own manual data
  if (!authStore.isAdmin) {
    const hasOthers = selectedRows.value.some(r => r.user_id !== authStore.user?.id || r.data_source === 'ftp')
    if (hasOthers) {
      alert('您只能删除本人上传的数据！')
      return
    }
  }

  if (!confirm(`确认删除 ${selectedRows.value.length} 条记录？`)) return

  const ids = selectedRows.value.map(r => r.id)
  try {
    await api.delete('/lots', { data: { ids } })
    await fetchLots()
  } catch (e) {
    alert('删除失败')
  }
}

async function handleDownload() {
  if (!selectedRows.value.length) return

  const ids = selectedRows.value.map(r => r.id)
  try {
    const response = await api.post('/lots/download', { ids }, {
      responseType: 'blob'
    })

    // response is now the full axios response (blob case in interceptor)
    const blobData = response.data
    const headers = response.headers

    // Create blob link and trigger download
    const blob = new Blob([blobData], { type: 'application/zip' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Prefer filename*=UTF-8''..., then fall back to filename="..."
    const disposition = headers?.['content-disposition'] ?? ''
    const now = new Date()
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const defaultName = `ATE_DATA_${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}.zip`
    let filename = defaultName
    const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (encodedMatch) {
      filename = decodeURIComponent(encodedMatch[1].trim())
    } else {
      const plainMatch = disposition.match(/filename="?([^"]+)"?/i)
      if (plainMatch) filename = plainMatch[1]
    }
    link.download = filename

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (e: any) {
    // If error response is JSON blob, try to read it
    if (e.response && e.response.data instanceof Blob) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const err = JSON.parse(reader.result as string)
          alert(err.detail || '下载失败')
        } catch {
          alert('下载失败')
        }
      }
      reader.readAsText(e.response.data)
    } else {
      alert('下载失败')
    }
  }
}

async function handleMerge() {
  if (!mergeForm.value.new_name.trim()) return
  mergeError.value = ''
  merging.value = true

  try {
    const currentSelected = getOrderedSelectedRows()
    const ids = currentSelected.map(r => r.id)
    await api.post('/lots/merge', {
      ids,
      new_name: mergeForm.value.new_name.trim(),
      new_lot_id: mergeForm.value.new_lot_id.trim(),
      new_wafer_id: mergeForm.value.new_wafer_id.trim(),
    })
    showMergeDialog.value = false
    mergeForm.value = { new_name: '', new_lot_id: '', new_wafer_id: '' }
    await fetchLots()
  } catch (e: any) {
    mergeError.value = typeof e === 'string' ? e : (e?.message || '合并失败，请检查数据')
  } finally {
    merging.value = false
  }
}

async function handleMergeMany() {
  if (!mergeManyForm.value.new_name.trim()) return
  mergeManyError.value = ''
  mergingMany.value = true

  try {
    const currentSelected = getOrderedSelectedRows()
    const ids = currentSelected.map(r => r.id)
    await api.post('/lots/merge_many', {
      ids,
      new_name: mergeManyForm.value.new_name.trim(),
      new_lot_id: mergeManyForm.value.new_lot_id.trim(),
      new_wafer_id: mergeManyForm.value.new_wafer_id.trim(),
    })
    showMergeManyDialog.value = false
    mergeManyForm.value = { new_name: '', new_lot_id: '', new_wafer_id: '' }
    await fetchLots()
  } catch (e: any) {
    mergeManyError.value = typeof e === 'string' ? e : (e?.response?.data?.detail || e?.message || '合多失败，请检查数据')
  } finally {
    mergingMany.value = false
  }
}

function handleMultiAnalysis() {
  const currentSelected = getOrderedSelectedRows()
  if (currentSelected.length < 2) return
  const ids = currentSelected.map(r => r.id).join(',')
  const url = router.resolve(`/multi-analysis?lot_ids=${ids}`).href
  window.open(url, '_blank')
}

function handleMultiBin() {
  const currentSelected = getOrderedSelectedRows()
  if (currentSelected.length < 2) return
  const ids = currentSelected.map(r => r.id).join(',')
  const url = router.resolve(`/multi-bin?lot_ids=${ids}`).href
  window.open(url, '_blank')
}

async function handleReparse() {
  if (!selectedRows.value.length) return
  reparsing.value = true
  try {
    const ids = selectedRows.value.map(r => r.id)
    const res: any = await api.post('/lots/reparse', { ids })
    await fetchLots()
    const queuedIds: number[] = (res?.ids || ids).filter(Boolean)
    if (queuedIds.length > 0) {
      startPolling(queuedIds)
    } else {
      alert(res?.message || '没有可重新解析的数据')
    }
  } catch (e: any) {
    alert(`重新解析失败: ${e.response?.data?.detail || e.message || e}`)
  } finally {
    reparsing.value = false
  }
}

async function handleRecalcCheck() {
  if (!selectedRows.value.length) return
  recalcChecking.value = true
  try {
    const ids = selectedRows.value.map(r => r.id)
    const res: any = await api.post('/analysis/idle_check/recalc', { ids })
    alert(res.message || '重算成功')
    await fetchLots()
  } catch (e: any) {
    alert(`重算失败: ${e.response?.data?.detail || e.message || e}`)
  } finally {
    recalcChecking.value = false
  }
}

const lastClickedParam = ref<string | null>(null)

function onCheckboxClick(event: MouseEvent, p: string) {
  if (event.shiftKey && lastClickedParam.value) {
    event.preventDefault()
    const idx1 = filteredParams.value.indexOf(lastClickedParam.value)
    const idx2 = filteredParams.value.indexOf(p)
    if (idx1 !== -1 && idx2 !== -1) {
      const start = Math.min(idx1, idx2)
      const end = Math.max(idx1, idx2)
      const rangeParams = filteredParams.value.slice(start, end + 1)
      
      rangeParams.forEach(item => {
        if (!selectedParams.value.includes(item)) {
          selectedParams.value.push(item)
        }
      })
    }
  } else {
    lastClickedParam.value = p
  }
}

onMounted(() => {
  fetchLots()
  fetchOsatNames()
})
watch(activeHomeTab, (newTab) => {
  if (newTab === 'all') {
    filters.value.status = ''
  } else {
    filters.value.status = 'processed'
  }
  if (gridApi.value) {
    const model = gridApi.value.getFilterModel() || {}
    if (newTab === 'FT') {
      model.data_type = { type: 'equals', filter: 'FT' }
    } else if (newTab === 'CP') {
      model.data_type = { type: 'equals', filter: 'CP' }
    } else {
      delete model.data_type
    }
    if (filters.value.status) {
      model.status = { type: 'equals', filter: filters.value.status }
    } else {
      delete model.status
    }
    gridApi.value.setFilterModel(model)
  }
  fetchLotsFromFirstPage()
})
</script>

<style scoped>
.lot-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 10px 16px;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.toolbar-left, .toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn {
  padding: 6px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover { background: #f5f5f5; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #1890ff; color: white; border-color: #1890ff; }
.btn-primary:hover { background: #40a9ff; }
.btn-danger { color: #ff4d4f; border-color: #ff4d4f; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-merge { color: #722ed1; border-color: #722ed1; }
.btn-merge:hover:not(:disabled) { background: #f9f0ff; }
.btn-multi-analysis { color: #1890ff; border-color: #1890ff; }
.btn-multi-analysis:hover:not(:disabled) { background: #e6f7ff; }
.btn-multi-bin { color: #52c41a; border-color: #52c41a; }
.btn-multi-bin:hover:not(:disabled) { background: #f6ffed; }
.btn-download { color: #096dd9; border-color: #096dd9; }
.btn-download:hover:not(:disabled) { background: #e6f7ff; }
.btn-check { color: #fa8c16; border-color: #fa8c16; }
.btn-check:hover:not(:disabled) { background: #fff7e6; }
.btn-reparse { color: #13a8a8; border-color: #13a8a8; }
.btn-reparse:hover:not(:disabled) { background: #e6fffb; }
.filter-input, .filter-select {
  padding: 5px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  height: 32px;
}
.table-container {
  flex: 1;
  background: white;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ag-theme-alpine {
  --ag-font-size: 13px;
  --ag-grid-size: 4px;
}

.db-page-footer {
  height: 36px;
  flex: 0 0 36px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 12px;
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
  font-size: 13px;
  color: #111827;
}

.db-page-size {
  margin-right: 6px;
}

.db-page-summary {
  font-weight: 600;
}

.db-page-btn {
  min-width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: #374151;
  cursor: pointer;
  font-size: 14px;
  line-height: 24px;
  padding: 0 4px;
}

.db-page-btn:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
}

.db-page-jump {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #64748b;
}

.db-page-jump input {
  width: 52px;
  height: 24px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 12px;
  box-sizing: border-box;
}
:deep(.ag-header-cell-label) {
  font-weight: 600;
  color: #595959;
}

/* 缩小筛选框尺寸 */
:deep(.ag-floating-filter-input) {
  height: 24px !important;
  min-height: 24px !important;
}
:deep(.selectable-cell) {
  cursor: text;
  user-select: text;
}
:deep(.ag-floating-filter-input .ag-input-field-input) {
  padding: 0 6px !important;
  font-size: 11px !important;
  height: 22px !important;
  background-color: white !important;
  color: black !important;
}
:deep(.ag-floating-filter-body) {
  height: 24px !important;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.modal {
  background: white;
  padding: 24px;
  border-radius: 8px;
  width: 480px;
}
.modal h3 { margin-bottom: 16px; font-size: 16px; }
.display-edit-modal {
  width: 340px;
  padding: 18px;
}
.display-edit-modal h3 {
  margin-bottom: 12px;
}
.display-edit-modal input {
  width: 100%;
  box-sizing: border-box;
}
.display-edit-modal .field-select {
  width: 100%;
  height: 32px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  padding: 0 8px;
  box-sizing: border-box;
}
.drop-zone {
  border: 2px dashed #d9d9d9;
  border-radius: 6px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  color: #666;
  transition: border-color 0.2s;
}
.drop-zone:hover { border-color: #1890ff; }
.hint { font-size: 12px; color: #999; margin-top: 6px; }
.upload-list { margin-top: 12px; }
.upload-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
}
.file-size { color: #999; }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.field label {
  font-size: 12px;
  color: #666;
}
.field input {
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
}
.merge-error {
  color: #ff4d4f;
  font-size: 12px;
  margin-bottom: 8px;
  padding: 6px 10px;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 4px;
}

.check-modal {
  width: 600px !important;
}

.param-selector {
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  height: 300px;
}

.selector-header {
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafafa;
}

.search-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}

.selection-info {
  margin-left: 12px;
  font-size: 12px;
  color: #1890ff;
  font-weight: 500;
}

.param-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px;
  border-radius: 2px;
  cursor: pointer;
}

.param-item:hover {
  background: #f5f5f5;
}

.param-item input {
  margin: 0;
}

.param-item span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.uploading-badge {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: #52c41a;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  padding: 2px 10px;
  border-radius: 20px;
  animation: pulse 1s ease-in-out infinite;
}
.polling-badge {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: #1890ff;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  padding: 2px 10px;
  border-radius: 20px;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.stdf-hint {
  color: #722ed1;
  font-size: 11px;
  margin-top: 2px;
}
.stdf-badge {
  display: inline-block;
  background: linear-gradient(90deg, #722ed1, #1890ff);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
  margin-left: 8px;
  letter-spacing: 0.5px;
  vertical-align: middle;
}
.home-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  background: white;
  padding: 8px 12px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.home-tab-btn {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: #64748b;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.home-tab-btn:hover {
  background: #f1f5f9;
  color: #3b82f6;
}
.home-tab-btn.active {
  background: #eff6ff;
  color: #3b82f6;
}

:deep(.date-range-floating) {
  display: flex;
  align-items: center;
  gap: 3px;
  width: 100%;
  height: 100%;
  min-width: 0;
  padding: 0 2px;
  box-sizing: border-box;
}

:deep(.date-range-box) {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 0;
  height: 22px;
  padding: 0 4px;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  background: #ffffff;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
}

:deep(.date-range-value) {
  display: block;
  min-width: 0;
  width: 100%;
  color: #111827;
  font-size: 10px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  pointer-events: none;
}

:deep(.date-range-native) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  border: 0;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  cursor: pointer;
}

:deep(.date-range-native::-webkit-calendar-picker-indicator) {
  opacity: 0;
  display: none;
}

:deep(.date-range-box:focus-within) {
  border-color: #60a5fa;
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.25);
}

:deep(.date-range-separator) {
  color: #64748b;
  font-size: 10px;
  line-height: 1;
}

:deep(.select-floating-filter) {
  width: 100%;
  height: 22px;
  min-width: 0;
  padding: 0 18px 0 6px;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  background: #ffffff;
  color: #111827;
  font-size: 11px;
  box-sizing: border-box;
  outline: none;
}

:deep(.select-floating-filter:focus) {
  border-color: #60a5fa;
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.25);
}

.floating-hover-tip {
  position: fixed;
  padding: 6px 12px;
  font-size: 12px;
  color: #8b5cf6;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
  pointer-events: none;
  z-index: 9999;
  white-space: nowrap;
}
</style>
