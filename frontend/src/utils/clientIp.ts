/**
 * Utility to detect and cache client local LAN IP address using WebRTC.
 * Allows accurate IP tracking even when behind Docker bridge or proxy NAT.
 */
let cachedClientIp = ''
let detectionPromise: Promise<string> | null = null

function scoreIp(ip: string): number {
  if (!ip) return -1
  // Filter out loopback, Docker bridge, WSL NAT, and singbox_tun
  if (
    ip.startsWith('127.') ||
    ip.startsWith('0.0.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.26.128.')
  ) {
    return -1
  }
  // Physical LAN priority
  if (ip.startsWith('192.168.')) return 100
  if (ip.startsWith('10.')) return 80
  if (ip.startsWith('172.')) return 50
  return 10
}

export function detectClientIp(): Promise<string> {
  if (cachedClientIp) return Promise.resolve(cachedClientIp)
  if (detectionPromise) return detectionPromise

  // Check window.location.hostname if accessing via physical LAN IP
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host) && scoreIp(host) > 0) {
      cachedClientIp = host
    }
  }

  detectionPromise = new Promise<string>((resolve) => {
    try {
      const RTCPC = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection || (window as any).mozRTCPeerConnection
      if (!RTCPC) {
        resolve(cachedClientIp || '')
        return
      }

      const pc = new RTCPC({
        iceServers: [
          { urls: 'stun:stun.qq.com:3478' },
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      })

      pc.createDataChannel('ip-probe')
      pc.createOffer()
        .then((offer: any) => {
          pc.setLocalDescription(offer)
          // Also inspect SDP
          if (offer && offer.sdp) {
            const lines = offer.sdp.split('\n')
            for (const line of lines) {
              const m = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(line)
              if (m && m[1] && scoreIp(m[1]) > scoreIp(cachedClientIp)) {
                cachedClientIp = m[1]
              }
            }
          }
        })
        .catch(() => {})

      let resolved = false
      const finish = () => {
        if (!resolved) {
          resolved = true
          try { pc.close() } catch {}
          resolve(cachedClientIp || '')
        }
      }

      const timeout = setTimeout(finish, 1500)

      pc.onicecandidate = (event: any) => {
        if (!event || !event.candidate || !event.candidate.candidate) {
          finish()
          return
        }
        const candidateLine = event.candidate.candidate
        // Extract IPv4 addresses
        const match = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(candidateLine)
        if (match && match[1]) {
          const ip = match[1]
          if (scoreIp(ip) > scoreIp(cachedClientIp)) {
            cachedClientIp = ip
            if (scoreIp(ip) >= 100) {
              clearTimeout(timeout)
              finish()
            }
          }
        }
      }
    } catch {
      resolve(cachedClientIp || '')
    }
  })

  return detectionPromise
}

export function getCachedClientIp(): string {
  // If not yet cached, fallback to window.location.hostname if LAN IP
  if (!cachedClientIp && typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host) && scoreIp(host) > 0) {
      cachedClientIp = host
    }
  }
  return cachedClientIp
}

// Auto-trigger background detection upon module import
try {
  detectClientIp()
} catch {}

