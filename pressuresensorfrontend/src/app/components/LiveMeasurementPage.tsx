import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Play,
  Square,
  Send,
  Usb,
  Bluetooth,
  Wifi,
  WifiOff,
  FolderOpen,
  Video,
} from 'lucide-react'

/* =========================
   Types
========================= */

type ConnectionMode = 'usb' | 'bluetooth'
type DisplayMode = 'raw' | 'filtered'
type ConnStatus = 'disconnected' | 'connected' | 'error'

interface LivePoint {
  x: number
  raw: number
  filtered: number
  seq?: number
}

interface LogEntry {
  timestamp: string
  type: 'info' | 'command' | 'response' | 'error'
  message: string
}

/* =========================
   ADC & GRAPH CONSTANTS
========================= */

const MAX_PLOT = 2000
const DEFAULT_Y_MIN = -2100
const DEFAULT_Y_MAX = 2100
const DRAG_X_STEP = 100
const DRAG_Y_STEP = 1000
const DRAG_THRESHOLD_PX = 8

/* =========================
   Helpers
========================= */

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function makeTicks(start: number, end: number, step: number) {
  const ticks: number[] = []
  if (step <= 0) return ticks
  const s = Math.ceil(start / step) * step
  for (let v = s; v <= end; v += step) ticks.push(v)
  if (ticks.length === 0) {
    ticks.push(start, end)
  }
  return ticks
}

/* =========================
   Component
========================= */

export default function LiveMeasurementPage() {
  const [mode, setMode] = useState<ConnectionMode>('usb')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('raw')
  const [gainValue, setGainValue] = useState<string>('15')

  const [isRunning, setIsRunning] = useState(false)
  const [shouldConnect, setShouldConnect] = useState(false)

  const [liveData, setLiveData] = useState<LivePoint[]>([])
  const [connStatus, setConnStatus] = useState<ConnStatus>('disconnected')

  const [logs, setLogs] = useState<LogEntry[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  const [zoomRange, setZoomRange] = useState(2000)
  const [xStart, setXStart] = useState(0)
  const [yShift, setYShift] = useState(0)
  const [yZoom, setYZoom] = useState(4200)

  const wsRef = useRef<WebSocket | null>(null)

  // CSV with folder handle
  const [csvEnabled, setCsvEnabled] = useState(false)
  const [csvDir, setCsvDir] = useState<string>('')
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)

  const yMin = DEFAULT_Y_MIN + yShift
  const yMax = DEFAULT_Y_MAX + yShift

  const draggingRef = useRef<null | 'x' | 'y'>(null)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)

  const API_BASE = 'http://localhost:5000'

  const startUrl = useMemo(() => {
    return mode === 'usb'
      ? `${API_BASE}/usb/start`
      : `${API_BASE}/bluetooth/start`
  }, [mode])

  const stopUrl = useMemo(() => {
    return mode === 'usb'
      ? `${API_BASE}/usb/stop`
      : `${API_BASE}/bluetooth/stop`
  }, [mode])

  const gainUrl = useMemo(() => {
    return mode === 'usb'
      ? `${API_BASE}/usb/gain`
      : `${API_BASE}/bluetooth/gain`
  }, [mode])

  /* =========================
     Helper functions
  ========================= */

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
      },
    ])
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const closeWS = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {
        // ignore
      }
      wsRef.current = null
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    // Prevent page scroll
    e.preventDefault();
    e.stopPropagation();

    const zoomFactor = 0.08;
    const delta = e.deltaY > 0 ? 1 : -1;

    setZoomRange(prev => {
      const next = prev + (prev * zoomFactor * delta);
      return Math.round(Math.max(10, next));
    });

    setYZoom(prev => {
      const next = prev + (prev * zoomFactor * delta);
      return Math.round(Math.max(50, next));
    });
  };

  /* =========================
     Drag handlers
  ========================= */

  const handleChartMouseDownCapture = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    
    draggingRef.current = 'x';
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleChartMouseMoveCapture = (e: React.MouseEvent) => {
    if (!lastMouseRef.current) return;

    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;

    const scaleX = zoomRange / 1200; 
    const scaleY = yZoom / 600;

    setXStart(prev => Math.round(prev - (dx * scaleX)));
    setYShift(prev => Math.round(prev + (dy * scaleY)));

    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleChartMouseUpCapture = () => {
    lastMouseRef.current = null;
  };

  // Freeze page scroll when mouse over chart
  const handleChartMouseEnter = () => {
    document.body.style.overflow = 'hidden';
  };

  const handleChartMouseLeave = () => {
    document.body.style.overflow = 'auto';
  };

  // Cleanup: restore scroll on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Prevent auto-scroll to bottom on page load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Modern Folder Picker with File System Access API
  const handleSelectFolder = async () => {
    try {
      // Check if browser supports File System Access API
      if (!('showDirectoryPicker' in window)) {
        addLog('error', 'Your browser does not support folder selection. Please use Chrome, Edge, or Opera.')
        return
      }

      // @ts-ignore - showDirectoryPicker is not in TS types yet
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      })

      setFolderHandle(dirHandle)
      setCsvDir(dirHandle.name)
      
      // Send folder name to backend
      await updateCsvConfig(csvEnabled, dirHandle.name)
      
      addLog('info', `Folder selected: ${dirHandle.name}`)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addLog('info', 'Folder selection cancelled')
      } else {
        addLog('error', `Folder selection failed: ${err.message}`)
      }
    }
  }

  // Update CSV config
  const updateCsvConfig = async (enabled: boolean, dir: string) => {
    try {
      await post(`${API_BASE}/csv/config`, {
        enabled,
        dir: dir || null,
      })
      addLog('info', `CSV ${enabled ? 'enabled' : 'disabled'}${dir ? ` → ${dir}` : ''}`)
    } catch (e: any) {
      addLog('error', `CSV config failed: ${e?.message ?? 'unknown error'}`)
    }
  }

  /* =========================
     WebSocket lifecycle
  ========================= */

  useEffect(() => {
    if (!shouldConnect) {
      closeWS()
      setConnStatus('disconnected')
      return
    }

    addLog('info', `Opening ${mode.toUpperCase()} stream...`)
    setConnStatus('disconnected')

    const url =
      mode === 'usb'
        ? 'ws://localhost:5000/ws/usb'
        : 'ws://localhost:5000/ws/bluetooth'

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnStatus('connected')
      addLog('info', `${mode.toUpperCase()} WebSocket connected`)
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (!Array.isArray(data.samples)) return

      setLiveData(prev => {
        let next = [...prev]

        for (const s of data.samples) {
          next.push({
            x: 0,
            raw: s,
            filtered: s,
            seq: data.seq,
          })
        }

        if (next.length > MAX_PLOT) {
          next = next.slice(next.length - MAX_PLOT)
        }

        return next.map((p, i) => ({ ...p, x: i }))
      })
    }

    ws.onerror = () => {
      setConnStatus('error')
      addLog('error', `${mode.toUpperCase()} WebSocket error`)
    }

    ws.onclose = () => {
      setConnStatus('disconnected')
      addLog('info', `${mode.toUpperCase()} WebSocket closed`)
    }

    return () => closeWS()
  }, [shouldConnect, mode])

  /* =========================
     Backend Controls
  ========================= */

  const post = async (url: string, body?: any) => {
    const res = await fetch(url, {
      method: 'POST',
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return await res.json()
  }

  const handleStart = async () => {
    addLog('command', `${mode.toUpperCase()} START`);
    closeWS();
    setLiveData([]);
    
    setXStart(0);
    setZoomRange(2000);
    setYShift(0);
    setYZoom(4200);

    const result = await post(startUrl);
    setIsRunning(true);
    setShouldConnect(true);

    if (result.gain !== undefined) {
      setGainValue(String(result.gain))
    }

    addLog('response', 'OK: Measurement started')
  }

  // Enhanced handleStop with local file saving
  const handleStop = async () => {
    addLog('command', `${mode.toUpperCase()} STOP`)

    try {
      const res = await fetch(stopUrl, { method: 'POST' })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const contentType = res.headers.get('content-type')

      if (contentType && contentType.includes('text/csv')) {
        const blob = await res.blob()
        
        // If folder handle exists, save directly to selected folder
        if (folderHandle && csvEnabled) {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
            const filename = `data_${timestamp}.csv`
            
            // Create file in selected folder
            const fileHandle = await folderHandle.getFileHandle(filename, { create: true })
            const writable = await fileHandle.createWritable()
            await writable.write(blob)
            await writable.close()
            
            addLog('response', `✅ CSV saved to ${csvDir}/${filename}`)
          } catch (err: any) {
            addLog('error', `Failed to save to folder: ${err.message}. Downloading instead...`)
            // Fallback to download
            downloadBlob(blob, `data_${Date.now()}.csv`)
          }
        } else {
          // Normal download if no folder selected
          downloadBlob(blob, `data_${Date.now()}.csv`)
          addLog('response', 'CSV downloaded')
        }
      } else {
        addLog('response', 'Measurement stopped (no CSV)')
      }

      closeWS()
      setShouldConnect(false)
      setIsRunning(false)

    } catch (e: any) {
      addLog('error', `STOP failed: ${e?.message ?? 'unknown error'}`)
    }
  }

  // Helper to download blob
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleSendGain = async () => {
    const gain = Number(gainValue)

    if (
      gainValue.trim() === '' ||
      Number.isNaN(gain) ||
      !Number.isInteger(gain) ||
      gain < 0 ||
      gain > 15
    ) {
      addLog('error', 'Gain must be an integer between 0 and 15')
      return
    }

    try {
      addLog('command', `${mode.toUpperCase()} SET_GAIN ${gain}`)

      const result = await post(gainUrl, { gain })

      if (result.status === 'queued') {
        addLog('response', `Applying gain ${gain}...`)
        await new Promise(r => setTimeout(r, 300))
        addLog('info', 'Gain applied, streaming resumed')
      } 
      else if (result.status === 'ok') {
        addLog('response', `OK: Gain set to ${gain}`)
      } 
      else {
        addLog('error', result.message || 'Unknown response from backend')
      }
    } catch (e: any) {
      addLog('error', `SET_GAIN failed: ${e?.message ?? 'unknown error'}`)
    }
  }

  const handleSwitchMode = async (next: ConnectionMode) => {
    if (next === mode) return

    if (isRunning) {
      try {
        addLog('command', `${mode.toUpperCase()} STOP (switch mode)`)
        setShouldConnect(false)
        await new Promise(r => setTimeout(r, 150))
        await post(stopUrl)
        setIsRunning(false)
        addLog('response', 'OK: Stopped for mode switch')
      } catch (e: any) {
        addLog('error', `Mode switch failed: ${e?.message ?? 'unknown error'}`)
        setIsRunning(false)
        setShouldConnect(false)
      }
    }

    setLiveData([])
    setXStart(0)
    setYShift(0)
    setMode(next)
    addLog('info', `Mode switched to ${next.toUpperCase()}`)
  }

  /* =========================
     UI helpers
  ========================= */

  const statusLabel =
    connStatus === 'connected'
      ? 'Streaming'
      : connStatus === 'error'
        ? 'Error'
        : 'Idle'

  const statusIcon =
    connStatus === 'connected' ? (
      <Wifi className="w-4 h-4 text-green-600" />
    ) : (
      <WifiOff className="w-4 h-4 text-gray-400" />
    )

  const dynamicYMin = yShift - (yZoom / 2);
  const dynamicYMax = yShift + (yZoom / 2);
  
  const generateTicks = (min: number, max: number, count: number) => {
    const ticks = [];
    const step = (max - min) / (count - 1);
    for (let i = 0; i < count; i++) {
      ticks.push(Math.round(min + step * i));
    }
    return ticks;
  };

  const xTicks = useMemo(() => generateTicks(xStart, xStart + zoomRange, 11), [xStart, zoomRange]);
  const yTicks = useMemo(() => generateTicks(dynamicYMin, dynamicYMax, 5), [dynamicYMin, dynamicYMax]);

  const visibleData = useMemo(() => {
    return liveData.slice(xStart, xStart + MAX_PLOT)
  }, [liveData, xStart])

  /* =========================
     Render
  ========================= */

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="p-6 bg-white border rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            {mode === 'usb' ? (
              <Usb className="w-5 h-5 text-blue-600" />
            ) : (
              <Bluetooth className="w-5 h-5 text-blue-600" />
            )}
            Device Status
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-gray-600">Mode</span>
              <span className="text-sm font-medium">{mode.toUpperCase()}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-gray-600">Status</span>
              <span
                className={
                  connStatus === 'connected'
                    ? 'text-sm font-medium text-green-600'
                    : connStatus === 'error'
                      ? 'text-sm font-medium text-red-600'
                      : 'text-sm font-medium text-gray-600'
                }
              >
                {isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Signal</span>
              <div className="flex items-center gap-1">
                {statusIcon}
                <span className="text-sm">{statusLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white border rounded-lg shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Control Panel</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Connection Mode
              </label>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="connMode"
                    checked={mode === 'usb'}
                    onChange={() => handleSwitchMode('usb')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">USB</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="connMode"
                    checked={mode === 'bluetooth'}
                    onChange={() => handleSwitchMode('bluetooth')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Bluetooth</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Gain (0–15)
              </label>

              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={gainValue}
                  onChange={e => setGainValue(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md"
                />

                <button
                  onClick={handleSendGain}
                  className="px-4 py-2 text-white rounded-md flex items-center gap-2 transition-colors"
                  style={{ backgroundColor: '#912335' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7a1e2d'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#912335'}
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Measurement Control
              </label>

              <div className="flex gap-2">
                <button
                  onClick={handleStart}
                  disabled={isRunning}
                  className="px-4 py-2 text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  style={{ backgroundColor: isRunning ? '#d1d5db' : '#912335' }}
                  onMouseEnter={(e) => !isRunning && (e.currentTarget.style.backgroundColor = '#7a1e2d')}
                  onMouseLeave={(e) => !isRunning && (e.currentTarget.style.backgroundColor = '#912335')}
                >
                  <Play className="w-4 h-4" />
                  Start
                </button>

                <button
                  onClick={handleStop}
                  disabled={!isRunning}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Backend handles gain changes automatically
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Display Mode
              </label>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    checked={displayMode === 'raw'}
                    onChange={() => setDisplayMode('raw')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Raw</span>
                </label>
              </div>
            </div>

            {/* CSV Section with Modern Folder Picker */}
            <div className="md:col-span-2 border-t pt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                📁 CSV Export Settings
              </label>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="csv-enable"
                    checked={csvEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked
                      setCsvEnabled(enabled)
                      if (csvDir) {
                        updateCsvConfig(enabled, csvDir)
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <label htmlFor="csv-enable" className="text-sm cursor-pointer">
                    Enable CSV save on STOP
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSelectFolder}
                    disabled={!csvEnabled}
                    className="flex-1 px-4 py-2 text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                    style={{ backgroundColor: csvEnabled ? '#912335' : '#d1d5db' }}
                    onMouseEnter={(e) => csvEnabled && (e.currentTarget.style.backgroundColor = '#7a1e2d')}
                    onMouseLeave={(e) => csvEnabled && (e.currentTarget.style.backgroundColor = '#912335')}
                  >
                    <FolderOpen className="w-4 h-4" />
                    {csvDir ? 'Change Folder' : 'Select Save Folder'}
                  </button>
                </div>

                {csvDir && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex items-start gap-2">
                      <FolderOpen className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-green-800 mb-1">
                          Selected Folder:
                        </div>
                        <div className="text-sm text-green-700 font-mono break-all">
                          {csvDir}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <div className="text-xs text-blue-800">
                    <strong>💡 How it works:</strong>
                    <ul className="mt-1 ml-4 space-y-1 list-disc">
                      <li>Click "Select Save Folder" to choose where CSV files will be saved</li>
                      <li>CSV files will be automatically saved to your selected folder when you press STOP</li>
                      <li>Works in Chrome, Edge, and Opera browsers</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CHART SECTION - FULL WIDTH */}
      <div className="p-6 bg-white border rounded-lg shadow-sm mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Real-Time Pressure</h3>
          <button 
            onClick={() => {
              setXStart(0);
              setZoomRange(2000);
              setYShift(0);
              setYZoom(4200);
            }}
            className="text-xs text-white px-3 py-1 rounded border transition-colors"
            style={{ backgroundColor: '#912335', borderColor: '#7a1e2d' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7a1e2d'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#912335'}
          >
            Reset View to Default
          </button>
        </div>

        <div
          className="h-96 select-none cursor-grab active:cursor-grabbing border-2 border-gray-300 bg-white"
          style={{ touchAction: 'none' }} 
          onWheel={handleWheel}
          onMouseEnter={handleChartMouseEnter}
          onMouseLeave={handleChartMouseLeave}
          onMouseDownCapture={handleChartMouseDownCapture}
          onMouseMoveCapture={handleChartMouseMoveCapture}
          onMouseUpCapture={handleChartMouseUpCapture}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={liveData} 
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#e5e7eb" vertical={true} horizontal={true} />
              
              <XAxis
                dataKey="x"
                type="number"
                domain={[xStart, xStart + zoomRange]}
                ticks={xTicks}
                interval={0}
                allowDataOverflow
                stroke="#374151"
                fontSize={12}
                tickLine={{ stroke: '#374151' }}
                axisLine={{ stroke: '#374151' }}
                label={{ value: 'Point', position: 'insideBottom', offset: -5, fontWeight: 'bold' }}
              />
              
              <YAxis
                type="number"
                domain={[dynamicYMin, dynamicYMax]}
                ticks={yTicks}
                interval={0}
                allowDataOverflow
                stroke="#374151"
                fontSize={12}
                tickLine={{ stroke: '#374151' }}
                axisLine={{ stroke: '#374151' }}
                label={{ value: 'AD値', angle: -90, position: 'insideLeft', fontWeight: 'bold' }}
              />

              <Line
                type="linear"
                dataKey={displayMode === 'raw' ? 'raw' : 'filtered'}
                stroke="#2563eb"
                strokeWidth={1}
                dot={zoomRange < 150}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {!isRunning && (
          <p className="text-sm text-gray-600 mt-3">
            Press <b>Start</b> to begin streaming data.
          </p>
        )}

        <p className="text-xs text-gray-500 mt-2">
          Y-axis range: -2048 to +2048. Drag to pan, scroll to zoom.
        </p>
      </div>

      <div className="p-6 bg-white border rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold mb-4">System Log</h3>

        <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
          {logs.map((log, index) => (
            <div key={index} className="mb-1">
              <span className="text-gray-500">[{log.timestamp}]</span>{' '}
              <span
                className={
                  log.type === 'command'
                    ? 'text-blue-400'
                    : log.type === 'response'
                      ? 'text-green-400'
                      : log.type === 'error'
                        ? 'text-red-400'
                        : 'text-gray-400'
                }
              >
                {log.type === 'command' ? '>' : log.type === 'response' ? '<' : '•'}
              </span>{' '}
              <span
                className={
                  log.type === 'command'
                    ? 'text-blue-300'
                    : log.type === 'response'
                      ? 'text-green-300'
                      : log.type === 'error'
                        ? 'text-red-300'
                        : 'text-gray-300'
                }
              >
                {log.message}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}