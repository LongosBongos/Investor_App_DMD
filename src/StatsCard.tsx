export default function StatsCard({ title, value, hint }: {title:string; value:string; hint?:string}) {
  return (
    <div className="rounded-2xl p-4 bg-[#0b0f14] shadow-lg border border-white/10">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      {hint && <div className="text-xs text-white/50 mt-1">{hint}</div>}
    </div>
  );
}
