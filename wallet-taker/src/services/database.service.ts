import { Database } from 'bun:sqlite';
import { join } from 'path';
import { logger } from '../logger';

const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'withdrawals.db');

export interface WithdrawalRecord {
  id: number;
  withdrawal_id: number;
  address: string;
  symbol: string;
  amount: number;
  network: string;
  status: 'pending' | 'claimed' | 'completed' | 'failed' | 'auto_approved' | 'manual_review';
  auto_approved: boolean;
  rejection_reason?: string;
  tx_hash?: string;
  created_at: number;
  claimed_at?: number;
  completed_at?: number;
}

interface AutoApprovalCheckInput {
  address: string;
  symbol: string;
  amount: number;
  withdrawalId?: number;
}

export interface AutoLimitConfig {
  id: number;
  symbol: string;
  max_amount: number;
  enabled: boolean;
  updated_at: number;
}

export interface WithdrawalLog {
  id: number;
  withdrawal_id: number;
  action: string;
  details: string;
  timestamp: number;
}

export interface AddressLimitProgress {
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

class DatabaseService {
  private db: Database;

  constructor() {
    this.db = new Database(DB_PATH, { create: true });
    this.db.exec('PRAGMA journal_mode = WAL');
    this.initTables();
    logger.info(`Database initialized at ${DB_PATH}`);
  }

  private initTables() {
    // Таблица истории выводов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS withdrawal_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        withdrawal_id INTEGER NOT NULL,
        address TEXT NOT NULL,
        symbol TEXT NOT NULL,
        amount REAL NOT NULL,
        network TEXT NOT NULL,
        status TEXT NOT NULL,
        auto_approved INTEGER DEFAULT 0,
        rejection_reason TEXT,
        tx_hash TEXT,
        created_at INTEGER NOT NULL,
        claimed_at INTEGER,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_address ON withdrawal_records(address);
      CREATE INDEX IF NOT EXISTS idx_created_at ON withdrawal_records(created_at);
      CREATE INDEX IF NOT EXISTS idx_status ON withdrawal_records(status);
    `);

    // Таблица лимитов автовывода
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auto_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        max_amount REAL NOT NULL,
        enabled INTEGER DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
    `);

    // Таблица логов действий
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS withdrawal_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        withdrawal_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_withdrawal_id ON withdrawal_logs(withdrawal_id);
    `);

    // Вставляем дефолтные лимиты если их нет
    const defaultLimits = [
      { symbol: 'USDT', max_amount: 1000 },
      { symbol: 'USDC', max_amount: 1000 },
      { symbol: 'BTC', max_amount: 0.01 },
      { symbol: 'ETH', max_amount: 0.5 },
      { symbol: 'SOL', max_amount: 10 },
    ];

    const insertLimit = this.db.prepare(`
      INSERT OR IGNORE INTO auto_limits (symbol, max_amount, enabled, updated_at)
      VALUES (?, ?, 1, ?)
    `);

    const now = Date.now();
    for (const limit of defaultLimits) {
      insertLimit.run(limit.symbol, limit.max_amount, now);
    }
  }

  // Записать новый вывод
  recordWithdrawal(withdrawal: {
    withdrawal_id: number;
    address: string;
    symbol: string;
    amount: number;
    network: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO withdrawal_records (withdrawal_id, address, symbol, amount, network, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `);

    stmt.run(
      withdrawal.withdrawal_id,
      withdrawal.address,
      withdrawal.symbol,
      withdrawal.amount,
      withdrawal.network,
      Date.now()
    );

    const lastId = this.db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };

    this.log(withdrawal.withdrawal_id, 'created', `Withdrawal request created for ${withdrawal.amount} ${withdrawal.symbol}`);
    
    return lastId.id;
  }

  // Проверка кулдауна (1 минута)
  checkCooldown(address: string, excludeWithdrawalId?: number): { allowed: boolean; lastWithdrawal?: number } {
    const stmt = excludeWithdrawalId === undefined
      ? this.db.prepare(`
          SELECT created_at FROM withdrawal_records
          WHERE address = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
      : this.db.prepare(`
          SELECT created_at FROM withdrawal_records
          WHERE address = ?
            AND withdrawal_id != ?
          ORDER BY created_at DESC
          LIMIT 1
        `);

    const result = (excludeWithdrawalId === undefined
      ? stmt.get(address)
      : stmt.get(address, excludeWithdrawalId)) as { created_at: number } | undefined;
    
    if (!result) {
      return { allowed: true };
    }

    const oneMinuteAgo = Date.now() - 60 * 1000;
    const allowed = result.created_at < oneMinuteAgo;

    return { allowed, lastWithdrawal: result.created_at };
  }

  // Проверка на дубликат (одинаковая сумма подряд)
  checkDuplicate(address: string, amount: number, symbol: string, excludeWithdrawalId?: number): boolean {
    const stmt = excludeWithdrawalId === undefined
      ? this.db.prepare(`
          SELECT amount, symbol FROM withdrawal_records
          WHERE address = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
      : this.db.prepare(`
          SELECT amount, symbol FROM withdrawal_records
          WHERE address = ?
            AND withdrawal_id != ?
          ORDER BY created_at DESC
          LIMIT 1
        `);

    const result = (excludeWithdrawalId === undefined
      ? stmt.get(address)
      : stmt.get(address, excludeWithdrawalId)) as { amount: number; symbol: string } | undefined;
    
    if (!result) {
      return false; // Нет предыдущих выводов
    }

    return result.amount === amount && result.symbol === symbol;
  }

  // Получить лимит для символа
  getLimit(symbol: string): AutoLimitConfig | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM auto_limits WHERE symbol = ? AND enabled = 1
    `);

    return stmt.get(symbol) as AutoLimitConfig | undefined;
  }

  // Получить все лимиты
  getAllLimits(): AutoLimitConfig[] {
    const stmt = this.db.prepare(`SELECT * FROM auto_limits ORDER BY symbol`);
    return stmt.all() as AutoLimitConfig[];
  }

  // Обновить лимит
  updateLimit(symbol: string, maxAmount: number, enabled: boolean): void {
    const stmt = this.db.prepare(`
      INSERT INTO auto_limits (symbol, max_amount, enabled, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        max_amount = excluded.max_amount,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `);

    stmt.run(symbol, maxAmount, enabled ? 1 : 0, Date.now());
    this.log(0, 'limit_updated', `Limit for ${symbol} updated to ${maxAmount} (enabled: ${enabled})`);
  }

  // Проверка автоодобрения
  checkAutoApproval(withdrawal: AutoApprovalCheckInput): { approved: boolean; reason?: string } {
    // 1. Проверка кулдауна
    const cooldown = this.checkCooldown(withdrawal.address, withdrawal.withdrawalId);
    if (!cooldown.allowed) {
      const waitTime = Math.ceil((60000 - (Date.now() - cooldown.lastWithdrawal!)) / 1000);
      return { 
        approved: false, 
        reason: `Cooldown: wait ${waitTime}s (1 request per minute)` 
      };
    }

    // 2. Проверка дубликата
    const isDuplicate = this.checkDuplicate(
      withdrawal.address,
      withdrawal.amount,
      withdrawal.symbol,
      withdrawal.withdrawalId
    );
    if (isDuplicate) {
      return { 
        approved: false, 
        reason: 'Duplicate: same amount as previous withdrawal' 
      };
    }

    // 3. Проверка лимита
    const limit = this.getLimit(withdrawal.symbol);
    if (!limit) {
      return { 
        approved: false, 
        reason: `No auto-limit configured for ${withdrawal.symbol}` 
      };
    }

    if (withdrawal.amount > limit.max_amount) {
      return { 
        approved: false, 
        reason: `Amount ${withdrawal.amount} exceeds limit ${limit.max_amount}` 
      };
    }

    return { approved: true };
  }

  getWithdrawalRecord(withdrawalId: number): WithdrawalRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM withdrawal_records
      WHERE withdrawal_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return stmt.get(withdrawalId) as WithdrawalRecord | undefined;
  }

  // Обновить статус вывода
  updateStatus(withdrawalId: number, status: WithdrawalRecord['status'], autoApproved?: boolean, rejectionReason?: string): void {
    const updates: string[] = ['status = ?'];
    const params: any[] = [status];

    if (autoApproved !== undefined) {
      updates.push('auto_approved = ?');
      params.push(autoApproved ? 1 : 0);
    }

    if (rejectionReason) {
      updates.push('rejection_reason = ?');
      params.push(rejectionReason);
    }

    if (status === 'claimed') {
      updates.push('claimed_at = ?');
      params.push(Date.now());
    }

    if (status === 'completed') {
      updates.push('completed_at = ?');
      params.push(Date.now());
    }

    params.push(withdrawalId);

    const stmt = this.db.prepare(`
      UPDATE withdrawal_records
      SET ${updates.join(', ')}
      WHERE withdrawal_id = ?
    `);

    stmt.run(...params);
    this.log(withdrawalId, 'status_updated', `Status changed to ${status}${rejectionReason ? `: ${rejectionReason}` : ''}`);
  }

  // Установить tx_hash
  setTxHash(withdrawalId: number, txHash: string): void {
    const stmt = this.db.prepare(`
      UPDATE withdrawal_records
      SET tx_hash = ?
      WHERE withdrawal_id = ?
    `);

    stmt.run(txHash, withdrawalId);
    this.log(withdrawalId, 'tx_hash_set', `Transaction hash: ${txHash}`);
  }

  // Логирование действия
  log(withdrawalId: number, action: string, details: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO withdrawal_logs (withdrawal_id, action, details, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(withdrawalId, action, details, Date.now());
    logger.info(`[Withdrawal ${withdrawalId}] ${action}: ${details}`);
  }

  // Получить историю по адресу
  getAddressHistory(address: string, limit: number = 10): WithdrawalRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM withdrawal_records
      WHERE address = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(address, limit) as WithdrawalRecord[];
  }

  // Прогресс адресов до лимитов (по адресу + символу)
  getAddressLimitProgress(limit: number = 200): AddressLimitProgress[] {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const stmt = this.db.prepare(`
      SELECT
        wr.address as address,
        wr.symbol as symbol,
        COUNT(*) as total_requests,
        SUM(wr.amount) as total_requested,
        SUM(CASE WHEN wr.status = 'completed' THEN wr.amount ELSE 0 END) as total_completed,
        MAX(wr.amount) as max_single_withdrawal,
        MAX(wr.created_at) as last_withdrawal_at,
        al.max_amount as limit_amount,
        CASE WHEN al.enabled = 1 THEN 1 ELSE 0 END as limit_enabled
      FROM withdrawal_records wr
      LEFT JOIN auto_limits al ON al.symbol = wr.symbol
      GROUP BY wr.address, wr.symbol
      ORDER BY last_withdrawal_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(safeLimit) as Array<{
      address: string;
      symbol: string;
      total_requests: number;
      total_requested: number;
      total_completed: number;
      max_single_withdrawal: number;
      last_withdrawal_at: number;
      limit_amount: number | null;
      limit_enabled: number;
    }>;

    return rows.map((row) => {
      const hasLimit = row.limit_enabled === 1 && row.limit_amount !== null && row.limit_amount > 0;
      const progress = hasLimit
        ? (row.max_single_withdrawal / row.limit_amount) * 100
        : null;
      const remaining = hasLimit
        ? Math.max(row.limit_amount - row.max_single_withdrawal, 0)
        : null;

      return {
        address: row.address,
        symbol: row.symbol,
        total_requests: row.total_requests,
        total_requested: row.total_requested,
        total_completed: row.total_completed,
        max_single_withdrawal: row.max_single_withdrawal,
        last_withdrawal_at: row.last_withdrawal_at,
        limit_amount: row.limit_amount,
        limit_enabled: row.limit_enabled === 1,
        progress_percent: progress,
        remaining_to_limit: remaining,
      };
    });
  }

  // Получить логи вывода
  getWithdrawalLogs(withdrawalId: number): WithdrawalLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM withdrawal_logs
      WHERE withdrawal_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(withdrawalId) as WithdrawalLog[];
  }

  // Статистика
  getStats() {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM withdrawal_records').get() as { count: number };
    const autoApproved = this.db.prepare('SELECT COUNT(*) as count FROM withdrawal_records WHERE auto_approved = 1').get() as { count: number };
    const manual = this.db.prepare('SELECT COUNT(*) as count FROM withdrawal_records WHERE auto_approved = 0').get() as { count: number };
    const completed = this.db.prepare('SELECT COUNT(*) as count FROM withdrawal_records WHERE status = "completed"').get() as { count: number };

    return {
      total: total.count,
      autoApproved: autoApproved.count,
      manualReview: manual.count,
      completed: completed.count,
    };
  }

  close() {
    this.db.close();
  }
}

export const dbService = new DatabaseService();
