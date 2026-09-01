import os
import ipaddress
from typing import Optional
from fastapi import Request


INTERNAL_BRIDGE_PREFIXES = ("172.17.", "172.18.", "172.26.128.", "127.", "0.0.0.0", "::1", "localhost")
DEFAULT_HOST_LAN_IP = os.getenv("HOST_LAN_IP", "192.168.21.27")


def is_valid_ip(ip_str: Optional[str]) -> bool:
    """Validate if the given string is a valid IPv4 or IPv6 address."""
    if not ip_str or not isinstance(ip_str, str):
        return False
    clean_ip = ip_str.strip()
    try:
        ipaddress.ip_address(clean_ip)
        return True
    except ValueError:
        return False


def is_internal_or_bridge(ip_str: str) -> bool:
    """Check if the given IP address belongs to internal Docker bridge, WSL NAT, or singbox_tun."""
    clean_ip = ip_str.strip()
    if clean_ip.startswith(INTERNAL_BRIDGE_PREFIXES):
        return True
    try:
        ip_obj = ipaddress.ip_address(clean_ip)
        return ip_obj.is_loopback or ip_obj.is_unspecified
    except ValueError:
        return False


def extract_client_ip(request: Request) -> Optional[str]:
    """
    Extract the real client IP address with multi-layer detection:
    1. X-Client-Local-IP / X-Client-Real-IP (detected by frontend WebRTC)
    2. X-Forwarded-For chain (skipping container bridge IPs)
    3. Standard reverse proxy headers (X-Real-IP, CF-Connecting-IP, etc.)
    4. Mapping internal bridge / TUN proxy traffic to the host physical LAN IP
    """
    # 1. Custom client IP reported by frontend WebRTC
    local_headers = ["X-Client-Local-IP", "X-Client-Real-IP"]
    for h in local_headers:
        val = request.headers.get(h)
        if val and is_valid_ip(val) and not is_internal_or_bridge(val):
            return val.strip()

    # 2. X-Forwarded-For header chain
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        candidates = [c.strip() for c in xff.split(",") if c.strip()]
        # First check for valid non-internal IP from left to right (e.g. other LAN machines or external clients)
        for cand in candidates:
            if is_valid_ip(cand) and not is_internal_or_bridge(cand):
                return cand

    # 3. Standard proxy headers
    for h in ["X-Real-IP", "CF-Connecting-IP", "True-Client-IP", "X-Client-IP"]:
        val = request.headers.get(h)
        if val and is_valid_ip(val):
            cleaned = val.strip()
            if not is_internal_or_bridge(cleaned):
                return cleaned

    # 4. Direct socket connection if it is a genuine external/LAN IP
    if request.client and request.client.host and is_valid_ip(request.client.host):
        host_ip = request.client.host.strip()
        if not is_internal_or_bridge(host_ip):
            return host_ip

    # 5. When traffic originates locally via Docker bridge / singbox_tun gateway, map to host physical LAN IP
    return DEFAULT_HOST_LAN_IP

