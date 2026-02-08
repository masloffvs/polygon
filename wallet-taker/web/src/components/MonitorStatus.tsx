import { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { MonitorStatus as MonitorStatusType } from '../lib/api';
import { api } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';

interface Props {
  status?: MonitorStatusType;
}

export default function MonitorStatus({ status }: Props) {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCheckUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const id = parseInt(userId);
    if (isNaN(id) || id <= 0) {
      alert('Please enter a valid user ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const data = await api.checkUserDeposits(id);
      setResult(data);
    } catch (error) {
      alert('Failed to check user deposits');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Deposit Monitor Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-gray-600">Status:</span>
            <Badge variant={status?.running ? "default" : "destructive"} className="text-xs">
              {status?.running ? 'Running' : 'Stopped'}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-gray-600">Processed Transactions:</span>
            <span className="text-base font-semibold">{status?.processedCount || 0}</span>
          </div>
          
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-gray-600">Poll Interval:</span>
            <span className="text-base font-semibold">{status?.pollIntervalMs || 0}ms</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check User Deposits</CardTitle>
          <CardDescription>
            Check deposits for a specific user by their ID
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCheckUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="userId" className="text-xs font-medium text-gray-900">User ID</Label>
              <Input
                id="userId"
                type="number"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="12345"
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              <Search size={16} />
              {loading ? 'Checking...' : 'Check Deposits'}
            </Button>
          </form>

          {result && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold">Results for User #{result.userId}</h3>
              
              {result.count === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No deposits found for this user
                </div>
              ) : (
                <div className="space-y-2">
                  {result.transactions.map((tx: any, index: number) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant={
                            tx.status === 'confirmed' ? 'default' : 
                            tx.status === 'pending' ? 'secondary' : 
                            'destructive'
                          } className="text-xs">
                            {tx.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{tx.chain}</Badge>
                        </div>
                        
                        <div className="space-y-1 text-xs">
                          <div className="text-lg font-semibold">
                            {tx.amount} {tx.asset}
                          </div>
                          {tx.txHash && (
                            <div className="font-mono text-xs text-gray-500">
                              Hash: {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
                            </div>
                          )}
                          {tx.timestamp && (
                            <div className="text-gray-500">
                              {new Date(tx.timestamp).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
