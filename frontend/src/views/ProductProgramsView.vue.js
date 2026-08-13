import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api';
import { fmtDateOnlyTz } from '@/utils/dateUtils';
const route = useRoute();
const router = useRouter();
const productName = computed(() => route.params.productName);
// ─── Data Tab ───
const rows = ref([]);
const loading = ref(false);
const dataSnapshotLoaded = ref(false);
let dataSnapshotPromise = null;
const activeTab = ref('pgm');
const dataMonthsInput = ref('1');
const testerFilter = ref('');
const testerOptions = computed(() => Array.from(new Set(rows.value.filter(row => !isQaDataRow(row)).map(row => row.tester).filter(Boolean))).sort());
function isQaDataRow(row) {
    return (String(row?.filename || '').toUpperCase().includes('QA') ||
        String(row?.program || '').toUpperCase().includes('QA') ||
        String(row?.data_type || '').toUpperCase() === 'QA');
}
const displayedRows = computed(() => testerFilter.value
    ? rows.value.filter(row => !isQaDataRow(row) && row.tester === testerFilter.value)
    : rows.value.filter(row => !isQaDataRow(row)));
// ─── PGM Tab ───
const pgmRows = ref([]);
const pgmLoading = ref(false);
// ─── Edit state ───
const editState = reactive({
    lot_id: 0, field: '', value: ''
});
// ─── Pgm Remark edit state ───
const pgmEditState = reactive({
    id: 0, field: '', value: ''
});
function startPgmEdit(id, field, val) {
    pgmEditState.id = id;
    pgmEditState.field = field;
    pgmEditState.value = val ?? '';
}
function cancelPgmEdit() {
    pgmEditState.id = 0;
    pgmEditState.field = '';
    pgmEditState.value = '';
}
async function savePgmField(row, field) {
    if (!pgmEditState.field)
        return;
    try {
        await api.put(`/programs/pgs/${row.id}/remark`, { remark: pgmEditState.value });
        row[field] = pgmEditState.value;
    }
    catch (err) {
        alert('保存失败: ' + (err.response?.data?.detail || err.message));
    }
    finally {
        cancelPgmEdit();
    }
}
const suggestions = reactive({
    engineer: [], package: [], hardware_info: []
});
// ─── Compare dialog (Data tab) ───
const compare = reactive({
    show: false, data: null, binCollapsed: false,
});
// PGS Viewer 已改为独立页面 PgsParamView，通过路由跳转打开
// ─── PGS Upload (二级页面) ───
const pgsInput = ref();
const pgsUpload = reactive({
    show: false,
    files: [],
    filename: '',
    currentName: '',
    current: 0,
    total: 0,
    uploading: false,
    awaitingTester: false,
    selectedTester: '',
    testerChoices: [],
    datasheetFile: null,
});
// ─── 工具函数 ───
function fmtDate(v) {
    return fmtDateOnlyTz(v);
}
function fmtHours(s) {
    if (s == null)
        return '';
    return (s / 3600).toFixed(2) + ' h';
}
function fmtYield(v) {
    if (v == null)
        return '';
    const n = Number(v);
    if (!Number.isFinite(n))
        return '';
    return (n <= 1 ? n * 100 : n).toFixed(2) + '%';
}
function fmt(v) {
    if (v == null)
        return '';
    if (typeof v === 'number') {
        return Math.abs(v) >= 10000 || (Math.abs(v) < 0.001 && v !== 0)
            ? v.toExponential(3) : parseFloat(v.toPrecision(6)).toString();
    }
    return String(v);
}
function newSideClass(r) {
    if (r.row_type === 'added')
        return 'row-added';
    if (r.row_type === 'removed')
        return 'row-new-empty';
    if (r.row_type === 'limit_changed')
        return r.limit_direction === 'loose' ? 'row-loose' : 'row-tight';
    return '';
}
function oldSideClass(r) {
    if (r.row_type === 'removed')
        return 'row-removed';
    if (r.row_type === 'added')
        return 'row-old-empty';
    if (r.row_type === 'limit_changed')
        return r.limit_direction === 'loose' ? 'row-loose' : 'row-tight';
    return '';
}
function limitHl(r, side, ver) {
    if (r.row_type !== 'limit_changed' || !r.new || !r.old)
        return '';
    const k = side === 'lower' ? 'lower_limit' : 'upper_limit';
    if (r.new[k] === r.old[k])
        return '';
    return ver === 'new' ? 'hl-new' : 'hl-old';
}
// ─── API ───
async function fetchDataSnapshot() {
    if (dataSnapshotPromise)
        return dataSnapshotPromise;
    dataSnapshotPromise = (async () => {
        try {
            const data = await api.get(`/programs/data_list/${encodeURIComponent(productName.value)}`);
            rows.value = (data || []).filter((row) => !isQaDataRow(row));
            dataSnapshotLoaded.value = true;
            if (testerFilter.value && !testerOptions.value.includes(testerFilter.value)) {
                testerFilter.value = '';
            }
        }
        catch (e) {
            console.error(e);
        }
        finally {
            dataSnapshotPromise = null;
        }
    })();
    return dataSnapshotPromise;
}
async function fetchData(showLoading = false) {
    if (showLoading)
        loading.value = true;
    try {
        rows.value = [];
        const data = await api.post(`/programs/data_list/${encodeURIComponent(productName.value)}/refresh`, null, {
            params: { days: dataMonthsToDays(dataMonthsInput.value) },
        });
        rows.value = (data || []).filter((row) => !isQaDataRow(row));
        dataSnapshotLoaded.value = true;
        if (testerFilter.value && !testerOptions.value.includes(testerFilter.value)) {
            testerFilter.value = '';
        }
    }
    catch (e) {
        console.error(e);
    }
    finally {
        loading.value = false;
    }
}
async function fetchPgmData() {
    pgmLoading.value = true;
    try {
        pgmRows.value = await api.get(`/programs/pgs_list/${encodeURIComponent(productName.value)}`);
    }
    catch (e) {
        console.error(e);
    }
    finally {
        pgmLoading.value = false;
    }
}
async function fetchSuggestions() {
    for (const f of ['engineer', 'package', 'hardware_info']) {
        try {
            suggestions[f] = await api.get(`/programs/suggestions/${f}`);
        }
        catch { }
    }
}
async function openCompare(lotId) {
    compare.show = true;
    compare.data = null;
    compare.binCollapsed = false;
    try {
        compare.data = await api.get(`/programs/lot/${lotId}/compare`);
    }
    catch {
        compare.show = false;
        alert('加载失败');
    }
}
// ─── PGS 参数页面跳转 ───
function goPgsParam(row) {
    router.push({
        name: 'pgs-param',
        params: { productName: productName.value, id: row.id },
    });
}
// ─── PGS Upload ───
function goDataParam(row) {
    router.push({
        name: 'data-program-param',
        params: { productName: productName.value, id: row.id ?? row.lot_id },
        query: { days: dataMonthsToDays(dataMonthsInput.value) },
    });
}
function dataMonthsToDays(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0)
        return 30;
    if (n < 1) {
        return Math.max(1, Math.round(n * 30));
    }
    return Math.max(1, Math.round(n * 30));
}
function triggerPgsUpload() { pgsInput.value?.click(); }
function resetPgsUpload() {
    pgsUpload.uploading = false;
    pgsUpload.show = false;
    pgsUpload.files = [];
    pgsUpload.filename = '';
    pgsUpload.currentName = '';
    pgsUpload.current = 0;
    pgsUpload.total = 0;
    pgsUpload.awaitingTester = false;
    pgsUpload.selectedTester = '';
    pgsUpload.testerChoices = [];
    pgsUpload.datasheetFile = null;
    if (uploadDsInput.value)
        uploadDsInput.value.value = '';
}
async function onPgsSelected(e) {
    const input = e.target;
    const selectedFiles = Array.from(input.files ?? []);
    input.value = '';
    if (!selectedFiles.length)
        return;
    const invalidFiles = selectedFiles.filter(file => !/\.(zip|rar|7z)$/i.test(file.name));
    if (invalidFiles.length) {
        alert(`请上传 .zip、.rar 或 .7z 压缩包：${invalidFiles.map(file => file.name).join('、')}`);
        return;
    }
    if (!dataSnapshotLoaded.value) {
        await fetchDataSnapshot();
    }
    pgsUpload.files = selectedFiles;
    pgsUpload.filename = selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} 个文件`;
    pgsUpload.currentName = selectedFiles[0].name;
    pgsUpload.current = 0;
    pgsUpload.total = selectedFiles.length;
    pgsUpload.uploading = false;
    pgsUpload.testerChoices = testerOptions.value;
    pgsUpload.selectedTester = pgsUpload.testerChoices.length === 1 ? pgsUpload.testerChoices[0] : '';
    pgsUpload.awaitingTester = pgsUpload.testerChoices.length >= 2;
    pgsUpload.datasheetFile = null;
    pgsUpload.show = true;
}
async function submitPgs() {
    if (!pgsUpload.files.length)
        return;
    if (pgsUpload.awaitingTester && !pgsUpload.selectedTester)
        return;
    pgsUpload.uploading = true;
    const failedMessages = [];
    try {
        for (let i = 0; i < pgsUpload.files.length; i += 1) {
            const file = pgsUpload.files[i];
            pgsUpload.current = i + 1;
            pgsUpload.currentName = file.name;
            try {
                const form = new FormData();
                form.append('file', file);
                form.append('product_name', productName.value);
                if (pgsUpload.selectedTester) {
                    form.append('tester', pgsUpload.selectedTester);
                }
                if (pgsUpload.datasheetFile) {
                    form.append('datasheet_file', pgsUpload.datasheetFile);
                }
                const result = await api.post('/programs/upload_pgs', form);
                if (result.parse_status !== 'ok') {
                    failedMessages.push(`${file.name}: ${result.parse_error ?? '未知错误'}`);
                }
            }
            catch {
                failedMessages.push(`${file.name}: 上传失败`);
            }
        }
        activeTab.value = 'pgm';
        await fetchPgmData();
        if (failedMessages.length) {
            alert(`以下文件上传/解析失败：\n${failedMessages.join('\n')}`);
        }
    }
    finally {
        resetPgsUpload();
    }
}
// ─── Modal Datasheet Select ───
const uploadDsInput = ref(null);
function triggerUploadDsSelect() {
    if (uploadDsInput.value)
        uploadDsInput.value.click();
}
function onUploadDsFileChange(e) {
    const target = e.target;
    if (target.files && target.files.length > 0) {
        pgsUpload.datasheetFile = target.files[0];
    }
}
function clearUploadDsFile() {
    pgsUpload.datasheetFile = null;
    if (uploadDsInput.value)
        uploadDsInput.value.value = '';
}
// ─── Row-level Datasheet Actions ───
const rowDsInput = ref(null);
const activeUploadRow = ref(null);
function triggerRowDsUpload(row) {
    activeUploadRow.value = row;
    if (rowDsInput.value)
        rowDsInput.value.click();
}
async function onRowDsFileChange(e) {
    const target = e.target;
    if (!target.files || target.files.length === 0 || !activeUploadRow.value)
        return;
    const file = target.files[0];
    target.value = '';
    const formData = new FormData();
    formData.append('upload_id', activeUploadRow.value.id.toString());
    formData.append('file', file);
    pgmLoading.value = true;
    try {
        await api.post('/spec/upload-datasheet-to-pgs', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        await fetchPgmData();
        alert('Datasheet 上传并关联成功！');
    }
    catch (err) {
        alert('Datasheet 上传失败: ' + err);
    }
    finally {
        pgmLoading.value = false;
        activeUploadRow.value = null;
    }
}
async function downloadRowDatasheet(row) {
    pgmLoading.value = true;
    try {
        const response = await api.get(`/spec/download-datasheet/${row.id}`, {
            responseType: 'blob'
        });
        const blob = new Blob([response], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = row.datasheet_filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    catch (err) {
        alert('下载失败: ' + err);
    }
    finally {
        pgmLoading.value = false;
    }
}
async function deleteRowDatasheet(row) {
    if (!confirm(`确定要删除此版本的 Datasheet: ${row.datasheet_filename} 吗？`))
        return;
    pgmLoading.value = true;
    try {
        await api.delete(`/spec/delete-datasheet/${row.id}`);
        await fetchPgmData();
        alert('删除成功');
    }
    catch (err) {
        alert('删除失败: ' + err);
    }
    finally {
        pgmLoading.value = false;
    }
}
async function downloadPgs(row) {
    try {
        const res = await api.get(`/programs/pgs/${row.id}/download`, { responseType: 'blob' });
        const disposition = res.headers?.['content-disposition'] ?? '';
        const match = disposition.match(/filename="?([^"]+)"?/i);
        const fallbackName = row.filename?.match(/\.(zip|rar|7z)$/i)
            ? row.filename
            : `${row.program_version ?? row.filename ?? 'program'}.zip`;
        const fileName = decodeURIComponent(match?.[1] ?? fallbackName);
        const url = window.URL.createObjectURL(res.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    }
    catch {
        alert('下载失败');
    }
}
async function deletePgs(row) {
    if (!confirm(`确定要删除「${row.program_version ?? row.filename}」吗？此操作不可撤销。`))
        return;
    try {
        await api.delete(`/programs/pgs/${row.id}`);
        await fetchPgmData();
    }
    catch {
        alert('删除失败');
    }
}
// ─── 编辑 ───
function startEdit(lotId, field, val, _row) {
    editState.lot_id = lotId;
    editState.field = field;
    editState.value = val ?? '';
}
function cancelEdit() { editState.lot_id = 0; editState.field = ''; editState.value = ''; }
async function _save(lotId, payload, rowRef, key, val) {
    try {
        await api.put(`/programs/lot/${lotId}/extra`, payload);
        rowRef[key] = val;
        await fetchSuggestions();
    }
    catch {
        alert('保存失败');
    }
    finally {
        cancelEdit();
    }
}
async function saveField(row, field) {
    if (!editState.field)
        return;
    await _save(row.lot_id, { [field]: editState.value }, row, field, editState.value);
}
async function saveUph(row) {
    const hours = Number(editState.value);
    const seconds = Math.round(hours * 3600);
    await _save(row.lot_id, { ft_touch_down_s: seconds }, row, 'uph_s', seconds);
}
async function saveDataType(row) {
    await _save(row.lot_id, { data_type_override: editState.value }, row, 'data_type', editState.value);
}
function openRawData(lotId) {
    if (!lotId)
        return;
    const url = router.resolve({ name: 'analysis', params: { id: lotId } }).href;
    window.open(url, '_blank', 'noopener');
}
onMounted(() => { fetchDataSnapshot(); fetchPgmData(); fetchSuggestions(); });
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['bc-link']} */ ;
/** @type {__VLS_StyleScopedClasses['months-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['pg-table']} */ ;
/** @type {__VLS_StyleScopedClasses['pg-table']} */ ;
/** @type {__VLS_StyleScopedClasses['prog-link']} */ ;
/** @type {__VLS_StyleScopedClasses['raw-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['del-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['download-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['cmp-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['leg-added']} */ ;
/** @type {__VLS_StyleScopedClasses['leg-removed']} */ ;
/** @type {__VLS_StyleScopedClasses['leg-loose']} */ ;
/** @type {__VLS_StyleScopedClasses['leg-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['param-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-header']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-clear']} */ ;
/** @type {__VLS_StyleScopedClasses['td-ds']} */ ;
/** @type {__VLS_StyleScopedClasses['td-raw']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "product-page" },
});
/** @type {__VLS_StyleScopedClasses['product-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page-header" },
});
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "breadcrumb" },
});
/** @type {__VLS_StyleScopedClasses['breadcrumb']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.$router.push('/program-changes'));
            // @ts-ignore
            [$router,];
        } },
    ...{ class: "bc-link" },
});
/** @type {__VLS_StyleScopedClasses['bc-link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "bc-sep" },
});
/** @type {__VLS_StyleScopedClasses['bc-sep']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "bc-current" },
});
/** @type {__VLS_StyleScopedClasses['bc-current']} */ ;
(__VLS_ctx.productName);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header-actions" },
});
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
if (__VLS_ctx.activeTab === 'pgm') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.triggerPgsUpload) },
        ...{ class: "btn btn-primary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.onPgsSelected) },
    ref: "pgsInput",
    type: "file",
    accept: ".zip,.rar,.7z",
    multiple: true,
    hidden: true,
});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.onRowDsFileChange) },
    ref: "rowDsInput",
    type: "file",
    accept: ".docx,.doc",
    ...{ style: {} },
});
if (__VLS_ctx.activeTab === 'data') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "months-filter" },
    });
    /** @type {__VLS_StyleScopedClasses['months-filter']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "0.25",
        step: "0.25",
        ...{ class: "months-input" },
    });
    (__VLS_ctx.dataMonthsInput);
    /** @type {__VLS_StyleScopedClasses['months-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
if (__VLS_ctx.activeTab === 'data') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'data'))
                    throw 0;
                return (__VLS_ctx.fetchData(true));
                // @ts-ignore
                [productName, activeTab, activeTab, activeTab, triggerPgsUpload, onPgsSelected, onRowDsFileChange, dataMonthsInput, fetchData,];
            } },
        ...{ class: "btn" },
        disabled: (__VLS_ctx.loading),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tab-bar" },
});
/** @type {__VLS_StyleScopedClasses['tab-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.activeTab = 'pgm');
            // @ts-ignore
            [activeTab, loading,];
        } },
    ...{ class: "tab-btn" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'pgm' }) },
});
/** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
if (__VLS_ctx.pgmRows.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tab-count" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-count']} */ ;
    (__VLS_ctx.pgmRows.length);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.activeTab = 'data');
            // @ts-ignore
            [activeTab, activeTab, pgmRows, pgmRows,];
        } },
    ...{ class: "tab-btn" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'data' }) },
});
/** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "table-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'data'), }, null, null);
/** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
if (__VLS_ctx.loading && !__VLS_ctx.rows.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-mask" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-mask']} */ ;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "pg-table" },
    });
    /** @type {__VLS_StyleScopedClasses['pg-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "th-no" },
    });
    /** @type {__VLS_StyleScopedClasses['th-no']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "th-items" },
    });
    /** @type {__VLS_StyleScopedClasses['th-items']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "th-filter" },
    });
    /** @type {__VLS_StyleScopedClasses['th-filter']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    if (__VLS_ctx.testerOptions.length >= 2) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_ctx.testerFilter),
            ...{ class: "tester-filter" },
        });
        /** @type {__VLS_StyleScopedClasses['tester-filter']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "",
        });
        for (const [tester] of __VLS_vFor((__VLS_ctx.testerOptions))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (tester),
                value: (tester),
            });
            (tester);
            // @ts-ignore
            [activeTab, activeTab, loading, rows, testerOptions, testerOptions, testerFilter,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [row] of __VLS_vFor((__VLS_ctx.displayedRows))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (row.lot_id),
            ...{ class: "data-row" },
        });
        /** @type {__VLS_StyleScopedClasses['data-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "td-no" },
        });
        /** @type {__VLS_StyleScopedClasses['td-no']} */ ;
        (row.index);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "td-product" },
        });
        /** @type {__VLS_StyleScopedClasses['td-product']} */ ;
        (row.product_name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                        throw 0;
                    return (__VLS_ctx.goDataParam(row));
                    // @ts-ignore
                    [displayedRows, goDataParam,];
                } },
            ...{ class: "td-program" },
        });
        /** @type {__VLS_StyleScopedClasses['td-program']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "prog-link" },
        });
        /** @type {__VLS_StyleScopedClasses['prog-link']} */ ;
        (row.program);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "td-items" },
        });
        /** @type {__VLS_StyleScopedClasses['td-items']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "items-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['items-badge']} */ ;
        (row.item_count ?? '');
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "changes-tag" },
            ...{ class: (row.changes === '首版' || row.changes === '无变化' ? 'ch-none' : 'ch-has') },
        });
        /** @type {__VLS_StyleScopedClasses['changes-tag']} */ ;
        (row.changes);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.fmtDate(row.test_date));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.site ?? '');
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.avg_touch_down_s != null ? row.avg_touch_down_s.toFixed(1) : '');
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.fmtHours(row.uph_s));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.tester);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.fmtYield(row.test_yield));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.lot_id, 'data_type', row.data_type, row));
                    // @ts-ignore
                    [fmtDate, fmtHours, fmtYield, startEdit,];
                } },
            ...{ class: "editable-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'data_type') {
            if (row.data_type) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "type-badge" },
                    ...{ class: (row.data_type === 'CP' ? 'type-cp' : 'type-ft') },
                });
                /** @type {__VLS_StyleScopedClasses['type-badge']} */ ;
                (row.data_type);
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'data_type'))
                            throw 0;
                        return (__VLS_ctx.saveDataType(row));
                        // @ts-ignore
                        [editState, editState, saveDataType,];
                    } },
                ...{ onBlur: (__VLS_ctx.cancelEdit) },
                value: (__VLS_ctx.editState.value),
                ...{ class: "inline-select" },
                autofocus: true,
            });
            /** @type {__VLS_StyleScopedClasses['inline-select']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "CP",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "FT",
            });
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.lot_id, 'engineer', row.engineer, row));
                    // @ts-ignore
                    [startEdit, editState, cancelEdit,];
                } },
            ...{ class: "editable-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'engineer') {
            (row.engineer);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "inline-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'engineer'))
                            throw 0;
                        return (__VLS_ctx.saveField(row, 'engineer'));
                        // @ts-ignore
                        [editState, editState, saveField,];
                    } },
                ...{ onKeyup: (__VLS_ctx.cancelEdit) },
                ...{ onBlur: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'engineer'))
                            throw 0;
                        return (__VLS_ctx.saveField(row, 'engineer'));
                        // @ts-ignore
                        [cancelEdit, saveField,];
                    } },
                list: "eng-list",
                ...{ class: "inline-input" },
                autofocus: true,
            });
            (__VLS_ctx.editState.value);
            /** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.datalist, __VLS_intrinsics.datalist)({
                id: "eng-list",
            });
            for (const [s] of __VLS_vFor((__VLS_ctx.suggestions.engineer))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option)({
                    key: (s),
                    value: (s),
                });
                // @ts-ignore
                [editState, suggestions,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.osat);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.lot_id, 'package', row.package, row));
                    // @ts-ignore
                    [startEdit,];
                } },
            ...{ class: "editable-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'package') {
            (row.package);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "inline-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'package'))
                            throw 0;
                        return (__VLS_ctx.saveField(row, 'package'));
                        // @ts-ignore
                        [editState, editState, saveField,];
                    } },
                ...{ onKeyup: (__VLS_ctx.cancelEdit) },
                ...{ onBlur: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'package'))
                            throw 0;
                        return (__VLS_ctx.saveField(row, 'package'));
                        // @ts-ignore
                        [cancelEdit, saveField,];
                    } },
                list: "pkg-list",
                ...{ class: "inline-input" },
                autofocus: true,
            });
            (__VLS_ctx.editState.value);
            /** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.datalist, __VLS_intrinsics.datalist)({
                id: "pkg-list",
            });
            for (const [s] of __VLS_vFor((__VLS_ctx.suggestions.package))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option)({
                    key: (s),
                    value: (s),
                });
                // @ts-ignore
                [editState, suggestions,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.lot_id, 'hardware_info', row.hardware_info, row));
                    // @ts-ignore
                    [startEdit,];
                } },
            ...{ class: "editable-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'hardware_info') {
            (row.hardware_info);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "inline-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'hardware_info'))
                            throw 0;
                        return (__VLS_ctx.saveField(row, 'hardware_info'));
                        // @ts-ignore
                        [editState, editState, saveField,];
                    } },
                ...{ onKeyup: (__VLS_ctx.cancelEdit) },
                ...{ onBlur: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.lot_id || __VLS_ctx.editState.field !== 'hardware_info'))
                            throw 0;
                        return (__VLS_ctx.saveField(row, 'hardware_info'));
                        // @ts-ignore
                        [cancelEdit, saveField,];
                    } },
                list: "hw-list",
                ...{ class: "inline-input" },
                autofocus: true,
            });
            (__VLS_ctx.editState.value);
            /** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.datalist, __VLS_intrinsics.datalist)({
                id: "hw-list",
            });
            for (const [s] of __VLS_vFor((__VLS_ctx.suggestions.hardware_info))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option)({
                    key: (s),
                    value: (s),
                });
                // @ts-ignore
                [editState, suggestions,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "src-badge" },
            ...{ class: (row.source_type === 'ftp' ? 'src-ftp' : 'src-data') },
        });
        /** @type {__VLS_StyleScopedClasses['src-badge']} */ ;
        (row.source_type === 'ftp' ? 'OSAT' : 'Data');
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "td-raw" },
        });
        /** @type {__VLS_StyleScopedClasses['td-raw']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && !__VLS_ctx.rows.length))
                        throw 0;
                    return (__VLS_ctx.openRawData(row.earliest_lot_id));
                    // @ts-ignore
                    [openRawData,];
                } },
            ...{ class: "raw-btn" },
            title: "查看原始参数数据",
        });
        /** @type {__VLS_StyleScopedClasses['raw-btn']} */ ;
        // @ts-ignore
        [];
    }
    if (!__VLS_ctx.displayedRows.length && !__VLS_ctx.loading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: "18",
            ...{ class: "td-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "table-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeTab === 'pgm'), }, null, null);
/** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
if (__VLS_ctx.pgmLoading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-mask" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-mask']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
    ...{ class: "pg-table" },
});
/** @type {__VLS_StyleScopedClasses['pg-table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
    ...{ class: "th-no" },
});
/** @type {__VLS_StyleScopedClasses['th-no']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
    ...{ class: "th-ds" },
});
/** @type {__VLS_StyleScopedClasses['th-ds']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
    ...{ class: "th-raw" },
});
/** @type {__VLS_StyleScopedClasses['th-raw']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
    ...{ class: "th-remark" },
});
/** @type {__VLS_StyleScopedClasses['th-remark']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
for (const [row] of __VLS_vFor((__VLS_ctx.pgmRows))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        key: (row.id),
        ...{ class: "data-row" },
    });
    /** @type {__VLS_StyleScopedClasses['data-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "td-no" },
    });
    /** @type {__VLS_StyleScopedClasses['td-no']} */ ;
    (row.index);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "td-product" },
    });
    /** @type {__VLS_StyleScopedClasses['td-product']} */ ;
    (row.product_name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "td-program" },
    });
    /** @type {__VLS_StyleScopedClasses['td-program']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                return (row.parse_status === 'ok' && __VLS_ctx.goPgsParam(row));
                // @ts-ignore
                [activeTab, loading, pgmRows, displayedRows, pgmLoading, goPgsParam,];
            } },
        ...{ class: "prog-link" },
        ...{ class: ({ 'prog-disabled': row.parse_status !== 'ok' }) },
    });
    /** @type {__VLS_StyleScopedClasses['prog-link']} */ ;
    /** @type {__VLS_StyleScopedClasses['prog-disabled']} */ ;
    (row.program_version ?? row.filename);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "ver-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['ver-badge']} */ ;
    (row.pgs_version ?? '?');
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "items-badge ft-badge" },
        title: "FT 参数数量",
    });
    /** @type {__VLS_StyleScopedClasses['items-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['ft-badge']} */ ;
    (row.ft_count ?? 0);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "items-badge qa-count-badge" },
        title: "QA 参数数量",
    });
    /** @type {__VLS_StyleScopedClasses['items-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['qa-count-badge']} */ ;
    (row.qa_count ?? 0);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "changes-tag" },
        ...{ class: (row.changes === '首版' || row.changes === '无变化' ? 'ch-none' : 'ch-has') },
    });
    /** @type {__VLS_StyleScopedClasses['changes-tag']} */ ;
    (row.changes || '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.fmtDate(row.upload_date));
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "parse-badge" },
        ...{ class: (`parse-${row.parse_status}`) },
    });
    /** @type {__VLS_StyleScopedClasses['parse-badge']} */ ;
    ({ ok: '✔ 成功', error: '✘ 失败', pending: '⏳ 等待' }[row.parse_status] ?? row.parse_status);
    if (row.parse_status === 'error') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "parse-err-tip" },
            title: (row.parse_error),
        });
        /** @type {__VLS_StyleScopedClasses['parse-err-tip']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "src-badge src-pgm" },
    });
    /** @type {__VLS_StyleScopedClasses['src-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['src-pgm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "td-ds" },
    });
    /** @type {__VLS_StyleScopedClasses['td-ds']} */ ;
    if (row.datasheet_filename) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ds-row-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['ds-row-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ds-icon-span" },
            title: (row.datasheet_filename),
        });
        /** @type {__VLS_StyleScopedClasses['ds-icon-span']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.datasheet_filename))
                        throw 0;
                    return (__VLS_ctx.downloadRowDatasheet(row));
                    // @ts-ignore
                    [fmtDate, downloadRowDatasheet,];
                } },
            ...{ class: "icon-action-btn" },
            title: "下载 Datasheet",
        });
        /** @type {__VLS_StyleScopedClasses['icon-action-btn']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.datasheet_filename))
                        throw 0;
                    return (__VLS_ctx.deleteRowDatasheet(row));
                    // @ts-ignore
                    [deleteRowDatasheet,];
                } },
            ...{ class: "icon-action-btn delete-icon" },
            title: "删除 Datasheet",
        });
        /** @type {__VLS_StyleScopedClasses['icon-action-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['delete-icon']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ds-row-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['ds-row-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(row.datasheet_filename))
                        throw 0;
                    return (__VLS_ctx.triggerRowDsUpload(row));
                    // @ts-ignore
                    [triggerRowDsUpload,];
                } },
            ...{ class: "icon-action-btn upload-icon" },
            title: "上传 Datasheet",
        });
        /** @type {__VLS_StyleScopedClasses['icon-action-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "td-raw" },
    });
    /** @type {__VLS_StyleScopedClasses['td-raw']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pgm-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['pgm-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.deletePgs(row));
                // @ts-ignore
                [deletePgs,];
            } },
        ...{ class: "raw-btn del-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['raw-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['del-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.downloadPgs(row));
                // @ts-ignore
                [downloadPgs,];
            } },
        ...{ class: "raw-btn download-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['raw-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['download-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.startPgmEdit(row.id, 'remark', row.remark));
                // @ts-ignore
                [startPgmEdit,];
            } },
        ...{ class: "editable-cell remark-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['remark-cell']} */ ;
    if (__VLS_ctx.pgmEditState.id !== row.id || __VLS_ctx.pgmEditState.field !== 'remark') {
        (row.remark);
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: () => { } },
            ...{ class: "inline-edit" },
        });
        /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onKeyup: (...[$event]) => {
                    if (!!(__VLS_ctx.pgmEditState.id !== row.id || __VLS_ctx.pgmEditState.field !== 'remark'))
                        throw 0;
                    return (__VLS_ctx.savePgmField(row, 'remark'));
                    // @ts-ignore
                    [pgmEditState, pgmEditState, savePgmField,];
                } },
            ...{ onKeyup: (__VLS_ctx.cancelPgmEdit) },
            ...{ onBlur: (...[$event]) => {
                    if (!!(__VLS_ctx.pgmEditState.id !== row.id || __VLS_ctx.pgmEditState.field !== 'remark'))
                        throw 0;
                    return (__VLS_ctx.savePgmField(row, 'remark'));
                    // @ts-ignore
                    [savePgmField, cancelPgmEdit,];
                } },
            ...{ class: "inline-input" },
            autofocus: true,
        });
        (__VLS_ctx.pgmEditState.value);
        /** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
    }
    // @ts-ignore
    [pgmEditState,];
}
if (!__VLS_ctx.pgmRows.length && !__VLS_ctx.pgmLoading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: "13",
        ...{ class: "td-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
}
if (__VLS_ctx.compare.show) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.compare.show))
                    throw 0;
                return (__VLS_ctx.compare.show = false);
                // @ts-ignore
                [pgmRows, pgmLoading, compare, compare,];
            } },
        ...{ class: "overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cmp-dialog" },
    });
    /** @type {__VLS_StyleScopedClasses['cmp-dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cmp-header" },
    });
    /** @type {__VLS_StyleScopedClasses['cmp-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.compare.show))
                    throw 0;
                return (__VLS_ctx.compare.show = false);
                // @ts-ignore
                [compare,];
            } },
        ...{ class: "close-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
    if (!__VLS_ctx.compare.data) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cmp-loading" },
        });
        /** @type {__VLS_StyleScopedClasses['cmp-loading']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cmp-body" },
        });
        /** @type {__VLS_StyleScopedClasses['cmp-body']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "version-bar" },
        });
        /** @type {__VLS_StyleScopedClasses['version-bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "version-new" },
        });
        /** @type {__VLS_StyleScopedClasses['version-new']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ver-label new-label" },
        });
        /** @type {__VLS_StyleScopedClasses['ver-label']} */ ;
        /** @type {__VLS_StyleScopedClasses['new-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ver-prog" },
        });
        /** @type {__VLS_StyleScopedClasses['ver-prog']} */ ;
        (__VLS_ctx.compare.data.new?.program);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ver-date" },
        });
        /** @type {__VLS_StyleScopedClasses['ver-date']} */ ;
        (__VLS_ctx.fmtDate(__VLS_ctx.compare.data.new?.test_date));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "version-old" },
        });
        /** @type {__VLS_StyleScopedClasses['version-old']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ver-label old-label" },
        });
        /** @type {__VLS_StyleScopedClasses['ver-label']} */ ;
        /** @type {__VLS_StyleScopedClasses['old-label']} */ ;
        if (__VLS_ctx.compare.data.old) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ver-prog" },
            });
            /** @type {__VLS_StyleScopedClasses['ver-prog']} */ ;
            (__VLS_ctx.compare.data.old?.program);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ver-date" },
            });
            /** @type {__VLS_StyleScopedClasses['ver-date']} */ ;
            (__VLS_ctx.fmtDate(__VLS_ctx.compare.data.old?.test_date));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "no-prev" },
            });
            /** @type {__VLS_StyleScopedClasses['no-prev']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.compare.show))
                        throw 0;
                    if (!!(!__VLS_ctx.compare.data))
                        throw 0;
                    return (__VLS_ctx.compare.binCollapsed = !__VLS_ctx.compare.binCollapsed);
                    // @ts-ignore
                    [fmtDate, fmtDate, compare, compare, compare, compare, compare, compare, compare, compare,];
                } },
            ...{ class: "section-toggle" },
        });
        /** @type {__VLS_StyleScopedClasses['section-toggle']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.compare.binCollapsed ? '▶' : '▼');
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        if (!__VLS_ctx.compare.binCollapsed) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "bin-row" },
            });
            /** @type {__VLS_StyleScopedClasses['bin-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "bin-half" },
            });
            /** @type {__VLS_StyleScopedClasses['bin-half']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "bin-tbl" },
            });
            /** @type {__VLS_StyleScopedClasses['bin-tbl']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [b] of __VLS_vFor((__VLS_ctx.compare.data.bin_new))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (b.bin_number),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.bin_number);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.bin_name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.count);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.percentage != null ? b.percentage.toFixed(2) + '%' : '');
                // @ts-ignore
                [compare, compare, compare,];
            }
            if (!__VLS_ctx.compare.data.bin_new.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "4",
                    ...{ class: "td-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "bin-divider" },
            });
            /** @type {__VLS_StyleScopedClasses['bin-divider']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "bin-half" },
            });
            /** @type {__VLS_StyleScopedClasses['bin-half']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "bin-tbl" },
            });
            /** @type {__VLS_StyleScopedClasses['bin-tbl']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [b] of __VLS_vFor((__VLS_ctx.compare.data.bin_old))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (b.bin_number),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.bin_number);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.bin_name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.count);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.percentage != null ? b.percentage.toFixed(2) + '%' : '');
                // @ts-ignore
                [compare, compare,];
            }
            if (!__VLS_ctx.compare.data.bin_old.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "4",
                    ...{ class: "td-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "legend-row" },
        });
        /** @type {__VLS_StyleScopedClasses['legend-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "leg leg-added" },
        });
        /** @type {__VLS_StyleScopedClasses['leg']} */ ;
        /** @type {__VLS_StyleScopedClasses['leg-added']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "leg leg-removed" },
        });
        /** @type {__VLS_StyleScopedClasses['leg']} */ ;
        /** @type {__VLS_StyleScopedClasses['leg-removed']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "leg leg-loose" },
        });
        /** @type {__VLS_StyleScopedClasses['leg']} */ ;
        /** @type {__VLS_StyleScopedClasses['leg-loose']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "leg leg-tight" },
        });
        /** @type {__VLS_StyleScopedClasses['leg']} */ ;
        /** @type {__VLS_StyleScopedClasses['leg-tight']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "param-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['param-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "param-hdr new-hdr" },
        });
        /** @type {__VLS_StyleScopedClasses['param-hdr']} */ ;
        /** @type {__VLS_StyleScopedClasses['new-hdr']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "param-hdr old-hdr" },
        });
        /** @type {__VLS_StyleScopedClasses['param-hdr']} */ ;
        /** @type {__VLS_StyleScopedClasses['old-hdr']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        for (const [r, i] of __VLS_vFor((__VLS_ctx.compare.data.param_diff))) {
            __VLS_asFunctionalElement(__VLS_intrinsics.template)({
                key: (i),
            });
            if (r.row_type !== 'same') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "param-cell" },
                    ...{ class: (__VLS_ctx.newSideClass(r)) },
                });
                /** @type {__VLS_StyleScopedClasses['param-cell']} */ ;
                if (r.new) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (r.new.item_number);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "iname" },
                    });
                    /** @type {__VLS_StyleScopedClasses['iname']} */ ;
                    (r.new.item_name);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: (__VLS_ctx.limitHl(r, 'lower', 'new')) },
                    });
                    (__VLS_ctx.fmt(r.new.lower_limit));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: (__VLS_ctx.limitHl(r, 'upper', 'new')) },
                    });
                    (__VLS_ctx.fmt(r.new.upper_limit));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (r.new.unit);
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "empty-half" },
                    });
                    /** @type {__VLS_StyleScopedClasses['empty-half']} */ ;
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "param-cell" },
                    ...{ class: (__VLS_ctx.oldSideClass(r)) },
                });
                /** @type {__VLS_StyleScopedClasses['param-cell']} */ ;
                if (r.old) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (r.old.item_number);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "iname" },
                    });
                    /** @type {__VLS_StyleScopedClasses['iname']} */ ;
                    (r.old.item_name);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: (__VLS_ctx.limitHl(r, 'lower', 'old')) },
                    });
                    (__VLS_ctx.fmt(r.old.lower_limit));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: (__VLS_ctx.limitHl(r, 'upper', 'old')) },
                    });
                    (__VLS_ctx.fmt(r.old.upper_limit));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (r.old.unit);
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "empty-half" },
                    });
                    /** @type {__VLS_StyleScopedClasses['empty-half']} */ ;
                }
            }
            // @ts-ignore
            [compare, compare, newSideClass, limitHl, limitHl, limitHl, limitHl, fmt, fmt, fmt, fmt, oldSideClass,];
        }
    }
}
if (__VLS_ctx.pgsUpload.show) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dialog" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dialog-header" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    if (__VLS_ctx.pgsUpload.uploading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "upload-progress" },
        });
        /** @type {__VLS_StyleScopedClasses['upload-progress']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "progress-bar" },
        });
        /** @type {__VLS_StyleScopedClasses['progress-bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "progress-fill" },
        });
        /** @type {__VLS_StyleScopedClasses['progress-fill']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.pgsUpload.total > 1 ? `正在解析 ${__VLS_ctx.pgsUpload.currentName}...` : '解析中，请稍候...');
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "file-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['file-hint']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.pgsUpload.filename);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "file-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['file-hint']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.productName);
        if (__VLS_ctx.pgsUpload.testerChoices.length >= 2) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "field" },
            });
            /** @type {__VLS_StyleScopedClasses['field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (__VLS_ctx.pgsUpload.selectedTester),
                ...{ class: "field-input" },
            });
            /** @type {__VLS_StyleScopedClasses['field-input']} */ ;
            for (const [tester] of __VLS_vFor((__VLS_ctx.pgsUpload.testerChoices))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (tester),
                    value: (tester),
                });
                (tester);
                // @ts-ignore
                [productName, pgsUpload, pgsUpload, pgsUpload, pgsUpload, pgsUpload, pgsUpload, pgsUpload, pgsUpload,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "file-picker-row" },
        });
        /** @type {__VLS_StyleScopedClasses['file-picker-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.triggerUploadDsSelect) },
            ...{ class: "btn btn-action" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['btn-action']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ds-file-name" },
            title: (__VLS_ctx.pgsUpload.datasheetFile?.name),
        });
        /** @type {__VLS_StyleScopedClasses['ds-file-name']} */ ;
        (__VLS_ctx.pgsUpload.datasheetFile?.name || '未选择文件');
        if (__VLS_ctx.pgsUpload.datasheetFile) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.clearUploadDsFile) },
                ...{ class: "btn-clear" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-clear']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (__VLS_ctx.onUploadDsFileChange) },
            ref: "uploadDsInput",
            type: "file",
            accept: ".docx,.doc",
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dialog-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['dialog-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.resetPgsUpload) },
            ...{ class: "btn" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.submitPgs) },
            ...{ class: "btn btn-primary" },
            disabled: (__VLS_ctx.pgsUpload.testerChoices.length >= 2 && !__VLS_ctx.pgsUpload.selectedTester),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    }
}
// @ts-ignore
[pgsUpload, pgsUpload, pgsUpload, pgsUpload, pgsUpload, triggerUploadDsSelect, clearUploadDsFile, onUploadDsFileChange, resetPgsUpload, submitPgs,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
