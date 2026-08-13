import { reactive, computed, onMounted, nextTick, watch } from 'vue';
import * as echarts from 'echarts';
import api from '@/api';
import { useRouter } from 'vue-router';
import { AgGridVue } from 'ag-grid-vue3';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { ref, shallowRef } from 'vue';
// ── Global Caches to prevent re-fetching on view swap ──
const globalOvLoaded = ref(false);
const globalRangeType = ref('month');
const globalRangeValue = ref(3);
const globalFilterSelection = ref('month-3');
const globalOvProductName = ref('');
const globalOvProducts = shallowRef([]);
const globalOvWeeklyOutput = ref([]);
const globalOvOsats = ref([]);
export default {};
const __VLS_self = (await import('vue')).defineComponent({
    name: 'DataAnalysisView'
});
const __VLS_export = await (async () => {
    const router = useRouter();
    // Bind global cache
    const ovLoaded = globalOvLoaded;
    const rangeType = globalRangeType;
    const rangeValue = globalRangeValue;
    const filterSelection = globalFilterSelection;
    const ovProducts = globalOvProducts;
    const ovWeeklyOutput = globalOvWeeklyOutput;
    const ovOsats = globalOvOsats;
    const ovProductName = globalOvProductName;
    const filteredOvProducts = computed(() => {
        if (!ovProductName.value)
            return ovProducts.value;
        const query = ovProductName.value.toLowerCase().trim();
        return ovProducts.value.filter((p) => p.product_name && p.product_name.toLowerCase().includes(query));
    });
    function onFilterSelectionChange() {
        const parts = filterSelection.value.split('-');
        rangeType.value = parts[0];
        if (parts.length > 1) {
            rangeValue.value = parseInt(parts[1], 10);
        }
        else {
            rangeValue.value = null;
        }
        fetchOverview(true);
    }
    function getFilterLabel() {
        if (rangeType.value === 'month')
            return `${rangeValue.value}个月`;
        if (rangeType.value === 'year')
            return `${rangeValue.value}年`;
        if (rangeType.value === 'lot')
            return `${rangeValue.value} LOT`;
        if (rangeType.value === 'all')
            return '全部';
        return '';
    }
    // ── View switching ───────────────────────────────────────────────────────────
    const activeView = ref('overview');
    const deviceViewDevice = ref('');
    const deviceViewOsat = ref('');
    const deviceViewTester = ref('');
    function switchView(view) {
        activeView.value = view;
        if (view === 'overview') {
            nextTick(() => renderOverviewCharts());
        }
        else if (view === 'device') {
            selectedLotId.value = null; // Reset selected lot when entering device tab
            nextTick(() => renderDeviceCharts());
        }
    }
    if (typeof window !== 'undefined') {
        window.goToDeviceDetail = (deviceName, osat, tester) => {
            deviceViewDevice.value = deviceName;
            deviceViewOsat.value = osat || '';
            deviceViewTester.value = tester || '';
            switchView('device');
            fetchDeviceData();
        };
    }
    // ── AG Grid Common ───────────────────────────────────────────────────────────
    const defaultColDef = {
        sortable: true,
        resizable: true,
        filter: false, // Turned off filter per user request
        suppressMovable: true,
        menuTabs: []
    };
    const YieldRenderer = (p) => {
        const val = p.value;
        if (val == null)
            return `<div style="width: 100%;"><span style="color: #64748b;">-</span></div>`;
        let color = 'green';
        let fw = 'normal';
        if (val < 80) {
            color = 'red';
            fw = 'bold';
        }
        else if (val < 95) {
            color = 'orange';
        }
        return `<div style="width: 100%;"><span style="color: ${color}; font-weight: ${fw};">${val.toFixed(2)}%</span></div>`;
    };
    function formatWaferRanges(waferIds) {
        const nums = [];
        const nonNums = [];
        for (const x of waferIds) {
            if (x == null || x === '')
                continue;
            const str = String(x).trim();
            if (/^\d+$/.test(str)) {
                nums.push(parseInt(str, 10));
            }
            else {
                nonNums.push(str);
            }
        }
        if (nums.length === 0 && nonNums.length === 0)
            return '';
        const uniqueNums = Array.from(new Set(nums)).sort((a, b) => a - b);
        const ranges = [];
        if (uniqueNums.length > 0) {
            let start = uniqueNums[0];
            let prev = uniqueNums[0];
            for (let i = 1; i < uniqueNums.length; i++) {
                const cur = uniqueNums[i];
                if (cur === prev + 1) {
                    prev = cur;
                }
                else {
                    if (start === prev) {
                        ranges.push(String(start));
                    }
                    else {
                        ranges.push(`${start}-${prev}`);
                    }
                    start = cur;
                    prev = cur;
                }
            }
            if (start === prev) {
                ranges.push(String(start));
            }
            else {
                ranges.push(`${start}-${prev}`);
            }
        }
        ranges.push(...nonNums);
        return ranges.join(',');
    }
    const WafersDataRenderer = (p) => {
        const val = p.value;
        if (val === undefined || val === null)
            return '';
        const mergedId = p.data ? p.data.merged_id : null;
        if (mergedId) {
            return `
      <div style="line-height: 1.4; padding: 6px 0; text-align: center;">
        <a href="/lot/${mergedId}/bin" target="_blank" style="background-color: #fef08a; color: #1e3a8a; padding: 2px 6px; border-radius: 4px; text-decoration: underline; font-weight: bold; font-size: 13px;">${val}</a>
      </div>
    `;
        }
        return `
    <div style="line-height: 1.4; padding: 4px 0; text-align: center;">
      <div>${val}</div>
      <div style="font-size: 11px; margin-top: 2px;">
        <span class="merge-link" data-action="merge_lot" style="color: #1890ff; cursor: pointer; text-decoration: underline; font-weight: 500;">合并</span>
      </div>
    </div>
  `;
    };
    const SingleBinRenderer = (p) => {
        const bin = p.value;
        if (!bin)
            return '';
        return `<div style="display:flex; width: 100%; font-family: 'Courier New', Courier, monospace; font-size: 13px;">
      <span style="display:inline-block; width: 65px; font-weight: 600; color: #db2777; text-align: left;">${bin.bin}</span>
      <span style="display:inline-block; width: 55px; text-align: right;">${bin.count}</span>
      <span style="display:inline-block; width: 65px; color: #db2777; text-align: right;">${bin.pct}%</span>
    </div>`;
    };
    const DeviceLinkRenderer = (p) => {
        if (!p.value)
            return '';
        const osat = p.data ? (p.data.osat || '') : '';
        return `<button class="device-link" onclick="if(window.goToDeviceDetail) window.goToDeviceDetail('${p.value}', '${osat}')">${p.value}</button>`;
    };
    const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
    // ══════════════════════════════════════════════════════════════════
    //  OVERVIEW STATE
    // ══════════════════════════════════════════════════════════════════
    const ovLoading = ref(false);
    const outputChartRef = ref(null);
    const pieChartRef = ref(null);
    const osatPieChartRef = ref(null);
    let outputChart = null;
    let pieChart = null;
    let osatPieChart = null;
    const failBinCols = [];
    for (let i = 0; i < 5; i++) {
        failBinCols.push({
            colId: `fail_bin_${i}`,
            headerName: `Fail Bin ${i + 1}`,
            valueGetter: (p) => p.data.top5_fail_bins ? p.data.top5_fail_bins[i] : null,
            cellRenderer: SingleBinRenderer,
            width: 200
        });
    }
    const ovColDefs = [
        { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 60, pinned: 'left' },
        { field: 'product_name', headerName: 'Device（产品名）', width: 180, pinned: 'left', cellRenderer: DeviceLinkRenderer },
        { field: 'osat', headerName: 'OSAT', width: 110, pinned: 'left' },
        { field: 'wafers', headerName: 'Wafers', width: 90, type: 'numericColumn' },
        { field: 'avg_wafer_time_h', headerName: 'Time(h)', width: 90, type: 'numericColumn' },
        { field: 'bin1_k', headerName: 'Bin1(K)', width: 90, type: 'numericColumn' },
        { field: 'avg_yield', headerName: '平均良率', width: 100, cellRenderer: YieldRenderer },
        ...failBinCols
    ];
    async function fetchOverview(force = false) {
        if (ovLoaded.value && !force) {
            // Already loaded, just render charts
            nextTick(() => renderOverviewCharts());
            return;
        }
        ovLoading.value = true;
        try {
            const params = {
                range_type: rangeType.value,
                range_value: rangeType.value === 'all' ? null : rangeValue.value
            };
            const resp = await api.get('/lots/mp-yield/overview', { params });
            ovProducts.value = resp.products || [];
            ovWeeklyOutput.value = resp.weekly_output || [];
            ovOsats.value = resp.osats || [];
            ovLoaded.value = true;
            nextTick(() => renderOverviewCharts());
        }
        catch (error) {
            console.error('Failed to fetch overview:', error);
        }
        finally {
            ovLoading.value = false;
        }
    }
    function renderOverviewCharts() {
        if (activeView.value !== 'overview')
            return;
        if (outputChartRef.value) {
            if (outputChart && outputChart.getDom() !== outputChartRef.value) {
                outputChart.dispose();
                outputChart = null;
            }
            if (!outputChart)
                outputChart = echarts.init(outputChartRef.value);
            else
                outputChart.resize();
            const weeks = ovWeeklyOutput.value.map((d) => d.week);
            const wafers = ovWeeklyOutput.value.map((d) => d.wafers);
            outputChart.setOption({
                tooltip: { trigger: 'axis' },
                grid: { left: 48, right: 16, top: 12, bottom: 40 },
                xAxis: { type: 'category', data: weeks, axisLabel: { fontSize: 11, rotate: weeks.length > 8 ? 30 : 0 } },
                yAxis: {
                    type: 'value',
                    name: 'Wafers',
                    nameLocation: 'middle',
                    nameRotate: 90,
                    nameGap: 36,
                    nameTextStyle: { fontSize: 11, color: '#6b7280' },
                },
                series: [{
                        data: wafers, type: 'bar', barMaxWidth: 40,
                        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
                        label: { show: wafers.length <= 20, position: 'top', fontSize: 10 }
                    }]
            }, true);
        }
        if (pieChartRef.value) {
            if (pieChart && pieChart.getDom() !== pieChartRef.value) {
                pieChart.dispose();
                pieChart = null;
            }
            if (!pieChart)
                pieChart = echarts.init(pieChartRef.value);
            else
                pieChart.resize();
            const totalBin1 = ovProducts.value.reduce((s, p) => s + (p.bin1_k || 0), 0);
            // 排序并限制前9个产品，第10个及以后合并为 others
            const sortedProducts = [...ovProducts.value]
                .filter((p) => p.bin1_k > 0)
                .sort((a, b) => b.bin1_k - a.bin1_k);
            const top9Data = sortedProducts.slice(0, 9).map((p, i) => ({
                name: p.product_name,
                value: p.bin1_k,
                itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
            }));
            const restSum = sortedProducts.slice(9).reduce((sum, p) => sum + p.bin1_k, 0);
            if (restSum > 0) {
                top9Data.push({
                    name: 'others',
                    value: restSum,
                    itemStyle: { color: '#9e9e9e' },
                });
            }
            const pieData = top9Data;
            pieChart.setOption({
                tooltip: {
                    trigger: 'item',
                    formatter: (p) => `${p.name}<br/>Bin1: <b>${p.value.toLocaleString()}K</b><br/>占比: <b>${p.percent}%</b>`,
                },
                legend: {
                    orient: 'vertical',
                    left: 0,
                    width: 100,
                    top: 'middle',
                    itemGap: 5,
                    itemWidth: 12,
                    itemHeight: 12,
                    textStyle: { fontSize: 10 },
                    formatter: (name) => {
                        const item = pieData.find((p) => p.name === name);
                        const pct = totalBin1 > 0 ? ((item?.value || 0) / totalBin1 * 100).toFixed(1) : '0';
                        return `${name}  ${pct}%`;
                    },
                },
                series: [{
                        type: 'pie',
                        radius: ['35%', '85%'],
                        center: ['67%', '50%'],
                        data: pieData,
                        label: {
                            show: true,
                            position: 'outside',
                            formatter: '{b}',
                            fontSize: 10,
                        },
                        labelLine: {
                            show: true,
                            length: 6,
                            length2: 5,
                        },
                        emphasis: {
                            itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' },
                            scale: true, scaleSize: 4,
                        },
                    }],
            }, true);
        }
        if (osatPieChartRef.value) {
            if (osatPieChart && osatPieChart.getDom() !== osatPieChartRef.value) {
                osatPieChart.dispose();
                osatPieChart = null;
            }
            if (!osatPieChart)
                osatPieChart = echarts.init(osatPieChartRef.value);
            else
                osatPieChart.resize();
            const totalOsatBin1 = ovOsats.value.reduce((s, p) => s + (p.bin1_k || 0), 0);
            const sortedOsats = [...ovOsats.value]
                .filter((p) => p.bin1_k > 0)
                .sort((a, b) => b.bin1_k - a.bin1_k);
            const pieData = sortedOsats.map((p, i) => ({
                name: p.osat_name,
                value: p.bin1_k,
                itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
            }));
            osatPieChart.setOption({
                tooltip: {
                    trigger: 'item',
                    formatter: (p) => `${p.name}<br/>Bin1: <b>${p.value.toLocaleString()}K</b><br/>占比: <b>${p.percent}%</b>`,
                },
                legend: {
                    orient: 'vertical',
                    right: 4,
                    top: 'middle',
                    itemGap: 5,
                    itemWidth: 12,
                    itemHeight: 12,
                    textStyle: { fontSize: 10 },
                    formatter: (name) => {
                        const item = pieData.find((p) => p.name === name);
                        const pct = totalOsatBin1 > 0 ? ((item?.value || 0) / totalOsatBin1 * 100).toFixed(1) : '0';
                        return `${name}  ${pct}%`;
                    },
                },
                series: [{
                        type: 'pie',
                        radius: ['35%', '85%'],
                        center: ['33%', '50%'],
                        data: pieData,
                        label: {
                            show: true,
                            position: 'outside',
                            formatter: '{b}',
                            fontSize: 10,
                        },
                        labelLine: {
                            show: true,
                            length: 6,
                            length2: 5,
                        },
                        emphasis: {
                            itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' },
                            scale: true, scaleSize: 4,
                        },
                    }],
            }, true);
        }
    }
    // ══════════════════════════════════════════════════════════════════
    //  DETAIL STATE
    // ══════════════════════════════════════════════════════════════════
    const loading = ref(false);
    const items = shallowRef([]);
    const filters = reactive({
        osat_name: '',
        product_name: '',
        lot_id: '',
        wafer_id: '',
        program: '',
        test_date_from: '',
        test_date_to: ''
    });
    const total = ref(0);
    const page = ref(1);
    const pageSize = ref(50);
    const detailColDefs = [
        { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 60, pinned: 'left' },
        { field: 'osat_name', headerName: 'OSAT', width: 90, pinned: 'left' },
        { field: 'product_name', headerName: 'Device', width: 140, pinned: 'left' },
        { field: 'lot_id', headerName: 'LOT ID', width: 140, pinned: 'left', cellClass: 'selectable-cell' },
        { field: 'wafer_id', headerName: 'WAFER ID', width: 100, pinned: 'left' },
        { field: 'total', headerName: 'TOTAL', width: 90, type: 'numericColumn' },
        { field: 'pass', headerName: 'PASS', width: 90, type: 'numericColumn' },
        { field: 'yield_rate', headerName: 'YIELD', width: 90, cellRenderer: YieldRenderer },
        { field: 'program', headerName: 'Test Program', width: 315 },
        { field: 'mp_tester', headerName: 'MP Tester', width: 110 },
        { field: 'probecard', headerName: 'Probe Card', width: 217 },
        { field: 'test_start', headerName: 'Test Start', width: 150 },
        { field: 'test_date', headerName: 'Test End', width: 150 },
        { field: 'duration_h', headerName: 'Time(h)', width: 90, type: 'numericColumn' }
    ];
    for (let i = 1; i <= 130; i++) {
        detailColDefs.push({
            field: 'sbin' + i,
            headerName: 'Sbin' + i,
            width: 75,
            type: 'numericColumn',
            valueFormatter: (p) => p.value === 0 ? '' : p.value
        });
    }
    async function fetchData() {
        loading.value = true;
        try {
            const params = { page: page.value, page_size: pageSize.value };
            if (filters.osat_name)
                params.osat_name = filters.osat_name;
            if (filters.product_name)
                params.product_name = filters.product_name;
            if (filters.lot_id)
                params.lot_id = filters.lot_id;
            if (filters.wafer_id)
                params.wafer_id = filters.wafer_id;
            if (filters.program)
                params.program = filters.program;
            if (filters.test_date_from)
                params.test_date_from = filters.test_date_from;
            if (filters.test_date_to)
                params.test_date_to = filters.test_date_to;
            const resp = await api.get('/lots/mp-yield/list', { params });
            items.value = resp.items || [];
            total.value = resp.total || 0;
        }
        catch (error) {
            console.error('Failed to fetch MP Yield list:', error);
        }
        finally {
            loading.value = false;
        }
    }
    const maxPage = computed(() => Math.ceil(total.value / pageSize.value) || 1);
    function handleSearch() {
        page.value = 1;
        fetchData();
    }
    let searchTimeout;
    function debouncedSearch() {
        if (searchTimeout)
            clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            handleSearch();
        }, 300);
    }
    function handleReset() {
        filters.osat_name = '';
        filters.product_name = '';
        filters.lot_id = '';
        filters.wafer_id = '';
        filters.program = '';
        filters.test_date_from = '';
        filters.test_date_to = '';
        handleSearch();
    }
    // ══════════════════════════════════════════════════════════════════
    //  DEVICE DRILL-DOWN STATE
    // ══════════════════════════════════════════════════════════════════
    const deviceLoading = ref(false);
    const deviceLots = shallowRef([]);
    const deviceWeeklyOutput = ref([]);
    const deviceWafers = shallowRef([]); // Store all wafer data for the active device
    const deviceCpLotsMap = ref(new Map());
    const selectedLotId = ref(null); // Selected LOT ID for wafer-level drill-down
    const productTop5Bins = ref([]); // Top 5 failing bins for the active device
    const selectedBins = ref({}); // Legend selection states for charts
    const deviceOutputChartRef = ref(null);
    const deviceYieldChartRef = ref(null);
    const waferYieldChartRef = ref(null); // Wafer yield chart DOM ref
    let deviceOutputChart = null;
    let deviceYieldChart = null;
    let waferYieldChart = null; // Wafer yield chart instance
    const deviceGroupMode = ref('LOT');
    const deviceLotFilterInput = ref('');
    const filteredDeviceLots = computed(() => {
        const val = deviceLotFilterInput.value.trim().toLowerCase();
        if (!val)
            return deviceLots.value;
        return deviceLots.value.filter(item => {
            const lotId = (item.lot_id || '').toString().toLowerCase();
            const program = (item.program || '').toString().toLowerCase();
            return lotId.includes(val) || program.includes(val);
        });
    });
    watch(deviceViewDevice, () => {
        deviceLotFilterInput.value = '';
    });
    watch(deviceGroupMode, () => {
        deviceLotFilterInput.value = '';
    });
    function setDeviceGroupMode(mode) {
        if (deviceGroupMode.value === mode)
            return;
        deviceGroupMode.value = mode;
        if (deviceWafers.value && deviceWafers.value.length > 0) {
            processDeviceWafers(deviceWafers.value);
        }
    }
    const isMergingLot = ref(false);
    async function handleMergeLot(lotId) {
        if (isMergingLot.value)
            return;
        isMergingLot.value = true;
        try {
            const res = await api.post('/lots/merge-cp-lot', {
                lot_id: lotId,
                product_name: deviceViewDevice.value
            });
            if (res && res.id) {
                const url = router.resolve(`/lot/${res.id}`).href;
                window.open(url, '_blank');
                fetchDeviceData();
            }
            else {
                alert('合并失败：返回结果异常');
            }
        }
        catch (error) {
            console.error('Merge CP Lot failed:', error);
            alert('合并 CP LOT 失败: ' + (error.response?.data?.detail || error.message || error));
        }
        finally {
            isMergingLot.value = false;
        }
    }
    function onDeviceGridCellClicked(params) {
        const event = params.event;
        const action = event?.target?.dataset?.action;
        if (action === 'merge_lot') {
            const lotId = params.data.lot_id;
            if (lotId) {
                handleMergeLot(lotId);
            }
        }
    }
    const deviceColDefs = computed(() => {
        const isPgmMode = deviceGroupMode.value === 'PGM';
        return [
            { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 60, pinned: 'left' },
            {
                field: isPgmMode ? 'program' : 'lot_id',
                headerName: isPgmMode ? 'PGM' : 'LOT ID',
                width: isPgmMode ? 280 : 180,
                pinned: 'left',
                cellClass: 'selectable-cell'
            },
            ...(isPgmMode ? [] : [
                {
                    field: 'wafers_data',
                    headerName: 'WAFERS_DATA',
                    width: 130,
                    cellRenderer: WafersDataRenderer
                }
            ]),
            { field: 'test_start', headerName: '测试时间(最早)', width: 160 },
            { field: 'wafers', headerName: 'Wafers', width: 90, type: 'numericColumn' },
            { field: 'avg_wafer_time_h', headerName: 'Time(h)', width: 90, type: 'numericColumn' },
            { field: 'bin1_k', headerName: 'Bin1(K)', width: 90, type: 'numericColumn' },
            { field: 'avg_yield', headerName: '平均良率', width: 100, cellRenderer: YieldRenderer },
            ...failBinCols
        ];
    });
    function getWeekString(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime()))
            return 'Unknown';
        const year = d.getFullYear();
        const firstDay = new Date(year, 0, 1);
        const pastDaysOfYear = (d.getTime() - firstDay.getTime()) / 86400000;
        const weekNum = Math.ceil((pastDaysOfYear + firstDay.getDay() + 1) / 7);
        return `${year}-W${weekNum.toString().padStart(2, '0')}`;
    }
    async function fetchDeviceData() {
        deviceLoading.value = true;
        try {
            // 1. Fetch merged CP_LOTs for this product
            const cpLotsResp = await api.get('/lots', {
                params: {
                    product_name: deviceViewDevice.value,
                    data_type: 'CP_LOT',
                    page: 1,
                    page_size: 200
                }
            });
            const cpLotsMap = new Map();
            if (cpLotsResp && cpLotsResp.items) {
                for (const item of cpLotsResp.items) {
                    if (item.lot_id) {
                        cpLotsMap.set(item.lot_id.trim().toLowerCase(), item.id);
                    }
                }
            }
            deviceCpLotsMap.value = cpLotsMap;
            // Fetch ALL pages to correctly aggregate LOTs for this device
            let allWafers = [];
            let p = 1;
            let totalP = 1;
            while (p <= totalP) {
                const params = {
                    product_name: deviceViewDevice.value,
                    range_type: rangeType.value,
                    range_value: rangeType.value === 'all' ? null : rangeValue.value,
                    page: p,
                    page_size: 200
                };
                if (deviceViewOsat.value) {
                    params.osat_name = deviceViewOsat.value;
                }
                if (deviceViewTester.value) {
                    params.mp_tester = deviceViewTester.value;
                }
                const resp = await api.get('/lots/mp-yield/list', { params });
                allWafers = allWafers.concat(resp.items || []);
                totalP = Math.ceil((resp.total || 0) / 200);
                p++;
            }
            deviceWafers.value = allWafers; // Store all wafers for wafer-level yield lookup
            processDeviceWafers(allWafers);
        }
        catch (error) {
            console.error('Failed to fetch device drill-down data:', error);
        }
        finally {
            deviceLoading.value = false;
        }
    }
    function processDeviceWafers(allWafers) {
        // Compute overall top 5 failing bins for this device across all fetched wafers
        const overallSbinSums = {};
        for (const w of allWafers) {
            for (let i = 3; i <= 130; i++) {
                overallSbinSums[i] = (overallSbinSums[i] || 0) + (w['sbin' + i] || 0);
            }
        }
        const overallSbinArr = [];
        for (let i = 3; i <= 130; i++) {
            if (overallSbinSums[i] > 0) {
                overallSbinArr.push({
                    binNumber: i,
                    bin: `Sbin${i}`,
                    count: overallSbinSums[i]
                });
            }
        }
        overallSbinArr.sort((a, b) => b.count - a.count);
        productTop5Bins.value = overallSbinArr.slice(0, 5);
        // Initialize selectedBins: default only display '平均良率', 'Wafer良率' and Top 1 failing bin
        const initSelected = {
            '平均良率': true,
            'Wafer良率': true
        };
        productTop5Bins.value.forEach((topBin, idx) => {
            initSelected[topBin.bin] = (idx === 0);
        });
        selectedBins.value = initSelected;
        // Group by Mode (LOT or PGM)
        const isPgmMode = deviceGroupMode.value === 'PGM';
        const groups = {};
        for (const w of allWafers) {
            const key = isPgmMode ? (w.program || 'Unknown') : (w.lot_id || 'Unknown');
            if (!groups[key])
                groups[key] = [];
            groups[key].push(w);
        }
        const compiledLots = [];
        const weeklyCount = {};
        for (const key in groups) {
            const wList = groups[key];
            let totalTime = 0;
            let totalWafersWithTime = 0;
            let totalBin1 = 0;
            let totalPass = 0;
            let totalTotal = 0;
            const sbinSums = {};
            let minTestStart = '';
            for (const w of wList) {
                if (w.duration_h != null && w.duration_h > 0) {
                    totalTime += w.duration_h;
                    totalWafersWithTime++;
                }
                totalBin1 += (w.sbin1 || 0);
                totalPass += (w.pass || 0);
                totalTotal += (w.total || 0);
                for (let i = 1; i <= 130; i++) {
                    sbinSums[i] = (sbinSums[i] || 0) + (w['sbin' + i] || 0);
                }
                const tStart = w.test_start || w.test_date || w.upload_date;
                if (tStart) {
                    if (!minTestStart || tStart < minTestStart)
                        minTestStart = tStart;
                }
            }
            const weekStr = getWeekString(minTestStart || new Date().toISOString());
            weeklyCount[weekStr] = (weeklyCount[weekStr] || 0) + wList.length;
            const avgYield = totalTotal > 0 ? (totalPass / totalTotal) * 100 : 0;
            const bin1k = totalBin1 / 1000;
            const sbinArr = [];
            for (let i = 3; i <= 130; i++) {
                if (sbinSums[i] > 0) {
                    sbinArr.push({
                        bin: `Sbin${i}`,
                        count: sbinSums[i],
                        pct: totalTotal > 0 ? ((sbinSums[i] / totalTotal) * 100).toFixed(2) : '0.00'
                    });
                }
            }
            sbinArr.sort((a, b) => b.count - a.count);
            const top5FailRates = {};
            for (const topBin of productTop5Bins.value) {
                const binVal = sbinSums[topBin.binNumber] || 0;
                top5FailRates[topBin.bin] = totalTotal > 0 ? (binVal / totalTotal) * 100 : 0;
            }
            const waferIds = wList.map(w => w.wafer_id).filter(id => id != null);
            const lotDataStr = formatWaferRanges(waferIds);
            const mergedId = isPgmMode ? undefined : deviceCpLotsMap.value.get(key.trim().toLowerCase());
            const cpWaferCount = wList[0]?.cp_wafer_count || 0;
            compiledLots.push({
                lot_id: isPgmMode ? undefined : key,
                program: isPgmMode ? key : undefined,
                lot_data: isPgmMode ? undefined : lotDataStr,
                wafers_data: isPgmMode ? undefined : cpWaferCount,
                merged_id: mergedId,
                wafers: wList.length,
                avg_wafer_time_h: totalWafersWithTime > 0 ? (totalTime / totalWafersWithTime).toFixed(2) : null,
                bin1_k: bin1k.toFixed(1),
                avg_yield: avgYield,
                top5_fail_bins: sbinArr.slice(0, 5),
                top5_fail_rates: top5FailRates,
                test_start: minTestStart
            });
        }
        compiledLots.sort((a, b) => {
            const tA = a.test_start || '';
            const tB = b.test_start || '';
            if (tA === tB)
                return 0;
            return tA > tB ? 1 : -1;
        });
        deviceLots.value = compiledLots;
        const weeks = Object.keys(weeklyCount).sort();
        deviceWeeklyOutput.value = weeks.map(w => ({
            week: w,
            wafers: weeklyCount[w]
        }));
        nextTick(() => {
            renderDeviceCharts();
            if (selectedLotId.value) {
                const lotExists = compiledLots.some(c => (isPgmMode ? c.program : c.lot_id) === selectedLotId.value);
                if (lotExists) {
                    renderWaferYieldChart();
                }
                else {
                    selectedLotId.value = null;
                }
            }
        });
    }
    function getProgramVersion(programName) {
        if (!programName)
            return '';
        const matches = [...programName.matchAll(/V\d+/gi)];
        if (matches.length > 0) {
            return matches[matches.length - 1][0];
        }
        const parts = programName.split('_');
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.length < 15)
            return lastPart;
        return programName.length > 10 ? programName.substring(programName.length - 10) : programName;
    }
    function renderDeviceCharts() {
        if (activeView.value !== 'device')
            return;
        if (deviceOutputChartRef.value) {
            if (deviceOutputChart && deviceOutputChart.getDom() !== deviceOutputChartRef.value) {
                deviceOutputChart.dispose();
                deviceOutputChart = null;
            }
            if (!deviceOutputChart)
                deviceOutputChart = echarts.init(deviceOutputChartRef.value);
            else
                deviceOutputChart.resize();
            const weeks = deviceWeeklyOutput.value.map((d) => d.week);
            const wafers = deviceWeeklyOutput.value.map((d) => d.wafers);
            deviceOutputChart.setOption({
                tooltip: { trigger: 'axis' },
                grid: { left: 48, right: 16, top: 12, bottom: 40 },
                xAxis: { type: 'category', data: weeks, axisLabel: { fontSize: 11, rotate: weeks.length > 8 ? 30 : 0 } },
                yAxis: {
                    type: 'value',
                    name: 'Wafers',
                    nameLocation: 'middle',
                    nameRotate: 90,
                    nameGap: 36,
                    nameTextStyle: { fontSize: 11, color: '#6b7280' },
                },
                series: [{
                        data: wafers, type: 'bar', barMaxWidth: 40,
                        itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
                        label: { show: wafers.length <= 20, position: 'top', fontSize: 10 }
                    }]
            }, true);
        }
        if (deviceYieldChartRef.value) {
            if (deviceYieldChart && deviceYieldChart.getDom() !== deviceYieldChartRef.value) {
                deviceYieldChart.dispose();
                deviceYieldChart = null;
            }
            if (!deviceYieldChart) {
                deviceYieldChart = echarts.init(deviceYieldChartRef.value);
            }
            else {
                deviceYieldChart.resize();
            }
            const isPgmMode = deviceGroupMode.value === 'PGM';
            const lotIds = deviceLots.value.map(l => isPgmMode ? l.program : l.lot_id);
            const yields = deviceLots.value.map(l => l.avg_yield.toFixed(2));
            // Formatted labels for x-axis display
            const xAxisLabels = deviceLots.value.map(l => {
                if (isPgmMode) {
                    return getProgramVersion(l.program);
                }
                return l.lot_id;
            });
            // Listen to axis pointer updates to dynamically sync wafer yield chart on hover
            deviceYieldChart.off('updateAxisPointer');
            deviceYieldChart.on('updateAxisPointer', (event) => {
                const axesInfo = event.axesInfo;
                if (axesInfo && axesInfo.length > 0) {
                    const dataIndex = axesInfo[0].value;
                    if (typeof dataIndex === 'number' && dataIndex >= 0 && dataIndex < lotIds.length) {
                        const hoveredLotId = lotIds[dataIndex];
                        if (hoveredLotId && selectedLotId.value !== hoveredLotId) {
                            selectedLotId.value = hoveredLotId;
                        }
                    }
                }
            });
            let rightMax = 0;
            const top1BinName = productTop5Bins.value[0]?.bin;
            if (top1BinName) {
                for (const lot of deviceLots.value) {
                    const val = lot.top5_fail_rates?.[top1BinName] || 0;
                    if (val > rightMax) {
                        rightMax = val;
                    }
                }
            }
            if (rightMax <= 0) {
                rightMax = 5;
            }
            const series = [
                {
                    name: '平均良率',
                    data: yields,
                    type: 'line',
                    smooth: true,
                    yAxisIndex: 0,
                    itemStyle: { color: '#f59e0b' },
                    lineStyle: { width: 3 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(245, 158, 11, 0.2)' },
                            { offset: 1, color: 'rgba(245, 158, 11, 0.02)' }
                        ])
                    },
                    z: 10
                }
            ];
            const top5Colors = ['#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];
            productTop5Bins.value.forEach((topBin, idx) => {
                const binName = topBin.bin;
                const binData = deviceLots.value.map(l => {
                    const val = l.top5_fail_rates?.[binName];
                    return val !== undefined ? parseFloat(val.toFixed(3)) : 0;
                });
                series.push({
                    name: binName,
                    data: binData,
                    type: 'line',
                    smooth: true,
                    yAxisIndex: 1,
                    itemStyle: { color: top5Colors[idx] },
                    showSymbol: false,
                    lineStyle: { width: 1.5, type: 'dashed' }
                });
            });
            deviceYieldChart.setOption({
                tooltip: {
                    trigger: 'axis',
                    formatter: (params) => {
                        const dataIndex = params[0].dataIndex;
                        const fullLabel = lotIds[dataIndex] || params[0].name;
                        let html = `<b>${fullLabel}</b><br/>`;
                        params.forEach((p) => {
                            const val = parseFloat(p.value);
                            if (p.seriesName === '平均良率') {
                                html += `${p.marker} 平均良率: <b>${val.toFixed(2)}%</b><br/>`;
                            }
                            else {
                                html += `${p.marker} ${p.seriesName} 失效: <b>${val.toFixed(3)}%</b><br/>`;
                            }
                        });
                        return html;
                    }
                },
                legend: {
                    data: ['平均良率', ...productTop5Bins.value.map(b => b.bin)],
                    selected: selectedBins.value,
                    top: 0,
                    textStyle: { fontSize: 11, color: '#374151' }
                },
                grid: { left: 50, right: 50, top: 35, bottom: 40 },
                xAxis: { type: 'category', data: xAxisLabels, axisLabel: { fontSize: 11, rotate: 30 } },
                yAxis: [
                    {
                        type: 'value',
                        min: 50,
                        max: 100,
                        interval: 10,
                        axisLabel: { formatter: '{value}%' },
                        nameTextStyle: { fontSize: 11, color: '#6b7280' },
                    },
                    {
                        type: 'value',
                        name: 'Top5失效',
                        min: 0,
                        max: rightMax,
                        interval: rightMax / 5,
                        axisLabel: {
                            formatter: (val) => val.toFixed(2) + '%'
                        },
                        nameTextStyle: { fontSize: 11, color: '#6b7280' },
                        splitLine: { show: false }
                    }
                ],
                series: series
            }, true);
            // Listen to legend selections to dynamically synchronize with the wafer chart
            deviceYieldChart.off('legendselectchanged');
            deviceYieldChart.on('legendselectchanged', (event) => {
                selectedBins.value = { ...event.selected };
                if (waferYieldChart) {
                    waferYieldChart.setOption({
                        legend: {
                            selected: selectedBins.value
                        }
                    });
                }
            });
        }
    }
    function renderWaferYieldChart() {
        if (activeView.value !== 'device' || !selectedLotId.value || !waferYieldChartRef.value)
            return;
        if (waferYieldChart && waferYieldChart.getDom() !== waferYieldChartRef.value) {
            waferYieldChart.dispose();
            waferYieldChart = null;
        }
        if (!waferYieldChart) {
            waferYieldChart = echarts.init(waferYieldChartRef.value);
        }
        else {
            waferYieldChart.resize();
        }
        // Filter wafer data belonging to the selected LOT or PGM
        const isPgmMode = deviceGroupMode.value === 'PGM';
        const lotWafers = deviceWafers.value.filter((w) => {
            return isPgmMode ? (w.program === selectedLotId.value) : (w.lot_id === selectedLotId.value);
        });
        if (isPgmMode) {
            lotWafers.sort((a, b) => {
                const tA = a.test_start || a.test_date || a.upload_date || '';
                const tB = b.test_start || b.test_date || b.upload_date || '';
                if (tA === tB)
                    return 0;
                return tA > tB ? 1 : -1;
            });
        }
        // Map wafer data to slots
        const numWafers = isPgmMode ? lotWafers.length : 25;
        const waferData = Array(numWafers).fill(null);
        if (isPgmMode) {
            for (let i = 0; i < lotWafers.length; i++) {
                waferData[i] = lotWafers[i].yield_rate;
            }
        }
        else {
            for (const w of lotWafers) {
                const wId = parseInt(w.wafer_id, 10);
                if (wId >= 1 && wId <= 25) {
                    waferData[wId - 1] = w.yield_rate;
                }
            }
        }
        const top5WaferSeriesData = {};
        productTop5Bins.value.forEach(topBin => {
            top5WaferSeriesData[topBin.bin] = Array(numWafers).fill(null);
        });
        if (isPgmMode) {
            for (let i = 0; i < lotWafers.length; i++) {
                const w = lotWafers[i];
                productTop5Bins.value.forEach(topBin => {
                    const binVal = w['sbin' + topBin.binNumber] || 0;
                    const totalVal = w.total || 0;
                    top5WaferSeriesData[topBin.bin][i] = totalVal > 0 ? (binVal / totalVal) * 100 : 0;
                });
            }
        }
        else {
            for (const w of lotWafers) {
                const wId = parseInt(w.wafer_id, 10);
                if (wId >= 1 && wId <= 25) {
                    productTop5Bins.value.forEach(topBin => {
                        const binVal = w['sbin' + topBin.binNumber] || 0;
                        const totalVal = w.total || 0;
                        top5WaferSeriesData[topBin.bin][wId - 1] = totalVal > 0 ? (binVal / totalVal) * 100 : 0;
                    });
                }
            }
        }
        let rightMax = 0;
        const top1BinName = productTop5Bins.value[0]?.bin;
        if (top1BinName && top5WaferSeriesData[top1BinName]) {
            top5WaferSeriesData[top1BinName].forEach(val => {
                if (val !== null && val > rightMax) {
                    rightMax = val;
                }
            });
        }
        if (rightMax <= 0) {
            rightMax = 5;
        }
        const selectedLegend = {
            'Wafer良率': selectedBins.value['Wafer良率'] !== false
        };
        productTop5Bins.value.forEach((topBin) => {
            selectedLegend[topBin.bin] = (selectedBins.value[topBin.bin] === true);
        });
        const series = [
            {
                name: 'Wafer良率',
                data: waferData,
                type: 'line',
                smooth: true,
                yAxisIndex: 0,
                connectNulls: false,
                showSymbol: true,
                symbolSize: 6,
                itemStyle: { color: '#0ea5e9' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(14, 165, 233, 0.3)' },
                        { offset: 1, color: 'rgba(14, 165, 233, 0.05)' }
                    ])
                },
                z: 10
            }
        ];
        const top5Colors = ['#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];
        productTop5Bins.value.forEach((topBin, idx) => {
            const binName = topBin.bin;
            const binData = top5WaferSeriesData[binName];
            series.push({
                name: binName,
                data: binData,
                type: 'line',
                smooth: true,
                yAxisIndex: 1,
                connectNulls: false,
                showSymbol: false,
                itemStyle: { color: top5Colors[idx] },
                lineStyle: { width: 1.5, type: 'dashed' }
            });
        });
        const xAxisData = isPgmMode
            ? lotWafers.map((w, idx) => w.wafer_id || `${idx + 1}`)
            : Array.from({ length: 25 }, (_, i) => i + 1);
        waferYieldChart.setOption({
            animation: false, // Disable render animation for instant loading feedback
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    let html = `<b>Wafer ${params[0].name}</b><br/>`;
                    let hasData = false;
                    params.forEach((p) => {
                        if (p.value !== null && p.value !== undefined) {
                            hasData = true;
                            const val = parseFloat(p.value);
                            if (p.seriesName === 'Wafer良率') {
                                html += `${p.marker} Wafer良率: <b>${val.toFixed(2)}%</b><br/>`;
                            }
                            else {
                                html += `${p.marker} ${p.seriesName} 失效: <b>${val.toFixed(3)}%</b><br/>`;
                            }
                        }
                    });
                    if (!hasData)
                        return `Wafer ${params[0].name}: No Data`;
                    return html;
                }
            },
            legend: {
                data: ['Wafer良率', ...productTop5Bins.value.map(b => b.bin)],
                selected: selectedLegend,
                top: 0,
                textStyle: { fontSize: 11, color: '#374151' }
            },
            grid: { left: 50, right: 50, top: 35, bottom: 44 },
            xAxis: {
                type: 'category',
                data: xAxisData,
                name: selectedLotId.value,
                nameLocation: 'center',
                nameGap: 24,
                nameTextStyle: {
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: '#475569'
                },
                axisLabel: {
                    interval: isPgmMode ? 'auto' : 0, // Show all wafer labels 1-25 or auto in PGM mode
                    fontSize: 9
                }
            },
            yAxis: [
                {
                    type: 'value',
                    min: 50,
                    max: 100,
                    interval: 10,
                    axisLabel: { formatter: '{value}%' },
                    nameTextStyle: { fontSize: 11, color: '#6b7280' }
                },
                {
                    type: 'value',
                    name: 'Top5失效',
                    min: 0,
                    max: rightMax,
                    interval: rightMax / 5,
                    axisLabel: {
                        formatter: (val) => val.toFixed(2) + '%'
                    },
                    nameTextStyle: { fontSize: 11, color: '#6b7280' },
                    splitLine: { show: false }
                }
            ],
            series: series
        }, true);
        // Listen to legend selections to dynamically synchronize with the device chart
        waferYieldChart.off('legendselectchanged');
        waferYieldChart.on('legendselectchanged', (event) => {
            selectedBins.value = { ...event.selected };
            if (deviceYieldChart) {
                deviceYieldChart.setOption({
                    legend: {
                        selected: selectedBins.value
                    }
                });
            }
        });
    }
    // Watch selectedLotId to render appropriate charts
    watch(selectedLotId, (newVal) => {
        nextTick(() => {
            if (newVal) {
                renderWaferYieldChart();
            }
            else {
                renderDeviceCharts();
            }
        });
    });
    // Sync wafer yield chart on hovering over AG Grid cells
    function onCellMouseOver(event) {
        if (event && event.data) {
            const key = deviceGroupMode.value === 'PGM' ? event.data.program : event.data.lot_id;
            if (key && selectedLotId.value !== key) {
                selectedLotId.value = key;
            }
        }
    }
    // ══════════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ══════════════════════════════════════════════════════════════════
    onMounted(() => {
        try {
            fetchOverview(false); // Will not fetch if already loaded
            fetchData();
        }
        catch (err) {
            console.error('Error in onMounted', err);
        }
        window.addEventListener('resize', () => {
            if (outputChart)
                outputChart.resize();
            if (pieChart)
                pieChart.resize();
            if (osatPieChart)
                osatPieChart.resize();
            if (deviceOutputChart)
                deviceOutputChart.resize();
            if (deviceYieldChart)
                deviceYieldChart.resize();
            if (waferYieldChart)
                waferYieldChart.resize();
        });
    });
    const __VLS_ctx = {
        ...{},
        ...{},
    };
    let __VLS_components;
    let __VLS_intrinsics;
    let __VLS_directives;
    /** @type {__VLS_StyleScopedClasses['view-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['view-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['filter-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
    /** @type {__VLS_StyleScopedClasses['ov-filter-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['filter-select-dropdown']} */ ;
    /** @type {__VLS_StyleScopedClasses['ov-filter-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['device-link']} */ ;
    /** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['mode-switch-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['mode-switch-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "analysis-container" },
    });
    /** @type {__VLS_StyleScopedClasses['analysis-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "view-tabs" },
    });
    /** @type {__VLS_StyleScopedClasses['view-tabs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.switchView('overview'));
                // @ts-ignore
                [switchView,];
            } },
        ...{ class: (['view-tab', { active: __VLS_ctx.activeView === 'overview' }]) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['view-tab']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.switchView('detail'));
                // @ts-ignore
                [switchView, activeView,];
            } },
        ...{ class: (['view-tab', { active: __VLS_ctx.activeView === 'detail' }]) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['view-tab']} */ ;
    if (__VLS_ctx.deviceViewDevice) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.deviceViewDevice))
                        throw 0;
                    return (__VLS_ctx.switchView('device'));
                    // @ts-ignore
                    [switchView, activeView, deviceViewDevice,];
                } },
            ...{ class: (['view-tab', { active: __VLS_ctx.activeView === 'device' }]) },
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        /** @type {__VLS_StyleScopedClasses['view-tab']} */ ;
        (__VLS_ctx.deviceViewDevice);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-content" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeView === 'overview'), }, null, null);
    /** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-card ov-filter" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ov-filter']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ov-filter-row" },
    });
    /** @type {__VLS_StyleScopedClasses['ov-filter-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ov-filter-item" },
    });
    /** @type {__VLS_StyleScopedClasses['ov-filter-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (__VLS_ctx.onFilterSelectionChange) },
        value: (__VLS_ctx.filterSelection),
        ...{ class: "filter-select-dropdown" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-select-dropdown']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.optgroup, __VLS_intrinsics.optgroup)({
        label: "月",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "month-1",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "month-3",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "month-6",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "month-9",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.optgroup, __VLS_intrinsics.optgroup)({
        label: "年",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "year-1",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "year-2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "year-3",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "year-4",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.optgroup, __VLS_intrinsics.optgroup)({
        label: "LOT",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "lot-20",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "lot-40",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "lot-60",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "lot-80",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "all",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ov-filter-item" },
    });
    /** @type {__VLS_StyleScopedClasses['ov-filter-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "text",
        value: (__VLS_ctx.ovProductName),
        placeholder: "输入产品名过滤",
        ...{ class: "ov-filter-input" },
    });
    /** @type {__VLS_StyleScopedClasses['ov-filter-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ov-filter-item ov-filter-right" },
    });
    /** @type {__VLS_StyleScopedClasses['ov-filter-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['ov-filter-right']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.fetchOverview(true));
                // @ts-ignore
                [activeView, activeView, deviceViewDevice, onFilterSelectionChange, filterSelection, ovProductName, fetchOverview,];
            } },
        ...{ class: "btn btn-primary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    if (!__VLS_ctx.ovLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "charts-row" },
        });
        /** @type {__VLS_StyleScopedClasses['charts-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-title" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "outputChartRef",
            ...{ class: "echart-box" },
        });
        /** @type {__VLS_StyleScopedClasses['echart-box']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-title" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "pieChartRef",
            ...{ class: "echart-box" },
        });
        /** @type {__VLS_StyleScopedClasses['echart-box']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-title" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "osatPieChartRef",
            ...{ class: "echart-box" },
        });
        /** @type {__VLS_StyleScopedClasses['echart-box']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "charts-row" },
        });
        /** @type {__VLS_StyleScopedClasses['charts-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card skeleton-card" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['skeleton-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "skeleton-shimmer" },
        });
        /** @type {__VLS_StyleScopedClasses['skeleton-shimmer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card skeleton-card" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['skeleton-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "skeleton-shimmer" },
        });
        /** @type {__VLS_StyleScopedClasses['skeleton-shimmer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card skeleton-card" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['skeleton-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "skeleton-shimmer" },
        });
        /** @type {__VLS_StyleScopedClasses['skeleton-shimmer']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-card" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['table-card']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.AgGridVue} */
    AgGridVue;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        ...{ class: "ag-theme-alpine" },
        theme: ('legacy'),
        rowData: (__VLS_ctx.filteredOvProducts),
        columnDefs: (__VLS_ctx.ovColDefs),
        defaultColDef: (__VLS_ctx.defaultColDef),
        ...{ style: {} },
        suppressScrollOnNewData: (true),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "ag-theme-alpine" },
        theme: ('legacy'),
        rowData: (__VLS_ctx.filteredOvProducts),
        columnDefs: (__VLS_ctx.ovColDefs),
        defaultColDef: (__VLS_ctx.defaultColDef),
        ...{ style: {} },
        suppressScrollOnNewData: (true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['ag-theme-alpine']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-content" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeView === 'detail'), }, null, null);
    /** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-card" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-row" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-item" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (__VLS_ctx.debouncedSearch) },
        type: "text",
        value: (__VLS_ctx.filters.osat_name),
        placeholder: "输入 OSAT 名",
        ...{ class: "filter-input input-osat" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['input-osat']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-item" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (__VLS_ctx.debouncedSearch) },
        type: "text",
        value: (__VLS_ctx.filters.product_name),
        placeholder: "输入 Device 名",
        ...{ class: "filter-input input-device" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['input-device']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-item" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (__VLS_ctx.debouncedSearch) },
        type: "text",
        value: (__VLS_ctx.filters.lot_id),
        placeholder: "输入 LOT ID",
        ...{ class: "filter-input input-lot" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['input-lot']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-item" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (__VLS_ctx.debouncedSearch) },
        type: "text",
        value: (__VLS_ctx.filters.wafer_id),
        placeholder: "输入 WAFER ID",
        ...{ class: "filter-input input-wafer" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['input-wafer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-item" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (__VLS_ctx.debouncedSearch) },
        type: "text",
        value: (__VLS_ctx.filters.program),
        placeholder: "输入 PGM (程序名)",
        ...{ class: "filter-input input-pgm" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['input-pgm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-item date-range-item" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['date-range-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "date-range-floating" },
    });
    /** @type {__VLS_StyleScopedClasses['date-range-floating']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "date-range-box" },
        title: "开始日期",
    });
    /** @type {__VLS_StyleScopedClasses['date-range-box']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "date-range-value" },
    });
    /** @type {__VLS_StyleScopedClasses['date-range-value']} */ ;
    (__VLS_ctx.filters.test_date_from || '开始日期');
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.handleSearch) },
        ...{ onClick: (...[$event]) => {
                return (($event.target).showPicker?.());
                // @ts-ignore
                [activeView, ovLoading, filteredOvProducts, ovColDefs, defaultColDef, debouncedSearch, debouncedSearch, debouncedSearch, debouncedSearch, debouncedSearch, filters, filters, filters, filters, filters, filters, handleSearch,];
            } },
        type: "date",
        ...{ class: "date-range-native" },
    });
    (__VLS_ctx.filters.test_date_from);
    /** @type {__VLS_StyleScopedClasses['date-range-native']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "date-range-separator" },
    });
    /** @type {__VLS_StyleScopedClasses['date-range-separator']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "date-range-box" },
        title: "结束日期",
    });
    /** @type {__VLS_StyleScopedClasses['date-range-box']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "date-range-value" },
    });
    /** @type {__VLS_StyleScopedClasses['date-range-value']} */ ;
    (__VLS_ctx.filters.test_date_to || '结束日期');
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.handleSearch) },
        ...{ onClick: (...[$event]) => {
                return (($event.target).showPicker?.());
                // @ts-ignore
                [filters, filters, handleSearch,];
            } },
        type: "date",
        ...{ class: "date-range-native" },
    });
    (__VLS_ctx.filters.test_date_to);
    /** @type {__VLS_StyleScopedClasses['date-range-native']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-actions-inline" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-actions-inline']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleReset) },
        ...{ class: "btn btn-secondary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleSearch) },
        ...{ class: "btn btn-primary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-card" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['table-card']} */ ;
    let __VLS_5;
    /** @ts-ignore @type { | typeof __VLS_components.AgGridVue} */
    AgGridVue;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        ...{ class: "ag-theme-alpine detail-grid" },
        theme: ('legacy'),
        rowData: (__VLS_ctx.items),
        columnDefs: (__VLS_ctx.detailColDefs),
        defaultColDef: (__VLS_ctx.defaultColDef),
        ...{ style: {} },
        suppressScrollOnNewData: (true),
    }));
    const __VLS_7 = __VLS_6({
        ...{ class: "ag-theme-alpine detail-grid" },
        theme: ('legacy'),
        rowData: (__VLS_ctx.items),
        columnDefs: (__VLS_ctx.detailColDefs),
        defaultColDef: (__VLS_ctx.defaultColDef),
        ...{ style: {} },
        suppressScrollOnNewData: (true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    /** @type {__VLS_StyleScopedClasses['ag-theme-alpine']} */ ;
    /** @type {__VLS_StyleScopedClasses['detail-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "db-page-footer db-page-footer-bottom" },
    });
    /** @type {__VLS_StyleScopedClasses['db-page-footer']} */ ;
    /** @type {__VLS_StyleScopedClasses['db-page-footer-bottom']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "db-page-size" },
    });
    /** @type {__VLS_StyleScopedClasses['db-page-size']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (__VLS_ctx.handleSearch) },
        value: (__VLS_ctx.pageSize),
        ...{ class: "page-size-select-simple" },
    });
    /** @type {__VLS_StyleScopedClasses['page-size-select-simple']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: (50),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: (100),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: (200),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "db-page-summary" },
    });
    /** @type {__VLS_StyleScopedClasses['db-page-summary']} */ ;
    (__VLS_ctx.items.length === 0 ? 0 : (__VLS_ctx.page - 1) * __VLS_ctx.pageSize + 1);
    (Math.min(__VLS_ctx.page * __VLS_ctx.pageSize, __VLS_ctx.total));
    (__VLS_ctx.total);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.page = 1;
                __VLS_ctx.fetchData();
                // @ts-ignore
                [defaultColDef, filters, handleSearch, handleSearch, handleReset, items, items, detailColDefs, pageSize, pageSize, pageSize, page, page, page, total, total, fetchData,];
            } },
        ...{ class: "db-page-btn" },
        disabled: (__VLS_ctx.page <= 1),
    });
    /** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.page--;
                __VLS_ctx.fetchData();
                // @ts-ignore
                [page, page, fetchData,];
            } },
        ...{ class: "db-page-btn" },
        disabled: (__VLS_ctx.page <= 1),
    });
    /** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "db-page-current" },
    });
    /** @type {__VLS_StyleScopedClasses['db-page-current']} */ ;
    (__VLS_ctx.page);
    (__VLS_ctx.maxPage);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.page++;
                __VLS_ctx.fetchData();
                // @ts-ignore
                [page, page, page, fetchData, maxPage,];
            } },
        ...{ class: "db-page-btn" },
        disabled: (__VLS_ctx.page >= __VLS_ctx.maxPage),
    });
    /** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.page = __VLS_ctx.maxPage;
                __VLS_ctx.fetchData();
                // @ts-ignore
                [page, page, fetchData, maxPage, maxPage,];
            } },
        ...{ class: "db-page-btn" },
        disabled: (__VLS_ctx.page >= __VLS_ctx.maxPage),
    });
    /** @type {__VLS_StyleScopedClasses['db-page-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-content" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.activeView === 'device'), }, null, null);
    /** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-card ov-filter" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ov-filter']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ov-filter-row" },
    });
    /** @type {__VLS_StyleScopedClasses['ov-filter-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ov-filter-item" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['ov-filter-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.deviceViewDevice);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.getFilterLabel());
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mode-switch-group" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['mode-switch-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.setDeviceGroupMode('LOT'));
                // @ts-ignore
                [activeView, deviceViewDevice, page, maxPage, getFilterLabel, setDeviceGroupMode,];
            } },
        ...{ class: "mode-switch-btn" },
        ...{ class: ({ active: __VLS_ctx.deviceGroupMode === 'LOT' }) },
        type: "button",
    });
    /** @type {__VLS_StyleScopedClasses['mode-switch-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.setDeviceGroupMode('PGM'));
                // @ts-ignore
                [setDeviceGroupMode, deviceGroupMode,];
            } },
        ...{ class: "mode-switch-btn" },
        ...{ class: ({ active: __VLS_ctx.deviceGroupMode === 'PGM' }) },
        type: "button",
    });
    /** @type {__VLS_StyleScopedClasses['mode-switch-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeydown: (...[$event]) => {
                return (__VLS_ctx.deviceLotFilterInput = '');
                // @ts-ignore
                [deviceGroupMode, deviceLotFilterInput,];
            } },
        value: (__VLS_ctx.deviceLotFilterInput),
        type: "text",
        placeholder: "输入 LOT / PGM 过滤...",
        ...{ style: {} },
    });
    if (__VLS_ctx.deviceLotFilterInput) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.deviceLotFilterInput))
                        throw 0;
                    return (__VLS_ctx.deviceLotFilterInput = '');
                    // @ts-ignore
                    [deviceLotFilterInput, deviceLotFilterInput, deviceLotFilterInput,];
                } },
            ...{ style: {} },
        });
    }
    if (!__VLS_ctx.deviceLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "charts-row" },
        });
        /** @type {__VLS_StyleScopedClasses['charts-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-title" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "deviceYieldChartRef",
            ...{ class: "echart-box" },
        });
        /** @type {__VLS_StyleScopedClasses['echart-box']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        if (!__VLS_ctx.selectedLotId) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-title" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-title']} */ ;
            (__VLS_ctx.deviceViewDevice);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "deviceOutputChartRef",
                ...{ class: "echart-box" },
            });
            /** @type {__VLS_StyleScopedClasses['echart-box']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-title" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['chart-title']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_ctx.selectedLotId);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.deviceLoading))
                            throw 0;
                        if (!!(!__VLS_ctx.selectedLotId))
                            throw 0;
                        return (__VLS_ctx.selectedLotId = null);
                        // @ts-ignore
                        [deviceViewDevice, deviceLoading, selectedLotId, selectedLotId, selectedLotId,];
                    } },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "waferYieldChartRef",
                ...{ class: "echart-box" },
            });
            /** @type {__VLS_StyleScopedClasses['echart-box']} */ ;
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "charts-row" },
        });
        /** @type {__VLS_StyleScopedClasses['charts-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card skeleton-card" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['skeleton-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "skeleton-shimmer" },
        });
        /** @type {__VLS_StyleScopedClasses['skeleton-shimmer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card skeleton-card" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['skeleton-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "skeleton-shimmer" },
        });
        /** @type {__VLS_StyleScopedClasses['skeleton-shimmer']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-card" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['table-card']} */ ;
    let __VLS_10;
    /** @ts-ignore @type { | typeof __VLS_components.AgGridVue} */
    AgGridVue;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        ...{ 'onCellMouseOver': {} },
        ...{ 'onCellClicked': {} },
        ...{ class: "ag-theme-alpine" },
        theme: ('legacy'),
        rowData: (__VLS_ctx.filteredDeviceLots),
        columnDefs: (__VLS_ctx.deviceColDefs),
        defaultColDef: (__VLS_ctx.defaultColDef),
        ...{ style: {} },
        suppressScrollOnNewData: (true),
    }));
    const __VLS_12 = __VLS_11({
        ...{ 'onCellMouseOver': {} },
        ...{ 'onCellClicked': {} },
        ...{ class: "ag-theme-alpine" },
        theme: ('legacy'),
        rowData: (__VLS_ctx.filteredDeviceLots),
        columnDefs: (__VLS_ctx.deviceColDefs),
        defaultColDef: (__VLS_ctx.defaultColDef),
        ...{ style: {} },
        suppressScrollOnNewData: (true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    let __VLS_15;
    const __VLS_16 = {
        /** @type {typeof __VLS_15.cellMouseOver} */
        onCellMouseOver: (__VLS_ctx.onCellMouseOver),
    };
    const __VLS_17 = {
        /** @type {typeof __VLS_15.cellClicked} */
        onCellClicked: (__VLS_ctx.onDeviceGridCellClicked),
    };
    /** @type {__VLS_StyleScopedClasses['ag-theme-alpine']} */ ;
    var __VLS_13;
    var __VLS_14;
    // @ts-ignore
    [defaultColDef, filteredDeviceLots, deviceColDefs, onCellMouseOver, onDeviceGridCellClicked,];
    return (await import('vue')).defineComponent({});
})();
