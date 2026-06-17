<template>
  <div class="pgchange-root">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-success" @click="openAddProduct">➕ 新增产品名</button>
        <span v-if="loading" class="loading-text">⏳ 加载中...</span>
      </div>
    </div>

    <!-- 主表格 -->
    <div class="table-scroll">
      <table class="pg-table">
        <thead>
          <tr>
            <th class="th-no">序号</th>
            <th class="th-product">产品名</th>
            <th class="th-program">程序名</th>
            <th>Date</th>
            <th>Site</th>
            <th>TestTime (s)</th>
            <th>Wafer Time (h)</th>
            <th>Tester</th>
            <th>CP/FT</th>
            <th>Engineer</th>
            <th>OSAT</th>
            <th>Package</th>
            <th>Hardware Info</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in listData" :key="row.product_name">
            <!-- 若该产品没有程序（占位行），只显示产品名一行，其余列为空 -->
            <tr v-if="!row.programs || row.programs.length === 0" class="data-row placeholder-row">
              <td class="td-no">{{ row.index }}</td>
              <td
                class="td-product"
                @click="goToProduct(row.product_name)"
              >{{ row.product_name }}
                <span v-if="row.is_placeholder" class="placeholder-badge">新增</span>
              </td>
              <td colspan="11" class="td-empty-inline">—</td>
            </tr>

            <!-- 有程序的正常行 -->
            <template v-else>
              <tr class="data-row">
                <td class="td-no">{{ row.index }}</td>
                <td
                  class="td-product"
                  @click="goToProduct(row.product_name)"
                >{{ row.product_name }}</td>

                <td
                  class="td-program"
                  @click="openPgmProgram(row.product_name, row.programs[0])"
                >
                  <span class="prog-link">{{ getProgramNameToShow(row, row.programs[0]) }}</span>
                </td>
                <td>{{ fmtDate(row.programs[0].test_date) }}</td>
                <td>{{ row.programs[0].site ?? '' }}</td>
                <td>{{ row.avg_touch_down_s != null ? row.avg_touch_down_s.toFixed(1) : '' }}</td>
                <!-- UPH: CP取单片测试时间, FT用户填写 -->
                <td class="editable-cell" @click="startEdit(row.programs[0].lot_id, 'uph_s', row.programs[0].uph_s, row.programs[0])">
                  <span v-if="editState.lot_id !== row.programs[0].lot_id || editState.field !== 'uph_s'">
                    {{ fmtHours(row.programs[0].uph_s) }}
                  </span>
                  <div v-else class="inline-edit">
                    <input v-model.number="editState.value" type="number" step="0.01"
                      @keyup.enter="saveUph(row.programs[0])" @keyup.escape="cancelEdit"
                      @blur="saveUph(row.programs[0])" class="inline-input" autofocus />
                    <span style="font-size:11px;color:#888;margin-left:4px">h</span>
                  </div>
                </td>
                <td>{{ row.programs[0].tester }}</td>
                <!-- CP/FT 下拉 -->
                <td class="editable-cell" @click="startEdit(row.programs[0].lot_id, 'data_type', row.programs[0].data_type, row.programs[0])">
                  <span v-if="editState.lot_id !== row.programs[0].lot_id || editState.field !== 'data_type'">
                    <span v-if="row.programs[0].data_type" class="type-badge" :class="row.programs[0].data_type === 'CP' ? 'type-cp' : 'type-ft'">
                      {{ row.programs[0].data_type }}
                    </span>
                  </span>
                  <select v-else v-model="editState.value"
                    @change="saveDataType(row.programs[0])" @blur="cancelEdit" class="inline-select" autofocus>
                    <option value="">—</option>
                    <option value="CP">CP</option>
                    <option value="FT">FT</option>
                  </select>
                </td>
                <!-- 用户可编辑列 -->
                <td class="editable-cell" @click="startEdit(row.programs[0].lot_id, 'engineer', row.programs[0].engineer, row.programs[0])">
                  <template v-if="editState.lot_id !== row.programs[0].lot_id || editState.field !== 'engineer'">
                    {{ row.programs[0].engineer }}
                  </template>
                  <div v-else class="inline-edit">
                    <input v-model.value="editState.value" @keyup.enter="saveField(row.programs[0], 'engineer')"
                      @keyup.escape="cancelEdit" @blur="saveField(row.programs[0], 'engineer')"
                      list="eng-list" class="inline-input" autofocus />
                    <datalist id="eng-list">
                      <option v-for="s in suggestions.engineer" :key="s" :value="s"/>
                    </datalist>
                  </div>
                </td>
                <td>{{ row.programs[0].osat }}</td>
                <td class="editable-cell" @click="startEdit(row.programs[0].lot_id, 'package', row.programs[0].package, row.programs[0])">
                  <template v-if="editState.lot_id !== row.programs[0].lot_id || editState.field !== 'package'">
                    {{ row.programs[0].package }}
                  </template>
                  <div v-else class="inline-edit">
                    <input v-model.value="editState.value" @keyup.enter="saveField(row.programs[0], 'package')"
                      @keyup.escape="cancelEdit" @blur="saveField(row.programs[0], 'package')"
                      list="pkg-list" class="inline-input" autofocus />
                    <datalist id="pkg-list">
                      <option v-for="s in suggestions.package" :key="s" :value="s"/>
                    </datalist>
                  </div>
                </td>
                <td class="editable-cell" @click="startEdit(row.programs[0].lot_id, 'hardware_info', row.programs[0].hardware_info, row.programs[0])">
                  <template v-if="editState.lot_id !== row.programs[0].lot_id || editState.field !== 'hardware_info'">
                    {{ row.programs[0].hardware_info }}
                  </template>
                  <div v-else class="inline-edit">
                    <input v-model.value="editState.value" @keyup.enter="saveField(row.programs[0], 'hardware_info')"
                      @keyup.escape="cancelEdit" @blur="saveField(row.programs[0], 'hardware_info')"
                      list="hw-list" class="inline-input" autofocus />
                    <datalist id="hw-list">
                      <option v-for="s in suggestions.hardware_info" :key="s" :value="s"/>
                    </datalist>
                  </div>
                </td>
              </tr>
            </template>
          </template>
          <tr v-if="!listData.length && !loading">
            <td colspan="13" class="td-empty">暂无数据，请点击 Update 加载</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新增产品名弹窗 -->
    <div v-if="addProductDialog.show" class="overlay" @click.self="addProductDialog.show = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>新增产品名</h3>
          <button class="close-btn" @click="addProductDialog.show = false">✕</button>
        </div>
        <div class="field">
          <label>产品名 *</label>
          <input
            v-model="addProductDialog.productName"
            placeholder="请输入产品名（如 HL5083ACP00）"
            @keyup.enter="confirmAddProduct"
            class="field-input"
            autofocus
          />
        </div>
        <div class="dialog-actions">
          <button class="btn" @click="addProductDialog.show = false">取消</button>
          <button
            class="btn btn-primary"
            :disabled="!addProductDialog.productName.trim() || addProductDialog.saving"
            @click="confirmAddProduct"
          >
            {{ addProductDialog.saving ? '保存中...' : '确认' }}
          </button>
        </div>
      </div>
    </div>

    <!-- PGS 上传弹窗 -->
    <div v-if="pgsDialog.show" class="overlay" @click.self="pgsDialog.show = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>上传程序文件</h3>
          <button class="close-btn" @click="pgsDialog.show = false">✕</button>
        </div>
        <p class="file-hint">文件：<strong>{{ pgsDialog.filename }}</strong></p>
        <div class="field">
          <label>产品名 *</label>
          <input v-model="pgsDialog.productName" placeholder="请输入产品名"
            @keyup.enter="submitPgs" class="field-input" />
        </div>
        <div class="dialog-actions">
          <button class="btn" @click="pgsDialog.show = false">取消</button>
          <button class="btn btn-primary" :disabled="!pgsDialog.productName || pgsDialog.uploading"
            @click="submitPgs">
            {{ pgsDialog.uploading ? '上传中...' : '确认上传' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import { fmtDateOnlyTz } from '@/utils/dateUtils'

const router = useRouter()
const listData = ref<any[]>([])
const loading = ref(false)
const pgsInput = ref<HTMLInputElement>()

const editState = reactive<{ lot_id: number; field: string; value: any; progRef: any }>({
  lot_id: 0, field: '', value: '', progRef: null
})

const suggestions = reactive<Record<string, string[]>>({
  engineer: [], package: [], hardware_info: []
})

const pgsDialog = reactive({
  show: false, file: null as File | null, filename: '', productName: '', uploading: false
})

const addProductDialog = reactive({
  show: false, productName: '', saving: false
})

function fmtDate(v: any) {
  return fmtDateOnlyTz(v)
}

function fmtHours(s: number | null | undefined): string {
  if (s == null) return ''
  return (s / 3600).toFixed(2) + ' h'
}

function goToProduct(name: string) {
  router.push({ name: 'product-programs', params: { productName: name } })
}

function openPgmProgram(productName: string, prog: any) {
  router.push({ name: 'product-programs', params: { productName } })
}

function getHigherVersion(pgmProg: string, dataProg: string): string {
  if (!pgmProg) return dataProg || ''
  if (!dataProg) return pgmProg || ''
  
  const extractVersion = (name: string) => {
    const match = name.match(/_V(\d+(?:\.\d+)*)/i) || name.match(/V(\d+(?:\.\d+)*)/i)
    return match ? match[1] : null
  }
  
  const verA = extractVersion(pgmProg)
  const verB = extractVersion(dataProg)
  
  if (verA && verB) {
    const partsA = verA.split('.').map(Number)
    const partsB = verB.split('.').map(Number)
    const maxLen = Math.max(partsA.length, partsB.length)
    for (let i = 0; i < maxLen; i++) {
      const a = partsA[i] || 0
      const b = partsB[i] || 0
      if (a > b) return pgmProg
      if (b > a) return dataProg
    }
  } else if (verA) {
    return pgmProg
  } else if (verB) {
    return dataProg
  }
  
  return pgmProg.localeCompare(dataProg, undefined, { numeric: true }) >= 0 ? pgmProg : dataProg
}

function getProgramNameToShow(row: any, prog: any): string {
  const pgm = prog.pgm_program
  const currentData = prog.program || ''

  if (!pgm) return currentData

  // Extract versions to compare them cleanly
  const extractVersion = (name: string) => {
    const match = name.match(/_V(\d+(?:\.\d+)*)/i) || name.match(/V(\d+(?:\.\d+)*)/i)
    return match ? match[1] : null
  }
  const verPgm = extractVersion(pgm)
  const verData = extractVersion(currentData)

  // If they are exactly identical (or their versions are identical), display the DATA program name
  if (pgm === currentData || (verPgm && verData && verPgm === verData)) {
    return currentData
  }

  // Otherwise, show the one with the higher version
  return getHigherVersion(pgm, currentData)
}

function startEdit(lotId: number, field: string, val: any, progRef: any) {
  editState.lot_id = lotId
  editState.field = field
  editState.value = val ?? ''
  editState.progRef = progRef
}
function cancelEdit() {
  editState.lot_id = 0; editState.field = ''; editState.value = ''; editState.progRef = null
}

async function _saveExtra(lotId: number, payload: any) {
  await api.put(`/programs/lot/${lotId}/extra`, payload)
}

async function saveField(prog: any, field: string) {
  if (!editState.field) return
  try {
    await _saveExtra(prog.lot_id, { [field]: editState.value })
    prog[field] = editState.value
    await fetchSuggestions()
  } catch { alert('保存失败') }
  finally { cancelEdit() }
}

async function saveUph(prog: any) {
  const hours = Number(editState.value)
  const seconds = Math.round(hours * 3600)
  try {
    await _saveExtra(prog.lot_id, { ft_touch_down_s: seconds })
    prog.uph_s = seconds
  } catch { alert('保存失败') }
  finally { cancelEdit() }
}

async function saveDataType(prog: any) {
  try {
    await _saveExtra(prog.lot_id, { data_type_override: editState.value })
    prog.data_type = editState.value
  } catch { alert('保存失败') }
  finally { cancelEdit() }
}

async function fetchList() {
  loading.value = true
  try {
    const [dbData, placeholders] = await Promise.all([
      api.get('/programs/list'),
      api.get('/programs/placeholders'),
    ])
    // 合并：DB 数据 + 占位（不重复）
    const dbNames = new Set((dbData as unknown as any[]).map((r: any) => r.product_name))
    const extraRows = (placeholders as unknown as any[])
      .filter((p: any) => !dbNames.has(p.product_name))
      .map((p: any, i: number) => ({
        index: (dbData as unknown as any[]).length + i + 1,
        product_name: p.product_name,
        programs: [],
        avg_touch_down_s: null,
        is_placeholder: true,
      }))
    listData.value = [...(dbData as unknown as any[]), ...extraRows]
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

async function fetchSuggestions() {
  for (const f of ['engineer', 'package', 'hardware_info']) {
    try { suggestions[f] = await api.get(`/programs/suggestions/${f}`) } catch {}
  }
}

// ─── 新增产品名 ───
function openAddProduct() {
  addProductDialog.productName = ''
  addProductDialog.saving = false
  addProductDialog.show = true
}

async function confirmAddProduct() {
  const name = addProductDialog.productName.trim()
  if (!name) return
  addProductDialog.saving = true
  try {
    await api.post('/programs/placeholder', { product_name: name })
    addProductDialog.show = false
    await fetchList()
  } catch { alert('保存失败') }
  finally { addProductDialog.saving = false }
}

// ─── PGS 上传（从主页直接上传）───
function triggerPgsUpload() { pgsInput.value?.click() }

function onPgsSelected(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  pgsDialog.file = files[0]!
  pgsDialog.filename = files[0]!.name
  pgsDialog.productName = ''
  pgsDialog.show = true
  ;(e.target as HTMLInputElement).value = ''
}

async function submitPgs() {
  if (!pgsDialog.file || !pgsDialog.productName) return
  pgsDialog.uploading = true
  try {
    const form = new FormData()
    form.append('file', pgsDialog.file)
    form.append('product_name', pgsDialog.productName)
    const result: any = await api.post('/programs/upload_pgs', form)
    pgsDialog.show = false
    if (result.parse_status === 'ok') {
      alert(`${pgsDialog.filename} 上传并解析成功！版本：${result.program_version ?? '未知'}`)
    } else {
      alert(`上传成功，但解析失败：${result.parse_error ?? '未知错误'}`)
    }
    await fetchList()
  } catch { alert('上传失败') }
  finally { pgsDialog.uploading = false }
}

onMounted(() => { fetchList(); fetchSuggestions() })
</script>

<style scoped>
.pgchange-root { height: 100%; display: flex; flex-direction: column; background: #f0f2f5; }

.toolbar {
  display: flex; align-items: center; background: white;
  padding: 10px 16px; border-bottom: 1px solid #e8e8e8; flex-shrink: 0;
}
.toolbar-left { display: flex; gap: 8px; align-items: center; }
.btn {
  padding: 6px 14px; border: 1px solid #d9d9d9; border-radius: 4px;
  background: white; cursor: pointer; font-size: 13px; transition: background 0.15s;
}
.btn:hover:not(:disabled) { background: #f5f5f5; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #1890ff; color: white; border-color: #1890ff; }
.btn-primary:hover:not(:disabled) { background: #40a9ff; }
.btn-success { background: #52c41a; color: white; border-color: #52c41a; }
.btn-success:hover:not(:disabled) { background: #73d13d; }
.loading-text { font-size: 12px; color: #888; }

.table-scroll { flex: 1; overflow: auto; padding: 12px 16px; }

.pg-table {
  width: 100%; border-collapse: collapse; background: white;
  border-radius: 6px; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); font-size: 13px;
}
.pg-table th {
  background: #f5f7fa; padding: 9px 10px; text-align: left;
  font-weight: 600; color: #555; border-bottom: 1px solid #e8e8e8;
  white-space: nowrap;
}
.pg-table td {
  padding: 7px 10px; border-bottom: 1px solid #f0f0f0;
  color: #333; vertical-align: middle;
}
.data-row:hover td { background: #f8faff; }
.placeholder-row td { color: #999; font-style: italic; }
.th-no, .td-no { width: 48px; text-align: center; color: #aaa; font-size: 12px; }
.th-product, .td-product {
  min-width: 120px; font-weight: 600; color: #1890ff;
  cursor: pointer; white-space: nowrap;
}
.td-product:hover { color: #40a9ff; text-decoration: underline; }
.th-program, .td-program { min-width: 200px; }
.prog-link { color: #5b21b6; font-family: monospace; font-size: 12px; cursor: pointer; }
.prog-link:hover { color: #7c3aed; text-decoration: underline; }
.placeholder-badge {
  display: inline-block; font-size: 10px; background: #fff7e6; color: #d46b08;
  border: 1px solid #ffd591; border-radius: 8px; padding: 0 5px; margin-left: 5px;
  font-style: normal; font-weight: 500;
}

.type-badge { font-size: 11px; padding: 1px 7px; border-radius: 8px; font-weight: 600; }
.type-cp { background: #e6f7ff; color: #0958d9; }
.type-ft { background: #fff7e6; color: #d46b08; }

.editable-cell { cursor: pointer; }
.editable-cell:hover { background: #fffbe6; }
.inline-edit { display: flex; }
.inline-input {
  border: 1px solid #1890ff; border-radius: 3px; padding: 2px 6px;
  font-size: 12px; width: 100px; outline: none;
}
.inline-select {
  border: 1px solid #1890ff; border-radius: 3px; padding: 2px 4px;
  font-size: 12px; outline: none;
}

.td-empty { text-align: center; color: #bbb; padding: 30px !important; }
.td-empty-inline { color: #ccc; text-align: center; }

/* 弹窗 */
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 999;
}
.dialog {
  background: white; border-radius: 8px; padding: 24px; width: 420px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}
.dialog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.dialog-header h3 { margin: 0; font-size: 16px; }
.close-btn { background: none; border: none; font-size: 18px; cursor: pointer; color: #888; }
.file-hint { font-size: 13px; color: #555; margin-bottom: 12px; }
.field { margin-bottom: 14px; }
.field label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; }
.field-input {
  width: 100%; padding: 7px 10px; border: 1px solid #d9d9d9;
  border-radius: 4px; font-size: 13px; box-sizing: border-box;
}
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
