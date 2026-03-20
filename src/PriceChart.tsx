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
  dmdUsd: number;      // Market (DEX)
  dmdAppUsd: number;   // App/Fair Value
  solUsd?: number;
};

function fmtUsd(n: number, digits = 6) {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(digits)}`;
}

export default function PriceChart({ data }: { data: Point[] }) {
  const [showApp, setShowApp] = useState(true);
  const [showSol, setShowSol] = useState(true);

  const last = data.length ? data[data.length - 1] : null;

  const header = useMemo(() => {
    if (!last) return { market: "—", app: "—", sol: "—" };
    return {
      market: fmtUsd(last.dmdUsd, 6),
      app: fmtUsd(last.dmdAppUsd, 6),
      sol: last.solUsd ? fmtUsd(last.solUsd, 2) : "—",
    };
  }, [last]);

  // Empty-State falls noch keine Daten
  if (data.length === 0) {
    return (
      <div className="card p-4 panel" style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="text-center">
          <div className="text-white/60 text-sm">Noch keine Preisdaten</div>
          <div className="text-xs text-white/40 mt-1">Die ersten Punkte erscheinen in wenigen Sekunden...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 panel">
      {/* Header mit Preisen */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="text-white font-semibold text-lg">DMD Price (USD)</div>
          <div className="text-xs text-white/60 mt-1">
            Market: <span style={{ color: "#f5c542" }}>{header.market}</span>
            {showApp && (
              <>
                {" · "}App: <span style={{ color: "#7CFFB2" }}>{header.app}</span>
              </>
            )}
            {showSol && (
              <>
                {" · "}SOL: <span style={{ color: "#6aa9ff" }}>{header.sol}</span>
              </>
            )}
          </div>
        </div>

        {/* Toggle Buttons – im gleichen Style wie deine App */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`btn ${showApp ? "active" : ""}`}
            onClick={() => setShowApp((v) => !v)}
            style={{ padding: "6px 14px", fontSize: "13px" }}
          >
            App Line
          </button>
          <button
            className={`btn ${showSol ? "active" : ""}`}
            onClick={() => setShowSol((v) => !v)}
            style={{ padding: "6px 14px", fontSize: "13px" }}
          >
            SOL Line
          </button>
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 300, marginTop: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis
              dataKey="time"
              tick={{ fill: "#9aa", fontSize: 10 }}
              tickLine={{ stroke: "#333" }}
            />

            {/* DMD Y-Achse (links) */}
            <YAxis
              yAxisId="dmd"
              tick={{ fill: "#9aa", fontSize: 10 }}
              tickFormatter={(v) => Number(v).toFixed(4)}
              domain={[0, "auto"]}
            />

            {/* SOL Y-Achse (rechts) */}
            {showSol && (
              <YAxis
                yAxisId="sol"
                orientation="right"
                tick={{ fill: "#9aa", fontSize: 10 }}
                tickFormatter={(v) => Number(v).toFixed(0)}
                domain={[0, "auto"]}
              />
            )}

            <Tooltip
              contentStyle={{
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 8,
              }}
              formatter={(value: any, name: string) => {
                const n = Number(value);
                if (name === "dmdUsd") return [fmtUsd(n, 6), "DMD/USD (Market)"];
                if (name === "dmdAppUsd") return [fmtUsd(n, 6), "DMD/USD (App)"];
                if (name === "solUsd") return [fmtUsd(n, 2), "SOL/USD"];
                return [String(value), String(name)];
              }}
              labelFormatter={(label) => `Zeit: ${label}`}
            />

            <Legend />

            {/* Market Line */}
            <Line
              yAxisId="dmd"
              type="monotone"
              dataKey="dmdUsd"
              name="DMD/USD (Market)"
              stroke="#f5c542"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* App Line (gestrichelt) */}
            {showApp && (
              <Line
                yAxisId="dmd"
                type="monotone"
                dataKey="dmdAppUsd"
                name="DMD/USD (App)"
                stroke="#7CFFB2"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
            )}

            {/* SOL Line */}
            {showSol && (
              <Line
                yAxisId="sol"
                type="monotone"
                dataKey="solUsd"
                name="SOL/USD"
                stroke="#6aa9ff"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}

            <Brush dataKey="time" height={20} travellerWidth={8} stroke="#555" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Hinweis */}
      <div className="text-xs text-white/50 mt-3 text-center">
        Zoom mit Brush unten • App-Line = Treasury + Dynamic Pricing • Market = DEX
      </div>
    </div>
  );
}