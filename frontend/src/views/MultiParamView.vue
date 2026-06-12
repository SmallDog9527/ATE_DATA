<template>
  <div class="multi-param-view">
    <!-- 固定顶部：tab栏 + options栏 合并在同一个sticky容器中 -->
    <div class="sticky-header">
      <!-- Tab栏 -->
      <div class="tab-bar" v-if="tabs.length">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.title }}
          <span class="tab-close" @click.stop="closeTab(tab.id)">×</span>
        </div>
      </div>

      <!-- Options栏 -->
      <div class="options-bar" v-if="currentTab">
        <div class="options-left">
          <div class="nav-group">
            <button @click="prevParam">◀ PREV</button>
            <select v-model="currentParamName" @change="addTab">
              <option v-for="item in paramList" :key="item.item_name" :value="item.item_name">
                {{ item.item_number }}:{{ item.item_name }}
              </option>
            </select>
            <button @click="nextParam">NEXT ▶</button>
          </div>

          <div class="option-item">
            <label>Filter</label>
            <select :value="currentTab?.options.filter_type" @change="updateFilterType(($event.target as HTMLSelectElement).value)">
              <option value="all">All Data</option>
              <option value="robust">Robust Data</option>
              <option value="filter_by_limit">Filter By Limit</option>
              <option value="filter_by_sigma">Filter by Sigma</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div class="option-item" v-if="currentTab?.options.filter_type === 'filter_by_sigma'">
            <label>Sigma</label>
            <input v-model.number="sigmaInputValue" type="number" step="0.5" min="1" max="6" style="width:60px" />
            <button @click="applySigma">Apply</button>
          </div>

          <div class="option-item" v-if="currentTab?.options.filter_type === 'custom'">
            <label>Min</label>
            <input v-model.number="customMinInput" type="number" step="any" style="width:90px" />
            <label>Max</label>
            <input v-model.number="customMaxInput" type="number" step="any" style="width:90px" />
            <label>LL</label>
            <input v-model.number="customLLInput" type="number" step="any" style="width:90px" />
            <label>UL</label>
            <input v-model.number="customULInput" type="number" step="any" style="width:90px" />
            <button @click="applyCustomRange">Apply</button>
          </div>

          <div class="option-item">
            <label>DataRange</label>
            <label><input type="radio" :checked="currentTab?.options.data_range === 'final'" @change="updateOption('data_range', 'final')" /> Final</label>
            <label><input type="radio" :checked="currentTab?.options.data_range === 'original'" @change="updateOption('data_range', 'original')" /> Original</label>
          </div>

          <div class="option-item">
            <label>Mode</label>
            <label><input type="radio" :checked="currentTab?.options.histMode === 'lot'" @change="updateOption('histMode', 'lot')" /> LOT</label>
            <label>
              <input type="radio" :checked="currentTab?.options.histMode === 'single'" @change="updateOption('histMode', 'single')" /> Single
            </label>
            <input 
              v-if="currentTab?.options.histMode === 'single'"
              v-model="currentTab.options.single_lot_name" 
              class="single-name-input"
              title="Enter display name for Single mode"
              @change="updateOption('single_lot_name', currentTab.options.single_lot_name)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="tab-content" v-if="currentTab">
      <!-- 统计汇总表 -->
      <div class="stats-wrap" v-if="currentTab.data">
        <table class="stats-table">
          <thead>
            <tr>
              <th>LOT</th>
              <th>Exec Qty</th>
              <th>Failures</th>
              <th>Yield</th>
              <th>L.Limit</th>
              <th>U.Limit</th>
              <th>Min</th>
              <th>Max</th>
              <th>Mean</th>
              <th>Stdev</th>
              <th>CPK</th>
            </tr>
          </thead>
          <tbody v-if="currentTab?.options.histMode === 'single'">
            <tr>
              <td><span class="lot-dot" style="background: #333;"></span> {{ currentTab.options.single_lot_name || 'ALL' }}</td>
              <td>{{ currentTab.data.overall_stats?.exec_qty ?? '-' }}</td>
              <td>{{ currentTab.data.overall_stats?.fail_count ?? '-' }}</td>
              <td>{{ currentTab.data.overall_stats?.yield_rate != null ? (currentTab.data.overall_stats.yield_rate * 100).toFixed(2) + '%' : '-' }}</td>
              <td>{{ currentTab.data.lower_limit?.toFixed(4) ?? '-' }}</td>
              <td>{{ currentTab.data.upper_limit?.toFixed(4) ?? '-' }}</td>
              <td>{{ fmtNum(currentTab.data.overall_stats?.min_val) }}</td>
              <td>{{ fmtNum(currentTab.data.overall_stats?.max_val) }}</td>
              <td>{{ fmtNum(currentTab.data.overall_stats?.mean) }}</td>
              <td>{{ fmtNum(currentTab.data.overall_stats?.stdev) }}</td>
              <td :style="cpkStyle(currentTab.data.overall_stats?.cpk)">{{ fmtNum(currentTab.data.overall_stats?.cpk) }}</td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr v-for="(lot, idx) in currentTab.data.lots" :key="lot.lot_id">
              <td>
                <span class="lot-dot" :style="{ background: LOT_COLORS[idx % LOT_COLORS.length] }"></span>
                {{ getLotDisplayName(lot) }}
              </td>
              <td>{{ lot.stats?.exec_qty ?? '-' }}</td>
              <td>{{ lot.stats?.fail_count ?? '-' }}</td>
              <td>{{ lot.stats?.yield_rate != null ? (lot.stats.yield_rate * 100).toFixed(2) + '%' : '-' }}</td>
              <td>{{ currentTab.data.lower_limit?.toFixed(4) ?? '-' }}</td>
              <td>{{ currentTab.data.upper_limit?.toFixed(4) ?? '-' }}</td>
              <td>{{ fmtNum(lot.stats?.min_val) }}</td>
              <td>{{ fmtNum(lot.stats?.max_val) }}</td>
              <td>{{ fmtNum(lot.stats?.mean) }}</td>
              <td>{{ fmtNum(lot.stats?.stdev) }}</td>
              <td :style="cpkStyle(lot.stats?.cpk)">{{ fmtNum(lot.stats?.cpk) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 直方图 -->
      <div class="chart-wrap" v-if="currentTab.data">
        <div :ref="el => setChartRef(currentTab?.id, el)" style="width:600px;height:480px"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import api from '@/api'

const route = useRoute()
const lotIdsStr = route.query.lot_ids as string
const initialParam = ref(decodeURIComponent(route.query.param_name as string || ''))
const initialMode = route.query.mode === 'single' ? 'single' : 'lot'
const initialSingleLotName = (route.query.single_lot_name as string) || 'all_lots'
const initialLotDisplayNames = (() => {
  try {
    const raw = route.query.lot_display_names as string
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
})()

const paramList = ref<any[]>([])
const currentParamName = ref(initialParam.value)
const activeTab = ref('')
const tabCounter = ref(0)

const LOT_COLORS = ['#4dabf7', '#ff6b6b', '#69db7c', '#ffd43b', '#e599f7', '#ffa94d', '#74c0fc', '#a9e34b']

interface Tab {
  id: string
  title: string
  item_number: number | string
  param_name: string
  options: any
  data: any
  single_lot_name?: string
}

const tabs = ref<Tab[]>([])
const currentTab = computed(() => tabs.value.find(t => t.id === activeTab.value))

const draftOptions = ref({
  filter_type: 'all',
  data_range: 'final',
  sigma: 3,
  custom_min: null as number | null,
  custom_max: null as number | null,
  custom_ll: null as number | null,
  custom_ul: null as number | null,
  histMode: initialMode,
  single_lot_name: initialSingleLotName,
  lot_display_names: initialLotDisplayNames as Record<string, string>,
})

const sigmaInputValue = ref(draftOptions.value.sigma)
const customMinInput = ref<number | null>(null)
const customMaxInput = ref<number | null>(null)
const customLLInput = ref<number | null>(null)
const customULInput = ref<number | null>(null)

// ECharts实例管理
const chartInstances: Record<string, echarts.ECharts> = {}

watch(currentTab, (newTab) => {
  if (newTab) {
    sigmaInputValue.value = newTab.options.sigma
    customMinInput.value = newTab.options.custom_min
    customMaxInput.value = newTab.options.custom_max
    customLLInput.value = newTab.options.custom_ll
    customULInput.value = newTab.options.custom_ul
    currentParamName.value = newTab.param_name
  }
}, { immediate: true })

function setChartRef(tabId: string | undefined, el: any) {
  if (!tabId) return
  const key = `${tabId}_hist`
  if (el) {
    if (chartInstances[key]?.dispose) chartInstances[key].dispose()
    chartInstances[key] = echarts.init(el)
    nextTick(() => renderHist(tabId))
  } else {
    if (chartInstances[key]?.dispose) {
      chartInstances[key].dispose()
      delete chartInstances[key]
    }
  }
}

function getLotDisplayName(lot: any) {
  const custom = currentTab.value?.options?.lot_display_names?.[String(lot.lot_id)]
  if (custom) return custom
  if (lot?.lot_id_str && lot?.wafer_id) return `${lot.lot_id_str}-${lot.wafer_id}`
  return lot?.wafer_id || lot?.lot_id_str || lot?.filename
}

async function fetchParamList() {
  const firstId = lotIdsStr.split(',')[0]
  paramList.value = await api.get(`/analysis/lot/${firstId}/items`, { params: { site: 0 } })
}

async function fetchParamData(paramName: string, options: any) {
  return await api.get('/analysis/multi/param_hist', {
    params: {
      lot_ids: lotIdsStr,
      param_name: paramName,
      filter_type: options.filter_type,
      sigma: options.sigma,
      data_range: options.data_range,
      custom_min: options.filter_type === 'custom' ? options.custom_min : undefined,
      custom_max: options.filter_type === 'custom' ? options.custom_max : undefined,
      custom_ll: options.filter_type === 'custom' ? options.custom_ll : undefined,
      custom_ul: options.filter_type === 'custom' ? options.custom_ul : undefined,
    }
  })
}

async function addTab() {
  const paramName = currentParamName.value
  tabCounter.value++
  const tabId = `tab_${tabCounter.value}`
  const paramItem = paramList.value.find(p => p.item_name === paramName)
  const title = `${paramItem?.item_number ?? ''}:${paramName} #${tabCounter.value}`

  let optionsToUse
  if (currentTab.value) {
    optionsToUse = JSON.parse(JSON.stringify(currentTab.value.options))
    if (currentTab.value.param_name !== paramName) {
      optionsToUse.custom_min = null
      optionsToUse.custom_max = null
      optionsToUse.custom_ll = null
      optionsToUse.custom_ul = null
    }
  } else {
    optionsToUse = { ...draftOptions.value }
  }

  const newTab: Tab = {
    id: tabId,
    title,
    item_number: paramItem?.item_number ?? '',
    param_name: paramName,
    options: optionsToUse,
    data: null,
  }

  if (tabs.value.length >= 10) tabs.value.shift()
  if (optionsToUse.single_lot_name === undefined) {
    optionsToUse.single_lot_name = 'all_lots'
  }
  if (optionsToUse.lot_display_names === undefined) {
    optionsToUse.lot_display_names = initialLotDisplayNames
  }
  tabs.value.push(newTab)
  activeTab.value = tabId
  await loadTabData(tabId)
}

async function loadTabData(tabId: string) {
  const tab = tabs.value.find(t => t.id === tabId)
  if (!tab) return
  const data: any = await fetchParamData(tab.param_name, tab.options)
  tab.data = data

  if (tab.options.filter_type === 'custom' && tab.options.custom_min == null && tab.options.custom_max == null) {
    // 设置默认custom极值：找到所有LOT的全局最值
    let globalMin = Infinity
    let globalMax = -Infinity
    data.lots.forEach((lot: any) => {
      if (lot.stats?.min_val != null) globalMin = Math.min(globalMin, lot.stats.min_val)
      if (lot.stats?.max_val != null) globalMax = Math.max(globalMax, lot.stats.max_val)
    })
    if (globalMin !== Infinity) {
      tab.options.custom_min = globalMin
      tab.options.custom_max = globalMax
      customMinInput.value = globalMin
      customMaxInput.value = globalMax
    }
    tab.options.custom_ll = data.lower_limit
    tab.options.custom_ul = data.upper_limit
    customLLInput.value = data.lower_limit
    customULInput.value = data.upper_limit
  }

  await nextTick()
  renderHist(tabId)
}

function closeTab(tabId: string) {
  const idx = tabs.value.findIndex(t => t.id === tabId)
  tabs.value.splice(idx, 1)
  if (activeTab.value === tabId) {
    activeTab.value = tabs.value[tabs.value.length - 1]?.id ?? ''
  }
  const key = `${tabId}_hist`
  if (chartInstances[key]?.dispose) chartInstances[key].dispose()
  delete chartInstances[key]
}

async function updateOption(key: string, value: any) {
  if (!currentTab.value) return
  currentTab.value.options[key] = value
  if (key === 'histMode') {
    renderHist(currentTab.value.id)
  } else {
    await loadTabData(currentTab.value.id)
  }
}

async function updateFilterType(value: string) {
  if (!currentTab.value) return
  currentTab.value.options.filter_type = value
  if (value !== 'filter_by_sigma') {
    sigmaInputValue.value = draftOptions.value.sigma
  }
  if (value === 'custom' && currentTab.value.data) {
    let globalMin = Infinity
    let globalMax = -Infinity
    currentTab.value.data.lots.forEach((lot: any) => {
      if (lot.stats?.min_val != null) globalMin = Math.min(globalMin, lot.stats.min_val)
      if (lot.stats?.max_val != null) globalMax = Math.max(globalMax, lot.stats.max_val)
    })
    if (globalMin !== Infinity) {
      customMinInput.value = globalMin
      customMaxInput.value = globalMax
      currentTab.value.options.custom_min = globalMin
      currentTab.value.options.custom_max = globalMax
    }
    customLLInput.value = currentTab.value.data.lower_limit
    customULInput.value = currentTab.value.data.upper_limit
    currentTab.value.options.custom_ll = currentTab.value.data.lower_limit
    currentTab.value.options.custom_ul = currentTab.value.data.upper_limit
  }
  await loadTabData(currentTab.value.id)
}

function applySigma() {
  if (!currentTab.value) return
  currentTab.value.options.sigma = sigmaInputValue.value
  loadTabData(currentTab.value.id)
}

function applyCustomRange() {
  if (!currentTab.value) return
  currentTab.value.options.custom_min = customMinInput.value
  currentTab.value.options.custom_max = customMaxInput.value
  currentTab.value.options.custom_ll = customLLInput.value
  currentTab.value.options.custom_ul = customULInput.value
  loadTabData(currentTab.value.id)
}

function prevParam() {
  const idx = paramList.value.findIndex(p => p.item_name === currentParamName.value)
  if (idx > 0) { currentParamName.value = paramList.value[idx - 1].item_name; addTab() }
}

function nextParam() {
  const idx = paramList.value.findIndex(p => p.item_name === currentParamName.value)
  if (idx < paramList.value.length - 1) { currentParamName.value = paramList.value[idx + 1].item_name; addTab() }
}

function buildTicks(xMin: number, xMax: number, count: number): number[] {
  const step = (xMax - xMin) / (count - 1)
  return Array.from({ length: count }, (_, i) => xMin + i * step)
}

function calcHistXRange(
  dataMin: number, dataMax: number,
  ll: number | null, ul: number | null,
  edgesMin?: number, edgesMax?: number
): { xMin: number; xMax: number; ticks: number[] } {
  const hasLL = ll !== null && ll !== undefined
  const hasUL = ul !== null && ul !== undefined
  const hasBothLimits = hasLL && hasUL

  if (dataMin === dataMax && (!hasBothLimits || ll === ul)) {
    const center = dataMin
    const half = Math.abs(center) * 0.5 || 0.5
    const xMin = center - half
    const xMax = center + half
    const ticks = buildTicks(xMin, xMax, 11)
    return { xMin, xMax, ticks }
  }

  if (hasBothLimits && ll === ul) {
    const rangeMin = edgesMin ?? dataMin
    const rangeMax = edgesMax ?? dataMax
    const padding = (rangeMax - rangeMin) * 0.05 || Math.abs(rangeMax) * 0.01 || 0.1
    const xMin = rangeMin - padding
    const xMax = rangeMax + padding
    const ticks = buildTicks(xMin, xMax, 11)
    return { xMin, xMax, ticks }
  }

  if (hasBothLimits) {
    const effMin = edgesMin ?? dataMin
    const effMax = edgesMax ?? dataMax
    const dataExceedsLimit = effMin < ll! || effMax > ul!

    if (!dataExceedsLimit) {
      const range = (ul! - ll!) / 0.8
      const xMin = ll! - range * 0.1
      const xMax = ul! + range * 0.1
      const ticks = buildTicks(xMin, xMax, 11)
      return { xMin, xMax, ticks }
    } else {
      const limitRange = ul! - ll!
      const totalRange = limitRange / 0.6
      const center = (ll! + ul!) / 2
      let xMin = center - totalRange / 2
      let xMax = center + totalRange / 2

      if (effMin < xMin) xMin = effMin - (effMin === ll! ? limitRange * 0.05 : (ll! - effMin) * 0.1)
      if (effMax > xMax) xMax = effMax + (effMax === ul! ? limitRange * 0.05 : (effMax - ul!) * 0.1)

      const ticks = buildTicks(xMin, xMax, 11)
      return { xMin, xMax, ticks }
    }
  }

  if (hasLL || hasUL) {
    const effMin = edgesMin ?? dataMin
    const effMax = edgesMax ?? dataMax
    const rangeMin = hasLL ? Math.min(effMin, ll!) : effMin
    const rangeMax = hasUL ? Math.max(effMax, ul!) : effMax
    const padding = (rangeMax - rangeMin) * 0.05 || Math.abs(rangeMax) * 0.01 || 0.1
    const xMin = rangeMin - padding
    const xMax = rangeMax + padding
    const ticks = buildTicks(xMin, xMax, 11)
    return { xMin, xMax, ticks }
  }

  const effMin = edgesMin ?? dataMin
  const effMax = edgesMax ?? dataMax
  const padding = (effMax - effMin) * 0.05 || Math.abs(effMax) * 0.01 || 0.1
  const xMin = effMin - padding
  const xMax = effMax + padding
  const ticks = buildTicks(xMin, xMax, 11)
  return { xMin, xMax, ticks }
}

function renderHist(tabId: string) {
  const tab = tabs.value.find(t => t.id === tabId)
  if (!tab?.data) return
  const chart = chartInstances[`${tabId}_hist`]
  if (!chart) return

  const {
    param_name, unit, lower_limit: ll, upper_limit: ul,
    global_edges, exceeds_limit, ll_bin_index, ul_bin_index, lots
  } = tab.data
  const edges: number[] = global_edges ?? []
  if (edges.length < 2) return

  const numBins = edges.length - 1
  let series: any[] = []
  
  let globalMin = Infinity
  let globalMax = -Infinity
  let sumMean = 0
  let sumStdev = 0
  let countValid = 0

  lots.forEach((lot: any) => {
    if (lot.stats?.min_val != null) globalMin = Math.min(globalMin, lot.stats.min_val)
    if (lot.stats?.max_val != null) globalMax = Math.max(globalMax, lot.stats.max_val)
    if (lot.stats?.mean != null && lot.stats?.stdev != null) {
      sumMean += lot.stats.mean
      sumStdev += lot.stats.stdev
      countValid++
    }
  })
  
  const avgMean = countValid > 0 ? sumMean / countValid : null
  const avgStdev = countValid > 0 ? sumStdev / countValid : null

  if (exceeds_limit && ll_bin_index != null && ul_bin_index != null) {
    // ═══ 超限模式：category 轴 ═══
    const binLabels: string[] = []
    for (let i = 0; i < numBins; i++) {
      binLabels.push(((edges[i] + edges[i + 1]) / 2).toFixed(3))
    }

    if (tab.options.histMode === 'lot') {
      lots.forEach((lot: any, idx: number) => {
        const sigma6L = lot.stats?.mean != null && lot.stats?.stdev != null ? lot.stats.mean - 6 * lot.stats.stdev : -Infinity
        const sigma6U = lot.stats?.mean != null && lot.stats?.stdev != null ? lot.stats.mean + 6 * lot.stats.stdev : Infinity
        
        const normalData = lot.counts.map((cnt: number, i: number) => {
          const center = (edges[i] + edges[i + 1]) / 2
          if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return '-'
          return cnt
        })
        const outlierData = lot.counts.map((cnt: number, i: number) => {
          const center = (edges[i] + edges[i + 1]) / 2
          if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return cnt
          return '-'
        })

        series.push({
          type: 'bar',
          name: getLotDisplayName(lot),
          data: normalData,
          itemStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], opacity: 0.7 },
          barGap: '-100%',
          barWidth: '90%',
        })

        if (outlierData.some((d: any) => d !== '-')) {
          series.push({
            type: 'bar',
            name: getLotDisplayName(lot),
            data: outlierData,
            itemStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], opacity: 0.7 },
            barGap: '-100%',
            barWidth: '90%',
            barMinHeight: 5,
          })
        }
      })
    } else {
      const combinedCounts = new Array(numBins).fill(0)
      lots.forEach((lot: any) => {
        lot.counts.forEach((cnt: number, i: number) => { combinedCounts[i] += cnt })
      })
      const sigma6L = avgMean != null && avgStdev != null ? avgMean - 6 * avgStdev : -Infinity
      const sigma6U = avgMean != null && avgStdev != null ? avgMean + 6 * avgStdev : Infinity

      const normalData = combinedCounts.map((cnt: number, i: number) => {
        const center = (edges[i] + edges[i + 1]) / 2
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return '-'
        return cnt
      })
      const outlierData = combinedCounts.map((cnt: number, i: number) => {
        const center = (edges[i] + edges[i + 1]) / 2
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return cnt
        return '-'
      })
      
      series.push({
        type: 'bar',
        name: tab.options.single_lot_name || 'All LOTs',
        data: normalData,
        itemStyle: { color: '#4dabf7', opacity: 0.8 },
        barGap: '-100%',
        barWidth: '90%',
      })
      if (outlierData.some((d: any) => d !== '-')) {
        series.push({
          type: 'bar',
          name: tab.options.single_lot_name || 'All LOTs',
          data: outlierData,
          itemStyle: { color: '#4dabf7', opacity: 0.8 },
          barGap: '-100%',
          barWidth: '90%',
          barMinHeight: 5,
        })
      }
    }

    const markLineData: any[] = []
    if (ll !== null && ll !== undefined) {
      markLineData.push({
        xAxis: ll_bin_index,
        label: { formatter: `LL:${ll.toFixed(4)}`, position: 'middle', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }
    if (ul !== null && ul !== undefined) {
      markLineData.push({
        xAxis: ul_bin_index,
        label: { formatter: `UL:${ul.toFixed(4)}`, position: 'middle', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }

    if (tab.options.filter_type === 'filter_by_sigma' && avgMean != null && avgStdev != null) {
      const n = tab.options.sigma ?? 3
      const sigmaL = avgMean - n * avgStdev
      const sigmaU = avgMean + n * avgStdev
      const findBinIndex = (val: number) => {
        for (let i = 0; i < numBins; i++) {
          if (val >= edges[i] && val < edges[i + 1]) return i
        }
        return val < edges[0] ? 0 : numBins - 1
      }
      markLineData.push({
        xAxis: findBinIndex(sigmaL),
        label: { formatter: `${n}σL`, position: '70%', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: '#00c853', rotate: 0 },
        lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
      })
      markLineData.push({
        xAxis: findBinIndex(sigmaU),
        label: { formatter: `${n}σU`, position: '70%', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: '#00c853', rotate: 0 },
        lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
      })
    }

    if (series.length > 0) {
      series[0].markLine = { silent: true, symbol: 'none', animation: false, data: markLineData }
    }

    const labelPositions = new Set<number>([0, numBins - 1, ll_bin_index, ul_bin_index])
    const midStep = Math.max(1, Math.floor((ul_bin_index - ll_bin_index) / 4))
    for (let i = ll_bin_index; i <= ul_bin_index; i += midStep) labelPositions.add(i)
    if (ll_bin_index > 2) labelPositions.add(Math.floor(ll_bin_index / 2))
    if (numBins - ul_bin_index > 2) labelPositions.add(ul_bin_index + Math.floor((numBins - ul_bin_index) / 2))

    chart.setOption({
      title: { 
        text: `${tab.item_number}.${param_name}`, 
        left: 'center', 
        textStyle: { fontSize: 13 },
        subtext: tab.options.histMode === 'single' && tab.data.overall_stats 
          ? `Min=${fmtNum(tab.data.overall_stats.min_val)} Max=${fmtNum(tab.data.overall_stats.max_val)} Mean=${fmtNum(tab.data.overall_stats.mean)} Stdev=${fmtNum(tab.data.overall_stats.stdev)} CPK=${fmtNum(tab.data.overall_stats.cpk)}`
          : ''
      },
      grid: { bottom: 110, top: tab.options.histMode === 'single' ? 80 : 60 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params || params.length === 0) return ''
          const idx = params[0].dataIndex
          const lo = edges[idx]?.toFixed(4) ?? ''
          const hi = edges[idx + 1]?.toFixed(4) ?? ''
          let tip = `<div style="font-size:11px">[${lo}, ${hi})</div>`
          params.forEach((p: any) => {
            if (p.value > 0) tip += `<div>${p.marker} ${p.seriesName}: ${p.value}</div>`
          })
          return tip
        },
      },
      legend: { bottom: 5, data: tab.options.histMode === 'lot' ? lots.map((l:any)=>getLotDisplayName(l)) : [tab.options.single_lot_name || 'All LOTs'] },
      xAxis: {
        type: 'category',
        data: binLabels,
        name: unit,
        axisLine: { onZero: false, show: false },
        axisTick: { alignWithLabel: true, show: true },
        splitLine: { show: true, lineStyle: { type: 'dashed' } },
        axisLabel: {
          rotate: 30, fontSize: 10, interval: 0,
          formatter: (_: string, index: number) => {
            if (labelPositions.has(index)) {
              if (index === ll_bin_index && ll != null) return `LL:${ll.toFixed(4)}`
              if (index === ul_bin_index && ul != null) return `UL:${ul.toFixed(4)}`
              return edges[index]?.toFixed(3) ?? ''
            }
            return ''
          },
        },
      },
      yAxis: {
        type: 'value', name: 'Parts', nameLocation: 'middle', nameRotate: 90, nameGap: 40,
        axisLine: { show: true, onZero: false, lineStyle: { color: '#333' } },
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      series,
    }, true)
  } else {
    // ═══ 正常模式：value 轴 ═══
    const dataMin = globalMin !== Infinity ? globalMin : edges[0]
    const dataMax = globalMax !== -Infinity ? globalMax : edges[edges.length - 1]
    const { xMin, xMax, ticks } = calcHistXRange(dataMin, dataMax, ll, ul, edges[0], edges[edges.length - 1])

    const binCenters = edges.slice(0, -1).map((e: number, i: number) => (e + edges[i + 1]) / 2)
    const xRange = xMax - xMin
    const binW = edges[1] - edges[0]
    const barWidthPct = Math.max(8, (binW / xRange) * 700)

    if (tab.options.histMode === 'lot') {
      lots.forEach((lot: any, idx: number) => {
        const sigma6L = lot.stats?.mean != null && lot.stats?.stdev != null ? lot.stats.mean - 6 * lot.stats.stdev : -Infinity
        const sigma6U = lot.stats?.mean != null && lot.stats?.stdev != null ? lot.stats.mean + 6 * lot.stats.stdev : Infinity

        const normalData: any[] = []
        const outlierData: any[] = []
        
        lot.counts.forEach((cnt: number, i: number) => {
          const center = binCenters[i]
          if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) {
            outlierData.push([binCenters[i], cnt])
          } else {
            normalData.push([binCenters[i], cnt])
          }
        })

        series.push({
          type: 'bar', name: getLotDisplayName(lot), data: normalData,
          itemStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], opacity: 0.7 },
          barGap: '-100%', barWidth: barWidthPct,
        })
        if (outlierData.length > 0) {
          series.push({
            type: 'bar', name: getLotDisplayName(lot), data: outlierData,
            itemStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], opacity: 0.7 },
            barGap: '-100%', barWidth: barWidthPct, barMinHeight: 5,
          })
        }
      })
    } else {
      const combinedCounts = new Array(numBins).fill(0)
      lots.forEach((lot: any) => {
        lot.counts.forEach((cnt: number, i: number) => { combinedCounts[i] += cnt })
      })
      const sigma6L = avgMean != null && avgStdev != null ? avgMean - 6 * avgStdev : -Infinity
      const sigma6U = avgMean != null && avgStdev != null ? avgMean + 6 * avgStdev : Infinity

      const normalData: any[] = []
      const outlierData: any[] = []
      combinedCounts.forEach((cnt: number, i: number) => {
        const center = binCenters[i]
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) {
          outlierData.push([binCenters[i], cnt])
        } else {
          normalData.push([binCenters[i], cnt])
        }
      })
      series.push({
        type: 'bar', name: tab.options.single_lot_name || 'All LOTs', data: normalData,
        itemStyle: { color: '#4dabf7', opacity: 0.8 }, barWidth: barWidthPct,
      })
      if (outlierData.length > 0) {
        series.push({
          type: 'bar', name: tab.options.single_lot_name || 'All LOTs', data: outlierData,
          itemStyle: { color: '#4dabf7', opacity: 0.8 }, barWidth: barWidthPct, barMinHeight: 5,
        })
      }
    }

    const markLineData: any[] = []
    if (ll !== null && ll !== undefined) {
      markLineData.push({
        xAxis: ll,
        label: { formatter: `LL:${ll.toFixed(4)}`, position: 'middle', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }
    if (ul !== null && ul !== undefined) {
      markLineData.push({
        xAxis: ul,
        label: { formatter: `UL:${ul.toFixed(4)}`, position: 'middle', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }

    if (tab.options.filter_type === 'filter_by_sigma' && avgMean != null && avgStdev != null) {
      const n = tab.options.sigma ?? 3
      const sigmaL = avgMean - n * avgStdev
      const sigmaU = avgMean + n * avgStdev
      markLineData.push({
        xAxis: sigmaL,
        label: { formatter: `${n}σL`, position: '70%', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: '#00c853', rotate: 0 },
        lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
      })
      markLineData.push({
        xAxis: sigmaU,
        label: { formatter: `${n}σU`, position: '70%', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: '#00c853', rotate: 0 },
        lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
      })
    }

    if (series.length > 0) {
      series[0].markLine = { silent: true, symbol: 'none', animation: false, data: markLineData }
    }

    chart.setOption({
      title: { 
        text: `${tab.item_number}.${param_name}`, 
        left: 'center', 
        textStyle: { fontSize: 13 },
        subtext: tab.options.histMode === 'single' && tab.data.overall_stats 
          ? `Min=${fmtNum(tab.data.overall_stats.min_val)} Max=${fmtNum(tab.data.overall_stats.max_val)} Mean=${fmtNum(tab.data.overall_stats.mean)} Stdev=${fmtNum(tab.data.overall_stats.stdev)} CPK=${fmtNum(tab.data.overall_stats.cpk)}`
          : ''
      },
      grid: { bottom: 110, top: tab.options.histMode === 'single' ? 80 : 60 },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 5, type: 'scroll', data: tab.options.histMode === 'lot' ? lots.map((l:any)=>getLotDisplayName(l)) : [tab.options.single_lot_name || 'All LOTs'] },
      xAxis: {
        type: 'value', name: unit, min: xMin, max: xMax, interval: (xMax - xMin) / 10,
        axisLine: { onZero: false, show: false }, axisTick: { show: true },
        splitLine: { show: true, lineStyle: { type: 'dashed' } },
        axisLabel: {
          rotate: 30, fontSize: 10,
          formatter: (v: number) => {
            const isOnTick = ticks.some(t => Math.abs(t - v) < (xMax - xMin) / 100)
            return isOnTick ? v.toFixed(3) : ''
          },
        },
      },
      yAxis: {
        type: 'value', name: 'Parts', nameLocation: 'middle', nameRotate: 90, nameGap: 40,
        axisLine: { show: true, onZero: false, lineStyle: { color: '#333' } },
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      series,
    }, true)
  }
}

function fmtNum(v: number | null | undefined) {
  if (v === null || v === undefined) return '-'
  return v.toFixed(4)
}

function cpkStyle(v: number | null | undefined) {
  if (v === null || v === undefined) return {}
  if (v < 1.0) return { color: 'red', fontWeight: 'bold' }
  if (v < 1.33) return { color: 'orange' }
  return {}
}

onMounted(async () => {
  await fetchParamList()
  if (!currentParamName.value && paramList.value.length) {
    currentParamName.value = paramList.value[0].item_name
  }
  await addTab()
})
</script>

<style scoped>
.multi-param-view {
  /* 成为自身的滚动容器，sticky相对于此容器生效 */
  height: 100%;
  overflow-y: auto;
  overflow-x: auto;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}

/* ── 单一sticky容器，包含tab栏和options栏 ── */
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #f0f2f5;
  flex-shrink: 0;
}

/* Tab栏 */
.tab-bar {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 10px 12px 4px 12px;
}
.tab {
  background: white;
  border: 1px solid #d9d9d9;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}
.tab.active {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}
.tab-close {
  cursor: pointer;
  font-size: 16px;
  color: #999;
  line-height: 1;
}
.tab-close:hover { color: #ff4d4f; }

/* Options栏 */
.options-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  background: white;
  padding: 8px 12px;
  border-top: 1px solid #e8e8e8;
  border-bottom: 1px solid #e8e8e8;
}
.options-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.nav-group { display: flex; align-items: center; gap: 6px; }
.nav-group button {
  padding: 4px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}
.nav-group select {
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  max-width: 300px;
}

.option-item { display: flex; align-items: center; gap: 6px; }
.option-item label { color: #666; }
.option-item select, .option-item input[type="number"], .single-name-input {
  padding: 3px 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}
.single-name-input {
  width: 80px;
  margin-left: -4px;
  border-color: #eee;
  color: #1890ff;
  font-weight: 500;
}
.single-name-input:hover, .single-name-input:focus {
  border-color: #40a9ff;
  outline: none;
}
.option-item button {
  padding: 3px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}

/* 内容区 */
.tab-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: white;
  border-radius: 6px;
  margin: 10px 12px 12px 12px;
  padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.stats-wrap {
  overflow-x: auto;
  flex-shrink: 0;
  width: 840px;
}

.stats-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.stats-table th, .stats-table td {
  border: 1px solid #f0f0f0;
  padding: 5px 10px;
  text-align: center;
  white-space: nowrap;
}
.stats-table th { background: #fafafa; color: #666; }

.lot-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 5px;
  vertical-align: middle;
}

.chart-wrap {
  padding: 8px 0;
}
</style>
