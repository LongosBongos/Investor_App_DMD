import { db } from './db.js';

export async function saveEvent(e:{
  sig:string; evt_type:string; wallet:string; amount_dmd:number; amount_sol:number;
  ts:number; is_founder:boolean; is_treasury:boolean;
}) {
  if (!db) return;
  await db.query(
    `insert into chain_event(sig,evt_type,wallet,amount_dmd,amount_sol,ts,is_founder,is_treasury)
     values($1,$2,$3,$4,$5,to_timestamp($6/1000),$7,$8)
     on conflict(sig) do nothing`,
    [e.sig,e.evt_type,e.wallet,e.amount_dmd,e.amount_sol,e.ts,e.is_founder,e.is_treasury]
  );
}

export async function listEvents(kind:'public'|'treasury'|'founder', limit=50) {
  if (!db) return [];
  const where = kind==='treasury' ? 'where is_treasury=true'
              : kind==='founder' ? 'where is_founder=true'
              : 'where is_founder=false';
  const r = await db.query(
    `select sig,evt_type,wallet,amount_dmd,amount_sol,extract(epoch from ts)*1000 as ts
     from chain_event ${where} order by ts desc limit $1`, [limit]);
  return r.rows;
}
