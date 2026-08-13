import { ref, onMounted, watch, nextTick, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api';
import { fmtDateTz } from '@/utils/dateUtils';
const route = useRoute();
const router = useRouter();
const lotId = ref(Number(route.params.id));
const openBinAnalysis = () => {
    const url = router.resolve(`/lot/${lotId.value}/bin`).href;
    window.open(url, '_blank');
};
const lotInfo = ref(null);
const testItems = ref([]);
const itemCount = ref(0);
const gridApi = ref(null);
function onGridReady(params) {
    gridApi.value = params.api;
}
const options = ref({
    filter_type: 'all',
    data_range: 'final',
    sigma: 3,
    chars_row: 3,
    delta_site: 3,
    mean_limit: 'show',
});
const exporting = ref(false);
const exportProgress = ref(0);
const exportTaskId = ref("");
const defaultColDef = {
    resizable: true,
    sortable: true,
    filter: true,
    minWidth: 80,
};
const columnDefs = computed(() => {
    const baseDefs = [
        {
            headerName: '#',
            field: 'item_number',
            width: 90,
            pinned: 'left',
            checkboxSelection: true,
            headerCheckboxSelection: true,
            filter: true,
            floatingFilter: true,
            suppressHeaderMenuButton: false,
            suppressHeaderFilterButton: false,
            floatingFilterComponentParams: { suppressFilterButton: true }
        },
        {
            headerName: 'Bin',
            field: 'first_fail_bin',
            width: 70,
            pinned: 'left',
            cellStyle: { fontWeight: 'bold', color: '#f5222d' },
            filter: 'agNumberColumnFilter',
            filterParams: {
                filterOptions: ['equals', 'lessThan', 'greaterThan'],
                defaultOption: 'equals',
            },
            floatingFilter: true,
            suppressHeaderMenuButton: false,
            suppressHeaderFilterButton: false,
            floatingFilterComponentParams: { suppressFilterButton: true }
        },
        {
            headerName: 'TestItem',
            field: 'item_name',
            width: 200,
            pinned: 'left',
            cellStyle: { color: '#1890ff', cursor: 'pointer' },
            filter: true,
            floatingFilter: true,
            suppressHeaderMenuButton: false,
            suppressHeaderFilterButton: false,
            floatingFilterComponentParams: { suppressFilterButton: true }
        },
        { headerName: 'L.Limit', field: 'lower_limit', width: 100 },
        { headerName: 'U.Limit', field: 'upper_limit', width: 100 },
        { headerName: 'Units', field: 'unit', width: 80 },
        { headerName: 'Min', field: 'min_val', width: 100 },
        { headerName: 'Max', field: 'max_val', width: 100 },
        { headerName: 'Exec Qty', field: 'exec_qty', width: 90 },
        { headerName: 'Failures', field: 'fail_count', width: 90 },
        {
            headerName: 'Fail Rate',
            field: 'fail_rate',
            width: 90,
            valueFormatter: (p) => p.value ? (p.value * 100).toFixed(3) + '%' : '0%'
        },
        {
            headerName: 'Yield',
            field: 'yield_rate',
            width: 90,
            valueFormatter: (p) => p.value ? (p.value * 100).toFixed(2) + '%' : '-'
        },
        { headerName: 'Mean', field: 'mean', width: 100, valueFormatter: (p) => p.value?.toFixed(4) ?? '-' },
        { headerName: 'Stdev', field: 'stdev', width: 100, valueFormatter: (p) => p.value?.toFixed(4) ?? '-' },
        { headerName: 'CPU', field: 'cpu', width: 90, valueFormatter: (p) => p.value?.toFixed(4) ?? '-' },
        { headerName: 'CPL', field: 'cpl', width: 90, valueFormatter: (p) => p.value?.toFixed(4) ?? '-' },
        {
            headerName: 'CPK',
            field: 'cpk',
            width: 90,
            valueFormatter: (p) => p.value?.toFixed(4) ?? '-',
            cellStyle: (p) => {
                if (p.value === null || p.value === undefined)
                    return {};
                if (p.value < 1.0)
                    return { color: 'red', fontWeight: 'bold' };
                if (p.value < 1.33)
                    return { color: 'orange' };
                return {};
            }
        },
    ];
    if (options.value.mean_limit === 'show') {
        // Find unique sites from testItems
        const siteKeys = new Set();
        testItems.value.forEach(item => {
            Object.keys(item).forEach(key => {
                if (key.startsWith('mean_s')) {
                    siteKeys.add(key);
                }
            });
        });
        const sortedSiteKeys = Array.from(siteKeys).sort((a, b) => {
            const numA = parseInt(a.replace('mean_s', ''));
            const numB = parseInt(b.replace('mean_s', ''));
            return numA - numB;
        });
        sortedSiteKeys.forEach(key => {
            const siteNum = key.replace('mean_s', '');
            baseDefs.push({
                headerName: `Mean_S${siteNum}`,
                field: key,
                width: 110,
                valueFormatter: (p) => p.value?.toFixed(4) ?? '-',
                cellStyle: (params) => {
                    const val = params.value;
                    if (val === null || val === undefined || typeof val !== 'number' || isNaN(val)) {
                        return {};
                    }
                    const validValues = sortedSiteKeys
                        .map(k => params.data?.[k])
                        .filter(v => v !== null && v !== undefined && typeof v === 'number' && !isNaN(v));
                    if (validValues.length < 2)
                        return {};
                    const maxVal = Math.max(...validValues);
                    const minVal = Math.min(...validValues);
                    if (maxVal === minVal)
                        return {};
                    if (Math.abs(val - maxVal) < 1e-9) {
                        return { color: 'red', fontWeight: 'bold' };
                    }
                    if (Math.abs(val - minVal) < 1e-9) {
                        return { color: 'green', fontWeight: 'bold' };
                    }
                    return {};
                }
            });
        });
        // Add the Delta and Percentage columns
        if (sortedSiteKeys.length > 0) {
            baseDefs.push({
                headerName: 'Mean Delta',
                field: 'mean_delta',
                width: 120,
                valueGetter: (params) => {
                    const values = sortedSiteKeys.map(k => params.data[k]).filter(v => v !== null && v !== undefined);
                    if (values.length < 2)
                        return null;
                    return Math.max(...values) - Math.min(...values);
                },
                valueFormatter: (p) => p.value?.toFixed(4) ?? '-',
                cellStyle: (params) => {
                    const delta = params.value;
                    const allSiteMean = params.data.mean;
                    const deltaSitePct = options.value.delta_site / 100;
                    if (delta !== null && allSiteMean !== null && delta > Math.abs(allSiteMean * deltaSitePct)) {
                        return { color: 'red', fontWeight: 'bold' };
                    }
                    return {};
                }
            });
            baseDefs.push({
                headerName: 'Mean_%',
                width: 100,
                valueGetter: (params) => {
                    const delta = params.getValue('mean_delta');
                    const allSiteMean = params.data.mean;
                    if (delta === null || allSiteMean === null || allSiteMean === undefined)
                        return null;
                    if (Math.abs(allSiteMean) < 0.05)
                        return 0;
                    return delta / allSiteMean;
                },
                valueFormatter: (p) => p.value !== null ? (p.value * 100).toFixed(2) + '%' : '-'
            });
        }
    }
    else {
        // If mean_limit is 'hide', add the 4 new columns: LL_new, UL_new, fail_new, yield_new
        baseDefs.push({
            headerName: 'LL_new',
            field: 'll_new',
            width: 100,
            editable: true,
            cellClass: 'editable-cell',
            valueParser: (p) => p.newValue !== '' && p.newValue !== null ? Number(p.newValue) : null,
        }, {
            headerName: 'UL_new',
            field: 'ul_new',
            width: 100,
            editable: true,
            cellClass: 'editable-cell',
            valueParser: (p) => p.newValue !== '' && p.newValue !== null ? Number(p.newValue) : null,
        }, {
            headerName: 'fail_new',
            field: 'fail_new',
            width: 100,
            valueFormatter: (p) => p.value !== null && p.value !== undefined ? p.value : '—',
        }, {
            headerName: 'yield_new',
            field: 'yield_new',
            width: 100,
            valueFormatter: (p) => p.value !== null && p.value !== undefined ? (p.value * 100).toFixed(2) + '%' : '—',
        });
    }
    return baseDefs;
});
const overallYieldNew = ref(null);
const limitFileInput = ref(null);
function triggerExportLimit() {
    const headers = ['#', 'Bin', 'TestItem', 'L.Limit', 'U.Limit', 'Units', 'Min', 'Max', 'Exec Qty', 'Failures', 'Fail Rate', 'Yield', 'Mean', 'll_new', 'ul_new'];
    const csvRows = [headers.join(',')];
    testItems.value.forEach(row => {
        const quote = (val) => {
            const s = val === null || val === undefined ? '' : String(val);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };
        const failRateVal = row.fail_count / row.exec_qty;
        const yieldVal = row.yield_rate;
        const fields = [
            quote(row.item_number),
            quote(row.first_fail_bin),
            quote(row.item_name),
            quote(row.lower_limit),
            quote(row.upper_limit),
            quote(row.unit),
            quote(row.min_val),
            quote(row.max_val),
            quote(row.exec_qty),
            quote(row.fail_count),
            quote(isNaN(failRateVal) ? 0 : failRateVal),
            quote(yieldVal),
            quote(row.mean),
            quote(row.ll_new),
            quote(row.ul_new)
        ];
        csvRows.push(fields.join(','));
    });
    const csvContent = '\ufeff' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Limit_Export_Lot_${lotId.value}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
function triggerImportLimit() {
    if (limitFileInput.value) {
        limitFileInput.value.click();
    }
}
function onLimitFileSelected(event) {
    const file = event.target.files[0];
    if (!file)
        return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const parsed = parseCSV(text);
        parsed.forEach(parts => {
            if (parts.length < 15)
                return;
            const itemName = parts[2];
            const llNewStr = parts[13];
            const ulNewStr = parts[14];
            const llNew = llNewStr !== '' ? Number(llNewStr) : null;
            const ulNew = ulNewStr !== '' ? Number(ulNewStr) : null;
            const row = testItems.value.find(item => item.item_name === itemName);
            if (row) {
                if (!isNaN(Number(llNew)) && llNewStr !== '')
                    row.ll_new = llNew;
                else if (llNewStr === '')
                    row.ll_new = null;
                if (!isNaN(Number(ulNew)) && ulNewStr !== '')
                    row.ul_new = ulNew;
                else if (ulNewStr === '')
                    row.ul_new = null;
            }
        });
        if (gridApi.value) {
            if (typeof gridApi.value.setGridOption === 'function') {
                gridApi.value.setGridOption('rowData', testItems.value);
            }
            else if (typeof gridApi.value.setRowData === 'function') {
                gridApi.value.setRowData(testItems.value);
            }
            else {
                gridApi.value.refreshCells();
            }
        }
        if (gridApi.value) {
            gridApi.value.onFilterChanged();
        }
        saveCustomLimitsToBackend();
    };
    reader.readAsText(file);
    event.target.value = '';
}
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line)
            continue;
        const parts = [];
        let current = '';
        let inQuotes = false;
        for (let char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            }
            else if (char === ',' && !inQuotes) {
                parts.push(current.trim());
                current = '';
            }
            else {
                current += char;
            }
        }
        parts.push(current.trim());
        result.push(parts);
    }
    return result;
}
async function saveCustomLimitsToBackend() {
    const reqData = testItems.value
        .filter(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
        .map(row => ({
        item_name: row.item_name,
        ll_new: row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '' ? Number(row.ll_new) : null,
        ul_new: row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '' ? Number(row.ul_new) : null,
    }));
    try {
        await api.post(`/analysis/lot/${lotId.value}/save_custom_limits`, reqData);
    }
    catch (e) {
        console.error('Failed to save custom limits:', e);
    }
}
const filterEditedOnly = ref(false);
const isExternalFilterPresent = () => {
    return filterEditedOnly.value;
};
const doesExternalFilterPass = (node) => {
    const row = node.data;
    return (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') ||
        (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '');
};
function toggleFilterEdited() {
    filterEditedOnly.value = !filterEditedOnly.value;
    if (gridApi.value) {
        gridApi.value.onFilterChanged();
    }
}
function onCellValueChanged(event) {
    if (event.column.getColId() === 'll_new' || event.column.getColId() === 'ul_new') {
        saveCustomLimitsToBackend();
        if (gridApi.value) {
            gridApi.value.onFilterChanged();
        }
    }
}
async function handleRecalc() {
    const reqData = testItems.value
        .filter(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
        .map(row => ({
        item_name: row.item_name,
        ll_new: row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '' ? Number(row.ll_new) : null,
        ul_new: row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '' ? Number(row.ul_new) : null,
    }));
    try {
        const res = await api.post(`/analysis/lot/${lotId.value}/recalc_all_limits`, reqData, {
            params: {
                filter_type: options.value.filter_type,
                sigma: options.value.sigma,
                data_range: options.value.data_range
            }
        });
        overallYieldNew.value = res.overall_yield_new;
        res.items.forEach((item) => {
            const row = testItems.value.find(r => r.item_name === item.item_name);
            if (row) {
                row.fail_new = item.fail_new;
                row.yield_new = item.yield_new;
            }
        });
        if (testItems.value.length > 0) {
            testItems.value[0].yield_new = res.overall_yield_new;
        }
        if (gridApi.value) {
            if (typeof gridApi.value.setGridOption === 'function') {
                gridApi.value.setGridOption('rowData', testItems.value);
            }
            else if (typeof gridApi.value.setRowData === 'function') {
                gridApi.value.setRowData(testItems.value);
            }
            else {
                gridApi.value.refreshCells();
            }
        }
    }
    catch (e) {
        console.error('Failed to recalculate overall yield:', e);
        alert('计算失败: ' + (e.message || e));
    }
}
async function fetchLotInfo() {
    lotInfo.value = await api.get(`/analysis/lot/${lotId.value}/info`);
}
async function fetchItems() {
    const data = await api.get(`/analysis/lot/${lotId.value}/items_summary`, {
        params: {
            filter_type: options.value.filter_type,
            sigma: options.value.sigma,
            data_range: options.value.data_range
        }
    });
    // Load saved custom limits
    try {
        const savedLimits = await api.get(`/analysis/lot/${lotId.value}/custom_limits`);
        if (savedLimits && savedLimits.length > 0) {
            savedLimits.forEach((lim) => {
                const matched = data.find(item => item.item_name === lim.item_name);
                if (matched) {
                    matched.ll_new = lim.ll_new;
                    matched.ul_new = lim.ul_new;
                }
            });
        }
    }
    catch (e) {
        console.error('Failed to fetch custom limits:', e);
    }
    testItems.value = data;
    itemCount.value = data.length;
    // Auto-calculate yield if custom limits are loaded
    const hasCustom = data.some(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''));
    if (hasCustom) {
        nextTick(() => {
            handleRecalc();
        });
    }
}
async function handleExport() {
    if (exporting.value)
        return;
    let selectedItems = '';
    if (gridApi.value) {
        const selectedNodes = gridApi.value.getSelectedNodes();
        if (selectedNodes.length > 0) {
            selectedItems = selectedNodes.map((node) => node.data.item_number).join(',');
        }
    }
    exporting.value = true;
    exportProgress.value = 0;
    try {
        // 1. ??????
        const startRes = await api.post(`/analysis/lot/${lotId.value}/export_items/start`, null, {
            params: {
                filter_type: options.value.filter_type,
                sigma: options.value.sigma,
                data_range: options.value.data_range,
                chars_row: options.value.chars_row,
                delta_site: options.value.delta_site,
                selected_items: selectedItems
            }
        });
        const taskId = startRes.task_id;
        exportTaskId.value = taskId;
        sessionStorage.setItem(`analysis_export_task_${lotId.value}`, taskId);
        // 2. ????
        const pollInterval = setInterval(async () => {
            try {
                const statusRes = await api.get(`/analysis/export_items/status/${taskId}`);
                const { status, progress, error } = statusRes;
                if (status === 'completed') {
                    clearInterval(pollInterval);
                    exportProgress.value = 100;
                    // 3. 下载文件
                    const downloadRes = await api.get(`/analysis/export_items/download/${taskId}`, {
                        responseType: 'blob'
                    });
                    // api拦截器在responseType==='blob'时返回完整response对象，downloadRes.data才是Blob
                    const blobData = downloadRes.data instanceof Blob ? downloadRes.data : new Blob([downloadRes.data]);
                    const url = window.URL.createObjectURL(blobData);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `LOT_${lotId.value}_Report_${options.value.filter_type}.xlsx`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                    setTimeout(() => {
                        exporting.value = false;
                    }, 1000);
                }
                else if (status === 'failed') {
                    clearInterval(pollInterval);
                    console.error('Export failed:', error);
                    alert('????: ' + error);
                    exporting.value = false;
                }
                else {
                    exportProgress.value = progress;
                }
            }
            catch (err) {
                clearInterval(pollInterval);
                console.error('Polling failed:', err);
                exporting.value = false;
            }
        }, 1000);
    }
    catch (error) {
        console.error('Export failed to start', error);
        alert('??????');
        exporting.value = false;
    }
}
function onCellClicked(params) {
    // 只有 TestItem 列才跳转
    if (params.colDef.field !== 'item_name')
        return;
    const paramName = params.data.item_name;
    if (paramName) {
        const url = router.resolve(`/lot/${lotId.value}/param/${encodeURIComponent(paramName)}`).href;
        window.open(url, '_blank');
    }
}
watch([
    () => options.value.filter_type,
    () => options.value.sigma,
    () => options.value.data_range
], () => {
    fetchItems();
});
function yieldColor(val) {
    if (!val)
        return {};
    if (val < 0.8)
        return { color: 'red' };
    if (val < 0.95)
        return { color: 'orange' };
    return { color: 'green' };
}
function formatDate(d) {
    return fmtDateTz(d) || '-';
}
async function resumeExportTask(taskId) {
    try {
        const statusRes = await api.get(`/analysis/export_items/status/${taskId}`);
        exportProgress.value = statusRes.progress || 0;
        if (statusRes.status === 'processing') {
            exporting.value = true;
            const pollInterval = setInterval(async () => {
                try {
                    const res = await api.get(`/analysis/export_items/status/${taskId}`);
                    exportProgress.value = res.progress || 0;
                    if (res.status === 'completed' || res.status === 'failed') {
                        clearInterval(pollInterval);
                        exporting.value = false;
                    }
                }
                catch {
                    clearInterval(pollInterval);
                    exporting.value = false;
                }
            }, 1000);
        }
    }
    catch {
        exportTaskId.value = '';
    }
}
onMounted(async () => {
    await fetchLotInfo();
    await fetchItems();
    const savedTaskId = sessionStorage.getItem(`analysis_export_task_${lotId.value}`);
    if (savedTaskId) {
        exportTaskId.value = savedTaskId;
        await resumeExportTask(savedTaskId);
    }
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['btn-bin']} */ ;
/** @type {__VLS_StyleScopedClasses['lot-info-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "analysis-view" },
});
/** @type {__VLS_StyleScopedClasses['analysis-view']} */ ;
if (__VLS_ctx.lotInfo) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lot-info-bar" },
    });
    /** @type {__VLS_StyleScopedClasses['lot-info-bar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['info-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.lotInfo.filename);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.lotInfo.program);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.lotInfo.test_machine);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.lotInfo.station_count);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.lotInfo.die_count);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.itemCount);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
        ...{ style: (__VLS_ctx.yieldColor(__VLS_ctx.lotInfo.yield_rate)) },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.lotInfo.yield_rate ? (__VLS_ctx.lotInfo.yield_rate * 100).toFixed(2) + '%' : '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.lotInfo.data_type);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.formatDate(__VLS_ctx.lotInfo.test_date));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.openBinAnalysis) },
        ...{ class: "btn-bin" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-bin']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleExport) },
        ...{ class: "btn-bin" },
        disabled: (__VLS_ctx.exporting),
        ...{ style: (__VLS_ctx.exporting ? {
                background: `linear-gradient(to right, #52c41a ${__VLS_ctx.exportProgress}%, #73d13d ${__VLS_ctx.exportProgress}%)`,
                transition: 'background 0.3s'
            } : {}) },
    });
    /** @type {__VLS_StyleScopedClasses['btn-bin']} */ ;
    if (!__VLS_ctx.exporting) {
    }
    else {
        (__VLS_ctx.exportProgress);
    }
    if (__VLS_ctx.options.mean_limit === 'hide') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.triggerExportLimit) },
            ...{ class: "btn-bin" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['btn-bin']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.triggerImportLimit) },
            ...{ class: "btn-bin" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-bin']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.toggleFilterEdited) },
            ...{ class: "btn-bin" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-bin']} */ ;
        (__VLS_ctx.filterEditedOnly ? '🔍 显示全部' : '🔍 仅看已修改');
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.handleRecalc) },
            ...{ class: "btn-bin" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['btn-bin']} */ ;
        if (__VLS_ctx.overallYieldNew !== null) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ style: {} },
            });
            ((__VLS_ctx.overallYieldNew * 100).toFixed(2));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (__VLS_ctx.onLimitFileSelected) },
            type: "file",
            ref: "limitFileInput",
            ...{ style: {} },
        });
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "main-body" },
});
/** @type {__VLS_StyleScopedClasses['main-body']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "options-panel" },
});
/** @type {__VLS_StyleScopedClasses['options-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "options-title" },
});
/** @type {__VLS_StyleScopedClasses['options-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "option-group" },
});
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    value: (__VLS_ctx.options.filter_type),
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "all",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "robust",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "filter_by_limit",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "filter_by_sigma",
});
if (__VLS_ctx.options.filter_type === 'filter_by_sigma') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "option-group" },
    });
    /** @type {__VLS_StyleScopedClasses['option-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        step: "0.5",
        min: "1",
        max: "6",
    });
    (__VLS_ctx.options.sigma);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "option-group" },
});
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "radio-group row" },
});
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: "final",
});
(__VLS_ctx.options.data_range);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: "original",
});
(__VLS_ctx.options.data_range);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "option-group" },
});
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "radio-group row" },
});
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: (1),
});
(__VLS_ctx.options.chars_row);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: (3),
});
(__VLS_ctx.options.chars_row);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: (5),
});
(__VLS_ctx.options.chars_row);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "option-group" },
});
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "number",
    step: "0.1",
    min: "0",
});
(__VLS_ctx.options.delta_site);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "option-group" },
});
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "radio-group row" },
});
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: "show",
});
(__VLS_ctx.options.mean_limit);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: "hide",
});
(__VLS_ctx.options.mean_limit);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "content-area" },
});
/** @type {__VLS_StyleScopedClasses['content-area']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "table-area" },
});
/** @type {__VLS_StyleScopedClasses['table-area']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.agGridVue | typeof __VLS_components.AgGridVue | typeof __VLS_components['ag-grid-vue']} */
agGridVue;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onGridReady': {} },
    ...{ 'onCellClicked': {} },
    ...{ 'onCellValueChanged': {} },
    ...{ class: "ag-theme-alpine" },
    theme: ('legacy'),
    rowData: (__VLS_ctx.testItems),
    columnDefs: (__VLS_ctx.columnDefs),
    defaultColDef: (__VLS_ctx.defaultColDef),
    rowSelection: "multiple",
    suppressRowClickSelection: (true),
    ...{ style: {} },
    isExternalFilterPresent: (__VLS_ctx.isExternalFilterPresent),
    doesExternalFilterPass: (__VLS_ctx.doesExternalFilterPass),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onGridReady': {} },
    ...{ 'onCellClicked': {} },
    ...{ 'onCellValueChanged': {} },
    ...{ class: "ag-theme-alpine" },
    theme: ('legacy'),
    rowData: (__VLS_ctx.testItems),
    columnDefs: (__VLS_ctx.columnDefs),
    defaultColDef: (__VLS_ctx.defaultColDef),
    rowSelection: "multiple",
    suppressRowClickSelection: (true),
    ...{ style: {} },
    isExternalFilterPresent: (__VLS_ctx.isExternalFilterPresent),
    doesExternalFilterPass: (__VLS_ctx.doesExternalFilterPass),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.gridReady} */
    onGridReady: (__VLS_ctx.onGridReady),
};
const __VLS_7 = {
    /** @type {typeof __VLS_5.cellClicked} */
    onCellClicked: (__VLS_ctx.onCellClicked),
};
const __VLS_8 = {
    /** @type {typeof __VLS_5.cellValueChanged} */
    onCellValueChanged: (__VLS_ctx.onCellValueChanged),
};
/** @type {__VLS_StyleScopedClasses['ag-theme-alpine']} */ ;
var __VLS_3;
var __VLS_4;
// @ts-ignore
[lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, itemCount, yieldColor, formatDate, openBinAnalysis, handleExport, exporting, exporting, exporting, exportProgress, exportProgress, exportProgress, options, options, options, options, options, options, options, options, options, options, options, options, triggerExportLimit, triggerImportLimit, toggleFilterEdited, filterEditedOnly, handleRecalc, overallYieldNew, overallYieldNew, onLimitFileSelected, testItems, columnDefs, defaultColDef, isExternalFilterPresent, doesExternalFilterPass, onGridReady, onCellClicked, onCellValueChanged,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
