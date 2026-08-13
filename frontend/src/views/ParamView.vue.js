import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import * as echarts from 'echarts';
import api from '@/api';
import { fmtDateTz } from '@/utils/dateUtils';
const route = useRoute();
const lotId = ref(Number(route.params.id));
const initialParam = ref(decodeURIComponent(route.params.param));
const lotInfo = ref(null);
const paramList = ref([]);
const currentParamName = ref(initialParam.value);
const activeTab = ref('');
const tabCounter = ref(0);
// VS mode
const VS_TAB_ID = '__vs__';
const vsMode = ref(false);
const vsTab = ref(null);
const vsParamName = ref('');
const vsSigmaInput = ref(3);
const vsCustomMinInput = ref(null);
const vsCustomMaxInput = ref(null);
const vsCustomLLInput = ref(null);
const vsCustomULInput = ref(null);
const vsHiddenSites = ref(new Set());
// Tooltip DOM refs
const waferTooltipEl = ref(null);
const leftLinkedTooltipEl = ref(null);
const vsWaferTooltipEl = ref(null);
const vsLinkedTooltipEl = ref(null);
// 隐藏的Site集合（响应式，用于图例点击切换，仅重绘wafer canvas）
const hiddenSites = ref(new Set());
// Wafer map state per tab (for hit-testing on hover)
const waferMapState = {};
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
    show_histogram: true,
    show_scatter: false,
    show_map: true,
    site_display_mode: 'site',
});
const sigmaInputValue = ref(draftOptions.value.sigma);
const customMinInput = ref(null);
const customMaxInput = ref(null);
const customLLInput = ref(null);
const customULInput = ref(null);
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
watch(vsTab, (newTab) => {
    if (newTab) {
        vsSigmaInput.value = newTab.options.sigma;
        vsCustomMinInput.value = newTab.options.custom_min;
        vsCustomMaxInput.value = newTab.options.custom_max;
        vsCustomLLInput.value = newTab.options.custom_ll;
        vsCustomULInput.value = newTab.options.custom_ul;
        vsParamName.value = newTab.param_name;
    }
}, { immediate: true });
// 切换tab时重置hiddenSites
watch(activeTab, () => {
    hiddenSites.value = new Set();
});
async function updateOption(key, value) {
    if (!currentTab.value)
        return;
    currentTab.value.options[key] = value;
    await loadTabData(currentTab.value.id);
}
async function updateFilterType(value) {
    if (!currentTab.value)
        return;
    currentTab.value.options.filter_type = value;
    if (value !== 'filter_by_sigma') {
        sigmaInputValue.value = draftOptions.value.sigma;
    }
    if (value === 'custom' && currentTab.value.data) {
        const allSite = currentTab.value.data.sites.find((s) => s.site === 0);
        if (allSite?.stats) {
            customMinInput.value = allSite.stats.min_val;
            customMaxInput.value = allSite.stats.max_val;
            currentTab.value.options.custom_min = allSite.stats.min_val;
            currentTab.value.options.custom_max = allSite.stats.max_val;
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
function toggleSite(siteNum) {
    const s = new Set(hiddenSites.value);
    if (s.has(siteNum))
        s.delete(siteNum);
    else
        s.add(siteNum);
    hiddenSites.value = s;
    if (currentTab.value) {
        const key = `${currentTab.value.id}_wafer`;
        const canvas = chartInstances[key];
        if (canvas)
            renderWaferMap(currentTab.value.id, canvas);
    }
}
function toggleVsSite(siteNum) {
    const s = new Set(vsHiddenSites.value);
    if (s.has(siteNum))
        s.delete(siteNum);
    else
        s.add(siteNum);
    vsHiddenSites.value = s;
    const canvas = chartInstances[`${VS_TAB_ID}_wafer`];
    if (canvas)
        renderWaferMap(VS_TAB_ID, canvas);
}
function isSiteSelected(tab, siteNum) {
    if (!tab?.data?.sites)
        return true;
    if (!tab.options?.selected_sites)
        return true;
    return tab.options.selected_sites.includes(siteNum);
}
function toggleSiteSelection(tabId, siteNum) {
    const tab = getTabById(tabId);
    if (!tab?.data?.sites)
        return;
    if (!tab.options.selected_sites) {
        tab.options.selected_sites = tab.data.sites.map((s) => s.site);
    }
    const allSiteNums = tab.data.sites.map((s) => s.site);
    const indivSiteNums = tab.data.sites.filter((s) => s.site > 0).map((s) => s.site);
    if (siteNum === 0) {
        if (tab.options.selected_sites.includes(0)) {
            tab.options.selected_sites = [];
        }
        else {
            tab.options.selected_sites = [...allSiteNums];
        }
    }
    else {
        const idx = tab.options.selected_sites.indexOf(siteNum);
        if (idx >= 0) {
            tab.options.selected_sites.splice(idx, 1);
            const zeroIdx = tab.options.selected_sites.indexOf(0);
            if (zeroIdx >= 0)
                tab.options.selected_sites.splice(zeroIdx, 1);
        }
        else {
            tab.options.selected_sites.push(siteNum);
            const allIndivChecked = indivSiteNums.every((s) => tab.options.selected_sites.includes(s));
            if (allIndivChecked && !tab.options.selected_sites.includes(0)) {
                tab.options.selected_sites.push(0);
            }
        }
    }
    nextTick(() => {
        if (tabId === VS_TAB_ID) {
            renderVsCharts();
        }
        else {
            renderCharts(tabId);
        }
    });
}
function displayedSites(tab) {
    if (!tab?.data?.sites)
        return [];
    return tab.data.sites;
}
function chartSites(tab) {
    if (!tab?.data?.sites)
        return [];
    const selected = tab.options?.selected_sites ?? tab.data.sites.map((s) => s.site);
    return tab.data.sites.filter((s) => s.site > 0 && selected.includes(s.site));
}
function siteLabel(site) {
    return site === 0 ? 'ALL' : `Site${site}`;
}
function toggleSiteDisplay(tabId) {
    const tab = getTabById(tabId);
    if (!tab)
        return;
    tab.options.site_display_mode = tab.options.site_display_mode === 'all' ? 'site' : 'all';
    nextTick(() => {
        renderHistogram(tabId);
        renderScatter(tabId);
    });
}
// helper: get tab by id (supports VS pseudo-tab)
function getTabById(tabId) {
    if (tabId === VS_TAB_ID)
        return vsTab.value;
    return tabs.value.find(t => t.id === tabId) ?? null;
}
// VS mode toggle
function toggleVsMode() {
    if (vsMode.value) {
        vsMode.value = false;
        vsTab.value = null;
        // cleanup VS chart instances
        Object.keys(chartInstances).filter(k => k.startsWith(VS_TAB_ID)).forEach(k => {
            if (chartInstances[k]?.dispose)
                chartInstances[k].dispose();
            delete chartInstances[k];
        });
        if (waferMapState[VS_TAB_ID]) {
            if (waferMapState[VS_TAB_ID].canvasEl) {
                waferMapState[VS_TAB_ID].canvasEl.onmousemove = null;
                waferMapState[VS_TAB_ID].canvasEl.onmouseleave = null;
                waferMapState[VS_TAB_ID].canvasEl.onclick = null;
            }
            delete waferMapState[VS_TAB_ID];
        }
    }
    else {
        vsMode.value = true;
        const src = currentTab.value;
        vsParamName.value = src?.param_name ?? '';
        vsSigmaInput.value = src?.options?.sigma ?? 3;
        vsHiddenSites.value = new Set();
        vsTab.value = {
            id: VS_TAB_ID,
            title: 'VS',
            item_number: src?.item_number ?? '',
            param_name: src?.param_name ?? '',
            options: src ? JSON.parse(JSON.stringify(src.options)) : { ...draftOptions.value },
            data: null,
        };
        loadVsData();
    }
}
async function loadVsData() {
    if (!vsTab.value)
        return;
    const data = await fetchParamData(vsTab.value.param_name, vsTab.value.options);
    vsTab.value.data = data;
    if (data && data.sites && (!vsTab.value.options.selected_sites || vsTab.value.options.selected_sites.length === 0)) {
        vsTab.value.options.selected_sites = data.sites.map((s) => s.site);
    }
    await nextTick();
    renderVsCharts();
}
function renderVsCharts() {
    renderHistogram(VS_TAB_ID);
    renderScatter(VS_TAB_ID);
    const canvas = chartInstances[`${VS_TAB_ID}_wafer`];
    if (canvas)
        renderWaferMap(VS_TAB_ID, canvas);
}
async function updateVsOption(key, value) {
    if (!vsTab.value)
        return;
    vsTab.value.options[key] = value;
    await loadVsData();
}
async function updateVsFilterType(value) {
    if (!vsTab.value)
        return;
    vsTab.value.options.filter_type = value;
    if (value !== 'filter_by_sigma')
        vsSigmaInput.value = 3;
    if (value === 'custom' && vsTab.value.data) {
        const allSite = vsTab.value.data.sites.find((s) => s.site === 0);
        if (allSite?.stats) {
            vsCustomMinInput.value = allSite.stats.min_val;
            vsCustomMaxInput.value = allSite.stats.max_val;
            vsTab.value.options.custom_min = allSite.stats.min_val;
            vsTab.value.options.custom_max = allSite.stats.max_val;
        }
        vsCustomLLInput.value = vsTab.value.data.lower_limit;
        vsCustomULInput.value = vsTab.value.data.upper_limit;
        vsTab.value.options.custom_ll = vsTab.value.data.lower_limit;
        vsTab.value.options.custom_ul = vsTab.value.data.upper_limit;
    }
    await loadVsData();
}
function applyVsCustomRange() {
    if (!vsTab.value)
        return;
    vsTab.value.options.custom_min = vsCustomMinInput.value;
    vsTab.value.options.custom_max = vsCustomMaxInput.value;
    vsTab.value.options.custom_ll = vsCustomLLInput.value;
    vsTab.value.options.custom_ul = vsCustomULInput.value;
    loadVsData();
}
function applyVsSigma() {
    if (!vsTab.value)
        return;
    vsTab.value.options.sigma = vsSigmaInput.value;
    loadVsData();
}
function onVsParamChange() {
    if (!vsTab.value)
        return;
    vsTab.value.param_name = vsParamName.value;
    const paramItem = paramList.value.find((p) => p.item_name === vsParamName.value);
    vsTab.value.item_number = paramItem?.item_number ?? '';
    loadVsData();
}
function vsPrevParam() {
    const idx = paramList.value.findIndex((p) => p.item_name === vsParamName.value);
    if (idx > 0) {
        vsParamName.value = paramList.value[idx - 1].item_name;
        onVsParamChange();
    }
}
function vsNextParam() {
    const idx = paramList.value.findIndex((p) => p.item_name === vsParamName.value);
    if (idx < paramList.value.length - 1) {
        vsParamName.value = paramList.value[idx + 1].item_name;
        onVsParamChange();
    }
}
// Show a linked tooltip on the OTHER map when a die is clicked
function showLinkedDieTip(targetTabId, dieX, dieY) {
    const state = waferMapState[targetTabId];
    const tooltipEl = targetTabId === VS_TAB_ID ? vsLinkedTooltipEl.value : leftLinkedTooltipEl.value;
    if (!tooltipEl || !state?.canvasEl)
        return;
    const die = state.dies.find(d => d.dieX === dieX && d.dieY === dieY);
    if (die) {
        const rect = state.canvasEl.getBoundingClientRect();
        const scaleX = rect.width / state.canvasEl.width;
        const scaleY = rect.height / state.canvasEl.height;
        const tipX = (die.px + die.width / 2) * scaleX + 8;
        const tipY = (die.py + die.height / 2) * scaleY + 8;
        tooltipEl.innerHTML = `<div>X: ${die.dieX}, Y: ${die.dieY}</div><div>Val: ${die.val.toFixed(6)}</div><div>Site: ${die.site}</div>`;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = tipX + 'px';
        tooltipEl.style.top = tipY + 'px';
    }
    else {
        tooltipEl.innerHTML = `<div>X: ${dieX}, Y: ${dieY}</div><div>No data</div>`;
        tooltipEl.style.display = 'block';
        // position at center roughly
        tooltipEl.style.left = '20px';
        tooltipEl.style.top = '20px';
    }
}
// 图表实例存储
const chartInstances = {};
function setChartRef(tabId, type, el) {
    if (!tabId)
        return;
    const key = `${tabId}_${type}`;
    if (el) {
        if (type === 'wafer') {
            if (waferMapState[tabId]?.canvasEl) {
                waferMapState[tabId].canvasEl.onmousemove = null;
                waferMapState[tabId].canvasEl.onmouseleave = null;
                waferMapState[tabId].canvasEl.onclick = null;
            }
            chartInstances[key] = el;
            if (!waferMapState[tabId]) {
                waferMapState[tabId] = { dies: [], canvasEl: el, legendBlocks: [], activeLevel: null };
            }
            else {
                waferMapState[tabId].canvasEl = el;
            }
            el.onmousemove = (evt) => onWaferMouseMove(tabId, evt);
            el.onclick = (evt) => onWaferClick(tabId, evt);
            el.onmouseleave = () => {
                const tipEl = tabId === VS_TAB_ID ? vsWaferTooltipEl.value : waferTooltipEl.value;
                if (tipEl)
                    tipEl.style.display = 'none';
            };
            nextTick(() => renderWaferMap(tabId, el));
        }
        else {
            if (chartInstances[key]?.dispose) {
                chartInstances[key].dispose();
            }
            chartInstances[key] = echarts.init(el);
            nextTick(() => {
                if (type === 'hist')
                    renderHistogram(tabId);
                if (type === 'scatter')
                    renderScatter(tabId);
            });
        }
    }
    else {
        if (type === 'wafer') {
            if (waferMapState[tabId]?.canvasEl) {
                waferMapState[tabId].canvasEl.onmousemove = null;
                waferMapState[tabId].canvasEl.onmouseleave = null;
                waferMapState[tabId].canvasEl.onclick = null;
            }
            delete waferMapState[tabId];
        }
        else if (chartInstances[key]?.dispose) {
            chartInstances[key].dispose();
            delete chartInstances[key];
        }
    }
}
function onWaferClick(tabId, evt) {
    const state = waferMapState[tabId];
    if (!state?.canvasEl || !state.legendBlocks)
        return;
    const rect = state.canvasEl.getBoundingClientRect();
    const scaleX = state.canvasEl.width / rect.width;
    const scaleY = state.canvasEl.height / rect.height;
    const mx = (evt.clientX - rect.left) * scaleX;
    const my = (evt.clientY - rect.top) * scaleY;
    // Check legend block click first
    for (const b of state.legendBlocks) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
            if (state.activeLevel === b.lvl) {
                state.activeLevel = null;
            }
            else {
                state.activeLevel = b.lvl;
            }
            renderWaferMap(tabId, state.canvasEl);
            renderScatter(tabId);
            return;
        }
    }
    // VS linkage: click a die to show linked tooltip on the other map
    if (vsMode.value) {
        let clickedDie = null;
        for (const d of state.dies) {
            if (mx >= d.px && mx <= d.px + d.width && my >= d.py && my <= d.py + d.height) {
                clickedDie = d;
                break;
            }
        }
        if (clickedDie) {
            const otherTabId = tabId === VS_TAB_ID ? (currentTab.value?.id ?? '') : VS_TAB_ID;
            // hide previous linked tooltip on same side
            const myLinkedTip = tabId === VS_TAB_ID ? leftLinkedTooltipEl.value : vsLinkedTooltipEl.value;
            if (myLinkedTip)
                myLinkedTip.style.display = 'none';
            showLinkedDieTip(otherTabId, clickedDie.dieX, clickedDie.dieY);
        }
    }
}
function onWaferMouseMove(tabId, evt) {
    const state = waferMapState[tabId];
    const tooltipEl = tabId === VS_TAB_ID ? vsWaferTooltipEl.value : waferTooltipEl.value;
    if (!state?.canvasEl || !tooltipEl)
        return;
    const rect = state.canvasEl.getBoundingClientRect();
    const scaleX = state.canvasEl.width / rect.width;
    const scaleY = state.canvasEl.height / rect.height;
    const mx = (evt.clientX - rect.left) * scaleX;
    const my = (evt.clientY - rect.top) * scaleY;
    let found = null;
    for (const d of state.dies) {
        if (mx >= d.px && mx <= d.px + d.width && my >= d.py && my <= d.py + d.height) {
            found = d;
            break;
        }
    }
    if (found) {
        tooltipEl.innerHTML = `<div>X: ${found.dieX}, Y: ${found.dieY}</div><div>Val: ${found.val.toFixed(6)}</div><div>Site: ${found.site}</div>`;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = (evt.offsetX + 14) + 'px';
        tooltipEl.style.top = (evt.offsetY + 14) + 'px';
    }
    else {
        tooltipEl.style.display = 'none';
    }
}
async function fetchParamList() {
    paramList.value = await api.get(`/analysis/lot/${lotId.value}/items`, { params: { site: 0 } });
}
async function fetchLotInfo() {
    lotInfo.value = await api.get(`/analysis/lot/${lotId.value}/info`);
}
async function fetchParamData(paramName, options) {
    return await api.get(`/analysis/lot/${lotId.value}/param_data`, {
        params: {
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
function addTab() {
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
    tabs.value.push(newTab);
    activeTab.value = tabId;
    loadTabData(tabId);
}
async function loadTabData(tabId) {
    const tab = getTabById(tabId);
    if (!tab)
        return;
    const data = await fetchParamData(tab.param_name, tab.options);
    tab.data = data;
    if (data && data.sites && (!tab.options.selected_sites || tab.options.selected_sites.length === 0)) {
        tab.options.selected_sites = data.sites.map((s) => s.site);
    }
    if (tab.options.filter_type === 'custom' &&
        tab.options.custom_min == null && tab.options.custom_max == null) {
        const allSite = data.sites.find((s) => s.site === 0);
        if (allSite?.stats) {
            tab.options.custom_min = allSite.stats.min_val;
            tab.options.custom_max = allSite.stats.max_val;
            customMinInput.value = allSite.stats.min_val;
            customMaxInput.value = allSite.stats.max_val;
        }
        tab.options.custom_ll = data.lower_limit;
        tab.options.custom_ul = data.upper_limit;
        customLLInput.value = data.lower_limit;
        customULInput.value = data.upper_limit;
    }
    await nextTick();
    renderCharts(tabId);
}
function closeTab(tabId) {
    const idx = tabs.value.findIndex(t => t.id === tabId);
    tabs.value.splice(idx, 1);
    if (activeTab.value === tabId) {
        activeTab.value = tabs.value[tabs.value.length - 1]?.id ?? '';
    }
    Object.keys(chartInstances).filter(k => k.startsWith(tabId)).forEach(k => {
        if (chartInstances[k]?.dispose)
            chartInstances[k].dispose();
        delete chartInstances[k];
    });
    if (waferMapState[tabId]) {
        if (waferMapState[tabId].canvasEl) {
            waferMapState[tabId].canvasEl.onmousemove = null;
            waferMapState[tabId].canvasEl.onmouseleave = null;
            waferMapState[tabId].canvasEl.onclick = null;
        }
        delete waferMapState[tabId];
    }
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
// ── 常量 ──────────────────────────────────────────────
const SITE_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#e599f7', '#74c0fc', '#a9e34b', '#ffa94d'];
const NUM_COLOR_LEVELS = 20;
function renderCharts(tabId) {
    renderHistogram(tabId);
    renderScatter(tabId);
    const key = `${tabId}_wafer`;
    if (chartInstances[key])
        renderWaferMap(tabId, chartInstances[key]);
}
// 全局数据范围（来自global_edges，用于scatter Y轴和wafer颜色比例尺）
function getGlobalRange(tab) {
    const edges = tab.data.global_edges ?? [];
    if (edges.length >= 2)
        return { min: edges[0], max: edges[edges.length - 1] };
    const allSite = tab.data.sites.find((s) => s.site === 0);
    return { min: allSite?.stats?.min_val ?? 0, max: allSite?.stats?.max_val ?? 1 };
}
// ── 直方图 X 轴范围计算 ────────────────────────────────
// 规则（按优先级）：
//   D: 固定值（LL==UL 且 数据无变化）→ 以中心值±50%展示
//   A: 双边Limit且数据在限内     → LL在10%处，UL在90%处
//   B: 双边Limit但数据超限       → LL在20%处，UL在80%处，两侧动态扩展到数据极值
//   E: 单边Limit               → 数据范围+padding，确保该Limit可见
//   C: 无Limit / LL==UL但数据有变化 → 数据min/max+padding
function calcHistXRange(dataMin, dataMax, ll, ul, edgesMin, edgesMax) {
    const hasLL = ll !== null && ll !== undefined;
    const hasUL = ul !== null && ul !== undefined;
    const hasBothLimits = hasLL && hasUL;
    // Case D: 固定值 — 仅当 LL==UL 且 数据也无变化时
    if (dataMin === dataMax && (!hasBothLimits || ll === ul)) {
        const center = dataMin;
        const half = Math.abs(center) * 0.5 || 0.5;
        const xMin = center - half;
        const xMax = center + half;
        const ticks = buildTicks(xMin, xMax, 11);
        return { xMin, xMax, ticks };
    }
    // 当 LL==UL 时，Limit无意义，按数据范围走 Case C
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
        // 使用 edges 范围（后端已做 clamp）来判断是否超限
        const effMin = edgesMin ?? dataMin;
        const effMax = edgesMax ?? dataMax;
        const dataExceedsLimit = effMin < ll || effMax > ul;
        if (!dataExceedsLimit) {
            // Case A: 数据全在限内，LL在1/10处，UL在9/10处
            const range = (ul - ll) / 0.8;
            const xMin = ll - range * 0.1;
            const xMax = ul + range * 0.1;
            const ticks = buildTicks(xMin, xMax, 11);
            return { xMin, xMax, ticks };
        }
        else {
            // Case B: 数据超限
            // X轴中心 = LL/UL中点, LL放在20%位置, UL放在80%位置
            // LL~UL占据中间60%的区间，两侧各20%动态扩展到数据极值
            const limitRange = ul - ll;
            // LL~UL对应x轴的 [0.2, 0.8]，即60%宽度 = limitRange
            // 总宽度 = limitRange / 0.6
            const totalRange = limitRange / 0.6;
            const center = (ll + ul) / 2;
            let xMin = center - totalRange / 2; // LL在20%处
            let xMax = center + totalRange / 2; // UL在80%处
            // 如果数据超出了默认20%区间，动态扩展到数据极值
            if (effMin < xMin) {
                // 数据最小值比默认下界还小，扩展左侧
                // 保持UL在80%处不变，LL从20%位置向左压缩
                // 新的xMin = effMin，但需要保证LL和UL的相对位置合理
                xMin = effMin - (effMin === ll ? limitRange * 0.05 : (ll - effMin) * 0.1);
            }
            if (effMax > xMax) {
                // 数据最大值比默认上界还大，扩展右侧
                xMax = effMax + (effMax === ul ? limitRange * 0.05 : (effMax - ul) * 0.1);
            }
            const ticks = buildTicks(xMin, xMax, 11);
            return { xMin, xMax, ticks };
        }
    }
    if (hasLL || hasUL) {
        // Case E: 单边Limit，确保Limit在可见范围内
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
    // Case C: 无Limit，纯数据范围
    const effMin = edgesMin ?? dataMin;
    const effMax = edgesMax ?? dataMax;
    const padding = (effMax - effMin) * 0.05 || Math.abs(effMax) * 0.01 || 0.1;
    const xMin = effMin - padding;
    const xMax = effMax + padding;
    const ticks = buildTicks(xMin, xMax, 11);
    return { xMin, xMax, ticks };
}
function buildTicks(xMin, xMax, count) {
    const step = (xMax - xMin) / (count - 1);
    return Array.from({ length: count }, (_, i) => xMin + i * step);
}
// ── 直方图渲染 ─────────────────────────────────────────
function renderHistogram(tabId) {
    const tab = getTabById(tabId);
    if (!tab?.data)
        return;
    const chart = chartInstances[`${tabId}_hist`];
    if (!chart)
        return;
    const { sites, param_name, unit, lower_limit: ll, upper_limit: ul, global_edges, exceeds_limit, ll_bin_index, ul_bin_index } = tab.data;
    const allSites = chartSites(tab);
    const edges = global_edges ?? allSites[0]?.histogram.edges ?? [];
    if (edges.length < 2)
        return;
    const allSiteStats = sites.find((s) => s.site === 0)?.stats;
    const numBins = edges.length - 1;
    // ── 判断渲染模式 ──
    if (exceeds_limit && ll_bin_index != null && ul_bin_index != null) {
        // ═══ 超限模式：使用 category 轴，每个 bin 等宽 ═══
        // 生成 category 标签（bin 中心值）
        const binLabels = [];
        for (let i = 0; i < numBins; i++) {
            binLabels.push(((edges[i] + edges[i + 1]) / 2).toFixed(3));
        }
        const series = [];
        allSites.forEach((s, idx) => {
            const siteStats = s.stats || allSiteStats;
            const sigma6L = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean - 6 * siteStats.stdev : -Infinity;
            const sigma6U = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean + 6 * siteStats.stdev : Infinity;
            const normalData = s.histogram.counts.map((cnt, i) => {
                const center = (edges[i] + edges[i + 1]) / 2;
                if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5)
                    return '-';
                return cnt;
            });
            const outlierData = s.histogram.counts.map((cnt, i) => {
                const center = (edges[i] + edges[i + 1]) / 2;
                if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5)
                    return cnt;
                return '-';
            });
            series.push({
                type: 'bar',
                name: siteLabel(s.site),
                data: normalData,
                itemStyle: { color: SITE_COLORS[idx % SITE_COLORS.length], opacity: 0.7 },
                barGap: '-100%',
                barWidth: '90%',
            });
            if (outlierData.some((d) => d !== '-')) {
                series.push({
                    type: 'bar',
                    name: siteLabel(s.site),
                    data: outlierData,
                    itemStyle: { color: SITE_COLORS[idx % SITE_COLORS.length], opacity: 0.7 },
                    barGap: '-100%',
                    barWidth: '90%',
                    barMinHeight: 5,
                });
            }
        });
        // markLine：LL/UL 用 category index 定位
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
        // sigma 线：找到最近的 category index
        if (tab.options.filter_type === 'filter_by_sigma' && allSiteStats?.mean != null && allSiteStats?.stdev != null) {
            const n = tab.options.sigma ?? 3;
            const sigmaL = allSiteStats.mean - n * allSiteStats.stdev;
            const sigmaU = allSiteStats.mean + n * allSiteStats.stdev;
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
        // X轴标签：只在关键位置显示（LL, UL, 起点, 终点, 中间几个）
        const labelPositions = new Set([0, numBins - 1, ll_bin_index, ul_bin_index]);
        // 在 LL~UL 区间内均匀加几个标签
        const midStep = Math.max(1, Math.floor((ul_bin_index - ll_bin_index) / 4));
        for (let i = ll_bin_index; i <= ul_bin_index; i += midStep)
            labelPositions.add(i);
        // 在 below/above 区间也各加一两个
        if (ll_bin_index > 2)
            labelPositions.add(Math.floor(ll_bin_index / 2));
        if (numBins - ul_bin_index > 2)
            labelPositions.add(ul_bin_index + Math.floor((numBins - ul_bin_index) / 2));
        chart.setOption({
            title: {
                text: `${tab.item_number}.${param_name}`,
                subtext: allSiteStats
                    ? `Min=${allSiteStats.min_val?.toFixed(4)} Max=${allSiteStats.max_val?.toFixed(4)} Mean=${allSiteStats.mean?.toFixed(4)} Stdev=${allSiteStats.stdev?.toFixed(4)} CPK=${allSiteStats.cpk?.toFixed(4)}`
                    : '',
                left: 'center',
                textStyle: { fontSize: 13 },
                subtextStyle: { fontSize: 11, color: '#666' },
            },
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
            legend: { bottom: 0, data: allSites.map((s) => siteLabel(s.site)) },
            xAxis: {
                type: 'category',
                data: binLabels,
                name: unit,
                axisLine: { onZero: false, show: false },
                axisTick: { alignWithLabel: true, show: true },
                splitLine: { show: true, lineStyle: { type: 'dashed' } },
                axisLabel: {
                    rotate: 30,
                    fontSize: 10,
                    interval: 0,
                    formatter: (_, index) => {
                        if (labelPositions.has(index)) {
                            // 在 LL 和 UL 位置显示 limit 值
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
                type: 'value',
                name: 'Parts',
                nameLocation: 'middle',
                nameRotate: 90,
                nameGap: 40,
                axisLine: {
                    show: true,
                    onZero: false,
                    lineStyle: { color: '#333' }
                },
                splitLine: {
                    lineStyle: { type: 'dashed' }
                }
            },
            series,
        }, true);
    }
    else {
        // ═══ 正常模式：使用 value 轴 ═══
        const dataMin = allSiteStats?.min_val ?? edges[0];
        const dataMax = allSiteStats?.max_val ?? edges[edges.length - 1];
        const edgesMin = edges[0];
        const edgesMax = edges[edges.length - 1];
        const { xMin, xMax, ticks } = calcHistXRange(dataMin, dataMax, ll, ul, edgesMin, edgesMax);
        const binCenters = edges.slice(0, -1).map((e, i) => (e + edges[i + 1]) / 2);
        const xRange = xMax - xMin;
        const binW = edges[1] - edges[0];
        const barWidthPct = Math.max(8, (binW / xRange) * 700);
        const series = [];
        allSites.forEach((s, idx) => {
            const siteStats = s.stats || allSiteStats;
            const sigma6L = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean - 6 * siteStats.stdev : -Infinity;
            const sigma6U = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean + 6 * siteStats.stdev : Infinity;
            const normalData = [];
            const outlierData = [];
            s.histogram.counts.forEach((cnt, i) => {
                const center = (edges[i] + edges[i + 1]) / 2;
                if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) {
                    outlierData.push([binCenters[i], cnt]);
                }
                else {
                    normalData.push([binCenters[i], cnt]);
                }
            });
            series.push({
                type: 'bar',
                name: siteLabel(s.site),
                data: normalData,
                itemStyle: { color: SITE_COLORS[idx % SITE_COLORS.length], opacity: 0.7 },
                barGap: '-100%',
                barWidth: barWidthPct,
            });
            if (outlierData.length > 0) {
                series.push({
                    type: 'bar',
                    name: siteLabel(s.site),
                    data: outlierData,
                    itemStyle: { color: SITE_COLORS[idx % SITE_COLORS.length], opacity: 0.7 },
                    barGap: '-100%',
                    barWidth: barWidthPct,
                    barMinHeight: 5,
                });
            }
        });
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
        if (tab.options.filter_type === 'filter_by_sigma' && allSiteStats?.mean != null && allSiteStats?.stdev != null) {
            const n = tab.options.sigma ?? 3;
            const sigmaL = allSiteStats.mean - n * allSiteStats.stdev;
            const sigmaU = allSiteStats.mean + n * allSiteStats.stdev;
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
                subtext: allSiteStats
                    ? `Min=${allSiteStats.min_val?.toFixed(4)} Max=${allSiteStats.max_val?.toFixed(4)} Mean=${allSiteStats.mean?.toFixed(4)} Stdev=${allSiteStats.stdev?.toFixed(4)} CPK=${allSiteStats.cpk?.toFixed(4)}`
                    : '',
                left: 'center',
                textStyle: { fontSize: 13 },
                subtextStyle: { fontSize: 11, color: '#666' },
            },
            tooltip: { trigger: 'axis' },
            legend: { bottom: 0, data: allSites.map((s) => siteLabel(s.site)) },
            xAxis: {
                type: 'value',
                name: unit,
                min: xMin,
                max: xMax,
                interval: (xMax - xMin) / 10,
                axisLine: { onZero: false, show: false },
                axisTick: { show: true },
                splitLine: { show: true, lineStyle: { type: 'dashed' } },
                axisLabel: {
                    rotate: 30,
                    fontSize: 10,
                    formatter: (v) => {
                        const isOnTick = ticks.some(t => Math.abs(t - v) < (xMax - xMin) / 100);
                        return isOnTick ? v.toFixed(3) : '';
                    },
                },
            },
            yAxis: {
                type: 'value',
                name: 'Parts',
                nameLocation: 'middle',
                nameRotate: 90,
                nameGap: 40,
                axisLine: {
                    show: true,
                    onZero: false,
                    lineStyle: { color: '#333' }
                },
                splitLine: {
                    lineStyle: { type: 'dashed' }
                }
            },
            series,
        }, true);
    }
}
// ── Scatter渲染 ────────────────────────────────────────
function renderScatter(tabId) {
    const tab = getTabById(tabId);
    if (!tab?.data)
        return;
    const chart = chartInstances[`${tabId}_scatter`];
    if (!chart)
        return;
    const allSiteStats = tab.data.sites.find((s) => s.site === 0)?.stats;
    let validMin = allSiteStats?.min_val;
    let validMax = allSiteStats?.max_val;
    const hasValidData = validMin != null && validMax != null;
    let mapMinVal = validMin ?? 0;
    let mapMaxVal = validMax ?? 1;
    if (hasValidData) {
        if (tab.options.filter_type === 'custom') {
            if (tab.options.custom_min != null)
                mapMinVal = Math.min(mapMinVal, tab.options.custom_min);
            if (tab.options.custom_max != null)
                mapMaxVal = Math.max(mapMaxVal, tab.options.custom_max);
        }
        if (mapMinVal === mapMaxVal) {
            mapMinVal -= 1;
            mapMaxVal += 1;
        }
    }
    const activeLevel = waferMapState[tabId]?.activeLevel;
    const { sites, unit, lower_limit: ll, upper_limit: ul } = tab.data;
    const allSites = chartSites(tab);
    const series = allSites.map((s, idx) => {
        let validData = [];
        if (hasValidData) {
            validData = s.scatter.filter((p) => p.val >= validMin && p.val <= validMax);
            if (activeLevel != null) {
                validData = validData.filter((p) => {
                    const lvl = valToLevel(p.val, mapMinVal, mapMaxVal, NUM_COLOR_LEVELS);
                    return lvl === activeLevel;
                });
            }
        }
        return {
            type: 'scatter',
            name: siteLabel(s.site),
            data: validData.map((p) => [p.idx, p.val]),
            symbolSize: 3,
            itemStyle: { color: SITE_COLORS[idx % SITE_COLORS.length], opacity: 0.6 },
        };
    });
    series.push({
        type: 'line',
        data: [],
        markLine: {
            silent: true,
            symbol: 'none',
            data: [
                ...(ll !== null && ll !== undefined ? [{
                        yAxis: ll,
                        label: { formatter: `LL:${ll.toFixed(4)}`, position: 'end' },
                        lineStyle: { color: 'red', type: 'dashed' },
                    }] : []),
                ...(ul !== null && ul !== undefined ? [{
                        yAxis: ul,
                        label: { formatter: `UL:${ul.toFixed(4)}`, position: 'end' },
                        lineStyle: { color: 'red', type: 'dashed' },
                    }] : []),
                ...(tab.options.filter_type === 'filter_by_sigma' && allSiteStats?.mean != null && allSiteStats?.stdev != null ? [
                    {
                        yAxis: allSiteStats.mean - (tab.options.sigma ?? 3) * allSiteStats.stdev,
                        label: { formatter: `${tab.options.sigma ?? 3}σL`, position: '70%', align: 'left', padding: [0, 0, 0, 8], color: '#00c853' },
                        lineStyle: { color: '#00c853', type: 'dashed' },
                    },
                    {
                        yAxis: allSiteStats.mean + (tab.options.sigma ?? 3) * allSiteStats.stdev,
                        label: { formatter: `${tab.options.sigma ?? 3}σU`, position: '70%', align: 'right', padding: [0, 8, 0, 0], color: '#00c853' },
                        lineStyle: { color: '#00c853', type: 'dashed' },
                    }
                ] : []),
            ],
        },
    });
    const { min: globalMin, max: globalMax } = getGlobalRange(tab);
    const padding = (globalMax - globalMin) * 0.05 || 0.1;
    const yMin = Math.min(globalMin, ll ?? globalMin) - padding;
    const yMax = Math.max(globalMax, ul ?? globalMax) + padding;
    chart.setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        xAxis: { type: 'value', name: 'Index' },
        yAxis: {
            type: 'value',
            name: unit,
            min: parseFloat(yMin.toFixed(6)),
            max: parseFloat(yMax.toFixed(6)),
        },
        series,
    });
}
// ── Wafer Map 渲染 ─────────────────────────────────────
function levelToColor(level, total) {
    const ratio = total <= 1 ? 0.5 : level / (total - 1);
    let r, g, b;
    if (ratio < 0.5) {
        r = 0;
        g = Math.round(ratio * 2 * 255);
        b = Math.round((1 - ratio * 2) * 255);
    }
    else {
        r = Math.round((ratio - 0.5) * 2 * 255);
        g = Math.round((1 - (ratio - 0.5) * 2) * 255);
        b = 0;
    }
    return `rgb(${r},${g},${b})`;
}
function valToLevel(val, minVal, maxVal, levels) {
    if (maxVal === minVal)
        return Math.floor(levels / 2);
    const ratio = (val - minVal) / (maxVal - minVal);
    return Math.min(levels - 1, Math.max(0, Math.floor(ratio * levels)));
}
function renderWaferMap(tabId, canvas) {
    const tab = getTabById(tabId);
    if (!tab?.data)
        return;
    const selected = tab.options?.selected_sites ?? tab.data.sites.map((s) => s.site);
    const hiddenSet = tabId === VS_TAB_ID ? vsHiddenSites.value : hiddenSites.value;
    const siteDataMap = new Map();
    tab.data.sites.forEach((s) => {
        if (s.site > 0 && s.wafer_map && selected.includes(s.site) && !hiddenSet.has(s.site)) {
            siteDataMap.set(s.site, s.wafer_map);
        }
    });
    const allData = [];
    siteDataMap.forEach((dies, siteNum) => {
        dies.forEach(d => allData.push({ ...d, site: siteNum }));
    });
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (allData.length === 0) {
        if (waferMapState[tabId])
            waferMapState[tabId].dies = [];
        return;
    }
    const allSiteStats = tab.data.sites.find((s) => s.site === 0)?.stats;
    if (!allSiteStats || allSiteStats.min_val == null) {
        if (waferMapState[tabId])
            waferMapState[tabId].dies = [];
        return;
    }
    let minVal = allSiteStats.min_val;
    let maxVal = allSiteStats.max_val;
    if (tab.options.filter_type === 'custom') {
        if (tab.options.custom_min != null)
            minVal = Math.min(minVal, tab.options.custom_min);
        if (tab.options.custom_max != null)
            maxVal = Math.max(maxVal, tab.options.custom_max);
    }
    if (minVal === maxVal) {
        minVal -= 1;
        maxVal += 1;
    }
    const validData = allData.filter(d => d.val >= allSiteStats.min_val && d.val <= allSiteStats.max_val);
    // 用全部site（含隐藏的）计算坐标范围，保持map位置稳定
    const allCoords = [];
    tab.data.sites.forEach((s) => {
        if (s.site > 0 && s.wafer_map)
            allCoords.push(...s.wafer_map);
    });
    const xs = allCoords.map((d) => d.x);
    const ys = allCoords.map((d) => d.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    // 布局：左侧range文字区 | 色块 | 右侧count文字区
    const LEGEND_RANGE_W = 80; // 左侧range文字
    const LEGEND_BLOCK_W = 16; // 色块宽度
    const LEGEND_COUNT_W = 55; // 右侧count文字
    const LEGEND_TOTAL_W = LEGEND_RANGE_W + LEGEND_BLOCK_W + LEGEND_COUNT_W + 8;
    const W = canvas.width;
    const H = canvas.height;
    const margin = 40;
    // 地图区域中心
    const mapAreaW = W - LEGEND_TOTAL_W - margin * 2;
    const centerX = mapAreaW / 2 + margin;
    const centerY = H / 2;
    const radius = Math.min(mapAreaW, H - margin * 2) / 2;
    const gridW = maxX - minX + 1;
    const gridH = maxY - minY + 1;
    // 支持长方形 Die
    const dieW = (radius * 2) / gridW;
    const dieH = (radius * 2) / gridH;
    const offsetX = centerX - radius;
    const offsetY = centerY - radius;
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
    // 绘制底图所有测试过的die (浅灰色背景)
    ctx.fillStyle = '#f5f5f5';
    allCoords.forEach((d) => {
        const px = offsetX + (d.x - minX) * dieW;
        const py = offsetY + (d.y - minY) * dieH;
        ctx.fillRect(px, py, Math.max(0.5, dieW - 0.2), Math.max(0.5, dieH - 0.2));
    });
    // 统计每个色阶die数量
    const levelCounts = new Array(NUM_COLOR_LEVELS).fill(0);
    validData.forEach(d => {
        levelCounts[valToLevel(d.val, minVal, maxVal, NUM_COLOR_LEVELS)]++;
    });
    // 绘制有效die，记录位置供hover检测
    const dies = [];
    const activeLevel = waferMapState[tabId]?.activeLevel;
    validData.forEach(d => {
        const lvl = valToLevel(d.val, minVal, maxVal, NUM_COLOR_LEVELS);
        // 如果有选中的色阶且当前die不在此色阶，跳过绘制
        if (activeLevel != null && lvl !== activeLevel)
            return;
        const px = offsetX + (d.x - minX) * dieW;
        const py = offsetY + (d.y - minY) * dieH;
        ctx.fillStyle = levelToColor(lvl, NUM_COLOR_LEVELS);
        ctx.fillRect(px, py, Math.max(0.5, dieW - 0.2), Math.max(0.5, dieH - 0.2));
        dies.push({ px, py, width: dieW, height: dieH, dieX: d.x, dieY: d.y, val: d.val, site: d.site, lvl });
    });
    if (waferMapState[tabId])
        waferMapState[tabId].dies = dies;
    // ── 绘制图例（三列：range | 色块 | count）────────────
    const legendStartX = mapAreaW + margin + margin;
    const legendTopY = margin;
    const totalLegendH = H - margin * 2;
    const blockH = Math.floor(totalLegendH / NUM_COLOR_LEVELS);
    const blockX = legendStartX + LEGEND_RANGE_W + 4;
    const countX = blockX + LEGEND_BLOCK_W + 4;
    const legendBlocks = [];
    ctx.font = '9px Arial';
    for (let lvl = NUM_COLOR_LEVELS - 1; lvl >= 0; lvl--) {
        // 从顶部开始，顶部对应最高值
        const drawRow = NUM_COLOR_LEVELS - 1 - lvl;
        const blockY = legendTopY + drawRow * blockH;
        const midY = blockY + blockH / 2;
        const rangeMin = minVal + (lvl / NUM_COLOR_LEVELS) * (maxVal - minVal);
        const rangeMax = minVal + ((lvl + 1) / NUM_COLOR_LEVELS) * (maxVal - minVal);
        // 左侧：range文字，右对齐到色块左边
        ctx.fillStyle = '#333';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(rangeMax.toFixed(3), blockX - 4, midY + 1);
        ctx.fillStyle = '#999';
        ctx.textBaseline = 'top';
        ctx.fillText(rangeMin.toFixed(3), blockX - 4, midY);
        // 中间：色块
        ctx.fillStyle = levelToColor(lvl, NUM_COLOR_LEVELS);
        ctx.fillRect(blockX, blockY, LEGEND_BLOCK_W, blockH - 1);
        legendBlocks.push({ lvl, x: blockX, y: blockY, w: LEGEND_BLOCK_W, h: blockH - 1 });
        if (activeLevel === lvl) {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(blockX - 1, blockY - 1, LEGEND_BLOCK_W + 2, blockH);
        }
        // 右侧：count
        ctx.fillStyle = '#444';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${levelCounts[lvl]}`, countX, midY);
    }
    if (waferMapState[tabId]) {
        waferMapState[tabId].legendBlocks = legendBlocks;
    }
    // 图例标题
    ctx.fillStyle = '#555';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Range', blockX - 4 - LEGEND_RANGE_W / 2, legendTopY - 2);
    ctx.fillText('n', countX + 20, legendTopY - 2);
}
// ── 工具函数 ───────────────────────────────────────────
function cpkColor(val) {
    if (val === null || val === undefined)
        return {};
    if (val < 1.0)
        return { color: 'red', fontWeight: 'bold' };
    if (val < 1.33)
        return { color: 'orange' };
    return {};
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
onMounted(async () => {
    await fetchParamList();
    await fetchLotInfo();
    addTab();
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
/** @type {__VLS_StyleScopedClasses['option-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
/** @type {__VLS_StyleScopedClasses['wafer-legend-item']} */ ;
/** @type {__VLS_StyleScopedClasses['option-item']} */ ;
/** @type {__VLS_StyleScopedClasses['option-item']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-vs']} */ ;
/** @type {__VLS_StyleScopedClasses['option-item']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-vs']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-right-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-opts-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "param-view" },
});
/** @type {__VLS_StyleScopedClasses['param-view']} */ ;
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
    ...{ class: "tab-bar" },
});
/** @type {__VLS_StyleScopedClasses['tab-bar']} */ ;
for (const [tab] of __VLS_vFor((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.activeTab = tab.id);
                // @ts-ignore
                [lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, lotInfo, yieldColor, formatDate, tabs, activeTab,];
            } },
        key: (tab.id),
        ...{ class: (['tab', { active: __VLS_ctx.activeTab === tab.id }]) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    (tab.title);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
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
if (__VLS_ctx.currentTab) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-content" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "content-row" },
    });
    /** @type {__VLS_StyleScopedClasses['content-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "charts-area" },
    });
    /** @type {__VLS_StyleScopedClasses['charts-area']} */ ;
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.currentTab))
                    throw 0;
                return (__VLS_ctx.updateOption('data_range', 'all'));
                // @ts-ignore
                [currentTab, updateOption,];
            } },
        type: "radio",
        checked: (__VLS_ctx.currentTab?.options.data_range === 'all'),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.currentTab))
                    throw 0;
                return (__VLS_ctx.toggleSiteDisplay(__VLS_ctx.currentTab.id));
                // @ts-ignore
                [currentTab, currentTab, toggleSiteDisplay,];
            } },
        ...{ class: "mode-toggle-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['mode-toggle-btn']} */ ;
    (__VLS_ctx.currentTab.options.site_display_mode === 'all' ? 'Site' : 'ALL');
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
                return (__VLS_ctx.updateOption('show_histogram', $event.target.checked));
                // @ts-ignore
                [currentTab, updateOption,];
            } },
        type: "checkbox",
        checked: (__VLS_ctx.currentTab?.options.show_histogram),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.currentTab))
                    throw 0;
                return (__VLS_ctx.updateOption('show_scatter', $event.target.checked));
                // @ts-ignore
                [currentTab, updateOption,];
            } },
        type: "checkbox",
        checked: (__VLS_ctx.currentTab?.options.show_scatter),
    });
    if (__VLS_ctx.lotInfo?.data_type === 'CP') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    if (!(__VLS_ctx.currentTab))
                        throw 0;
                    if (!(__VLS_ctx.lotInfo?.data_type === 'CP'))
                        throw 0;
                    return (__VLS_ctx.updateOption('show_map', $event.target.checked));
                    // @ts-ignore
                    [lotInfo, currentTab, updateOption,];
                } },
            type: "checkbox",
            checked: (__VLS_ctx.currentTab?.options.show_map),
        });
    }
    if (__VLS_ctx.lotInfo?.data_type === 'CP') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.toggleVsMode) },
            ...{ class: "btn-vs" },
            ...{ class: ({ active: __VLS_ctx.vsMode }) },
        });
        /** @type {__VLS_StyleScopedClasses['btn-vs']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
    }
    if (__VLS_ctx.currentTab.data) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stats-table" },
        });
        /** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [s] of __VLS_vFor((__VLS_ctx.displayedSites(__VLS_ctx.currentTab)))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (s.site),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.currentTab))
                            throw 0;
                        if (!(__VLS_ctx.currentTab.data))
                            throw 0;
                        return (__VLS_ctx.toggleSiteSelection(__VLS_ctx.currentTab.id, s.site));
                        // @ts-ignore
                        [lotInfo, currentTab, currentTab, currentTab, currentTab, toggleVsMode, vsMode, displayedSites, toggleSiteSelection,];
                    } },
                type: "checkbox",
                checked: (__VLS_ctx.isSiteSelected(__VLS_ctx.currentTab, s.site)),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (s.site === 0 ? 'ALL' : `Site${s.site}`);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.stats.exec_qty - s.stats.fail_count);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.stats.fail_count);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.stats.exec_qty);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.stats.yield_rate ? (s.stats.yield_rate * 100).toFixed(2) + '%' : '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.currentTab.data.lower_limit?.toFixed(4) ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.currentTab.data.upper_limit?.toFixed(4) ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.stats.min_val?.toFixed(4) ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.stats.max_val?.toFixed(4) ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.stats.mean?.toFixed(4) ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (s.stats.stdev?.toFixed(4) ?? '-');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ style: (__VLS_ctx.cpkColor(s.stats.cpk)) },
            });
            (s.stats.cpk?.toFixed(4) ?? '-');
            // @ts-ignore
            [currentTab, currentTab, currentTab, isSiteSelected, cpkColor,];
        }
    }
    if (__VLS_ctx.currentTab.options.show_histogram && __VLS_ctx.currentTab.data) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-container" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-container']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: (el => __VLS_ctx.setChartRef(__VLS_ctx.currentTab?.id, 'hist', el)),
            ...{ style: {} },
        });
    }
    if (__VLS_ctx.currentTab.options.show_scatter && __VLS_ctx.currentTab.data) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-container" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-container']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: (el => __VLS_ctx.setChartRef(__VLS_ctx.currentTab?.id, 'scatter', el)),
            ...{ style: {} },
        });
    }
    if (__VLS_ctx.currentTab.options.show_map && __VLS_ctx.currentTab.data && __VLS_ctx.lotInfo?.data_type === 'CP') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-container" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['chart-container']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
            ref: (el => __VLS_ctx.setChartRef(__VLS_ctx.currentTab?.id, 'wafer', el)),
            width: "820",
            height: "600",
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "waferTooltipEl",
            ...{ class: "wafer-tooltip" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['wafer-tooltip']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "leftLinkedTooltipEl",
            ...{ class: "wafer-tooltip wafer-linked-tooltip" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['wafer-tooltip']} */ ;
        /** @type {__VLS_StyleScopedClasses['wafer-linked-tooltip']} */ ;
        if (__VLS_ctx.currentTab.data) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "wafer-legend" },
            });
            /** @type {__VLS_StyleScopedClasses['wafer-legend']} */ ;
            for (const [s, idx] of __VLS_vFor((__VLS_ctx.currentTab.data.sites.filter((s) => s.site > 0)))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.currentTab))
                                throw 0;
                            if (!(__VLS_ctx.currentTab.options.show_map && __VLS_ctx.currentTab.data && __VLS_ctx.lotInfo?.data_type === 'CP'))
                                throw 0;
                            if (!(__VLS_ctx.currentTab.data))
                                throw 0;
                            return (__VLS_ctx.toggleSite(s.site));
                            // @ts-ignore
                            [lotInfo, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, currentTab, setChartRef, setChartRef, setChartRef, toggleSite,];
                        } },
                    key: (s.site),
                    ...{ class: "wafer-legend-item" },
                    ...{ class: ({ hidden: __VLS_ctx.hiddenSites.has(s.site) }) },
                });
                /** @type {__VLS_StyleScopedClasses['wafer-legend-item']} */ ;
                /** @type {__VLS_StyleScopedClasses['hidden']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "wafer-legend-dot" },
                    ...{ style: ({ background: __VLS_ctx.SITE_COLORS[idx % __VLS_ctx.SITE_COLORS.length] }) },
                });
                /** @type {__VLS_StyleScopedClasses['wafer-legend-dot']} */ ;
                (s.site);
                // @ts-ignore
                [hiddenSites, SITE_COLORS, SITE_COLORS,];
            }
        }
    }
    if (__VLS_ctx.vsMode && __VLS_ctx.vsTab) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "vs-separator" },
        });
        /** @type {__VLS_StyleScopedClasses['vs-separator']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "vs-right-panel" },
        });
        /** @type {__VLS_StyleScopedClasses['vs-right-panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "vs-opts-bar" },
        });
        /** @type {__VLS_StyleScopedClasses['vs-opts-bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "nav-group" },
        });
        /** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.vsPrevParam) },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: (__VLS_ctx.onVsParamChange) },
            value: (__VLS_ctx.vsParamName),
        });
        for (const [item] of __VLS_vFor((__VLS_ctx.paramList))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (item.item_name),
                value: (item.item_name),
            });
            (item.item_number);
            (item.item_name);
            // @ts-ignore
            [paramList, vsMode, vsTab, vsPrevParam, onVsParamChange, vsParamName,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.vsNextParam) },
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
                    if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTab))
                        throw 0;
                    return (__VLS_ctx.updateVsFilterType($event.target.value));
                    // @ts-ignore
                    [vsNextParam, updateVsFilterType,];
                } },
            value: (__VLS_ctx.vsTab.options.filter_type),
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
        if (__VLS_ctx.vsTab.options.filter_type === 'filter_by_sigma') {
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
            (__VLS_ctx.vsSigmaInput);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.applyVsSigma) },
            });
        }
        if (__VLS_ctx.vsTab.options.filter_type === 'custom') {
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
            (__VLS_ctx.vsCustomMinInput);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                step: "any",
                ...{ style: {} },
            });
            (__VLS_ctx.vsCustomMaxInput);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                step: "any",
                ...{ style: {} },
            });
            (__VLS_ctx.vsCustomLLInput);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                step: "any",
                ...{ style: {} },
            });
            (__VLS_ctx.vsCustomULInput);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.applyVsCustomRange) },
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
                    if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTab))
                        throw 0;
                    return (__VLS_ctx.updateVsOption('data_range', 'final'));
                    // @ts-ignore
                    [vsTab, vsTab, vsTab, vsSigmaInput, applyVsSigma, vsCustomMinInput, vsCustomMaxInput, vsCustomLLInput, vsCustomULInput, applyVsCustomRange, updateVsOption,];
                } },
            type: "radio",
            checked: (__VLS_ctx.vsTab.options.data_range === 'final'),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    if (!(__VLS_ctx.currentTab))
                        throw 0;
                    if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTab))
                        throw 0;
                    return (__VLS_ctx.updateVsOption('data_range', 'original'));
                    // @ts-ignore
                    [vsTab, updateVsOption,];
                } },
            type: "radio",
            checked: (__VLS_ctx.vsTab.options.data_range === 'original'),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    if (!(__VLS_ctx.currentTab))
                        throw 0;
                    if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTab))
                        throw 0;
                    return (__VLS_ctx.updateVsOption('data_range', 'all'));
                    // @ts-ignore
                    [vsTab, updateVsOption,];
                } },
            type: "radio",
            checked: (__VLS_ctx.vsTab.options.data_range === 'all'),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.currentTab))
                        throw 0;
                    if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTab))
                        throw 0;
                    return (__VLS_ctx.toggleSiteDisplay(__VLS_ctx.VS_TAB_ID));
                    // @ts-ignore
                    [toggleSiteDisplay, vsTab, VS_TAB_ID,];
                } },
            ...{ class: "mode-toggle-btn" },
        });
        /** @type {__VLS_StyleScopedClasses['mode-toggle-btn']} */ ;
        (__VLS_ctx.vsTab.options.site_display_mode === 'all' ? 'Site' : 'ALL');
        if (__VLS_ctx.vsTab.data) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "stats-table" },
            });
            /** @type {__VLS_StyleScopedClasses['stats-table']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
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
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [s] of __VLS_vFor((__VLS_ctx.displayedSites(__VLS_ctx.vsTab)))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (s.site),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    ...{ onChange: (...[$event]) => {
                            if (!(__VLS_ctx.currentTab))
                                throw 0;
                            if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTab))
                                throw 0;
                            if (!(__VLS_ctx.vsTab.data))
                                throw 0;
                            return (__VLS_ctx.toggleSiteSelection(__VLS_ctx.VS_TAB_ID, s.site));
                            // @ts-ignore
                            [displayedSites, toggleSiteSelection, vsTab, vsTab, vsTab, VS_TAB_ID,];
                        } },
                    type: "checkbox",
                    checked: (__VLS_ctx.isSiteSelected(__VLS_ctx.vsTab, s.site)),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (s.site === 0 ? 'ALL' : `Site${s.site}`);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.stats.exec_qty - s.stats.fail_count);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.stats.fail_count);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.stats.exec_qty);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.stats.yield_rate ? (s.stats.yield_rate * 100).toFixed(2) + '%' : '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.vsTab.data.lower_limit?.toFixed(4) ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.vsTab.data.upper_limit?.toFixed(4) ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.stats.min_val?.toFixed(4) ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.stats.max_val?.toFixed(4) ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.stats.mean?.toFixed(4) ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.stats.stdev?.toFixed(4) ?? '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ style: (__VLS_ctx.cpkColor(s.stats.cpk)) },
                });
                (s.stats.cpk?.toFixed(4) ?? '-');
                // @ts-ignore
                [isSiteSelected, cpkColor, vsTab, vsTab, vsTab,];
            }
        }
        if (__VLS_ctx.currentTab.options.show_histogram && __VLS_ctx.vsTab.data) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-container" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-container']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: (el => __VLS_ctx.setChartRef(__VLS_ctx.VS_TAB_ID, 'hist', el)),
                ...{ style: {} },
            });
        }
        if (__VLS_ctx.currentTab.options.show_scatter && __VLS_ctx.vsTab.data) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-container" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-container']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: (el => __VLS_ctx.setChartRef(__VLS_ctx.VS_TAB_ID, 'scatter', el)),
                ...{ style: {} },
            });
        }
        if (__VLS_ctx.currentTab.options.show_map && __VLS_ctx.vsTab.data && __VLS_ctx.lotInfo?.data_type === 'CP') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-container" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['chart-container']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
                ref: (el => __VLS_ctx.setChartRef(__VLS_ctx.VS_TAB_ID, 'wafer', el)),
                width: "820",
                height: "600",
                ...{ style: {} },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "vsWaferTooltipEl",
                ...{ class: "wafer-tooltip" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['wafer-tooltip']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "vsLinkedTooltipEl",
                ...{ class: "wafer-tooltip wafer-linked-tooltip" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['wafer-tooltip']} */ ;
            /** @type {__VLS_StyleScopedClasses['wafer-linked-tooltip']} */ ;
            if (__VLS_ctx.vsTab.data) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "wafer-legend" },
                });
                /** @type {__VLS_StyleScopedClasses['wafer-legend']} */ ;
                for (const [s, idx] of __VLS_vFor((__VLS_ctx.vsTab.data.sites.filter((s) => s.site > 0)))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.currentTab))
                                    throw 0;
                                if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTab))
                                    throw 0;
                                if (!(__VLS_ctx.currentTab.options.show_map && __VLS_ctx.vsTab.data && __VLS_ctx.lotInfo?.data_type === 'CP'))
                                    throw 0;
                                if (!(__VLS_ctx.vsTab.data))
                                    throw 0;
                                return (__VLS_ctx.toggleVsSite(s.site));
                                // @ts-ignore
                                [lotInfo, currentTab, currentTab, currentTab, setChartRef, setChartRef, setChartRef, vsTab, vsTab, vsTab, vsTab, vsTab, VS_TAB_ID, VS_TAB_ID, VS_TAB_ID, toggleVsSite,];
                            } },
                        key: (s.site),
                        ...{ class: "wafer-legend-item" },
                        ...{ class: ({ hidden: __VLS_ctx.vsHiddenSites.has(s.site) }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['wafer-legend-item']} */ ;
                    /** @type {__VLS_StyleScopedClasses['hidden']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "wafer-legend-dot" },
                        ...{ style: ({ background: __VLS_ctx.SITE_COLORS[idx % __VLS_ctx.SITE_COLORS.length] }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['wafer-legend-dot']} */ ;
                    (s.site);
                    // @ts-ignore
                    [SITE_COLORS, SITE_COLORS, vsHiddenSites,];
                }
            }
        }
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
