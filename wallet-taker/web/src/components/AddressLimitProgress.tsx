import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function getProgressColor(progress: number): string {
  if (progress >= 90) return 'bg-red-500';
  if (progress >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

export default function AddressLimitProgress() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['address-limit-progress'],
    queryFn: () => api.getAddressLimitProgress(300),
    refetchInterval: 5000,
  });

  const rows = data?.rows ?? [];
  const nearLimit = rows.filter((row) => (row.progress_percent ?? 0) >= 80).length;
  const uniqueAddresses = new Set(rows.map((row) => row.address)).size;

  if (isLoading) {
    return <div className="text-center py-8 text-sm text-gray-500">Loading address progress...</div>;
  }

  if (isError) {
    return <div className="text-center py-8 text-sm text-red-600">Failed to load address progress</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-lg font-semibold mb-1">No Withdrawal History Yet</h3>
        <p className="text-sm text-gray-500">Address progress will appear here after withdrawals</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rows</div>
          <div className="text-2xl font-semibold text-gray-900">{rows.length}</div>
        </div>
        <div className="bg-white p-4 rounded">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Unique Addresses</div>
          <div className="text-2xl font-semibold text-gray-900">{uniqueAddresses}</div>
        </div>
        <div className="bg-white p-4 rounded">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Near Limit (80%+)</div>
          <div className="text-2xl font-semibold text-yellow-600">{nearLimit}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="text-[rgb(0,111,255)]" size={18} />
            <CardTitle>Address Withdrawal Progress</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row, index) => {
            const rawProgress = row.progress_percent ?? 0;
            const cappedProgress = Math.min(rawProgress, 100);

            return (
              <div key={`${row.address}-${row.symbol}-${index}`} className="border border-gray-100 rounded p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Address</div>
                    <div className="font-mono text-xs break-all">{row.address}</div>
                  </div>
                  <Badge variant="secondary">{row.symbol}</Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Requests</div>
                    <div className="font-semibold text-gray-900">{row.total_requests}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Total Requested</div>
                    <div className="font-semibold text-gray-900">{formatAmount(row.total_requested)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Total Completed</div>
                    <div className="font-semibold text-gray-900">{formatAmount(row.total_completed)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Max Single</div>
                    <div className="font-semibold text-gray-900">{formatAmount(row.max_single_withdrawal)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Limit</div>
                    <div className="font-semibold text-gray-900">
                      {row.limit_enabled && row.limit_amount !== null ? formatAmount(row.limit_amount) : 'Disabled'}
                    </div>
                  </div>
                </div>

                {row.limit_enabled && row.limit_amount !== null && row.progress_percent !== null ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Progress to limit (max single)</span>
                      <span className="font-semibold text-gray-900">{rawProgress.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded overflow-hidden">
                      <div
                        className={`h-full ${getProgressColor(rawProgress)}`}
                        style={{ width: `${cappedProgress}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      Remaining: {formatAmount(row.remaining_to_limit ?? 0)} {row.symbol}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">No enabled limit configured for {row.symbol}</div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
