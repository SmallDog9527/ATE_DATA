import { ref, computed, watch, onMounted, onUnmounted, nextTick, defineComponent, h } from 'vue';
import api from '@/api';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTimezoneStore } from '@/stores/timezone';
const authStore = useAuthStore();
const timezoneStore = useTimezoneStore();
const lots = ref([]);
const backendPage = ref(1);
const backendPageSize = ref(200);
const backendTotal = ref(0);
const selectedRows = ref([]);
const showUpload = ref(false);
const uploading = ref(false);
const uploadFiles = ref([]);
const fileInput = ref();
const gridApi = ref();
const filters = ref({ product_name: '', lot_id: '', status: 'processed' });
const backendGridFilters = ref({});
const allOsatNames = ref([]);
const displayEditInput = ref();
const displayEditDialog = ref({
    visible: false,
    row: null,
    field: '',
    title: '',
    label: '',
    value: '',
    error: '',
    saving: false,
});
const displayEditModalStyle = computed(() => {
    if (displayEditDialog.value.field !== 'filename') {
        return {};
    }
    const textWidth = String(displayEditDialog.value.value || '').length * 8 + 120;
    return {
        width: `${Math.min(Math.max(textWidth, 640), 1100)}px`,
        maxWidth: '92vw',
    };
});
const productDialog = ref(false);
const productForm = ref({ id: 0, program: '', prefix: '', product_name: '' });
const router = useRouter();
const recalcChecking = ref(false);
const reparsing = ref(false);
const activeHomeTab = ref('ENG_DATA');
const hoverTip = ref('');
const mouseX = ref(0);
const mouseY = ref(0);
const mergeShowCount = ref(0);
const mergeManyShowCount = ref(0);
const downloadShowCount = ref(0);
const multiAnalysisShowCount = ref(0);
const multiBinShowCount = ref(0);
const checkShowCount = ref(0);
const reparseShowCount = ref(0);
function handleMouseMove(e) {
    mouseX.value = e.clientX + 10;
    mouseY.value = e.clientY + 15;
}
function handleMouseOverMerge() {
    if (mergeShowCount.value < 3) {
        hoverTip.value = '将一片的多次测试数据合并为完整数据。';
        mergeShowCount.value++;
    }
}
function handleMouseOverMergeMany() {
    if (mergeManyShowCount.value < 3) {
        hoverTip.value = '将多片数据合并在一起显示，无坐标。';
        mergeManyShowCount.value++;
    }
}
function handleMouseOverDownload() {
    if (downloadShowCount.value < 3) {
        hoverTip.value = '选择一个或多个数据进行原始数据下载。Combine的不可下载。';
        downloadShowCount.value++;
    }
}
function handleMouseOverMultiAnalysis() {
    if (multiAnalysisShowCount.value < 3) {
        hoverTip.value = '分析多片数据的参数分析';
        multiAnalysisShowCount.value++;
    }
}
function handleMouseOverMultiBin() {
    if (multiBinShowCount.value < 3) {
        hoverTip.value = '分析多片数据的Summary';
        multiBinShowCount.value++;
    }
}
function handleMouseOverCheck() {
    if (checkShowCount.value < 3) {
        hoverTip.value = '添加OTP_trim后的参数，以防FT叠片';
        checkShowCount.value++;
    }
}
function handleMouseOverReparse() {
    if (reparseShowCount.value < 3) {
        hoverTip.value = '选择一个或多个数据重新解析。';
        reparseShowCount.value++;
    }
}
let gridFilterTimer = null;
const backendTotalPages = computed(() => Math.max(1, Math.ceil(backendTotal.value / backendPageSize.value)));
const backendPageStart = computed(() => backendTotal.value ? (backendPage.value - 1) * backendPageSize.value + 1 : 0);
const backendPageEnd = computed(() => Math.min(backendPage.value * backendPageSize.value, backendTotal.value));
const filteredLots = computed(() => {
    if (activeHomeTab.value === 'all') {
        return lots.value;
    }
    if (activeHomeTab.value === 'ENG_DATA') {
        if (authStore.isAdmin || authStore.isEng) {
            return lots.value.filter((l) => l.data_source === 'manual' && l.data_type !== 'CP_LOT' && l.data_type !== 'MP_Yield');
        }
        else {
            return lots.value.filter((l) => l.data_source === 'manual' && l.user_id === authStore.user?.id && l.data_type !== 'CP_LOT' && l.data_type !== 'MP_Yield');
        }
    }
    if (activeHomeTab.value === 'CP_LOT') {
        return lots.value.filter((l) => l.data_type === 'CP_LOT');
    }
    if (activeHomeTab.value === 'CP') {
        return lots.value.filter((l) => l.data_source === 'ftp' && l.data_type !== 'CP_LOT' && l.data_type !== 'MP_Yield');
    }
    if (activeHomeTab.value === 'FT') {
        return lots.value.filter((l) => l.data_source === 'ftp' && l.data_type !== 'CP_LOT' && l.data_type !== 'MP_Yield');
    }
    return lots.value.filter((l) => l.data_source === 'ftp' && l.data_type !== 'MP_Yield');
});
const computedColumnDefs = computed(() => {
    const baseDefs = [...columnDefs];
    if (activeHomeTab.value === 'FT' || activeHomeTab.value === 'CP') {
        if (!baseDefs.some(c => c.field === 'ftp_path')) {
            const osatIdx = baseDefs.findIndex(c => c.field === 'osat_name');
            if (osatIdx !== -1) {
                baseDefs.splice(osatIdx + 1, 0, {
                    headerName: 'FTP 路径',
                    field: 'ftp_path',
                    width: 250,
                    filter: 'agTextColumnFilter',
                    cellRenderer: (p) => {
                        if (!p.value)
                            return '<span style="color:#ccc">—</span>';
                        return `<span style="font-family:monospace;font-size:11px;color:#666;" title="${p.value}">${p.value}</span>`;
                    }
                });
            }
        }
    }
    else {
        const ftpPathIdx = baseDefs.findIndex(c => c.field === 'ftp_path');
        if (ftpPathIdx !== -1) {
            baseDefs.splice(ftpPathIdx, 1);
        }
    }
    return baseDefs;
});
const rowSelection = ref('multiple');
// 合并相关
const showMergeDialog = ref(false);
const mergeForm = ref({ new_name: '', new_lot_id: '', new_wafer_id: '' });
const mergeError = ref('');
const merging = ref(false);
const showMergeManyDialog = ref(false);
const mergeManyForm = ref({ new_name: '', new_lot_id: '', new_wafer_id: '' });
const mergeManyError = ref('');
const mergingMany = ref(false);
// Check 相关
const checkDialog = ref(false);
const currentProgram = ref('');
const currentLotId = ref(0);
const selectedParams = ref([]);
const allParams = ref([]);
const paramSearch = ref('');
const checkThreshold = ref(2);
const savingConfig = ref(false);
const checkError = ref('');
const filteredParams = computed(() => {
    if (!paramSearch.value)
        return allParams.value;
    const s = paramSearch.value.toLowerCase();
    return allParams.value.filter(p => p.toLowerCase().includes(s));
});
async function handleCheckClick(lotId, program) {
    currentLotId.value = lotId;
    currentProgram.value = program;
    checkError.value = '';
    try {
        // 1. 获取该程序的配置
        const config = await api.get('/analysis/idle_check/config', { params: { program_name: program } });
        if (config && config.params && config.params.length > 0) {
            // 已有配置，直接跳转
            const url = router.resolve(`/lot/${lotId}/idle-check`).href;
            window.open(url, '_blank');
        }
        else {
            // 无配置，获取当前 LOT 的参数列表供选择
            const items = await api.get(`/analysis/lot/${lotId}/items_summary`);
            allParams.value = items.map(it => it.item_name);
            selectedParams.value = [];
            checkThreshold.value = 2;
            checkDialog.value = true;
        }
    }
    catch (e) {
        alert('获取配置失败');
    }
}
async function saveCheckConfig() {
    savingConfig.value = true;
    try {
        await api.post('/analysis/idle_check/config', {
            program_name: currentProgram.value,
            params: selectedParams.value,
            threshold: checkThreshold.value
        });
        checkDialog.value = false;
        // 跳转
        const url = router.resolve(`/lot/${currentLotId.value}/idle-check`).href;
        window.open(url, '_blank');
    }
    catch (e) {
        checkError.value = '保存配置失败';
    }
    finally {
        savingConfig.value = false;
    }
}
function openMergeDialog() {
    const firstLot = selectedRows.value[0];
    if (!firstLot)
        return;
    const waferIds = new Set(selectedRows.value.map(row => (row.wafer_id || '').trim()));
    if (waferIds.size > 1) {
        alert('所选数据的晶圆编号不一致，无法合并！');
        return;
    }
    mergeForm.value = {
        new_name: (firstLot.filename || '') + '_combine',
        new_lot_id: firstLot.lot_id || '',
        new_wafer_id: firstLot.wafer_id || '',
    };
    showMergeDialog.value = true;
}
function openMergeManyDialog() {
    const firstLot = selectedRows.value[0];
    if (!firstLot)
        return;
    mergeManyError.value = '';
    mergeManyForm.value = {
        new_name: (firstLot.filename || '') + '_combine',
        new_lot_id: firstLot.lot_id || '',
        new_wafer_id: firstLot.wafer_id || '',
    };
    showMergeManyDialog.value = true;
}
// 轮询相关
const pollingTimer = ref(null);
const pollingLotIds = ref([]);
function startPolling(lotIds) {
    pollingLotIds.value = lotIds;
    if (pollingTimer.value)
        clearInterval(pollingTimer.value);
    pollingTimer.value = setInterval(async () => {
        await fetchLots();
        const stillProcessing = lots.value.filter((l) => pollingLotIds.value.includes(l.id) &&
            (l.status === 'pending' || l.status === 'processing'));
        if (stillProcessing.length === 0) {
            stopPolling();
        }
    }, 3000);
}
function stopPolling() {
    if (pollingTimer.value) {
        clearInterval(pollingTimer.value);
        pollingTimer.value = null;
    }
    pollingLotIds.value = [];
}
onUnmounted(stopPolling);
const defaultColDef = {
    resizable: true,
    sortable: true,
    filter: true,
    floatingFilter: true,
    suppressFloatingFilterButton: true,
    minWidth: 80,
};
function compareDateOnly(filterLocalDateAtMidnight, cellValue) {
    if (!cellValue)
        return -1;
    const date = new Date(cellValue);
    if (Number.isNaN(date.getTime()))
        return -1;
    const cellDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (cellDate < filterLocalDateAtMidnight)
        return -1;
    if (cellDate > filterLocalDateAtMidnight)
        return 1;
    return 0;
}
function dateOnlyValue(value) {
    if (!value)
        return null;
    const text = String(value).trim();
    const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
        const pad = (n) => n.padStart(2, '0');
        return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
const dateRangeFilterParams = {
    browserDatePicker: true,
    defaultOption: 'inRange',
    filterOptions: ['inRange'],
    inRangeInclusive: true,
    buttons: ['reset'],
    comparator: compareDateOnly,
};
const OPEN_START_DATE = '0001-01-01';
const OPEN_END_DATE = '9999-12-31';
function modelDate(value) {
    return `${value} 00:00:00`;
}
function modelToDateOnly(value) {
    const date = dateOnlyValue(value);
    if (date === OPEN_START_DATE || date === OPEN_END_DATE)
        return '';
    return date || '';
}
function uniqueColumnOptions(field) {
    const values = new Set();
    for (const row of filteredLots.value) {
        const value = row?.[field];
        if (value !== undefined && value !== null && String(value).trim()) {
            values.add(String(value).trim());
        }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
const SelectFloatingFilter = defineComponent({
    name: 'SelectFloatingFilter',
    props: ['params'],
    setup(props, { expose }) {
        const selected = ref('');
        let syncing = false;
        function applyFilter() {
            if (syncing)
                return;
            props.params.parentFilterInstance((filter) => {
                if (!selected.value) {
                    filter.setModel(null);
                }
                else {
                    filter.setModel({ type: 'equals', filter: selected.value });
                }
                props.params.api.onFilterChanged();
            });
        }
        function onParentModelChanged(parentModel) {
            syncing = true;
            selected.value = parentModel?.filter || '';
            syncing = false;
        }
        expose({ onParentModelChanged });
        return () => {
            const options = props.params.options?.() || [];
            return h('select', {
                class: 'select-floating-filter',
                value: selected.value,
                title: props.params.placeholder || '全部',
                'aria-label': props.params.placeholder || '筛选',
                onChange: (event) => {
                    selected.value = event.target.value;
                    applyFilter();
                },
            }, [
                h('option', { value: '' }, '全部'),
                ...options.map((option) => {
                    const val = typeof option === 'object' ? option.value : option;
                    const label = typeof option === 'object' ? option.label : option;
                    return h('option', { value: val }, label);
                }),
            ]);
        };
    },
});
const DateRangeFloatingFilter = defineComponent({
    name: 'DateRangeFloatingFilter',
    props: ['params'],
    setup(props, { expose }) {
        const start = ref('');
        const end = ref('');
        let syncing = false;
        function applyFilter() {
            if (syncing)
                return;
            props.params.parentFilterInstance((filter) => {
                if (!start.value && !end.value) {
                    filter.setModel(null);
                }
                else {
                    filter.setModel({
                        type: 'inRange',
                        dateFrom: modelDate(start.value || OPEN_START_DATE),
                        dateTo: modelDate(end.value || OPEN_END_DATE),
                    });
                }
                props.params.api.onFilterChanged();
            });
        }
        function onParentModelChanged(parentModel) {
            syncing = true;
            start.value = modelToDateOnly(parentModel?.dateFrom);
            end.value = modelToDateOnly(parentModel?.dateTo);
            syncing = false;
        }
        expose({ onParentModelChanged });
        function renderDateBox(valueRef, label) {
            return h('label', { class: 'date-range-box', title: label }, [
                h('span', { class: 'date-range-value' }, valueRef.value),
                h('input', {
                    type: 'date',
                    class: 'date-range-native',
                    value: valueRef.value,
                    'aria-label': label,
                    onInput: (event) => {
                        valueRef.value = event.target.value;
                        applyFilter();
                    },
                    onClick: (event) => {
                        const input = event.target;
                        input.showPicker?.();
                    },
                }),
            ]);
        }
        return () => h('div', { class: 'date-range-floating' }, [
            renderDateBox(start, '开始日期'),
            h('span', { class: 'date-range-separator' }, '-'),
            renderDateBox(end, '结束日期'),
        ]);
    },
});
const columnDefs = [
    {
        headerName: '',
        width: 40,
        pinned: 'left',
        checkboxSelection: true,
        headerCheckboxSelection: true,
        filter: false,
        sortable: false,
        suppressHeaderMenuButton: true
    },
    { headerName: '序号', valueGetter: 'node.rowIndex + 1', width: 60, pinned: 'left', filter: false, sortable: false, suppressHeaderMenuButton: true },
    {
        headerName: '操作',
        width: 170,
        pinned: 'left',
        filter: false,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellRenderer: (p) => {
            if (!p.data)
                return '';
            let checkStyle = "color:#722ed1;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:4px;";
            if (p.data.check_status === 'red') {
                checkStyle = "background:#ef4444;color:#ffffff;cursor:pointer;font-size:12px;padding:2px 8px;border-radius:4px;font-weight:500;";
            }
            else if (p.data.check_status === 'yellow') {
                checkStyle = "background:#0d9488;color:#ffffff;cursor:pointer;font-size:12px;padding:2px 8px;border-radius:4px;font-weight:500;";
            }
            else if (p.data.check_status === 'green') {
                checkStyle = "background:#22c55e;color:#ffffff;cursor:pointer;font-size:12px;padding:2px 8px;border-radius:4px;font-weight:500;";
            }
            return `
        <div style="display:flex;gap:6px;align-items:center;height:100%">
          <span style="color:#1890ff;cursor:pointer;font-size:12px" data-action="analysis" data-id="${p.data.id}">参数分析</span>
          <span style="color:#52c41a;cursor:pointer;font-size:12px" data-action="bin" data-id="${p.data.id}">BIN分析</span>
          <span style="${checkStyle}" data-action="check" data-id="${p.data.id}" data-program="${p.data.program}">Check</span>
        </div>
      `;
        },
        onCellClicked: (p) => {
            if (!p.data || !p.event)
                return;
            const target = p.event.target;
            const action = target.dataset.action;
            const id = target.dataset.id;
            if (action === 'analysis') {
                const url = router.resolve(`/lot/${id}`).href;
                window.open(url, '_blank');
            }
            if (action === 'bin') {
                const url = router.resolve(`/lot/${id}/bin`).href;
                window.open(url, '_blank');
            }
            if (action === 'check') {
                handleCheckClick(Number(id), target.dataset.program || '');
            }
        }
    },
    {
        headerName: '文件名',
        field: 'filename',
        width: 300,
        pinned: 'left',
        filter: 'agTextColumnFilter',
        cellClass: 'selectable-cell',
    },
    {
        headerName: '产品名',
        field: 'product_name',
        width: 120,
        filter: 'agTextColumnFilter',
        cellRenderer: (p) => {
            if (p.value)
                return p.value;
            if (!p.data)
                return '';
            return `<span style="color:#1890ff;cursor:pointer" data-id="${p.data.id}" data-program="${p.data.program}">点击设置</span>`;
        },
        onCellClicked: (p) => {
            if (!p.data || !p.data.program)
                return;
            showProductDialog(p.data);
        }
    },
    { headerName: '批号', field: 'lot_id', width: 120, filter: 'agTextColumnFilter', cellClass: 'selectable-cell' },
    { headerName: '晶圆编号', field: 'wafer_id', width: 120, filter: 'agTextColumnFilter', cellClass: 'selectable-cell' },
    {
        headerName: '测试项',
        field: 'item_count',
        width: 100,
        filter: 'agNumberColumnFilter',
        filterParams: { defaultOption: 'greaterThan', buttons: ['reset'] }
    },
    {
        headerName: '晶圆数',
        field: 'die_count',
        width: 100,
        filter: 'agNumberColumnFilter',
        filterParams: { defaultOption: 'greaterThan', buttons: ['reset'] }
    },
    {
        headerName: '良品数',
        field: 'pass_count',
        width: 100,
        filter: 'agNumberColumnFilter',
        filterParams: { defaultOption: 'greaterThan', buttons: ['reset'] }
    },
    {
        headerName: '良率',
        field: 'yield_rate',
        width: 100,
        filter: 'agNumberColumnFilter',
        filterParams: { defaultOption: 'greaterThan', buttons: ['reset'] },
        valueFormatter: (p) => p.value ? `${(p.value * 100).toFixed(2)}%` : '-',
        cellStyle: (p) => {
            if (!p.value)
                return {};
            if (p.value < 0.8)
                return { color: 'red', fontWeight: 'bold' };
            if (p.value < 0.95)
                return { color: 'orange' };
            return { color: 'green' };
        }
    },
    {
        headerName: '程序名',
        field: 'program',
        width: 300,
        filter: 'agTextColumnFilter',
        cellClass: 'selectable-cell',
    },
    {
        headerName: '测试机',
        field: 'test_machine',
        width: 100,
        filter: 'agTextColumnFilter',
        cellClass: 'selectable-cell',
        suppressHeaderFilterButton: true,
        floatingFilterComponent: SelectFloatingFilter,
        floatingFilterComponentParams: {
            options: () => uniqueColumnOptions('test_machine'),
            placeholder: '测试机',
        },
    },
    {
        headerName: 'Data Type',
        field: 'data_type',
        width: 100,
        filter: 'agTextColumnFilter',
        suppressHeaderFilterButton: true,
        floatingFilterComponent: SelectFloatingFilter,
        floatingFilterComponentParams: {
            // 固定列表：不受当前 Tab 过滤影响，始终显示所有可能的 Data Type
            options: () => ['CP', 'FT', 'QA', 'Summary', 'CP_LOT', 'MP_Yield'],
            placeholder: 'Data Type',
        },
    },
    {
        headerName: '状态',
        field: 'status',
        width: 100,
        filter: 'agTextColumnFilter',
        suppressHeaderFilterButton: true,
        floatingFilterComponent: SelectFloatingFilter,
        floatingFilterComponentParams: {
            options: () => [
                { value: 'pending', label: '待处理' },
                { value: 'processing', label: '处理中' },
                { value: 'processed', label: '已完成' },
                { value: 'failed', label: '失败' }
            ],
            placeholder: '状态',
        },
        cellRenderer: (p) => {
            const map = {
                pending: '<span style="color:#888">待处理</span>',
                processing: '<span style="color:#1890ff">处理中</span>',
                processed: '<span style="color:green">已完成</span>',
                failed: '<span style="color:red">失败</span>',
            };
            return map[p.value] || p.value;
        }
    },
    { headerName: '文件大小', field: 'file_size', width: 100, filter: false, valueFormatter: (p) => p.value ? formatSize(p.value) : '-' },
    {
        headerName: '测试日期',
        field: 'test_date',
        width: 180,
        cellDataType: 'dateString',
        filter: 'agDateColumnFilter',
        filterValueGetter: (p) => dateOnlyValue(p.data?.test_date),
        filterParams: dateRangeFilterParams,
        floatingFilterComponent: DateRangeFloatingFilter,
        valueFormatter: (p) => formatDateTime(p.value)
    },
    {
        headerName: '结束日期',
        field: 'ending_time',
        width: 180,
        filter: false,
        floatingFilter: false,
        suppressHeaderMenuButton: true,
        valueFormatter: (p) => formatDateTime(p.value)
    },
    {
        headerName: '测试用时',
        width: 120,
        filter: 'agNumberColumnFilter',
        valueGetter: (p) => {
            const ts = p.data?.test_stage;
            if (ts && typeof ts === 'string' && ts.endsWith('S')) {
                return parseInt(ts.slice(0, -1), 10);
            }
            if (p.data?.data_type === 'CP_LOT') {
                return ts ? parseInt(ts, 10) : null;
            }
            else {
                const start = p.data.beginning_time || p.data.test_date;
                const end = p.data.ending_time;
                if (!start || !end)
                    return null;
                const startTime = new Date(start).getTime();
                const endTime = new Date(end).getTime();
                if (isNaN(startTime) || isNaN(endTime))
                    return null;
                const diff = endTime - startTime;
                return diff > 0 ? diff / 3600000 : 0;
            }
        },
        valueFormatter: (p) => {
            const ts = p.data?.test_stage;
            if (ts && typeof ts === 'string' && ts.endsWith('S')) {
                return p.value != null ? `${p.value}S` : '-';
            }
            if (p.data?.data_type === 'CP_LOT') {
                return p.value != null ? `${p.value}S` : '-';
            }
            return p.value != null ? `${p.value.toFixed(2)} H` : '-';
        }
    },
    {
        headerName: '上传日期',
        field: 'upload_date',
        width: 180,
        cellDataType: 'dateString',
        filter: 'agDateColumnFilter',
        filterValueGetter: (p) => dateOnlyValue(p.data?.upload_date),
        filterParams: dateRangeFilterParams,
        floatingFilterComponent: DateRangeFloatingFilter,
        valueFormatter: (p) => formatDateTime(p.value)
    },
    {
        headerName: 'OSAT',
        field: 'osat_name',
        width: 100,
        filter: 'agTextColumnFilter',
        suppressHeaderFilterButton: true,
        floatingFilterComponent: SelectFloatingFilter,
        floatingFilterComponentParams: {
            options: () => allOsatNames.value,
            placeholder: 'OSAT',
        },
        cellRenderer: (p) => {
            if (!p.value)
                return '<span style="color:#ccc">—</span>';
            return `<span style="background:#f5f3ff;color:#7c3aed;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:500">${p.value}</span>`;
        }
    },
    {
        headerName: 'MP Tester',
        field: 'mp_tester',
        width: 120,
        filter: 'agTextColumnFilter',
        cellRenderer: (p) => {
            if (!p.value)
                return '<span style="color:#ccc">—</span>';
            return `<span style="font-size:12px">${p.value}</span>`;
        }
    },
    {
        headerName: 'Probecard',
        field: 'probecard',
        width: 120,
        filter: 'agTextColumnFilter',
        cellRenderer: (p) => {
            if (!p.value)
                return '<span style="color:#ccc">—</span>';
            return `<span style="font-size:12px">${p.value}</span>`;
        }
    },
];
function formatSize(bytes) {
    if (bytes < 1024)
        return bytes + ' B';
    if (bytes < 1024 * 1024)
        return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
// 监听时区变化，刷新 AG Grid 所有单元格，使时间显示立即更新
watch(() => timezoneStore.timezone, () => {
    gridApi.value?.refreshCells({ force: true });
});
// 监听工具栏“状态”筛选变化，同步更新表格列筛选器状态
watch(() => filters.value.status, (newStatus) => {
    if (!gridApi.value)
        return;
    const model = gridApi.value.getFilterModel() || {};
    const currentModelStatus = model.status?.filter || '';
    if (currentModelStatus !== newStatus) {
        if (!newStatus) {
            delete model.status;
        }
        else {
            model.status = { type: 'equals', filter: newStatus };
        }
        gridApi.value.setFilterModel(model);
    }
});
function formatDateTime(val) {
    if (!val)
        return '-';
    if (val instanceof Date) {
        return formatLocalDateParts(val.getFullYear(), val.getMonth() + 1, val.getDate(), val.getHours(), val.getMinutes(), val.getSeconds());
    }
    const text = String(val).trim();
    const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!match)
        return text || '-';
    return formatLocalDateParts(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0));
}
function formatLocalDateParts(year, month, day, hour, minute, second) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}
async function fetchLots() {
    try {
        const params = { page: backendPage.value, page_size: backendPageSize.value };
        if (filters.value.product_name)
            params.product_name = filters.value.product_name;
        if (filters.value.lot_id)
            params.lot_id = filters.value.lot_id;
        if (filters.value.status)
            params.status = filters.value.status;
        Object.assign(params, backendGridFilters.value);
        // 根据当前 Tab 加上后端过滤参数，减轻前端过滤压力并解除 200 条限制问题
        if (activeHomeTab.value === 'ENG_DATA') {
            params.data_source = 'manual';
        }
        else if (activeHomeTab.value === 'FT') {
            params.data_source = 'ftp';
            params.osat_type = 'FT'; // 按 OSAT 配置的 data_type 过滤，而非 lot 自身的 data_type
        }
        else if (activeHomeTab.value === 'CP') {
            params.data_source = 'ftp';
            params.osat_type = 'CP'; // 按 OSAT 配置的 data_type 过滤，而非 lot 自身的 data_type
        }
        else if (activeHomeTab.value === 'CP_LOT') {
            params.data_type = 'CP_LOT';
        }
        const data = await api.get('/lots', { params });
        console.log('fetchLots response:', data);
        lots.value = data?.items || [];
        backendTotal.value = data?.total || 0;
        backendPage.value = data?.page || backendPage.value;
        backendPageSize.value = data?.page_size || backendPageSize.value;
        selectedRows.value = [];
        if (backendTotal.value > 0 && backendPage.value > backendTotalPages.value) {
            backendPage.value = backendTotalPages.value;
            await fetchLots();
        }
    }
    catch (e) {
        console.error('fetchLots failed:', e);
        lots.value = [];
        backendTotal.value = 0;
    }
}
async function fetchOsatNames() {
    try {
        const res = await api.get('/lots/osats/names');
        allOsatNames.value = res || [];
    }
    catch (e) {
        console.error('Failed to fetch osat names:', e);
        allOsatNames.value = ["Chipmore", "LBS", "HTKS", "UCD"];
    }
}
async function fetchLotsFromFirstPage() {
    backendPage.value = 1;
    await fetchLots();
}
async function goBackendPage(page) {
    const nextPage = Math.min(Math.max(1, page), backendTotalPages.value);
    if (nextPage === backendPage.value)
        return;
    backendPage.value = nextPage;
    await fetchLots();
    gridApi.value?.deselectAll();
    gridApi.value?.ensureIndexVisible(0, 'top');
}
async function showProductDialog(row) {
    const data = await api.get('/products/suggest', {
        params: { program: row.program }
    });
    productForm.value = {
        id: row.id,
        program: row.program,
        prefix: data.prefix,
        product_name: data.product_name || ''
    };
    productDialog.value = true;
}
async function saveProductName() {
    await api.post('/products/mapping', {
        prefix: productForm.value.prefix,
        product_name: productForm.value.product_name
    });
    productDialog.value = false;
    await fetchLots();
}
function onGridReady(params) {
    gridApi.value = params.api;
    // 初始化表格时，如果默认状态有值，应用到表格列筛选器
    const model = gridApi.value.getFilterModel() || {};
    let changed = false;
    if (filters.value.status) {
        model.status = { type: 'equals', filter: filters.value.status };
        changed = true;
    }
    if (activeHomeTab.value === 'FT') {
        model.data_type = { type: 'equals', filter: 'FT' };
        changed = true;
    }
    else if (activeHomeTab.value === 'CP') {
        model.data_type = { type: 'equals', filter: 'CP' };
        changed = true;
    }
    if (changed) {
        gridApi.value.setFilterModel(model);
    }
}
function textFilterValue(model, field) {
    const filterModel = model?.[field];
    if (!filterModel)
        return '';
    return String(filterModel.filter ?? filterModel.condition1?.filter ?? '').trim();
}
function dateModelValue(value) {
    return dateOnlyValue(value) || '';
}
function extractBackendGridFilters(model) {
    const next = {};
    const filename = textFilterValue(model, 'filename');
    const waferId = textFilterValue(model, 'wafer_id');
    const program = textFilterValue(model, 'program');
    const testMachine = textFilterValue(model, 'test_machine');
    const dataType = textFilterValue(model, 'data_type');
    const osatName = textFilterValue(model, 'osat_name');
    if (filename)
        next.filename = filename;
    if (waferId)
        next.wafer_id = waferId;
    if (program)
        next.program = program;
    if (testMachine)
        next.test_machine = testMachine;
    if (dataType)
        next.data_type = dataType;
    if (osatName)
        next.osat_name = osatName;
    const testDate = model?.test_date;
    const uploadDate = model?.upload_date;
    const testDateFrom = dateModelValue(testDate?.dateFrom);
    const testDateTo = dateModelValue(testDate?.dateTo);
    const uploadDateFrom = dateModelValue(uploadDate?.dateFrom);
    const uploadDateTo = dateModelValue(uploadDate?.dateTo);
    if (testDateFrom && testDateFrom !== OPEN_START_DATE)
        next.test_date_from = testDateFrom;
    if (testDateTo && testDateTo !== OPEN_END_DATE)
        next.test_date_to = testDateTo;
    if (uploadDateFrom && uploadDateFrom !== OPEN_START_DATE)
        next.upload_date_from = uploadDateFrom;
    if (uploadDateTo && uploadDateTo !== OPEN_END_DATE)
        next.upload_date_to = uploadDateTo;
    return next;
}
function onGridFilterChanged() {
    if (!gridApi.value)
        return;
    const model = gridApi.value.getFilterModel();
    const nextProductName = textFilterValue(model, 'product_name');
    const nextLotId = textFilterValue(model, 'lot_id');
    const nextStatus = textFilterValue(model, 'status');
    const nextBackendGridFilters = extractBackendGridFilters(model);
    const backendFilterChanged = JSON.stringify(nextBackendGridFilters) !== JSON.stringify(backendGridFilters.value);
    if (nextProductName === filters.value.product_name &&
        nextLotId === filters.value.lot_id &&
        nextStatus === filters.value.status &&
        !backendFilterChanged) {
        return;
    }
    filters.value.product_name = nextProductName;
    filters.value.lot_id = nextLotId;
    filters.value.status = nextStatus;
    backendGridFilters.value = nextBackendGridFilters;
    if (gridFilterTimer)
        clearTimeout(gridFilterTimer);
    gridFilterTimer = setTimeout(() => {
        fetchLotsFromFirstPage();
    }, 250);
}
function onSelectionChanged() {
    selectedRows.value = gridApi.value?.getSelectedRows() || [];
}
function openDisplayEditDialog(row, field) {
    const labels = {
        filename: '数据名',
        lot_id: '批号',
        wafer_id: '晶圆编号',
        data_type: 'Data Type',
        test_machine: '测试机',
    };
    displayEditDialog.value = {
        visible: true,
        row,
        field,
        title: `修改${labels[field]}`,
        label: labels[field],
        value: row?.[field] || '',
        error: '',
        saving: false,
    };
    nextTick(() => {
        displayEditInput.value?.focus();
        displayEditInput.value?.select();
    });
}
function closeDisplayEditDialog() {
    if (displayEditDialog.value.saving)
        return;
    displayEditDialog.value.visible = false;
}
async function saveDisplayEdit() {
    const dialog = displayEditDialog.value;
    if (!dialog.row || !dialog.field)
        return;
    let value = dialog.value.trim();
    if (dialog.field === 'filename' && !value) {
        dialog.error = '数据名不能为空';
        return;
    }
    if (dialog.field === 'data_type') {
        value = value.toUpperCase();
        if (!['CP', 'FT', 'QA'].includes(value)) {
            dialog.error = 'Data Type 只能是 CP / FT / QA';
            return;
        }
    }
    dialog.saving = true;
    dialog.error = '';
    try {
        const data = await api.patch(`/lots/${dialog.row.id}/display`, { [dialog.field]: value });
        dialog.row[dialog.field] = data?.[dialog.field] ?? value;
        gridApi.value?.applyTransaction({ update: [dialog.row] });
        gridApi.value?.refreshCells({ columns: [dialog.field], force: true });
        selectedRows.value = gridApi.value?.getSelectedRows() || [];
        displayEditDialog.value.visible = false;
    }
    catch (e) {
        dialog.error = e?.response?.data?.detail || '保存失败';
    }
    finally {
        dialog.saving = false;
    }
}
function onCellDoubleClicked(params) {
    const field = params.colDef?.field;
    if (field === 'filename' || field === 'lot_id' || field === 'wafer_id' || field === 'data_type' || field === 'test_machine') {
        openDisplayEditDialog(params.data, field);
        return;
    }
    const fields = ['program'];
    if (!fields.includes(field))
        return;
    // Walk up from the click target to find the AG Grid cell value container
    let el = params.event?.target;
    while (el && !el.classList.contains('ag-cell-value')) {
        el = el.parentElement;
    }
    // Fallback: use the event target itself
    if (!el)
        el = params.event?.target;
    if (!el)
        return;
    // Select all text inside the container
    const selection = window.getSelection();
    if (!selection)
        return;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
}
function handleDrop(e) {
    const files = Array.from(e.dataTransfer?.files || []);
    uploadFiles.value = files.filter(f => isAllowedFile(f.name));
}
function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    uploadFiles.value = files.filter(f => isAllowedFile(f.name));
}
function isAllowedFile(name) {
    const lower = name.toLowerCase();
    return lower.endsWith('.csv') ||
        lower.endsWith('.zip') ||
        lower.endsWith('.rar') ||
        lower.endsWith('.stdf') ||
        lower.endsWith('.std') ||
        lower.endsWith('.stdf.gz') ||
        lower.endsWith('.std.gz') ||
        lower.endsWith('.csv.gz') ||
        lower.endsWith('.gz') ||
        lower.endsWith('.txt') ||
        lower.endsWith('.xls') ||
        lower.endsWith('.xlsx');
}
function isStdfFile(name) {
    const lower = name.toLowerCase();
    return lower.endsWith('.stdf') ||
        lower.endsWith('.std') ||
        lower.endsWith('.stdf.gz') ||
        lower.endsWith('.std.gz');
}
async function handleUpload() {
    const filesToUpload = [...uploadFiles.value];
    showUpload.value = false;
    uploadFiles.value = [];
    uploading.value = true;
    try {
        const formData = new FormData();
        filesToUpload.forEach(f => formData.append('files', f));
        const res = await api.post('/lots/upload', formData);
        await fetchLots();
        const uploadResults = res?.results || [];
        const failed = uploadResults.filter((r) => r.status === 'failed');
        if (failed.length) {
            alert(failed.map((r) => `${r.filename}: ${r.error || '解析失败'}`).join('\n'));
        }
        const newIds = uploadResults.map((r) => r.lot_id).filter(Boolean);
        if (newIds.length > 0) {
            startPolling(newIds);
        }
    }
    catch (e) {
        alert('上传失败');
    }
    finally {
        uploading.value = false;
    }
}
async function handleDelete() {
    if (!selectedRows.value.length)
        return;
    // OSAT_FT/OSAT_CP 所有人均可访问，但只有 admin/eng 可以删除。
    const hasFtpLot = selectedRows.value.some(r => r.data_source === 'ftp');
    if (hasFtpLot && !authStore.isAdmin && !authStore.isEng) {
        alert('您没有权限删除 OSAT_FT / OSAT_CP 的数据记录！');
        return;
    }
    if (!confirm(`确认删除 ${selectedRows.value.length} 条记录？`))
        return;
    const ids = selectedRows.value.map(r => r.id);
    try {
        await api.delete('/lots', { data: { ids } });
        await fetchLots();
    }
    catch (e) {
        alert('删除失败');
    }
}
async function handleDownload() {
    if (!selectedRows.value.length)
        return;
    const ids = selectedRows.value.map(r => r.id);
    try {
        const response = await api.post('/lots/download', { ids }, {
            responseType: 'blob'
        });
        // response is now the full axios response (blob case in interceptor)
        const blobData = response.data;
        const headers = response.headers;
        // Create blob link and trigger download
        const blob = new Blob([blobData], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        // Extract filename from Content-Disposition header if available
        const disposition = headers?.['content-disposition'];
        let filename = 'ATE_OriginalData.zip';
        if (disposition && disposition.includes('filename=')) {
            const match = disposition.match(/filename="?([^"]+)"?/);
            if (match)
                filename = match[1];
        }
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }
    catch (e) {
        // If error response is JSON blob, try to read it
        if (e.response && e.response.data instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const err = JSON.parse(reader.result);
                    alert(err.detail || '下载失败');
                }
                catch {
                    alert('下载失败');
                }
            };
            reader.readAsText(e.response.data);
        }
        else {
            alert('下载失败');
        }
    }
}
async function handleMerge() {
    if (!mergeForm.value.new_name.trim())
        return;
    mergeError.value = '';
    merging.value = true;
    try {
        const ids = selectedRows.value.map(r => r.id);
        await api.post('/lots/merge', {
            ids,
            new_name: mergeForm.value.new_name.trim(),
            new_lot_id: mergeForm.value.new_lot_id.trim(),
            new_wafer_id: mergeForm.value.new_wafer_id.trim(),
        });
        showMergeDialog.value = false;
        mergeForm.value = { new_name: '', new_lot_id: '', new_wafer_id: '' };
        await fetchLots();
    }
    catch (e) {
        mergeError.value = typeof e === 'string' ? e : (e?.message || '合并失败，请检查数据');
    }
    finally {
        merging.value = false;
    }
}
async function handleMergeMany() {
    if (!mergeManyForm.value.new_name.trim())
        return;
    mergeManyError.value = '';
    mergingMany.value = true;
    try {
        const ids = selectedRows.value.map(r => r.id);
        await api.post('/lots/merge_many', {
            ids,
            new_name: mergeManyForm.value.new_name.trim(),
            new_lot_id: mergeManyForm.value.new_lot_id.trim(),
            new_wafer_id: mergeManyForm.value.new_wafer_id.trim(),
        });
        showMergeManyDialog.value = false;
        mergeManyForm.value = { new_name: '', new_lot_id: '', new_wafer_id: '' };
        await fetchLots();
    }
    catch (e) {
        mergeManyError.value = typeof e === 'string' ? e : (e?.response?.data?.detail || e?.message || '合多失败，请检查数据');
    }
    finally {
        mergingMany.value = false;
    }
}
function handleMultiAnalysis() {
    if (selectedRows.value.length < 2)
        return;
    const sorted = [...selectedRows.value].sort((a, b) => {
        const da = a.test_date ? new Date(a.test_date).getTime() : 0;
        const db = b.test_date ? new Date(b.test_date).getTime() : 0;
        return (da || 0) - (db || 0);
    });
    const ids = sorted.map(r => r.id).join(',');
    const url = router.resolve(`/multi-analysis?lot_ids=${ids}`).href;
    window.open(url, '_blank');
}
function handleMultiBin() {
    if (selectedRows.value.length < 2)
        return;
    const sorted = [...selectedRows.value].sort((a, b) => {
        const da = a.test_date ? new Date(a.test_date).getTime() : 0;
        const db = b.test_date ? new Date(b.test_date).getTime() : 0;
        return (da || 0) - (db || 0);
    });
    const ids = sorted.map(r => r.id).join(',');
    const url = router.resolve(`/multi-bin?lot_ids=${ids}`).href;
    window.open(url, '_blank');
}
async function handleReparse() {
    if (!selectedRows.value.length)
        return;
    reparsing.value = true;
    try {
        const ids = selectedRows.value.map(r => r.id);
        const res = await api.post('/lots/reparse', { ids });
        await fetchLots();
        const queuedIds = (res?.ids || ids).filter(Boolean);
        if (queuedIds.length > 0) {
            startPolling(queuedIds);
        }
        else {
            alert(res?.message || '没有可重新解析的数据');
        }
    }
    catch (e) {
        alert(`重新解析失败: ${e.response?.data?.detail || e.message || e}`);
    }
    finally {
        reparsing.value = false;
    }
}
async function handleRecalcCheck() {
    if (!selectedRows.value.length)
        return;
    recalcChecking.value = true;
    try {
        const ids = selectedRows.value.map(r => r.id);
        const res = await api.post('/analysis/idle_check/recalc', { ids });
        alert(res.message || '重算成功');
        await fetchLots();
    }
    catch (e) {
        alert(`重算失败: ${e.response?.data?.detail || e.message || e}`);
    }
    finally {
        recalcChecking.value = false;
    }
}
const lastClickedParam = ref(null);
function onCheckboxClick(event, p) {
    if (event.shiftKey && lastClickedParam.value) {
        event.preventDefault();
        const idx1 = filteredParams.value.indexOf(lastClickedParam.value);
        const idx2 = filteredParams.value.indexOf(p);
        if (idx1 !== -1 && idx2 !== -1) {
            const start = Math.min(idx1, idx2);
            const end = Math.max(idx1, idx2);
            const rangeParams = filteredParams.value.slice(start, end + 1);
            rangeParams.forEach(item => {
                if (!selectedParams.value.includes(item)) {
                    selectedParams.value.push(item);
                }
            });
        }
    }
    else {
        lastClickedParam.value = p;
    }
}
onMounted(() => {
    fetchLots();
    fetchOsatNames();
});
watch(activeHomeTab, (newTab) => {
    if (gridApi.value) {
        const model = gridApi.value.getFilterModel() || {};
        if (newTab === 'FT') {
            model.data_type = { type: 'equals', filter: 'FT' };
        }
        else if (newTab === 'CP') {
            model.data_type = { type: 'equals', filter: 'CP' };
        }
        else {
            delete model.data_type;
        }
        gridApi.value.setFilterModel(model);
    }
    fetchLotsFromFirstPage();
});
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
/** @type {__VLS_StyleScopedClasses['btn-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-merge']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-multi-analysis']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-multi-bin']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-download']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-check']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-reparse']} */ ;
/** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['db-page-jump']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-floating-filter-input']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['display-edit-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['display-edit-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['display-edit-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['param-item']} */ ;
/** @type {__VLS_StyleScopedClasses['param-item']} */ ;
/** @type {__VLS_StyleScopedClasses['param-item']} */ ;
/** @type {__VLS_StyleScopedClasses['home-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['home-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['date-range-native']} */ ;
/** @type {__VLS_StyleScopedClasses['date-range-box']} */ ;
/** @type {__VLS_StyleScopedClasses['select-floating-filter']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lot-list" },
});
/** @type {__VLS_StyleScopedClasses['lot-list']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "home-tabs" },
});
/** @type {__VLS_StyleScopedClasses['home-tabs']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.activeHomeTab = 'ENG_DATA');
            // @ts-ignore
            [activeHomeTab,];
        } },
    ...{ class: (['home-tab-btn', { active: __VLS_ctx.activeHomeTab === 'ENG_DATA' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['home-tab-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.activeHomeTab = 'all');
            // @ts-ignore
            [activeHomeTab, activeHomeTab,];
        } },
    ...{ class: (['home-tab-btn', { active: __VLS_ctx.activeHomeTab === 'all' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['home-tab-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.activeHomeTab = 'FT');
            // @ts-ignore
            [activeHomeTab, activeHomeTab,];
        } },
    ...{ class: (['home-tab-btn', { active: __VLS_ctx.activeHomeTab === 'FT' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['home-tab-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.activeHomeTab = 'CP');
            // @ts-ignore
            [activeHomeTab, activeHomeTab,];
        } },
    ...{ class: (['home-tab-btn', { active: __VLS_ctx.activeHomeTab === 'CP' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['home-tab-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.activeHomeTab = 'CP_LOT');
            // @ts-ignore
            [activeHomeTab, activeHomeTab,];
        } },
    ...{ class: (['home-tab-btn', { active: __VLS_ctx.activeHomeTab === 'CP_LOT' }]) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['home-tab-btn']} */ ;
if (__VLS_ctx.activeHomeTab !== 'program_change') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-left" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-left']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeHomeTab !== 'program_change'))
                    throw 0;
                return (__VLS_ctx.showUpload = true);
                // @ts-ignore
                [activeHomeTab, activeHomeTab, showUpload,];
            } },
        ...{ class: "btn btn-primary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.fetchLots) },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleDelete) },
        ...{ class: "btn btn-danger" },
        disabled: (!__VLS_ctx.selectedRows.length),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-danger']} */ ;
    (__VLS_ctx.selectedRows.length ? `(${__VLS_ctx.selectedRows.length})` : '');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleDownload) },
        ...{ onMouseover: (__VLS_ctx.handleMouseOverDownload) },
        ...{ onMousemove: (__VLS_ctx.handleMouseMove) },
        ...{ onMouseleave: (...[$event]) => {
                if (!(__VLS_ctx.activeHomeTab !== 'program_change'))
                    throw 0;
                return (__VLS_ctx.hoverTip = '');
                // @ts-ignore
                [fetchLots, handleDelete, selectedRows, selectedRows, selectedRows, handleDownload, handleMouseOverDownload, handleMouseMove, hoverTip,];
            } },
        ...{ class: "btn btn-download" },
        disabled: (!__VLS_ctx.selectedRows.length),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-download']} */ ;
    (__VLS_ctx.selectedRows.length ? `(${__VLS_ctx.selectedRows.length})` : '');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.openMergeDialog) },
        ...{ onMouseover: (__VLS_ctx.handleMouseOverMerge) },
        ...{ onMousemove: (__VLS_ctx.handleMouseMove) },
        ...{ onMouseleave: (...[$event]) => {
                if (!(__VLS_ctx.activeHomeTab !== 'program_change'))
                    throw 0;
                return (__VLS_ctx.hoverTip = '');
                // @ts-ignore
                [selectedRows, selectedRows, selectedRows, handleMouseMove, hoverTip, openMergeDialog, handleMouseOverMerge,];
            } },
        ...{ class: "btn btn-merge" },
        disabled: (__VLS_ctx.selectedRows.length < 2),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-merge']} */ ;
    (__VLS_ctx.selectedRows.length >= 2 ? `(${__VLS_ctx.selectedRows.length})` : '');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.openMergeManyDialog) },
        ...{ onMouseover: (__VLS_ctx.handleMouseOverMergeMany) },
        ...{ onMousemove: (__VLS_ctx.handleMouseMove) },
        ...{ onMouseleave: (...[$event]) => {
                if (!(__VLS_ctx.activeHomeTab !== 'program_change'))
                    throw 0;
                return (__VLS_ctx.hoverTip = '');
                // @ts-ignore
                [selectedRows, selectedRows, selectedRows, handleMouseMove, hoverTip, openMergeManyDialog, handleMouseOverMergeMany,];
            } },
        ...{ class: "btn btn-merge-many" },
        disabled: (__VLS_ctx.selectedRows.length < 2),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-merge-many']} */ ;
    (__VLS_ctx.selectedRows.length >= 2 ? `(${__VLS_ctx.selectedRows.length})` : '');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleMultiAnalysis) },
        ...{ onMouseover: (__VLS_ctx.handleMouseOverMultiAnalysis) },
        ...{ onMousemove: (__VLS_ctx.handleMouseMove) },
        ...{ onMouseleave: (...[$event]) => {
                if (!(__VLS_ctx.activeHomeTab !== 'program_change'))
                    throw 0;
                return (__VLS_ctx.hoverTip = '');
                // @ts-ignore
                [selectedRows, selectedRows, selectedRows, handleMouseMove, hoverTip, handleMultiAnalysis, handleMouseOverMultiAnalysis,];
            } },
        ...{ class: "btn btn-multi-analysis" },
        disabled: (__VLS_ctx.selectedRows.length < 2),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-multi-analysis']} */ ;
    (__VLS_ctx.selectedRows.length >= 2 ? `(${__VLS_ctx.selectedRows.length})` : '');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleMultiBin) },
        ...{ onMouseover: (__VLS_ctx.handleMouseOverMultiBin) },
        ...{ onMousemove: (__VLS_ctx.handleMouseMove) },
        ...{ onMouseleave: (...[$event]) => {
                if (!(__VLS_ctx.activeHomeTab !== 'program_change'))
                    throw 0;
                return (__VLS_ctx.hoverTip = '');
                // @ts-ignore
                [selectedRows, selectedRows, selectedRows, handleMouseMove, hoverTip, handleMultiBin, handleMouseOverMultiBin,];
            } },
        ...{ class: "btn btn-multi-bin" },
        disabled: (__VLS_ctx.selectedRows.length < 2),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-multi-bin']} */ ;
    (__VLS_ctx.selectedRows.length >= 2 ? `(${__VLS_ctx.selectedRows.length})` : '');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleRecalcCheck) },
        ...{ onMouseover: (__VLS_ctx.handleMouseOverCheck) },
        ...{ onMousemove: (__VLS_ctx.handleMouseMove) },
        ...{ onMouseleave: (...[$event]) => {
                if (!(__VLS_ctx.activeHomeTab !== 'program_change'))
                    throw 0;
                return (__VLS_ctx.hoverTip = '');
                // @ts-ignore
                [selectedRows, selectedRows, selectedRows, handleMouseMove, hoverTip, handleRecalcCheck, handleMouseOverCheck,];
            } },
        ...{ class: "btn btn-check" },
        disabled: (!__VLS_ctx.selectedRows.length || __VLS_ctx.recalcChecking),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-check']} */ ;
    (__VLS_ctx.recalcChecking ? '重算中...' : '');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleReparse) },
        ...{ onMouseover: (__VLS_ctx.handleMouseOverReparse) },
        ...{ onMousemove: (__VLS_ctx.handleMouseMove) },
        ...{ onMouseleave: (...[$event]) => {
                if (!(__VLS_ctx.activeHomeTab !== 'program_change'))
                    throw 0;
                return (__VLS_ctx.hoverTip = '');
                // @ts-ignore
                [selectedRows, handleMouseMove, hoverTip, recalcChecking, recalcChecking, handleReparse, handleMouseOverReparse,];
            } },
        ...{ class: "btn btn-reparse" },
        disabled: (!__VLS_ctx.selectedRows.length || __VLS_ctx.reparsing),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-reparse']} */ ;
    (__VLS_ctx.reparsing ? '提交中...' : (__VLS_ctx.selectedRows.length ? `(${__VLS_ctx.selectedRows.length})` : ''));
    if (__VLS_ctx.uploading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "uploading-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['uploading-badge']} */ ;
    }
    else if (__VLS_ctx.pollingTimer) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "polling-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['polling-badge']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-right" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-right']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (__VLS_ctx.fetchLotsFromFirstPage) },
        placeholder: "产品名筛选",
        ...{ class: "filter-input" },
    });
    (__VLS_ctx.filters.product_name);
    /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (__VLS_ctx.fetchLotsFromFirstPage) },
        placeholder: "批号筛选",
        ...{ class: "filter-input" },
    });
    (__VLS_ctx.filters.lot_id);
    /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (__VLS_ctx.fetchLotsFromFirstPage) },
        value: (__VLS_ctx.filters.status),
        ...{ class: "filter-select" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-select']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "pending",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "processing",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "processed",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "failed",
    });
}
if (__VLS_ctx.hoverTip) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "floating-hover-tip" },
        ...{ style: ({ left: __VLS_ctx.mouseX + 'px', top: __VLS_ctx.mouseY + 'px' }) },
    });
    /** @type {__VLS_StyleScopedClasses['floating-hover-tip']} */ ;
    (__VLS_ctx.hoverTip);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "table-container" },
});
/** @type {__VLS_StyleScopedClasses['table-container']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.agGridVue | typeof __VLS_components.AgGridVue | typeof __VLS_components['ag-grid-vue']} */
agGridVue;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onSelectionChanged': {} },
    ...{ 'onGridReady': {} },
    ...{ 'onFilterChanged': {} },
    ...{ 'onCellDoubleClicked': {} },
    ...{ class: "ag-theme-alpine" },
    theme: ('legacy'),
    rowData: (__VLS_ctx.filteredLots),
    columnDefs: (__VLS_ctx.computedColumnDefs),
    defaultColDef: (__VLS_ctx.defaultColDef),
    rowSelection: (__VLS_ctx.rowSelection),
    pagination: (false),
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onSelectionChanged': {} },
    ...{ 'onGridReady': {} },
    ...{ 'onFilterChanged': {} },
    ...{ 'onCellDoubleClicked': {} },
    ...{ class: "ag-theme-alpine" },
    theme: ('legacy'),
    rowData: (__VLS_ctx.filteredLots),
    columnDefs: (__VLS_ctx.computedColumnDefs),
    defaultColDef: (__VLS_ctx.defaultColDef),
    rowSelection: (__VLS_ctx.rowSelection),
    pagination: (false),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.selectionChanged} */
    onSelectionChanged: (__VLS_ctx.onSelectionChanged),
};
const __VLS_7 = {
    /** @type {typeof __VLS_5.gridReady} */
    onGridReady: (__VLS_ctx.onGridReady),
};
const __VLS_8 = {
    /** @type {typeof __VLS_5.filterChanged} */
    onFilterChanged: (__VLS_ctx.onGridFilterChanged),
};
const __VLS_9 = {
    /** @type {typeof __VLS_5.cellDoubleClicked} */
    onCellDoubleClicked: (__VLS_ctx.onCellDoubleClicked),
};
/** @type {__VLS_StyleScopedClasses['ag-theme-alpine']} */ ;
var __VLS_3;
var __VLS_4;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "db-page-footer" },
});
/** @type {__VLS_StyleScopedClasses['db-page-footer']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "db-page-size" },
});
/** @type {__VLS_StyleScopedClasses['db-page-size']} */ ;
(__VLS_ctx.backendPageSize);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "db-page-summary" },
});
/** @type {__VLS_StyleScopedClasses['db-page-summary']} */ ;
(__VLS_ctx.lots.length);
(__VLS_ctx.backendTotal);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "db-page-range" },
});
/** @type {__VLS_StyleScopedClasses['db-page-range']} */ ;
(__VLS_ctx.backendPageStart);
(__VLS_ctx.backendPageEnd);
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.goBackendPage(1));
            // @ts-ignore
            [selectedRows, selectedRows, selectedRows, hoverTip, hoverTip, reparsing, reparsing, uploading, pollingTimer, fetchLotsFromFirstPage, fetchLotsFromFirstPage, fetchLotsFromFirstPage, filters, filters, filters, mouseX, mouseY, filteredLots, computedColumnDefs, defaultColDef, rowSelection, onSelectionChanged, onGridReady, onGridFilterChanged, onCellDoubleClicked, backendPageSize, lots, backendTotal, backendPageStart, backendPageEnd, goBackendPage,];
        } },
    ...{ class: "db-page-btn" },
    disabled: (__VLS_ctx.backendPage <= 1),
});
/** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.goBackendPage(__VLS_ctx.backendPage - 1));
            // @ts-ignore
            [goBackendPage, backendPage, backendPage,];
        } },
    ...{ class: "db-page-btn" },
    disabled: (__VLS_ctx.backendPage <= 1),
});
/** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.backendPage);
(__VLS_ctx.backendTotalPages);
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.goBackendPage(__VLS_ctx.backendPage + 1));
            // @ts-ignore
            [goBackendPage, backendPage, backendPage, backendPage, backendTotalPages,];
        } },
    ...{ class: "db-page-btn" },
    disabled: (__VLS_ctx.backendPage >= __VLS_ctx.backendTotalPages),
});
/** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.goBackendPage(__VLS_ctx.backendTotalPages));
            // @ts-ignore
            [goBackendPage, backendPage, backendTotalPages, backendTotalPages,];
        } },
    ...{ class: "db-page-btn" },
    disabled: (__VLS_ctx.backendPage >= __VLS_ctx.backendTotalPages),
});
/** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "db-page-jump" },
});
/** @type {__VLS_StyleScopedClasses['db-page-jump']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onKeyup: (...[$event]) => {
            return (__VLS_ctx.goBackendPage(Number($event.target.value)));
            // @ts-ignore
            [goBackendPage, backendPage, backendTotalPages,];
        } },
    ...{ onChange: (...[$event]) => {
            return (__VLS_ctx.goBackendPage(Number($event.target.value)));
            // @ts-ignore
            [goBackendPage,];
        } },
    type: "number",
    value: (__VLS_ctx.backendPage),
    min: "1",
    max: (__VLS_ctx.backendTotalPages),
});
if (__VLS_ctx.showUpload) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showUpload))
                    throw 0;
                return (__VLS_ctx.showUpload = false);
                // @ts-ignore
                [showUpload, showUpload, backendPage, backendTotalPages,];
            } },
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onDragover: () => { } },
        ...{ onDrop: (__VLS_ctx.handleDrop) },
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showUpload))
                    throw 0;
                return (__VLS_ctx.fileInput?.click());
                // @ts-ignore
                [handleDrop, fileInput,];
            } },
        ...{ class: "drop-zone" },
    });
    /** @type {__VLS_StyleScopedClasses['drop-zone']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.handleFileSelect) },
        ref: "fileInput",
        type: "file",
        accept: ".csv,.zip,.rar,.stdf,.std,.stdf.gz,.std.gz,.csv.gz,.gz,.txt,.xls,.xlsx",
        multiple: true,
        hidden: true,
    });
    if (__VLS_ctx.uploadFiles.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "upload-list" },
        });
        /** @type {__VLS_StyleScopedClasses['upload-list']} */ ;
        for (const [f] of __VLS_vFor((__VLS_ctx.uploadFiles))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (f.name),
                ...{ class: "upload-item" },
            });
            /** @type {__VLS_StyleScopedClasses['upload-item']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (f.name);
            if (__VLS_ctx.isStdfFile(f.name)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "stdf-badge" },
                });
                /** @type {__VLS_StyleScopedClasses['stdf-badge']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "file-size" },
            });
            /** @type {__VLS_StyleScopedClasses['file-size']} */ ;
            (__VLS_ctx.formatSize(f.size));
            // @ts-ignore
            [handleFileSelect, uploadFiles, uploadFiles, isStdfFile, formatSize,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showUpload))
                    throw 0;
                return (__VLS_ctx.showUpload = false);
                // @ts-ignore
                [showUpload,];
            } },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleUpload) },
        ...{ class: "btn btn-primary" },
        disabled: (!__VLS_ctx.uploadFiles.length),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
}
if (__VLS_ctx.productDialog) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.productDialog))
                    throw 0;
                return (__VLS_ctx.productDialog = false);
                // @ts-ignore
                [uploadFiles, handleUpload, productDialog, productDialog,];
            } },
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.productForm.program),
        disabled: true,
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.productForm.prefix),
        disabled: true,
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (__VLS_ctx.saveProductName) },
        placeholder: "请输入产品名，如 HL5083A-BD",
    });
    (__VLS_ctx.productForm.product_name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.productDialog))
                    throw 0;
                return (__VLS_ctx.productDialog = false);
                // @ts-ignore
                [productDialog, productForm, productForm, productForm, saveProductName,];
            } },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.saveProductName) },
        ...{ class: "btn btn-primary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
}
if (__VLS_ctx.showMergeDialog) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showMergeDialog))
                    throw 0;
                return (__VLS_ctx.showMergeDialog = false);
                // @ts-ignore
                [saveProductName, showMergeDialog, showMergeDialog,];
            } },
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ style: {} },
    });
    (__VLS_ctx.selectedRows.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (__VLS_ctx.handleMerge) },
        placeholder: "请输入合并后的LOT名称",
    });
    (__VLS_ctx.mergeForm.new_name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        placeholder: "留空则使用第一条记录的批号",
    });
    (__VLS_ctx.mergeForm.new_lot_id);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        placeholder: "留空则使用第一条记录的晶圆编号",
    });
    (__VLS_ctx.mergeForm.new_wafer_id);
    if (__VLS_ctx.mergeError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "merge-error" },
        });
        /** @type {__VLS_StyleScopedClasses['merge-error']} */ ;
        (__VLS_ctx.mergeError);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showMergeDialog))
                    throw 0;
                return (__VLS_ctx.showMergeDialog = false);
                // @ts-ignore
                [selectedRows, showMergeDialog, handleMerge, mergeForm, mergeForm, mergeForm, mergeError, mergeError,];
            } },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleMerge) },
        ...{ class: "btn btn-primary" },
        disabled: (!__VLS_ctx.mergeForm.new_name || __VLS_ctx.merging),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.merging ? '合并中...' : '开始合并');
}
if (__VLS_ctx.showMergeManyDialog) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showMergeManyDialog))
                    throw 0;
                return (__VLS_ctx.showMergeManyDialog = false);
                // @ts-ignore
                [handleMerge, mergeForm, merging, merging, showMergeManyDialog, showMergeManyDialog,];
            } },
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ style: {} },
    });
    (__VLS_ctx.selectedRows.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (__VLS_ctx.handleMergeMany) },
        placeholder: "请输入合并后的LOT名称",
    });
    (__VLS_ctx.mergeManyForm.new_name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        placeholder: "留空则使用第一条记录的批号",
    });
    (__VLS_ctx.mergeManyForm.new_lot_id);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        placeholder: "留空则使用第一条记录的晶圆编号",
    });
    (__VLS_ctx.mergeManyForm.new_wafer_id);
    if (__VLS_ctx.mergeManyError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "merge-error" },
        });
        /** @type {__VLS_StyleScopedClasses['merge-error']} */ ;
        (__VLS_ctx.mergeManyError);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showMergeManyDialog))
                    throw 0;
                return (__VLS_ctx.showMergeManyDialog = false);
                // @ts-ignore
                [selectedRows, showMergeManyDialog, handleMergeMany, mergeManyForm, mergeManyForm, mergeManyForm, mergeManyError, mergeManyError,];
            } },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleMergeMany) },
        ...{ class: "btn btn-primary" },
        disabled: (!__VLS_ctx.mergeManyForm.new_name || __VLS_ctx.mergingMany),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.mergingMany ? '合并中...' : '开始合多');
}
if (__VLS_ctx.checkDialog) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.checkDialog))
                    throw 0;
                return (__VLS_ctx.checkDialog = false);
                // @ts-ignore
                [handleMergeMany, mergeManyForm, mergingMany, mergingMany, checkDialog, checkDialog,];
            } },
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal check-modal" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    /** @type {__VLS_StyleScopedClasses['check-modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.currentProgram);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "param-selector" },
    });
    /** @type {__VLS_StyleScopedClasses['param-selector']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "selector-header" },
    });
    /** @type {__VLS_StyleScopedClasses['selector-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        placeholder: "搜索参数...",
        ...{ class: "search-input" },
    });
    (__VLS_ctx.paramSearch);
    /** @type {__VLS_StyleScopedClasses['search-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "selection-info" },
    });
    /** @type {__VLS_StyleScopedClasses['selection-info']} */ ;
    (__VLS_ctx.selectedParams.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "param-list" },
    });
    /** @type {__VLS_StyleScopedClasses['param-list']} */ ;
    for (const [p] of __VLS_vFor((__VLS_ctx.filteredParams))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            key: (p),
            ...{ class: "param-item" },
        });
        /** @type {__VLS_StyleScopedClasses['param-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.checkDialog))
                        throw 0;
                    return (__VLS_ctx.onCheckboxClick($event, p));
                    // @ts-ignore
                    [currentProgram, paramSearch, selectedParams, filteredParams, onCheckboxClick,];
                } },
            type: "checkbox",
            value: (p),
        });
        (__VLS_ctx.selectedParams);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (p);
        // @ts-ignore
        [selectedParams,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "2",
        max: "10",
    });
    (__VLS_ctx.checkThreshold);
    if (__VLS_ctx.checkError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "merge-error" },
        });
        /** @type {__VLS_StyleScopedClasses['merge-error']} */ ;
        (__VLS_ctx.checkError);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.checkDialog))
                    throw 0;
                return (__VLS_ctx.checkDialog = false);
                // @ts-ignore
                [checkDialog, checkThreshold, checkError, checkError,];
            } },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.saveCheckConfig) },
        ...{ class: "btn btn-primary" },
        disabled: (!__VLS_ctx.selectedParams.length || __VLS_ctx.savingConfig),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.savingConfig ? '保存中...' : '开始分析');
}
if (__VLS_ctx.displayEditDialog.visible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeDisplayEditDialog) },
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal display-edit-modal" },
        ...{ style: (__VLS_ctx.displayEditModalStyle) },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    /** @type {__VLS_StyleScopedClasses['display-edit-modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.displayEditDialog.title);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.displayEditDialog.label);
    if (__VLS_ctx.displayEditDialog.field === 'data_type') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onKeyup: (__VLS_ctx.saveDisplayEdit) },
            value: (__VLS_ctx.displayEditDialog.value),
            ref: "displayEditInput",
            ...{ class: "field-select" },
        });
        /** @type {__VLS_StyleScopedClasses['field-select']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "CP",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "FT",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "QA",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "Summary",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "CP_LOT",
        });
    }
    else if (__VLS_ctx.displayEditDialog.field === 'test_machine') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onKeyup: (__VLS_ctx.saveDisplayEdit) },
            value: (__VLS_ctx.displayEditDialog.value),
            ref: "displayEditInput",
            ...{ class: "field-select" },
        });
        /** @type {__VLS_StyleScopedClasses['field-select']} */ ;
        for (const [opt] of __VLS_vFor((__VLS_ctx.uniqueColumnOptions('test_machine')))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (opt),
                value: (opt),
            });
            (opt);
            // @ts-ignore
            [selectedParams, saveCheckConfig, savingConfig, savingConfig, displayEditDialog, displayEditDialog, displayEditDialog, displayEditDialog, displayEditDialog, displayEditDialog, displayEditDialog, closeDisplayEditDialog, displayEditModalStyle, saveDisplayEdit, saveDisplayEdit, uniqueColumnOptions,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onKeyup: (__VLS_ctx.saveDisplayEdit) },
            ...{ onKeyup: (__VLS_ctx.closeDisplayEditDialog) },
            ref: "displayEditInput",
        });
        (__VLS_ctx.displayEditDialog.value);
    }
    if (__VLS_ctx.displayEditDialog.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "merge-error" },
        });
        /** @type {__VLS_StyleScopedClasses['merge-error']} */ ;
        (__VLS_ctx.displayEditDialog.error);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeDisplayEditDialog) },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.saveDisplayEdit) },
        ...{ class: "btn btn-primary" },
        disabled: (__VLS_ctx.displayEditDialog.saving),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.displayEditDialog.saving ? '保存中...' : '保存');
}
// @ts-ignore
[displayEditDialog, displayEditDialog, displayEditDialog, displayEditDialog, displayEditDialog, closeDisplayEditDialog, closeDisplayEditDialog, saveDisplayEdit, saveDisplayEdit,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
