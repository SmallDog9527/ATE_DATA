import { ref, onMounted, computed, nextTick, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import * as echarts from 'echarts';
import api from '@/api';
const route = useRoute();
const lotId = route.params.id;
const loading = ref(true);
const lotInfo = ref(null);
const checkData = ref(null);
const threshold = ref(2);
const dataFilter = ref('pass_only'); // 默认使用 Bin1+2 (Pass Only)
// 导出进度相关
const exporting = ref(false);
const exportProgress = ref(0);
const exportError = ref('');
const weights = ref([]);
const showFormula = ref(false);
const listFilter = ref('alarm'); // 列表过滤器，默认只显示报警
let exportTimer = null;
// 设置弹窗相关
const showSettings = ref(false);
const selectedParams = ref([]);
const allParams = ref([]);
const paramSearch = ref('');
const tempThreshold = ref(2);
const savingConfig = ref(false);
const processingCorr = ref(false);
const filteredParams = computed(() => {
    if (!paramSearch.value)
        return allParams.value;
    const s = paramSearch.value.toLowerCase();
    return allParams.value.filter(p => p.toLowerCase().includes(s));
});
const scatterChart = ref();
const waferMapCanvas = ref();
const waferMapTooltip = ref(null);
let scatterInstance = null;
let idleMapDies = [];
const hasCoordinates = computed(() => {
    return checkData.value?.data?.[0]?.X_COORD !== undefined;
});
const filteredListData = computed(() => {
    if (!checkData.value?.data)
        return [];
    if (listFilter.value === 'all')
        return checkData.value.data;
    if (listFilter.value === 'normal')
        return checkData.value.data.filter((d) => !d.is_alarm);
    return checkData.value.data.filter((d) => d.is_alarm);
});
const alarmCount = computed(() => {
    if (!checkData.value?.data)
        return 0;
    return checkData.value.data.filter((d) => d.is_alarm).length;
});
const listFilterLabel = computed(() => {
    if (listFilter.value === 'all')
        return '全部';
    if (listFilter.value === 'normal')
        return '正常';
    return `报警 (${alarmCount.value})`;
});
function toggleListFilter() {
    if (listFilter.value === 'alarm')
        listFilter.value = 'all';
    else if (listFilter.value === 'all')
        listFilter.value = 'normal';
    else
        listFilter.value = 'alarm';
}
async function fetchData() {
    loading.value = true;
    try {
        const info = await api.get(`/analysis/lot/${lotId}/info`);
        lotInfo.value = info;
        // 先获取一次默认数据（以获取参数列表）
        const res = await api.get(`/analysis/lot/${lotId}/idle_check`, {
            params: {
                threshold: threshold.value,
                data_filter: dataFilter.value,
                weights: weights.value.join(',')
            }
        });
        // 默认启用随机权重算法，避免碰撞 (如果当前还没有权重且后端返回了参数列表)
        if (weights.value.length === 0 && res.params && res.params.length > 0) {
            const len = res.params.length;
            weights.value = Array.from({ length: len }, () => Math.floor(Math.random() * 99) + 1);
            // 重新获取带权重的数据
            const resWithWeights = await api.get(`/analysis/lot/${lotId}/idle_check`, {
                params: {
                    threshold: threshold.value,
                    data_filter: dataFilter.value,
                    weights: weights.value.join(',')
                }
            });
            checkData.value = resWithWeights;
            threshold.value = resWithWeights.threshold;
        }
        else {
            checkData.value = res;
            threshold.value = res.threshold;
        }
        await nextTick();
        initCharts();
    }
    catch (e) {
        console.error(e);
        alert('获取数据失败');
    }
    finally {
        loading.value = false;
    }
}
async function openSettings() {
    try {
        loading.value = true;
        // 获取所有可用参数
        const items = await api.get(`/analysis/lot/${lotId}/items_summary`);
        allParams.value = items.map(it => it.item_name);
        // 获取当前配置
        const config = await api.get('/analysis/idle_check/config', {
            params: { program_name: checkData.value.program }
        });
        selectedParams.value = config.params || [];
        tempThreshold.value = config.threshold || threshold.value;
        showSettings.value = true;
    }
    catch (e) {
        alert('获取参数列表失败');
    }
    finally {
        loading.value = false;
    }
}
async function saveSettings() {
    savingConfig.value = true;
    try {
        await api.post('/analysis/idle_check/config', {
            program_name: checkData.value.program,
            params: selectedParams.value,
            threshold: tempThreshold.value
        });
        showSettings.value = false;
        // 刷新数据
        threshold.value = tempThreshold.value;
        await fetchData();
    }
    catch (e) {
        alert('保存失败');
    }
    finally {
        savingConfig.value = false;
    }
}
async function handleCorrProcessing() {
    if (!confirm('Corr处理将基于指纹匹配对齐各Site数据，并丢弃无法匹配的数据，最后保存为新数据包，是否继续？'))
        return;
    processingCorr.value = true;
    try {
        const res = await api.post(`/analysis/lot/${lotId}/idle_check/corr`, null, {
            params: {
                threshold: threshold.value,
                data_filter: dataFilter.value,
                weights: weights.value.join(',')
            }
        });
        alert(`处理完成！新数据已生成：${res.filename}\n请前往Home页查看。`);
    }
    catch (e) {
        alert('处理失败: ' + (e.response?.data?.detail || e.message));
    }
    finally {
        processingCorr.value = false;
    }
}
async function initCharts() {
    if (!checkData.value?.data)
        return;
    // Scatter Chart
    if (scatterChart.value) {
        if (!scatterInstance)
            scatterInstance = echarts.init(scatterChart.value);
        const series = [];
        const SITE_COLORS = ['#1890ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1', '#13c2c2', '#fa541c', '#a0d911'];
        let xAxisMax = undefined;
        if (checkData.value.has_sites) {
            // 按 Site 分组
            const groups = {};
            checkData.value.data.forEach((d) => {
                const s = d.SITE_NUM;
                if (!groups[s])
                    groups[s] = [];
                groups[s].push(d);
            });
            // 计算各 site 最大数量，X 轴取最大值
            const siteCounts = Object.values(groups).map((arr) => arr.length);
            xAxisMax = Math.max(...siteCounts);
            Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach((site, i) => {
                const siteData = groups[site];
                series.push({
                    name: `Site ${site}`,
                    type: 'scatter',
                    symbolSize: 6,
                    // 使用 site 内部的独立序号作为 X 轴，第 4 个值存全局 index 用于点击联动
                    data: siteData.map((d, siteIdx) => [siteIdx, d.fingerprint, d.is_alarm, d.index]),
                    itemStyle: {
                        color: (p) => {
                            const isAlarm = p.value[2];
                            if (isAlarm)
                                return '#ff4d4f';
                            // 非报警点：使用半透明颜色，使其看起来更淡
                            const baseColor = SITE_COLORS[i % SITE_COLORS.length];
                            return baseColor + '88'; // 添加透明度
                        }
                    }
                });
            });
        }
        else {
            const data = checkData.value.data.map((d, idx) => [idx, d.fingerprint, d.is_alarm, d.index]);
            xAxisMax = data.length;
            series.push({
                type: 'scatter',
                symbolSize: 6,
                data: data,
                itemStyle: {
                    color: (p) => p.value[2] ? '#ff4d4f' : 'rgba(24, 144, 255, 0.2)'
                }
            });
        }
        const option = {
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    return params.map((p) => {
                        const d = p.value;
                        return `${p.seriesName}<br/>Site内序号: ${d[0] + 1}<br/>Fingerprint: ${d[1].toFixed(4)}<br/>状态: ${d[2] ? '报警' : '正常'}`;
                    }).join('<br/><hr/>');
                }
            },
            legend: { show: checkData.value.has_sites, top: 0 },
            grid: { top: checkData.value.has_sites ? 40 : 20, bottom: 40, left: 60, right: 20 },
            xAxis: { type: 'value', name: 'Site内序号', min: 0, max: xAxisMax },
            yAxis: { type: 'value', name: 'Fingerprint', scale: true },
            series: series
        };
        scatterInstance.setOption(option, true);
        // 联动：点击图表跳转到列表对应行（value[3] 是全局 index）
        scatterInstance.on('click', (params) => {
            const dataIndex = params.value[3];
            scrollToRow(dataIndex);
        });
    }
    // Wafer Map - Canvas based (same as BinView)
    if (hasCoordinates.value) {
        await nextTick();
        drawIdleMap();
    }
}
function drawIdleMap() {
    const canvas = waferMapCanvas.value;
    if (!canvas || !hasCoordinates.value || !checkData.value?.data)
        return;
    const data = checkData.value.data.filter((d) => d.X_COORD !== undefined);
    if (!data.length)
        return;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const d of data) {
        if (d.X_COORD < minX)
            minX = d.X_COORD;
        if (d.X_COORD > maxX)
            maxX = d.X_COORD;
        if (d.Y_COORD < minY)
            minY = d.Y_COORD;
        if (d.Y_COORD > maxY)
            maxY = d.Y_COORD;
    }
    const W = canvas.width, H = canvas.height;
    const margin = 60;
    const centerX = W / 2;
    const centerY = H / 2;
    const radius = Math.min(W, H) / 2 - margin;
    const gridW = maxX - minX + 1;
    const gridH = maxY - minY + 1;
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
    // 绘制 Notch (缺口)
    ctx.beginPath();
    ctx.arc(centerX, centerY + radius, 12, Math.PI, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#cccccc';
    ctx.stroke();
    idleMapDies = [];
    for (const d of data) {
        const px = offsetX + (d.X_COORD - minX) * dieW;
        const py = offsetY + (d.Y_COORD - minY) * dieH;
        ctx.fillStyle = d.is_alarm ? '#ff4d4f' : '#69db7c';
        const drawW = Math.max(0.5, dieW - 0.2);
        const drawH = Math.max(0.5, dieH - 0.2);
        ctx.fillRect(px, py, drawW, drawH);
        idleMapDies.push({ px, py, width: dieW, height: dieH, x: d.X_COORD, y: d.Y_COORD, isAlarm: d.is_alarm, index: d.index });
    }
    // 坐标标注
    ctx.fillStyle = '#999';
    const fontSize = Math.max(8, Math.min(11, Math.min(dieW, dieH) * 0.8));
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    const xStep = Math.max(1, Math.ceil(gridW / 15));
    for (let x = minX; x <= maxX; x += xStep) {
        ctx.fillText(String(x), offsetX + (x - minX) * dieW + dieW / 2, offsetY - 10);
        ctx.fillText(String(x), offsetX + (x - minX) * dieW + dieW / 2, offsetY + radius * 2 + 15);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yStep = Math.max(1, Math.ceil(gridH / 15));
    for (let y = minY; y <= maxY; y += yStep) {
        ctx.fillText(String(y), offsetX - 10, offsetY + (y - minY) * dieH + dieH / 2);
    }
}
function onIdleMapMouseMove(evt) {
    const canvas = waferMapCanvas.value;
    const tooltipEl = waferMapTooltip.value;
    if (!canvas || !tooltipEl || !idleMapDies.length)
        return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (evt.clientX - rect.left) * scaleX;
    const my = (evt.clientY - rect.top) * scaleY;
    let found = null;
    for (const die of idleMapDies) {
        if (mx >= die.px && mx <= die.px + die.width && my >= die.py && my <= die.py + die.height) {
            found = die;
            break;
        }
    }
    if (found) {
        tooltipEl.innerHTML = `<div>X: ${found.x}, Y: ${found.y}</div><div>状态: ${found.isAlarm ? '⚠ 报警' : '✓ 正常'}</div><div>Index: ${found.index + 1}</div>`;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = (evt.offsetX + 14) + 'px';
        tooltipEl.style.top = (evt.offsetY + 14) + 'px';
    }
    else {
        tooltipEl.style.display = 'none';
    }
}
function onIdleMapMouseLeave() {
    if (waferMapTooltip.value)
        waferMapTooltip.value.style.display = 'none';
}
function onIdleMapClick(evt) {
    const canvas = waferMapCanvas.value;
    if (!canvas || !idleMapDies.length)
        return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (evt.clientX - rect.left) * scaleX;
    const my = (evt.clientY - rect.top) * scaleY;
    for (const die of idleMapDies) {
        if (mx >= die.px && mx <= die.px + die.width && my >= die.py && my <= die.py + die.height) {
            scrollToRow(die.index);
            break;
        }
    }
}
function scrollToRow(index) {
    const row = document.getElementById(`row-${index}`);
    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('highlight-row');
        setTimeout(() => row.classList.remove('highlight-row'), 2000);
    }
}
function handleRandomAlgo() {
    if (!checkData.value?.params)
        return;
    const len = checkData.value.params.length;
    // 生成随机正整数权重 (1-100)
    const newWeights = [];
    for (let i = 0; i < len; i++) {
        newWeights.push(Math.floor(Math.random() * 99) + 1);
    }
    weights.value = newWeights;
    fetchData();
}
async function handleExport() {
    if (exporting.value)
        return;
    exporting.value = true;
    exportProgress.value = 0;
    exportError.value = '';
    try {
        // 1. 启动导出任务
        const { task_id } = await api.post(`/analysis/lot/${lotId}/idle_check/export/start`, null, {
            params: {
                threshold: threshold.value,
                data_filter: dataFilter.value,
                weights: weights.value.join(',')
            }
        });
        // 2. 轮询状态
        exportTimer = setInterval(async () => {
            try {
                const res = await api.get(`/analysis/idle_check/export/status/${task_id}`);
                exportProgress.value = res.progress;
                if (res.status === 'completed') {
                    clearInterval(exportTimer);
                    // 3. 下载结果
                    const downloadRes = await api.get(`/analysis/idle_check/export/download/${task_id}`, {
                        responseType: 'blob'
                    });
                    const blob = downloadRes.data;
                    const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
                    const link = document.createElement('a');
                    link.href = url;
                    const fileName = lotInfo.value?.filename ? `IdleCheck_${lotInfo.value.filename}.xlsx` : 'IdleCheck_Data.xlsx';
                    link.setAttribute('download', fileName);
                    document.body.appendChild(link);
                    link.click();
                    setTimeout(() => {
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                        exporting.value = false;
                    }, 1000);
                }
                else if (res.status === 'failed') {
                    clearInterval(exportTimer);
                    exportError.value = res.error || '导出失败';
                }
            }
            catch (err) {
                clearInterval(exportTimer);
                exportError.value = '获取进度失败';
            }
        }, 1000);
    }
    catch (e) {
        exporting.value = false;
        alert('启动导出失败');
    }
}
function handleResize() {
    scatterInstance?.resize();
    if (hasCoordinates.value)
        drawIdleMap();
}
onMounted(() => {
    fetchData();
    window.addEventListener('resize', handleResize);
});
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
onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    if (exportTimer)
        clearInterval(exportTimer);
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['threshold-input']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-label']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-label']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable-header']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-random']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-display']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-download']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-download']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-corr']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-corr']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['main-content']} */ ;
/** @type {__VLS_StyleScopedClasses['list-section']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['param-item']} */ ;
/** @type {__VLS_StyleScopedClasses['param-item']} */ ;
/** @type {__VLS_StyleScopedClasses['param-item']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "idle-check-view" },
});
/** @type {__VLS_StyleScopedClasses['idle-check-view']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header-bar" },
});
/** @type {__VLS_StyleScopedClasses['header-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "title" },
});
/** @type {__VLS_StyleScopedClasses['title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "subtitle" },
});
/** @type {__VLS_StyleScopedClasses['subtitle']} */ ;
(__VLS_ctx.lotInfo?.filename);
(__VLS_ctx.checkData?.program);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "actions" },
});
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "threshold-input" },
});
/** @type {__VLS_StyleScopedClasses['threshold-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.fetchData) },
    type: "number",
    min: "2",
});
(__VLS_ctx.threshold);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "filter-options" },
});
/** @type {__VLS_StyleScopedClasses['filter-options']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "radio-label" },
    ...{ class: ({ active: __VLS_ctx.dataFilter === 'all' }) },
});
/** @type {__VLS_StyleScopedClasses['radio-label']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.fetchData) },
    type: "radio",
    value: "all",
});
(__VLS_ctx.dataFilter);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "radio-label" },
    ...{ class: ({ active: __VLS_ctx.dataFilter === 'pass_only' }) },
});
/** @type {__VLS_StyleScopedClasses['radio-label']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.fetchData) },
    type: "radio",
    value: "pass_only",
});
(__VLS_ctx.dataFilter);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "algorithm-box" },
});
/** @type {__VLS_StyleScopedClasses['algorithm-box']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleRandomAlgo) },
    ...{ class: "btn btn-random" },
});
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-random']} */ ;
if (__VLS_ctx.checkData?.params) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "formula-display" },
    });
    /** @type {__VLS_StyleScopedClasses['formula-display']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "formula-label" },
    });
    /** @type {__VLS_StyleScopedClasses['formula-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    if (__VLS_ctx.showFormula) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "formula-detail" },
        });
        /** @type {__VLS_StyleScopedClasses['formula-detail']} */ ;
        for (const [p, i] of __VLS_vFor((__VLS_ctx.checkData.params))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (p),
                ...{ class: "formula-item" },
            });
            /** @type {__VLS_StyleScopedClasses['formula-item']} */ ;
            (p);
            __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
            (__VLS_ctx.checkData.weights[i]);
            // @ts-ignore
            [lotInfo, checkData, checkData, checkData, checkData, fetchData, fetchData, fetchData, threshold, dataFilter, dataFilter, dataFilter, dataFilter, handleRandomAlgo, showFormula,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.checkData?.params))
                    throw 0;
                return (__VLS_ctx.showFormula = !__VLS_ctx.showFormula);
                // @ts-ignore
                [showFormula, showFormula,];
            } },
        ...{ class: "formula-toggle" },
    });
    /** @type {__VLS_StyleScopedClasses['formula-toggle']} */ ;
    (__VLS_ctx.showFormula ? '收起' : '查看详情');
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleExport) },
    ...{ class: "btn btn-download" },
    disabled: (__VLS_ctx.alarmCount === 0),
});
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-download']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleCorrProcessing) },
    ...{ class: "btn btn-corr" },
    disabled: (__VLS_ctx.processingCorr),
    title: "跨Site指纹对齐并保存为新数据",
});
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-corr']} */ ;
(__VLS_ctx.processingCorr ? '处理中...' : 'Corr处理');
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.openSettings) },
    ...{ class: "btn btn-settings" },
});
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-settings']} */ ;
if (__VLS_ctx.showSettings) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showSettings))
                    throw 0;
                return (__VLS_ctx.showSettings = false);
                // @ts-ignore
                [showFormula, handleExport, alarmCount, handleCorrProcessing, processingCorr, processingCorr, openSettings, showSettings, showSettings,];
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
    (__VLS_ctx.checkData?.program);
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
                    if (!(__VLS_ctx.showSettings))
                        throw 0;
                    return (__VLS_ctx.onCheckboxClick($event, p));
                    // @ts-ignore
                    [checkData, paramSearch, selectedParams, filteredParams, onCheckboxClick,];
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
    (__VLS_ctx.tempThreshold);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showSettings))
                    throw 0;
                return (__VLS_ctx.showSettings = false);
                // @ts-ignore
                [showSettings, tempThreshold,];
            } },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.saveSettings) },
        ...{ class: "btn btn-primary" },
        disabled: (!__VLS_ctx.selectedParams.length || __VLS_ctx.savingConfig),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.savingConfig ? '保存并刷新' : '保存并刷新');
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "main-content" },
    ...{ class: ({ 'no-map': !__VLS_ctx.hasCoordinates }) },
});
/** @type {__VLS_StyleScopedClasses['main-content']} */ ;
/** @type {__VLS_StyleScopedClasses['no-map']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chart-section" },
});
/** @type {__VLS_StyleScopedClasses['chart-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chart-header" },
});
/** @type {__VLS_StyleScopedClasses['chart-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "legend" },
});
/** @type {__VLS_StyleScopedClasses['legend']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "legend-item" },
});
/** @type {__VLS_StyleScopedClasses['legend-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({
    ...{ class: "dot normal" },
});
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['normal']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "legend-item" },
});
/** @type {__VLS_StyleScopedClasses['legend-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({
    ...{ class: "dot alarm" },
});
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['alarm']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "scatterChart",
    ...{ class: "chart-container" },
});
/** @type {__VLS_StyleScopedClasses['chart-container']} */ ;
if (__VLS_ctx.hasCoordinates) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "map-section" },
    });
    /** @type {__VLS_StyleScopedClasses['map-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "chart-header" },
    });
    /** @type {__VLS_StyleScopedClasses['chart-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "map-container" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['map-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
        ref: "waferMapCanvas",
        width: "960",
        height: "960",
        ...{ class: "wafer-map-canvas" },
    });
    /** @type {__VLS_StyleScopedClasses['wafer-map-canvas']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "waferMapTooltip",
        ...{ class: "map-tooltip" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['map-tooltip']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "list-section" },
});
/** @type {__VLS_StyleScopedClasses['list-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chart-header" },
});
/** @type {__VLS_StyleScopedClasses['chart-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "table-container" },
});
/** @type {__VLS_StyleScopedClasses['table-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
    ...{ class: "data-table" },
});
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
if (__VLS_ctx.checkData?.has_sites) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
}
if (__VLS_ctx.hasCoordinates) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
}
if (__VLS_ctx.hasCoordinates) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
}
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
    ...{ onClick: (__VLS_ctx.toggleListFilter) },
    ...{ class: "clickable-header" },
    title: "点击切换过滤状态",
});
/** @type {__VLS_StyleScopedClasses['clickable-header']} */ ;
(__VLS_ctx.listFilterLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
for (const [item] of __VLS_vFor((__VLS_ctx.filteredListData))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        key: (item.index),
        id: (`row-${item.index}`),
        ...{ class: ({ 'row-alarm': item.is_alarm }) },
    });
    /** @type {__VLS_StyleScopedClasses['row-alarm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (item.index + 1);
    if (__VLS_ctx.checkData?.has_sites) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (item.SITE_NUM);
    }
    if (__VLS_ctx.hasCoordinates) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (item.X_COORD);
    }
    if (__VLS_ctx.hasCoordinates) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (item.Y_COORD);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (item.fingerprint.toFixed(4));
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    if (item.is_alarm) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "badge-alarm" },
        });
        /** @type {__VLS_StyleScopedClasses['badge-alarm']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "badge-normal" },
        });
        /** @type {__VLS_StyleScopedClasses['badge-normal']} */ ;
    }
    // @ts-ignore
    [checkData, checkData, selectedParams, saveSettings, savingConfig, savingConfig, hasCoordinates, hasCoordinates, hasCoordinates, hasCoordinates, hasCoordinates, hasCoordinates, toggleListFilter, listFilterLabel, filteredListData,];
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-overlay']} */ ;
}
if (__VLS_ctx.exporting) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal export-modal" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    /** @type {__VLS_StyleScopedClasses['export-modal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "progress-container" },
    });
    /** @type {__VLS_StyleScopedClasses['progress-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "progress-bar" },
        ...{ style: ({ width: __VLS_ctx.exportProgress + '%' }) },
    });
    /** @type {__VLS_StyleScopedClasses['progress-bar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "progress-text" },
    });
    /** @type {__VLS_StyleScopedClasses['progress-text']} */ ;
    (__VLS_ctx.exportProgress);
    if (__VLS_ctx.exportError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "export-error" },
        });
        /** @type {__VLS_StyleScopedClasses['export-error']} */ ;
        (__VLS_ctx.exportError);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.exporting))
                        throw 0;
                    if (!(__VLS_ctx.exportError))
                        throw 0;
                    return (__VLS_ctx.exporting = false);
                    // @ts-ignore
                    [loading, exporting, exporting, exportProgress, exportProgress, exportError, exportError,];
                } },
            ...{ class: "btn btn-sm" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
