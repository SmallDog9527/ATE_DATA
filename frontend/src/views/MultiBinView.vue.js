import { ref, onMounted, nextTick, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
const route = useRoute();
const router = useRouter();
const lotIdsStr = route.query.lot_ids;
const openMultiAnalysis = () => {
    const url = router.resolve(`/multi-analysis?lot_ids=${lotIdsStr}`).href;
    window.open(url, '_blank');
};
const lots = ref([]);
const bins = ref([]);
const mapDataList = ref([]);
const loading = ref(true);
const dataRange = ref('final');
const passBins = ref([1, 2]);
const selectedBins = ref({});
const globalBinFilter = ref(null); // null = show all (Total)
const showCount = ref(true);
const showYield = ref(false);
const showComment = ref(false);
const isDataLoading = ref(false);
const isSaved = ref(false);
const countSortOrder = ref('none');
const noteText = ref('');
const reportAuthor = ref('unknown');
const currentReportConfig = ref({});
const isOsatSummaryReport = computed(() => currentReportConfig.value?.osat_summary === true);
const trendCanvasRef = ref(null);
const trendHoverIndex = ref(null);
const trendPointPositions = ref([]);
const selectedTrendBin = computed(() => {
    if (globalBinFilter.value === null)
        return null;
    return bins.value.find(b => b.bin_number === globalBinFilter.value) || null;
});
const canEditReport = computed(() => {
    const reportId = route.query.report_id;
    if (!reportId)
        return true;
    let role = '';
    let curUser = '';
    try {
        const userInfoStr = localStorage.getItem('user');
        if (userInfoStr) {
            const userInfo = JSON.parse(userInfoStr);
            role = (userInfo.role || '').toLowerCase().trim();
            curUser = (userInfo.username || '').toLowerCase().trim();
        }
    }
    catch (e) { }
    if (role === 'admin')
        return true;
    return curUser === reportAuthor.value.toLowerCase().trim();
});
const globalCommentWidth = ref(300);
const allCommentWidth = ref(500);
let isResizing = false;
let isGlobalResizing = false;
let isAllCommentResizing = false;
let startX = 0;
let startWidth = 0;
let currentLot = null;
function startResize(e, lot) {
    isResizing = true;
    currentLot = lot;
    if (!currentLot.width)
        currentLot.width = 120;
    startX = e.clientX;
    startWidth = currentLot.width;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
}
function handleMouseMove(e) {
    if (!isResizing || !currentLot)
        return;
    const diff = e.clientX - startX;
    currentLot.width = Math.max(60, startWidth + diff);
}
function startGlobalResize(e) {
    isGlobalResizing = true;
    startX = e.clientX;
    startWidth = globalCommentWidth.value;
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', stopGlobalResize);
}
function handleGlobalMouseMove(e) {
    if (!isGlobalResizing)
        return;
    const diff = e.clientX - startX;
    globalCommentWidth.value = Math.max(80, startWidth + diff);
}
function stopResize() {
    isResizing = false;
    currentLot = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
    saveReportImmediately();
}
function stopGlobalResize() {
    isGlobalResizing = false;
    document.removeEventListener('mousemove', handleGlobalMouseMove);
    document.removeEventListener('mouseup', stopGlobalResize);
    saveReportImmediately();
}
function startAllCommentResize(e) {
    isAllCommentResizing = true;
    startX = e.clientX;
    startWidth = allCommentWidth.value;
    document.addEventListener('mousemove', handleAllCommentMouseMove);
    document.addEventListener('mouseup', stopAllCommentResize);
}
function handleAllCommentMouseMove(e) {
    if (!isAllCommentResizing)
        return;
    const diff = e.clientX - startX;
    allCommentWidth.value = Math.max(80, startWidth + diff);
}
function stopAllCommentResize() {
    isAllCommentResizing = false;
    document.removeEventListener('mousemove', handleAllCommentMouseMove);
    document.removeEventListener('mouseup', stopAllCommentResize);
    saveReportImmediately();
}
let draggedIndex = null;
function handleDragStart(index) {
    draggedIndex = index;
}
function handleDrop(targetIndex) {
    if (draggedIndex === null || draggedIndex === targetIndex)
        return;
    const tempLots = [...lots.value];
    const lot = tempLots.splice(draggedIndex, 1)[0];
    tempLots.splice(targetIndex, 0, lot);
    lots.value = tempLots;
    const tempMaps = [...mapDataList.value];
    const map = tempMaps.splice(draggedIndex, 1)[0];
    tempMaps.splice(targetIndex, 0, map);
    mapDataList.value = tempMaps;
    draggedIndex = null;
    nextTick(() => {
        mapDataList.value.forEach((_, i) => drawMap(i));
        saveReportImmediately();
    });
}
function getLotColSpan() {
    let count = 0;
    if (showCount.value)
        count++;
    if (showYield.value)
        count++;
    if (showComment.value)
        count++;
    return count || 1; // Avoid 0
}
// canvas refs per map index
const canvasRefs = {};
function setCanvasRef(idx, el) {
    canvasRefs[idx] = el;
    if (el && mapDataList.value[idx]?.has_map) {
        nextTick(() => drawMap(idx));
    }
}
const BIN_COLORS = {};
const FAIL_COLORS = [
    '#ff6b6b', '#4dabf7', '#ffd43b', '#e599f7', '#74c0fc',
    '#ffa94d', '#da77f2', '#ff8787', '#339af0', '#fcc419',
    '#cc5de8', '#22b8cf', '#ff922b', '#845ef7', '#f06595',
];
function getBinColor(binNum) {
    if (isPassBin(binNum))
        return '#69db7c';
    if (!BIN_COLORS[binNum]) {
        const idx = Object.keys(BIN_COLORS).filter(k => !isPassBin(Number(k))).length % FAIL_COLORS.length;
        BIN_COLORS[binNum] = FAIL_COLORS[idx];
    }
    return BIN_COLORS[binNum];
}
function isPassBin(binNum) {
    return passBins.value.includes(binNum);
}
function getLotTotal(lotId) {
    return bins.value.reduce((s, b) => s + (b.lots[String(lotId)]?.count ?? 0), 0);
}
function getLotPass(lotId) {
    return bins.value
        .filter(b => isPassBin(b.bin_number))
        .reduce((s, b) => s + (b.lots[String(lotId)]?.count ?? 0), 0);
}
function getLotFail(lotId) {
    return getLotTotal(lotId) - getLotPass(lotId);
}
function getBinTotalCount(b) {
    return lots.value.reduce((s, lot) => s + (b.lots[String(lot.id)]?.count ?? 0), 0);
}
function getBinTotalPct(b) {
    const total = getAllTotal();
    if (total === 0)
        return '0.00';
    return ((getBinTotalCount(b) / total) * 100).toFixed(2);
}
function getAllTotal() {
    return lots.value.reduce((s, lot) => s + getLotTotal(lot.id), 0);
}
function getAllPass() {
    return lots.value.reduce((s, lot) => s + getLotPass(lot.id), 0);
}
function getAllFail() {
    return getAllTotal() - getAllPass();
}
function getWaferLabel(lot) {
    return getLotDisplayName(lot);
}
function getLotDisplayName(lot) {
    const lotId = lot?.lot_id || lot?.lot_id_str;
    if (lotId && lot?.wafer_id)
        return `${lotId}-${lot.wafer_id}`;
    return lot?.wafer_id || lotId || lot?.filename || `Lot ${lot?.id ?? lot?.lot_id ?? ''}`;
}
function getMapDisplayName(mapItem) {
    return getLotDisplayName({
        id: mapItem?.lot_id,
        lot_id: mapItem?.lot_id_str,
        wafer_id: mapItem?.wafer_id,
        filename: mapItem?.filename,
    });
}
function getTrendAxisLabel(lot) {
    return getLotDisplayName(lot);
}
function getWaferAxisNumber(lot, idx) {
    const wafer = String(lot.wafer_id || "");
    const match = wafer.match(/(\d+)(?!.*\d)/);
    if (match)
        return String(Number(match[1]));
    return String((idx % 25) + 1);
}
function getNiceAxisStep(range) {
    const roughStep = Math.max(range, 1) / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return niceNormalized * magnitude;
}
function getOsatAxisBounds(values, binNumber) {
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    let minValue = binNumber === 1 ? Math.max(0, rawMin - 5) : Math.max(0, rawMin - rawMin * 0.2);
    let maxValue = Math.min(100, rawMax + rawMax * 0.2);
    if (maxValue <= minValue) {
        const pad = Math.max(1, rawMax * 0.1);
        minValue = Math.max(0, rawMin - pad);
        maxValue = Math.min(100, rawMax + pad);
    }
    if (maxValue <= minValue) {
        maxValue = Math.min(100, minValue + 1);
    }
    return { minValue, maxValue };
}
function drawTrendTooltip(ctx, point, value) {
    const lot = lots.value[point.idx];
    if (!lot)
        return;
    const lines = [
        `LOT: ${lot.lot_id || '-'}`,
        `Wafer: ${lot.wafer_id || '-'}`,
        `Percent: ${value.toFixed(2)}%`,
    ];
    ctx.save();
    ctx.font = '10px sans-serif';
    const width = Math.max(...lines.map(line => ctx.measureText(line).width)) + 18;
    const height = lines.length * 15 + 10;
    const canvasWidth = trendCanvasRef.value?.width || 900;
    let x = point.x + 12;
    let y = point.y - height - 12;
    if (x + width > canvasWidth - 8)
        x = point.x - width - 12;
    if (y < 8)
        y = point.y + 14;
    ctx.fillStyle = 'rgba(17,24,39,0.92)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, idx) => {
        ctx.fillText(line, x + 9, y + 6 + idx * 15);
    });
    ctx.restore();
}
function handleTrendMouseMove(e) {
    if (!isOsatSummaryReport.value || !trendPointPositions.value.length)
        return;
    const canvas = trendCanvasRef.value;
    if (!canvas)
        return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    let best = trendPointPositions.value[0];
    if (!best)
        return;
    let bestDist = Infinity;
    trendPointPositions.value.forEach(point => {
        const dist = Math.hypot(point.x - mouseX, point.y - mouseY);
        if (dist < bestDist) {
            best = point;
            bestDist = dist;
        }
    });
    trendHoverIndex.value = bestDist <= 32 ? best.idx : null;
    drawOsatTrend();
}
function handleTrendMouseLeave() {
    trendHoverIndex.value = null;
    drawOsatTrend();
}
function drawOsatTrend() {
    if (!isOsatSummaryReport.value)
        return;
    const canvas = trendCanvasRef.value;
    if (!canvas)
        return;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const selectedBin = selectedTrendBin.value;
    if (!selectedBin || !lots.value.length)
        return;
    const pad = { left: 58, right: 28, top: 28, bottom: 62 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const totalPct = Number(getBinTotalPct(selectedBin));
    const waferValues = lots.value.map(lot => Number(selectedBin.lots[String(lot.id)]?.pct ?? 0));
    const { minValue, maxValue } = getOsatAxisBounds([totalPct, ...waferValues], Number(selectedBin.bin_number));
    const xFor = (idx) => {
        if (lots.value.length === 1)
            return pad.left + plotW / 2;
        return pad.left + (idx / (lots.value.length - 1)) * plotW;
    };
    const yFor = (value) => pad.top + plotH - ((value - minValue) / (maxValue - minValue)) * plotH;
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const axisStep = getNiceAxisStep(maxValue - minValue);
    for (let i = 0; i <= 4; i++) {
        const value = minValue + ((maxValue - minValue) / 4) * i;
        const y = yFor(value);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
        const decimals = axisStep < 1 ? 2 : axisStep < 10 ? 1 : 0;
        ctx.fillText(`${value.toFixed(decimals)}%`, pad.left - 8, y);
    }
    ctx.strokeStyle = '#d1d5db';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(W - pad.right, pad.top + plotH);
    ctx.stroke();
    const totalY = yFor(totalPct);
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, totalY);
    ctx.lineTo(W - pad.right, totalY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const totalLabel = `Total ${totalPct.toFixed(2)}%`;
    const totalLabelX = pad.left + plotW / 2;
    const totalLabelY = Math.max(pad.top + 18, Math.min(pad.top + plotH - 18, totalY - 14));
    const labelWidth = ctx.measureText(totalLabel).width + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(totalLabelX - labelWidth / 2, totalLabelY - 10, labelWidth, 20);
    ctx.strokeStyle = 'rgba(22,163,74,0.35)';
    ctx.strokeRect(totalLabelX - labelWidth / 2, totalLabelY - 10, labelWidth, 20);
    ctx.fillStyle = '#16a34a';
    ctx.fillText(totalLabel, totalLabelX, totalLabelY);
    ctx.font = '12px sans-serif';
    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    waferValues.forEach((value, idx) => {
        const x = xFor(idx);
        const y = yFor(value);
        if (idx === 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    });
    ctx.stroke();
    trendPointPositions.value = waferValues.map((value, idx) => ({
        x: xFor(idx),
        y: yFor(value),
        idx,
    }));
    waferValues.forEach((value, idx) => {
        const x = xFor(idx);
        const y = yFor(value);
        ctx.beginPath();
        ctx.arc(x, y, trendHoverIndex.value === idx ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.fillStyle = '#374151';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lots.value.forEach((lot, idx) => {
        const x = xFor(idx);
        ctx.fillText(getWaferAxisNumber(lot, idx), x, pad.top + plotH + 8);
    });
    ctx.font = '10px sans-serif';
    let groupStart = 0;
    while (groupStart < lots.value.length) {
        const lotId = getLotDisplayName(lots.value[groupStart]);
        let groupEnd = groupStart;
        while (groupEnd + 1 < lots.value.length &&
            getLotDisplayName(lots.value[groupEnd + 1]) === lotId) {
            groupEnd += 1;
        }
        if (groupStart > 0) {
            const separatorX = lots.value.length === 1
                ? xFor(groupStart)
                : (xFor(groupStart - 1) + xFor(groupStart)) / 2;
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(separatorX, pad.top);
            ctx.lineTo(separatorX, pad.top + plotH + 42);
            ctx.stroke();
        }
        const labelX = (xFor(groupStart) + xFor(groupEnd)) / 2;
        const label = String(lotId);
        ctx.fillStyle = '#374151';
        ctx.fillText(label.length > 24 ? `${label.slice(0, 24)}...` : label, labelX, pad.top + plotH + 28);
        groupStart = groupEnd + 1;
    }
    if (trendHoverIndex.value !== null) {
        const point = trendPointPositions.value.find(p => p.idx === trendHoverIndex.value);
        if (point) {
            ctx.strokeStyle = 'rgba(37,99,235,0.28)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(point.x, pad.top);
            ctx.lineTo(point.x, pad.top + plotH);
            ctx.stroke();
            drawTrendTooltip(ctx, point, waferValues[point.idx] ?? 0);
        }
    }
}
function getMapBins(mapItem) {
    const binCounts = {};
    mapItem.data.forEach((d) => {
        binCounts[d.bin] = (binCounts[d.bin] || 0) + 1;
    });
    return Object.entries(binCounts)
        .map(([bn, cnt]) => ({ bin_number: Number(bn), count: cnt }))
        .sort((a, b) => a.bin_number - b.bin_number);
}
function toggleHighlight(idx, binNum) {
    selectedBins.value[idx] = selectedBins.value[idx] === binNum ? null : binNum;
    drawMap(idx);
}
function setGlobalBinFilter(binNum) {
    globalBinFilter.value = binNum;
    if (isOsatSummaryReport.value) {
        nextTick(drawOsatTrend);
        return;
    }
    // Apply global filter to all maps
    mapDataList.value.forEach((mapItem, i) => {
        selectedBins.value[i] = binNum;
        drawMap(i);
    });
}
function toggleCountSort() {
    if (countSortOrder.value === 'none')
        countSortOrder.value = 'desc';
    else if (countSortOrder.value === 'desc')
        countSortOrder.value = 'asc';
    else
        countSortOrder.value = 'none';
    if (countSortOrder.value === 'none') {
        // Re-sort by bin number as default
        bins.value.sort((a, b) => a.bin_number - b.bin_number);
    }
    else {
        bins.value.sort((a, b) => {
            const countA = getBinTotalCount(a);
            const countB = getBinTotalCount(b);
            return countSortOrder.value === 'asc' ? countA - countB : countB - countA;
        });
    }
}
function drawMap(idx) {
    const canvas = canvasRefs[idx];
    const mapItem = mapDataList.value[idx];
    if (!canvas || !mapItem?.has_map || !mapItem.data.length)
        return;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    const data = mapItem.data;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
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
    const W = canvas.width, H = canvas.height;
    const margin = 35;
    const centerX = W / 2;
    const centerY = H / 2;
    const radius = Math.min(W, H) / 2 - margin;
    const gridW = maxX - minX + 1, gridH = maxY - minY + 1;
    // 支持长方形 Die
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
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 绘制圆周边界
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 绘制 Notch (缺口)
    ctx.beginPath();
    ctx.arc(centerX, centerY + radius, 8, Math.PI, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#cccccc';
    ctx.stroke();
    const coordSet = new Set(data.map((d) => `${d.x},${d.y}`));
    const isEdge = (x, y) => !coordSet.has(`${x - 1},${y}`) || !coordSet.has(`${x + 1},${y}`) ||
        !coordSet.has(`${x},${y - 1}`) || !coordSet.has(`${x},${y + 1}`);
    const highlight = selectedBins.value[idx] ?? null;
    // 如果设置了全局 Bin 过滤，且此 Map 中没有该 Bin，则仅显示轮廓
    if (highlight !== null) {
        const hasBin = data.some((d) => d.bin === highlight);
        if (!hasBin) {
            for (const d of data) {
                if (isEdge(d.x, d.y)) {
                    const px = offsetX + (d.x - minX) * dieW;
                    const py = offsetY + (d.y - minY) * dieH;
                    ctx.fillStyle = 'rgba(200,200,200,0.15)';
                    ctx.fillRect(px, py, Math.max(0.5, dieW - 0.2), Math.max(0.5, dieH - 0.2));
                }
            }
            // 标注简单的坐标
            drawSimpleCoords(ctx, minX, maxX, minY, maxY, offsetX, offsetY, dieW, dieH, gridW, gridH, radius);
            return;
        }
    }
    for (const d of data) {
        const px = offsetX + (d.x - minX) * dieW;
        const py = offsetY + (d.y - minY) * dieH;
        let color;
        if (highlight !== null) {
            if (d.bin === highlight)
                color = getBinColor(d.bin);
            else if (isEdge(d.x, d.y))
                color = 'rgba(200,200,200,0.15)';
            else
                continue;
        }
        else {
            color = getBinColor(d.bin);
        }
        ctx.fillStyle = color;
        ctx.fillRect(px, py, Math.max(0.5, dieW - 0.2), Math.max(0.5, dieH - 0.2));
    }
    drawSimpleCoords(ctx, minX, maxX, minY, maxY, offsetX, offsetY, dieW, dieH, gridW, gridH, radius);
}
function drawSimpleCoords(ctx, minX, maxX, minY, maxY, offsetX, offsetY, dieW, dieH, gridW, gridH, radius) {
    ctx.fillStyle = '#bbb';
    const fontSize = Math.max(7, Math.min(9, Math.min(dieW, dieH) * 0.8));
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    const xStep = Math.max(1, Math.ceil(gridW / 10));
    for (let x = minX; x <= maxX; x += xStep) {
        ctx.fillText(String(x), offsetX + (x - minX) * dieW + dieW / 2, offsetY - 8);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yStep = Math.max(1, Math.ceil(gridH / 10));
    for (let y = minY; y <= maxY; y += yStep) {
        ctx.fillText(String(y), offsetX - 8, offsetY + (y - minY) * dieH + dieH / 2);
    }
}
function applySavedReportConfig(cfg) {
    if (!cfg)
        return;
    if (cfg.global_comments) {
        bins.value.forEach(b => {
            if (cfg.global_comments[b.bin_number]) {
                b.global_comment = cfg.global_comments[b.bin_number];
            }
        });
    }
    if (cfg.note_text !== undefined) {
        noteText.value = cfg.note_text;
    }
    if (cfg.global_comment_width)
        globalCommentWidth.value = cfg.global_comment_width;
    if (cfg.all_comment_width)
        allCommentWidth.value = cfg.all_comment_width;
    if (cfg.lot_order) {
        const orderMap = new Map();
        cfg.lot_order.forEach((id, idx) => orderMap.set(String(id), idx));
        lots.value.sort((a, b) => {
            const idxA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 999;
            const idxB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 999;
            return idxA - idxB;
        });
        const mapMap = new Map();
        mapDataList.value.forEach((m) => mapMap.set(String(m.lot_id), m));
        mapDataList.value = lots.value.map(l => mapMap.get(String(l.id))).filter(m => m !== undefined);
    }
    if (cfg.lot_widths) {
        lots.value.forEach(l => {
            if (cfg.lot_widths[l.id]) {
                l.width = cfg.lot_widths[l.id];
            }
        });
    }
}
function selectDefaultOsatTrendBin() {
    if (!isOsatSummaryReport.value || !bins.value.length)
        return;
    const bin1 = bins.value.find(b => Number(b.bin_number) === 1);
    globalBinFilter.value = bin1 ? bin1.bin_number : bins.value[0].bin_number;
}
async function fetchAll() {
    loading.value = true;
    isDataLoading.value = true;
    try {
        const reportId = route.query.report_id;
        let savedConfig = null;
        if (reportId) {
            try {
                const report = await api.get(`/reports/${reportId}`);
                if (report) {
                    reportAuthor.value = report.username || 'unknown';
                    savedConfig = report.config_data || {};
                    currentReportConfig.value = savedConfig;
                }
            }
            catch (err) {
                console.error('加载保存的报表配置失败:', err);
            }
        }
        const snapshot = savedConfig?.multi_bin_snapshot;
        if (snapshot && snapshot.data_range === dataRange.value) {
            lots.value = (snapshot.lots || []).map((l) => ({ ...l, width: l.width || 120 }));
            bins.value = (snapshot.bins || []).map((b) => ({ ...b, global_comment: b.global_comment || '' }));
            mapDataList.value = snapshot.maps || [];
        }
        else {
            const [binRes, mapRes] = await Promise.all([
                api.get('/analysis/multi/bin_summary', { params: { lot_ids: lotIdsStr, data_range: dataRange.value } }),
                api.get('/analysis/multi/wafer_bin_maps', { params: { lot_ids: lotIdsStr, data_range: dataRange.value } }),
            ]);
            lots.value = binRes.lots.map((l) => ({ ...l, width: 120 }));
            bins.value = binRes.bins.map((b) => ({ ...b, global_comment: '' }));
            mapDataList.value = mapRes.maps;
        }
        // 初始化 selectedBins
        mapDataList.value.forEach((_, i) => {
            if (selectedBins.value[i] === undefined)
                selectedBins.value[i] = null;
        });
        applySavedReportConfig(savedConfig);
        selectDefaultOsatTrendBin();
        await nextTick();
        if (isOsatSummaryReport.value) {
            drawOsatTrend();
        }
        else {
            mapDataList.value.forEach((_, i) => drawMap(i));
        }
    }
    finally {
        loading.value = false;
        // 延迟一丢丢关闭 loading 标志，确保 watch 逻辑不会在数据填充瞬间触发
        nextTick(() => {
            isDataLoading.value = false;
        });
    }
}
watch([selectedTrendBin, lots, bins], () => {
    nextTick(drawOsatTrend);
}, { deep: true });
async function saveToReportCenter() {
    const prod = lots.value[0]?.product_name || 'Unknown';
    const lot = lots.value[0]?.lot_id || 'Unknown';
    const wafers = lots.value.map(l => l.wafer_id).filter(Boolean).join(',');
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const YMDHMS = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const name = `${lot}_${wafers}_${YMDHMS}`;
    const globalComments = {};
    bins.value.forEach(b => {
        if (b.global_comment) {
            globalComments[b.bin_number] = b.global_comment;
        }
    });
    const configData = {
        ...currentReportConfig.value,
        global_comments: globalComments,
        note_text: noteText.value,
        lot_order: lots.value.map(l => l.id),
        lot_widths: lots.value.reduce((acc, l) => {
            acc[l.id] = l.width;
            return acc;
        }, {}),
        global_comment_width: globalCommentWidth.value,
        all_comment_width: allCommentWidth.value,
    };
    const currentUrl = new URL(window.location.href);
    try {
        const res = await api.post('/reports', {
            name: name,
            product_name: prod,
            url: currentUrl.toString(),
            type: 'Multi-Bin Analysis',
            source: 'eng',
            config_data: configData
        });
        const dbReportId = res.id;
        // 更新 URL，加上真实的数据库 report_id，进入报表编辑/查看模式
        currentUrl.searchParams.set('report_id', String(dbReportId));
        // 同步把包含真实 report_id 的 URL 更新回后端
        await api.put(`/reports/${dbReportId}`, {
            url: currentUrl.toString()
        });
        isSaved.value = true;
        // 关键修复：保存成功后立即更新 reportAuthor，
        // 否则 canEditReport 会因为 reportAuthor 仍为 'unknown' 而返回 false，
        // 导致后续所有 saveReportImmediately 调用被静默拦截
        try {
            const userInfoStr = localStorage.getItem('user');
            if (userInfoStr) {
                const userInfo = JSON.parse(userInfoStr);
                reportAuthor.value = (userInfo.username || '').toLowerCase().trim();
            }
        }
        catch (e) { }
        router.replace({
            query: { ...route.query, report_id: String(dbReportId) }
        });
    }
    catch (err) {
        alert(err || '保存到报表中心失败');
    }
}
let autoSaveTimeout = null;
// 立即保存报表数据到数据库
async function saveReportImmediately() {
    if (isDataLoading.value)
        return;
    const reportId = route.query.report_id;
    if (!reportId)
        return;
    if (!canEditReport.value)
        return;
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
    const globalComments = {};
    bins.value.forEach(b => {
        if (b.global_comment) {
            globalComments[b.bin_number] = b.global_comment;
        }
    });
    const configData = {
        ...currentReportConfig.value,
        global_comments: globalComments,
        note_text: noteText.value,
        lot_order: lots.value.map(l => l.id),
        lot_widths: lots.value.reduce((acc, l) => {
            acc[l.id] = l.width;
            return acc;
        }, {}),
        global_comment_width: globalCommentWidth.value,
        all_comment_width: allCommentWidth.value,
    };
    try {
        await api.put(`/reports/${reportId}`, {
            config_data: configData
        });
        currentReportConfig.value = configData;
        console.log('Report auto-saved immediately to DB');
    }
    catch (err) {
        console.error('自动保存到数据库失败:', err);
    }
}
async function handleExport() {
    if (!lots.value.length)
        return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Chip ATE System';
    const sheet = workbook.addWorksheet('Multi Bin Summary');
    // 1. 写表头
    const lotHeaders = lots.value.map(l => getLotDisplayName(l));
    // 第一行：合并单元格
    const headerRow1 = sheet.addRow(['Bin', 'Name', 'Total', '', ...lotHeaders.flatMap(h => [h, '']), 'Analysis Comment']);
    sheet.mergeCells(1, 3, 1, 4); // Total
    lots.value.forEach((_, idx) => {
        sheet.mergeCells(1, 5 + idx * 2, 1, 6 + idx * 2);
    });
    // 第二行：Count / % / Comment
    const headerRow2 = sheet.addRow(['', '', 'Count', '%', ...lotHeaders.flatMap(() => ['Count', '%']), '']);
    [headerRow1, headerRow2].forEach(row => {
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF808080' } };
        row.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet.mergeCells(1, 1, 2, 1); // Bin
    sheet.mergeCells(1, 2, 2, 2); // Name
    const lastColIdx = 4 + lots.value.length * 2 + 1;
    sheet.mergeCells(1, lastColIdx, 2, lastColIdx); // Analysis Comment
    // 2. 写表格数据
    bins.value.forEach((b) => {
        const rowData = [
            b.bin_number,
            b.bin_name,
            getBinTotalCount(b),
            parseFloat(getBinTotalPct(b)) / 100
        ];
        lots.value.forEach(lot => {
            rowData.push(b.lots[String(lot.id)]?.count ?? 0);
            rowData.push((b.lots[String(lot.id)]?.pct ?? 0) / 100);
        });
        rowData.push(b.global_comment || '');
        const row = sheet.addRow(rowData);
        row.alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
        if (isPassBin(b.bin_number)) {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFE6' } };
        }
    });
    // 写 Summary 行
    const totalRow = sheet.addRow(['Total', '', getAllTotal(), 1, ...lots.value.flatMap(lot => [getLotTotal(lot.id), 1])]);
    const passRow = sheet.addRow(['Pass', '', getAllPass(), getAllTotal() > 0 ? getAllPass() / getAllTotal() : 0, ...lots.value.flatMap(lot => [getLotPass(lot.id), getLotTotal(lot.id) > 0 ? getLotPass(lot.id) / getLotTotal(lot.id) : 0])]);
    const failRow = sheet.addRow(['Fail', '', getAllFail(), getAllTotal() > 0 ? getAllFail() / getAllTotal() : 0, ...lots.value.flatMap(lot => [getLotFail(lot.id), getLotTotal(lot.id) > 0 ? getLotFail(lot.id) / getLotTotal(lot.id) : 0])]);
    sheet.mergeCells(sheet.rowCount - 2, 1, sheet.rowCount - 2, 2);
    sheet.mergeCells(sheet.rowCount - 1, 1, sheet.rowCount - 1, 2);
    sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, 2);
    [totalRow, passRow, failRow].forEach(row => {
        row.font = { bold: true };
        row.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    passRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFE6' } };
    // 设置列宽
    sheet.getColumn(1).width = 10;
    sheet.getColumn(2).width = 20;
    for (let i = 3; i <= 4 + lots.value.length * 2; i++) {
        sheet.getColumn(i).width = 12;
        if (i % 2 === 0) {
            sheet.getColumn(i).numFmt = '0.00%';
        }
    }
    sheet.getColumn(4 + lots.value.length * 2 + 1).width = 30;
    // 3. 导出 Maps (每排4个)
    if (mapDataList.value.some(m => m.has_map)) {
        const validMaps = mapDataList.value.filter((m, i) => m.has_map && canvasRefs[i]);
        if (validMaps.length > 0) {
            // 在表格下方留出空行
            let currentRow = sheet.rowCount + 3;
            // 每行4个map
            for (let i = 0; i < validMaps.length; i += 4) {
                const rowMaps = validMaps.slice(i, i + 4);
                let maxCompositeHeight = 0;
                const rowImages = [];
                for (let j = 0; j < rowMaps.length; j++) {
                    const mapItem = rowMaps[j];
                    const originalIdx = mapDataList.value.indexOf(mapItem);
                    const canvas = canvasRefs[originalIdx];
                    if (!canvas)
                        continue;
                    const mapWidth = canvas.width;
                    const mapHeight = canvas.height;
                    const legendWidth = 160;
                    const compositeWidth = mapWidth + legendWidth;
                    // 获取当前图例需要绘制的 Bin (按顺序，或者只绘制该wafer有的)
                    const visibleBins = getMapBins(mapItem);
                    const legendHeight = visibleBins.length * 20 + 40;
                    const compositeHeight = Math.max(mapHeight, legendHeight);
                    if (compositeHeight > maxCompositeHeight)
                        maxCompositeHeight = compositeHeight;
                    const offCanvas = document.createElement('canvas');
                    offCanvas.width = compositeWidth;
                    offCanvas.height = compositeHeight;
                    const ctx = offCanvas.getContext('2d');
                    if (ctx) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, compositeWidth, compositeHeight);
                        // 绘制标题
                        ctx.fillStyle = '#333';
                        ctx.font = 'bold 16px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(getMapDisplayName(mapItem), mapWidth / 2, 20);
                        // 画地图 (略微下移给标题留空间)
                        ctx.drawImage(canvas, 0, 30);
                        // 画图例
                        const startX = mapWidth + 10;
                        let startY = 40;
                        ctx.font = '14px sans-serif';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.beginPath();
                        ctx.arc(startX + 6, startY, 5, 0, 2 * Math.PI);
                        ctx.fillStyle = '#aaa';
                        ctx.fill();
                        ctx.fillStyle = '#333';
                        ctx.fillText(`ALL`, startX + 16, startY);
                        startY += 24;
                        visibleBins.forEach(b => {
                            const color = getBinColor(b.bin_number);
                            ctx.beginPath();
                            ctx.arc(startX + 6, startY, 5, 0, 2 * Math.PI);
                            ctx.fillStyle = color;
                            ctx.fill();
                            ctx.fillStyle = '#333';
                            ctx.fillText(`Bin${b.bin_number}(${b.count})`, startX + 16, startY);
                            startY += 24;
                        });
                        const mapDataUrl = offCanvas.toDataURL('image/png');
                        const imageId = workbook.addImage({
                            base64: mapDataUrl,
                            extension: 'png',
                        });
                        rowImages.push({ imageId, width: compositeWidth, height: compositeHeight });
                    }
                }
                // 将这行的图片插入到 Excel
                // 这里可以通过 scale 控制缩放大小，并动态计算占用的列数使其紧挨着显示
                let currentCol = 0;
                const scale = 1.3; // 控制导出的 Map 图片缩放比例为 130%
                for (let j = 0; j < rowImages.length; j++) {
                    const img = rowImages[j];
                    if (!img)
                        continue;
                    sheet.addImage(img.imageId, {
                        tl: { col: currentCol, row: currentRow },
                        ext: { width: img.width * scale, height: img.height * scale } // 缩放图片
                    });
                    // 计算当前图片按比例放大后占据多少列 (默认一列宽度约70px)，以此得出下一张图起始列
                    currentCol += Math.ceil((img.width * scale) / 100);
                }
                // 换行计算：根据放大后高度占据多少行 (每行大约20px高)
                currentRow += Math.ceil((maxCompositeHeight * scale) / 20) + 2;
            }
        }
    }
    // 4. 导出文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `MultiBinReport_${new Date().getTime()}.xlsx`);
}
onMounted(fetchAll);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-report-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-report-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-report-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['saved']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['draggable-header']} */ ;
/** @type {__VLS_StyleScopedClasses['draggable-header']} */ ;
/** @type {__VLS_StyleScopedClasses['resizer']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-header']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['bin-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "multi-bin-view" },
});
/** @type {__VLS_StyleScopedClasses['multi-bin-view']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "options-bar" },
});
/** @type {__VLS_StyleScopedClasses['options-bar']} */ ;
if (!__VLS_ctx.isOsatSummaryReport) {
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
        ...{ onChange: (__VLS_ctx.fetchAll) },
        type: "radio",
        value: "final",
    });
    (__VLS_ctx.dataRange);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.fetchAll) },
        type: "radio",
        value: "original",
    });
    (__VLS_ctx.dataRange);
}
if (!__VLS_ctx.isOsatSummaryReport) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "opt-group" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['opt-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "opt-label" },
    });
    /** @type {__VLS_StyleScopedClasses['opt-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.isOsatSummaryReport))
                    throw 0;
                return (__VLS_ctx.showCount = !__VLS_ctx.showCount);
                // @ts-ignore
                [isOsatSummaryReport, isOsatSummaryReport, fetchAll, fetchAll, dataRange, dataRange, showCount, showCount,];
            } },
        ...{ class: "toggle-btn" },
        ...{ class: ({ active: __VLS_ctx.showCount }) },
    });
    /** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.isOsatSummaryReport))
                    throw 0;
                return (__VLS_ctx.showYield = !__VLS_ctx.showYield);
                // @ts-ignore
                [showCount, showYield, showYield,];
            } },
        ...{ class: "toggle-btn" },
        ...{ class: ({ active: __VLS_ctx.showYield }) },
    });
    /** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.isOsatSummaryReport))
                    throw 0;
                return (__VLS_ctx.showComment = !__VLS_ctx.showComment);
                // @ts-ignore
                [showYield, showComment, showComment,];
            } },
        ...{ class: "toggle-btn" },
        ...{ class: ({ active: __VLS_ctx.showComment }) },
    });
    /** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
}
if (!__VLS_ctx.isOsatSummaryReport) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.openMultiAnalysis) },
        ...{ class: "export-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleExport) },
    ...{ class: "export-btn" },
});
/** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
if (!__VLS_ctx.route.query.report_id) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.saveToReportCenter) },
        ...{ class: "save-report-btn" },
        ...{ class: ({ saved: __VLS_ctx.isSaved }) },
    });
    /** @type {__VLS_StyleScopedClasses['save-report-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['saved']} */ ;
}
if (__VLS_ctx.isOsatSummaryReport && __VLS_ctx.bins.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "osat-report-layout" },
    });
    /** @type {__VLS_StyleScopedClasses['osat-report-layout']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-wrap osat-summary-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
    /** @type {__VLS_StyleScopedClasses['osat-summary-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "bin-table osat-summary-table" },
    });
    /** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['osat-summary-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ onClick: (__VLS_ctx.toggleCountSort) },
        ...{ class: "sortable-header" },
    });
    /** @type {__VLS_StyleScopedClasses['sortable-header']} */ ;
    if (__VLS_ctx.countSortOrder !== 'none') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.countSortOrder === 'asc' ? '↑' : '↓');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "chk-col" },
    });
    /** @type {__VLS_StyleScopedClasses['chk-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [b] of __VLS_vFor((__VLS_ctx.bins))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (b.bin_number),
            ...{ class: ({ 'pass-row': __VLS_ctx.isPassBin(b.bin_number), 'active-filter-row': __VLS_ctx.globalBinFilter === b.bin_number }) },
        });
        /** @type {__VLS_StyleScopedClasses['pass-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['active-filter-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (b.bin_number);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (b.bin_name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.getBinTotalCount(b));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.getBinTotalPct(b));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "chk-col" },
        });
        /** @type {__VLS_StyleScopedClasses['chk-col']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    if (!(__VLS_ctx.isOsatSummaryReport && __VLS_ctx.bins.length))
                        throw 0;
                    return (__VLS_ctx.setGlobalBinFilter(b.bin_number));
                    // @ts-ignore
                    [isOsatSummaryReport, isOsatSummaryReport, showComment, openMultiAnalysis, handleExport, route, saveToReportCenter, isSaved, bins, bins, toggleCountSort, countSortOrder, countSortOrder, isPassBin, globalBinFilter, getBinTotalCount, getBinTotalPct, setGlobalBinFilter,];
                } },
            type: "checkbox",
            checked: (__VLS_ctx.globalBinFilter === b.bin_number),
            ...{ class: "bin-checkbox" },
        });
        /** @type {__VLS_StyleScopedClasses['bin-checkbox']} */ ;
        // @ts-ignore
        [globalBinFilter,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        ...{ class: "summary-row" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllTotal());
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        ...{ class: "summary-row pass-row" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['pass-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllPass());
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllTotal() > 0 ? (__VLS_ctx.getAllPass() / __VLS_ctx.getAllTotal() * 100).toFixed(2) + '%' : '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        ...{ class: "summary-row" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllFail());
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllTotal() > 0 ? (__VLS_ctx.getAllFail() / __VLS_ctx.getAllTotal() * 100).toFixed(2) + '%' : '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "osat-trend-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['osat-trend-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "trend-header" },
    });
    /** @type {__VLS_StyleScopedClasses['trend-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "trend-title" },
    });
    /** @type {__VLS_StyleScopedClasses['trend-title']} */ ;
    (__VLS_ctx.selectedTrendBin ? `Bin ${__VLS_ctx.selectedTrendBin.bin_number} - ${__VLS_ctx.selectedTrendBin.bin_name}` : 'Bin Trend');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "trend-legend" },
    });
    /** @type {__VLS_StyleScopedClasses['trend-legend']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({
        ...{ class: "legend-dot total" },
    });
    /** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['total']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({
        ...{ class: "legend-dot wafer" },
    });
    /** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['wafer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "trend-chart-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['trend-chart-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
        ...{ onMousemove: (__VLS_ctx.handleTrendMouseMove) },
        ...{ onMouseleave: (__VLS_ctx.handleTrendMouseLeave) },
        ref: "trendCanvasRef",
        width: "900",
        height: "420",
        ...{ class: "trend-canvas" },
    });
    /** @type {__VLS_StyleScopedClasses['trend-canvas']} */ ;
    if (!__VLS_ctx.selectedTrendBin) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "trend-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['trend-empty']} */ ;
    }
}
else if (__VLS_ctx.bins.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "bin-table" },
    });
    /** @type {__VLS_StyleScopedClasses['bin-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        rowspan: "2",
        ...{ class: "chk-col" },
    });
    /** @type {__VLS_StyleScopedClasses['chk-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        rowspan: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        rowspan: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        colspan: "2",
        ...{ class: "lot-header" },
    });
    /** @type {__VLS_StyleScopedClasses['lot-header']} */ ;
    for (const [lot, index] of __VLS_vFor((__VLS_ctx.lots))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ onDragstart: (...[$event]) => {
                    if (!!(__VLS_ctx.isOsatSummaryReport && __VLS_ctx.bins.length))
                        throw 0;
                    if (!(__VLS_ctx.bins.length))
                        throw 0;
                    return (__VLS_ctx.handleDragStart(index));
                    // @ts-ignore
                    [bins, getAllTotal, getAllTotal, getAllTotal, getAllTotal, getAllTotal, getAllPass, getAllPass, getAllFail, getAllFail, selectedTrendBin, selectedTrendBin, selectedTrendBin, selectedTrendBin, handleTrendMouseMove, handleTrendMouseLeave, lots, handleDragStart,];
                } },
            ...{ onDragover: () => { } },
            ...{ onDrop: (...[$event]) => {
                    if (!!(__VLS_ctx.isOsatSummaryReport && __VLS_ctx.bins.length))
                        throw 0;
                    if (!(__VLS_ctx.bins.length))
                        throw 0;
                    return (__VLS_ctx.handleDrop(index));
                    // @ts-ignore
                    [handleDrop,];
                } },
            key: (lot.id),
            colspan: (__VLS_ctx.getLotColSpan()),
            ...{ class: "lot-header draggable-header" },
            draggable: "true",
        });
        /** @type {__VLS_StyleScopedClasses['lot-header']} */ ;
        /** @type {__VLS_StyleScopedClasses['draggable-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "lot-header-top" },
        });
        /** @type {__VLS_StyleScopedClasses['lot-header-top']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
            href: ('/lot/' + lot.id + '/bin'),
            target: "_blank",
            ...{ class: "lot-link" },
        });
        /** @type {__VLS_StyleScopedClasses['lot-link']} */ ;
        (__VLS_ctx.getLotDisplayName(lot));
        // @ts-ignore
        [getLotColSpan, getLotDisplayName,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        rowspan: "2",
        ...{ class: "global-comment-header" },
        ...{ style: ({ width: __VLS_ctx.globalCommentWidth + 'px', minWidth: __VLS_ctx.globalCommentWidth + 'px' }) },
    });
    /** @type {__VLS_StyleScopedClasses['global-comment-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "header-content" },
    });
    /** @type {__VLS_StyleScopedClasses['header-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMousedown: (__VLS_ctx.startGlobalResize) },
        ...{ class: "resizer" },
    });
    /** @type {__VLS_StyleScopedClasses['resizer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        rowspan: "2",
        ...{ class: "all-comment-header" },
        ...{ style: ({ width: __VLS_ctx.allCommentWidth + 'px' }) },
    });
    /** @type {__VLS_StyleScopedClasses['all-comment-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "header-content" },
    });
    /** @type {__VLS_StyleScopedClasses['header-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMousedown: (__VLS_ctx.startAllCommentResize) },
        ...{ class: "resizer" },
    });
    /** @type {__VLS_StyleScopedClasses['resizer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ onClick: (__VLS_ctx.toggleCountSort) },
        ...{ class: "sortable-header" },
    });
    /** @type {__VLS_StyleScopedClasses['sortable-header']} */ ;
    if (__VLS_ctx.countSortOrder !== 'none') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.countSortOrder === 'asc' ? '↑' : '↓');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    for (const [lot] of __VLS_vFor((__VLS_ctx.lots))) {
        __VLS_asFunctionalElement(__VLS_intrinsics.template)({
            key: (lot.id),
        });
        if (__VLS_ctx.showCount) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        }
        if (__VLS_ctx.showYield) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        }
        if (__VLS_ctx.showComment) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "comment-header-col" },
                ...{ style: ({ width: (lot.width || 120) + 'px', minWidth: (lot.width || 120) + 'px' }) },
            });
            /** @type {__VLS_StyleScopedClasses['comment-header-col']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "header-content" },
            });
            /** @type {__VLS_StyleScopedClasses['header-content']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onMousedown: (e => __VLS_ctx.startResize(e, lot)) },
                ...{ class: "resizer" },
            });
            /** @type {__VLS_StyleScopedClasses['resizer']} */ ;
        }
        // @ts-ignore
        [showCount, showYield, showComment, toggleCountSort, countSortOrder, countSortOrder, lots, globalCommentWidth, globalCommentWidth, startGlobalResize, allCommentWidth, startAllCommentResize, startResize,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [b, bIdx] of __VLS_vFor((__VLS_ctx.bins))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (b.bin_number),
            ...{ class: ({ 'pass-row': __VLS_ctx.isPassBin(b.bin_number), 'active-filter-row': __VLS_ctx.globalBinFilter === b.bin_number }) },
        });
        /** @type {__VLS_StyleScopedClasses['pass-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['active-filter-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "chk-col" },
        });
        /** @type {__VLS_StyleScopedClasses['chk-col']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    if (!!(__VLS_ctx.isOsatSummaryReport && __VLS_ctx.bins.length))
                        throw 0;
                    if (!(__VLS_ctx.bins.length))
                        throw 0;
                    return (__VLS_ctx.setGlobalBinFilter(b.bin_number));
                    // @ts-ignore
                    [bins, isPassBin, globalBinFilter, setGlobalBinFilter,];
                } },
            type: "checkbox",
            checked: (__VLS_ctx.globalBinFilter === b.bin_number),
            ...{ class: "bin-checkbox" },
        });
        /** @type {__VLS_StyleScopedClasses['bin-checkbox']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (b.bin_number);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (b.bin_name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.getBinTotalCount(b));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.getBinTotalPct(b));
        for (const [lot] of __VLS_vFor((__VLS_ctx.lots))) {
            __VLS_asFunctionalElement(__VLS_intrinsics.template)({
                key: (lot.id),
            });
            if (__VLS_ctx.showCount) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (b.lots[String(lot.id)]?.count ?? 0);
            }
            if (__VLS_ctx.showYield) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                ((b.lots[String(lot.id)]?.pct ?? 0).toFixed(2));
            }
            if (__VLS_ctx.showComment) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "comment-cell" },
                    ...{ style: ({ width: (lot.width || 120) + 'px', minWidth: (lot.width || 120) + 'px' }) },
                });
                /** @type {__VLS_StyleScopedClasses['comment-cell']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "comment-text-wrap" },
                    title: (b.lots[String(lot.id)]?.comment),
                });
                /** @type {__VLS_StyleScopedClasses['comment-text-wrap']} */ ;
                (b.lots[String(lot.id)]?.comment ?? '-');
            }
            // @ts-ignore
            [showCount, showYield, showComment, globalBinFilter, getBinTotalCount, getBinTotalPct, lots,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "global-comment-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['global-comment-cell']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
            ...{ onBlur: (__VLS_ctx.saveReportImmediately) },
            ...{ onMouseleave: (__VLS_ctx.saveReportImmediately) },
            value: (b.global_comment),
            ...{ class: "comment-textarea" },
            disabled: (!__VLS_ctx.canEditReport),
        });
        /** @type {__VLS_StyleScopedClasses['comment-textarea']} */ ;
        if (bIdx === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                rowspan: (__VLS_ctx.bins.length + 3),
                ...{ class: "all-comment-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['all-comment-cell']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
                ...{ onBlur: (__VLS_ctx.saveReportImmediately) },
                ...{ onMouseleave: (__VLS_ctx.saveReportImmediately) },
                value: (__VLS_ctx.noteText),
                ...{ class: "all-comment-textarea" },
                disabled: (!__VLS_ctx.canEditReport),
                placeholder: "   ",
            });
            /** @type {__VLS_StyleScopedClasses['all-comment-textarea']} */ ;
        }
        // @ts-ignore
        [bins, saveReportImmediately, saveReportImmediately, saveReportImmediately, saveReportImmediately, canEditReport, canEditReport, noteText,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        ...{ class: "summary-row" },
        ...{ class: ({ 'active-filter-row': __VLS_ctx.globalBinFilter === null }) },
    });
    /** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['active-filter-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "chk-col" },
    });
    /** @type {__VLS_StyleScopedClasses['chk-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                if (!!(__VLS_ctx.isOsatSummaryReport && __VLS_ctx.bins.length))
                    throw 0;
                if (!(__VLS_ctx.bins.length))
                    throw 0;
                return (__VLS_ctx.setGlobalBinFilter(null));
                // @ts-ignore
                [globalBinFilter, setGlobalBinFilter,];
            } },
        type: "checkbox",
        checked: (__VLS_ctx.globalBinFilter === null),
        ...{ class: "bin-checkbox" },
    });
    /** @type {__VLS_StyleScopedClasses['bin-checkbox']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllTotal());
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    for (const [lot] of __VLS_vFor((__VLS_ctx.lots))) {
        __VLS_asFunctionalElement(__VLS_intrinsics.template)({
            key: (lot.id),
        });
        if (__VLS_ctx.showCount) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.getLotTotal(lot.id));
        }
        if (__VLS_ctx.showYield) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        }
        if (__VLS_ctx.showComment) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        }
        // @ts-ignore
        [showCount, showYield, showComment, globalBinFilter, getAllTotal, lots, getLotTotal,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        ...{ class: "summary-row pass-row" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['pass-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "chk-col" },
    });
    /** @type {__VLS_StyleScopedClasses['chk-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllPass());
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllTotal() > 0 ? (__VLS_ctx.getAllPass() / __VLS_ctx.getAllTotal() * 100).toFixed(2) + '%' : '-');
    for (const [lot] of __VLS_vFor((__VLS_ctx.lots))) {
        __VLS_asFunctionalElement(__VLS_intrinsics.template)({
            key: (lot.id),
        });
        if (__VLS_ctx.showCount) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.getLotPass(lot.id));
        }
        if (__VLS_ctx.showYield) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.getLotTotal(lot.id) > 0 ? (__VLS_ctx.getLotPass(lot.id) / __VLS_ctx.getLotTotal(lot.id) * 100).toFixed(2) + '%' : '-');
        }
        if (__VLS_ctx.showComment) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        }
        // @ts-ignore
        [showCount, showYield, showComment, getAllTotal, getAllTotal, getAllPass, getAllPass, lots, getLotTotal, getLotTotal, getLotPass, getLotPass,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        ...{ class: "summary-row" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "chk-col" },
    });
    /** @type {__VLS_StyleScopedClasses['chk-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        colspan: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllFail());
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.getAllTotal() > 0 ? (__VLS_ctx.getAllFail() / __VLS_ctx.getAllTotal() * 100).toFixed(2) + '%' : '-');
    for (const [lot] of __VLS_vFor((__VLS_ctx.lots))) {
        __VLS_asFunctionalElement(__VLS_intrinsics.template)({
            key: (lot.id),
        });
        if (__VLS_ctx.showCount) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.getLotFail(lot.id));
        }
        if (__VLS_ctx.showYield) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.getLotTotal(lot.id) > 0 ? (__VLS_ctx.getLotFail(lot.id) / __VLS_ctx.getLotTotal(lot.id) * 100).toFixed(2) + '%' : '-');
        }
        if (__VLS_ctx.showComment) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        }
        // @ts-ignore
        [showCount, showYield, showComment, getAllTotal, getAllTotal, getAllFail, getAllFail, lots, getLotTotal, getLotTotal, getLotFail, getLotFail,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading" },
    });
    /** @type {__VLS_StyleScopedClasses['loading']} */ ;
}
if (!__VLS_ctx.isOsatSummaryReport && __VLS_ctx.mapDataList.some(m => m.has_map)) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "maps-section" },
    });
    /** @type {__VLS_StyleScopedClasses['maps-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-title" },
    });
    /** @type {__VLS_StyleScopedClasses['section-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "maps-row" },
    });
    /** @type {__VLS_StyleScopedClasses['maps-row']} */ ;
    for (const [mapItem, idx] of __VLS_vFor((__VLS_ctx.mapDataList))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (mapItem.lot_id),
            ...{ class: "map-block" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (mapItem.has_map), }, null, null);
        /** @type {__VLS_StyleScopedClasses['map-block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "map-label" },
        });
        /** @type {__VLS_StyleScopedClasses['map-label']} */ ;
        (__VLS_ctx.getMapDisplayName(mapItem));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "map-with-legend" },
        });
        /** @type {__VLS_StyleScopedClasses['map-with-legend']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
            ref: (el => __VLS_ctx.setCanvasRef(idx, el)),
            width: "520",
            height: "520",
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "bin-legend" },
        });
        /** @type {__VLS_StyleScopedClasses['bin-legend']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isOsatSummaryReport && __VLS_ctx.mapDataList.some(m => m.has_map)))
                        throw 0;
                    return (__VLS_ctx.toggleHighlight(idx, null));
                    // @ts-ignore
                    [isOsatSummaryReport, loading, mapDataList, mapDataList, getMapDisplayName, setCanvasRef, toggleHighlight,];
                } },
            ...{ class: "bin-icon" },
            ...{ class: ({ selected: __VLS_ctx.selectedBins[idx] === null }) },
        });
        /** @type {__VLS_StyleScopedClasses['bin-icon']} */ ;
        /** @type {__VLS_StyleScopedClasses['selected']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "bin-dot" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['bin-dot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        for (const [b] of __VLS_vFor((__VLS_ctx.getMapBins(mapItem)))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.isOsatSummaryReport && __VLS_ctx.mapDataList.some(m => m.has_map)))
                            throw 0;
                        return (__VLS_ctx.toggleHighlight(idx, b.bin_number));
                        // @ts-ignore
                        [toggleHighlight, selectedBins, getMapBins,];
                    } },
                key: (b.bin_number),
                ...{ class: "bin-icon" },
                ...{ class: ({ selected: __VLS_ctx.selectedBins[idx] === b.bin_number }) },
            });
            /** @type {__VLS_StyleScopedClasses['bin-icon']} */ ;
            /** @type {__VLS_StyleScopedClasses['selected']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "bin-dot" },
                ...{ style: ({ background: __VLS_ctx.getBinColor(b.bin_number) }) },
            });
            /** @type {__VLS_StyleScopedClasses['bin-dot']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (b.bin_number);
            (b.count);
            // @ts-ignore
            [selectedBins, getBinColor,];
        }
        // @ts-ignore
        [];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
