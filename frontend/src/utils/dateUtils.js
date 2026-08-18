import { useTimezoneStore } from '@/stores/timezone';
/**
 * 将无时区标识的日期字符串强制标记为 UTC：
 * 若字符串末尾无 Z / +HH:MM / -HH:MM，则追加 Z，
 * 保证 new Date() 以 UTC 解析（数据库存储的系统时间均为 UTC naive）。
 */
function toUtcString(d) {
    const s = d.trim().replace(' ', 'T'); // 兼容 "2026-06-04 13:30:55" 格式
    if (/[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s))
        return s;
    return s + 'Z';
}
/**
 * 格式化日期时间字符串（带时区），显示格式：YYYY-MM-DD HH:mm:ss
 * 时区从 timezone store 读取（用户可在系统管理中配置）
 */
export function fmtDateTz(d) {
    if (!d)
        return '';
    const store = useTimezoneStore();
    return new Date(toUtcString(d)).toLocaleString('zh-CN', {
        timeZone: store.timezone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).replace(/\//g, '-');
}
/**
 * 仅格式化日期部分（YYYY-MM-DD），时区感知
 */
export function fmtDateOnlyTz(d) {
    if (!d)
        return '';
    const store = useTimezoneStore();
    const dt = new Date(toUtcString(d));
    if (isNaN(dt.getTime()))
        return String(d);
    return dt.toLocaleDateString('zh-CN', {
        timeZone: store.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).replace(/\//g, '-');
}
/**
 * 常用 IANA 时区列表，用于下拉选择
 */
export const COMMON_TIMEZONES = [
    // 亚洲
    { label: 'UTC+8 北京/上海/台北/香港 (Asia/Shanghai)', value: 'Asia/Shanghai' },
    { label: 'UTC+8 新加坡 (Asia/Singapore)', value: 'Asia/Singapore' },
    { label: 'UTC+8 吉隆坡 (Asia/Kuala_Lumpur)', value: 'Asia/Kuala_Lumpur' },
    { label: 'UTC+9 东京/首尔 (Asia/Tokyo)', value: 'Asia/Tokyo' },
    { label: 'UTC+9 首尔 (Asia/Seoul)', value: 'Asia/Seoul' },
    { label: 'UTC+7 曼谷/河内 (Asia/Bangkok)', value: 'Asia/Bangkok' },
    { label: 'UTC+5:30 印度 (Asia/Kolkata)', value: 'Asia/Kolkata' },
    { label: 'UTC+3 莫斯科 (Europe/Moscow)', value: 'Europe/Moscow' },
    // 欧洲
    { label: 'UTC+1 中欧时间 (Europe/Paris)', value: 'Europe/Paris' },
    { label: 'UTC+0 伦敦 (Europe/London)', value: 'Europe/London' },
    // 美洲
    { label: 'UTC-5 美国东部 (America/New_York)', value: 'America/New_York' },
    { label: 'UTC-6 美国中部 (America/Chicago)', value: 'America/Chicago' },
    { label: 'UTC-7 美国山地 (America/Denver)', value: 'America/Denver' },
    { label: 'UTC-8 美国西部 (America/Los_Angeles)', value: 'America/Los_Angeles' },
    // 其他
    { label: 'UTC+0 世界协调时 (UTC)', value: 'UTC' },
];
