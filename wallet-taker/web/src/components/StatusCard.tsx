import { Activity, Wifi, WifiOff } from 'lucide-react';
import type { Status } from '../lib/api';

interface Props {
  status?: Status;
  loading: boolean;
}

export default function StatusCard({ status, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 bg-gray-50">
          <Activity className="text-[rgb(0,111,255)]" size={18} />
          <h2 className="text-sm font-semibold text-gray-900">Connection Status</h2>
        </div>
        <div className="p-5">
          <div className="text-center text-gray-400 py-8 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 bg-gray-50">
        <Activity className="text-[rgb(0,111,255)]" size={18} />
        <h2 className="text-sm font-semibold text-gray-900">Connection Status</h2>
      </div>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between py-2">
          <div className="text-sm font-medium text-gray-900">WebSocket</div>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
            status?.websocket.connected 
              ? 'bg-green-50 text-green-700' 
              : 'bg-red-50 text-red-700'
          }`}>
            {status?.websocket.connected ? (
              <>
                <Wifi size={14} />
                Connected
              </>
            ) : (
              <>
                <WifiOff size={14} />
                Disconnected
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="text-sm font-medium text-gray-900">Authenticated</div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            status?.websocket.authenticated 
              ? 'bg-green-50 text-green-700' 
              : 'bg-yellow-50 text-yellow-700'
          }`}>
            {status?.websocket.authenticated ? 'Yes' : 'No'}
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="text-sm font-medium text-gray-900">Reconnect Attempts</div>
          <div className="text-base font-semibold text-gray-900">
            {status?.websocket.reconnectAttempts || 0}
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="text-sm font-medium text-gray-900">Deposit Monitor</div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            status?.depositMonitor?.running 
              ? 'bg-green-50 text-green-700' 
              : 'bg-red-50 text-red-700'
          }`}>
            {status?.depositMonitor?.running ? 'Running' : 'Stopped'}
          </div>
        </div>
      </div>
    </div>
  );
}
