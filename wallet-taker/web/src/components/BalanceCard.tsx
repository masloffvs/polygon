import { DollarSign } from 'lucide-react';
import type { BalancesResponse } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

interface Props {
  balances?: BalancesResponse;
  loading: boolean;
}

export default function BalanceCard({ balances, loading }: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="text-[rgb(0,111,255)]" size={18} />
            <CardTitle className="text-sm">Balances</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-400 py-8 text-sm">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="text-[rgb(0,111,255)]" size={18} />
            <CardTitle className="text-sm">Balances</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">{balances?.count || 0} assets</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center py-3">
          <div className="text-xs font-medium text-gray-500 mb-1">Total USD Value</div>
          <div className="text-3xl font-semibold text-gray-900">
            ${balances?.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
        </div>

        <div className="space-y-2">
          {balances?.balances.slice(0, 5).map((balance) => (
            <div key={balance.symbol} className="flex items-center justify-between py-2">
              <div className="text-sm font-semibold text-gray-900">{balance.symbol}</div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">
                  {balance.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                </div>
                <div className="text-xs text-gray-500">
                  ${balance.usd_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {balances && balances.count > 5 && (
          <div className="text-center text-xs text-gray-500 pt-2">
            +{balances.count - 5} more assets
          </div>
        )}
      </CardContent>
    </Card>
  );
}
