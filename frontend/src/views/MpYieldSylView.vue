<template>
  <div class="syl-page">
    <!-- Top bar -->
    <div class="syl-topbar">
      <a class="syl-back" href="javascript:void(0)" @click="goBack">← 返回量产良率</a>
      <span class="syl-title">SYL/SBL 设定 — {{ product }}</span>
      <a class="syl-godetail" :href="detailEntryUrl" target="_blank" rel="noopener" title="在新标签页打开明细：首次设定不筛开始日期，多次设定筛最近一次设定日期起，点亮 SYL 超标">进入明细页面 →</a>
      <button class="syl-refresh" @click="loadSessions">刷新</button>
    </div>

    <!-- Parse row: left = parse button, right = input -->
    <div class="syl-card">
      <div class="syl-parse-row">
        <button class="btn syl-parse-btn" :disabled="saving" @click="handleParse">{{ saving ? '解析中…' : '解析' }}</button>
        <textarea
          v-model="sylInput"
          class="syl-parse-input"
          rows="2"
          placeholder="请粘贴需要设定的SYL/SBL（例：Bin1+Bin2: 80%; BIN49(P2P_leakage_post): 0.07%; BIN10(AMR_leakage): 1.35%; BIN5(short_pre): 0.19%）"
        ></textarea>
      </div>
      <div v-if="message" class="syl-msg" :class="{ err: msgIsErr }">{{ message }}</div>
      <div class="syl-hint">每点击一次“解析”保存一组设定；同一 Bin 会自动跨组对齐，未设置过的 Bin 显示为空。</div>
    </div>

    <!-- Sessions matrix: each session occupies 3 columns -->
    <div class="syl-card syl-matrix-card">
      <div v-if="loading" class="syl-empty">加载中…</div>
      <div v-else-if="sessions.length === 0" class="syl-empty">暂无 SYL/SBL 设定，请在上方粘贴文本并点击“解析”。</div>
      <div v-else class="syl-table-wrap">
        <table class="syl-table">
          <thead>
            <tr class="syl-group-row">
              <th v-for="s in sessions" :key="'g' + s.id" :colspan="3" class="syl-group-head">
                <span class="syl-time">{{ fmtTime(s.setup_time) }}</span>
                <a class="syl-del" href="javascript:void(0)" title="删除本次设定" @click="removeSession(s.id)">✕ 删除</a>
              </th>
            </tr>
            <tr class="syl-header-row">
              <template v-for="s in sessions" :key="'h' + s.id">
                <th>Bin序号</th>
                <th>Bin参数名</th>
                <th>百分比</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrixRows" :key="row.key">
              <template v-for="s in sessions" :key="'c' + s.id + '_' + row.key">
                <td class="syl-binno" :title="cellTitle(cellOf(row.key, s))">{{ cellLabel(cellOf(row.key, s)) }}</td>
                <td :title="(cellOf(row.key, s) && cellOf(row.key, s).param) || ''">{{ cellParam(cellOf(row.key, s)) }}</td>
                <td class="syl-pct" :title="cellTitle(cellOf(row.key, s))">{{ cellPct(cellOf(row.key, s)) }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'

interface SylRule {
  label: string
  bins: number[]
  param: string
  pct: number
  direction: 'gte' | 'lte'
}

interface SylSession {
  id: number
  product_name: string
  setup_time: string
  raw_text: string
  rules: SylRule[]
}

const route = useRoute()
const router = useRouter()
const product = ref<string>((route.query.product as string) || '')
const sylInput = ref('')
const sessions = ref<SylSession[]>([])
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const msgIsErr = ref(false)

watch(() => route.query.product, (v) => {
  const next = (v as string) || ''
  if (next !== product.value) {
    product.value = next
    loadSessions()
  }
})

function goBack() {
  router.push('/analysis')
}

function fmtTime(iso: string): string {
  if (!iso) return ''
  return String(iso).replace('T', ' ').slice(0, 19)
}

function ruleKey(r: { bins: number[] }): string {
  return [...r.bins].sort((a, b) => a - b).join('+')
}

function cellOf(rowKey: string, s: SylSession): SylRule | null {
  const hit = (s.rules || []).find((r) => ruleKey(r) === rowKey)
  return hit || null
}

const matrixRows = computed(() => {
  const map = new Map<string, number>();
  for (const s of sessions.value) {
    for (const r of s.rules || []) {
      const k = ruleKey(r);
      const mn = Math.min(...r.bins);
      if (!map.has(k) || mn < map.get(k)!) map.set(k, mn);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => ({ key }));
})

function cellLabel(r: SylRule | null): string {
  return r ? r.label : ''
}
function cellParam(r: SylRule | null): string {
  return r ? (r.param || '') : ''
}
function cellPct(r: SylRule | null): string {
  return r ? (Number(r.pct) + '%') : ''
}
function cellTitle(r: SylRule | null): string {
  if (!r) return ''
  const d = r.direction === 'gte' ? '实际低于此值即超标' : '实际高于此值即超标'
  const nm = r.param ? ' (' + r.param + ')' : ''
  return r.label + nm + ' 阈值 ' + Number(r.pct) + '%　' + d
}

interface ParsedRule {
  label: string; bins: number[]; param: string; pct: number; direction: 'gte' | 'lte'
}

function parseSylText(rawText: string): ParsedRule[] {
  const out: ParsedRule[] = []
  const parts = rawText.split(/[;；\n]+/);
  for (let partRaw of parts) {
    const part = partRaw.trim();
    if (!part) continue;
    let pct = NaN;
    let head = part;
    const numMatch = part.match(/(\d+(?:\.\d+)?)\s*%/i);
    if (numMatch && numMatch.index !== undefined) {
      pct = parseFloat(numMatch[1]);
      head = part.slice(0, numMatch.index);
    } else {
      const anyNum = part.match(/(\d+(?:\.\d+)?)/);
      if (anyNum && anyNum.index !== undefined) {
        pct = parseFloat(anyNum[1]);
        head = part.slice(0, anyNum.index);
      }
    }
    if (!isFinite(pct) || pct < 0) continue;
    let param = '';
    const parMatch = head.match(/[（(]([^()（）]*)[)）]/);
    if (parMatch) param = parMatch[1].trim();
    const bins: number[] = [];
    const binRe = /bin\s*(\d+)/gi;
    let m: RegExpExecArray | null;
    while ((m = binRe.exec(head)) !== null) {
      bins.push(parseInt(m[1], 10));
    }
    if (bins.length === 0) continue;
    const sorted = Array.from(new Set(bins)).sort((a, b) => a - b);
    out.push({
      label: sorted.map((b) => 'Bin' + b).join('+'),
      bins: sorted,
      param,
      pct,
      direction: sorted.includes(1) ? 'gte' : 'lte',
    });
  }
  return out;
}

async function loadSessions() {
  if (!product.value) return;
  loading.value = true;
  try {
    const resp: any = await api.get('/lots/mp-yield/syl', { params: { product_name: product.value } });
    sessions.value = (resp && resp.sessions) || [];
    // 输入框默认显示最近一次设定的原始内容；从未设定过时保持输入框不变
    if (sessions.value.length > 0) {
      const last = sessions.value[sessions.value.length - 1];
      sylInput.value = last && last.raw_text ? last.raw_text : '';
    }
  } catch (e: any) {
    message.value = '加载失败: ' + ((e && (e.response && e.response.data && e.response.data.detail)) || (e && e.message) || e);
    msgIsErr.value = true;
  } finally {
    loading.value = false;
  }
}

async function handleParse() {
  const text = sylInput.value.trim();
  if (!text) { setMsg('请先粘贴需要设定的 SYL/SBL 文本', true); return; }
  const rules = parseSylText(text);
  if (rules.length === 0) { setMsg('未解析到任何有效 Bin 规则，请检查格式', true); return; }
  saving.value = true;
  try {
    await api.post('/lots/mp-yield/syl', {
      product_name: product.value,
      raw_text: text,
      rules: rules.map((r) => ({ label: r.label, bins: r.bins, param: r.param, pct: r.pct, direction: r.direction })),
    });
    setMsg('解析成功，已保存本次设定（共 ' + rules.length + ' 条规则）', false);
    await loadSessions();
  } catch (e: any) {
    const detail = e && e.response && e.response.data && e.response.data.detail;
    setMsg('保存失败: ' + (detail || (e && e.message) || e), true);
  } finally {
    saving.value = false;
  }
}

async function removeSession(id: number) {
  if (!window.confirm('确定删除该次 SYL/SBL 设定？')) return;
  try {
    await api.delete('/lots/mp-yield/syl/' + id);
    setMsg('已删除', false);
    await loadSessions();
  } catch (e: any) {
    const detail = e && e.response && e.response.data && e.response.data.detail;
    setMsg('删除失败: ' + (detail || (e && e.message) || e), true);
  }
}

function setMsg(text: string, isErr: boolean) {
  message.value = text;
  msgIsErr.value = isErr;
}

// Jump into the detail page (new tab), turning on the SYL-over view.
// First-time setup: no start-date filter and no end date (default).
// Multiple setups: start date = latest setup date, end date still default.
const detailEntryUrl = computed(() => {
  const qp: string[] = []
  if (product.value) qp.push('product_name=' + encodeURIComponent(product.value))
  if (sessions.value.length > 1) {
    const last = sessions.value[sessions.value.length - 1]
    const d = last && last.setup_time ? String(last.setup_time).slice(0, 10) : ''
    if (d) qp.push('test_date_from=' + d)
  }
  return '/analysis?view=detail&syl_over=1&' + qp.join('&')
})

loadSessions();
</script>

<style scoped>
.syl-page { display: flex; flex-direction: column; gap: 12px; padding: 8px 4px; }
.syl-topbar { display: flex; align-items: center; }
.syl-back { margin-right: 16px; color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 5px 12px; font-size: 13px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.syl-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-right: 28px; }
.syl-godetail { margin-right: 28px; color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 5px 12px; font-size: 13px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.syl-refresh { padding: 5px 14px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; color: #334155; font-size: 13px; }
.syl-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.syl-parse-row { display: flex; gap: 10px; align-items: stretch; }
.syl-parse-btn { min-width: 84px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
.syl-parse-btn:disabled { opacity: .6; cursor: not-allowed; }
.syl-parse-input { flex: 1; resize: vertical; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: inherit; outline: none; }
.syl-msg { margin-top: 8px; font-size: 13px; color: #16a34a; }
.syl-msg.err { color: #dc2626; }
.syl-hint { margin-top: 6px; font-size: 12px; color: #94a3b8; }
.syl-empty { padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; }
.syl-table-wrap { overflow: auto; max-height: 70vh; }
.syl-table { border-collapse: collapse; width: auto; min-width: 0; font-size: 13px; }
.syl-table th, .syl-table td { border: 1px solid #e2e8f0; padding: 6px 10px; white-space: nowrap; }
.syl-group-row th { background: #eff6ff; color: #1d4ed8; text-align: left; }
.syl-header-row th { background: #f1f5f9; color: #334155; font-weight: 600; position: sticky; top: 0; z-index: 1; }
.syl-time { font-weight: 700; }
.syl-del { margin-left: 14px; color: #dc2626; font-size: 12px; text-decoration: none; }
tbody tr:nth-child(even) { background: #fafbfc; }
.syl-binno { font-weight: 600; color: #db2777; }
.syl-pct { color: #334155; }
</style>