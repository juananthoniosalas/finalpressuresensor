import asyncio
from typing import Optional, List, Tuple

from .exceptions import DeviceNotFoundError, ConnectionError
from .ble import PS02SensorBLE, BLE_UART_SERVICE_UUID
import asyncio
from bleak import BleakClient, BleakScanner




async def _fetch_services_compat(client):
    """
    兼容不同 bleak 版本的「取 services」方式：
    - 舊版：await client.get_services()
    - 新版：client.services 屬性（connect 後通常就會有）
    回傳 service collection（可迭代），或 None。
    """
    # 先用新版屬性（有些後端 connect 後就會填）
    svcs = getattr(client, "services", None)
    if svcs is not None:
        return svcs

    # 舊版 / 部分後端：需要呼叫 get_services() 觸發 discovery
    if hasattr(client, "get_services"):
        try:
            svcs = await client.get_services()
        except TypeError:
            svcs = None

    return getattr(client, "services", None) or svcs


async def _post_connect_validate_uart(ps: "PS02SensorBLE"):
    """
    連線後再用「服務表」驗證 UART service 是否真的存在。
    這段就是把你提供的邏輯套到專案的 PS02SensorBLE 連線流程上。
    """
    client = (
        getattr(ps, "client", None)
        or getattr(ps, "_client", None)
        or getattr(ps, "ble_client", None)
    )
    # 如果 PS02SensorBLE 沒把 BleakClient 暴露出來，就無法做這個驗證；直接略過
    if client is None:
        return

    svcs = await _fetch_services_compat(client)
    if svcs is None:
        return

    uart = BLE_UART_SERVICE_UUID.lower()
    has_uart = any(getattr(s, "uuid", "").lower() == uart for s in svcs)

    if not has_uart:
        try:
            await ps.disconnect()
        except Exception:
            pass
        raise ConnectionError("Connected, but UART service was not found after service discovery.")

def _adv_score(adv) -> int:
    """分數越高代表資訊越完整，優先保留。"""
    if adv is None:
        return 0
    score = 0
    uuids = getattr(adv, "service_uuids", None) or []
    if uuids:
        score += 100
    if getattr(adv, "local_name", None):
        score += 10
    if getattr(adv, "manufacturer_data", None):
        score += 5
    return score


async def _scan_with_callback(scan_seconds: float = 8.0):
    """
    使用 detection_callback 掃描（相容較舊 bleak）
    回傳 dict: address -> (device, adv)
    同一 address 可能出現多次：保留資訊較完整的那筆（優先有 service_uuids）
    """
    try:
        from bleak import BleakScanner, BleakClient
    except Exception as e:
        raise ConnectionError("bleak is required for BLE. Install with: pip install bleak") from e

    found = {}

    def cb(device, adv):
        addr = device.address.upper()
        if addr not in found:
            found[addr] = (device, adv)
            return

        old_dev, old_adv = found[addr]
        if _adv_score(adv) >= _adv_score(old_adv):
            found[addr] = (device, adv)

    scanner = BleakScanner(detection_callback=cb)
    await scanner.start()
    await asyncio.sleep(scan_seconds)
    await scanner.stop()
    return found


async def find_ble_devices(
    *,
    name_prefix: str = "PS02-LF",
    scan_seconds: float = 8.0,
) -> List[Tuple[object, object]]:
    """
    只回傳「確定有 UART service uuid」的 PS02-LF 裝置
    （避免同 address 有兩筆廣播，一筆沒有 service_uuids 的問題）
    """
    found = await _scan_with_callback(scan_seconds=scan_seconds)

    prefix = (name_prefix or "").strip().lower()
    uart = BLE_UART_SERVICE_UUID.lower()

    out: List[Tuple[object, object]] = []
    for _, (dev, adv) in found.items():
        local_name = (getattr(adv, "local_name", None) or getattr(dev, "name", None) or "")
        local_name_l = local_name.lower()

        uuids = getattr(adv, "service_uuids", None) or []
        uuids_l = [u.lower() for u in uuids]

        has_uart = uart in uuids_l
        is_name = (local_name_l.startswith(prefix)) if prefix else True

        if has_uart and is_name:
            out.append((dev, adv))

    return out


async def auto_connect_ble(
    *,
    name_prefix: str = "PS02-LF",
    prefer_address: Optional[str] = None,  # 例如 "DA:F8:B0:CB:68:1C"
    scan_seconds: float = 8.0,
    connect_timeout: float = 30.0,
) -> PS02SensorBLE:
    """
    自動連線 PS02-LF（相容舊 bleak）
    - 若 prefer_address 有給：優先選該 address（且必須有 UART service）
    - 否則：從候選中選 RSSI 最強的一個
    """
    candidates = await find_ble_devices(name_prefix=name_prefix, scan_seconds=scan_seconds)
    if not candidates:
        raise DeviceNotFoundError(
            f"No BLE PS02 devices found with UART service (prefix='{name_prefix}', scan_seconds={scan_seconds})."
        )

    pref = prefer_address.upper() if prefer_address else None

    if pref:
        for dev, adv in candidates:
            if dev.address.upper() == pref:
                ps = PS02SensorBLE(dev)
                await ps.connect(timeout=connect_timeout)
                await _post_connect_validate_uart(ps)
                return ps
        raise DeviceNotFoundError(
            f"Prefer address {prefer_address} not found among UART-capable PS02 candidates."
        )

    def rssi(item):
        _dev, adv = item
        return getattr(adv, "rssi", -999)

    candidates.sort(key=rssi, reverse=True)
    dev, _adv = candidates[0]

    ps = PS02SensorBLE(dev)
    await ps.connect(timeout=connect_timeout)
    await _post_connect_validate_uart(ps)
    return ps
