import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import * as echarts from 'echarts';
import api from '@/api';
const route = useRoute();
const lotIdsStr = route.query.lot_ids;
const initialParam = ref(decodeURIComponent(route.query.param_name || ''));
const initialMode = route.query.mode === 'single' ? 'single' : 'lot';
const initialSingleLotName = route.query.single_lot_name || 'all_lots';
const initialLotDisplayNames = (() => {
    try {
        const raw = route.query.lot_display_names;
        return raw ? JSON.parse(raw) : {};
    }
    catch {
        return {};
    }
})();
const paramList = ref([]);
const currentParamName = ref(initialParam.value);
const activeTab = ref('');
const tabCounter = ref(0);
const LOT_COLORS = ['#4dabf7', '#ff6b6b', '#69db7c', '#ffd43b', '#e599f7', '#ffa94d', '#74c0fc', '#a9e34b'];
const tabs = ref([]);
const currentTab = computed(() => tabs.value.find(t => t.id === activeTab.value));
const draftOptions = ref({
    filter_type: 'all',
    data_range: 'final',
    sigma: 3,
    custom_min: null,
    custom_max: null,
    custom_ll: null,
    custom_ul: null,
    histMode: initialMode,
    single_lot_name: initialSingleLotName,
    lot_display_names: initialLotDisplayNames,
});
const sigmaInputValue = ref(draftOptions.value.sigma);
const customMinInput = ref(null);
const customMaxInput = ref(null);
const customLLInput = ref(null);
const customULInput = ref(null);
// ECharts实例管理
const chartInstances = {};
watch(currentTab, (newTab) => {
    if (newTab) {
        sigmaInputValue.value = newTab.options.sigma;
        customMinInput.value = newTab.options.custom_min;
        customMaxInput.value = newTab.options.custom_max;
        customLLInput.value = newTab.options.custom_ll;
        customULInput.value = newTab.options.custom_ul;
        currentParamName.value = newTab.param_name;
    }
}, { immediate: true });
function setChartRef(tabId, el) {
    if (!tabId)
        return;
    const key = `${tabId}_hist`;
    if (el) {
        if (chartInstances[key]?.dispose)
            chartInstances[key].dispose();
        chartInstances[key] = echarts.init(el);
        nextTick(() => renderHist(tabId));
    }
    else {
        if (chartInstances[key]?.dispose) {
            chartInstances[key].dispose();
            delete chartInstances[key];
        }
    }
}
function getLotDisplayName(lot) {
    const custom = currentTab.value?.options?.lot_display_names?.[String(lot.lot_id)];
    if (custom)
        return custom;
    if (lot?.lot_id_str && lot?.wafer_id)
        return `${lot.lot_id_str}-${lot.wafer_id}`;
    return lot?.wafer_id || lot?.lot_id_str || lot?.filename;
}
async function fetchParamList() {
    const firstId = lotIdsStr.split(',')[0];
    paramList.value = await api.get(`/analysis/lot/${firstId}/items`, { params: { site: 0 } });
}
async function fetchParamData(paramName, options) {
    return await api.get('/analysis/multi/param_hist', {
        params: {
            lot_ids: lotIdsStr,
            param_name: paramName,
            filter_type: options.filter_type,
            sigma: options.sigma,
            data_range: options.data_range,
            custom_min: options.filter_type === 'custom' ? options.custom_min : undefined,
            custom_max: options.filter_type === 'custom' ? options.custom_max : undefined,
            custom_ll: options.filter_type === 'custom' ? options.custom_ll : undefined,
            custom_ul: options.filter_type === 'custom' ? options.custom_ul : undefined,
        }
    });
}
async function addTab() {
    const paramName = currentParamName.value;
    tabCounter.value++;
    const tabId = `tab_${tabCounter.value}`;
    const paramItem = paramList.value.find(p => p.item_name === paramName);
    const title = `${paramItem?.item_number ?? ''}:${paramName} #${tabCounter.value}`;
    let optionsToUse;
    if (currentTab.value) {
        optionsToUse = JSON.parse(JSON.stringify(currentTab.value.options));
        if (currentTab.value.param_name !== paramName) {
            optionsToUse.custom_min = null;
            optionsToUse.custom_max = null;
            optionsToUse.custom_ll = null;
            optionsToUse.custom_ul = null;
        }
    }
    else {
        optionsToUse = { ...draftOptions.value };
    }
    const newTab = {
        id: tabId,
        title,
        item_number: paramItem?.item_number ?? '',
        param_name: paramName,
        options: optionsToUse,
        data: null,
    };
    if (tabs.value.length >= 10)
        tabs.value.shift();
    if (optionsToUse.single_lot_name === undefined) {
        optionsToUse.single_lot_name = 'all_lots';
    }
    if (optionsToUse.lot_display_names === undefined) {
        optionsToUse.lot_display_names = initialLotDisplayNames;
    }
    tabs.value.push(newTab);
    activeTab.value = tabId;
    await loadTabData(tabId);
}
async function loadTabData(tabId) {
    const tab = tabs.value.find(t => t.id === tabId);
    if (!tab)
        return;
    const data = await fetchParamData(tab.param_name, tab.options);
    tab.data = data;
    if (tab.options.filter_type === 'custom' && tab.options.custom_min == null && tab.options.custom_max == null) {
        // 设置默认custom极值：找到所有LOT的全局最值
        let globalMin = Infinity;
        let globalMax = -Infinity;
        data.lots.forEach((lot) => {
            if (lot.stats?.min_val != null)
                globalMin = Math.min(globalMin, lot.stats.min_val);
            if (lot.stats?.max_val != null)
                globalMax = Math.max(globalMax, lot.stats.max_val);
        });
        if (globalMin !== Infinity) {
            tab.options.custom_min = globalMin;
            tab.options.custom_max = globalMax;
            customMinInput.value = globalMin;
            customMaxInput.value = globalMax;
        }
        tab.options.custom_ll = data.lower_limit;
        tab.options.custom_ul = data.upper_limit;
        customLLInput.value = data.lower_limit;
        customULInput.value = data.upper_limit;
    }
    await nextTick();
    renderHist(tabId);
}
function closeTab(tabId) {
    const idx = tabs.value.findIndex(t => t.id === tabId);
    tabs.value.splice(idx, 1);
    if (activeTab.value === tabId) {
        activeTab.value = tabs.value[tabs.value.length - 1]?.id ?? '';
    }
    const key = `${tabId}_hist`;
    if (chartInstances[key]?.dispose)
        chartInstances[key].dispose();
    delete chartInstances[key];
}
async function updateOption(key, value) {
    if (!currentTab.value)
        return;
    currentTab.value.options[key] = value;
    if (key === 'histMode') {
        renderHist(currentTab.value.id);
    }
    else {
        await loadTabData(currentTab.value.id);
    }
}
async function updateFilterType(value) {
    if (!currentTab.value)
        return;
    currentTab.value.options.filter_type = value;
    if (value !== 'filter_by_sigma') {
        sigmaInputValue.value = draftOptions.value.sigma;
    }
    if (value === 'custom' && currentTab.value.data) {
        let globalMin = Infinity;
        let globalMax = -Infinity;
        currentTab.value.data.lots.forEach((lot) => {
            if (lot.stats?.min_val != null)
                globalMin = Math.min(globalMin, lot.stats.min_val);
            if (lot.stats?.max_val != null)
                globalMax = Math.max(globalMax, lot.stats.max_val);
        });
        if (globalMin !== Infinity) {
            customMinInput.value = globalMin;
            customMaxInput.value = globalMax;
            currentTab.value.options.custom_min = globalMin;
            currentTab.value.options.custom_max = globalMax;
        }
        customLLInput.value = currentTab.value.data.lower_limit;
        customULInput.value = currentTab.value.data.upper_limit;
        currentTab.value.options.custom_ll = currentTab.value.data.lower_limit;
        currentTab.value.options.custom_ul = currentTab.value.data.upper_limit;
    }
    await loadTabData(currentTab.value.id);
}
function applySigma() {
    if (!currentTab.value)
        return;
    currentTab.value.options.sigma = sigmaInputValue.value;
    loadTabData(currentTab.value.id);
}
function applyCustomRange() {
    if (!currentTab.value)
        return;
    currentTab.value.options.custom_min = customMinInput.value;
    currentTab.value.options.custom_max = customMaxInput.value;
    currentTab.value.options.custom_ll = customLLInput.value;
    currentTab.value.options.custom_ul = customULInput.value;
    loadTabData(currentTab.value.id);
}
function prevParam() {
    const idx = paramList.value.findIndex(p => p.item_name === currentParamName.value);
    if (idx > 0) {
        currentParamName.value = paramList.value[idx - 1].item_name;
        addTab();
    }
}
function nextParam() {
    const idx = paramList.value.findIndex(p => p.item_name === currentParamName.value);
    if (idx < paramList.value.length - 1) {
        currentParamName.value = paramList.value[idx + 1].item_name;
        addTab();
    }
}
function buildTicks(xMin, xMax, count) {
    const step = (xMax - xMin) / (count - 1);
    return Array.from({ length: count }, (_, i) => xMin + i * step);
}
function calcHistXRange(dataMin, dataMax, ll, ul, edgesMin, edgesMax) {
    const hasLL = ll !== null && ll !== undefined;
    const hasUL = ul !== null && ul !== undefined;
    const hasBothLimits = hasLL && hasUL;
    if (dataMin === dataMax && (!hasBothLimits || ll === ul)) {
        const center = dataMin;
        const half = Math.abs(center) * 0.5 || 0.5;
        const xMin = center - half;
        const xMax = center + half;
        const ticks = buildTicks(xMin, xMax, 11);
        return { xMin, xMax, ticks };
    }
    if (hasBothLimits && ll === ul) {
        const rangeMin = edgesMin ?? dataMin;
        const rangeMax = edgesMax ?? dataMax;
        const padding = (rangeMax - rangeMin) * 0.05 || Math.abs(rangeMax) * 0.01 || 0.1;
        const xMin = rangeMin - padding;
        const xMax = rangeMax + padding;
        const ticks = buildTicks(xMin, xMax, 11);
        return { xMin, xMax, ticks };
    }
    if (hasBothLimits) {
        const effMin = edgesMin ?? dataMin;
        const effMax = edgesMax ?? dataMax;
        const dataExceedsLimit = effMin < ll || effMax > ul;
        if (!dataExceedsLimit) {
            const range = (ul - ll) / 0.8;
            const xMin = ll - range * 0.1;
            const xMax = ul + range * 0.1;
            const ticks = buildTicks(xMin, xMax, 11);
            return { xMin, xMax, ticks };
        }
        else {
            const limitRange = ul - ll;
            const totalRange = limitRange / 0.6;
            const center = (ll + ul) / 2;
            let xMin = center - totalRange / 2;
            let xMax = center + totalRange / 2;
            if (effMin < xMin)
                xMin = effMin - (effMin === ll ? limitRange * 0.05 : (ll - effMin) * 0.1);
            if (effMax > xMax)
                xMax = effMax + (effMax === ul ? limitRange * 0.05 : (effMax - ul) * 0.1);
            const ticks = buildTicks(xMin, xMax, 11);
            return { xMin, xMax, ticks };
        }
    }
    if (hasLL || hasUL) {
        const effMin = edgesMin ?? dataMin;
        const effMax = edgesMax ?? dataMax;
        const rangeMin = hasLL ? Math.min(effMin, ll) : effMin;
        const rangeMax = hasUL ? Math.max(effMax, ul) : effMax;
        const padding = (rangeMax - rangeMin) * 0.05 || Math.abs(rangeMax) * 0.01 || 0.1;
        const xMin = rangeMin - padding;
        const xMax = rangeMax + padding;
        const ticks = buildTicks(xMin, xMax, 11);
        return { xMin, xMax, ticks };
    }
    const effMin = edgesMin ?? dataMin;
    const effMax = edgesMax ?? dataMax;
    const padding = (effMax - effMin) * 0.05 || Math.abs(effMax) * 0.01 || 0.1;
    const xMin = effMin - padding;
    const xMax = effMax + padding;
    const ticks = buildTicks(xMin, xMax, 11);
    return { xMin, xMax, ticks };
}
function renderHist(tabId) {
    const tab = tabs.value.find(t => t.id === tabId);
    if (!tab?.data)
        return;
    const chart = chartInstances[`${tabId}_hist`];
    if (!chart)
        return;
    const { param_name, unit, lower_limit: ll, upper_limit: ul, global_edges, exceeds_limit, ll_bin_index, ul_bin_index, lots } = tab.data;
    const edges = global_edges ?? [];
    if (edges.length < 2)
        return;
    const numBins = edges.length - 1;
    let series = [];
    let globalMin = Infinity;
    let globalMax = -Infinity;
    let sumMean = 0;
    let sumStdev = 0;
    let countValid = 0;
    lots.forEach((lot) => {
        if (lot.stats?.min_val != null)
            globalMin = Math.min(globalMin, lot.stats.min_val);
        if (lot.stats?.max_val != null)
            globalMax = Math.max(globalMax, lot.stats.max_val);
        if (lot.stats?.mean != null && lot.stats?.stdev != null) {
            sumMean += lot.stats.mean;
            sumStdev += lot.stats.stdev;
            countValid++;
        }
    });
    const avgMean = countValid > 0 ? sumMean / countValid : null;
    const avgStdev = countValid > 0 ? sumStdev / countValid : null;
    if (exceeds_limit && ll_bin_index != null && ul_bin_index != null) {
        // ═══ 超限模式：category 轴 ═══
        const binLabels = [];
        for (let i = 0; i < numBins; i++) {
            binLabels.push(((edges[i] + edges[i + 1]) / 2).toFixed(3));
        }
        if (tab.options.histMode === 'lot') {
            lots.forEach((lot, idx) => {
                const sigma6L = lot.stats?.mean != null && lot.stats?.stdev != null ? lot.stats.mean - 6 * lot.stats.stdev : -Infinity;
                const sigma6U = lot.stats?.mean != null && lot.stats?.stdev != null ? lot.stats.mean + 6 * lot.stats.stdev : Infinity;
                const normalData = lot.counts.map((cnt, i) => {
                    const center = (edges[i] + edges[i + 1]) / 2;
                    if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5)
                        return '-';
                    return cnt;
                });
                const outlierData = lot.counts.map((cnt, i) => {
                    const center = (edges[i] + edges[i + 1]) / 2;
                    if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5)
                        return cnt;
                    return '-';
                });
                series.push({
                    type: 'bar',
                    name: getLotDisplayName(lot),
                    data: normalData,
                    itemStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], opacity: 0.7 },
                    barGap: '-100%',
                    barWidth: '90%',
                });
                if (outlierData.some((d) => d !== '-')) {
                    series.push({
                        type: 'bar',
                        name: getLotDisplayName(lot),
                        data: outlierData,
                        itemStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], opacity: 0.7 },
                        barGap: '-100%',
                        barWidth: '90%',
                        barMinHeight: 5,
                    });
                }
            });
        }
        else {
            const combinedCounts = new Array(numBins).fill(0);
            lots.forEach((lot) => {
                lot.counts.forEach((cnt, i) => { combinedCounts[i] += cnt; });
            });
            const sigma6L = avgMean != null && avgStdev != null ? avgMean - 6 * avgStdev : -Infinity;
            const sigma6U = avgMean != null && avgStdev != null ? avgMean + 6 * avgStdev : Infinity;
            const normalData = combinedCounts.map((cnt, i) => {
                const center = (edges[i] + edges[i + 1]) / 2;
                if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5)
                    return '-';
                return cnt;
            });
            const outlierData = combinedCounts.map((cnt, i) => {
                const center = (edges[i] + edges[i + 1]) / 2;
                if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5)
                    return cnt;
                return '-';
            });
            series.push({
                type: 'bar',
                name: tab.options.single_lot_name || 'All LOTs',
                data: normalData,
                itemStyle: { color: '#4dabf7', opacity: 0.8 },
                barGap: '-100%',
                barWidth: '90%',
            });
            if (outlierData.some((d) => d !== '-')) {
                series.push({
                    type: 'bar',
                    name: tab.options.single_lot_name || 'All LOTs',
                    data: outlierData,
                    itemStyle: { color: '#4dabf7', opacity: 0.8 },
                    barGap: '-100%',
                    barWidth: '90%',
                    barMinHeight: 5,
                });
            }
        }
        const markLineData = [];
        if (ll !== null && ll !== undefined) {
            markLineData.push({
                xAxis: ll_bin_index,
                label: { formatter: `LL:${ll.toFixed(4)}`, position: 'middle', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: 'red', rotate: 0 },
                lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
            });
        }
        if (ul !== null && ul !== undefined) {
            markLineData.push({
                xAxis: ul_bin_index,
                label: { formatter: `UL:${ul.toFixed(4)}`, position: 'middle', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: 'red', rotate: 0 },
                lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
            });
        }
        if (tab.options.filter_type === 'filter_by_sigma' && avgMean != null && avgStdev != null) {
            const n = tab.options.sigma ?? 3;
            const sigmaL = avgMean - n * avgStdev;
            const sigmaU = avgMean + n * avgStdev;
            const findBinIndex = (val) => {
                for (let i = 0; i < numBins; i++) {
                    if (val >= edges[i] && val < edges[i + 1])
                        return i;
                }
                return val < edges[0] ? 0 : numBins - 1;
            };
            markLineData.push({
                xAxis: findBinIndex(sigmaL),
                label: { formatter: `${n}σL`, position: '70%', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: '#00c853', rotate: 0 },
                lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
            });
            markLineData.push({
                xAxis: findBinIndex(sigmaU),
                label: { formatter: `${n}σU`, position: '70%', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: '#00c853', rotate: 0 },
                lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
            });
        }
        if (series.length > 0) {
            series[0].markLine = { silent: true, symbol: 'none', animation: false, data: markLineData };
        }
        const labelPositions = new Set([0, numBins - 1, ll_bin_index, ul_bin_index]);
        const midStep = Math.max(1, Math.floor((ul_bin_index - ll_bin_index) / 4));
        for (let i = ll_bin_index; i <= ul_bin_index; i += midStep)
            labelPositions.add(i);
        if (ll_bin_index > 2)
            labelPositions.add(Math.floor(ll_bin_index / 2));
        if (numBins - ul_bin_index > 2)
            labelPositions.add(ul_bin_index + Math.floor((numBins - ul_bin_index) / 2));
        chart.setOption({
            title: {
                text: `${tab.item_number}.${param_name}`,
                left: 'center',
                textStyle: { fontSize: 13 },
                subtext: tab.options.histMode === 'single' && tab.data.overall_stats
                    ? `Min=${fmtNum(tab.data.overall_stats.min_val)} Max=${fmtNum(tab.data.overall_stats.max_val)} Mean=${fmtNum(tab.data.overall_stats.mean)} Stdev=${fmtNum(tab.data.overall_stats.stdev)} CPK=${fmtNum(tab.data.overall_stats.cpk)}`
                    : ''
            },
            grid: { bottom: 110, top: tab.options.histMode === 'single' ? 80 : 60 },
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    if (!params || params.length === 0)
                        return '';
                    const idx = params[0].dataIndex;
                    const lo = edges[idx]?.toFixed(4) ?? '';
                    const hi = edges[idx + 1]?.toFixed(4) ?? '';
                    let tip = `<div style="font-size:11px">[${lo}, ${hi})</div>`;
                    params.forEach((p) => {
                        if (p.value > 0)
                            tip += `<div>${p.marker} ${p.seriesName}: ${p.value}</div>`;
                    });
                    return tip;
                },
            },
            legend: { bottom: 5, data: tab.options.histMode === 'lot' ? lots.map((l) => getLotDisplayName(l)) : [tab.options.single_lot_name || 'All LOTs'] },
            xAxis: {
                type: 'category',
                data: binLabels,
                name: unit,
                axisLine: { onZero: false, show: false },
                axisTick: { alignWithLabel: true, show: true },
                splitLine: { show: true, lineStyle: { type: 'dashed' } },
                axisLabel: {
                    rotate: 30, fontSize: 10, interval: 0,
                    formatter: (_, index) => {
                        if (labelPositions.has(index)) {
                            if (index === ll_bin_index && ll != null)
                                return `LL:${ll.toFixed(4)}`;
                            if (index === ul_bin_index && ul != null)
                                return `UL:${ul.toFixed(4)}`;
                            return edges[index]?.toFixed(3) ?? '';
                        }
                        return '';
                    },
                },
            },
            yAxis: {
                type: 'value', name: 'Parts', nameLocation: 'middle', nameRotate: 90, nameGap: 40,
                axisLine: { show: true, onZero: false, lineStyle: { color: '#333' } },
                splitLine: { lineStyle: { type: 'dashed' } }
            },
            series,
        }, true);
    }
    else {
        // ═══ 正常模式：value 轴 ═══
        const dataMin = globalMin !== Infinity ? globalMin : edges[0];
        const dataMax = globalMax !== -Infinity ? globalMax : edges[edges.length - 1];
        const { xMin, xMax, ticks } = calcHistXRange(dataMin, dataMax, ll, ul, edges[0], edges[edges.length - 1]);
        const binCenters = edges.slice(0, -1).map((e, i) => (e + edges[i + 1]) / 2);
        const xRange = xMax - xMin;
        const binW = edges[1] - edges[0];
        const barWidthPct = Math.max(8, (binW / xRange) * 700);
        if (tab.options.histMode === 'lot') {
            lots.forEach((lot, idx) => {
                const sigma6L = lot.stats?.mean != null && lot.stats?.stdev != null ? lot.stats.mean - 6 * lot.stats.stdev : -Infinity;
                const sigma6U = lot.stats?.mean != null && lot.stats?.stdev != null ? lot.stats.mean + 6 * lot.stats.stdev : Infinity;
                const normalData = [];
                const outlierData = [];
                lot.counts.forEach((cnt, i) => {
                    const center = binCenters[i];
                    if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) {
                        outlierData.push([binCenters[i], cnt]);
                    }
                    else {
                        normalData.push([binCenters[i], cnt]);
                    }
                });
                series.push({
                    type: 'bar', name: getLotDisplayName(lot), data: normalData,
                    itemStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], opacity: 0.7 },
                    barGap: '-100%', barWidth: barWidthPct,
                });
                if (outlierData.length > 0) {
                    series.push({
                        type: 'bar', name: getLotDisplayName(lot), data: outlierData,
                        itemStyle: { color: LOT_COLORS[idx % LOT_COLORS.length], opacity: 0.7 },
                        barGap: '-100%', barWidth: barWidthPct, barMinHeight: 5,
                    });
                }
            });
        }
        else {
            const combinedCounts = new Array(numBins).fill(0);
            lots.forEach((lot) => {
                lot.counts.forEach((cnt, i) => { combinedCounts[i] += cnt; });
            });
            const sigma6L = avgMean != null && avgStdev != null ? avgMean - 6 * avgStdev : -Infinity;
            const sigma6U = avgMean != null && avgStdev != null ? avgMean + 6 * avgStdev : Infinity;
            const normalData = [];
            const outlierData = [];
            combinedCounts.forEach((cnt, i) => {
                const center = binCenters[i];
                if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) {
                    outlierData.push([binCenters[i], cnt]);
                }
                else {
                    normalData.push([binCenters[i], cnt]);
                }
            });
            series.push({
                type: 'bar', name: tab.options.single_lot_name || 'All LOTs', data: normalData,
                itemStyle: { color: '#4dabf7', opacity: 0.8 }, barWidth: barWidthPct,
            });
            if (outlierData.length > 0) {
                series.push({
                    type: 'bar', name: tab.options.single_lot_name || 'All LOTs', data: outlierData,
                    itemStyle: { color: '#4dabf7', opacity: 0.8 }, barWidth: barWidthPct, barMinHeight: 5,
                });
            }
        }
        const markLineData = [];
        if (ll !== null && ll !== undefined) {
            markLineData.push({
                xAxis: ll,
                label: { formatter: `LL:${ll.toFixed(4)}`, position: 'middle', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: 'red', rotate: 0 },
                lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
            });
        }
        if (ul !== null && ul !== undefined) {
            markLineData.push({
                xAxis: ul,
                label: { formatter: `UL:${ul.toFixed(4)}`, position: 'middle', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: 'red', rotate: 0 },
                lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
            });
        }
        if (tab.options.filter_type === 'filter_by_sigma' && avgMean != null && avgStdev != null) {
            const n = tab.options.sigma ?? 3;
            const sigmaL = avgMean - n * avgStdev;
            const sigmaU = avgMean + n * avgStdev;
            markLineData.push({
                xAxis: sigmaL,
                label: { formatter: `${n}σL`, position: '70%', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: '#00c853', rotate: 0 },
                lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
            });
            markLineData.push({
                xAxis: sigmaU,
                label: { formatter: `${n}σU`, position: '70%', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: '#00c853', rotate: 0 },
                lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
            });
        }
        if (series.length > 0) {
            series[0].markLine = { silent: true, symbol: 'none', animation: false, data: markLineData };
        }
        chart.setOption({
            title: {
                text: `${tab.item_number}.${param_name}`,
                left: 'center',
                textStyle: { fontSize: 13 },
                subtext: tab.options.histMode === 'single' && tab.data.overall_stats
                    ? `Min=${fmtNum(tab.data.overall_stats.min_val)} Max=${fmtNum(tab.data.overall_stats.max_val)} Mean=${fmtNum(tab.data.overall_stats.mean)} Stdev=${fmtNum(tab.data.overall_stats.stdev)} CPK=${fmtNum(tab.data.overall_stats.cpk)}`
                    : ''
            },
            grid: { bottom: 110, top: tab.options.histMode === 'single' ? 80 : 60 },
            tooltip: { trigger: 'axis' },
            legend: { bottom: 5, type: 'scroll', data: tab.options.histMode === 'lot' ? lots.map((l) => getLotDisplayName(l)) : [tab.options.single_lot_name || 'All LOTs'] },
            xAxis: {
                type: 'value', name: unit, min: xMin, max: xMax, interval: (xMax - xMin) / 10,
                axisLine: { onZero: false, show: false }, axisTick: { show: true },
                splitLine: { show: true, lineStyle: { type: 'dashed' } },
                axisLabel: {
                    rotate: 30, fontSize: 10,
                    formatter: (v) => {
                        const isOnTick = ticks.some(t => Math.abs(t - v) < (xMax - xMin) / 100);
                        return isOnTick ? v.toFixed(3) : '';
                    },
                },
            },
            yAxis: {
                type: 'value', name: 'Parts', nameLocation: 'middle', nameRotate: 90, nameGap: 40,
                axisLine: { show: true, onZero: false, lineStyle: { color: '#333' } },
                splitLine: { lineStyle: { type: 'dashed' } }
            },
            series,
        }, true);
    }
}
function fmtNum(v) {
    if (v === null || v === undefined)
        return '-';
    return v.toFixed(4);
}
function cpkStyle(v) {
    if (v === null || v === undefined)
        return {};
    if (v < 1.0)
        return { color: 'red', fontWeight: 'bold' };
    if (v < 1.33)
        return { color: 'orange' };
    return {};
}
onMounted(async () => {
    await fetchParamList();
    if (!currentParamName.value && paramList.value.length) {
        currentParamName.value = paramList.value[0].item_name;
    }
    await addTab();
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-close']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
/** @type {__VLS_StyleScopedClasses['option-item']} */ ;
/** @type {__VLS_StyleScopedClasses['option-item']} */ ;
/** @type {__VLS_StyleScopedClasses['option-item']} */ ;
/** @type {__VLS_StyleScopedClasses['single-name-input']} */ ;
/** @type {__VLS_StyleScopedClasses['single-name-input']} */ ;
/** @type {__VLS_StyleScopedClasses['single-name-input']} */ ;
/** @type {__VLS_StyleScopedClasses['option-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "multi-param-view" },
});
/** @type {__VLS_StyleScopedClasses['multi-param-view']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sticky-header" },
});
/** @type {__VLS_StyleScopedClasses['sticky-header']} */ ;
if (__VLS_ctx.tabs.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-bar" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-bar']} */ ;
    for (const [tab] of __VLS_vFor((__VLS_ctx.tabs))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.tabs.length))
                        throw 0;
                    return (__VLS_ctx.activeTab = tab.id);
                    // @ts-ignore
                    [tabs, tabs, activeTab,];
                } },
            key: (tab.id),
            ...{ class: (['tab', { active: __VLS_ctx.activeTab === tab.id }]) },
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        /** @type {__VLS_StyleScopedClasses['tab']} */ ;
        (tab.title);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.tabs.length))
                        throw 0;
                    return (__VLS_ctx.closeTab(tab.id));
                    // @ts-ignore
                    [activeTab, closeTab,];
                } },
            ...{ class: "tab-close" },
        });
        /** @type {__VLS_StyleScopedClasses['tab-close']} */ ;
        // @ts-ignore
        [];
    }
}
if (__VLS_ctx.currentTab) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "options-bar" },
    });
    /** @type {__VLS_StyleScopedClasses['options-bar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "options-left" },
    });
    /** @type {__VLS_StyleScopedClasses['options-left']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "nav-group" },
    });
    /** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.prevParam) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (__VLS_ctx.addTab) },
        value: (__VLS_ctx.currentParamName),
    });
    for (const [item] of __VLS_vFor((__VLS_ctx.paramList))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (item.item_name),
            value: (item.item_name),
        });
        (item.item_number);
        (item.item_name);
        // @ts-ignore
        [currentTab, prevParam, addTab, currentParamName, paramList,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.nextParam) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "option-item" },
    });
    /** @type {__VLS_StyleScopedClasses['option-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.currentTab))
                    throw 0;
                return (__VLS_ctx.updateFilterType($event.target.value));
                // @ts-ignore
                [nextParam, updateFilterType,];
            } },
        value: (__VLS_ctx.currentTab?.options.filter_type),
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "custom",
    });
    if (__VLS_ctx.currentTab?.options.filter_type === 'filter_by_sigma') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "option-item" },
        });
        /** @type {__VLS_StyleScopedClasses['option-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            step: "0.5",
            min: "1",
            max: "6",
            ...{ style: {} },
        });
        (__VLS_ctx.sigmaInputValue);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.applySigma) },
        });
    }
    if (__VLS_ctx.currentTab?.options.filter_type === 'custom') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "option-item" },
        });
        /** @type {__VLS_StyleScopedClasses['option-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            step: "any",
            ...{ style: {} },
        });
        (__VLS_ctx.customMinInput);
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            step: "any",
            ...{ style: {} },
        });
        (__VLS_ctx.customMaxInput);
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            step: "any",
            ...{ style: {} },
        });
        (__VLS_ctx.customLLInput);
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            step: "any",
            ...{ style: {} },
        });
        (__VLS_ctx.customULInput);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.applyCustomRange) },
        });
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "option-item" },
    });
    /** @type {__VLS_StyleScopedClasses['option-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.currentTab))
                    throw 0;
                return (__VLS_ctx.updateOption('data_range', 'final'));
                // @ts-ignore
                [currentTab, currentTab, currentTab, sigmaInputValue, applySigma, customMinInput, customMaxInput, customLLInput, customULInput, applyCustomRange, updateOption,];
            } },
        type: "radio",
        checked: (__VLS_ctx.currentTab?.options.data_range === 'final'),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.currentTab))
                    throw 0;
                return (__VLS_ctx.updateOption('data_range', 'original'));
                // @ts-ignore
                [currentTab, updateOption,];
            } },
        type: "radio",
        checked: (__VLS_ctx.currentTab?.options.data_range === 'original'),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "option-item" },
    });
    /** @type {__VLS_StyleScopedClasses['option-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.currentTab))
                    throw 0;
                return (__VLS_ctx.updateOption('histMode', 'lot'));
                // @ts-ignore
                [currentTab, updateOption,];
            } },
        type: "radio",
        checked: (__VLS_ctx.currentTab?.options.histMode === 'lot'),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.currentTab))
                    throw 0;
                return (__VLS_ctx.updateOption('histMode', 'single'));
                // @ts-ignore
                [currentTab, updateOption,];
            } },
        type: "radio",
        checked: (__VLS_ctx.currentTab?.options.histMode === 'single'),
    });
    if (__VLS_ctx.currentTab?.options.histMode === 'single') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    if (!(__VLS_ctx.currentTab))
                        throw 0;
                    if (!(__VLS_ctx.currentTab?.options.histMode === 'single'))
                        throw 0;
                    return (__VLS_ctx.updateOption('single_lot_name', __VLS_ctx.currentTab.options.single_lot_name));
                    // @ts-ignore
                    [currentTab, currentTab, currentTab, updateOption,];
                } },
            ...{ class: "single-name-input" },
            title: "Enter display name for Single mode",
        });
        (__VLS_ctx.currentTab.options.single_lot_name);
        /** @type {__VLS_StyleScopedClasses['single-name-input']} */ ;
    }
}
if (__VLS_ctx.currentTab) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-content" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
    if (__VLS_ctx.currentTab.data) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stats-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['stats-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "stats-table" },
        });
        /** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        if (__VLS_ctx.currentTab?.options.histMode === 'single') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "lot-dot" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['lot-dot']} */ ;
            (__VLS_ctx.currentTab.options.single_lot_name || 'ALL');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.currentTab.data.overall_stats?.exec_qty ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.currentTab.data.overall_stats?.fail_count ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.currentTab.data.overall_stats?.yield_rate != null ? (__VLS_ctx.currentTab.data.overall_stats.yield_rate * 100).toFixed(2) + '%' : '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.currentTab.data.lower_limit?.toFixed(4) ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.currentTab.data.upper_limit?.toFixed(4) ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.fmtNum(__VLS_ctx.currentTab.data.overall_stats?.min_val));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.fmtNum(__VLS_ctx.currentTab.data.overall_stats?.max_val));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.fmtNum(__VLS_ctx.currentTab.data.overall_stats?.mean));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.fmtNum(__VLS_ctx.currentTab.data.overall_stats?.stdev));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ style: (__VLS_ctx.cpkStyle(__VLS_ctx.currentTab.data.overall_stats?.cpk)) },
            });
            (__VLS_ctx.fmtNum(__VLS_ctx.currentTab.data.overall_stats?.cpk));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [lot, idx] of __VLS_vFor((__VLS_ctx.currentTab.data.lots))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (lot.lot_id),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "lot-dot" },
                    ...{ style: ({ background: __VLS_ctx.LOT_COLORS[idx % __VLS_ctx.LOT_COLORS.length] }) },
                });
                /** @type {__VLS_StyleScopedClasses['lot-dot']} */ ;
                (__VLS_ctx.getLotDisplayName(lot));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (lot.stats?.exec_qty ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (lot.stats?.fail_count ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (lot.stats?.yield_rate != null ? (lot.stats.yield_rate * 100).toFixed(2) + '%' : '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.currentTab.data.lower_limit?.toFixed(4) ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.currentTab.data.upper_limit?.toFixed(4) ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.fmtNum(lot.stats?.min_val));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.fmtNum(lot.stats?.max_val));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.fmtNum(lot.stats?.mean));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.fmtNum(lot.stats?.stdev));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ style: (__VLS_ctx.cpkStyle(lot.stats?.cpk)) },
                });
                (__VLS_ctx.fmtNum(lot.stats?.cpk));
                // @ts-ignore
                [currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, fmtNum, fmtNum, fmtNum, fmtNum, fmtNum, fmtNum, fmtNum, fmtNum, fmtNum, fmtNum, cpkStyle, cpkStyle, LOT_COLORS, LOT_COLORS, getLotDisplayName,];
            }
        }
    }
    if (__VLS_ctx.currentTab.data) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: (el => __VLS_ctx.setChartRef(__VLS_ctx.currentTab?.id, el)),
            ...{ style: {} },
        });
    }
}
// @ts-ignore
[currentTab, currentTab, setChartRef,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
