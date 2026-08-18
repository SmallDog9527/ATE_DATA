import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTimezoneStore, getBrowserTimezone } from '@/stores/timezone';
import { fmtDateTz, COMMON_TIMEZONES } from '@/utils/dateUtils';
import api from '@/api/index';
const authStore = useAuthStore();
const route = useRoute();
// ── Tabs ──
const visibleTabs = computed(() => {
    const list = [
        { key: 'info', label: '个人信息' },
        { key: 'shares', label: '我的分享' },
    ];
    if (authStore.isAdmin || authStore.isEng) {
        list.push({ key: 'admin', label: '系统管理' });
    }
    else {
        list.push({ key: 'admin', label: '上传日志' });
    }
    return list;
});
const activeTab = ref((route.path === '/settings' && (authStore.isAdmin || authStore.isEng)) ? 'admin' : 'info');
watch(() => route.path, (newPath) => {
    if (newPath === '/settings' && (authStore.isAdmin || authStore.isEng)) {
        activeTab.value = 'admin';
    }
    else {
        activeTab.value = 'info';
    }
});
// ── 折叠状态 ──
const smtpExpanded = ref(false);
const osatExpanded = ref(false);
const ftpLogExpanded = ref(false);
const userMgmtExpanded = ref(false);
const tzExpanded = ref(false);
// ── 时区设置 ──
const timezoneStore = useTimezoneStore();
const browserTz = ref(getBrowserTimezone());
const tzList = COMMON_TIMEZONES;
const tzSelected = ref(timezoneStore.timezone);
const tzCustom = ref('');
const tzSaveMsg = ref(null);
const tzPreview = computed(() => {
    const tz = tzCustom.value.trim() || tzSelected.value;
    try {
        return new Date().toLocaleString('zh-CN', {
            timeZone: tz, hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).replace(/\//g, '-');
    }
    catch {
        return '无效的时区';
    }
});
function saveTz() {
    const tz = tzCustom.value.trim() || tzSelected.value;
    try {
        // 验证时区是否有效
        new Date().toLocaleString('zh-CN', { timeZone: tz });
        timezoneStore.setTimezone(tz);
        tzSaveMsg.value = { ok: true, text: `✅ 时区已设置为 ${tz}，页面所有时间均已更新` };
        setTimeout(() => { tzSaveMsg.value = null; }, 4000);
    }
    catch {
        tzSaveMsg.value = { ok: false, text: `❌ 无效的时区：${tz}，请检查输入` };
    }
}
function resetTzToBrowser() {
    const tz = timezoneStore.resetToBrowser();
    tzSelected.value = tz;
    tzCustom.value = '';
    tzSaveMsg.value = { ok: true, text: `✅ 已还原为浏览器时区：${tz}` };
    setTimeout(() => { tzSaveMsg.value = null; }, 3000);
}
// ── 个人信息 / 修改密码 ──
const pwForm = ref({ old: '', new: '', confirm: '' });
const pwLoading = ref(false);
const pwError = ref('');
const pwSuccess = ref('');
async function handleChangePw() {
    pwError.value = '';
    pwSuccess.value = '';
    if (pwForm.value.new !== pwForm.value.confirm) {
        pwError.value = '两次输入的密码不一致';
        return;
    }
    if (pwForm.value.new.length < 8) {
        pwError.value = '新密码至少8位';
        return;
    }
    pwLoading.value = true;
    try {
        await api.put('/auth/change-password', {
            old_password: pwForm.value.old,
            new_password: pwForm.value.new,
        });
        pwSuccess.value = '密码已修改，下次登录时请使用新密码';
        pwForm.value = { old: '', new: '', confirm: '' };
    }
    catch (e) {
        pwError.value = e || '修改失败';
    }
    finally {
        pwLoading.value = false;
    }
}
const alertLoading = ref(false);
async function sendTestAlertEmail() {
    alertLoading.value = true;
    try {
        const res = await api.post('/users/test-ftp-alert');
        alert(res.message || '测试邮件已发送');
    }
    catch (e) {
        alert('发送失败: ' + (e || '未知错误'));
    }
    finally {
        alertLoading.value = false;
    }
}
const received = ref([]);
const sent = ref([]);
async function loadShares() {
    try {
        const [r, s] = await Promise.all([
            api.get('/shares/received'),
            api.get('/shares/sent'),
        ]);
        received.value = r;
        sent.value = s;
    }
    catch { }
}
async function revokeShare(id) {
    try {
        await api.delete(`/shares/${id}`);
        sent.value = sent.value.filter(s => s.id !== id);
    }
    catch (e) {
        alert(e);
    }
}
function daysLeft(expiresAt) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    const days = Math.ceil(ms / 86400000);
    return days > 0 ? `剩余 ${days} 天` : '已过期';
}
function isExpired(expiresAt) {
    return new Date(expiresAt).getTime() < Date.now();
}
// ════════════════════════════════════════
// SMTP 邮箱配置
// ════════════════════════════════════════
const emailPresets = [
    { label: 'QQ 邮箱', host: 'smtp.qq.com', port: 465, ssl: true },
    { label: '163 邮箱', host: 'smtp.163.com', port: 465, ssl: true },
    { label: 'Gmail', host: 'smtp.gmail.com', port: 465, ssl: true },
    { label: 'Outlook', host: 'smtp.office365.com', port: 587, ssl: false },
];
const smtpForm = ref({
    smtp_host: '',
    smtp_port: 465,
    smtp_user: '',
    smtp_password: '',
    smtp_from: '',
    smtp_ssl: true,
});
const smtpConfigured = ref(false);
const smtpSaving = ref(false);
const smtpSaveMsg = ref(null);
const smtpTestEmail = ref('');
const smtpTesting = ref(false);
const smtpTestMsg = ref(null);
function applyPreset(preset) {
    smtpForm.value.smtp_host = preset.host;
    smtpForm.value.smtp_port = preset.port;
    smtpForm.value.smtp_ssl = preset.ssl;
}
async function loadSmtpConfig() {
    try {
        const data = await api.get('/settings/smtp');
        smtpConfigured.value = data.is_configured;
        if (data.is_configured) {
            smtpForm.value.smtp_host = data.smtp_host || '';
            smtpForm.value.smtp_port = data.smtp_port || 465;
            smtpForm.value.smtp_user = data.smtp_user || '';
            smtpForm.value.smtp_from = data.smtp_from || '';
            smtpForm.value.smtp_ssl = data.smtp_ssl ?? true;
        }
    }
    catch { }
}
async function saveSmtp() {
    smtpSaveMsg.value = null;
    smtpSaving.value = true;
    try {
        await api.put('/settings/smtp', smtpForm.value);
        smtpSaveMsg.value = { ok: true, text: '✅ SMTP 配置已保存' };
        smtpConfigured.value = true;
    }
    catch (e) {
        smtpSaveMsg.value = { ok: false, text: `❌ 保存失败：${e}` };
    }
    finally {
        smtpSaving.value = false;
    }
}
async function sendTestEmail() {
    smtpTestMsg.value = null;
    if (!smtpTestEmail.value) {
        alert('请输入收件人邮箱');
        return;
    }
    smtpTesting.value = true;
    try {
        const r = await api.post('/settings/smtp/test', { to_email: smtpTestEmail.value });
        smtpTestMsg.value = { ok: true, text: `✅ ${r.message}` };
    }
    catch (e) {
        smtpTestMsg.value = { ok: false, text: `❌ ${e}` };
    }
    finally {
        smtpTesting.value = false;
    }
}
// ── 版本更新信息 ──
const versionExpanded = ref(false);
const versionInfo = ref({ version: 'V01_20260623', content: '', history: [] });
const versionSaving = ref(false);
const versionSaveMsg = ref(null);
async function loadVersionInfo() {
    try {
        const data = await api.get('/settings/version');
        versionInfo.value = data;
    }
    catch (e) {
        console.error('加载版本信息失败', e);
    }
}
async function saveVersion() {
    versionSaveMsg.value = null;
    versionSaving.value = true;
    try {
        await api.put('/settings/version', { content: versionInfo.value.content });
        versionSaveMsg.value = { ok: true, text: '✅ 版本更新内容已保存' };
        await loadVersionInfo();
    }
    catch (e) {
        versionSaveMsg.value = { ok: false, text: `❌ 保存失败：${e.message || e}` };
    }
    finally {
        versionSaving.value = false;
    }
}
const osatList = ref([]);
function formatFtpEncryption(value) {
    const labels = {
        explicit_tls_optional: '显式 TLS（可用时）',
        explicit_tls_required: '显式 TLS',
        implicit_tls_required: '隐式 TLS',
        plain: '明文 FTP',
    };
    return labels[value] || '明文 FTP';
}
async function loadOsats() {
    try {
        const data = await api.get('/settings/osats');
        osatList.value = data.map((o) => ({ ...o, _testing: false, _running: false, _msg: null }));
    }
    catch { }
}
// OSAT 弹窗
const osatModal = ref(null);
const osatModalError = ref('');
const osatModalSaving = ref(false);
const osatQuickInput = ref('');
function normalizeFtpHost(raw) {
    const value = (raw || '').trim();
    if (!value)
        return '';
    try {
        const url = value.includes('://') ? new URL(value) : new URL(`ftp://${value}`);
        return url.hostname || value.replace(/^ftp:\/\//i, '').replace(/\/+$/, '');
    }
    catch {
        return value.replace(/^ftp:\/\//i, '').replace(/\/+$/, '');
    }
}
function inferFtpEncryption(raw) {
    const value = (raw || '').toLowerCase();
    if (value.includes('implicit') || value.includes('隐式'))
        return 'implicit_tls_required';
    if (value.includes('optional') || value.includes('可用'))
        return 'explicit_tls_optional';
    if (value.includes('tls') || value.includes('加密'))
        return 'explicit_tls_required';
    if (value.includes('plain') || value.includes('明文') || value.includes('不安全'))
        return 'plain';
    return osatModal.value?.ftp_encryption || 'plain';
}
function assignOsatField(label, value) {
    const key = label.toLowerCase().replace(/[：:\s]/g, '');
    const val = value.trim();
    if (!val)
        return;
    if (key.includes('协议') || key.includes('protocol')) {
        const valL = val.toLowerCase();
        if (valL.includes('sftp'))
            osatModal.value.protocol = 'sftp';
        else if (valL.includes('ftp'))
            osatModal.value.protocol = 'ftp';
        return true;
    }
    if (key.includes('服务器名') || key.includes('osat') || key.includes('名称')) {
        osatModal.value.name = val;
        return true;
    }
    if (key.includes('服务器地址') || key.includes('ftp服务器') || key.includes('地址') || key.includes('host')) {
        osatModal.value.ftp_host = normalizeFtpHost(val);
        return true;
    }
    if (key.includes('端口')) {
        osatModal.value.ftp_port = Number(val) || (osatModal.value.protocol === 'sftp' ? 22 : 21);
        return true;
    }
    if (key.includes('加密')) {
        osatModal.value.ftp_encryption = inferFtpEncryption(val);
        return true;
    }
    if (key.includes('用户名') || key.includes('用户')) {
        osatModal.value.ftp_user = val;
        return true;
    }
    if (key.includes('密码')) {
        osatModal.value.ftp_password = val;
        return true;
    }
    if (key.includes('summary')) {
        osatModal.value.ftp_summary_dir = val || '/';
        return true;
    }
    if (key.includes('data') || key.includes('数据路径') || key.includes('远程根目录')) {
        osatModal.value.ftp_remote_dir = val || '/';
        return true;
    }
    return false;
}
function parseSequentialOsatInput(text) {
    const tabParts = text.split(/\t+/).map(s => s.trim()).filter(Boolean);
    const parts = tabParts.length >= 4
        ? tabParts
        : text.replace(/\r?\n/g, ' ').split(/\s+/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 5)
        return false;
    const name = parts[0];
    const host = parts[1];
    let cursor = 2;
    let port = 21;
    if (/^\d+$/.test(parts[cursor] || '')) {
        port = Number(parts[cursor]);
        cursor += 1;
    }
    const user = parts[cursor];
    const password = parts[cursor + 1];
    const remaining = parts.slice(cursor + 2);
    if (!name || !host || !user || !password || remaining.length < 1)
        return false;
    osatModal.value.name = name;
    osatModal.value.ftp_host = normalizeFtpHost(host);
    osatModal.value.ftp_port = port;
    osatModal.value.ftp_user = user;
    osatModal.value.ftp_password = password;
    osatModal.value.ftp_remote_dir = remaining[0] || '/';
    osatModal.value.ftp_summary_dir = remaining.slice(1).join(' ') || '/';
    return true;
}
function parseOsatQuickInput() {
    osatModalError.value = '';
    const text = osatQuickInput.value.trim();
    if (!text) {
        osatModalError.value = '请先粘贴 FTP 配置内容';
        return;
    }
    if (text.includes('\t') && parseSequentialOsatInput(text)) {
        return;
    }
    let matchedLabel = false;
    text.split(/\r?\n/).forEach(line => {
        const pairs = [...line.matchAll(/([^：:\s]+(?:\s*[^：:\s]+)*)[：:]\s*([^：:]+?)(?=\s+[^：:\s]+(?:\s*[^：:\s]+)*[：:]|$)/g)];
        if (pairs.length) {
            pairs.forEach(match => {
                const label = match[1];
                const value = match[2];
                if (label && value && assignOsatField(label, value))
                    matchedLabel = true;
            });
        }
    });
    if (!matchedLabel && !parseSequentialOsatInput(text)) {
        osatModalError.value = '未识别成功，请检查是否包含 OSAT名称、服务器地址、用户名、密码、Data目录、Summary目录';
        return;
    }
    if (!osatModal.value.schedule_start)
        osatModal.value.schedule_start = '22:00';
    if (!osatModal.value.schedule_end)
        osatModal.value.schedule_end = '08:00';
    if (!osatModal.value.data_type)
        osatModal.value.data_type = 'CP';
    if (!osatModal.value.ftp_encryption)
        osatModal.value.ftp_encryption = 'plain';
}
function onProtocolChange() {
    if (osatModal.value.protocol === 'sftp') {
        if (osatModal.value.ftp_port === 21) {
            osatModal.value.ftp_port = 22;
        }
    }
    else {
        if (osatModal.value.ftp_port === 22) {
            osatModal.value.ftp_port = 21;
        }
    }
}
function openOsatModal(osat) {
    osatModalError.value = '';
    osatQuickInput.value = '';
    if (osat) {
        osatModal.value = {
            id: osat.id,
            name: osat.name,
            protocol: osat.protocol || 'ftp',
            ftp_host: osat.ftp_host,
            ftp_port: osat.ftp_port,
            ftp_user: osat.ftp_user,
            ftp_encryption: osat.ftp_encryption || 'plain',
            ftp_password: '', // 密码不回显，编辑时需重新输入
            ftp_remote_dir: osat.ftp_remote_dir,
            ftp_summary_dir: osat.ftp_summary_dir || '/',
            schedule_start: osat.schedule_start,
            schedule_end: osat.schedule_end,
            enabled: osat.enabled,
            data_type: osat.data_type || 'CP',
        };
    }
    else {
        osatModal.value = {
            id: null,
            name: '',
            protocol: 'ftp',
            ftp_host: '', ftp_port: 21, ftp_user: '',
            ftp_encryption: 'plain',
            ftp_password: '', ftp_remote_dir: '/', ftp_summary_dir: '/',
            schedule_start: '22:00', schedule_end: '08:00', enabled: false,
            data_type: 'CP',
        };
    }
}
async function saveOsatModal() {
    osatModalError.value = '';
    const label = osatModal.value.protocol === 'sftp' ? 'SFTP' : 'FTP';
    if (!osatModal.value.name) {
        osatModalError.value = '请填写 OSAT 名称';
        return;
    }
    if (!osatModal.value.ftp_host) {
        osatModalError.value = `请填写 ${label} 地址`;
        return;
    }
    if (!osatModal.value.ftp_user) {
        osatModalError.value = `请填写 ${label} 用户名`;
        return;
    }
    if (!osatModal.value.id && !osatModal.value.ftp_password) {
        osatModalError.value = `请填写 ${label} 密码`;
        return;
    }
    osatModalSaving.value = true;
    try {
        if (osatModal.value.id) {
            await api.put(`/settings/osats/${osatModal.value.id}`, osatModal.value);
        }
        else {
            await api.post('/settings/osats', osatModal.value);
        }
        osatModal.value = null;
        await loadOsats();
    }
    catch (e) {
        osatModalError.value = `保存失败：${e}`;
    }
    finally {
        osatModalSaving.value = false;
    }
}
async function deleteOsat(osat) {
    if (!confirm(`确认删除 OSAT「${osat.name}」？关联的上传日志也将一并删除。`))
        return;
    try {
        await api.delete(`/settings/osats/${osat.id}`);
        await loadOsats();
    }
    catch (e) {
        alert(`删除失败：${e}`);
    }
}
async function testOsatFtp(osat) {
    osat._testing = true;
    osat._msg = null;
    try {
        const r = await api.post(`/settings/osats/${osat.id}/test`);
        osat._msg = { ok: true, text: `✅ ${r.message}` };
    }
    catch (e) {
        osat._msg = { ok: false, text: `❌ ${e}` };
    }
    finally {
        osat._testing = false;
    }
}
async function toggleOsatStatus(osat) {
    osat._running = true;
    osat._msg = null;
    const newStatus = !osat.enabled;
    try {
        const payload = {
            name: osat.name,
            ftp_host: osat.ftp_host,
            ftp_port: osat.ftp_port,
            ftp_user: osat.ftp_user,
            ftp_encryption: osat.ftp_encryption || 'plain',
            ftp_password: '******',
            ftp_remote_dir: osat.ftp_remote_dir,
            ftp_summary_dir: osat.ftp_summary_dir || '/',
            schedule_start: osat.schedule_start,
            schedule_end: osat.schedule_end,
            enabled: newStatus,
            data_type: osat.data_type,
        };
        await api.put(`/settings/osats/${osat.id}`, payload);
        osat.enabled = newStatus;
        if (newStatus) {
            const r = await api.post(`/settings/osats/${osat.id}/run-now`);
            osat._msg = { ok: true, text: `✅ 已成功启用定时抓取，并触发了立即执行：${r.message}` };
        }
        else {
            osat._msg = { ok: true, text: `⏹ 已成功停止定时抓取任务` };
        }
    }
    catch (e) {
        osat._msg = { ok: false, text: `❌ 操作失败：${e}` };
    }
    finally {
        osat._running = false;
    }
}
const ftpLogs = ref([]);
const logsLoading = ref(false);
const logFilterOsat = ref('');
const logFilterStatus = ref('success');
const logPage = ref(1);
// ── 🔍 全量 FTP 快照检索页面 ──
const snapshotItems = ref([]);
const snapshotLoading = ref(false);
const snapshotSearchQuery = ref('');
const snapshotFilterOsat = ref('');
const snapshotFilterStatus = ref('');
const snapshotPage = ref(1);
const snapshotPageSize = ref(20);
const snapshotTotal = ref(0);
let snapshotSearchTimer = null;
function onSnapshotSearchInput() {
    snapshotPage.value = 1;
    if (snapshotSearchTimer)
        clearTimeout(snapshotSearchTimer);
    snapshotSearchTimer = setTimeout(() => {
        loadSnapshotSearch();
    }, 250);
}
async function loadSnapshotSearch() {
    if (!snapshotSearchQuery.value.trim() && !snapshotFilterOsat.value && !snapshotFilterStatus.value) {
        snapshotItems.value = [];
        snapshotTotal.value = 0;
        return;
    }
    snapshotLoading.value = true;
    try {
        const params = {
            page: snapshotPage.value,
            page_size: snapshotPageSize.value,
            include_scanned: true,
        };
        if (snapshotFilterOsat.value)
            params.osat_id = snapshotFilterOsat.value;
        if (snapshotFilterStatus.value)
            params.status = snapshotFilterStatus.value;
        if (snapshotSearchQuery.value.trim())
            params.search = snapshotSearchQuery.value.trim();
        const data = await api.get('/settings/ftp-logs', { params });
        snapshotItems.value = data.items || [];
        snapshotTotal.value = data.total || 0;
    }
    catch (e) {
        console.error('Failed to load snapshot search:', e);
    }
    finally {
        snapshotLoading.value = false;
    }
}
function resetSnapshotSearch() {
    snapshotSearchQuery.value = '';
    snapshotFilterOsat.value = '';
    snapshotFilterStatus.value = '';
    snapshotPage.value = 1;
    loadSnapshotSearch();
}
const logPageSize = ref(20);
const logTotal = ref(0);
async function loadFtpLogs() {
    logsLoading.value = true;
    try {
        const params = { page: logPage.value, page_size: logPageSize.value };
        if (logFilterOsat.value)
            params.osat_id = logFilterOsat.value;
        if (logFilterStatus.value)
            params.status = logFilterStatus.value;
        const data = await api.get('/settings/ftp-logs', { params });
        ftpLogs.value = data.items || [];
        logTotal.value = data.total || 0;
    }
    catch { }
    finally {
        logsLoading.value = false;
    }
}
async function retryFtpLog(logId) {
    try {
        const res = await api.post(`/settings/ftp-logs/${logId}/retry`);
        alert(res.message || '重试任务已提交');
        await loadFtpLogs();
    }
    catch (err) {
        alert(err.response?.data?.detail || '重试失败');
    }
}
async function skipFtpLog(logId) {
    if (!confirm('确认跳过此失效文件？跳过后的记录将更新为 manual skip 且不再显示在失效列表中。'))
        return;
    try {
        const res = await api.post(`/settings/ftp-logs/${logId}/skip`);
        alert(res.message || '已成功标记为 manual skip');
        await loadFtpLogs();
    }
    catch (err) {
        alert(err.response?.data?.detail || '跳过操作失败');
    }
}
const manualLogs = ref([]);
const manualLogsLoading = ref(false);
const manualLogPage = ref(1);
const manualLogPageSize = ref(20);
const manualLogTotal = ref(0);
const activeLogSubTab = ref('manual');
const manualLogFilterType = ref('');
const manualLogFilterStatus = ref('');
const manualLogFilterOperator = ref('');
const manualOperators = ref([]);
async function loadManualOperators() {
    try {
        const data = await api.get('/settings/manual-operators');
        manualOperators.value = data || [];
    }
    catch { }
}
async function loadManualLogs() {
    manualLogsLoading.value = true;
    try {
        const params = { page: manualLogPage.value, page_size: manualLogPageSize.value };
        if (manualLogFilterType.value)
            params.upload_type = manualLogFilterType.value;
        if (manualLogFilterStatus.value)
            params.status = manualLogFilterStatus.value;
        if (manualLogFilterOperator.value)
            params.operator = manualLogFilterOperator.value;
        const data = await api.get('/settings/manual-logs', { params });
        manualLogs.value = data.items || [];
        manualLogTotal.value = data.total || 0;
    }
    catch { }
    finally {
        manualLogsLoading.value = false;
    }
}
watch(activeTab, (newTab) => {
    if (newTab === 'admin') {
        loadManualLogs();
        if (authStore.isAdmin || authStore.isEng) {
            loadManualOperators();
        }
    }
});
const stuckFiles = ref([]);
const stuckPanelVisible = ref(false);
const stuckMaxRetries = ref(3);
const stuckRetrying = ref(false);
const stuckMsg = ref(null);
async function loadStuckFiles() {
    stuckMsg.value = null;
    try {
        const params = {};
        if (logFilterOsat.value)
            params.osat_id = logFilterOsat.value;
        const data = await api.get('/settings/ftp-logs/failed-summary', { params });
        stuckFiles.value = (data.items || []).map((f) => ({ ...f, _retrying: false }));
        stuckMaxRetries.value = data.max_retries || 3;
        stuckPanelVisible.value = true;
    }
    catch (e) {
        alert(`加载失败：${e}`);
    }
}
async function retryOneStuck(f) {
    f._retrying = true;
    stuckMsg.value = null;
    try {
        const r = await api.delete('/settings/ftp-logs/failed', {
            params: { remote_path: f.remote_path }
        });
        stuckMsg.value = { ok: true, text: `✅ 已重置「${f.filename}」，下次扫描将重新尝试` };
        // 从列表移除
        stuckFiles.value = stuckFiles.value.filter(x => x.remote_path !== f.remote_path);
        await loadFtpLogs();
    }
    catch (e) {
        stuckMsg.value = { ok: false, text: `❌ 重置失败：${e}` };
    }
    finally {
        f._retrying = false;
    }
}
async function retryAllStuck() {
    if (!confirm(`确认重试所有 ${stuckFiles.value.length} 个卡住文件？它们将在下次 FTP 扫描时被重新处理。`))
        return;
    stuckRetrying.value = true;
    stuckMsg.value = null;
    try {
        const params = {};
        if (logFilterOsat.value)
            params.osat_id = logFilterOsat.value;
        const r = await api.delete('/settings/ftp-logs/failed', { params });
        stuckMsg.value = { ok: true, text: `✅ ${r.message}` };
        stuckFiles.value = [];
        await loadFtpLogs();
    }
    catch (e) {
        stuckMsg.value = { ok: false, text: `❌ 重置失败：${e}` };
    }
    finally {
        stuckRetrying.value = false;
    }
}
const userList = ref([]);
const adminLoading = ref(false);
const resetTarget = ref(null);
const newPwForUser = ref('');
const adminPwError = ref('');
const adminPwLoading = ref(false);
async function loadUsers() {
    adminLoading.value = true;
    try {
        const data = await api.get('/users');
        userList.value = data;
    }
    catch { }
    finally {
        adminLoading.value = false;
    }
}
async function toggleActive(u) {
    try {
        const r = await api.put(`/users/${u.id}/toggle-active`);
        u.is_active = r.is_active;
    }
    catch (e) {
        alert(e);
    }
}
async function toggleAlerts(u) {
    try {
        const r = await api.put(`/users/${u.id}/toggle-alerts`);
        u.receive_alerts = r.receive_alerts;
    }
    catch (e) {
        alert(e);
    }
}
async function setRole(u) {
    try {
        const r = await api.put(`/users/${u.id}/role?role=${u.role}`);
        u.role = r.role;
    }
    catch (e) {
        alert(e);
        await loadUsers();
    }
}
function openResetPw(u) {
    resetTarget.value = u;
    newPwForUser.value = '';
    adminPwError.value = '';
}
async function doAdminResetPw() {
    if (newPwForUser.value.length < 8) {
        adminPwError.value = '密码至少8位';
        return;
    }
    adminPwLoading.value = true;
    try {
        await api.put(`/users/${resetTarget.value.id}/reset-password`, {
            new_password: newPwForUser.value,
        });
        resetTarget.value = null;
    }
    catch (e) {
        adminPwError.value = e || '重置失败';
    }
    finally {
        adminPwLoading.value = false;
    }
}
const summaryOsats = ref([]);
const summaryRows = ref([]);
const summaryLoading = ref(false);
async function loadDailySummary() {
    summaryLoading.value = true;
    try {
        const data = await api.get('/settings/ftp-logs/daily-summary');
        summaryOsats.value = data.osats || [];
        summaryRows.value = data.rows || [];
    }
    catch (e) {
        console.error('Failed to load daily summary:', e);
    }
    finally {
        summaryLoading.value = false;
    }
}
const retryingAllFailed = ref(false);
async function handleRetryAllFailed() {
    if (confirm('确认重试所有失效数据？点击后会将所有失效数据的状态更新为 scanned 并重新下载解析。')) {
        retryingAllFailed.value = true;
        try {
            const res = await api.post('/settings/ftp-logs/retry-all-failed');
            alert(res.message || '重试所有失效数据请求已提交！');
            await loadFtpLogs();
        }
        catch (e) {
            alert('提交失败：' + (e.response?.data?.detail || e.message || '未知错误'));
        }
        finally {
            retryingAllFailed.value = false;
        }
    }
}
const processingExistingLocal = ref(false);
async function handleProcessExistingLocal() {
    if (confirm("确定要立即扫描并处理目前本地 /download 和 /extracted 目录下的所有文件吗？\n（无论 OSAT 定时配置是否开启，都会立即启动后台解析和自动入库校验）")) {
        processingExistingLocal.value = true;
        try {
            const res = await api.post('/settings/ftp-logs/process-existing');
            alert(res.message || "后台处理任务已成功提交！");
            await loadFtpLogs();
        }
        catch (e) {
            alert("提交失败：" + (e.response?.data?.detail || e.message || "未知错误"));
        }
        finally {
            processingExistingLocal.value = false;
        }
    }
}
// ── 工具 ──
function fmtDate(d) {
    return fmtDateTz(d);
}
function fmtBytes(b) {
    if (!b)
        return '0 B';
    if (b < 1024)
        return b + ' B';
    if (b < 1024 ** 2)
        return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 ** 3)
        return (b / 1024 ** 2).toFixed(1) + ' MB';
    return (b / 1024 ** 3).toFixed(2) + ' GB';
}
onMounted(async () => {
    await authStore.refreshMe();
    await loadShares();
    await loadManualLogs();
    await loadVersionInfo();
    if (authStore.isAdmin || authStore.isEng) {
        await Promise.all([loadOsats(), loadFtpLogs(), loadSmtpConfig(), loadManualOperators(), loadDailySummary()]);
    }
    if (authStore.isAdmin) {
        await loadUsers();
    }
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['msg']} */ ;
/** @type {__VLS_StyleScopedClasses['msg']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-revoke']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['preset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['preset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['test-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-test']} */ ;
/** @type {__VLS_StyleScopedClasses['osat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-green']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-purple']} */ ;
/** @type {__VLS_StyleScopedClasses['log-table']} */ ;
/** @type {__VLS_StyleScopedClasses['log-table']} */ ;
/** @type {__VLS_StyleScopedClasses['log-table']} */ ;
/** @type {__VLS_StyleScopedClasses['user-table']} */ ;
/** @type {__VLS_StyleScopedClasses['user-table']} */ ;
/** @type {__VLS_StyleScopedClasses['user-table']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
/** @type {__VLS_StyleScopedClasses['tz-info-text']} */ ;
/** @type {__VLS_StyleScopedClasses['tz-select']} */ ;
/** @type {__VLS_StyleScopedClasses['tz-custom-input']} */ ;
/** @type {__VLS_StyleScopedClasses['tz-preview']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-page" },
});
/** @type {__VLS_StyleScopedClasses['profile-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page-header" },
});
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "avatar-block" },
});
/** @type {__VLS_StyleScopedClasses['avatar-block']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "avatar" },
});
/** @type {__VLS_StyleScopedClasses['avatar']} */ ;
(__VLS_ctx.authStore.user?.username?.[0]?.toUpperCase());
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "username" },
});
/** @type {__VLS_StyleScopedClasses['username']} */ ;
(__VLS_ctx.authStore.user?.username);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "badges" },
});
/** @type {__VLS_StyleScopedClasses['badges']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "badge blue" },
});
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['blue']} */ ;
(__VLS_ctx.authStore.user?.email);
if (__VLS_ctx.authStore.user?.role === 'admin') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "badge gold" },
    });
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['gold']} */ ;
}
else if (__VLS_ctx.authStore.user?.role === 'eng') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "badge blue" },
    });
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['blue']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "badge green" },
});
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['green']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tabs" },
});
/** @type {__VLS_StyleScopedClasses['tabs']} */ ;
for (const [t] of __VLS_vFor((__VLS_ctx.visibleTabs))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.activeTab = t.key);
                // @ts-ignore
                [authStore, authStore, authStore, authStore, authStore, visibleTabs, activeTab,];
            } },
        key: (t.key),
        ...{ class: (['tab-btn', { active: __VLS_ctx.activeTab === t.key }]) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-btn']} */ ;
    (t.label);
    // @ts-ignore
    [activeTab,];
}
if (__VLS_ctx.activeTab === 'info') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['info-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-label" },
    });
    /** @type {__VLS_StyleScopedClasses['info-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-value" },
    });
    /** @type {__VLS_StyleScopedClasses['info-value']} */ ;
    (__VLS_ctx.authStore.user?.username);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-label" },
    });
    /** @type {__VLS_StyleScopedClasses['info-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-value" },
    });
    /** @type {__VLS_StyleScopedClasses['info-value']} */ ;
    (__VLS_ctx.authStore.user?.email);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-label" },
    });
    /** @type {__VLS_StyleScopedClasses['info-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-value" },
    });
    /** @type {__VLS_StyleScopedClasses['info-value']} */ ;
    (__VLS_ctx.fmtDate(__VLS_ctx.authStore.user?.created_at));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-label" },
    });
    /** @type {__VLS_StyleScopedClasses['info-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-value" },
    });
    /** @type {__VLS_StyleScopedClasses['info-value']} */ ;
    (__VLS_ctx.fmtDate(__VLS_ctx.authStore.user?.last_login_at) || '—');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "info-item" },
    });
    /** @type {__VLS_StyleScopedClasses['info-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-label" },
    });
    /** @type {__VLS_StyleScopedClasses['info-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-value" },
    });
    /** @type {__VLS_StyleScopedClasses['info-value']} */ ;
    (__VLS_ctx.fmtBytes(__VLS_ctx.authStore.user?.storage_used_bytes));
    if (__VLS_ctx.authStore.user?.receive_alerts) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "alert-test-section" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['alert-test-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.sendTestAlertEmail) },
            type: "button",
            ...{ class: "btn-primary" },
            disabled: (__VLS_ctx.alertLoading),
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
        (__VLS_ctx.alertLoading ? '发送中...' : '立即发送FTP报错邮件');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-title" },
    });
    /** @type {__VLS_StyleScopedClasses['section-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (__VLS_ctx.handleChangePw) },
        ...{ class: "pw-form" },
    });
    /** @type {__VLS_StyleScopedClasses['pw-form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field-row" },
    });
    /** @type {__VLS_StyleScopedClasses['field-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "password",
        placeholder: "请输入当前密码",
    });
    (__VLS_ctx.pwForm.old);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "password",
        placeholder: "至少8位，含字母和数字",
    });
    (__VLS_ctx.pwForm.new);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "password",
        placeholder: "再次输入新密码",
    });
    (__VLS_ctx.pwForm.confirm);
    if (__VLS_ctx.pwError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.pwError);
    }
    if (__VLS_ctx.pwSuccess) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg success" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['success']} */ ;
        (__VLS_ctx.pwSuccess);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        ...{ class: "btn-primary" },
        disabled: (__VLS_ctx.pwLoading),
    });
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.pwLoading ? '保存中...' : '修改密码');
}
if (__VLS_ctx.activeTab === 'shares') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "share-sections" },
    });
    /** @type {__VLS_StyleScopedClasses['share-sections']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "share-col" },
    });
    /** @type {__VLS_StyleScopedClasses['share-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-title" },
    });
    /** @type {__VLS_StyleScopedClasses['section-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "count" },
    });
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    (__VLS_ctx.received.length);
    if (__VLS_ctx.received.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-tip" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
    }
    for (const [s] of __VLS_vFor((__VLS_ctx.received))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (s.id),
            ...{ class: "share-card" },
        });
        /** @type {__VLS_StyleScopedClasses['share-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "share-file" },
        });
        /** @type {__VLS_StyleScopedClasses['share-file']} */ ;
        (s.lot_filename);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "share-meta" },
        });
        /** @type {__VLS_StyleScopedClasses['share-meta']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (s.shared_by_username);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "tag" },
        });
        /** @type {__VLS_StyleScopedClasses['tag']} */ ;
        (__VLS_ctx.daysLeft(s.expires_at));
        if (s.message) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "share-msg" },
            });
            /** @type {__VLS_StyleScopedClasses['share-msg']} */ ;
            (s.message);
        }
        // @ts-ignore
        [authStore, authStore, authStore, authStore, authStore, authStore, activeTab, activeTab, fmtDate, fmtDate, fmtBytes, sendTestAlertEmail, alertLoading, alertLoading, handleChangePw, pwForm, pwForm, pwForm, pwError, pwError, pwSuccess, pwSuccess, pwLoading, pwLoading, received, received, received, daysLeft,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "share-col" },
    });
    /** @type {__VLS_StyleScopedClasses['share-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-title" },
    });
    /** @type {__VLS_StyleScopedClasses['section-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "count" },
    });
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    (__VLS_ctx.sent.length);
    if (__VLS_ctx.sent.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-tip" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
    }
    for (const [s] of __VLS_vFor((__VLS_ctx.sent))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (s.id),
            ...{ class: "share-card" },
        });
        /** @type {__VLS_StyleScopedClasses['share-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "share-file" },
        });
        /** @type {__VLS_StyleScopedClasses['share-file']} */ ;
        (s.lot_filename);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "share-meta" },
        });
        /** @type {__VLS_StyleScopedClasses['share-meta']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (s.shared_to_username);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: (['tag', __VLS_ctx.isExpired(s.expires_at) ? 'expired' : '']) },
        });
        /** @type {__VLS_StyleScopedClasses['tag']} */ ;
        (__VLS_ctx.isExpired(s.expires_at) ? '已过期' : __VLS_ctx.daysLeft(s.expires_at));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'shares'))
                        throw 0;
                    return (__VLS_ctx.revokeShare(s.id));
                    // @ts-ignore
                    [daysLeft, sent, sent, sent, isExpired, isExpired, revokeShare,];
                } },
            ...{ class: "btn-revoke" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-revoke']} */ ;
        // @ts-ignore
        [];
    }
}
if (__VLS_ctx.activeTab === 'admin') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settings-card" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'admin'))
                    throw 0;
                return (__VLS_ctx.versionExpanded = !__VLS_ctx.versionExpanded);
                // @ts-ignore
                [activeTab, versionExpanded, versionExpanded,];
            } },
        ...{ class: "settings-card-header" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-card-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settings-card-title" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-card-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "settings-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "badge purple" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['purple']} */ ;
    (__VLS_ctx.versionInfo.version);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "collapse-arrow" },
    });
    /** @type {__VLS_StyleScopedClasses['collapse-arrow']} */ ;
    (__VLS_ctx.versionExpanded ? '▲' : '▼');
    if (__VLS_ctx.versionExpanded) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card-body" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-body']} */ ;
        if (__VLS_ctx.authStore.isAdmin) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-grid" },
            });
            /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.versionInfo.version);
            __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
                value: (__VLS_ctx.versionInfo.content),
                placeholder: "请输入版本更新内容，例如新功能介绍、修复说明等...",
                rows: "6",
                ...{ style: {} },
            });
            if (__VLS_ctx.versionSaveMsg) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: (['msg', __VLS_ctx.versionSaveMsg.ok ? 'success' : 'error']) },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['msg']} */ ;
                (__VLS_ctx.versionSaveMsg.text);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "action-row" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['action-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.saveVersion) },
                ...{ class: "btn-primary" },
                disabled: (__VLS_ctx.versionSaving),
            });
            /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
            (__VLS_ctx.versionSaving ? '保存中...' : '💾 保存版本更新');
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "version-viewer" },
            });
            /** @type {__VLS_StyleScopedClasses['version-viewer']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "viewer-title" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['viewer-title']} */ ;
            (__VLS_ctx.versionInfo.version);
            __VLS_asFunctionalElement1(__VLS_intrinsics.pre, __VLS_intrinsics.pre)({
                ...{ style: {} },
            });
            (__VLS_ctx.versionInfo.content || '暂无更新说明');
        }
        if (__VLS_ctx.authStore.isAdmin && __VLS_ctx.versionInfo.history && __VLS_ctx.versionInfo.history.length > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "version-history-section" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['version-history-section']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "history-title" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['history-title']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "history-list" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['history-list']} */ ;
            for (const [item] of __VLS_vFor((__VLS_ctx.versionInfo.history))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (item.version),
                    ...{ class: "history-item" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['history-item']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "history-item-header" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['history-item-header']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "badge purple" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                /** @type {__VLS_StyleScopedClasses['purple']} */ ;
                (item.version);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "history-date" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['history-date']} */ ;
                (item.updated_at);
                __VLS_asFunctionalElement1(__VLS_intrinsics.pre, __VLS_intrinsics.pre)({
                    ...{ style: {} },
                });
                (item.content || '无更新说明');
                // @ts-ignore
                [authStore, authStore, versionExpanded, versionExpanded, versionInfo, versionInfo, versionInfo, versionInfo, versionInfo, versionInfo, versionInfo, versionInfo, versionSaveMsg, versionSaveMsg, versionSaveMsg, saveVersion, versionSaving, versionSaving,];
            }
        }
    }
    if (__VLS_ctx.authStore.isAdmin) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'admin'))
                        throw 0;
                    if (!(__VLS_ctx.authStore.isAdmin))
                        throw 0;
                    return (__VLS_ctx.tzExpanded = !__VLS_ctx.tzExpanded);
                    // @ts-ignore
                    [authStore, tzExpanded, tzExpanded,];
                } },
            ...{ class: "settings-card-header" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card-title" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "settings-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-icon']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "badge blue" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
        /** @type {__VLS_StyleScopedClasses['blue']} */ ;
        (__VLS_ctx.timezoneStore.timezone);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "collapse-arrow" },
        });
        /** @type {__VLS_StyleScopedClasses['collapse-arrow']} */ ;
        (__VLS_ctx.tzExpanded ? '▲' : '▼');
        if (__VLS_ctx.tzExpanded) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "settings-card-body" },
            });
            /** @type {__VLS_StyleScopedClasses['settings-card-body']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "tz-info-row" },
            });
            /** @type {__VLS_StyleScopedClasses['tz-info-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "tz-info-text" },
            });
            /** @type {__VLS_StyleScopedClasses['tz-info-text']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (__VLS_ctx.browserTz);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.resetTzToBrowser) },
                ...{ class: "btn-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-grid" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (__VLS_ctx.tzSelected),
                ...{ class: "tz-select" },
            });
            /** @type {__VLS_StyleScopedClasses['tz-select']} */ ;
            for (const [tz] of __VLS_vFor((__VLS_ctx.tzList))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (tz.value),
                    value: (tz.value),
                });
                (tz.label);
                // @ts-ignore
                [tzExpanded, tzExpanded, timezoneStore, browserTz, resetTzToBrowser, tzSelected, tzList,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                placeholder: "留空则使用上方下拉选择",
                ...{ class: "tz-custom-input" },
            });
            (__VLS_ctx.tzCustom);
            /** @type {__VLS_StyleScopedClasses['tz-custom-input']} */ ;
            if (__VLS_ctx.tzPreview) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "tz-preview" },
                });
                /** @type {__VLS_StyleScopedClasses['tz-preview']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (__VLS_ctx.tzPreview);
            }
            if (__VLS_ctx.tzSaveMsg) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: (['msg', __VLS_ctx.tzSaveMsg.ok ? 'success' : 'error']) },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['msg']} */ ;
                (__VLS_ctx.tzSaveMsg.text);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "action-row" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['action-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.saveTz) },
                ...{ class: "btn-primary" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "tz-hint" },
            });
            /** @type {__VLS_StyleScopedClasses['tz-hint']} */ ;
        }
    }
    if (__VLS_ctx.authStore.isAdmin) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'admin'))
                        throw 0;
                    if (!(__VLS_ctx.authStore.isAdmin))
                        throw 0;
                    return (__VLS_ctx.smtpExpanded = !__VLS_ctx.smtpExpanded);
                    // @ts-ignore
                    [authStore, tzCustom, tzPreview, tzPreview, tzSaveMsg, tzSaveMsg, tzSaveMsg, saveTz, smtpExpanded, smtpExpanded,];
                } },
            ...{ class: "settings-card-header" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card-title" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "settings-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-icon']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        if (__VLS_ctx.smtpConfigured) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge green" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['green']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge gray" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['gray']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "collapse-arrow" },
        });
        /** @type {__VLS_StyleScopedClasses['collapse-arrow']} */ ;
        (__VLS_ctx.smtpExpanded ? '▲' : '▼');
        if (__VLS_ctx.smtpExpanded) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "settings-card-body" },
            });
            /** @type {__VLS_StyleScopedClasses['settings-card-body']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "quick-select-row" },
            });
            /** @type {__VLS_StyleScopedClasses['quick-select-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "quick-label" },
            });
            /** @type {__VLS_StyleScopedClasses['quick-label']} */ ;
            for (const [preset] of __VLS_vFor((__VLS_ctx.emailPresets))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.authStore.isAdmin))
                                throw 0;
                            if (!(__VLS_ctx.smtpExpanded))
                                throw 0;
                            return (__VLS_ctx.applyPreset(preset));
                            // @ts-ignore
                            [smtpExpanded, smtpExpanded, smtpConfigured, emailPresets, applyPreset,];
                        } },
                    key: (preset.label),
                    ...{ class: (['preset-btn', __VLS_ctx.smtpForm.smtp_host === preset.host ? 'active' : '']) },
                });
                /** @type {__VLS_StyleScopedClasses['preset-btn']} */ ;
                (preset.label);
                // @ts-ignore
                [smtpForm,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-grid" },
            });
            /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                placeholder: "如 example@qq.com",
            });
            (__VLS_ctx.smtpForm.smtp_user);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "password",
                placeholder: "QQ/163请使用授权码",
            });
            (__VLS_ctx.smtpForm.smtp_password);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                placeholder: "如 smtp.qq.com",
            });
            (__VLS_ctx.smtpForm.smtp_host);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                placeholder: "465",
            });
            (__VLS_ctx.smtpForm.smtp_port);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                placeholder: "留空则使用账号地址",
            });
            (__VLS_ctx.smtpForm.smtp_from);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field form-field-inline" },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            /** @type {__VLS_StyleScopedClasses['form-field-inline']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "toggle-row" },
            });
            /** @type {__VLS_StyleScopedClasses['toggle-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "toggle-label" },
            });
            /** @type {__VLS_StyleScopedClasses['toggle-label']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "radio",
                value: (true),
            });
            (__VLS_ctx.smtpForm.smtp_ssl);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "toggle-label" },
            });
            /** @type {__VLS_StyleScopedClasses['toggle-label']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "radio",
                value: (false),
            });
            (__VLS_ctx.smtpForm.smtp_ssl);
            if (__VLS_ctx.smtpSaveMsg) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: (['msg', __VLS_ctx.smtpSaveMsg.ok ? 'success' : 'error']) },
                });
                /** @type {__VLS_StyleScopedClasses['msg']} */ ;
                (__VLS_ctx.smtpSaveMsg.text);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "action-row" },
            });
            /** @type {__VLS_StyleScopedClasses['action-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.saveSmtp) },
                ...{ class: "btn-primary" },
                disabled: (__VLS_ctx.smtpSaving),
            });
            /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
            (__VLS_ctx.smtpSaving ? '保存中...' : '💾 保存配置');
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "test-row" },
            });
            /** @type {__VLS_StyleScopedClasses['test-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "test-label" },
            });
            /** @type {__VLS_StyleScopedClasses['test-label']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                placeholder: "输入收件人邮箱",
                ...{ class: "test-input" },
            });
            (__VLS_ctx.smtpTestEmail);
            /** @type {__VLS_StyleScopedClasses['test-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.sendTestEmail) },
                ...{ class: "btn-test" },
                disabled: (__VLS_ctx.smtpTesting),
            });
            /** @type {__VLS_StyleScopedClasses['btn-test']} */ ;
            (__VLS_ctx.smtpTesting ? '发送中...' : '📤 发送测试');
            if (__VLS_ctx.smtpTestMsg) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: (['msg', __VLS_ctx.smtpTestMsg.ok ? 'success' : 'error']) },
                });
                /** @type {__VLS_StyleScopedClasses['msg']} */ ;
                (__VLS_ctx.smtpTestMsg.text);
            }
        }
    }
    if (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'admin'))
                        throw 0;
                    if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                        throw 0;
                    return (__VLS_ctx.osatExpanded = !__VLS_ctx.osatExpanded);
                    // @ts-ignore
                    [authStore, authStore, smtpForm, smtpForm, smtpForm, smtpForm, smtpForm, smtpForm, smtpForm, smtpSaveMsg, smtpSaveMsg, smtpSaveMsg, saveSmtp, smtpSaving, smtpSaving, smtpTestEmail, sendTestEmail, smtpTesting, smtpTesting, smtpTestMsg, smtpTestMsg, smtpTestMsg, osatExpanded, osatExpanded,];
                } },
            ...{ class: "settings-card-header" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card-title" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "settings-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-icon']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "badge blue" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
        /** @type {__VLS_StyleScopedClasses['blue']} */ ;
        (__VLS_ctx.osatList.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "collapse-arrow" },
        });
        /** @type {__VLS_StyleScopedClasses['collapse-arrow']} */ ;
        (__VLS_ctx.osatExpanded ? '▲' : '▼');
        if (__VLS_ctx.osatExpanded) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "settings-card-body" },
            });
            /** @type {__VLS_StyleScopedClasses['settings-card-body']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "action-row" },
            });
            /** @type {__VLS_StyleScopedClasses['action-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab === 'admin'))
                            throw 0;
                        if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                            throw 0;
                        if (!(__VLS_ctx.osatExpanded))
                            throw 0;
                        return (__VLS_ctx.openOsatModal(null));
                        // @ts-ignore
                        [osatExpanded, osatExpanded, osatList, openOsatModal,];
                    } },
                ...{ class: "btn-primary" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
            if (__VLS_ctx.osatList.length === 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "empty-tip" },
                });
                /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
            }
            for (const [osat] of __VLS_vFor((__VLS_ctx.osatList))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (osat.id),
                    ...{ class: "osat-card" },
                });
                /** @type {__VLS_StyleScopedClasses['osat-card']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "osat-card-header" },
                });
                /** @type {__VLS_StyleScopedClasses['osat-card-header']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "osat-title-line" },
                });
                /** @type {__VLS_StyleScopedClasses['osat-title-line']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "osat-name-row" },
                });
                /** @type {__VLS_StyleScopedClasses['osat-name-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "osat-name" },
                });
                /** @type {__VLS_StyleScopedClasses['osat-name']} */ ;
                (osat.name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: (['badge', osat.enabled ? 'green' : 'gray']) },
                });
                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                (osat.enabled ? '● 已启用' : '○ 已停用');
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "osat-actions" },
                });
                /** @type {__VLS_StyleScopedClasses['osat-actions']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                                throw 0;
                            if (!(__VLS_ctx.osatExpanded))
                                throw 0;
                            return (__VLS_ctx.openOsatModal(osat));
                            // @ts-ignore
                            [osatList, osatList, openOsatModal,];
                        } },
                    ...{ class: "btn-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                                throw 0;
                            if (!(__VLS_ctx.osatExpanded))
                                throw 0;
                            return (__VLS_ctx.testOsatFtp(osat));
                            // @ts-ignore
                            [testOsatFtp,];
                        } },
                    ...{ class: "btn-sm btn-green" },
                    disabled: (osat._testing),
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                /** @type {__VLS_StyleScopedClasses['btn-green']} */ ;
                (osat._testing ? '测试中...' : '🔗 测试连接');
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                                throw 0;
                            if (!(__VLS_ctx.osatExpanded))
                                throw 0;
                            return (__VLS_ctx.toggleOsatStatus(osat));
                            // @ts-ignore
                            [toggleOsatStatus,];
                        } },
                    ...{ class: (['btn-sm', osat.enabled ? 'btn-warn' : 'btn-purple']) },
                    disabled: (osat._running),
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                (osat._running ? '处理中...' : (osat.enabled ? '⏹ 停止' : '▶ 启用'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                                throw 0;
                            if (!(__VLS_ctx.osatExpanded))
                                throw 0;
                            return (__VLS_ctx.deleteOsat(osat));
                            // @ts-ignore
                            [deleteOsat,];
                        } },
                    ...{ class: "btn-sm btn-warn" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                /** @type {__VLS_StyleScopedClasses['btn-warn']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "osat-meta" },
                });
                /** @type {__VLS_StyleScopedClasses['osat-meta']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                ((osat.protocol || 'ftp').toUpperCase());
                (osat.ftp_host);
                (osat.ftp_port);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (osat.ftp_user);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (osat.protocol === 'sftp' ? 'SFTP 加密' : __VLS_ctx.formatFtpEncryption(osat.ftp_encryption));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (osat.ftp_remote_dir);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (osat.ftp_summary_dir || '-');
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (osat.schedule_start);
                (osat.schedule_end);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "badge blue" },
                });
                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                /** @type {__VLS_StyleScopedClasses['blue']} */ ;
                (osat.data_type);
                if (osat._msg) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: (['msg', osat._msg.ok ? 'success' : 'error']) },
                        ...{ style: {} },
                    });
                    /** @type {__VLS_StyleScopedClasses['msg']} */ ;
                    (osat._msg.text);
                }
                // @ts-ignore
                [formatFtpEncryption,];
            }
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settings-card" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'admin'))
                    throw 0;
                return (__VLS_ctx.ftpLogExpanded = !__VLS_ctx.ftpLogExpanded);
                // @ts-ignore
                [ftpLogExpanded, ftpLogExpanded,];
            } },
        ...{ class: "settings-card-header" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-card-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settings-card-title" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-card-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "settings-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    ((__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng) ? 'FTP 上传日志' : '手动上传日志');
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "badge blue" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['blue']} */ ;
    (__VLS_ctx.activeLogSubTab === 'ftp' ? __VLS_ctx.logTotal + ' 条' : __VLS_ctx.manualLogTotal + ' 条');
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "collapse-arrow" },
    });
    /** @type {__VLS_StyleScopedClasses['collapse-arrow']} */ ;
    (__VLS_ctx.ftpLogExpanded ? '▲' : '▼');
    if (__VLS_ctx.ftpLogExpanded) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card-body" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-body']} */ ;
        if (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "quick-select-row" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['quick-select-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab === 'admin'))
                            throw 0;
                        if (!(__VLS_ctx.ftpLogExpanded))
                            throw 0;
                        if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                            throw 0;
                        return (__VLS_ctx.activeLogSubTab = 'ftp');
                        // @ts-ignore
                        [authStore, authStore, authStore, authStore, ftpLogExpanded, ftpLogExpanded, activeLogSubTab, activeLogSubTab, logTotal, manualLogTotal,];
                    } },
                ...{ class: (['preset-btn', __VLS_ctx.activeLogSubTab === 'ftp' ? 'active' : '']) },
            });
            /** @type {__VLS_StyleScopedClasses['preset-btn']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab === 'admin'))
                            throw 0;
                        if (!(__VLS_ctx.ftpLogExpanded))
                            throw 0;
                        if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                            throw 0;
                        return (__VLS_ctx.activeLogSubTab = 'manual');
                        // @ts-ignore
                        [activeLogSubTab, activeLogSubTab,];
                    } },
                ...{ class: (['preset-btn', __VLS_ctx.activeLogSubTab === 'manual' ? 'active' : '']) },
            });
            /** @type {__VLS_StyleScopedClasses['preset-btn']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab === 'admin'))
                            throw 0;
                        if (!(__VLS_ctx.ftpLogExpanded))
                            throw 0;
                        if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                            throw 0;
                        return (__VLS_ctx.activeLogSubTab = 'summary');
                        // @ts-ignore
                        [activeLogSubTab, activeLogSubTab,];
                    } },
                ...{ class: (['preset-btn', __VLS_ctx.activeLogSubTab === 'summary' ? 'active' : '']) },
            });
            /** @type {__VLS_StyleScopedClasses['preset-btn']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab === 'admin'))
                            throw 0;
                        if (!(__VLS_ctx.ftpLogExpanded))
                            throw 0;
                        if (!(__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng))
                            throw 0;
                        return (__VLS_ctx.activeLogSubTab = 'search');
                        // @ts-ignore
                        [activeLogSubTab, activeLogSubTab,];
                    } },
                ...{ class: (['preset-btn', __VLS_ctx.activeLogSubTab === 'search' ? 'active' : '']) },
            });
            /** @type {__VLS_StyleScopedClasses['preset-btn']} */ ;
        }
        if (__VLS_ctx.activeLogSubTab === 'ftp' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "log-filter-row" },
            });
            /** @type {__VLS_StyleScopedClasses['log-filter-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (__VLS_ctx.loadFtpLogs) },
                value: (__VLS_ctx.logFilterOsat),
                ...{ class: "filter-select-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['filter-select-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            for (const [o] of __VLS_vFor((__VLS_ctx.osatList))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (o.id),
                    value: (o.id),
                });
                (o.name);
                // @ts-ignore
                [authStore, authStore, osatList, activeLogSubTab, activeLogSubTab, loadFtpLogs, logFilterOsat,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (__VLS_ctx.loadFtpLogs) },
                value: (__VLS_ctx.logFilterStatus),
                ...{ class: "filter-select-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['filter-select-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "success",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "failed",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "manual skip",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "skipped",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "downing",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "pending",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "processing",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.loadFtpLogs) },
                ...{ class: "btn-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.handleProcessExistingLocal) },
                ...{ class: "btn-sm" },
                disabled: (__VLS_ctx.processingExistingLocal),
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            (__VLS_ctx.processingExistingLocal ? '处理中...' : '处理现有本地文件');
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.handleRetryAllFailed) },
                ...{ class: "btn-sm" },
                disabled: (__VLS_ctx.retryingAllFailed),
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            (__VLS_ctx.retryingAllFailed ? '重试中...' : '重试所有失效数据');
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.loadStuckFiles) },
                ...{ class: "btn-sm btn-warn" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            /** @type {__VLS_StyleScopedClasses['btn-warn']} */ ;
            if (__VLS_ctx.stuckFiles.length > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "stuck-badge" },
                });
                /** @type {__VLS_StyleScopedClasses['stuck-badge']} */ ;
                (__VLS_ctx.stuckFiles.length);
            }
            if (__VLS_ctx.stuckPanelVisible) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "stuck-panel" },
                });
                /** @type {__VLS_StyleScopedClasses['stuck-panel']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "stuck-panel-header" },
                });
                /** @type {__VLS_StyleScopedClasses['stuck-panel-header']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (__VLS_ctx.stuckMaxRetries);
                (__VLS_ctx.stuckFiles.length);
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "stuck-panel-actions" },
                });
                /** @type {__VLS_StyleScopedClasses['stuck-panel-actions']} */ ;
                if (__VLS_ctx.stuckFiles.length > 0) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (__VLS_ctx.retryAllStuck) },
                        ...{ class: "btn-sm btn-green" },
                        disabled: (__VLS_ctx.stuckRetrying),
                    });
                    /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                    /** @type {__VLS_StyleScopedClasses['btn-green']} */ ;
                    (__VLS_ctx.stuckRetrying ? '重置中...' : '🔁 全部重试');
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.ftpLogExpanded))
                                throw 0;
                            if (!(__VLS_ctx.activeLogSubTab === 'ftp' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                                throw 0;
                            if (!(__VLS_ctx.stuckPanelVisible))
                                throw 0;
                            return (__VLS_ctx.stuckPanelVisible = false);
                            // @ts-ignore
                            [loadFtpLogs, loadFtpLogs, logFilterStatus, handleProcessExistingLocal, processingExistingLocal, processingExistingLocal, handleRetryAllFailed, retryingAllFailed, retryingAllFailed, loadStuckFiles, stuckFiles, stuckFiles, stuckFiles, stuckFiles, stuckPanelVisible, stuckPanelVisible, stuckMaxRetries, retryAllStuck, stuckRetrying, stuckRetrying,];
                        } },
                    ...{ class: "btn-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                if (__VLS_ctx.stuckFiles.length === 0) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "empty-tip" },
                        ...{ style: {} },
                    });
                    /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                        ...{ class: "log-table" },
                        ...{ style: {} },
                    });
                    /** @type {__VLS_StyleScopedClasses['log-table']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.colgroup, __VLS_intrinsics.colgroup)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.col)({});
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
                    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
                    for (const [f] of __VLS_vFor((__VLS_ctx.stuckFiles))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                            key: (f.remote_path),
                        });
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "osat-tag" },
                        });
                        /** @type {__VLS_StyleScopedClasses['osat-tag']} */ ;
                        (f.osat_name || '—');
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "log-path" },
                            title: (f.remote_path),
                        });
                        /** @type {__VLS_StyleScopedClasses['log-path']} */ ;
                        (f.filename);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ style: {} },
                        });
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge red" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['red']} */ ;
                        (f.fail_count);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                        (__VLS_ctx.fmtDate(f.last_attempt));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            ...{ class: "log-error" },
                            title: (f.last_error),
                        });
                        /** @type {__VLS_StyleScopedClasses['log-error']} */ ;
                        (f.last_error || '—');
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(__VLS_ctx.activeTab === 'admin'))
                                        throw 0;
                                    if (!(__VLS_ctx.ftpLogExpanded))
                                        throw 0;
                                    if (!(__VLS_ctx.activeLogSubTab === 'ftp' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                                        throw 0;
                                    if (!(__VLS_ctx.stuckPanelVisible))
                                        throw 0;
                                    if (!!(__VLS_ctx.stuckFiles.length === 0))
                                        throw 0;
                                    return (__VLS_ctx.retryOneStuck(f));
                                    // @ts-ignore
                                    [fmtDate, stuckFiles, stuckFiles, retryOneStuck,];
                                } },
                            ...{ class: "btn-sm btn-green" },
                            disabled: (f._retrying),
                        });
                        /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                        /** @type {__VLS_StyleScopedClasses['btn-green']} */ ;
                        (f._retrying ? '...' : '🔁 重试');
                        // @ts-ignore
                        [];
                    }
                }
                if (__VLS_ctx.stuckMsg) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: (['msg', __VLS_ctx.stuckMsg.ok ? 'success' : 'error']) },
                        ...{ style: {} },
                    });
                    /** @type {__VLS_StyleScopedClasses['msg']} */ ;
                    (__VLS_ctx.stuckMsg.text);
                }
            }
            if (__VLS_ctx.logsLoading) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "loading" },
                });
                /** @type {__VLS_StyleScopedClasses['loading']} */ ;
            }
            else if (__VLS_ctx.ftpLogs.length === 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "empty-tip" },
                });
                /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                    ...{ class: "log-table" },
                });
                /** @type {__VLS_StyleScopedClasses['log-table']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.colgroup, __VLS_intrinsics.colgroup)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
                for (const [log] of __VLS_vFor((__VLS_ctx.ftpLogs))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                        key: (log.id),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "osat-tag" },
                    });
                    /** @type {__VLS_StyleScopedClasses['osat-tag']} */ ;
                    (log.osat_name || '—');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "log-path" },
                        title: (log.remote_path),
                    });
                    /** @type {__VLS_StyleScopedClasses['log-path']} */ ;
                    (log.filename || log.remote_path);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    if (log.status === 'success') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge green" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['green']} */ ;
                    }
                    else if (log.status === 'failed') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ style: {} },
                        });
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge red" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['red']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(__VLS_ctx.activeTab === 'admin'))
                                        throw 0;
                                    if (!(__VLS_ctx.ftpLogExpanded))
                                        throw 0;
                                    if (!(__VLS_ctx.activeLogSubTab === 'ftp' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                                        throw 0;
                                    if (!!(__VLS_ctx.logsLoading))
                                        throw 0;
                                    if (!!(__VLS_ctx.ftpLogs.length === 0))
                                        throw 0;
                                    if (!!(log.status === 'success'))
                                        throw 0;
                                    if (!(log.status === 'failed'))
                                        throw 0;
                                    return (__VLS_ctx.retryFtpLog(log.id));
                                    // @ts-ignore
                                    [stuckMsg, stuckMsg, stuckMsg, logsLoading, ftpLogs, ftpLogs, retryFtpLog,];
                                } },
                            ...{ class: "btn-sm btn-retry" },
                            ...{ style: {} },
                        });
                        /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                        /** @type {__VLS_StyleScopedClasses['btn-retry']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(__VLS_ctx.activeTab === 'admin'))
                                        throw 0;
                                    if (!(__VLS_ctx.ftpLogExpanded))
                                        throw 0;
                                    if (!(__VLS_ctx.activeLogSubTab === 'ftp' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                                        throw 0;
                                    if (!!(__VLS_ctx.logsLoading))
                                        throw 0;
                                    if (!!(__VLS_ctx.ftpLogs.length === 0))
                                        throw 0;
                                    if (!!(log.status === 'success'))
                                        throw 0;
                                    if (!(log.status === 'failed'))
                                        throw 0;
                                    return (__VLS_ctx.skipFtpLog(log.id));
                                    // @ts-ignore
                                    [skipFtpLog,];
                                } },
                            ...{ class: "btn-sm btn-skip" },
                            ...{ style: {} },
                        });
                        /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                        /** @type {__VLS_StyleScopedClasses['btn-skip']} */ ;
                    }
                    else if (log.status === 'manual skip') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge orange" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['orange']} */ ;
                    }
                    else if (log.status === 'skipped') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge orange" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['orange']} */ ;
                    }
                    else if (log.status === 'downing') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge blue" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['blue']} */ ;
                    }
                    else if (log.status === 'pending') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge gray" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['gray']} */ ;
                    }
                    else if (log.status === 'processing') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge purple" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['purple']} */ ;
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge blue" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['blue']} */ ;
                        (log.status);
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (log.file_size ? __VLS_ctx.fmtBytes(log.file_size) : '—');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (__VLS_ctx.fmtDate(log.uploaded_at));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "log-error" },
                    });
                    /** @type {__VLS_StyleScopedClasses['log-error']} */ ;
                    (log.error_msg || (log.lot_id_created ? `Lot#${log.lot_id_created}` : '—'));
                    // @ts-ignore
                    [fmtDate, fmtBytes,];
                }
            }
            if (__VLS_ctx.logTotal > __VLS_ctx.logPageSize) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "log-pagination" },
                });
                /** @type {__VLS_StyleScopedClasses['log-pagination']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.ftpLogExpanded))
                                throw 0;
                            if (!(__VLS_ctx.activeLogSubTab === 'ftp' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                                throw 0;
                            if (!(__VLS_ctx.logTotal > __VLS_ctx.logPageSize))
                                throw 0;
                            __VLS_ctx.logPage--;
                            __VLS_ctx.loadFtpLogs();
                            // @ts-ignore
                            [logTotal, loadFtpLogs, logPageSize, logPage,];
                        } },
                    disabled: (__VLS_ctx.logPage === 1),
                    ...{ class: "btn-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (__VLS_ctx.logPage);
                (Math.ceil(__VLS_ctx.logTotal / __VLS_ctx.logPageSize));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.ftpLogExpanded))
                                throw 0;
                            if (!(__VLS_ctx.activeLogSubTab === 'ftp' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                                throw 0;
                            if (!(__VLS_ctx.logTotal > __VLS_ctx.logPageSize))
                                throw 0;
                            __VLS_ctx.logPage++;
                            __VLS_ctx.loadFtpLogs();
                            // @ts-ignore
                            [logTotal, loadFtpLogs, logPageSize, logPage, logPage, logPage,];
                        } },
                    disabled: (__VLS_ctx.logPage * __VLS_ctx.logPageSize >= __VLS_ctx.logTotal),
                    ...{ class: "btn-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            }
        }
        if (__VLS_ctx.activeLogSubTab === 'manual' || (!__VLS_ctx.authStore.isAdmin && !__VLS_ctx.authStore.isEng)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "log-filter-row" },
            });
            /** @type {__VLS_StyleScopedClasses['log-filter-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (__VLS_ctx.loadManualLogs) },
                value: (__VLS_ctx.manualLogFilterType),
                ...{ class: "filter-select-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['filter-select-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "data",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "program",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (__VLS_ctx.loadManualLogs) },
                value: (__VLS_ctx.manualLogFilterStatus),
                ...{ class: "filter-select-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['filter-select-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "success",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "failed",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "processing",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "deleted",
            });
            if (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                    ...{ onChange: (__VLS_ctx.loadManualLogs) },
                    value: (__VLS_ctx.manualLogFilterOperator),
                    ...{ class: "filter-select-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['filter-select-sm']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    value: "",
                });
                for (const [op] of __VLS_vFor((__VLS_ctx.manualOperators))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        key: (op),
                        value: (op),
                    });
                    (op);
                    // @ts-ignore
                    [authStore, authStore, authStore, authStore, activeLogSubTab, logTotal, logPageSize, logPage, loadManualLogs, loadManualLogs, loadManualLogs, manualLogFilterType, manualLogFilterStatus, manualLogFilterOperator, manualOperators,];
                }
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.loadManualLogs) },
                ...{ class: "btn-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            if (__VLS_ctx.manualLogsLoading) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "loading" },
                });
                /** @type {__VLS_StyleScopedClasses['loading']} */ ;
            }
            else if (__VLS_ctx.manualLogs.length === 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "empty-tip" },
                });
                /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                    ...{ class: "log-table" },
                });
                /** @type {__VLS_StyleScopedClasses['log-table']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.colgroup, __VLS_intrinsics.colgroup)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                    ...{ style: {} },
                });
                if (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
                        ...{ style: {} },
                    });
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                if (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
                for (const [log] of __VLS_vFor((__VLS_ctx.manualLogs))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                        key: (log.upload_type + '-' + log.id),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: (['badge', log.upload_type === 'program' ? 'purple' : 'blue']) },
                    });
                    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                    (log.upload_type === 'program' ? '程序' : '数据');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "log-path" },
                        title: (log.filename),
                    });
                    /** @type {__VLS_StyleScopedClasses['log-path']} */ ;
                    (log.filename);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    if (log.status === 'success') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge green" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['green']} */ ;
                    }
                    else if (log.status === 'failed') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge red" },
                            title: (log.error_msg),
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['red']} */ ;
                    }
                    else if (log.status === 'deleted') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge gray" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['gray']} */ ;
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge blue" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['blue']} */ ;
                    }
                    if (log.status === 'failed' && log.error_msg) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "log-error" },
                            title: (log.error_msg),
                            ...{ style: {} },
                        });
                        /** @type {__VLS_StyleScopedClasses['log-error']} */ ;
                        (log.error_msg);
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (log.file_size ? __VLS_ctx.fmtBytes(log.file_size) : '—');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (__VLS_ctx.fmtDate(log.upload_date));
                    if (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                        (log.uploader_name || '—');
                    }
                    // @ts-ignore
                    [authStore, authStore, authStore, authStore, authStore, authStore, fmtDate, fmtBytes, loadManualLogs, manualLogsLoading, manualLogs, manualLogs,];
                }
            }
            if (__VLS_ctx.manualLogTotal > __VLS_ctx.manualLogPageSize) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "log-pagination" },
                });
                /** @type {__VLS_StyleScopedClasses['log-pagination']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.ftpLogExpanded))
                                throw 0;
                            if (!(__VLS_ctx.activeLogSubTab === 'manual' || (!__VLS_ctx.authStore.isAdmin && !__VLS_ctx.authStore.isEng)))
                                throw 0;
                            if (!(__VLS_ctx.manualLogTotal > __VLS_ctx.manualLogPageSize))
                                throw 0;
                            __VLS_ctx.manualLogPage--;
                            __VLS_ctx.loadManualLogs();
                            // @ts-ignore
                            [manualLogTotal, loadManualLogs, manualLogPageSize, manualLogPage,];
                        } },
                    disabled: (__VLS_ctx.manualLogPage === 1),
                    ...{ class: "btn-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (__VLS_ctx.manualLogPage);
                (Math.ceil(__VLS_ctx.manualLogTotal / __VLS_ctx.manualLogPageSize));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.ftpLogExpanded))
                                throw 0;
                            if (!(__VLS_ctx.activeLogSubTab === 'manual' || (!__VLS_ctx.authStore.isAdmin && !__VLS_ctx.authStore.isEng)))
                                throw 0;
                            if (!(__VLS_ctx.manualLogTotal > __VLS_ctx.manualLogPageSize))
                                throw 0;
                            __VLS_ctx.manualLogPage++;
                            __VLS_ctx.loadManualLogs();
                            // @ts-ignore
                            [manualLogTotal, loadManualLogs, manualLogPageSize, manualLogPage, manualLogPage, manualLogPage,];
                        } },
                    disabled: (__VLS_ctx.manualLogPage * __VLS_ctx.manualLogPageSize >= __VLS_ctx.manualLogTotal),
                    ...{ class: "btn-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            }
        }
        if (__VLS_ctx.activeLogSubTab === 'summary' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "log-filter-row" },
            });
            /** @type {__VLS_StyleScopedClasses['log-filter-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.loadDailySummary) },
                ...{ class: "btn-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            if (__VLS_ctx.summaryLoading) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "loading" },
                });
                /** @type {__VLS_StyleScopedClasses['loading']} */ ;
            }
            else if (__VLS_ctx.summaryRows.length === 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "empty-tip" },
                });
                /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                    ...{ class: "log-table" },
                });
                /** @type {__VLS_StyleScopedClasses['log-table']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ style: {} },
                });
                for (const [o] of __VLS_vFor((__VLS_ctx.summaryOsats))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                        key: (o.id),
                    });
                    (o.name);
                    // @ts-ignore
                    [authStore, authStore, activeLogSubTab, manualLogTotal, manualLogPageSize, manualLogPage, loadDailySummary, summaryLoading, summaryRows, summaryOsats,];
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
                for (const [row] of __VLS_vFor((__VLS_ctx.summaryRows))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                        key: (row.date),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ style: {} },
                    });
                    (row.date);
                    for (const [o] of __VLS_vFor((__VLS_ctx.summaryOsats))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            key: (o.id),
                        });
                        if (row.stats[o.id]) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                            if (row.date === 'total') {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: {} },
                                    title: "data_pass",
                                });
                                (row.stats[o.id].data_pass ?? row.stats[o.id].success ?? 0);
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: {} },
                                });
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: {} },
                                    title: "summary_pass",
                                });
                                (row.stats[o.id].summary_pass ?? 0);
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: {} },
                                });
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: ({ color: row.stats[o.id].failed > 0 ? '#dc2626' : '#64748b', fontWeight: row.stats[o.id].failed > 0 ? '600' : 'normal' }) },
                                    title: "fail",
                                });
                                (row.stats[o.id].failed);
                            }
                            else {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: {} },
                                    title: "data_pass",
                                });
                                (row.stats[o.id].data_pass ?? row.stats[o.id].success ?? 0);
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: {} },
                                });
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: {} },
                                    title: "summary_pass",
                                });
                                (row.stats[o.id].summary_pass ?? 0);
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: {} },
                                });
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ style: ({ color: row.stats[o.id].failed > 0 ? '#dc2626' : '#64748b', fontWeight: row.stats[o.id].failed > 0 ? '600' : 'normal' }) },
                                    title: "fail",
                                });
                                (row.stats[o.id].failed);
                                if (row.stats[o.id].total !== undefined) {
                                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                        ...{ style: {} },
                                    });
                                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                        ...{ style: {} },
                                        title: "total",
                                    });
                                    (row.stats[o.id].total);
                                }
                            }
                        }
                        else {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ style: {} },
                            });
                        }
                        // @ts-ignore
                        [summaryRows, summaryOsats,];
                    }
                    // @ts-ignore
                    [];
                }
            }
        }
        if (__VLS_ctx.activeLogSubTab === 'search' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "log-filter-row" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['log-filter-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab === 'admin'))
                            throw 0;
                        if (!(__VLS_ctx.ftpLogExpanded))
                            throw 0;
                        if (!(__VLS_ctx.activeLogSubTab === 'search' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                            throw 0;
                        __VLS_ctx.snapshotPage = 1;
                        __VLS_ctx.loadSnapshotSearch();
                        // @ts-ignore
                        [authStore, authStore, activeLogSubTab, snapshotPage, loadSnapshotSearch,];
                    } },
                value: (__VLS_ctx.snapshotFilterOsat),
                ...{ class: "filter-select-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['filter-select-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            for (const [o] of __VLS_vFor((__VLS_ctx.osatList))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (o.id),
                    value: (o.id),
                });
                (o.name);
                // @ts-ignore
                [osatList, snapshotFilterOsat,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab === 'admin'))
                            throw 0;
                        if (!(__VLS_ctx.ftpLogExpanded))
                            throw 0;
                        if (!(__VLS_ctx.activeLogSubTab === 'search' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                            throw 0;
                        __VLS_ctx.snapshotPage = 1;
                        __VLS_ctx.loadSnapshotSearch();
                        // @ts-ignore
                        [snapshotPage, loadSnapshotSearch,];
                    } },
                value: (__VLS_ctx.snapshotFilterStatus),
                ...{ class: "filter-select-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['filter-select-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "success",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "failed",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "manual skip",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "pending",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "scanned",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "ignored",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (__VLS_ctx.onSnapshotSearchInput) },
                placeholder: "🔍 实时输入 LOT 号 (如 KD06437_W14)、文件名或 FTP 路径...",
                ...{ class: "filter-input-sm" },
                ...{ style: {} },
            });
            (__VLS_ctx.snapshotSearchQuery);
            /** @type {__VLS_StyleScopedClasses['filter-input-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.resetSnapshotSearch) },
                ...{ class: "btn-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "log-table-wrapper" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['log-table-wrapper']} */ ;
            if (__VLS_ctx.snapshotLoading) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "loading-state" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['loading-state']} */ ;
            }
            else if (!__VLS_ctx.snapshotItems.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "empty-tip" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ style: {} },
                });
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                    ...{ class: "log-table" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['log-table']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.colgroup, __VLS_intrinsics.colgroup)({});
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
                __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ style: {} },
                    title: "可拖拽右下角或右侧边缘自由调整宽度",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
                for (const [item] of __VLS_vFor((__VLS_ctx.snapshotItems))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                        key: (item.id),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "osat-tag" },
                    });
                    /** @type {__VLS_StyleScopedClasses['osat-tag']} */ ;
                    (item.osat_name || 'OSAT-' + item.osat_id);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ style: {} },
                    });
                    (item.filename || item.remote_path.split('/').pop());
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "log-path" },
                        ...{ style: {} },
                        title: (item.remote_path),
                    });
                    /** @type {__VLS_StyleScopedClasses['log-path']} */ ;
                    (item.remote_path);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ style: {} },
                    });
                    (item.file_size ? __VLS_ctx.fmtBytes(item.file_size) : '—');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ style: {} },
                    });
                    (__VLS_ctx.fmtDate(item.uploaded_at));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ style: {} },
                    });
                    if (item.status === 'success') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge green" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['green']} */ ;
                    }
                    else if (item.status === 'failed') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge red" },
                            title: (item.error_msg),
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['red']} */ ;
                    }
                    else if (item.status === 'manual skip') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge orange" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['orange']} */ ;
                    }
                    else if (item.status === 'scanned') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge blue" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['blue']} */ ;
                    }
                    else if (item.status === 'ignored' || item.status === 'ignore') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge gray" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['gray']} */ ;
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge gray" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['gray']} */ ;
                        (item.status);
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ style: {} },
                    });
                    if (item.lot_id_created) {
                        let __VLS_0;
                        /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
                        RouterLink;
                        // @ts-ignore
                        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
                            to: (`/lot/${item.lot_id_created}`),
                            ...{ class: "btn-sm" },
                            ...{ style: {} },
                            target: "_blank",
                        }));
                        const __VLS_2 = __VLS_1({
                            to: (`/lot/${item.lot_id_created}`),
                            ...{ class: "btn-sm" },
                            ...{ style: {} },
                            target: "_blank",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
                        /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                        const { default: __VLS_5 } = __VLS_3.slots;
                        (item.lot_id_created);
                        // @ts-ignore
                        [fmtDate, fmtBytes, snapshotFilterStatus, onSnapshotSearchInput, snapshotSearchQuery, resetSnapshotSearch, snapshotLoading, snapshotItems, snapshotItems,];
                        var __VLS_3;
                    }
                    else if (item.status === 'success') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ style: {} },
                        });
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ style: {} },
                        });
                    }
                    // @ts-ignore
                    [];
                }
            }
            if (__VLS_ctx.snapshotTotal > __VLS_ctx.snapshotPageSize) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "log-pagination" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['log-pagination']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.ftpLogExpanded))
                                throw 0;
                            if (!(__VLS_ctx.activeLogSubTab === 'search' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                                throw 0;
                            if (!(__VLS_ctx.snapshotTotal > __VLS_ctx.snapshotPageSize))
                                throw 0;
                            __VLS_ctx.snapshotPage--;
                            __VLS_ctx.loadSnapshotSearch();
                            // @ts-ignore
                            [snapshotPage, loadSnapshotSearch, snapshotTotal, snapshotPageSize,];
                        } },
                    disabled: (__VLS_ctx.snapshotPage === 1),
                    ...{ class: "btn-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (__VLS_ctx.snapshotPage);
                (Math.ceil(__VLS_ctx.snapshotTotal / __VLS_ctx.snapshotPageSize));
                (__VLS_ctx.snapshotTotal);
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.activeTab === 'admin'))
                                throw 0;
                            if (!(__VLS_ctx.ftpLogExpanded))
                                throw 0;
                            if (!(__VLS_ctx.activeLogSubTab === 'search' && (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng)))
                                throw 0;
                            if (!(__VLS_ctx.snapshotTotal > __VLS_ctx.snapshotPageSize))
                                throw 0;
                            __VLS_ctx.snapshotPage++;
                            __VLS_ctx.loadSnapshotSearch();
                            // @ts-ignore
                            [snapshotPage, snapshotPage, snapshotPage, loadSnapshotSearch, snapshotTotal, snapshotTotal, snapshotPageSize,];
                        } },
                    disabled: (__VLS_ctx.snapshotPage * __VLS_ctx.snapshotPageSize >= __VLS_ctx.snapshotTotal),
                    ...{ class: "btn-sm" },
                });
                /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
            }
        }
    }
    if (__VLS_ctx.authStore.isAdmin) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'admin'))
                        throw 0;
                    if (!(__VLS_ctx.authStore.isAdmin))
                        throw 0;
                    return (__VLS_ctx.userMgmtExpanded = !__VLS_ctx.userMgmtExpanded);
                    // @ts-ignore
                    [authStore, snapshotPage, snapshotTotal, snapshotPageSize, userMgmtExpanded, userMgmtExpanded,];
                } },
            ...{ class: "settings-card-header" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-card-title" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-card-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "settings-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-icon']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "collapse-arrow" },
        });
        /** @type {__VLS_StyleScopedClasses['collapse-arrow']} */ ;
        (__VLS_ctx.userMgmtExpanded ? '▲' : '▼');
        if (__VLS_ctx.userMgmtExpanded) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "settings-card-body" },
            });
            /** @type {__VLS_StyleScopedClasses['settings-card-body']} */ ;
            if (__VLS_ctx.adminLoading) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "loading" },
                });
                /** @type {__VLS_StyleScopedClasses['loading']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                    ...{ class: "user-table" },
                });
                /** @type {__VLS_StyleScopedClasses['user-table']} */ ;
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
                __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
                for (const [u] of __VLS_vFor((__VLS_ctx.userList))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                        key: (u.id),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (u.username);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "email-cell" },
                    });
                    /** @type {__VLS_StyleScopedClasses['email-cell']} */ ;
                    (u.email);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                        ...{ onChange: (...[$event]) => {
                                if (!(__VLS_ctx.activeTab === 'admin'))
                                    throw 0;
                                if (!(__VLS_ctx.authStore.isAdmin))
                                    throw 0;
                                if (!(__VLS_ctx.userMgmtExpanded))
                                    throw 0;
                                if (!!(__VLS_ctx.adminLoading))
                                    throw 0;
                                return (__VLS_ctx.toggleAlerts(u));
                                // @ts-ignore
                                [userMgmtExpanded, userMgmtExpanded, adminLoading, userList, toggleAlerts,];
                            } },
                        type: "checkbox",
                        checked: (u.receive_alerts),
                        disabled: (u.role === 'user'),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: (['badge', u.is_active ? 'green' : 'red']) },
                    });
                    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                    (u.is_active ? '正常' : '已禁用');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    if (u.role === 'admin') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge gold" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['gold']} */ ;
                    }
                    else if (u.role === 'eng') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge blue" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['blue']} */ ;
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge gray" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        /** @type {__VLS_StyleScopedClasses['gray']} */ ;
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (__VLS_ctx.fmtDate(u.created_at));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    if (u.last_login_at) {
                        (__VLS_ctx.fmtDate(u.last_login_at));
                        if (u.last_login_ip) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ class: "ip-text" },
                            });
                            /** @type {__VLS_StyleScopedClasses['ip-text']} */ ;
                            (u.last_login_ip);
                        }
                    }
                    else {
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                    (u.lot_count);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "action-cell" },
                    });
                    /** @type {__VLS_StyleScopedClasses['action-cell']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.activeTab === 'admin'))
                                    throw 0;
                                if (!(__VLS_ctx.authStore.isAdmin))
                                    throw 0;
                                if (!(__VLS_ctx.userMgmtExpanded))
                                    throw 0;
                                if (!!(__VLS_ctx.adminLoading))
                                    throw 0;
                                return (__VLS_ctx.toggleActive(u));
                                // @ts-ignore
                                [fmtDate, fmtDate, toggleActive,];
                            } },
                        ...{ class: "btn-sm" },
                        disabled: (u.id === __VLS_ctx.authStore.user?.id),
                    });
                    /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                    (u.is_active ? '禁用' : '启用');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                        ...{ onChange: (...[$event]) => {
                                if (!(__VLS_ctx.activeTab === 'admin'))
                                    throw 0;
                                if (!(__VLS_ctx.authStore.isAdmin))
                                    throw 0;
                                if (!(__VLS_ctx.userMgmtExpanded))
                                    throw 0;
                                if (!!(__VLS_ctx.adminLoading))
                                    throw 0;
                                return (__VLS_ctx.setRole(u));
                                // @ts-ignore
                                [authStore, setRole,];
                            } },
                        value: (u.role),
                        ...{ class: "role-select" },
                        disabled: (u.id === __VLS_ctx.authStore.user?.id),
                    });
                    /** @type {__VLS_StyleScopedClasses['role-select']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        value: "user",
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        value: "eng",
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        value: "admin",
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.activeTab === 'admin'))
                                    throw 0;
                                if (!(__VLS_ctx.authStore.isAdmin))
                                    throw 0;
                                if (!(__VLS_ctx.userMgmtExpanded))
                                    throw 0;
                                if (!!(__VLS_ctx.adminLoading))
                                    throw 0;
                                return (__VLS_ctx.openResetPw(u));
                                // @ts-ignore
                                [authStore, openResetPw,];
                            } },
                        ...{ class: "btn-sm btn-warn" },
                    });
                    /** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
                    /** @type {__VLS_StyleScopedClasses['btn-warn']} */ ;
                    // @ts-ignore
                    [];
                }
            }
        }
    }
    if (__VLS_ctx.resetTarget) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'admin'))
                        throw 0;
                    if (!(__VLS_ctx.resetTarget))
                        throw 0;
                    return (__VLS_ctx.resetTarget = null);
                    // @ts-ignore
                    [resetTarget, resetTarget,];
                } },
            ...{ class: "modal-overlay" },
        });
        /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "modal" },
        });
        /** @type {__VLS_StyleScopedClasses['modal']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.resetTarget.username);
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "password",
            placeholder: "至少8位",
            ...{ class: "modal-input" },
        });
        (__VLS_ctx.newPwForUser);
        /** @type {__VLS_StyleScopedClasses['modal-input']} */ ;
        if (__VLS_ctx.adminPwError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "msg error" },
            });
            /** @type {__VLS_StyleScopedClasses['msg']} */ ;
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (__VLS_ctx.adminPwError);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "modal-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.doAdminResetPw) },
            ...{ class: "btn-primary" },
            disabled: (__VLS_ctx.adminPwLoading),
        });
        /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
        (__VLS_ctx.adminPwLoading ? '保存中...' : '确认重置');
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'admin'))
                        throw 0;
                    if (!(__VLS_ctx.resetTarget))
                        throw 0;
                    return (__VLS_ctx.resetTarget = null);
                    // @ts-ignore
                    [resetTarget, resetTarget, newPwForUser, adminPwError, adminPwError, doAdminResetPw, adminPwLoading, adminPwLoading,];
                } },
            ...{ class: "btn-cancel" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
    }
    if (__VLS_ctx.osatModal) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'admin'))
                        throw 0;
                    if (!(__VLS_ctx.osatModal))
                        throw 0;
                    return (__VLS_ctx.osatModal = null);
                    // @ts-ignore
                    [osatModal, osatModal,];
                } },
            ...{ class: "modal-overlay" },
        });
        /** @type {__VLS_StyleScopedClasses['modal-overlay']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "modal modal-lg" },
        });
        /** @type {__VLS_StyleScopedClasses['modal']} */ ;
        /** @type {__VLS_StyleScopedClasses['modal-lg']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_ctx.osatModal.id ? '编辑 OSAT' : '新增 OSAT');
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field quick-ftp-parser" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        /** @type {__VLS_StyleScopedClasses['quick-ftp-parser']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
            value: (__VLS_ctx.osatQuickInput),
            placeholder: "可粘贴带标签配置，或按顺序粘贴：OSAT名称  服务器地址  端口  用户名  密码  Data目录  Summary目录",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "quick-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['quick-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.parseOsatQuickInput) },
            ...{ class: "btn-primary small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "quick-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['quick-hint']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "如 HTKS_JS, LBS, Chipmore, UCD",
        });
        (__VLS_ctx.osatModal.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: (__VLS_ctx.onProtocolChange) },
            value: (__VLS_ctx.osatModal.protocol),
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "ftp",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "sftp",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.osatModal.protocol === 'sftp' ? 'SFTP' : 'FTP');
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "如 192.168.1.100",
        });
        (__VLS_ctx.osatModal.ftp_host);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.osatModal.protocol === 'sftp' ? 'SFTP' : 'FTP');
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            placeholder: (__VLS_ctx.osatModal.protocol === 'sftp' ? '22' : '21'),
        });
        (__VLS_ctx.osatModal.ftp_port);
        if (__VLS_ctx.osatModal.protocol !== 'sftp') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (__VLS_ctx.osatModal.ftp_encryption),
                ...{ style: {} },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "explicit_tls_optional",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "explicit_tls_required",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "implicit_tls_required",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "plain",
            });
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-field" },
            });
            /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "text",
                value: "SSH 安全通道（强加密）",
                disabled: true,
                ...{ style: {} },
            });
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.osatModal.protocol === 'sftp' ? 'SFTP' : 'FTP');
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "登录用户名",
        });
        (__VLS_ctx.osatModal.ftp_user);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.osatModal.protocol === 'sftp' ? 'SFTP' : 'FTP');
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "password",
            placeholder: "登录密码",
        });
        (__VLS_ctx.osatModal.ftp_password);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "如 /data 或 /",
        });
        (__VLS_ctx.osatModal.ftp_remote_dir);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "如 /Summary 或 /CP Report",
        });
        (__VLS_ctx.osatModal.ftp_summary_dir);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "22:00",
        });
        (__VLS_ctx.osatModal.schedule_start);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            placeholder: "08:00",
        });
        (__VLS_ctx.osatModal.schedule_end);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_ctx.osatModal.data_type),
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "CP",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "FT",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-field" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "toggle-label" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['toggle-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (__VLS_ctx.osatModal.enabled);
        if (__VLS_ctx.osatModalError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "msg error" },
            });
            /** @type {__VLS_StyleScopedClasses['msg']} */ ;
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (__VLS_ctx.osatModalError);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "modal-actions" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['modal-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.saveOsatModal) },
            ...{ class: "btn-primary" },
            disabled: (__VLS_ctx.osatModalSaving),
        });
        /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
        (__VLS_ctx.osatModalSaving ? '保存中...' : '保存');
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'admin'))
                        throw 0;
                    if (!(__VLS_ctx.osatModal))
                        throw 0;
                    return (__VLS_ctx.osatModal = null);
                    // @ts-ignore
                    [osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatModal, osatQuickInput, parseOsatQuickInput, onProtocolChange, osatModalError, osatModalError, saveOsatModal, osatModalSaving, osatModalSaving,];
                } },
            ...{ class: "btn-cancel" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
