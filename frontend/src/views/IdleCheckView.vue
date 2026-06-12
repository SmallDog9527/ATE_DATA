<template>
  <div class="idle-check-view">
    <div class="header-bar">
      <div class="title">
        <h2>Idle Check 分析</h2>
        <span class="subtitle">LOT: {{ lotInfo?.filename }} | 程序: {{ checkData?.program }}</span>
      </div>
      <div class="actions">
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

    <!-- 参数设置弹窗 (复用 HomeView 逻辑) -->
    <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
      <div class="modal check-modal">
        <h3>设置 Check 监控参数 (程序: {{ checkData?.program }})</h3>
        <p style="font-size:12px;color:#666;margin-bottom:12px">
          修改参数后将重新计算指纹值。指纹值 = Σ(参数值[i] * (i+1))
        </p>
        
        <div class="param-selector">
          <div class="selector-header">
            <input v-model="paramSearch" placeholder="搜索参数..." class="search-input" />
            <div class="selection-info">已选 {{ selectedParams.length }} 个</div>
          </div>
          <div class="param-list">
            <label v-for="p in filteredParams" :key="p" class="param-item">
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

    <div class="main-content" :class="{ 'no-map': !hasCoordinates }">
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
                <td>{{ item.fingerprint.toFixed(4) }}</td>
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

    <div v-if="loading" class="loading-overlay">加载中...</div>

    <!-- 导出进度弹窗 -->
    <div v-if="exporting" class="modal-overlay">
      <div class="modal export-modal">
        <h3>正在准备下载数据...</h3>
        <div class="progress-container">
          <div class="progress-bar" :style="{ width: exportProgress + '%' }"></div>
        </div>
        <div class="progress-text">{{ exportProgress }}%</div>
        <div v-if="exportError" class="export-error">
          {{ exportError }}
          <button class="btn btn-sm" @click="exporting = false">关闭</button>
        </div>
      </div>
    </div>
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
const dataFilter = ref('pass_only') // 默认使用 Bin1+2 (Pass Only)

// 导出进度相关
const exporting = ref(false)
const exportProgress = ref(0)
const exportError = ref('')
const weights = ref<number[]>([])
const showFormula = ref(false)
const listFilter = ref<'all' | 'normal' | 'alarm'>('alarm') // 列表过滤器，默认只显示报警
let exportTimer: any = null

// 设置弹窗相关
const showSettings = ref(false)
const selectedParams = ref<string[]>([])
const allParams = ref<string[]>([])
const paramSearch = ref('')
const tempThreshold = ref(2)
const savingConfig = ref(false)
const processingCorr = ref(false)

const filteredParams = computed(() => {
  if (!paramSearch.value) return allParams.value
  const s = paramSearch.value.toLowerCase()
  return allParams.value.filter(p => p.toLowerCase().includes(s))
})

const scatterChart = ref<HTMLElement>()
const waferMapCanvas = ref<HTMLCanvasElement>()
const waferMapTooltip = ref<HTMLDivElement | null>(null)
let scatterInstance: echarts.ECharts | null = null
let idleMapDies: { px: number; py: number; width: number; height: number; x: number; y: number; isAlarm: boolean; index: number }[] = []

const hasCoordinates = computed(() => {
  return checkData.value?.data?.[0]?.X_COORD !== undefined
})

const filteredListData = computed(() => {
  if (!checkData.value?.data) return []
  if (listFilter.value === 'all') return checkData.value.data
  if (listFilter.value === 'normal') return checkData.value.data.filter((d: any) => !d.is_alarm)
  return checkData.value.data.filter((d: any) => d.is_alarm)
})

const alarmCount = computed(() => {
  if (!checkData.value?.data) return 0
  return checkData.value.data.filter((d: any) => d.is_alarm).length
})

const listFilterLabel = computed(() => {
  if (listFilter.value === 'all') return '全部'
  if (listFilter.value === 'normal') return '正常'
  return `报警 (${alarmCount.value})`
})

function toggleListFilter() {
  if (listFilter.value === 'alarm') listFilter.value = 'all'
  else if (listFilter.value === 'all') listFilter.value = 'normal'
  else listFilter.value = 'alarm'
}

async function fetchData() {
  loading.value = true
  try {
    const info = await api.get(`/analysis/lot/${lotId}/info`)
    lotInfo.value = info

    // 先获取一次默认数据（以获取参数列表）
    const res = await api.get(`/analysis/lot/${lotId}/idle_check`, {
      params: { 
        threshold: threshold.value, 
        data_filter: dataFilter.value,
        weights: weights.value.join(',')
      }
    })
    
    // 默认启用随机权重算法，避免碰撞 (如果当前还没有权重且后端返回了参数列表)
    if (weights.value.length === 0 && res.params && res.params.length > 0) {
      const len = res.params.length
      weights.value = Array.from({ length: len }, () => Math.floor(Math.random() * 99) + 1)
      // 重新获取带权重的数据
      const resWithWeights = await api.get(`/analysis/lot/${lotId}/idle_check`, {
        params: { 
          threshold: threshold.value, 
          data_filter: dataFilter.value,
          weights: weights.value.join(',')
        }
      })
      checkData.value = resWithWeights
      threshold.value = resWithWeights.threshold
    } else {
      checkData.value = res
      threshold.value = res.threshold
    }

    await nextTick()
    initCharts()
  } catch (e) {
    console.error(e)
    alert('获取数据失败')
  } finally {
    loading.value = false
  }
}

async function openSettings() {
  try {
    loading.value = true
    // 获取所有可用参数
    const items: any[] = await api.get(`/analysis/lot/${lotId}/items_summary`)
    allParams.value = items.map(it => it.item_name)
    
    // 获取当前配置
    const config: any = await api.get('/analysis/idle_check/config', { 
      params: { program_name: checkData.value.program } 
    })
    selectedParams.value = config.params || []
    tempThreshold.value = config.threshold || threshold.value
    showSettings.value = true
  } catch (e) {
    alert('获取参数列表失败')
  } finally {
    loading.value = false
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
    // 刷新数据
    threshold.value = tempThreshold.value
    await fetchData()
  } catch (e) {
    alert('保存失败')
  } finally {
    savingConfig.value = false
  }
}

async function handleCorrProcessing() {
  if (!confirm('Corr处理将基于指纹匹配对齐各Site数据，并丢弃无法匹配的数据，最后保存为新数据包，是否继续？')) return
  
  processingCorr.value = true
  try {
    const res = await api.post(`/analysis/lot/${lotId}/idle_check/corr`, null, {
      params: {
        threshold: threshold.value,
        data_filter: dataFilter.value,
        weights: weights.value.join(',')
      }
    })
    alert(`处理完成！新数据已生成：${res.filename}\n请前往Home页查看。`)
  } catch (e: any) {
    alert('处理失败: ' + (e.response?.data?.detail || e.message))
  } finally {
    processingCorr.value = false
  }
}

async function initCharts() {
  if (!checkData.value?.data) return

  // Scatter Chart
  if (scatterChart.value) {
    if (!scatterInstance) scatterInstance = echarts.init(scatterChart.value)
    
    const series: any[] = []
    const SITE_COLORS = ['#1890ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1', '#13c2c2', '#fa541c', '#a0d911']
    
    let xAxisMax: number | undefined = undefined

    if (checkData.value.has_sites) {
      // 按 Site 分组
      const groups: Record<string, any[]> = {}
      checkData.value.data.forEach((d: any) => {
        const s = d.SITE_NUM
        if (!groups[s]) groups[s] = []
        groups[s].push(d)
      })

      // 计算各 site 最大数量，X 轴取最大值
      const siteCounts = Object.values(groups).map((arr: any[]) => arr.length)
      xAxisMax = Math.max(...siteCounts)

      Object.keys(groups).sort((a,b)=>Number(a)-Number(b)).forEach((site, i) => {
        const siteData = groups[site]
        series.push({
          name: `Site ${site}`,
          type: 'scatter',
          symbolSize: 6,
          // 使用 site 内部的独立序号作为 X 轴，第 4 个值存全局 index 用于点击联动
          data: siteData.map((d: any, siteIdx: number) => [siteIdx, d.fingerprint, d.is_alarm, d.index]),
          itemStyle: {
            color: (p: any) => {
              const isAlarm = p.value[2]
              if (isAlarm) return '#ff4d4f'
              // 非报警点：使用半透明颜色，使其看起来更淡
              const baseColor = SITE_COLORS[i % SITE_COLORS.length]
              return baseColor + '88' // 添加透明度
            }
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
            return `${p.seriesName}<br/>Site内序号: ${d[0] + 1}<br/>Fingerprint: ${d[1].toFixed(4)}<br/>状态: ${d[2] ? '报警' : '正常'}`
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
    
    // 联动：点击图表跳转到列表对应行（value[3] 是全局 index）
    scatterInstance.on('click', (params: any) => {
      const dataIndex = params.value[3]
      scrollToRow(dataIndex)
    })
  }

  // Wafer Map - Canvas based (same as BinView)
  if (hasCoordinates.value) {
    await nextTick()
    drawIdleMap()
  }
}

function drawIdleMap() {
  const canvas = waferMapCanvas.value
  if (!canvas || !hasCoordinates.value || !checkData.value?.data) return

  const data = checkData.value.data.filter((d: any) => d.X_COORD !== undefined)
  if (!data.length) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const d of data) {
    if (d.X_COORD < minX) minX = d.X_COORD
    if (d.X_COORD > maxX) maxX = d.X_COORD
    if (d.Y_COORD < minY) minY = d.Y_COORD
    if (d.Y_COORD > maxY) maxY = d.Y_COORD
  }

  const W = canvas.width, H = canvas.height
  const margin = 60
  const centerX = W / 2
  const centerY = H / 2
  const radius = Math.min(W, H) / 2 - margin

  const gridW = maxX - minX + 1
  const gridH = maxY - minY + 1

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

  // 绘制 Notch (缺口)
  ctx.beginPath()
  ctx.arc(centerX, centerY + radius, 12, Math.PI, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#cccccc'
  ctx.stroke()

  idleMapDies = []

  for (const d of data) {
    const px = offsetX + (d.X_COORD - minX) * dieW
    const py = offsetY + (d.Y_COORD - minY) * dieH
    
    ctx.fillStyle = d.is_alarm ? '#ff4d4f' : '#69db7c'
    
    const drawW = Math.max(0.5, dieW - 0.2)
    const drawH = Math.max(0.5, dieH - 0.2)
    ctx.fillRect(px, py, drawW, drawH)
    
    idleMapDies.push({ px, py, width: dieW, height: dieH, x: d.X_COORD, y: d.Y_COORD, isAlarm: d.is_alarm, index: d.index })
  }

  // 坐标标注
  ctx.fillStyle = '#999'
  const fontSize = Math.max(8, Math.min(11, Math.min(dieW, dieH) * 0.8))
  ctx.font = `${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  
  const xStep = Math.max(1, Math.ceil(gridW / 15))
  for (let x = minX; x <= maxX; x += xStep) {
    ctx.fillText(String(x), offsetX + (x - minX) * dieW + dieW / 2, offsetY - 10)
    ctx.fillText(String(x), offsetX + (x - minX) * dieW + dieW / 2, offsetY + radius * 2 + 15)
  }
  
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const yStep = Math.max(1, Math.ceil(gridH / 15))
  for (let y = minY; y <= maxY; y += yStep) {
    ctx.fillText(String(y), offsetX - 10, offsetY + (y - minY) * dieH + dieH / 2)
  }
}

function onIdleMapMouseMove(evt: MouseEvent) {
  const canvas = waferMapCanvas.value
  const tooltipEl = waferMapTooltip.value
  if (!canvas || !tooltipEl || !idleMapDies.length) return

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const mx = (evt.clientX - rect.left) * scaleX
  const my = (evt.clientY - rect.top) * scaleY

  let found: typeof idleMapDies[0] | null = null
  for (const die of idleMapDies) {
    if (mx >= die.px && mx <= die.px + die.width && my >= die.py && my <= die.py + die.height) {
      found = die
      break
    }
  }

  if (found) {
    tooltipEl.innerHTML = `<div>X: ${found.x}, Y: ${found.y}</div><div>状态: ${found.isAlarm ? '⚠ 报警' : '✓ 正常'}</div><div>Index: ${found.index + 1}</div>`
    tooltipEl.style.display = 'block'
    tooltipEl.style.left = (evt.offsetX + 14) + 'px'
    tooltipEl.style.top = (evt.offsetY + 14) + 'px'
  } else {
    tooltipEl.style.display = 'none'
  }
}

function onIdleMapMouseLeave() {
  if (waferMapTooltip.value) waferMapTooltip.value.style.display = 'none'
}

function onIdleMapClick(evt: MouseEvent) {
  const canvas = waferMapCanvas.value
  if (!canvas || !idleMapDies.length) return

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const mx = (evt.clientX - rect.left) * scaleX
  const my = (evt.clientY - rect.top) * scaleY

  for (const die of idleMapDies) {
    if (mx >= die.px && mx <= die.px + die.width && my >= die.py && my <= die.py + die.height) {
      scrollToRow(die.index)
      break
    }
  }
}

function scrollToRow(index: number) {
  const row = document.getElementById(`row-${index}`)
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    row.classList.add('highlight-row')
    setTimeout(() => row.classList.remove('highlight-row'), 2000)
  }
}

function handleRandomAlgo() {
  if (!checkData.value?.params) return
  const len = checkData.value.params.length
  // 生成随机正整数权重 (1-100)
  const newWeights = []
  for (let i = 0; i < len; i++) {
    newWeights.push(Math.floor(Math.random() * 99) + 1)
  }
  weights.value = newWeights
  fetchData()
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  exportProgress.value = 0
  exportError.value = ''
  
  try {
    // 1. 启动导出任务
    const { task_id } = await api.post(`/analysis/lot/${lotId}/idle_check/export/start`, null, {
      params: { 
        threshold: threshold.value, 
        data_filter: dataFilter.value,
        weights: weights.value.join(',')
      }
    })
    
    // 2. 轮询状态
    exportTimer = setInterval(async () => {
      try {
        const res: any = await api.get(`/analysis/idle_check/export/status/${task_id}`)
        exportProgress.value = res.progress
        
        if (res.status === 'completed') {
          clearInterval(exportTimer)
          // 3. 下载结果
          const downloadRes = await api.get(`/analysis/idle_check/export/download/${task_id}`, {
            responseType: 'blob'
          })
          const blob = downloadRes.data
          const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
          const link = document.createElement('a')
          link.href = url
          const fileName = lotInfo.value?.filename ? `IdleCheck_${lotInfo.value.filename}.xlsx` : 'IdleCheck_Data.xlsx'
          link.setAttribute('download', fileName)
          document.body.appendChild(link)
          link.click()
          
          setTimeout(() => {
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
            exporting.value = false
          }, 1000)
        } else if (res.status === 'failed') {
          clearInterval(exportTimer)
          exportError.value = res.error || '导出失败'
        }
      } catch (err) {
        clearInterval(exportTimer)
        exportError.value = '获取进度失败'
      }
    }, 1000)
    
  } catch (e) {
    exporting.value = false
    alert('启动导出失败')
  }
}

function handleResize() {
  scatterInstance?.resize()
  if (hasCoordinates.value) drawIdleMap()
}

onMounted(() => {
  fetchData()
  window.addEventListener('resize', handleResize)
})

const lastClickedParam = ref<string | null>(null)

function onCheckboxClick(event: MouseEvent, p: string) {
  if (event.shiftKey && lastClickedParam.value) {
    event.preventDefault()
    const idx1 = filteredParams.value.indexOf(lastClickedParam.value)
    const idx2 = filteredParams.value.indexOf(p)
    if (idx1 !== -1 && idx2 !== -1) {
      const start = Math.min(idx1, idx2)
      const end = Math.max(idx1, idx2)
      const rangeParams = filteredParams.value.slice(start, end + 1)
      
      rangeParams.forEach(item => {
        if (!selectedParams.value.includes(item)) {
          selectedParams.value.push(item)
        }
      })
    }
  } else {
    lastClickedParam.value = p
  }
}

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (exportTimer) clearInterval(exportTimer)
})
</script>

<style scoped>
.idle-check-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
  padding: 16px;
  overflow: hidden;
}

.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 12px 24px;
  border-radius: 8px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.title h2 { margin: 0; font-size: 18px; color: #1f1f1f; }
.subtitle { font-size: 13px; color: #8c8c8c; margin-top: 4px; display: block; }

.actions { display: flex; gap: 12px; align-items: center; }
.threshold-input { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.threshold-input input { width: 50px; padding: 4px 6px; border: 1px solid #d9d9d9; border-radius: 4px; }

.filter-options { display: flex; background: #f5f5f5; border-radius: 4px; padding: 2px; }
.radio-label { 
  padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 3px; 
  transition: all 0.2s; display: flex; align-items: center; gap: 4px;
}
.radio-label input { display: none; }
.radio-label.active { background: white; color: #1890ff; box-shadow: 0 1px 4px rgba(0,0,0,0.1); font-weight: 500; }

.clickable-header { cursor: pointer; color: #1890ff; user-select: none; }
.clickable-header:hover { background: #e6f7ff; }

.btn { padding: 8px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; transition: all 0.3s; }
.btn-random { background: #722ed1; color: white; }
.btn-random:hover { background: #9254de; }

.algorithm-box { display: flex; align-items: center; gap: 12px; background: #fffbe6; border: 1px solid #ffe58f; padding: 4px 12px; border-radius: 4px; }
.formula-display { display: flex; align-items: center; gap: 8px; font-size: 12px; position: relative; }
.formula-label { color: #856404; font-weight: 500; }
.formula-display code { background: #fdfdfd; padding: 2px 6px; border-radius: 3px; border: 1px solid #f0f0f0; }
.formula-toggle { color: #1890ff; cursor: pointer; font-size: 11px; text-decoration: underline; }
.formula-detail {
  position: absolute; top: 100%; left: 0; background: white; border: 1px solid #d9d9d9;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 8px; z-index: 100;
  max-height: 200px; overflow-y: auto; min-width: 200px; margin-top: 4px;
}
.formula-item { font-family: monospace; white-space: nowrap; border-bottom: 1px solid #f0f0f0; padding: 2px 0; }

.btn-download { background: #1890ff; color: white; }
.btn-download:hover { background: #40a9ff; }
.btn-download:disabled { background: #f5f5f5; color: #bfbfbf; cursor: not-allowed; }

.btn-corr { background: #722ed1; color: white; border: none; }
.btn-corr:hover { background: #9254de; }
.btn-corr:disabled { background: #d9d9d9; cursor: not-allowed; }

.btn-settings { background: #f0f0f0; color: #595959; border: 1px solid #d9d9d9; }
.btn-settings:hover { background: #e8e8e8; border-color: #40a9ff; color: #40a9ff; }

.main-content {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1.5fr;
  gap: 16px;
  overflow: hidden;
}

.chart-section { grid-column: 1 / 3; background: white; border-radius: 8px; display: flex; flex-direction: column; }
.map-section { background: white; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
.map-container { 
  flex: 1; display: flex; align-items: center; justify-content: center; 
  padding: 10px; overflow: hidden; position: relative;
}
.wafer-map-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
.map-tooltip {
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
.list-section { background: white; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }

.chart-header {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container { flex: 1; min-height: 200px; padding: 12px; }

.legend { display: flex; gap: 12px; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: normal; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot.normal { background: #1890ff; }
.dot.alarm { background: #ff4d4f; }

.table-container { flex: 1; overflow-y: auto; padding: 0; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { position: sticky; top: 0; background: #fafafa; padding: 10px; text-align: left; border-bottom: 1px solid #f0f0f0; z-index: 1; }
.data-table td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
.row-alarm { background: #fff1f0; }

.badge-alarm { color: #cf1322; background: #fff1f0; border: 1px solid #ffa39e; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.badge-normal { color: #389e0d; background: #f6ffed; border: 1px solid #b7eb8f; padding: 2px 8px; border-radius: 10px; font-size: 12px; }

.loading-overlay {
  position: fixed; inset: 0; background: rgba(255,255,255,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
  font-size: 16px; color: #1890ff;
}

.main-content.no-map .list-section {
  grid-column: 1 / 3;
}

/* 导出进度条样式 */
.export-modal {
  text-align: center;
  width: 400px !important;
}

.progress-container {
  height: 12px;
  background: #f5f5f5;
  border-radius: 6px;
  overflow: hidden;
  margin: 20px 0 10px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #1890ff, #40a9ff);
  transition: width 0.3s;
}

.progress-text {
  font-size: 14px;
  color: #1890ff;
  font-weight: bold;
}

.export-error {
  margin-top: 16px;
  color: #ff4d4f;
  font-size: 13px;
  background: #fff2f0;
  padding: 8px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.btn-sm {
  padding: 2px 8px;
  font-size: 12px;
}

/* 弹窗样式 (同步 HomeView) */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1100;
}
.modal {
  background: white; padding: 24px; border-radius: 8px; width: 400px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.modal h3 { margin-top: 0; margin-bottom: 16px; font-size: 18px; }
.modal-actions {
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;
}
.check-modal { width: 600px !important; }
.param-selector { border: 1px solid #d9d9d9; border-radius: 4px; display: flex; flex-direction: column; height: 300px; }
.selector-header { padding: 8px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; background: #fafafa; }
.search-input { flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; }
.selection-info { margin-left: 12px; font-size: 12px; color: #1890ff; font-weight: 500; }
.param-list { flex: 1; overflow-y: auto; padding: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
.param-item { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px; border-radius: 2px; cursor: pointer; }
.param-item:hover { background: #f5f5f5; }
.param-item input { margin: 0; }
.param-item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.field label { font-size: 12px; color: #666; }
.field input { padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px; }
</style>
