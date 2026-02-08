import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
const API_BASE = '/api';
interface AutoLimit {
  id: number;
  symbol: string;
  max_amount: number;
  enabled: boolean;
  updated_at: number;
}

interface Stats {
  total: number;
  autoApproved: number;
  manualReview: number;
  completed: number;
}

export default function LimitsManager() {
  const queryClient = useQueryClient();
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [newLimit, setNewLimit] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['limits'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/limits`);
      return response.json() as Promise<{ limits: AutoLimit[]; stats: Stats }>;
    },
    refetchInterval: 5000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ symbol, maxAmount, enabled }: { symbol: string; maxAmount: number; enabled: boolean }) => {
      const response = await fetch(`${API_BASE}/limits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, maxAmount, enabled }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['limits'] });
      setEditingSymbol(null);
      setNewLimit('');
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ symbol, maxAmount }: { symbol: string; maxAmount: number }) => {
      const response = await fetch(`${API_BASE}/limits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.toUpperCase(), maxAmount, enabled: true }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['limits'] });
      setNewSymbol('');
      setNewAmount('');
    },
  });

  const handleUpdate = (limit: AutoLimit) => {
    if (editingSymbol === limit.symbol) {
      const amount = parseFloat(newLimit);
      if (!isNaN(amount) && amount > 0) {
        updateMutation.mutate({ symbol: limit.symbol, maxAmount: amount, enabled: limit.enabled });
      }
    } else {
      setEditingSymbol(limit.symbol);
      setNewLimit(limit.max_amount.toString());
    }
  };

  const handleToggle = (limit: AutoLimit) => {
    updateMutation.mutate({ symbol: limit.symbol, maxAmount: limit.max_amount, enabled: !limit.enabled });
  };

  const handleAdd = () => {
    const amount = parseFloat(newAmount);
    if (newSymbol && !isNaN(amount) && amount > 0) {
      addMutation.mutate({ symbol: newSymbol, maxAmount: amount });
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">Loading limits...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Total Withdrawals
          </div>
          <div className="text-2xl font-semibold text-gray-900">{data?.stats.total || 0}</div>
        </div>
        <div className="bg-white p-4 rounded">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Auto-Approved
          </div>
          <div className="text-2xl font-semibold text-green-600">{data?.stats.autoApproved || 0}</div>
        </div>
        <div className="bg-white p-4 rounded">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Manual Review
          </div>
          <div className="text-2xl font-semibold text-yellow-600">{data?.stats.manualReview || 0}</div>
        </div>
        <div className="bg-white p-4 rounded">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Completed
          </div>
          <div className="text-2xl font-semibold text-blue-600">{data?.stats.completed || 0}</div>
        </div>
      </div>

      {/* Limits List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="text-[rgb(0,111,255)]" size={18} />
            <CardTitle>Auto-Withdrawal Limits</CardTitle>
          </div>
          <CardDescription>
            Configure maximum amounts for automatic withdrawal approval
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.limits.map((limit) => (
            <div key={limit.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-gray-900 w-16">{limit.symbol}</div>
                {editingSymbol === limit.symbol ? (
                  <Input
                    type="number"
                    step="0.000001"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    className="w-32"
                    autoFocus
                  />
                ) : (
                  <div className="text-sm text-gray-600">
                    Max: <span className="font-medium text-gray-900">{limit.max_amount}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={limit.enabled ? "default" : "secondary"} className="text-xs">
                  {limit.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Button
                  onClick={() => handleUpdate(limit)}
                  variant="outline"
                  size="sm"
                  disabled={updateMutation.isPending}
                >
                  {editingSymbol === limit.symbol ? 'Save' : 'Edit'}
                </Button>
                <Button
                  onClick={() => handleToggle(limit)}
                  variant={limit.enabled ? "secondary" : "default"}
                  size="sm"
                  disabled={updateMutation.isPending}
                >
                  {limit.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          ))}

          {/* Add New Limit */}
          <div className="pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-900 mb-3">Add New Limit</div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="newSymbol">Symbol</Label>
                <Input
                  id="newSymbol"
                  type="text"
                  placeholder="BTC"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="newAmount">Max Amount</Label>
                <Input
                  id="newAmount"
                  type="number"
                  step="0.000001"
                  placeholder="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                />
              </div>
              <Button
                onClick={handleAdd}
                disabled={!newSymbol || !newAmount || addMutation.isPending}
              >
                Add Limit
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="text-[rgb(0,111,255)]" size={18} />
            <CardTitle>Auto-Approval Rules</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <span className="text-[rgb(0,111,255)] font-bold">1.</span>
            <span><strong>Amount Limit:</strong> Withdrawal must be within configured limit for the symbol</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[rgb(0,111,255)] font-bold">2.</span>
            <span><strong>Cooldown:</strong> 1 address can request withdrawal max once per minute</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[rgb(0,111,255)] font-bold">3.</span>
            <span><strong>Duplicate Protection:</strong> Same amount as previous withdrawal requires manual review</span>
          </div>
          <div className="pt-2 text-xs text-gray-500">
            All actions are logged in the database for audit purposes
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
