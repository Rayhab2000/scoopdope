interface LineChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}

export function LineChart({ data, color = '#3b82f6', height = 80 }: LineChartProps) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 100 / (data.length - 1 || 1);

  const points = data.map((d, i) => ({
    x: i * w,
    y: height - (d.value / max) * (height - 8),
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full h-full"
        aria-hidden="true"
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1="0"
            y1={height - t * (height - 8)}
            x2="100"
            y2={height - t * (height - 8)}
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-gray-200 dark:text-gray-700"
          />
        ))}
        {/* Area fill */}
        <polygon
          points={`0,${height} ${polyline} 100,${height}`}
          fill={color}
          fillOpacity="0.1"
        />
        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {/* X-axis labels — show first, middle, last */}
      <div className="flex justify-between mt-1">
        {data.map((d, i) => {
          const show = i === 0 || i === Math.floor(data.length / 2) || i === data.length - 1;
          return (
            <span
              key={i}
              className={`text-xs text-gray-400 dark:text-gray-500 ${show ? '' : 'invisible'}`}
              style={{ width: `${w}%`, textAlign: i === 0 ? 'left' : i === data.length - 1 ? 'right' : 'center' }}
            >
              {d.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
