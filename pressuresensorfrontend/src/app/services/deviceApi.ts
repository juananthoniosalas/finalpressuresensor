export interface DeviceStatus {
  connected: boolean;
  device_name?: string;
  port?: string;
}

const API_BASE = 'https://cd80329152e9.ngrok-free.app';

export async function getDeviceStatus(): Promise<DeviceStatus> {
  const res = await fetch(`${API_BASE}/device/status`);
  if (!res.ok) throw new Error('Failed to get device status');
  return res.json();
}

export async function startMeasurement(): Promise<void> {
  const res = await fetch(`${API_BASE}/device/start`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start measurement');
}

export async function stopMeasurement(): Promise<void> {
  const res = await fetch(`${API_BASE}/device/stop`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to stop measurement');
}


export interface MeasurementPoint {
  pressure: number;
  raw?: number;
}

export async function fetchLatestMeasurement(): Promise<MeasurementPoint> {
  const res = await fetch(`${API_BASE}/device/latest`);
  if (!res.ok) throw new Error('Failed to fetch measurement');
  return res.json();
}
