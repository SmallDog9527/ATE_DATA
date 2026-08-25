<template>
  <div class="corr-view">
    <!-- 顶部LOT信息栏 -->
    <div class="lot-info-bar" v-if="lotInfo">
      <div class="info-grid">
        <div class="info-item"><span class="label">名称</span><span class="value">{{ lotInfo.filename }}</span></div>
        <div class="info-item"><span class="label">程序</span><span class="value">{{ lotInfo.program }}</span></div>
        <div class="info-item"><span class="label">测试机</span><span class="value">{{ lotInfo.test_machine }}</span></div>
        <div class="info-item"><span class="label">测试数量</span><span class="value">{{ lotInfo.die_count }}</span></div>
        <div class="info-item">
          <span class="label">良率</span>
          <span class="value" :style="yieldColor(lotInfo.yield_rate)">
            {{ lotInfo.yield_rate ? (lotInfo.yield_rate * 100).toFixed(2) + '%' : '-' }}
          </span>
        </div>
        <div class="info-item"><span class="label">测试阶段</span><span class="value">{{ lotInfo.data_type }}</span></div>
        <div class="info-item"><span class="label">测试日期</span><span class="value">{{ formatDate(lotInfo.test_date) }}</span></div>
      </div>
    </div>

    <div class="main-body">
      <!-- 左侧：参数选择 + 选项 -->
      <div class="left-panel">
        <div class="panel-title">参数相关性分析</div>
        <div class="desc">不选参数 → 自动筛选全量候选；勾选参数 → 精确计算选中项</div>

        <!-- 选项 -->
        <div class="opt-group">
          <span class="opt-label">Filter</span>
          <select v-model="options.filter_type" :disabled="loading">
            <option value="all">All Data</option>
            <option value="robust">Robust Data</option>
            <option value="filter_by_limit">Filter By Limit</option>
            <option value="filter_by_sigma">Filter by Sigma</option>
          </select>
        </div>
        <div class="opt-group" v-if="options.filter_type === 'filter_by_sigma'">
          <span class="opt-label">Sigma</span>
          <input v-model.number="options.sigma" type="number" step="0.5" min="1" max="6" :disabled="loading" />
        </div>
        <div class="opt-group">
          <span class="opt-label">DataRange</span>
          <div class="radio-row">
            <label><input type="radio" v-model="options.data_range" value="final" :disabled="loading" /> Final</label>
            <label><input type="radio" v-model="options.data_range" value="original" :disabled="loading" /> Original</label>
          </div>
        </div>
        <div class="opt-group" v-if="allSites.length > 1">
          <span class="opt-label">Site</span>
          <div class="site-chips">
            <label class="chip" :class="{ active: isAllSiteSelected }">
              <input type="checkbox" :checked="isAllSiteSelected" @change="toggleAllSite" /> ALL
            </label>
            <label class="chip" v-for="s in allSites" :key="s"
              :class="{ active: options.selected_sites.includes(s) }">
              <input type="checkbox" :checked="options.selected_sites.includes(s)" @change="toggleSite(s)" /> S{{ s }}
            </label>
          </div>
        </div>

        <!-- 自动发现配置 -->
        <div class="discover-opts">
          <div class="opt-label" style="margin-bottom:6px">⚙️ 自动筛选配置（不选参数时生效）</div>
          <div class="opt-row">
            <span>阈值 |r|≥</span>
            <input v-model.number="discoverCfg.threshold" type="number" step="0.05" min="0" max="1" :disabled="loading" />
          </div>
          <div class="opt-row">
            <span>最小样本</span>
            <input v-model.number="discoverCfg.min_samples" type="number" step="50" min="2" :disabled="loading" />
          </div>
          <div class="opt-row">
            <span>最大缺失率</span>
            <input v-model.number="discoverCfg.max_missing_pct" type="number" step="5" min="0" max="100" :disabled="loading" />%
          </div>
          <div class="opt-row">
            <span>Top N</span>
            <input v-model.number="discoverCfg.top_n" type="number" step="10" min="5" max="500" :disabled="loading" />
          </div>
        </div>

        <!-- 搜索 -->
        <div class="opt-group">
          <span class="opt-label">搜索参数</span>
          <input v-model="searchKeyword" type="text" placeholder="按名称/编号过滤..." class="search-input" />
        </div>

        <!-- 参数列表 -->
        <div class="opt-group">
          <div class="param-head">
            <span class="opt-label">参数列表 ({{ selectedParams.length }}/{{ paramList.length }} 选中)</span>
            <div class="param-actions">
              <button class="mini-btn" @click="selectAllVisible" :disabled="loading">全选</button>
              <button class="mini-btn" @click="clearAll" :disabled="loading">清空</button>
            </div>
          </div>
          <div class="param-list">
            <label v-for="item in filteredParamList" :key="item.item_name" class="param-item">
              <input type="checkbox" :value="item.item_name" v-model="selectedParams" :disabled="loading" />
              <span class="pnum">{{ item.item_number }}</span>
              <span class="pname" :title="item.item_name">{{ item.item_name }}</span>
            </label>
            <div v-if="filteredParamList.length === 0" class="empty-tip">无匹配参数</div>
          </div>
        </div>

        <!-- 计算按钮：空选 → 自动发现，非空 → 精确 -->
        <button class="calc-btn" @click="calculate" :disabled="loading">
          {{ loading ? '计算中...' : (selectedParams.length >= 2 ? '🔬 精确计算选中参数' : '🔍 自动筛选高相关参数') }}
        </button>
        <div class="warn-tip" v-if="selectedParams.length === 1">选中 1 个参数将触发自动筛选</div>
      </div>

      <!-- 右侧：结果 -->
      <div class="right-panel">
        <div v-if="!corrData" class="placeholder">
          <div class="ph-icon">📊</div>
          <div>不选参数 → 自动发现 ｜ 勾选 ≥2 参数 → 精确计算</div>
          <div class="ph-sub">结果以热力图矩阵（左列名/上列编号）+ 排名表展示</div>
        </div>

        <template v-else>
          <!-- 漏斗统计（自动发现模式） -->
          <div v-if="funnel" class="funnel-bar">
            <span>原始参数 <b>{{ funnel.total_params }}</b></span>
            <span class="arrow">→</span>
            <span>候选 <b>{{ funnel.candidate_params }}</b></span>
            <span class="arrow">→</span>
            <span>配对 <b>{{ funnel.pair_count.toLocaleString() }}</b></span>
            <span class="arrow">→</span>
            <span>高相关(|r|≥{{ (threshold * 100).toFixed(0) }}%) <b>{{ corrData.total_high_corr.toLocaleString() }}</b></span>
            <span class="arrow">→</span>
            <span>展示 Top <b>{{ ranking.length }}</b></span>
            <button class="mini-btn" @click="showExcluded = !showExcluded" v-if="excluded.length">
              {{ showExcluded ? '收起' : '查看' }}排除({{ excluded.length }})
            </button>
          </div>
          <div v-if="showExcluded && excluded.length" class="excluded-box">
            <div v-for="(e, i) in excluded" :key="i" class="excluded-item">
              <span class="ex-name">{{ e.name }}</span>
              <span class="ex-reason">{{ e.reason }}</span>
            </div>
          </div>

          <!-- 切换 Pearson / Spearman -->
          <div class="result-tabs">
            <div class="tab-bar">
              <div v-for="t in tabs" :key="t.key"
                :class="['tab', { active: activeTab === t.key }]"
                @click="activeTab = t.key">
                {{ t.title }}
              </div>
            </div>
            <div class="result-meta">
              <span v-if="!funnel">共 {{ pairCount }} 对</span>
              <span v-else>共 {{ corrData.total_high_corr.toLocaleString() }} 高相关对</span>
            </div>
          </div>

          <div class="result-body">
            <!-- 热力图（仅手动模式，自动发现模式矩阵太大不渲染） -->
            <div class="heatmap-box" v-if="!funnel">
              <div ref="heatmapRef" class="heatmap-chart"></div>
            </div>

            <!-- 排序列表 -->
            <div class="list-box" :class="{ 'list-full': funnel }">
              <div class="list-title">
                {{ activeTab === 'pearson' ? 'Pearson' : 'Spearman' }} 相关性排序列表
                <span class="list-hint" v-if="funnel">点击行查看散点图</span>
              </div>
              <div class="list-scroll">
                <table class="corr-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>参数 A</th>
                      <th>参数 B</th>
                      <th>r</th>
                      <th>|r|</th>
                      <th>N</th>
                      <th v-if="funnel">等级</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in displayPairs" :key="row.key"
                      :style="rowStyle(row.r)"
                      :class="{ clickable: funnel }"
                      @click="funnel && openScatter(row.a, row.b)">
                      <td>{{ idx + 1 }}</td>
                      <td class="pname-cell" :title="row.a">{{ row.a }}</td>
                      <td class="pname-cell" :title="row.b">{{ row.b }}</td>
                      <td class="r-cell">{{ row.r === null ? '—' : row.r.toFixed(4) }}</td>
                      <td>{{ row.r === null ? '—' : Math.abs(row.r).toFixed(4) }}</td>
                      <td>{{ row.n }}</td>
                      <td v-if="funnel"><span :class="['level-tag', levelClass(row.pearson)]">{{ levelText(row.pearson) }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 散点图弹窗 -->
    <div v-if="scatterVisible" class="scatter-modal" @click.self="scatterVisible = false">
      <div class="scatter-dialog">
        <div class="scatter-header">
          <span class="scatter-title">{{ scatterData?.param_a }} ↔ {{ scatterData?.param_b }}</span>
          <button class="close-btn" @click="scatterVisible = false">✕</button>
        </div>
        <div v-if="scatterLoading" class="scatter-loading">加载中...</div>
        <template v-else-if="scatterData">
          <div class="scatter-stats">
            <span>Pearson <b :style="rowStyle(scatterData.pearson)">{{ scatterData.pearson?.toFixed(4) }}</b></span>
            <span>Spearman <b :style="rowStyle(scatterData.spearman)">{{ scatterData.spearman?.toFixed(4) }}</b></span>
            <span>等级 <b>{{ scatterData.level }}</b></span>
            <span>样本 <b>{{ scatterData.n_total?.toLocaleString() }}</b></span>
            <span>显示 <b>{{ scatterData.n_sampled?.toLocaleString() }}</b></span>
          </div>
          <div ref="scatterRef" class="scatter-chart"></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import api from '@/api'
import { fmtDateTz } from '@/utils/dateUtils'

const route = useRoute()
const lotId = ref(Number(route.params.id))

const lotInfo = ref<any>(null)
const paramList = ref<any[]>([])
const allSites = ref<number[]>([])
const searchKeyword = ref('')
const selectedParams = ref<string[]>([])
const loading = ref(false)
const corrData = ref<any>(null)
const activeTab = ref<'pearson' | 'spearman'>('pearson')
const heatmapRef = ref<HTMLElement>()
let heatmapChart: echarts.ECharts | null = null

const options = ref({
  filter_type: 'all',
  sigma: 3,
  data_range: 'final',
  selected_sites: [] as number[],
})

const discoverCfg = ref({
  threshold: 0.7,
  min_samples: 100,
  max_missing_pct: 30,
  top_n: 50,
})

const tabs = [
  { key: 'pearson' as const, title: 'Pearson (线性)' },
  { key: 'spearman' as const, title: 'Spearman (秩)' },
]

// 漏斗/排除（自动发现模式）
const funnel = computed(() => corrData.value?.funnel || null)
const excluded = computed(() => corrData.value?.excluded || [])
const ranking = computed(() => corrData.value?.ranking || [])
const threshold = computed(() => corrData.value?.threshold ?? discoverCfg.value.threshold)
const showExcluded = ref(false)

const filteredParamList = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return paramList.value
  return paramList.value.filter(p =>
    p.item_name.toLowerCase().includes(kw) || String(p.item_number).includes(kw)
  )
})

const isAllSiteSelected = computed(() =>
  allSites.value.length > 0 && allSites.value.every(s => options.value.selected_sites.includes(s))
)

function toggleAllSite() {
  if (isAllSiteSelected.value) {
    options.value.selected_sites = []
  } else {
    options.value.selected_sites = [...allSites.value]
  }
}

function toggleSite(s: number) {
  const idx = options.value.selected_sites.indexOf(s)
  if (idx >= 0) options.value.selected_sites.splice(idx, 1)
  else options.value.selected_sites.push(s)
}

function selectAllVisible() {
  const visible = filteredParamList.value.map(p => p.item_name)
  const merged = new Set([...selectedParams.value, ...visible])
  selectedParams.value = Array.from(merged)
}

function clearAll() {
  selectedParams.value = []
}

async function fetchLotInfo() {
  lotInfo.value = await api.get(`/analysis/lot/${lotId.value}/info`)
  try {
    const items: any[] = await api.get(`/analysis/lot/${lotId.value}/items`, { params: { site: 0 } })
    const sites = new Set<number>()
    items.forEach((it: any) => {
      Object.keys(it).forEach(k => {
        if (k.startsWith('mean_s')) {
          const n = Number(k.replace('mean_s', ''))
          if (!isNaN(n)) sites.add(n)
        }
      })
    })
    allSites.value = Array.from(sites).sort((a, b) => a - b)
  } catch {
    allSites.value = []
  }
}

async function fetchParams() {
  paramList.value = await api.get(`/analysis/lot/${lotId.value}/items`, { params: { site: 0 } })
}

async function calculate() {
  loading.value = true
  try {
    const sitesParam = options.value.selected_sites.length > 0
      ? options.value.selected_sites.join(',')
      : 'all'
    const autoMode = selectedParams.value.length < 2
    const endpoint = autoMode ? 'correlation/discover' : 'correlation'
    const params: any = {
      filter_type: options.value.filter_type,
      sigma: options.value.sigma,
      sites: sitesParam,
      data_range: options.value.data_range,
    }
    if (autoMode) {
      params.min_samples = discoverCfg.value.min_samples
      params.max_missing_rate = discoverCfg.value.max_missing_pct / 100
      params.threshold = discoverCfg.value.threshold
      params.top_n = discoverCfg.value.top_n
    } else {
      params.params = selectedParams.value.join(',')
    }
    const res: any = await api.get(`/analysis/lot/${lotId.value}/${endpoint}`, { params })
    corrData.value = res
    activeTab.value = 'pearson'
    await nextTick()
    renderHeatmap()
  } catch (e: any) {
    alert('计算失败: ' + (e?.detail || e?.message || e))
  } finally {
    loading.value = false
  }
}

// 配对列表
const pairCount = computed(() => {
  if (!corrData.value) return 0
  const n = corrData.value.param_names.length
  return (n * (n - 1)) / 2
})

const currentMatrix = computed(() => {
  if (!corrData.value) return []
  return activeTab.value === 'pearson' ? corrData.value.pearson : corrData.value.spearman
})

// 排名表数据：自动发现用 ranking 数组，精确模式从矩阵推导
const displayPairs = computed(() => {
  if (!corrData.value) return []
  // 自动发现模式：直接用 ranking（已排序）
  if (funnel.value) {
    return ranking.value.map((r: any) => ({
      key: `${r.a}__${r.b}`,
      a: r.a,
      b: r.b,
      r: activeTab.value === 'pearson' ? r.pearson : r.spearman,
      pearson: r.pearson,
      n: r.n,
    }))
  }
  // 精确模式：从矩阵推导 + 排序
  const names = corrData.value.param_names as string[]
  const mat = currentMatrix.value
  const n = names.length
  const list: any[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      list.push({
        key: `${names[i]}__${names[j]}`,
        a: names[i],
        b: names[j],
        r: mat[i][j],
        pearson: corrData.value.pearson[i][j],
        n: corrData.value.n_samples[i][j],
      })
    }
  }
  list.sort((a, b) => {
    const va = a.r === null ? -Infinity : Math.abs(a.r)
    const vb = b.r === null ? -Infinity : Math.abs(b.r)
    return vb - va
  })
  return list
})

function levelText(r: number | null) {
  if (r === null) return '-'
  const a = Math.abs(r)
  if (a >= 0.9) return 'Very High'
  if (a >= 0.8) return 'High'
  if (a >= 0.7) return 'Medium'
  return 'Low'
}
function levelClass(r: number | null) {
  if (r === null) return 'lv-none'
  const a = Math.abs(r)
  if (a >= 0.9) return 'lv-vhigh'
  if (a >= 0.8) return 'lv-high'
  if (a >= 0.7) return 'lv-med'
  return 'lv-low'
}

function toggleSort() {}

function rowStyle(r: number | null) {
  if (r === null) return { color: '#999' }
  const abs = Math.abs(r)
  if (abs >= 0.8) return { color: r > 0 ? '#c0392b' : '#1f618d', fontWeight: 'bold' }
  if (abs >= 0.6) return { color: r > 0 ? '#e74c3c' : '#2e86c1', fontWeight: '600' }
  if (abs >= 0.4) return { color: r > 0 ? '#e67e22' : '#3498db' }
  return {}
}

function renderHeatmap() {
  if (!heatmapRef.value || !corrData.value) return
  if (!heatmapChart) {
    heatmapChart = echarts.init(heatmapRef.value)
  }
  const names = corrData.value.param_names as string[]
  const mat = currentMatrix.value
  const n = names.length
  // 编号标签：1,2,3...
  const numLabels = names.map((_, i) => i + 1)

  const data: any[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      data.push([j, n - 1 - i, mat[i][j]])
    }
  }
  const labelData = data.map(d => {
    const v = d[2]
    return {
      value: v,
      label: {
        show: true,
        formatter: v === null || v === undefined ? '-' : (Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(2)),
        fontSize: n > 15 ? 8 : 11,
        color: '#333',
      }
    }
  })

  heatmapChart.setOption({
    tooltip: {
      position: 'top',
      formatter: (p: any) => {
        const xi = p.data[0], yi = n - 1 - p.data[1]
        const v = p.data[2]
        const a = names[yi], b = names[xi]
        return `${yi + 1}. ${a}<br/>${xi + 1}. ${b}<br/>r = ${v === null || v === undefined ? '—' : v.toFixed(4)}<br/>N = ${corrData.value.n_samples[yi][xi]}`
      }
    },
    grid: { left: 150, right: 20, top: 60, bottom: 60 },
    xAxis: {
      type: 'category',
      data: numLabels,
      splitArea: { show: true },
      name: '参数编号',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: [...names].reverse(),
      splitArea: { show: true },
      axisLabel: {
        fontSize: 10,
        formatter: (v: string, idx: number) => `${n - idx}. ${v.length > 14 ? v.slice(0, 14) + '…' : v}`,
      }
    },
    visualMap: {
      min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', top: 10,
      inRange: { color: ['#1f618d', '#85c1e9', '#fdfefe', '#f5b7b1', '#c0392b'] },
    },
    series: [{
      type: 'heatmap',
      data: labelData,
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
    }]
  }, true)
}

// ---- 散点图 ----
const scatterVisible = ref(false)
const scatterLoading = ref(false)
const scatterData = ref<any>(null)
const scatterRef = ref<HTMLElement>()
let scatterChart: echarts.ECharts | null = null

async function openScatter(a: string, b: string) {
  scatterVisible.value = true
  scatterLoading.value = true
  scatterData.value = { param_a: a, param_b: b }
  try {
    const sitesParam = options.value.selected_sites.length > 0
      ? options.value.selected_sites.join(',')
      : 'all'
    const res: any = await api.get(`/analysis/lot/${lotId.value}/correlation/scatter`, {
      params: {
        param_a: a, param_b: b,
        filter_type: options.value.filter_type,
        sigma: options.value.sigma,
        sites: sitesParam,
        data_range: options.value.data_range,
      }
    })
    scatterData.value = res
    await nextTick()
    renderScatter()
  } catch (e: any) {
    alert('加载散点图失败: ' + (e?.detail || e?.message || e))
  } finally {
    scatterLoading.value = false
  }
}

function renderScatter() {
  if (!scatterRef.value || !scatterData.value) return
  if (!scatterChart) {
    scatterChart = echarts.init(scatterRef.value)
  }
  const d = scatterData.value
  const points = d.points as number[][]
  // 回归线
  const regLine: any[] = []
  if (d.regression) {
    const { slope, intercept, x_min, x_max } = d.regression
    regLine.push([x_min, slope * x_min + intercept])
    regLine.push([x_max, slope * x_max + intercept])
  }

  scatterChart.setOption({
    tooltip: {
      formatter: (p: any) => {
        if (p.seriesName === '回归线') return `y = ${d.regression.slope.toFixed(4)}x + ${d.regression.intercept.toFixed(4)}`
        return `${d.param_a} = ${p.data[0].toFixed(4)}<br/>${d.param_b} = ${p.data[1].toFixed(4)}`
      }
    },
    xAxis: { type: 'value', name: d.param_a, nameLocation: 'middle', nameGap: 28, scale: true },
    yAxis: { type: 'value', name: d.param_b, nameLocation: 'middle', nameGap: 40, scale: true },
    series: [
      {
        name: '散点', type: 'scatter', data: points,
        symbolSize: 4,
        itemStyle: { color: 'rgba(44, 123, 182, 0.5)' },
        large: true, largeThreshold: 3000,
      },
      {
        name: '回归线', type: 'line', data: regLine, showSymbol: false,
        lineStyle: { color: '#c0392b', width: 2, type: 'dashed' },
      }
    ],
    grid: { left: 60, right: 20, top: 20, bottom: 50 },
  }, true)
}

watch(activeTab, () => {
  nextTick(() => renderHeatmap())
})

watch(scatterVisible, (v) => {
  if (!v) scatterChart = null
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

onMounted(async () => {
  await fetchLotInfo()
  await fetchParams()
})

window.addEventListener('resize', () => {
  heatmapChart?.resize()
  scatterChart?.resize()
})
</script>

<style scoped>
.corr-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  gap: 16px;
}
.info-item { display: flex; flex-direction: column; gap: 2px; }
.label { font-size: 11px; color: #999; }
.value { font-size: 13px; color: #333; font-weight: 500; }

.main-body {
  flex: 1;
  display: flex;
  gap: 12px;
  overflow: hidden;
}

/* 左侧面板 */
.left-panel {
  width: 320px;
  background: white;
  border-radius: 6px;
  padding: 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}
.desc {
  font-size: 12px;
  color: #888;
  line-height: 1.5;
}
.opt-group { display: flex; flex-direction: column; gap: 4px; }
.opt-label { font-size: 12px; color: #666; font-weight: 500; }
.opt-group select, .opt-group input[type="number"], .search-input {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.radio-row { display: flex; gap: 12px; }
.radio-row label { font-size: 13px; cursor: pointer; }
.site-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  font-size: 12px; padding: 2px 8px; border-radius: 12px;
  border: 1px solid #ddd; cursor: pointer; user-select: none;
}
.chip.active { background: #2c7bb6; color: white; border-color: #2c7bb6; }

.discover-opts {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.opt-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #555; }
.opt-row input {
  border: 1px solid #ddd; border-radius: 4px; padding: 2px 6px;
  font-size: 12px; width: 70px;
}

.param-head { display: flex; justify-content: space-between; align-items: center; }
.param-actions { display: flex; gap: 4px; }
.mini-btn {
  font-size: 11px; padding: 2px 8px; border: 1px solid #ccc;
  border-radius: 4px; background: #f5f5f5; cursor: pointer;
}
.mini-btn:hover { background: #e8e8e8; }
.param-list {
  max-height: 260px; overflow-y: auto; border: 1px solid #eee;
  border-radius: 4px; padding: 4px;
}
.param-item { display: flex; align-items: center; gap: 6px; padding: 3px 4px; cursor: pointer; font-size: 12px; }
.param-item:hover { background: #f5f5f5; }
.pnum { color: #2c7bb6; font-weight: 600; min-width: 32px; font-size: 11px; }
.pname { color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-tip { color: #999; font-size: 12px; text-align: center; padding: 12px; }

.calc-btn {
  padding: 10px; border: none; border-radius: 6px; background: #2c7bb6;
  color: white; font-size: 14px; cursor: pointer; font-weight: 500;
}
.calc-btn:disabled { background: #aaa; cursor: not-allowed; }
.calc-btn:not(:disabled):hover { background: #1f618d; }
.warn-tip { font-size: 11px; color: #e67e22; text-align: center; }

/* 右侧 */
.right-panel {
  flex: 1;
  background: white;
  border-radius: 6px;
  padding: 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.placeholder {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: #aaa; gap: 8px;
}
.ph-icon { font-size: 48px; }
.ph-sub { font-size: 12px; color: #bbb; }

/* 漏斗 */
.funnel-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 12px; background: #eaf2f8; border-radius: 6px;
  font-size: 12px; color: #444; margin-bottom: 10px;
}
.funnel-bar b { color: #2c7bb6; }
.funnel-bar .arrow { color: #aaa; }
.excluded-box {
  max-height: 160px; overflow-y: auto; margin-bottom: 10px;
  border: 1px solid #eee; border-radius: 4px; padding: 6px;
  display: flex; flex-wrap: wrap; gap: 4px;
}
.excluded-item { font-size: 11px; background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
.ex-name { color: #666; }
.ex-reason { color: #c0392b; margin-left: 4px; }

/* 结果标签 */
.result-tabs { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.tab-bar { display: flex; gap: 0; border-bottom: 2px solid #eee; }
.tab {
  padding: 6px 16px; cursor: pointer; font-size: 13px; color: #666;
  border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.tab.active { color: #2c7bb6; border-bottom-color: #2c7bb6; font-weight: 600; }
.result-meta { font-size: 12px; color: #888; }

.result-body { flex: 1; display: flex; gap: 12px; overflow: hidden; }
.heatmap-box { flex: 1; min-width: 0; overflow: hidden; }
.heatmap-chart { width: 100%; height: 100%; min-height: 360px; }

.list-box { width: 420px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; }
.list-box.list-full { width: 100%; }
.list-title {
  font-size: 13px; font-weight: 600; color: #333; padding: 8px 0;
  display: flex; justify-content: space-between; align-items: center;
}
.list-hint { font-size: 11px; color: #aaa; font-weight: 400; }
.list-scroll { flex: 1; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; }
.corr-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.corr-table th {
  background: #f5f7fa; padding: 6px 8px; text-align: left;
  font-weight: 600; color: #555; position: sticky; top: 0; z-index: 1;
}
.corr-table td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; }
.pname-cell { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-cell { font-family: monospace; }
.corr-table tr.clickable { cursor: pointer; }
.corr-table tr.clickable:hover { background: #f0f7fc; }
.level-tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 500; }
.lv-vhigh { background: #fadbd8; color: #c0392b; }
.lv-high { background: #fdebd0; color: #d35400; }
.lv-med { background: #fef9e7; color: #b7950b; }
.lv-low { background: #eee; color: #888; }
.lv-none { background: #eee; color: #aaa; }

/* 散点图弹窗 */
.scatter-modal {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.scatter-dialog {
  background: white; border-radius: 8px; padding: 16px;
  width: 90%; max-width: 900px; max-height: 90vh;
  display: flex; flex-direction: column; gap: 12px;
}
.scatter-header { display: flex; justify-content: space-between; align-items: center; }
.scatter-title { font-size: 15px; font-weight: 600; color: #333; }
.close-btn {
  border: none; background: #eee; width: 28px; height: 28px;
  border-radius: 50%; cursor: pointer; font-size: 14px;
}
.close-btn:hover { background: #ddd; }
.scatter-stats { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: #555; }
.scatter-stats b { color: #333; }
.scatter-loading { text-align: center; padding: 40px; color: #888; }
.scatter-chart { width: 100%; height: 480px; }
</style>
