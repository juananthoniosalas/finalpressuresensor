import asyncio
from typing import AsyncIterator, List, Tuple

from .decode import decode_54bytes_to_samples
from .exceptions import ConnectionError

BLE_UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
BLE_RX_NOTIFY_UUID    = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  # device -> PC
BLE_TX_WRITE_UUID     = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  # PC -> device
BLE_DEFAULT_NAME_KEYWORD = "PS02"


class PS02SensorBLE:
    """
    Incoming notify packets (typical):
      - 56 bytes
      - byte0 == 0x00
      - byte1 == seq (0..255)
      - byte2..55 == 54 bytes payload
    Commands (5 bytes):
      - Start: FE 00 'S' 00 00
      - Stop : FE 00 'B' 00 00
      - Gain : FE 00 'G' <gain 0..15> 00
    """

    def __init__(self, device_or_address):
        self._target = device_or_address
        self.address = getattr(device_or_address, "address", device_or_address)
        self._client = None
        self._raw_q: asyncio.Queue[bytes] = asyncio.Queue(maxsize=300)

    async def connect(self, timeout: float = 30.0) -> None:
        try:
            from bleak import BleakClient
        except Exception as e:
            raise ConnectionError("bleak is required for BLE. Install with: pip install bleak") from e

        # Windows: avoid cached services issues (if supported)
        try:
            self._client = BleakClient(self._target, winrt={"use_cached_services": False})
        except TypeError:
            self._client = BleakClient(self._target)

        ret = await self._client.connect(timeout=timeout)

        if not getattr(self._client, "is_connected", False):
            raise ConnectionError(
                f"BLE connect did not establish a connection: address={self.address}, connect() returned={ret}"
            )

        def _on_notify(_: int, data: bytearray):
            if not data:
                return
            b = bytes(data)
            try:
                self._raw_q.put_nowait(b)
            except asyncio.QueueFull:
                # 丟掉最舊的一筆再放新的（避免卡住 notify thread）
                try:
                    _ = self._raw_q.get_nowait()
                except Exception:
                    pass
                try:
                    self._raw_q.put_nowait(b)
                except Exception:
                    pass

        try:
            await self._client.start_notify(BLE_RX_NOTIFY_UUID, _on_notify)
            # WinRT 下 CCCD 訂閱需要一點時間落地
            await asyncio.sleep(0.2)
        except Exception as e:
            raise ConnectionError(f"Connected but start_notify failed: {e}") from e

    async def close(self) -> None:
        if self._client is not None:
            try:
                try:
                    await self._client.stop_notify(BLE_RX_NOTIFY_UUID)
                except Exception:
                    pass
                await self._client.disconnect()
            finally:
                self._client = None

    async def _write_cmd(self, cmd: bytes, *, response: bool = True) -> None:
        if self._client is None:
            raise ConnectionError("Not connected")
        # WinRT 下 write-with-response 穩很多（尤其剛連線後第一筆命令）
        await self._client.write_gatt_char(BLE_TX_WRITE_UUID, cmd, response=response)

    async def start(self, *, retries: int = 3, first_packet_timeout: float = 2.0) -> None:
        """
        送 start 後等待第一包 notify，若沒有資料就重送。
        """
        last_err = None
        for _ in range(retries):
            try:
                await self._write_cmd(bytes([0xFE, 0x00, 0x53, 0x00, 0x00]), response=True)

                # 等第一包 raw notify 進來（只要有任何 notify 就算啟動成功）
                raw = await asyncio.wait_for(self._raw_q.get(), timeout=first_packet_timeout)

                # 放回去，讓 frames_timeout() 仍能看到這包
                self._raw_q.put_nowait(raw)
                return

            except Exception as e:
                last_err = e
                await asyncio.sleep(0.3)

        raise ConnectionError(
            f"Start streaming failed: no data after {retries} tries (last_err={last_err!r})"
        )

    async def stop(self) -> None:
        await self._write_cmd(bytes([0xFE, 0x00, 0x42, 0x00, 0x00]), response=True)

    async def set_gain(self, gain: int) -> None:
        if not (0 <= gain <= 15):
            raise ValueError("gain must be 0..15")
        await self._write_cmd(bytes([0xFE, 0x00, 0x47, gain & 0xFF, 0x00]), response=True)

    # USB-style：在 frames_timeout 解析/過濾，不符合就 continue
    async def read_frames_BLE(self, timeout_s: float = 1.0) -> AsyncIterator[Tuple[int, List[int]]]:
        while True:
            raw = await asyncio.wait_for(self._raw_q.get(), timeout=timeout_s)
            if not raw:
                continue

            if len(raw) < 56:
                continue

            pkt = raw[:56]

            # 類似 USB regex match fail -> continue
            if pkt[0] != 0x00:
                continue

            #seq = pkt[1]  # 0..255
            seq = pkt[1] & 0x0F
            payload54 = pkt[2:56]

            try:
                samples = decode_54bytes_to_samples(payload54)
            except Exception:
                continue

            yield seq, samples

    async def frames(self) -> AsyncIterator[Tuple[int, List[int]]]:
        # 無限等待版本（跟 USB readline 類似）
        async for item in self.frames_timeout(timeout_s=3600 * 24 * 365):
            yield item
