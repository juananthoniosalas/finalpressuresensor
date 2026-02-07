# Pressure Sensor Measurement System

A real-time pressure measurement and visualization system using a pressure sensor connected via **USB or Bluetooth**.  
This system is designed for **testing, monitoring, and pressure data analysis**, featuring live data streaming, interactive charts, and CSV export.

---

## 📌 Overview

The **Pressure Sensor Measurement System** allows users to:
- Acquire pressure sensor data in real time
- Visualize pressure signals with a sliding-window graph
- Switch between **USB** and **Bluetooth** connection modes
- Control measurement flow (Start / Stop)
- Export measurement data automatically to CSV files

The system consists of:
- **Backend**: Python + FastAPI (data acquisition & streaming)
- **Frontend**: Vite + modern web UI (visualization & control)

---

## 🧱 System Architecture

Pressure Sensor
↓
USB / Bluetooth
↓
Python Backend (FastAPI, WebSocket)
↓
Frontend Web App (Vite)
↓
Real-time Graph & CSV Export

### Backend
- Python **3.9 – 3.11** (tested on **Python 3.10.11**)
- Required libraries:
  - fastapi
  - uvicorn
  - numpy
  - websockets
  - pyserial
  - bleak==2.1.1
  - ps02usb (USB communication)
  - ps02 (Bluetooth communication)

### Frontend
- Node.js **18.x or later**
- npm **9.x or later**

---

## 📦 Backend Installation

1. Install Python (recommended version):
   - https://www.python.org/downloads/release/python-31011/
   - ⚠️ Make sure to check **“Add Python to PATH”**

2. Verify Python:
   ```bash
   python --version
   Install required libraries:
3. python -m pip install fastapi uvicorn numpy websockets pyserial bleak
4. (Optional) Verify installation:
   python -c "import fastapi,uvicorn,numpy,websockets,serial,bleak; print('OK')"

🎨 Frontend Installation

1. Install Node.js (LTS):
https://nodejs.org

2. Verify installation:
node -v
npm -v

3. Install frontend dependencies:
cd pressuresensorfrontend
npm install

4. Running the System
Start Backend
cd pressuresensor
uvicorn main:app --host 0.0.0.0 --port 5000

5. Expected output:
Uvicorn running on http://0.0.0.0:5000
Application startup complete
6. Start Frontend
cd pressuresensorfrontend
npm run dev

7. Frontend will be available at:
http://localhost:5173

8. Open the Web Interface
After both services are running, open:
http://localhost:5173/live

🧩 Web Interface Features
Device Status Panel
Connection Mode: USB / Bluetooth
Measurement Status: Running / Stopped
Signal Status: Active / Idle
(Read-only, auto-updated)

Control Panel
Connection Mode selection (USB recommended)
Start / Stop measurement
Gain setting (0–15)
Raw display mode
Automatic CSV export on STOP
Custom save folder selection
Real-Time Graph

Sliding window visualization
X-axis: sample index / time progression
Y-axis: ADC values
Zoom, pan, and reset view
System Log
Displays real-time system messages
Useful for monitoring backend and user actions
Activity Tutorials
Guided exercise videos
Accessible via left navigation menu
Supports both USB and Bluetooth demonstrations

📁 Project Structure
finalpressuresensor/
├── pressuresensor/           # Backend (FastAPI, sensor logic)
├── pressuresensorfrontend/   # Frontend (Vite, UI)
├── Pressure Sensor User Manual.pptx
└── README.md

📄 Documentation

Pressure Sensor User Manual.pptx
Detailed usage guide and UI explanation

👤 Author
Juan Anthonio Salas, Cheng-Yang Lee
Date: 2026-01-23

---
