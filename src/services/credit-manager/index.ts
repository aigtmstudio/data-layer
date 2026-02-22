import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { InsufficientCreditsError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

interface ChargeParams {
  baseCost: number;
  source: string;
  operation: string;
  description: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
}

export class CreditManager {
  async hasBalance(clientId: string, estimatedCost: number): Promise<boolean> {
    const db = getDb();
    const [client] = await db
      .select({ creditBalance: schema.clients.creditBalance })
      .from(schema.clients)
      .where(eq(schema.clients.id, clientId))
      .limit(1);

    if (!client) return false;
    return Number(client.creditBalance) >= estimatedCost;
  }

  async charge(clientId: string, params: ChargeParams): Promise<void> {
    const db = getDb();

    await db.transaction(async (tx) => {
      const [client] = await tx
        .select({
          creditBalance: schema.clients.creditBalance,
          marginPercent: schema.clients.creditMarginPercent,
        })
        .from(schema.clients)
        .where(eq(schema.clients.id, clientId));

      if (!client) throw new NotFoundError('Client', clientId);

      const margin = params.baseCost * (Number(client.marginPercent) / 100);
      const totalCharge = params.baseCost + margin;
      const newBalance = Number(client.creditBalance) - totalCharge;

      if (newBalance < 0) {
        throw new InsufficientCreditsError(clientId, totalCharge, Number(client.creditBalance));
      }

      await tx
        .update(schema.clients)
        .set({ creditBalance: String(newBalance), updatedAt: new Date() })
        .where(eq(schema.clients.id, clientId));

      await tx.insert(schema.creditTransactions).values({
        clientId,
        type: 'usage',
        amount: String(-totalCharge),
        baseCost: String(params.baseCost),
        marginAmount: String(margin),
        balanceAfter: String(newBalance),
        description: params.description,
        dataSource: params.source,
        operationType: params.operation,
        jobId: params.jobId,
        metadata: params.metadata ?? {},
      });
    });

    logger.debug(
      { clientId, source: params.source, operation: params.operation, baseCost: params.baseCost },
      'Credits charged',
    );
  }

  async addCredits(
    clientId: string,
    amount: number,
    type: 'purchase' | 'adjustment' | 'refund',
    description: string,
  ): Promise<{ newBalance: number }> {
    const db = getDb();
    let newBalance = 0;

    await db.transaction(async (tx) => {
      const [client] = await tx
        .select({ creditBalance: schema.clients.creditBalance })
        .from(schema.clients)
        .where(eq(schema.clients.id, clientId));

      if (!client) throw new NotFoundError('Client', clientId);

      newBalance = Number(client.creditBalance) + amount;

      await tx
        .update(schema.clients)
        .set({ creditBalance: String(newBalance), updatedAt: new Date() })
        .where(eq(schema.clients.id, clientId));

      await tx.insert(schema.creditTransactions).values({
        clientId,
        type,
        amount: String(amount),
        balanceAfter: String(newBalance),
        description,
      });
    });

    logger.info({ clientId, amount, type, newBalance }, 'Credits added');
    return { newBalance };
  }

  async getBalance(clientId: string): Promise<number> {
    const db = getDb();
    const [client] = await db
      .select({ creditBalance: schema.clients.creditBalance })
      .from(schema.clients)
      .where(eq(schema.clients.id, clientId))
      .limit(1);

    if (!client) throw new NotFoundError('Client', clientId);
    return Number(client.creditBalance);
  }

  async getTransactions(clientId: string, limit = 50, offset = 0) {
    const db = getDb();
    return db
      .select()
      .from(schema.creditTransactions)
      .where(eq(schema.creditTransactions.clientId, clientId))
      .orderBy(schema.creditTransactions.createdAt)
      .limit(limit)
      .offset(offset);
  }
}
