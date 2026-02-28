'use client';
import { useEffect, useRef } from 'react';

const TOKEN_DATA = [
  { label: 'Public Sale', subtitle: '(Lockup)', amount: 45 },
  { label: 'Private Sale', subtitle: '(1 month lockup)', amount: 25 },
  { label: 'Reserve Fund', subtitle: '(6 months lockup)', amount: 8 },
  { label: 'Team & Founder', subtitle: '(3 months lockup)', amount: 12 },
  { label: 'Bounty & Events', subtitle: '(1 month lockup)', amount: 6 },
  { label: 'Advisors & Partners', subtitle: '(6 months lockup)', amount: 4 },
];

const COLORS = ['#f42f54', '#2c3f6e', '#1e3a6e', '#4a90d9', '#7cb9e8', '#b0c4de'];

export default function TokenChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = TOKEN_DATA.map(d => d.amount);
    const total = data.reduce((a, b) => a + b, 0);
    let startAngle = -Math.PI / 2;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    data.forEach((value, i) => {
      const slice = (value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = '#0f1932';
      ctx.lineWidth = 2;
      ctx.stroke();
      startAngle += slice;
    });

    // Inner circle for donut look
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f1932';
    ctx.fill();
  }, []);

  return (
    <div>
      <canvas ref={canvasRef} width={280} height={280} className="chart-canvas" />
      <ul className="chart-data-s2 row" style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
        {TOKEN_DATA.map((item, i) => (
          <li key={item.label} className="col-sm-6" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: COLORS[i], flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.label} <span style={{ color: '#f42f54' }}>{item.amount}%</span></div>
                <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{item.subtitle}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
