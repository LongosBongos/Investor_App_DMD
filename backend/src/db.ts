import 'dotenv/config';
import { Pool } from 'pg';

export const db = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

export async function initDb() {
  if (!db) return;
  await db.query(`create table if not exists chain_event(
    id uuid primary key default gen_random_uuid(),
    sig text unique,
    evt_type text,
    wallet text,
    amount_dmd numeric,
    amount_sol numeric,
    ts timestamptz,
    is_founder boolean default false,
    is_treasury boolean default false
  );`);
  await db.query(`create index if not exists chain_event_ts_idx on chain_event(ts desc);`);

  await db.query(`create table if not exists forum_thread(
    id uuid primary key default gen_random_uuid(),
    author text,
    title text,
    body text,
    tags text[],
    created timestamptz default now()
  );`);
  await db.query(`create table if not exists forum_reply(
    id uuid primary key default gen_random_uuid(),
    thread_id uuid references forum_thread(id) on delete cascade,
    author text,
    body text,
    created timestamptz default now()
  );`);
}
