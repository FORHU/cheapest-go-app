import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';

/**
 * Runs `work` in a transaction and, when `dryRun`, rolls it back after returning what it did.
 * A preview is therefore the real change with its effects undone, so what the course is shown
 * cannot disagree with what is applied.
 */

class Rollback<T> extends Error {
    constructor(public readonly result: T) {
        super('dry run');
        this.name = 'Rollback';
    }
}

export async function inTransaction<T>(
    dryRun: boolean,
    work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
    const sql = getSqlAdmin();
    try {
        return (await sql.begin(async tx => {
            const result = await work(tx);
            if (dryRun) throw new Rollback(result);
            return result;
        })) as T;
    } catch (err) {
        if (err instanceof Rollback) return err.result as T;
        throw err;
    }
}
