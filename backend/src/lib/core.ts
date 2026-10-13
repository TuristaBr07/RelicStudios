import type { Sql } from './db.js';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(condition: unknown, message: string, status = 422): asserts condition {
  if (!condition) throw new AppError(status, message);
}
export async function audit(
  db: Sql,
  actor: string | null,
  action: string,
  entity: string,
  id: string | null,
  details: unknown = {},
) {
  await db.query(
    'INSERT INTO relic.audit_log(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',
    [actor, action, entity, id, JSON.stringify(details)],
  );
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dateOnly(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
export async function nextCode(tx: Sql, kind: 'ORC' | 'PED') {
  const year = Number(today().slice(0, 4));
  const [row] = await tx.query(
    'INSERT INTO relic.document_counters(kind,year,value) VALUES($1,$2,1) ON CONFLICT(kind,year) DO UPDATE SET value=relic.document_counters.value+1 RETURNING value',
    [kind, year],
  );
  return `${kind}-${year}-${String(row!.value).padStart(4, '0')}`;
}
export const stages = [
  'PREPARATION',
  'PRINTING',
  'POST_PROCESSING',
  'ASSEMBLY',
  'PRIMING',
  'PAINTING',
  'FINALIZATION',
  'QUALITY_CHECK',
  'PACKAGING',
] as const;
