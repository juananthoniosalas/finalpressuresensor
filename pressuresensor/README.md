# ps02usb_api(TW) (USB only)

這是一個把廠商 C# USB 通訊流程整理成「Python API」的最小套件。

## 安裝

```bash
pip install pyserial
```

把 `ps02usb_api` 這個資料夾放到你的專案旁邊（或把 `ps02usb` 目錄複製到你的專案裡）。

## Quick start

```python
from ps02usb import auto_connect

# 你的感測器 VID/PID（你提供的是 1915:521A）
dev = auto_connect(vidpid="1915:521A")
dev.set_gain(10)  # 0..15

dev.start()
for seq, samples in dev.read_frames():
    print(seq, samples[:8])

dev.stop()
dev.close()
```

如果你同時插兩顆以上 Sensor，可指定序號：

```python
dev = auto_connect(vidpid="1915:521A", prefer_ser="DAF8B0CB681C")
```

## 檔案結構

- `ps02usb/__init__.py` : 對外 API 匯出
- `ps02usb/usb.py`      : USB 串口連線與指令、讀取 frame
- `ps02usb/decode.py`   : 54 bytes -> 36 samples 的解包
- `ps02usb/exceptions.py` : 例外
- `ps02usb/scan.py`     : 以 VID/PID (與 SER) 自動搜尋 COM port，提供 `auto_connect()`

## 協定摘要（來自廠商程式）

- 115200 baud, CRLF
- Start: `S0` / Stop: `B0` / Gain: `G{0..F}`
- 資料行格式：`<seq_hex>:<108 hex chars>\r\n`（108 hex chars = 54 bytes payload）
- 54 bytes payload 每 3 bytes -> 2 個 12-bit，最後各自 -2048


# ps02usb_api(EN) (USB only)

This is a minimal package that organizes the manufacturer's C# USB communication process into a "Python API".

## Installation

```bash
pip install pyserial

```
Place the `ps02usb_api` folder next to your project (or copy the `ps02usb` directory into your project).

## Quick start

```python
from ps02usb import auto_connect

# Your sensor VID/PID (you provided 1915:521A)

dev = auto_connect(vidpid="1915:521A")

dev.set_gain(10) # 0..15

dev.start()

for seq, samples in dev.read_frames():

print(seq, samples[:8])

dev.stop()

dev.close()

```

If you plug in more than two sensors at the same time, you can specify the serial number:

```python

dev = auto_connect(vidpid="1915:521A", prefer_ser="DAF8B0CB681C")

```

## File structure

- `ps02usb/__init__.py` : External API export

- `ps02usb/usb.py` : USB Serial port connection and commands, reading frames

- `ps02usb/decode.py`: Unpacking 54 bytes -> 36 samples

- `ps02usb/exceptions.py`: Exceptions

- `ps02usb/scan.py`: Automatically search for COM ports by VID/PID (and SER), providing `auto_connect()`

## Protocol Summary (from vendor program)

- 115200 baud, CRLF

- Start: `S0` / Stop: `B0` / Gain: `G{0..F}`

- Data line format: `<seq_hex>:<108 hex chars>\r\n` (108 hex chars = 54 bytes payload)

- 54 bytes payload, 3 bytes each -> 2 12-bit, ending with -2048 each