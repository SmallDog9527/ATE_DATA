import { ref, computed, onMounted, watch } from 'vue';
import api from '@/api';
import { useTimezoneStore } from '@/stores/timezone';
import { fmtDateTz } from '@/utils/dateUtils';
export default {};
const __VLS_self = (await import('vue')).defineComponent({
    name: 'ReportCenterView'
});
const __VLS_export = await (async () => {
    const reports = ref([]);
    const searchQuery = ref('');
    const sortBy = ref('createTime');
    const sortOrder = ref('desc');
    const activeTab = ref('eng');
    const osatRangeValue = ref(2);
    const osatRangeUnit = ref('weeks');
    const updatingOsat = ref(false);
    const osatUpdateMsg = ref(null);
    const editingId = ref(null);
    const editName = ref('');
    const selectedProducts = ref([]);
    const currentUsername = ref('unknown');
    const isGlobalViewer = ref(false);
    function loadUserInfo() {
        try {
            const userInfoStr = localStorage.getItem('user');
            if (userInfoStr) {
                const userInfo = JSON.parse(userInfoStr);
                const username = (userInfo.username || '').toLowerCase().trim();
                currentUsername.value = username || 'unknown';
                const role = (userInfo.role || '').toLowerCase().trim();
                isGlobalViewer.value = role === 'admin' || role === 'eng';
            }
        }
        catch (e) { }
    }
    function canModify(report) {
        let role = '';
        try {
            const userInfoStr = localStorage.getItem('user');
            if (userInfoStr) {
                role = (JSON.parse(userInfoStr).role || '').toLowerCase().trim();
            }
        }
        catch (e) { }
        if (role === 'admin')
            return true;
        if ((report.source || 'eng') === 'osat')
            return false;
        const loggedInUsername = currentUsername.value.toLowerCase().trim();
        const reportUsername = (report.username || '').toLowerCase().trim();
        return loggedInUsername === reportUsername;
    }
    const allowedReports = computed(() => {
        const sourceReports = reports.value.filter(r => (r.source || 'eng') === activeTab.value);
        if (isGlobalViewer.value) {
            return sourceReports;
        }
        const curUser = currentUsername.value.toLowerCase().trim();
        return sourceReports.filter((r) => {
            const repUser = (r.username || '').toLowerCase().trim();
            return repUser === curUser;
        });
    });
    const tableColspan = computed(() => {
        let cols = isGlobalViewer.value ? 8 : 7;
        if (activeTab.value === 'osat')
            cols += 2;
        return cols;
    });
    const uniqueProducts = computed(() => {
        const prods = new Set();
        allowedReports.value.forEach(r => {
            if (r.product_name)
                prods.add(r.product_name);
            else
                prods.add('Unknown');
        });
        return Array.from(prods).sort();
    });
    // 监听 uniqueProducts 改变，自动并响应式地重置/初始化已选产品过滤器，确保在切换用户或报表加载时永远保持正确同步
    watch(uniqueProducts, (newProds) => {
        selectedProducts.value = [...newProds];
    }, { immediate: true });
    const isAllProductsSelected = computed(() => {
        return selectedProducts.value.length === uniqueProducts.value.length;
    });
    function toggleAllProducts() {
        if (isAllProductsSelected.value) {
            selectedProducts.value = [];
        }
        else {
            selectedProducts.value = [...uniqueProducts.value];
        }
    }
    const timezoneStore = useTimezoneStore();
    function formatDateTime(dateStr) {
        return fmtDateTz(dateStr) || '-';
    }
    function formatOsatRange(report) {
        const cfg = report.config_data || {};
        const value = cfg.range_value;
        const unit = cfg.range_unit === 'months' ? '月' : '周';
        if (value)
            return `最近 ${value} ${unit}`;
        return '-';
    }
    // 监听时区变化，重新格式化所有报表的时间显示
    watch(() => timezoneStore.timezone, () => {
        reports.value.forEach(r => {
            r.createTime = formatDateTime(r.created_at);
        });
    });
    async function loadReports() {
        loadUserInfo();
        try {
            const res = await api.get('/reports');
            reports.value = res.map((r) => ({
                ...r,
                source: r.source || 'eng',
                createTime: formatDateTime(r.created_at)
            }));
        }
        catch (err) {
            console.error('加载报表失败:', err);
        }
    }
    const filteredReports = computed(() => {
        let list = allowedReports.value.filter(r => {
            const matchesSearch = r.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                r.type.toLowerCase().includes(searchQuery.value.toLowerCase());
            const matchesProduct = selectedProducts.value.includes(r.product_name || 'Unknown');
            return matchesSearch && matchesProduct;
        });
        list.sort((a, b) => {
            let valA = a[sortBy.value];
            let valB = b[sortBy.value];
            if (sortBy.value === 'createTime') {
                valA = new Date(a.created_at).getTime();
                valB = new Date(b.created_at).getTime();
            }
            if (valA < valB)
                return sortOrder.value === 'asc' ? -1 : 1;
            if (valA > valB)
                return sortOrder.value === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    });
    async function updateOsatSummary() {
        if (!Number.isFinite(osatRangeValue.value) || osatRangeValue.value < 1) {
            osatUpdateMsg.value = { ok: false, text: '请输入有效的时间范围' };
            return;
        }
        updatingOsat.value = true;
        osatUpdateMsg.value = null;
        try {
            const res = await api.post('/reports/osat/update-summary', null, {
                params: {
                    range_value: osatRangeValue.value,
                    range_unit: osatRangeUnit.value
                }
            });
            osatUpdateMsg.value = {
                ok: true,
                text: `已更新 ${res.updated_count ?? 0} 个产品，覆盖 ${res.lot_count ?? 0} 个 LOT`
            };
            await loadReports();
        }
        catch (err) {
            osatUpdateMsg.value = { ok: false, text: err || 'OSAT Summary 更新失败' };
        }
        finally {
            updatingOsat.value = false;
        }
    }
    function sort(field) {
        if (sortBy.value === field) {
            sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
        }
        else {
            sortBy.value = field;
            sortOrder.value = 'desc';
        }
    }
    async function deleteReport(id) {
        if (confirm('确定要删除该报表记录吗？')) {
            try {
                await api.delete(`/reports/${id}`);
                reports.value = reports.value.filter(r => r.id !== id);
            }
            catch (err) {
                alert(err || '删除失败');
            }
        }
    }
    function startEdit(report) {
        editingId.value = report.id;
        editName.value = report.name;
    }
    const originalComments = ref({});
    function startCommentEdit(report) {
        if (originalComments.value[report.id] === undefined) {
            originalComments.value[report.id] = report.comment || '';
        }
    }
    async function saveEdit(report) {
        if (editingId.value !== report.id)
            return;
        if (!editName.value.trim()) {
            editingId.value = null;
            return;
        }
        const newName = editName.value.trim();
        if (newName === report.name) {
            editingId.value = null;
            return;
        }
        const oldName = report.name;
        report.name = newName;
        editingId.value = null;
        try {
            await api.put(`/reports/${report.id}`, { name: newName });
        }
        catch (err) {
            report.name = oldName;
            alert(err || '重命名失败');
        }
    }
    async function saveComment(report) {
        const currentComment = report.comment || '';
        const originalComment = originalComments.value[report.id];
        if (originalComment === undefined || currentComment === originalComment) {
            return;
        }
        originalComments.value[report.id] = currentComment;
        try {
            await api.put(`/reports/${report.id}`, { comment: currentComment });
        }
        catch (err) {
            report.comment = originalComment;
            originalComments.value[report.id] = originalComment;
            alert(err || '保存备注失败');
        }
    }
    const vFocus = {
        mounted: (el) => el.focus()
    };
    onMounted(loadReports);
    const __VLS_ctx = {
        ...{},
        ...{},
    };
    let __VLS_components;
    let __VLS_intrinsics;
    let __VLS_directives;
    /** @type {__VLS_StyleScopedClasses['page-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['update-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['update-msg']} */ ;
    /** @type {__VLS_StyleScopedClasses['update-msg']} */ ;
    /** @type {__VLS_StyleScopedClasses['all-check']} */ ;
    /** @type {__VLS_StyleScopedClasses['search-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-link']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['name-cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['rename-small']} */ ;
    /** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['cancel-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['inline-comment-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['inline-comment-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "report-center" },
    });
    /** @type {__VLS_StyleScopedClasses['report-center']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "page-header" },
    });
    /** @type {__VLS_StyleScopedClasses['page-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "header-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-group" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "filter-label" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "product-filter-container" },
    });
    /** @type {__VLS_StyleScopedClasses['product-filter-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "all-check" },
    });
    /** @type {__VLS_StyleScopedClasses['all-check']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.toggleAllProducts) },
        type: "checkbox",
        checked: (__VLS_ctx.isAllProductsSelected),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "product-options" },
    });
    /** @type {__VLS_StyleScopedClasses['product-options']} */ ;
    for (const [prod] of __VLS_vFor((__VLS_ctx.uniqueProducts))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            key: (prod),
            ...{ class: "prod-option" },
        });
        /** @type {__VLS_StyleScopedClasses['prod-option']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
            value: (prod),
        });
        (__VLS_ctx.selectedProducts);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (prod);
        // @ts-ignore
        [toggleAllProducts, isAllProductsSelected, uniqueProducts, selectedProducts,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "text",
        value: (__VLS_ctx.searchQuery),
        placeholder: "搜索报表名称...",
        ...{ class: "search-input" },
    });
    /** @type {__VLS_StyleScopedClasses['search-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "report-tabs-bar" },
    });
    /** @type {__VLS_StyleScopedClasses['report-tabs-bar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tabs" },
    });
    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.activeTab = 'eng');
                // @ts-ignore
                [searchQuery, activeTab,];
            } },
        ...{ class: "tab-btn" },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'eng' }) },
    });
    /** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.activeTab = 'osat');
                // @ts-ignore
                [activeTab, activeTab,];
            } },
        ...{ class: "tab-btn" },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'osat' }) },
    });
    /** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    if (__VLS_ctx.activeTab === 'osat' && __VLS_ctx.isGlobalViewer) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "osat-update-bar" },
        });
        /** @type {__VLS_StyleScopedClasses['osat-update-bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "range-label" },
        });
        /** @type {__VLS_StyleScopedClasses['range-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ class: "range-input" },
            type: "number",
            min: "1",
            max: "52",
        });
        (__VLS_ctx.osatRangeValue);
        /** @type {__VLS_StyleScopedClasses['range-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_ctx.osatRangeUnit),
            ...{ class: "range-select" },
        });
        /** @type {__VLS_StyleScopedClasses['range-select']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "weeks",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "months",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.updateOsatSummary) },
            ...{ class: "update-btn" },
            disabled: (__VLS_ctx.updatingOsat),
        });
        /** @type {__VLS_StyleScopedClasses['update-btn']} */ ;
        (__VLS_ctx.updatingOsat ? 'Updating...' : 'Update');
        if (__VLS_ctx.osatUpdateMsg) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: (['update-msg', __VLS_ctx.osatUpdateMsg.ok ? 'ok' : 'error']) },
            });
            /** @type {__VLS_StyleScopedClasses['update-msg']} */ ;
            (__VLS_ctx.osatUpdateMsg.text);
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "report-list-card" },
    });
    /** @type {__VLS_StyleScopedClasses['report-list-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "report-table" },
    });
    /** @type {__VLS_StyleScopedClasses['report-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.sort('product_name'));
                // @ts-ignore
                [activeTab, activeTab, isGlobalViewer, osatRangeValue, osatRangeUnit, updateOsatSummary, updatingOsat, updatingOsat, osatUpdateMsg, osatUpdateMsg, osatUpdateMsg, sort,];
            } },
    });
    if (__VLS_ctx.sortBy === 'product_name') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.sortOrder === 'asc' ? '↑' : '↓');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.sort('name'));
                // @ts-ignore
                [sort, sortBy, sortOrder,];
            } },
    });
    if (__VLS_ctx.sortBy === 'name') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.sortOrder === 'asc' ? '↑' : '↓');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.sort('type'));
                // @ts-ignore
                [sort, sortBy, sortOrder,];
            } },
    });
    if (__VLS_ctx.sortBy === 'type') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.sortOrder === 'asc' ? '↑' : '↓');
    }
    if (__VLS_ctx.isGlobalViewer) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    }
    if (__VLS_ctx.activeTab === 'osat') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    }
    if (__VLS_ctx.activeTab === 'osat') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.sort('createTime'));
                // @ts-ignore
                [activeTab, activeTab, isGlobalViewer, sort, sortBy, sortOrder,];
            } },
    });
    if (__VLS_ctx.sortBy === 'createTime') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.sortOrder === 'asc' ? '↑' : '↓');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "actions-col" },
    });
    /** @type {__VLS_StyleScopedClasses['actions-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [report, index] of __VLS_vFor((__VLS_ctx.filteredReports))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (report.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "no-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['no-cell']} */ ;
        (index + 1);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "product-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['product-cell']} */ ;
        (report.product_name || '-');
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "name-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['name-cell']} */ ;
        if (__VLS_ctx.editingId === report.id) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "edit-box" },
            });
            /** @type {__VLS_StyleScopedClasses['edit-box']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (...[$event]) => {
                        if (!(__VLS_ctx.editingId === report.id))
                            throw 0;
                        return (__VLS_ctx.saveEdit(report));
                        // @ts-ignore
                        [sortBy, sortOrder, filteredReports, editingId, saveEdit,];
                    } },
                ...{ onKeyup: (...[$event]) => {
                        if (!(__VLS_ctx.editingId === report.id))
                            throw 0;
                        return (__VLS_ctx.editingId = null);
                        // @ts-ignore
                        [editingId,];
                    } },
                type: "text",
                value: (__VLS_ctx.editName),
                ...{ class: "edit-input" },
            });
            __VLS_asFunctionalDirective(__VLS_directives.vFocus, {})(null, { ...__VLS_directiveBindingRestFields, }, null, null);
            /** @type {__VLS_StyleScopedClasses['edit-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.editingId === report.id))
                            throw 0;
                        return (__VLS_ctx.saveEdit(report));
                        // @ts-ignore
                        [saveEdit, editName, vFocus,];
                    } },
                ...{ class: "save-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.editingId === report.id))
                            throw 0;
                        return (__VLS_ctx.editingId = null);
                        // @ts-ignore
                        [editingId,];
                    } },
                ...{ class: "cancel-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['cancel-btn']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "name-display" },
            });
            /** @type {__VLS_StyleScopedClasses['name-display']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
                href: (report.url),
                target: "_blank",
                ...{ class: "report-link" },
            });
            /** @type {__VLS_StyleScopedClasses['report-link']} */ ;
            (report.name);
            if (__VLS_ctx.canModify(report)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.editingId === report.id))
                                throw 0;
                            if (!(__VLS_ctx.canModify(report)))
                                throw 0;
                            return (__VLS_ctx.startEdit(report));
                            // @ts-ignore
                            [canModify, startEdit,];
                        } },
                    ...{ class: "action-btn rename-small" },
                    title: "重命名",
                });
                /** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
                /** @type {__VLS_StyleScopedClasses['rename-small']} */ ;
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "type-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['type-badge']} */ ;
        (report.type);
        if (__VLS_ctx.isGlobalViewer) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "creator-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['creator-badge']} */ ;
            (report.username);
        }
        if (__VLS_ctx.activeTab === 'osat') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "range-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['range-cell']} */ ;
            (__VLS_ctx.formatOsatRange(report));
        }
        if (__VLS_ctx.activeTab === 'osat') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "lot-count-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['lot-count-cell']} */ ;
            (report.config_data?.lot_count ?? '-');
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "comment-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['comment-cell']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
            ...{ onFocus: (...[$event]) => {
                    return (__VLS_ctx.startCommentEdit(report));
                    // @ts-ignore
                    [activeTab, activeTab, isGlobalViewer, formatOsatRange, startCommentEdit,];
                } },
            ...{ onBlur: (...[$event]) => {
                    return (__VLS_ctx.saveComment(report));
                    // @ts-ignore
                    [saveComment,];
                } },
            ...{ onMouseleave: (...[$event]) => {
                    return (__VLS_ctx.saveComment(report));
                    // @ts-ignore
                    [saveComment,];
                } },
            value: (report.comment),
            disabled: (!__VLS_ctx.canModify(report)),
            placeholder: "添加分析备注...",
            ...{ class: "inline-comment-input" },
        });
        /** @type {__VLS_StyleScopedClasses['inline-comment-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "time-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['time-cell']} */ ;
        (report.createTime);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "actions-cell" },
        });
        /** @type {__VLS_StyleScopedClasses['actions-cell']} */ ;
        if (__VLS_ctx.canModify(report)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.canModify(report)))
                            throw 0;
                        return (__VLS_ctx.deleteReport(report.id));
                        // @ts-ignore
                        [canModify, canModify, deleteReport,];
                    } },
                ...{ class: "action-btn delete" },
                title: "删除",
            });
            /** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['delete']} */ ;
        }
        // @ts-ignore
        [];
    }
    if (__VLS_ctx.filteredReports.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: (__VLS_ctx.tableColspan),
            ...{ class: "empty-state" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    }
    // @ts-ignore
    [filteredReports, tableColspan,];
    return (await import('vue')).defineComponent({});
})();
