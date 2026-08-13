import { ref, computed, onMounted, watch, defineComponent, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api';
const route = useRoute();
const router = useRouter();
const lotIdsStr = route.query.lot_ids;
const openMultiBin = () => {
    const url = router.resolve(`/multi-bin?lot_ids=${lotIdsStr}`).href;
    window.open(url, '_blank');
};
const lots = ref([]);
const params = ref([]);
const lotDetails = ref([]);
const loading = ref(true);
const gridApi = ref(null);
const lotDisplayNames = ref({});
const renameDialog = ref({
    visible: false,
    lotId: '',
    name: '',
});
const options = ref({
    filter_type: 'all',
    sigma: 3,
    char_mode: 'lot',
    chars_row: 3,
    single_lot_name: 'all_lot',
    mode: 'lot',
    delta_site: 3,
    mean_limit: 'show',
});
const exporting = ref(false);
const exportProgress = ref(0);
const LOT_COLORS = ['#4dabf7', '#ff6b6b', '#69db7c', '#ffd43b', '#e599f7', '#ffa94d', '#74c0fc', '#a9e34b'];
function fmtNum(val) {
    return val === null || val === undefined || Number.isNaN(Number(val)) ? '-' : Number(val).toFixed(4);
}
function defaultLotDisplayName(lot) {
    if (lot?.lot_id && lot?.wafer_id)
        return `${lot.lot_id}-${lot.wafer_id}`;
    return lot?.wafer_id || lot?.lot_id || lot?.filename || `LOT ${lot?.id ?? ''}`;
}
function getLotDisplayName(lot) {
    return lotDisplayNames.value[String(lot.id)] || defaultLotDisplayName(lot);
}
function ensureLotDisplayNames() {
    lots.value.forEach((lot) => {
        const key = String(lot.id);
        if (!lotDisplayNames.value[key]) {
            lotDisplayNames.value[key] = defaultLotDisplayName(lot);
        }
    });
}
function openRenameDialog(lot) {
    renameDialog.value = {
        visible: true,
        lotId: String(lot.id),
        name: getLotDisplayName(lot),
    };
}
function confirmRenameDialog() {
    const lotId = renameDialog.value.lotId;
    if (!lotId)
        return;
    const trimmed = renameDialog.value.name.trim();
    if (!trimmed)
        return;
    lotDisplayNames.value = {
        ...lotDisplayNames.value,
        [lotId]: trimmed,
    };
    closeRenameDialog();
    gridApi.value?.refreshHeader?.();
}
function closeRenameDialog() {
    renameDialog.value = {
        visible: false,
        lotId: '',
        name: '',
    };
}
function openRenameDialogById(lotId) {
    const lot = lots.value.find((item) => String(item.id) === lotId);
    if (lot)
        openRenameDialog(lot);
}
const LotHeaderGroup = defineComponent({
    props: {
        params: { type: Object, required: true },
    },
    setup(props) {
        return () => h('span', {
            class: 'lot-header-label',
            title: 'Double click to rename',
            onDblclick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                const params = props.params;
                params.openRename?.(params.lotId);
            },
        }, props.params.displayName);
    },
});
function getLotMeans(row) {
    return lots.value
        .map(lot => row.lots?.[String(lot.id)]?.mean)
        .filter((val) => val !== null && val !== undefined && !Number.isNaN(Number(val)))
        .map((val) => Number(val));
}
// 转换数据为 ag-grid 格式 (合并后的统计数据)
const gridData = computed(() => {
    return params.value.map(p => ({
        item_number: p.item_number,
        item_name: p.item_name,
        unit: p.unit,
        lower_limit: p.lower_limit,
        upper_limit: p.upper_limit,
        lots: p.lots || {},
        ...(p.overall_stats || {})
    }));
});
const totalDieCount = computed(() => {
    if (lotDetails.value.length) {
        return lotDetails.value.reduce((sum, lot) => sum + (lot.die_count || 0), 0);
    }
    return 0;
});
const totalPassCount = computed(() => {
    if (lotDetails.value.length) {
        return lotDetails.value.reduce((sum, lot) => sum + (lot.pass_count || 0), 0);
    }
    return 0;
});
const averageYield = computed(() => {
    if (lotDetails.value.length) {
        const totalPass = totalPassCount.value;
        const totalDie = totalDieCount.value;
        return totalDie > 0 ? totalPass / totalDie : 0;
    }
    return 0;
});
const defaultColDef = {
    resizable: true,
    sortable: true,
    filter: true,
    minWidth: 80,
};
const floatingFilterCol = {
    filter: true,
    floatingFilter: true,
    suppressMenu: false,
    suppressHeaderMenuButton: false,
    suppressHeaderFilterButton: false,
    floatingFilterComponentParams: { suppressFilterButton: true },
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
            suppressMenu: false,
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
            suppressMenu: false,
            suppressHeaderMenuButton: false,
            suppressHeaderFilterButton: false,
            floatingFilterComponentParams: { suppressFilterButton: true }
        },
        { headerName: 'L.Limit', field: 'lower_limit', width: 100, ...floatingFilterCol },
        { headerName: 'U.Limit', field: 'upper_limit', width: 100, ...floatingFilterCol },
        { headerName: 'Units', field: 'unit', width: 80, ...floatingFilterCol },
        { headerName: 'Min', field: 'min_val', width: 100, valueFormatter: (p) => fmtNum(p.value), ...floatingFilterCol },
        { headerName: 'Max', field: 'max_val', width: 100, valueFormatter: (p) => fmtNum(p.value), ...floatingFilterCol },
        { headerName: 'Exec Qty', field: 'exec_qty', width: 90 },
        { headerName: 'Failures', field: 'fail_count', width: 90 },
        {
            headerName: 'Fail Rate',
            field: 'fail_rate',
            width: 90,
            valueFormatter: (p) => {
                const val = p.data.fail_count / p.data.exec_qty;
                return isNaN(val) ? '0%' : (val * 100).toFixed(3) + '%';
            }
        },
        {
            headerName: 'Yield',
            field: 'yield_rate',
            width: 90,
            valueFormatter: (p) => p.value ? (p.value * 100).toFixed(2) + '%' : '-'
        },
    ];
    if (options.value.mode === 'lot') {
        baseDefs.push(...lots.value.map((lot, idx) => ({
            headerName: getLotDisplayName(lot),
            groupId: `lot_${lot.id}`,
            headerGroupComponent: LotHeaderGroup,
            headerGroupComponentParams: {
                lotId: String(lot.id),
                openRename: openRenameDialogById,
            },
            marryChildren: true,
            headerClass: 'lot-stat-header',
            children: [
                {
                    headerName: 'Mean',
                    width: 100,
                    valueGetter: (p) => p.data.lots?.[String(lot.id)]?.mean,
                    valueFormatter: (p) => fmtNum(p.value),
                    cellStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], fontWeight: 600 }
                },
                {
                    headerName: 'Stdev',
                    width: 100,
                    valueGetter: (p) => p.data.lots?.[String(lot.id)]?.stdev,
                    valueFormatter: (p) => fmtNum(p.value),
                    cellStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], fontWeight: 600 }
                },
            ]
        })));
        baseDefs.push({
            headerName: 'Mean Delta',
            field: 'mean_delta',
            width: 120,
            valueGetter: (p) => {
                const values = getLotMeans(p.data);
                if (values.length < 2)
                    return null;
                return Math.max(...values) - Math.min(...values);
            },
            valueFormatter: (p) => fmtNum(p.value),
            cellStyle: (p) => {
                const delta = p.value;
                const allLotMean = p.data.mean;
                const threshold = Math.abs((allLotMean || 0) * (options.value.delta_site / 100));
                if (delta !== null && delta !== undefined && allLotMean !== null && allLotMean !== undefined && delta > threshold) {
                    return { color: 'red', fontWeight: 'bold' };
                }
                return {};
            }
        }, {
            headerName: 'Mean_%',
            width: 100,
            valueGetter: (p) => {
                const values = getLotMeans(p.data);
                if (values.length < 2 || p.data.mean === null || p.data.mean === undefined)
                    return null;
                if (Math.abs(p.data.mean) < 0.05)
                    return 0;
                return (Math.max(...values) - Math.min(...values)) / p.data.mean;
            },
            valueFormatter: (p) => p.value !== null && p.value !== undefined ? (p.value * 100).toFixed(2) + '%' : '-',
        });
    }
    else {
        if (options.value.mean_limit === 'show') {
            baseDefs.push({ headerName: 'Mean', field: 'mean', width: 100, valueFormatter: (p) => fmtNum(p.value) }, { headerName: 'Stdev', field: 'stdev', width: 100, valueFormatter: (p) => fmtNum(p.value) });
        }
        else {
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
    }
    baseDefs.push({
        headerName: 'CPK',
        field: 'cpk',
        width: 90,
        valueFormatter: (p) => fmtNum(p.value),
        cellStyle: (p) => {
            if (p.value === null || p.value === undefined)
                return {};
            if (p.value < 1.0)
                return { color: 'red', fontWeight: 'bold' };
            if (p.value < 1.33)
                return { color: 'orange' };
            return {};
        }
    });
    return baseDefs;
});
function onGridReady(params) {
    gridApi.value = params.api;
}
async function fetchData() {
    loading.value = true;
    try {
        const data = await api.get('/analysis/multi/items', {
            params: {
                lot_ids: lotIdsStr,
                filter_type: options.value.filter_type,
                sigma: options.value.sigma,
                data_range: 'final'
            }
        });
        lots.value = data.lots || [];
        ensureLotDisplayNames();
        const itemsData = data.params || [];
        // Load saved custom limits
        try {
            const savedLimits = await api.get(`/analysis/multi_lot/custom_limits`, {
                params: { lot_ids: lotIdsStr }
            });
            if (savedLimits && savedLimits.length > 0) {
                savedLimits.forEach((lim) => {
                    const matched = itemsData.find((item) => item.item_name === lim.item_name);
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
        params.value = itemsData;
        // Auto-calculate yield if custom limits are loaded
        const hasCustom = itemsData.some((row) => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''));
        if (hasCustom) {
            nextTick(() => {
                handleRecalc();
            });
        }
        // 首次加载或LOT变化时获取LOT详细信息用于汇总
        if (!lotDetails.value.length && lots.value.length) {
            const details = await Promise.all(lots.value.map(l => api.get(`/analysis/lot/${l.id}/info`)));
            lotDetails.value = details;
        }
    }
    catch (err) {
        console.error('Fetch failed:', err);
        alert('获取数据失败: ' + (err.response?.data?.detail || err.message));
    }
    finally {
        loading.value = false;
    }
}
// 监听选项变化，自动刷新
watch([
    () => options.value.filter_type,
    () => options.value.sigma
], () => {
    fetchData();
});
watch(() => options.value.char_mode, (mode) => {
    if (mode === 'lot') {
        options.value.chars_row = 1;
    }
}, { immediate: true });
// localStorage 持久化 key（按 lotIds 区分，避免不同页面互相干扰）
const EXPORT_STORAGE_KEY = `export_task_multi_${lotIdsStr}`;
/**
 * 启动轮询。taskId 和 fileName 会先写入 localStorage，
 * 页面刷新后 onMounted 可自动恢复。
 */
function startPolling(taskId, fileName) {
    exporting.value = true;
    // 持久化到 localStorage，刷新后可恢复
    localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify({ taskId, fileName, progress: exportProgress.value }));
    const pollInterval = setInterval(async () => {
        try {
            const statusRes = await api.get(`/analysis/export_items/status/${taskId}`);
            const { status, progress, error } = statusRes;
            if (status === 'completed') {
                clearInterval(pollInterval);
                exportProgress.value = 100;
                localStorage.removeItem(EXPORT_STORAGE_KEY);
                // 下载独立 try/catch，失败时明确提示而不是静默吞掉
                try {
                    const downloadRes = await api.get(`/analysis/export_items/download/${taskId}`, {
                        responseType: 'blob'
                    });
                    console.log('[Export] downloadRes:', downloadRes);
                    console.log('[Export] downloadRes.data:', downloadRes.data);
                    console.log('[Export] content-type:', downloadRes.headers?.['content-type']);
                    // api 拦截器在 responseType==='blob' 时返回完整 response 对象
                    // downloadRes.data 才是真正的 Blob
                    const blob = downloadRes.data instanceof Blob
                        ? downloadRes.data
                        : new Blob([downloadRes.data]);
                    // 若服务端返回 JSON 错误（被包成 Blob），content-type 会是 application/json
                    const contentType = downloadRes.headers?.['content-type'] ?? '';
                    if (contentType.includes('application/json')) {
                        // 读取错误信息
                        const text = await blob.text();
                        console.error('[Export] server returned JSON error:', text);
                        alert('下载失败（服务端错误）：' + text);
                        exporting.value = false;
                        return;
                    }
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', fileName);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                    setTimeout(() => { exporting.value = false; }, 1000);
                }
                catch (downloadErr) {
                    console.error('[Export] download request failed:', downloadErr);
                    alert('文件下载失败，请打开浏览器控制台查看详细错误');
                    exporting.value = false;
                }
            }
            else if (status === 'failed') {
                clearInterval(pollInterval);
                localStorage.removeItem(EXPORT_STORAGE_KEY);
                alert('导出失败: ' + error);
                exporting.value = false;
            }
            else {
                // 更新进度，同步写 localStorage
                exportProgress.value = progress ?? exportProgress.value;
                localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify({ taskId, fileName, progress: exportProgress.value }));
            }
        }
        catch (pollErr) {
            // 轮询请求本身出错（网络断开等）
            console.error('[Export] poll status failed:', pollErr);
            clearInterval(pollInterval);
            exporting.value = false;
        }
    }, 1000);
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
    exportProgress.value = 0;
    try {
        const startRes = await api.post('/analysis/multi/export_items/start', null, {
            params: {
                lot_ids: lotIdsStr,
                filter_type: options.value.filter_type,
                sigma: options.value.sigma,
                data_range: 'final',
                chars_row: options.value.char_mode === 'lot' ? 1 : options.value.chars_row,
                char_mode: options.value.char_mode,
                selected_items: selectedItems,
                single_lot_name: options.value.single_lot_name,
                mode: options.value.mode,
                delta_site: options.value.delta_site,
                lot_display_names: JSON.stringify(lotDisplayNames.value),
            }
        });
        const taskId = startRes.task_id;
        const fileName = `${options.value.single_lot_name}_Report.xlsx`;
        startPolling(taskId, fileName);
    }
    catch (error) {
        alert('启动导出失败');
        exporting.value = false;
    }
}
/** 页面加载时，检查是否有未完成的导出任务，若有则自动恢复 */
function resumeExportIfPending() {
    const raw = localStorage.getItem(EXPORT_STORAGE_KEY);
    if (!raw)
        return;
    try {
        const { taskId, fileName, progress } = JSON.parse(raw);
        if (!taskId)
            return;
        exportProgress.value = progress ?? 0;
        startPolling(taskId, fileName);
    }
    catch {
        localStorage.removeItem(EXPORT_STORAGE_KEY);
    }
}
function onCellClicked(params) {
    if (params.colDef.field === 'item_number') {
        const target = params.event.target;
        if (target && !target.closest('.ag-checkbox')) {
            params.node.setSelected(!params.node.isSelected());
        }
        return;
    }
    // 只有 TestItem 列才跳转
    if (params.colDef.field !== 'item_name')
        return;
    const paramName = params.data.item_name;
    if (paramName) {
        const url = router.resolve({
            path: '/multi-param',
            query: {
                lot_ids: lotIdsStr,
                param_name: paramName,
                mode: options.value.mode,
                single_lot_name: options.value.single_lot_name,
                lot_display_names: JSON.stringify(lotDisplayNames.value),
            }
        }).href;
        window.open(url, '_blank');
    }
}
function onColumnHeaderClicked(params) {
    if (options.value.mode !== 'lot')
        return;
    if (params.event?.detail !== 2)
        return;
    const parentGroup = params.column?.getParent?.();
    const groupId = params.columnGroup?.getGroupId?.() || params.columnGroup?.groupId || parentGroup?.getGroupId?.() || parentGroup?.groupId;
    if (!groupId || !String(groupId).startsWith('lot_'))
        return;
    const lotId = String(groupId).replace('lot_', '');
    const lot = lots.value.find((item) => String(item.id) === lotId);
    if (lot)
        openRenameDialog(lot);
}
function yieldColor(val) {
    if (!val)
        return {};
    if (val < 0.8)
        return { color: 'red' };
    if (val < 0.95)
        return { color: 'orange' };
    return { color: 'green' };
}
const overallYieldNew = ref(null);
const limitFileInput = ref(null);
function triggerExportLimit() {
    const headers = ['#', 'Bin', 'TestItem', 'L.Limit', 'U.Limit', 'Units', 'Min', 'Max', 'Exec Qty', 'Failures', 'Fail Rate', 'Yield', 'Mean', 'll_new', 'ul_new'];
    const csvRows = [headers.join(',')];
    params.value.forEach(row => {
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
    link.setAttribute('download', `Limit_Export_MultiLot_${lotIdsStr}.csv`);
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
            const row = params.value.find(item => item.item_name === itemName);
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
                gridApi.value.setGridOption('rowData', params.value);
            }
            else if (typeof gridApi.value.setRowData === 'function') {
                gridApi.value.setRowData(params.value);
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
    const reqData = params.value
        .filter(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
        .map(row => ({
        item_name: row.item_name,
        ll_new: row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '' ? Number(row.ll_new) : null,
        ul_new: row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '' ? Number(row.ul_new) : null,
    }));
    try {
        await api.post(`/analysis/multi_lot/save_custom_limits`, reqData, {
            params: { lot_ids: lotIdsStr }
        });
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
    const reqData = params.value
        .filter(row => (row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '') || (row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== ''))
        .map(row => ({
        item_name: row.item_name,
        ll_new: row.ll_new !== null && row.ll_new !== undefined && row.ll_new !== '' ? Number(row.ll_new) : null,
        ul_new: row.ul_new !== null && row.ul_new !== undefined && row.ul_new !== '' ? Number(row.ul_new) : null,
    }));
    try {
        const res = await api.post(`/analysis/multi_lot/recalc_all_limits`, reqData, {
            params: {
                lot_ids: lotIdsStr,
                filter_type: options.value.filter_type,
                sigma: options.value.sigma,
                data_range: 'final'
            }
        });
        overallYieldNew.value = res.overall_yield_new;
        res.items.forEach((item) => {
            const row = params.value.find(r => r.item_name === item.item_name);
            if (row) {
                row.fail_new = item.fail_new;
                row.yield_new = item.yield_new;
            }
        });
        if (params.value.length > 0) {
            params.value[0].yield_new = res.overall_yield_new;
        }
        if (gridApi.value) {
            if (typeof gridApi.value.setGridOption === 'function') {
                gridApi.value.setGridOption('rowData', params.value);
            }
            else if (typeof gridApi.value.setRowData === 'function') {
                gridApi.value.setRowData(params.value);
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
onMounted(() => {
    fetchData();
    resumeExportIfPending();
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['name-input']} */ ;
/** @type {__VLS_StyleScopedClasses['name-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
/** @type {__VLS_StyleScopedClasses['option-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['rename-input']} */ ;
/** @type {__VLS_StyleScopedClasses['rename-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['rename-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "multi-analysis-view" },
});
/** @type {__VLS_StyleScopedClasses['multi-analysis-view']} */ ;
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
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "editable-name" },
});
/** @type {__VLS_StyleScopedClasses['editable-name']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ class: "name-input" },
    placeholder: "all_lot",
});
(__VLS_ctx.options.single_lot_name);
/** @type {__VLS_StyleScopedClasses['name-input']} */ ;
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
(__VLS_ctx.lots.length);
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
(__VLS_ctx.params.length);
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
(__VLS_ctx.totalDieCount);
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
(__VLS_ctx.totalPassCount);
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
    ...{ style: (__VLS_ctx.yieldColor(__VLS_ctx.averageYield)) },
});
/** @type {__VLS_StyleScopedClasses['value']} */ ;
(__VLS_ctx.averageYield ? (__VLS_ctx.averageYield * 100).toFixed(2) + '%' : '-');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "info-item-actions" },
    ...{ style: {} },
});
/** @type {__VLS_StyleScopedClasses['info-item-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.openMultiBin) },
    ...{ class: "btn-export" },
});
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleExport) },
    ...{ class: "btn-export" },
    disabled: (__VLS_ctx.exporting),
    ...{ style: (__VLS_ctx.exporting ? {
            background: `linear-gradient(to right, #52c41a ${__VLS_ctx.exportProgress}%, #73d13d ${__VLS_ctx.exportProgress}%)`,
            transition: 'background 0.3s'
        } : {}) },
});
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
if (!__VLS_ctx.exporting) {
}
else {
    (__VLS_ctx.exportProgress);
}
if (__VLS_ctx.options.mode === 'single' && __VLS_ctx.options.mean_limit === 'hide') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.triggerExportLimit) },
        ...{ class: "btn-export" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.triggerImportLimit) },
        ...{ class: "btn-export" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.toggleFilterEdited) },
        ...{ class: "btn-export" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
    (__VLS_ctx.filterEditedOnly ? '🔍 显示全部' : '🔍 仅看已修改');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleRecalc) },
        ...{ class: "btn-export" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
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
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "radio-group" },
});
/** @type {__VLS_StyleScopedClasses['radio-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: "all",
});
(__VLS_ctx.options.filter_type);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: "filter_by_limit",
});
(__VLS_ctx.options.filter_type);
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
    value: "lot",
});
(__VLS_ctx.options.char_mode);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: "single",
});
(__VLS_ctx.options.char_mode);
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
    disabled: (__VLS_ctx.options.char_mode === 'lot'),
});
(__VLS_ctx.options.chars_row);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: (3),
    disabled: (__VLS_ctx.options.char_mode === 'lot'),
});
(__VLS_ctx.options.chars_row);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: (5),
    disabled: (__VLS_ctx.options.char_mode === 'lot'),
});
(__VLS_ctx.options.chars_row);
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
    value: "lot",
});
(__VLS_ctx.options.mode);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "radio",
    value: "single",
});
(__VLS_ctx.options.mode);
if (__VLS_ctx.options.mode === 'lot') {
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
}
if (__VLS_ctx.options.mode === 'single') {
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
}
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
    ...{ 'onColumnHeaderClicked': {} },
    ...{ 'onCellValueChanged': {} },
    ...{ class: "ag-theme-alpine" },
    rowData: (__VLS_ctx.gridData),
    columnDefs: (__VLS_ctx.columnDefs),
    defaultColDef: (__VLS_ctx.defaultColDef),
    components: ({ LotHeaderGroup: __VLS_ctx.LotHeaderGroup }),
    rowSelection: "multiple",
    suppressRowClickSelection: (true),
    ...{ style: {} },
    isExternalFilterPresent: (__VLS_ctx.isExternalFilterPresent),
    doesExternalFilterPass: (__VLS_ctx.doesExternalFilterPass),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onGridReady': {} },
    ...{ 'onCellClicked': {} },
    ...{ 'onColumnHeaderClicked': {} },
    ...{ 'onCellValueChanged': {} },
    ...{ class: "ag-theme-alpine" },
    rowData: (__VLS_ctx.gridData),
    columnDefs: (__VLS_ctx.columnDefs),
    defaultColDef: (__VLS_ctx.defaultColDef),
    components: ({ LotHeaderGroup: __VLS_ctx.LotHeaderGroup }),
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
    /** @type {typeof __VLS_5.columnHeaderClicked} */
    onColumnHeaderClicked: (__VLS_ctx.onColumnHeaderClicked),
};
const __VLS_9 = {
    /** @type {typeof __VLS_5.cellValueChanged} */
    onCellValueChanged: (__VLS_ctx.onCellValueChanged),
};
/** @type {__VLS_StyleScopedClasses['ag-theme-alpine']} */ ;
var __VLS_3;
var __VLS_4;
if (__VLS_ctx.loading && !__VLS_ctx.gridData.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-overlay']} */ ;
}
if (__VLS_ctx.renameDialog.visible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeRenameDialog) },
        ...{ class: "rename-dialog-mask" },
    });
    /** @type {__VLS_StyleScopedClasses['rename-dialog-mask']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "rename-dialog" },
    });
    /** @type {__VLS_StyleScopedClasses['rename-dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "rename-title" },
    });
    /** @type {__VLS_StyleScopedClasses['rename-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeydown: (__VLS_ctx.confirmRenameDialog) },
        ...{ onKeydown: (__VLS_ctx.closeRenameDialog) },
        ...{ class: "rename-input" },
    });
    (__VLS_ctx.renameDialog.name);
    /** @type {__VLS_StyleScopedClasses['rename-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "rename-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['rename-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeRenameDialog) },
        ...{ class: "rename-btn secondary" },
    });
    /** @type {__VLS_StyleScopedClasses['rename-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.confirmRenameDialog) },
        ...{ class: "rename-btn primary" },
    });
    /** @type {__VLS_StyleScopedClasses['rename-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
}
// @ts-ignore
[options, options, options, options, options, options, options, options, options, options, options, options, options, options, options, options, options, options, options, options, lots, params, totalDieCount, totalPassCount, yieldColor, averageYield, averageYield, averageYield, openMultiBin, handleExport, exporting, exporting, exporting, exportProgress, exportProgress, exportProgress, triggerExportLimit, triggerImportLimit, toggleFilterEdited, filterEditedOnly, handleRecalc, overallYieldNew, overallYieldNew, onLimitFileSelected, gridData, gridData, columnDefs, defaultColDef, LotHeaderGroup, isExternalFilterPresent, doesExternalFilterPass, onGridReady, onCellClicked, onColumnHeaderClicked, onCellValueChanged, loading, renameDialog, renameDialog, closeRenameDialog, closeRenameDialog, closeRenameDialog, confirmRenameDialog, confirmRenameDialog,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
