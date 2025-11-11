export function TxFeed({ title, transactions }: {title:string;transactions:any[]}) {
  return (
    <div className="rounded-2xl p-4 bg-[#0b0f14] border border-white/10 shadow-lg">
      <div className="text-white font-semibold mb-2">{title}</div>
      {transactions.length ? (
        transactions.map((t, i) => (
          <div key={i} className="text-sm text-white/80 flex justify-between">
            <span>
              <b className={
                t.evt_type === 'buy' ? 'text-green-400' :
                t.evt_type === 'sell' ? 'text-red-400' :
                t.evt_type === 'claim' ? 'text-yellow-300' : 'text-white'
              }>
                {t.evt_type.toUpperCase()}
              </b> • {t.amount_sol} SOL • {t.amount_dmd} DMD
            </span>
            <a className="text-white/50 underline" href={`https://solscan.io/tx/${t.sig}`} target="_blank">Tx</a>
          </div>
        ))
      ) : (
        <div className="text-white/50">Keine Einträge.</div>
      )}
    </div>
  );
}
