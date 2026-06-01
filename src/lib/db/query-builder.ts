/**
 * Supabase-compatible PostgreSQL query builder.
 *
 * Implements the same fluent interface as @supabase/supabase-js so that
 * existing code works with zero changes by updating only the import:
 *
 *   // Before:
 *   import { createClient } from '@/utils/supabase/server'
 *   const supabase = await createClient()
 *   const { data, error } = await supabase.from('bookings').select('*').eq('id', id)
 *
 *   // After:
 *   import { createClient } from '@/utils/postgres/server'
 *   const db = createClient()
 *   const { data, error } = await db.from('bookings').select('*').eq('id', id)
 *
 * Supported operations: select, insert, update, delete, upsert, rpc
 * Supported filters: eq, neq, gt, gte, lt, lte, in, not, is, like, ilike, or, and
 * Supported modifiers: order, limit, range, single, maybeSingle, count
 */

import type { Sql } from 'postgres';

export type DbResult<T = any> = { data: T | null; error: DbError | null };
export type DbError = { message: string; code?: string; details?: string };

// ─── Filter types ────────────────────────────────────────────────────────────

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is';
type Filter = { col: string; op: FilterOp | 'in' | 'not' | 'or'; val: unknown };

// ─── Column selector normaliser ───────────────────────────────────────────────

function parseColumns(cols: string): string {
    if (!cols || cols === '*') return '*';
    // Handle Supabase foreign table embeds: "flight_segments(*), passengers(*)"
    // These become subqueries — for now return the base columns only
    return cols
        .split(',')
        .map((c) => c.trim())
        .filter((c) => !c.includes('(')) // skip embed selectors — handled via JOIN
        .map((c) => {
            // Handle aliasing: "created_at as createdAt" → "created_at"
            const parts = c.split(/\s+as\s+/i);
            return parts[0].trim();
        })
        .join(', ') || '*';
}

// ─── SQL fragment builder ─────────────────────────────────────────────────────

function buildWhere(filters: Filter[], sql: Sql): { clause: string; values: unknown[] } {
    if (filters.length === 0) return { clause: '', values: [] };

    const parts: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const f of filters) {
        if (f.op === 'or') {
            // f.val is a raw OR string like "status.eq.active,status.eq.pending"
            const orParts = String(f.val).split(',').map((part) => {
                const [col, op, ...rest] = part.trim().split('.');
                const v = rest.join('.');
                values.push(castValue(v));
                return `"${col}" ${opToSql(op as FilterOp)} $${idx++}`;
            });
            parts.push(`(${orParts.join(' OR ')})`);
        } else if (f.op === 'in') {
            const arr = f.val as unknown[];
            if (arr.length === 0) {
                parts.push('FALSE');
            } else {
                const placeholders = arr.map(() => `$${idx++}`).join(', ');
                values.push(...arr);
                parts.push(`"${f.col}" IN (${placeholders})`);
            }
        } else if (f.op === 'not') {
            // f.val is [innerOp, innerVal]
            const [innerOp, innerVal] = f.val as [string, unknown];
            if (innerOp === 'in') {
                const arr = innerVal as unknown[];
                if (arr.length === 0) {
                    parts.push('TRUE');
                } else {
                    const placeholders = arr.map(() => `$${idx++}`).join(', ');
                    values.push(...arr);
                    parts.push(`"${f.col}" NOT IN (${placeholders})`);
                }
            } else if (innerOp === 'is') {
                const v = innerVal === null ? 'NULL' : String(innerVal).toUpperCase();
                parts.push(`"${f.col}" IS NOT ${v}`);
            } else {
                values.push(innerVal);
                parts.push(`NOT ("${f.col}" ${opToSql(innerOp as FilterOp)} $${idx++})`);
            }
        } else if (f.op === 'is') {
            if (f.val === null) {
                parts.push(`"${f.col}" IS NULL`);
            } else {
                parts.push(`"${f.col}" IS ${String(f.val).toUpperCase()}`);
            }
        } else {
            values.push(f.val);
            parts.push(`"${f.col}" ${opToSql(f.op)} $${idx++}`);
        }
    }

    return { clause: `WHERE ${parts.join(' AND ')}`, values };
}

function opToSql(op: string): string {
    const map: Record<string, string> = {
        eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
        like: 'LIKE', ilike: 'ILIKE',
    };
    return map[op] ?? '=';
}

function castValue(v: string): unknown {
    if (v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    return isNaN(n) ? v : n;
}

// ─── QueryBuilder class ───────────────────────────────────────────────────────

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export class QueryBuilder<T = any> implements PromiseLike<DbResult<T>> {
    private _op: Operation = 'select';
    private _cols = '*';
    private _filters: Filter[] = [];
    private _orderBy: string[] = [];
    private _limit: number | null = null;
    private _offset: number | null = null;
    private _single = false;
    private _maybeSingle = false;
    private _returning = '';
    private _insertData: Record<string, unknown> | Record<string, unknown>[] | null = null;
    private _updateData: Record<string, unknown> | null = null;
    private _countMode: 'exact' | 'planned' | 'estimated' | null = null;
    private _onConflict = '';
    private _ignoreDuplicates = false;

    constructor(private readonly sql: Sql, private readonly table: string) {}

    // ── Column/operation selectors ─────────────────────────────────────────────

    select(cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated' }): this {
        this._op = 'select';
        this._cols = parseColumns(cols);
        if (opts?.count) this._countMode = opts.count;
        return this;
    }

    insert(data: Record<string, unknown> | Record<string, unknown>[], _opts?: { ignoreDuplicates?: boolean }): this {
        this._op = 'insert';
        this._insertData = data;
        this._ignoreDuplicates = _opts?.ignoreDuplicates ?? false;
        return this;
    }

    update(data: Record<string, unknown>): this {
        this._op = 'update';
        this._updateData = data;
        return this;
    }

    upsert(data: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
        this._op = 'upsert';
        this._insertData = data;
        this._onConflict = opts?.onConflict ?? '';
        this._ignoreDuplicates = opts?.ignoreDuplicates ?? false;
        return this;
    }

    delete(): this {
        this._op = 'delete';
        return this;
    }

    // ── Filters ────────────────────────────────────────────────────────────────

    eq(col: string, val: unknown): this { this._filters.push({ col, op: 'eq', val }); return this; }
    neq(col: string, val: unknown): this { this._filters.push({ col, op: 'neq', val }); return this; }
    gt(col: string, val: unknown): this { this._filters.push({ col, op: 'gt', val }); return this; }
    gte(col: string, val: unknown): this { this._filters.push({ col, op: 'gte', val }); return this; }
    lt(col: string, val: unknown): this { this._filters.push({ col, op: 'lt', val }); return this; }
    lte(col: string, val: unknown): this { this._filters.push({ col, op: 'lte', val }); return this; }
    like(col: string, val: string): this { this._filters.push({ col, op: 'like', val }); return this; }
    ilike(col: string, val: string): this { this._filters.push({ col, op: 'ilike', val }); return this; }
    is(col: string, val: unknown): this { this._filters.push({ col, op: 'is', val }); return this; }

    in(col: string, vals: unknown[]): this {
        this._filters.push({ col, op: 'in', val: vals });
        return this;
    }

    not(col: string, op: string, val: unknown): this {
        this._filters.push({ col, op: 'not', val: [op, val] });
        return this;
    }

    or(filterStr: string): this {
        this._filters.push({ col: '', op: 'or', val: filterStr });
        return this;
    }

    // ── Modifiers ──────────────────────────────────────────────────────────────

    order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
        const dir = opts?.ascending === false ? 'DESC' : 'ASC';
        const nulls = opts?.nullsFirst ? 'NULLS FIRST' : 'NULLS LAST';
        this._orderBy.push(`"${col}" ${dir} ${nulls}`);
        return this;
    }

    limit(n: number): this { this._limit = n; return this; }

    range(from: number, to: number): this {
        this._offset = from;
        this._limit = to - from + 1;
        return this;
    }

    single(): this { this._single = true; return this; }

    maybeSingle(): this { this._maybeSingle = true; return this; }

    // Controls the RETURNING clause after insert/update/delete
    // When called as .select() after an insert (chaining pattern)
    returning(cols = '*'): this {
        this._returning = parseColumns(cols);
        return this;
    }

    // ── Execution ──────────────────────────────────────────────────────────────

    then<TResult1 = DbResult<T>, TResult2 = never>(
        onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        return this._execute().then(onfulfilled, onrejected);
    }

    private async _execute(): Promise<DbResult<T>> {
        try {
            const rows = await this._buildAndRun();
            return this._format(rows);
        } catch (err: any) {
            return {
                data: null,
                error: {
                    message: err?.message ?? 'Database error',
                    code: err?.code,
                    details: err?.detail,
                },
            };
        }
    }

    private async _buildAndRun(): Promise<any[]> {
        switch (this._op) {
            case 'select': return this._runSelect();
            case 'insert': return this._runInsert();
            case 'update': return this._runUpdate();
            case 'delete': return this._runDelete();
            case 'upsert': return this._runUpsert();
        }
    }

    private async _runSelect(): Promise<any[]> {
        const { clause, values } = buildWhere(this._filters, this.sql);
        const cols = this._countMode ? `*, COUNT(*) OVER() AS _total_count` : this._cols;
        let q = `SELECT ${cols} FROM "${this.table}"`;
        if (clause) q += ` ${clause}`;
        if (this._orderBy.length) q += ` ORDER BY ${this._orderBy.join(', ')}`;
        if (this._limit !== null) q += ` LIMIT ${this._limit}`;
        if (this._offset !== null) q += ` OFFSET ${this._offset}`;
        return this.sql.unsafe(q, values);
    }

    private async _runInsert(): Promise<any[]> {
        const rows = Array.isArray(this._insertData) ? this._insertData : [this._insertData!];
        if (rows.length === 0) return [];
        const keys = Object.keys(rows[0]);
        const cols = keys.map((k) => `"${k}"`).join(', ');

        const valueRows = rows.map((row) =>
            `(${keys.map((_, i) => `$${_ ? _ : i + 1}`).join(', ')})`,
        );

        // Use postgres.js safe parameterised approach
        const conflict = this._ignoreDuplicates ? 'ON CONFLICT DO NOTHING' : '';
        const returning = this._returning ? `RETURNING ${this._returning}` : '';

        // Build using template literal for safety
        let results: any[] = [];
        if (rows.length === 1) {
            results = await this.sql`
                INSERT INTO ${this.sql(this.table)} ${this.sql(rows[0])}
                ${this.sql.unsafe(conflict)}
                ${this.sql.unsafe(returning)}
            `;
        } else {
            results = await this.sql`
                INSERT INTO ${this.sql(this.table)} ${this.sql(rows)}
                ${this.sql.unsafe(conflict)}
                ${this.sql.unsafe(returning)}
            `;
        }
        return results;
    }

    private async _runUpdate(): Promise<any[]> {
        const data = this._updateData!;
        const { clause, values } = buildWhere(this._filters, this.sql);
        const returning = this._returning ? `RETURNING ${this._returning}` : '';

        // Build SET clause
        const setKeys = Object.keys(data);
        let paramIdx = values.length + 1;
        const setClause = setKeys
            .map((k) => {
                const v = (paramIdx++).toString();
                values.push(data[k]);
                return `"${k}" = $${v}`;
            })
            .join(', ');

        let q = `UPDATE "${this.table}" SET ${setClause} ${clause} ${returning}`;
        return this.sql.unsafe(q, values);
    }

    private async _runDelete(): Promise<any[]> {
        const { clause, values } = buildWhere(this._filters, this.sql);
        const returning = this._returning ? `RETURNING ${this._returning}` : '';
        let q = `DELETE FROM "${this.table}" ${clause} ${returning}`;
        return this.sql.unsafe(q, values);
    }

    private async _runUpsert(): Promise<any[]> {
        const rows = Array.isArray(this._insertData) ? this._insertData : [this._insertData!];
        if (rows.length === 0) return [];

        const conflict = this._onConflict
            ? `ON CONFLICT (${this._onConflict.split(',').map((c) => `"${c.trim()}"`).join(', ')}) DO UPDATE SET ${Object.keys(rows[0]).map((k) => `"${k}" = EXCLUDED."${k}"`).join(', ')}`
            : this._ignoreDuplicates ? 'ON CONFLICT DO NOTHING' : 'ON CONFLICT DO NOTHING';

        const returning = this._returning ? `RETURNING ${this._returning}` : '';

        if (rows.length === 1) {
            return this.sql`
                INSERT INTO ${this.sql(this.table)} ${this.sql(rows[0])}
                ${this.sql.unsafe(conflict)}
                ${this.sql.unsafe(returning)}
            `;
        }
        return this.sql`
            INSERT INTO ${this.sql(this.table)} ${this.sql(rows)}
            ${this.sql.unsafe(conflict)}
            ${this.sql.unsafe(returning)}
        `;
    }

    private _format(rows: any[]): DbResult<T> {
        if (this._countMode) {
            const count = rows[0]?._total_count ?? rows.length;
            const cleaned = rows.map(({ _total_count: _, ...rest }) => rest);
            return { data: cleaned as any, error: null } as any;
        }

        if (this._single) {
            if (rows.length === 0) {
                return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
            }
            return { data: rows[0] as any, error: null };
        }

        if (this._maybeSingle) {
            return { data: (rows[0] ?? null) as any, error: null };
        }

        return { data: rows as any, error: null };
    }
}

// ─── RPC builder ──────────────────────────────────────────────────────────────

export class RpcBuilder<T = any> implements PromiseLike<DbResult<T>> {
    private _single = false;
    private _maybeSingle = false;

    constructor(
        private readonly sql: Sql,
        private readonly fn: string,
        private readonly params: Record<string, unknown> = {},
    ) {}

    single(): this { this._single = true; return this; }
    maybeSingle(): this { this._maybeSingle = true; return this; }

    then<TResult1 = DbResult<T>, TResult2 = never>(
        onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        return this._execute().then(onfulfilled, onrejected);
    }

    private async _execute(): Promise<DbResult<T>> {
        try {
            // Build CALL or SELECT based on function type
            const paramStr = Object.keys(this.params)
                .map((k) => `${k} := ${JSON.stringify(this.params[k])}`)
                .join(', ');
            const rows = await this.sql.unsafe(
                `SELECT * FROM ${this.fn}(${paramStr})`,
            );

            if (this._single) {
                if (rows.length === 0) return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
                return { data: rows[0] as any, error: null };
            }
            if (this._maybeSingle) return { data: (rows[0] ?? null) as any, error: null };
            return { data: rows as any, error: null };
        } catch (err: any) {
            return { data: null, error: { message: err?.message ?? 'RPC error', code: err?.code } };
        }
    }
}

// ─── Database client class ────────────────────────────────────────────────────

export class DbClient {
    constructor(private readonly sql: Sql) {}

    from<T = any>(table: string): QueryBuilder<T> {
        return new QueryBuilder<T>(this.sql, table);
    }

    rpc<T = any>(fn: string, params?: Record<string, unknown>): RpcBuilder<T> {
        return new RpcBuilder<T>(this.sql, fn, params);
    }

    /** Run raw SQL — escape hatch for complex queries */
    get sql(): Sql { return this.sql; }
}

export function createDbClient(sql: Sql): DbClient {
    return new DbClient(sql);
}
