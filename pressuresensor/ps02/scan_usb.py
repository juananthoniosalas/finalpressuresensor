from typing import Optional, Tuple, List

from serial.tools import list_ports

from .exceptions import DeviceNotFoundError, ConnectionError

from .usb import PS02SensorUSB

DEFAULT_VIDPID = "1915:521A"  # from your device info


def find_ports_by_vidpid(vidpid: str = DEFAULT_VIDPID):
    """Return ports whose hwid contains the given VID:PID string (case-insensitive)."""
    needle = f"VID:PID={vidpid}".upper() if "VID:PID=" not in vidpid.upper() else vidpid.upper()
    ports = list(list_ports.comports())
    return [p for p in ports if needle in (p.hwid or "").upper()]


def select_port(ports, prefer_ser: Optional[str] = None) -> str:
    """Choose a port from candidates. If prefer_ser is set, match SER=<prefer_ser>."""
    if not ports:
        raise DeviceNotFoundError("No matching USB ports found.")

    if prefer_ser:
        ps = prefer_ser.upper()
        for p in ports:
            if f"SER={ps}" in (p.hwid or "").upper():
                return p.device

    return ports[0].device


def auto_connect_usb(vidpid: str = DEFAULT_VIDPID, prefer_ser: Optional[str] = None, *, baudrate: int = 115200, timeout: float = 1.0) -> PS02SensorUSB:
    """Find and connect to a USB PS02 sensor by VID/PID (and optionally SER)."""
    ports = find_ports_by_vidpid(vidpid)
    port = select_port(ports, prefer_ser=prefer_ser)
    dev = PS02SensorUSB(port, baudrate=baudrate, timeout=timeout)
    dev.connect()
    return dev
