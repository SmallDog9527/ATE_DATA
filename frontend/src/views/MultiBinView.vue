<template>
  <div class="multi-bin-view">
    <!-- Options栏 -->
    <div class="options-bar">
      <div v-if="!isOsatSummaryReport" class="opt-group">
        <span class="opt-label">DataRange</span>
        <label><input type="radio" v-model="dataRange" value="final" @change="fetchAll" /> Final</label>
        <label><input type="radio" v-model="dataRange" value="original" @change="fetchAll" /> Original</label>
      </div>
      <div v-if="!isOsatSummaryReport" class="opt-group" style="margin-left: 20px;">
        <span class="opt-label">Display</span>
        <button class="toggle-btn" :class="{ active: showCount }" @click="showCount = !showCount">Count</button>
        <button class="toggle-btn" :class="{ active: showYield }" @click="showYield = !showYield">Yield</button>
        <button class="toggle-btn" :class="{ active: showComment }" @click="showComment = !showComment">Comment</button>
      </div>
      <button v-if="!isOsatSummaryReport" class="export-btn" @click="openMultiAnalysis">📈 参数分析</button>
      <button class="export-btn" @click="handleExport">📁 导出 Excel</button>
      <button 
        v-if="!route.query.report_id" 
        class="save-report-btn" 
        :class="{ saved: isSaved }" 
        @click="saveToReportCenter"
      >
        💾 保存到报表中心
      </button>
    </div>

    <!-- Bin汇总表 -->
    <div class="osat-report-layout" v-if="isOsatSummaryReport && bins.length">
      <div class="table-wrap osat-summary-wrap">
        <table class="bin-table osat-summary-table">
          <thead>
            <tr>
              <th>Bin</th>
              <th>Name</th>
              <th @click="toggleCountSort" class="sortable-header">Total Count <span v-if="countSortOrder !== 'none'">{{ countSortOrder === 'asc' ? '↑' : '↓' }}</span></th>
              <th>Total %</th>
              <th class="chk-col">Trend</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in bins"
              :key="b.bin_number"
              :class="{ 'pass-row': isPassBin(b.bin_number), 'active-filter-row': globalBinFilter === b.bin_number }"
            >
              <td>{{ b.bin_number }}</td>
              <td>{{ b.bin_name }}</td>
              <td>{{ getBinTotalCount(b) }}</td>
              <td>{{ getBinTotalPct(b) }}%</td>
              <td class="chk-col">
                <input
                  type="checkbox"
                  :checked="globalBinFilter === b.bin_number"
                  @change="setGlobalBinFilter(b.bin_number)"
                  class="bin-checkbox"
                />
              </td>
            </tr>
            <tr class="summary-row">
              <td colspan="2">Total</td>
              <td>{{ getAllTotal() }}</td>
              <td>100%</td>
              <td></td>
            </tr>
            <tr class="summary-row pass-row">
              <td colspan="2">Pass</td>
              <td>{{ getAllPass() }}</td>
              <td>{{ getAllTotal() > 0 ? (getAllPass() / getAllTotal() * 100).toFixed(2) + '%' : '-' }}</td>
              <td></td>
            </tr>
            <tr class="summary-row">
              <td colspan="2">Fail</td>
              <td>{{ getAllFail() }}</td>
              <td>{{ getAllTotal() > 0 ? (getAllFail() / getAllTotal() * 100).toFixed(2) + '%' : '-' }}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="osat-trend-panel">
        <div class="trend-header">
          <div class="trend-title">{{ selectedTrendBin ? `Bin ${selectedTrendBin.bin_number} - ${selectedTrendBin.bin_name}` : 'Bin Trend' }}</div>
          <div class="trend-legend">
            <span><i class="legend-dot total"></i>Total %</span>
            <span><i class="legend-dot wafer"></i>Wafer %</span>
          </div>
        </div>
        <div class="trend-chart-wrap">
          <canvas
            ref="trendCanvasRef"
            width="900"
            height="420"
            class="trend-canvas"
            @mousemove="handleTrendMouseMove"
            @mouseleave="handleTrendMouseLeave"
          ></canvas>
          <div v-if="!selectedTrendBin" class="trend-empty">选择一个 Bin 查看趋势</div>
        </div>
      </div>
    </div>

    <div class="table-wrap" v-else-if="bins.length">
      <table class="bin-table">
        <thead>
          <!-- 第一行：LOT名 colspan=2 -->
          <tr>
            <th rowspan="2" class="chk-col"></th>
            <th rowspan="2">Bin</th>
            <th rowspan="2">Name</th>
            <th colspan="2" class="lot-header">Total</th>
            <th
              v-for="(lot, index) in lots"
              :key="lot.id"
              :colspan="getLotColSpan()"
              class="lot-header draggable-header"
              draggable="true"
              @dragstart="handleDragStart(index)"
              @dragover.prevent
              @drop="handleDrop(index)"
            >
              <div class="lot-header-top">
                <a :href="'/lot/' + lot.id + '/bin'" target="_blank" class="lot-link">{{ getLotDisplayName(lot) }}</a>
              </div>
            </th>
            <th rowspan="2" class="global-comment-header" :style="{ width: globalCommentWidth + 'px', minWidth: globalCommentWidth + 'px' }">
              <div class="header-content">Analysis Comment</div>
              <div class="resizer" @mousedown="startGlobalResize"></div>
            </th>
            <th rowspan="2" class="all-comment-header" :style="{ width: allCommentWidth + 'px' }">
              <div class="header-content">All Comment</div>
              <div class="resizer" @mousedown="startAllCommentResize"></div>
            </th>
          </tr>
          <!-- 第二行：Count / % / Comment -->
          <tr>
            <th @click="toggleCountSort" class="sortable-header">Count <span v-if="countSortOrder !== 'none'">{{ countSortOrder === 'asc' ? '↑' : '↓' }}</span></th>
            <th>%</th>
            <template v-for="lot in lots" :key="lot.id">
              <th v-if="showCount">Count</th>
              <th v-if="showYield">%</th>
              <th v-if="showComment" class="comment-header-col" :style="{ width: (lot.width || 120) + 'px', minWidth: (lot.width || 120) + 'px' }">
                <div class="header-content">Comment</div>
                <div class="resizer" @mousedown="e => startResize(e, lot)"></div>
              </th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(b, bIdx) in bins"
            :key="b.bin_number"
            :class="{ 'pass-row': isPassBin(b.bin_number), 'active-filter-row': globalBinFilter === b.bin_number }"
          >
            <td class="chk-col">
              <input
                type="checkbox"
                :checked="globalBinFilter === b.bin_number"
                @change="setGlobalBinFilter(b.bin_number)"
                class="bin-checkbox"
              />
            </td>
            <td>{{ b.bin_number }}</td>
            <td>{{ b.bin_name }}</td>
            <td>{{ getBinTotalCount(b) }}</td>
            <td>{{ getBinTotalPct(b) }}%</td>
            <template v-for="lot in lots" :key="lot.id">
              <td v-if="showCount">{{ b.lots[String(lot.id)]?.count ?? 0 }}</td>
              <td v-if="showYield">{{ (b.lots[String(lot.id)]?.pct ?? 0).toFixed(2) }}%</td>
              <td v-if="showComment" class="comment-cell" :style="{ width: (lot.width || 120) + 'px', minWidth: (lot.width || 120) + 'px' }">
                <div class="comment-text-wrap" :title="b.lots[String(lot.id)]?.comment">
                  {{ b.lots[String(lot.id)]?.comment ?? '-' }}
                </div>
              </td>
            </template>
            <td class="global-comment-cell">
              <textarea
                v-model="b.global_comment"
                class="comment-textarea"
                :disabled="!canEditReport"
                @blur="saveReportImmediately"
                @mouseleave="saveReportImmediately"
              ></textarea>
            </td>
            <!-- All Comment: 第一行渲染，rowspan 跨越所有 bin + summary 行 -->
            <td v-if="bIdx === 0" :rowspan="bins.length + 3" class="all-comment-cell">
              <textarea
                v-model="noteText"
                class="all-comment-textarea"
                :disabled="!canEditReport"
                placeholder="   "
                @blur="saveReportImmediately"
                @mouseleave="saveReportImmediately"
              ></textarea>
            </td>
          </tr>
          <tr class="summary-row" :class="{ 'active-filter-row': globalBinFilter === null }">
            <td class="chk-col">
              <input
                type="checkbox"
                :checked="globalBinFilter === null"
                @change="setGlobalBinFilter(null)"
                class="bin-checkbox"
              />
            </td>
            <td colspan="2">Total</td>
            <td>{{ getAllTotal() }}</td>
            <td>100%</td>
            <template v-for="lot in lots" :key="lot.id">
              <td v-if="showCount">{{ getLotTotal(lot.id) }}</td>
              <td v-if="showYield">100%</td>
              <td v-if="showComment"></td>
            </template>
            <td></td>
          </tr>
          <tr class="summary-row pass-row">
            <td class="chk-col"></td>
            <td colspan="2">Pass</td>
            <td>{{ getAllPass() }}</td>
            <td>{{ getAllTotal() > 0 ? (getAllPass() / getAllTotal() * 100).toFixed(2) + '%' : '-' }}</td>
            <template v-for="lot in lots" :key="lot.id">
              <td v-if="showCount">{{ getLotPass(lot.id) }}</td>
              <td v-if="showYield">{{ getLotTotal(lot.id) > 0 ? (getLotPass(lot.id) / getLotTotal(lot.id) * 100).toFixed(2) + '%' : '-' }}</td>
              <td v-if="showComment"></td>
            </template>
            <td></td>
          </tr>
          <tr class="summary-row">
            <td class="chk-col"></td>
            <td colspan="2">Fail</td>
            <td>{{ getAllFail() }}</td>
            <td>{{ getAllTotal() > 0 ? (getAllFail() / getAllTotal() * 100).toFixed(2) + '%' : '-' }}</td>
            <template v-for="lot in lots" :key="lot.id">
              <td v-if="showCount">{{ getLotFail(lot.id) }}</td>
              <td v-if="showYield">{{ getLotTotal(lot.id) > 0 ? (getLotFail(lot.id) / getLotTotal(lot.id) * 100).toFixed(2) + '%' : '-' }}</td>
              <td v-if="showComment"></td>
            </template>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <!-- 各LOT Wafer Map 横向并排 -->
    <div class="maps-section" v-if="!isOsatSummaryReport && mapDataList.some(m => m.has_map)">
      <div class="section-title">Wafer Bin Map</div>
      <div class="maps-row">
        <div
          v-for="(mapItem, idx) in mapDataList"
          :key="mapItem.lot_id"
          class="map-block"
          v-show="mapItem.has_map"
        >
          <div class="map-label">{{ getMapDisplayName(mapItem) }}</div>
          <div class="map-with-legend">
            <canvas
              :ref="el => setCanvasRef(idx, el)"
              width="520"
              height="520"
              style="width:520px;height:520px;border:1px solid #eee"
            ></canvas>
            <div class="bin-legend">
              <div
                class="bin-icon"
                :class="{ selected: selectedBins[idx] === null }"
                @click="toggleHighlight(idx, null)"
              >
                <span class="bin-dot" style="background:#aaa"></span>
                <span>ALL</span>
              </div>
              <div
                v-for="b in getMapBins(mapItem)"
                :key="b.bin_number"
                class="bin-icon"
                :class="{ selected: selectedBins[idx] === b.bin_number }"
                @click="toggleHighlight(idx, b.bin_number)"
              >
                <span class="bin-dot" :style="{ background: getBinColor(b.bin_number) }"></span>
                <span>Bin{{ b.bin_number }}({{ b.count }})</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const route = useRoute()
const router = useRouter()
const lotIdsStr = route.query.lot_ids as string

const openMultiAnalysis = () => {
  const url = router.resolve(`/multi-analysis?lot_ids=${lotIdsStr}`).href
  window.open(url, '_blank')
}

const lots = ref<any[]>([])
const bins = ref<any[]>([])
const mapDataList = ref<any[]>([])
const loading = ref(true)
const dataRange = ref('final')
const passBins = ref<number[]>([1, 2])
const selectedBins = ref<Record<number, number | null>>({})
const globalBinFilter = ref<number | null>(null) // null = show all (Total)

const showCount = ref(true)
const showYield = ref(false)
const showComment = ref(false)
const isDataLoading = ref(false)
const isSaved = ref(false)
const countSortOrder = ref<'none' | 'asc' | 'desc'>('none')
const noteText = ref('')
const reportAuthor = ref('unknown')
const currentReportConfig = ref<any>({})
const isOsatSummaryReport = computed(() => currentReportConfig.value?.osat_summary === true)
const trendCanvasRef = ref<HTMLCanvasElement | null>(null)
const trendHoverIndex = ref<number | null>(null)
const trendPointPositions = ref<Array<{ x: number; y: number; idx: number }>>([])
const selectedTrendBin = computed(() => {
  if (globalBinFilter.value === null) return null
  return bins.value.find(b => b.bin_number === globalBinFilter.value) || null
})

const canEditReport = computed(() => {
  const reportId = route.query.report_id
  if (!reportId) return true

  let role = ''
  let curUser = ''
  try {
    const userInfoStr = localStorage.getItem('user')
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr)
      role = (userInfo.role || '').toLowerCase().trim()
      curUser = (userInfo.username || '').toLowerCase().trim()
    }
  } catch (e) {}

  if (role === 'admin') return true
  return curUser === reportAuthor.value.toLowerCase().trim()
})

const globalCommentWidth = ref(300)
const allCommentWidth = ref(500)
let isResizing = false
let isGlobalResizing = false
let isAllCommentResizing = false
let startX = 0
let startWidth = 0
let currentLot: any = null

function startResize(e: MouseEvent, lot: any) {
  isResizing = true
  currentLot = lot
  if (!currentLot.width) currentLot.width = 120
  startX = e.clientX
  startWidth = currentLot.width
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', stopResize)
}

function handleMouseMove(e: MouseEvent) {
  if (!isResizing || !currentLot) return
  const diff = e.clientX - startX
  currentLot.width = Math.max(60, startWidth + diff)
}

function startGlobalResize(e: MouseEvent) {
  isGlobalResizing = true
  startX = e.clientX
  startWidth = globalCommentWidth.value
  document.addEventListener('mousemove', handleGlobalMouseMove)
  document.addEventListener('mouseup', stopGlobalResize)
}

function handleGlobalMouseMove(e: MouseEvent) {
  if (!isGlobalResizing) return
  const diff = e.clientX - startX
  globalCommentWidth.value = Math.max(80, startWidth + diff)
}

function stopResize() {
  isResizing = false
  currentLot = null
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', stopResize)
  saveReportImmediately()
}

function stopGlobalResize() {
  isGlobalResizing = false
  document.removeEventListener('mousemove', handleGlobalMouseMove)
  document.removeEventListener('mouseup', stopGlobalResize)
  saveReportImmediately()
}

function startAllCommentResize(e: MouseEvent) {
  isAllCommentResizing = true
  startX = e.clientX
  startWidth = allCommentWidth.value
  document.addEventListener('mousemove', handleAllCommentMouseMove)
  document.addEventListener('mouseup', stopAllCommentResize)
}

function handleAllCommentMouseMove(e: MouseEvent) {
  if (!isAllCommentResizing) return
  const diff = e.clientX - startX
  allCommentWidth.value = Math.max(80, startWidth + diff)
}

function stopAllCommentResize() {
  isAllCommentResizing = false
  document.removeEventListener('mousemove', handleAllCommentMouseMove)
  document.removeEventListener('mouseup', stopAllCommentResize)
  saveReportImmediately()
}

let draggedIndex: number | null = null

function handleDragStart(index: number) {
  draggedIndex = index
}

function handleDrop(targetIndex: number) {
  if (draggedIndex === null || draggedIndex === targetIndex) return
  
  const tempLots = [...lots.value]
  const lot = tempLots.splice(draggedIndex, 1)[0]
  tempLots.splice(targetIndex, 0, lot)
  lots.value = tempLots

  const tempMaps = [...mapDataList.value]
  const map = tempMaps.splice(draggedIndex, 1)[0]
  tempMaps.splice(targetIndex, 0, map)
  mapDataList.value = tempMaps

  draggedIndex = null
  nextTick(() => {
    mapDataList.value.forEach((_, i) => drawMap(i))
    saveReportImmediately()
  })
}

function getLotColSpan() {
  let count = 0
  if (showCount.value) count++
  if (showYield.value) count++
  if (showComment.value) count++
  return count || 1 // Avoid 0
}

// canvas refs per map index
const canvasRefs: Record<number, HTMLCanvasElement | null> = {}

function setCanvasRef(idx: number, el: any) {
  canvasRefs[idx] = el
  if (el && mapDataList.value[idx]?.has_map) {
    nextTick(() => drawMap(idx))
  }
}

const BIN_COLORS: Record<number, string> = {}
const FAIL_COLORS = [
  '#ff6b6b', '#4dabf7', '#ffd43b', '#e599f7', '#74c0fc',
  '#ffa94d', '#da77f2', '#ff8787', '#339af0', '#fcc419',
  '#cc5de8', '#22b8cf', '#ff922b', '#845ef7', '#f06595',
]

function getBinColor(binNum: number): string {
  if (isPassBin(binNum)) return '#69db7c'
  if (!BIN_COLORS[binNum]) {
    const idx = Object.keys(BIN_COLORS).filter(k => !isPassBin(Number(k))).length % FAIL_COLORS.length
    BIN_COLORS[binNum] = FAIL_COLORS[idx]!
  }
  return BIN_COLORS[binNum]!
}

function isPassBin(binNum: number) {
  return passBins.value.includes(binNum)
}

function getLotTotal(lotId: number) {
  return bins.value.reduce((s, b) => s + (b.lots[String(lotId)]?.count ?? 0), 0)
}
function getLotPass(lotId: number) {
  return bins.value
    .filter(b => isPassBin(b.bin_number))
    .reduce((s, b) => s + (b.lots[String(lotId)]?.count ?? 0), 0)
}
function getLotFail(lotId: number) {
  return getLotTotal(lotId) - getLotPass(lotId)
}

function getBinTotalCount(b: any) {
  return lots.value.reduce((s, lot) => s + (b.lots[String(lot.id)]?.count ?? 0), 0)
}
function getBinTotalPct(b: any) {
  const total = getAllTotal()
  if (total === 0) return '0.00'
  return ((getBinTotalCount(b) / total) * 100).toFixed(2)
}
function getAllTotal() {
  return lots.value.reduce((s, lot) => s + getLotTotal(lot.id), 0)
}
function getAllPass() {
  return lots.value.reduce((s, lot) => s + getLotPass(lot.id), 0)
}
function getAllFail() {
  return getAllTotal() - getAllPass()
}

function getWaferLabel(lot: any) {
  return getLotDisplayName(lot)
}

function getLotDisplayName(lot: any) {
  const lotId = lot?.lot_id || lot?.lot_id_str
  if (lotId && lot?.wafer_id) return `${lotId}-${lot.wafer_id}`
  return lot?.wafer_id || lotId || lot?.filename || `Lot ${lot?.id ?? lot?.lot_id ?? ''}`
}

function getMapDisplayName(mapItem: any) {
  return getLotDisplayName({
    id: mapItem?.lot_id,
    lot_id: mapItem?.lot_id_str,
    wafer_id: mapItem?.wafer_id,
    filename: mapItem?.filename,
  })
}

function getTrendAxisLabel(lot: any) {
  return getLotDisplayName(lot)
}

function getWaferAxisNumber(lot: any, idx: number) {
  const wafer = String(lot.wafer_id || "")
  const match = wafer.match(/(\d+)(?!.*\d)/)
  if (match) return String(Number(match[1]))
  return String((idx % 25) + 1)
}

function getNiceAxisStep(range: number) {
  const roughStep = Math.max(range, 1) / 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const normalized = roughStep / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return niceNormalized * magnitude
}

function getOsatAxisBounds(values: number[], binNumber: number) {
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  let minValue = binNumber === 1 ? Math.max(0, rawMin - 5) : Math.max(0, rawMin - rawMin * 0.2)
  let maxValue = Math.min(100, rawMax + rawMax * 0.2)

  if (maxValue <= minValue) {
    const pad = Math.max(1, rawMax * 0.1)
    minValue = Math.max(0, rawMin - pad)
    maxValue = Math.min(100, rawMax + pad)
  }

  if (maxValue <= minValue) {
    maxValue = Math.min(100, minValue + 1)
  }

  return { minValue, maxValue }
}

function drawTrendTooltip(ctx: CanvasRenderingContext2D, point: { x: number; y: number; idx: number }, value: number) {
  const lot = lots.value[point.idx]
  if (!lot) return

  const lines = [
    `LOT: ${lot.lot_id || '-'}`,
    `Wafer: ${lot.wafer_id || '-'}`,
    `Percent: ${value.toFixed(2)}%`,
  ]
  ctx.save()
  ctx.font = '10px sans-serif'
  const width = Math.max(...lines.map(line => ctx.measureText(line).width)) + 18
  const height = lines.length * 15 + 10
  const canvasWidth = trendCanvasRef.value?.width || 900
  let x = point.x + 12
  let y = point.y - height - 12
  if (x + width > canvasWidth - 8) x = point.x - width - 12
  if (y < 8) y = point.y + 14

  ctx.fillStyle = 'rgba(17,24,39,0.92)'
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.strokeRect(x, y, width, height)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  lines.forEach((line, idx) => {
    ctx.fillText(line, x + 9, y + 6 + idx * 15)
  })
  ctx.restore()
}

function handleTrendMouseMove(e: MouseEvent) {
  if (!isOsatSummaryReport.value || !trendPointPositions.value.length) return
  const canvas = trendCanvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const mouseX = (e.clientX - rect.left) * scaleX
  const mouseY = (e.clientY - rect.top) * scaleY
  let best = trendPointPositions.value[0]
  if (!best) return
  let bestDist = Infinity
  trendPointPositions.value.forEach(point => {
    const dist = Math.hypot(point.x - mouseX, point.y - mouseY)
    if (dist < bestDist) {
      best = point
      bestDist = dist
    }
  })

  trendHoverIndex.value = bestDist <= 32 ? best.idx : null
  drawOsatTrend()
}

function handleTrendMouseLeave() {
  trendHoverIndex.value = null
  drawOsatTrend()
}

function drawOsatTrend() {
  if (!isOsatSummaryReport.value) return

  const canvas = trendCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const selectedBin = selectedTrendBin.value
  if (!selectedBin || !lots.value.length) return

  const pad = { left: 58, right: 28, top: 28, bottom: 62 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const totalPct = Number(getBinTotalPct(selectedBin))
  const waferValues = lots.value.map(lot => Number(selectedBin.lots[String(lot.id)]?.pct ?? 0))
  const { minValue, maxValue } = getOsatAxisBounds([totalPct, ...waferValues], Number(selectedBin.bin_number))

  const xFor = (idx: number) => {
    if (lots.value.length === 1) return pad.left + plotW / 2
    return pad.left + (idx / (lots.value.length - 1)) * plotW
  }
  const yFor = (value: number) => pad.top + plotH - ((value - minValue) / (maxValue - minValue)) * plotH

  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.fillStyle = '#6b7280'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const axisStep = getNiceAxisStep(maxValue - minValue)
  for (let i = 0; i <= 4; i++) {
    const value = minValue + ((maxValue - minValue) / 4) * i
    const y = yFor(value)
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(W - pad.right, y)
    ctx.stroke()
    const decimals = axisStep < 1 ? 2 : axisStep < 10 ? 1 : 0
    ctx.fillText(`${value.toFixed(decimals)}%`, pad.left - 8, y)
  }

  ctx.strokeStyle = '#d1d5db'
  ctx.beginPath()
  ctx.moveTo(pad.left, pad.top)
  ctx.lineTo(pad.left, pad.top + plotH)
  ctx.lineTo(W - pad.right, pad.top + plotH)
  ctx.stroke()

  const totalY = yFor(totalPct)
  ctx.strokeStyle = '#16a34a'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(pad.left, totalY)
  ctx.lineTo(W - pad.right, totalY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#16a34a'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const totalLabel = `Total ${totalPct.toFixed(2)}%`
  const totalLabelX = pad.left + plotW / 2
  const totalLabelY = Math.max(pad.top + 18, Math.min(pad.top + plotH - 18, totalY - 14))
  const labelWidth = ctx.measureText(totalLabel).width + 14
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillRect(totalLabelX - labelWidth / 2, totalLabelY - 10, labelWidth, 20)
  ctx.strokeStyle = 'rgba(22,163,74,0.35)'
  ctx.strokeRect(totalLabelX - labelWidth / 2, totalLabelY - 10, labelWidth, 20)
  ctx.fillStyle = '#16a34a'
  ctx.fillText(totalLabel, totalLabelX, totalLabelY)
  ctx.font = '12px sans-serif'

  ctx.strokeStyle = '#2563eb'
  ctx.fillStyle = '#2563eb'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  waferValues.forEach((value, idx) => {
    const x = xFor(idx)
    const y = yFor(value)
    if (idx === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  trendPointPositions.value = waferValues.map((value, idx) => ({
    x: xFor(idx),
    y: yFor(value),
    idx,
  }))

  waferValues.forEach((value, idx) => {
    const x = xFor(idx)
    const y = yFor(value)
    ctx.beginPath()
    ctx.arc(x, y, trendHoverIndex.value === idx ? 5 : 3, 0, Math.PI * 2)
    ctx.fill()
  })

  ctx.fillStyle = '#374151'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  lots.value.forEach((lot, idx) => {
    const x = xFor(idx)
    ctx.fillText(getWaferAxisNumber(lot, idx), x, pad.top + plotH + 8)
  })

  ctx.font = '10px sans-serif'
  let groupStart = 0
  while (groupStart < lots.value.length) {
    const lotId = getLotDisplayName(lots.value[groupStart])
    let groupEnd = groupStart
    while (
      groupEnd + 1 < lots.value.length &&
      getLotDisplayName(lots.value[groupEnd + 1]) === lotId
    ) {
      groupEnd += 1
    }

    if (groupStart > 0) {
      const separatorX = lots.value.length === 1
        ? xFor(groupStart)
        : (xFor(groupStart - 1) + xFor(groupStart)) / 2
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(separatorX, pad.top)
      ctx.lineTo(separatorX, pad.top + plotH + 42)
      ctx.stroke()
    }

    const labelX = (xFor(groupStart) + xFor(groupEnd)) / 2
    const label = String(lotId)
    ctx.fillStyle = '#374151'
    ctx.fillText(label.length > 24 ? `${label.slice(0, 24)}...` : label, labelX, pad.top + plotH + 28)
    groupStart = groupEnd + 1
  }

  if (trendHoverIndex.value !== null) {
    const point = trendPointPositions.value.find(p => p.idx === trendHoverIndex.value)
    if (point) {
      ctx.strokeStyle = 'rgba(37,99,235,0.28)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(point.x, pad.top)
      ctx.lineTo(point.x, pad.top + plotH)
      ctx.stroke()
      drawTrendTooltip(ctx, point, waferValues[point.idx] ?? 0)
    }
  }
}

function getMapBins(mapItem: any) {
  const binCounts: Record<number, number> = {}
  mapItem.data.forEach((d: any) => {
    binCounts[d.bin] = (binCounts[d.bin] || 0) + 1
  })
  return Object.entries(binCounts)
    .map(([bn, cnt]) => ({ bin_number: Number(bn), count: cnt }))
    .sort((a, b) => a.bin_number - b.bin_number)
}

function toggleHighlight(idx: number, binNum: number | null) {
  selectedBins.value[idx] = selectedBins.value[idx] === binNum ? null : binNum
  drawMap(idx)
}

function setGlobalBinFilter(binNum: number | null) {
  globalBinFilter.value = binNum
  if (isOsatSummaryReport.value) {
    nextTick(drawOsatTrend)
    return
  }
  // Apply global filter to all maps
  mapDataList.value.forEach((mapItem, i) => {
    selectedBins.value[i] = binNum
    drawMap(i)
  })
}

function toggleCountSort() {
  if (countSortOrder.value === 'none') countSortOrder.value = 'desc'
  else if (countSortOrder.value === 'desc') countSortOrder.value = 'asc'
  else countSortOrder.value = 'none'

  if (countSortOrder.value === 'none') {
    // Re-sort by bin number as default
    bins.value.sort((a, b) => a.bin_number - b.bin_number)
  } else {
    bins.value.sort((a, b) => {
      const countA = getBinTotalCount(a)
      const countB = getBinTotalCount(b)
      return countSortOrder.value === 'asc' ? countA - countB : countB - countA
    })
  }
}

function drawMap(idx: number) {
  const canvas = canvasRefs[idx]
  const mapItem = mapDataList.value[idx]
  if (!canvas || !mapItem?.has_map || !mapItem.data.length) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const data = mapItem.data
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const d of data) {
    if (d.x < minX) minX = d.x; if (d.x > maxX) maxX = d.x
    if (d.y < minY) minY = d.y; if (d.y > maxY) maxY = d.y
  }

  const W = canvas.width, H = canvas.height
  const margin = 35
  const centerX = W / 2
  const centerY = H / 2
  const radius = Math.min(W, H) / 2 - margin

  const gridW = maxX - minX + 1, gridH = maxY - minY + 1
  
  // 支持长方形 Die
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
  ctx.strokeStyle = '#e8e8e8'
  ctx.lineWidth = 1
  ctx.stroke()

  // 绘制圆周边界
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 绘制 Notch (缺口)
  ctx.beginPath()
  ctx.arc(centerX, centerY + radius, 8, Math.PI, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#cccccc'
  ctx.stroke()

  const coordSet = new Set(data.map((d: any) => `${d.x},${d.y}`))
  const isEdge = (x: number, y: number) =>
    !coordSet.has(`${x-1},${y}`) || !coordSet.has(`${x+1},${y}`) ||
    !coordSet.has(`${x},${y-1}`) || !coordSet.has(`${x},${y+1}`)

  const highlight = selectedBins.value[idx] ?? null

  // 如果设置了全局 Bin 过滤，且此 Map 中没有该 Bin，则仅显示轮廓
  if (highlight !== null) {
    const hasBin = data.some((d: any) => d.bin === highlight)
    if (!hasBin) {
      for (const d of data) {
        if (isEdge(d.x, d.y)) {
          const px = offsetX + (d.x - minX) * dieW
          const py = offsetY + (d.y - minY) * dieH
          ctx.fillStyle = 'rgba(200,200,200,0.15)'
          ctx.fillRect(px, py, Math.max(0.5, dieW - 0.2), Math.max(0.5, dieH - 0.2))
        }
      }
      // 标注简单的坐标
      drawSimpleCoords(ctx, minX, maxX, minY, maxY, offsetX, offsetY, dieW, dieH, gridW, gridH, radius)
      return
    }
  }

  for (const d of data) {
    const px = offsetX + (d.x - minX) * dieW
    const py = offsetY + (d.y - minY) * dieH

    let color: string
    if (highlight !== null) {
      if (d.bin === highlight) color = getBinColor(d.bin)
      else if (isEdge(d.x, d.y)) color = 'rgba(200,200,200,0.15)'
      else continue
    } else {
      color = getBinColor(d.bin)
    }
    ctx.fillStyle = color
    ctx.fillRect(px, py, Math.max(0.5, dieW - 0.2), Math.max(0.5, dieH - 0.2))
  }

  drawSimpleCoords(ctx, minX, maxX, minY, maxY, offsetX, offsetY, dieW, dieH, gridW, gridH, radius)
}

function drawSimpleCoords(ctx: CanvasRenderingContext2D, minX: number, maxX: number, minY: number, maxY: number, offsetX: number, offsetY: number, dieW: number, dieH: number, gridW: number, gridH: number, radius: number) {
  ctx.fillStyle = '#bbb'
  const fontSize = Math.max(7, Math.min(9, Math.min(dieW, dieH) * 0.8))
  ctx.font = `${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  
  const xStep = Math.max(1, Math.ceil(gridW / 10))
  for (let x = minX; x <= maxX; x += xStep) {
    ctx.fillText(String(x), offsetX + (x - minX) * dieW + dieW / 2, offsetY - 8)
  }
  
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const yStep = Math.max(1, Math.ceil(gridH / 10))
  for (let y = minY; y <= maxY; y += yStep) {
    ctx.fillText(String(y), offsetX - 8, offsetY + (y - minY) * dieH + dieH / 2)
  }
}

function applySavedReportConfig(cfg: any) {
  if (!cfg) return

  if (cfg.global_comments) {
    bins.value.forEach(b => {
      if (cfg.global_comments[b.bin_number]) {
        b.global_comment = cfg.global_comments[b.bin_number]
      }
    })
  }
  if (cfg.note_text !== undefined) {
    noteText.value = cfg.note_text
  }

  if (cfg.global_comment_width) globalCommentWidth.value = cfg.global_comment_width
  if (cfg.all_comment_width) allCommentWidth.value = cfg.all_comment_width

  if (cfg.lot_order) {
    const orderMap = new Map()
    cfg.lot_order.forEach((id: any, idx: number) => orderMap.set(String(id), idx))
    
    lots.value.sort((a, b) => {
      const idxA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 999
      const idxB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 999
      return idxA - idxB
    })
    
    const mapMap = new Map()
    mapDataList.value.forEach((m: any) => mapMap.set(String(m.lot_id), m))
    mapDataList.value = lots.value.map(l => mapMap.get(String(l.id))).filter(m => m !== undefined)
  }
  
  if (cfg.lot_widths) {
    lots.value.forEach(l => {
      if (cfg.lot_widths[l.id]) {
        l.width = cfg.lot_widths[l.id]
      }
    })
  }
}

function selectDefaultOsatTrendBin() {
  if (!isOsatSummaryReport.value || !bins.value.length) return
  const bin1 = bins.value.find(b => Number(b.bin_number) === 1)
  globalBinFilter.value = bin1 ? bin1.bin_number : bins.value[0].bin_number
}

async function fetchAll() {
  loading.value = true
  isDataLoading.value = true
  try {
    const reportId = route.query.report_id
    let savedConfig: any = null

    if (reportId) {
      try {
        const report: any = await api.get(`/reports/${reportId}`)
        if (report) {
          reportAuthor.value = report.username || 'unknown'
          savedConfig = report.config_data || {}
          currentReportConfig.value = savedConfig
        }
      } catch (err: any) {
        console.error('加载保存的报表配置失败:', err)
      }
    }

    const snapshot = savedConfig?.multi_bin_snapshot
    if (snapshot && snapshot.data_range === dataRange.value) {
      lots.value = (snapshot.lots || []).map((l: any) => ({ ...l, width: l.width || 120 }))
      bins.value = (snapshot.bins || []).map((b: any) => ({ ...b, global_comment: b.global_comment || '' }))
      mapDataList.value = snapshot.maps || []
    } else {
      const [binRes, mapRes]: any[] = await Promise.all([
        api.get('/analysis/multi/bin_summary', { params: { lot_ids: lotIdsStr, data_range: dataRange.value } }),
        api.get('/analysis/multi/wafer_bin_maps', { params: { lot_ids: lotIdsStr, data_range: dataRange.value } }),
      ])
      lots.value = binRes.lots.map((l: any) => ({ ...l, width: 120 }))
      bins.value = binRes.bins.map((b: any) => ({ ...b, global_comment: '' }))
      mapDataList.value = mapRes.maps
    }

    // 初始化 selectedBins
    mapDataList.value.forEach((_: any, i: number) => {
      if (selectedBins.value[i] === undefined) selectedBins.value[i] = null
    })

    applySavedReportConfig(savedConfig)
    selectDefaultOsatTrendBin()

    await nextTick()
    if (isOsatSummaryReport.value) {
      drawOsatTrend()
    } else {
      mapDataList.value.forEach((_, i) => drawMap(i))
    }
  } finally {
    loading.value = false
    // 延迟一丢丢关闭 loading 标志，确保 watch 逻辑不会在数据填充瞬间触发
    nextTick(() => {
      isDataLoading.value = false
    })
  }
}

watch([selectedTrendBin, lots, bins], () => {
  nextTick(drawOsatTrend)
}, { deep: true })

async function saveToReportCenter() {
  const prod = lots.value[0]?.product_name || 'Unknown'
  const lot = lots.value[0]?.lot_id || 'Unknown'
  const wafers = lots.value.map(l => l.wafer_id).filter(Boolean).join(',')
  
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const YMDHMS = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  
  const name = `${lot}_${wafers}_${YMDHMS}`
  
  const globalComments: Record<number, string> = {}
  bins.value.forEach(b => {
    if (b.global_comment) {
      globalComments[b.bin_number] = b.global_comment
    }
  })

  const configData = {
    ...currentReportConfig.value,
    global_comments: globalComments,
    note_text: noteText.value,
    lot_order: lots.value.map(l => l.id),
    lot_widths: lots.value.reduce((acc: any, l: any) => {
      acc[l.id] = l.width
      return acc
    }, {}),
    global_comment_width: globalCommentWidth.value,
    all_comment_width: allCommentWidth.value,
  }
  
  const currentUrl = new URL(window.location.href)
  
  try {
    const res: any = await api.post('/reports', {
      name: name,
      product_name: prod,
      url: currentUrl.toString(),
      type: 'Multi-Bin Analysis',
      source: 'eng',
      config_data: configData
    })
    
    const dbReportId = res.id
    
    // 更新 URL，加上真实的数据库 report_id，进入报表编辑/查看模式
    currentUrl.searchParams.set('report_id', String(dbReportId))
    
    // 同步把包含真实 report_id 的 URL 更新回后端
    await api.put(`/reports/${dbReportId}`, {
      url: currentUrl.toString()
    })

    isSaved.value = true

    // 关键修复：保存成功后立即更新 reportAuthor，
    // 否则 canEditReport 会因为 reportAuthor 仍为 'unknown' 而返回 false，
    // 导致后续所有 saveReportImmediately 调用被静默拦截
    try {
      const userInfoStr = localStorage.getItem('user')
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr)
        reportAuthor.value = (userInfo.username || '').toLowerCase().trim()
      }
    } catch (e) {}
    
    router.replace({ 
      query: { ...route.query, report_id: String(dbReportId) } 
    })
  } catch (err: any) {
    alert(err || '保存到报表中心失败')
  }
}

let autoSaveTimeout: any = null

// 立即保存报表数据到数据库
async function saveReportImmediately() {
  if (isDataLoading.value) return
  const reportId = route.query.report_id
  if (!reportId) return
  if (!canEditReport.value) return

  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout)
    autoSaveTimeout = null
  }

  const globalComments: Record<number, string> = {}
  bins.value.forEach(b => {
    if (b.global_comment) {
      globalComments[b.bin_number] = b.global_comment
    }
  })

  const configData = {
    ...currentReportConfig.value,
    global_comments: globalComments,
    note_text: noteText.value,
    lot_order: lots.value.map(l => l.id),
    lot_widths: lots.value.reduce((acc: any, l: any) => {
      acc[l.id] = l.width
      return acc
    }, {}),
    global_comment_width: globalCommentWidth.value,
    all_comment_width: allCommentWidth.value,
  }

  try {
    await api.put(`/reports/${reportId}`, {
      config_data: configData
    })
    currentReportConfig.value = configData
    console.log('Report auto-saved immediately to DB')
  } catch (err: any) {
    console.error('自动保存到数据库失败:', err)
  }
}

async function handleExport() {
  if (!lots.value.length) return

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Chip ATE System'
  const sheet = workbook.addWorksheet('Multi Bin Summary')

  // 1. 写表头
  const lotHeaders = lots.value.map(l => getLotDisplayName(l))
  
  // 第一行：合并单元格
  const headerRow1 = sheet.addRow(['Bin', 'Name', 'Total', '', ...lotHeaders.flatMap(h => [h, '']), 'Analysis Comment'])
  sheet.mergeCells(1, 3, 1, 4) // Total
  lots.value.forEach((_, idx) => {
    sheet.mergeCells(1, 5 + idx * 2, 1, 6 + idx * 2)
  })
  
  // 第二行：Count / % / Comment
  const headerRow2 = sheet.addRow(['', '', 'Count', '%', ...lotHeaders.flatMap(() => ['Count', '%']), ''])
  
  // 样式
  ;[headerRow1, headerRow2].forEach(row => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF808080' } }
    row.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  
  sheet.mergeCells(1, 1, 2, 1) // Bin
  sheet.mergeCells(1, 2, 2, 2) // Name
  const lastColIdx = 4 + lots.value.length * 2 + 1
  sheet.mergeCells(1, lastColIdx, 2, lastColIdx) // Analysis Comment

  // 2. 写表格数据
  bins.value.forEach((b: any) => {
    const rowData = [
      b.bin_number,
      b.bin_name,
      getBinTotalCount(b),
      parseFloat(getBinTotalPct(b)) / 100
    ]
    lots.value.forEach(lot => {
      rowData.push(b.lots[String(lot.id)]?.count ?? 0)
      rowData.push((b.lots[String(lot.id)]?.pct ?? 0) / 100)
    })
    rowData.push(b.global_comment || '')
    
    const row = sheet.addRow(rowData)
    row.alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
    if (isPassBin(b.bin_number)) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFE6' } }
    }
  })

  // 写 Summary 行
  const totalRow = sheet.addRow(['Total', '', getAllTotal(), 1, ...lots.value.flatMap(lot => [getLotTotal(lot.id), 1])])
  const passRow = sheet.addRow(['Pass', '', getAllPass(), getAllTotal() > 0 ? getAllPass() / getAllTotal() : 0, ...lots.value.flatMap(lot => [getLotPass(lot.id), getLotTotal(lot.id) > 0 ? getLotPass(lot.id) / getLotTotal(lot.id) : 0])])
  const failRow = sheet.addRow(['Fail', '', getAllFail(), getAllTotal() > 0 ? getAllFail() / getAllTotal() : 0, ...lots.value.flatMap(lot => [getLotFail(lot.id), getLotTotal(lot.id) > 0 ? getLotFail(lot.id) / getLotTotal(lot.id) : 0])])
  
  sheet.mergeCells(sheet.rowCount - 2, 1, sheet.rowCount - 2, 2)
  sheet.mergeCells(sheet.rowCount - 1, 1, sheet.rowCount - 1, 2)
  sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, 2)

  ;[totalRow, passRow, failRow].forEach(row => {
    row.font = { bold: true }
    row.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  passRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFE6' } }

  // 设置列宽
  sheet.getColumn(1).width = 10
  sheet.getColumn(2).width = 20
  for (let i = 3; i <= 4 + lots.value.length * 2; i++) {
    sheet.getColumn(i).width = 12
    if (i % 2 === 0) {
      sheet.getColumn(i).numFmt = '0.00%'
    }
  }
  sheet.getColumn(4 + lots.value.length * 2 + 1).width = 30

  // 3. 导出 Maps (每排4个)
  if (mapDataList.value.some(m => m.has_map)) {
    const validMaps = mapDataList.value.filter((m, i) => m.has_map && canvasRefs[i])
    if (validMaps.length > 0) {
      // 在表格下方留出空行
      let currentRow = sheet.rowCount + 3

      // 每行4个map
      for (let i = 0; i < validMaps.length; i += 4) {
        const rowMaps = validMaps.slice(i, i + 4)
        
        let maxCompositeHeight = 0
        const rowImages = []
        
        for (let j = 0; j < rowMaps.length; j++) {
          const mapItem = rowMaps[j]
          const originalIdx = mapDataList.value.indexOf(mapItem)
          const canvas = canvasRefs[originalIdx]
          if (!canvas) continue

          const mapWidth = canvas.width
          const mapHeight = canvas.height
          const legendWidth = 160
          
          const compositeWidth = mapWidth + legendWidth
          
          // 获取当前图例需要绘制的 Bin (按顺序，或者只绘制该wafer有的)
          const visibleBins = getMapBins(mapItem)
          const legendHeight = visibleBins.length * 20 + 40
          const compositeHeight = Math.max(mapHeight, legendHeight)
          if (compositeHeight > maxCompositeHeight) maxCompositeHeight = compositeHeight
          
          const offCanvas = document.createElement('canvas')
          offCanvas.width = compositeWidth
          offCanvas.height = compositeHeight
          const ctx = offCanvas.getContext('2d')
          
          if (ctx) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, compositeWidth, compositeHeight)
            
            // 绘制标题
            ctx.fillStyle = '#333'
            ctx.font = 'bold 16px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(getMapDisplayName(mapItem), mapWidth / 2, 20)

            // 画地图 (略微下移给标题留空间)
            ctx.drawImage(canvas, 0, 30)

            // 画图例
            const startX = mapWidth + 10
            let startY = 40
            ctx.font = '14px sans-serif'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            
            ctx.beginPath()
            ctx.arc(startX + 6, startY, 5, 0, 2 * Math.PI)
            ctx.fillStyle = '#aaa'
            ctx.fill()
            ctx.fillStyle = '#333'
            ctx.fillText(`ALL`, startX + 16, startY)
            startY += 24

            visibleBins.forEach(b => {
              const color = getBinColor(b.bin_number)
              ctx.beginPath()
              ctx.arc(startX + 6, startY, 5, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
              ctx.fillStyle = '#333'
              ctx.fillText(`Bin${b.bin_number}(${b.count})`, startX + 16, startY)
              startY += 24
            })
            
            const mapDataUrl = offCanvas.toDataURL('image/png')
            const imageId = workbook.addImage({
              base64: mapDataUrl,
              extension: 'png',
            })
            rowImages.push({ imageId, width: compositeWidth, height: compositeHeight })
          }
        }
        
        // 将这行的图片插入到 Excel
        // 这里可以通过 scale 控制缩放大小，并动态计算占用的列数使其紧挨着显示
        let currentCol = 0
        const scale = 1.3 // 控制导出的 Map 图片缩放比例为 130%
        for (let j = 0; j < rowImages.length; j++) {
          const img = rowImages[j]
          if (!img) continue
          sheet.addImage(img.imageId, {
            tl: { col: currentCol, row: currentRow },
            ext: { width: img.width * scale, height: img.height * scale } // 缩放图片
          })
          // 计算当前图片按比例放大后占据多少列 (默认一列宽度约70px)，以此得出下一张图起始列
          currentCol += Math.ceil((img.width * scale) / 100) 
        }
        
        // 换行计算：根据放大后高度占据多少行 (每行大约20px高)
        currentRow += Math.ceil((maxCompositeHeight * scale) / 20) + 2
      }
    }
  }

  // 4. 导出文件
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `MultiBinReport_${new Date().getTime()}.xlsx`)
}

onMounted(fetchAll)
</script>

<style scoped>
.multi-bin-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: #f0f2f5;
  height: 100%;
  overflow-y: auto;
}

.options-bar {
  background: white;
  padding: 8px 16px;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 12px;
  flex-shrink: 0;
}

.opt-group { display: flex; align-items: center; gap: 8px; }
.opt-label { color: #666; font-weight: 500; }

.table-wrap {
  background: white;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  flex-shrink: 0;
  overflow: auto;
  max-height: 450px;
}

.osat-report-layout {
  display: flex;
  gap: 4px;
  align-items: start;
  min-height: 460px;
}

.osat-summary-wrap {
  max-height: calc(100vh - 120px);
  display: inline-block;
  width: auto;
  flex: 0 0 auto;
  max-width: none;
}

.osat-summary-table {
  width: auto;
  table-layout: auto;
}

.osat-summary-table th,
.osat-summary-table td {
  padding: 7px 9px !important;
  min-width: 0 !important;
}

.osat-summary-table th:nth-child(1),
.osat-summary-table td:nth-child(1) {
  width: 42px;
}

.osat-summary-table th:nth-child(2),
.osat-summary-table td:nth-child(2) {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.osat-summary-table th:nth-child(3),
.osat-summary-table td:nth-child(3) {
  width: 82px;
}

.osat-summary-table th:nth-child(4),
.osat-summary-table td:nth-child(4) {
  width: 66px;
}

.osat-summary-table th:nth-child(5),
.osat-summary-table td:nth-child(5) {
  width: 44px;
}

.osat-trend-panel {
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  padding: 12px;
  min-height: 460px;
  flex: 1 1 auto;
  min-width: 0;
}

.trend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.trend-title {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
}

.trend-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #4b5563;
  font-size: 12px;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 5px;
}

.legend-dot.total { background: #16a34a; }
.legend-dot.wafer { background: #2563eb; }

.trend-chart-wrap {
  position: relative;
  width: 100%;
  overflow-x: auto;
}

.trend-canvas {
  width: 100%;
  min-width: 760px;
  height: 420px;
  border: 1px solid #eef2f7;
  border-radius: 4px;
  background: #fff;
}

.trend-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 14px;
  pointer-events: none;
}

/* All Comment 表头：position:relative 支持 resizer 拖拽 */
.all-comment-header {
  background: #fffbe6 !important;
  color: #faad14 !important;
  font-weight: 600;
  border-left: 2px solid #ffe58f !important;
  position: relative;
  padding: 0 !important;
}

/* All Comment 单元格（rowspan 跨越所有行） */
.all-comment-cell {
  padding: 0 !important;
  vertical-align: top;
  border-left: 2px solid #ffe58f !important;
  background: #fffbe6;
  position: relative;
  height: 1px; /* enables percentage height for children in table cells */
}

.all-comment-textarea {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  resize: none;
  padding: 6px 8px;
  font-size: 12px;
  background: #fffbe6;
  color: #555;
  line-height: 1.6;
  display: block;
}

.export-btn {
  background: #52c41a;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}
.export-btn:hover { background: #73d13d; }

.save-report-btn {
  margin-left: 10px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.3s;
}
.save-report-btn:hover { background: #40a9ff; }
.save-report-btn.saved { background: #ff4d4f; }
.save-report-btn.saved:hover { background: #ff7875; }

.toggle-btn {
  background: #f5f5f5;
  border: 1px solid #d9d9d9;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s;
}
.toggle-btn:first-child { border-radius: 4px 0 0 4px; }
.toggle-btn:last-child { border-radius: 0 4px 4px 0; }
.toggle-btn.active {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
}

.lot-link:hover {
  text-decoration: underline;
  color: #40a9ff;
}

.lot-header-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px;
}

.draggable-header {
  cursor: grab;
}
.draggable-header:active {
  cursor: grabbing;
}
.draggable-header:hover {
  background: #bae7ff !important;
}

.global-comment-header {
  min-width: 150px !important;
  background: #fffbe6 !important;
  color: #faad14 !important;
  position: relative;
  padding: 0 !important;
}

.comment-textarea {
  width: 100%;
  height: 24px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 12px;
  resize: none;
  overflow: auto;
  vertical-align: middle;
}

.comment-cell {
  padding: 5px 8px !important;
  text-align: left !important;
  border: 1px solid #f0f0f0;
}

.comment-header-col {
  padding: 0 !important;
  position: relative;
}

.header-content {
  padding: 5px 12px;
  user-select: none;
  white-space: nowrap;
}

.resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.2s;
}

.resizer:hover {
  background: #1890ff;
}

.comment-text-wrap {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #888;
  font-style: italic;
}

.bin-table { border-collapse: collapse; font-size: 12px; white-space: nowrap; }
.bin-table th, .bin-table td {
  border: 1px solid #f0f0f0;
  padding: 5px 12px;
  text-align: center;
  min-width: 60px;
}
.bin-table th { 
  background: #fafafa; 
  color: #555; 
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: inset 0 -1px 0 #f0f0f0;
}
.sortable-header {
  cursor: pointer;
  user-select: none;
}
.sortable-header:hover {
  background: #f0f0f0 !important;
}
/* 第二行表头(Count/%) 偏移第一行的高度 */
.bin-table thead tr:nth-child(2) th {
  top: 27px; 
}
.lot-header {
  background: #e6f7ff !important;
  color: #1890ff !important;
  font-weight: 600;
  border-bottom: 2px solid #91d5ff !important;
}
.pass-row { background: #f6ffed; }
.summary-row { background: #fafafa; font-weight: 500; }
.bin-table tbody tr:hover td { background-color: #e6f7ff !important; }

.chk-col {
  width: 32px !important;
  min-width: 32px !important;
  max-width: 32px !important;
  padding: 2px 4px !important;
}

.bin-checkbox {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: #1890ff;
}

.active-filter-row td {
  background-color: #bae7ff !important;
  font-weight: 600;
}

.maps-section {
  background: white;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  padding: 12px;
  flex-shrink: 0; /* 防止被压缩 */
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  text-align: center;
}

.maps-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
  align-items: flex-start;
}

.map-block {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.map-label {
  font-size: 12px;
  font-weight: 600;
  color: #333;
  text-align: center;
}

.map-with-legend {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.bin-legend {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 520px;
  overflow-y: auto;
}

.bin-icon {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  border: 1px solid transparent;
}
.bin-icon:hover { background: #f5f5f5; }
.bin-icon.selected { background: #e6f7ff; border-color: #91d5ff; }

.bin-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #999;
  font-size: 14px;
}
</style>
