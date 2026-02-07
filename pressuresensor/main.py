import json
import asyncio
import threading
import queue
import time
import os 
import sys
import traceback
from enum import Enum
from dataclasses import dataclass
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi import Body
from fastapi import Response
from fastapi.middleware.cors import CORSMiddleware
from ps02 import auto_connect_usb, auto_connect_ble
from ps02.ble import BLE_UART_SERVICE_UUID
from datetime import datetime
from fastapi.responses import FileResponse


# Error handler untuk menangkap semua error
def handle_exception(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    
    error_msg = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
    print("\n" + "="*50)
    print("FATAL ERROR DETECTED:")
    print("="*50)
    print(error_msg)
    print("="*50)
    
    # Simpan ke file
    try:
        with open('error_log.txt', 'w', encoding='utf-8') as f:
            f.write(error_msg)
        print("\nError telah disimpan ke error_log.txt")
    except:
        pass
    
    input("\nTekan Enter untuk keluar...")

sys.excepthook = handle_exception

# Path fix untuk PyInstaller
if getattr(sys, 'frozen', False):
    application_path = sys._MEIPASS
    os.chdir(application_path)
else:
    application_path = os.path.dirname(os.path.abspath(__file__))

print(f"Application path: {application_path}")

# ======================================================
# FASTAPI APP
# ======================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======================================================
# COMMAND SYSTEM
# ======================================================

class CommandType(Enum):
    STOP = "stop"
    SET_GAIN = "set_gain"

@dataclass
class Command:
    type: CommandType
    value: any = None

# ======================================================
# GLOBAL STATE
# ======================================================

VIDPID = "1915:521A"
PREFER_SER = None
BLE_NAME_PREFIX = "PS02-LF"
BLE_PREFER_ADDRESS = None
BLE_SCAN_SECONDS = 10

# ======================================================
# CSV EXPORT STATE - OPTIMIZED
# ======================================================

csv_enabled = False
csv_dir: str | None = None
csv_buffer = []
csv_batch_size = 1000  # Batch writes to reduce lock contention
csv_lock = threading.Lock()

# Shared event to signal CSV flush needed
csv_flush_event = threading.Event()

running = False
gain = 15

frame_queue: queue.Queue = queue.Queue(maxsize=20)
command_queue: queue.Queue = queue.Queue(maxsize=10)

# NEW: Asyncio queues for BLE (much faster than thread queues)
ble_frame_queue: asyncio.Queue = None  # Created in async context
ble_command_queue: asyncio.Queue = None

usb_thread: threading.Thread | None = None
ble_thread: threading.Thread | None = None
reader_thread: threading.Thread | None = None

state_lock = threading.Lock()
dev_ref = {"device": None, "lock": threading.Lock()}

# ======================================================
# HELPERS
# ======================================================

def clear_queue(q: queue.Queue):
    try:
        while True:
            q.get_nowait()
    except queue.Empty:
        pass

async def clear_async_queue(q: asyncio.Queue):
    """Clear asyncio queue"""
    while not q.empty():
        try:
            q.get_nowait()
        except asyncio.QueueEmpty:
            break

def save_csv_if_enabled() -> str | None:
    if not csv_enabled or not csv_dir:
        print("💾 CSV export disabled, skipping save")
        return None

    with csv_lock:
        if not csv_buffer:
            print("⚠️ CSV buffer empty, nothing to save")
            return None
        data = list(csv_buffer)
        csv_buffer.clear()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"data_{ts}.csv"
    path = os.path.join(csv_dir, filename)

    os.makedirs(csv_dir, exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        f.write("index,raw\n")
        for i, v in enumerate(data):
            f.write(f"{i},{v}\n")

    print(f"✅ CSV saved: {path} ({len(data)} samples)")
    return path

# ======================================================
# 🔧 FIXED: Proper device cleanup helper
# ======================================================

def cleanup_usb_device(dev):
    """Properly cleanup USB device to allow reconnection"""
    if dev is None:
        return
    
    try:
        print("🧹 Stopping device...")
        dev.stop()
        time.sleep(0.3)  # Give device time to stop
        
        print("🧹 Closing device...")
        dev.close()
        time.sleep(0.3)  # Give OS time to release device
        
        print("✅ Device cleanup complete")
    except Exception as e:
        print(f"⚠️ Device cleanup error (non-fatal): {e}")
    finally:
        # Force Python to release the device reference
        import gc
        gc.collect()
        time.sleep(0.2)

async def cleanup_ble_device(dev):
    """Properly cleanup BLE device to allow reconnection"""
    if dev is None:
        return
    
    try:
        print("🧹 Stopping BLE device...")
        await dev.stop()
        await asyncio.sleep(0.3)
        
        print("🧹 Closing BLE device...")
        await dev.close()
        await asyncio.sleep(0.3)
        
        print("✅ BLE device cleanup complete")
    except Exception as e:
        print(f"⚠️ BLE cleanup error (non-fatal): {e}")
    finally:
        import gc
        gc.collect()
        await asyncio.sleep(0.2)

# ======================================================
# USB FRAME READER
# ======================================================

def frame_reader_loop(dev, stop_event):
    """Dedicated thread for blocking read_frames_USB()"""
    frame_count = 0
    try:
        print("📖 USB Frame reader started")
        for seq, samples in dev.read_frames_USB():
            frame_count += 1
            
            if frame_count % 100 == 0:
                print(f"📊 Read {frame_count} USB frames")
            
            if stop_event.is_set():
                print(f"📖 USB Frame reader stopping after {frame_count} frames")
                break
                
            payload = {
                "seq": seq,
                "samples": list(samples),
            }

            if csv_enabled:
                # Batch CSV writes to reduce lock contention
                if len(samples) > 0:
                    with csv_lock:
                        csv_buffer.extend(samples)

            if frame_queue.full():
                try:
                    frame_queue.get_nowait()
                except queue.Empty:
                    pass

            try:
                frame_queue.put(payload, timeout=0.01)
            except queue.Full:
                pass
                
    except Exception as e:
        print(f"❌ USB Frame reader error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print(f"📖 USB Frame reader finished (total: {frame_count})")

# ======================================================
# BLE FRAME READER
# ======================================================

async def ble_frame_reader_loop(dev, stop_event):
    """OPTIMIZED: Direct async iteration with minimal overhead + CSV flush fix"""
    frame_count = 0
    csv_temp_buffer = []  # Local buffer to reduce lock contention
    
    try:
        print("📖 BLE Frame reader started (optimized)")
        
        async for seq, samples in dev.read_frames_BLE():
            frame_count += 1
            
            if frame_count % 100 == 0:
                print(f"📊 Read {frame_count} BLE frames")
            
            # Check if stop requested - flush CSV before breaking
            if stop_event.is_set():
                print(f"📖 BLE Frame reader stopping after {frame_count} frames")
                break
                
            payload = {
                "seq": seq,
                "samples": list(samples),
            }

            # OPTIMIZED CSV: Batch to reduce lock acquisition
            if csv_enabled and len(samples) > 0:
                csv_temp_buffer.extend(samples)
                if len(csv_temp_buffer) >= csv_batch_size:
                    with csv_lock:
                        csv_buffer.extend(csv_temp_buffer)
                    csv_temp_buffer.clear()

            # OPTIMIZED: Use asyncio queue (no thread overhead)
            if ble_frame_queue.full():
                try:
                    ble_frame_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass

            try:
                # Non-blocking put
                ble_frame_queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass
                
    except Exception as e:
        print(f"❌ BLE Frame reader error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # CRITICAL FIX: Always flush remaining CSV data on exit
        if csv_enabled and csv_temp_buffer:
            print(f"💾 Flushing {len(csv_temp_buffer)} remaining BLE CSV samples")
            with csv_lock:
                csv_buffer.extend(csv_temp_buffer)
            csv_temp_buffer.clear()
        
        print(f"📖 BLE Frame reader finished (total: {frame_count})")
        # Signal that CSV is ready to save
        csv_flush_event.set()

# ======================================================
# CSV CONFIG
# ======================================================

@app.post("/csv/config")
def config_csv(payload: dict = Body(...)):
    global csv_enabled, csv_dir

    csv_enabled = bool(payload.get("enabled", False))
    csv_dir = payload.get("dir")

    print(f"💾 CSV config: enabled={csv_enabled}, dir={csv_dir}")

    return {
        "enabled": csv_enabled,
        "dir": csv_dir
    }

# ======================================================
# 🔧 FIXED: USB CONTROL with proper cleanup
# ======================================================

def usb_loop():
    global running, gain, reader_thread

    dev = None
    reader_stop_event = threading.Event()
    
    try:
        print("🔌 Connecting USB device...")
        dev = auto_connect_usb(vidpid=VIDPID, prefer_ser=PREFER_SER)
        
        with dev_ref["lock"]:
            dev_ref["device"] = dev

        print(f"🎚 Initial gain = {gain}")
        dev.set_gain(gain)
        
        print("📡 Starting USB stream...")
        dev.start()
        
        reader_stop_event.clear()
        reader_thread = threading.Thread(
            target=frame_reader_loop,
            args=(dev, reader_stop_event),
            daemon=True
        )
        reader_thread.start()
        print("✅ USB streaming active")

        while running:
            try:
                cmd = command_queue.get(timeout=0.1)
                
                if cmd.type == CommandType.STOP:
                    print("🛑 USB STOP")
                    break
                
                elif cmd.type == CommandType.SET_GAIN:
                    new_gain = cmd.value
                    print(f"🎚 USB gain: {gain} -> {new_gain}")
                    
                    reader_stop_event.set()
                    if reader_thread and reader_thread.is_alive():
                        reader_thread.join(timeout=2.0)
                    
                    dev.stop()
                    time.sleep(0.15)
                    
                    dev.set_gain(new_gain)
                    gain = new_gain
                    
                    dev.start()
                    time.sleep(0.15)
                    
                    reader_stop_event.clear()
                    reader_thread = threading.Thread(
                        target=frame_reader_loop,
                        args=(dev, reader_stop_event),
                        daemon=True
                    )
                    reader_thread.start()
                    print(f"✅ USB Gain applied: {gain}")
                    
            except queue.Empty:
                continue
            except Exception as e:
                print(f"❌ USB error: {e}")

    except Exception as e:
        print(f"🛑 USB control error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        print("🧹 USB Cleanup...")
        reader_stop_event.set()
        if reader_thread and reader_thread.is_alive():
            reader_thread.join(timeout=2.0)
        
        # 🔧 FIXED: Proper cleanup
        cleanup_usb_device(dev)
        
        with dev_ref["lock"]:
            dev_ref["device"] = None
        
        print("🧹 USB cleanup complete")

# ======================================================
# 🔧 FIXED: BLE CONTROL with proper cleanup
# ======================================================

def ble_loop():
    """Thread wrapper for BLE async loop"""
    asyncio.run(ble_async_loop())

async def ble_async_loop():
    global running, gain, ble_frame_queue, ble_command_queue

    # Create async queues in async context
    ble_frame_queue = asyncio.Queue(maxsize=100)  # Larger queue for BLE
    ble_command_queue = asyncio.Queue(maxsize=10)

    dev = None
    reader_task = None
    reader_stop_event = threading.Event()
    
    try:
        print("🔌 Connecting BLE device...")
        dev = await auto_connect_ble(
            name_prefix=BLE_NAME_PREFIX,
            prefer_address=BLE_PREFER_ADDRESS,
            scan_seconds=BLE_SCAN_SECONDS
        )
        
        client = dev._client
        if client.is_connected:
            svcs = client.services
            if svcs is None:
                await client.get_services()
                svcs = client.services
            print(f"✅ BLE Connected (address: {client.address})")
        else:
            print("❌ BLE Connection Failed")
            running = False
            return
        
        with dev_ref["lock"]:
            dev_ref["device"] = dev

        print(f"🎚 Initial gain = {gain}")
        await dev.set_gain(gain)
        
        print("📡 Starting BLE stream...")
        await dev.start()
        
        # Clear CSV flush event at start
        csv_flush_event.clear()
        
        reader_stop_event.clear()
        reader_task = asyncio.create_task(
            ble_frame_reader_loop(dev, reader_stop_event)
        )
        print("✅ BLE streaming active")

        while running:
            try:
                # Check threading command queue (from REST API)
                try:
                    cmd = command_queue.get_nowait()
                except queue.Empty:
                    await asyncio.sleep(0.01)
                    continue
                
                if cmd.type == CommandType.STOP:
                    print("🛑 BLE STOP")
                    break
                
                elif cmd.type == CommandType.SET_GAIN:
                    new_gain = cmd.value
                    print(f"🎚 BLE gain: {gain} -> {new_gain}")
                    
                    reader_stop_event.set()
                    if reader_task:
                        await asyncio.wait_for(reader_task, timeout=2.0)
                    
                    await dev.stop()
                    await asyncio.sleep(0.15)
                    
                    await dev.set_gain(new_gain)
                    gain = new_gain
                    
                    await dev.start()
                    await asyncio.sleep(0.15)
                    
                    # Clear and restart CSV flush event
                    csv_flush_event.clear()
                    
                    reader_stop_event.clear()
                    reader_task = asyncio.create_task(
                        ble_frame_reader_loop(dev, reader_stop_event)
                    )
                    print(f"✅ BLE Gain applied: {gain}")
                    
            except Exception as e:
                print(f"❌ BLE command error: {e}")

    except Exception as e:
        print(f"🛑 BLE control error: {e}")
        import traceback
        traceback.print_exc()
        running = False

    finally:
        print("🧹 BLE Cleanup...")
        if reader_task:
            reader_stop_event.set()
            reader_task.cancel()
            try:
                await reader_task
            except asyncio.CancelledError:
                pass
        
        # 🔧 FIXED: Proper cleanup
        await cleanup_ble_device(dev)
        
        with dev_ref["lock"]:
            dev_ref["device"] = None
        
        print("🧹 BLE cleanup complete")

# ======================================================
# REST API
# ======================================================

@app.options("/usb/gain")
def options_usb_gain():
    return Response(status_code=200)

@app.options("/usb/stop")
def options_usb_stop():
    return Response(status_code=200)

@app.options("/bluetooth/gain")
def options_bluetooth_gain():
    return Response(status_code=200)

@app.options("/bluetooth/stop")
def options_bluetooth_stop():
    return Response(status_code=200)

@app.post("/usb/start")
def start_usb():
    global running, usb_thread

    with state_lock:
        if running:
            return {"status": "already running", "gain": gain}

        print("🚀 USB START")
        running = True
        
        # Clear CSV buffer on new start
        with csv_lock:
            csv_buffer.clear()
        
        clear_queue(frame_queue)
        clear_queue(command_queue)

        usb_thread = threading.Thread(target=usb_loop, daemon=True)
        usb_thread.start()

    return {"status": "started", "gain": gain}

@app.post("/bluetooth/start")
def start_bluetooth():
    global running, ble_thread

    with state_lock:
        if running:
            return {"status": "already running", "gain": gain}

        print("🚀 BLE START")
        running = True
        
        # Clear CSV buffer on new start
        with csv_lock:
            csv_buffer.clear()
        
        clear_queue(command_queue)

        ble_thread = threading.Thread(target=ble_loop, daemon=True)
        ble_thread.start()

    return {"status": "started", "gain": gain}

@app.post("/usb/stop")
def stop_usb():
    global running, usb_thread

    print("🛑 USB STOP")
    
    with state_lock:
        if not running:
            return {"status": "already stopped"}
        
        running = False
        
        try:
            command_queue.put_nowait(Command(CommandType.STOP))
        except queue.Full:
            clear_queue(command_queue)
            command_queue.put_nowait(Command(CommandType.STOP))
        
        clear_queue(frame_queue)
    
    if usb_thread:
        usb_thread.join(timeout=5.0)
    
    csv_path = save_csv_if_enabled()

    if csv_path:
        return FileResponse(
            path=csv_path,
            media_type="text/csv",
            filename=os.path.basename(csv_path)
        )

    return {"status": "stopped"}

@app.post("/bluetooth/stop")
def stop_bluetooth():
    global running, ble_thread

    print("🛑 BLE STOP")
    
    with state_lock:
        if not running:
            return {"status": "already stopped"}
        
        running = False
        
        try:
            command_queue.put_nowait(Command(CommandType.STOP))
        except queue.Full:
            clear_queue(command_queue)
            command_queue.put_nowait(Command(CommandType.STOP))
    
    if ble_thread:
        ble_thread.join(timeout=5.0)
    
    # CRITICAL FIX: Wait for CSV flush event with timeout
    print("💾 Waiting for BLE CSV flush...")
    csv_flush_event.wait(timeout=1.0)  # Wait up to 1 second for flush
    
    csv_path = save_csv_if_enabled()

    if csv_path:
        return FileResponse(
            path=csv_path,
            media_type="text/csv",
            filename=os.path.basename(csv_path)
        )

    return {"status": "stopped"}

@app.post("/usb/gain")
def set_gain_usb(payload: dict = Body(...)):
    global gain
    new_gain = int(payload.get("gain", gain))

    if new_gain < 0 or new_gain > 15:
        return {"status": "error", "message": "gain must be 0–15"}

    with state_lock:
        if running:
            command_queue.put(Command(CommandType.SET_GAIN, new_gain))
            return {"status": "queued", "gain": new_gain}
        else:
            gain = new_gain
            return {"status": "ok", "gain": gain}

@app.post("/bluetooth/gain")
def set_gain_bluetooth(payload: dict = Body(...)):
    global gain
    new_gain = int(payload.get("gain", gain))

    if new_gain < 0 or new_gain > 15:
        return {"status": "error", "message": "gain must be 0–15"}

    with state_lock:
        if running:
            command_queue.put(Command(CommandType.SET_GAIN, new_gain))
            return {"status": "queued", "gain": new_gain}
        else:
            gain = new_gain
            return {"status": "ok", "gain": gain}

@app.get("/usb/status")
def usb_status():
    thread_alive = usb_thread.is_alive() if usb_thread else False
    return {
        "running": running,
        "gain": gain,
        "frame_queue": frame_queue.qsize(),
        "usb_thread_alive": thread_alive
    }

@app.get("/bluetooth/status")
def bluetooth_status():
    thread_alive = ble_thread.is_alive() if ble_thread else False
    queue_size = ble_frame_queue.qsize() if ble_frame_queue else 0
    return {
        "running": running,
        "gain": gain,
        "frame_queue": queue_size,
        "ble_thread_alive": thread_alive
    }

@app.get("/bluetooth/scan")
async def bluetooth_scan():
    try:
        from bleak import BleakScanner
        
        print("🔍 Scanning BLE...")
        devices = await BleakScanner.discover(timeout=BLE_SCAN_SECONDS)
        
        result = []
        for d in devices:
            result.append({
                "name": d.name or "Unknown",
                "address": d.address,
                "rssi": d.rssi,
                "matches_prefix": (d.name or "").startswith(BLE_NAME_PREFIX)
            })
        
        print(f"✅ Found {len(result)} devices")
        return {
            "status": "ok",
            "devices": result,
            "search_prefix": BLE_NAME_PREFIX
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/")
def root():
    return {
        "service": "USB & BLE Streaming API",
        "running": running,
        "gain": gain
    }

# ======================================================
# OPTIMIZED WEBSOCKET
# ======================================================

@app.websocket("/ws/usb")
async def ws_usb(ws: WebSocket):
    await ws.accept()
    print("🌐 USB WS connected")

    try:
        packet_count = 0
        while True:
            if not running:
                await asyncio.sleep(0.05)
                continue

            try:
                payload = await asyncio.to_thread(frame_queue.get, True, 1.0)
                await ws.send_text(json.dumps(payload))
                packet_count += 1

                if packet_count % 100 == 0:
                    print(f"📡 Sent {packet_count} USB packets")

            except queue.Empty:
                await asyncio.sleep(0.01)

    except WebSocketDisconnect:
        print(f"🔌 USB WS disconnected ({packet_count} packets)")

@app.websocket("/ws/bluetooth")
async def ws_bluetooth(ws: WebSocket):
    await ws.accept()
    print("🌐 BLE WS connected")

    try:
        packet_count = 0
        while True:
            if not running:
                await asyncio.sleep(0.05)
                continue

            # OPTIMIZED: Direct async queue access (no thread overhead)
            if ble_frame_queue is None:
                await asyncio.sleep(0.05)
                continue

            try:
                payload = await asyncio.wait_for(
                    ble_frame_queue.get(),
                    timeout=1.0
                )
                await ws.send_text(json.dumps(payload))
                packet_count += 1

                if packet_count % 100 == 0:
                    print(f"📡 Sent {packet_count} BLE packets")

            except asyncio.TimeoutError:
                await asyncio.sleep(0.01)

    except WebSocketDisconnect:
        print(f"🔌 BLE WS disconnected ({packet_count} packets)")


# ======================================================
# 🔧 FIXED: Run uvicorn on port 5000
# ======================================================

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting server on http://localhost:5000")
    uvicorn.run(app, host="0.0.0.0", port=5000)