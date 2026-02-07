import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { BarChart3, Activity, Bluetooth, Signal, Video, ChevronDown, ChevronUp } from 'lucide-react';
import { DashboardPage } from '@/app/components/DashboardPage';
import LiveMeasurementPage from '@/app/components/LiveMeasurementPage';

interface Activity {
  id: number;
  name: string;
  video: string;
  description: string;
}

function TopNavbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-border z-50 shadow-sm">
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Pressure Sensor Monitor</h1>
            <p className="text-xs text-muted-foreground">Medical Research System</p>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Sidebar() {
  const location = useLocation();
  const [selectedActivity, setSelectedActivity] = useState(1);
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);

  // Listen for external toggle events
  useEffect(() => {
    const handleToggle = () => {
      setIsVideoExpanded(prev => !prev);
    };

    window.addEventListener('toggleSidebarVideo', handleToggle);
    return () => window.removeEventListener('toggleSidebarVideo', handleToggle);
  }, []);

  const activities: Activity[] = [
    { id: 1, name: 'Activity 1', video: '/videos/tongue/tonguemovefront.mp4', description: 'Tongue Move Front' },
    { id: 2, name: 'Activity 2', video: '/videos/tongue/tonguemoveup.mp4', description: 'Tongue Move Up' },
    { id: 3, name: 'Activity 3', video: '/videos/tongue/tonguemovedown.mp4', description: 'Tongue Move Down' },
    { id: 4, name: 'Activity 4', video: '/videos/tongue/tonguemoveleft.mp4', description: 'Tongue Move Left' },
    { id: 5, name: 'Activity 5', video: '/videos/tongue/tonguemoveright.mp4', description: 'Tongue Move Right' },
    { id: 6, name: 'Activity 6', video: '/videos/6 Push Chin With The Fist.mp4', description: 'Push Chin With The Fist' },
    { id: 7, name: 'Activity 7', video: '/videos/7 Lips Hold The Stick Is Pushed Down.mp4', description: 'Lips Hold The Stick Is Pushed Down' },
    { id: 8, name: 'Activity 8', video: '/videos/8Lips Hold Stick While Finger Push Up.mp4', description: 'Lips Hold Stick While Finger Push Up' },
    { id: 9, name: 'Activity 9', video: '/videos/9Lips Hold Stick While Finger Push Down.mp4', description: 'Lips Hold Stick While Finger Push Down' },
    { id: 10, name: 'Activity 10', video: '/videos/10Tongue Touch Palate (Uppper Mouth).mp4', description: 'Tongue Touch Palate (Uppper Mouth)' },
    { id: 11, name: 'Activity 11', video: '/videos/11Tongue Push The Stick (Right).mp4', description: 'Tongue Push The Stick (Right)' },
    { id: 12, name: 'Activity 12', video: '/videos/12Tongue Push The Stick (Left).mp4', description: 'Tongue Push The Stick (Left)' },
    { id: 13, name: 'Activity 13', video: '/videos/Soft Palate  Uvula Elevation.mp4', description: 'Soft Palate Uvula Elevation' },
    { id: 14, name: 'Activity 14', video: '/videos/Tongue Against Cheek.mp4', description: 'Tongue Against Cheek' },
    { id: 15, name: 'Activity 15', video: '/videos/Tongue Protrusion & Retraction (Above Tongue).mp4', description: 'Tongue Protrusion & Retraction (Above Tongue)' },
    { id: 16, name: 'Activity 16', video: '/videos/Tongue Protrusion & Retraction (Under Tongue).mp4', description: 'Tongue Protrusion & Retraction (Under Tongue)' },
    { id: 17, name: 'Activity 17', video: '/videos/Tongue Retraction.mp4', description: 'Tongue Retraction' },
    { id: 18, name: 'Activity 18', video: '/videos/Tongue Upward Push.mp4', description: 'Tongue Upward Push' },
  ];

  const currentActivity = activities.find(a => a.id === selectedActivity) || activities[0];

  const navItems = [
    { path: '/live', label: 'Live Measurement', icon: Activity, description: 'Real-time Control' },
  ];

  return (
    <aside className="fixed top-16 left-0 bottom-0 w-64 bg-white border-r border-border z-40 overflow-y-auto">
      <div className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Navigation</p>
        <nav className="space-y-1 mb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors
                  ${isActive 
                    ? 'bg-primary text-white' 
                    : 'text-foreground hover:bg-secondary'
                  }
                `}
              >
                <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-primary'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${isActive ? 'text-white' : 'text-foreground'}`}>
                    {item.label}
                  </div>
                  <div className={`text-xs mt-0.5 ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Activity Tutorials Section */}
        <div className="border-t pt-4">
          <button
            onClick={() => setIsVideoExpanded(!isVideoExpanded)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors border-2"
            style={{
              backgroundColor: isVideoExpanded ? '#912335' : 'white',
              borderColor: '#912335',
              color: isVideoExpanded ? 'white' : '#912335'
            }}
            onMouseEnter={(e) => {
              if (!isVideoExpanded) {
                e.currentTarget.style.backgroundColor = '#f8e8eb';
              }
            }}
            onMouseLeave={(e) => {
              if (!isVideoExpanded) {
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            <div className="flex items-center gap-3">
              <Video className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Activity Tutorials</div>
                <div className="text-xs" style={{ opacity: 0.8 }}>Exercise Videos</div>
              </div>
            </div>
            {isVideoExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {isVideoExpanded && (
            <div className="mt-3 space-y-3">
              {/* Activity Selector */}
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  Select Activity:
                </label>
                <select
                  value={selectedActivity}
                  onChange={(e) => setSelectedActivity(Number(e.target.value))}
                  className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm"
                  style={{ 
                    outline: 'none',
                    boxShadow: 'none'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#912335';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(145, 35, 53, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {activities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Video Player */}
              <div className="bg-black rounded-lg overflow-hidden" style={{ position: 'relative', paddingTop: '56.25%' }}>
                <video
                  key={currentActivity.video}
                  autoPlay
                  loop
                  playsInline
                  controls
                  className="w-full h-full"
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                >
                  <source src={currentActivity.video} type="video/mp4" />
                  <source src={currentActivity.video} type="video/quicktime" />
                  Your browser does not support the video tag.
                </video>
              </div>

              {/* Activity Info */}
              <div className="rounded-md p-2.5" style={{ backgroundColor: '#f8e8eb', border: '1px solid #e5c1c7' }}>
                <h4 className="text-sm font-semibold mb-0.5" style={{ color: '#912335' }}>
                  {currentActivity.name}
                </h4>
                <p className="text-xs" style={{ color: '#6b1a28' }}>
                  {currentActivity.description}
                </p>
              </div>

              {/* Quick Navigation */}
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1.5">
                  Quick Navigation:
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {activities.map((activity) => (
                    <button
                      key={activity.id}
                      onClick={() => setSelectedActivity(activity.id)}
                      className="aspect-square rounded text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: selectedActivity === activity.id ? '#912335' : 'white',
                        color: selectedActivity === activity.id ? 'white' : '#374151',
                        border: '1px solid',
                        borderColor: selectedActivity === activity.id ? '#7a1e2d' : '#d1d5db'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedActivity !== activity.id) {
                          e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedActivity !== activity.id) {
                          e.currentTarget.style.backgroundColor = 'white';
                        }
                      }}
                    >
                      {activity.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <TopNavbar />
        <Sidebar />
        <main className="ml-64 mt-16">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/live" element={<LiveMeasurementPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;