import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Wallet, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Settings, BarChart3 } from 'lucide-react';
import StatusCard from './components/StatusCard';
import BalanceCard from './components/BalanceCard';
import WithdrawalsList from './components/WithdrawalsList';
import DepositSimulator from './components/DepositSimulator';
import MonitorStatus from './components/MonitorStatus';
import LimitsManager from './components/LimitsManager';
import AddressLimitProgress from './components/AddressLimitProgress';
import { api } from './lib/api';

function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'withdrawals' | 'deposits' | 'monitor' | 'limits' | 'addressProgress'>('overview');

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ['balances'],
    queryFn: api.getBalances,
  });

  const { data: withdrawals, refetch: refetchWithdrawals } = useQuery({
    queryKey: ['withdrawals'],
    queryFn: api.getWithdrawals,
  });

  const { data: monitorStatus } = useQuery({
    queryKey: ['monitor'],
    queryFn: api.getMonitorStatus,
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Compact Header with Tabs in One Line */}
      <header className="bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Left: Title + Tabs */}
          <div className="flex items-center gap-6">
            <h1 className="text-sm font-semibold text-white py-3">Wallet Taker</h1>
            
            <nav className="flex">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                  activeTab === 'overview'
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Activity size={14} />
                Overview
              </button>
              <button
                onClick={() => setActiveTab('withdrawals')}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors relative ${
                  activeTab === 'withdrawals'
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <ArrowUpFromLine size={14} />
                Withdrawals
                {withdrawals && withdrawals.count > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                    {withdrawals.count}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('deposits')}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                  activeTab === 'deposits'
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <ArrowDownToLine size={14} />
                Deposits
              </button>
              <button
                onClick={() => setActiveTab('monitor')}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                  activeTab === 'monitor'
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <RefreshCw size={14} />
                Monitor
              </button>
              <button
                onClick={() => setActiveTab('limits')}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                  activeTab === 'limits'
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Settings size={14} />
                Limits
              </button>
              <button
                onClick={() => setActiveTab('addressProgress')}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                  activeTab === 'addressProgress'
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <BarChart3 size={14} />
                Address Limits
              </button>
            </nav>
          </div>
          
          {/* Right: Status */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-800 rounded">
            <div className={`w-1.5 h-1.5 rounded-full ${status?.connected ? 'bg-green-500' : 'bg-gray-500'}`} />
            <span className="text-[10px] font-medium text-gray-300">
              {status?.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StatusCard status={status} loading={statusLoading} />
              <BalanceCard balances={balances} loading={balancesLoading} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Pending Withdrawals
                </div>
                <div className="text-3xl font-semibold text-gray-900">{withdrawals?.count || 0}</div>
              </div>
              <div className="bg-white p-5 rounded">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Monitor Status
                </div>
                <div className="text-3xl font-semibold text-gray-900">
                  {monitorStatus?.running ? 'Running' : 'Stopped'}
                </div>
              </div>
              <div className="bg-white p-5 rounded">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Processed Deposits
                </div>
                <div className="text-3xl font-semibold text-gray-900">{monitorStatus?.processedCount || 0}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'withdrawals' && (
          <WithdrawalsList 
            withdrawals={withdrawals?.withdrawals || []} 
            onUpdate={refetchWithdrawals}
          />
        )}

        {activeTab === 'deposits' && <DepositSimulator />}

        {activeTab === 'monitor' && <MonitorStatus status={monitorStatus} />}

        {activeTab === 'limits' && <LimitsManager />}

        {activeTab === 'addressProgress' && <AddressLimitProgress />}
      </main>
    </div>
  );
}

export default App;
