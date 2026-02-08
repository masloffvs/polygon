import { useState } from 'react';
import { Send, Check } from 'lucide-react';
import { api } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export default function DepositSimulator() {
  const [address, setAddress] = useState('');
  const [symbol, setSymbol] = useState('USDT');
  const [amount, setAmount] = useState('100');
  const [network, setNetwork] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!address.trim()) {
      alert('Please enter an address');
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      await api.simulateDeposit({
        address: address.trim(),
        symbol: symbol.toUpperCase(),
        network: network.trim() || undefined,
        amount: parseFloat(amount) || undefined,
      });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      alert('Failed to simulate deposit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Deposit Simulator</CardTitle>
          <CardDescription>
            Simulate a deposit for testing purposes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="address" className="text-xs font-medium text-gray-900">Deposit Address *</Label>
              <Input
                id="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="symbol" className="text-xs font-medium text-gray-900">Symbol *</Label>
                <select
                  id="symbol"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="flex h-9 w-full rounded border-0 bg-gray-100 px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(0,111,255)]"
                >
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="SOL">SOL</option>
                  <option value="XRP">XRP</option>
                  <option value="DOGE">DOGE</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs font-medium text-gray-900">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="network" className="text-xs font-medium text-gray-900">Network (optional)</Label>
              <Input
                id="network"
                type="text"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                placeholder="erc20, trc20, solana, etc."
              />
              <p className="text-xs text-gray-500">
                Leave empty for automatic detection
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              variant={success ? "default" : "default"}
            >
              {loading ? (
                'Simulating...'
              ) : success ? (
                <>
                  <Check size={16} />
                  Deposit Simulated!
                </>
              ) : (
                <>
                  <Send size={16} />
                  Simulate Deposit
                </>
              )}
            </Button>
          </form>

          {success && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg text-green-800 text-xs">
              Deposit simulation sent successfully! Check the server logs for confirmation.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
