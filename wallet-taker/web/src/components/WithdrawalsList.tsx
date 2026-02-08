import { useState } from 'react';
import { Check, X, ExternalLink } from 'lucide-react';
import type { Withdrawal } from '../lib/api';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

interface Props {
  withdrawals: Withdrawal[];
  onUpdate: () => void;
}

export default function WithdrawalsList({ withdrawals, onUpdate }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);

  const handleProcess = async (id: number) => {
    setProcessing(id);
    try {
      const response = await fetch(`http://localhost:3001/withdrawals/${id}/process`, {
        method: 'POST',
      });
      const result = await response.json();
      
      if (result.success) {
        alert(`Success! TxHashes: ${result.txHashes.join(', ')}`);
        onUpdate();
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (error) {
      alert('Failed to process withdrawal');
    } finally {
      setProcessing(null);
    }
  };

  const handleClaim = async (id: number) => {
    setLoading(true);
    try {
      await api.claimWithdrawal(id);
      setSelectedId(id);
      onUpdate();
    } catch (error) {
      alert('Failed to claim withdrawal');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (id: number) => {
    if (!txHash.trim()) {
      alert('Please enter transaction hash');
      return;
    }

    setLoading(true);
    try {
      await api.completeWithdrawal(id, txHash);
      setSelectedId(null);
      setTxHash('');
      onUpdate();
    } catch (error) {
      alert('Failed to complete withdrawal');
    } finally {
      setLoading(false);
    }
  };

  const handleFail = async (id: number) => {
    const reason = prompt('Reason for failure (optional):');
    
    setLoading(true);
    try {
      await api.failWithdrawal(id, reason || undefined);
      setSelectedId(null);
      onUpdate();
    } catch (error) {
      alert('Failed to mark withdrawal as failed');
    } finally {
      setLoading(false);
    }
  };

  if (withdrawals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-lg font-semibold mb-1">No Pending Withdrawals</h3>
        <p className="text-sm text-gray-500">All withdrawals have been processed</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {withdrawals.map((withdrawal) => (
        <Card key={withdrawal.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Withdrawal #{withdrawal.id}</CardTitle>
              <Badge variant="secondary" className="text-xs">{withdrawal.network}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{withdrawal.amount}</span>
              <span className="text-base text-gray-500">{withdrawal.symbol}</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Address:</span>
                <span className="font-mono text-xs">{withdrawal.address}</span>
              </div>
              {withdrawal.tag && (
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Tag/Memo:</span>
                  <span className="font-mono">{withdrawal.tag}</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Created:</span>
                <span>{new Date(withdrawal.created_at).toLocaleString()}</span>
              </div>
            </div>

            {selectedId === withdrawal.id ? (
              <div className="space-y-3 pt-3">
                <Input
                  type="text"
                  placeholder="Transaction hash (0x...)"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleComplete(withdrawal.id)}
                    disabled={loading || !txHash.trim()}
                    className="flex-1"
                  >
                    <Check size={14} />
                    Complete
                  </Button>
                  <Button
                    onClick={() => handleFail(withdrawal.id)}
                    disabled={loading}
                    variant="destructive"
                    className="flex-1"
                  >
                    <X size={14} />
                    Fail
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedId(null);
                      setTxHash('');
                    }}
                    disabled={loading}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={() => handleProcess(withdrawal.id)}
                  disabled={processing === withdrawal.id}
                  className="flex-1"
                  variant="default"
                >
                  {processing === withdrawal.id ? 'Processing...' : 'Auto Process'}
                </Button>
                <Button
                  onClick={() => handleClaim(withdrawal.id)}
                  disabled={loading}
                  variant="outline"
                  className="flex-1"
                >
                  <ExternalLink size={14} />
                  Manual
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
