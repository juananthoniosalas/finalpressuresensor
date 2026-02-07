from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Iterator, List, Optional, Tuple

import serial

from .decode import decode_54bytes_to_samples
from .exceptions import DeviceNotFoundError, ConnectionError, ProtocolError


@dataclass(frozen=True)
class PS02Frame:
    """One decoded frame."""

    seq: int
    samples: List[int]
    raw54: bytes


class PS02SensorUSB:
    """Vendor PS02 sensor USB API (pyserial).

    Protocol (from vendor C#):
        - 115200 baud
        - commands use CRLF line endings:
            start: "S0\r\n"
            stop : "B0\r\n"
            gain : "G" + hex-nibble (0..F) + "\r\n"
        - streaming lines look like:
            <seq_hex>:<108 hex chars>\r\n
          where 108 hex chars == 54 bytes payload.

    Notes:
        - Some devices require DTR/RTS asserted.
        - Incoming stream may include non-data lines; they are ignored.
    """

    def __init__(
        self,
        port: str,
        baudrate: int = 115200,
        timeout: float = 1.0,
        write_timeout: float = 1.0,
        assert_dtr_rts: bool = True,
    ):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.write_timeout = write_timeout
        self.assert_dtr_rts = assert_dtr_rts
        self._ser: Optional[serial.Serial] = None

        # <seq_hex>:<108 hex chars>
        self._hexline_re = re.compile(r"^\s*([0-9A-Fa-f]+)\s*:\s*([0-9A-Fa-f]{108})\s*$")

    # ---- lifecycle ----
    def connect(self) -> None:
        """Open serial port."""
        self._ser = serial.Serial(
            self.port,
            self.baudrate,
            timeout=self.timeout,
            write_timeout=self.write_timeout,
        )

        if self.assert_dtr_rts:
            # Mirror vendor app behavior (often helps with USB-UART adapters)
            self._ser.dtr = True
            self._ser.rts = True

        self._ser.reset_input_buffer()
        self._ser.reset_output_buffer()

    def close(self) -> None:
        """Close serial port."""
        if self._ser is None:
            return

        try:
            if self.assert_dtr_rts:
                try:
                    self._ser.dtr = False
                    self._ser.rts = False
                except Exception:
                    pass
        finally:
            try:
                self._ser.close()
            finally:
                self._ser = None

    def __enter__(self) -> "PS02SensorUSB":
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @property
    def is_connected(self) -> bool:
        return self._ser is not None and self._ser.is_open

    # ---- commands ----
    def _write_line(self, s: str) -> None:
        if self._ser is None:
            raise ConnectionError("Call connect() first")
        self._ser.write((s + "\r\n").encode("ascii"))

    def start(self) -> None:
        self._write_line("S0")

    def stop(self) -> None:
        self._write_line("B0")

    def set_gain(self, gain: int) -> None:
        if not (0 <= gain <= 15):
            raise ValueError("gain must be 0..15")
        self._write_line("G" + format(gain, "X"))

    # ---- reading ----
    def read_frames_USB(self, *, yield_raw: bool = False) -> Iterator[Tuple[int, List[int]] | PS02Frame]:
        """Iterate over decoded frames.

        Args:
            yield_raw: If True, yield PS02Frame(seq, samples, raw54) instead of (seq, samples).

        Yields:
            (seq, samples) tuples or PS02Frame objects.
        """
        if self._ser is None:
            raise ConnectionError("Call connect() first")

        while True:
            line = self._ser.readline()
            if not line:
                continue

            s = line.decode("ascii", errors="ignore").strip()
            m = self._hexline_re.match(s)
            if not m:
                # Ignore non-data lines
                continue

            seq = int(m.group(1), 16) & 0xFF
            #seq = int(m.group(1), 16)
            data_hex = m.group(2)

            try:
                raw54 = bytes.fromhex(data_hex)
            except ValueError as e:
                raise ProtocolError(f"Bad hex payload: {e}") from e

            if len(raw54) != 54:
                raise ProtocolError(f"Expected 54 bytes payload, got {len(raw54)}")

            samples = decode_54bytes_to_samples(raw54)

            if yield_raw:
                yield PS02Frame(seq=seq, samples=samples, raw54=raw54)
            else:
                yield seq, samples

    def read_n_frames(self, n: int, *, seconds_timeout: Optional[float] = None) -> List[Tuple[int, List[int]]]:
        """Convenience helper to read N frames.

        Args:
            n: number of frames.
            seconds_timeout: overall timeout. If exceeded, raises TimeoutError.
        """
        if n <= 0:
            return []

        t0 = time.time()
        out: List[Tuple[int, List[int]]] = []
        for seq, samples in self.read_frames():
            out.append((seq, samples))
            if len(out) >= n:
                return out
            if seconds_timeout is not None and (time.time() - t0) > seconds_timeout:
                raise TimeoutError(f"Timed out waiting for {n} frames")

        return out
