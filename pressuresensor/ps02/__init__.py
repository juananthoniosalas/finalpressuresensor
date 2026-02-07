"""PS02 Sensor Python API (USB + BLE)

USB requires: pyserial
BLE requires: bleak (async)
"""

from .usb import PS02SensorUSB
from .decode import decode_54bytes_to_samples

# USB auto connect helpers
from .scan_usb import DEFAULT_VIDPID, find_ports_by_vidpid, select_port, auto_connect_usb

# BLE API
from .ble import PS02SensorBLE, BLE_DEFAULT_NAME_KEYWORD, BLE_UART_SERVICE_UUID, BLE_TX_WRITE_UUID, BLE_RX_NOTIFY_UUID
from .scan_ble import auto_connect_ble, find_ble_devices

__all__ = [
    "PS02SensorUSB",
    "decode_54bytes_to_samples",
    "DEFAULT_VIDPID",
    "find_ports_by_vidpid",
    "select_port",
    "auto_connect",
    "PS02SensorBLE",
    "BLE_DEFAULT_NAME_KEYWORD",
    "BLE_UART_SERVICE_UUID",
    "BLE_TX_WRITE_UUID",
    "BLE_RX_NOTIFY_UUID",
    "find_ble_devices",
    "auto_connect_ble",
]
