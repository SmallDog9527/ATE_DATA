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

      <!-- 图表显示控制栏 (参数控件上方) -->
      <div class="viz-bar">
        <div class="option-item">
          <label>Chart</label>
          <label v-if="!trimMode"><input type="checkbox" :checked="showHistogram" @change="showHistogram = ($event.target as HTMLInputElement).checked" /> Histogram</label>
          <label v-if="trimMode"><input type="checkbox" :checked="showScatter" @change="showScatter = ($event.target as HTMLInputElement).checked" /> Scatter</label>
          <button class="btn-trim-step" :class="{ active: trimMode }" @click="toggleTrimMode" title="切换Trim参数合并与Step步进折线模式">Trim_step_mode</button>
        </div>
        <!-- LOT 选择 chips：默认 ALL -->
        <div class="site-chips" v-if="trimMode && trimLotsData.length">
          <span class="chip chip-all" :class="{ active: isAllChipActive }" @click="onChipClick('all')">ALL</span>
          <span
            v-for="(lot, idx) in trimLotsData"
            :key="lot.lot_id"
            class="chip"
            :class="{ active: isLotChipActive(lot.lot_id) }"
            :style="lotChipStyle(idx)"
            @click="onChipClick(lot.lot_id)"
          >{{ trimLotName(lot) }}</span>
        </div>
      </div>

      <!-- Options栏 -->
      <div class="options-bar" v-if="currentTab">
        <div class="options-left">
          <div class="nav-group">
            <button @click="prevParam">◀ PREV</button>
            <select v-model="currentParamName" @change="onParamSelectChange">
              <template v-if="trimMode">
                <option v-for="g in trimGroups" :key="g.base_param" :value="g.base_param">
                  {{ g.item_number }}:{{ g.base_param }}
                </option>
              </template>
              <template v-else>
                <option v-for="item in paramList" :key="item.item_name" :value="item.item_name">
                  {{ item.item_number }}:{{ item.item_name }}
                </option>
              </template>
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

          <div class="option-item" v-if="!trimMode">
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
      <!-- 1. Trim Step 模式内容 -->
      <div class="content-row" v-if="trimMode">
        <div
          class="charts-area"
          :style="{ width: trimScatterZoom2x ? '1600px' : '1100px' }"
        >
          <div v-if="trimLoading" class="trim-empty">加载中...</div>
          <div v-else-if="!trimGroups.length" class="trim-empty">未发现 Trim 参数组</div>
          <template v-else>
            <!-- 统计汇总行 (Trim Step 模式) -->
            <div class="stats-table stats-table-trim" v-if="currentTrimSteps.length">
              <table>
                <thead>
                  <tr>
                    <th style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:120px;width:130px;text-align:center">
                      <div style="display:flex;align-items:center;justify-content:center">
                        <span>Step</span>
                      </div>
                    </th>
                    <th style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:130px" title="该Step所有Die的Pre值区间 [min, max]">
                      pre区间{{ trimUnit ? ` (${trimUnit})` : '' }}
                    </th>
                    <th style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:95px">
                      Pre_mean{{ trimUnit ? ` (${trimUnit})` : '' }}
                    </th>
                    <th style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:95px">
                      Post_mean{{ trimUnit ? ` (${trimUnit})` : '' }}
                    </th>
                    <th style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:95px">
                      all_mean{{ trimDeltaUnitInfo().unit ? ` (${trimDeltaUnitInfo().unit})` : '' }}
                    </th>
                    <th style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:70px">
                      Qty
                    </th>
                    <th
                      v-for="lot in displayedTrimLots"
                      :key="'th_lot_'+lot.lot_id"
                      style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:95px"
                    >Mean_{{ trimLotName(lot) }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="step in currentTrimSteps" :key="step.step_index">
                    <td style="min-width:120px;width:130px;font-weight:600"><span class="site-cell-label">Step {{ step.step_index }}</span></td>
                    <td style="font-weight:600">{{ step.pre_min != null && step.pre_max != null ? `[${step.pre_min.toFixed(4)}, ${step.pre_max.toFixed(4)}]` : '-' }}</td>
                    <td style="font-weight:600">{{ getTrimStepPreMeanDisplay(step) }}</td>
                    <td style="font-weight:600">{{ getTrimStepPostMeanDisplay(step) }}</td>
                    <td style="font-weight:600;color:#1890ff">{{ getTrimStepAllMeanDisplay(step) }}</td>
                    <td style="font-weight:600;color:#555">{{ getTrimStepQty(step) }}</td>
                    <td
                      v-for="lot in displayedTrimLots"
                      :key="'td_lot_'+lot.lot_id"
                      :style="trimLotCellStyle(step, lot.lot_id, displayedTrimLots)"
                    >
                      {{ getTrimStepLotMean(step, lot.lot_id)?.toFixed(4) ?? '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Scatter图 -->
            <div v-if="showScatter" class="chart-container" style="flex-direction:column;align-items:center">
              <div class="scatter-axis-mode-box">
                <button
                  :class="['axis-mode-btn', { active: trimShift }]"
                  @click="toggleTrimShift"
                  title="将各LOT的Step 0基准向全局Step 0均值对齐(消除LOT间固有偏差)"
                >Shift</button>
                <button
                  :class="['axis-mode-btn', { active: trimRobust }]"
                  style="margin-left: 8px;"
                  @click="toggleTrimRobust"
                  title="每个LOT去除最高10%和最低10%的极值后计算Mean均值"
                >Robust</button>
                <button
                  :class="['axis-mode-btn', { active: trimInvert }]"
                  style="margin-left: 8px;"
                  @click="toggleTrimInvert"
                  title="将所有Step按测量值从小到大排序重排，并在图中绘制y=ax+b拟合趋势虚线"
                >Invert</button>
                <button
                  :class="['axis-mode-btn', { active: trimScatterZoom2x }]"
                  style="margin-left: auto;"
                  @click="toggleTrimScatterZoom"
                  :title="trimScatterZoom2x ? '点击恢复原尺寸 (1X)' : '点击放大为2倍尺寸 (2X)'"
                >{{ trimScatterZoom2x ? '🔍 恢复 (1X)' : '🔍 放大 (2X)' }}</button>
              </div>

              <div
                :ref="el => setTrimScatterRef(el)"
                :style="{ width: trimScatterZoom2x ? '1560px' : '1060px', height: trimScatterZoom2x ? '800px' : '400px' }"
              ></div>

              <div class="chart-legend" v-if="displayedTrimLots.length">
                <span
                  v-for="lot in displayedTrimLots"
                  :key="'tlg_'+lot.lot_id"
                  class="chart-legend-item"
                  :style="{ '--lg-color': LOT_COLORS[getLotColorIndex(lot.lot_id) % LOT_COLORS.length] }"
                >{{ trimLotName(lot) }}</span>
              </div>

              <!-- Trim 步进预测与全量良率寻优智能面板 -->
              <TrimOptimizerPanel
                :lot-ids="lotIdsStr"
                :param-name="currentParamName"
                :pre-param="currentTrimParam?.pre_param"
                :post-param="currentTrimParam?.post_param"
                :post-bit-param="currentTrimParam?.post_bit_param"
                :target-param="trimTargetParamName"
                :target-value="trimTargetValue"
                :lower-limit="trimLowerLimit ?? currentTab?.data?.lower_limit"
                :upper-limit="trimUpperLimit ?? currentTab?.data?.upper_limit"
                :unit="trimUnit || currentTab?.data?.unit"
                :data-range="draftOptions.data_range"
                :filter-type="draftOptions.filter_type"
                :steps-data="currentTrimSteps"
                :step-count="currentTrimSteps.length"
              />
            </div>
          </template>
        </div>
      </div>

      <!-- 2. 普通直方图模式内容 -->
      <div v-else>
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
        <div class="chart-wrap" v-if="currentTab.data && showHistogram">
          <div :ref="el => setChartRef(currentTab?.id, el)" style="width:600px;height:480px"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import api from '@/api'
import TrimOptimizerPanel from '@/components/TrimOptimizerPanel.vue'

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
const showHistogram = ref(true)
const showScatter = ref(true)

const LOT_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#e599f7', '#74c0fc', '#a9e34b', '#ffa94d']

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

// ── Trim Step 状态 ──
const trimMode = ref(false)
const trimGroups = ref<any[]>([])
const selectedTrimGroup = ref('')
const currentTrimParam = computed(() => trimGroups.value.find((g: any) => g.base_param === selectedTrimGroup.value))
const trimLotsData = ref<any[]>([])
const trimLoading = ref(false)
const trimAllSteps = ref<any[]>([])
const trimAllCurves = ref<any[]>([])
const trimUnit = ref('')
const trimLowerLimit = ref<number | null>(null)
const trimUpperLimit = ref<number | null>(null)
const trimTargetParamName = ref('')
const trimTargetValue = ref<number | null>(null)
const lot_view = ref<'all_only' | 'all' | 'lot'>('all')
const activeLots = ref<number[]>([])
const trimScatterEl = ref<any>(null)
let trimScatterChart: echarts.ECharts | null = null

const trimCalc = ref({
  preVal: null as number | null,
  preCode: 0,
  targetVal: null as number | null,
})

// Trim Scatter 模式开关
const trimShift = ref(false)
const trimRobust = ref(false)
const trimInvert = ref(false)
const trimScatterZoom2x = ref(false)

// delta 单位换算
function trimDeltaUnitInfo() {
  const origUnit = trimUnit.value || ''
  const steps = trimAllSteps.value

  let maxAbsDelta = 0
  for (const st of steps) {
    if (st.step_index === 0) continue
    const delta = st.all_mean ?? st.delta_mean ?? (st.post_mean != null && st.pre_mean != null ? st.post_mean - st.pre_mean : null)
    if (delta !== null && delta !== undefined && !isNaN(delta)) {
      const d = Math.abs(delta)
      if (d > maxAbsDelta) maxAbsDelta = d
    }
  }

  const uUpper = origUnit.toUpperCase()
  if (uUpper === 'V' && maxAbsDelta > 0 && maxAbsDelta < 0.5) {
    return { unit: 'mV', factor: 1000 }
  }
  if (uUpper === 'A' && maxAbsDelta > 0 && maxAbsDelta < 0.5) {
    return maxAbsDelta < 0.0005 ? { unit: 'uA', factor: 1000000 } : { unit: 'mA', factor: 1000 }
  }
  if (origUnit.toLowerCase() === 's' && maxAbsDelta > 0 && maxAbsDelta < 0.5) {
    return { unit: 'ms', factor: 1000 }
  }
  if (origUnit.toLowerCase() === 'ohm' && maxAbsDelta > 0 && maxAbsDelta < 0.5) {
    return { unit: 'mohm', factor: 1000 }
  }
  return { unit: origUnit, factor: 1 }
}

// 取某 step 的 all_mean
function getStepAllMean(step: any): number | null {
  if (!step) return null
  const v = step.all_mean ?? step.delta_mean ?? (step.post_mean != null && step.pre_mean != null ? step.post_mean - step.pre_mean : null)
  if (v == null || isNaN(v)) return null
  return step.step_index === 0 ? 0 : v
}

// 10% trimmed robust mean
function calcRobustMeanFromCurves(curves: any[], stepIdx: number): number | null {
  if (!curves || curves.length === 0) return null
  const vals: number[] = []
  curves.forEach((c: any) => {
    const pt = c.points?.find((p: any) => p[0] === stepIdx)
    if (pt && pt[1] !== null && pt[1] !== undefined && typeof pt[1] === 'number' && !isNaN(pt[1])) {
      vals.push(pt[1])
    }
  })
  if (vals.length === 0) return null
  if (vals.length < 5) return vals.reduce((a, b) => a + b, 0) / vals.length
  vals.sort((a, b) => a - b)
  let cut = Math.floor(vals.length * 0.10)
  if (vals.length >= 8) cut = Math.max(1, cut)
  const trimmed = vals.slice(cut, vals.length - cut)
  if (trimmed.length === 0) return vals[0] ?? null
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length
}

function trimLotName(lotData: any): string {
  const custom = draftOptions.value.lot_display_names?.[String(lotData.lot_id)]
    ?? currentTab.value?.options?.lot_display_names?.[String(lotData.lot_id)]
  return custom || lotData.display_name || `LOT ${lotData.lot_id}`
}

function getLotColorIndex(lotId: number): number {
  const idx = trimLotsData.value.findIndex(l => l.lot_id === lotId)
  return idx >= 0 ? idx : 0
}

const currentTrimSteps = computed<any[]>(() => {
  if (displayedTrimLots.value.length === 1) {
    return displayedTrimLots.value[0]?.steps || []
  }
  return trimAllSteps.value
})

const displayedTrimLots = computed<any[]>(() => {
  if (lot_view.value === 'all_only') {
    return []
  }
  if (lot_view.value === 'lot') {
    return trimLotsData.value.filter(l => activeLots.value.includes(l.lot_id))
  }
  return trimLotsData.value
})

const isAllChipActive = computed(() => {
  return lot_view.value === 'all_only'
})

function isLotChipActive(lotId: number): boolean {
  if (lot_view.value === 'all') return true
  if (lot_view.value === 'lot') return activeLots.value.includes(lotId)
  return false
}

function lotChipStyle(idx: number) {
  const c = LOT_COLORS[idx % LOT_COLORS.length]
  return { '--chip-bg': c } as any
}

function onChipClick(target: 'all' | number) {
  if (target === 'all') {
    if (lot_view.value === 'all_only') {
      lot_view.value = 'all'
      activeLots.value = []
    } else if (lot_view.value === 'lot') {
      lot_view.value = 'all'
      activeLots.value = []
    } else {
      lot_view.value = 'all_only'
      activeLots.value = []
    }
  } else {
    if (lot_view.value !== 'lot') {
      lot_view.value = 'lot'
      activeLots.value = [target]
    } else {
      const set = new Set<number>(activeLots.value)
      if (set.has(target)) {
        set.delete(target)
      } else {
        set.add(target)
      }
      if (set.size === 0) {
        lot_view.value = 'all'
        activeLots.value = []
      } else {
        activeLots.value = Array.from(set).sort((a, b) => a - b)
      }
    }
  }
  nextTick(() => {
    renderTrimScatter()
    syncTrimCalcDefaults()
  })
}

function getTrimStepPreMeanDisplay(step: any): string {
  if (!step) return '-'
  const lots = displayedTrimLots.value
  if (lots.length === 1) {
    const lotStep = lots[0].steps?.find((s: any) => s.step_index === step.step_index)
    const val = lotStep?.pre_mean
    return val != null ? val.toFixed(4) : '-'
  }
  const val = step.pre_mean
  return val != null ? val.toFixed(4) : '-'
}

function getTrimStepPostMeanDisplay(step: any): string {
  if (!step || step.step_index === 0) return '-'
  const lots = displayedTrimLots.value
  if (lots.length === 1) {
    const lotStep = lots[0].steps?.find((s: any) => s.step_index === step.step_index)
    const val = lotStep?.post_mean
    return val != null ? val.toFixed(4) : '-'
  }
  const val = step.post_mean
  return val != null ? val.toFixed(4) : '-'
}

function getTrimStepAllMeanDisplay(step: any): string {
  if (!step) return '-'
  if (step.step_index === 0) return '0'
  const lots = displayedTrimLots.value
  let rawVal: number | null = null
  if (lots.length === 1) {
    const lotStep = lots[0].steps?.find((s: any) => s.step_index === step.step_index)
    rawVal = getStepAllMean(lotStep)
  } else {
    rawVal = getStepAllMean(step)
  }
  if (rawVal == null || isNaN(rawVal)) return '-'
  const { factor } = trimDeltaUnitInfo()
  return (rawVal * factor).toFixed(4)
}

function getTrimStepQty(step: any): number | string {
  const lots = displayedTrimLots.value
  if (lots.length === 1) {
    const lotStep = lots[0].steps?.find((s: any) => s.step_index === step.step_index)
    return lotStep?.exec_qty ?? '-'
  } else if (lots.length > 1 && lots.length < trimLotsData.value.length) {
    let sum = 0
    let hasVal = false
    for (const lot of lots) {
      const lotStep = lot.steps?.find((s: any) => s.step_index === step.step_index)
      if (lotStep?.exec_qty != null) {
        sum += lotStep.exec_qty
        hasVal = true
      }
    }
    return hasVal ? sum : (step?.exec_qty ?? '-')
  }
  return step?.exec_qty ?? '-'
}

function getTrimStepLotMean(step: any, lotId: number): number | null {
  const lot = trimLotsData.value.find(l => l.lot_id === lotId)
  if (!lot?.steps) return null
  const isShift = trimShift.value
  const isRobust = trimRobust.value
  const curves = lot.curves || []

  let rawMean: number | null = null
  if (isRobust) {
    rawMean = calcRobustMeanFromCurves(curves, step.step_index)
  }
  if (rawMean == null) {
    const lotStep = lot.steps.find((s: any) => s.step_index === step.step_index)
    rawMean = getStepAllMean(lotStep)
  }
  if (rawMean == null) return null
  if (step.step_index === 0) return 0

  if (isShift) {
    const all0 = trimRobust.value ? calcRobustMeanFromCurves(trimAllCurves.value, 0) : getStepAllMean(trimAllSteps.value[0])
    const lot0 = trimRobust.value ? calcRobustMeanFromCurves(curves, 0) : getStepAllMean(lot.steps[0])
    if (all0 != null && lot0 != null) {
      rawMean += (all0 - lot0)
    }
  }
  return rawMean
}

function trimLotCellStyle(step: any, lotId: number, displayedLots: any[]) {
  const val = getTrimStepLotMean(step, lotId)
  if (val === null || val === undefined || typeof val !== 'number' || isNaN(val) || displayedLots.length < 2) {
    return {}
  }
  const lotMeans = displayedLots
    .map(l => getTrimStepLotMean(step, l.lot_id))
    .filter((v): v is number => v !== null && v !== undefined && typeof v === 'number' && !isNaN(v))
  if (lotMeans.length < 2) return {}
  const maxVal = Math.max(...lotMeans)
  const minVal = Math.min(...lotMeans)
  if (maxVal === minVal) return {}
  if (Math.abs(val - maxVal) < 1e-9) return { color: 'red', fontWeight: 'bold' }
  if (Math.abs(val - minVal) < 1e-9) return { color: 'green', fontWeight: 'bold' }
  return {}
}

const activeChipLabel = computed(() => {
  if (lot_view.value === 'all_only') return 'ALL'
  if (lot_view.value === 'lot' && activeLots.value.length === 1) {
    const lot = trimLotsData.value.find(l => l.lot_id === activeLots.value[0])
    return lot ? trimLotName(lot) : `LOT ${activeLots.value[0]}`
  }
  if (lot_view.value === 'lot') {
    return activeLots.value.map(id => {
      const lot = trimLotsData.value.find(l => l.lot_id === id)
      return lot ? trimLotName(lot) : `LOT ${id}`
    }).join(', ')
  }
  return 'ALL LOTs'
})

const trimCalcResult = computed(() => {
  const steps = currentTrimSteps.value
  if (!trimMode.value || steps.length === 0) return { postVal: null, postCode: null, diff: null }
  const target = trimCalc.value.targetVal
  if (target === null || target === undefined || isNaN(target)) return { postVal: null, postCode: null, diff: null }
  const preCode = Math.max(0, Math.min(steps.length - 1, trimCalc.value.preCode || 0))
  const preStep = steps[preCode] || steps[0]
  const baseMean = getStepAllMean(preStep) ?? preStep?.stats_all?.mean ?? 0
  const userPre = (trimCalc.value.preVal !== null && trimCalc.value.preVal !== undefined && !isNaN(trimCalc.value.preVal))
    ? trimCalc.value.preVal
    : baseMean
  let bestStep = 0
  let bestEst = userPre
  let minDiff = Infinity
  steps.forEach((s: any) => {
    const sMean = getStepAllMean(s) ?? s.stats_all?.mean ?? baseMean
    const est = userPre + (sMean - baseMean)
    const diff = Math.abs(est - target)
    if (diff < minDiff) {
      minDiff = diff
      bestStep = s.step_index
      bestEst = est
    }
  })
  return { postVal: bestEst, postCode: bestStep, diff: bestEst - target }
})

function syncTrimCalcDefaults() {
  const steps = currentTrimSteps.value
  if (steps.length > 0) {
    const s0 = steps[0]
    if (trimCalc.value.preVal == null) {
      trimCalc.value.preVal = s0.pre_mean != null ? parseFloat(s0.pre_mean.toFixed(4)) : null
    }
  }
}

function setTrimScatterRef(el: any) {
  trimScatterEl.value = el
  if (el) {
    if (trimScatterChart) {
      trimScatterChart.dispose()
    }
    trimScatterChart = echarts.init(el)
    nextTick(() => renderTrimScatter())
  } else {
    if (trimScatterChart) {
      trimScatterChart.dispose()
      trimScatterChart = null
    }
  }
}

function renderTrimScatter() {
  if (!trimScatterChart && trimScatterEl.value) {
    trimScatterChart = echarts.init(trimScatterEl.value)
  }
  if (!trimScatterChart) return
  trimScatterChart.resize()
  const steps = currentTrimSteps.value
  const { unit: deltaUnit, factor } = trimDeltaUnitInfo()

  // Invert Step Mapping
  const sortedStepIndices: number[] = []
  const origToNewStepMap: Record<number, number> = {}
  if (trimInvert.value && steps.length >= 2) {
    const stepIndices = steps.map((s: any) => s.step_index)
    const stepMeans: Record<number, number> = {}
    steps.forEach((s: any) => {
      const v = getStepAllMean(s)
      stepMeans[s.step_index] = v ?? 0
    })
    const maxStepVal = Math.max(...stepIndices, 1)
    const halfBoundary = maxStepVal / 2.0
    let h1: number[] = []
    let h2: number[] = []
    stepIndices.forEach((idx: number) => {
      if (idx <= halfBoundary) h1.push(idx)
      else h2.push(idx)
    })
    if (h1.length === 0 || h2.length === 0) {
      const mid = Math.floor(stepIndices.length / 2)
      h1 = stepIndices.slice(0, mid)
      h2 = stepIndices.slice(mid)
    }
    if (h1.length >= 2 && stepMeans[h1[0]] > stepMeans[h1[h1.length - 1]]) h1.reverse()
    if (h2.length >= 2 && stepMeans[h2[0]] > stepMeans[h2[h2.length - 1]]) h2.reverse()
    const h1Avg = h1.reduce((sum, idx) => sum + (stepMeans[idx] || 0), 0) / (h1.length || 1)
    const h2Avg = h2.reduce((sum, idx) => sum + (stepMeans[idx] || 0), 0) / (h2.length || 1)
    const ordered = (h1Avg <= h2Avg) ? [...h1, ...h2] : [...h2, ...h1]
    ordered.forEach((origIdx, newIdx) => {
      sortedStepIndices[newIdx] = origIdx
      origToNewStepMap[origIdx] = newIdx
    })
  } else {
    steps.forEach((s: any, i: number) => {
      sortedStepIndices[i] = s.step_index
      origToNewStepMap[s.step_index] = s.step_index
    })
  }

  const series: any[] = []
  let allVals: number[] = []
  const allFitPoints: { x: number; y: number }[] = []

  // ── 1. ALL Mean Series ── (蓝色，当处于 all 或 all_only 模式)
  if (lot_view.value === 'all_only' || lot_view.value === 'all') {
    const allMeanPoints: any[] = []
    trimAllSteps.value.forEach((st: any) => {
      const origX = st.step_index
      const newX = origToNewStepMap[origX] ?? origX
      const rawVal = trimRobust.value
        ? calcRobustMeanFromCurves(trimAllCurves.value, origX)
        : getStepAllMean(st)
      if (rawVal == null) return
      const plotVal = rawVal * factor
      allVals.push(plotVal)
      allMeanPoints.push([newX, plotVal])
      if (lot_view.value === 'all_only') {
        allFitPoints.push({ x: newX, y: plotVal })
      }
    })
    allMeanPoints.sort((a, b) => a[0] - b[0])
    series.push({
      name: 'ALL Mean',
      type: 'line',
      data: allMeanPoints,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { color: '#1890ff', width: 2.8 },
      itemStyle: { color: '#1890ff' },
      z: 10,
    })
  }

  // ── 2. Per-LOT Mean Series ── (按 displayedTrimLots 绘制)
  if (lot_view.value === 'all' || lot_view.value === 'lot') {
    displayedTrimLots.value.forEach(lot => {
      const lotColor = LOT_COLORS[getLotColorIndex(lot.lot_id) % LOT_COLORS.length]
      const lotPoints: any[] = []
      steps.forEach((st: any) => {
        const origX = st.step_index
        const newX = origToNewStepMap[origX] ?? origX
        const rawVal = getTrimStepLotMean(st, lot.lot_id)
        if (rawVal == null) return
        const plotVal = rawVal * factor
        allVals.push(plotVal)
        lotPoints.push([newX, plotVal])
        allFitPoints.push({ x: newX, y: plotVal })
      })
      lotPoints.sort((a, b) => a[0] - b[0])
      series.push({
        name: trimLotName(lot),
        type: 'line',
        data: lotPoints,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: lotColor, width: 2.0, opacity: 0.85 },
        itemStyle: { color: lotColor, opacity: 1 },
        z: 5,
      })
    })
  }

  // Linear Regression (y = ax + b) for Invert
  let formulaText = ''
  let fitA = 0
  let fitB = 0
  if (trimInvert.value && allFitPoints.length >= 2) {
    const M = allFitPoints.length
    const sumX = allFitPoints.reduce((acc, p) => acc + p.x, 0)
    const sumY = allFitPoints.reduce((acc, p) => acc + p.y, 0)
    const meanX = sumX / M
    const meanY = sumY / M
    let num = 0
    let den = 0
    allFitPoints.forEach(p => {
      num += (p.x - meanX) * (p.y - meanY)
      den += (p.x - meanX) * (p.x - meanX)
    })
    fitA = den !== 0 ? num / den : 0
    fitB = meanY - fitA * meanX
    let ssTot = 0
    let ssRes = 0
    allFitPoints.forEach(p => {
      const pred = fitA * p.x + fitB
      ssTot += (p.y - meanY) * (p.y - meanY)
      ssRes += (p.y - pred) * (p.y - pred)
    })
    const r2 = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 1
    const sign = fitB >= 0 ? '+' : '-'
    formulaText = `📈 Trend: y = ${fitA.toFixed(5)}x ${sign} ${Math.abs(fitB).toFixed(4)} (R² = ${r2.toFixed(4)})`
    const lastX = Math.max(0, sortedStepIndices.length - 1)
    series.push({
      name: 'y = ax + b',
      type: 'line',
      data: [
        [0, parseFloat(fitB.toFixed(6))],
        [lastX, parseFloat((fitA * lastX + fitB).toFixed(6))],
      ],
      showSymbol: false,
      lineStyle: { color: '#ff4d4f', type: 'dashed', width: 2.5 },
      itemStyle: { color: '#ff4d4f' },
      z: 15,
    })
  }

  const baseParam = selectedTrimGroup.value || ''
  const totalDies = trimAllCurves.value.length
  let modeInfo = ''
  if (trimShift.value) modeInfo += ' | ⚡ [Shift Active]'
  if (trimRobust.value) modeInfo += ' | 🛡️ [Robust (10% Trimmed)]'
  if (trimInvert.value) modeInfo += ' | 🔄 [Invert]'
  const lastX = trimInvert.value ? Math.max(0, sortedStepIndices.length - 1) : (steps.length ? Math.max(...steps.map((s: any) => s.step_index), 1) : 1)

  trimScatterChart.setOption({
    title: {
      text: `${baseParam}`,
      subtext: `Trim ${steps.length} Steps | ${totalDies} Dies | Unit: ${trimUnit.value || '-'} | ${activeChipLabel.value}${modeInfo}`,
      left: 'center',
      textStyle: { fontSize: 13 },
      subtextStyle: { fontSize: 11, color: (trimShift.value || trimRobust.value || trimInvert.value) ? '#722ed1' : '#666', fontWeight: (trimShift.value || trimRobust.value || trimInvert.value) ? 'bold' : 'normal' },
    },
    graphic: (trimInvert.value && formulaText) ? [{
      type: 'text',
      left: 'center',
      bottom: 38,
      style: { text: formulaText, fill: '#cf1322', font: 'bold 11px sans-serif' },
      z: 20,
    }] : [],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#9254de', type: 'dashed', width: 1.5 } },
      formatter: (params: any) => {
        const paramArr = Array.isArray(params) ? params : [params]
        if (!paramArr || !paramArr.length) return ''
        const first = paramArr.find((p: any) => p.data && p.data[0] !== null && p.data[0] !== undefined)
        if (!first) return ''
        const d = first.data
        const stepX = Math.round(d[0])
        const origStepIdx = trimInvert.value ? (sortedStepIndices[stepX] ?? stepX) : stepX
        const stepInfo = steps.find((s: any) => s.step_index === origStepIdx)
        let header = `<div style="font-size:13px;font-weight:bold;margin-bottom:4px;border-bottom:1px solid #f0f0f0;padding-bottom:2px">Step ${origStepIdx}</div>`
        if (trimInvert.value) {
          header = `<div style="font-size:13px;font-weight:bold;margin-bottom:4px;border-bottom:1px solid #f0f0f0;padding-bottom:2px">原始 Step ${origStepIdx}<div style="font-size:11px;color:#888;font-weight:normal">从小到大排序序号: ${stepX}</div></div>`
        }
        let content = ''
        if (stepInfo) {
          content = `<div style="margin-bottom:4px"><b>all_mean (Post-Pre):</b> <span style="color:#722ed1;font-weight:bold">${getStepAllMean(stepInfo) != null ? (getStepAllMean(stepInfo)! * factor).toFixed(4) : '-'}</span> ${deltaUnit || ''}</div>
            <div style="font-size:11px;color:#666;margin-top:2px">Pre_mean: <b>${stepInfo.pre_mean != null ? stepInfo.pre_mean.toFixed(4) : '-'}</b> | Post_mean: <b>${stepInfo.post_mean != null ? stepInfo.post_mean.toFixed(4) : '-'}</b> | Qty: <b>${stepInfo.exec_qty ?? '-'}</b></div>`
        }
        paramArr.forEach((p: any) => {
          if (p.seriesName !== 'ALL Mean' && p.seriesName !== 'y = ax + b' && p.data && p.data[1] != null) {
            content += `<div style="font-size:11px;margin-top:2px">${p.marker} ${p.seriesName}: <b>${p.data[1].toFixed(4)}</b></div>`
          }
        })
        if (trimInvert.value && allFitPoints.length >= 2) {
          const fitted = fitA * stepX + fitB
          content += `<div style="font-size:11px;color:#ff4d4f;margin-top:2px;border-top:1px dashed #ffd666;padding-top:2px"><b>趋势拟合值 (y=ax+b):</b> ${fitted.toFixed(6)} ${deltaUnit || ''}</div>`
        }
        return header + content
      },
    },
    legend: { show: false },
    grid: { top: 48, bottom: 35, left: 55, right: 25 },
    xAxis: {
      type: 'value',
      name: 'Step',
      min: 0,
      max: lastX,
      interval: lastX > 32 ? 4 : (lastX > 16 ? 2 : 1),
      axisTick: { show: true },
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
      axisLabel: {
        fontSize: 10,
        formatter: (v: number) => {
          const idx = Math.round(v)
          if (trimInvert.value) {
            const origIdx = sortedStepIndices[idx]
            return origIdx !== undefined ? `${origIdx}` : `${idx}`
          }
          return `${idx}`
        },
      },
    },
    yAxis: {
      type: 'value',
      name: deltaUnit ? `Δ (${deltaUnit})` : (trimUnit.value || ''),
      nameLocation: 'middle',
      nameRotate: 90,
      nameGap: 40,
      axisLine: { show: true, lineStyle: { color: '#333' } },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    series,
  }, true)
}

function toggleTrimShift() {
  trimShift.value = !trimShift.value
  renderTrimScatter()
}

function toggleTrimRobust() {
  trimRobust.value = !trimRobust.value
  renderTrimScatter()
}

function toggleTrimInvert() {
  trimInvert.value = !trimInvert.value
  renderTrimScatter()
}

function toggleTrimScatterZoom() {
  trimScatterZoom2x.value = !trimScatterZoom2x.value
  nextTick(() => {
    if (trimScatterChart) trimScatterChart.resize()
  })
}

function onTrimCalcInputChange() {
  renderTrimScatter()
}

function onParamSelectChange() {
  if (trimMode.value) {
    selectedTrimGroup.value = currentParamName.value
    loadTrimData()
    return
  }
  addTab()
}

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

// ── Trim Step 逻辑 ──
function buildTrimGroups(items: any[]): any[] {
  if (!items || items.length === 0) return []
  const groupsMap: Map<string, any> = new Map()
  let i = 0
  while (i < items.length) {
    const item = items[i]
    const name = item.item_name
    const low = name.toLowerCase()
    const m_pre = name.match(/^(.*?)(?:_pre|pre)(1)?$/i)
    const isScanSuffix = /_pre\d+$/i.test(name) && !/_pre1$/i.test(name)

    if (m_pre && !isScanSuffix && !['_bit', 'bit', 'code', 'target', 'delta', 'stress', 'leak', 'status', 'max', 'min'].some(k => low.includes(k))) {
      let basePrefix = m_pre[1].replace(/_+$/, '')
      const groupItems = [item]
      let j = i + 1
      while (j < items.length) {
        const nextItem = items[j]
        const nextName = nextItem.item_name
        const nextLow = nextName.toLowerCase()
        const m_next_pre = nextName.match(/^(.*?)(?:_pre|pre)(1)?$/i)
        const nextIsScan = /_pre\d+$/i.test(nextName) && !/_pre1$/i.test(nextName)
        if (m_next_pre && !nextIsScan && !['_bit', 'bit', 'code', 'target', 'delta', 'stress', 'leak', 'status', 'max', 'min', 'post', 'sim'].some(k => nextLow.includes(k))) break
        if (nextLow.includes(basePrefix.toLowerCase()) || (basePrefix.length >= 3 && nextLow.startsWith(basePrefix.toLowerCase().slice(0, 3)))) {
          groupItems.push(nextItem)
          j++
        } else break
      }

      let preItem: any = null, preBitItem: any = null, postItem: any = null, postBitItem: any = null, targetItem: any = null
      for (const git of groupItems) {
        const gname = git.item_name
        const glow = gname.toLowerCase()
        if (glow.endsWith('_pre') || glow.endsWith('pre') || glow.endsWith('_pre1')) {
          if (!preItem && !glow.includes('bit') && !glow.includes('code')) preItem = git
        } else if (['pre_bit', 'prebit', 'pre_code', 'precode'].some(k => glow.includes(k))) preBitItem = git
        else if (['post_bit', 'postbit', 'post_code', 'postcode', 'trimcode'].some(k => glow.includes(k))) postBitItem = git
        else if (glow.endsWith('_post') || glow.endsWith('post') || glow.endsWith('_sim') || glow.endsWith('sim') || glow.endsWith('_after')) {
          if (!postItem && !glow.includes('bit') && !glow.includes('code')) postItem = git
        } else if (glow.endsWith('_target') || glow.endsWith('target')) targetItem = git
        else if ((glow.includes('code') || glow.includes('bit')) && !preBitItem && !postBitItem) postBitItem = git
      }

      const hasIntParam = groupItems.some((git: any) => git.is_integer === true)
      if (preItem && (postItem || postBitItem) && hasIntParam) {
        const baseParam = basePrefix || preItem.item_name
        groupsMap.set(baseParam, {
          base_param: baseParam,
          item_number: preItem.item_number,
          pre_param: preItem.item_name,
          pre_bit_param: preBitItem?.item_name,
          post_param: postItem?.item_name,
          post_bit_param: postBitItem?.item_name,
          target_param: targetItem?.item_name,
        })
        i = j - 1
      }
    }
    i++
  }
  return Array.from(groupsMap.values())
}

async function toggleTrimMode() {
  trimMode.value = !trimMode.value
  if (!trimMode.value) return
  if (!trimGroups.value.length) {
    if (!paramList.value.length) {
      try { await fetchParamList() } catch (e) { console.error(e) }
    }
    trimGroups.value = buildTrimGroups(paramList.value)
  }
  if (trimGroups.value.length) {
    let matched = trimGroups.value.find((g: any) => g.base_param === currentParamName.value || g.pre_param === currentParamName.value)
    if (!matched) matched = trimGroups.value[0]
    selectedTrimGroup.value = matched.base_param
    currentParamName.value = matched.base_param
  }
  lot_view.value = 'all'
  activeLots.value = []
  await loadTrimData()
}

async function loadTrimData() {
  if (!selectedTrimGroup.value) return
  const g = trimGroups.value.find((x: any) => x.base_param === selectedTrimGroup.value)
  if (!g) return
  trimLoading.value = true
  trimLotsData.value = []
  trimAllSteps.value = []
  trimAllCurves.value = []
  try {
    const params: any = {
      lot_ids: lotIdsStr,
      filter_type: 'all',
      sigma: 3,
      data_range: 'final',
      pre_param: g.pre_param,
      pre_bit_param: g.pre_bit_param,
      post_param: g.post_param,
      post_bit_param: g.post_bit_param,
      target_param: g.target_param,
    }
    const data: any = await api.get('/analysis/multi/trim_step_data', { params })
    trimLotsData.value = data.lots || []
    trimAllSteps.value = data.all_steps || []
    trimAllCurves.value = data.all_curves || []
    trimUnit.value = data.unit || ''
    trimLowerLimit.value = data.lower_limit ?? null
    trimUpperLimit.value = data.upper_limit ?? null
    trimTargetParamName.value = data.target_param_name || ''
    trimTargetValue.value = data.target_value ?? null
    trimCalc.value.targetVal = data.target_value ?? null
    trimCalc.value.preVal = null
    trimCalc.value.preCode = 0
  } catch (e: any) {
    console.error('Trim data fetch failed:', e)
    alert('Trim 数据获取失败: ' + (e.response?.data?.detail || e.message))
  } finally {
    trimLoading.value = false
    nextTick(() => {
      renderTrimScatter()
      syncTrimCalcDefaults()
    })
  }
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
  if (trimMode.value) {
    const list = trimGroups.value
    const cur = currentParamName.value
    const idx = list.findIndex(g => g.base_param === cur || g.pre_param === cur)
    if (idx > 0 && list[idx - 1]) {
      const prevGroup = list[idx - 1]
      currentParamName.value = prevGroup.base_param
      selectedTrimGroup.value = prevGroup.base_param
      loadTrimData()
    }
  } else {
    const idx = paramList.value.findIndex(p => p.item_name === currentParamName.value)
    if (idx > 0) { currentParamName.value = paramList.value[idx - 1].item_name; addTab() }
  }
}

function nextParam() {
  if (trimMode.value) {
    const list = trimGroups.value
    const cur = currentParamName.value
    const idx = list.findIndex(g => g.base_param === cur || g.pre_param === cur)
    if (idx >= 0 && idx < list.length - 1 && list[idx + 1]) {
      const nextGroup = list[idx + 1]
      currentParamName.value = nextGroup.base_param
      selectedTrimGroup.value = nextGroup.base_param
      loadTrimData()
    }
  } else {
    const idx = paramList.value.findIndex(p => p.item_name === currentParamName.value)
    if (idx < paramList.value.length - 1) { currentParamName.value = paramList.value[idx + 1].item_name; addTab() }
  }
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

  const isSingleMode = tab.options.histMode === 'single'

  if (exceeds_limit && ll_bin_index != null && ul_bin_index != null) {
    // ═══ 超限模式：使用 category 轴，每个 bin 等宽 ═══
    const binLabels: string[] = []
    for (let i = 0; i < numBins; i++) {
      binLabels.push(((edges[i] + edges[i + 1]) / 2).toFixed(3))
    }

    const series: any[] = []
    if (isSingleMode) {
      const totalCounts = new Array(numBins).fill(0)
      lots.forEach((lot: any) => {
        const cArr = lot.histogram?.counts || lot.counts || []
        cArr.forEach((cnt: number, i: number) => {
          if (i < numBins) totalCounts[i] += cnt
        })
      })

      const overallMean = countValid ? sumMean / countValid : 0
      const overallStdev = countValid ? sumStdev / countValid : 0
      const sigma6L = overallMean - 6 * overallStdev
      const sigma6U = overallMean + 6 * overallStdev

      const normalData = totalCounts.map((cnt: number, i: number) => {
        const center = (edges[i] + edges[i + 1]) / 2
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return '-'
        return cnt
      })
      const outlierData = totalCounts.map((cnt: number, i: number) => {
        const center = (edges[i] + edges[i + 1]) / 2
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return cnt
        return '-'
      })

      series.push({
        type: 'bar',
        name: tab.options.single_lot_name || 'All LOTs',
        data: normalData,
        itemStyle: { color: '#4dabf7', opacity: 0.7 },
        barGap: '-100%',
        barWidth: '90%',
      })

      if (outlierData.some((d: any) => d !== '-')) {
        series.push({
          type: 'bar',
          name: tab.options.single_lot_name || 'All LOTs',
          data: outlierData,
          itemStyle: { color: '#4dabf7', opacity: 0.7 },
          barGap: '-100%',
          barWidth: '90%',
          barMinHeight: 5,
        })
      }
    } else {
      lots.forEach((lot: any, idx: number) => {
        const siteStats = lot.stats
        const sigma6L = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean - 6 * siteStats.stdev : -Infinity
        const sigma6U = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean + 6 * siteStats.stdev : Infinity
        const lotColor = LOT_COLORS[idx % LOT_COLORS.length]
        const cArr = lot.histogram?.counts || lot.counts || []

        const normalData = cArr.map((cnt: number, i: number) => {
          const center = (edges[i] + edges[i + 1]) / 2
          if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return '-'
          return cnt
        })
        const outlierData = cArr.map((cnt: number, i: number) => {
          const center = (edges[i] + edges[i + 1]) / 2
          if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return cnt
          return '-'
        })

        series.push({
          type: 'bar',
          name: getLotDisplayName(lot),
          data: normalData,
          itemStyle: { color: lotColor, opacity: 0.7 },
          barGap: '-100%',
          barWidth: '90%',
        })

        if (outlierData.some((d: any) => d !== '-')) {
          series.push({
            type: 'bar',
            name: getLotDisplayName(lot),
            data: outlierData,
            itemStyle: { color: lotColor, opacity: 0.7 },
            barGap: '-100%',
            barWidth: '90%',
            barMinHeight: 5,
          })
        }
      })
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

    if (tab.options.filter_type === 'filter_by_sigma' && countValid > 0) {
      const n = tab.options.sigma ?? 3
      const avgMean = sumMean / countValid
      const avgStdev = sumStdev / countValid
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
        text: `${tab.item_number || ''}.${param_name}`,
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
            if (p.value !== '-' && p.value > 0) tip += `<div>${p.marker} ${p.seriesName}: ${p.value}</div>`
          })
          return tip
        }
      },
      legend: {
        bottom: 5,
        type: 'scroll',
        data: tab.options.histMode === 'lot' ? lots.map((l: any) => getLotDisplayName(l)) : [tab.options.single_lot_name || 'All LOTs']
      },
      xAxis: {
        type: 'category',
        data: binLabels,
        name: unit,
        axisLine: { onZero: false, show: false },
        axisTick: { alignWithLabel: true, show: true },
        splitLine: { show: true, lineStyle: { type: 'dashed' } },
        axisLabel: {
          rotate: 30,
          fontSize: 10,
          interval: 0,
          formatter: (_: string, index: number) => {
            if (labelPositions.has(index)) {
              if (index === ll_bin_index && ll != null) return `LL:${ll.toFixed(4)}`
              if (index === ul_bin_index && ul != null) return `UL:${ul.toFixed(4)}`
              return edges[index]?.toFixed(3) ?? ''
            }
            return ''
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Parts',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 40,
        axisLine: { show: true, onZero: false, lineStyle: { color: '#333' } },
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      series,
    }, true)
  } else {
    // ═══ 正常模式：使用 value 轴 ═══
    const { xMin, xMax, ticks } = calcHistXRange(globalMin, globalMax, ll, ul, edges[0], edges[edges.length - 1])
    const binCenters = edges.slice(0, -1).map((e: number, i: number) => (e + edges[i + 1]) / 2)
    const xRange = xMax - xMin
    const binW = edges[1] - edges[0]
    const barWidthPct = Math.max(8, (binW / xRange) * 700)

    const series: any[] = []

    if (isSingleMode) {
      const totalCounts = new Array(numBins).fill(0)
      lots.forEach((lot: any) => {
        const cArr = lot.histogram?.counts || lot.counts || []
        cArr.forEach((cnt: number, i: number) => {
          if (i < numBins) totalCounts[i] += cnt
        })
      })

      const normalData: any[] = []
      const outlierData: any[] = []
      const overallMean = countValid ? sumMean / countValid : 0
      const overallStdev = countValid ? sumStdev / countValid : 0
      const sigma6L = overallMean - 6 * overallStdev
      const sigma6U = overallMean + 6 * overallStdev

      totalCounts.forEach((cnt: number, i: number) => {
        const center = (edges[i] + edges[i + 1]) / 2
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) {
          outlierData.push([binCenters[i], cnt])
        } else {
          normalData.push([binCenters[i], cnt])
        }
      })

      series.push({
        type: 'bar',
        name: tab.options.single_lot_name || 'All LOTs',
        data: normalData,
        itemStyle: { color: '#4dabf7', opacity: 0.7 },
        barGap: '-100%',
        barWidth: barWidthPct,
      })

      if (outlierData.length > 0) {
        series.push({
          type: 'bar',
          name: tab.options.single_lot_name || 'All LOTs',
          data: outlierData,
          itemStyle: { color: '#4dabf7', opacity: 0.7 },
          barGap: '-100%',
          barWidth: barWidthPct,
          barMinHeight: 5,
        })
      }
    } else {
      lots.forEach((lot: any, idx: number) => {
        const siteStats = lot.stats
        const sigma6L = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean - 6 * siteStats.stdev : -Infinity
        const sigma6U = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean + 6 * siteStats.stdev : Infinity

        const normalData: any[] = []
        const outlierData: any[] = []
        const lotColor = LOT_COLORS[idx % LOT_COLORS.length]
        const cArr = lot.histogram?.counts || lot.counts || []

        cArr.forEach((cnt: number, i: number) => {
          const center = (edges[i] + edges[i + 1]) / 2
          if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) {
            outlierData.push([binCenters[i], cnt])
          } else {
            normalData.push([binCenters[i], cnt])
          }
        })

        series.push({
          type: 'bar',
          name: getLotDisplayName(lot),
          data: normalData,
          itemStyle: { color: lotColor, opacity: 0.7 },
          barGap: '-100%',
          barWidth: barWidthPct,
        })

        if (outlierData.length > 0) {
          series.push({
            type: 'bar',
            name: getLotDisplayName(lot),
            data: outlierData,
            itemStyle: { color: lotColor, opacity: 0.7 },
            barGap: '-100%',
            barWidth: barWidthPct,
            barMinHeight: 5,
          })
        }
      })
    }

    const markLineData: any[] = []
    if (ll != null) {
      markLineData.push({
        xAxis: ll,
        label: { formatter: `LL:${ll.toFixed(4)}`, position: 'middle', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }
    if (ul != null) {
      markLineData.push({
        xAxis: ul,
        label: { formatter: `UL:${ul.toFixed(4)}`, position: 'middle', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }

    if (tab.options.filter_type === 'filter_by_sigma' && countValid > 0) {
      const n = tab.options.sigma ?? 3
      const avgMean = sumMean / countValid
      const avgStdev = sumStdev / countValid
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
        text: `${tab.item_number || ''}.${param_name}`,
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
  height: 100%;
  overflow-y: auto;
  overflow-x: auto;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #f0f2f5;
  flex-shrink: 0;
}

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

.option-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
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

.content-row {
  flex: 1;
  display: flex;
  gap: 12px;
  overflow-y: auto;
  overflow-x: auto;
}

.charts-area {
  width: 1100px;
  max-width: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
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

/* Trim Step Mode button (紫色风格对齐单LOT) */
.option-item .btn-trim-step {
  padding: 4px 10px;
  background: #722ed1;
  color: #fff;
  border: 1px solid #531dab;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  line-height: 1.2;
  white-space: nowrap;
}
.option-item .btn-trim-step:hover {
  background: #9254de;
  border-color: #722ed1;
}
.option-item .btn-trim-step.active {
  background: #391085;
  border-color: #22075e;
  box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.4);
}

/* 图表显示控制栏 */
.viz-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 12px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

/* Site / LOT 选择 chips */
.site-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 16px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  color: #fff;
  background: var(--chip-bg, #999);
  opacity: 0.35;
  transition: opacity .15s, transform .1s;
}
.chip:hover { opacity: 0.7; }
.chip.active {
  opacity: 1;
  border-color: #1a1a2e;
  box-shadow: 0 0 0 1px rgba(0,0,0,.15);
}
.chip-all {
  background: #2b2b3c;
  color: #ffd43b;
}
.chip-all.active { background: #495057; }

.trim-empty {
  color: #999;
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

/* Scatter 轴模式控件（同单LOT） */
.scatter-axis-mode-box {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  width: 100%;
  box-sizing: border-box;
}
.axis-mode-btn {
  border: 1px solid #d9d9d9;
  background: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
  white-space: nowrap;
}
.axis-mode-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}
.axis-mode-btn.active {
  background: #1890ff;
  border-color: #1890ff;
  color: #fff;
  font-weight: 600;
}

/* Step 统计表（风格同单LOT） */
.stats-table-trim {
  min-height: 290px;
  max-height: 380px;
  overflow-y: auto;
  border: 1px solid #f0f0f0;
}
.stats-table-trim table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.stats-table-trim th,
.stats-table-trim td {
  border: 1px solid #f0f0f0;
  padding: 4px 8px;
  text-align: center;
  white-space: nowrap;
}
.stats-table-trim th {
  background: #fafafa;
  font-weight: 600;
  color: #666;
}
.site-cell-label {
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.chart-container {
  width: 100%;
  box-sizing: border-box;
  background: #fafafa;
  border-radius: 4px;
  padding: 8px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

/* Chart legend (chip style, matching top site chips) */
.chart-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  margin-top: 8px;
  position: relative;
  z-index: 2;
}
.chart-legend-item {
  display: inline-flex;
  align-items: center;
  min-width: 30px;
  padding: 2px 9px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--lg-color, #999);
  border-radius: 6px;
  line-height: 1.4;
  user-select: none;
}

/* Trim Calc 5x2 Box */
.trim-calc-box {
  width: 100%;
  background: #ffffff;
  border: 1px solid #d3adf7;
  border-radius: 6px;
  margin-top: 10px;
  padding: 10px 14px;
  box-shadow: 0 2px 6px rgba(114, 46, 209, 0.08);
}
.trim-calc-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.trim-calc-title {
  font-size: 13px;
  font-weight: 700;
  color: #531dab;
}
.trim-calc-target-info {
  font-size: 11px;
  color: #888;
  margin-left: 8px;
}
.trim-calc-table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
  font-size: 13px;
}
.trim-calc-table th {
  background: #f9f0ff;
  color: #531dab;
  padding: 6px 8px;
  border: 1px solid #efdbff;
  font-weight: 600;
}
.trim-calc-table td {
  padding: 6px 8px;
  border: 1px solid #efdbff;
  background: #fff;
}
.trim-calc-input {
  width: 110px;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #333;
}
.trim-calc-input:focus {
  border-color: #722ed1;
  outline: none;
  box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.2);
}
.trim-calc-result-val {
  font-size: 14px;
  font-weight: 700;
  color: #389e0d;
}
.trim-calc-diff {
  font-size: 11px;
  color: #888;
  margin-left: 4px;
}
.trim-calc-result-code {
  font-size: 13px;
  font-weight: 700;
  color: #722ed1;
  background: #f9f0ff;
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
