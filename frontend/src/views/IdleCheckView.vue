<template>
  <div class="idle-check-view">
    <div class="header-bar">
      <div class="title">
        <h2>Idle Check / Site Corr 分析</h2>
        <span class="subtitle">LOT: {{ lotInfo?.filename }} | 程序: {{ checkData?.program }}</span>
      </div>

      <div class="mode-switcher">
        <button :class="['mode-tab-btn', { active: activeMode === 'idle_check' }]" @click="activeMode = 'idle_check'">
          🔍 空测指纹分析
        </button>
        <button :class="['mode-tab-btn', { active: activeMode === 'site_corr' }]" @click="switchToSiteCorr">
          📊 site_corr检查
        </button>
      </div>

      <!-- 空测模式 Header 工具栏 -->
      <div class="actions" v-if="activeMode === 'idle_check'">
        <div class="threshold-input">
          <label>阈值:</label>
          <input type="number" v-model.number="threshold" min="2" @change="fetchData" />
        </div>
        <div class="filter-options">
          <label class="radio-label" :class="{ active: dataFilter === 'all' }">
            <input type="radio" value="all" v-model="dataFilter" @change="fetchData" /> ALL_DATA
          </label>
          <label class="radio-label" :class="{ active: dataFilter === 'pass_only' }">
            <input type="radio" value="pass_only" v-model="dataFilter" @change="fetchData" /> Bin1+2 (Pass Only)
          </label>
        </div>
        <div class="algorithm-box">
          <button class="btn btn-random" @click="handleRandomAlgo">🎲 随机算法</button>
          <div class="formula-display" v-if="checkData?.params">
            <span class="formula-label">当前公式:</span>
            <code>Σ(P[i] * W[i])</code>
            <div class="formula-detail" v-if="showFormula">
               <div v-for="(p, i) in checkData.params" :key="p" class="formula-item">
                 {{ p }} * <b>{{ checkData.weights[i] }}</b>
               </div>
            </div>
            <span class="formula-toggle" @click="showFormula = !showFormula">
              {{ showFormula ? '收起' : '查看详情' }}
            </span>
          </div>
        </div>
        <button class="btn btn-download" @click="handleExport" :disabled="alarmCount === 0">
          ⬇ 下载报警数据
        </button>
        <button class="btn btn-corr" @click="handleCorrProcessing" :disabled="processingCorr" title="跨Site指纹对齐并保存为新数据">
          {{ processingCorr ? '处理中...' : 'Corr处理' }}
        </button>
        <button class="btn btn-settings" @click="openSettings">
          ⚙️ 设置
        </button>
      </div>
    </div>

    <!-- 1. 空测分析视图 -->
    <div v-if="activeMode === 'idle_check'" class="main-content" :class="{ 'no-map': !hasCoordinates }">
      <div class="chart-section">
        <div class="chart-header">
          <span>指纹值变化 (Fingerprint Scatter)</span>
          <div class="legend">
            <span class="legend-item"><i class="dot normal"></i> 正常</span>
            <span class="legend-item"><i class="dot alarm"></i> 报警 (连续重复)</span>
          </div>
        </div>
        <div ref="scatterChart" class="chart-container"></div>
      </div>

      <div class="map-section" v-if="hasCoordinates">
        <div class="chart-header">Wafer Map (红色表示异常)</div>
        <div class="map-container" style="position:relative">
          <canvas ref="waferMapCanvas" width="960" height="960" class="wafer-map-canvas"></canvas>
          <div ref="waferMapTooltip" class="map-tooltip" style="display:none"></div>
        </div>
      </div>

      <div class="list-section">
        <div class="chart-header">数据序列详情</div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Index</th>
                <th v-if="checkData?.has_sites">Site</th>
                <th v-if="hasCoordinates">X</th>
                <th v-if="hasCoordinates">Y</th>
                <th>Fingerprint</th>
                <th @click="toggleListFilter" class="clickable-header" title="点击切换过滤状态">
                  状态 ({{ listFilterLabel }} 🔄)
                </th>
              </tr>
            </thead>
            <tbody>
            <tr v-for="item in filteredListData" 
                :key="item.index" 
                :id="`row-${item.index}`"
                :class="{ 'row-alarm': item.is_alarm }">
                <td>{{ item.index + 1 }}</td>
                <td v-if="checkData?.has_sites">{{ item.SITE_NUM }}</td>
                <td v-if="hasCoordinates">{{ item.X_COORD }}</td>
                <td v-if="hasCoordinates">{{ item.Y_COORD }}</td>
                <td>{{ item.fingerprint?.toFixed(4) }}</td>
                <td>
                  <span v-if="item.is_alarm" class="badge-alarm">报警</span>
                  <span v-else class="badge-normal">正常</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 2. Site 校验与全 Set 折线分析 -->
    <div v-if="activeMode === 'site_corr'" class="site-corr-view">
      <div class="corr-toolbar">
        <div class="group-select-box">
          <span class="label">Site 分组:</span>
          <button :class="['grp-btn', { active: selectedGroup === 'group1' }]" @click="changeGroup('group1')">
            Group 1 (Site 1~16)
          </button>
          <button :class="['grp-btn', { active: selectedGroup === 'group2' }]" @click="changeGroup('group2')">
            Group 2 (Site 17~32)
          </button>
          <button :class="['grp-btn', { active: selectedGroup === 'all' }]" @click="changeGroup('all')">
            全 Set (Site 1~32)
          </button>
        </div>

        <div class="param-switch-box">
          <button class="param-arrow" @click="prevParam" title="上一个参数">‹</button>
          <select v-model="selectedCorrParam" @change="renderCorrCharts" class="corr-select param-select">
            <option v-for="p in siteCorrData?.test_params" :key="p" :value="p">
              {{ paramLabelWithUnit(p) }}
            </option>
          </select>
          <button class="param-arrow" @click="nextParam" title="下一个参数">›</button>
        </div>

        <div class="site-filter-box">
          <span class="label">Site 显示:</span>
          <button
            class="btn btn-xs site-all-btn"
            :class="{ active: isAllSitesSelected }"
            @click="selectAllSites"
          >
            ALL
          </button>
        </div>
      </div>

      <div class="corr-summary-bar">
        <span class="summary-chip">已对齐 {{ currentGroupChips.length }} 颗公共 Sample</span>
        <span class="summary-fp">指纹: {{ fingerprintLabel }}</span>
        <span class="summary-deleted" v-if="hiddenChipNos.length">
          已隐藏 Sample: {{ hiddenChipNos.join(', ') }}
        </span>
        <div class="axis-mode-box">
          <span class="label">Y 轴范围:</span>
          <button
            :class="['axis-mode-btn', { active: axisMode === 'auto' }]"
            @click="setAxisMode('auto')"
            title="按当前数据最大值/最小值自动缩放"
          >
            Auto (Max/Min)
          </button>
          <button
            :class="['axis-mode-btn', { active: axisMode === 'limit' }]"
            @click="setAxisMode('limit')"
            :title="'显示 Low/High Limit 并按 Limit 调整 Y 轴'"
          >
            Limit
          </button>
          <button
            :class="['axis-mode-btn', { active: axisMode === 'sigma' }]"
            @click="setAxisMode('sigma')"
            title="按均值 ± N 倍标准差调整 Y 轴"
          >
            N σ
          </button>
          <input
            v-model.number="sigmaN"
            type="number"
            min="1"
            max="20"
            step="0.5"
            class="sigma-input"
            :disabled="axisMode !== 'sigma'"
            @change="renderCorrCharts"
          />
        </div>
      </div>

      <div class="corr-chart-card chart-card">
        <div class="chart-header">
          <span>
            {{ paramDisplayWithUnit }} · Sample 1~{{ currentGroupChips.length }} 各 Site 测量折线
            ({{ selectedSites.length }} 条线)
          </span>
        </div>
        <div class="corr-chart-main">
          <div ref="corrLineChart" class="chart-box"></div>
          <div class="corr-legend-panel" :style="{ gridTemplateColumns: `repeat(${legendColumns}, 1fr)` }">
            <button
              v-for="s in legendSites"
              :key="s"
              class="corr-legend-site"
              :class="{ active: selectedSites.includes(s) }"
              :title="`Site ${s}`"
              @click="toggleSite(s)"
            >
              <i class="legend-color" :style="{ background: siteColor(s) }"></i>
              {{ s }}
            </button>
          </div>
        </div>
      </div>

      <div class="corr-table-card" v-if="selectedGroup !== 'all'">
        <div class="chart-header">
          <span>{{ currentGroupTitle }} 公共 Sample 测量对照表 ({{ currentGroupChips.length }} 颗)</span>
          <button class="btn btn-xs" v-if="hiddenChipNos.length" @click="showAllChips">
            全部显示
          </button>
        </div>
        <div class="corr-table-wrap">
          <table class="corr-table">
            <thead>
              <tr>
                <th>Sample</th>
                <th>原始编号</th>
                <th>指纹值</th>
                <th v-for="s in currentSites" :key="s">Site {{ s }}</th>
                <th>Delta</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in currentGroupChips" :key="c.chip_no" :class="{ 'row-hidden': isChipHidden(c.chip_no) }">
                <td><b>{{ c.chip_no }}</b></td>
                <td>{{ c.orig_chip_id ?? '-' }}</td>
                <td><code>{{ c.fingerprint ?? '-' }}</code></td>
                <td v-for="s in currentSites" :key="s" :class="cellClass(c, s)">
                  {{ cellValue(c, s) }}
                </td>
                <td class="delta-cell">{{ deltaValue(c) }}</td>
                <td>
                  <button class="btn btn-xs btn-delete" @click="toggleHideChip(c.chip_no)">
                    {{ isChipHidden(c.chip_no) ? '显示' : '隐藏' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 参数设置弹窗 -->
    <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
      <div class="modal check-modal">
        <h3>设置 Check / Fingerprint 监控参数 (程序: {{ checkData?.program }})</h3>
        <p style="font-size:12px;color:#666;margin-bottom:12px">
          选中 Trim 或测试寄存器计算指纹值：指纹值 = Σ(参数值[i] * (i+1))
        </p>

        <div class="param-selector">
          <div class="selector-header">
            <input v-model="paramSearch" placeholder="搜索参数/寄存器..." class="search-input" />
            <div class="param-quick-btns">
              <button class="btn btn-xs" @click="selectedParams = [...allParams]">全选 ({{ allParams.length }})</button>
              <button class="btn btn-xs" @click="selectedParams = []">清空</button>
              <button class="btn btn-xs" @click="selectedParams = allParams.filter(p => !selectedParams.includes(p))">反选</button>
            </div>
            <div class="selection-info">已选 {{ selectedParams.length }} / {{ allParams.length }} 个</div>
          </div>
          <div class="param-list">
            <label v-for="p in filteredParams" :key="p" class="param-item" title="按住 Shift 点击可连续多选">
              <input type="checkbox" :value="p" v-model="selectedParams" @click="onCheckboxClick($event, p)" />
              <span>{{ p }}</span>
            </label>
          </div>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>连续重复报警阈值 (颗)</label>
          <input type="number" v-model.number="tempThreshold" min="2" max="10" />
        </div>

        <div class="modal-actions">
          <button class="btn" @click="showSettings = false">取消</button>
          <button class="btn btn-primary" :disabled="!selectedParams.length || savingConfig" @click="saveSettings">
            {{ savingConfig ? '保存并刷新' : '保存并刷新' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading || loadingSiteCorr" class="loading-overlay">数据处理与图表加载中...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import api from '@/api'

const route = useRoute()
const lotId = route.params.id
const loading = ref(true)
const lotInfo = ref<any>(null)
const checkData = ref<any>(null)
const threshold = ref(2)
const dataFilter = ref('pass_only')

const activeMode = ref<'idle_check' | 'site_corr'>('idle_check')

// Site Corr 视图变量
const siteCorrData = ref<any>(null)
const loadingSiteCorr = ref(false)
const selectedGroup = ref<'group1' | 'group2' | 'all'>('group1')
const selectedCorrParam = ref<string>('')
const selectedSites = ref<number[]>([])
const hiddenChipNos = ref<number[]>([])
const axisMode = ref<'auto' | 'limit' | 'sigma'>('auto')
const sigmaN = ref(6)

const corrLineChart = ref<HTMLElement>()
let corrLineInstance: echarts.ECharts | null = null

const SITE_LINE_COLORS = [
  '#1890ff', '#52c41a', '#faad14', '#eb2f96', '#13c2c2', '#fa541c',
  '#2f54eb', '#a0d911', '#722ed1', '#fa8c16', '#08979c', '#d48806',
  '#9e1068', '#389e0d', '#096dd9', '#cf1322', '#f759ab', '#5cdbd3',
  '#ffc53d', '#69b1ff', '#95de64', '#ff9c6e', '#85a5ff', '#b37feb',
  '#36cfc9', '#ff7a45', '#597ef7', '#73d13d', '#ffd666', '#40a9ff'
]

// 导出与设置相关
const exporting = ref(false)
const exportProgress = ref(0)
const exportError = ref('')
const weights = ref<number[]>([])
const showFormula = ref(false)
const listFilter = ref<'all' | 'normal' | 'alarm'>('alarm')

const showSettings = ref(false)
const selectedParams = ref<string[]>([])
const allParams = ref<string[]>([])
const paramSearch = ref('')
const shiftAnchor = ref<string | null>(null)
const tempThreshold = ref(2)
const savingConfig = ref(false)
const processingCorr = ref(false)

const scatterChart = ref<HTMLElement>()
const waferMapCanvas = ref<HTMLCanvasElement>()
const waferMapTooltip = ref<HTMLDivElement | null>(null)
let scatterInstance: echarts.ECharts | null = null

const filteredParams = computed(() => {
  if (!paramSearch.value) return allParams.value
  const s = paramSearch.value.toLowerCase()
  return allParams.value.filter(p => p.toLowerCase().includes(s))
})

const hasCoordinates = computed(() => {
  if (!checkData.value?.data) return false
  return checkData.value.data.some((d: any) => d.X_COORD !== undefined && d.Y_COORD !== undefined)
})

const alarmCount = computed(() => {
  if (!checkData.value?.data) return 0
  return checkData.value.data.filter((d: any) => d.is_alarm).length
})

const listFilterLabel = computed(() => {
  if (listFilter.value === 'alarm') return '只显示报警'
  if (listFilter.value === 'normal') return '只显示正常'
  return '全部显示'
})

const filteredListData = computed(() => {
  if (!checkData.value?.data) return []
  if (listFilter.value === 'alarm') return checkData.value.data.filter((d: any) => d.is_alarm)
  if (listFilter.value === 'normal') return checkData.value.data.filter((d: any) => !d.is_alarm)
  return checkData.value.data
})

const currentGroupChips = computed(() => {
  if (!siteCorrData.value) return []
  const group = selectedGroup.value === 'group2'
    ? siteCorrData.value.group2
    : siteCorrData.value.group1
  return group?.chips || []
})

const currentSites = computed(() => {
  if (!siteCorrData.value) return []
  if (selectedGroup.value === 'group1') return siteCorrData.value.group1?.sites || []
  if (selectedGroup.value === 'group2') return siteCorrData.value.group2?.sites || []
  return [
    ...(siteCorrData.value.group1?.sites || []),
    ...(siteCorrData.value.group2?.sites || [])
  ]
})

const legendSites = computed(() => {
  const total = currentSites.value.length
  const columns = Math.max(1, Math.ceil(total / 8))
  const rows = Math.ceil(total / columns)
  const result: number[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const idx = col * rows + row
      if (idx < total) result.push(currentSites.value[idx])
    }
  }
  return result
})

const legendColumns = computed(() => {
  const total = currentSites.value.length
  return Math.max(1, Math.ceil(total / 8))
})

const currentGroupTitle = computed(() => {
  if (selectedGroup.value === 'group1') return 'Group 1 (Site 1~16)'
  if (selectedGroup.value === 'group2') return 'Group 2 (Site 17~32)'
  return '全 Set (Site 1~32)'
})

const isAllSitesSelected = computed(() => {
  const total = currentSites.value.length
  return total > 0 && selectedSites.value.length === total
})

const currentParamIndex = computed(() => {
  const list = siteCorrData.value?.test_params || []
  const idx = list.indexOf(selectedCorrParam.value)
  return idx >= 0 ? idx : 0
})

const fingerprintLabel = computed(() => {
  const fp = siteCorrData.value?.fp_params || []
  if (!fp.length) return '未配置参数，已使用全参数默认指纹'
  if (fp.length <= 3) return fp.join(' + ')
  return `${fp.slice(0, 3).join(' + ')} 等 ${fp.length} 项`
})

const paramMeta = computed(() => {
  return siteCorrData.value?.param_meta?.[selectedCorrParam.value] || {}
})

const hasParamLimits = computed(() => {
  const low = paramMeta.value.low
  const high = paramMeta.value.high
  return typeof low === 'number' && typeof high === 'number' && high > low
})

const paramDisplayWithUnit = computed(() => {
  const unit = paramMeta.value.unit || ''
  const number = paramMeta.value.number ?? ''
  const label = unit ? `${selectedCorrParam.value} (${unit})` : selectedCorrParam.value
  return number !== '' ? `${number} ${label}` : label
})

function paramLabelWithUnit(param: string) {
  const meta = siteCorrData.value?.param_meta?.[param]
  const unit = meta?.unit || ''
  const number = meta?.number ?? ''
  const label = unit ? `${param} (${unit})` : param
  return number !== '' ? `${number} ${label}` : label
}

onMounted(async () => {
  await fetchLotInfo()
  await fetchData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  scatterInstance?.dispose()
  corrLineInstance?.dispose()
})

function handleResize() {
  scatterInstance?.resize()
  corrLineInstance?.resize()
}

async function fetchLotInfo() {
  try {
    const res: any = await api.get(`/lots`)
    const items = res.items || []
    lotInfo.value = items.find((item: any) => item.id == lotId)
  } catch (e) {
    console.error('Failed to fetch lot info:', e)
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await api.get(`/analysis/lot/${lotId}/idle_check`, {
      params: {
        threshold: threshold.value,
        data_filter: dataFilter.value
      }
    })
    checkData.value = res
    weights.value = res.weights || []
    nextTick(() => {
      initCharts()
    })
  } catch (e) {
    console.error('Failed to fetch idle check data:', e)
  } finally {
    loading.value = false
  }
}

async function switchToSiteCorr() {
  activeMode.value = 'site_corr'
  if (!siteCorrData.value) {
    await fetchSiteCorrData()
  } else {
    nextTick(() => renderCorrCharts())
  }
}

async function fetchSiteCorrData() {
  loadingSiteCorr.value = true
  try {
    const fpParams = selectedParams.value.length ? selectedParams.value.join(',') : undefined
    const res: any = await api.get(`/analysis/lot/${lotId}/site_corr`, {
      params: { params: fpParams }
    })
    siteCorrData.value = res
    if (res.test_params && res.test_params.length > 0 && !selectedCorrParam.value) {
      selectedCorrParam.value = res.test_params[0]
    }
    selectedSites.value = [...currentSites.value]
    hiddenChipNos.value = []
    nextTick(() => renderCorrCharts())
  } catch (e: any) {
    alert('加载 Site Corr 数据失败: ' + (e.response?.data?.detail || e.message))
  } finally {
    loadingSiteCorr.value = false
  }
}

function changeGroup(grp: 'group1' | 'group2' | 'all') {
  selectedGroup.value = grp
  selectedSites.value = [...currentSites.value]
  nextTick(() => renderCorrCharts())
}

function selectAllSites() {
  if (isAllSitesSelected.value) {
    selectedSites.value = []
  } else {
    selectedSites.value = [...currentSites.value]
  }
  renderCorrCharts()
}

function toggleSite(site: number) {
  if (selectedSites.value.includes(site)) {
    selectedSites.value = selectedSites.value.filter((s: number) => s !== site)
  } else {
    selectedSites.value = [...selectedSites.value, site]
  }
  renderCorrCharts()
}

function prevParam() {
  const list = siteCorrData.value?.test_params || []
  if (!list.length) return
  const nextIdx = (currentParamIndex.value - 1 + list.length) % list.length
  selectedCorrParam.value = list[nextIdx]
  renderCorrCharts()
}

function nextParam() {
  const list = siteCorrData.value?.test_params || []
  if (!list.length) return
  const nextIdx = (currentParamIndex.value + 1) % list.length
  selectedCorrParam.value = list[nextIdx]
  renderCorrCharts()
}

function isChipHidden(chipNo: number) {
  return hiddenChipNos.value.includes(chipNo)
}

function toggleHideChip(chipNo: number) {
  if (hiddenChipNos.value.includes(chipNo)) {
    hiddenChipNos.value = hiddenChipNos.value.filter((n: number) => n !== chipNo)
  } else {
    hiddenChipNos.value = [...hiddenChipNos.value, chipNo]
  }
  renderCorrCharts()
}

function showAllChips() {
  hiddenChipNos.value = []
  renderCorrCharts()
}

function setAxisMode(mode: 'auto' | 'limit' | 'sigma') {
  axisMode.value = mode
  renderCorrCharts()
}

function siteColor(site: number) {
  const idx = currentSites.value.indexOf(site)
  return SITE_LINE_COLORS[(idx >= 0 ? idx : site - 1) % SITE_LINE_COLORS.length]
}

function collectParamValues() {
  const param = selectedCorrParam.value
  const groups: any[] = selectedGroup.value === 'all'
    ? [siteCorrData.value?.group1, siteCorrData.value?.group2]
    : [selectedGroup.value === 'group2' ? siteCorrData.value?.group2 : siteCorrData.value?.group1]
  const values: number[] = []
  groups.forEach((group: any) => {
    ;(group?.chips || []).forEach((c: any) => {
      ;(c.params?.[param] || []).forEach((v: any) => {
        if (typeof v === 'number' && !Number.isNaN(v)) values.push(v)
      })
    })
  })
  return values
}

function round4(value: number) {
  return Number(value.toFixed(4))
}

function formatAxisValue(value: number) {
  const text = round4(value).toString()
  return text
}

function computeAxisBounds() {
  if (axisMode.value === 'auto') {
    const values = collectVisibleParamValues()
    if (values.length) {
      const dataMin = Math.min(...values)
      const dataMax = Math.max(...values)
      const range = dataMax - dataMin
      const pad = range > 0
        ? range * 0.05
        : (Math.abs(dataMax) > 0 ? Math.abs(dataMax) * 0.05 : 1)
      return {
        min: round4(dataMin - pad),
        max: round4(dataMax + pad),
        scale: false,
        lines: []
      }
    }
  }

  if (axisMode.value === 'limit' && hasParamLimits.value) {
    const low = Number(paramMeta.value.low)
    const high = Number(paramMeta.value.high)
    const pad = (high - low) * 0.02
    return {
      min: round4(low - pad),
      max: round4(high + pad),
      scale: false,
      lines: [
        { name: 'Low Limit', value: round4(low) },
        { name: 'High Limit', value: round4(high) }
      ]
    }
  }

  if (axisMode.value === 'sigma') {
    const values = collectParamValues()
    if (values.length) {
      const n = Math.max(1, Number(sigmaN.value) || 6)
      const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length
      const variance = values.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / values.length
      const sd = Math.sqrt(variance) || Math.abs(mean) * 0.01 || 1
      return {
        min: round4(mean - n * sd),
        max: round4(mean + n * sd),
        scale: false,
        lines: [
          { name: `Mean-${n}σ`, value: round4(mean - n * sd) },
          { name: `Mean+${n}σ`, value: round4(mean + n * sd) }
        ]
      }
    }
  }

  return { min: undefined, max: undefined, scale: true, lines: [] }
}

function collectVisibleParamValues() {
  const param = selectedCorrParam.value
  const groups: any[] = selectedGroup.value === 'all'
    ? [siteCorrData.value?.group1, siteCorrData.value?.group2]
    : [selectedGroup.value === 'group2' ? siteCorrData.value?.group2 : siteCorrData.value?.group1]
  const values: number[] = []
  groups.forEach((group: any) => {
    ;(group?.sites || []).forEach((site: number, siteIdx: number) => {
      if (!selectedSites.value.includes(site)) return
      ;(group?.chips || []).forEach((c: any) => {
        if (hiddenChipNos.value.includes(c.chip_no)) return
        const v = c.params?.[param]?.[siteIdx]
        if (typeof v === 'number' && !Number.isNaN(v)) values.push(v)
      })
    })
  })
  return values
}

function getSiteSeries(group: any, param: string) {
  if (!group) return []
  const chips = (group.chips || []).filter((c: any) => !hiddenChipNos.value.includes(c.chip_no))
  const siteCount = (group.sites || []).length
  if (Array.isArray(group.site_series?.[param]) && group.site_series[param].length) {
    return group.site_series[param].map((line: any[]) =>
      chips.map((_c: any, i: number) => line[i] ?? null)
    )
  }
  return Array.from({ length: siteCount }, (_, si) =>
    chips.map((c: any) => c.params?.[param]?.[si] ?? null)
  )
}

function cellValue(c: any, site: number) {
  if (!siteCorrData.value) return '-'
  const param = selectedCorrParam.value
  if (site <= 16) {
    return c.params?.[param]?.[site - 1] ?? '-'
  }
  const chip2 = siteCorrData.value.group2?.chips?.find((x: any) => x.chip_no === c.chip_no)
  return chip2?.params?.[param]?.[site - 17] ?? '-'
}

function cellNumericValue(c: any, site: number) {
  const v = cellValue(c, site)
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

function rowValues(c: any) {
  return currentSites.value
    .map((s: number) => cellNumericValue(c, s))
    .filter((v: number | null): v is number => v !== null)
}

function cellClass(c: any, site: number) {
  const vals = rowValues(c)
  if (!vals.length) return ''
  const v = cellNumericValue(c, site)
  if (v === null) return ''
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  if (max === min) return 'cell-min'
  if (v === max) return 'cell-max'
  if (v === min) return 'cell-min'
  return ''
}

function deltaValue(c: any) {
  const vals = rowValues(c)
  if (!vals.length) return '-'
  return Number((Math.max(...vals) - Math.min(...vals)).toFixed(6))
}

function renderCorrCharts() {
  if (!siteCorrData.value) return
  if (!corrLineChart.value) return
  if (!corrLineInstance) corrLineInstance = echarts.init(corrLineChart.value)

  const param = selectedCorrParam.value
  const sites = currentSites.value
  const chips = currentGroupChips.value.filter((c: any) => !hiddenChipNos.value.includes(c.chip_no))
  let seriesBySite: any[] = []

  if (selectedGroup.value === 'all') {
    seriesBySite = [
      ...getSiteSeries(siteCorrData.value.group1, param),
      ...getSiteSeries(siteCorrData.value.group2, param)
    ]
  } else {
    const group = selectedGroup.value === 'group2'
      ? siteCorrData.value.group2
      : siteCorrData.value.group1
    seriesBySite = getSiteSeries(group, param)
  }

  const visibleSites = sites.filter((s: number) => selectedSites.value.includes(s))
  const bounds = computeAxisBounds()
  const markLines = bounds.lines.map((line: any, idx: number) => ({
    name: line.name,
    yAxis: line.value,
    lineStyle: {
      color: idx === 0 ? '#eb2f96' : '#13c2c2',
      type: 'dashed',
      width: 1.5
    },
    label: {
      formatter: `${line.name}: ${formatAxisValue(line.value)}`,
      position: 'insideEndTop',
      fontSize: 10,
      color: '#555'
    }
  }))

  const series = visibleSites.map((site: number, seriesIdx: number) => {
    const siteIdx = sites.indexOf(site)
    return {
      name: `Site ${site}`,
      type: 'line',
      data: seriesBySite[siteIdx] || [],
      symbol: 'circle',
      symbolSize: 5,
      connectNulls: true,
      itemStyle: { color: SITE_LINE_COLORS[siteIdx % SITE_LINE_COLORS.length] },
      lineStyle: { width: 1.6 },
      ...(seriesIdx === 0 && markLines.length ? {
        markLine: {
          silent: true,
          symbol: 'none',
          data: markLines,
          lineStyle: { type: 'dashed' },
          label: { fontSize: 10 }
        }
      } : {})
    }
  })

  const xLabels = chips.map((c: any) => `${c.chip_no}`)
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || !params.length) return ''
        let html = `<b>${params[0].name}</b><br/>`
        params.forEach((p: any) => {
          html += `${p.marker} ${p.seriesName}: <b>${p.value !== null && p.value !== undefined ? p.value : 'N/A'}</b><br/>`
        })
        return html
      }
    },
    legend: { show: false },
    grid: { top: series.length > 0 ? 24 : 24, bottom: 86, left: 96, right: 32 },
    xAxis: {
      type: 'category',
      name: paramDisplayWithUnit.value,
      nameLocation: 'middle',
      nameGap: 46,
      nameTextStyle: { fontSize: 13, color: '#1f2937', fontWeight: 600 },
      boundaryGap: false,
      data: xLabels
    },
    yAxis: {
      type: 'value',
      min: bounds.min,
      max: bounds.max,
      scale: bounds.scale,
      axisLabel: {
        formatter: (value: number) => formatAxisValue(value)
      }
    },
    series
  }
  corrLineInstance.setOption(option, true)
}

async function initCharts() {
  if (!checkData.value?.data) return
  if (scatterChart.value) {
    if (!scatterInstance) scatterInstance = echarts.init(scatterChart.value)
    
    const series: any[] = []
    const SITE_COLORS = ['#1890ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1', '#13c2c2', '#fa541c', '#a0d911']
    let xAxisMax: number | undefined = undefined

    if (checkData.value.has_sites) {
      const groups: Record<string, any[]> = {}
      checkData.value.data.forEach((d: any) => {
        const s = d.SITE_NUM
        if (!groups[s]) groups[s] = []
        groups[s].push(d)
      })

      const siteCounts = Object.values(groups).map((arr: any[]) => arr.length)
      xAxisMax = Math.max(...siteCounts)

      Object.keys(groups).sort((a,b)=>Number(a)-Number(b)).forEach((site, i) => {
        const siteData = groups[site] || []
        series.push({
          name: `Site ${site}`,
          type: 'scatter',
          symbolSize: 6,
          data: siteData.map((d: any, siteIdx: number) => [siteIdx, d.fingerprint, d.is_alarm, d.index]),
          itemStyle: {
            color: (p: any) => p.value[2] ? '#ff4d4f' : SITE_COLORS[i % SITE_COLORS.length] + '88'
          }
        })
      })
    } else {
      const data = checkData.value.data.map((d: any, idx: number) => [idx, d.fingerprint, d.is_alarm, d.index])
      xAxisMax = data.length
      series.push({
        type: 'scatter',
        symbolSize: 6,
        data: data,
        itemStyle: {
          color: (p: any) => p.value[2] ? '#ff4d4f' : 'rgba(24, 144, 255, 0.2)'
        }
      })
    }
    
    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          return params.map((p: any) => {
            const d = p.value
            return `${p.seriesName}<br/>Site内序号: ${d[0] + 1}<br/>Fingerprint: ${d[1]?.toFixed(4)}<br/>状态: ${d[2] ? '报警' : '正常'}`
          }).join('<br/><hr/>')
        }
      },
      legend: { show: checkData.value.has_sites, top: 0 },
      grid: { top: checkData.value.has_sites ? 40 : 20, bottom: 40, left: 60, right: 20 },
      xAxis: { type: 'value', name: 'Site内序号', min: 0, max: xAxisMax },
      yAxis: { type: 'value', name: 'Fingerprint', scale: true },
      series: series
    }
    scatterInstance.setOption(option, true)
  }
}

function toggleListFilter() {
  if (listFilter.value === 'alarm') listFilter.value = 'normal'
  else if (listFilter.value === 'normal') listFilter.value = 'all'
  else listFilter.value = 'alarm'
}

function handleRandomAlgo() {
  if (!allParams.value.length) return
  const shuffled = [...allParams.value].sort(() => 0.5 - Math.random())
  const count = Math.floor(Math.random() * 3) + 2
  selectedParams.value = shuffled.slice(0, count)
  saveSettings()
}

async function openSettings() {
  try {
    const config: any = await api.get('/analysis/idle_check/config', {
      params: {
        program_name: checkData.value.program,
        lot_id: lotId
      }
    })
    allParams.value = config.all_params || []
    selectedParams.value = config.params || []
    tempThreshold.value = config.threshold || 2
    showSettings.value = true
  } catch (e) {
    alert('获取设置失败')
  }
}

async function saveSettings() {
  savingConfig.value = true
  try {
    await api.post('/analysis/idle_check/config', {
      program_name: checkData.value.program,
      params: selectedParams.value,
      threshold: tempThreshold.value
    })
    showSettings.value = false
    threshold.value = tempThreshold.value
    await fetchData()
    if (activeMode.value === 'site_corr') {
      await fetchSiteCorrData()
    }
  } catch (e) {
    alert('保存失败')
  } finally {
    savingConfig.value = false
  }
}

async function handleCorrProcessing() {
  if (!confirm('Corr处理将对齐各 Site 数据，保存为新数据包，是否继续？')) return
  processingCorr.value = true
  try {
    const res: any = await api.post(`/analysis/lot/${lotId}/idle_check/corr`, null, {
      params: {
        threshold: threshold.value,
        data_filter: dataFilter.value,
        weights: weights.value.join(',')
      }
    })
    alert(`处理完成！新数据已生成：${res.filename}\n请前往 Home 页查看。`)
  } catch (e: any) {
    alert('处理失败: ' + (e.response?.data?.detail || e.message))
  } finally {
    processingCorr.value = false
  }
}

function onCheckboxClick(e: MouseEvent, paramName: string) {
  const input = e.target as HTMLInputElement
  if (!e.shiftKey) {
    shiftAnchor.value = paramName
    return
  }

  e.preventDefault()
  const list = filteredParams.value
  const currentIdx = list.indexOf(paramName)
  const anchorIdx = list.indexOf(shiftAnchor.value || '')
  if (currentIdx < 0 || anchorIdx < 0) {
    if (!selectedParams.value.includes(paramName)) {
      selectedParams.value = [...selectedParams.value, paramName]
    }
    return
  }

  const [start, end] = anchorIdx <= currentIdx
    ? [anchorIdx, currentIdx]
    : [currentIdx, anchorIdx]
  const merged = new Set(selectedParams.value)
  list.slice(start, end + 1).forEach((p: string) => merged.add(p))
  selectedParams.value = [...merged]
}

function handleExport() {}
</script>

<style scoped>
.idle-check-view { display: flex; flex-direction: column; height: 100vh; background: #f0f2f5; padding: 16px; box-sizing: border-box; }
.header-bar { display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); margin-bottom: 16px; }
.title h2 { margin: 0; font-size: 18px; color: #1f2937; }
.subtitle { font-size: 12px; color: #6b7280; }

.mode-switcher { display: flex; gap: 8px; background: #f3f4f6; padding: 4px; border-radius: 6px; }
.mode-tab-btn { border: none; background: transparent; padding: 6px 14px; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; color: #4b5563; transition: all 0.2s; }
.mode-tab-btn.active { background: white; color: #722ed1; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

.actions { display: flex; align-items: center; gap: 12px; }
.threshold-input input { width: 50px; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; margin-left: 6px; }
.filter-options { display: flex; background: #f5f5f5; padding: 2px; border-radius: 4px; }
.radio-label { padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 3px; }
.radio-label.active { background: white; color: #1890ff; font-weight: bold; }
.radio-label input { display: none; }

.btn { padding: 6px 12px; border-radius: 4px; border: 1px solid #d9d9d9; background: white; cursor: pointer; font-size: 13px; }
.btn-xs { padding: 2px 8px; font-size: 12px; border-radius: 3px; background: #f3f4f6; border: 1px solid #d1d5db; color: #374151; cursor: pointer; }
.btn-xs:hover { background: #e5e7eb; color: #111827; }
.btn-primary { background: #1890ff; color: white; border: none; }
.btn-corr { background: #722ed1; color: white; border: none; }
.btn-download { background: #52c41a; color: white; border: none; }

.main-content { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 16px; flex: 1; min-height: 0; }
.main-content.no-map { grid-template-columns: 1fr 1fr; }
.chart-section, .map-section, .list-section { background: white; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; min-height: 0; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.chart-header { font-weight: 600; font-size: 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; color: #1f2937; }
.chart-container { flex: 1; min-height: 0; }

/* Site Corr 分析面板样式 */
.site-corr-view { display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; overflow-y: auto; }
.corr-toolbar { display: flex; align-items: center; justify-content: space-between; background: white; padding: 12px 16px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); gap: 14px; flex-wrap: wrap; }
.group-select-box, .param-switch-box, .site-filter-box { display: flex; align-items: center; gap: 8px; }
.site-filter-box { flex: 1 1 100%; border-top: 1px dashed #e8e8e8; padding-top: 10px; }
.param-arrow { width: 30px; height: 30px; border: 1px solid #d9d9d9; background: white; border-radius: 4px; cursor: pointer; font-size: 18px; line-height: 1; color: #374151; }
.param-arrow:hover { background: #f0f0f0; }
.site-all-btn.active { background: #722ed1; color: white; border-color: #722ed1; }
.site-tag-list { display: flex; flex-wrap: wrap; gap: 4px; max-width: 860px; }
.site-tag { min-width: 32px; height: 26px; padding: 0 6px; border: 1px solid #d9d9d9; background: #fff; border-radius: 4px; font-size: 12px; cursor: pointer; color: #374151; }
.site-tag.active { background: #1890ff; color: white; border-color: #1890ff; font-weight: 600; }
.corr-summary-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; background: white; padding: 10px 16px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); font-size: 12px; color: #374151; }
.summary-chip { font-weight: 600; color: #722ed1; }
.summary-fp { color: #555; }
.summary-deleted { color: #cf1322; font-weight: 600; }
.axis-mode-box { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.axis-mode-btn { border: 1px solid #d9d9d9; background: #fff; padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; color: #374151; }
.axis-mode-btn.active { background: #1890ff; color: #fff; border-color: #1890ff; font-weight: 600; }
.axis-mode-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.sigma-input { width: 58px; padding: 4px 6px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; }

.label { font-size: 13px; font-weight: 500; color: #4b5563; }
.grp-btn { border: 1px solid #d9d9d9; background: white; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
.grp-btn.active { background: #722ed1; color: white; border-color: #722ed1; font-weight: 600; }

.corr-select { padding: 6px 12px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px; outline: none; background: white; min-width: 140px; }
.param-select { min-width: 220px; }

.corr-chart-card { background: white; border-radius: 8px; padding: 0 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); display: flex; flex-direction: column; width: 100%; height: 400px; flex-shrink: 0; align-self: stretch; }
.corr-chart-card .chart-header { margin-bottom: 0; padding: 0; }
.corr-chart-main { flex: 1; min-height: 0; display: flex; gap: 10px; }
.chart-box { flex: 0 0 70%; width: 70%; min-width: 0; min-height: 0; }
.corr-legend-panel { width: 120px; flex-shrink: 0; display: grid; grid-template-columns: repeat(2, 1fr); grid-auto-rows: 20px; gap: 3px; align-content: start; padding: 4px; background: #fafafa; border-radius: 6px; box-sizing: border-box; height: min-content; align-self: flex-start; }
.corr-legend-site { display: flex; align-items: center; justify-content: center; gap: 4px; border: 1px solid #e5e7eb; background: #fff; border-radius: 3px; font-size: 10px; cursor: pointer; color: #6b7280; padding: 0 2px; }
.corr-legend-site.active { background: #f0f5ff; border-color: #91caff; color: #096dd9; font-weight: 600; }
.legend-color { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.corr-table-card { background: white; border-radius: 8px; padding: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.table-info-tag { font-size: 12px; color: #722ed1; font-weight: normal; }
.corr-table-wrap { max-height: 360px; overflow: auto; }
.corr-table { min-width: 640px; width: 100%; border-collapse: collapse; font-size: 12px; text-align: center; }
.corr-table th { background: #fafafa; position: sticky; top: 0; padding: 8px; border-bottom: 1px solid #f0f0f0; color: #374151; z-index: 1; }
.corr-table td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; color: #4b5563; }
.corr-table tr { transition: background 0.15s; }
.corr-table tr:hover { background: #f9f5ff; }
.corr-table tr.row-hidden td { opacity: 0.45; }
.corr-table td.cell-max { color: #cf1322; background: #fff1f0; font-weight: 700; }
.corr-table td.cell-min { color: #389e0d; background: #f6ffed; font-weight: 700; }
.corr-table td.delta-cell { font-weight: 700; color: #1f2937; }
.btn-delete { color: #cf1322; border-color: #ffa39e; }
.btn-delete:hover { background: #fff1f0; }

.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot.normal { background: #1890ff; }
.dot.alarm { background: #ff4d4f; }

.table-container { flex: 1; overflow-y: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { position: sticky; top: 0; background: #fafafa; padding: 10px; text-align: left; border-bottom: 1px solid #f0f0f0; }
.data-table td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
.row-alarm { background: #fff1f0; }

.badge-alarm { color: #cf1322; background: #fff1f0; border: 1px solid #ffa39e; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.badge-normal { color: #389e0d; background: #f6ffed; border: 1px solid #b7eb8f; padding: 2px 8px; border-radius: 10px; font-size: 12px; }

.loading-overlay { position: fixed; inset: 0; background: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; font-size: 16px; color: #722ed1; font-weight: bold; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1100; }
.modal { background: white; padding: 24px; border-radius: 8px; width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.check-modal { width: 600px !important; }
.param-selector { border: 1px solid #d9d9d9; border-radius: 4px; display: flex; flex-direction: column; height: 300px; }
.selector-header { padding: 8px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; background: #fafafa; }
.search-input { flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; }
.selection-info { margin-left: 12px; font-size: 12px; color: #1890ff; font-weight: 500; }
.param-list { flex: 1; overflow-y: auto; padding: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
.param-item { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px; border-radius: 2px; cursor: pointer; }
.param-item:hover { background: #f5f5f5; }
</style>
