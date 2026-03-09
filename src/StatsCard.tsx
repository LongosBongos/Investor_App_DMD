export default function StatsCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="
        relative overflow-hidden rounded-2xl p-5
        border border-white/10
        bg-[linear-gradient(135deg,rgba(15,18,24,0.96),rgba(5,7,11,0.96))]
        shadow-[0_20px_50px_rgba(0,0,0,0.55)]
        backdrop-blur-md
      "
    >
      <div
        className="
          pointer-events-none absolute inset-0 opacity-60
          bg-[radial-gradient(circle_at_0%_0%,rgba(245,197,66,0.08),transparent_42%)]
        "
      />

      <div className="relative z-10">
        <div
          className="
            mb-2 text-[12px] font-extrabold uppercase tracking-[0.18em]
            text-[#f5c542]
          "
        >
          {title}
        </div>

        <div
          className="
            text-[clamp(30px,2vw,42px)] font-extrabold leading-none
            tracking-[-0.02em] text-[#f4f1ea]
          "
        >
          {value}
        </div>

        {hint && (
          <div
            className="
              mt-3 text-xs font-medium leading-relaxed
              text-white/55
            "
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
