import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 获取浏览器当前时区，作为系统默认值 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export const useTimezoneStore = defineStore('timezone', () => {
  const stored = localStorage.getItem('app_timezone')
  const timezone = ref<string>(stored || getBrowserTimezone())

  function setTimezone(tz: string) {
    timezone.value = tz
    localStorage.setItem('app_timezone', tz)
  }

  function resetToBrowser() {
    const tz = getBrowserTimezone()
    setTimezone(tz)
    return tz
  }

  return { timezone, setTimezone, resetToBrowser }
})
