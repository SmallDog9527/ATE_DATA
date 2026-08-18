import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import api from '@/api';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
const route = useRoute();
const router = useRouter();
const productName = computed(() => route.params.productName);
const currentId = computed(() => Number(route.params.id));
const isDataProgram = computed(() => route.name === 'data-program-param');
const dataMonths = computed(() => Math.max(1, Number(route.query.months) || 1));
// ─── State ───
const loading = ref(false);
const tab = ref('param');
// ─── Datasheet Comparison State ───
const datasheetInfo = ref(null);
const datasheetRows = ref([]);
const datasheetFilter = ref('');
const datasheetStatusFilter = ref('all');
const datasheetLoading = ref(false);
const hideParamNameAndCond = ref(true);
const dsSymWidth = ref(Number(localStorage.getItem('dsSymWidth') || 150));
const ateSymWidth = ref(Number(localStorage.getItem('ateSymWidth') || 150));
const descWidth = ref(Number(localStorage.getItem('descWidth') || 200));
const msgWidth = ref(Number(localStorage.getItem('msgWidth') || 250));
const remarkWidth = ref(Number(localStorage.getItem('remarkWidth') || 185));
function startResize(e, column) {
    const startX = e.pageX;
    const thEl = e.target.closest('th');
    if (!thEl)
        return;
    const startWidth = thEl.getBoundingClientRect().width;
    const startMsgWidth = msgWidth.value;
    const startRemarkWidth = remarkWidth.value;
    if (column === 'ds_sym') {
        dsSymWidth.value = startWidth;
    }
    else if (column === 'ate_sym') {
        ateSymWidth.value = startWidth;
    }
    else if (column === 'desc') {
        descWidth.value = startWidth;
    }
    else if (column === 'msg') {
        msgWidth.value = startWidth;
    }
    else {
        remarkWidth.value = startWidth;
    }
    const doDrag = (moveEvent) => {
        const dX = moveEvent.pageX - startX;
        if (column === 'ds_sym') {
            const newWidth = Math.max(50, startWidth + dX);
            dsSymWidth.value = newWidth;
            localStorage.setItem('dsSymWidth', String(newWidth));
        }
        else if (column === 'ate_sym') {
            const newWidth = Math.max(50, startWidth + dX);
            ateSymWidth.value = newWidth;
            localStorage.setItem('ateSymWidth', String(newWidth));
        }
        else if (column === 'desc') {
            const newWidth = Math.max(50, startWidth + dX);
            descWidth.value = newWidth;
            localStorage.setItem('descWidth', String(newWidth));
        }
        else if (column === 'msg') {
            // When adjusting comparison details (msg), keep columns before it static
            // msg width increases by dX, remark width decreases by dX
            const maxAvailableMsgWidth = startMsgWidth + startRemarkWidth - 50; // Keep remark at least 50px
            const newMsgWidth = Math.max(50, Math.min(maxAvailableMsgWidth, startMsgWidth + dX));
            const newRemarkWidth = startMsgWidth + startRemarkWidth - newMsgWidth;
            msgWidth.value = newMsgWidth;
            remarkWidth.value = newRemarkWidth;
            localStorage.setItem('msgWidth', String(newMsgWidth));
            localStorage.setItem('remarkWidth', String(newRemarkWidth));
        }
        else {
            const newWidth = Math.max(50, startWidth + dX);
            remarkWidth.value = newWidth;
            localStorage.setItem('remarkWidth', String(newWidth));
        }
    };
    const stopDrag = () => {
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', stopDrag);
    };
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
}
// ─── ATE Mapping Editing ───
const editingMapping = ref(null); // { datasheet_symbol }
const mappingSearch = ref('');
const selectedAteSymbol = ref('');
const uniqueAteSymbols = computed(() => {
    const syms = new Set();
    params.value.forEach(p => {
        if (p.symbol)
            syms.add(p.symbol);
    });
    return Array.from(syms).sort();
});
const filteredAteSymbols = computed(() => {
    const q = mappingSearch.value.toLowerCase().trim();
    if (!q)
        return uniqueAteSymbols.value;
    return uniqueAteSymbols.value.filter(sym => sym.toLowerCase().includes(q));
});
function openMappingEdit(row) {
    editingMapping.value = { datasheet_symbol: row.datasheet_symbol };
    selectedAteSymbol.value = row.ate_symbol || '-';
    mappingSearch.value = '';
}
async function saveMapping() {
    if (!editingMapping.value)
        return;
    try {
        const payload = {
            product_name: productName.value,
            datasheet_symbol: editingMapping.value.datasheet_symbol,
            ate_symbol: selectedAteSymbol.value
        };
        await api.post('/spec/update-mapping', payload);
        await loadDatasheetReport();
        editingMapping.value = null;
    }
    catch (err) {
        alert('更新参数映射失败: ' + (err.response?.data?.detail || err.message));
    }
}
// ─── Inline Remark Editing ───
const editingRemarkId = ref(null);
const localRemark = ref('');
const vFocus = {
    mounted: (el) => el.focus()
};
function startEditRemark(row) {
    editingRemarkId.value = row.datasheet_symbol;
    localRemark.value = row.remark || '';
}
async function saveRemark(row) {
    if (editingRemarkId.value !== row.datasheet_symbol)
        return;
    const oldVal = row.remark || '';
    const newVal = localRemark.value.trim();
    if (oldVal === newVal) {
        editingRemarkId.value = null;
        return;
    }
    try {
        const payload = {
            product_name: productName.value,
            datasheet_symbol: row.datasheet_symbol,
            remark: newVal
        };
        await api.post('/spec/update-remark', payload);
        row.remark = newVal;
        editingRemarkId.value = null;
    }
    catch (err) {
        alert('更新备注失败: ' + (err.response?.data?.detail || err.message));
    }
}
// ─── Inline Spec Editing ───
const editingSpecRowId = ref(null);
const editingSpecField = ref(null);
const localSpecVal = ref('');
function startEditSpec(row, field) {
    editingSpecRowId.value = row.datasheet_symbol;
    editingSpecField.value = field;
    if (field === 'min') {
        localSpecVal.value = row.ds_min_str || '';
    }
    else if (field === 'typ') {
        localSpecVal.value = row.ds_typ_str || '';
    }
    else {
        localSpecVal.value = row.ds_max_str || '';
    }
}
async function saveSpec(row) {
    if (editingSpecRowId.value !== row.datasheet_symbol || !editingSpecField.value)
        return;
    const field = editingSpecField.value;
    const newVal = localSpecVal.value.trim();
    let newMinStr = row.ds_min_str || '';
    let newTypStr = row.ds_typ_str || '';
    let newMaxStr = row.ds_max_str || '';
    if (field === 'min') {
        newMinStr = newVal;
    }
    else if (field === 'typ') {
        newTypStr = newVal;
    }
    else {
        newMaxStr = newVal;
    }
    editingSpecRowId.value = null;
    editingSpecField.value = null;
    try {
        const payload = {
            product_name: productName.value,
            datasheet_symbol: row.datasheet_symbol,
            min_str: newMinStr,
            typ_str: newTypStr,
            max_str: newMaxStr
        };
        await api.post('/spec/update-specs', payload);
        await loadDatasheetReport();
    }
    catch (err) {
        alert('更新规格值失败: ' + (err.response?.data?.detail || err.message));
    }
}
const xlsxInput = ref(null);
const docxInput = ref(null);
const params = ref([]);
const summary = ref([]);
const dataSummaryStandard = ref(null);
const pgsList = ref([]);
const dataProgramList = ref([]);
const paramFilter = ref('');
const currentPgs = ref(null);
const qaAlertFilter = ref(false); // QA 红色预警筛选
const sblInputText = ref('');
const sblLimits = ref({});
function parseSbl() {
    const text = sblInputText.value;
    const limits = {};
    if (!text) {
        sblLimits.value = {};
        return;
    }
    // Remove SBL: prefix if present
    let cleanedText = text.replace(/SBL\s*:\s*/gi, '');
    // Split by comma
    const tokens = cleanedText.split(',');
    for (let token of tokens) {
        token = token.trim();
        if (!token)
            continue;
        const colonIdx = token.indexOf(':');
        if (colonIdx === -1)
            continue;
        const key = token.substring(0, colonIdx).trim().toUpperCase();
        const val = token.substring(colonIdx + 1).trim();
        if (key === 'SYL') {
            const limitStr = val;
            limits['1'] = limits['1'] || [];
            limits['1'].push(limitStr);
            limits['2'] = limits['2'] || [];
            limits['2'].push(limitStr);
        }
        else if (key.startsWith('BIN')) {
            const binPart = key.substring(3).trim(); // e.g. "5" or "1+13"
            if (binPart.includes('+')) {
                const binNums = binPart.split('+').map(s => s.trim());
                const limitStr = `${key}: ${val}`;
                for (const num of binNums) {
                    if (num) {
                        limits[num] = limits[num] || [];
                        limits[num].push(limitStr);
                    }
                }
            }
            else {
                limits[binPart] = limits[binPart] || [];
                limits[binPart].push(val);
            }
        }
    }
    const finalLimits = {};
    for (const bin in limits) {
        const list = limits[bin];
        if (list) {
            finalLimits[bin] = list.join(', ');
        }
    }
    sblLimits.value = finalLimits;
}
async function saveSblText() {
    if (isDataProgram.value)
        return;
    parseSbl();
    try {
        await api.post(`/programs/pgs/${currentId.value}/sbl`, {
            sbl_input: sblInputText.value
        });
    }
    catch (e) {
        console.error('Failed to save SBL text:', e);
    }
}
async function exportToExcel() {
    loading.value = true;
    try {
        // 1. Ensure datasheet is loaded
        if (!datasheetRows.value || datasheetRows.value.length === 0) {
            await loadDatasheetReport();
        }
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Chip ATE System';
        // ═══════════════════════════════════════
        // SHEET 1: Datasheet
        // ═══════════════════════════════════════
        const ws1 = workbook.addWorksheet('Datasheet');
        // Add header rows
        const r1 = ws1.addRow([
            '#',
            'Datasheet Symbol',
            'ATE Symbol',
            'Parameter Name',
            'Condition',
            'Unit',
            'Datasheet Specs', '', '', // G, H, I
            'Program Limits (FT)', '', // J, K
            'Program Limits (QA)', '', // L, M
            'ATE Unit',
            'Status',
            'Comparison Details',
            'Remark'
        ]);
        const r2 = ws1.addRow([
            '', '', '', '', '', '',
            'Min', 'Typ', 'Max',
            'Min', 'Max',
            'Min', 'Max',
            '', '', '', ''
        ]);
        // Merge header cells
        ws1.mergeCells('A1:A2');
        ws1.mergeCells('B1:B2');
        ws1.mergeCells('C1:C2');
        ws1.mergeCells('D1:D2');
        ws1.mergeCells('E1:E2');
        ws1.mergeCells('F1:F2');
        ws1.mergeCells('G1:I1');
        ws1.mergeCells('J1:K1');
        ws1.mergeCells('L1:M1');
        ws1.mergeCells('N1:N2');
        ws1.mergeCells('O1:O2');
        ws1.mergeCells('P1:P2');
        ws1.mergeCells('Q1:Q2');
        [r1, r2].forEach((row) => {
            row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF4F81BD' }
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                    left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                    bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                    right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
                };
            });
        });
        // Write Datasheet data
        let dsIdx = 1;
        datasheetRows.value.forEach(row => {
            let rowData;
            if (row.status === 'category') {
                rowData = [
                    dsIdx++,
                    row.datasheet_symbol || '',
                    '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
                ];
            }
            else {
                rowData = [
                    dsIdx++,
                    row.datasheet_symbol || '',
                    row.ate_symbol || '',
                    row.parameter_name || '',
                    row.condition || '',
                    row.unit || '',
                    row.ds_min_str || '',
                    row.ds_typ_str || '',
                    row.ds_max_str || '',
                    fmtLimitVal(row.ft_min),
                    fmtLimitVal(row.ft_max),
                    fmtLimitVal(row.qa_min),
                    fmtLimitVal(row.qa_max),
                    row.ate_unit || '',
                    getStatusLabel(row.status),
                    row.message || '',
                    row.remark || ''
                ];
            }
            const excelRow = ws1.addRow(rowData);
            if (row.status === 'category') {
                ;
                excelRow.isCategory = true;
                excelRow.font = { bold: true };
                excelRow.eachCell((cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFEAEAEA' }
                    };
                });
                ws1.mergeCells(`B${excelRow.number}:Q${excelRow.number}`);
            }
            else {
                excelRow.eachCell((cell, colNumber) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                    if ([1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].includes(colNumber)) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    }
                    else {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    }
                });
                // Highlight violation limits
                const fillViolated = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFFC7CE' }
                };
                const fontViolated = { color: { argb: 'FF9C0006' }, bold: true };
                if (isValViolated(row, 'ft_min')) {
                    const c = excelRow.getCell(10);
                    c.fill = fillViolated;
                    c.font = fontViolated;
                }
                if (isValViolated(row, 'ft_max')) {
                    const c = excelRow.getCell(11);
                    c.fill = fillViolated;
                    c.font = fontViolated;
                }
                if (isValViolated(row, 'qa_min')) {
                    const c = excelRow.getCell(12);
                    c.fill = fillViolated;
                    c.font = fontViolated;
                }
                if (isValViolated(row, 'qa_max')) {
                    const c = excelRow.getCell(13);
                    c.fill = fillViolated;
                    c.font = fontViolated;
                }
                // Highlight status column
                const statusCell = excelRow.getCell(15);
                if (row.status === 'out_of_spec') {
                    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
                    statusCell.font = { color: { argb: 'FF9C0006' }, bold: true };
                }
                else if (row.status === 'warning') {
                    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
                    statusCell.font = { color: { argb: 'FF9C6500' }, bold: true };
                }
                else if (row.status === 'normal') {
                    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
                    statusCell.font = { color: { argb: 'FF006100' }, bold: true };
                }
                else if (row.status === 'unmapped') {
                    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
                    statusCell.font = { color: { argb: 'FF475569' } };
                }
            }
        });
        // ═══════════════════════════════════════
        // SHEET 2: Param
        // ═══════════════════════════════════════
        const ws2 = workbook.addWorksheet('Param');
        const showQa = hasQaData.value;
        const paramHeaders = [
            '#',
            'Function',
            'Param',
            'Min',
            'Max',
            'Unit',
            'SWBin',
            'HWBin'
        ];
        if (showQa) {
            paramHeaders.push('QA_MIN', 'QA_MAX');
        }
        const headerRow2 = ws2.addRow(paramHeaders);
        headerRow2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow2.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow2.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4F81BD' }
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
            };
        });
        params.value.forEach(p => {
            const rowData = [
                p.row_no,
                p.function || '',
                p.symbol || '',
                fmtLimit(p.min),
                fmtLimit(p.max),
                p.unit || '',
                p.sw_bin ?? '',
                p.hw_bin ?? ''
            ];
            if (showQa) {
                rowData.push(fmtLimit(p.qa_min), fmtLimit(p.qa_max));
            }
            const excelRow = ws2.addRow(rowData);
            excelRow.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                };
                if ([1, 4, 5, 6, 7, 8, 9, 10].includes(colNumber)) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
                else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                }
            });
            if (p.is_qa) {
                excelRow.eachCell((cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE0F2FE' }
                    };
                });
            }
        });
        // ═══════════════════════════════════════
        // SHEET 3: Summary
        // ═══════════════════════════════════════
        const ws3 = workbook.addWorksheet('Summary');
        const summaryHeaders = ['SWBin', 'HWBin', 'Bin Name', 'SBL管控'];
        const headerRow3 = ws3.addRow(summaryHeaders);
        headerRow3.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow3.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow3.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4F81BD' }
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
            };
        });
        displaySummaryRows.value.forEach((s) => {
            const rowData = [
                s.sw_bin ?? '',
                s.hw_bin ?? '',
                s.bin_name || '',
                sblLimits.value[s.sw_bin] ?? ''
            ];
            const excelRow = ws3.addRow(rowData);
            excelRow.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                };
                if ([1, 2, 4].includes(colNumber)) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
                else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                }
            });
        });
        [ws1, ws2, ws3].forEach(ws => {
            if (ws.columns) {
                ws.columns.forEach((col) => {
                    if (col) {
                        let maxLen = 0;
                        col.eachCell({ includeEmpty: true }, (cell) => {
                            const valStr = cell.value ? String(cell.value) : '';
                            const rowObj = ws.getRow(cell.row);
                            if (rowObj && rowObj.isCategory) {
                                return;
                            }
                            if (valStr.length > maxLen) {
                                maxLen = valStr.length;
                            }
                        });
                        col.width = Math.max(12, Math.min(40, maxLen + 4));
                    }
                });
            }
        });
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const progVer = currentPgs.value?.program_version || 'Program';
        const filename = `${productName.value}_${progVer}_Report_${new Date().getTime()}.xlsx`;
        saveAs(blob, filename);
    }
    catch (err) {
        alert('导出失败: ' + (err?.message || err));
    }
    finally {
        loading.value = false;
    }
}
const cppFile = ref(null);
const vsCppFile = ref(null);
const cppLoading = ref(false);
const cppError = ref('');
const cppLeftPane = ref(null);
const cppRightPane = ref(null);
const cppReadonlyHost = ref(null);
const cppEditorHost = ref(null);
const hoveredCppRowKey = ref('');
const highlightedCppLineNo = ref(null);
const activeCppFunctionName = ref('');
const viCheckEnabled = ref(false);
const cppEditMode = ref(false);
const cppModifiedContent = ref('');
const cppNavWidth = ref(loadCppNavWidth());
let cppSyncScrollFrame = 0;
let cppLineHighlightTimer = null;
let cppReadonlyView = null;
let cppModifyView = null;
let syncingFromCodeMirror = false;
let resizingCppNav = false;
const setCmHighlightLine = StateEffect.define();
const cmHighlightLineField = StateField.define({
    create() {
        return Decoration.none;
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setCmHighlightLine)) {
                const lineNo = effect.value;
                if (!lineNo || lineNo < 1 || lineNo > tr.state.doc.lines)
                    return Decoration.none;
                const line = tr.state.doc.line(lineNo);
                return Decoration.set([
                    Decoration.line({ class: 'cm-line-jump' }).range(line.from),
                ]);
            }
        }
        return value.map(tr.changes);
    },
    provide: field => EditorView.decorations.from(field),
});
// ─── VS State ───
const vsMode = ref(false);
const vsTargetSource = ref('pgm');
const vsTargetId = ref('');
const vsLoading = ref(false);
const vsToggleBusy = ref(false);
const vsParams = ref([]);
const vsSummary = ref([]);
const vsFilter = reactive({ added: false, removed: false, loose: false, tight: false, diff: false });
// ─── Computed ───
const otherPgsList = computed(() => pgsList.value.filter(p => {
    if (p.id === currentId.value || p.parse_status !== 'ok')
        return false;
    if (isDataProgram.value) {
        return (p.tester ?? '') === (currentPgs.value?.tester ?? '');
    }
    return true;
}));
const otherDataProgramList = computed(() => {
    const sourceList = isDataProgram.value ? pgsList.value : dataProgramList.value;
    return sourceList.filter(p => {
        if (p.id === currentId.value || p.parse_status !== 'ok')
            return false;
        if (isDataProgram.value) {
            return (p.tester ?? '') === (currentPgs.value?.tester ?? '');
        }
        return true;
    });
});
const vsProgramList = computed(() => vsTargetSource.value === 'data' ? otherDataProgramList.value : otherPgsList.value);
const vsTargetPgs = computed(() => vsProgramList.value.find(p => p.id === vsTargetId.value) ?? null);
const cppOverlayLoading = computed(() => tab.value === 'cpp' && (cppLoading.value || vsLoading.value));
const cppLoadingStage = computed(() => {
    if (vsLoading.value)
        return 'Loading compare data...';
    if (cppLoading.value)
        return 'Loading source/test.cpp...';
    return '';
});
const cppDisplayPath = computed(() => cppEditMode.value ? 'source/Test_Modify.cpp' : (cppFile.value?.path ?? 'source/test.cpp'));
const cppLayoutStyle = computed(() => ({
    '--cpp-nav-width': `${cppNavWidth.value}px`,
}));
const cppEditorLineNumbers = computed(() => Array.from({ length: Math.max(1, cppLines.value.length) }, (_v, idx) => idx + 1));
const cppEditorHeight = computed(() => `${cppEditorLineNumbers.value.length * 18 + 12}px`);
const cppEditorHighlightStyle = computed(() => {
    if (!highlightedCppLineNo.value)
        return {};
    return { top: `${6 + (highlightedCppLineNo.value - 1) * 18}px` };
});
const cppEditorHighlightRows = computed(() => cppLines.value.map(line => ({
    no: line.no,
    tokens: highlightCppLine(line.text),
})));
function pgsProgramName(pgs) {
    const rawName = String(pgs?.program_version ?? pgs?.filename ?? '');
    return rawName.replace(/\.[^.]+$/, '');
}
function normalizedProgramName(pgs) {
    return pgsProgramName(pgs).trim().toUpperCase();
}
function extractProgramVersionInfo(pgs) {
    const name = pgsProgramName(pgs);
    const match = name.match(/^(.*)_V(\d+)(?:$|_.*$)/i);
    const prefix = match?.[1];
    const versionText = match?.[2];
    if (!prefix || !versionText)
        return null;
    const version = Number(versionText);
    if (!Number.isFinite(version))
        return null;
    return { prefix: prefix.toUpperCase(), version };
}
const defaultPgmVsId = computed(() => {
    const currentInfo = extractProgramVersionInfo(currentPgs.value);
    if (!currentInfo) {
        return otherPgsList.value[0]?.id ?? null;
    }
    let next = null;
    let prev = null;
    for (const pgs of otherPgsList.value) {
        const info = extractProgramVersionInfo(pgs);
        if (!info ||
            info.prefix !== currentInfo.prefix) {
            continue;
        }
        if (info.version > currentInfo.version && (!next || info.version < next.version)) {
            next = { id: pgs.id, version: info.version };
        }
        if (info.version < currentInfo.version && (!prev || info.version > prev.version)) {
            prev = { id: pgs.id, version: info.version };
        }
    }
    return next?.id ?? prev?.id ?? otherPgsList.value[0]?.id ?? null;
});
const defaultDataVsId = computed(() => {
    const currentName = normalizedProgramName(currentPgs.value);
    if (!currentName)
        return otherDataProgramList.value[0]?.id ?? null;
    const sameName = otherDataProgramList.value.find(p => normalizedProgramName(p) === currentName);
    return sameName?.id ?? otherDataProgramList.value[0]?.id ?? null;
});
const hasQaData = computed(() => params.value.some(p => p.is_qa === true || p.qa_min != null || p.qa_max != null));
const hasNonBin4QaAlert = computed(() => params.value.some(p => {
    const qaSwBin = p.is_qa ? p.sw_bin : p.qa_sw_bin;
    if (qaSwBin == null || qaSwBin === '')
        return false;
    return Number(qaSwBin) !== 4;
}));
function swBinSortValue(row) {
    const n = Number(row?.sw_bin);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
function sortSummaryRows(rows) {
    return [...rows].sort((a, b) => {
        const aSw = swBinSortValue(a);
        const bSw = swBinSortValue(b);
        if (aSw !== bSw)
            return aSw - bSw;
        return String(a?.sw_bin ?? '').localeCompare(String(b?.sw_bin ?? ''));
    });
}
function withBaseSummaryBins(rows) {
    const baseBins = [
        { sw_bin: 1, hw_bin: 1, bin_name: 'pass' },
        { sw_bin: 2, hw_bin: 2, bin_name: 'DPAT_PASS' },
        { sw_bin: 3, hw_bin: 3, bin_name: 'FAIL' },
    ];
    const existing = new Set(rows.map(row => String(row?.sw_bin)));
    return [
        ...baseBins.filter(row => !existing.has(String(row.sw_bin))),
        ...rows,
    ];
}
function summaryMaxSw(rows) {
    const values = rows
        .map(row => Number(row?.sw_bin))
        .filter(value => Number.isFinite(value));
    return values.length ? Math.max(...values) : 0;
}
function expandSummaryRows(rows, maxSw = summaryMaxSw(rows)) {
    const bySw = new Map(rows.map(row => [String(row?.sw_bin), row]));
    const expanded = [];
    for (let sw = 1; sw <= maxSw; sw += 1) {
        const row = bySw.get(String(sw));
        expanded.push({
            sw_bin: sw,
            hw_bin: row?.hw_bin ?? sw,
            bin_name: row?.bin_name ?? '',
        });
    }
    return expanded;
}
const sortedSummary = computed(() => sortSummaryRows(withBaseSummaryBins(summary.value)));
const sortedVsSummary = computed(() => sortSummaryRows(withBaseSummaryBins(vsSummary.value)));
const dataStandardSummaryRows = computed(() => dataSummaryStandard.value?.rows ?? []);
const dataExpandedSummaryRows = computed(() => expandSummaryRows(summary.value));
const displaySummaryRows = computed(() => {
    if (isDataProgram.value && dataSummaryStandard.value?.mode === 'pgm') {
        return dataStandardSummaryRows.value.map((row) => row.left).filter(Boolean);
    }
    if (isDataProgram.value && dataSummaryStandard.value?.mode === 'expanded') {
        return dataExpandedSummaryRows.value;
    }
    return sortedSummary.value;
});
function cppGlobalCache() {
    const w = window;
    if (!w.__pgsCppCache) {
        w.__pgsCppCache = {
            files: new Map(),
            displayRows: new Map(),
            modifiedFiles: new Map(),
        };
    }
    if (!w.__pgsCppCache.files) {
        w.__pgsCppCache.files = new Map();
    }
    if (!w.__pgsCppCache.displayRows) {
        w.__pgsCppCache.displayRows = new Map();
    }
    if (!w.__pgsCppCache.modifiedFiles) {
        w.__pgsCppCache.modifiedFiles = new Map();
    }
    return w.__pgsCppCache;
}
const cppCache = cppGlobalCache();
const cppFileCache = cppCache.files;
const cppDisplayRowsCache = cppCache.displayRows;
const cppModifiedFileCache = cppCache.modifiedFiles;
function loadCppNavWidth() {
    const raw = window.localStorage.getItem('pgs-cpp-nav-width');
    const width = Number(raw);
    if (!Number.isFinite(width))
        return 220;
    return Math.min(420, Math.max(170, width));
}
function startCppNavResize(event) {
    resizingCppNav = true;
    const startX = event.clientX;
    const startWidth = cppNavWidth.value;
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    target?.setPointerCapture?.(pointerId);
    const move = (moveEvent) => {
        if (!resizingCppNav)
            return;
        const nextWidth = Math.min(420, Math.max(170, startWidth + moveEvent.clientX - startX));
        cppNavWidth.value = nextWidth;
    };
    const stop = () => {
        resizingCppNav = false;
        window.localStorage.setItem('pgs-cpp-nav-width', String(Math.round(cppNavWidth.value)));
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
}
function cppCodeMirrorExtensions(editable) {
    return [
        basicSetup,
        cpp(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        cmHighlightLineField,
        EditorView.lineWrapping,
        EditorView.theme({
            '&': {
                height: '100%',
                fontSize: '12px',
                backgroundColor: '#ffffff',
            },
            '.cm-scroller': {
                fontFamily: 'Consolas, "Courier New", monospace',
                lineHeight: '18px',
            },
            '.cm-content': {
                minHeight: '100%',
            },
            '.cm-gutters': {
                backgroundColor: '#f1f5f9',
                color: '#94a3b8',
                borderRight: '1px solid #e2e8f0',
            },
            '.cm-activeLineGutter': {
                backgroundColor: '#dbeafe',
                color: '#1d4ed8',
            },
        }),
        ...(editable
            ? [
                EditorView.updateListener.of(update => {
                    if (!update.docChanged)
                        return;
                    const nextContent = update.state.doc.toString();
                    syncingFromCodeMirror = true;
                    cppModifiedContent.value = nextContent;
                    cppModifiedFileCache.set(currentId.value, nextContent);
                    viCheckEnabled.value = false;
                    cppDisplayRowsCache.clear();
                    syncingFromCodeMirror = false;
                }),
            ]
            : [
                EditorState.readOnly.of(true),
                EditorView.editable.of(false),
            ]),
    ];
}
function destroyCppCodeMirrorViews() {
    cppReadonlyView?.destroy();
    cppModifyView?.destroy();
    cppReadonlyView = null;
    cppModifyView = null;
}
function createCppCodeMirrorView(host, content, editable) {
    return new EditorView({
        parent: host,
        state: EditorState.create({
            doc: content,
            extensions: cppCodeMirrorExtensions(editable),
        }),
    });
}
async function refreshCppCodeMirrorView() {
    await nextTick();
    if (tab.value !== 'cpp')
        return;
    if (cppEditMode.value) {
        cppReadonlyView?.destroy();
        cppReadonlyView = null;
        if (cppEditorHost.value) {
            if (!cppModifyView || cppModifyView.dom.parentElement !== cppEditorHost.value) {
                cppModifyView?.destroy();
                cppModifyView = createCppCodeMirrorView(cppEditorHost.value, cppModifiedContent.value, true);
            }
            updateCodeMirrorDoc(cppModifyView, cppModifiedContent.value);
            applyCodeMirrorHighlight(highlightedCppLineNo.value);
        }
        return;
    }
    cppModifyView?.destroy();
    cppModifyView = null;
    if (vsMode.value && vsTargetId.value) {
        cppReadonlyView?.destroy();
        cppReadonlyView = null;
        return;
    }
    if (cppReadonlyHost.value) {
        const content = String(cppFile.value?.content ?? '');
        if (!cppReadonlyView || cppReadonlyView.dom.parentElement !== cppReadonlyHost.value) {
            cppReadonlyView?.destroy();
            cppReadonlyView = createCppCodeMirrorView(cppReadonlyHost.value, content, false);
        }
        updateCodeMirrorDoc(cppReadonlyView, content);
        applyCodeMirrorHighlight(highlightedCppLineNo.value);
    }
}
function updateCodeMirrorDoc(view, content) {
    if (!view || view.state.doc.toString() === content)
        return;
    view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
    });
}
function applyCodeMirrorHighlight(lineNo) {
    for (const view of [cppReadonlyView, cppModifyView]) {
        if (!view)
            continue;
        view.dispatch({ effects: setCmHighlightLine.of(lineNo) });
    }
}
const cppKeywords = new Set([
    'alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const',
    'constexpr', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit',
    'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long',
    'namespace', 'new', 'nullptr', 'operator', 'private', 'protected', 'public', 'return',
    'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'throw',
    'true', 'try', 'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void',
    'volatile', 'while',
]);
function tokenizeCppSegment(segment) {
    const tokens = [];
    const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[uUlLfF]*\b)|(\b[A-Za-z_]\w*\b)|(\s+|.)/g;
    let match;
    while ((match = pattern.exec(segment))) {
        const text = match[0];
        if (match[1]) {
            tokens.push({ text, type: 'string' });
        }
        else if (match[2]) {
            tokens.push({ text, type: 'number' });
        }
        else if (match[3]) {
            tokens.push({ text, type: cppKeywords.has(text) ? 'keyword' : 'plain' });
        }
        else {
            tokens.push({ text, type: 'plain' });
        }
    }
    return tokens;
}
function highlightCppLine(text) {
    if (!text)
        return [{ text: ' ', type: 'plain' }];
    const trimmed = text.trimStart();
    if (trimmed.startsWith('#'))
        return [{ text, type: 'macro' }];
    const commentIdx = text.indexOf('//');
    if (commentIdx >= 0) {
        return [
            ...tokenizeCppSegment(text.slice(0, commentIdx)),
            { text: text.slice(commentIdx), type: 'comment' },
        ];
    }
    return tokenizeCppSegment(text);
}
function isActiveCppFunction(functionName) {
    return Boolean(functionName && activeCppFunctionName.value === functionName);
}
function cppLineTokens(text, functionName) {
    if (!isActiveCppFunction(functionName)) {
        return [{ text: text || ' ', type: 'plain' }];
    }
    return highlightCppLine(text);
}
function toCppLines(content) {
    if (!content)
        return [];
    return content.split(/\r?\n/).map((text, idx) => ({ no: idx + 1, text }));
}
const cppLines = computed(() => toCppLines(cppEditMode.value ? cppModifiedContent.value : cppFile.value?.content));
const vsCppLines = computed(() => toCppLines(vsCppFile.value?.content));
const paramCppFunctionNames = computed(() => {
    const seen = new Set();
    const names = [];
    for (const row of params.value) {
        const name = String(row?.function ?? '').trim();
        if (!name || seen.has(name))
            continue;
        seen.add(name);
        names.push(name);
    }
    return names;
});
function parseDutFunctionName(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('DUT_API'))
        return null;
    const beforeParen = trimmed.split('(')[0]?.trim();
    if (!beforeParen)
        return null;
    const parts = beforeParen.split(/\s+/);
    const tail = parts[parts.length - 1] ?? '';
    const match = tail.match(/([A-Za-z_]\w*)$/);
    return match?.[1] ?? null;
}
function parseCppClassFunctionName(text) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*'))
        return null;
    const match = trimmed.match(/^(?:[A-Za-z_]\w*(?:::[A-Za-z_]\w*)?[\w:<>,\s*&~]*\s+)?([A-Za-z_]\w*)::([A-Za-z_]\w*)\s*\(/);
    const className = match?.[1] ?? '';
    if (['std', 'OFCStringUtils', 'rdk', 'ATCP_Base', 'Ips_Library_Base'].includes(className))
        return null;
    return match?.[2] ?? null;
}
function parseCppFunctions(lines) {
    const starts = [];
    for (let idx = 0; idx < lines.length; idx += 1) {
        const name = parseDutFunctionName(lines[idx].text) ?? parseCppClassFunctionName(lines[idx].text);
        if (name)
            starts.push({ name, idx, line: lines[idx].no });
    }
    return starts.map((fn, idx) => ({
        index: idx + 1,
        name: fn.name,
        line: fn.line,
        start: fn.idx,
        end: (starts[idx + 1]?.idx ?? lines.length) - 1,
    }));
}
const cppFunctions = computed(() => parseCppFunctions(cppLines.value));
const vsCppFunctions = computed(() => parseCppFunctions(vsCppLines.value));
function functionMap(functions) {
    const map = new Map();
    for (const fn of functions) {
        if (!map.has(fn.name))
            map.set(fn.name, fn);
    }
    return map;
}
function navigationFunctions(sourceFunctions, paramNames) {
    if (!paramNames.length)
        return sourceFunctions;
    const sourceMap = functionMap(sourceFunctions);
    return paramNames.map((name, idx) => {
        const source = sourceMap.get(name);
        return source
            ? { ...source, index: idx + 1 }
            : { index: idx + 1, name, line: 0, start: -1, end: -1 };
    });
}
const cppNavigationFunctions = computed(() => navigationFunctions(cppFunctions.value, paramCppFunctionNames.value));
function nonBlankKey(line) {
    return line.text.trim().replace(/\s+/g, ' ');
}
function functionLines(lines, fn) {
    if (fn.start < 0 || fn.end < fn.start)
        return [];
    return lines.slice(fn.start, fn.end + 1);
}
function stripCppComment(text) {
    return text.split('//')[0] ?? '';
}
function normalizeCppNumericLiteral(text) {
    return text
        .trim()
        .replace(/[fFuUlL]+$/g, '');
}
function parseCppNumber(text, env) {
    if (!text)
        return null;
    const cleaned = normalizeCppNumericLiteral(text);
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : evaluateCppNumericExpression(cleaned, env);
}
function evaluateCppNumericExpression(text, env) {
    if (!text)
        return null;
    let expr = normalizeCppNumericLiteral(text)
        .replace(/\b([0-9]+(?:\.[0-9]+)?(?:e[+-]?\d+)?)\s*(UA|U?MA|MV|V|A)\b/gi, (_m, num, unit) => {
        const base = Number(num);
        if (!Number.isFinite(base))
            return 'NaN';
        const upperUnit = String(unit).toUpperCase();
        if (upperUnit === 'MV')
            return String(base / 1000);
        if (upperUnit === 'UA')
            return String(base / 1000000);
        if (upperUnit === 'MA' || upperUnit === 'UMA')
            return String(base / 1000);
        return String(base);
    });
    expr = expr.replace(/\b[A-Za-z_]\w*(?:::[A-Za-z_]\w*)?(?:\.[A-Za-z_]\w*)?\b/g, name => {
        const direct = env?.get(name);
        if (direct != null)
            return String(direct);
        const tail = name.split(/::|\./).pop() ?? name;
        const tailValue = env?.get(tail);
        return tailValue != null ? String(tailValue) : 'NaN';
    });
    if (!/^[\dNaInfityeE+\-*/().\s]+$/.test(expr))
        return null;
    try {
        const result = Function(`"use strict"; return (${expr});`)();
        return Number.isFinite(result) ? Number(result) : null;
    }
    catch {
        return null;
    }
}
function updateCppValueEnvFromLine(env, line) {
    const code = stripCppComment(line.text).trim();
    if (!code)
        return;
    const defineMatch = code.match(/^#\s*define\s+([A-Za-z_]\w*)\s+(.+)$/);
    if (defineMatch) {
        const value = evaluateCppNumericExpression(defineMatch[2], env);
        if (value != null)
            env.set(defineMatch[1], value);
        return;
    }
    const assignMatch = code.match(/^(?:static\s+)?(?:const\s+)?(?:(?:double|float|int|long|short|auto|UINT|ULONG|WORD|DWORD|BOOL)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*=\s*([^;]+);/);
    if (assignMatch && !/[=!<>]=/.test(code)) {
        const value = evaluateCppNumericExpression(assignMatch[2], env);
        if (value != null)
            env.set(assignMatch[1], value);
    }
}
function trimViNumber(value) {
    if (value === 0)
        return '0';
    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) {
        return Number(value.toPrecision(6)).toString();
    }
    return Number(value.toPrecision(6)).toString();
}
function formatViVoltage(value) {
    if (value == null)
        return '-';
    return `${trimViNumber(value)}V`;
}
function formatViCurrent(value) {
    if (value == null)
        return '-';
    if (Math.abs(value) > 0 && Math.abs(value) < 0.01) {
        return `${trimViNumber(value * 1000)}mA`;
    }
    return `${trimViNumber(value)}A`;
}
function parseRangeValue(text) {
    if (!text)
        return null;
    const upper = text.trim().toUpperCase();
    const match = upper.match(/_([0-9]+(?:\.[0-9]+)?)(U?MA|UA|MV|V|A)\b/);
    if (!match)
        return null;
    const base = Number(match[1]);
    if (!Number.isFinite(base))
        return null;
    const unit = match[2];
    if (unit === 'MV')
        return base / 1000;
    if (unit === 'UA')
        return base / 1000000;
    if (unit === 'MA' || unit === 'UMA')
        return base / 1000;
    return base;
}
function parseSts8300RangeValue(text, kind, env) {
    if (!text)
        return null;
    const numeric = parseCppNumber(text, env);
    if (numeric != null)
        return Math.abs(numeric);
    const upper = text.trim().toUpperCase();
    const unitPattern = kind === 'voltage'
        ? /([0-9]+(?:\.[0-9]+)?)\s*(MV|V)\b/
        : /([0-9]+(?:\.[0-9]+)?)\s*(UA|U?MA|A)\b/;
    const match = upper.match(unitPattern);
    if (!match)
        return parseRangeValue(text);
    const base = Number(match[1]);
    if (!Number.isFinite(base))
        return null;
    const unit = match[2];
    if (unit === 'MV')
        return base / 1000;
    if (unit === 'UA')
        return base / 1000000;
    if (unit === 'MA' || unit === 'UMA')
        return base / 1000;
    return base;
}
function splitSetArgs(text) {
    const args = [];
    let current = '';
    let depth = 0;
    for (const char of text) {
        if (char === '(')
            depth += 1;
        if (char === ')')
            depth = Math.max(0, depth - 1);
        if (char === ',' && depth === 0) {
            args.push(current.trim());
            current = '';
        }
        else {
            current += char;
        }
    }
    if (current.trim())
        args.push(current.trim());
    return args;
}
function detectCppTesterParser(lines) {
    return lines.some(line => /\b(?:DCM|ACM)\b/i.test(line.text)) ? 'sts8300' : 'sts8200';
}
const activeCppTesterParser = computed(() => detectCppTesterParser(cppLines.value));
function buildViSetCall(source, line, mode, valueText, voltageRangeText, currentRangeText, relayText, env) {
    return {
        source: source.toUpperCase(),
        line: line.no,
        mode: mode.trim().toUpperCase(),
        value: parseCppNumber(valueText, env),
        valueText: valueText ?? '',
        voltageRange: parseSts8300RangeValue(voltageRangeText, 'voltage', env),
        voltageRangeText: voltageRangeText ?? '',
        currentRange: parseSts8300RangeValue(currentRangeText, 'current', env),
        currentRangeText: currentRangeText ?? '',
        relay: normalizeRelayName(relayText),
        raw: line.text.trim(),
    };
}
function normalizeRelayName(text) {
    const upper = String(text ?? '').trim().toUpperCase();
    if (/\b[A-Z0-9_]*RELAY_SENSE_ON\b/.test(upper))
        return 'RELAY_SENSE_ON';
    if (/\b[A-Z0-9_]*RELAY_OFF\b/.test(upper))
        return 'RELAY_OFF';
    if (/\b[A-Z0-9_]*RELAY_ON\b/.test(upper))
        return 'RELAY_ON';
    return upper;
}
function normalizeSts8300Mode(method, args) {
    const upperMethod = method.toUpperCase();
    if (upperMethod.includes('CURR') ||
        upperMethod.includes('CURRENT') ||
        upperMethod === 'FI' ||
        /\b(?:SET|FORCE)?I\b/.test(upperMethod))
        return 'FI';
    if (upperMethod.includes('VOLT') ||
        upperMethod.includes('VOLTAGE') ||
        upperMethod.includes('AMPL') ||
        upperMethod === 'FV' ||
        /\b(?:SET|FORCE)?V\b/.test(upperMethod))
        return 'FV';
    return (args[0] ?? '').trim().toUpperCase();
}
function normalizeSts8300Relay(args) {
    const explicit = args.find(arg => /\bRELAY_(?:ON|OFF|SENSE_ON)\b/i.test(arg));
    if (explicit)
        return normalizeRelayName(explicit);
    const joined = args.join(',');
    if (/\b(?:ON|CONNECT|CLOSE|ENABLE)\b/i.test(joined))
        return 'RELAY_ON';
    if (/\b(?:OFF|DISCONNECT|OPEN|DISABLE)\b/i.test(joined))
        return 'RELAY_OFF';
    return 'RELAY_ON';
}
function isSts8300SetMethod(method) {
    const upperMethod = method.toUpperCase();
    return upperMethod === 'SET' ||
        upperMethod === 'FV' ||
        upperMethod === 'FI' ||
        upperMethod.includes('VOLT') ||
        upperMethod.includes('CURR') ||
        upperMethod.includes('AMPL') ||
        /\b(?:SET|FORCE)?[VI]\b/.test(upperMethod) ||
        upperMethod.includes('FORCE');
}
function parseSts8200ViSetCall(line, env) {
    const code = stripCppComment(line.text);
    const match = code.match(/\b([A-Za-z_]\w*)\s*\.\s*Set\s*\((.*)\)\s*;/);
    if (!match)
        return null;
    const args = splitSetArgs(match[2] ?? '');
    if (args.length < 5)
        return null;
    return buildViSetCall(match[1] ?? '', line, args[0] ?? '', args[1], args[2], args[3], args[4], env);
}
function parseSts8300ViSetCall(line, env) {
    const code = stripCppComment(line.text);
    const methodCall = code.match(/\b(?:(DCM|ACM)\s*\.\s*)?([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*\((.*)\)\s*;/i);
    const globalCall = code.match(/\b(DCM|ACM)\s*\.\s*([A-Za-z_]\w*)\s*\((.*)\)\s*;/i);
    if (globalCall) {
        const method = globalCall[2] ?? '';
        const args = splitSetArgs(globalCall[3] ?? '');
        const upperMethod = method.toUpperCase();
        if (!isSts8300SetMethod(method))
            return null;
        const mode = upperMethod === 'SET' ? (args[1] ?? args[0] ?? '') : normalizeSts8300Mode(method, args);
        const source = args[0] ?? globalCall[1] ?? '';
        const valueIdx = upperMethod === 'SET' ? 2 : 1;
        return buildViSetCall(source.replace(/^["']|["']$/g, ''), line, mode, args[valueIdx], args[valueIdx + 1], args[valueIdx + 2], normalizeSts8300Relay(args), env);
    }
    if (methodCall) {
        const instrument = (methodCall[1] ?? '').toUpperCase();
        const objectName = methodCall[2] ?? '';
        const method = methodCall[3] ?? '';
        const args = splitSetArgs(methodCall[4] ?? '');
        const upperMethod = method.toUpperCase();
        if (!instrument && !/\b(?:DCM|ACM)\b/i.test(objectName + upperMethod)) {
            return parseSts8200ViSetCall(line, env);
        }
        if (!isSts8300SetMethod(method))
            return null;
        const mode = upperMethod === 'SET' ? (args[0] ?? '') : normalizeSts8300Mode(method, args);
        const valueIdx = upperMethod === 'SET' ? 1 : 0;
        return buildViSetCall(objectName, line, mode, args[valueIdx], args[valueIdx + 1], args[valueIdx + 2], normalizeSts8300Relay(args), env);
    }
    return parseSts8200ViSetCall(line, env);
}
function parseViSetCall(line, parser, env) {
    return parser === 'sts8300'
        ? parseSts8300ViSetCall(line, env)
        : parseSts8200ViSetCall(line, env);
}
function isViRelayOn(relay) {
    return normalizeRelayName(relay) === 'RELAY_ON' || normalizeRelayName(relay) === 'RELAY_SENSE_ON';
}
function isViRelayOff(relay) {
    return normalizeRelayName(relay) === 'RELAY_OFF';
}
function isViZeroCall(call) {
    return (call.mode === 'FV' || call.mode === 'FI') &&
        isViRelayOn(call.relay) &&
        call.value != null &&
        Math.abs(call.value) <= 1e-12;
}
function isViApplyCall(call) {
    return (call.mode === 'FV' || call.mode === 'FI') &&
        isViRelayOn(call.relay) &&
        call.value != null &&
        Math.abs(call.value) > 1e-12;
}
function callExceedsRange(call) {
    if (call.value == null)
        return null;
    if (call.mode === 'FV' && call.voltageRange != null && Math.abs(call.value) > call.voltageRange) {
        return `Line ${call.line}: voltage ${call.valueText} exceeds ${call.voltageRangeText}`;
    }
    if (call.mode === 'FI' && call.currentRange != null && Math.abs(call.value) > call.currentRange) {
        return `Line ${call.line}: current ${call.valueText} exceeds ${call.currentRangeText}`;
    }
    return null;
}
function callVoltageCandidate(call) {
    if (call.mode === 'FV')
        return call.value == null ? null : Math.abs(call.value);
    return null;
}
function callCurrentCandidate(call) {
    if (call.mode === 'FI')
        return call.value;
    return null;
}
function buildGlobalCppValueEnv(lines) {
    const env = new Map();
    const firstFunctionLine = cppFunctions.value[0]?.line ?? Number.MAX_SAFE_INTEGER;
    for (const line of lines) {
        if (line.no >= firstFunctionLine)
            break;
        updateCppValueEnvFromLine(env, line);
    }
    return env;
}
function analyzeViFunction(fn) {
    const parser = activeCppTesterParser.value;
    const env = new Map(buildGlobalCppValueEnv(cppLines.value));
    const calls = [];
    for (const line of functionLines(cppLines.value, fn)) {
        updateCppValueEnvFromLine(env, line);
        const call = parseViSetCall(line, parser, env);
        if (call)
            calls.push(call);
    }
    if (!calls.length)
        return null;
    const bySource = new Map();
    for (const call of calls) {
        if (!bySource.has(call.source))
            bySource.set(call.source, []);
        bySource.get(call.source).push(call);
    }
    const sources = [];
    for (const [source, sourceCalls] of bySource) {
        const messages = [];
        const rangeIssues = sourceCalls.map(callExceedsRange).filter((msg) => Boolean(msg));
        const hasRangeIssue = rangeIssues.length > 0;
        messages.push(...rangeIssues);
        const onSetCalls = sourceCalls.filter(call => (call.mode === 'FV' || call.mode === 'FI') &&
            isViRelayOn(call.relay) &&
            call.value != null);
        const applyCalls = sourceCalls.filter(isViApplyCall);
        const hasApply = applyCalls.length > 0;
        const hasZero = sourceCalls.some(isViZeroCall);
        const hasOff = sourceCalls.some(call => isViRelayOff(call.relay));
        const voltageCalls = onSetCalls.filter(call => callVoltageCandidate(call) != null);
        const maxVoltageCall = voltageCalls.reduce((best, call) => {
            const callVoltage = callVoltageCandidate(call);
            const bestVoltage = best ? callVoltageCandidate(best) : null;
            if (callVoltage != null && (bestVoltage == null || Math.abs(callVoltage) > Math.abs(bestVoltage)))
                return call;
            return best;
        }, null);
        const maxVoltage = maxVoltageCall == null ? null : callVoltageCandidate(maxVoltageCall);
        const currentCalls = onSetCalls.filter(call => callCurrentCandidate(call) != null);
        const maxCurrentCall = currentCalls.reduce((best, call) => {
            const callCurrent = callCurrentCandidate(call);
            const bestCurrent = best ? callCurrentCandidate(best) : null;
            if (callCurrent != null && (bestCurrent == null || Math.abs(callCurrent) > Math.abs(bestCurrent)))
                return call;
            return best;
        }, null);
        const maxCurrent = maxCurrentCall == null ? null : callCurrentCandidate(maxCurrentCall);
        const primaryApplyCall = (() => {
            if (maxVoltageCall && maxCurrentCall) {
                return Math.abs(callVoltageCandidate(maxVoltageCall) ?? 0) >= Math.abs(callCurrentCandidate(maxCurrentCall) ?? 0)
                    ? maxVoltageCall
                    : maxCurrentCall;
            }
            return maxVoltageCall ?? maxCurrentCall ?? applyCalls[0] ?? null;
        })();
        const zeroAfterPrimaryApply = primaryApplyCall
            ? sourceCalls.find(call => call.line > primaryApplyCall.line && isViZeroCall(call)) ?? null
            : sourceCalls.find(isViZeroCall) ?? null;
        const offAfterZero = zeroAfterPrimaryApply
            ? sourceCalls.find(call => call.line > zeroAfterPrimaryApply.line && isViRelayOff(call.relay)) ?? null
            : sourceCalls.find(call => isViRelayOff(call.relay)) ?? null;
        let missingZero = false;
        let missingOffAfterZero = false;
        for (const applyCall of applyCalls) {
            const zeroAfterApply = sourceCalls.find(call => call.line > applyCall.line && isViZeroCall(call));
            if (!zeroAfterApply) {
                missingZero = true;
                continue;
            }
            const offAfterZero = sourceCalls.find(call => call.line > zeroAfterApply.line && isViRelayOff(call.relay));
            if (!offAfterZero) {
                missingOffAfterZero = true;
            }
        }
        let status = 'ok';
        if (hasRangeIssue) {
            status = 'range';
        }
        else if (missingZero) {
            status = 'missing-zero';
        }
        else if (missingOffAfterZero) {
            status = 'missing-off';
            messages.push('Missing RELAY_OFF after zero');
        }
        else if (hasZero && !hasApply) {
            status = 'ok';
            messages.push('Zero with RELAY_ON only');
        }
        else if (hasApply) {
            messages.push('Apply -> zero -> off flow OK');
        }
        else {
            status = 'ok';
            messages.push('No non-zero apply detected');
        }
        sources.push({
            source,
            status,
            messages,
            calls: sourceCalls,
            maxVoltage,
            maxCurrent,
            maxVoltageLine: maxVoltageCall?.line ?? null,
            maxCurrentLine: maxCurrentCall?.line ?? null,
            applyLine: primaryApplyCall?.line ?? null,
            zeroLine: zeroAfterPrimaryApply?.line ?? null,
            offLine: offAfterZero?.line ?? null,
        });
    }
    return {
        functionName: fn.name,
        hasIssue: sources.some(source => source.status !== 'ok'),
        hasFlowIssue: sources.some(source => source.status === 'missing-zero' || source.status === 'missing-off'),
        hasRangeIssue: sources.some(source => source.status === 'range'),
        sources,
    };
}
const viCheckResults = computed(() => {
    if (!viCheckEnabled.value)
        return new Map();
    if (vsMode.value && Boolean(vsTargetId.value))
        return new Map();
    const result = new Map();
    for (const fn of cppFunctions.value) {
        const check = analyzeViFunction(fn);
        if (check)
            result.set(fn.name, check);
    }
    return result;
});
const activeViCheck = computed(() => viCheckResults.value.get(activeCppFunctionName.value) ?? null);
const isFirstCppFunctionActive = computed(() => Boolean(cppFunctions.value[0]?.name && activeCppFunctionName.value === cppFunctions.value[0].name));
const viSourceMaxSummary = computed(() => {
    const summary = new Map();
    for (const check of viCheckResults.value.values()) {
        for (const source of check.sources) {
            if (!summary.has(source.source)) {
                summary.set(source.source, {
                    source: source.source,
                    maxVoltage: source.maxVoltage,
                    maxCurrent: source.maxCurrent,
                    maxVoltageLine: source.maxVoltageLine,
                    maxCurrentLine: source.maxCurrentLine,
                });
                continue;
            }
            const existing = summary.get(source.source);
            if (source.maxVoltage != null &&
                (existing.maxVoltage == null || Math.abs(source.maxVoltage) > Math.abs(existing.maxVoltage))) {
                existing.maxVoltage = source.maxVoltage;
                existing.maxVoltageLine = source.maxVoltageLine;
            }
            if (source.maxCurrent != null &&
                (existing.maxCurrent == null || Math.abs(source.maxCurrent) > Math.abs(existing.maxCurrent))) {
                existing.maxCurrent = source.maxCurrent;
                existing.maxCurrentLine = source.maxCurrentLine;
            }
        }
    }
    return [...summary.values()].sort((a, b) => a.source.localeCompare(b.source));
});
async function runViCheck() {
    viCheckEnabled.value = true;
    await nextTick();
    const firstFunctionName = cppFunctions.value[0]?.name;
    if (firstFunctionName) {
        await scrollToCppFunction(firstFunctionName);
    }
}
function toggleCppEdit() {
    if (cppEditMode.value) {
        cppEditMode.value = false;
        viCheckEnabled.value = false;
        activeCppFunctionName.value = '';
        refreshCppCodeMirrorView();
        return;
    }
    const existing = cppModifiedFileCache.get(currentId.value);
    cppModifiedContent.value = existing ?? String(cppFile.value?.content ?? '');
    cppModifiedFileCache.set(currentId.value, cppModifiedContent.value);
    cppEditMode.value = true;
    viCheckEnabled.value = false;
    cppDisplayRowsCache.clear();
    refreshCppCodeMirrorView();
}
function onCppModifiedInput() {
    cppModifiedFileCache.set(currentId.value, cppModifiedContent.value);
    viCheckEnabled.value = false;
    cppDisplayRowsCache.clear();
}
function downloadModifiedCpp() {
    if (!cppEditMode.value || !cppModifiedContent.value)
        return;
    const blob = new Blob([cppModifiedContent.value], { type: 'text/x-c++src;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Test_Modify.cpp';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}
watch(cppModifiedContent, value => {
    if (cppEditMode.value) {
        cppModifiedFileCache.set(currentId.value, value);
        if (!syncingFromCodeMirror)
            updateCodeMirrorDoc(cppModifyView, value);
    }
});
watch(highlightedCppLineNo, lineNo => {
    applyCodeMirrorHighlight(lineNo);
});
function alignFunctionRows(funcName, leftLines, rightLines, keyPrefix) {
    const left = leftLines.filter(line => line.text.trim() !== '');
    const right = rightLines.filter(line => line.text.trim() !== '');
    const m = left.length;
    const n = right.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i -= 1) {
        for (let j = n - 1; j >= 0; j -= 1) {
            dp[i][j] = nonBlankKey(left[i]) === nonBlankKey(right[j])
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const rows = [];
    let i = 0;
    let j = 0;
    let row = 0;
    while (i < m || j < n) {
        const leftLine = i < m ? left[i] : null;
        const rightLine = j < n ? right[j] : null;
        if (leftLine && rightLine && nonBlankKey(leftLine) === nonBlankKey(rightLine)) {
            rows.push({ key: `${keyPrefix}-${row}`, funcName, left: leftLine, right: rightLine, diff: false });
            i += 1;
            j += 1;
        }
        else if (rightLine && (!leftLine || dp[i][j + 1] >= dp[i + 1][j])) {
            rows.push({ key: `${keyPrefix}-${row}`, funcName, left: null, right: rightLine, diff: true });
            j += 1;
        }
        else {
            rows.push({ key: `${keyPrefix}-${row}`, funcName, left: leftLine, right: null, diff: true });
            i += 1;
        }
        row += 1;
    }
    return rows;
}
function areFunctionsDifferent(leftFn, rightFn) {
    if (!rightFn)
        return true;
    const leftKeys = functionLines(cppLines.value, leftFn)
        .filter(line => line.text.trim() !== '')
        .map(nonBlankKey);
    const rightKeys = functionLines(vsCppLines.value, rightFn)
        .filter(line => line.text.trim() !== '')
        .map(nonBlankKey);
    if (leftKeys.length !== rightKeys.length)
        return true;
    return leftKeys.some((key, idx) => key !== rightKeys[idx]);
}
const cppOutline = computed(() => {
    const rightMap = functionMap(vsCppFunctions.value);
    const viResults = viCheckResults.value;
    return cppNavigationFunctions.value.map(fn => ({
        index: fn.index,
        name: fn.name,
        line: fn.line,
        mismatch: fn.line > 0 && vsMode.value && Boolean(vsTargetId.value)
            ? areFunctionsDifferent(fn, rightMap.get(fn.name))
            : false,
        viFlowIssue: viResults.get(fn.name)?.hasFlowIssue ?? false,
        viRangeIssue: viResults.get(fn.name)?.hasRangeIssue ?? false,
    }));
});
function lineFunctionNameMap(lines, functions) {
    const map = new Map();
    for (const fn of functions) {
        for (const line of lines.slice(fn.start, fn.end + 1)) {
            map.set(line.no, fn.name);
        }
    }
    return map;
}
const cppDisplayRows = computed(() => {
    if (!(vsMode.value && vsTargetId.value)) {
        const lineFuncMap = lineFunctionNameMap(cppLines.value, cppFunctions.value);
        return cppLines.value.map(line => ({
            key: `left-${line.no}`,
            funcName: lineFuncMap.get(line.no) ?? '',
            left: line,
            right: null,
            diff: false,
        }));
    }
    const leftLineCount = cppLines.value.length;
    const rightLineCount = vsCppLines.value.length;
    const canCacheRows = leftLineCount > 0 && rightLineCount > 0 && !cppEditMode.value;
    const cacheKey = `full-v3:${currentId.value}:${vsTargetId.value}:${leftLineCount}:${rightLineCount}`;
    const cachedRows = cppDisplayRowsCache.get(cacheKey);
    if (canCacheRows && cachedRows)
        return cachedRows;
    const rightMap = functionMap(vsCppFunctions.value);
    const rows = [];
    const firstFn = cppFunctions.value[0];
    const firstRightFn = vsCppFunctions.value[0];
    const preambleEnd = firstFn ? firstFn.start : cppLines.value.length;
    const rightPreambleEnd = firstRightFn ? firstRightFn.start : vsCppLines.value.length;
    rows.push(...alignFunctionRows('', cppLines.value.slice(0, preambleEnd), vsCppLines.value.slice(0, rightPreambleEnd), 'pre'));
    for (const fn of cppFunctions.value) {
        const rightFn = rightMap.get(fn.name);
        rows.push(...alignFunctionRows(fn.name, functionLines(cppLines.value, fn), rightFn ? functionLines(vsCppLines.value, rightFn) : [], `fn-${fn.index}-${fn.name}`));
    }
    const leftNames = new Set(cppFunctions.value.map(fn => fn.name));
    for (const fn of vsCppFunctions.value) {
        if (leftNames.has(fn.name))
            continue;
        rows.push(...alignFunctionRows(fn.name, [], functionLines(vsCppLines.value, fn), `right-only-${fn.index}-${fn.name}`));
    }
    if (canCacheRows) {
        cppDisplayRowsCache.set(cacheKey, rows);
    }
    return rows;
});
async function scrollToCppFunction(functionName) {
    activeCppFunctionName.value = functionName;
    await nextTick();
    const fn = cppFunctions.value.find(item => item.name === functionName);
    if (cppEditMode.value) {
        if (fn)
            scrollCppEditorToLine(fn.line);
        return;
    }
    if (vsMode.value && vsTargetId.value) {
        const leftTarget = findCppFunctionElement(cppLeftPane.value, 'left', functionName);
        const rightTarget = findCppFunctionElement(cppRightPane.value, 'right', functionName);
        scrollPaneToChild(cppLeftPane.value, leftTarget);
        scrollPaneToChild(cppRightPane.value, rightTarget);
        return;
    }
    if (fn)
        scrollCppEditorToLine(fn.line);
}
function findCppFunctionElement(pane, side, functionName) {
    if (!pane)
        return null;
    const attr = side === 'left' ? 'leftFunc' : 'rightFunc';
    return Array.from(pane.querySelectorAll('.cpp-line'))
        .find(item => item.dataset[attr] === functionName) ?? null;
}
function scrollPaneToChild(pane, child) {
    if (!pane || !child)
        return;
    pane.scrollTop = child.offsetTop;
}
async function scrollToCppLine(lineNo) {
    if (!lineNo)
        return;
    highlightedCppLineNo.value = lineNo;
    if (cppLineHighlightTimer != null)
        window.clearTimeout(cppLineHighlightTimer);
    cppLineHighlightTimer = window.setTimeout(() => {
        if (highlightedCppLineNo.value === lineNo)
            highlightedCppLineNo.value = null;
        cppLineHighlightTimer = null;
    }, 4000);
    await nextTick();
    if (cppEditMode.value || !(vsMode.value && vsTargetId.value)) {
        scrollCppEditorToLine(lineNo);
        return;
    }
    const leftTarget = cppLeftPane.value?.querySelector(`[data-left-line="${lineNo}"]`);
    leftTarget?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (cppLeftPane.value && cppRightPane.value) {
        requestAnimationFrame(() => {
            if (!cppLeftPane.value || !cppRightPane.value)
                return;
            cppRightPane.value.scrollTop = cppLeftPane.value.scrollTop;
            cppRightPane.value.scrollLeft = cppLeftPane.value.scrollLeft;
        });
    }
}
async function scrollToViMaxLine(lineNo) {
    if (!lineNo)
        return;
    await scrollToCppLine(lineNo);
}
function scrollCppEditorToLine(lineNo) {
    const view = cppEditMode.value ? cppModifyView : cppReadonlyView;
    if (!view || lineNo < 1 || lineNo > view.state.doc.lines)
        return;
    const line = view.state.doc.line(lineNo);
    const effects = [
        setCmHighlightLine.of(lineNo),
        EditorView.scrollIntoView(line.from, { y: 'start' }),
    ];
    view.dispatch({
        selection: { anchor: line.from },
        effects,
    });
    if (cppEditMode.value)
        view.focus();
}
function offsetForLine(content, lineNo) {
    if (lineNo <= 1)
        return 0;
    let offset = 0;
    let currentLine = 1;
    while (currentLine < lineNo && offset < content.length) {
        const nextNewline = content.indexOf('\n', offset);
        if (nextNewline < 0)
            return content.length;
        offset = nextNewline + 1;
        currentLine += 1;
    }
    return offset;
}
function syncCppScroll(source) {
    if (cppSyncScrollFrame)
        return;
    cppSyncScrollFrame = requestAnimationFrame(() => {
        cppSyncScrollFrame = 0;
        const left = cppLeftPane.value;
        const right = cppRightPane.value;
        if (!left || !right)
            return;
        const from = source === 'left' ? left : right;
        const to = source === 'left' ? right : left;
        to.scrollTop = from.scrollTop;
        to.scrollLeft = from.scrollLeft;
    });
}
function normalizedBinName(value) {
    return String(value ?? '').trim();
}
const summaryVsRows = computed(() => {
    if (!vsTargetId.value)
        return [];
    const maxSw = Math.max(summaryMaxSw(summary.value), summaryMaxSw(vsSummary.value));
    const leftRows = isDataProgram.value ? expandSummaryRows(summary.value, maxSw) : sortedSummary.value;
    const rightRows = (isDataProgram.value || vsTargetSource.value === 'data')
        ? expandSummaryRows(vsSummary.value, maxSw)
        : sortedVsSummary.value;
    const leftMap = new Map();
    const rightMap = new Map();
    leftRows.forEach(row => leftMap.set(String(row.sw_bin), row));
    rightRows.forEach(row => rightMap.set(String(row.sw_bin), row));
    const keys = [];
    const seen = new Set();
    for (const row of leftRows) {
        const key = String(row.sw_bin);
        if (!seen.has(key)) {
            keys.push(key);
            seen.add(key);
        }
    }
    for (const row of rightRows) {
        const key = String(row.sw_bin);
        if (!seen.has(key)) {
            keys.push(key);
            seen.add(key);
        }
    }
    return keys
        .sort((a, b) => {
        const aRow = leftMap.get(a) ?? rightMap.get(a);
        const bRow = leftMap.get(b) ?? rightMap.get(b);
        const aSw = swBinSortValue(aRow);
        const bSw = swBinSortValue(bRow);
        if (aSw !== bSw)
            return aSw - bSw;
        return a.localeCompare(b);
    })
        .map(key => {
        const left = leftMap.get(key);
        const right = rightMap.get(key);
        return {
            key,
            left: left ?? null,
            right: right ?? null,
        };
    });
});
function isSummaryBinNameChanged(row) {
    return !!row.left &&
        !!row.right &&
        normalizedBinName(row.left.bin_name) !== normalizedBinName(row.right.bin_name);
}
/**
 * QA行 row_no → 对应 FT 行（按 function 内顺序对齐：第 K 个 QA 行 ↔ 第 K 个 FT 行）
 * 可解决同一 function 有多行 FT/QA 的情况（symbol 不一定完全相同）
 */
const qaToFtMatch = computed(() => {
    const ftByFunc = new Map();
    const qaByFunc = new Map();
    for (const p of params.value) {
        if (!p.is_qa) {
            if (!ftByFunc.has(p.function))
                ftByFunc.set(p.function, []);
            ftByFunc.get(p.function).push(p);
        }
        else {
            if (!qaByFunc.has(p.function))
                qaByFunc.set(p.function, []);
            qaByFunc.get(p.function).push(p);
        }
    }
    const map = new Map(); // QA row_no → 对应 FT 行
    for (const [func, qaRows] of qaByFunc) {
        const ftRows = ftByFunc.get(func) ?? [];
        qaRows.forEach((qaRow, i) => {
            if (i < ftRows.length)
                map.set(qaRow.row_no, ftRows[i]);
        });
    }
    return map;
});
const filteredParams = computed(() => {
    let result = params.value;
    // 文本搜索过滤
    const q = paramFilter.value.trim().toLowerCase();
    if (q) {
        result = result.filter(p => (p.symbol ?? '').toLowerCase().includes(q) ||
            (p.function ?? '').toLowerCase().includes(q));
    }
    // QA 红色预警筛选（仅显示 QA 比 FT 更严的行）
    if (qaAlertFilter.value) {
        result = result.filter(p => {
            if (p.is_qa) {
                return isQaMinRedRow(p) || isQaMaxRedRow(p);
            }
            else {
                return isQaMinRedRef(p) || isQaMaxRedRef(p);
            }
        });
    }
    return result;
});
// ─── QA 红色预警逻辑 ───
/** 非QA行：QA_MIN 列 - qa_min > min 则报警（QA 下限比 FT 更严） */
function isQaMinRedRef(p) {
    if (p.qa_min == null || p.min == null)
        return false;
    return Number(p.qa_min) > Number(p.min);
}
/** 非QA行：QA_MAX 列 - qa_max < max 则报警（QA 上限比 FT 更严） */
function isQaMaxRedRef(p) {
    if (p.qa_max == null || p.max == null)
        return false;
    return Number(p.qa_max) < Number(p.max);
}
/** QA行：自身 min 比对应位置 FT 行的 min 更严 → 红色 */
function isQaMinRedRow(p) {
    const ft = qaToFtMatch.value.get(p.row_no);
    if (!ft || ft.min == null || p.min == null)
        return false;
    return Number(p.min) > Number(ft.min);
}
/** QA行：自身 max 比对应位置 FT 行的 max 更严 → 红色 */
function isQaMaxRedRow(p) {
    const ft = qaToFtMatch.value.get(p.row_no);
    if (!ft || ft.max == null || p.max == null)
        return false;
    return Number(p.max) < Number(ft.max);
}
function isQaStrictAlert(p) {
    return p.is_qa
        ? isQaMinRedRow(p) || isQaMaxRedRow(p)
        : isQaMinRedRef(p) || isQaMaxRedRef(p);
}
function qaSwBinForAlert(p) {
    return p.is_qa ? p.sw_bin : p.qa_sw_bin;
}
// ─── QA 与 FT 相同时淡紫色标识 ───
/** 非QA行：qa_min 与初测 min 相同 → 淡紫底色 */
function isQaMinSameRef(p) {
    if (p.qa_min == null || p.min == null)
        return false;
    return Number(p.qa_min) === Number(p.min);
}
/** 非QA行：qa_max 与初测 max 相同 → 淡紫底色 */
function isQaMaxSameRef(p) {
    if (p.qa_max == null || p.max == null)
        return false;
    return Number(p.qa_max) === Number(p.max);
}
/** QA行：自身 min 与对应位置 FT 行的 min 相同 → 淡紫底色 */
function isQaMinSameRow(p) {
    const ft = qaToFtMatch.value.get(p.row_no);
    if (!ft || ft.min == null || p.min == null)
        return false;
    return Number(p.min) === Number(ft.min);
}
/** QA行：自身 max 与对应位置 FT 行的 max 相同 → 淡紫底色 */
function isQaMaxSameRow(p) {
    const ft = qaToFtMatch.value.get(p.row_no);
    if (!ft || ft.max == null || p.max == null)
        return false;
    return Number(p.max) === Number(ft.max);
}
function numericRowNo(row) {
    const n = Number(row?.row_no);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
function normVal(val) {
    if (val == null || val === '')
        return null;
    const n = Number(val);
    if (isNaN(n))
        return String(val);
    const s = String(val).trim();
    const dotIdx = s.indexOf('.');
    let decPlaces = 0;
    if (dotIdx !== -1) {
        const eIdx = s.toLowerCase().indexOf('e');
        if (eIdx !== -1) {
            const base = s.slice(0, eIdx);
            const exp = parseInt(s.slice(eIdx + 1), 10);
            const baseDec = base.indexOf('.') !== -1 ? base.split('.')[1].length : 0;
            decPlaces = exp < 0 ? baseDec - exp : Math.max(0, baseDec - exp);
        }
        else {
            decPlaces = s.length - dotIdx - 1;
        }
    }
    if (decPlaces > 3) {
        return Math.round(n * 1000) / 1000;
    }
    return n;
}
const vsRows = computed(() => {
    if (!vsTargetId.value || !vsParams.value.length)
        return [];
    const rightQueues = new Map();
    for (const p of vsParams.value) {
        const key = p.symbol || p.param || '';
        if (!rightQueues.has(key))
            rightQueues.set(key, []);
        rightQueues.get(key).push(p);
    }
    for (const queue of rightQueues.values()) {
        queue.sort((a, b) => numericRowNo(a) - numericRowNo(b));
    }
    const makeRow = (key, left, right) => {
        let type = 'same';
        if (left && !right) {
            type = 'added';
        }
        else if (!left && right) {
            type = 'removed';
        }
        else if (left && right) {
            const limChanged = normVal(left.min) !== normVal(right.min) ||
                normVal(left.max) !== normVal(right.max);
            if (limChanged)
                type = 'changed';
        }
        return { key, left, right, type };
    };
    const rows = [];
    for (const left of params.value) {
        const key = left.symbol || left.param || '';
        const queue = rightQueues.get(key);
        const right = queue?.shift() ?? null;
        rows.push(makeRow(key, left, right));
    }
    const removedRows = [];
    for (const [key, queue] of rightQueues.entries()) {
        for (const right of queue) {
            removedRows.push(makeRow(key, null, right));
        }
    }
    removedRows.sort((a, b) => numericRowNo(a.right) - numericRowNo(b.right));
    return [...rows, ...removedRows];
});
function isLimitLoose(row) {
    if (!row.left || !row.right)
        return false;
    const getMin = (val) => {
        const nv = normVal(val);
        return (nv == null || typeof nv !== 'number') ? -Infinity : nv;
    };
    const getMax = (val) => {
        const nv = normVal(val);
        return (nv == null || typeof nv !== 'number') ? Infinity : nv;
    };
    const lMin = getMin(row.left.min), rMin = getMin(row.right.min);
    const lMax = getMax(row.left.max), rMax = getMax(row.right.max);
    return (lMin < rMin) || (lMax > rMax);
}
function isLimitTight(row) {
    if (!row.left || !row.right)
        return false;
    const getMin = (val) => {
        const nv = normVal(val);
        return (nv == null || typeof nv !== 'number') ? -Infinity : nv;
    };
    const getMax = (val) => {
        const nv = normVal(val);
        return (nv == null || typeof nv !== 'number') ? Infinity : nv;
    };
    const lMin = getMin(row.left.min), rMin = getMin(row.right.min);
    const lMax = getMax(row.left.max), rMax = getMax(row.right.max);
    return (lMin > rMin) || (lMax < rMax);
}
const vsStats = computed(() => {
    const stats = { added: 0, removed: 0, loose: 0, tight: 0 };
    for (const row of vsRows.value) {
        if (row.type === 'added')
            stats.added += 1;
        if (row.type === 'removed')
            stats.removed += 1;
        if (row.type === 'changed' && isLimitLoose(row))
            stats.loose += 1;
        if (row.type === 'changed' && isLimitTight(row))
            stats.tight += 1;
    }
    return stats;
});
function setVsFilter(key) {
    const nextActive = !vsFilter[key];
    Object.assign(vsFilter, { added: false, removed: false, loose: false, tight: false, diff: false });
    vsFilter[key] = nextActive;
}
const filteredVsRows = computed(() => {
    let result = vsRows.value;
    // 文本搜索
    const q = paramFilter.value.trim().toLowerCase();
    if (q) {
        result = result.filter(r => {
            const sym = (r.left?.symbol ?? r.right?.symbol ?? '').toLowerCase();
            const func = (r.left?.function ?? r.right?.function ?? '').toLowerCase();
            return sym.includes(q) || func.includes(q);
        });
    }
    // VS 类型筛选：互斥单选，未选择时显示全部
    const { added, removed, loose, tight, diff } = vsFilter;
    if (added || removed || loose || tight || diff) {
        result = result.filter(r => {
            if (diff && r.type !== 'same')
                return true;
            if (added && r.type === 'added')
                return true;
            if (removed && r.type === 'removed')
                return true;
            if (loose && r.type === 'changed' && isLimitLoose(r))
                return true;
            if (tight && r.type === 'changed' && isLimitTight(r))
                return true;
            return false;
        });
    }
    return result;
});
function vsRowClass(row) {
    if (row.type === 'added')
        return 'vs-row-added';
    if (row.type === 'removed')
        return 'vs-row-removed';
    return '';
}
function isVsQaRow(row) {
    return row.left?.is_qa === true || row.right?.is_qa === true;
}
/**
 * 当前版本（left）的 Min 列样式：
 * left.min < right.min → 下限降低 → 更宽松 → 绿
 * left.min > right.min → 下限升高 → 更严格 → 橙
 */
function leftMinClass(row) {
    if (!row.left || !row.right)
        return '';
    const l = row.left.min, r = row.right.min;
    if (l == null || r == null)
        return '';
    const lv = normVal(l), rv = normVal(r);
    if (lv === rv)
        return ''; // Same after rounding, don't highlight!
    if (typeof lv === 'number' && typeof rv === 'number') {
        if (lv < rv && isLimitLoose(row))
            return 'limit-loose';
        if (lv > rv && isLimitTight(row))
            return 'limit-tight';
    }
    return '';
}
/**
 * 当前版本（left）的 Max 列样式：
 * left.max > right.max → 上限升高 → 更宽松 → 绿
 * left.max < right.max → 上限降低 → 更严格 → 橙
 */
function leftMaxClass(row) {
    if (!row.left || !row.right)
        return '';
    const l = row.left.max, r = row.right.max;
    if (l == null || r == null)
        return '';
    const lv = normVal(l), rv = normVal(r);
    if (lv === rv)
        return ''; // Same after rounding, don't highlight!
    if (typeof lv === 'number' && typeof rv === 'number') {
        if (lv > rv && isLimitLoose(row))
            return 'limit-loose';
        if (lv < rv && isLimitTight(row))
            return 'limit-tight';
    }
    return '';
}
// ─── 工具函数 ───
function fmtLimit(v) {
    if (v == null)
        return '';
    const n = Number(v);
    if (isNaN(n))
        return String(v);
    if (Math.abs(n) >= 10000 || (Math.abs(n) < 0.001 && n !== 0))
        return n.toExponential(3);
    return parseFloat(n.toPrecision(6)).toString();
}
// ─── API ───
async function switchTab(nextTab) {
    if (nextTab === 'cpp' && isDataProgram.value)
        return;
    tab.value = nextTab;
    if (nextTab === 'cpp') {
        await loadCppFiles();
        await refreshCppCodeMirrorView();
    }
    else {
        destroyCppCodeMirrorViews();
    }
    if (nextTab === 'datasheet') {
        await loadDatasheetReport();
    }
}
// ─── Datasheet Comparison Logic ───
async function loadDatasheetReport() {
    datasheetLoading.value = true;
    try {
        const res = await api.get(`/spec/comparison-report`, {
            params: {
                product_name: productName.value,
                upload_id: currentId.value
            }
        });
        datasheetInfo.value = res.datasheet;
        datasheetRows.value = res.comparison_rows || [];
    }
    catch (err) {
        console.error(err);
        datasheetInfo.value = null;
        datasheetRows.value = [];
    }
    finally {
        datasheetLoading.value = false;
    }
}
function triggerChecklistSelect() {
    if (xlsxInput.value)
        xlsxInput.value.click();
}
function triggerDatasheetSelect() {
    if (docxInput.value)
        docxInput.value.click();
}
async function handleChecklistUpload(e) {
    const target = e.target;
    if (!target.files || target.files.length === 0)
        return;
    const file = target.files[0];
    const formData = new FormData();
    formData.append('product_name', productName.value);
    formData.append('file', file);
    datasheetLoading.value = true;
    try {
        await api.post('/spec/upload-checklist', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        await loadDatasheetReport();
    }
    catch (err) {
        alert('Upload checklist failed: ' + err);
    }
    finally {
        datasheetLoading.value = false;
        if (xlsxInput.value)
            xlsxInput.value.value = '';
    }
}
async function handleDatasheetUpload(e) {
    const target = e.target;
    if (!target.files || target.files.length === 0)
        return;
    const file = target.files[0];
    const formData = new FormData();
    formData.append('product_name', productName.value);
    formData.append('file', file);
    datasheetLoading.value = true;
    try {
        await api.post('/spec/upload-datasheet', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        await loadDatasheetReport();
    }
    catch (err) {
        alert('Upload datasheet failed: ' + err);
    }
    finally {
        datasheetLoading.value = false;
        if (docxInput.value)
            docxInput.value.value = '';
    }
}
function formatDate(isoStr) {
    if (!isoStr)
        return '-';
    const d = new Date(isoStr);
    return d.toLocaleString();
}
function getStatusLabel(st) {
    switch (st) {
        case 'all': return '全部';
        case 'out_of_spec': return '超规格 (OOS)';
        case 'warning': return '双限警告 (Warning)';
        case 'unmapped': return '未映射 (Unmapped)';
        case 'normal': return '正常 (Pass)';
        case 'missing_ate': return 'ATE 缺失';
        case 'missing_ds': return '规格缺失';
        case 'category': return '说明/类别';
        default: return st;
    }
}
function getStatusCount(st) {
    if (st === 'all')
        return datasheetRows.value.length;
    return datasheetRows.value.filter(r => r.status === st).length;
}
function fmtLimitVal(val) {
    if (val == null)
        return '-';
    const n = Number(val);
    if (isNaN(n))
        return String(val);
    return parseFloat(n.toPrecision(6)).toString();
}
function splitSpecStr(val) {
    if (val === null || val === undefined || val === '')
        return ['-'];
    const str = String(val).trim();
    if (!str)
        return ['-'];
    // First, split by standard separators like commas, semicolons, slashes, vertical bars, or newlines
    const primaryParts = str.split(/[,\/;，；|]|\r?\n/);
    const finalParts = [];
    for (const part of primaryParts) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        // Within each part, split by space(s) ONLY if followed by a digit or +/- sign and a digit.
        // This splits "6 6.8 12" -> ["6", "6.8", "12"] but keeps "1.2 V" together.
        const spaceSplit = trimmed.split(/\s+(?=[+-]?\d)/);
        for (const subPart of spaceSplit) {
            const subTrimmed = subPart.trim();
            if (subTrimmed) {
                finalParts.push(subTrimmed);
            }
        }
    }
    return finalParts.length > 0 ? finalParts : ['-'];
}
function isValViolated(row, field) {
    if (!row.message || row.status === 'normal' || row.status === 'unmapped')
        return false;
    const msg = row.message.toLowerCase();
    if (field === 'ft_min' && msg.includes('ft min') && msg.includes('ds min'))
        return true;
    if (field === 'ft_max' && msg.includes('ft max') && msg.includes('ds max'))
        return true;
    if (field === 'qa_min') {
        if (msg.includes('qa min') && msg.includes('ds min'))
            return true;
        if (msg.includes('qa min') && msg.includes('ft min'))
            return true;
    }
    if (field === 'qa_max') {
        if (msg.includes('qa max') && msg.includes('ds max'))
            return true;
        if (msg.includes('qa max') && msg.includes('ft max'))
            return true;
    }
    return false;
}
const filteredDsRows = computed(() => {
    let list = datasheetRows.value;
    if (datasheetStatusFilter.value !== 'all') {
        list = list.filter(r => r.status === datasheetStatusFilter.value);
    }
    if (datasheetFilter.value.trim()) {
        const q = datasheetFilter.value.toLowerCase().trim();
        list = list.filter(r => (r.datasheet_symbol && r.datasheet_symbol.toLowerCase().includes(q)) ||
            (r.ate_symbol && r.ate_symbol.toLowerCase().includes(q)) ||
            (r.parameter_name && r.parameter_name.toLowerCase().includes(q)) ||
            (r.condition && r.condition.toLowerCase().includes(q)) ||
            (r.message && r.message.toLowerCase().includes(q)));
    }
    return list;
});
async function loadData() {
    loading.value = true;
    try {
        const paramsUrl = isDataProgram.value
            ? `/programs/data/${currentId.value}/params`
            : `/programs/pgs/${currentId.value}/params`;
        const summaryUrl = isDataProgram.value
            ? `/programs/data/${currentId.value}/summary`
            : `/programs/pgs/${currentId.value}/summary`;
        const standardUrl = isDataProgram.value
            ? `/programs/data/${currentId.value}/summary_standard`
            : '';
        const listUrl = isDataProgram.value
            ? `/programs/data_list/${encodeURIComponent(productName.value)}?months=${dataMonths.value}`
            : `/programs/pgs_list/${encodeURIComponent(productName.value)}`;
        const dataListUrl = `/programs/data_list/${encodeURIComponent(productName.value)}`;
        const [p, s, standard, list, dataList] = await Promise.all([
            api.get(paramsUrl),
            api.get(summaryUrl),
            standardUrl ? api.get(standardUrl) : Promise.resolve(null),
            api.get(listUrl),
            isDataProgram.value ? Promise.resolve([]) : api.get(dataListUrl),
        ]);
        params.value = p;
        summary.value = s;
        dataSummaryStandard.value = standard;
        pgsList.value = list;
        dataProgramList.value = dataList;
        currentPgs.value = list.find((r) => r.id === currentId.value) ?? null;
        if (!isDataProgram.value && currentPgs.value) {
            sblInputText.value = currentPgs.value.sbl_input || '';
            parseSbl();
        }
    }
    catch (e) {
        alert('加载失败：' + (e?.message ?? '未知错误'));
        router.back();
    }
    finally {
        loading.value = false;
    }
}
async function loadCppFile(uploadId) {
    const cached = cppFileCache.get(uploadId);
    if (cached)
        return cached;
    const file = await api.get(`/programs/pgs/${uploadId}/cpp`);
    const cachedFile = { ...file, id: uploadId };
    cppFileCache.set(uploadId, cachedFile);
    return cachedFile;
}
async function loadCppFiles() {
    cppLoading.value = true;
    cppError.value = '';
    try {
        if (!cppFile.value) {
            cppFile.value = await loadCppFile(currentId.value);
        }
        const modifiedContent = cppModifiedFileCache.get(currentId.value);
        if (!(vsMode.value && vsTargetId.value && vsTargetSource.value === 'pgm') && modifiedContent != null) {
            cppModifiedContent.value = modifiedContent;
            cppEditMode.value = true;
        }
        if (vsMode.value && vsTargetId.value && vsTargetSource.value === 'pgm') {
            cppEditMode.value = false;
        }
        if (vsMode.value && vsTargetId.value && vsTargetSource.value === 'pgm' && (!vsCppFile.value || vsCppFile.value.id !== vsTargetId.value)) {
            vsCppFile.value = await loadCppFile(Number(vsTargetId.value));
        }
        await refreshCppCodeMirrorView();
    }
    catch (e) {
        cppError.value = e?.response?.data?.detail ?? e?.message ?? 'cpp 加载失败';
    }
    finally {
        cppLoading.value = false;
    }
}
async function toggleVsMode() {
    if (vsToggleBusy.value || vsLoading.value || cppLoading.value)
        return;
    vsToggleBusy.value = true;
    try {
        vsMode.value = !vsMode.value;
        if (vsMode.value) {
            cppEditMode.value = false;
            vsTargetSource.value = isDataProgram.value ? 'data' : 'pgm';
            const defaultId = vsTargetSource.value === 'data' ? defaultDataVsId.value : defaultPgmVsId.value;
            if (!vsTargetId.value && defaultId != null) {
                vsTargetId.value = defaultId;
                await loadVsParams();
            }
            if (!isDataProgram.value && tab.value === 'cpp' && vsTargetSource.value === 'pgm') {
                await loadCppFiles();
                await refreshCppCodeMirrorView();
            }
        }
        else {
            vsTargetSource.value = isDataProgram.value ? 'data' : 'pgm';
            vsTargetId.value = '';
            vsParams.value = [];
            vsSummary.value = [];
            vsCppFile.value = null;
            Object.assign(vsFilter, { added: false, removed: false, loose: false, tight: false, diff: false });
            if (!isDataProgram.value && tab.value === 'cpp')
                await refreshCppCodeMirrorView();
        }
    }
    finally {
        vsToggleBusy.value = false;
    }
}
async function onVsSourceChange() {
    cppEditMode.value = false;
    vsTargetId.value = '';
    vsParams.value = [];
    vsSummary.value = [];
    vsCppFile.value = null;
    const defaultId = vsTargetSource.value === 'data' ? defaultDataVsId.value : defaultPgmVsId.value;
    if (defaultId != null) {
        vsTargetId.value = defaultId;
        await loadVsParams();
    }
    if (vsTargetSource.value === 'data' && tab.value === 'cpp') {
        await switchTab('param');
    }
    else if (!isDataProgram.value && tab.value === 'cpp') {
        await loadCppFiles();
        await refreshCppCodeMirrorView();
    }
}
async function onVsTargetChange() {
    cppEditMode.value = false;
    await loadVsParams();
    vsCppFile.value = null;
    if (!isDataProgram.value && tab.value === 'cpp' && vsTargetSource.value === 'pgm') {
        await loadCppFiles();
        await refreshCppCodeMirrorView();
    }
}
async function loadVsParams() {
    if (!vsTargetId.value)
        return;
    vsLoading.value = true;
    vsParams.value = [];
    vsSummary.value = [];
    try {
        const paramsUrl = vsTargetSource.value === 'data'
            ? `/programs/data/${vsTargetId.value}/params`
            : `/programs/pgs/${vsTargetId.value}/params`;
        const summaryUrl = vsTargetSource.value === 'data'
            ? `/programs/data/${vsTargetId.value}/summary`
            : `/programs/pgs/${vsTargetId.value}/summary`;
        const [p, s] = await Promise.all([
            api.get(paramsUrl),
            api.get(summaryUrl),
        ]);
        vsParams.value = p;
        vsSummary.value = s;
    }
    catch (e) {
        alert('Load compare data failed: ' + (e?.message ?? ''));
    }
    finally {
        vsLoading.value = false;
    }
}
onMounted(() => { loadData(); });
onBeforeUnmount(() => { destroyCppCodeMirrorViews(); });
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['bc-link']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ptab']} */ ;
/** @type {__VLS_StyleScopedClasses['ptab-excel']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-source-select-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-select-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-alert-filter-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-alert-filter-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-alert-filter-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-alert-active']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
/** @type {__VLS_StyleScopedClasses['param-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['param-row']} */ ;
/** @type {__VLS_StyleScopedClasses['param-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-row']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-row']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-limit-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-row']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-alert-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-row']} */ ;
/** @type {__VLS_StyleScopedClasses['qa-same-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-row']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-row-added']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-row-removed']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-row']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-row']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-qa-row']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-added']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-removed']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-loose']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-f-diff']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-body']} */ ;
/** @type {__VLS_StyleScopedClasses['loading-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-resizer']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-mismatch']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-vi-flow']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-text']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-vi-range']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-text']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-active']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-nav-text']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-code-panes']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-check-run']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-check-action']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-check-action']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-max-link']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-max-link']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-metric-link']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-metric-link']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-line-link']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-line-link']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-range']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-name']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-range']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-missing-zero']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-name']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-missing-off']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-name']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['vi-source-name']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-download-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-download-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-codemirror-host']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-codemirror-host']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-codemirror-host']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-codemirror-host']} */ ;
/** @type {__VLS_StyleScopedClasses['cm-line-jump']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-diff-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-diff-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-hover-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-jump-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-jump-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-hover-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cpp-line-code']} */ ;
/** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['info-item']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-action']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-input-ds']} */ ;
/** @type {__VLS_StyleScopedClasses['st-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['st-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['st-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['st-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['st-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['st-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-report-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-report-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-report-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-row']} */ ;
/** @type {__VLS_StyleScopedClasses['status-unmapped']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-row']} */ ;
/** @type {__VLS_StyleScopedClasses['col-no']} */ ;
/** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
/** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
/** @type {__VLS_StyleScopedClasses['col-num']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-report-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['col-num']} */ ;
/** @type {__VLS_StyleScopedClasses['col-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['out_of_spec']} */ ;
/** @type {__VLS_StyleScopedClasses['col-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['warning']} */ ;
/** @type {__VLS_StyleScopedClasses['col-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['col-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['unmapped']} */ ;
/** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['normal']} */ ;
/** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['out_of_spec']} */ ;
/** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['warning']} */ ;
/** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['unmapped']} */ ;
/** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['missing_ate']} */ ;
/** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-empty-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-empty-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-empty-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-empty-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-report-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-report-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-report-tbl']} */ ;
/** @type {__VLS_StyleScopedClasses['ds-row']} */ ;
/** @type {__VLS_StyleScopedClasses['hide-col-cb']} */ ;
/** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['remark-text-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['remark-input-inline']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "pgs-page" },
});
/** @type {__VLS_StyleScopedClasses['pgs-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page-header" },
});
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header-left" },
});
/** @type {__VLS_StyleScopedClasses['header-left']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "breadcrumb" },
});
/** @type {__VLS_StyleScopedClasses['breadcrumb']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.router.push('/program-changes'));
            // @ts-ignore
            [router,];
        } },
    ...{ class: "bc-link" },
});
/** @type {__VLS_StyleScopedClasses['bc-link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "bc-sep" },
});
/** @type {__VLS_StyleScopedClasses['bc-sep']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.router.push(`/program-changes/${__VLS_ctx.productName}`));
            // @ts-ignore
            [router, productName,];
        } },
    ...{ class: "bc-link" },
});
/** @type {__VLS_StyleScopedClasses['bc-link']} */ ;
(__VLS_ctx.productName);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "bc-sep" },
});
/** @type {__VLS_StyleScopedClasses['bc-sep']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "bc-current" },
});
/** @type {__VLS_StyleScopedClasses['bc-current']} */ ;
(__VLS_ctx.currentPgs?.program_version ?? __VLS_ctx.currentPgs?.filename ?? `PGS #${__VLS_ctx.currentId}`);
if (__VLS_ctx.currentPgs?.pgs_version) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "ver-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['ver-badge']} */ ;
    (__VLS_ctx.currentPgs.pgs_version);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.toggleVsMode) },
    ...{ class: "vs-btn" },
    ...{ class: ({ 'vs-active': __VLS_ctx.vsMode, 'vs-disabled': __VLS_ctx.vsToggleBusy }) },
    disabled: (__VLS_ctx.vsToggleBusy),
    title: "点击再次退出对比",
});
/** @type {__VLS_StyleScopedClasses['vs-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-active']} */ ;
/** @type {__VLS_StyleScopedClasses['vs-disabled']} */ ;
if (__VLS_ctx.vsMode) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "vs-sep" },
    });
    /** @type {__VLS_StyleScopedClasses['vs-sep']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "vs-inline-label" },
    });
    /** @type {__VLS_StyleScopedClasses['vs-inline-label']} */ ;
    if (!__VLS_ctx.isDataProgram) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: (__VLS_ctx.onVsSourceChange) },
            ...{ class: "vs-source-select-inline" },
            value: (__VLS_ctx.vsTargetSource),
        });
        /** @type {__VLS_StyleScopedClasses['vs-source-select-inline']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "pgm",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "data",
        });
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (__VLS_ctx.onVsTargetChange) },
        ...{ class: "vs-select-inline" },
        value: (__VLS_ctx.vsTargetId),
    });
    /** @type {__VLS_StyleScopedClasses['vs-select-inline']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
        disabled: true,
    });
    for (const [p] of __VLS_vFor((__VLS_ctx.vsProgramList))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (`${__VLS_ctx.vsTargetSource}-${p.id}`),
            value: (p.id),
        });
        (p.program_version ?? p.filename);
        // @ts-ignore
        [productName, currentPgs, currentPgs, currentPgs, currentPgs, currentId, toggleVsMode, vsMode, vsMode, vsToggleBusy, vsToggleBusy, isDataProgram, onVsSourceChange, vsTargetSource, vsTargetSource, onVsTargetChange, vsTargetId, vsProgramList,];
    }
    if (__VLS_ctx.vsLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "vs-loading-tip" },
        });
        /** @type {__VLS_StyleScopedClasses['vs-loading-tip']} */ ;
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "pgs-tabs" },
});
/** @type {__VLS_StyleScopedClasses['pgs-tabs']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.tab = 'param');
            // @ts-ignore
            [vsLoading, tab,];
        } },
    ...{ class: "ptab" },
    ...{ class: ({ 'ptab-active': __VLS_ctx.tab === 'param' }) },
});
/** @type {__VLS_StyleScopedClasses['ptab']} */ ;
/** @type {__VLS_StyleScopedClasses['ptab-active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.tab = 'summary');
            // @ts-ignore
            [tab, tab,];
        } },
    ...{ class: "ptab" },
    ...{ class: ({ 'ptab-active': __VLS_ctx.tab === 'summary' }) },
});
/** @type {__VLS_StyleScopedClasses['ptab']} */ ;
/** @type {__VLS_StyleScopedClasses['ptab-active']} */ ;
if (!__VLS_ctx.isDataProgram) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.isDataProgram))
                    throw 0;
                return (__VLS_ctx.switchTab('cpp'));
                // @ts-ignore
                [isDataProgram, tab, switchTab,];
            } },
        ...{ class: "ptab" },
        ...{ class: ({ 'ptab-active': __VLS_ctx.tab === 'cpp' }) },
    });
    /** @type {__VLS_StyleScopedClasses['ptab']} */ ;
    /** @type {__VLS_StyleScopedClasses['ptab-active']} */ ;
}
if (!__VLS_ctx.isDataProgram) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.isDataProgram))
                    throw 0;
                return (__VLS_ctx.switchTab('datasheet'));
                // @ts-ignore
                [isDataProgram, tab, switchTab,];
            } },
        ...{ class: "ptab" },
        ...{ class: ({ 'ptab-active': __VLS_ctx.tab === 'datasheet' }) },
    });
    /** @type {__VLS_StyleScopedClasses['ptab']} */ ;
    /** @type {__VLS_StyleScopedClasses['ptab-active']} */ ;
}
if (!__VLS_ctx.isDataProgram) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.exportToExcel) },
        ...{ class: "ptab ptab-excel" },
    });
    /** @type {__VLS_StyleScopedClasses['ptab']} */ ;
    /** @type {__VLS_StyleScopedClasses['ptab-excel']} */ ;
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-mask" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-mask']} */ ;
}
else {
    if (__VLS_ctx.tab === 'param' && !__VLS_ctx.vsMode) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pgs-body" },
        });
        /** @type {__VLS_StyleScopedClasses['pgs-body']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "info-bar" },
        });
        /** @type {__VLS_StyleScopedClasses['info-bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.params.length);
        if (__VLS_ctx.hasQaData) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "qa-info-sep" },
            });
            /** @type {__VLS_StyleScopedClasses['qa-info-sep']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "qa-info-tag" },
            });
            /** @type {__VLS_StyleScopedClasses['qa-info-tag']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "qa-info-text" },
            });
            /** @type {__VLS_StyleScopedClasses['qa-info-text']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (__VLS_ctx.params.filter(p => p.is_qa).length);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "qa-dot init-dot" },
            });
            /** @type {__VLS_StyleScopedClasses['qa-dot']} */ ;
            /** @type {__VLS_StyleScopedClasses['init-dot']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "qa-dot qa-row-dot" },
            });
            /** @type {__VLS_StyleScopedClasses['qa-dot']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-row-dot']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "qa-info-sep" },
            });
            /** @type {__VLS_StyleScopedClasses['qa-info-sep']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            throw 0;
                        if (!(__VLS_ctx.tab === 'param' && !__VLS_ctx.vsMode))
                            throw 0;
                        if (!(__VLS_ctx.hasQaData))
                            throw 0;
                        return (__VLS_ctx.qaAlertFilter = !__VLS_ctx.qaAlertFilter);
                        // @ts-ignore
                        [vsMode, isDataProgram, tab, tab, exportToExcel, loading, params, params, hasQaData, qaAlertFilter, qaAlertFilter,];
                    } },
                ...{ class: "qa-alert-filter-btn" },
                ...{ class: ({ 'qa-alert-active': __VLS_ctx.qaAlertFilter }) },
            });
            /** @type {__VLS_StyleScopedClasses['qa-alert-filter-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-alert-active']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "alert-dot" },
            });
            /** @type {__VLS_StyleScopedClasses['alert-dot']} */ ;
            if (__VLS_ctx.hasNonBin4QaAlert) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "qa-bin-alert" },
                });
                /** @type {__VLS_StyleScopedClasses['qa-bin-alert']} */ ;
            }
            if (__VLS_ctx.qaAlertFilter) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "filter-badge" },
                });
                /** @type {__VLS_StyleScopedClasses['filter-badge']} */ ;
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "🔍 过滤 Param / Function...",
            ...{ class: "filter-input" },
        });
        (__VLS_ctx.paramFilter);
        /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "param-tbl" },
        });
        /** @type {__VLS_StyleScopedClasses['param-tbl']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-no" },
        });
        /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-func" },
        });
        /** @type {__VLS_StyleScopedClasses['col-func']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-sym" },
        });
        /** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-num" },
        });
        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-num" },
        });
        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-unit" },
        });
        /** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-bin" },
        });
        /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-bin" },
        });
        /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
        if (__VLS_ctx.hasQaData) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-num col-qa-hdr" },
            });
            /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
            /** @type {__VLS_StyleScopedClasses['col-qa-hdr']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-num col-qa-hdr qa-max-col" },
            });
            /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
            /** @type {__VLS_StyleScopedClasses['col-qa-hdr']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-max-col']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [p] of __VLS_vFor((__VLS_ctx.filteredParams))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (p.row_no),
                ...{ class: "param-row" },
                ...{ class: ({ 'qa-row': p.is_qa }) },
            });
            /** @type {__VLS_StyleScopedClasses['param-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-no" },
            });
            /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
            (p.row_no);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-func" },
                ...{ class: ({ 'qa-func': p.is_qa }) },
            });
            /** @type {__VLS_StyleScopedClasses['col-func']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-func']} */ ;
            (p.function);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-sym" },
                ...{ class: ({ 'qa-sym': p.is_qa }) },
            });
            /** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-sym']} */ ;
            (p.symbol);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-num limit-cell" },
                ...{ class: ({
                        'qa-alert-cell': p.is_qa && __VLS_ctx.isQaMinRedRow(p),
                        'qa-same-cell': p.is_qa && __VLS_ctx.isQaMinSameRow(p)
                    }) },
            });
            /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
            /** @type {__VLS_StyleScopedClasses['limit-cell']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-alert-cell']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-same-cell']} */ ;
            (__VLS_ctx.fmtLimit(p.min));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-num limit-cell" },
                ...{ class: ({
                        'qa-alert-cell': p.is_qa && __VLS_ctx.isQaMaxRedRow(p),
                        'qa-same-cell': p.is_qa && __VLS_ctx.isQaMaxSameRow(p)
                    }) },
            });
            /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
            /** @type {__VLS_StyleScopedClasses['limit-cell']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-alert-cell']} */ ;
            /** @type {__VLS_StyleScopedClasses['qa-same-cell']} */ ;
            (__VLS_ctx.fmtLimit(p.max));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-unit" },
            });
            /** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
            (p.unit);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            (p.sw_bin ?? '');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            (p.hw_bin ?? '');
            if (__VLS_ctx.hasQaData) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "col-num qa-limit-cell" },
                    ...{ class: ({
                            'qa-limit-self': p.is_qa,
                            'qa-limit-ref': !p.is_qa && p.qa_min != null,
                            'qa-alert-cell': !p.is_qa && __VLS_ctx.isQaMinRedRef(p),
                            'qa-same-cell': !p.is_qa && __VLS_ctx.isQaMinSameRef(p)
                        }) },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-limit-cell']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-limit-self']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-limit-ref']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-alert-cell']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-same-cell']} */ ;
                (__VLS_ctx.fmtLimit(p.qa_min));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "col-num qa-limit-cell qa-max-col" },
                    ...{ class: ({
                            'qa-limit-self': p.is_qa,
                            'qa-limit-ref': !p.is_qa && p.qa_max != null,
                            'qa-alert-cell': !p.is_qa && __VLS_ctx.isQaMaxRedRef(p),
                            'qa-same-cell': !p.is_qa && __VLS_ctx.isQaMaxSameRef(p)
                        }) },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-limit-cell']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-max-col']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-limit-self']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-limit-ref']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-alert-cell']} */ ;
                /** @type {__VLS_StyleScopedClasses['qa-same-cell']} */ ;
                (__VLS_ctx.fmtLimit(p.qa_max));
            }
            // @ts-ignore
            [hasQaData, hasQaData, qaAlertFilter, qaAlertFilter, hasNonBin4QaAlert, paramFilter, filteredParams, isQaMinRedRow, isQaMinSameRow, fmtLimit, fmtLimit, fmtLimit, fmtLimit, isQaMaxRedRow, isQaMaxSameRow, isQaMinRedRef, isQaMinSameRef, isQaMaxRedRef, isQaMaxSameRef,];
        }
        if (!__VLS_ctx.filteredParams.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                colspan: (__VLS_ctx.hasQaData ? 10 : 8),
                ...{ class: "td-empty" },
            });
            /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
        }
    }
    if (__VLS_ctx.tab === 'param' && __VLS_ctx.vsMode) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pgs-body" },
        });
        /** @type {__VLS_StyleScopedClasses['pgs-body']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "info-bar" },
        });
        /** @type {__VLS_StyleScopedClasses['info-bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "vs-filters" },
        });
        /** @type {__VLS_StyleScopedClasses['vs-filters']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        throw 0;
                    if (!(__VLS_ctx.tab === 'param' && __VLS_ctx.vsMode))
                        throw 0;
                    return (__VLS_ctx.setVsFilter('added'));
                    // @ts-ignore
                    [vsMode, tab, hasQaData, filteredParams, setVsFilter,];
                } },
            ...{ class: "vs-f-btn vs-f-added" },
            ...{ class: ({ 'vs-f-active': __VLS_ctx.vsFilter.added }) },
        });
        /** @type {__VLS_StyleScopedClasses['vs-f-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-added']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
        (__VLS_ctx.vsStats.added);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        throw 0;
                    if (!(__VLS_ctx.tab === 'param' && __VLS_ctx.vsMode))
                        throw 0;
                    return (__VLS_ctx.setVsFilter('removed'));
                    // @ts-ignore
                    [setVsFilter, vsFilter, vsStats,];
                } },
            ...{ class: "vs-f-btn vs-f-removed" },
            ...{ class: ({ 'vs-f-active': __VLS_ctx.vsFilter.removed }) },
        });
        /** @type {__VLS_StyleScopedClasses['vs-f-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-removed']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
        (__VLS_ctx.vsStats.removed);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        throw 0;
                    if (!(__VLS_ctx.tab === 'param' && __VLS_ctx.vsMode))
                        throw 0;
                    return (__VLS_ctx.setVsFilter('loose'));
                    // @ts-ignore
                    [setVsFilter, vsFilter, vsStats,];
                } },
            ...{ class: "vs-f-btn vs-f-loose" },
            ...{ class: ({ 'vs-f-active': __VLS_ctx.vsFilter.loose }) },
        });
        /** @type {__VLS_StyleScopedClasses['vs-f-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-loose']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
        (__VLS_ctx.vsStats.loose);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        throw 0;
                    if (!(__VLS_ctx.tab === 'param' && __VLS_ctx.vsMode))
                        throw 0;
                    return (__VLS_ctx.setVsFilter('tight'));
                    // @ts-ignore
                    [setVsFilter, vsFilter, vsStats,];
                } },
            ...{ class: "vs-f-btn vs-f-tight" },
            ...{ class: ({ 'vs-f-active': __VLS_ctx.vsFilter.tight }) },
        });
        /** @type {__VLS_StyleScopedClasses['vs-f-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-tight']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
        (__VLS_ctx.vsStats.tight);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        throw 0;
                    if (!(__VLS_ctx.tab === 'param' && __VLS_ctx.vsMode))
                        throw 0;
                    return (__VLS_ctx.setVsFilter('diff'));
                    // @ts-ignore
                    [setVsFilter, vsFilter, vsStats,];
                } },
            ...{ class: "vs-f-btn vs-f-diff" },
            ...{ class: ({ 'vs-f-active': __VLS_ctx.vsFilter.diff }) },
        });
        /** @type {__VLS_StyleScopedClasses['vs-f-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-diff']} */ ;
        /** @type {__VLS_StyleScopedClasses['vs-f-active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "🔍 过滤 Param / Function...",
            ...{ class: "filter-input" },
        });
        (__VLS_ctx.paramFilter);
        /** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
        if (__VLS_ctx.vsLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "loading-mask" },
            });
            /** @type {__VLS_StyleScopedClasses['loading-mask']} */ ;
        }
        else if (!__VLS_ctx.vsTargetId) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "vs-empty-hint" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-empty-hint']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "vs-table-container" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-table-container']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-wrap" },
            });
            /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "vs-tbl" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-tbl']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ class: "vs-prog-row" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                colspan: "8",
                ...{ class: "vs-prog-th vs-prog-th-left" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-th']} */ ;
            /** @type {__VLS_StyleScopedClasses['vs-prog-th-left']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-badge new-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['new-badge']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-name" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-name']} */ ;
            (__VLS_ctx.currentPgs?.program_version ?? __VLS_ctx.currentPgs?.filename);
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "vs-mid-col" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                colspan: "8",
                ...{ class: "vs-prog-th vs-prog-th-right" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-th']} */ ;
            /** @type {__VLS_StyleScopedClasses['vs-prog-th-right']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-badge old-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['old-badge']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-name" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-name']} */ ;
            (__VLS_ctx.vsTargetPgs?.program_version ?? __VLS_ctx.vsTargetPgs?.filename);
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-no" },
            });
            /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-func" },
            });
            /** @type {__VLS_StyleScopedClasses['col-func']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-sym" },
            });
            /** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-num" },
            });
            /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-num" },
            });
            /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-unit" },
            });
            /** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "vs-mid-col" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-no" },
            });
            /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-func" },
            });
            /** @type {__VLS_StyleScopedClasses['col-func']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-sym" },
            });
            /** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-num" },
            });
            /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-num" },
            });
            /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-unit" },
            });
            /** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [row, i] of __VLS_vFor((__VLS_ctx.filteredVsRows))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (i),
                    ...{ class: "vs-row" },
                    ...{ class: ([__VLS_ctx.vsRowClass(row), { 'vs-qa-row': __VLS_ctx.isVsQaRow(row) }]) },
                });
                /** @type {__VLS_StyleScopedClasses['vs-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['vs-qa-row']} */ ;
                if (row.left) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-no" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
                    (row.left.row_no);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-func" },
                        ...{ class: ({ 'vs-deleted': row.type === 'removed' }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-func']} */ ;
                    /** @type {__VLS_StyleScopedClasses['vs-deleted']} */ ;
                    (row.left.function);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-sym" },
                        ...{ class: ({ 'vs-deleted': row.type === 'removed' }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
                    /** @type {__VLS_StyleScopedClasses['vs-deleted']} */ ;
                    (row.left.symbol);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-num" },
                        ...{ class: (__VLS_ctx.leftMinClass(row)) },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                    (__VLS_ctx.fmtLimit(row.left.min));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-num" },
                        ...{ class: (__VLS_ctx.leftMaxClass(row)) },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                    (__VLS_ctx.fmtLimit(row.left.max));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-unit" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
                    (row.left.unit);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.left.sw_bin ?? '');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.left.hw_bin ?? '');
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        colspan: "8",
                        ...{ class: "vs-empty-side" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vs-empty-side']} */ ;
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "vs-mid-col" },
                });
                /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
                if (row.right) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-no" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
                    (row.right.row_no);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-func" },
                        ...{ class: ({ 'vs-deleted': row.type === 'removed' }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-func']} */ ;
                    /** @type {__VLS_StyleScopedClasses['vs-deleted']} */ ;
                    (row.right.function);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-sym" },
                        ...{ class: ({ 'vs-deleted': row.type === 'removed' }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
                    /** @type {__VLS_StyleScopedClasses['vs-deleted']} */ ;
                    (row.right.symbol);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-num" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                    (__VLS_ctx.fmtLimit(row.right.min));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-num" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                    (__VLS_ctx.fmtLimit(row.right.max));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-unit" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
                    (row.right.unit);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.right.sw_bin ?? '');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.right.hw_bin ?? '');
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        colspan: "8",
                        ...{ class: "vs-empty-side" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vs-empty-side']} */ ;
                }
                // @ts-ignore
                [currentPgs, currentPgs, vsTargetId, vsLoading, paramFilter, fmtLimit, fmtLimit, fmtLimit, fmtLimit, vsFilter, vsTargetPgs, vsTargetPgs, filteredVsRows, vsRowClass, isVsQaRow, leftMinClass, leftMaxClass,];
            }
            if (!__VLS_ctx.filteredVsRows.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "17",
                    ...{ class: "td-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
            }
        }
    }
    if (__VLS_ctx.tab === 'summary') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pgs-body" },
        });
        /** @type {__VLS_StyleScopedClasses['pgs-body']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "info-bar" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['info-bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "info-bar-left" },
        });
        /** @type {__VLS_StyleScopedClasses['info-bar-left']} */ ;
        if (__VLS_ctx.vsMode && __VLS_ctx.vsTargetId) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (__VLS_ctx.sortedSummary.length);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "qa-info-sep" },
            });
            /** @type {__VLS_StyleScopedClasses['qa-info-sep']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (__VLS_ctx.sortedVsSummary.length);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (__VLS_ctx.displaySummaryRows.length);
            if (__VLS_ctx.isDataProgram && __VLS_ctx.dataSummaryStandard?.mode === 'pgm') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "qa-info-sep" },
                });
                /** @type {__VLS_StyleScopedClasses['qa-info-sep']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
                    ...{ class: (__VLS_ctx.dataSummaryStandard.pass ? 'summary-pass' : 'summary-fail') },
                });
                (__VLS_ctx.dataSummaryStandard.pass ? 'PASS' : 'DIFF');
            }
            else if (__VLS_ctx.isDataProgram && __VLS_ctx.dataSummaryStandard?.mode === 'expanded') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "qa-info-sep" },
                });
                /** @type {__VLS_StyleScopedClasses['qa-info-sep']} */ ;
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "info-bar-right" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['info-bar-right']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onKeyup: (__VLS_ctx.saveSblText) },
            ...{ onChange: (__VLS_ctx.saveSblText) },
            ...{ onInput: (__VLS_ctx.parseSbl) },
            ...{ class: "sbl-input" },
            placeholder: "输入 SBL/SYL 规则并回车... 例如：SYL:85%,SBL:BIN5:0.1%,BIN1+13:92%",
            ...{ style: {} },
        });
        (__VLS_ctx.sblInputText);
        /** @type {__VLS_StyleScopedClasses['sbl-input']} */ ;
        if (__VLS_ctx.vsMode && __VLS_ctx.vsLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "loading-mask" },
            });
            /** @type {__VLS_StyleScopedClasses['loading-mask']} */ ;
        }
        else if (__VLS_ctx.vsMode && !__VLS_ctx.vsTargetId) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "vs-empty-hint" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-empty-hint']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
        else if (__VLS_ctx.vsMode) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-wrap" },
            });
            /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "vs-tbl summary-vs-tbl" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-tbl']} */ ;
            /** @type {__VLS_StyleScopedClasses['summary-vs-tbl']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ class: "vs-prog-row" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                colspan: "4",
                ...{ class: "vs-prog-th vs-prog-th-left" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-th']} */ ;
            /** @type {__VLS_StyleScopedClasses['vs-prog-th-left']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-badge new-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['new-badge']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-name" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-name']} */ ;
            (__VLS_ctx.currentPgs?.program_version ?? __VLS_ctx.currentPgs?.filename);
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "vs-mid-col" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                colspan: "4",
                ...{ class: "vs-prog-th vs-prog-th-right" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-th']} */ ;
            /** @type {__VLS_StyleScopedClasses['vs-prog-th-right']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-badge old-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['old-badge']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-name" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-name']} */ ;
            (__VLS_ctx.vsTargetPgs?.program_version ?? __VLS_ctx.vsTargetPgs?.filename);
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "vs-mid-col" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [row, i] of __VLS_vFor((__VLS_ctx.summaryVsRows))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (i),
                    ...{ class: "vs-row" },
                });
                /** @type {__VLS_StyleScopedClasses['vs-row']} */ ;
                if (row.left) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.left.sw_bin);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.left.hw_bin);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: ({ 'bin-changed': __VLS_ctx.isSummaryBinNameChanged(row) }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['bin-changed']} */ ;
                    (row.left.bin_name);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (__VLS_ctx.sblLimits[row.left.sw_bin] ?? '');
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        colspan: "4",
                        ...{ class: "vs-empty-side" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vs-empty-side']} */ ;
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "vs-mid-col" },
                });
                /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
                if (row.right) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.right.sw_bin);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.right.hw_bin);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: ({ 'bin-changed': __VLS_ctx.isSummaryBinNameChanged(row) }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['bin-changed']} */ ;
                    (row.right.bin_name);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (__VLS_ctx.sblLimits[row.right.sw_bin] ?? '');
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        colspan: "4",
                        ...{ class: "vs-empty-side" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vs-empty-side']} */ ;
                }
                // @ts-ignore
                [currentPgs, currentPgs, vsMode, vsMode, vsMode, vsMode, isDataProgram, isDataProgram, vsTargetId, vsTargetId, vsLoading, tab, vsTargetPgs, vsTargetPgs, filteredVsRows, sortedSummary, sortedVsSummary, displaySummaryRows, dataSummaryStandard, dataSummaryStandard, dataSummaryStandard, dataSummaryStandard, saveSblText, saveSblText, parseSbl, sblInputText, summaryVsRows, isSummaryBinNameChanged, isSummaryBinNameChanged, sblLimits, sblLimits,];
            }
            if (!__VLS_ctx.summaryVsRows.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "9",
                    ...{ class: "td-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
            }
        }
        else if (__VLS_ctx.isDataProgram && __VLS_ctx.dataSummaryStandard?.mode === 'pgm') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-wrap" },
            });
            /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "vs-tbl summary-vs-tbl" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-tbl']} */ ;
            /** @type {__VLS_StyleScopedClasses['summary-vs-tbl']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ class: "vs-prog-row" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                colspan: "4",
                ...{ class: "vs-prog-th vs-prog-th-left" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-th']} */ ;
            /** @type {__VLS_StyleScopedClasses['vs-prog-th-left']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-badge new-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['new-badge']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-name" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-name']} */ ;
            (__VLS_ctx.currentPgs?.program_version ?? __VLS_ctx.currentPgs?.filename);
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "vs-mid-col" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                colspan: "4",
                ...{ class: "vs-prog-th vs-prog-th-right" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-th']} */ ;
            /** @type {__VLS_StyleScopedClasses['vs-prog-th-right']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-badge old-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['old-badge']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-name" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-name']} */ ;
            (__VLS_ctx.dataSummaryStandard.reference?.program_version ?? __VLS_ctx.dataSummaryStandard.reference?.filename);
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "vs-mid-col" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [row, i] of __VLS_vFor((__VLS_ctx.dataStandardSummaryRows))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (i),
                    ...{ class: "vs-row" },
                    ...{ class: ({ 'vs-row-added': row.status === 'added' }) },
                });
                /** @type {__VLS_StyleScopedClasses['vs-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['vs-row-added']} */ ;
                if (row.left) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.left.sw_bin);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.left.hw_bin);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: ({ 'bin-changed': row.status === 'changed' || row.status === 'added' }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['bin-changed']} */ ;
                    (row.left.bin_name);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (__VLS_ctx.sblLimits[row.left.sw_bin] ?? '');
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        colspan: "4",
                        ...{ class: "vs-empty-side" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vs-empty-side']} */ ;
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "vs-mid-col" },
                });
                /** @type {__VLS_StyleScopedClasses['vs-mid-col']} */ ;
                if (row.right) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.right.sw_bin);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "col-bin" },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                    (row.right.hw_bin);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: ({ 'bin-changed': row.status === 'changed' }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['bin-changed']} */ ;
                    (row.right.bin_name);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (__VLS_ctx.sblLimits[row.right.sw_bin] ?? '');
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        colspan: "4",
                        ...{ class: "vs-empty-side" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vs-empty-side']} */ ;
                }
                // @ts-ignore
                [currentPgs, currentPgs, isDataProgram, dataSummaryStandard, dataSummaryStandard, dataSummaryStandard, summaryVsRows, sblLimits, sblLimits, dataStandardSummaryRows,];
            }
            if (!__VLS_ctx.dataStandardSummaryRows.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "9",
                    ...{ class: "td-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-wrap" },
            });
            /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "param-tbl" },
            });
            /** @type {__VLS_StyleScopedClasses['param-tbl']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                ...{ class: "col-bin" },
            });
            /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [s, i] of __VLS_vFor((__VLS_ctx.displaySummaryRows))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (i),
                    ...{ class: "param-row" },
                });
                /** @type {__VLS_StyleScopedClasses['param-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "col-bin" },
                });
                /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                (s.sw_bin);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "col-bin" },
                });
                /** @type {__VLS_StyleScopedClasses['col-bin']} */ ;
                (s.hw_bin);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.bin_name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.sblLimits[s.sw_bin] ?? '');
                // @ts-ignore
                [displaySummaryRows, sblLimits, dataStandardSummaryRows,];
            }
            if (!__VLS_ctx.displaySummaryRows.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    colspan: "4",
                    ...{ class: "td-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['td-empty']} */ ;
            }
        }
    }
    if (__VLS_ctx.tab === 'cpp') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pgs-body cpp-body" },
        });
        /** @type {__VLS_StyleScopedClasses['pgs-body']} */ ;
        /** @type {__VLS_StyleScopedClasses['cpp-body']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "info-bar cpp-info" },
        });
        /** @type {__VLS_StyleScopedClasses['info-bar']} */ ;
        /** @type {__VLS_StyleScopedClasses['cpp-info']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.currentPgs?.program_version ?? __VLS_ctx.currentPgs?.filename);
        if (__VLS_ctx.vsMode && __VLS_ctx.vsTargetId) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "qa-info-sep" },
            });
            /** @type {__VLS_StyleScopedClasses['qa-info-sep']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (__VLS_ctx.vsTargetPgs?.program_version ?? __VLS_ctx.vsTargetPgs?.filename);
        }
        if (__VLS_ctx.cppLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-loading-tip" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-loading-tip']} */ ;
        }
        if (__VLS_ctx.cppError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cpp-error" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-error']} */ ;
            (__VLS_ctx.cppError);
        }
        if (__VLS_ctx.cppLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "loading-mask" },
            });
            /** @type {__VLS_StyleScopedClasses['loading-mask']} */ ;
        }
        if (__VLS_ctx.cppOverlayLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-loading-overlay" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-loading-overlay']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-loading-dialog" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-loading-dialog']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-loading-title" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-loading-title']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-loading-subtitle" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-loading-subtitle']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-progress" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-progress']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-progress-bar" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-progress-bar']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-loading-stage" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-loading-stage']} */ ;
            (__VLS_ctx.cppLoadingStage);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cpp-layout" },
            ...{ class: ({ 'cpp-layout-no-vi': __VLS_ctx.vsMode && __VLS_ctx.vsTargetId }) },
            ...{ style: (__VLS_ctx.cppLayoutStyle) },
        });
        /** @type {__VLS_StyleScopedClasses['cpp-layout']} */ ;
        /** @type {__VLS_StyleScopedClasses['cpp-layout-no-vi']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
            ...{ class: "cpp-overview" },
        });
        /** @type {__VLS_StyleScopedClasses['cpp-overview']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cpp-overview-title" },
        });
        /** @type {__VLS_StyleScopedClasses['cpp-overview-title']} */ ;
        for (const [item] of __VLS_vFor((__VLS_ctx.cppOutline))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            throw 0;
                        if (!(__VLS_ctx.tab === 'cpp'))
                            throw 0;
                        return (__VLS_ctx.scrollToCppFunction(item.name));
                        // @ts-ignore
                        [currentPgs, currentPgs, vsMode, vsMode, vsTargetId, vsTargetId, tab, vsTargetPgs, vsTargetPgs, displaySummaryRows, cppLoading, cppLoading, cppError, cppError, cppOverlayLoading, cppLoadingStage, cppLayoutStyle, cppOutline, scrollToCppFunction,];
                    } },
                key: (item.name),
                ...{ class: "cpp-nav-item" },
                ...{ class: ({
                        'cpp-nav-mismatch': item.mismatch,
                        'cpp-nav-vi-flow': item.viFlowIssue,
                        'cpp-nav-vi-range': item.viRangeIssue,
                        'cpp-nav-active': __VLS_ctx.activeCppFunctionName === item.name
                    }) },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-nav-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['cpp-nav-mismatch']} */ ;
            /** @type {__VLS_StyleScopedClasses['cpp-nav-vi-flow']} */ ;
            /** @type {__VLS_StyleScopedClasses['cpp-nav-vi-range']} */ ;
            /** @type {__VLS_StyleScopedClasses['cpp-nav-active']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cpp-nav-index" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-nav-index']} */ ;
            (item.index);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cpp-nav-text" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-nav-text']} */ ;
            (item.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cpp-nav-mark" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-nav-mark']} */ ;
            // @ts-ignore
            [activeCppFunctionName,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onPointerdown: (__VLS_ctx.startCppNavResize) },
            ...{ class: "cpp-nav-resizer" },
            title: "调整 Function 导航宽度",
        });
        /** @type {__VLS_StyleScopedClasses['cpp-nav-resizer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "cpp-code-panes" },
            ...{ class: ({ 'cpp-vs-mode': __VLS_ctx.vsMode && __VLS_ctx.vsTargetId }) },
        });
        /** @type {__VLS_StyleScopedClasses['cpp-code-panes']} */ ;
        /** @type {__VLS_StyleScopedClasses['cpp-vs-mode']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cpp-pane" },
        });
        /** @type {__VLS_StyleScopedClasses['cpp-pane']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cpp-pane-head" },
        });
        /** @type {__VLS_StyleScopedClasses['cpp-pane-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "vs-prog-badge new-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['vs-prog-badge']} */ ;
        /** @type {__VLS_StyleScopedClasses['new-badge']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cpp-path" },
        });
        /** @type {__VLS_StyleScopedClasses['cpp-path']} */ ;
        (__VLS_ctx.cppDisplayPath);
        if (__VLS_ctx.cppEditMode) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.downloadModifiedCpp) },
                ...{ class: "cpp-download-btn" },
                disabled: (!__VLS_ctx.cppModifiedContent),
            });
            /** @type {__VLS_StyleScopedClasses['cpp-download-btn']} */ ;
        }
        if (__VLS_ctx.cppEditMode) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "cppLeftPane",
                ...{ class: "cpp-code-scroll cpp-edit-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-code-scroll']} */ ;
            /** @type {__VLS_StyleScopedClasses['cpp-edit-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "cppEditorHost",
                ...{ class: "cpp-codemirror-host" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-codemirror-host']} */ ;
        }
        else if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "cppLeftPane",
                ...{ class: "cpp-code-scroll cpp-edit-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-code-scroll']} */ ;
            /** @type {__VLS_StyleScopedClasses['cpp-edit-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "cppReadonlyHost",
                ...{ class: "cpp-codemirror-host" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-codemirror-host']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onScroll: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            throw 0;
                        if (!(__VLS_ctx.tab === 'cpp'))
                            throw 0;
                        if (!!(__VLS_ctx.cppEditMode))
                            throw 0;
                        if (!!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                            throw 0;
                        return (__VLS_ctx.syncCppScroll('left'));
                        // @ts-ignore
                        [vsMode, vsMode, vsTargetId, vsTargetId, startCppNavResize, cppDisplayPath, cppEditMode, cppEditMode, downloadModifiedCpp, cppModifiedContent, syncCppScroll,];
                    } },
                ref: "cppLeftPane",
                ...{ class: "cpp-code-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-code-scroll']} */ ;
            for (const [row] of __VLS_vFor((__VLS_ctx.cppDisplayRows))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onMouseenter: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                throw 0;
                            if (!(__VLS_ctx.tab === 'cpp'))
                                throw 0;
                            if (!!(__VLS_ctx.cppEditMode))
                                throw 0;
                            if (!!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                throw 0;
                            return (__VLS_ctx.hoveredCppRowKey = row.key);
                            // @ts-ignore
                            [cppDisplayRows, hoveredCppRowKey,];
                        } },
                    ...{ onMouseleave: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                throw 0;
                            if (!(__VLS_ctx.tab === 'cpp'))
                                throw 0;
                            if (!!(__VLS_ctx.cppEditMode))
                                throw 0;
                            if (!!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                throw 0;
                            return (__VLS_ctx.hoveredCppRowKey = '');
                            // @ts-ignore
                            [hoveredCppRowKey,];
                        } },
                    key: (row.key),
                    ...{ class: "cpp-line" },
                    ...{ class: ({
                            'cpp-diff-line': __VLS_ctx.isActiveCppFunction(row.funcName) && row.diff,
                            'cpp-empty-line': !row.left,
                            'cpp-hover-line': __VLS_ctx.hoveredCppRowKey === row.key,
                            'cpp-jump-line': __VLS_ctx.highlightedCppLineNo === row.left?.no
                        }) },
                    'data-left-line': (row.left?.no),
                    'data-left-func': (row.funcName || undefined),
                });
                /** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
                /** @type {__VLS_StyleScopedClasses['cpp-diff-line']} */ ;
                /** @type {__VLS_StyleScopedClasses['cpp-empty-line']} */ ;
                /** @type {__VLS_StyleScopedClasses['cpp-hover-line']} */ ;
                /** @type {__VLS_StyleScopedClasses['cpp-jump-line']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "cpp-line-no" },
                });
                /** @type {__VLS_StyleScopedClasses['cpp-line-no']} */ ;
                (row.left?.no ?? '');
                __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
                    ...{ class: "cpp-line-code" },
                });
                /** @type {__VLS_StyleScopedClasses['cpp-line-code']} */ ;
                for (const [token, i] of __VLS_vFor((__VLS_ctx.cppLineTokens(row.left?.text, row.funcName)))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        key: (i),
                        ...{ class: (`cpp-token-${token.type}`) },
                    });
                    (token.text);
                    // @ts-ignore
                    [hoveredCppRowKey, isActiveCppFunction, highlightedCppLineNo, cppLineTokens,];
                }
                // @ts-ignore
                [];
            }
            if (!__VLS_ctx.cppLines.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "cpp-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['cpp-empty']} */ ;
            }
        }
        if (__VLS_ctx.vsMode && __VLS_ctx.vsTargetId) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-pane" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-pane']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cpp-pane-head" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-pane-head']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "vs-prog-badge old-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['vs-prog-badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['old-badge']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cpp-path" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-path']} */ ;
            (__VLS_ctx.vsCppFile?.path ?? 'source/test.cpp');
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onScroll: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            throw 0;
                        if (!(__VLS_ctx.tab === 'cpp'))
                            throw 0;
                        if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId))
                            throw 0;
                        return (__VLS_ctx.syncCppScroll('right'));
                        // @ts-ignore
                        [vsMode, vsTargetId, syncCppScroll, cppLines, vsCppFile,];
                    } },
                ref: "cppRightPane",
                ...{ class: "cpp-code-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['cpp-code-scroll']} */ ;
            for (const [row] of __VLS_vFor((__VLS_ctx.cppDisplayRows))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onMouseenter: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                throw 0;
                            if (!(__VLS_ctx.tab === 'cpp'))
                                throw 0;
                            if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId))
                                throw 0;
                            return (__VLS_ctx.hoveredCppRowKey = row.key);
                            // @ts-ignore
                            [cppDisplayRows, hoveredCppRowKey,];
                        } },
                    ...{ onMouseleave: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                throw 0;
                            if (!(__VLS_ctx.tab === 'cpp'))
                                throw 0;
                            if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId))
                                throw 0;
                            return (__VLS_ctx.hoveredCppRowKey = '');
                            // @ts-ignore
                            [hoveredCppRowKey,];
                        } },
                    key: (row.key),
                    ...{ class: "cpp-line" },
                    ...{ class: ({
                            'cpp-diff-line': __VLS_ctx.isActiveCppFunction(row.funcName) && row.diff,
                            'cpp-empty-line': !row.right,
                            'cpp-hover-line': __VLS_ctx.hoveredCppRowKey === row.key,
                            'cpp-jump-line': __VLS_ctx.highlightedCppLineNo === row.right?.no
                        }) },
                    'data-right-line': (row.right?.no),
                    'data-right-func': (row.funcName || undefined),
                });
                /** @type {__VLS_StyleScopedClasses['cpp-line']} */ ;
                /** @type {__VLS_StyleScopedClasses['cpp-diff-line']} */ ;
                /** @type {__VLS_StyleScopedClasses['cpp-empty-line']} */ ;
                /** @type {__VLS_StyleScopedClasses['cpp-hover-line']} */ ;
                /** @type {__VLS_StyleScopedClasses['cpp-jump-line']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "cpp-line-no" },
                });
                /** @type {__VLS_StyleScopedClasses['cpp-line-no']} */ ;
                (row.right?.no ?? '');
                __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
                    ...{ class: "cpp-line-code" },
                });
                /** @type {__VLS_StyleScopedClasses['cpp-line-code']} */ ;
                for (const [token, i] of __VLS_vFor((__VLS_ctx.cppLineTokens(row.right?.text, row.funcName)))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        key: (i),
                        ...{ class: (`cpp-token-${token.type}`) },
                    });
                    (token.text);
                    // @ts-ignore
                    [hoveredCppRowKey, isActiveCppFunction, highlightedCppLineNo, cppLineTokens,];
                }
                // @ts-ignore
                [];
            }
            if (!__VLS_ctx.vsCppLines.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "cpp-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['cpp-empty']} */ ;
            }
        }
        if (!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
                ...{ class: "vi-check-panel" },
            });
            /** @type {__VLS_StyleScopedClasses['vi-check-panel']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "vi-check-head" },
            });
            /** @type {__VLS_StyleScopedClasses['vi-check-head']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "vi-check-title" },
            });
            /** @type {__VLS_StyleScopedClasses['vi-check-title']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "vi-check-subtitle" },
            });
            /** @type {__VLS_StyleScopedClasses['vi-check-subtitle']} */ ;
            (__VLS_ctx.activeCppFunctionName || 'Select Function');
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "vi-check-actions" },
            });
            /** @type {__VLS_StyleScopedClasses['vi-check-actions']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.runViCheck) },
                ...{ class: "vi-check-run" },
            });
            /** @type {__VLS_StyleScopedClasses['vi-check-run']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.toggleCppEdit) },
                ...{ class: "vi-check-action" },
                ...{ class: ({ 'vi-check-action-active': __VLS_ctx.cppEditMode }) },
                disabled: (!__VLS_ctx.cppFile?.content),
            });
            /** @type {__VLS_StyleScopedClasses['vi-check-action']} */ ;
            /** @type {__VLS_StyleScopedClasses['vi-check-action-active']} */ ;
            if (__VLS_ctx.viCheckEnabled && __VLS_ctx.isFirstCppFunctionActive && __VLS_ctx.viSourceMaxSummary.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "vi-max-summary" },
                });
                /** @type {__VLS_StyleScopedClasses['vi-max-summary']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "vi-max-summary-row vi-max-summary-head" },
                });
                /** @type {__VLS_StyleScopedClasses['vi-max-summary-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['vi-max-summary-head']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                for (const [item] of __VLS_vFor((__VLS_ctx.viSourceMaxSummary))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        key: (item.source),
                        ...{ class: "vi-max-summary-row" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vi-max-summary-row']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "vi-max-source" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vi-max-source']} */ ;
                    (item.source);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(__VLS_ctx.loading))
                                    throw 0;
                                if (!(__VLS_ctx.tab === 'cpp'))
                                    throw 0;
                                if (!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                    throw 0;
                                if (!(__VLS_ctx.viCheckEnabled && __VLS_ctx.isFirstCppFunctionActive && __VLS_ctx.viSourceMaxSummary.length))
                                    throw 0;
                                return (__VLS_ctx.scrollToViMaxLine(item.maxVoltageLine));
                                // @ts-ignore
                                [vsMode, vsTargetId, activeCppFunctionName, cppEditMode, vsCppLines, runViCheck, toggleCppEdit, cppFile, viCheckEnabled, isFirstCppFunctionActive, viSourceMaxSummary, viSourceMaxSummary, scrollToViMaxLine,];
                            } },
                        ...{ class: "vi-max-link" },
                        disabled: (!item.maxVoltageLine),
                    });
                    /** @type {__VLS_StyleScopedClasses['vi-max-link']} */ ;
                    (__VLS_ctx.formatViVoltage(item.maxVoltage));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(__VLS_ctx.loading))
                                    throw 0;
                                if (!(__VLS_ctx.tab === 'cpp'))
                                    throw 0;
                                if (!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                    throw 0;
                                if (!(__VLS_ctx.viCheckEnabled && __VLS_ctx.isFirstCppFunctionActive && __VLS_ctx.viSourceMaxSummary.length))
                                    throw 0;
                                return (__VLS_ctx.scrollToViMaxLine(item.maxCurrentLine));
                                // @ts-ignore
                                [scrollToViMaxLine, formatViVoltage,];
                            } },
                        ...{ class: "vi-max-link" },
                        disabled: (!item.maxCurrentLine),
                    });
                    /** @type {__VLS_StyleScopedClasses['vi-max-link']} */ ;
                    (__VLS_ctx.formatViCurrent(item.maxCurrent));
                    // @ts-ignore
                    [formatViCurrent,];
                }
            }
            if (!__VLS_ctx.viCheckEnabled) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "vi-check-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['vi-check-empty']} */ ;
            }
            else if (__VLS_ctx.isFirstCppFunctionActive && !__VLS_ctx.viSourceMaxSummary.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "vi-check-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['vi-check-empty']} */ ;
            }
            else if (!__VLS_ctx.isFirstCppFunctionActive) {
                if (!__VLS_ctx.activeCppFunctionName) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "vi-check-empty" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vi-check-empty']} */ ;
                }
                else if (!__VLS_ctx.activeViCheck) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "vi-check-empty" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vi-check-empty']} */ ;
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "vi-check-list" },
                    });
                    /** @type {__VLS_StyleScopedClasses['vi-check-list']} */ ;
                    for (const [source] of __VLS_vFor((__VLS_ctx.activeViCheck.sources))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            key: (source.source),
                            ...{ class: "vi-source-card" },
                            ...{ class: (`vi-source-${source.status}`) },
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-source-card']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "vi-source-name" },
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-source-name']} */ ;
                        (source.source);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "vi-source-metrics" },
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-source-metrics']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(__VLS_ctx.loading))
                                        throw 0;
                                    if (!(__VLS_ctx.tab === 'cpp'))
                                        throw 0;
                                    if (!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                        throw 0;
                                    if (!!(!__VLS_ctx.viCheckEnabled))
                                        throw 0;
                                    if (!!(__VLS_ctx.isFirstCppFunctionActive && !__VLS_ctx.viSourceMaxSummary.length))
                                        throw 0;
                                    if (!(!__VLS_ctx.isFirstCppFunctionActive))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeCppFunctionName))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeViCheck))
                                        throw 0;
                                    return (__VLS_ctx.scrollToViMaxLine(source.maxVoltageLine));
                                    // @ts-ignore
                                    [activeCppFunctionName, viCheckEnabled, isFirstCppFunctionActive, isFirstCppFunctionActive, viSourceMaxSummary, scrollToViMaxLine, activeViCheck, activeViCheck,];
                                } },
                            ...{ class: "vi-source-metric-link" },
                            disabled: (!source.maxVoltageLine),
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-source-metric-link']} */ ;
                        (__VLS_ctx.formatViVoltage(source.maxVoltage));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(__VLS_ctx.loading))
                                        throw 0;
                                    if (!(__VLS_ctx.tab === 'cpp'))
                                        throw 0;
                                    if (!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                        throw 0;
                                    if (!!(!__VLS_ctx.viCheckEnabled))
                                        throw 0;
                                    if (!!(__VLS_ctx.isFirstCppFunctionActive && !__VLS_ctx.viSourceMaxSummary.length))
                                        throw 0;
                                    if (!(!__VLS_ctx.isFirstCppFunctionActive))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeCppFunctionName))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeViCheck))
                                        throw 0;
                                    return (__VLS_ctx.scrollToViMaxLine(source.maxCurrentLine));
                                    // @ts-ignore
                                    [scrollToViMaxLine, formatViVoltage,];
                                } },
                            ...{ class: "vi-source-metric-link" },
                            disabled: (!source.maxCurrentLine),
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-source-metric-link']} */ ;
                        (__VLS_ctx.formatViCurrent(source.maxCurrent));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "vi-source-links" },
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-source-links']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(__VLS_ctx.loading))
                                        throw 0;
                                    if (!(__VLS_ctx.tab === 'cpp'))
                                        throw 0;
                                    if (!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                        throw 0;
                                    if (!!(!__VLS_ctx.viCheckEnabled))
                                        throw 0;
                                    if (!!(__VLS_ctx.isFirstCppFunctionActive && !__VLS_ctx.viSourceMaxSummary.length))
                                        throw 0;
                                    if (!(!__VLS_ctx.isFirstCppFunctionActive))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeCppFunctionName))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeViCheck))
                                        throw 0;
                                    return (__VLS_ctx.scrollToCppLine(source.applyLine));
                                    // @ts-ignore
                                    [formatViCurrent, scrollToCppLine,];
                                } },
                            ...{ class: "vi-line-link" },
                            disabled: (!source.applyLine),
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-line-link']} */ ;
                        (source.applyLine ?? '-');
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(__VLS_ctx.loading))
                                        throw 0;
                                    if (!(__VLS_ctx.tab === 'cpp'))
                                        throw 0;
                                    if (!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                        throw 0;
                                    if (!!(!__VLS_ctx.viCheckEnabled))
                                        throw 0;
                                    if (!!(__VLS_ctx.isFirstCppFunctionActive && !__VLS_ctx.viSourceMaxSummary.length))
                                        throw 0;
                                    if (!(!__VLS_ctx.isFirstCppFunctionActive))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeCppFunctionName))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeViCheck))
                                        throw 0;
                                    return (__VLS_ctx.scrollToCppLine(source.zeroLine));
                                    // @ts-ignore
                                    [scrollToCppLine,];
                                } },
                            ...{ class: "vi-line-link" },
                            disabled: (!source.zeroLine),
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-line-link']} */ ;
                        (source.zeroLine ?? '-');
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(__VLS_ctx.loading))
                                        throw 0;
                                    if (!(__VLS_ctx.tab === 'cpp'))
                                        throw 0;
                                    if (!(!(__VLS_ctx.vsMode && __VLS_ctx.vsTargetId)))
                                        throw 0;
                                    if (!!(!__VLS_ctx.viCheckEnabled))
                                        throw 0;
                                    if (!!(__VLS_ctx.isFirstCppFunctionActive && !__VLS_ctx.viSourceMaxSummary.length))
                                        throw 0;
                                    if (!(!__VLS_ctx.isFirstCppFunctionActive))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeCppFunctionName))
                                        throw 0;
                                    if (!!(!__VLS_ctx.activeViCheck))
                                        throw 0;
                                    return (__VLS_ctx.scrollToCppLine(source.offLine));
                                    // @ts-ignore
                                    [scrollToCppLine,];
                                } },
                            ...{ class: "vi-line-link" },
                            disabled: (!source.offLine),
                        });
                        /** @type {__VLS_StyleScopedClasses['vi-line-link']} */ ;
                        (source.offLine ?? '-');
                        // @ts-ignore
                        [];
                    }
                }
            }
        }
    }
    if (__VLS_ctx.tab === 'datasheet') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pgs-body datasheet-body" },
        });
        /** @type {__VLS_StyleScopedClasses['pgs-body']} */ ;
        /** @type {__VLS_StyleScopedClasses['datasheet-body']} */ ;
        if (__VLS_ctx.datasheetLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "ds-loading" },
            });
            /** @type {__VLS_StyleScopedClasses['ds-loading']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "ds-header-card" },
            });
            /** @type {__VLS_StyleScopedClasses['ds-header-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "ds-meta-info" },
            });
            /** @type {__VLS_StyleScopedClasses['ds-meta-info']} */ ;
            if (__VLS_ctx.datasheetInfo) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "ds-status-ok" },
                });
                /** @type {__VLS_StyleScopedClasses['ds-status-ok']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-badge active" },
                });
                /** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
                /** @type {__VLS_StyleScopedClasses['active']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "info-item" },
                });
                /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (__VLS_ctx.datasheetInfo.product_name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "info-item" },
                });
                /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
                    title: (__VLS_ctx.datasheetInfo.filename),
                });
                (__VLS_ctx.datasheetInfo.filename);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "info-item" },
                });
                /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (__VLS_ctx.datasheetInfo.revision);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "info-item" },
                });
                /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (__VLS_ctx.formatDate(__VLS_ctx.datasheetInfo.created_at));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "ds-status-empty" },
                });
                /** @type {__VLS_StyleScopedClasses['ds-status-empty']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-badge empty" },
                });
                /** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
                /** @type {__VLS_StyleScopedClasses['empty']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "warning-text" },
                });
                /** @type {__VLS_StyleScopedClasses['warning-text']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "ds-actions" },
            });
            /** @type {__VLS_StyleScopedClasses['ds-actions']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "upload-btn-group" },
            });
            /** @type {__VLS_StyleScopedClasses['upload-btn-group']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.triggerChecklistSelect) },
                ...{ class: "btn btn-action" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['btn-action']} */ ;
            (__VLS_ctx.datasheetInfo ? '更新 Mappings & Specs (Excel)' : '上传 Mappings & Specs (Excel)');
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (__VLS_ctx.handleChecklistUpload) },
                ref: "xlsxInput",
                type: "file",
                accept: ".xlsx,.xls",
                ...{ style: {} },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.triggerDatasheetSelect) },
                ...{ class: "btn btn-action" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['btn-action']} */ ;
            (__VLS_ctx.datasheetInfo ? '更新 Datasheet EC (Word)' : '上传 Datasheet EC (Word)');
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (__VLS_ctx.handleDatasheetUpload) },
                ref: "docxInput",
                type: "file",
                accept: ".docx",
                ...{ style: {} },
            });
            if (__VLS_ctx.datasheetInfo) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "ds-filter-panel" },
                });
                /** @type {__VLS_StyleScopedClasses['ds-filter-panel']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "filter-controls" },
                });
                /** @type {__VLS_StyleScopedClasses['filter-controls']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    placeholder: "🔍 过滤 Symbol / 描述 / 状态...",
                    ...{ class: "filter-input-ds" },
                });
                (__VLS_ctx.datasheetFilter);
                /** @type {__VLS_StyleScopedClasses['filter-input-ds']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                    ...{ class: "hide-col-cb" },
                });
                /** @type {__VLS_StyleScopedClasses['hide-col-cb']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "checkbox",
                });
                (__VLS_ctx.hideParamNameAndCond);
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-selector" },
                });
                /** @type {__VLS_StyleScopedClasses['status-selector']} */ ;
                for (const [st] of __VLS_vFor((['all', 'out_of_spec', 'warning', 'unmapped', 'normal']))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(__VLS_ctx.loading))
                                    throw 0;
                                if (!(__VLS_ctx.tab === 'datasheet'))
                                    throw 0;
                                if (!!(__VLS_ctx.datasheetLoading))
                                    throw 0;
                                if (!(__VLS_ctx.datasheetInfo))
                                    throw 0;
                                return (__VLS_ctx.datasheetStatusFilter = st);
                                // @ts-ignore
                                [tab, datasheetLoading, datasheetInfo, datasheetInfo, datasheetInfo, datasheetInfo, datasheetInfo, datasheetInfo, datasheetInfo, datasheetInfo, datasheetInfo, formatDate, triggerChecklistSelect, handleChecklistUpload, triggerDatasheetSelect, handleDatasheetUpload, datasheetFilter, hideParamNameAndCond, datasheetStatusFilter,];
                            } },
                        key: (st),
                        ...{ class: "st-btn" },
                        ...{ class: ({ active: __VLS_ctx.datasheetStatusFilter === st, [st]: true }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['st-btn']} */ ;
                    /** @type {__VLS_StyleScopedClasses['active']} */ ;
                    (__VLS_ctx.getStatusLabel(st));
                    (__VLS_ctx.getStatusCount(st));
                    // @ts-ignore
                    [datasheetStatusFilter, getStatusLabel, getStatusCount,];
                }
            }
            if (__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "table-wrap" },
                });
                /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                    ...{ class: "ds-report-tbl" },
                });
                /** @type {__VLS_StyleScopedClasses['ds-report-tbl']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.colgroup, __VLS_intrinsics.colgroup)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: ({ width: __VLS_ctx.dsSymWidth + 'px' }) },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: ({ width: __VLS_ctx.ateSymWidth + 'px' }) },
                });
                if (!__VLS_ctx.hideParamNameAndCond) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                        ...{ style: ({ width: __VLS_ctx.descWidth + 'px' }) },
                    });
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: ({ width: __VLS_ctx.msgWidth + 'px' }) },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: ({ width: __VLS_ctx.remarkWidth + 'px' }) },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    rowspan: "2",
                    ...{ class: "col-no" },
                });
                /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    rowspan: "2",
                    ...{ class: "col-ds-sym resizable" },
                    ...{ style: (__VLS_ctx.dsSymWidth ? { width: __VLS_ctx.dsSymWidth + 'px', minWidth: __VLS_ctx.dsSymWidth + 'px', maxWidth: __VLS_ctx.dsSymWidth + 'px' } : {}) },
                });
                /** @type {__VLS_StyleScopedClasses['col-ds-sym']} */ ;
                /** @type {__VLS_StyleScopedClasses['resizable']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onMousedown: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                throw 0;
                            if (!(__VLS_ctx.tab === 'datasheet'))
                                throw 0;
                            if (!!(__VLS_ctx.datasheetLoading))
                                throw 0;
                            if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                throw 0;
                            return (__VLS_ctx.startResize($event, 'ds_sym'));
                            // @ts-ignore
                            [datasheetInfo, hideParamNameAndCond, filteredDsRows, dsSymWidth, dsSymWidth, dsSymWidth, dsSymWidth, dsSymWidth, ateSymWidth, descWidth, msgWidth, remarkWidth, startResize,];
                        } },
                    ...{ class: "resize-handle" },
                });
                /** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    rowspan: "2",
                    ...{ class: "col-sym resizable" },
                    ...{ style: (__VLS_ctx.ateSymWidth ? { width: __VLS_ctx.ateSymWidth + 'px', minWidth: __VLS_ctx.ateSymWidth + 'px', maxWidth: __VLS_ctx.ateSymWidth + 'px' } : {}) },
                });
                /** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
                /** @type {__VLS_StyleScopedClasses['resizable']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onMousedown: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                throw 0;
                            if (!(__VLS_ctx.tab === 'datasheet'))
                                throw 0;
                            if (!!(__VLS_ctx.datasheetLoading))
                                throw 0;
                            if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                throw 0;
                            return (__VLS_ctx.startResize($event, 'ate_sym'));
                            // @ts-ignore
                            [ateSymWidth, ateSymWidth, ateSymWidth, ateSymWidth, startResize,];
                        } },
                    ...{ class: "resize-handle" },
                });
                /** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
                if (!__VLS_ctx.hideParamNameAndCond) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                        rowspan: "2",
                        ...{ class: "col-desc resizable" },
                        ...{ style: (__VLS_ctx.descWidth ? { width: __VLS_ctx.descWidth + 'px', minWidth: __VLS_ctx.descWidth + 'px', maxWidth: __VLS_ctx.descWidth + 'px' } : {}) },
                    });
                    /** @type {__VLS_StyleScopedClasses['col-desc']} */ ;
                    /** @type {__VLS_StyleScopedClasses['resizable']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ onMousedown: (...[$event]) => {
                                if (!!(__VLS_ctx.loading))
                                    throw 0;
                                if (!(__VLS_ctx.tab === 'datasheet'))
                                    throw 0;
                                if (!!(__VLS_ctx.datasheetLoading))
                                    throw 0;
                                if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                    throw 0;
                                if (!(!__VLS_ctx.hideParamNameAndCond))
                                    throw 0;
                                return (__VLS_ctx.startResize($event, 'desc'));
                                // @ts-ignore
                                [hideParamNameAndCond, descWidth, descWidth, descWidth, descWidth, startResize,];
                            } },
                        ...{ class: "resize-handle" },
                    });
                    /** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    rowspan: "2",
                    ...{ class: "col-unit" },
                });
                /** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    colspan: "3",
                    ...{ class: "hdr-group ds-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['hdr-group']} */ ;
                /** @type {__VLS_StyleScopedClasses['ds-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    colspan: "2",
                    ...{ class: "hdr-group ate-ft-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['hdr-group']} */ ;
                /** @type {__VLS_StyleScopedClasses['ate-ft-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    colspan: "2",
                    ...{ class: "hdr-group ate-qa-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['hdr-group']} */ ;
                /** @type {__VLS_StyleScopedClasses['ate-qa-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    rowspan: "2",
                    ...{ class: "col-mult" },
                });
                /** @type {__VLS_StyleScopedClasses['col-mult']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    rowspan: "2",
                    ...{ class: "col-status" },
                });
                /** @type {__VLS_StyleScopedClasses['col-status']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    rowspan: "2",
                    ...{ class: "col-msg resizable" },
                    ...{ style: (__VLS_ctx.msgWidth ? { width: __VLS_ctx.msgWidth + 'px', minWidth: __VLS_ctx.msgWidth + 'px', maxWidth: __VLS_ctx.msgWidth + 'px' } : {}) },
                });
                /** @type {__VLS_StyleScopedClasses['col-msg']} */ ;
                /** @type {__VLS_StyleScopedClasses['resizable']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onMousedown: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                throw 0;
                            if (!(__VLS_ctx.tab === 'datasheet'))
                                throw 0;
                            if (!!(__VLS_ctx.datasheetLoading))
                                throw 0;
                            if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                throw 0;
                            return (__VLS_ctx.startResize($event, 'msg'));
                            // @ts-ignore
                            [msgWidth, msgWidth, msgWidth, msgWidth, startResize,];
                        } },
                    ...{ class: "resize-handle" },
                });
                /** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    rowspan: "2",
                    ...{ class: "col-remark resizable" },
                    ...{ style: (__VLS_ctx.remarkWidth ? { width: __VLS_ctx.remarkWidth + 'px', minWidth: __VLS_ctx.remarkWidth + 'px', maxWidth: __VLS_ctx.remarkWidth + 'px' } : {}) },
                });
                /** @type {__VLS_StyleScopedClasses['col-remark']} */ ;
                /** @type {__VLS_StyleScopedClasses['resizable']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onMousedown: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                throw 0;
                            if (!(__VLS_ctx.tab === 'datasheet'))
                                throw 0;
                            if (!!(__VLS_ctx.datasheetLoading))
                                throw 0;
                            if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                throw 0;
                            return (__VLS_ctx.startResize($event, 'remark'));
                            // @ts-ignore
                            [remarkWidth, remarkWidth, remarkWidth, remarkWidth, startResize,];
                        } },
                    ...{ class: "resize-handle" },
                });
                /** @type {__VLS_StyleScopedClasses['resize-handle']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "col-num sub-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['sub-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "col-num sub-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['sub-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "col-num sub-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['sub-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "col-num sub-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['sub-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "col-num sub-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['sub-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "col-num sub-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['sub-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "col-num sub-hdr" },
                });
                /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                /** @type {__VLS_StyleScopedClasses['sub-hdr']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
                for (const [row, idx] of __VLS_vFor((__VLS_ctx.filteredDsRows))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                        key: (idx),
                        ...{ class: "ds-row" },
                        ...{ class: (['status-' + row.status]) },
                    });
                    /** @type {__VLS_StyleScopedClasses['ds-row']} */ ;
                    if (row.status === 'category') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-no" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
                        (idx + 1);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            colspan: (__VLS_ctx.hideParamNameAndCond ? 14 : 15),
                            ...{ class: "col-category-title" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-category-title']} */ ;
                        (row.datasheet_symbol);
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-no" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-no']} */ ;
                        (idx + 1);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-ds-sym bold-text" },
                            ...{ style: (__VLS_ctx.dsSymWidth ? { width: __VLS_ctx.dsSymWidth + 'px', minWidth: __VLS_ctx.dsSymWidth + 'px', maxWidth: __VLS_ctx.dsSymWidth + 'px' } : {}) },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-ds-sym']} */ ;
                        /** @type {__VLS_StyleScopedClasses['bold-text']} */ ;
                        (row.datasheet_symbol);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ onDblclick: (...[$event]) => {
                                    if (!!(__VLS_ctx.loading))
                                        throw 0;
                                    if (!(__VLS_ctx.tab === 'datasheet'))
                                        throw 0;
                                    if (!!(__VLS_ctx.datasheetLoading))
                                        throw 0;
                                    if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                        throw 0;
                                    if (!!(row.status === 'category'))
                                        throw 0;
                                    return (__VLS_ctx.openMappingEdit(row));
                                    // @ts-ignore
                                    [hideParamNameAndCond, filteredDsRows, dsSymWidth, dsSymWidth, dsSymWidth, dsSymWidth, openMappingEdit,];
                                } },
                            ...{ class: "col-sym font-mono editable-cell" },
                            ...{ style: (__VLS_ctx.ateSymWidth ? { width: __VLS_ctx.ateSymWidth + 'px', minWidth: __VLS_ctx.ateSymWidth + 'px', maxWidth: __VLS_ctx.ateSymWidth + 'px' } : {}) },
                            title: "双击进行编辑关联",
                        });
                        /** @type {__VLS_StyleScopedClasses['col-sym']} */ ;
                        /** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
                        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
                        (row.ate_symbol || '-');
                        if (!__VLS_ctx.hideParamNameAndCond) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                                ...{ class: "col-desc" },
                                ...{ style: (__VLS_ctx.descWidth ? { width: __VLS_ctx.descWidth + 'px', minWidth: __VLS_ctx.descWidth + 'px', maxWidth: __VLS_ctx.descWidth + 'px' } : {}) },
                            });
                            /** @type {__VLS_StyleScopedClasses['col-desc']} */ ;
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ class: "p-name" },
                            });
                            /** @type {__VLS_StyleScopedClasses['p-name']} */ ;
                            (row.parameter_name);
                            if (row.condition) {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                    ...{ class: "p-cond" },
                                });
                                /** @type {__VLS_StyleScopedClasses['p-cond']} */ ;
                                (row.condition);
                            }
                        }
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-unit" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-unit']} */ ;
                        (row.unit || '-');
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-num spec-cell editable-cell" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                        /** @type {__VLS_StyleScopedClasses['spec-cell']} */ ;
                        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
                        if (__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'min') {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ class: "spec-edit-wrap" },
                            });
                            /** @type {__VLS_StyleScopedClasses['spec-edit-wrap']} */ ;
                            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                                ...{ onBlur: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'min'))
                                            throw 0;
                                        return (__VLS_ctx.saveSpec(row));
                                        // @ts-ignore
                                        [hideParamNameAndCond, ateSymWidth, ateSymWidth, ateSymWidth, ateSymWidth, descWidth, descWidth, descWidth, descWidth, editingSpecRowId, editingSpecField, saveSpec,];
                                    } },
                                ...{ onKeyup: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'min'))
                                            throw 0;
                                        return (__VLS_ctx.saveSpec(row));
                                        // @ts-ignore
                                        [saveSpec,];
                                    } },
                                ...{ onKeyup: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'min'))
                                            throw 0;
                                        return (__VLS_ctx.editingSpecRowId = null);
                                        // @ts-ignore
                                        [editingSpecRowId,];
                                    } },
                                ...{ class: "spec-input-inline" },
                            });
                            (__VLS_ctx.localSpecVal);
                            __VLS_asFunctionalDirective(__VLS_directives.vFocus, {})(null, { ...__VLS_directiveBindingRestFields, }, null, null);
                            /** @type {__VLS_StyleScopedClasses['spec-input-inline']} */ ;
                        }
                        else {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ onDblclick: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'min'))
                                            throw 0;
                                        return (__VLS_ctx.startEditSpec(row, 'min'));
                                        // @ts-ignore
                                        [localSpecVal, vFocus, startEditSpec,];
                                    } },
                                ...{ class: "spec-text-cell" },
                                title: "双击编辑Min规格",
                            });
                            /** @type {__VLS_StyleScopedClasses['spec-text-cell']} */ ;
                            for (const [v, i] of __VLS_vFor((__VLS_ctx.splitSpecStr(row.ds_min_str)))) {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                    key: (i),
                                    ...{ class: "spec-val-line" },
                                });
                                /** @type {__VLS_StyleScopedClasses['spec-val-line']} */ ;
                                (v);
                                // @ts-ignore
                                [splitSpecStr,];
                            }
                        }
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-num spec-cell editable-cell" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                        /** @type {__VLS_StyleScopedClasses['spec-cell']} */ ;
                        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
                        if (__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'typ') {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ class: "spec-edit-wrap" },
                            });
                            /** @type {__VLS_StyleScopedClasses['spec-edit-wrap']} */ ;
                            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                                ...{ onBlur: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'typ'))
                                            throw 0;
                                        return (__VLS_ctx.saveSpec(row));
                                        // @ts-ignore
                                        [editingSpecRowId, editingSpecField, saveSpec,];
                                    } },
                                ...{ onKeyup: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'typ'))
                                            throw 0;
                                        return (__VLS_ctx.saveSpec(row));
                                        // @ts-ignore
                                        [saveSpec,];
                                    } },
                                ...{ onKeyup: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'typ'))
                                            throw 0;
                                        return (__VLS_ctx.editingSpecRowId = null);
                                        // @ts-ignore
                                        [editingSpecRowId,];
                                    } },
                                ...{ class: "spec-input-inline" },
                            });
                            (__VLS_ctx.localSpecVal);
                            __VLS_asFunctionalDirective(__VLS_directives.vFocus, {})(null, { ...__VLS_directiveBindingRestFields, }, null, null);
                            /** @type {__VLS_StyleScopedClasses['spec-input-inline']} */ ;
                        }
                        else {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ onDblclick: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'typ'))
                                            throw 0;
                                        return (__VLS_ctx.startEditSpec(row, 'typ'));
                                        // @ts-ignore
                                        [localSpecVal, vFocus, startEditSpec,];
                                    } },
                                ...{ class: "spec-text-cell" },
                                title: "双击编辑Typ规格",
                            });
                            /** @type {__VLS_StyleScopedClasses['spec-text-cell']} */ ;
                            for (const [v, i] of __VLS_vFor((__VLS_ctx.splitSpecStr(row.ds_typ_str)))) {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                    key: (i),
                                    ...{ class: "spec-val-line" },
                                });
                                /** @type {__VLS_StyleScopedClasses['spec-val-line']} */ ;
                                (v);
                                // @ts-ignore
                                [splitSpecStr,];
                            }
                        }
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-num spec-cell editable-cell" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                        /** @type {__VLS_StyleScopedClasses['spec-cell']} */ ;
                        /** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
                        if (__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'max') {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ class: "spec-edit-wrap" },
                            });
                            /** @type {__VLS_StyleScopedClasses['spec-edit-wrap']} */ ;
                            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                                ...{ onBlur: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'max'))
                                            throw 0;
                                        return (__VLS_ctx.saveSpec(row));
                                        // @ts-ignore
                                        [editingSpecRowId, editingSpecField, saveSpec,];
                                    } },
                                ...{ onKeyup: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'max'))
                                            throw 0;
                                        return (__VLS_ctx.saveSpec(row));
                                        // @ts-ignore
                                        [saveSpec,];
                                    } },
                                ...{ onKeyup: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'max'))
                                            throw 0;
                                        return (__VLS_ctx.editingSpecRowId = null);
                                        // @ts-ignore
                                        [editingSpecRowId,];
                                    } },
                                ...{ class: "spec-input-inline" },
                            });
                            (__VLS_ctx.localSpecVal);
                            __VLS_asFunctionalDirective(__VLS_directives.vFocus, {})(null, { ...__VLS_directiveBindingRestFields, }, null, null);
                            /** @type {__VLS_StyleScopedClasses['spec-input-inline']} */ ;
                        }
                        else {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ onDblclick: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!!(__VLS_ctx.editingSpecRowId === row.datasheet_symbol && __VLS_ctx.editingSpecField === 'max'))
                                            throw 0;
                                        return (__VLS_ctx.startEditSpec(row, 'max'));
                                        // @ts-ignore
                                        [localSpecVal, vFocus, startEditSpec,];
                                    } },
                                ...{ class: "spec-text-cell" },
                                title: "双击编辑Max规格",
                            });
                            /** @type {__VLS_StyleScopedClasses['spec-text-cell']} */ ;
                            for (const [v, i] of __VLS_vFor((__VLS_ctx.splitSpecStr(row.ds_max_str)))) {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                    key: (i),
                                    ...{ class: "spec-val-line" },
                                });
                                /** @type {__VLS_StyleScopedClasses['spec-val-line']} */ ;
                                (v);
                                // @ts-ignore
                                [splitSpecStr,];
                            }
                        }
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-num ft-cell" },
                            ...{ class: ({ 'violates': __VLS_ctx.isValViolated(row, 'ft_min') }) },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                        /** @type {__VLS_StyleScopedClasses['ft-cell']} */ ;
                        /** @type {__VLS_StyleScopedClasses['violates']} */ ;
                        (__VLS_ctx.fmtLimitVal(row.ft_min));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-num ft-cell" },
                            ...{ class: ({ 'violates': __VLS_ctx.isValViolated(row, 'ft_max') }) },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                        /** @type {__VLS_StyleScopedClasses['ft-cell']} */ ;
                        /** @type {__VLS_StyleScopedClasses['violates']} */ ;
                        (__VLS_ctx.fmtLimitVal(row.ft_max));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-num qa-cell" },
                            ...{ class: ({ 'violates': __VLS_ctx.isValViolated(row, 'qa_min') }) },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                        /** @type {__VLS_StyleScopedClasses['qa-cell']} */ ;
                        /** @type {__VLS_StyleScopedClasses['violates']} */ ;
                        (__VLS_ctx.fmtLimitVal(row.qa_min));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-num qa-cell" },
                            ...{ class: ({ 'violates': __VLS_ctx.isValViolated(row, 'qa_max') }) },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
                        /** @type {__VLS_StyleScopedClasses['qa-cell']} */ ;
                        /** @type {__VLS_StyleScopedClasses['violates']} */ ;
                        (__VLS_ctx.fmtLimitVal(row.qa_max));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-mult font-mono" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-mult']} */ ;
                        /** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
                        (row.ate_unit || '-');
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-status" },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-status']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "status-tag" },
                            ...{ class: ([row.status]) },
                        });
                        /** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
                        (__VLS_ctx.getStatusLabel(row.status));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-msg" },
                            ...{ class: ([row.status]) },
                            title: (row.message),
                            ...{ style: (__VLS_ctx.msgWidth ? { width: __VLS_ctx.msgWidth + 'px', minWidth: __VLS_ctx.msgWidth + 'px', maxWidth: __VLS_ctx.msgWidth + 'px' } : {}) },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-msg']} */ ;
                        if (row.status !== 'normal' && row.status !== 'unmapped') {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                            (row.message);
                        }
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "col-remark" },
                            ...{ style: (__VLS_ctx.remarkWidth ? { width: __VLS_ctx.remarkWidth + 'px', minWidth: __VLS_ctx.remarkWidth + 'px', maxWidth: __VLS_ctx.remarkWidth + 'px' } : {}) },
                        });
                        /** @type {__VLS_StyleScopedClasses['col-remark']} */ ;
                        if (__VLS_ctx.editingRemarkId === row.datasheet_symbol) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ class: "remark-edit-wrap" },
                            });
                            /** @type {__VLS_StyleScopedClasses['remark-edit-wrap']} */ ;
                            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                                ...{ onBlur: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingRemarkId === row.datasheet_symbol))
                                            throw 0;
                                        return (__VLS_ctx.saveRemark(row));
                                        // @ts-ignore
                                        [getStatusLabel, msgWidth, msgWidth, msgWidth, msgWidth, remarkWidth, remarkWidth, remarkWidth, remarkWidth, isValViolated, isValViolated, isValViolated, isValViolated, fmtLimitVal, fmtLimitVal, fmtLimitVal, fmtLimitVal, editingRemarkId, saveRemark,];
                                    } },
                                ...{ onKeyup: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingRemarkId === row.datasheet_symbol))
                                            throw 0;
                                        return (__VLS_ctx.saveRemark(row));
                                        // @ts-ignore
                                        [saveRemark,];
                                    } },
                                ...{ onKeyup: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!(__VLS_ctx.editingRemarkId === row.datasheet_symbol))
                                            throw 0;
                                        return (__VLS_ctx.editingRemarkId = null);
                                        // @ts-ignore
                                        [editingRemarkId,];
                                    } },
                                ...{ class: "remark-input-inline" },
                            });
                            (__VLS_ctx.localRemark);
                            __VLS_asFunctionalDirective(__VLS_directives.vFocus, {})(null, { ...__VLS_directiveBindingRestFields, }, null, null);
                            /** @type {__VLS_StyleScopedClasses['remark-input-inline']} */ ;
                        }
                        else {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                                ...{ onDblclick: (...[$event]) => {
                                        if (!!(__VLS_ctx.loading))
                                            throw 0;
                                        if (!(__VLS_ctx.tab === 'datasheet'))
                                            throw 0;
                                        if (!!(__VLS_ctx.datasheetLoading))
                                            throw 0;
                                        if (!(__VLS_ctx.datasheetInfo && __VLS_ctx.filteredDsRows.length > 0))
                                            throw 0;
                                        if (!!(row.status === 'category'))
                                            throw 0;
                                        if (!!(__VLS_ctx.editingRemarkId === row.datasheet_symbol))
                                            throw 0;
                                        return (__VLS_ctx.startEditRemark(row));
                                        // @ts-ignore
                                        [vFocus, localRemark, startEditRemark,];
                                    } },
                                ...{ class: "remark-text-cell" },
                                title: "双击编辑备注",
                            });
                            /** @type {__VLS_StyleScopedClasses['remark-text-cell']} */ ;
                            (row.remark || '-');
                        }
                    }
                    // @ts-ignore
                    [];
                }
            }
            else if (__VLS_ctx.datasheetInfo) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "ds-empty-msg" },
                });
                /** @type {__VLS_StyleScopedClasses['ds-empty-msg']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "ds-empty-placeholder" },
                });
                /** @type {__VLS_StyleScopedClasses['ds-empty-placeholder']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "placeholder-icon" },
                });
                /** @type {__VLS_StyleScopedClasses['placeholder-icon']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.ol, __VLS_intrinsics.ol)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
            }
        }
    }
}
if (__VLS_ctx.editingMapping) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingMapping))
                    throw 0;
                return (__VLS_ctx.editingMapping = null);
                // @ts-ignore
                [datasheetInfo, editingMapping, editingMapping,];
            } },
        ...{ class: "modal-backdrop" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mapping-modal-card" },
    });
    /** @type {__VLS_StyleScopedClasses['mapping-modal-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingMapping))
                    throw 0;
                return (__VLS_ctx.editingMapping = null);
                // @ts-ignore
                [editingMapping,];
            } },
        ...{ class: "close-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "modal-tip" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-tip']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.editingMapping.datasheet_symbol);
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        placeholder: "🔍 搜索 ATE 参数符号...",
        ...{ class: "modal-search-input" },
        ref: "mappingSearchInput",
    });
    (__VLS_ctx.mappingSearch);
    /** @type {__VLS_StyleScopedClasses['modal-search-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-list-container" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-list-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingMapping))
                    throw 0;
                return (__VLS_ctx.selectedAteSymbol = '-');
                // @ts-ignore
                [editingMapping, mappingSearch, selectedAteSymbol,];
            } },
        ...{ class: "list-item" },
        ...{ class: ({ selected: __VLS_ctx.selectedAteSymbol === '-' }) },
    });
    /** @type {__VLS_StyleScopedClasses['list-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['selected']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
    for (const [sym] of __VLS_vFor((__VLS_ctx.filteredAteSymbols))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.editingMapping))
                        throw 0;
                    return (__VLS_ctx.selectedAteSymbol = sym);
                    // @ts-ignore
                    [selectedAteSymbol, selectedAteSymbol, filteredAteSymbols,];
                } },
            key: (sym),
            ...{ class: "list-item" },
            ...{ class: ({ selected: __VLS_ctx.selectedAteSymbol === sym }) },
        });
        /** @type {__VLS_StyleScopedClasses['list-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['selected']} */ ;
        (sym);
        // @ts-ignore
        [selectedAteSymbol,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingMapping))
                    throw 0;
                return (__VLS_ctx.editingMapping = null);
                // @ts-ignore
                [editingMapping,];
            } },
        ...{ class: "btn btn-secondary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.saveMapping) },
        ...{ class: "btn btn-primary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
}
// @ts-ignore
[saveMapping,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
