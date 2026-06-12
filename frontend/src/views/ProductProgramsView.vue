<template>
  <div class="product-page">
    <div class="page-header">
      <div class="breadcrumb">
        <span class="bc-link" @click="$router.push('/program-changes')">📝 程序变更</span>
        <span class="bc-sep">›</span>
        <span class="bc-current">{{ productName }}</span>
      </div>
      <div class="header-actions">
        <button v-if="activeTab === 'pgm'" class="btn btn-primary" @click="triggerPgsUpload">⬆ 上传程序</button>
        <input ref="pgsInput" type="file" accept=".zip,.rar,.7z" multiple hidden @change="onPgsSelected" />
        <label v-if="activeTab === 'data'" class="months-filter">
          <span>近</span>
          <input
            v-model="dataMonthsInput"
            type="number"
            min="0.25"
            step="0.25"
            class="months-input"
          />
          <span>月</span>
        </label>
        <button v-if="activeTab === 'data'" class="btn" @click="fetchData(true)" :disabled="loading">🔄 Update</button>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'pgm' }"
        @click="activeTab = 'pgm'"
      >PGM
        <span v-if="pgmRows.length" class="tab-count">{{ pgmRows.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'data' }"
        @click="activeTab = 'data'"
      >Data</button>
    </div>

    <!-- ══ DATA 页签 ══ -->
    <div v-show="activeTab === 'data'" class="table-scroll">
      <div v-if="loading && !rows.length" class="loading-mask">⏳ 加载中...</div>
      <table v-else class="pg-table">
        <thead>
          <tr>
            <th class="th-no">序号</th>
            <th>产品名</th>
            <th>程序名</th>
            <th class="th-items">测试项</th>
            <th>Changes</th>
            <th>Date</th>
            <th>Site</th>
            <th>TestTime (s)</th>
            <th>Wafer Time (h)</th>
            <th>
              <div class="th-filter">
                <span>Tester</span>
                <select v-if="testerOptions.length >= 2" v-model="testerFilter" class="tester-filter">
                  <option value="">All</option>
                  <option v-for="tester in testerOptions" :key="tester" :value="tester">{{ tester }}</option>
                </select>
              </div>
            </th>
            <th>Test Yield</th>
            <th>CP/FT</th>
            <th>Engineer</th>
            <th>OSAT</th>
            <th>Package</th>
            <th>Hardware Info</th>
            <th>数据来源</th>
            <th>原始数据</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in displayedRows" :key="row.lot_id" class="data-row">
            <td class="td-no">{{ row.index }}</td>
            <td class="td-product">{{ row.product_name }}</td>

            <td class="td-program" @click="goDataParam(row)">
              <span class="prog-link">{{ row.program }}</span>
            </td>

            <td class="td-items">
              <span class="items-badge">{{ row.item_count ?? '' }}</span>
            </td>

            <td>
              <span class="changes-tag" :class="row.changes === '首版' || row.changes === '无变化' ? 'ch-none' : 'ch-has'">
                {{ row.changes }}
              </span>
            </td>

            <td>{{ fmtDate(row.test_date) }}</td>
            <td>{{ row.site ?? '' }}</td>
            <td>{{ row.avg_touch_down_s != null ? row.avg_touch_down_s.toFixed(1) : '' }}</td>

            <td>{{ fmtHours(row.uph_s) }}</td>

            <td>{{ row.tester }}</td>
            <td>{{ fmtYield(row.test_yield) }}</td>

            <td class="editable-cell" @click="startEdit(row.lot_id, 'data_type', row.data_type, row)">
              <template v-if="editState.lot_id !== row.lot_id || editState.field !== 'data_type'">
                <span v-if="row.data_type" class="type-badge" :class="row.data_type === 'CP' ? 'type-cp' : 'type-ft'">
                  {{ row.data_type }}
                </span>
              </template>
              <select v-else v-model="editState.value"
                @change="saveDataType(row)" @blur="cancelEdit" class="inline-select" autofocus>
                <option value="">—</option>
                <option value="CP">CP</option>
                <option value="FT">FT</option>
              </select>
            </td>

            <td class="editable-cell" @click="startEdit(row.lot_id, 'engineer', row.engineer, row)">
              <template v-if="editState.lot_id !== row.lot_id || editState.field !== 'engineer'">
                {{ row.engineer }}
              </template>
              <div v-else class="inline-edit">
                <input v-model="editState.value" @keyup.enter="saveField(row,'engineer')"
                  @keyup.escape="cancelEdit" @blur="saveField(row,'engineer')"
                  list="eng-list" class="inline-input" autofocus />
                <datalist id="eng-list">
                  <option v-for="s in suggestions.engineer" :key="s" :value="s"/>
                </datalist>
              </div>
            </td>

            <td>{{ row.osat }}</td>

            <td class="editable-cell" @click="startEdit(row.lot_id, 'package', row.package, row)">
              <template v-if="editState.lot_id !== row.lot_id || editState.field !== 'package'">
                {{ row.package }}
              </template>
              <div v-else class="inline-edit">
                <input v-model="editState.value" @keyup.enter="saveField(row,'package')"
                  @keyup.escape="cancelEdit" @blur="saveField(row,'package')"
                  list="pkg-list" class="inline-input" autofocus />
                <datalist id="pkg-list">
                  <option v-for="s in suggestions.package" :key="s" :value="s"/>
                </datalist>
              </div>
            </td>

            <td class="editable-cell" @click="startEdit(row.lot_id, 'hardware_info', row.hardware_info, row)">
              <template v-if="editState.lot_id !== row.lot_id || editState.field !== 'hardware_info'">
                {{ row.hardware_info }}
              </template>
              <div v-else class="inline-edit">
                <input v-model="editState.value" @keyup.enter="saveField(row,'hardware_info')"
                  @keyup.escape="cancelEdit" @blur="saveField(row,'hardware_info')"
                  list="hw-list" class="inline-input" autofocus />
                <datalist id="hw-list">
                  <option v-for="s in suggestions.hardware_info" :key="s" :value="s"/>
                </datalist>
              </div>
            </td>

            <td>
              <span class="src-badge" :class="row.source_type === 'ftp' ? 'src-ftp' : 'src-data'">
                {{ row.source_type === 'ftp' ? 'OSAT' : 'Data' }}
              </span>
            </td>

            <td class="td-raw">
              <button class="raw-btn" @click="openRawData(row.earliest_lot_id)" title="查看原始参数数据">
                📊 查看
              </button>
            </td>
          </tr>
          <tr v-if="!displayedRows.length && !loading">
            <td colspan="18" class="td-empty">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ══ PGM 页签 ══ -->
    <div v-show="activeTab === 'pgm'" class="table-scroll">
      <div v-if="pgmLoading" class="loading-mask">⏳ 加载中...</div>
      <table class="pg-table">
        <thead>
          <tr>
            <th class="th-no">序号</th>
            <th>产品名</th>
            <th>程序版本</th>
            <th>PGS版本</th>
            <th>FT</th>
            <th>QA</th>
            <th>Changes</th>
            <th>上传日期</th>
            <th>解析状态</th>
            <th>数据来源</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in pgmRows" :key="row.id" class="data-row">
            <td class="td-no">{{ row.index }}</td>
            <td class="td-product">{{ row.product_name }}</td>
            <td class="td-program">
              <span
                class="prog-link"
                :class="{ 'prog-disabled': row.parse_status !== 'ok' }"
                @click="row.parse_status === 'ok' && goPgsParam(row)"
              >{{ row.program_version ?? row.filename }}</span>
            </td>
            <td><span class="ver-badge">v{{ row.pgs_version ?? '?' }}</span></td>
            <td>
              <span class="items-badge ft-badge" title="FT 参数数量">{{ row.ft_count ?? 0 }}</span>
            </td>
            <td>
              <span class="items-badge qa-count-badge" title="QA 参数数量">{{ row.qa_count ?? 0 }}</span>
            </td>
            <td>
              <span class="changes-tag" :class="row.changes === '首版' || row.changes === '无变化' ? 'ch-none' : 'ch-has'">
                {{ row.changes || '-' }}
              </span>
            </td>
            <td>{{ fmtDate(row.upload_date) }}</td>
            <td>
              <span class="parse-badge" :class="`parse-${row.parse_status}`">
                {{ ({ ok: '✔ 成功', error: '✘ 失败', pending: '⏳ 等待' } as Record<string, string>)[row.parse_status] ?? row.parse_status }}
              </span>
              <span v-if="row.parse_status === 'error'" class="parse-err-tip" :title="row.parse_error">⚠</span>
            </td>
            <td><span class="src-badge src-pgm">PGM</span></td>
            <td class="td-raw">
              <div class="pgm-actions">
                <button class="raw-btn del-btn" @click="deletePgs(row)">🗑 删除</button>
                <button class="raw-btn download-btn" @click="downloadPgs(row)">下载</button>
              </div>
            </td>
          </tr>
          <tr v-if="!pgmRows.length && !pgmLoading">
            <td colspan="11" class="td-empty">
              暂无 PGM 数据，请点击「上传程序」上传 .zip/.rar/.7z 文件
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ══ 三级对比弹窗（Data Tab 专用）══ -->
    <div v-if="compare.show" class="overlay" @click.self="compare.show = false">
      <div class="cmp-dialog">
        <div class="cmp-header">
          <h3>🔬 参数变更对比</h3>
          <button class="close-btn" @click="compare.show = false">✕</button>
        </div>

        <div v-if="!compare.data" class="cmp-loading">⏳ 加载中...</div>
        <div v-else class="cmp-body">
          <div class="version-bar">
            <div class="version-new">
              <span class="ver-label new-label">最新版本</span>
              <span class="ver-prog">{{ compare.data.new?.program }}</span>
              <span class="ver-date">{{ fmtDate(compare.data.new?.test_date) }}</span>
            </div>
            <div class="version-old">
              <span class="ver-label old-label">上一版本</span>
              <template v-if="compare.data.old">
                <span class="ver-prog">{{ compare.data.old?.program }}</span>
                <span class="ver-date">{{ fmtDate(compare.data.old?.test_date) }}</span>
              </template>
              <span v-else class="no-prev">（无上一版本）</span>
            </div>
          </div>

          <div class="section-toggle" @click="compare.binCollapsed = !compare.binCollapsed">
            <span>{{ compare.binCollapsed ? '▶' : '▼' }}</span>
            <span>Bin 信息</span>
          </div>
          <div v-if="!compare.binCollapsed" class="bin-row">
            <div class="bin-half">
              <table class="bin-tbl">
                <thead><tr><th>Bin</th><th>Name</th><th>Count</th><th>%</th></tr></thead>
                <tbody>
                  <tr v-for="b in compare.data.bin_new" :key="b.bin_number">
                    <td>{{ b.bin_number }}</td><td>{{ b.bin_name }}</td>
                    <td>{{ b.count }}</td>
                    <td>{{ b.percentage != null ? b.percentage.toFixed(2)+'%' : '' }}</td>
                  </tr>
                  <tr v-if="!compare.data.bin_new.length"><td colspan="4" class="td-empty">无数据</td></tr>
                </tbody>
              </table>
            </div>
            <div class="bin-divider"></div>
            <div class="bin-half">
              <table class="bin-tbl">
                <thead><tr><th>Bin</th><th>Name</th><th>Count</th><th>%</th></tr></thead>
                <tbody>
                  <tr v-for="b in compare.data.bin_old" :key="b.bin_number">
                    <td>{{ b.bin_number }}</td><td>{{ b.bin_name }}</td>
                    <td>{{ b.count }}</td>
                    <td>{{ b.percentage != null ? b.percentage.toFixed(2)+'%' : '' }}</td>
                  </tr>
                  <tr v-if="!compare.data.bin_old.length"><td colspan="4" class="td-empty">无上一版数据</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="legend-row">
            <span class="leg leg-added">■ 新增</span>
            <span class="leg leg-removed">■ 删除</span>
            <span class="leg leg-loose">■ Limit放宽</span>
            <span class="leg leg-tight">■ Limit收紧</span>
          </div>

          <div class="param-wrap">
            <div class="param-hdr new-hdr">
              <span>#</span><span>Test Item</span><span>L.Limit</span><span>U.Limit</span><span>Unit</span>
            </div>
            <div class="param-hdr old-hdr">
              <span>#</span><span>Test Item</span><span>L.Limit</span><span>U.Limit</span><span>Unit</span>
            </div>

            <template v-for="(r, i) in compare.data.param_diff" :key="i">
              <template v-if="r.row_type !== 'same'">
                <div class="param-cell" :class="newSideClass(r)">
                  <template v-if="r.new">
                    <span>{{ r.new.item_number }}</span>
                    <span class="iname">{{ r.new.item_name }}</span>
                    <span :class="limitHl(r,'lower','new')">{{ fmt(r.new.lower_limit) }}</span>
                    <span :class="limitHl(r,'upper','new')">{{ fmt(r.new.upper_limit) }}</span>
                    <span>{{ r.new.unit }}</span>
                  </template>
                  <span v-else class="empty-half">—</span>
                </div>
                <div class="param-cell" :class="oldSideClass(r)">
                  <template v-if="r.old">
                    <span>{{ r.old.item_number }}</span>
                    <span class="iname">{{ r.old.item_name }}</span>
                    <span :class="limitHl(r,'lower','old')">{{ fmt(r.old.lower_limit) }}</span>
                    <span :class="limitHl(r,'upper','old')">{{ fmt(r.old.upper_limit) }}</span>
                    <span>{{ r.old.unit }}</span>
                  </template>
                  <span v-else class="empty-half">—</span>
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- PGS 参数查看器已改为独立页面 PgsParamView -->

    <!-- PGS 上传弹窗（二级页面专用） -->
    <div v-if="pgsUpload.show" class="overlay">
      <div class="dialog">
        <div class="dialog-header">
          <h3>上传程序文件</h3>
        </div>
        <p class="file-hint">文件：<strong>{{ pgsUpload.filename }}</strong></p>
        <p v-if="pgsUpload.total > 1" class="file-hint">进度：<strong>{{ pgsUpload.current }}/{{ pgsUpload.total }}</strong></p>
        <p class="file-hint">产品名：<strong>{{ productName }}</strong></p>
        <div class="upload-progress">
          <div class="progress-bar"><div class="progress-fill"></div></div>
          <span>{{ pgsUpload.total > 1 ? `正在解析 ${pgsUpload.currentName}...` : '解析中，请稍候...' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import { fmtDateOnlyTz } from '@/utils/dateUtils'

const route = useRoute()
const router = useRouter()
const productName = computed(() => route.params.productName as string)

// ─── Data Tab ───
const rows = ref<any[]>([])
const loading = ref(false)
const activeTab = ref<'data' | 'pgm'>('pgm')
const dataMonthsInput = ref('1')
const testerFilter = ref('')
const testerOptions = computed(() =>
  Array.from(new Set(rows.value.filter(row => !isQaDataRow(row)).map(row => row.tester).filter(Boolean))).sort()
)
function isQaDataRow(row: any): boolean {
  return (
    String(row?.filename || '').toUpperCase().includes('QA') ||
    String(row?.program || '').toUpperCase().includes('QA') ||
    String(row?.data_type || '').toUpperCase() === 'QA'
  )
}
const displayedRows = computed(() =>
  testerFilter.value
    ? rows.value.filter(row => !isQaDataRow(row) && row.tester === testerFilter.value)
    : rows.value.filter(row => !isQaDataRow(row))
)

// ─── PGM Tab ───
const pgmRows = ref<any[]>([])
const pgmLoading = ref(false)

// ─── Edit state ───
const editState = reactive<{ lot_id: number; field: string; value: any }>({
  lot_id: 0, field: '', value: ''
})
const suggestions = reactive<Record<string, string[]>>({
  engineer: [], package: [], hardware_info: []
})

// ─── Compare dialog (Data tab) ───
const compare = reactive({
  show: false, data: null as any, binCollapsed: false,
})

// PGS Viewer 已改为独立页面 PgsParamView，通过路由跳转打开

// ─── PGS Upload (二级页面) ───
const pgsInput = ref<HTMLInputElement>()
const pgsUpload = reactive({
  show: false,
  files: [] as File[],
  filename: '',
  currentName: '',
  current: 0,
  total: 0,
  uploading: false,
})

// ─── 工具函数 ───
function fmtDate(v: any) {
  return fmtDateOnlyTz(v)
}
function fmtHours(s: number | null | undefined): string {
  if (s == null) return ''
  return (s / 3600).toFixed(2) + ' h'
}
function fmtYield(v: number | null | undefined): string {
  if (v == null) return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return (n <= 1 ? n * 100 : n).toFixed(2) + '%'
}
function fmt(v: any) {
  if (v == null) return ''
  if (typeof v === 'number') {
    return Math.abs(v) >= 10000 || (Math.abs(v) < 0.001 && v !== 0)
      ? v.toExponential(3) : parseFloat(v.toPrecision(6)).toString()
  }
  return String(v)
}
function newSideClass(r: any) {
  if (r.row_type === 'added') return 'row-added'
  if (r.row_type === 'removed') return 'row-new-empty'
  if (r.row_type === 'limit_changed')
    return r.limit_direction === 'loose' ? 'row-loose' : 'row-tight'
  return ''
}
function oldSideClass(r: any) {
  if (r.row_type === 'removed') return 'row-removed'
  if (r.row_type === 'added') return 'row-old-empty'
  if (r.row_type === 'limit_changed')
    return r.limit_direction === 'loose' ? 'row-loose' : 'row-tight'
  return ''
}
function limitHl(r: any, side: string, ver: string) {
  if (r.row_type !== 'limit_changed' || !r.new || !r.old) return ''
  const k = side === 'lower' ? 'lower_limit' : 'upper_limit'
  if (r.new[k] === r.old[k]) return ''
  return ver === 'new' ? 'hl-new' : 'hl-old'
}

// ─── API ───
async function fetchDataSnapshot() {
  try {
    const data = await api.get(`/programs/data_list/${encodeURIComponent(productName.value)}`)
    rows.value = ((data as unknown as any[]) || []).filter((row: any) => !isQaDataRow(row))
    if (testerFilter.value && !testerOptions.value.includes(testerFilter.value)) {
      testerFilter.value = ''
    }
  } catch (e) { console.error(e) }
}

async function fetchData(showLoading = false) {
  if (showLoading) loading.value = true
  try {
    rows.value = []
    const data = await api.post(`/programs/data_list/${encodeURIComponent(productName.value)}/refresh`, null, {
      params: { days: dataMonthsToDays(dataMonthsInput.value) },
    })
    rows.value = ((data as unknown as any[]) || []).filter((row: any) => !isQaDataRow(row))
    if (testerFilter.value && !testerOptions.value.includes(testerFilter.value)) {
      testerFilter.value = ''
    }
  }
  catch (e) { console.error(e) }
  finally { loading.value = false }
}
async function fetchPgmData() {
  pgmLoading.value = true
  try { pgmRows.value = await api.get(`/programs/pgs_list/${encodeURIComponent(productName.value)}`) }
  catch (e) { console.error(e) }
  finally { pgmLoading.value = false }
}
async function fetchSuggestions() {
  for (const f of ['engineer', 'package', 'hardware_info']) {
    try { suggestions[f] = await api.get(`/programs/suggestions/${f}`) } catch {}
  }
}
async function openCompare(lotId: number) {
  compare.show = true; compare.data = null; compare.binCollapsed = false
  try { compare.data = await api.get(`/programs/lot/${lotId}/compare`) }
  catch { compare.show = false; alert('加载失败') }
}

// ─── PGS 参数页面跳转 ───
function goPgsParam(row: any) {
  router.push({
    name: 'pgs-param',
    params: { productName: productName.value, id: row.id },
  })
}

// ─── PGS Upload ───
function goDataParam(row: any) {
  router.push({
    name: 'data-program-param',
    params: { productName: productName.value, id: row.id ?? row.lot_id },
    query: { days: dataMonthsToDays(dataMonthsInput.value) },
  })
}

function dataMonthsToDays(value: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 30
  if (n < 1) {
    return Math.max(1, Math.round(n * 30))
  }
  return Math.max(1, Math.round(n * 30))
}

function triggerPgsUpload() { pgsInput.value?.click() }
async function onPgsSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const selectedFiles = Array.from(input.files ?? [])
  input.value = ''
  if (!selectedFiles.length) return

  const invalidFiles = selectedFiles.filter(file => !/\.(zip|rar|7z)$/i.test(file.name))
  if (invalidFiles.length) {
    alert(`请上传 .zip、.rar 或 .7z 压缩包：${invalidFiles.map(file => file.name).join('、')}`)
    return
  }

  pgsUpload.files = selectedFiles
  pgsUpload.filename = selectedFiles.length === 1 ? selectedFiles[0]!.name : `${selectedFiles.length} 个文件`
  pgsUpload.currentName = selectedFiles[0]!.name
  pgsUpload.current = 0
  pgsUpload.total = selectedFiles.length
  pgsUpload.uploading = false
  pgsUpload.show = true
  await submitPgs()  // 选文件后直接上传，无需确认
}
async function submitPgs() {
  if (!pgsUpload.files.length) return
  pgsUpload.uploading = true
  const failedMessages: string[] = []
  try {
    for (let i = 0; i < pgsUpload.files.length; i += 1) {
      const file = pgsUpload.files[i]!
      pgsUpload.current = i + 1
      pgsUpload.currentName = file.name
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('product_name', productName.value)
        const result: any = await api.post('/programs/upload_pgs', form)
        if (result.parse_status !== 'ok') {
          failedMessages.push(`${file.name}: ${result.parse_error ?? '未知错误'}`)
        }
      } catch {
        failedMessages.push(`${file.name}: 上传失败`)
      }
    }
    activeTab.value = 'pgm'
    await fetchPgmData()
    if (failedMessages.length) {
      alert(`以下文件上传/解析失败：\n${failedMessages.join('\n')}`)
    }
  } finally {
    pgsUpload.uploading = false
    pgsUpload.show = false
    pgsUpload.files = []
    pgsUpload.filename = ''
    pgsUpload.currentName = ''
    pgsUpload.current = 0
    pgsUpload.total = 0
  }
}

async function downloadPgs(row: any) {
  try {
    const res: any = await api.get(`/programs/pgs/${row.id}/download`, { responseType: 'blob' })
    const disposition = res.headers?.['content-disposition'] ?? ''
    const match = disposition.match(/filename="?([^"]+)"?/i)
    const fallbackName = row.filename?.match(/\.(zip|rar|7z)$/i)
      ? row.filename
      : `${row.program_version ?? row.filename ?? 'program'}.zip`
    const fileName = decodeURIComponent(match?.[1] ?? fallbackName)
    const url = window.URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch {
    alert('下载失败')
  }
}

async function deletePgs(row: any) {
  if (!confirm(`确定要删除「${row.program_version ?? row.filename}」吗？此操作不可撤销。`)) return
  try {
    await api.delete(`/programs/pgs/${row.id}`)
    await fetchPgmData()
  } catch {
    alert('删除失败')
  }
}

// ─── 编辑 ───
function startEdit(lotId: number, field: string, val: any, _row: any) {
  editState.lot_id = lotId; editState.field = field; editState.value = val ?? ''
}
function cancelEdit() { editState.lot_id = 0; editState.field = ''; editState.value = '' }
async function _save(lotId: number, payload: any, rowRef: any, key: string, val: any) {
  try {
    await api.put(`/programs/lot/${lotId}/extra`, payload)
    rowRef[key] = val
    await fetchSuggestions()
  } catch { alert('保存失败') }
  finally { cancelEdit() }
}
async function saveField(row: any, field: string) {
  if (!editState.field) return
  await _save(row.lot_id, { [field]: editState.value }, row, field, editState.value)
}
async function saveUph(row: any) {
  const hours = Number(editState.value)
  const seconds = Math.round(hours * 3600)
  await _save(row.lot_id, { ft_touch_down_s: seconds }, row, 'uph_s', seconds)
}
async function saveDataType(row: any) {
  await _save(row.lot_id, { data_type_override: editState.value }, row, 'data_type', editState.value)
}
function openRawData(lotId: number) {
  if (!lotId) return
  const url = router.resolve({ name: 'analysis', params: { id: lotId } }).href
  window.open(url, '_blank', 'noopener')
}

onMounted(() => { fetchDataSnapshot(); fetchPgmData(); fetchSuggestions() })
</script>

<style scoped>
.product-page { height: 100%; display: flex; flex-direction: column; background: #f0f2f5; }

/* 顶部 */
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  background: white; padding: 10px 16px; border-bottom: 1px solid #e8e8e8; flex-shrink: 0;
}
.breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.bc-link { color: #1890ff; cursor: pointer; }
.bc-link:hover { text-decoration: underline; }
.bc-sep { color: #bbb; }
.bc-current { font-weight: 600; color: #333; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.months-filter { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #555; }
.months-input {
  width: 58px; padding: 5px 7px; border: 1px solid #d9d9d9;
  border-radius: 4px; font-size: 13px; outline: none;
}
.months-input:focus { border-color: #1890ff; }
.btn { padding: 6px 14px; border: 1px solid #d9d9d9; border-radius: 4px; background: white; cursor: pointer; font-size: 13px; transition: background 0.15s; }
.btn:hover:not(:disabled) { background: #f5f5f5; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #1890ff; color: white; border-color: #1890ff; }
.btn-primary:hover:not(:disabled) { background: #40a9ff; }

/* Tab 切换 */
.tab-bar {
  display: flex; gap: 0; background: white; border-bottom: 2px solid #e8e8e8;
  padding: 0 16px; flex-shrink: 0;
}
.tab-btn {
  padding: 8px 20px; border: none; background: none; cursor: pointer;
  font-size: 14px; color: #666; border-bottom: 2px solid transparent;
  margin-bottom: -2px; transition: all 0.15s; display: flex; align-items: center; gap: 5px;
}
.tab-btn:hover { color: #1890ff; }
.tab-btn.active { color: #1890ff; border-bottom-color: #1890ff; font-weight: 600; }
.tab-count {
  display: inline-block; background: #1890ff; color: white;
  font-size: 10px; padding: 1px 6px; border-radius: 10px; font-weight: 700;
}

/* 表格 */
.table-scroll { flex: 1; overflow: auto; padding: 12px 16px; }
.loading-mask { text-align: center; padding: 40px; color: #888; }
.pg-table {
  width: 100%; border-collapse: collapse; background: white;
  border-radius: 6px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); font-size: 13px;
}
.pg-table th {
  background: #f5f7fa; padding: 9px 10px; text-align: left;
  font-weight: 600; color: #555; border-bottom: 1px solid #e8e8e8; white-space: nowrap;
}
.th-filter { display: inline-flex; align-items: center; gap: 6px; }
.tester-filter {
  height: 24px;
  min-width: 88px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  font-size: 12px;
  color: #444;
}
.pg-table td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; color: #333; vertical-align: middle; }
.data-row:hover td { background: #f8faff; }
.th-no, .td-no { width: 48px; text-align: center; color: #aaa; font-size: 12px; }
.td-product { font-weight: 600; color: #333; }
.td-program { cursor: pointer; }
.prog-link { color: #5b21b6; font-family: monospace; font-size: 12px; cursor: pointer; }
.prog-link:hover { color: #7c3aed; text-decoration: underline; }
.prog-disabled { color: #bbb !important; cursor: not-allowed !important; text-decoration: none !important; }
.th-items { width: 70px; text-align: center; }
.td-items { text-align: center; }
.items-badge { display: inline-block; background: #f0f4ff; color: #3b5bdb; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 10px; min-width: 32px; }
.qa-count-badge { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.td-raw { text-align: center; white-space: nowrap; }
.pgm-actions { display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 4px; }
.raw-btn { background: none; border: 1px solid #d9d9d9; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; color: #555; transition: all 0.15s; }
.raw-btn:hover { background: #e6f7ff; border-color: #1890ff; color: #1890ff; }
.del-btn { border-color: #ffccc7 !important; color: #cf1322 !important; }
.del-btn:hover { background: #fff1f0 !important; border-color: #ff4d4f !important; }
.download-btn { border-color: #91d5ff !important; color: #0958d9 !important; }
.download-btn:hover { background: #e6f7ff !important; border-color: #1890ff !important; }
.changes-tag { font-size: 12px; }
.ch-none { color: #bbb; }
.ch-has { color: #d97706; font-weight: 500; }
.type-badge { font-size: 11px; padding: 1px 7px; border-radius: 8px; font-weight: 600; }
.type-cp { background: #e6f7ff; color: #0958d9; }
.type-ft { background: #fff7e6; color: #d46b08; }
.src-badge { font-size: 10px; padding: 1px 5px; border-radius: 8px; }
.src-ftp { background: #f5f3ff; color: #7c3aed; }
.src-data { background: #e6f7ff; color: #1890ff; }
.src-pgm { background: #f0fdf4; color: #15803d; font-weight: 600; font-size: 11px; }
.ver-badge { font-size: 10px; background: #e6f7ff; color: #1890ff; border-radius: 6px; padding: 1px 6px; }
.parse-badge { font-size: 11px; padding: 1px 6px; border-radius: 6px; }
.parse-ok { background: #f0fdf4; color: #15803d; }
.parse-error { background: #fef2f2; color: #b91c1c; }
.parse-pending { background: #fffbeb; color: #92400e; }
.parse-err-tip { color: #f59e0b; cursor: help; margin-left: 3px; }
.editable-cell { cursor: pointer; }
.editable-cell:hover { background: #fffbe6; }
.inline-edit { display: flex; }
.inline-input { border: 1px solid #1890ff; border-radius: 3px; padding: 2px 6px; font-size: 12px; width: 100px; outline: none; }
.inline-select { border: 1px solid #1890ff; border-radius: 3px; padding: 2px 4px; font-size: 12px; outline: none; }
.td-empty { text-align: center; color: #bbb; padding: 30px !important; }

/* 弹窗公共 */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 999; }
.close-btn { background: none; border: none; font-size: 18px; cursor: pointer; color: #888; }

/* 三级对比弹窗 */
.cmp-dialog { background: white; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); width: 96vw; max-width: 1500px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
.cmp-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #e8e8e8; flex-shrink: 0; }
.cmp-header h3 { margin: 0; font-size: 16px; }
.cmp-loading { padding: 60px; text-align: center; color: #888; }
.cmp-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.version-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.version-new { background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
.version-old { background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
.ver-label { font-weight: 700; font-size: 13px; white-space: nowrap; }
.new-label { color: #1890ff; }
.old-label { color: #888; }
.ver-prog { font-family: monospace; font-size: 13px; }
.ver-date { font-size: 11px; color: #888; background: #f0f0f0; padding: 1px 6px; border-radius: 4px; }
.no-prev { color: #bbb; font-size: 13px; }
.section-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; padding: 6px 12px; margin-bottom: 8px; font-size: 13px; user-select: none; }
.section-toggle:hover { background: #e8e8e8; }
.bin-row { display: flex; border: 1px solid #e8e8e8; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
.bin-half { flex: 1; overflow-x: auto; }
.bin-divider { width: 1px; background: #e8e8e8; flex-shrink: 0; }
.bin-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.bin-tbl th { background: #fafafa; padding: 6px 10px; border-bottom: 1px solid #e8e8e8; font-weight: 600; color: #555; text-align: center; }
.bin-tbl td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; text-align: center; }
.legend-row { display: flex; gap: 16px; font-size: 12px; margin-bottom: 8px; }
.leg { display: flex; align-items: center; gap: 3px; }
.leg-added { color: #15803d; } .leg-added::before { content: '■'; color: #bbf7d0; }
.leg-removed { color: #6b7280; } .leg-removed::before { content: '■'; color: #e5e7eb; }
.leg-loose { color: #b91c1c; } .leg-loose::before { content: '■'; color: #fecaca; }
.leg-tight { color: #92400e; } .leg-tight::before { content: '■'; color: #fef08a; }
.param-wrap { border: 1px solid #e8e8e8; border-radius: 6px; overflow: hidden; }
.param-hdr { display: grid; grid-template-columns: 50px 1fr 110px 110px 70px; padding: 7px 10px; font-size: 12px; font-weight: 600; color: #555; }
.new-hdr { background: #e6f7ff; border-bottom: 2px solid #d0d0d0; }
.old-hdr { background: #f9f9f9; border-bottom: 2px solid #d0d0d0; border-left: 2px solid #d0d0d0; }
.param-cell { display: grid; grid-template-columns: 50px 1fr 110px 110px 70px; padding: 5px 10px; font-size: 12px; align-items: center; border-bottom: 1px solid #f0f0f0; }
.param-cell:nth-child(2n+1) { border-right: 2px solid #d0d0d0; }
.iname { font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-half { grid-column: 1 / -1; color: #ccc; text-align: center; }
.row-added { background: #f0fdf4 !important; }
.row-removed { background: #f3f4f6 !important; }
.row-new-empty { background: transparent !important; }
.row-old-empty { background: transparent !important; }
.row-loose { background: #fef2f2 !important; }
.row-tight { background: #fefce8 !important; }
.hl-new { font-weight: 700; color: #1890ff; }
.hl-old { color: #aaa; text-decoration: line-through; }

/* PGS 查看器已迁移到独立页面 PgsParamView.vue */

/* 上传进度 */
.upload-progress { padding: 12px 0; }
.progress-bar { height: 4px; background: #e8e8e8; border-radius: 2px; overflow: hidden; margin-bottom: 6px; }
.progress-fill {
  height: 100%; width: 60%; background: #1890ff; border-radius: 2px;
  animation: progress-anim 1.2s ease-in-out infinite;
}
@keyframes progress-anim {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}

/* 小弹窗 */
.dialog { background: white; border-radius: 8px; padding: 24px; width: 420px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
.dialog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.dialog-header h3 { margin: 0; font-size: 16px; }
.file-hint { font-size: 13px; color: #555; margin-bottom: 8px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
