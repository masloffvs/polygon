const API_BASE = '/api';

export interface Status {
  connected: boolean;
  websocket: {
    connected: boolean;
    authenticated: boolean;
    reconnectAttempts: number;
  };
  pendingWithdrawals: number;
  depositMonitor: {
    running: boolean;
    processedCount: number;
    pollIntervalMs: number;
  } | null;
}

export interface Balance {
  symbol: string;
  amount: number;
  usd_value: number;
}

export interface BalancesResponse {
  balances: Balance[];
  count: number;
  totalUsd: number;
}

export interface Withdrawal {
  id: number;
  symbol: string;
  network: string;
  amount: string;
  address: string;
  tag: string | null;
  created_at: string;
}

export interface WithdrawalsResponse {
  withdrawals: Withdrawal[];
  count: number;
}

export interface MonitorStatus {
  running: boolean;
  processedCount: number;
  pollIntervalMs: number;
}

export interface AddressLimitProgressRow {
  address: string;
  symbol: string;
  total_requests: number;
  total_requested: number;
  total_completed: number;
  max_single_withdrawal: number;
  last_withdrawal_at: number;
  limit_amount: number | null;
  limit_enabled: boolean;
  progress_percent: number | null;
  remaining_to_limit: number | null;
}

export interface AddressLimitProgressResponse {
  rows: AddressLimitProgressRow[];
  count: number;
}

export const api = {
  async getStatus(): Promise<Status> {
    const res = await fetch(`${API_BASE}/status`);
    if (!res.ok) throw new Error('Failed to fetch status');
    return res.json();
  },

  async getBalances(): Promise<BalancesResponse> {
    const res = await fetch(`${API_BASE}/balances`);
    if (!res.ok) throw new Error('Failed to fetch balances');
    return res.json();
  },

  async getWithdrawals(): Promise<WithdrawalsResponse> {
    const res = await fetch(`${API_BASE}/withdrawals`);
    if (!res.ok) throw new Error('Failed to fetch withdrawals');
    return res.json();
  },

  async claimWithdrawal(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/withdrawals/${id}/claim`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to claim withdrawal');
  },

  async completeWithdrawal(id: number, txHash: string): Promise<void> {
    const res = await fetch(`${API_BASE}/withdrawals/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    });
    if (!res.ok) throw new Error('Failed to complete withdrawal');
  },

  async failWithdrawal(id: number, reason?: string): Promise<void> {
    const res = await fetch(`${API_BASE}/withdrawals/${id}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('Failed to fail withdrawal');
  },

  async simulateDeposit(data: {
    address: string;
    symbol: string;
    network?: string;
    amount?: number;
  }): Promise<void> {
    const res = await fetch(`${API_BASE}/deposits/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to simulate deposit');
  },

  async getMonitorStatus(): Promise<MonitorStatus> {
    const res = await fetch(`${API_BASE}/monitor/status`);
    if (!res.ok) throw new Error('Failed to fetch monitor status');
    return res.json();
  },

  async checkUserDeposits(userId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/monitor/user/${userId}`);
    if (!res.ok) throw new Error('Failed to check user deposits');
    return res.json();
  },

  async getAddressLimitProgress(limit: number = 200): Promise<AddressLimitProgressResponse> {
    const res = await fetch(`${API_BASE}/limits/address-progress?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch address limit progress');
    return res.json();
  },
};
