// src/PriceChart.tsx
// ELITE ASSET-MANAGER EDITION — Professionell, clean, premium dark mode
// Vollständig überarbeitet: bessere Typografie, Gold-Akzente, Toggle-Switches, Hover-Effekte, Tooltip-Upgrade
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
  CartesianGrid,
} from "recharts";

type Point = {
  time: string;
  dmdUsd: number;     // Market (DEX)
  dmdAppUsd: number;  // App/Fair Value
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

  // Empty State (premium)
  if (data.length === 0) {
    return (
      <div className="card p-4 panel" style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,15,15,0.95)" }}>
        <div className="text-center">
          <div className="text-white/70 text-base font-medium">Preis-Chart wird geladen...</div>
          <div className="text-xs text-white/40 mt-2">Erste Daten erscheinen in Sekunden</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 panel" style={{ background: "rgba(15,15,15,0.98)", border: "1px solid rgba(255,215,0,0.08)" }}>
      {/* Premium Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div className="text-white font-semibold text-2xl tracking-tight">DMD PRICE</div>
          <div className="text-xs text-white/60 mt-1 flex items-center gap-3">
            <span>Market: <span style={{ color: "#f5c542", fontWeight: 700 }}>{header.market}</span></span>
            {showApp && <span>· App: <span style={{ color: "#7CFFB2", fontWeight: 700 }}>{header.app}</span></span>}
            {showSol && <span>· SOL: <span style={{ color: "#6aa9ff", fontWeight: 700 }}>{header.sol}</span></span>}
          </div>
        </div>

        {/* Elite Toggle Switches */}
        <div style={{ display: "flex", gap: 8, background: "rgba(30,30,30,0.8)", padding: "4px", borderRadius: 999 }}>
          <button
            onClick={() => setShowApp((v) => !v)}
            className={`px-5 py-1.5 text-xs font-medium rounded-full transition-all ${showApp ? "bg-[#7CFFB2] text-black" : "text-white/70 hover:text-white"}`}
          >
            APP LINE
          </button>
          <button
            onClick={() => setShowSol((v) => !v)}
            className={`px-5 py-1.5 text-xs font-medium rounded-full transition-all ${showSol ? "bg-[#6aa9ff] text-black" : "text-white/70 hover:text-white"}`}
          >
            SOL LINE
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div style={{ width: "100%", height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            
            <XAxis
              dataKey="time"
              tick={{ fill: "#888", fontSize: 11 }}
              tickLine={{ stroke: "#333" }}
              axisLine={{ stroke: "#333" }}
            />

            {/* DMD Y-Achse (links) */}
            <YAxis
              yAxisId="dmd"
              tick={{ fill: "#aaa", fontSize: 11 }}
              tickFormatter={(v) => `$${Number(v).toFixed(4)}`}
              domain={[0, "auto"]}
              axisLine={{ stroke: "#333" }}
            />

            {/* SOL Y-Achse (rechts) */}
            {showSol && (
              <YAxis
                yAxisId="sol"
                orientation="right"
                tick={{ fill: "#aaa", fontSize: 11 }}
                tickFormatter={(v) => Number(v).toFixed(0)}
                domain={[0, "auto"]}
                axisLine={{ stroke: "#333" }}
              />
            )}

            {/* Premium Tooltip */}
            <Tooltip
              contentStyle={{
                background: "#111",
                border: "1px solid #444",
                borderRadius: 12,
                boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
                padding: "12px 16px",
              }}
              formatter={(value: number, name: string) => {
                if (name === "dmdUsd") return [fmtUsd(value, 6), "Market (DEX)"];
                if (name === "dmdAppUsd") return [fmtUsd(value, 6), "App / Fair Value"];
                if (name === "solUsd") return [fmtUsd(value, 2), "SOL Price"];
                return [value, name];
              }}
              labelFormatter={(label) => `📅 ${label}`}
            />

            <Legend verticalAlign="top" height={36} iconType="circle" />

            {/* Market Line (gold) */}
            <Line
              yAxisId="dmd"
              type="natural"
              dataKey="dmdUsd"
              name="DMD/USD (Market)"
              stroke="#f5c542"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: "#f5c542", stroke: "#000" }}
              isAnimationActive={false}
            />

            {/* App Line (grün, gestrichelt) */}
            {showApp && (
              <Line
                yAxisId="dmd"
                type="natural"
                dataKey="dmdAppUsd"
                name="DMD/USD (App)"
                stroke="#7CFFB2"
                strokeWidth={2.5}
                strokeDasharray="7 3"
                dot={false}
                activeDot={{ r: 5, fill: "#7CFFB2" }}
                isAnimationActive={false}
              />
            )}

            {/* SOL Line (blau) */}
            {showSol && (
              <Line
                yAxisId="sol"
                type="natural"
                dataKey="solUsd"
                name="SOL/USD"
                stroke="#6aa9ff"
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 4, fill: "#6aa9ff" }}
                isAnimationActive={false}
              />
            )}

            <Brush dataKey="time" height={22} travellerWidth={10} stroke="#555" fill="#1a1a1a" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer – professionell */}
      <div className="text-xs text-white/50 mt-4 text-center flex items-center justify-center gap-4">
        <span>Zoom mit Brush • App-Line = Treasury + Dynamic Pricing</span>
        <span className="text-[#7CFFB2]">● Market (DEX)</span>
        <span className="text-[#7CFFB2]">● App Value</span>
      </div>
    </div>
  );
}