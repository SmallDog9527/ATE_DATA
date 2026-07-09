<template>
  <div class="bin-view">
    <!-- 顶部固定栏 -->
    <div class="sticky-header">
      <!-- LOT基本信息栏 -->
      <div class="lot-info-bar" v-if="lotInfo">
        <div class="info-grid">
          <div class="info-item"><span class="label">名称</span><span class="value">{{ lotInfo.filename }}</span></div>
          <div class="info-item"><span class="label">程序</span><span class="value">{{ lotInfo.program }}</span></div>
          <div class="info-item"><span class="label">测试机</span><span class="value">{{ lotInfo.test_machine }}</span></div>
          <div class="info-item"><span class="label">工位数</span><span class="value">{{ lotInfo.station_count }}</span></div>
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

      <!-- Options栏 -->
      <div class="options-bar">
        <div class="opt-group">
          <span class="opt-label">DataRange</span>
          <label><input type="radio" v-model="options.data_range" value="final" @change="onDataRangeChange" /> Final</label>
          <label><input type="radio" v-model="options.data_range" value="original" @change="onDataRangeChange" /> Original</label>
        </div>

        <div class="opt-group">
          <span class="opt-label">Site</span>
          <label>
            <input type="checkbox" :checked="isAllSiteSelected" @change="toggleAllSite" /> All
          </label>
          <label v-for="s in allSites" :key="s">
            <input type="checkbox" :checked="options.selected_sites.includes(s)" @change="toggleSite(s)" />
            Site{{ s }}
          </label>
        </div>

        <div class="opt-group" v-if="false">
          <span class="opt-label">Map旋转</span>
          <select v-model="options.rotate" @change="renderBinMap()" style="font-size:12px;padding:2px 6px;border:1px solid #d9d9d9;border-radius:4px">
            <option value="0">0°</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </select>
        </div>

        <div class="opt-group">
          <label><input type="checkbox" v-model="options.show_yield_plot" @change="renderYieldPlot" /> Yield Plot</label>
          <label><input type="checkbox" v-model="options.show_fail_bin" @change="renderFailBinChart" /> Fail Bin Analysis</label>
        </div>

        <button v-if="showUploadBinNameBtn" class="export-btn" @click="uploadModalVisible = true" style="background: #1890ff; margin-right: 8px;">📝 上传 Bin Name</button>
        <button class="export-btn" @click="openParamAnalysis">📈 参数分析</button>
        <button class="export-btn" @click="handleExport">📁 导出 Excel</button>
      </div>
    </div>

    <!-- Bin汇总表格 -->
    <div class="bin-table-area">
      <table class="bin-table">
        <thead>
          <tr>
            <th>Bin</th>
            <th>Name</th>
            <th v-for="s in options.selected_sites" :key="s">Site{{ s }}</th>
            <th class="sortable" @click="toggleBinSort">
              All Site
              <span v-if="binSortOrder === 'asc'">↑</span>
              <span v-else-if="binSortOrder === 'desc'">↓</span>
              <span v-else>⇅</span>
            </th>
            <th>% of total</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="options.selected_sites.length === 0">
            <td :colspan="5 + options.selected_sites.length" style="text-align:center;color:#999;padding:20px">No sites selected</td>
          </tr>
          <tr v-else v-for="b in sortedBins" :key="b.bin_number" :class="{ 'pass-row': isPassBin(b.bin_number) }">
            <td>
              <span class="bin-link" @click="openBinDetail(b.bin_number, b.bin_name)">{{ b.bin_number }}</span>
            </td>
            <td>{{ b.bin_name }}</td>
            <td v-for="s in options.selected_sites" :key="s">
              {{ b.sites[`site${s}`]?.count ?? 0 }}
            </td>
            <td>{{ b.all_site_count }}</td>
            <td>{{ b.all_site_pct?.toFixed(2) }}%</td>
            <td>
              <input type="text" v-model="b.comment" @blur="saveComment(b)" placeholder="" 
              style="width: 400px; padding: 2px 4px; border: none; outline: none; background: transparent; font-size: 12px;"/>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="summary-row">
            <td colspan="2">Passes</td>
            <td v-for="s in options.selected_sites" :key="s">
              {{ getSitePass(s) }} ({{ getSiteTotal(s) > 0 ? (getSitePass(s) / getSiteTotal(s) * 100).toFixed(2) + '%' : '-' }})
            </td>
            <td>{{ getTotalPass() }}</td>
            <td>{{ getTotalAll() > 0 ? (getTotalPass() / getTotalAll() * 100).toFixed(2) + '%' : '-' }}</td>
            <td></td>
          </tr>
          <tr class="summary-row">
            <td colspan="2">Fails</td>
            <td v-for="s in options.selected_sites" :key="s">{{ getSiteFail(s) }}</td>
            <td>{{ getTotalFail() }}</td>
            <td>{{ getTotalAll() > 0 ? (getTotalFail() / getTotalAll() * 100).toFixed(2) + '%' : '-' }}</td>
            <td></td>
          </tr>
          <tr class="summary-row">
            <td colspan="2">Sum</td>
            <td v-for="s in options.selected_sites" :key="s">{{ getSiteTotal(s) }}</td>
            <td>{{ getTotalAll() }}</td>
            <td>100.00%</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 底部三栏 -->
    <div class="bottom-area">
      <!-- 左：Bin Map -->
      <div class="map-section" v-show="hasCoords">
        <div class="section-title">Bin Map</div>
        <div class="map-with-legend" style="position:relative">
          <canvas ref="binMapCanvas" width="800" height="800"
            style="width:800px;height:800px;border:1px solid #eee;flex-shrink:0"></canvas>
          <div ref="binMapTooltipEl" class="bin-tooltip" style="display:none"></div>
          <div class="bin-legend">
            <div :class="['bin-icon', { selected: selectedBin === null }]"
              @click="selectedBin = null; renderBinMap()">
              <span class="bin-dot" style="background:#aaa"></span>
              <span>ALL</span>
            </div>
            <div v-for="b in failBins" :key="b.bin_number"
              :class="['bin-icon', { selected: selectedBin === b.bin_number }]"
              @click="toggleBinHighlight(b.bin_number)">
              <span class="bin-dot" :style="{ background: getBinColor(b.bin_number) }"></span>
              <span>Bin{{ b.bin_number }}({{ b.all_site_count }})</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 中：Yield Plot -->
      <div class="chart-section" v-if="options.show_yield_plot">
        <div class="section-title">Yield Plot</div>
        <canvas ref="yieldPlotCanvas" width="400" height="400"
          style="width:400px;height:400px"></canvas>
      </div>

      <!-- 右：Fail Bin Analysis -->
      <div class="chart-section" v-if="options.show_fail_bin">
        <div class="section-title">Fail Bin Analysis</div>
        <div ref="failBinChartRef" style="width:100%;height:400px"></div>
      </div>
    </div>

    <!-- 复测分析（折叠） -->
    <div class="retest-section" v-if="hasCoords && lotInfo?.data_type === 'CP'">
      <div class="retest-header" @click="retestExpanded = !retestExpanded">
        <span>复测分析</span>
        <span>{{ retestExpanded ? '▲' : '▼' }}</span>
      </div>
      <div v-if="retestExpanded && retestData">
        <!-- 总计统计 -->
        <div class="retest-totals">
          <span class="total-item pass">✅ Fail→Pass: {{ retestData.totals.fail_to_pass }}个</span>
          <span class="total-item fail">❌ Pass→Fail: {{ retestData.totals.pass_to_fail }}个</span>
          <span class="total-item change">🔄 Fail→Fail(换Bin): {{ retestData.totals.fail_to_fail }}个</span>
          <span class="total-item same">➖ Pass→Pass: {{ retestData.totals.pass_to_pass }}个</span>
          <span class="total-item">总复测Die: {{ retestData.totals.total_retest_dies }}个</span>
        </div>

        <!-- 转移汇总表 -->
        <div class="retest-tables">
          <div class="retest-table-wrap">
            <div class="table-title">Bin转移汇总</div>
            <table class="retest-table">
              <thead>
                <tr>
                  <th class="sortable" @click="toggleRetestSort('from_bin')">
                    首次Bin
                    <span>{{ retestSortKey === 'from_bin' ? (retestSortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
                  </th>
                  <th>转移到</th>
                  <th class="sortable" @click="toggleRetestSort('count')">
                    数量
                    <span>{{ retestSortKey === 'count' ? (retestSortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
                  </th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in sortedRetestSummary" :key="`${s.from_bin}-${s.to_bin}`"
                  :class="directionClass(s.direction, s.no_change)">
                  <td>Bin{{ s.from_bin }}</td>
                  <td>Bin{{ s.to_bin }}</td>
                  <td>{{ s.count }}</td>
                  <td>{{ directionLabel(s.direction, s.no_change) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 逐坐标明细表 -->
          <div class="retest-table-wrap">
            <div class="table-title">逐坐标明细（最多500条）</div>
            <div style="max-height:300px;overflow-y:auto">
              <table class="retest-table">
                <thead>
                  <tr><th>X</th><th>Y</th><th>首次Site</th><th>首次Bin</th><th>末次Site</th><th>末次Bin</th><th>复测次数</th><th>Site变化</th></tr>
                </thead>
                <tbody>
                  <tr v-for="d in retestData.details" :key="`${d.x}-${d.y}`"
                    :class="directionClass(getDirection(d.first_bin, d.last_bin), d.first_bin === d.last_bin)">
                    <td>{{ d.x }}</td>
                    <td>{{ d.y }}</td>
                    <td>Site{{ d.first_site }}</td>
                    <td>Bin{{ d.first_bin }}</td>
                    <td>Site{{ d.last_site }}</td>
                    <td>Bin{{ d.last_bin }}</td>
                    <td>{{ d.retest_count }}</td>
                    <td>{{ d.site_changed ? '✓' : '' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bin详情弹窗 -->
    <div v-if="binDetailVisible" class="modal-overlay" @click.self="binDetailVisible = false">
      <div class="modal">
        <div class="modal-header">
          <span>Bin{{ binDetailNum }} - {{ binDetailName }} 分布</span>
          <span class="modal-close" @click="binDetailVisible = false">×</span>
        </div>
        <canvas ref="binDetailCanvas" width="500" height="500"
          style="width:500px;height:500px"></canvas>
      </div>
    </div>

    <!-- 上传 Bin Name 弹窗 -->
    <div v-if="uploadModalVisible" class="modal-overlay" @click.self="uploadModalVisible = false">
      <div class="modal" style="width: 620px; max-width: 90vw; border-radius: 8px; overflow: hidden; padding: 0; box-shadow: 0 8px 30px rgba(0,0,0,0.15);">
        <div class="modal-header" style="background: #fafafa; padding: 14px 20px; margin-bottom: 0; border-bottom: 1px solid #f0f0f0;">
          <span style="font-size: 15px; font-weight: 600; color: #333;">📝 上传 Bin Name 文本</span>
          <span class="modal-close" @click="uploadModalVisible = false" style="font-size: 20px;">×</span>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px; padding: 20px; text-align: left;">
          <div style="font-size: 12px; color: #555; line-height: 1.6; background: #e6f7ff; border: 1px solid #91d5ff; padding: 10px 14px; border-radius: 6px;">
            请粘贴包含 Bin Name 的文本。系统将自动解析出 Bin 序号和对应名称，并自动将其保存为该<b>程序名（{{ lotInfo?.program || '-' }}）</b>的全局模板映射。后续同名程序的 Lot 数据在上传时将自动套用这些 Bin 名字！
            <div style="margin-top: 6px; font-weight: 600; color: #0050b3;">支持以下两种格式示例（复制整段粘贴即可）：</div>
            <div style="background: rgba(255,255,255,0.8); border: 1px dashed #adc6ff; padding: 6px 12px; border-radius: 4px; font-family: monospace; margin-top: 4px; font-size: 11px; color: #333;">
              格式一：SBin[9] &nbsp; ILKG_ENB_6P5_AMR__Fail &nbsp; 0 &nbsp; 0.00% &nbsp; 9<br/>
              格式二：19 &nbsp; &nbsp; F &nbsp; &nbsp; TA01_BG_bef &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;80 &nbsp; &nbsp; 1.34
            </div>
          </div>
          <textarea
            v-model="pastedText"
            placeholder="请类似于 txt 页面，将包含 sbin 序号和名字的内容粘贴到这里..."
            style="width: 100%; height: 260px; padding: 12px; border: 1px solid #d9d9d9; border-radius: 6px; font-family: monospace; font-size: 12px; resize: vertical; outline: none; box-sizing: border-box; transition: border-color 0.2s;"
            onfocus="this.style.borderColor='#40a9ff'"
            onblur="this.style.borderColor='#d9d9d9'"
          ></textarea>
          <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 4px;">
            <button class="modal-btn cancel" @click="uploadModalVisible = false">取消</button>
            <button class="modal-btn confirm" @click="handleApplyBinNames" :disabled="!pastedText.trim()">确定更新</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as echarts from 'echarts'
import api from '@/api'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { fmtDateTz } from '@/utils/dateUtils'

const route = useRoute()
const router = useRouter()
const lotId = ref(Number(route.params.id))

const openParamAnalysis = () => {
  const url = router.resolve(`/lot/${lotId.value}`).href
  window.open(url, '_blank')
}

const binMapCanvas = ref<HTMLCanvasElement>()
const binMapTooltipEl = ref<HTMLDivElement | null>(null)
const yieldPlotCanvas = ref<HTMLCanvasElement>()
const failBinChartRef = ref<HTMLElement>()
const binDetailCanvas = ref<HTMLCanvasElement>()
let failBinChart: echarts.ECharts | null = null

// Bin Map hover state
let binMapDies: { px: number; py: number; width: number; height: number; x: number; y: number; bin: number; site: number }[] = []

const lotInfo = ref<any>(null)
const binData = ref<any>({ bins: [], sites: [], all_sites: [] })
const allSites = ref<number[]>([])
const passBins = ref<number[]>([])
const selectedBin = ref<number | null>(null)
const binSortOrder = ref<'asc' | 'desc' | ''>('')
const retestData = ref<any>(null)
const retestExpanded = ref(false)
const hasCoords = ref(false)
const binDetailVisible = ref(false)
const binDetailNum = ref(0)
const binDetailName = ref('')
const mapCache = ref<any[]>([])
const uploadModalVisible = ref(false)
const pastedText = ref('')

const options = ref({
  data_range: 'final',
  selected_sites: [] as number[],
  rotate: '0',
  show_yield_plot: false,
  show_fail_bin: false,
})

const BIN_COLORS: Record<number, string> = {}
const FAIL_COLORS = [
  '#ff6b6b', '#4dabf7', '#ffd43b', '#e599f7', '#74c0fc',
  '#ffa94d', '#da77f2', '#ff8787', '#339af0', '#fcc419',
  '#cc5de8', '#22b8cf', '#ff922b', '#845ef7', '#f06595', '#66d9e8'
]



function getBinColor(binNum: number): string {
  if (isPassBin(binNum)) return '#69db7c'
  if (!BIN_COLORS[binNum]) {
    const idx = Object.keys(BIN_COLORS).length % FAIL_COLORS.length
    BIN_COLORS[binNum] = FAIL_COLORS[idx] as string
  }
  return BIN_COLORS[binNum] as string
}

function isPassBin(binNum: number): boolean {
  return passBins.value.includes(binNum)
}

const showUploadBinNameBtn = computed(() => {
  if (!binData.value?.bins) return false
  const bin1 = binData.value.bins.find((b: any) => b.bin_number === 1)
  return bin1 ? bin1.bin_name === 'Bin1' : false
})

const failBins = computed(() => {
  if (!binData.value?.bins) return []
  return binData.value.bins
    .filter((b: any) => !isPassBin(b.bin_number))
    .sort((a: any, b: any) => b.all_site_count - a.all_site_count)
})

const sortedBins = computed(() => {
  if (!binData.value?.bins) return []
  const bins = [...binData.value.bins]
  
  if (binSortOrder.value === 'desc') {
    bins.sort((a, b) => b.all_site_count - a.all_site_count)
  } else if (binSortOrder.value === 'asc') {
    bins.sort((a, b) => a.all_site_count - b.all_site_count)
  } else {
    bins.sort((a, b) => a.bin_number - b.bin_number)
  }
  return bins
})

function toggleBinSort() {
  if (binSortOrder.value === '') {
    binSortOrder.value = 'desc'
  } else if (binSortOrder.value === 'desc') {
    binSortOrder.value = 'asc'
  } else {
    binSortOrder.value = ''
  }
}

const isAllSiteSelected = computed(() =>
  allSites.value.length > 0 &&
  allSites.value.every(s => options.value.selected_sites.includes(s))
)

function toggleAllSite() {
  if (isAllSiteSelected.value) {
    options.value.selected_sites = []
  } else {
    options.value.selected_sites = [...allSites.value]
  }
  refreshAll()
}

function toggleSite(site: number) {
  const idx = options.value.selected_sites.indexOf(site)
  if (idx >= 0) {
    options.value.selected_sites.splice(idx, 1)
  } else {
    options.value.selected_sites.push(site)
    options.value.selected_sites.sort((a, b) => a - b)
  }
  refreshAll()
}

function getSitePass(site: number) {
  return binData.value.bins
    .filter((b: any) => isPassBin(b.bin_number))
    .reduce((sum: number, b: any) => sum + (b.sites[`site${site}`]?.count ?? 0), 0)
}
function getSiteFail(site: number) {
  return binData.value.bins
    .filter((b: any) => !isPassBin(b.bin_number))
    .reduce((sum: number, b: any) => sum + (b.sites[`site${site}`]?.count ?? 0), 0)
}
function getSiteTotal(site: number) {
  return binData.value.bins
    .reduce((sum: number, b: any) => sum + (b.sites[`site${site}`]?.count ?? 0), 0)
}
function getTotalPass() {
  return binData.value.bins
    .filter((b: any) => isPassBin(b.bin_number))
    .reduce((sum: number, b: any) => sum + b.all_site_count, 0)
}
function getTotalFail() {
  return binData.value.bins
    .filter((b: any) => !isPassBin(b.bin_number))
    .reduce((sum: number, b: any) => sum + b.all_site_count, 0)
}
function getTotalAll() {
  return binData.value.bins.reduce((sum: number, b: any) => sum + b.all_site_count, 0)
}

function yieldColor(val: number) {
  if (!val) return {}
  if (val < 0.8) return { color: 'red' }
  if (val < 0.95) return { color: 'orange' }
  return { color: 'green' }
}

function formatDate(d: string) {
  return fmtDateTz(d) || '-'
}

// 复测汇总排序
const retestSortKey = ref<'from_bin' | 'count'>('count')
const retestSortDir = ref<'asc' | 'desc'>('desc')

const sortedRetestSummary = computed(() => {
  if (!retestData.value?.summary) return []
  return [...retestData.value.summary].sort((a, b) => {
    const dir = retestSortDir.value === 'asc' ? 1 : -1
    return (a[retestSortKey.value] - b[retestSortKey.value]) * dir
  })
})

function toggleRetestSort(key: 'from_bin' | 'count') {
  if (retestSortKey.value === key) {
    retestSortDir.value = retestSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    retestSortKey.value = key
    retestSortDir.value = key === 'count' ? 'desc' : 'asc'
  }
}

async function fetchLotInfo() {
  lotInfo.value = await api.get(`/analysis/lot/${lotId.value}/info`)
}

async function fetchBinData() {
  const sitesParam = options.value.selected_sites.join(',') || 'all'
  const data: any = await api.get(`/analysis/lot/${lotId.value}/bin_summary`, {
    params: { data_range: options.value.data_range, sites: sitesParam }
  })
  binData.value = data

  if (allSites.value.length === 0 && data.all_sites?.length > 0) {
    allSites.value = data.all_sites
    options.value.selected_sites = [...data.all_sites]
  }
}

async function fetchPassBins() {
  const data: any = await api.get(`/analysis/lot/${lotId.value}/bin_definitions`)
  passBins.value = data.pass_bins ?? [1, 2]
}

async function fetchMapData() {
  try {
    const sitesParam = options.value.selected_sites.join(',') || 'all'
    const mapData: any = await api.get(`/analysis/lot/${lotId.value}/wafer_bin_map`, {
      params: {
        data_range: options.value.data_range,
        sites: sitesParam
      }
    })
    mapCache.value = mapData.data ?? []
    hasCoords.value = mapData.has_map
  } catch (e) {
    mapCache.value = []
    hasCoords.value = false
  }
}

async function fetchRetestData() {
  if (!hasCoords.value) return
  const sitesParam = options.value.selected_sites.join(',') || 'all'
  try {
    retestData.value = await api.get(`/analysis/lot/${lotId.value}/retest_analysis`, {
      params: { sites: sitesParam }
    })
  } catch (e) {
    retestData.value = null
  }
}



async function refreshAll() {
  await fetchBinData()
  await fetchMapData()
  renderBinMap()
  if (options.value.show_yield_plot) renderYieldPlot()
  if (options.value.show_fail_bin) renderFailBinChart()
  if (retestExpanded.value) await fetchRetestData()
}

async function onDataRangeChange() {
  await refreshAll()
}

watch(retestExpanded, async (val) => {
  if (val && !retestData.value) {
    await fetchRetestData()
  }
})

// ── Bin Map ───────────────────────────────────────────
function renderBinMap() {
  const canvas = binMapCanvas.value
  if (!canvas) return

  if (!mapCache.value.length) {
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    return
  }

  // Site过滤
  let data = mapCache.value
  if (options.value.selected_sites.length < allSites.value.length) {
    // 需要按site过滤，但mapCache已有site信息
    data = data.filter((d: any) => options.value.selected_sites.includes(d.site))
  }

  // 绑定鼠标事件（只绑定一次）
  if (!(canvas as any)._binMapBound) {
    canvas.onmousemove = onBinMapMouseMove
    canvas.onmouseleave = onBinMapMouseLeave
    ;(canvas as any)._binMapBound = true
  }

  drawBinMap(canvas, data, selectedBin.value)
}

function applyRotation(x: number, y: number, minX: number, maxX: number, minY: number, maxY: number) {
  switch (options.value.rotate) {
    case '90':  return { x: maxY - y + minX, y: x - minX + minY }
    case '180': return { x: maxX - x + minX, y: maxY - y + minY }
    case '270': return { x: y - minY + minX, y: maxX - x + minY }
    default:    return { x, y }
  }
}

function drawBinMap(canvas: HTMLCanvasElement, data: any[], highlightBin: number | null, singleBin?: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx || !data.length) return

  // 计算 min/max
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const d of data) {
    if (d.x < minX) minX = d.x
    if (d.x > maxX) maxX = d.x
    if (d.y < minY) minY = d.y
    if (d.y > maxY) maxY = d.y
  }

  const rotated = data.map(d => {
    const r = applyRotation(d.x, d.y, minX, maxX, minY, maxY)
    return { ...d, rx: r.x, ry: r.y }
  })

  let rMinX = Infinity, rMaxX = -Infinity
  let rMinY = Infinity, rMaxY = -Infinity
  for (const d of rotated) {
    if (d.rx < rMinX) rMinX = d.rx
    if (d.rx > rMaxX) rMaxX = d.rx
    if (d.ry < rMinY) rMinY = d.ry
    if (d.ry > rMaxY) rMaxY = d.ry
  }

  const W = canvas.width, H = canvas.height
  const margin = 50
  const centerX = W / 2
  const centerY = H / 2
  const radius = Math.min(W, H) / 2 - margin

  const gridW = rMaxX - rMinX + 1
  const gridH = rMaxY - rMinY + 1
  
  // 支持长方形 Die：分别计算 X 和 Y 方向的步长
  const dieW = (radius * 2) / gridW
  const dieH = (radius * 2) / gridH
  
  const offsetX = centerX - radius
  const offsetY = centerY - radius

  ctx.clearRect(0, 0, W, H)

  // 绘制 Wafer 背景圆
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2)
  ctx.fillStyle = '#fdfdfd'
  ctx.fill()
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  ctx.stroke()

  // 绘制圆周边界
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 2
  ctx.stroke()

  // 绘制 Notch (缺口) - 随旋转角度变化
  let notchX = centerX, notchY = centerY + radius
  let startAngle = Math.PI, endAngle = 0
  
  switch (options.value.rotate) {
    case '90':
      notchX = centerX - radius; notchY = centerY
      startAngle = 1.5 * Math.PI; endAngle = 0.5 * Math.PI
      break
    case '180':
      notchX = centerX; notchY = centerY - radius
      startAngle = 0; endAngle = Math.PI
      break
    case '270':
      notchX = centerX + radius; notchY = centerY
      startAngle = 0.5 * Math.PI; endAngle = 1.5 * Math.PI
      break
  }

  ctx.beginPath()
  ctx.arc(notchX, notchY, 12, startAngle, endAngle)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#cccccc'
  ctx.stroke()

  const coordSet = new Set(rotated.map(d => `${d.rx},${d.ry}`))
  const isEdge = (rx: number, ry: number) =>
    !coordSet.has(`${rx-1},${ry}`) || !coordSet.has(`${rx+1},${ry}`) ||
    !coordSet.has(`${rx},${ry-1}`) || !coordSet.has(`${rx},${ry+1}`)

  // 记录die位置供hover检测
  binMapDies = []
  rotated.forEach(d => {
    const px = offsetX + (d.rx - rMinX) * dieW
    const py = offsetY + (d.ry - rMinY) * dieH

    let color = ''
    if (highlightBin !== null) {
      if (d.bin === highlightBin) color = getBinColor(d.bin)
      else if (isEdge(d.rx, d.ry)) color = 'rgba(200,200,200,0.15)'
      else return
    } else if (singleBin !== undefined) {
      if (d.bin === singleBin) color = getBinColor(d.bin)
      else if (isEdge(d.rx, d.ry)) color = 'rgba(200,200,200,0.15)'
      else return
    } else {
      color = getBinColor(d.bin)
    }

    ctx.fillStyle = color
    // 绘制 Die，留出极小的间隙以区分
    const drawW = Math.max(0.5, dieW - 0.2)
    const drawH = Math.max(0.5, dieH - 0.2)
    ctx.fillRect(px, py, drawW, drawH)

    if (d.retest && options.value.data_range !== 'original') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      const cx = px + drawW / 2, cy = py + drawH / 2
      const arm = Math.min(drawW, drawH) * 0.35
      const thick = Math.max(1, Math.min(drawW, drawH) * 0.1)
      ctx.fillRect(cx - thick / 2, cy - arm, thick, arm * 2)
      ctx.fillRect(cx - arm, cy - thick / 2, arm * 2, thick)
    }

    // 记录位置用于hover检测
    binMapDies.push({ px, py, width: dieW, height: dieH, x: d.x, y: d.y, bin: d.bin, site: d.site })
  })

  // 坐标标注
  ctx.fillStyle = '#999'
  const fontSize = Math.max(8, Math.min(10, Math.min(dieW, dieH) * 0.8))
  ctx.font = `${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  
  const xStep = Math.max(1, Math.ceil(gridW / 15))
  for (let rx = rMinX; rx <= rMaxX; rx += xStep) {
    ctx.fillText(String(rx), offsetX + (rx - rMinX) * dieW + dieW / 2, offsetY - 10)
    ctx.fillText(String(rx), offsetX + (rx - rMinX) * dieW + dieW / 2, offsetY + radius * 2 + 15)
  }
  
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const yStep = Math.max(1, Math.ceil(gridH / 15))
  for (let ry = rMinY; ry <= rMaxY; ry += yStep) {
    ctx.fillText(String(ry), offsetX - 10, offsetY + (ry - rMinY) * dieH + dieH / 2)
  }
}

// ── Bin Map Tooltip ────────────────────────────────────
function onBinMapMouseMove(evt: MouseEvent) {
  const canvas = binMapCanvas.value
  const tooltipEl = binMapTooltipEl.value
  if (!canvas || !tooltipEl || !binMapDies.length) return

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const mx = (evt.clientX - rect.left) * scaleX
  const my = (evt.clientY - rect.top) * scaleY

  let found = null
  for (const die of binMapDies) {
    if (mx >= die.px && mx <= die.px + die.width && my >= die.py && my <= die.py + die.height) {
      found = die
      break
    }
  }

  if (found) {
    tooltipEl.innerHTML = `<div>X: ${found.x}, Y: ${found.y}</div><div>Bin: ${found.bin}</div><div>Site: ${found.site}</div>`
    tooltipEl.style.display = 'block'
    tooltipEl.style.left = (evt.offsetX + 14) + 'px'
    tooltipEl.style.top = (evt.offsetY + 14) + 'px'
  } else {
    tooltipEl.style.display = 'none'
  }
}

function onBinMapMouseLeave() {
  const tooltipEl = binMapTooltipEl.value
  if (tooltipEl) tooltipEl.style.display = 'none'
}

// ── Yield Plot（12区域晶圆良率图）───────────────────────
function renderYieldPlot() {
  if (!options.value.show_yield_plot) return
  nextTick(() => {
    const canvas = yieldPlotCanvas.value
    if (!canvas || !mapCache.value.length) return

    const data = mapCache.value
  const xs = data.map(d => d.x), ys = data.map(d => d.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2

  // 计算每个die到圆心的距离和角度
  const maxR = Math.max(...data.map(d => Math.sqrt((d.x - cx) ** 2 + (d.y - cy) ** 2)))

  // 3环 × 4象限 = 12区域
  const rings = 3, sectors = 4
  const zones: { pass: number, total: number }[][] = Array.from(
    { length: rings }, () => Array.from({ length: sectors }, () => ({ pass: 0, total: 0 }))
  )

  data.forEach(d => {
    const dx = d.x - cx, dy = d.y - cy
    const r = Math.sqrt(dx ** 2 + dy ** 2)
    const angle = Math.atan2(dy, dx)

    const ringIdx = Math.min(Math.floor(r / maxR * rings), rings - 1)
    const sectorIdx = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * sectors) % sectors

    zones[ringIdx]![sectorIdx]!.total++
    if (isPassBin(d.bin)) zones[ringIdx]![sectorIdx]!.pass++
  })

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  const centerX = W / 2, centerY = H / 2
  const maxRadius = Math.min(W, H) / 2 - 20

  ctx.clearRect(0, 0, W, H)

  for (let ri = rings - 1; ri >= 0; ri--) {
    const outerR = maxRadius * (ri + 1) / rings
    const innerR = maxRadius * ri / rings

    for (let si = 0; si < sectors; si++) {
      const startAngle = (si / sectors) * 2 * Math.PI - Math.PI / 2
      const endAngle = ((si + 1) / sectors) * 2 * Math.PI - Math.PI / 2
      const zone = zones[ri]![si]!
      const yield_ = zone.total > 0 ? zone.pass / zone.total : 0

      // 颜色：低良率红→高良率绿
      const r = Math.round(255 * (1 - yield_))
      const g = Math.round(255 * yield_)
      ctx.fillStyle = `rgba(${r},${g},0,0.8)`

      ctx.beginPath()
      ctx.arc(centerX, centerY, outerR, startAngle, endAngle)
      ctx.arc(centerX, centerY, innerR, endAngle, startAngle, true)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // 显示良率文字
      const midR = (innerR + outerR) / 2
      const midAngle = (startAngle + endAngle) / 2
      const tx = centerX + midR * Math.cos(midAngle)
      const ty = centerY + midR * Math.sin(midAngle)
      ctx.fillStyle = 'white'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText((yield_ * 100).toFixed(1) + '%', tx, ty)
    }
  }
  })
}

// ── Fail Bin 柱状图 ───────────────────────────────────
function renderFailBinChart() {
  if (!options.value.show_fail_bin) {
    if (failBinChart) {
      failBinChart.dispose()
      failBinChart = null
    }
    return
  }
  nextTick(() => {
    if (!failBinChartRef.value) return
    
    failBinChart = echarts.getInstanceByDom(failBinChartRef.value) as echarts.ECharts | null
    if (!failBinChart) {
      failBinChart = echarts.init(failBinChartRef.value)
    }
    
    // 获取失败的 Bin 并按数量降序排列 (Pareto)
    const failBinList = binData.value.bins.filter((b: any) => !isPassBin(b.bin_number))
    failBinList.sort((a: any, b: any) => b.all_site_count - a.all_site_count)
    
    // 计算累加百分比 (相对于总测试 Die 数，包含起始良率，最终累加至 100%)
    const totalDies = getTotalAll()
    const totalPass = getTotalPass()
    let cumulativeCount = totalPass // 初始累加量等于 Pass Die 数量 (即良率基数)

    const cumulativePctList = failBinList.map((b: any) => {
      cumulativeCount += b.all_site_count
      return totalDies > 0 ? (cumulativeCount / totalDies * 100).toFixed(2) : 0
    })

    failBinChart?.setOption({
      title: { text: 'Fail Bin Analysis (Pareto)', left: 'center', textStyle: { fontSize: 12 } },
      tooltip: { 
        trigger: 'axis',
        formatter: function (params: any) {
          let html = params[0].name + '<br/>';
          params.forEach((param: any) => {
            if (param.seriesType === 'bar') {
              html += `${param.marker} Count: ${param.value}<br/>`;
            } else if (param.seriesType === 'line') {
              html += `${param.marker} Cumulative Yield: ${param.value}%<br/>`;
            }
          });
          return html;
        }
      },
      legend: { data: ['Count', 'Cumulative Yield %'], bottom: 0 },
      xAxis: {
        type: 'category',
        data: failBinList.map((b: any) => `Bin${b.bin_number}\n${b.bin_name}`),
        axisLabel: { rotate: 45, fontSize: 10 }
      },
      yAxis: [
        { type: 'value', name: 'Count' },
        { type: 'value', name: 'Cumulative Yield (%)', min: (totalDies > 0 ? Math.floor(totalPass / totalDies * 100) : 0), max: 100, axisLabel: { formatter: '{value} %' } }
      ],
      series: [
        {
          name: 'Count',
          type: 'bar',
          data: failBinList.map((b: any) => b.all_site_count),
          itemStyle: { color: (params: any) => getBinColor(failBinList[params.dataIndex].bin_number) },
          label: { show: true, position: 'insideTop', fontSize: 10, color: '#000' }
        },
        {
          name: 'Cumulative Yield %',
          type: 'line',
          yAxisIndex: 1,
          data: cumulativePctList,
          itemStyle: { color: '#FF4500' },
          symbolSize: 6,
          label: { show: true, position: 'top', formatter: '{c}%', fontSize: 10 }
        }
      ]
    })
  })
}

function toggleBinHighlight(binNum: number) {
  selectedBin.value = selectedBin.value === binNum ? null : binNum
  renderBinMap()
}

async function saveComment(bin: any) {
  try {
    await api.post(`/analysis/lot/${lotId.value}/bin_comment`, {
      bin_number: bin.bin_number,
      comment: bin.comment || ''
    })
  } catch (e) {
    console.error('Failed to save comment', e)
  }
}

async function handleApplyBinNames() {
  if (!pastedText.value.trim()) return

  const lines = pastedText.value.split('\n')
  const nameList: { bin_number: number; bin_name: string }[] = []
  const binMap: Record<number, string> = {}

  const addBinName = (binNum: number, name: string) => {
    const cleanName = name.trim()
    if (!Number.isInteger(binNum) || binNum < 0 || !cleanName) return
    if (binMap[binNum] !== undefined) {
      const existing = nameList.find(item => item.bin_number === binNum)
      if (existing) existing.bin_name = cleanName
    } else {
      nameList.push({ bin_number: binNum, bin_name: cleanName })
    }
    binMap[binNum] = cleanName
  }

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    // Format 1: SBin[9]   ILKG_ENB_6P5_AMR__Fail          0     0.00%   9
    const match1 = line.match(/^S?Bin\[(\d+)\]\s+(.*?)\s+(\d+)\s+([\d\.]+%)\s+(\d+)/i)
    if (match1) {
      const binNum = parseInt(match1[1] || '0', 10)
      const name = (match1[2] || '').trim()
      addBinName(binNum, name)
      continue
    }

    // Format 2: 19     F    TA01_BG_bef                    80       1.34
    // or 5     F    Open Test                       0
    const match2 = line.match(/^(\d+)\s+([A-Za-z])\s+(.*?)\s+(\d+)(?:\s+[\d\.]+)?$/)
    if (match2) {
      const binNum = parseInt(match2[1] || '0', 10)
      const name = (match2[3] || '').trim()
      addBinName(binNum, name)
      continue
    }

    // Format 3: 1 GOOD / 1\tGOOD / 1,GOOD
    const match3 = line.match(/^(\d+)[\t, ]+(.+?)\s*$/)
    if (match3) {
      const binNum = parseInt(match3[1] || '0', 10)
      const name = (match3[2] || '').trim()
      addBinName(binNum, name)
      continue
    }
  }

  if (nameList.length === 0) {
    alert('未解析到有效的 Bin Name 数据，请检查粘贴格式！')
    return
  }

  try {
    // 1. 发送至后端接口保存（同步写入 LOT 和 程序缓存）
    await api.post(`/analysis/lot/${lotId.value}/bin_names`, { names: nameList })

    // 2. 实时更新前端 reactive state
    if (binData.value && binData.value.bins) {
      binData.value.bins.forEach((b: any) => {
        if (binMap[b.bin_number] !== undefined) {
          b.bin_name = binMap[b.bin_number]
        }
      })
    }

    // 3. 重新绘制 fail bin 分析图和 wafer map
    if (options.value.show_fail_bin) {
      renderFailBinChart()
    }
    renderBinMap()

    uploadModalVisible.value = false
    pastedText.value = ''
    alert(`成功更新并保存了 ${nameList.length} 个 Bin 的名称！\n同程序的其他 Lot 也将自动调用此映射。`)
  } catch (e) {
    console.error('Failed to save bin names', e)
    alert('保存 Bin Name 失败，请检查网络或后台服务！')
  }
}

async function openBinDetail(binNum: number, binName: string) {
  binDetailNum.value = binNum
  binDetailName.value = binName
  binDetailVisible.value = true
  await nextTick()
  if (binDetailCanvas.value) {
    drawBinMap(binDetailCanvas.value, mapCache.value, null, binNum)
  }
}

// ── 复测分析辅助函数 ──────────────────────────────────
function getDirection(fb: number, lb: number): string {
  const fbPass = isPassBin(fb), lbPass = isPassBin(lb)
  if (fbPass && lbPass) return 'pass_pass'
  if (!fbPass && lbPass) return 'fail_pass'
  if (fbPass && !lbPass) return 'pass_fail'
  return 'fail_fail'
}

function directionClass(direction: string, noChange: boolean) {
  if (noChange) return 'row-same'
  if (direction === 'fail_pass') return 'row-improve'
  if (direction === 'pass_fail') return 'row-drop'
  if (direction === 'fail_fail') return 'row-change'
  return ''
}

function directionLabel(direction: string, noChange: boolean) {
  if (noChange) return '无变化'
  if (direction === 'fail_pass') return '✅ Fail→Pass'
  if (direction === 'pass_fail') return '❌ Pass→Fail'
  if (direction === 'fail_fail') return '🔄 Fail→Fail'
  return 'Pass→Pass'
}

async function handleExport() {
  if (!lotInfo.value) return

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Chip ATE System'
  const sheet = workbook.addWorksheet('Bin Summary')

  // 1. 写头部信息 (Lot Info)
  const headerData = [
    ['Lot Information', ''],
    ['Name', lotInfo.value.filename || ''],
    ['Program', lotInfo.value.program || ''],
    ['Test Machine', lotInfo.value.test_machine || ''],
    ['Station Count', lotInfo.value.station_count || ''],
    ['Die Count', lotInfo.value.die_count || ''],
    ['Yield Rate', lotInfo.value.yield_rate ? (lotInfo.value.yield_rate * 100).toFixed(2) + '%' : '-'],
    ['Data Type', lotInfo.value.data_type || ''],
    ['Test Date', lotInfo.value.test_date ? fmtDateTz(lotInfo.value.test_date) : '']
  ]
  
  headerData.forEach(row => {
    sheet.addRow(row)
  })
  
  sheet.addRow([]) // 空行分隔

  // 2. 写表头
  const sites = options.value.selected_sites
  const tableHeader = ['Bin', 'Name', ...sites.map(s => `Site${s}`), 'All Site', '% of total', 'Comment']
  const headerRow = sheet.addRow(tableHeader)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF808080' } // 灰色背景
  }

  // 3. 写表格数据
  const bins = sortedBins.value
  bins.forEach((b: any) => {
    const rowData = [
      b.bin_number,
      b.bin_name,
      ...sites.map(s => b.sites[`site${s}`]?.count ?? 0),
      b.all_site_count,
      (b.all_site_pct ?? 0).toFixed(2) + '%',
      b.comment || ''
    ]
    const row = sheet.addRow(rowData)
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    if (isPassBin(b.bin_number)) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFE6' } } // 浅绿
    }
  })

  // 写 Summary 行 (Passes, Fails, Sum)
  const passRow = sheet.addRow(['Passes', '', ...sites.map(s => getSitePass(s)), getTotalPass(), (getTotalAll() > 0 ? (getTotalPass() / getTotalAll() * 100).toFixed(2) + '%' : '-'), ''])
  passRow.font = { bold: true }
  
  const failRow = sheet.addRow(['Fails', '', ...sites.map(s => getSiteFail(s)), getTotalFail(), (getTotalAll() > 0 ? (getTotalFail() / getTotalAll() * 100).toFixed(2) + '%' : '-'), ''])
  failRow.font = { bold: true }
  
  const sumRow = sheet.addRow(['Sum', '', ...sites.map(s => getSiteTotal(s)), getTotalAll(), '100.00%', ''])
  sumRow.font = { bold: true }

  // 设置列宽
  sheet.columns.forEach(col => {
    col.width = 15
  })

  // 4. 添加 Map 图像和图例 (合成一张图)
  if (binMapCanvas.value && options.value.selected_sites.length > 0 && hasCoords.value) {
    // 获取需要显示的 Bin 图例
    const visibleBins = bins.filter((b: any) => {
      return sites.reduce((sum, s) => sum + (b.sites[`site${s}`]?.count ?? 0), 0) > 0
    })

    const mapWidth = binMapCanvas.value.width
    const mapHeight = binMapCanvas.value.height
    
    // 图例占据的宽度
    const legendWidth = 220
    // 根据可见的 Bin 数量计算需要的高度
    const legendHeight = visibleBins.length * 20 + 40
    
    const compositeWidth = mapWidth + legendWidth
    const compositeHeight = Math.max(mapHeight, legendHeight)

    // 创建离屏 Canvas
    const offCanvas = document.createElement('canvas')
    offCanvas.width = compositeWidth
    offCanvas.height = compositeHeight
    const ctx = offCanvas.getContext('2d')

    if (ctx) {
      // 填充白色背景
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, compositeWidth, compositeHeight)

      // 左侧画 Map
      ctx.drawImage(binMapCanvas.value, 0, 0)

      // 右侧画图例
      const startX = mapWidth + 10
      let startY = 30
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'

      visibleBins.forEach((b: any) => {
        const currentCount = sites.reduce((sum, s) => sum + (b.sites[`site${s}`]?.count ?? 0), 0)
        const color = getBinColor(b.bin_number)

        // 画圆点
        ctx.beginPath()
        ctx.arc(startX + 6, startY, 5, 0, 2 * Math.PI)
        ctx.fillStyle = color
        ctx.fill()

        // 画文字
        ctx.fillStyle = '#333'
        ctx.fillText(`Bin${b.bin_number}(${currentCount})`, startX + 16, startY)

        startY += 24
      })

      // 将拼接后的 Canvas 转换为 Base64
      const mapDataUrl = offCanvas.toDataURL('image/png')
      
      // 向 Workbook 添加图片资源
      const imageId = workbook.addImage({
        base64: mapDataUrl,
        extension: 'png',
      })
      
      // 计算插入位置：在表格下方隔两行
      const imageStartRow = sheet.lastRow ? sheet.lastRow.number + 2 : 1
      
      // 在指定位置插入图片 (这里以单元格为基准放置)
      sheet.addImage(imageId, {
        tl: { col: 0.5, row: imageStartRow }, // 略微缩进，放在A列偏右
        ext: { width: compositeWidth, height: compositeHeight }    // 设置图片大小
      })
    }
  }

  // 5. 导出文件
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const filename = `${lotInfo.value.filename || 'BinReport'}_${new Date().getTime()}.xlsx`
  saveAs(blob, filename)
}

onMounted(async () => {
  await fetchLotInfo()
  await fetchPassBins()
  await fetchBinData()
  await fetchMapData()
  await nextTick()
  renderBinMap()
})
</script>

<style scoped>
.bin-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px; /* 增加一点内边距 */
  padding-bottom: 20px;
  width: 100%;
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #f0f2f5;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0;
  margin: -10px 0 0 0; /* 贴合顶部并抵消 padding */
}

.sortable {
  cursor: pointer;
  user-select: none;
}
.sortable:hover { background: #f0f0f0; }

.lot-info-bar {
  background: white;
  padding: 10px 16px;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.info-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.label { font-size: 11px; color: #999; }
.value { font-size: 13px; color: #333; font-weight: 500; }

.options-bar {
  background: white;
  padding: 8px 16px;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 12px;
}

.opt-group { display: flex; align-items: center; gap: 8px; }
.opt-label { color: #666; font-weight: 500; white-space: nowrap; }

.export-btn {
  background: #52c41a;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}
.export-btn:hover {
  background: #73d13d;
}

.bin-table-area {
  background: white;
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow-x: auto;
  width: 100%; /* 关键：容器宽度根据表格内容自适应 */
  max-width: 100%;    /* 关键：防止超出屏幕 */
}

.bin-table { 
  /* width: 100%;  */
  border-collapse: collapse; 
  font-size: 12px; 
  table-layout: auto; /* 关键：让浏览器根据内容自动计算列宽 */
}
.bin-table th, .bin-table td {
border: 1px solid #f0f0f0;
  padding: 5px 12px; /* 增加一点左右内边距提升可读性 */
  text-align: center;
  white-space: nowrap; /* 保持文字不换行 */
  min-width: 60px;     /* 关键：设置最小宽度防止太挤 */
}
.bin-table th { background: #fafafa; color: #666; }
.pass-row { background: #f6ffed; }
.summary-row { background: #fafafa; font-weight: 500; }
.bin-link { color: #1890ff; cursor: pointer; text-decoration: underline; }

.bin-table th,
.bin-table td {
  box-sizing: border-box;
}

.bin-table th:nth-child(1),
.bin-table td:nth-child(1) {
  position: sticky;
  left: 0;
  z-index: 2;
  width: 72px;
  min-width: 72px;
  max-width: 72px;
  background: #fff;
}

.bin-table th:nth-child(2),
.bin-table td:nth-child(2) {
  position: sticky;
  left: 72px;
  z-index: 2;
  width: 160px;
  min-width: 160px;
  max-width: 160px;
  background: #fff;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.06);
}

.bin-table th:nth-child(1),
.bin-table th:nth-child(2) {
  z-index: 4;
  background: #fafafa;
}

.bin-table .pass-row td:nth-child(1),
.bin-table .pass-row td:nth-child(2) {
  background: #f6ffed;
}

.bin-table .summary-row td:first-child {
  position: sticky;
  left: 0;
  z-index: 3;
  width: 232px;
  min-width: 232px;
  max-width: 232px;
  background: #fafafa;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.06);
}

.bottom-area {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  background: white;
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.map-section { flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.chart-section { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.section-title { font-size: 13px; font-weight: 600; text-align: center; }

.map-with-legend { display: flex; gap: 8px; align-items: flex-start; }

.bin-legend {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 800px;
  overflow-y: auto;
  padding-right: 4px;
}

.bin-icon {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.bin-icon.selected { background: #e6f7ff; }
.bin-icon:hover { background: #f5f5f5; }

.bin-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 复测分析 */
.retest-section {
  background: white;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden;
}

.retest-header {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}
.retest-header:hover { background: #f0f0f0; }

.retest-totals {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  flex-wrap: wrap;
  font-size: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.total-item { padding: 4px 10px; border-radius: 4px; background: #f5f5f5; }
.total-item.pass { background: #f6ffed; color: #52c41a; }
.total-item.fail { background: #fff2f0; color: #ff4d4f; }
.total-item.change { background: #fff7e6; color: #fa8c16; }

.retest-tables {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
}

.retest-table-wrap { flex: 1; }
.table-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #666; }

.retest-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.retest-table th, .retest-table td {
  border: 1px solid #f0f0f0;
  padding: 4px 8px;
  text-align: center;
}
.retest-table th { background: #fafafa; }

.row-improve { background: #f6ffed; }
.row-drop { background: #fff2f0; }
.row-change { background: #fff7e6; }
.row-same { color: #999; }

/* Bin详情弹窗 */
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
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}
.modal-close { cursor: pointer; color: #999; font-size: 18px; }
.modal-close:hover { color: red; }

.bin-tooltip {
  position: absolute;
  background: rgba(0,0,0,0.78);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 100;
}

.modal-btn {
  padding: 8px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  border: none;
  font-weight: 500;
  transition: all 0.2s ease;
}
.modal-btn.cancel {
  background: #f0f0f0;
  color: #555;
}
.modal-btn.cancel:hover {
  background: #e4e4e4;
}
.modal-btn.confirm {
  background: #1890ff;
  color: white;
}
.modal-btn.confirm:hover {
  background: #40a9ff;
}
.modal-btn.confirm:disabled {
  background: #bae7ff;
  color: rgba(255, 255, 255, 0.7);
  cursor: not-allowed;
}
</style>
