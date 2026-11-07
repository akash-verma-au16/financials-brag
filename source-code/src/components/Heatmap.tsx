/** Square matrix of values in [-1, 1] (e.g. correlations), coloured from negative to positive. */
export function Heatmap({ labels, matrix }: { labels: string[]; matrix: (number | null)[][] }) {
  const color = (v: number | null) => {
    if (v === null) return "var(--surface-selected)";
    const a = Math.min(Math.abs(v), 1);
    return `color-mix(in oklab, ${v >= 0 ? "var(--neg)" : "var(--info)"} ${Math.round(a * 85)}%, var(--surface-panel))`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[11px]">
        <thead>
          <tr>
            <th />
            {labels.map((l) => (
              <th key={l} className="h-20 w-10 align-bottom font-medium text-fg-3">
                <div className="mx-auto w-4 rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{l}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l}>
              <th className="whitespace-nowrap pr-2 text-right font-medium text-fg-3">{l}</th>
              {matrix[i]!.map((v, j) => (
                <td
                  key={j}
                  className="num size-10 rounded text-center"
                  style={{ background: color(v), color: v !== null && Math.abs(v) > 0.6 ? "#fff" : "var(--text-2)" }}
                  title={`${l} vs ${labels[j]}: ${v === null ? "not enough shared history" : v.toFixed(2)}`}
                >
                  {v === null ? "–" : i === j ? "" : v.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
