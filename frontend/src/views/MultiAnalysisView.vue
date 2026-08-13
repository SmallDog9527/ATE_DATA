<template>
  <div class="multi-analysis-view">
    <!-- 顶部LOT信息栏 -->
    <div class="lot-info-bar">
      <div class="info-grid">
        <div class="info-item">
          <span class="label">名称</span>
          <div class="editable-name">
            <input 
              v-model="options.single_lot_name" 
              class="name-input" 
              placeholder="all_lot"
            />
          </div>
        </div>
        <div class="info-item">
          <span class="label">LOT数量</span>
          <span class="value">{{ lots.length }}</span>
        </div>
        <div class="info-item">
          <span class="label">测试项数</span>
          <span class="value">{{ params.length }}</span>
        </div>
        <div class="info-item">
          <span class="label">测试数量</span>
          <span class="value">{{ totalDieCount }}</span>
        </div>
        <div class="info-item">
          <span class="label">PASS数量</span>
          <span class="value">{{ totalPassCount }}</span>
        </div>
        <div class="info-item">
          <span class="label">平均良率</span>
          <span class="value" :style="yieldColor(averageYield)">
            {{ averageYield ? (averageYield * 100).toFixed(2) + '%' : '-' }}
          </span>
        </div>
        <div class="info-item-actions" style="display: flex; gap: 12px;">
          <button class="btn-export" @click="openMultiBin">📊 BIN分析</button>
          <button 
            class="btn-export" 
            :disabled="exporting" 
            @click="handleExport"
            :style="exporting ? { 
              background: `linear-gradient(to right, #52c41a ${exportProgress}%, #73d13d ${exportProgress}%)`,
              transition: 'background 0.3s'
            } : {}"
          >
            <template v-if="!exporting">📁 导出 Excel</template>
            <template v-else>导出中 {{ exportProgress }}%</template>
          </button>
          
          <template v-if="options.mode === 'single' && options.mean_limit === 'hide'">
            <button class="btn-export" style="margin-left: 120px;" @click="triggerExportLimit">📤 导出 Limit</button>
            <button class="btn-export" @click="triggerImportLimit">📥 导入 Limit</button>
            <button class="btn-export" @click="toggleFilterEdited">
              {{ filterEditedOnly ? '🔍 显示全部' : '🔍 仅看已修改' }}
            </button>
            <button class="btn-export" style="background-color: #1890ff; color: white;" @click="handleRecalc">🧮 Calc</button>
            <span v-if="overallYieldNew !== null" style="font-size: 13px; font-weight: bold; color: #1890ff; align-self: center; margin-left: 8px; white-space: nowrap;">
              重算总良率: {{ (overallYieldNew * 100).toFixed(2) }}%
            </span>
            <input type="file" ref="limitFileInput" style="display: none" @change="onLimitFileSelected" />
          </template>
        </div>
      </div>
    </div>

    <!-- 主体：左侧Options + 右侧表格 -->
    <div class="main-body">
      <!-- 左侧Options面板 -->
      <div class="options-panel">
        <div class="options-title">Options</div>

        <div class="option-group">
          <label>Filter</label>
          <div class="radio-group">
            <label><input type="radio" v-model="options.filter_type" value="all" /> ALL_DATA</label>
            <label><input type="radio" v-model="options.filter_type" value="filter_by_limit" /> Filter by limit</label>
          </div>
        </div>



        <div class="option-group">
          <label>char_mode</label>
          <div class="radio-group row">
            <label><input type="radio" v-model="options.char_mode" value="lot" /> LOT</label>
            <label><input type="radio" v-model="options.char_mode" value="single" /> Single</label>
          </div>
        </div>

        <div class="option-group">
          <label>chars_row</label>
          <div class="radio-group row">
            <label><input type="radio" v-model="options.chars_row" :value="1" :disabled="options.char_mode === 'lot'" /> 1</label>
            <label><input type="radio" v-model="options.chars_row" :value="3" :disabled="options.char_mode === 'lot'" /> 3</label>
            <label><input type="radio" v-model="options.chars_row" :value="5" :disabled="options.char_mode === 'lot'" /> 5</label>
          </div>
        </div>

        <div class="option-group">
          <label>Mode</label>
          <div class="radio-group row">
            <label><input type="radio" v-model="options.mode" value="lot" /> LOT</label>
            <label><input type="radio" v-model="options.mode" value="single" /> Single</label>
          </div>
        </div>

        <div class="option-group" v-if="options.mode === 'lot'">
          <label>Delta LOT (%)</label>
          <input
            v-model.number="options.delta_site"
            type="number"
            step="0.1"
            min="0"
          />
        </div>
        <div class="option-group" v-if="options.mode === 'single'">
          <label>Mean_limit</label>
          <div class="radio-group row">
            <label><input type="radio" v-model="options.mean_limit" value="show" /> Show</label>
            <label><input type="radio" v-model="options.mean_limit" value="hide" /> Hide</label>
          </div>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="content-area">
        <div class="table-area">
          <ag-grid-vue
            class="ag-theme-alpine"
            :rowData="gridData"
            :columnDefs="columnDefs"
            :defaultColDef="defaultColDef"
            :components="{ LotHeaderGroup }"
            rowSelection="multiple"
            :suppressRowClickSelection="true"
            style="width:100%;height:100%"
            @grid-ready="onGridReady"
            @cell-clicked="onCellClicked"
            @column-header-clicked="onColumnHeaderClicked"
            @cell-value-changed="onCellValueChanged"
            :isExternalFilterPresent="isExternalFilterPresent"
            :doesExternalFilterPass="doesExternalFilterPass"
          />
        </div>
        <div v-if="loading && !gridData.length" class="loading-overlay">加载中...</div>
      </div>
    </div>

    <div v-if="renameDialog.visible" class="rename-dialog-mask" @click.self="closeRenameDialog">
      <div class="rename-dialog">
        <div class="rename-title">修改 LOT 名称</div>
        <input
          v-model="renameDialog.name"
          class="rename-input"
          @keydown.enter="confirmRenameDialog"
          @keydown.esc="closeRenameDialog"
        />
        <div class="rename-actions">
          <button class="rename-btn secondary" @click="closeRenameDialog">取消</button>
          <button class="rename-btn primary" @click="confirmRenameDialog">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineComponent, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AgGridVue } from 'ag-grid-vue3'
import api from '@/api'

const route = useRoute()
const router = useRouter()
const lotIdsStr = route.query.lot_ids as string

const openMultiBin = () => {
  const url = router.resolve(`/multi-bin?lot_ids=${lotIdsStr}`).href
  window.open(url, '_blank')
}

const lots = ref<any[]>([])
const params = ref<any[]>([])
const lotDetails = ref<any[]>([])
const loading = ref(true)
const gridApi = ref<any>(null)
const lotDisplayNames = ref<Record<string, string>>({})
const renameDialog = ref({
  visible: false,
  lotId: '',
  name: '',
})

const options = ref({
  filter_type: 'all',
  sigma: 3,
  char_mode: 'lot',
  chars_row: 3,
  single_lot_name: 'all_lot',
  mode: 'lot',
  delta_site: 3,
  mean_limit: 'show',
})

const exporting = ref(false)
const exportProgress = ref(0)
const LOT_COLORS = ['#4dabf7', '#ff6b6b', '#69db7c', '#ffd43b', '#e599f7', '#ffa94d', '#74c0fc', '#a9e34b']

function fmtNum(val: any) {
  return val === null || val === undefined || Number.isNaN(Number(val)) ? '-' : Number(val).toFixed(4)
}

function defaultLotDisplayName(lot: any) {
  if (lot?.lot_id && lot?.wafer_id) return `${lot.lot_id}-${lot.wafer_id}`
  return lot?.wafer_id || lot?.lot_id || lot?.filename || `LOT ${lot?.id ?? ''}`
}

function getLotDisplayName(lot: any) {
  return lotDisplayNames.value[String(lot.id)] || defaultLotDisplayName(lot)
}

function ensureLotDisplayNames() {
  lots.value.forEach((lot: any) => {
    const key = String(lot.id)
    if (!lotDisplayNames.value[key]) {
      lotDisplayNames.value[key] = defaultLotDisplayName(lot)
    }
  })
}

function openRenameDialog(lot: any) {
  renameDialog.value = {
    visible: true,
    lotId: String(lot.id),
    name: getLotDisplayName(lot),
  }
}

function confirmRenameDialog() {
  const lotId = renameDialog.value.lotId
  if (!lotId) return
  const trimmed = renameDialog.value.name.trim()
  if (!trimmed) return
  lotDisplayNames.value = {
    ...lotDisplayNames.value,
    [lotId]: trimmed,
  }
  closeRenameDialog()
  gridApi.value?.refreshHeader?.()
}

function closeRenameDialog() {
  renameDialog.value = {
    visible: false,
    lotId: '',
    name: '',
  }
}

function openRenameDialogById(lotId: string) {
  const lot = lots.value.find((item: any) => String(item.id) === lotId)
  if (lot) openRenameDialog(lot)
}

const LotHeaderGroup = defineComponent({
  props: {
    params: { type: Object, required: true },
  },
  setup(props) {
    return () => h(
      'span',
      {
        class: 'lot-header-label',
        title: 'Double click to rename',
        onDblclick: (event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          const params = props.params as any
          params.openRename?.(params.lotId)
        },
      },
      (props.params as any).displayName
    )
  },
})

function getLotMeans(row: any) {
  return lots.value
    .map(lot => row.lots?.[String(lot.id)]?.mean)
    .filter((val: any) => val !== null && val !== undefined && !Number.isNaN(Number(val)))
    .map((val: any) => Number(val))
}

// 转换数据为 ag-grid 格式 (合并后的统计数据)
const gridData = computed(() => {
  return params.value.map(p => ({
    item_number: p.item_number,
    item_name: p.item_name,
    unit: p.unit,
    lower_limit: p.lower_limit,
    upper_limit: p.upper_limit,
    lots: p.lots || {},
    ...(p.overall_stats || {})
  }))
})

const totalDieCount = computed(() => {
  if (lotDetails.value.length) {
    return lotDetails.value.reduce((sum, lot) => sum + (lot.die_count || 0), 0)
  }
  return 0
})

const totalPassCount = computed(() => {
  if (lotDetails.value.length) {
    return lotDetails.value.reduce((sum, lot) => sum + (lot.pass_count || 0), 0)
  }
  return 0
})

const averageYield = computed(() => {
  if (lotDetails.value.length) {
    const totalPass = totalPassCount.value
    const totalDie = totalDieCount.value
    return totalDie > 0 ? totalPass / totalDie : 0
  }
  return 0
})

const defaultColDef = {
  resizable: true,
  sortable: true,
  filter: true,
  minWidth: 80,
}

const floatingFilterCol = {
  filter: true,
  floatingFilter: true,
  suppressMenu: false,
  suppressHeaderMenuButton: false,
  suppressHeaderFilterButton: false,
  floatingFilterComponentParams: { suppressFilterButton: true },
}

const columnDefs = computed(() => {
  const baseDefs: any[] = [
    { 
      headerName: '#', 
      field: 'item_number', 
      width: 90, 
      pinned: 'left',
      checkboxSelection: true,
      headerCheckboxSelection: true,
      filter: true,
      floatingFilter: true,
      suppressMenu: false,
      suppressHeaderMenuButton: false,
      suppressHeaderFilterButton: false,
      floatingFilterComponentParams: { suppressFilterButton: true }
    },
    {
      headerName: 'TestItem',
      field: 'item_name',
      width: 200,
      pinned: 'left',
      cellStyle: { color: '#1890ff', cursor: 'pointer' },
      filter: true,
      floatingFilter: true,
      suppressMenu: false,
      suppressHeaderMenuButton: false,
      suppressHeaderFilterButton: false,
      floatingFilterComponentParams: { suppressFilterButton: true }
    },
    { headerName: 'L.Limit', field: 'lower_limit', width: 100, ...floatingFilterCol },
    { headerName: 'U.Limit', field: 'upper_limit', width: 100, ...floatingFilterCol },
    { headerName: 'Units', field: 'unit', width: 80, ...floatingFilterCol },
    { headerName: 'Min', field: 'min_val', width: 100, valueFormatter: (p: any) => fmtNum(p.value), ...floatingFilterCol },
    { headerName: 'Max', field: 'max_val', width: 100, valueFormatter: (p: any) => fmtNum(p.value), ...floatingFilterCol },
    { headerName: 'Exec Qty', field: 'exec_qty', width: 90 },
    { headerName: 'Failures', field: 'fail_count', width: 90 },
    {
      headerName: 'Fail Rate',
      field: 'fail_rate',
      width: 90,
      valueFormatter: (p: any) => {
        const val = p.data.fail_count / p.data.exec_qty
        return isNaN(val) ? '0%' : (val * 100).toFixed(3) + '%'
      }
    },
    {
      headerName: 'Yield',
      field: 'yield_rate',
      width: 90,
      valueFormatter: (p: any) => p.value ? (p.value * 100).toFixed(2) + '%' : '-'
    },
  ]

  if (options.value.mode === 'lot') {
    baseDefs.push(
      ...lots.value.map((lot, idx) => ({
        headerName: getLotDisplayName(lot),
        groupId: `lot_${lot.id}`,
        headerGroupComponent: LotHeaderGroup,
        headerGroupComponentParams: {
          lotId: String(lot.id),
          openRename: openRenameDialogById,
        },
        marryChildren: true,
        headerClass: 'lot-stat-header',
        children: [
          {
            headerName: 'Mean',
            width: 100,
            valueGetter: (p: any) => p.data.lots?.[String(lot.id)]?.mean,
            valueFormatter: (p: any) => fmtNum(p.value),
            cellStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], fontWeight: 600 }
          },
          {
            headerName: 'Stdev',
            width: 100,
            valueGetter: (p: any) => p.data.lots?.[String(lot.id)]?.stdev,
            valueFormatter: (p: any) => fmtNum(p.value),
            cellStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], fontWeight: 600 }
          },
        ]
      }))
    )
    baseDefs.push(
      {
        headerName: 'Mean Delta',
        field: 'mean_delta',
        width: 120,
        valueGetter: (p: any) => {
          const values = getLotMeans(p.data)
          if (values.length < 2) return null
          return Math.max(...values) - Math.min(...values)
        },
        valueFormatter: (p: any) => fmtNum(p.value),
        cellStyle: (p: any) => {
          const delta = p.value
          const allLotMean = p.data.mean
          const threshold = Math.abs((allLotMean || 0) * (options.value.delta_site / 100))
          if (delta !== null && delta !== undefined && allLotMean !== null && allLotMean !== undefined && delta > threshold) {
            return { color: 'red', fontWeight: 'bold' }
          }
          return {}
        }
      },
      {
        headerName: 'Mean_%',
        width: 100,
        valueGetter: (p: any) => {
          const values = getLotMeans(p.data)
          if (values.length < 2 || p.data.mean === null || p.data.mean === undefined) return null
          if (Math.abs(p.data.mean) < 0.05) return 0
          return (Math.max(...values) - Math.min(...values)) / p.data.mean
        },
        valueFormatter: (p: any) => p.value !== null && p.value !== undefined ? (p.value * 100).toFixed(2) + '%' : '-',
      },
    )
  } else {
    if (options.value.mean_limit === 'show') {
      baseDefs.push(
        { headerName: 'Mean', field: 'mean', width: 100, valueFormatter: (p: any) => fmtNum(p.value) },
        { headerName: 'Stdev', field: 'stdev', width: 100, valueFormatter: (p: any) => fmtNum(p.value) },
      )
    } else {
      baseDefs.push(
        {
          headerName: 'LL_new',
          field: 'll_new',
          width: 100,
          editable: true,
          cellClass: 'editable-cell',
          valueParser: (p: any) => p.newValue !== '' && p.newValue !== null ? Number(p.newValue) : null,
        },
        {
          headerName: 'UL_new',
          field: 'ul_new',
          width: 100,
          editable: true,
          cellClass: 'editable-cell',
          valueParser: (p: any) => p.newValue !== '' && p.newValue !== null ? Number(p.newValue) : null,
        },
        {
          headerName: 'fail_new',
          field: 'fail_new',
          width: 100,
          valueFormatter: (p: any) => p.value !== null && p.value !== undefined ? p.value : '—',
        },
        {
          headerName: 'yield_new',
          field: 'yield_new',
          width: 100,
          valueFormatter: (p: any) => p.value !== null && p.value !== undefined ? (p.value * 100).toFixed(2) + '%' : '—',
        }
      );
    }
  }

  baseDefs.push({
    headerName: 'CPK',
    field: 'cpk',
    width: 90,
    valueFormatter: (p: any) => fmtNum(p.value),
    cellStyle: (p: any) => {
      if (p.value === null || p.value === undefined) return {}
      if (p.value < 1.0) return { color: 'red', fontWeight: 'bold' }
      if (p.value < 1.33) return { color: 'orange' }
      return {}
    }
  })

  return baseDefs
})

function onGridReady(params: any) {
  gridApi.value = params.api
}

async function fetchData() {
  loading.value = true
  try {
    const data: any = await api.get('/analysis/multi/items', {
      params: { 
        lot_ids: lotIdsStr,
        filter_type: options.value.filter_type,
        sigma: options.value.sigma,
        data_range: 'final'
      }
    })
    lots.value = data.lots || []
    ensureLotDisplayNames()
    
    const itemsData = data.params || []
    
    // Load saved custom limits
    try {
      const savedLimits: any[] = await api.get(`/analysis/multi_lot/custom_limits`, {
        params: { lot_ids: lotIdsStr }
      })
      if (savedLimits && savedLimits.length > 0) {
        savedLimits.forEach((lim: any) => {
          const matched = itemsData.find((item: any) => item.item_name === lim.item_name)
          if (matched) {
            matched.ll_new = lim.ll_new
            matched.ul_new = lim.ul_new
          }
        })
      }
    } catch (e) {
      console.error('Failed to fetch custom limits:', e)
    }

    params.value = itemsData

    // Auto-calculate yield if custom limits are loaded
    const hasCustom = itemsData.some((row: any) => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
    if (hasCustom) {
      nextTick(() => {
        handleRecalc()
      })
    }

    // 首次加载或LOT变化时获取LOT详细信息用于汇总
    if (!lotDetails.value.length && lots.value.length) {
      const details = await Promise.all(
        lots.value.map(l => api.get(`/analysis/lot/${l.id}/info`))
      )
      lotDetails.value = details
    }
  } catch (err: any) {
    console.error('Fetch failed:', err)
    alert('获取数据失败: ' + (err.response?.data?.detail || err.message))
  } finally {
    loading.value = false
  }
}

// 监听选项变化，自动刷新
watch(
  [
    () => options.value.filter_type,
    () => options.value.sigma
  ],
  () => {
    fetchData()
  }
)

watch(
  () => options.value.char_mode,
  (mode) => {
    if (mode === 'lot') {
      options.value.chars_row = 1
    }
  },
  { immediate: true }
)

// localStorage 持久化 key（按 lotIds 区分，避免不同页面互相干扰）
const EXPORT_STORAGE_KEY = `export_task_multi_${lotIdsStr}`

/**
 * 启动轮询。taskId 和 fileName 会先写入 localStorage，
 * 页面刷新后 onMounted 可自动恢复。
 */
function startPolling(taskId: string, fileName: string) {
  exporting.value = true

  // 持久化到 localStorage，刷新后可恢复
  localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify({ taskId, fileName, progress: exportProgress.value }))

  const pollInterval = setInterval(async () => {
    try {
      const statusRes: any = await api.get(`/analysis/export_items/status/${taskId}`)
      const { status, progress, error } = statusRes

      if (status === 'completed') {
        clearInterval(pollInterval)
        exportProgress.value = 100
        localStorage.removeItem(EXPORT_STORAGE_KEY)

        // 下载独立 try/catch，失败时明确提示而不是静默吞掉
        try {
          const downloadRes: any = await api.get(`/analysis/export_items/download/${taskId}`, {
            responseType: 'blob'
          })

          console.log('[Export] downloadRes:', downloadRes)
          console.log('[Export] downloadRes.data:', downloadRes.data)
          console.log('[Export] content-type:', downloadRes.headers?.['content-type'])

          // api 拦截器在 responseType==='blob' 时返回完整 response 对象
          // downloadRes.data 才是真正的 Blob
          const blob: Blob = downloadRes.data instanceof Blob
            ? downloadRes.data
            : new Blob([downloadRes.data])

          // 若服务端返回 JSON 错误（被包成 Blob），content-type 会是 application/json
          const contentType = downloadRes.headers?.['content-type'] ?? ''
          if (contentType.includes('application/json')) {
            // 读取错误信息
            const text = await blob.text()
            console.error('[Export] server returned JSON error:', text)
            alert('下载失败（服务端错误）：' + text)
            exporting.value = false
            return
          }

          const url = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.setAttribute('download', fileName)
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)

          setTimeout(() => { exporting.value = false }, 1000)
        } catch (downloadErr) {
          console.error('[Export] download request failed:', downloadErr)
          alert('文件下载失败，请打开浏览器控制台查看详细错误')
          exporting.value = false
        }

      } else if (status === 'failed') {
        clearInterval(pollInterval)
        localStorage.removeItem(EXPORT_STORAGE_KEY)
        alert('导出失败: ' + error)
        exporting.value = false

      } else {
        // 更新进度，同步写 localStorage
        exportProgress.value = progress ?? exportProgress.value
        localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify({ taskId, fileName, progress: exportProgress.value }))
      }
    } catch (pollErr) {
      // 轮询请求本身出错（网络断开等）
      console.error('[Export] poll status failed:', pollErr)
      clearInterval(pollInterval)
      exporting.value = false
    }
  }, 1000)
}

async function handleExport() {
  if (exporting.value) return

  let selectedItems = ''
  if (gridApi.value) {
    const selectedNodes = gridApi.value.getSelectedNodes()
    if (selectedNodes.length > 0) {
      selectedItems = selectedNodes.map((node: any) => node.data.item_number).join(',')
    }
  }

  exportProgress.value = 0

  try {
    const startRes: any = await api.post('/analysis/multi/export_items/start', null, {
      params: {
        lot_ids: lotIdsStr,
        filter_type: options.value.filter_type,
        sigma: options.value.sigma,
        data_range: 'final',
        chars_row: options.value.char_mode === 'lot' ? 1 : options.value.chars_row,
        char_mode: options.value.char_mode,
        selected_items: selectedItems,
        single_lot_name: options.value.single_lot_name,
        mode: options.value.mode,
        delta_site: options.value.delta_site,
        lot_display_names: JSON.stringify(lotDisplayNames.value),
      }
    })

    const taskId = startRes.task_id
    const fileName = `${options.value.single_lot_name}_Report.xlsx`
    startPolling(taskId, fileName)

  } catch (error) {
    alert('启动导出失败')
    exporting.value = false
  }
}

/** 页面加载时，检查是否有未完成的导出任务，若有则自动恢复 */
function resumeExportIfPending() {
  const raw = localStorage.getItem(EXPORT_STORAGE_KEY)
  if (!raw) return
  try {
    const { taskId, fileName, progress } = JSON.parse(raw)
    if (!taskId) return
    exportProgress.value = progress ?? 0
    startPolling(taskId, fileName)
  } catch {
    localStorage.removeItem(EXPORT_STORAGE_KEY)
  }
}

function onCellClicked(params: any) {
  if (params.colDef.field === 'item_number') {
    const target = params.event.target as HTMLElement;
    if (target && !target.closest('.ag-checkbox')) {
      params.node.setSelected(!params.node.isSelected());
    }
    return;
  }

  // 只有 TestItem 列才跳转
  if (params.colDef.field !== 'item_name') return;

  const paramName = params.data.item_name;
  if (paramName) {
    const url = router.resolve({
      path: '/multi-param',
      query: {
        lot_ids: lotIdsStr,
        param_name: paramName,
        mode: options.value.mode,
        single_lot_name: options.value.single_lot_name,
        lot_display_names: JSON.stringify(lotDisplayNames.value),
      }
    }).href
    window.open(url, '_blank')
  }
}

function onColumnHeaderClicked(params: any) {
  if (options.value.mode !== 'lot') return
  if (params.event?.detail !== 2) return
  const parentGroup = params.column?.getParent?.()
  const groupId = params.columnGroup?.getGroupId?.() || params.columnGroup?.groupId || parentGroup?.getGroupId?.() || parentGroup?.groupId
  if (!groupId || !String(groupId).startsWith('lot_')) return
  const lotId = String(groupId).replace('lot_', '')
  const lot = lots.value.find((item: any) => String(item.id) === lotId)
  if (lot) openRenameDialog(lot)
}

function yieldColor(val: number) {
  if (!val) return {}
  if (val < 0.8) return { color: 'red' }
  if (val < 0.95) return { color: 'orange' }
  return { color: 'green' }
}

const overallYieldNew = ref<number | null>(null)
const limitFileInput = ref<any>(null)

function triggerExportLimit() {
  const headers = ['#', 'Bin', 'TestItem', 'L.Limit', 'U.Limit', 'Units', 'Min', 'Max', 'Exec Qty', 'Failures', 'Fail Rate', 'Yield', 'Mean', 'll_new', 'ul_new']
  const csvRows = [headers.join(',')]
  
  params.value.forEach(row => {
    const quote = (val: any) => {
      const s = val === null || val === undefined ? '' : String(val)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    
    const failRateVal = row.fail_count / row.exec_qty
    const yieldVal = row.yield_rate
    
    const fields = [
      quote(row.item_number),
      quote(row.first_fail_bin),
      quote(row.item_name),
      quote(row.lower_limit),
      quote(row.upper_limit),
      quote(row.unit),
      quote(row.min_val),
      quote(row.max_val),
      quote(row.exec_qty),
      quote(row.fail_count),
      quote(isNaN(failRateVal) ? 0 : failRateVal),
      quote(yieldVal),
      quote(row.mean),
      quote(row.ll_new),
      quote(row.ul_new)
    ]
    csvRows.push(fields.join(','))
  })
  
  const csvContent = '\ufeff' + csvRows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `Limit_Export_MultiLot_${lotIdsStr}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function triggerImportLimit() {
  if (limitFileInput.value) {
    limitFileInput.value.click()
  }
}

function onLimitFileSelected(event: any) {
  const file = event.target.files[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e: any) => {
    const text = e.target.result
    const parsed = parseCSV(text)
    
    parsed.forEach(parts => {
      if (parts.length < 15) return
      const itemName = parts[2]
      const llNewStr = parts[13]
      const ulNewStr = parts[14]
      
      const llNew = llNewStr !== '' ? Number(llNewStr) : null
      const ulNew = ulNewStr !== '' ? Number(ulNewStr) : null
      
      const row = params.value.find(item => item.item_name === itemName)
      if (row) {
        if (!isNaN(Number(llNew)) && llNewStr !== '') row.ll_new = llNew
        else if (llNewStr === '') row.ll_new = null
        
        if (!isNaN(Number(ulNew)) && ulNewStr !== '') row.ul_new = ulNew
        else if (ulNewStr === '') row.ul_new = null
      }
    })
    
    if (gridApi.value) {
      if (typeof gridApi.value.setGridOption === 'function') {
        gridApi.value.setGridOption('rowData', params.value)
      } else if (typeof gridApi.value.setRowData === 'function') {
        gridApi.value.setRowData(params.value)
      } else {
        gridApi.value.refreshCells()
      }
    }
    if (gridApi.value) {
      gridApi.value.onFilterChanged()
    }
    saveCustomLimitsToBackend()
  }
  reader.readAsText(file)
  event.target.value = ''
}

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/)
  const result: any[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts: string[] = []
    let current = ''
    let inQuotes = false
    for (let char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    parts.push(current.trim())
    result.push(parts)
  }
  return result
}

async function saveCustomLimitsToBackend() {
  const reqData = params.value
    .filter(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
    .map(row => ({
      item_name: row.item_name,
      ll_new: row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '' ? Number(row.ll_new) : null,
      ul_new: row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '' ? Number(row.ul_new) : null,
    }))
  try {
    await api.post(`/analysis/multi_lot/save_custom_limits`, reqData, {
      params: { lot_ids: lotIdsStr }
    })
  } catch (e) {
    console.error('Failed to save custom limits:', e)
  }
}

const filterEditedOnly = ref(false)

const isExternalFilterPresent = () => {
  return filterEditedOnly.value
}

const doesExternalFilterPass = (node: any) => {
  const row = node.data
  return (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || 
         (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '')
}

function toggleFilterEdited() {
  filterEditedOnly.value = !filterEditedOnly.value
  if (gridApi.value) {
    gridApi.value.onFilterChanged()
  }
}

function onCellValueChanged(event: any) {
  if (event.column.getColId() === 'll_new' || event.column.getColId() === 'ul_new') {
    saveCustomLimitsToBackend()
    if (gridApi.value) {
      gridApi.value.onFilterChanged()
    }
  }
}

async function handleRecalc() {
  const reqData = params.value
    .filter(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
    .map(row => ({
      item_name: row.item_name,
      ll_new: row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '' ? Number(row.ll_new) : null,
      ul_new: row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '' ? Number(row.ul_new) : null,
    }))
    
  try {
    const res: any = await api.post(`/analysis/multi_lot/recalc_all_limits`, reqData, {
      params: {
        lot_ids: lotIdsStr,
        filter_type: options.value.filter_type,
        sigma: options.value.sigma,
        data_range: 'final'
      }
    })
    
    overallYieldNew.value = res.overall_yield_new
    
    res.items.forEach((item: any) => {
      const row = params.value.find(r => r.item_name === item.item_name)
      if (row) {
        row.fail_new = item.fail_new
        row.yield_new = item.yield_new
      }
    })
    
    if (params.value.length > 0) {
      params.value[0].yield_new = res.overall_yield_new
    }
    
    if (gridApi.value) {
      if (typeof gridApi.value.setGridOption === 'function') {
        gridApi.value.setGridOption('rowData', params.value)
      } else if (typeof gridApi.value.setRowData === 'function') {
        gridApi.value.setRowData(params.value)
      } else {
        gridApi.value.refreshCells()
      }
    }
  } catch (e: any) {
    console.error('Failed to recalculate overall yield:', e)
    alert('计算失败: ' + (e.message || e))
  }
}

onMounted(() => {
  fetchData()
  resumeExportIfPending()
})
</script>

<style scoped>
.multi-analysis-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: #f0f2f5;
  overflow: hidden;
}

.lot-info-bar {
  background: white;
  padding: 12px 16px;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  flex-shrink: 0;
}

.info-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 24px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label {
  font-size: 11px;
  color: #999;
}

.value {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.editable-name {
  position: relative;
  display: inline-block;
}

.name-input {
  border: 1px solid transparent;
  background: transparent;
  font-size: 13px;
  color: #333;
  font-weight: 500;
  padding: 2px 4px;
  border-radius: 4px;
  width: 120px;
  transition: all 0.2s;
}

.name-input:hover, .name-input:focus {
  border-color: #d9d9d9;
  background: white;
}

.info-item-actions {
  margin-left: 24px;
}

.btn-export {
  background: #52c41a;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}
.btn-export:hover { background: #73d13d; }
.btn-export:disabled { cursor: not-allowed; opacity: 0.8; }

.main-body {
  flex: 1;
  display: flex;
  gap: 12px;
  overflow: hidden;
}

.options-panel {
  width: 180px;
  background: white;
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.options-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 8px;
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option-group label {
  font-size: 12px;
  color: #666;
}

.option-group select,
.option-group input[type="number"] {
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.radio-group.row {
  flex-direction: row;
  gap: 12px;
}

.radio-group label {
  font-size: 12px;
  color: #444;
  display: flex;
  align-items: center;
  gap: 4px;
}

.content-area {
  flex: 1;
  background: white;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.table-area {
  flex: 1;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  color: #999;
  font-size: 14px;
}

:deep(.ag-floating-filter-button) {
  display: none !important;
}

:deep(.lot-header-label) {
  cursor: text;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.rename-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0,0,0,0.12);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
}

.rename-dialog {
  width: 280px;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.16);
  padding: 12px;
}

.rename-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.rename-input {
  width: 100%;
  height: 28px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  box-sizing: border-box;
}

.rename-input:focus {
  border-color: #1890ff;
  outline: none;
}

.rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.rename-btn {
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
  cursor: pointer;
  background: #fff;
}

.rename-btn.primary {
  color: white;
  border-color: #1890ff;
  background: #1890ff;
}

.rename-btn.secondary:hover {
  border-color: #1890ff;
  color: #1890ff;
}
:deep(.editable-cell) {
  background-color: #f6ffed !important;
  cursor: pointer;
}
</style>
