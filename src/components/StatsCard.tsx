export default function StatsCard({ title, value, hint }: {title:string;value:string;hint?:string}) {
  return (
    <div className="rounded-2xl p-4 bg-[#0b0f14] border border-white/10 shadow-lg">
      <div className="text-white/60 text-sm">{title}</div>
      <div className="text-2xl text-white font-semibold">{value}</div>
      {hint && <div className="text-xs text-white/50 mt-1">{hint}</div>}
    </div>
  );
}
