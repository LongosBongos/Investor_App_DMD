import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Brush,
  Legend,
} from "recharts";

type Point = {
  time: string;
  dmdUsd: number;     // Market (Dex)
  dmdAppUsd: number;  // App/Fair Value
  solUsd?: number;    // optional
};

function fmtUsd(n: number, digits = 6) {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(digits)}`;
}

export default function PriceChart({ data }: { data: Point[] }) {
  const [showSol, setShowSol] = useState(true);
  const [showApp, setShowApp] = useState(true);

  const last = data.length ? data[data.length - 1] : null;

  const header = useMemo(() => {
    if (!last) return { market: "—", app: "—", sol: "—" };
    return {
      market: fmtUsd(last.dmdUsd, 6),
      app: fmtUsd(last.dmdAppUsd, 6),
      sol: last.solUsd ? fmtUsd(last.solUsd, 2) : "—",
    };
  }, [last]);

  return (
    <div className="card p-4 panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="text-white font-semibold">DMD Price (USD)</div>
          <div className="text-xs text-white/60" style={{ marginTop: 4 }}>
            Market: <span style={{ color: "#f5c542" }}>{header.market}</span>{" "}
            {showApp && (
              <>
                · App: <span style={{ color: "#7CFFB2" }}>{header.app}</span>
              </>
            )}
            {showSol && (
              <>
                {" "}
                · SOL: <span style={{ color: "#6aa9ff" }}>{header.sol}</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn"
            onClick={() => setShowApp((v) => !v)}
            style={{ padding: "8px 12px", opacity: showApp ? 1 : 0.6 }}
          >
            App Line
          </button>
          <button
            className="btn"
            onClick={() => setShowSol((v) => !v)}
            style={{ padding: "8px 12px", opacity: showSol ? 1 : 0.6 }}
          >
            SOL Line
          </button>
        </div>
      </div>

      <div style={{ width: "100%", height: 280, marginTop: 14 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="time" tick={{ fill: "#9aa", fontSize: 10 }} />

            {/* DMD (left axis) */}
            <YAxis
              yAxisId="dmd"
              tick={{ fill: "#9aa", fontSize: 10 }}
              tickFormatter={(v) => Number(v).toFixed(4)}
            />

            {/* SOL (right axis) */}
            {showSol && (
              <YAxis
                yAxisId="sol"
                orientation="right"
                tick={{ fill: "#9aa", fontSize: 10 }}
                tickFormatter={(v) => Number(v).toFixed(0)}
              />
            )}

            <Tooltip
              formatter={(value: any, name: any) => {
                const n = Number(value);
                if (name === "dmdUsd") return [fmtUsd(n, 6), "DMD/USD (Market)"];
                if (name === "dmdAppUsd") return [fmtUsd(n, 6), "DMD/USD (App)"];
                if (name === "solUsd") return [fmtUsd(n, 2), "SOL/USD"];
                return [String(value), String(name)];
              }}
              labelFormatter={(label) => `t=${label}`}
            />

            <Legend />

            {/* Market */}
            <Line
              yAxisId="dmd"
              type="monotone"
              dataKey="dmdUsd"
              name="DMD/USD (Market)"
              stroke="#f5c542"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />

            {/* App/Fair */}
            {showApp && (
              <Line
                yAxisId="dmd"
                type="monotone"
                dataKey="dmdAppUsd"
                name="DMD/USD (App)"
                stroke="#7CFFB2"
                dot={false}
                strokeWidth={2}
                strokeDasharray="6 4"
                isAnimationActive={false}
              />
            )}

            {/* SOL */}
            {showSol && (
              <Line
                yAxisId="sol"
                type="monotone"
                dataKey="solUsd"
                name="SOL/USD"
                stroke="#6aa9ff"
                dot={false}
                strokeWidth={1}
                isAnimationActive={false}
              />
            )}

            <Brush dataKey="time" height={20} travellerWidth={8} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="text-xs text-white/50 mt-2">
        Zoom mit Brush · DMD links · SOL rechts (optional) · App-Line = Treasury/Manual/Floor.
      </div>
    </div>
  );
}
