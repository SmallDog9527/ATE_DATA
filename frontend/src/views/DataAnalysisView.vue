<template>
  <div class="analysis-container">
    <!-- View Switcher -->
    <div class="view-tabs">
      <button :class="['view-tab', { active: activeView === 'overview' }]" @click="switchView('overview')">
        📊 概览
      </button>
      <button :class="['view-tab', { active: activeView === 'detail' }]" @click="switchView('detail')">
        📋 明细
      </button>
      <button v-if="deviceViewDevice" :class="['view-tab', { active: activeView === 'device' }]" @click="switchView('device')">
        📈 {{ deviceViewDevice }} 分析
      </button>
    </div>

    <!-- ════════════════════════════════════════════════
         OVERVIEW TAB
    ════════════════════════════════════════════════ -->
    <div v-show="activeView === 'overview'" class="tab-content">
      <!-- Top filter bar -->
      <div class="filter-card ov-filter">
        <div class="ov-filter-row">
          <div class="ov-filter-item">
            <label>筛选范围</label>
            <select v-model="filterSelection" class="filter-select-dropdown" @change="onFilterSelectionChange">
              <optgroup label="月">
                <option value="month-1">1个月</option>
                <option value="month-3">3个月</option>
                <option value="month-6">6个月</option>
                <option value="month-9">9个月</option>
              </optgroup>
              <optgroup label="年">
                <option value="year-1">1年</option>
                <option value="year-2">2年</option>
                <option value="year-3">3年</option>
                <option value="year-4">4年</option>
              </optgroup>
              <optgroup label="LOT">
                <option value="lot-20">20 LOT</option>
                <option value="lot-40">40 LOT</option>
                <option value="lot-60">60 LOT</option>
                <option value="lot-80">80 LOT</option>
              </optgroup>
              <option value="all">全部</option>
            </select>
          </div>
          <div class="ov-filter-item" style="margin-left: 15px;">
            <label>产品名</label>
            <input type="text" v-model="ovProductName" placeholder="输入产品名" @input="debouncedOverviewSearch" class="filter-input input-device" style="width: 140px; font-size: 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1;" />
          </div>
          <div class="ov-filter-item ov-filter-right">
            <button class="btn btn-primary" @click="fetchOverview(true)">刷新</button>
          </div>
        </div>
      </div>

      <!-- Charts row -->
      <div class="charts-row" v-if="!ovLoading">
        <div class="chart-card" style="flex: 5;">
          <div class="chart-title">📦 产出（Wafers/周）</div>
          <div ref="outputChartRef" class="echart-box"></div>
        </div>
        <div class="chart-card" style="flex: 3;">
          <div class="chart-title">🥧 产品产出占比（Bin1 K）</div>
          <div ref="pieChartRef" class="echart-box"></div>
        </div>
        <div class="chart-card" style="flex: 2;">
          <div class="chart-title">🥧 OSAT 产出占比（Bin1 K）</div>
          <div ref="osatPieChartRef" class="echart-box"></div>
        </div>
      </div>
      <div class="charts-row" v-else>
        <div class="chart-card skeleton-card" style="flex: 5;"><div class="skeleton-shimmer"></div></div>
        <div class="chart-card skeleton-card" style="flex: 3;"><div class="skeleton-shimmer"></div></div>
        <div class="chart-card skeleton-card" style="flex: 2;"><div class="skeleton-shimmer"></div></div>
      </div>

      <!-- Products table (AG Grid) -->
      <div class="table-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
        <AgGridVue
          class="ag-theme-alpine"
          :theme="'legacy'"
          :rowData="ovProducts"
          :columnDefs="ovColDefs"
          :defaultColDef="defaultColDef"
          style="width: 100%; flex: 1; min-height: 0;"
          :suppressScrollOnNewData="true"
        />
      </div>
    </div>

    <!-- ════════════════════════════════════════════════
         DETAIL TAB
    ════════════════════════════════════════════════ -->
    <div v-show="activeView === 'detail'" class="tab-content">
      <!-- Filter Card -->
      <div class="filter-card">
        <div class="filter-row">
          <div class="filter-item">
            <label>OSAT</label>
            <input type="text" v-model="filters.osat_name" placeholder="输入 OSAT 名" @input="debouncedSearch" class="filter-input input-osat" />
          </div>
          <div class="filter-item">
            <label>Device</label>
            <input type="text" v-model="filters.product_name" placeholder="输入 Device 名" @input="debouncedSearch" class="filter-input input-device" />
          </div>
          <div class="filter-item">
            <label>LOT ID</label>
            <input type="text" v-model="filters.lot_id" placeholder="输入 LOT ID" @input="debouncedSearch" class="filter-input input-lot" />
          </div>
          <div class="filter-item">
            <label>WAFER ID</label>
            <input type="text" v-model="filters.wafer_id" placeholder="输入 WAFER ID" @input="debouncedSearch" class="filter-input input-wafer" />
          </div>
          <div class="filter-item">
            <label>PGM</label>
            <input type="text" v-model="filters.program" placeholder="输入 PGM (程序名)" @input="debouncedSearch" class="filter-input input-pgm" />
          </div>
          <div class="filter-item date-range-item">
            <label>测试日期</label>
            <div class="date-range-floating">
              <label class="date-range-box" title="开始日期">
                <span class="date-range-value">{{ filters.test_date_from || '开始日期' }}</span>
                <input type="date" class="date-range-native" v-model="filters.test_date_from" @change="handleSearch" @click="($event.target).showPicker?.()" />
              </label>
              <span class="date-range-separator">-</span>
              <label class="date-range-box" title="结束日期">
                <span class="date-range-value">{{ filters.test_date_to || '结束日期' }}</span>
                <input type="date" class="date-range-native" v-model="filters.test_date_to" @change="handleSearch" @click="($event.target).showPicker?.()" />
              </label>
            </div>
          </div>
          <div class="filter-actions-inline">
            <button class="btn btn-secondary" @click="handleReset">重置</button>
            <button class="btn btn-primary" @click="handleSearch">查询</button>
          </div>
        </div>
      </div>

      <!-- Data Table Card (AG Grid) -->
      <div class="table-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0;">
        <AgGridVue
          class="ag-theme-alpine detail-grid"
          :theme="'legacy'"
          :rowData="items"
          :columnDefs="detailColDefs"
          :defaultColDef="defaultColDef"
          style="width: 100%; flex: 1; min-height: 0;"
          :suppressScrollOnNewData="true"
        />
      </div>

      <!-- Pagination Footer FIXED TO BOTTOM RIGHT -->
      <div class="db-page-footer db-page-footer-bottom">
        <span class="db-page-size">
          Page Size:
          <select v-model="pageSize" class="page-size-select-simple" @change="handleSearch">
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
          </select>
        </span>
        <span class="db-page-summary">
          Showing {{ items.length === 0 ? 0 : (page - 1) * pageSize + 1 }} to {{ Math.min(page * pageSize, total) }} of {{ total }}
        </span>
        <button class="db-page-btn" :disabled="page <= 1" @click="page = 1; fetchData()">|&lt;</button>
        <button class="db-page-btn" :disabled="page <= 1" @click="page--; fetchData()">&lt;</button>
        <span class="db-page-current">Page {{ page }} of {{ maxPage }}</span>
        <button class="db-page-btn" :disabled="page >= maxPage" @click="page++; fetchData()">&gt;</button>
        <button class="db-page-btn" :disabled="page >= maxPage" @click="page = maxPage; fetchData()">&gt;|</button>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════
         DEVICE ANALYSIS DRILL-DOWN TAB
    ════════════════════════════════════════════════ -->
    <div v-show="activeView === 'device'" class="tab-content">
      <div class="filter-card ov-filter">
        <div class="ov-filter-row" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div class="ov-filter-item">
            <span style="font-size: 16px; font-weight: bold; color: #1e293b;">{{ deviceViewDevice }}</span>
            <span style="font-size: 12px; color: #64748b; margin-left: 10px;">基于总览的 {{ getFilterLabel() }} 筛选条件</span>
          </div>
          <div class="ov-filter-item" style="margin-right: 15px; display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 12px; font-weight: 600; color: #475569; margin: 0;">LOT</label>
            <input type="text" v-model="deviceLotQuery" placeholder="输入 LOT ID 筛选" class="filter-input input-lot" style="width: 150px; font-size: 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1;" />
          </div>
        </div>
      </div>

      <!-- Charts row -->
      <div class="charts-row" v-if="!deviceLoading">
        <div class="chart-card">
          <div class="chart-title">📈 LOT Bin1 平均良率趋势</div>
          <div ref="deviceYieldChartRef" class="echart-box"></div>
        </div>
        <div class="chart-card">
          <template v-if="!selectedLotId">
            <div class="chart-title">📦 {{ deviceViewDevice }} 产出 (Wafers/周)</div>
            <div ref="deviceOutputChartRef" class="echart-box"></div>
          </template>
          <template v-else>
            <div class="chart-title" style="display: flex; justify-content: space-between; align-items: center;">
              <span>📈 Wafer 良率趋势 ({{ selectedLotId }})</span>
              <button @click="selectedLotId = null" style="font-size: 11px; padding: 2px 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; border-radius: 4px; color: #475569;">返回产出图</button>
            </div>
            <div ref="waferYieldChartRef" class="echart-box"></div>
          </template>
        </div>
      </div>
      <div class="charts-row" v-else>
        <div class="chart-card skeleton-card"><div class="skeleton-shimmer"></div></div>
        <div class="chart-card skeleton-card"><div class="skeleton-shimmer"></div></div>
      </div>

      <!-- Device LOTs table (AG Grid) -->
      <div class="table-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
        <AgGridVue
          class="ag-theme-alpine"
          :theme="'legacy'"
          :rowData="filteredDeviceLots"
          :columnDefs="deviceColDefs"
          :defaultColDef="defaultColDef"
          style="width: 100%; flex: 1; min-height: 0;"
          :suppressScrollOnNewData="true"
          @cell-mouse-over="onCellMouseOver"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, shallowRef } from 'vue'

// ── Global Caches to prevent re-fetching on view swap ──
const globalOvLoaded = ref(false)
const globalRangeType = ref('month')
const globalRangeValue = ref(3)
const globalFilterSelection = ref('month-3')
const globalOvProducts = shallowRef<any[]>([])
const globalOvWeeklyOutput = ref<any[]>([])
const globalOvOsats = ref<any[]>([])

export default {
  name: 'DataAnalysisView'
}
</script>

<script setup lang="ts">
import { reactive, computed, onMounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import api from '@/api'
import { AgGridVue } from 'ag-grid-vue3'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

// Bind global cache
const ovLoaded = globalOvLoaded
const rangeType = globalRangeType
const rangeValue = globalRangeValue
const filterSelection = globalFilterSelection
const ovProducts = globalOvProducts
const ovWeeklyOutput = globalOvWeeklyOutput
const ovOsats = globalOvOsats

function onFilterSelectionChange() {
  const parts = filterSelection.value.split('-')
  rangeType.value = parts[0]
  if (parts.length > 1) {
    rangeValue.value = parseInt(parts[1], 10)
  } else {
    rangeValue.value = null
  }
  fetchOverview(true)
}

function getFilterLabel() {
  if (rangeType.value === 'month') return `${rangeValue.value}个月`
  if (rangeType.value === 'year') return `${rangeValue.value}年`
  if (rangeType.value === 'lot') return `${rangeValue.value} LOT`
  if (rangeType.value === 'all') return '全部'
  return ''
}

// ── View switching ───────────────────────────────────────────────────────────
const activeView = ref<'overview' | 'detail' | 'device'>('overview')
const deviceViewDevice = ref('')
const deviceViewOsat = ref('')
const deviceViewTester = ref('')

const ovProductName = ref('')
const deviceLotQuery = ref('')

let ovSearchTimer: any = null
function debouncedOverviewSearch() {
  if (ovSearchTimer) clearTimeout(ovSearchTimer)
  ovSearchTimer = setTimeout(() => {
    fetchOverview(true)
  }, 400)
}

const filteredDeviceLots = computed(() => {
  if (!deviceLotQuery.value) return deviceLots.value
  const q = deviceLotQuery.value.trim().toLowerCase()
  return deviceLots.value.filter((l: any) => 
    (l.lot_id || '').toLowerCase().includes(q)
  )
})

watch(deviceLotQuery, () => {
  nextTick(() => renderDeviceCharts())
})

function switchView(view: 'overview' | 'detail' | 'device') {
  activeView.value = view
  if (view === 'overview') {
    nextTick(() => renderOverviewCharts())
  } else if (view === 'device') {
    selectedLotId.value = null // Reset selected lot when entering device tab
    nextTick(() => renderDeviceCharts())
  }
}

if (typeof window !== 'undefined') {
  (window as any).goToDeviceDetail = (deviceName: string, osat?: string, tester?: string) => {
    deviceViewDevice.value = deviceName
    deviceViewOsat.value = osat || ''
    deviceViewTester.value = tester || ''
    switchView('device')
    fetchDeviceData()
  }
}

// ── AG Grid Common ───────────────────────────────────────────────────────────
const defaultColDef = {
  sortable: true,
  resizable: true,
  filter: false, // Turned off filter per user request
  suppressMovable: true,
  menuTabs: []
}

const YieldRenderer = (p: any) => {
  const val = p.value;
  if (val == null) return `<div style="width: 100%;"><span style="color: #64748b;">-</span></div>`;
  let color = 'green';
  let fw = 'normal';
  if (val < 80) { color = 'red'; fw = 'bold'; }
  else if (val < 95) { color = 'orange'; }
  return `<div style="width: 100%;"><span style="color: ${color}; font-weight: ${fw};">${val.toFixed(2)}%</span></div>`;
}

const SingleBinRenderer = (p: any) => {
  const bin = p.value;
  if (!bin) return '';
  return `<div style="display:flex; width: 100%; font-family: 'Courier New', Courier, monospace; font-size: 13px;">
      <span style="display:inline-block; width: 65px; font-weight: 600; color: #db2777; text-align: left;">${bin.bin}</span>
      <span style="display:inline-block; width: 55px; text-align: right;">${bin.count}</span>
      <span style="display:inline-block; width: 65px; color: #db2777; text-align: right;">${bin.pct}%</span>
    </div>`;
}

const DeviceLinkRenderer = (p: any) => {
  if (!p.value) return '';
  const osat = p.data ? (p.data.osat || '') : '';
  return `<button class="device-link" onclick="if(window.goToDeviceDetail) window.goToDeviceDetail('${p.value}', '${osat}')">${p.value}</button>`;
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

// ══════════════════════════════════════════════════════════════════
//  OVERVIEW STATE
// ══════════════════════════════════════════════════════════════════
const ovLoading = ref(false)
const outputChartRef = ref<HTMLElement | null>(null)
const pieChartRef   = ref<HTMLElement | null>(null)
const osatPieChartRef = ref<HTMLElement | null>(null)

let outputChart: any = null
let pieChart: any = null
let osatPieChart: any = null

const failBinCols = []
for(let i=0; i<5; i++) {
  failBinCols.push({
    colId: `fail_bin_${i}`,
    headerName: `Fail Bin ${i+1}`,
    valueGetter: (p: any) => p.data.top5_fail_bins ? p.data.top5_fail_bins[i] : null,
    cellRenderer: SingleBinRenderer,
    width: 200
  })
}

const ovColDefs = [
  { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 60, pinned: 'left' },
  { field: 'product_name', headerName: 'Device（产品名）', width: 180, pinned: 'left', cellRenderer: DeviceLinkRenderer },
  { field: 'osat', headerName: 'OSAT', width: 110, pinned: 'left' },
  { field: 'wafers', headerName: 'Wafers', width: 90, type: 'numericColumn' },
  { field: 'avg_wafer_time_h', headerName: 'Time(h)', width: 90, type: 'numericColumn' },
  { field: 'bin1_k', headerName: 'Bin1(K)', width: 90, type: 'numericColumn' },
  { field: 'avg_yield', headerName: '平均良率', width: 100, cellRenderer: YieldRenderer },
  ...failBinCols
]

async function fetchOverview(force = false) {
  if (ovLoaded.value && !force) {
    // Already loaded, just render charts
    nextTick(() => renderOverviewCharts())
    return
  }
  
  ovLoading.value = true
  try {
    const params: any = {
      range_type: rangeType.value,
      range_value: rangeType.value === 'all' ? null : rangeValue.value
    }
    if (ovProductName.value) {
      params.product_name = ovProductName.value
    }
    const resp: any = await api.get('/lots/mp-yield/overview', { params })
    ovProducts.value = resp.products || []
    ovWeeklyOutput.value = resp.weekly_output || []
    ovOsats.value = resp.osats || []
    ovLoaded.value = true
    nextTick(() => renderOverviewCharts())
  } catch (error) {
    console.error('Failed to fetch overview:', error)
  } finally {
    ovLoading.value = false
  }
}

function renderOverviewCharts() {
  if (activeView.value !== 'overview') return

  if (outputChartRef.value) {
    if (outputChart && outputChart.getDom() !== outputChartRef.value) { outputChart.dispose(); outputChart = null; }
    if (!outputChart) outputChart = echarts.init(outputChartRef.value)
    else outputChart.resize()
    
    const weeks  = ovWeeklyOutput.value.map((d: any) => d.week)
    const wafers = ovWeeklyOutput.value.map((d: any) => d.wafers)
    outputChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 16, top: 12, bottom: 40 },
      xAxis: { type: 'category', data: weeks, axisLabel: { fontSize: 11, rotate: weeks.length > 8 ? 30 : 0 } },
      yAxis: {
        type: 'value',
        name: 'Wafers',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 36,
        nameTextStyle: { fontSize: 11, color: '#6b7280' },
      },
      series: [{
        data: wafers, type: 'bar', barMaxWidth: 40,
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
        label: { show: wafers.length <= 20, position: 'top', fontSize: 10 }
      }]
    }, true)
  }

  if (pieChartRef.value) {
    if (pieChart && pieChart.getDom() !== pieChartRef.value) { pieChart.dispose(); pieChart = null; }
    if (!pieChart) pieChart = echarts.init(pieChartRef.value)
    else pieChart.resize()
    
    const totalBin1 = ovProducts.value.reduce((s: number, p: any) => s + (p.bin1_k || 0), 0)
    
    // 排序并限制前9个产品，第10个及以后合并为 others
    const sortedProducts = [...ovProducts.value]
      .filter((p: any) => p.bin1_k > 0)
      .sort((a: any, b: any) => b.bin1_k - a.bin1_k)

    const top9Data = sortedProducts.slice(0, 9).map((p: any, i: number) => ({
      name: p.product_name,
      value: p.bin1_k,
      itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
    }))

    const restSum = sortedProducts.slice(9).reduce((sum: number, p: any) => sum + p.bin1_k, 0)
    if (restSum > 0) {
      top9Data.push({
        name: 'others',
        value: restSum,
        itemStyle: { color: '#9e9e9e' },
      })
    }
    const pieData = top9Data

    pieChart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p: any) =>
          `${p.name}<br/>Bin1: <b>${p.value.toLocaleString()}K</b><br/>占比: <b>${p.percent}%</b>`,
      },
      legend: {
        orient: 'vertical',
        left: 0,
        width: 100,
        top: 'middle',
        itemGap: 5,
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { fontSize: 10 },
        formatter: (name: string) => {
          const item = pieData.find((p: any) => p.name === name)
          const pct = totalBin1 > 0 ? ((item?.value || 0) / totalBin1 * 100).toFixed(1) : '0'
          return `${name}  ${pct}%`
        },
      },
      series: [{
        type: 'pie',
        radius: ['35%', '85%'],
        center: ['67%', '50%'],
        data: pieData,
        label: {
          show: true,
          position: 'outside',
          formatter: '{b}',
          fontSize: 10,
        },
        labelLine: {
          show: true,
          length: 6,
          length2: 5,
        },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' },
          scale: true, scaleSize: 4,
        },
      }],
    }, true)
  }

  if (osatPieChartRef.value) {
    if (osatPieChart && osatPieChart.getDom() !== osatPieChartRef.value) { osatPieChart.dispose(); osatPieChart = null; }
    if (!osatPieChart) osatPieChart = echarts.init(osatPieChartRef.value)
    else osatPieChart.resize()
    
    const totalOsatBin1 = ovOsats.value.reduce((s: number, p: any) => s + (p.bin1_k || 0), 0)
    
    const sortedOsats = [...ovOsats.value]
      .filter((p: any) => p.bin1_k > 0)
      .sort((a: any, b: any) => b.bin1_k - a.bin1_k)

    const pieData = sortedOsats.map((p: any, i: number) => ({
      name: p.osat_name,
      value: p.bin1_k,
      itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
    }))

    osatPieChart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p: any) =>
          `${p.name}<br/>Bin1: <b>${p.value.toLocaleString()}K</b><br/>占比: <b>${p.percent}%</b>`,
      },
      legend: {
        orient: 'vertical',
        right: 4,
        top: 'middle',
        itemGap: 5,
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { fontSize: 10 },
        formatter: (name: string) => {
          const item = pieData.find((p: any) => p.name === name)
          const pct = totalOsatBin1 > 0 ? ((item?.value || 0) / totalOsatBin1 * 100).toFixed(1) : '0'
          return `${name}  ${pct}%`
        },
      },
      series: [{
        type: 'pie',
        radius: ['35%', '85%'],
        center: ['33%', '50%'],
        data: pieData,
        label: {
          show: true,
          position: 'outside',
          formatter: '{b}',
          fontSize: 10,
        },
        labelLine: {
          show: true,
          length: 6,
          length2: 5,
        },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' },
          scale: true, scaleSize: 4,
        },
      }],
    }, true)
  }
}

// ══════════════════════════════════════════════════════════════════
//  DETAIL STATE
// ══════════════════════════════════════════════════════════════════
const loading = ref(false)
const items = shallowRef<any[]>([])
const filters = reactive({
  osat_name: '',
  product_name: '',
  lot_id: '',
  wafer_id: '',
  program: '',
  test_date_from: '',
  test_date_to: ''
})

const total = ref(0)
const page = ref(1)
const pageSize = ref(50)

const detailColDefs = [
  { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 60, pinned: 'left' },
  { field: 'osat_name', headerName: 'OSAT', width: 90, pinned: 'left' },
  { field: 'product_name', headerName: 'Device', width: 140, pinned: 'left' },
  { field: 'lot_id', headerName: 'LOT ID', width: 140, pinned: 'left' },
  { field: 'wafer_id', headerName: 'WAFER ID', width: 100, pinned: 'left' },
  { field: 'total', headerName: 'TOTAL', width: 90, type: 'numericColumn' },
  { field: 'pass', headerName: 'PASS', width: 90, type: 'numericColumn' },
  { field: 'yield_rate', headerName: 'YIELD', width: 90, cellRenderer: YieldRenderer },
  { field: 'program', headerName: 'Test Program', width: 315 },
  { field: 'mp_tester', headerName: 'MP Tester', width: 110 },
  { field: 'probecard', headerName: 'Probe Card', width: 217 },
  { field: 'test_start', headerName: 'Test Start', width: 150 },
  { field: 'test_date', headerName: 'Test End', width: 150 },
  { field: 'duration_h', headerName: 'Time(h)', width: 90, type: 'numericColumn' }
]
for (let i = 1; i <= 130; i++) {
  detailColDefs.push({ 
    field: 'sbin' + i, 
    headerName: 'Sbin' + i, 
    width: 75,
    type: 'numericColumn',
    valueFormatter: (p: any) => p.value === 0 ? '' : p.value
  })
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = { page: page.value, page_size: pageSize.value }
    if (filters.osat_name) params.osat_name = filters.osat_name
    if (filters.product_name) params.product_name = filters.product_name
    if (filters.lot_id) params.lot_id = filters.lot_id
    if (filters.wafer_id) params.wafer_id = filters.wafer_id
    if (filters.program) params.program = filters.program
    if (filters.test_date_from) params.test_date_from = filters.test_date_from
    if (filters.test_date_to) params.test_date_to = filters.test_date_to

    const resp: any = await api.get('/lots/mp-yield/list', { params })
    items.value = resp.items || []
    total.value = resp.total || 0
  } catch (error) {
    console.error('Failed to fetch MP Yield list:', error)
  } finally {
    loading.value = false
  }
}

const maxPage = computed(() => Math.ceil(total.value / pageSize.value) || 1)

function handleSearch() {
  page.value = 1
  fetchData()
}

let searchTimeout: any;
function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    handleSearch();
  }, 300);
}

function handleReset() {
  filters.osat_name = ''
  filters.product_name = ''
  filters.lot_id = ''
  filters.wafer_id = ''
  filters.program = ''
  filters.test_date_from = ''
  filters.test_date_to = ''
  handleSearch()
}

// ══════════════════════════════════════════════════════════════════
//  DEVICE DRILL-DOWN STATE
// ══════════════════════════════════════════════════════════════════
const deviceLoading = ref(false)
const deviceLots = shallowRef<any[]>([])
const deviceWeeklyOutput = ref<any[]>([])
const deviceWafers = shallowRef<any[]>([]) // Store all wafer data for the active device
const selectedLotId = ref<string | null>(null) // Selected LOT ID for wafer-level drill-down
const productTop5Bins = ref<any[]>([]) // Top 5 failing bins for the active device
const selectedBins = ref<Record<string, boolean>>({}) // Legend selection states for charts

const deviceOutputChartRef = ref<HTMLElement | null>(null)
const deviceYieldChartRef = ref<HTMLElement | null>(null)
const waferYieldChartRef = ref<HTMLElement | null>(null) // Wafer yield chart DOM ref

let deviceOutputChart: any = null
let deviceYieldChart: any = null
let waferYieldChart: any = null // Wafer yield chart instance

const deviceColDefs = [
  { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 60, pinned: 'left' },
  { field: 'lot_id', headerName: 'LOT ID', width: 180, pinned: 'left' },
  { field: 'test_start', headerName: '测试时间(最早)', width: 160 },
  { field: 'wafers', headerName: 'Wafers', width: 90, type: 'numericColumn' },
  { field: 'avg_wafer_time_h', headerName: 'Time(h)', width: 90, type: 'numericColumn' },
  { field: 'bin1_k', headerName: 'Bin1(K)', width: 90, type: 'numericColumn' },
  { field: 'avg_yield', headerName: '平均良率', width: 100, cellRenderer: YieldRenderer },
  ...failBinCols
]

function getWeekString(dateStr: string) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'Unknown'
  const year = d.getFullYear()
  const firstDay = new Date(year, 0, 1)
  const pastDaysOfYear = (d.getTime() - firstDay.getTime()) / 86400000
  const weekNum = Math.ceil((pastDaysOfYear + firstDay.getDay() + 1) / 7)
  return `${year}-W${weekNum.toString().padStart(2, '0')}`
}

async function fetchDeviceData() {
  deviceLoading.value = true
  try {
    // Fetch ALL pages to correctly aggregate LOTs for this device
    let allWafers: any[] = []
    let p = 1
    let totalP = 1
    while (p <= totalP) {
        const params: any = { 
          product_name: deviceViewDevice.value,
          range_type: rangeType.value,
          range_value: rangeType.value === 'all' ? null : rangeValue.value,
          page: p,
          page_size: 200
        }
        if (deviceViewOsat.value) {
          params.osat_name = deviceViewOsat.value
        }
        if (deviceViewTester.value) {
          params.mp_tester = deviceViewTester.value
        }
        const resp: any = await api.get('/lots/mp-yield/list', { params })
        allWafers = allWafers.concat(resp.items || [])
        totalP = Math.ceil((resp.total || 0) / 200)
        p++
    }
    deviceWafers.value = allWafers // Store all wafers for wafer-level yield lookup

    // Compute overall top 5 failing bins for this device across all fetched wafers
    const overallSbinSums: Record<number, number> = {}
    for (const w of allWafers) {
      for (let i = 3; i <= 130; i++) {
        overallSbinSums[i] = (overallSbinSums[i] || 0) + (w['sbin' + i] || 0)
      }
    }
    const overallSbinArr = []
    for (let i = 3; i <= 130; i++) {
      if (overallSbinSums[i] > 0) {
        overallSbinArr.push({
          binNumber: i,
          bin: `Sbin${i}`,
          count: overallSbinSums[i]
        })
      }
    }
    overallSbinArr.sort((a, b) => b.count - a.count)
    productTop5Bins.value = overallSbinArr.slice(0, 5)

    // Initialize selectedBins: default only display '平均良率', 'Wafer良率' and Top 1 failing bin
    const initSelected: Record<string, boolean> = {
      '平均良率': true,
      'Wafer良率': true
    }
    productTop5Bins.value.forEach((topBin, idx) => {
      initSelected[topBin.bin] = (idx === 0)
    })
    selectedBins.value = initSelected

    // Group by LOT ID (合并 UCD 的子 LOT：若 OSAT 包含 UCD 且 lot_id 包含 #，按 # 前面的一致性合并)
    const lotGroups: Record<string, any[]> = {}
    const isUCD = deviceViewOsat.value && deviceViewOsat.value.toUpperCase().includes('UCD')
    for (const w of allWafers) {
      let lid = w.lot_id || 'Unknown'
      if (isUCD && lid.includes('#')) {
        lid = lid.split('#')[0]
      }
      if (!lotGroups[lid]) lotGroups[lid] = []
      lotGroups[lid].push(w)
    }

    const compiledLots = []
    const weeklyCount: Record<string, number> = {}

    for (const lot_id in lotGroups) {
      const wList = lotGroups[lot_id]
      let totalTime = 0
      let totalWafersWithTime = 0
      let totalBin1 = 0
      let totalPass = 0
      let totalTotal = 0
      const sbinSums: Record<number, number> = {}
      
      let minTestStart = ''

      for (const w of wList) {
        if (w.duration_h != null && w.duration_h > 0) {
          totalTime += w.duration_h
          totalWafersWithTime++
        }
        totalBin1 += (w.sbin1 || 0)
        totalPass += (w.pass || 0)
        totalTotal += (w.total || 0)
        
        for (let i=1; i<=130; i++) {
          sbinSums[i] = (sbinSums[i] || 0) + (w['sbin'+i] || 0)
        }

        const tStart = w.test_start || w.test_date || w.upload_date
        if (tStart) {
          if (!minTestStart || tStart < minTestStart) minTestStart = tStart
        }
      }

      const weekStr = getWeekString(minTestStart || new Date().toISOString())
      weeklyCount[weekStr] = (weeklyCount[weekStr] || 0) + wList.length

      const avgYield = totalTotal > 0 ? (totalPass / totalTotal) * 100 : 0
      const bin1k = totalBin1 / 1000

      const sbinArr = []
      for (let i=3; i<=130; i++) { 
        if (sbinSums[i] > 0) {
          sbinArr.push({
            bin: `Sbin${i}`,
            count: sbinSums[i],
            pct: totalTotal > 0 ? ((sbinSums[i] / totalTotal) * 100).toFixed(2) : '0.00'
          })
        }
      }
      sbinArr.sort((a, b) => b.count - a.count)

      const top5FailRates: Record<string, number> = {}
      for (const topBin of productTop5Bins.value) {
        const binVal = sbinSums[topBin.binNumber] || 0
        top5FailRates[topBin.bin] = totalTotal > 0 ? (binVal / totalTotal) * 100 : 0
      }

      compiledLots.push({
        lot_id: lot_id,
        wafers: wList.length,
        avg_wafer_time_h: totalWafersWithTime > 0 ? (totalTime / totalWafersWithTime).toFixed(2) : null,
        bin1_k: bin1k.toFixed(1),
        avg_yield: avgYield,
        top5_fail_bins: sbinArr.slice(0, 5),
        top5_fail_rates: top5FailRates,
        test_start: minTestStart
      })
    }
    
    compiledLots.sort((a, b) => {
      const tA = a.test_start || '';
      const tB = b.test_start || '';
      if (tA === tB) return 0;
      return tA > tB ? 1 : -1;
    })
    deviceLots.value = compiledLots

    const weeks = Object.keys(weeklyCount).sort()
    deviceWeeklyOutput.value = weeks.map(w => ({
      week: w,
      wafers: weeklyCount[w]
    }))

    nextTick(() => renderDeviceCharts())

  } catch (error) {
    console.error('Failed to fetch device drill-down data:', error)
  } finally {
    deviceLoading.value = false
  }
}

function renderDeviceCharts() {
  if (activeView.value !== 'device') return

  if (deviceOutputChartRef.value) {
    if (deviceOutputChart && deviceOutputChart.getDom() !== deviceOutputChartRef.value) { deviceOutputChart.dispose(); deviceOutputChart = null; }
    if (!deviceOutputChart) deviceOutputChart = echarts.init(deviceOutputChartRef.value)
    else deviceOutputChart.resize()
    
    const weeks  = deviceWeeklyOutput.value.map((d: any) => d.week)
    const wafers = deviceWeeklyOutput.value.map((d: any) => d.wafers)
    deviceOutputChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 16, top: 12, bottom: 40 },
      xAxis: { type: 'category', data: weeks, axisLabel: { fontSize: 11, rotate: weeks.length > 8 ? 30 : 0 } },
      yAxis: {
        type: 'value',
        name: 'Wafers',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 36,
        nameTextStyle: { fontSize: 11, color: '#6b7280' },
      },
      series: [{
        data: wafers, type: 'bar', barMaxWidth: 40,
        itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
        label: { show: wafers.length <= 20, position: 'top', fontSize: 10 }
      }]
    }, true)
  }

  if (deviceYieldChartRef.value) {
    if (deviceYieldChart && deviceYieldChart.getDom() !== deviceYieldChartRef.value) {
      deviceYieldChart.dispose()
      deviceYieldChart = null
    }
    if (!deviceYieldChart) {
      deviceYieldChart = echarts.init(deviceYieldChartRef.value)
    } else {
      deviceYieldChart.resize()
    }
    
    const lotsData = filteredDeviceLots.value
    const lotIds = lotsData.map(l => l.lot_id)
    const yields = lotsData.map(l => l.avg_yield.toFixed(2))

    // Listen to axis pointer updates to dynamically sync wafer yield chart on hover
    deviceYieldChart.off('updateAxisPointer')
    deviceYieldChart.on('updateAxisPointer', (event: any) => {
      const axesInfo = event.axesInfo
      if (axesInfo && axesInfo.length > 0) {
        const dataIndex = axesInfo[0].value
        if (typeof dataIndex === 'number' && dataIndex >= 0 && dataIndex < lotIds.length) {
          const hoveredLotId = lotIds[dataIndex]
          if (hoveredLotId && selectedLotId.value !== hoveredLotId) {
            selectedLotId.value = hoveredLotId
          }
        }
      }
    })

    let rightMax = 0
    const top1BinName = productTop5Bins.value[0]?.bin
    if (top1BinName) {
      for (const lot of lotsData) {
        const val = lot.top5_fail_rates?.[top1BinName] || 0
        if (val > rightMax) {
          rightMax = val
        }
      }
    }
    if (rightMax <= 0) {
      rightMax = 5
    }

    const series: any[] = [
      {
        name: '平均良率',
        data: yields,
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: '#f59e0b' },
        lineStyle: { width: 3 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(245, 158, 11, 0.2)' },
            { offset: 1, color: 'rgba(245, 158, 11, 0.02)' }
          ])
        },
        z: 10
      }
    ]

    const top5Colors = ['#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4']
    productTop5Bins.value.forEach((topBin, idx) => {
      const binName = topBin.bin
      const binData = lotsData.map(l => {
        const val = l.top5_fail_rates?.[binName]
        return val !== undefined ? parseFloat(val.toFixed(3)) : 0
      })

      series.push({
        name: binName,
        data: binData,
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        itemStyle: { color: top5Colors[idx] },
        showSymbol: false,
        lineStyle: { width: 1.5, type: 'dashed' }
      })
    })

    deviceYieldChart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          let html = `<b>${params[0].name}</b><br/>`;
          params.forEach((p: any) => {
            const val = parseFloat(p.value);
            if (p.seriesName === '平均良率') {
              html += `${p.marker} 平均良率: <b>${val.toFixed(2)}%</b><br/>`;
            } else {
              html += `${p.marker} ${p.seriesName} 失效: <b>${val.toFixed(3)}%</b><br/>`;
            }
          });
          return html;
        }
      },
      legend: {
        data: ['平均良率', ...productTop5Bins.value.map(b => b.bin)],
        selected: selectedBins.value,
        top: 0,
        textStyle: { fontSize: 11, color: '#374151' }
      },
      grid: { left: 50, right: 50, top: 35, bottom: 40 },
      xAxis: { type: 'category', data: lotIds, axisLabel: { fontSize: 11, rotate: 30 } },
      yAxis: [
        {
          type: 'value',
          min: 50,
          max: 100,
          interval: 10,
          axisLabel: { formatter: '{value}%' },
          nameTextStyle: { fontSize: 11, color: '#6b7280' },
        },
        {
          type: 'value',
          name: 'Top5失效',
          min: 0,
          max: rightMax,
          interval: rightMax / 5,
          axisLabel: {
            formatter: (val: number) => val.toFixed(2) + '%'
          },
          nameTextStyle: { fontSize: 11, color: '#6b7280' },
          splitLine: { show: false }
        }
      ],
      series: series
    }, true)

    // Listen to legend selections to dynamically synchronize with the wafer chart
    deviceYieldChart.off('legendselectchanged')
    deviceYieldChart.on('legendselectchanged', (event: any) => {
      selectedBins.value = { ...event.selected }
      if (waferYieldChart) {
        waferYieldChart.setOption({
          legend: {
            selected: selectedBins.value
          }
        })
      }
    })
  }
}

function renderWaferYieldChart() {
  if (activeView.value !== 'device' || !selectedLotId.value || !waferYieldChartRef.value) return

  if (waferYieldChart && waferYieldChart.getDom() !== waferYieldChartRef.value) {
    waferYieldChart.dispose()
    waferYieldChart = null
  }
  if (!waferYieldChart) {
    waferYieldChart = echarts.init(waferYieldChartRef.value)
  } else {
    waferYieldChart.resize()
  }

  // Filter wafer data belonging to the selected LOT (考虑 UCD 子 LOT 合并)
  const isUCD = deviceViewOsat.value && deviceViewOsat.value.toUpperCase().includes('UCD')
  const lotWafers = deviceWafers.value.filter((w: any) => {
    let lid = w.lot_id || ''
    if (isUCD && lid.includes('#')) {
      lid = lid.split('#')[0]
    }
    return lid === selectedLotId.value
  })

  // Map wafer data to fixed slots from 1 to 25
  const waferData = Array(25).fill(null)
  for (const w of lotWafers) {
    const wId = parseInt(w.wafer_id, 10)
    if (wId >= 1 && wId <= 25) {
      waferData[wId - 1] = w.yield_rate
    }
  }

  const top5WaferSeriesData: Record<string, (number | null)[]> = {}
  productTop5Bins.value.forEach(topBin => {
    top5WaferSeriesData[topBin.bin] = Array(25).fill(null)
  })

  for (const w of lotWafers) {
    const wId = parseInt(w.wafer_id, 10)
    if (wId >= 1 && wId <= 25) {
      productTop5Bins.value.forEach(topBin => {
        const binVal = w['sbin' + topBin.binNumber] || 0
        const totalVal = w.total || 0
        top5WaferSeriesData[topBin.bin][wId - 1] = totalVal > 0 ? (binVal / totalVal) * 100 : 0
      })
    }
  }

  let rightMax = 0
  const top1BinName = productTop5Bins.value[0]?.bin
  if (top1BinName && top5WaferSeriesData[top1BinName]) {
    top5WaferSeriesData[top1BinName].forEach(val => {
      if (val !== null && val > rightMax) {
        rightMax = val
      }
    })
  }
  if (rightMax <= 0) {
    rightMax = 5
  }

  const selectedLegend: Record<string, boolean> = {
    'Wafer良率': selectedBins.value['Wafer良率'] !== false
  }
  productTop5Bins.value.forEach((topBin) => {
    selectedLegend[topBin.bin] = (selectedBins.value[topBin.bin] === true)
  })

  const series: any[] = [
    {
      name: 'Wafer良率',
      data: waferData,
      type: 'line',
      smooth: true,
      yAxisIndex: 0,
      connectNulls: false,
      showSymbol: true,
      symbolSize: 6,
      itemStyle: { color: '#0ea5e9' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(14, 165, 233, 0.3)' },
          { offset: 1, color: 'rgba(14, 165, 233, 0.05)' }
        ])
      },
      z: 10
    }
  ]

  const top5Colors = ['#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4']
  productTop5Bins.value.forEach((topBin, idx) => {
    const binName = topBin.bin
    const binData = top5WaferSeriesData[binName]

    series.push({
      name: binName,
      data: binData,
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      connectNulls: false,
      showSymbol: false,
      itemStyle: { color: top5Colors[idx] },
      lineStyle: { width: 1.5, type: 'dashed' }
    })
  })

  const xAxisData = Array.from({ length: 25 }, (_, i) => i + 1)

  waferYieldChart.setOption({
    animation: false, // Disable render animation for instant loading feedback
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let html = `<b>Wafer ${params[0].name}</b><br/>`;
        let hasData = false;
        params.forEach((p: any) => {
          if (p.value !== null && p.value !== undefined) {
            hasData = true;
            const val = parseFloat(p.value);
            if (p.seriesName === 'Wafer良率') {
              html += `${p.marker} Wafer良率: <b>${val.toFixed(2)}%</b><br/>`;
            } else {
              html += `${p.marker} ${p.seriesName} 失效: <b>${val.toFixed(3)}%</b><br/>`;
            }
          }
        });
        if (!hasData) return `Wafer ${params[0].name}: No Data`;
        return html;
      }
    },
    legend: {
      data: ['Wafer良率', ...productTop5Bins.value.map(b => b.bin)],
      selected: selectedLegend,
      top: 0,
      textStyle: { fontSize: 11, color: '#374151' }
    },
    grid: { left: 50, right: 50, top: 35, bottom: 44 },
    xAxis: {
      type: 'category',
      data: xAxisData,
      name: selectedLotId.value,
      nameLocation: 'center',
      nameGap: 24,
      nameTextStyle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#475569'
      },
      axisLabel: {
        interval: 0, // Show all wafer labels 1-25
        fontSize: 9
      }
    },
    yAxis: [
      {
        type: 'value',
        min: 50,
        max: 100,
        interval: 10,
        axisLabel: { formatter: '{value}%' },
        nameTextStyle: { fontSize: 11, color: '#6b7280' }
      },
      {
        type: 'value',
        name: 'Top5失效',
        min: 0,
        max: rightMax,
        interval: rightMax / 5,
        axisLabel: {
          formatter: (val: number) => val.toFixed(2) + '%'
        },
        nameTextStyle: { fontSize: 11, color: '#6b7280' },
        splitLine: { show: false }
      }
    ],
    series: series
  }, true)

  // Listen to legend selections to dynamically synchronize with the device chart
  waferYieldChart.off('legendselectchanged')
  waferYieldChart.on('legendselectchanged', (event: any) => {
    selectedBins.value = { ...event.selected }
    if (deviceYieldChart) {
      deviceYieldChart.setOption({
        legend: {
          selected: selectedBins.value
        }
      })
    }
  })
}

// Watch selectedLotId to render appropriate charts
watch(selectedLotId, (newVal) => {
  nextTick(() => {
    if (newVal) {
      renderWaferYieldChart()
    } else {
      renderDeviceCharts()
    }
  })
})

// Sync wafer yield chart on hovering over AG Grid cells
function onCellMouseOver(event: any) {
  if (event && event.data && event.data.lot_id) {
    const hoveredLotId = event.data.lot_id
    if (selectedLotId.value !== hoveredLotId) {
      selectedLotId.value = hoveredLotId
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  LIFECYCLE
// ══════════════════════════════════════════════════════════════════
onMounted(() => {
  try {
    fetchOverview(false) // Will not fetch if already loaded
    fetchData()
  } catch (err) {
    console.error('Error in onMounted', err)
  }
  
  window.addEventListener('resize', () => {
    if (outputChart) outputChart.resize()
    if (pieChart) pieChart.resize()
    if (osatPieChart) osatPieChart.resize()
    if (deviceOutputChart) deviceOutputChart.resize()
    if (deviceYieldChart) deviceYieldChart.resize()
    if (waferYieldChart) waferYieldChart.resize()
  })
})
</script>

<style scoped>
.analysis-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f0f2f5;
  padding: 16px;
  gap: 16px;
  overflow: hidden;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.view-tabs {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.view-tab {
  padding: 8px 16px;
  border: 1px solid #d9d9d9;
  background: #ffffff;
  color: #595959;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.view-tab.active {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}

.view-tab:hover:not(.active) {
  color: #1890ff;
  border-color: #1890ff;
}

.filter-card {
  background: #ffffff;
  border-radius: 6px;
  padding: 12px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  flex-shrink: 0;
}

.filter-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.filter-item label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.filter-input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  color: #1f2937;
  outline: none;
}

.input-osat {
  width: 100px;
}

.input-device {
  width: 125px;
}

.input-lot {
  width: 125px;
}

.input-wafer {
  width: 100px;
}

.input-pgm {
  width: 225px;
}

.date-range-floating {
  display: flex;
  align-items: center;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  height: 28px;
  overflow: hidden;
}

.date-range-box {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 8px;
  cursor: pointer;
}

.date-range-value {
  font-size: 12px;
  color: #1f2937;
  white-space: nowrap;
}

.date-range-native {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.date-range-separator {
  color: #d9d9d9;
  font-size: 12px;
}

.btn {
  height: 28px;
  padding: 0 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.btn-primary {
  background: #1890ff;
  color: #fff;
}

.btn-primary:hover { background: #40a9ff; }

.btn-secondary {
  background: #ffffff;
  border-color: #d9d9d9;
  color: #374151;
}

.btn-secondary:hover { border-color: #1890ff; color: #1890ff; }

.filter-actions-inline {
  display: flex;
  gap: 8px;
  margin-left: 8px;
}

/* Overview specific */
.ov-filter-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.ov-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ov-filter-item label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0;
}

.filter-select-dropdown {
  padding: 4px 24px 4px 8px;
  font-size: 12px;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  outline: none;
  cursor: pointer;
  height: 30px;
  min-width: 120px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.filter-select-dropdown:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
}
.ov-filter-right { margin-left: auto; }

.charts-row {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
  height: 240px;
}

.chart-card {
  flex: 1;
  background: #ffffff;
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
}

.chart-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.echart-box { flex: 1; min-height: 0; }

.table-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  min-height: 0;
  overflow: hidden;
}

/* AG GRID Customizations */
:deep(.device-link) {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: #1890ff;
  font-size: 12px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}
:deep(.device-link:hover) { color: #40a9ff; }

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: #64748b;
  gap: 16px;
  height: 100%;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 4px solid #f3f4f6;
  border-top: 4px solid #1890ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { 100% { transform: rotate(360deg); } }

/* PAGE FOOTER TO BOTTOM RIGHT */
.db-page-footer-bottom {
  margin-top: 8px;
  background: transparent;
  box-shadow: none;
  border: none;
  justify-content: flex-end;
  font-size: 11px;
  color: #475569;
  height: 16px;
}

.db-page-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  flex-shrink: 0;
}

.page-size-select-simple {
  margin-left: 4px;
  padding: 0 2px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 10px;
  height: 16px;
}

.db-page-btn {
  min-width: 18px;
  height: 16px;
  line-height: 14px;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  padding: 0 4px;
}
.db-page-btn:disabled { color: #bfbfbf; cursor: not-allowed; background: #f5f5f5; }
.db-page-btn:hover:not(:disabled) { border-color: #1890ff; color: #1890ff; }

/* Detail Grid Customizations */
.detail-grid {
  --ag-font-size: 11px !important;
  --ag-row-height: 26px !important;
  --ag-header-height: 30px !important;
}

.skeleton-card { position: relative; overflow: hidden; }
.skeleton-shimmer {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer { 100% { background-position: -200% 0; } }
</style>
