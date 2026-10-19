"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "rgba(15, 23, 42, 0.92)",
  border: "1px solid rgba(148, 163, 184, 0.3)",
  borderRadius: "12px",
  color: "#e2e8f0",
  fontSize: "12px",
  padding: "8px 12px",
};

export function ScoreLineChart({
  data,
  height = 260,
}: {
  data: { label: string; score: number | null }[];
  height?: number;
}) {
  const clean = data.filter((d) => d.score != null);
  if (clean.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Aún no hay calificaciones para graficar.
      </div>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={clean} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "rgb(148 163 184)" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "rgb(148 163 184)" }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}/100`, "Nota"]} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#7c3aed"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#7c3aed" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopicAccuracyChart({
  data,
  height = 300,
}: {
  data: { topic: string; accuracy: number }[];
  height?: number;
}) {
  const clean = data.filter((d) => d.accuracy != null);
  if (clean.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Aún no hay intentos finalizados para calcular tu dominio por tema.
      </div>
    );
  }
  const short = clean.map((d) => ({
    ...d,
    label: d.topic.length > 22 ? d.topic.slice(0, 21) + "…" : d.topic,
  }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={short} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "rgb(148 163 184)" }} />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tick={{ fontSize: 11, fill: "rgb(148 163 184)" }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [`${v}%`, "Aciertos"]}
            labelFormatter={(l, payload) => payload?.[0]?.payload?.topic ?? l}
          />
          <Bar dataKey="accuracy" radius={[0, 8, 8, 0]}>
            {short.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.accuracy >= 80 ? "#10b981" : entry.accuracy >= 60 ? "#7c3aed" : entry.accuracy >= 40 ? "#f59e0b" : "#f43f5e"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
