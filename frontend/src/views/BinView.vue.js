import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts';
import api from '@/api';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { fmtDateTz } from '@/utils/dateUtils';
const route = useRoute();
const router = useRouter();
const lotId = ref(Number(route.params.id));
const openParamAnalysis = () => {
    const url = router.resolve(`/lot/${lotId.value}`).href;
    window.open(url, '_blank');
};
const binMapCanvas = ref();
const binMapTooltipEl = ref(null);
const yieldPlotCanvas = ref();
const failBinChartRef = ref();
const binDetailCanvas = ref();
let failBinChart = null;
// Bin Map hover state
let binMapDies = [];
const lotInfo = ref(null);
const binData = ref({ bins: [], sites: [], all_sites: [] });
const allSites = ref([]);
const passBins = ref([]);
const selectedBin = ref(null);
const binSortOrder = ref('');
const retestData = ref(null);
const retestExpanded = ref(false);
const hasCoords = ref(false);
const binDetailVisible = ref(false);
const binDetailNum = ref(0);
const binDetailName = ref('');
const mapCache = ref([]);
const uploadModalVisible = ref(false);
const pastedText = ref('');
const options = ref({
    data_range: 'final',
    selected_sites: [],
    rotate: '0',
    show_yield_plot: false,
    show_fail_bin: false,
});
const BIN_COLORS = {};
const FAIL_COLORS = [
    '#ff6b6b', '#4dabf7', '#ffd43b', '#e599f7', '#74c0fc',
    '#ffa94d', '#da77f2', '#ff8787', '#339af0', '#fcc419',
    '#cc5de8', '#22b8cf', '#ff922b', '#845ef7', '#f06595', '#66d9e8'
];
function getBinColor(binNum) {
    if (isPassBin(binNum))
        return '#69db7c';
    if (!BIN_COLORS[binNum]) {
        const idx = Object.keys(BIN_COLORS).length % FAIL_COLORS.length;
        BIN_COLORS[binNum] = FAIL_COLORS[idx];
    }
    return BIN_COLORS[binNum];
}
function isPassBin(binNum) {
    return passBins.value.includes(binNum);
}
const showUploadBinNameBtn = computed(() => {
    if (!binData.value?.bins)
        return false;
    const bin1 = binData.value.bins.find((b) => b.bin_number === 1);
    return bin1 ? bin1.bin_name === 'Bin1' : false;
});
const failBins = computed(() => {
    if (!binData.value?.bins)
        return [];
    return binData.value.bins
        .filter((b) => !isPassBin(b.bin_number))
        .sort((a, b) => b.all_site_count - a.all_site_count);
});
const sortedBins = computed(() => {
    if (!binData.value?.bins)
        return [];
    let bins = binData.value.bins.filter(b => b.all_site_count > 0);
    if (binSortOrder.value === 'desc') {
        bins.sort((a, b) => b.all_site_count - a.all_site_count);
    }
    else if (binSortOrder.value === 'asc') {
        bins.sort((a, b) => a.all_site_count - b.all_site_count);
    }
    else {
        bins.sort((a, b) => a.bin_number - b.bin_number);
    }
    return bins;
});
function toggleBinSort() {
    if (binSortOrder.value === '') {
        binSortOrder.value = 'desc';
    }
    else if (binSortOrder.value === 'desc') {
        binSortOrder.value = 'asc';
    }
    else {
        binSortOrder.value = '';
    }
}
const isAllSiteSelected = computed(() => allSites.value.length > 0 &&
    allSites.value.every(s => options.value.selected_sites.includes(s)));
function toggleAllSite() {
    if (isAllSiteSelected.value) {
        options.value.selected_sites = [];
    }
    else {
        options.value.selected_sites = [...allSites.value];
    }
    refreshAll();
}
function toggleSite(site) {
    const idx = options.value.selected_sites.indexOf(site);
    if (idx >= 0) {
        options.value.selected_sites.splice(idx, 1);
    }
    else {
        options.value.selected_sites.push(site);
        options.value.selected_sites.sort((a, b) => a - b);
    }
    refreshAll();
}
function getSitePass(site) {
    return binData.value.bins
        .filter((b) => isPassBin(b.bin_number))
        .reduce((sum, b) => sum + (b.sites[`site${site}`]?.count ?? 0), 0);
}
function getSiteFail(site) {
    return binData.value.bins
        .filter((b) => !isPassBin(b.bin_number))
        .reduce((sum, b) => sum + (b.sites[`site${site}`]?.count ?? 0), 0);
}
function getSiteTotal(site) {
    return binData.value.bins
        .reduce((sum, b) => sum + (b.sites[`site${site}`]?.count ?? 0), 0);
}
function getTotalPass() {
    return binData.value.bins
        .filter((b) => isPassBin(b.bin_number))
        .reduce((sum, b) => sum + b.all_site_count, 0);
}
function getTotalFail() {
    return binData.value.bins
        .filter((b) => !isPassBin(b.bin_number))
        .reduce((sum, b) => sum + b.all_site_count, 0);
}
function getTotalAll() {
    return binData.value.bins.reduce((sum, b) => sum + b.all_site_count, 0);
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
function formatDate(d) {
    return fmtDateTz(d) || '-';
}
// 复测汇总排序
const retestSortKey = ref('count');
const retestSortDir = ref('desc');
const sortedRetestSummary = computed(() => {
    if (!retestData.value?.summary)
        return [];
    return [...retestData.value.summary].sort((a, b) => {
        const dir = retestSortDir.value === 'asc' ? 1 : -1;
        return (a[retestSortKey.value] - b[retestSortKey.value]) * dir;
    });
});
function toggleRetestSort(key) {
    if (retestSortKey.value === key) {
        retestSortDir.value = retestSortDir.value === 'asc' ? 'desc' : 'asc';
    }
    else {
        retestSortKey.value = key;
        retestSortDir.value = key === 'count' ? 'desc' : 'asc';
    }
}
async function fetchLotInfo() {
    lotInfo.value = await api.get(`/analysis/lot/${lotId.value}/info`);
}
async function fetchBinData() {
    const sitesParam = options.value.selected_sites.join(',') || 'all';
    const data = await api.get(`/analysis/lot/${lotId.value}/bin_summary`, {
        params: { data_range: options.value.data_range, sites: sitesParam }
    });
    binData.value = data;
    if (lotInfo.value?.data_type === "Summary" || (data.all_sites && data.all_sites.length === 0)) {
        if (allSites.value.length === 0) {
            allSites.value = [0];
            options.value.selected_sites = [0];
        }
    }
    else if (allSites.value.length === 0 && data.all_sites?.length > 0) {
        allSites.value = data.all_sites;
        options.value.selected_sites = [...data.all_sites];
    }
}
async function fetchPassBins() {
    const data = await api.get(`/analysis/lot/${lotId.value}/bin_definitions`);
    passBins.value = data.pass_bins ?? [1, 2];
}
async function fetchMapData() {
    try {
        const sitesParam = options.value.selected_sites.join(',') || 'all';
        const mapData = await api.get(`/analysis/lot/${lotId.value}/wafer_bin_map`, {
            params: {
                data_range: options.value.data_range,
                sites: sitesParam
            }
        });
        mapCache.value = mapData.data ?? [];
        hasCoords.value = mapData.has_map;
    }
    catch (e) {
        mapCache.value = [];
        hasCoords.value = false;
    }
}
async function fetchRetestData() {
    if (!hasCoords.value)
        return;
    const sitesParam = options.value.selected_sites.join(',') || 'all';
    try {
        retestData.value = await api.get(`/analysis/lot/${lotId.value}/retest_analysis`, {
            params: { sites: sitesParam }
        });
    }
    catch (e) {
        retestData.value = null;
    }
}
async function refreshAll() {
    await fetchBinData();
    await fetchMapData();
    renderBinMap();
    if (options.value.show_yield_plot)
        renderYieldPlot();
    if (options.value.show_fail_bin)
        renderFailBinChart();
    if (retestExpanded.value)
        await fetchRetestData();
}
async function onDataRangeChange() {
    await refreshAll();
}
watch(retestExpanded, async (val) => {
    if (val && !retestData.value) {
        await fetchRetestData();
    }
});
// ── Bin Map ───────────────────────────────────────────
function renderBinMap() {
    const canvas = binMapCanvas.value;
    if (!canvas)
        return;
    if (!mapCache.value.length) {
        const ctx = canvas.getContext('2d');
        if (ctx)
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    // Site过滤
    let data = mapCache.value;
    if (options.value.selected_sites.length < allSites.value.length) {
        // 需要按site过滤，但mapCache已有site信息
        data = data.filter((d) => options.value.selected_sites.includes(d.site));
    }
    // 绑定鼠标事件（只绑定一次）
    if (!canvas._binMapBound) {
        canvas.onmousemove = onBinMapMouseMove;
        canvas.onmouseleave = onBinMapMouseLeave;
        canvas._binMapBound = true;
    }
    drawBinMap(canvas, data, selectedBin.value);
}
function applyRotation(x, y, minX, maxX, minY, maxY) {
    switch (options.value.rotate) {
        case '90': return { x: maxY - y + minX, y: x - minX + minY };
        case '180': return { x: maxX - x + minX, y: maxY - y + minY };
        case '270': return { x: y - minY + minX, y: maxX - x + minY };
        default: return { x, y };
    }
}
function drawBinMap(canvas, data, highlightBin, singleBin) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !data.length)
        return;
    // 计算 min/max
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const d of data) {
        if (d.x < minX)
            minX = d.x;
        if (d.x > maxX)
            maxX = d.x;
        if (d.y < minY)
            minY = d.y;
        if (d.y > maxY)
            maxY = d.y;
    }
    const rotated = data.map(d => {
        const r = applyRotation(d.x, d.y, minX, maxX, minY, maxY);
        return { ...d, rx: r.x, ry: r.y };
    });
    let rMinX = Infinity, rMaxX = -Infinity;
    let rMinY = Infinity, rMaxY = -Infinity;
    for (const d of rotated) {
        if (d.rx < rMinX)
            rMinX = d.rx;
        if (d.rx > rMaxX)
            rMaxX = d.rx;
        if (d.ry < rMinY)
            rMinY = d.ry;
        if (d.ry > rMaxY)
            rMaxY = d.ry;
    }
    const W = canvas.width, H = canvas.height;
    const margin = 50;
    const centerX = W / 2;
    const centerY = H / 2;
    const radius = Math.min(W, H) / 2 - margin;
    const gridW = rMaxX - rMinX + 1;
    const gridH = rMaxY - rMinY + 1;
    // 支持长方形 Die：分别计算 X 和 Y 方向的步长
    const dieW = (radius * 2) / gridW;
    const dieH = (radius * 2) / gridH;
    const offsetX = centerX - radius;
    const offsetY = centerY - radius;
    ctx.clearRect(0, 0, W, H);
    // 绘制 Wafer 背景圆
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fdfdfd';
    ctx.fill();
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 绘制圆周边界
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 绘制 Notch (缺口) - 随旋转角度变化
    let notchX = centerX, notchY = centerY + radius;
    let startAngle = Math.PI, endAngle = 0;
    switch (options.value.rotate) {
        case '90':
            notchX = centerX - radius;
            notchY = centerY;
            startAngle = 1.5 * Math.PI;
            endAngle = 0.5 * Math.PI;
            break;
        case '180':
            notchX = centerX;
            notchY = centerY - radius;
            startAngle = 0;
            endAngle = Math.PI;
            break;
        case '270':
            notchX = centerX + radius;
            notchY = centerY;
            startAngle = 0.5 * Math.PI;
            endAngle = 1.5 * Math.PI;
            break;
    }
    ctx.beginPath();
    ctx.arc(notchX, notchY, 12, startAngle, endAngle);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#cccccc';
    ctx.stroke();
    const coordSet = new Set(rotated.map(d => `${d.rx},${d.ry}`));
    const isEdge = (rx, ry) => !coordSet.has(`${rx - 1},${ry}`) || !coordSet.has(`${rx + 1},${ry}`) ||
        !coordSet.has(`${rx},${ry - 1}`) || !coordSet.has(`${rx},${ry + 1}`);
    // 记录die位置供hover检测
    binMapDies = [];
    rotated.forEach(d => {
        const px = offsetX + (d.rx - rMinX) * dieW;
        const py = offsetY + (d.ry - rMinY) * dieH;
        let color = '';
        if (highlightBin !== null) {
            if (d.bin === highlightBin)
                color = getBinColor(d.bin);
            else if (isEdge(d.rx, d.ry))
                color = 'rgba(200,200,200,0.15)';
            else
                return;
        }
        else if (singleBin !== undefined) {
            if (d.bin === singleBin)
                color = getBinColor(d.bin);
            else if (isEdge(d.rx, d.ry))
                color = 'rgba(200,200,200,0.15)';
            else
                return;
        }
        else {
            color = getBinColor(d.bin);
        }
        ctx.fillStyle = color;
        // 绘制 Die，留出极小的间隙以区分
        const drawW = Math.max(0.5, dieW - 0.2);
        const drawH = Math.max(0.5, dieH - 0.2);
        ctx.fillRect(px, py, drawW, drawH);
        if (d.retest && options.value.data_range !== 'original') {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            const cx = px + drawW / 2, cy = py + drawH / 2;
            const arm = Math.min(drawW, drawH) * 0.35;
            const thick = Math.max(1, Math.min(drawW, drawH) * 0.1);
            ctx.fillRect(cx - thick / 2, cy - arm, thick, arm * 2);
            ctx.fillRect(cx - arm, cy - thick / 2, arm * 2, thick);
        }
        // 记录位置用于hover检测
        binMapDies.push({ px, py, width: dieW, height: dieH, x: d.x, y: d.y, bin: d.bin, site: d.site });
    });
    // 坐标标注
    ctx.fillStyle = '#999';
    const fontSize = Math.max(8, Math.min(10, Math.min(dieW, dieH) * 0.8));
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    const xStep = Math.max(1, Math.ceil(gridW / 15));
    for (let rx = rMinX; rx <= rMaxX; rx += xStep) {
        ctx.fillText(String(rx), offsetX + (rx - rMinX) * dieW + dieW / 2, offsetY - 10);
        ctx.fillText(String(rx), offsetX + (rx - rMinX) * dieW + dieW / 2, offsetY + radius * 2 + 15);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yStep = Math.max(1, Math.ceil(gridH / 15));
    for (let ry = rMinY; ry <= rMaxY; ry += yStep) {
        ctx.fillText(String(ry), offsetX - 10, offsetY + (ry - rMinY) * dieH + dieH / 2);
    }
}
// ── Bin Map Tooltip ────────────────────────────────────
function onBinMapMouseMove(evt) {
    const canvas = binMapCanvas.value;
    const tooltipEl = binMapTooltipEl.value;
    if (!canvas || !tooltipEl || !binMapDies.length)
        return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (evt.clientX - rect.left) * scaleX;
    const my = (evt.clientY - rect.top) * scaleY;
    let found = null;
    for (const die of binMapDies) {
        if (mx >= die.px && mx <= die.px + die.width && my >= die.py && my <= die.py + die.height) {
            found = die;
            break;
        }
    }
    if (found) {
        tooltipEl.innerHTML = `<div>X: ${found.x}, Y: ${found.y}</div><div>Bin: ${found.bin}</div><div>Site: ${found.site}</div>`;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = (evt.offsetX + 14) + 'px';
        tooltipEl.style.top = (evt.offsetY + 14) + 'px';
    }
    else {
        tooltipEl.style.display = 'none';
    }
}
function onBinMapMouseLeave() {
    const tooltipEl = binMapTooltipEl.value;
    if (tooltipEl)
        tooltipEl.style.display = 'none';
}
// ── Yield Plot（12区域晶圆良率图）───────────────────────
function renderYieldPlot() {
    if (!options.value.show_yield_plot)
        return;
    nextTick(() => {
        const canvas = yieldPlotCanvas.value;
        if (!canvas || !mapCache.value.length)
            return;
        const data = mapCache.value;
        const xs = data.map(d => d.x), ys = data.map(d => d.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        // 计算每个die到圆心的距离和角度
        const maxR = Math.max(...data.map(d => Math.sqrt((d.x - cx) ** 2 + (d.y - cy) ** 2)));
        // 3环 × 4象限 = 12区域
        const rings = 3, sectors = 4;
        const zones = Array.from({ length: rings }, () => Array.from({ length: sectors }, () => ({ pass: 0, total: 0 })));
        data.forEach(d => {
            const dx = d.x - cx, dy = d.y - cy;
            const r = Math.sqrt(dx ** 2 + dy ** 2);
            const angle = Math.atan2(dy, dx);
            const ringIdx = Math.min(Math.floor(r / maxR * rings), rings - 1);
            const sectorIdx = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * sectors) % sectors;
            zones[ringIdx][sectorIdx].total++;
            if (isPassBin(d.bin))
                zones[ringIdx][sectorIdx].pass++;
        });
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        const W = canvas.width, H = canvas.height;
        const centerX = W / 2, centerY = H / 2;
        const maxRadius = Math.min(W, H) / 2 - 20;
        ctx.clearRect(0, 0, W, H);
        for (let ri = rings - 1; ri >= 0; ri--) {
            const outerR = maxRadius * (ri + 1) / rings;
            const innerR = maxRadius * ri / rings;
            for (let si = 0; si < sectors; si++) {
                const startAngle = (si / sectors) * 2 * Math.PI - Math.PI / 2;
                const endAngle = ((si + 1) / sectors) * 2 * Math.PI - Math.PI / 2;
                const zone = zones[ri][si];
                const yield_ = zone.total > 0 ? zone.pass / zone.total : 0;
                // 颜色：低良率红→高良率绿
                const r = Math.round(255 * (1 - yield_));
                const g = Math.round(255 * yield_);
                ctx.fillStyle = `rgba(${r},${g},0,0.8)`;
                ctx.beginPath();
                ctx.arc(centerX, centerY, outerR, startAngle, endAngle);
                ctx.arc(centerX, centerY, innerR, endAngle, startAngle, true);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                // 显示良率文字
                const midR = (innerR + outerR) / 2;
                const midAngle = (startAngle + endAngle) / 2;
                const tx = centerX + midR * Math.cos(midAngle);
                const ty = centerY + midR * Math.sin(midAngle);
                ctx.fillStyle = 'white';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((yield_ * 100).toFixed(1) + '%', tx, ty);
            }
        }
    });
}
// ── Fail Bin 柱状图 ───────────────────────────────────
function renderFailBinChart() {
    if (!options.value.show_fail_bin) {
        if (failBinChart) {
            failBinChart.dispose();
            failBinChart = null;
        }
        return;
    }
    nextTick(() => {
        if (!failBinChartRef.value)
            return;
        failBinChart = echarts.getInstanceByDom(failBinChartRef.value);
        if (!failBinChart) {
            failBinChart = echarts.init(failBinChartRef.value);
        }
        // 获取失败的 Bin 并按数量降序排列 (Pareto)
        const failBinList = binData.value.bins.filter((b) => !isPassBin(b.bin_number));
        failBinList.sort((a, b) => b.all_site_count - a.all_site_count);
        // 计算累加百分比 (相对于总测试 Die 数，包含起始良率，最终累加至 100%)
        const totalDies = getTotalAll();
        const totalPass = getTotalPass();
        let cumulativeCount = totalPass; // 初始累加量等于 Pass Die 数量 (即良率基数)
        const cumulativePctList = failBinList.map((b) => {
            cumulativeCount += b.all_site_count;
            return totalDies > 0 ? (cumulativeCount / totalDies * 100).toFixed(2) : 0;
        });
        failBinChart?.setOption({
            title: { text: 'Fail Bin Analysis (Pareto)', left: 'center', textStyle: { fontSize: 12 } },
            tooltip: {
                trigger: 'axis',
                formatter: function (params) {
                    let html = params[0].name + '<br/>';
                    params.forEach((param) => {
                        if (param.seriesType === 'bar') {
                            html += `${param.marker} Count: ${param.value}<br/>`;
                        }
                        else if (param.seriesType === 'line') {
                            html += `${param.marker} Cumulative Yield: ${param.value}%<br/>`;
                        }
                    });
                    return html;
                }
            },
            legend: { data: ['Count', 'Cumulative Yield %'], bottom: 0 },
            xAxis: {
                type: 'category',
                data: failBinList.map((b) => `Bin${b.bin_number}\n${b.bin_name}`),
                axisLabel: { rotate: 45, fontSize: 10 }
            },
            yAxis: [
                { type: 'value', name: 'Count' },
                { type: 'value', name: 'Cumulative Yield (%)', min: (totalDies > 0 ? Math.floor(totalPass / totalDies * 100) : 0), max: 100, axisLabel: { formatter: '{value} %' } }
            ],
            series: [
                {
                    name: 'Count',
                    type: 'bar',
                    data: failBinList.map((b) => b.all_site_count),
                    itemStyle: { color: (params) => getBinColor(failBinList[params.dataIndex].bin_number) },
                    label: { show: true, position: 'insideTop', fontSize: 10, color: '#000' }
                },
                {
                    name: 'Cumulative Yield %',
                    type: 'line',
                    yAxisIndex: 1,
                    data: cumulativePctList,
                    itemStyle: { color: '#FF4500' },
                    symbolSize: 6,
                    label: { show: true, position: 'top', formatter: '{c}%', fontSize: 10 }
                }
            ]
        });
    });
}
function toggleBinHighlight(binNum) {
    selectedBin.value = selectedBin.value === binNum ? null : binNum;
    renderBinMap();
}
async function saveComment(bin) {
    try {
        await api.post(`/analysis/lot/${lotId.value}/bin_comment`, {
            bin_number: bin.bin_number,
            comment: bin.comment || ''
        });
    }
    catch (e) {
        console.error('Failed to save comment', e);
    }
}
async function handleApplyBinNames() {
    if (!pastedText.value.trim())
        return;
    const lines = pastedText.value.split('\n');
    const nameList = [];
    const binMap = {};
    const addBinName = (binNum, name) => {
        const cleanName = name.trim();
        if (!Number.isInteger(binNum) || binNum < 0 || !cleanName)
            return;
        if (binMap[binNum] !== undefined) {
            const existing = nameList.find(item => item.bin_number === binNum);
            if (existing)
                existing.bin_name = cleanName;
        }
        else {
            nameList.push({ bin_number: binNum, bin_name: cleanName });
        }
        binMap[binNum] = cleanName;
    };
    for (let line of lines) {
        line = line.trim();
        if (!line)
            continue;
        // Format 1: SBin[9]   ILKG_ENB_6P5_AMR__Fail          0     0.00%   9
        const match1 = line.match(/^S?Bin\[(\d+)\]\s+(.*?)\s+(\d+)\s+([\d\.]+%)\s+(\d+)/i);
        if (match1) {
            const binNum = parseInt(match1[1] || '0', 10);
            const name = (match1[2] || '').trim();
            addBinName(binNum, name);
            continue;
        }
        // Format 2: 19     F    TA01_BG_bef                    80       1.34
        // or 5     F    Open Test                       0
        const match2 = line.match(/^(\d+)\s+([A-Za-z])\s+(.*?)\s+(\d+)(?:\s+[\d\.]+)?$/);
        if (match2) {
            const binNum = parseInt(match2[1] || '0', 10);
            const name = (match2[3] || '').trim();
            addBinName(binNum, name);
            continue;
        }
        // Format 3: 1 GOOD / 1\tGOOD / 1,GOOD
        const match3 = line.match(/^(\d+)[\t, ]+(.+?)\s*$/);
        if (match3) {
            const binNum = parseInt(match3[1] || '0', 10);
            const name = (match3[2] || '').trim();
            addBinName(binNum, name);
            continue;
        }
    }
    if (nameList.length === 0) {
        alert('未解析到有效的 Bin Name 数据，请检查粘贴格式！');
        return;
    }
    try {
        // 1. 发送至后端接口保存（同步写入 LOT 和 程序缓存）
        await api.post(`/analysis/lot/${lotId.value}/bin_names`, { names: nameList });
        // 2. 实时更新前端 reactive state
        if (binData.value && binData.value.bins) {
            binData.value.bins.forEach((b) => {
                if (binMap[b.bin_number] !== undefined) {
                    b.bin_name = binMap[b.bin_number];
                }
            });
        }
        // 3. 重新绘制 fail bin 分析图和 wafer map
        if (options.value.show_fail_bin) {
            renderFailBinChart();
        }
        renderBinMap();
        uploadModalVisible.value = false;
        pastedText.value = '';
        alert(`成功更新并保存了 ${nameList.length} 个 Bin 的名称！\n同程序的其他 Lot 也将自动调用此映射。`);
    }
    catch (e) {
        console.error('Failed to save bin names', e);
        alert('保存 Bin Name 失败，请检查网络或后台服务！');
    }
}
async function openBinDetail(binNum, binName) {
    binDetailNum.value = binNum;
    binDetailName.value = binName;
    binDetailVisible.value = true;
    await nextTick();
    if (binDetailCanvas.value) {
        drawBinMap(binDetailCanvas.value, mapCache.value, null, binNum);
    }
}
// ── 复测分析辅助函数 ──────────────────────────────────
function getDirection(fb, lb) {
    const fbPass = isPassBin(fb), lbPass = isPassBin(lb);
    if (fbPass && lbPass)
        return 'pass_pass';
    if (!fbPass && lbPass)
        return 'fail_pass';
    if (fbPass && !lbPass)
        return 'pass_fail';
    return 'fail_fail';
}
function directionClass(direction, noChange) {
    if (noChange)
        return 'row-same';
    if (direction === 'fail_pass')
        return 'row-improve';
    if (direction === 'pass_fail')
        return 'row-drop';
    if (direction === 'fail_fail')
        return 'row-change';
    return '';
}
function directionLabel(direction, noChange) {
    if (noChange)
        return '无变化';
    if (direction === 'fail_pass')
        return '✅ Fail→Pass';
    if (direction === 'pass_fail')
        return '❌ Pass→Fail';
    if (direction === 'fail_fail')
        return '🔄 Fail→Fail';
    return 'Pass→Pass';
}
async function handleExport() {
    if (!lotInfo.value)
        return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Chip ATE System';
    const sheet = workbook.addWorksheet('Bin Summary');
    // 1. 写头部信息 (Lot Info)
    const headerData = [
        ['Lot Information', ''],
        ['Name', lotInfo.value.filename || ''],
        ['Program', lotInfo.value.program || ''],
        ['Test Machine', lotInfo.value.test_machine || ''],
        ['Station Count', lotInfo.value.station_count || ''],
        ['Die Count', lotInfo.value.die_count || ''],
        ['Yield Rate', lotInfo.value.yield_rate ? (lotInfo.value.yield_rate * 100).toFixed(2) + '%' : '-'],
        ['Data Type', lotInfo.value.data_type || ''],
        ['Test Date', lotInfo.value.test_date ? fmtDateTz(lotInfo.value.test_date) : '']
    ];
    headerData.forEach(row => {
        sheet.addRow(row);
    });
    sheet.addRow([]); // 空行分隔
    // 2. 写表头
    const sites = options.value.selected_sites;
    const tableHeader = ['Bin', 'Name', ...sites.map(s => `Site${s}`), 'All Site', '% of total', 'Comment'];
    const headerRow = sheet.addRow(tableHeader);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF808080' } // 灰色背景
    };
    // 3. 写表格数据
    const bins = sortedBins.value;
    bins.forEach((b) => {
        const rowData = [
            b.bin_number,
            b.bin_name,
            ...sites.map(s => b.sites[`site${s}`]?.count ?? 0),
            b.all_site_count,
            (b.all_site_pct ?? 0).toFixed(2) + '%',
            b.comment || ''
        ];
        const row = sheet.addRow(rowData);
        row.alignment = { horizontal: 'center', vertical: 'middle' };
        if (isPassBin(b.bin_number)) {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFE6' } }; // 浅绿
        }
    });
    // 写 Summary 行 (Passes, Fails, Sum)
    const passRow = sheet.addRow(['Passes', '', ...sites.map(s => getSitePass(s)), getTotalPass(), (getTotalAll() > 0 ? (getTotalPass() / getTotalAll() * 100).toFixed(2) + '%' : '-'), '']);
    passRow.font = { bold: true };
    const failRow = sheet.addRow(['Fails', '', ...sites.map(s => getSiteFail(s)), getTotalFail(), (getTotalAll() > 0 ? (getTotalFail() / getTotalAll() * 100).toFixed(2) + '%' : '-'), '']);
    failRow.font = { bold: true };
    const sumRow = sheet.addRow(['Sum', '', ...sites.map(s => getSiteTotal(s)), getTotalAll(), '100.00%', '']);
    sumRow.font = { bold: true };
    // 设置列宽
    sheet.columns.forEach(col => {
        col.width = 15;
    });
    // 4. 添加 Map 图像和图例 (合成一张图)
    if (binMapCanvas.value && options.value.selected_sites.length > 0 && hasCoords.value) {
        // 获取需要显示的 Bin 图例
        const visibleBins = bins.filter((b) => {
            return sites.reduce((sum, s) => sum + (b.sites[`site${s}`]?.count ?? 0), 0) > 0;
        });
        const mapWidth = binMapCanvas.value.width;
        const mapHeight = binMapCanvas.value.height;
        // 图例占据的宽度
        const legendWidth = 220;
        // 根据可见的 Bin 数量计算需要的高度
        const legendHeight = visibleBins.length * 20 + 40;
        const compositeWidth = mapWidth + legendWidth;
        const compositeHeight = Math.max(mapHeight, legendHeight);
        // 创建离屏 Canvas
        const offCanvas = document.createElement('canvas');
        offCanvas.width = compositeWidth;
        offCanvas.height = compositeHeight;
        const ctx = offCanvas.getContext('2d');
        if (ctx) {
            // 填充白色背景
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, compositeWidth, compositeHeight);
            // 左侧画 Map
            ctx.drawImage(binMapCanvas.value, 0, 0);
            // 右侧画图例
            const startX = mapWidth + 10;
            let startY = 30;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            visibleBins.forEach((b) => {
                const currentCount = sites.reduce((sum, s) => sum + (b.sites[`site${s}`]?.count ?? 0), 0);
                const color = getBinColor(b.bin_number);
                // 画圆点
                ctx.beginPath();
                ctx.arc(startX + 6, startY, 5, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                // 画文字
                ctx.fillStyle = '#333';
                ctx.fillText(`Bin${b.bin_number}(${currentCount})`, startX + 16, startY);
                startY += 24;
            });
            // 将拼接后的 Canvas 转换为 Base64
            const mapDataUrl = offCanvas.toDataURL('image/png');
            // 向 Workbook 添加图片资源
            const imageId = workbook.addImage({
                base64: mapDataUrl,
                extension: 'png',
            });
            // 计算插入位置：在表格下方隔两行
            const imageStartRow = sheet.lastRow ? sheet.lastRow.number + 2 : 1;
            // 在指定位置插入图片 (这里以单元格为基准放置)
            sheet.addImage(imageId, {
                tl: { col: 0.5, row: imageStartRow }, // 略微缩进，放在A列偏右
                ext: { width: compositeWidth, height: compositeHeight } // 设置图片大小
            });
        }
    }
    // 5. 导出文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const filename = `${lotInfo.value.filename || 'BinReport'}_${new Date().getTime()}.xlsx`;
    saveAs(blob, filename);
}
onMounted(async () => {
    await fetchLotInfo();
    await fetchPassBins();
    await fetchBinData();
    await fetchMapData();
    await nextTick();
    renderBinMap();
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sortable']} */ ;
/** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-row']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-row']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['retest-header']} */ ;
/** @type {__VLS_StyleScopedClasses['total-item']} */ ;
/** @type {__VLS_StyleScopedClasses['total-item']} */ ;
/** @type {__VLS_StyleScopedClasses['total-item']} */ ;
/** @type {__VLS_StyleScopedClasses['retest-table']} */ ;
/** @type {__VLS_StyleScopedClasses['retest-table']} */ ;
/** @type {__VLS_StyleScopedClasses['retest-table']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-close']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['cancel']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['confirm']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['confirm']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bin-view" },
});
/** @type {__VLS_StyleScopedClasses['bin-view']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sticky-header" },
});
/** @type {__VLS_StyleScopedClasses['sticky-header']} */ ;
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
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "options-bar" },
});
/** @type {__VLS_StyleScopedClasses['options-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "opt-group" },
});
/** @type {__VLS_StyleScopedClasses['opt-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "opt-label" },
});
/** @type {__VLS_StyleScopedClasses['opt-label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.onDataRangeChange) },
    type: "radio",
    value: "final",
});
(__VLS_ctx.options.data_range);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.onDataRangeChange) },
    type: "radio",
    value: "original",
});
(__VLS_ctx.options.data_range);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "opt-group" },
});
/** @type {__VLS_StyleScopedClasses['opt-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "opt-label" },
});
/** @type {__VLS_StyleScopedClasses['opt-label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.toggleAllSite) },
    type: "checkbox",
    checked: (__VLS_ctx.isAllSiteSelected),
});
for (const [s] of __VLS_vFor((__VLS_ctx.allSites))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        key: (s),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                return (__VLS_ctx.toggleSite(s));
                // @ts-ignore
                [lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, yieldColor, formatDate, onDataRangeChange, onDataRangeChange, options, options, toggleAllSite, isAllSiteSelected, allSites, toggleSite,];
            } },
        type: "checkbox",
        checked: (__VLS_ctx.options.selected_sites.includes(s)),
    });
    (s);
    // @ts-ignore
    [options,];
}
if (false) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "opt-group" },
    });
    /** @type {__VLS_StyleScopedClasses['opt-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "opt-label" },
    });
    /** @type {__VLS_StyleScopedClasses['opt-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (...[$event]) => {
                if (!(false))
                    throw 0;
                return (__VLS_ctx.renderBinMap());
                // @ts-ignore
                [renderBinMap,];
            } },
        value: (__VLS_ctx.options.rotate),
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "90",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "180",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "270",
    });
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "opt-group" },
});
/** @type {__VLS_StyleScopedClasses['opt-group']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.renderYieldPlot) },
    type: "checkbox",
});
(__VLS_ctx.options.show_yield_plot);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.renderFailBinChart) },
    type: "checkbox",
});
(__VLS_ctx.options.show_fail_bin);
if (__VLS_ctx.showUploadBinNameBtn) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showUploadBinNameBtn))
                    throw 0;
                return (__VLS_ctx.uploadModalVisible = true);
                // @ts-ignore
                [options, options, options, renderYieldPlot, renderFailBinChart, showUploadBinNameBtn, uploadModalVisible,];
            } },
        ...{ class: "export-btn" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.openParamAnalysis) },
    ...{ class: "export-btn" },
});
/** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleExport) },
    ...{ class: "export-btn" },
});
/** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bin-table-area" },
});
/** @type {__VLS_StyleScopedClasses['bin-table-area']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
    ...{ class: "bin-table" },
});
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
for (const [s] of __VLS_vFor((__VLS_ctx.options.selected_sites))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        key: (s),
    });
    (s);
    // @ts-ignore
    [options, openParamAnalysis, handleExport,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
    ...{ onClick: (__VLS_ctx.toggleBinSort) },
    ...{ class: "sortable" },
});
/** @type {__VLS_StyleScopedClasses['sortable']} */ ;
if (__VLS_ctx.binSortOrder === 'asc') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
else if (__VLS_ctx.binSortOrder === 'desc') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
if (__VLS_ctx.options.selected_sites.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: (5 + __VLS_ctx.options.selected_sites.length),
        ...{ style: {} },
    });
}
else {
    for (const [b] of __VLS_vFor((__VLS_ctx.sortedBins))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (b.bin_number),
            ...{ class: ({ 'pass-row': __VLS_ctx.isPassBin(b.bin_number) }) },
        });
        /** @type {__VLS_StyleScopedClasses['pass-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.options.selected_sites.length === 0))
                        throw 0;
                    return (__VLS_ctx.openBinDetail(b.bin_number, b.bin_name));
                    // @ts-ignore
                    [options, options, toggleBinSort, binSortOrder, binSortOrder, sortedBins, isPassBin, openBinDetail,];
                } },
            ...{ class: "bin-link" },
        });
        /** @type {__VLS_StyleScopedClasses['bin-link']} */ ;
        (b.bin_number);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (b.bin_name);
        for (const [s] of __VLS_vFor((__VLS_ctx.options.selected_sites))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                key: (s),
            });
            (b.sites[`site${s}`]?.count ?? 0);
            // @ts-ignore
            [options,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (b.all_site_count);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (b.all_site_pct?.toFixed(2));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onBlur: (...[$event]) => {
                    if (!!(__VLS_ctx.options.selected_sites.length === 0))
                        throw 0;
                    return (__VLS_ctx.saveComment(b));
                    // @ts-ignore
                    [saveComment,];
                } },
            type: "text",
            value: (b.comment),
            placeholder: "",
            ...{ style: {} },
        });
        // @ts-ignore
        [];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.tfoot, __VLS_intrinsics.tfoot)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
    ...{ class: "summary-row" },
});
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
    colspan: "2",
});
for (const [s] of __VLS_vFor((__VLS_ctx.options.selected_sites))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        key: (s),
    });
    (__VLS_ctx.getSitePass(s));
    (__VLS_ctx.getSiteTotal(s) > 0 ? (__VLS_ctx.getSitePass(s) / __VLS_ctx.getSiteTotal(s) * 100).toFixed(2) + '%' : '-');
    // @ts-ignore
    [options, getSitePass, getSitePass, getSiteTotal, getSiteTotal,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
(__VLS_ctx.getTotalPass());
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
(__VLS_ctx.getTotalAll() > 0 ? (__VLS_ctx.getTotalPass() / __VLS_ctx.getTotalAll() * 100).toFixed(2) + '%' : '-');
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
    ...{ class: "summary-row" },
});
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
    colspan: "2",
});
for (const [s] of __VLS_vFor((__VLS_ctx.options.selected_sites))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        key: (s),
    });
    (__VLS_ctx.getSiteFail(s));
    // @ts-ignore
    [options, getTotalPass, getTotalPass, getTotalAll, getTotalAll, getSiteFail,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
(__VLS_ctx.getTotalFail());
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
(__VLS_ctx.getTotalAll() > 0 ? (__VLS_ctx.getTotalFail() / __VLS_ctx.getTotalAll() * 100).toFixed(2) + '%' : '-');
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
    ...{ class: "summary-row" },
});
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
    colspan: "2",
});
for (const [s] of __VLS_vFor((__VLS_ctx.options.selected_sites))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        key: (s),
    });
    (__VLS_ctx.getSiteTotal(s));
    // @ts-ignore
    [options, getSiteTotal, getTotalAll, getTotalAll, getTotalFail, getTotalFail,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
(__VLS_ctx.getTotalAll());
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bottom-area" },
});
/** @type {__VLS_StyleScopedClasses['bottom-area']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "map-section" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.hasCoords), }, null, null);
/** @type {__VLS_StyleScopedClasses['map-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section-title" },
});
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "map-with-legend" },
    ...{ style: {} },
});
/** @type {__VLS_StyleScopedClasses['map-with-legend']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
    ref: "binMapCanvas",
    width: "800",
    height: "800",
    ...{ style: {} },
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "binMapTooltipEl",
    ...{ class: "bin-tooltip" },
    ...{ style: {} },
});
/** @type {__VLS_StyleScopedClasses['bin-tooltip']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bin-legend" },
});
/** @type {__VLS_StyleScopedClasses['bin-legend']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.selectedBin = null;
            __VLS_ctx.renderBinMap();
            // @ts-ignore
            [renderBinMap, getTotalAll, hasCoords, selectedBin,];
        } },
    ...{ class: (['bin-icon', { selected: __VLS_ctx.selectedBin === null }]) },
});
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "bin-dot" },
    ...{ style: {} },
});
/** @type {__VLS_StyleScopedClasses['bin-dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
for (const [b] of __VLS_vFor((__VLS_ctx.failBins))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.toggleBinHighlight(b.bin_number));
                // @ts-ignore
                [selectedBin, failBins, toggleBinHighlight,];
            } },
        key: (b.bin_number),
        ...{ class: (['bin-icon', { selected: __VLS_ctx.selectedBin === b.bin_number }]) },
    });
    /** @type {__VLS_StyleScopedClasses['selected']} */ ;
    /** @type {__VLS_StyleScopedClasses['bin-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "bin-dot" },
        ...{ style: ({ background: __VLS_ctx.getBinColor(b.bin_number) }) },
    });
    /** @type {__VLS_StyleScopedClasses['bin-dot']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (b.bin_number);
    (b.all_site_count);
    // @ts-ignore
    [selectedBin, getBinColor,];
}
if (__VLS_ctx.options.show_yield_plot) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "chart-section" },
    });
    /** @type {__VLS_StyleScopedClasses['chart-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-title" },
    });
    /** @type {__VLS_StyleScopedClasses['section-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
        ref: "yieldPlotCanvas",
        width: "400",
        height: "400",
        ...{ style: {} },
    });
}
if (__VLS_ctx.options.show_fail_bin) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "chart-section" },
    });
    /** @type {__VLS_StyleScopedClasses['chart-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-title" },
    });
    /** @type {__VLS_StyleScopedClasses['section-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "failBinChartRef",
        ...{ style: {} },
    });
}
if (__VLS_ctx.hasCoords && __VLS_ctx.lotInfo?.data_type === 'CP') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "retest-section" },
    });
    /** @type {__VLS_StyleScopedClasses['retest-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.hasCoords && __VLS_ctx.lotInfo?.data_type === 'CP'))
                    throw 0;
                return (__VLS_ctx.retestExpanded = !__VLS_ctx.retestExpanded);
                // @ts-ignore
                [lotInfo, options, options, hasCoords, retestExpanded, retestExpanded,];
            } },
        ...{ class: "retest-header" },
    });
    /** @type {__VLS_StyleScopedClasses['retest-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.retestExpanded ? '▲' : '▼');
    if (__VLS_ctx.retestExpanded && __VLS_ctx.retestData) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "retest-totals" },
        });
        /** @type {__VLS_StyleScopedClasses['retest-totals']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "total-item pass" },
        });
        /** @type {__VLS_StyleScopedClasses['total-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['pass']} */ ;
        (__VLS_ctx.retestData.totals.fail_to_pass);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "total-item fail" },
        });
        /** @type {__VLS_StyleScopedClasses['total-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['fail']} */ ;
        (__VLS_ctx.retestData.totals.pass_to_fail);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "total-item change" },
        });
        /** @type {__VLS_StyleScopedClasses['total-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['change']} */ ;
        (__VLS_ctx.retestData.totals.fail_to_fail);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "total-item same" },
        });
        /** @type {__VLS_StyleScopedClasses['total-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['same']} */ ;
        (__VLS_ctx.retestData.totals.pass_to_pass);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "total-item" },
        });
        /** @type {__VLS_StyleScopedClasses['total-item']} */ ;
        (__VLS_ctx.retestData.totals.total_retest_dies);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "retest-tables" },
        });
        /** @type {__VLS_StyleScopedClasses['retest-tables']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "retest-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['retest-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-title" },
        });
        /** @type {__VLS_StyleScopedClasses['table-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "retest-table" },
        });
        /** @type {__VLS_StyleScopedClasses['retest-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.hasCoords && __VLS_ctx.lotInfo?.data_type === 'CP'))
                        throw 0;
                    if (!(__VLS_ctx.retestExpanded && __VLS_ctx.retestData))
                        throw 0;
                    return (__VLS_ctx.toggleRetestSort('from_bin'));
                    // @ts-ignore
                    [retestExpanded, retestExpanded, retestData, retestData, retestData, retestData, retestData, retestData, toggleRetestSort,];
                } },
            ...{ class: "sortable" },
        });
        /** @type {__VLS_StyleScopedClasses['sortable']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.retestSortKey === 'from_bin' ? (__VLS_ctx.retestSortDir === 'asc' ? '↑' : '↓') : '↕');
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.hasCoords && __VLS_ctx.lotInfo?.data_type === 'CP'))
                        throw 0;
                    if (!(__VLS_ctx.retestExpanded && __VLS_ctx.retestData))
                        throw 0;
                    return (__VLS_ctx.toggleRetestSort('count'));
                    // @ts-ignore
                    [toggleRetestSort, retestSortKey, retestSortDir,];
                } },
            ...{ class: "sortable" },
        });
        /** @type {__VLS_StyleScopedClasses['sortable']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.retestSortKey === 'count' ? (__VLS_ctx.retestSortDir === 'asc' ? '↑' : '↓') : '↕');
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [s] of __VLS_vFor((__VLS_ctx.sortedRetestSummary))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (`${s.from_bin}-${s.to_bin}`),
                ...{ class: (__VLS_ctx.directionClass(s.direction, s.no_change)) },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.from_bin);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.to_bin);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.count);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.directionLabel(s.direction, s.no_change));
            // @ts-ignore
            [retestSortKey, retestSortDir, sortedRetestSummary, directionClass, directionLabel,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "retest-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['retest-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-title" },
        });
        /** @type {__VLS_StyleScopedClasses['table-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "retest-table" },
        });
        /** @type {__VLS_StyleScopedClasses['retest-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [d] of __VLS_vFor((__VLS_ctx.retestData.details))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (`${d.x}-${d.y}`),
                ...{ class: (__VLS_ctx.directionClass(__VLS_ctx.getDirection(d.first_bin, d.last_bin), d.first_bin === d.last_bin)) },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (d.x);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (d.y);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (d.first_site);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (d.first_bin);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (d.last_site);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (d.last_bin);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (d.retest_count);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (d.site_changed ? '✓' : '');
            // @ts-ignore
            [retestData, directionClass, getDirection,];
        }
    }
}
if (__VLS_ctx.binDetailVisible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.binDetailVisible))
                    throw 0;
                return (__VLS_ctx.binDetailVisible = false);
                // @ts-ignore
                [binDetailVisible, binDetailVisible,];
            } },
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.binDetailNum);
    (__VLS_ctx.binDetailName);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.binDetailVisible))
                    throw 0;
                return (__VLS_ctx.binDetailVisible = false);
                // @ts-ignore
                [binDetailVisible, binDetailNum, binDetailName,];
            } },
        ...{ class: "modal-close" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-close']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
        ref: "binDetailCanvas",
        width: "500",
        height: "500",
        ...{ style: {} },
    });
}
if (__VLS_ctx.uploadModalVisible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.uploadModalVisible))
                    throw 0;
                return (__VLS_ctx.uploadModalVisible = false);
                // @ts-ignore
                [uploadModalVisible, uploadModalVisible,];
            } },
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.uploadModalVisible))
                    throw 0;
                return (__VLS_ctx.uploadModalVisible = false);
                // @ts-ignore
                [uploadModalVisible,];
            } },
        ...{ class: "modal-close" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['modal-close']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    (__VLS_ctx.lotInfo?.program || '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.br)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
        value: (__VLS_ctx.pastedText),
        placeholder: "请类似于 txt 页面，将包含 sbin 序号和名字的内容粘贴到这里...",
        ...{ style: {} },
        onfocus: "this.style.borderColor='#40a9ff'",
        onblur: "this.style.borderColor='#d9d9d9'",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.uploadModalVisible))
                    throw 0;
                return (__VLS_ctx.uploadModalVisible = false);
                // @ts-ignore
                [lotInfo, uploadModalVisible, pastedText,];
            } },
        ...{ class: "modal-btn cancel" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['cancel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleApplyBinNames) },
        ...{ class: "modal-btn confirm" },
        disabled: (!__VLS_ctx.pastedText.trim()),
    });
    /** @type {__VLS_StyleScopedClasses['modal-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['confirm']} */ ;
}
// @ts-ignore
[pastedText, handleApplyBinNames,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
