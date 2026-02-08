/**
 * Withdrawal Service
 * Manages withdrawal requests and processing with auto-approval logic
 */

import { logger } from "../logger";
import { dbService } from "./database.service";

export interface WithdrawalRequest {
  id: number;
  symbol: string;
  network: string;
  amount: string;
  address: string;
  tag: string | null;
  created_at: string;
  auto_approved?: boolean;
  rejection_reason?: string;
}

export class WithdrawalService {
  private pendingWithdrawals = new Map<number, WithdrawalRequest>();

  /**
   * Add withdrawal to pending queue with auto-approval check
   */
  addPending(withdrawal: WithdrawalRequest): void {
    const amount = parseFloat(withdrawal.amount);

    // Проверяем автоодобрение
    const approval = dbService.checkAutoApproval({
      address: withdrawal.address,
      symbol: withdrawal.symbol,
      amount,
      withdrawalId: withdrawal.id,
    });

    // Записываем в базу после проверки, чтобы не учитывать текущий вывод как предыдущий
    dbService.recordWithdrawal({
      withdrawal_id: withdrawal.id,
      address: withdrawal.address,
      symbol: withdrawal.symbol,
      amount,
      network: withdrawal.network,
    });

    if (approval.approved) {
      // Автоодобрено
      withdrawal.auto_approved = true;
      dbService.updateStatus(withdrawal.id, 'auto_approved', true);
      
      logger.info(
        {
          withdrawalId: withdrawal.id,
          symbol: withdrawal.symbol,
          amount: withdrawal.amount,
          address: withdrawal.address,
        },
        "✅ Withdrawal AUTO-APPROVED"
      );
    } else {
      // Требует ручной проверки
      withdrawal.auto_approved = false;
      withdrawal.rejection_reason = approval.reason;
      dbService.updateStatus(withdrawal.id, 'manual_review', false, approval.reason);
      
      logger.warn(
        {
          withdrawalId: withdrawal.id,
          symbol: withdrawal.symbol,
          amount: withdrawal.amount,
          address: withdrawal.address,
          reason: approval.reason,
        },
        "⚠️ Withdrawal requires MANUAL REVIEW"
      );
    }

    this.pendingWithdrawals.set(withdrawal.id, withdrawal);
  }

  /**
   * Get all pending withdrawals
   */
  getPending(): WithdrawalRequest[] {
    return Array.from(this.pendingWithdrawals.values());
  }

  /**
   * Get specific withdrawal
   */
  getById(id: number): WithdrawalRequest | undefined {
    return this.pendingWithdrawals.get(id);
  }

  /**
   * Remove withdrawal from pending queue
   */
  remove(id: number): void {
    this.pendingWithdrawals.delete(id);
  }

  /**
   * Mark withdrawal as claimed
   */
  claim(id: number): void {
    dbService.updateStatus(id, 'claimed');
  }

  /**
   * Mark withdrawal as completed
   */
  complete(id: number, txHash: string): void {
    const record = dbService.getWithdrawalRecord(id);
    if (!record?.tx_hash) {
      dbService.setTxHash(id, txHash);
    }
    dbService.updateStatus(id, 'completed');
    this.remove(id);
  }

  /**
   * Mark withdrawal as failed
   */
  fail(id: number, reason?: string): void {
    dbService.updateStatus(id, 'failed', undefined, reason);
    this.remove(id);
  }

  /**
   * Get pending count
   */
  getPendingCount(): number {
    return this.pendingWithdrawals.size;
  }
}
