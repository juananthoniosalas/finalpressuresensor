import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Activity, Database, Clock, Signal, Download } from 'lucide-react';
import { Button } from './ui/button'
import { Card } from './ui/card'



// Mock historical data
const generateHistoricalData = () => {
  const data = [];
  const baseTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
  
  for (let i = 0; i < 100; i++) {
    const time = new Date(baseTime + i * 15 * 60 * 1000); // Every 15 minutes
    const rawPressure = 100 + Math.sin(i / 10) * 20 + (Math.random() - 0.5) * 10;
    const filteredPressure = 100 + Math.sin(i / 10) * 20 + (Math.random() - 0.5) * 3;
    
    data.push({
      time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      rawPressure: parseFloat(rawPressure.toFixed(2)),
      filteredPressure: parseFloat(filteredPressure.toFixed(2)),
    });
  }
  
  return data;
};

const mockSessions = [
  { id: 1, startTime: '2026-01-20 08:30:00', duration: '45 min', gain: 8 },
  { id: 2, startTime: '2026-01-20 10:15:00', duration: '32 min', gain: 12 },
  { id: 3, startTime: '2026-01-20 14:45:00', duration: '58 min', gain: 10 },
  { id: 4, startTime: '2026-01-19 16:20:00', duration: '41 min', gain: 9 },
  { id: 5, startTime: '2026-01-19 09:00:00', duration: '53 min', gain: 11 },
];

export function DashboardPage() {
  const [showRaw, setShowRaw] = useState(true);
  const [showFiltered, setShowFiltered] = useState(true);
  const historicalData = generateHistoricalData();

  const handleExportCSV = () => {
    const csvContent = [
      ['Time', 'Raw Pressure', 'Filtered Pressure'],
      ...historicalData.map(d => [d.time, d.rawPressure, d.filteredPressure])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pressure_data_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-6 bg-white border border-border shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Device Status</p>
              <p className="text-2xl font-semibold text-green-600">Connected</p>
            </div>
            <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white border border-border shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Last Measurement</p>
              <p className="text-2xl font-semibold text-foreground">2 min ago</p>
            </div>
            <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white border border-border shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Sessions</p>
              <p className="text-2xl font-semibold text-foreground">47</p>
            </div>
            <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white border border-border shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Avg Signal Noise</p>
              <p className="text-2xl font-semibold text-foreground">±2.3 kPa</p>
            </div>
            <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
              <Signal className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>
      </div>

      {/* Chart Section */}
      <Card className="p-6 bg-white border border-border shadow-sm mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Historical Pressure Data</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showRaw}
                onChange={(e) => setShowRaw(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-foreground">Raw</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showFiltered}
                onChange={(e) => setShowFiltered(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-foreground">Filtered</span>
            </label>
          </div>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historicalData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="time" 
                stroke="#6B7280"
                tick={{ fontSize: 12 }}
                interval={9}
              />
              <YAxis 
                stroke="#6B7280"
                tick={{ fontSize: 12 }}
                label={{ value: 'Pressure (kPa)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#ffffff', 
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              />
              <Legend />
              {showRaw && (
                <Line 
                  type="monotone" 
                  dataKey="rawPressure" 
                  stroke="#B84A5D" 
                  strokeWidth={1.5}
                  dot={false}
                  name="Raw Pressure"
                />
              )}
              {showFiltered && (
                <Line 
                  type="monotone" 
                  dataKey="filteredPressure" 
                  stroke="#912335" 
                  strokeWidth={2}
                  dot={false}
                  name="Filtered Pressure"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Sessions Section */}
      <Card className="p-6 bg-white border border-border shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Recent Sessions</h2>
          <Button 
            onClick={handleExportCSV}
            className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Session ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Start Time</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Duration</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Gain Value</th>
              </tr>
            </thead>
            <tbody>
              {mockSessions.map((session) => (
                <tr key={session.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                  <td className="py-3 px-4 text-sm text-foreground">#{session.id}</td>
                  <td className="py-3 px-4 text-sm text-foreground">{session.startTime}</td>
                  <td className="py-3 px-4 text-sm text-foreground">{session.duration}</td>
                  <td className="py-3 px-4 text-sm text-foreground">{session.gain}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}