/** JSON document collections on Durable Object SQLite storage. */

export interface Doc {
  id: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
  author?: string;
}

export interface DocOp {
  op: 'put' | 'get' | 'list' | 'delete' | 'clear' | 'collections';
  collection?: string;
  id?: string;
  data?: unknown;
  /** list: equality filters on top level fields, e.g. { done: false }. */
  where?: Record<string, string | number | boolean | null>;
  /** list: field to sort by ("updatedAt", "createdAt" or a data field), prefix "-" for descending. */
  order?: string;
  limit?: number;
  offset?: number;
}

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DOC_BYTES = 256 * 1024;

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function initDocs(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS docs (
    scope TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    author TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (scope, collection, id)
  )`);
}

function requireName(value: unknown, what: string): string {
  if (typeof value !== 'string' || !NAME.test(value)) {
    throw new HttpError(400, `${what} must be 1-64 letters, digits, "_" or "-"`);
  }
  return value;
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function rowToDoc(row: Record<string, SqlStorageValue>): Doc {
  return {
    id: String(row.id),
    data: JSON.parse(String(row.data)),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(row.author ? { author: String(row.author) } : {}),
  };
}

/** Runs one document operation. Returns what the client receives. */
export function runDocOp(sql: SqlStorage, scope: string, op: DocOp, author?: string): { result: unknown; changed?: { collection: string; id?: string; op: string } } {
  if (op.op === 'collections') {
    const rows = sql.exec('SELECT collection, COUNT(*) AS count FROM docs WHERE scope = ? GROUP BY collection', scope).toArray();
    return { result: rows.map((r) => ({ name: String(r.collection), count: Number(r.count) })) };
  }
  const collection = requireName(op.collection, 'collection');
  switch (op.op) {
    case 'put': {
      const id = op.id === undefined ? newId() : requireName(op.id, 'id');
      const data = JSON.stringify(op.data ?? null);
      if (data.length > MAX_DOC_BYTES) throw new HttpError(413, 'Document larger than 256 KB');
      const now = Date.now();
      sql.exec(
        `INSERT INTO docs (scope, collection, id, data, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (scope, collection, id) DO UPDATE SET data = excluded.data, author = excluded.author, updated_at = excluded.updated_at`,
        scope, collection, id, data, author ?? null, now, now,
      );
      const row = sql.exec('SELECT * FROM docs WHERE scope = ? AND collection = ? AND id = ?', scope, collection, id).one();
      return { result: rowToDoc(row), changed: { collection, id, op: 'put' } };
    }
    case 'get': {
      const id = requireName(op.id, 'id');
      const rows = sql.exec('SELECT * FROM docs WHERE scope = ? AND collection = ? AND id = ?', scope, collection, id).toArray();
      return { result: rows.length ? rowToDoc(rows[0]) : null };
    }
    case 'delete': {
      const id = requireName(op.id, 'id');
      sql.exec('DELETE FROM docs WHERE scope = ? AND collection = ? AND id = ?', scope, collection, id);
      return { result: true, changed: { collection, id, op: 'delete' } };
    }
    case 'clear':
      sql.exec('DELETE FROM docs WHERE scope = ? AND collection = ?', scope, collection);
      return { result: true, changed: { collection, op: 'clear' } };
    case 'list': {
      const clauses = ['scope = ?', 'collection = ?'];
      const params: SqlStorageValue[] = [scope, collection];
      for (const [field, value] of Object.entries(op.where ?? {})) {
        requireName(field, 'where field');
        clauses.push(`json_extract(data, '$.' || ?) IS ?`);
        params.push(field, typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
      let orderSql = 'updated_at DESC';
      if (op.order) {
        const desc = op.order.startsWith('-');
        const field = requireName(op.order.replace(/^-/, ''), 'order');
        const column = field === 'updatedAt' ? 'updated_at' : field === 'createdAt' ? 'created_at' : null;
        if (column) orderSql = `${column} ${desc ? 'DESC' : 'ASC'}`;
        else {
          orderSql = `json_extract(data, '$.' || ?) ${desc ? 'DESC' : 'ASC'}`;
          params.push(field);
        }
      }
      const limit = Math.min(Math.max(Number(op.limit ?? 100), 1), 500);
      const offset = Math.max(Number(op.offset ?? 0), 0);
      params.push(limit, offset);
      const rows = sql.exec(`SELECT * FROM docs WHERE ${clauses.join(' AND ')} ORDER BY ${orderSql} LIMIT ? OFFSET ?`, ...params).toArray();
      return { result: rows.map(rowToDoc) };
    }
    default:
      throw new HttpError(400, `Unknown op "${String((op as { op: unknown }).op)}"`);
  }
}
