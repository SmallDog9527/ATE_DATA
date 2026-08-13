import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/api';
import { fmtDateOnlyTz } from '@/utils/dateUtils';
const router = useRouter();
const listData = ref([]);
const loading = ref(false);
const pgsInput = ref();
const searchQuery = ref('');
// ─── 程序名列宽自适应与拉伸记忆 ───
const programColWidth = ref(130);
// 初始化读取上次记忆的宽度值
const savedWidth = localStorage.getItem('program_col_width');
if (savedWidth) {
    const parsed = parseInt(savedWidth, 10);
    if (!isNaN(parsed) && parsed > 50) {
        programColWidth.value = parsed;
    }
}
const programColStyle = computed(() => ({
    width: `${programColWidth.value}px`,
    minWidth: `${programColWidth.value}px`,
    maxWidth: `${programColWidth.value}px`,
}));
let isResizing = false;
let startX = 0;
let startWidth = 0;
function startResize(e) {
    isResizing = true;
    startX = e.clientX;
    startWidth = programColWidth.value;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'col-resize';
    const handle = e.target;
    handle.classList.add('resizing');
}
function handleResize(e) {
    if (!isResizing)
        return;
    const diffX = e.clientX - startX;
    // 限制最小宽度为 80px
    programColWidth.value = Math.max(80, startWidth + diffX);
}
function stopResize() {
    if (!isResizing)
        return;
    isResizing = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    // 保存到 localStorage
    localStorage.setItem('program_col_width', programColWidth.value.toString());
    document.querySelectorAll('.resize-handle.resizing').forEach(el => {
        el.classList.remove('resizing');
    });
}
const editState = reactive({
    lot_id: 0, field: '', value: '', progRef: null
});
const suggestions = reactive({
    engineer: [], package: [], hardware_info: []
});
const pgsDialog = reactive({
    show: false, file: null, filename: '', productName: '', uploading: false
});
function fmtDate(v) {
    return fmtDateOnlyTz(v);
}
function fmtHours(s) {
    if (s == null)
        return '';
    return (s / 3600).toFixed(2) + ' h';
}
function goToProduct(name) {
    router.push({ name: 'product-programs', params: { productName: name } });
}
function openPgmProgram(productName, prog) {
    router.push({ name: 'product-programs', params: { productName } });
}
function getHigherVersion(pgmProg, dataProg) {
    if (!pgmProg)
        return dataProg || '';
    if (!dataProg)
        return pgmProg || '';
    const extractVersion = (name) => {
        const match = name.match(/_V(\d+(?:\.\d+)*)/i) || name.match(/V(\d+(?:\.\d+)*)/i);
        return match ? match[1] : null;
    };
    const verA = extractVersion(pgmProg);
    const verB = extractVersion(dataProg);
    if (verA && verB) {
        const partsA = verA.split('.').map(Number);
        const partsB = verB.split('.').map(Number);
        const maxLen = Math.max(partsA.length, partsB.length);
        for (let i = 0; i < maxLen; i++) {
            const a = partsA[i] || 0;
            const b = partsB[i] || 0;
            if (a > b)
                return pgmProg;
            if (b > a)
                return dataProg;
        }
    }
    else if (verA) {
        return pgmProg;
    }
    else if (verB) {
        return dataProg;
    }
    return pgmProg.localeCompare(dataProg, undefined, { numeric: true }) >= 0 ? pgmProg : dataProg;
}
function getProgramNameToShow(row, prog) {
    const pgm = prog.pgm_program;
    const currentData = prog.program || '';
    if (!pgm)
        return currentData;
    // Extract versions to compare them cleanly
    const extractVersion = (name) => {
        const match = name.match(/_V(\d+(?:\.\d+)*)/i) || name.match(/V(\d+(?:\.\d+)*)/i);
        return match ? match[1] : null;
    };
    const verPgm = extractVersion(pgm);
    const verData = extractVersion(currentData);
    // If they are exactly identical (or their versions are identical), display the DATA program name
    if (pgm === currentData || (verPgm && verData && verPgm === verData)) {
        return currentData;
    }
    // Otherwise, show the one with the higher version
    return getHigherVersion(pgm, currentData);
}
function startEdit(lotId, field, val, progRef) {
    editState.lot_id = lotId;
    editState.field = field;
    editState.value = val ?? '';
    editState.progRef = progRef;
}
function cancelEdit() {
    editState.lot_id = 0;
    editState.field = '';
    editState.value = '';
    editState.progRef = null;
}
async function _saveExtra(lotId, payload) {
    await api.put(`/programs/lot/${lotId}/extra`, payload);
}
async function saveField(prog, field) {
    if (!editState.field)
        return;
    try {
        await _saveExtra(prog.lot_id, { [field]: editState.value });
        prog[field] = editState.value;
        await fetchSuggestions();
    }
    catch {
        alert('保存失败');
    }
    finally {
        cancelEdit();
    }
}
async function saveUph(prog) {
    const hours = Number(editState.value);
    const seconds = Math.round(hours * 3600);
    try {
        await _saveExtra(prog.lot_id, { ft_touch_down_s: seconds });
        prog.uph_s = seconds;
    }
    catch {
        alert('保存失败');
    }
    finally {
        cancelEdit();
    }
}
async function saveDataType(prog) {
    try {
        await _saveExtra(prog.lot_id, { data_type_override: editState.value });
        prog.data_type = editState.value;
    }
    catch {
        alert('保存失败');
    }
    finally {
        cancelEdit();
    }
}
async function fetchList() {
    loading.value = true;
    try {
        const [dbData, placeholders] = await Promise.all([
            api.get('/programs/list'),
            api.get('/programs/placeholders'),
        ]);
        // 合并：DB 数据 + 占位（不重复）
        const dbNames = new Set(dbData.map((r) => r.product_name));
        const extraRows = placeholders
            .filter((p) => !dbNames.has(p.product_name))
            .map((p, i) => ({
            index: dbData.length + i + 1,
            product_name: p.product_name,
            programs: [],
            avg_touch_down_s: null,
            is_placeholder: true,
        }));
        listData.value = [...dbData, ...extraRows];
    }
    catch (e) {
        console.error(e);
    }
    finally {
        loading.value = false;
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
const filteredListData = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    const source = listData.value;
    const filtered = query
        ? source.filter((row) => {
            const matchProduct = row.product_name?.toLowerCase().includes(query);
            let matchProgram = false;
            if (row.programs && row.programs.length > 0) {
                matchProgram = row.programs.some((prog) => {
                    const pgmName = prog.pgm_program?.toLowerCase() || '';
                    const progName = prog.program?.toLowerCase() || '';
                    return pgmName.includes(query) || progName.includes(query);
                });
            }
            return matchProduct || matchProgram;
        })
        : source;
    return filtered.map((item, idx) => ({
        ...item,
        displayIndex: idx + 1
    }));
});
// ─── PGS 上传（从主页直接上传）───
function triggerPgsUpload() { pgsInput.value?.click(); }
function onPgsSelected(e) {
    const files = e.target.files;
    if (!files?.length)
        return;
    pgsDialog.file = files[0];
    pgsDialog.filename = files[0].name;
    pgsDialog.productName = '';
    pgsDialog.show = true;
    e.target.value = '';
}
async function submitPgs() {
    if (!pgsDialog.file || !pgsDialog.productName)
        return;
    pgsDialog.uploading = true;
    try {
        const form = new FormData();
        form.append('file', pgsDialog.file);
        form.append('product_name', pgsDialog.productName);
        const result = await api.post('/programs/upload_pgs', form);
        pgsDialog.show = false;
        if (result.parse_status === 'ok') {
            alert(`${pgsDialog.filename} 上传并解析成功！版本：${result.program_version ?? '未知'}`);
        }
        else {
            alert(`上传成功，但解析失败：${result.parse_error ?? '未知错误'}`);
        }
        await fetchList();
    }
    catch {
        alert('上传失败');
    }
    finally {
        pgsDialog.uploading = false;
    }
}
onMounted(() => { fetchList(); fetchSuggestions(); });
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-success']} */ ;
/** @type {__VLS_StyleScopedClasses['pg-table']} */ ;
/** @type {__VLS_StyleScopedClasses['pg-table']} */ ;
/** @type {__VLS_StyleScopedClasses['td-product']} */ ;
/** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['remark-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['remark-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['hw-info-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
/** @type {__VLS_StyleScopedClasses['prog-link']} */ ;
/** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-header']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "pgchange-root" },
});
/** @type {__VLS_StyleScopedClasses['pgchange-root']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "toolbar" },
});
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "toolbar-left" },
});
/** @type {__VLS_StyleScopedClasses['toolbar-left']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    value: (__VLS_ctx.searchQuery),
    type: "text",
    placeholder: "按产品名或程序名筛选...",
    ...{ class: "search-input" },
});
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "loading-text" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-text']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "table-scroll" },
});
/** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
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
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
    ...{ class: "th-product" },
});
/** @type {__VLS_StyleScopedClasses['th-product']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
    ...{ class: "th-program" },
    ...{ style: (__VLS_ctx.programColStyle) },
});
/** @type {__VLS_StyleScopedClasses['th-program']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMousedown: (__VLS_ctx.startResize) },
    ...{ class: "resize-handle" },
});
/** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
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
    ...{ class: "th-remark" },
});
/** @type {__VLS_StyleScopedClasses['th-remark']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
for (const [row] of __VLS_vFor((__VLS_ctx.filteredListData))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (row.product_name),
    });
    if (!row.programs || row.programs.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            ...{ class: "data-row placeholder-row" },
        });
        /** @type {__VLS_StyleScopedClasses['data-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['placeholder-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "td-no" },
        });
        /** @type {__VLS_StyleScopedClasses['td-no']} */ ;
        (row.displayIndex);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.goToProduct(row.product_name));
                    // @ts-ignore
                    [searchQuery, loading, programColStyle, startResize, filteredListData, goToProduct,];
                } },
            ...{ class: "td-product" },
        });
        /** @type {__VLS_StyleScopedClasses['td-product']} */ ;
        (row.product_name);
        if (row.is_placeholder) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "placeholder-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['placeholder-badge']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: "12",
            ...{ class: "td-empty-inline" },
        });
        /** @type {__VLS_StyleScopedClasses['td-empty-inline']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            ...{ class: "data-row" },
        });
        /** @type {__VLS_StyleScopedClasses['data-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "td-no" },
        });
        /** @type {__VLS_StyleScopedClasses['td-no']} */ ;
        (row.displayIndex);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.goToProduct(row.product_name));
                    // @ts-ignore
                    [goToProduct,];
                } },
            ...{ class: "td-product" },
        });
        /** @type {__VLS_StyleScopedClasses['td-product']} */ ;
        (row.product_name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.openPgmProgram(row.product_name, row.programs[0]));
                    // @ts-ignore
                    [openPgmProgram,];
                } },
            ...{ class: "td-program" },
            ...{ style: (__VLS_ctx.programColStyle) },
        });
        /** @type {__VLS_StyleScopedClasses['td-program']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "prog-link" },
        });
        /** @type {__VLS_StyleScopedClasses['prog-link']} */ ;
        (__VLS_ctx.getProgramNameToShow(row, row.programs[0]));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.fmtDate(row.programs[0].test_date));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.programs[0].site ?? '');
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.avg_touch_down_s != null ? row.avg_touch_down_s.toFixed(1) : '');
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.programs[0].lot_id, 'uph_s', row.programs[0].uph_s, row.programs[0]));
                    // @ts-ignore
                    [programColStyle, getProgramNameToShow, fmtDate, startEdit,];
                } },
            ...{ class: "editable-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'uph_s') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_ctx.fmtHours(row.programs[0].uph_s));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "inline-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'uph_s'))
                            throw 0;
                        return (__VLS_ctx.saveUph(row.programs[0]));
                        // @ts-ignore
                        [editState, editState, fmtHours, saveUph,];
                    } },
                ...{ onKeyup: (__VLS_ctx.cancelEdit) },
                ...{ onBlur: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'uph_s'))
                            throw 0;
                        return (__VLS_ctx.saveUph(row.programs[0]));
                        // @ts-ignore
                        [saveUph, cancelEdit,];
                    } },
                type: "number",
                step: "0.01",
                ...{ class: "inline-input" },
                autofocus: true,
            });
            (__VLS_ctx.editState.value);
            /** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ style: {} },
            });
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.programs[0].tester);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.programs[0].lot_id, 'data_type', row.programs[0].data_type, row.programs[0]));
                    // @ts-ignore
                    [startEdit, editState,];
                } },
            ...{ class: "editable-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'data_type') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            if (row.programs[0].data_type) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "type-badge" },
                    ...{ class: (row.programs[0].data_type === 'CP' ? 'type-cp' : 'type-ft') },
                });
                /** @type {__VLS_StyleScopedClasses['type-badge']} */ ;
                (row.programs[0].data_type);
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'data_type'))
                            throw 0;
                        return (__VLS_ctx.saveDataType(row.programs[0]));
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
                    if (!!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.programs[0].lot_id, 'engineer', row.programs[0].engineer, row.programs[0]));
                    // @ts-ignore
                    [startEdit, editState, cancelEdit,];
                } },
            ...{ class: "editable-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'engineer') {
            (row.programs[0].engineer);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "inline-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'engineer'))
                            throw 0;
                        return (__VLS_ctx.saveField(row.programs[0], 'engineer'));
                        // @ts-ignore
                        [editState, editState, saveField,];
                    } },
                ...{ onKeyup: (__VLS_ctx.cancelEdit) },
                ...{ onBlur: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'engineer'))
                            throw 0;
                        return (__VLS_ctx.saveField(row.programs[0], 'engineer'));
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
        (row.programs[0].osat);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.programs[0].lot_id, 'package', row.programs[0].package, row.programs[0]));
                    // @ts-ignore
                    [startEdit,];
                } },
            ...{ class: "editable-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'package') {
            (row.programs[0].package);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "inline-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'package'))
                            throw 0;
                        return (__VLS_ctx.saveField(row.programs[0], 'package'));
                        // @ts-ignore
                        [editState, editState, saveField,];
                    } },
                ...{ onKeyup: (__VLS_ctx.cancelEdit) },
                ...{ onBlur: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'package'))
                            throw 0;
                        return (__VLS_ctx.saveField(row.programs[0], 'package'));
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
                    if (!!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.programs[0].lot_id, 'hardware_info', row.programs[0].hardware_info, row.programs[0]));
                    // @ts-ignore
                    [startEdit,];
                } },
            ...{ class: "editable-cell hw-info-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        /** @type {__VLS_StyleScopedClasses['hw-info-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'hardware_info') {
            (row.programs[0].hardware_info);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "inline-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'hardware_info'))
                            throw 0;
                        return (__VLS_ctx.saveField(row.programs[0], 'hardware_info'));
                        // @ts-ignore
                        [editState, editState, saveField,];
                    } },
                ...{ onKeyup: (__VLS_ctx.cancelEdit) },
                ...{ onBlur: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'hardware_info'))
                            throw 0;
                        return (__VLS_ctx.saveField(row.programs[0], 'hardware_info'));
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!row.programs || row.programs.length === 0))
                        throw 0;
                    return (__VLS_ctx.startEdit(row.programs[0].lot_id, 'remark', row.programs[0].remark, row.programs[0]));
                    // @ts-ignore
                    [startEdit,];
                } },
            ...{ class: "editable-cell remark-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
        /** @type {__VLS_StyleScopedClasses['remark-cell']} */ ;
        if (__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'remark') {
            (row.programs[0].remark);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "inline-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['inline-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'remark'))
                            throw 0;
                        return (__VLS_ctx.saveField(row.programs[0], 'remark'));
                        // @ts-ignore
                        [editState, editState, saveField,];
                    } },
                ...{ onKeyup: (__VLS_ctx.cancelEdit) },
                ...{ onBlur: (...[$event]) => {
                        if (!!(!row.programs || row.programs.length === 0))
                            throw 0;
                        if (!!(__VLS_ctx.editState.lot_id !== row.programs[0].lot_id || __VLS_ctx.editState.field !== 'remark'))
                            throw 0;
                        return (__VLS_ctx.saveField(row.programs[0], 'remark'));
                        // @ts-ignore
                        [cancelEdit, saveField,];
                    } },
                ...{ class: "inline-input" },
                autofocus: true,
            });
            (__VLS_ctx.editState.value);
            /** @type {__VLS_StyleScopedClasses['inline-input']} */ ;
        }
    }
    // @ts-ignore
    [editState,];
}
if (!__VLS_ctx.filteredListData.length && !__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: "14",
        ...{ class: "td-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
    (__VLS_ctx.searchQuery ? '未找到匹配的数据' : '暂无数据，请点击 Update 加载');
}
if (__VLS_ctx.pgsDialog.show) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.pgsDialog.show))
                    throw 0;
                return (__VLS_ctx.pgsDialog.show = false);
                // @ts-ignore
                [searchQuery, loading, filteredListData, pgsDialog, pgsDialog,];
            } },
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.pgsDialog.show))
                    throw 0;
                return (__VLS_ctx.pgsDialog.show = false);
                // @ts-ignore
                [pgsDialog,];
            } },
        ...{ class: "close-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "file-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['file-hint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.pgsDialog.filename);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (__VLS_ctx.submitPgs) },
        placeholder: "请输入产品名",
        ...{ class: "field-input" },
    });
    (__VLS_ctx.pgsDialog.productName);
    /** @type {__VLS_StyleScopedClasses['field-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dialog-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.pgsDialog.show))
                    throw 0;
                return (__VLS_ctx.pgsDialog.show = false);
                // @ts-ignore
                [pgsDialog, pgsDialog, pgsDialog, submitPgs,];
            } },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.submitPgs) },
        ...{ class: "btn btn-primary" },
        disabled: (!__VLS_ctx.pgsDialog.productName || __VLS_ctx.pgsDialog.uploading),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.pgsDialog.uploading ? '上传中...' : '确认上传');
}
// @ts-ignore
[pgsDialog, pgsDialog, pgsDialog, submitPgs,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
