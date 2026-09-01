<template>
  <div class="trim-optimizer-panel">
    <!-- Top Mode Tab Bar -->
    <div class="panel-tab-bar">
      <button
        class="panel-tab-btn"
        :class="{ active: activeMode === 'predictor' }"
        @click="activeMode = 'predictor'"
      >
        ⚡ 快速目标校准 (Predictor)
      </button>
      <button
        class="panel-tab-btn"
        :class="{ active: activeMode === 'optimizer' }"
        @click="switchModeToOptimizer"
      >
        🎯 全量良率与CPK寻优 (Shift Optimizer)
        <span class="badge-pro">PRO</span>
      </button>

      <span class="target-param-info" v-if="targetParam">
        [ 关联目标参数: {{ targetParam }} ]
      </span>
    </div>

    <!-- Mode 1: Predictor -->
    <div v-show="activeMode === 'predictor'" class="tab-panel-content">
      <div class="trim-calc-section">
        <table class="trim-calc-table">
          <thead>
            <tr>
              <th>Pre 值 (输入)</th>
              <th>Pre_code (输入)</th>
              <th>Target (目标值)</th>
              <th>Post 值 (计算)</th>
              <th>Post_code (最优Step)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  v-model.number="calcPreVal"
                  type="number"
                  step="any"
                  class="trim-calc-input"
                  placeholder="Pre数值"
                  @input="onCalcInput"
                />
              </td>
              <td>
                <input
                  v-model.number="calcPreCode"
                  type="number"
                  min="0"
                  :max="stepCount > 0 ? stepCount - 1 : 31"
                  class="trim-calc-input"
                  style="width: 80px;"
                  @input="onCalcInput"
                />
              </td>
              <td>
                <input
                  v-model.number="optTarget"
                  type="number"
                  step="any"
                  class="trim-calc-input"
                  placeholder="Target数值"
                  @input="onCalcInput"
                />
              </td>
              <td>
                <span class="trim-calc-result-val">
                  {{ calcResult.postVal != null ? calcResult.postVal.toFixed(4) : '-' }}
                </span>
                <span class="trim-calc-diff" v-if="calcResult.diff != null">
                  (Δ: {{ calcResult.diff >= 0 ? '+' : '' }}{{ calcResult.diff.toFixed(4) }})
                </span>
              </td>
              <td>
                <span class="trim-calc-result-code">
                  {{ calcResult.postCode != null ? 'Step ' + calcResult.postCode : '-' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Fail dies detail -->
        <div class="fail-dies-wrap" v-if="failDies && failDies.length > 0">
          <div class="section-sub-header">
            <span>失效 Die 明细 (超出 Limit 标红) - 共 {{ failDies.length }} 个</span>
          </div>
          <div class="fail-dies-table-box">
            <table class="trim-calc-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>pre{{ unit ? ` (${unit})` : '' }}</th>
                  <th>precode</th>
                  <th>post{{ unit ? ` (${unit})` : '' }}</th>
                  <th>post_code</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="fd in failDies" :key="fd.die_id">
                  <td>{{ fd.die_id }}</td>
                  <td :style="{ color: fd.pre_fail ? 'red' : '', fontWeight: fd.pre_fail ? 'bold' : '' }">
                    {{ fd.pre != null ? fd.pre.toFixed(4) : '-' }}
                  </td>
                  <td>{{ fd.pre_code ?? '-' }}</td>
                  <td :style="{ color: fd.post_fail ? 'red' : '', fontWeight: fd.post_fail ? 'bold' : '' }">
                    {{ fd.post != null ? fd.post.toFixed(4) : '-' }}
                  </td>
                  <td>{{ fd.post_code ?? '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Mode 2: Shift Optimizer -->
    <div v-show="activeMode === 'optimizer'" class="tab-panel-content">
      <!-- Control toolbar -->
      <div class="optimizer-controls">
        <div class="ctrl-group">
          <label>Target:</label>
          <input v-model.number="optTarget" type="number" step="any" class="num-input" style="width:90px" />
        </div>
        <div class="ctrl-group">
          <label>LSL:</label>
          <input v-model.number="optLsl" type="number" step="any" class="num-input" style="width:90px" />
        </div>
        <div class="ctrl-group">
          <label>USL:</label>
          <input v-model.number="optUsl" type="number" step="any" class="num-input" style="width:90px" />
        </div>
        <div class="ctrl-group">
          <label>Code范围:</label>
          <input v-model.number="optTrimMin" type="number" class="num-input" style="width:50px" title="Trim Min Code" />
          <span>~</span>
          <input v-model.number="optTrimMax" type="number" class="num-input" style="width:50px" title="Trim Max Code" />
        </div>
        <div class="ctrl-group">
          <label>搜索范围(±):</label>
          <input v-model.number="optSearchRange" type="number" min="1" max="15" class="num-input" style="width:50px" />
        </div>

        <button class="btn-run-opt" :disabled="optLoading" @click="runOptimization">
          <span v-if="optLoading">⏳ 计算中...</span>
          <span v-else>🚀 执行良率寻优分析</span>
        </button>

        <button class="btn-export-opt" :disabled="!optResult || optLoading" @click="exportExcel">
          📥 导出分析报告 (Excel)
        </button>
      </div>

      <!-- Loading skeleton -->
      <div v-if="optLoading" class="opt-loading-box">
        <div class="spinner"></div>
        <div style="margin-top:8px;color:#722ed1;font-weight:600">正在进行全量 Die 向量化良率与 CPK 候选步长寻优...</div>
      </div>

      <!-- Error -->
      <div v-else-if="optError" class="opt-error-box">
        ⚠️ {{ optError }}
      </div>

      <!-- Optimization result -->
      <div v-else-if="optResult" class="opt-result-container">
        <!-- 1. KPI Cards -->
        <div class="kpi-cards-grid">
          <div class="kpi-card best-shift-card">
            <div class="kpi-label">推荐最佳 Shift</div>
            <div class="kpi-val-highlight">
              {{ optResult.recommended_shift >= 0 ? '+' : '' }}{{ optResult.recommended_shift }} Step
            </div>
            <div class="kpi-sub">
              理论计算值: {{ optResult.theoretical_shift?.toFixed(2) }} Step
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-label">预测良率提升 (Yield)</div>
            <div class="kpi-val-green">
              {{ (optResult.before_after.optimized.yield * 100).toFixed(2) }}%
            </div>
            <div class="kpi-sub">
              现状: {{ (optResult.before_after.current.yield * 100).toFixed(2) }}%
              <b style="color:#52c41a;margin-left:4px">
                ({{ optResult.yield_improvement >= 0 ? '+' : '' }}{{ (optResult.yield_improvement * 100).toFixed(2) }}%)
              </b>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-label">预测 CPK 提升</div>
            <div class="kpi-val-purple">
              {{ optResult.before_after.optimized.cpk != null ? optResult.before_after.optimized.cpk.toFixed(3) : '-' }}
            </div>
            <div class="kpi-sub">
              现状: {{ optResult.before_after.current.cpk != null ? optResult.before_after.current.cpk.toFixed(3) : '-' }}
              <span v-if="optResult.cpk_improvement != null" style="color:#722ed1;margin-left:4px">
                ({{ optResult.cpk_improvement >= 0 ? '+' : '' }}{{ optResult.cpk_improvement.toFixed(3) }})
              </span>
            </div>
          </div>

          <div class="kpi-card risk-card" :class="'risk-' + optResult.risk_level?.toLowerCase()">
            <div class="kpi-label">风险等级 & 边界裕度</div>
            <div class="kpi-val-risk">
              {{ optResult.risk_level }}
            </div>
            <div class="kpi-sub">
              边界余量: <b>{{ optResult.best_candidate?.min_margin ?? '-' }}</b> Steps |
              线性度: <b>R²={{ optResult.step_analysis?.r_squared?.toFixed(3) }}</b>
            </div>
          </div>
        </div>

        <!-- 2. Shift Optimization Chart -->
        <div class="chart-section-box">
          <div class="section-title">📊 候选 Shift 良率与 CPK 寻优趋势 (Shift vs Yield & CPK)</div>
          <div ref="shiftCurveChartEl" style="width: 100%; height: 260px;"></div>
        </div>

        <!-- 3. Candidate Table -->
        <div class="table-section-box">
          <div class="section-title">📋 候选 Shift 方案量化对比表 (Candidate Shifts Comparison)</div>
          <div class="candidate-table-wrap">
            <table class="candidate-table">
              <thead>
                <tr>
                  <th>Shift 步长</th>
                  <th>预测均值 (Mean)</th>
                  <th>预测良率 (Yield)</th>
                  <th>预测 CPK</th>
                  <th>LSL Fail</th>
                  <th>USL Fail</th>
                  <th>总失效数</th>
                  <th>边界余量 (Margin)</th>
                  <th>边界风险</th>
                  <th>方案状态</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="c in optResult.candidates"
                  :key="c.shift"
                  :class="{ 'row-best': c.status === 'Best', 'row-invalid': !c.valid }"
                >
                  <td style="font-weight:700">
                    <span v-if="c.status === 'Best'" style="margin-right:4px">⭐</span>
                    {{ c.shift >= 0 ? '+' : '' }}{{ c.shift }}
                  </td>
                  <td>{{ c.predicted_mean != null ? c.predicted_mean.toFixed(4) : '-' }}</td>
                  <td :style="{ color: c.predicted_yield >= optResult.before_after.current.yield ? '#389e0d' : '#cf1322', fontWeight: 600 }">
                    {{ (c.predicted_yield * 100).toFixed(2) }}%
                  </td>
                  <td>{{ c.predicted_cpk != null ? c.predicted_cpk.toFixed(3) : '-' }}</td>
                  <td :style="{ color: c.lsl_fail > 0 ? '#cf1322' : '#666' }">{{ c.lsl_fail }}</td>
                  <td :style="{ color: c.usl_fail > 0 ? '#cf1322' : '#666' }">{{ c.usl_fail }}</td>
                  <td><b>{{ c.total_fail }}</b></td>
                  <td>{{ c.min_margin }}</td>
                  <td>
                    <span :class="'badge-risk badge-risk-' + c.boundary_risk?.toLowerCase()">
                      {{ c.boundary_risk }}
                    </span>
                  </td>
                  <td>
                    <span v-if="c.status === 'Best'" class="badge-best">🌟 最优推荐</span>
                    <span v-else-if="!c.valid" class="badge-invalid">越界不可用</span>
                    <span v-else class="badge-valid">可用候选</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 4. Optimized Pre-Trim Decision Windows Table -->
        <div class="table-section-box" v-if="optResult.pre_trim_windows && optResult.pre_trim_windows.length > 0">
          <div class="section-title-row">
            <div class="section-title">
              📐 推荐 Step 优化后 Pre 值判定区间与阈值表 (Optimized Pre-Trim Windows Table)
              <span class="step-count-badge">{{ optResult.pre_trim_windows.length }} Steps</span>
            </div>
            <button class="btn-copy-code" @click="copyLookupArray">
              📋 复制 ATE 阈值数组 (C++)
            </button>
          </div>
          <div class="table-responsive" style="max-height: 280px; overflow-y: auto;">
            <table class="candidate-table pre-window-table">
              <thead>
                <tr>
                  <th>Trim Step / Code</th>
                  <th>原始 Pre 中心值</th>
                  <th>原始 Pre 判定区间</th>
                  <th style="background:#f9f0ff;color:#722ed1">优化后 Pre 中心值</th>
                  <th style="background:#f9f0ff;color:#722ed1">优化后 Pre 判定区间 (推荐)</th>
                  <th>预期 Post 输出</th>
                  <th>实测覆盖 Die 颗数</th>
                  <th>覆盖占比 (%)</th>
                  <th>边界状态</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="w in optResult.pre_trim_windows"
                  :key="w.step"
                  :class="{ 'row-active-code': w.die_count > 0, 'row-boundary-code': w.boundary_status === 'MIN_BOUNDARY' || w.boundary_status === 'MAX_BOUNDARY' }"
                >
                  <td style="font-weight:700">Step {{ w.step }}</td>
                  <td>{{ w.orig_pre_nominal != null ? w.orig_pre_nominal.toFixed(4) : '-' }}</td>
                  <td style="color:#666">{{ w.orig_pre_range_str }}</td>
                  <td style="font-weight:700;color:#722ed1">{{ w.opt_pre_nominal != null ? w.opt_pre_nominal.toFixed(4) : '-' }}</td>
                  <td style="font-weight:700;color:#1890ff;background:#f0f5ff">{{ w.opt_pre_range_str }}</td>
                  <td><b>{{ w.expected_post != null ? w.expected_post.toFixed(4) : '-' }}</b></td>
                  <td :style="{ fontWeight: w.die_count > 0 ? '700' : 'normal', color: w.die_count > 0 ? '#389e0d' : '#999' }">
                    {{ w.die_count }}
                  </td>
                  <td>{{ (w.die_ratio * 100).toFixed(1) }}%</td>
                  <td>
                    <span v-if="w.die_count > 0" class="badge-active-die">命中 ({{ w.die_count }})</span>
                    <span v-else-if="w.boundary_status === 'MIN_BOUNDARY'" class="badge-boundary">Min 边界</span>
                    <span v-else-if="w.boundary_status === 'MAX_BOUNDARY'" class="badge-boundary">Max 边界</span>
                    <span v-else class="badge-unused">未命中</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 5. Recommendation Card -->
        <div class="recommendation-box">
          <div class="rec-header">
            <span class="rec-icon">💡</span>
            <span class="rec-title">工程分析与实施建议 (Engineering Recommendation)</span>
            <span class="rec-status-tag" :class="'status-' + optResult.recommendation_status?.toLowerCase()">
              {{ optResult.recommendation_status }}
            </span>
          </div>
          <pre class="rec-text">{{ optResult.recommendation_text }}</pre>
        </div>

        <!-- 5. Wafer Recovery Map (Single LOT Mode Only) -->
        <div class="wafer-compare-section" v-if="!isMultiLot && optResult.wafer_map && optResult.wafer_map.length > 0">
          <div class="section-title">
            🗺️ 晶圆良率挽救对比分布图 (Before vs Optimized Wafer Recovery Map)
            <span class="wafer-gain-tag" v-if="optResult.wafer_recovery_stats">
              🎉 预计恢复挽救: <b>{{ optResult.wafer_recovery_stats.recovered_dies }}</b> 颗失效 Die (净增益: +{{ optResult.wafer_recovery_stats.net_gain }} 颗)
            </span>
          </div>
          <div class="wafer-canvas-row">
            <div class="wafer-canvas-col">
              <div class="canvas-label">现状实测分布 (Current Condition)</div>
              <canvas ref="currWaferCanvas" width="360" height="280" class="mini-wafer-canvas"></canvas>
            </div>
            <div class="wafer-canvas-col">
              <div class="canvas-label">
                优化预测分布 (Optimized Condition: {{ optResult.recommended_shift >= 0 ? '+' : '' }}{{ optResult.recommended_shift }} Step)
                <span style="color:#52c41a;font-size:11px">(蓝色为挽救Die)</span>
              </div>
              <canvas ref="optWaferCanvas" width="360" height="280" class="mini-wafer-canvas"></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import api from '@/api'

const props = defineProps<{
  lotIds: number[] | string
  paramName?: string
  preParam?: string
  postParam?: string
  postBitParam?: string
  targetParam?: string
  targetValue?: number | null
  lowerLimit?: number | null
  upperLimit?: number | null
  unit?: string
  dataType?: string
  dataRange?: string
  filterType?: string
  stepsData?: any[]
  failDies?: any[]
  stepCount?: number
}>()

const emit = defineEmits<{
  (e: 'calc-change', val: any): void
}>()

const activeMode = ref<'predictor' | 'optimizer'>('predictor')

// Predictor state
const calcPreVal = ref<number | null>(null)
const calcPreCode = ref<number>(0)

const isMultiLot = computed(() => {
  if (Array.isArray(props.lotIds)) {
    return props.lotIds.length > 1
  }
  if (typeof props.lotIds === 'string') {
    return props.lotIds.split(',').map(s => s.trim()).filter(Boolean).length > 1
  }
  return false
})

const stepCount = computed(() => props.stepCount ?? props.stepsData?.length ?? 0)

// Optimizer state
const optTarget = ref<number | null>(null)
const optLsl = ref<number | null>(null)
const optUsl = ref<number | null>(null)
const optTrimMin = ref<number>(0)
const optTrimMax = ref<number>(props.stepCount ? Math.max(0, props.stepCount - 1) : (props.stepsData?.length ? props.stepsData.length - 1 : 15))
const optSearchRange = ref<number>(3)

const optLoading = ref(false)
const optError = ref<string | null>(null)
const optResult = ref<any>(null)

const shiftCurveChartEl = ref<HTMLDivElement | null>(null)
let shiftChart: echarts.ECharts | null = null

const currWaferCanvas = ref<HTMLCanvasElement | null>(null)
const optWaferCanvas = ref<HTMLCanvasElement | null>(null)

watch(() => [props.paramName, props.targetValue, props.lowerLimit, props.upperLimit, props.stepCount, props.stepsData], ([, tv, ll, ul, sc, sd]) => {
  if (tv !== null && tv !== undefined) {
    optTarget.value = tv
  } else if (ll !== null && ll !== undefined && ul !== null && ul !== undefined) {
    optTarget.value = parseFloat(((ll + ul) / 2).toFixed(4))
  } else {
    optTarget.value = null
  }
  optLsl.value = (ll !== null && ll !== undefined) ? ll : null
  optUsl.value = (ul !== null && ul !== undefined) ? ul : null

  const actualMax = (sc && sc > 0) ? sc - 1 : (sd && sd.length > 0 ? sd.length - 1 : 15)
  optTrimMin.value = 0
  optTrimMax.value = actualMax

  optResult.value = null
  if (activeMode.value === 'optimizer') {
    runOptimization()
  }
}, { immediate: true })

const calcResult = computed(() => {
  const steps = props.stepsData || []
  if (steps.length === 0) return { postVal: null, postCode: null, diff: null }
  const target = optTarget.value
  if (target === null || target === undefined || isNaN(target)) return { postVal: null, postCode: null, diff: null }

  const preCode = Math.max(0, Math.min(steps.length - 1, calcPreCode.value || 0))
  const preStep = steps[preCode] || steps[0]
  const baseMean = preStep.all_mean ?? preStep.delta_mean ?? preStep.stats_all?.mean ?? 0
  const userPre = (calcPreVal.value !== null && calcPreVal.value !== undefined && !isNaN(calcPreVal.value))
    ? calcPreVal.value
    : (preStep.pre_mean ?? baseMean)

  let bestStep = 0
  let bestEst = userPre
  let minDiff = Infinity

  steps.forEach((s: any) => {
    const sMean = s.all_mean ?? s.delta_mean ?? s.stats_all?.mean ?? baseMean
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

function onCalcInput() {
  emit('calc-change', {
    preVal: calcPreVal.value,
    preCode: calcPreCode.value,
    targetVal: optTarget.value,
    result: calcResult.value,
  })
}

function switchModeToOptimizer() {
  activeMode.value = 'optimizer'
  if (!optResult.value && !optLoading.value) {
    runOptimization()
  } else {
    nextTick(() => {
      renderShiftCurveChart()
      drawWaferMaps()
    })
  }
}

async function runOptimization() {
  let ids: number[] = []
  if (Array.isArray(props.lotIds)) {
    ids = props.lotIds.map((x: any) => (typeof x === 'object' && x !== null && 'value' in x ? x.value : x)).map(Number).filter(x => !isNaN(x))
  } else if (typeof props.lotIds === 'string') {
    ids = props.lotIds.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x))
  } else if (typeof props.lotIds === 'number') {
    ids = [props.lotIds]
  }

  if (ids.length === 0) {
    optError.value = '未指定有效的 LOT ID'
    return
  }

  optLoading.value = true
  optError.value = null

  try {
    const payload = {
      lot_ids: ids,
      param_name: props.paramName,
      pre_param: props.preParam,
      post_param: props.postParam,
      post_bit_param: props.postBitParam,
      target_param: props.targetParam,
      target: optTarget.value,
      lsl: optLsl.value,
      usl: optUsl.value,
      trim_min: optTrimMin.value,
      trim_max: optTrimMax.value,
      search_range: optSearchRange.value,
      data_range: props.dataRange || 'final',
      filter_type: props.filterType || 'all',
    }

    const data: any = await api.post('/analysis/trim_optimization/analyze', payload)
    optResult.value = data

    if (data && data.meta) {
      if (optTarget.value == null && data.meta.target != null) optTarget.value = data.meta.target
      if (optLsl.value == null && data.meta.lsl != null) optLsl.value = data.meta.lsl
      if (optUsl.value == null && data.meta.usl != null) optUsl.value = data.meta.usl
    }

    optLoading.value = false

    await nextTick()
    renderShiftCurveChart()
    drawWaferMaps()
  } catch (e: any) {
    console.error('Trim optimization error:', e)
    optError.value = typeof e === 'string' ? e : (e.response?.data?.detail || e.message || '寻优分析失败')
  } finally {
    optLoading.value = false
  }
}

function copyLookupArray() {
  const windows = optResult.value?.pre_trim_windows
  if (!windows || !windows.length) return

  const lines: string[] = []
  lines.push('// ========================================================')
  lines.push(`// ATE Trim Pre-Voltage Decision Table (Optimized Shift: ${optResult.value.recommended_shift >= 0 ? '+' : ''}${optResult.value.recommended_shift})`)
  lines.push(`// Target: ${optTarget.value} | LSL: ${optLsl.value} | USL: ${optUsl.value}`)
  lines.push('// ========================================================')
  lines.push('struct TrimStepThreshold {')
  lines.push('    int step;')
  lines.push('    double pre_nominal;')
  lines.push('    double pre_low;')
  lines.push('    double pre_high;')
  lines.push('};')
  lines.push('')
  lines.push('const TrimStepThreshold TRIM_TABLE[] = {')
  windows.forEach((w: any) => {
    const lowStr = w.opt_pre_low != null ? w.opt_pre_low.toFixed(6) : '-1e9'
    const highStr = w.opt_pre_high != null ? w.opt_pre_high.toFixed(6) : '1e9'
    const nomStr = w.opt_pre_nominal != null ? w.opt_pre_nominal.toFixed(6) : '0.0'
    lines.push(`    { ${w.step}, ${nomStr}, ${lowStr}, ${highStr} }, // Step ${w.step}: ${w.opt_pre_range_str}`)
  })
  lines.push('};')
  lines.push('')
  lines.push('// Selection helper')
  lines.push('int select_trim_step(double v_pre) {')
  lines.push('    for (int i = 0; i < sizeof(TRIM_TABLE)/sizeof(TRIM_TABLE[0]); i++) {')
  lines.push('        if (v_pre > TRIM_TABLE[i].pre_low && v_pre <= TRIM_TABLE[i].pre_high) {')
  lines.push('            return TRIM_TABLE[i].step;')
  lines.push('        }')
  lines.push('    }')
  lines.push('    return TRIM_TABLE[0].step;')
  lines.push('}')

  const codeText = lines.join('\n')
  navigator.clipboard.writeText(codeText).then(() => {
    alert('已成功复制 ATE C++ 阈值判定数组与查找函数到剪贴板！')
  }).catch(() => {
    alert('复制失败，请手动选择复制')
  })
}

async function exportExcel() {
  if (!optResult.value) return
  let ids: number[] = []
  if (Array.isArray(props.lotIds)) {
    ids = props.lotIds.map((x: any) => (typeof x === 'object' && x !== null && 'value' in x ? x.value : x)).map(Number).filter(x => !isNaN(x))
  } else if (typeof props.lotIds === 'string') {
    ids = props.lotIds.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x))
  } else if (typeof props.lotIds === 'number') {
    ids = [props.lotIds]
  }

  try {
    const payload = {
      lot_ids: ids,
      param_name: props.paramName,
      pre_param: props.preParam,
      post_param: props.postParam,
      post_bit_param: props.postBitParam,
      target_param: props.targetParam,
      target: optTarget.value,
      lsl: optLsl.value,
      usl: optUsl.value,
      trim_min: optTrimMin.value,
      trim_max: optTrimMax.value,
      search_range: optSearchRange.value,
      data_range: props.dataRange || 'final',
      filter_type: props.filterType || 'all',
    }

    const res = await api.post('/analysis/trim_optimization/export', payload, {
      responseType: 'blob',
    })

    const url = window.URL.createObjectURL(new Blob([res as any]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Trim_Optimization_${props.paramName || 'report'}.xlsx`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (e: any) {
    alert('导出失败: ' + (e.response?.data?.detail || e.message))
  }
}

function renderShiftCurveChart() {
  if (!shiftCurveChartEl.value || !optResult.value) return
  if (!shiftChart) {
    shiftChart = echarts.init(shiftCurveChartEl.value)
  }
  shiftChart.resize()

  const candidates = optResult.value.candidates || []
  const shifts = candidates.map((c: any) => (c.shift >= 0 ? `+${c.shift}` : `${c.shift}`))
  const yields = candidates.map((c: any) => (c.predicted_yield != null ? parseFloat((c.predicted_yield * 100).toFixed(2)) : null))
  const cpks = candidates.map((c: any) => (c.predicted_cpk != null ? parseFloat(c.predicted_cpk.toFixed(3)) : null))

  const bestShiftIdx = candidates.findIndex((c: any) => c.status === 'Best')
  const bestCandidate = optResult.value.best_candidate

  const markPointsData = []
  if (bestShiftIdx >= 0 && bestCandidate) {
    markPointsData.push({
      name: 'Best Shift',
      coord: [bestShiftIdx, parseFloat((bestCandidate.predicted_yield * 100).toFixed(2))],
      value: `⭐ Best (${bestCandidate.shift >= 0 ? '+' : ''}${bestCandidate.shift})`,
      itemStyle: { color: '#52c41a' },
    })
  }

  shiftChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || !params.length) return ''
        const idx = params[0].dataIndex
        const cand = candidates[idx]
        if (!cand) return ''
        return `
          <div style="font-size:12px;font-weight:bold;margin-bottom:4px;border-bottom:1px solid #eee">
            Shift: ${cand.shift >= 0 ? '+' : ''}${cand.shift} Step ${cand.status === 'Best' ? '🌟 [最优推荐]' : ''}
          </div>
          <div>良率 (Yield): <b style="color:#52c41a">${(cand.predicted_yield * 100).toFixed(2)}%</b></div>
          <div>CPK: <b style="color:#722ed1">${cand.predicted_cpk != null ? cand.predicted_cpk.toFixed(3) : '-'}</b></div>
          <div>预测均值 (Mean): <b>${cand.predicted_mean != null ? cand.predicted_mean.toFixed(4) : '-'}</b></div>
          <div>边界余量 (Margin): <b>${cand.min_margin}</b></div>
          <div>失效数: LSL=${cand.lsl_fail} | USL=${cand.usl_fail} | Total=${cand.total_fail}</div>
        `
      },
    },
    legend: {
      data: ['预测良率 (Yield %)', '预测 CPK'],
      top: 4,
    },
    grid: {
      top: 36,
      bottom: 25,
      left: 55,
      right: 55,
    },
    xAxis: {
      type: 'category',
      name: 'Shift Step',
      data: shifts,
      axisLabel: { fontWeight: 'bold' },
      axisTick: { alignWithLabel: true },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Yield (%)',
        min: (val: any) => Math.max(0, Math.floor(val.min - 1)),
        max: 100,
        axisLabel: { formatter: '{value}%' },
        splitLine: { lineStyle: { type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'CPK',
        position: 'right',
        splitLine: { show: false },
        axisLabel: { formatter: '{value}' },
      },
    ],
    series: [
      {
        name: '预测良率 (Yield %)',
        type: 'line',
        data: yields,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { color: '#52c41a', width: 2.5 },
        itemStyle: { color: '#52c41a' },
        markPoint: {
          data: markPointsData,
        },
      },
      {
        name: '预测 CPK',
        type: 'line',
        yAxisIndex: 1,
        data: cpks,
        symbol: 'diamond',
        symbolSize: 8,
        lineStyle: { color: '#722ed1', width: 2, type: 'dashed' },
        itemStyle: { color: '#722ed1' },
      },
    ],
  }, true)
}

function drawWaferMaps() {
  if (isMultiLot.value) return
  const dies = optResult.value?.wafer_map || []
  if (!dies.length) return

  const renderToCanvas = (canvas: HTMLCanvasElement | null, mode: 'current' | 'optimized') => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    dies.forEach((d: any) => {
      minX = Math.min(minX, d.x)
      maxX = Math.max(maxX, d.x)
      minY = Math.min(minY, d.y)
      maxY = Math.max(maxY, d.y)
    })

    const spanX = Math.max(1, maxX - minX + 1)
    const spanY = Math.max(1, maxY - minY + 1)
    const padding = 15
    const cellSize = Math.max(2, Math.min((W - padding * 2) / spanX, (H - padding * 2) / spanY))

    const startX = (W - spanX * cellSize) / 2
    const startY = (H - spanY * cellSize) / 2

    dies.forEach((d: any) => {
      const px = startX + (d.x - minX) * cellSize
      const py = startY + (d.y - minY) * cellSize

      if (mode === 'current') {
        ctx.fillStyle = d.curr_pass ? '#52c41a' : '#ff4d4f'
      } else {
        if (d.state === 'recovered') {
          ctx.fillStyle = '#1890ff'
        } else if (d.pred_pass) {
          ctx.fillStyle = '#52c41a'
        } else {
          ctx.fillStyle = '#ff4d4f'
        }
      }

      ctx.fillRect(px, py, cellSize - 0.5, cellSize - 0.5)
    })
  }

  nextTick(() => {
    renderToCanvas(currWaferCanvas.value, 'current')
    renderToCanvas(optWaferCanvas.value, 'optimized')
  })
}
</script>

<style scoped>
.trim-optimizer-panel {
  width: 100%;
  background: #ffffff;
  border: 1px solid #d3adf7;
  border-radius: 6px;
  margin-top: 10px;
  padding: 10px 14px;
  box-shadow: 0 2px 6px rgba(114, 46, 209, 0.08);
  box-sizing: border-box;
}

.panel-tab-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 8px;
}
.panel-tab-btn {
  padding: 5px 14px;
  border: 1px solid #d9d9d9;
  background: #fff;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: #555;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.panel-tab-btn:hover {
  color: #722ed1;
  border-color: #b37feb;
}
.panel-tab-btn.active {
  background: #722ed1;
  color: #fff;
  border-color: #531dab;
  box-shadow: 0 2px 4px rgba(114, 46, 209, 0.2);
}
.badge-pro {
  background: #faad14;
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 700;
}
.target-param-info {
  font-size: 12px;
  color: #888;
  margin-left: auto;
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

.fail-dies-wrap {
  margin-top: 10px;
}
.section-sub-header {
  font-size: 12px;
  font-weight: 700;
  color: #cf1322;
  margin-bottom: 4px;
}
.fail-dies-table-box {
  max-height: 200px;
  overflow: auto;
  border: 1px solid #f0f0f0;
}

.optimizer-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 10px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  margin-bottom: 12px;
}
.ctrl-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #444;
}
.ctrl-group label {
  font-weight: 600;
}
.num-input {
  padding: 3px 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}
.btn-run-opt {
  padding: 4px 14px;
  background: #722ed1;
  color: #fff;
  border: 1px solid #531dab;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-run-opt:hover:not(:disabled) {
  background: #9254de;
}
.btn-export-opt {
  padding: 4px 12px;
  background: #1890ff;
  color: #fff;
  border: 1px solid #096dd9;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  margin-left: auto;
}
.btn-export-opt:disabled, .btn-run-opt:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.kpi-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}
.kpi-card {
  background: #fafafa;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 10px 12px;
  text-align: center;
}
.best-shift-card {
  background: #f9f0ff;
  border-color: #d3adf7;
}
.kpi-label {
  font-size: 11px;
  color: #666;
  font-weight: 600;
  margin-bottom: 4px;
}
.kpi-val-highlight {
  font-size: 20px;
  font-weight: 800;
  color: #722ed1;
}
.kpi-val-green {
  font-size: 20px;
  font-weight: 800;
  color: #389e0d;
}
.kpi-val-purple {
  font-size: 20px;
  font-weight: 800;
  color: #1890ff;
}
.kpi-val-risk {
  font-size: 18px;
  font-weight: 800;
}
.kpi-sub {
  font-size: 11px;
  color: #888;
  margin-top: 4px;
}
.risk-card.risk-low .kpi-val-risk { color: #389e0d; }
.risk-card.risk-medium .kpi-val-risk { color: #fa8c16; }
.risk-card.risk-high .kpi-val-risk { color: #cf1322; }

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #333;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-section-box, .table-section-box {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 12px;
}
.candidate-table-wrap {
  max-height: 240px;
  overflow: auto;
}
.candidate-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: center;
}
.candidate-table th {
  background: #fafafa;
  color: #555;
  padding: 5px 8px;
  border: 1px solid #e8e8e8;
  position: sticky;
  top: 0;
  z-index: 2;
}
.candidate-table td {
  padding: 5px 8px;
  border: 1px solid #f0f0f0;
  background: #fff;
}
.candidate-table tr.row-best td {
  background: #f6ffed !important;
  font-weight: 600;
}
.candidate-table tr.row-invalid td {
  background: #fff1f0 !important;
  color: #999;
}

.badge-best {
  background: #52c41a;
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.badge-valid {
  background: #e6f7ff;
  color: #1890ff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.badge-invalid {
  background: #fff1f0;
  color: #ff4d4f;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.badge-risk {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}
.badge-risk-low { background: #f6ffed; color: #52c41a; }
.badge-risk-warning { background: #fffbe6; color: #fa8c16; }
.badge-risk-high_risk_at_boundary { background: #fff2e8; color: #d4380d; }
.badge-risk-high_risk_out_of_bounds { background: #fff1f0; color: #cf1322; }

.recommendation-box {
  background: #f9f0ff;
  border: 1px solid #d3adf7;
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 12px;
}
.rec-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.rec-title {
  font-size: 13px;
  font-weight: 700;
  color: #531dab;
}
.rec-status-tag {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
.rec-status-tag.status-recommended { background: #52c41a; color: #fff; }
.rec-status-tag.status-optional { background: #faad14; color: #fff; }
.rec-status-tag.status-no_significant_improvement { background: #d9d9d9; color: #555; }
.rec-text {
  font-family: inherit;
  font-size: 12px;
  color: #333;
  margin: 0;
  line-height: 1.5;
  white-space: pre-wrap;
}

.wafer-compare-section {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 10px;
}
.wafer-gain-tag {
  font-size: 12px;
  color: #1890ff;
  margin-left: auto;
  font-weight: 600;
}
.wafer-canvas-row {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 8px;
}
.wafer-canvas-col {
  text-align: center;
}
.canvas-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  margin-bottom: 4px;
}
.mini-wafer-canvas {
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}

.opt-loading-box {
  padding: 30px;
  text-align: center;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #efdbff;
  border-top-color: #722ed1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.opt-error-box {
  background: #fff1f0;
  border: 1px solid #ffa39e;
  padding: 10px 14px;
  border-radius: 4px;
  color: #cf1322;
  font-size: 13px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.step-count-badge {
  font-size: 11px;
  background: #f0f5ff;
  color: #1890ff;
  border: 1px solid #adc6ff;
  border-radius: 10px;
  padding: 1px 7px;
  margin-left: 6px;
  font-weight: normal;
}
.btn-copy-code {
  padding: 3px 10px;
  font-size: 12px;
  background: #fff;
  border: 1px solid #b37feb;
  color: #722ed1;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-copy-code:hover {
  background: #722ed1;
  color: #fff;
}

.pre-window-table th {
  background: #fafafa;
  font-size: 12px;
}
.pre-window-table tr.row-active-code td {
  background: #fcffe6 !important;
}
.pre-window-table tr.row-boundary-code td {
  background: #fffbe6 !important;
}

.badge-active-die {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.badge-boundary {
  background: #fff7e6;
  color: #fa8c16;
  border: 1px solid #ffd591;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}
.badge-unused {
  background: #f5f5f5;
  color: #bfbfbf;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}
</style>
