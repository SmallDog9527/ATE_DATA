

<template>
  <div class="analysis-view">
    <!-- 顶部LOT信息栏 -->
    <div class="lot-info-bar" v-if="lotInfo">
      <div class="info-grid">
        <div class="info-item">
          <span class="label">名称</span>
          <span class="value">{{ lotInfo.filename }}</span>
        </div>
        <div class="info-item">
          <span class="label">程序</span>
          <span class="value">{{ lotInfo.program }}</span>
        </div>
        <div class="info-item">
          <span class="label">LOT</span>
          <span class="value">{{ lotInfo.lot_id }}_{{ lotInfo.wafer_id }}</span>
        </div>
        <div class="info-item">
          <span class="label">测试机</span>
          <span class="value">{{ lotInfo.test_machine }}</span>
        </div>
        <div class="info-item">
          <span class="label">工位数</span>
          <span class="value">{{ lotInfo.station_count }}</span>
        </div>
        <div class="info-item">
          <span class="label">测试数量</span>
          <span class="value">{{ lotInfo.die_count }}</span>
        </div>
        <div class="info-item">
          <span class="label">测试项数</span>
          <span class="value">{{ itemCount }}</span>
        </div>
        <div class="info-item">
          <span class="label">良率</span>
          <span class="value" :style="yieldColor(lotInfo.yield_rate)">
            {{ lotInfo.yield_rate ? (lotInfo.yield_rate * 100).toFixed(2) + '%' : '-' }}
          </span>
        </div>
        <div class="info-item">
          <span class="label">测试阶段</span>
          <span class="value">{{ lotInfo.data_type }}</span>
        </div>
        <div class="info-item">
            <span class="label">测试日期</span>
            <span class="value">{{ formatDate(lotInfo.test_date) }}</span>
        </div>
        <div class="info-item-actions">
          <button class="btn-bin" @click="openBinAnalysis">📊 BIN分析</button>
          <button 
            class="btn-bin" 
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
          
          <template v-if="options.mean_limit === 'hide'">
            <button class="btn-bin" style="margin-left: 120px;" @click="triggerExportLimit">📤 导出 Limit</button>
            <button class="btn-bin" @click="triggerImportLimit">📥 导入 Limit</button>
            <button class="btn-bin" @click="toggleFilterEdited">
              {{ filterEditedOnly ? '🔍 显示全部' : '🔍 仅看已修改' }}
            </button>
            <button class="btn-bin" style="background-color: #1890ff; color: white;" @click="handleRecalc">🧮 Calc</button>
            <span v-if="overallYieldNew !== null" style="font-size: 13px; font-weight: bold; color: #1890ff; margin-left: 8px; white-space: nowrap;">
              重算总良率: {{ (overallYieldNew * 100).toFixed(2) }}%
            </span>
            <input type="file" ref="limitFileInput" style="display: none" @change="onLimitFileSelected" />
          </template>
        </div>
      </div>
    </div>

    <!-- 主体：左侧Options + 右侧图表 + 底部表格 -->
    <div class="main-body">
      <!-- 左侧Options面板 -->
      <div class="options-panel">
        <div class="options-title">Options</div>

        <div class="option-group">
          <label>Filter</label>
          <select v-model="options.filter_type">
            <option value="all">All Data</option>
            <option value="robust">Robust Data</option>
            <option value="filter_by_limit">Filter By Limit</option>
            <option value="filter_by_sigma">Filter by Sigma</option>
          </select>
        </div>

        <div class="option-group" v-if="options.filter_type === 'filter_by_sigma'">
          <label>Sigma</label>
          <input v-model.number="options.sigma" type="number" step="0.5" min="1" max="6" />
        </div>

        <div class="option-group">
          <label>DataRange</label>
          <div class="radio-group row">
            <label><input type="radio" v-model="options.data_range" value="final" /> Final</label>
            <label><input type="radio" v-model="options.data_range" value="original" /> Original</label>
          </div>
        </div>

        <div class="option-group">
          <label>chars_row</label>
          <div class="radio-group row">
            <label><input type="radio" v-model="options.chars_row" :value="1" /> 1</label>
            <label><input type="radio" v-model="options.chars_row" :value="3" /> 3</label>
            <label><input type="radio" v-model="options.chars_row" :value="5" /> 5</label>
          </div>
        </div>

        <div class="option-group">
          <label>Delta Site (%)</label>
          <input 
            v-model.number="options.delta_site" 
            type="number" 
            step="0.1" 
            min="0" 
          />
        </div>
        <div class="option-group">
          <label>Mean_limit</label>
          <div class="radio-group row">
            <label><input type="radio" v-model="options.mean_limit" value="show" /> Show</label>
            <label><input type="radio" v-model="options.mean_limit" value="hide" /> Hide</label>
          </div>
        </div>
        <div class="option-group">
          <label>Site_mode</label>
          <div class="radio-group row">
            <label><input type="radio" v-model="options.site_mode" value="site" /> SITE</label>
            <label><input type="radio" v-model="options.site_mode" value="lot" /> LOT</label>
          </div>
        </div>
    </div>

      <!-- 右侧内容区 -->
      <div class="content-area">
        <!-- 参数表格 -->
        <div class="table-area">
          <ag-grid-vue
            class="ag-theme-alpine"
            :theme="'legacy'"
            :rowData="testItems"
            :columnDefs="columnDefs"
            :defaultColDef="defaultColDef"
            rowSelection="multiple"
            :suppressRowClickSelection="true"
            style="width:100%;height:100%"
            @grid-ready="onGridReady"
            @cell-clicked="onCellClicked"
            @cell-value-changed="onCellValueChanged"
            :isExternalFilterPresent="isExternalFilterPresent"
            :doesExternalFilterPass="doesExternalFilterPass"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AgGridVue } from 'ag-grid-vue3'
import * as echarts from 'echarts'
import api from '@/api'
import { fmtDateTz } from '@/utils/dateUtils'

const route = useRoute()
const router = useRouter()
const lotId = ref<number>(Number(route.params.id))

const openBinAnalysis = () => {
  const url = router.resolve(`/lot/${lotId.value}/bin`).href
  window.open(url, '_blank')
}

const lotInfo = ref<any>(null)
const testItems = ref<any[]>([])
const itemCount = ref(0)
const gridApi = ref<any>(null)

function onGridReady(params: any) {
  gridApi.value = params.api
}

const options = ref({
  filter_type: 'all',
  data_range: 'final',
  sigma: 3,
  chars_row: 3,
  delta_site: 3,
  mean_limit: 'show',
  site_mode: 'site',
})

const exporting = ref(false)
const exportProgress = ref(0)
const exportTaskId = ref("")

const defaultColDef = {
  resizable: true,
  sortable: true,
  filter: true,
  minWidth: 80,
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
      suppressHeaderMenuButton: false,
      suppressHeaderFilterButton: false,
      floatingFilterComponentParams: { suppressFilterButton: true }
    },
    {
      headerName: 'Bin',
      field: 'first_fail_bin',
      width: 70,
      pinned: 'left',
      cellStyle: { fontWeight: 'bold', color: '#f5222d' },
      filter: 'agNumberColumnFilter',
      filterParams: {
        filterOptions: ['equals', 'lessThan', 'greaterThan'],
        defaultOption: 'equals',
      },
      floatingFilter: true,
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
      suppressHeaderMenuButton: false,
      suppressHeaderFilterButton: false,
      floatingFilterComponentParams: { suppressFilterButton: true }
    },
    { headerName: 'L.Limit', field: 'lower_limit', width: 100 },
    { headerName: 'U.Limit', field: 'upper_limit', width: 100 },
    { headerName: 'Units', field: 'unit', width: 80 },
    { headerName: 'Min', field: 'min_val', width: 100 },
    { headerName: 'Max', field: 'max_val', width: 100 },
    { headerName: 'Exec Qty', field: 'exec_qty', width: 90 },
    { headerName: 'Failures', field: 'fail_count', width: 90 },
    {
      headerName: 'Fail Rate',
      field: 'fail_rate',
      width: 90,
      valueFormatter: (p: any) => p.value ? (p.value * 100).toFixed(3) + '%' : '0%'
    },
    {
      headerName: 'Yield',
      field: 'yield_rate',
      width: 90,
      valueFormatter: (p: any) => p.value ? (p.value * 100).toFixed(2) + '%' : '-'
    },
    { headerName: 'Mean', field: 'mean', width: 100, valueFormatter: (p: any) => p.value?.toFixed(4) ?? '-' },
    { headerName: 'Stdev', field: 'stdev', width: 100, valueFormatter: (p: any) => p.value?.toFixed(4) ?? '-' },
    { headerName: 'CPU', field: 'cpu', width: 90, valueFormatter: (p: any) => p.value?.toFixed(4) ?? '-' },
    { headerName: 'CPL', field: 'cpl', width: 90, valueFormatter: (p: any) => p.value?.toFixed(4) ?? '-' },
    {
      headerName: 'CPK',
      field: 'cpk',
      width: 90,
      valueFormatter: (p: any) => p.value?.toFixed(4) ?? '-',
      cellStyle: (p: any) => {
        if (p.value === null || p.value === undefined) return {}
        if (p.value < 1.0) return { color: 'red', fontWeight: 'bold' }
        if (p.value < 1.33) return { color: 'orange' }
        return {}
      }
    },
  ];

  if (options.value.mean_limit === 'show') {
    // Find unique sites from testItems
    const siteKeys = new Set<string>();
    testItems.value.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key.startsWith('mean_s')) {
          siteKeys.add(key);
        }
      });
    });

    const sortedSiteKeys = Array.from(siteKeys).sort((a, b) => {
      const numA = parseInt(a.replace('mean_s', ''));
      const numB = parseInt(b.replace('mean_s', ''));
      return numA - numB;
    });

    sortedSiteKeys.forEach(key => {
      const siteNum = key.replace('mean_s', '');
      baseDefs.push({
        headerName: `Mean_S${siteNum}`,
        field: key,
        width: 110,
        valueFormatter: (p: any) => p.value?.toFixed(4) ?? '-',
        cellStyle: (params: any) => {
          const val = params.value;
          if (val === null || val === undefined || typeof val !== 'number' || isNaN(val)) {
            return {};
          }
          const validValues = sortedSiteKeys
            .map(k => params.data?.[k])
            .filter(v => v !== null && v !== undefined && typeof v === 'number' && !isNaN(v));
          if (validValues.length < 2) return {};
          const maxVal = Math.max(...validValues);
          const minVal = Math.min(...validValues);
          if (maxVal === minVal) return {};
          if (Math.abs(val - maxVal) < 1e-9) {
            return { color: 'red', fontWeight: 'bold' };
          }
          if (Math.abs(val - minVal) < 1e-9) {
            return { color: 'green', fontWeight: 'bold' };
          }
          return {};
        }
      });
    });

    // Add the Delta and Percentage columns
    if (sortedSiteKeys.length > 0) {
      baseDefs.push({
        headerName: 'Mean Delta',
        field: 'mean_delta',
        width: 120,
        valueGetter: (params: any) => {
          const values = sortedSiteKeys.map(k => params.data[k]).filter(v => v !== null && v !== undefined);
          if (values.length < 2) return null;
          return Math.max(...values) - Math.min(...values);
        },
        valueFormatter: (p: any) => p.value?.toFixed(4) ?? '-',
        cellStyle: (params: any) => {
          const delta = params.value;
          const allSiteMean = params.data.mean;
          const deltaSitePct = options.value.delta_site / 100;
          if (delta !== null && allSiteMean !== null && delta > Math.abs(allSiteMean * deltaSitePct)) {
            return { color: 'red', fontWeight: 'bold' };
          }
          return {};
        }
      });

      baseDefs.push({
        headerName: 'Mean_%',
        width: 100,
        valueGetter: (params: any) => {
          const delta = params.getValue('mean_delta');
          const allSiteMean = params.data.mean;
          if (delta === null || allSiteMean === null || allSiteMean === undefined) return null;
          if (Math.abs(allSiteMean) < 0.05) return 0;
          return delta / allSiteMean;
        },
        valueFormatter: (p: any) => p.value !== null ? (p.value * 100).toFixed(2) + '%' : '-'
      });
    }
  } else {
    // If mean_limit is 'hide', add the 4 new columns: LL_new, UL_new, fail_new, yield_new
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

  return baseDefs;
});

const overallYieldNew = ref<number | null>(null)
const limitFileInput = ref<any>(null)

function triggerExportLimit() {
  const headers = ['#', 'Bin', 'TestItem', 'L.Limit', 'U.Limit', 'Units', 'Min', 'Max', 'Exec Qty', 'Failures', 'Fail Rate', 'Yield', 'Mean', 'll_new', 'ul_new']
  const csvRows = [headers.join(',')]
  
  testItems.value.forEach(row => {
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
  link.setAttribute('download', `Limit_Export_Lot_${lotId.value}.csv`)
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
      
      const row = testItems.value.find(item => item.item_name === itemName)
      if (row) {
        if (!isNaN(Number(llNew)) && llNewStr !== '') row.ll_new = llNew
        else if (llNewStr === '') row.ll_new = null
        
        if (!isNaN(Number(ulNew)) && ulNewStr !== '') row.ul_new = ulNew
        else if (ulNewStr === '') row.ul_new = null
      }
    })
    
    if (gridApi.value) {
      if (typeof gridApi.value.setGridOption === 'function') {
        gridApi.value.setGridOption('rowData', testItems.value)
      } else if (typeof gridApi.value.setRowData === 'function') {
        gridApi.value.setRowData(testItems.value)
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
  const reqData = testItems.value
    .filter(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
    .map(row => ({
      item_name: row.item_name,
      ll_new: row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '' ? Number(row.ll_new) : null,
      ul_new: row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '' ? Number(row.ul_new) : null,
    }))
  try {
    await api.post(`/analysis/lot/${lotId.value}/save_custom_limits`, reqData)
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
  const reqData = testItems.value
    .filter(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
    .map(row => ({
      item_name: row.item_name,
      ll_new: row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '' ? Number(row.ll_new) : null,
      ul_new: row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '' ? Number(row.ul_new) : null,
    }))
    
  try {
    const res: any = await api.post(`/analysis/lot/${lotId.value}/recalc_all_limits`, reqData, {
      params: {
        filter_type: options.value.filter_type,
        sigma: options.value.sigma,
        data_range: options.value.data_range
      }
    })
    
    overallYieldNew.value = res.overall_yield_new
    
    res.items.forEach((item: any) => {
      const row = testItems.value.find(r => r.item_name === item.item_name)
      if (row) {
        row.fail_new = item.fail_new
        row.yield_new = item.yield_new
      }
    })
    
    if (testItems.value.length > 0) {
      testItems.value[0].yield_new = res.overall_yield_new
    }
    
    if (gridApi.value) {
      if (typeof gridApi.value.setGridOption === 'function') {
        gridApi.value.setGridOption('rowData', testItems.value)
      } else if (typeof gridApi.value.setRowData === 'function') {
        gridApi.value.setRowData(testItems.value)
      } else {
        gridApi.value.refreshCells()
      }
    }
  } catch (e: any) {
    console.error('Failed to recalculate overall yield:', e)
    alert('计算失败: ' + (e.message || e))
  }
}

async function fetchLotInfo() {
  lotInfo.value = await api.get(`/analysis/lot/${lotId.value}/info`)
}

async function fetchItems() {
  const data: any[] = await api.get(`/analysis/lot/${lotId.value}/items_summary`, {
    params: { 
      filter_type: options.value.filter_type,
      sigma: options.value.sigma,
      data_range: options.value.data_range
    }
  })
  
  // Load saved custom limits
  try {
    const savedLimits: any[] = await api.get(`/analysis/lot/${lotId.value}/custom_limits`)
    if (savedLimits && savedLimits.length > 0) {
      savedLimits.forEach((lim: any) => {
        const matched = data.find(item => item.item_name === lim.item_name)
        if (matched) {
          matched.ll_new = lim.ll_new
          matched.ul_new = lim.ul_new
        }
      })
    }
  } catch (e) {
    console.error('Failed to fetch custom limits:', e)
  }

  testItems.value = data
  itemCount.value = data.length

  // Auto-set site_mode: >8 sites -> LOT, <=8 sites -> SITE
  const siteKeys = new Set<string>()
  data.forEach((item: any) => {
    Object.keys(item).forEach(key => {
      if (key.startsWith('mean_s')) siteKeys.add(key)
    })
  })
  const siteCount = siteKeys.size
  options.value.site_mode = siteCount > 8 ? 'lot' : 'site'

  // Auto-calculate yield if custom limits are loaded
  const hasCustom = data.some(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
  if (hasCustom) {
    nextTick(() => {
      handleRecalc()
    })
  }
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

  exporting.value = true
  exportProgress.value = 0
  
  try {
    // 1. ??????
    const startRes: any = await api.post(`/analysis/lot/${lotId.value}/export_items/start`, null, {
      params: { 
        filter_type: options.value.filter_type,
        sigma: options.value.sigma,
        data_range: options.value.data_range,
        chars_row: options.value.chars_row,
        delta_site: options.value.delta_site,
        site_mode: options.value.site_mode,
        selected_items: selectedItems
      }
    })
    
    const taskId = startRes.task_id
    exportTaskId.value = taskId
    sessionStorage.setItem(`analysis_export_task_${lotId.value}`, taskId)

    // 2. ????
    const pollInterval = setInterval(async () => {
      try {
        const statusRes: any = await api.get(`/analysis/export_items/status/${taskId}`)
        const { status, progress, error, filename: resFilename } = statusRes
        
        if (status === 'completed') {
          clearInterval(pollInterval)
          exportProgress.value = 100
          
          // 3. 下载文件
          const downloadRes: any = await api.get(`/analysis/export_items/download/${taskId}`, {
            responseType: 'blob'
          })
          
          // api拦截器在responseType==='blob'时返回完整response对象，downloadRes.data才是Blob
          const blobData = downloadRes.data instanceof Blob ? downloadRes.data : new Blob([downloadRes.data])
          const url = window.URL.createObjectURL(blobData)
          const link = document.createElement('a')
          link.href = url
          // 使用后端返回的规范文件名 (含 .zip), 回退到默认名
          link.setAttribute('download', resFilename || `LOT_${lotId.value}_Report_${options.value.filter_type}.zip`)
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
          
          setTimeout(() => {
            exporting.value = false
          }, 1000)
        } else if (status === 'failed') {
          clearInterval(pollInterval)
          console.error('Export failed:', error)
          alert('????: ' + error)
          exporting.value = false
        } else {
          exportProgress.value = progress
        }
      } catch (err) {
        clearInterval(pollInterval)
        console.error('Polling failed:', err)
        exporting.value = false
      }
    }, 1000)

  } catch (error) {
    console.error('Export failed to start', error)
    alert('??????')
    exporting.value = false
  }
}



function onCellClicked(params: any) {
  // 只有 TestItem 列才跳转
  if (params.colDef.field !== 'item_name') return;

  const paramName = params.data.item_name;
  if (paramName) {
    const url = router.resolve(`/lot/${lotId.value}/param/${encodeURIComponent(paramName)}`).href;
    window.open(url, '_blank');
  }
}

watch([
  () => options.value.filter_type,
  () => options.value.sigma,
  () => options.value.data_range
], () => {
  fetchItems()
})

function yieldColor(val: number) {
  if (!val) return {}
  if (val < 0.8) return { color: 'red' }
  if (val < 0.95) return { color: 'orange' }
  return { color: 'green' }
}

function formatDate(d: string) {
  return fmtDateTz(d) || '-'
}

async function resumeExportTask(taskId: string) {
  try {
    const statusRes: any = await api.get(`/analysis/export_items/status/${taskId}`)
    exportProgress.value = statusRes.progress || 0
    if (statusRes.status === 'processing') {
      exporting.value = true
      const pollInterval = setInterval(async () => {
        try {
          const res: any = await api.get(`/analysis/export_items/status/${taskId}`)
          exportProgress.value = res.progress || 0
          if (res.status === 'completed' || res.status === 'failed') {
            clearInterval(pollInterval)
            exporting.value = false
          }
        } catch {
          clearInterval(pollInterval)
          exporting.value = false
        }
      }, 1000)
    }
  } catch {
    exportTaskId.value = ''
  }
}

onMounted(async () => {
  await fetchLotInfo()
  await fetchItems()
  const savedTaskId = sessionStorage.getItem(`analysis_export_task_${lotId.value}`)
  if (savedTaskId) {
    exportTaskId.value = savedTaskId
    await resumeExportTask(savedTaskId)
  }
})
</script>

<style scoped>
.analysis-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lot-info-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-item-actions {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-left: 24px;
  padding-bottom: 2px;
}

.btn-bin {
  background: #52c41a;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}

.btn-bin:hover { background: #73d13d; }

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
  gap: 16px;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.top-charts {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.chart-box {
  flex: 1;
  background: white;
  border-radius: 6px;
  padding: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.table-area {
  flex: 1;
  background: white;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.ag-theme-alpine {
  --ag-font-size: 13px;
  --ag-grid-size: 4px;
}

:deep(.ag-floating-filter-button) {
  display: none !important;
}
:deep(.editable-cell) {
  background-color: #f6ffed !important;
  cursor: pointer;
}
</style>
