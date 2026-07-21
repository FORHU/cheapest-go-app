import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const design = searchParams.get('design') || 'a';

  const W = 1200;
  const H = 630;

  // Shared: taglines per design
  const designs: Record<string, { title: string; sub: string; node: React.ReactNode }> = {
    a: {
      title: 'Stop Overpaying\nfor Travel.',
      sub: 'Real prices. No markup. No surprises.',
      node: (
        <div
          style={{
            width: W, height: H,
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            background: '#060818',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Grid lines */}
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${(i + 1) * 12.5}%`, top: 0, bottom: 0,
              width: 1, background: 'rgba(99,102,241,0.12)',
              display: 'flex',
            }} />
          ))}
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              top: `${(i + 1) * 16.6}%`, left: 0, right: 0,
              height: 1, background: 'rgba(99,102,241,0.12)',
              display: 'flex',
            }} />
          ))}

          {/* Glow orb */}
          <div style={{
            position: 'absolute', top: -120, right: -80,
            width: 560, height: 560,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(139,92,246,0.15) 50%, transparent 70%)',
            display: 'flex',
          }} />
          <div style={{
            position: 'absolute', bottom: -60, left: 80,
            width: 320, height: 320,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%)',
            display: 'flex',
          }} />

          {/* Pill badge */}
          <div style={{
            position: 'absolute', top: 52, left: 64,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: 100, padding: '6px 16px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'flex' }} />
            <span style={{ color: '#a5b4fc', fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>CHEAPESTGO</span>
          </div>

          {/* Main text */}
          <div style={{ padding: '0 64px 64px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              fontSize: 78, fontWeight: 800, color: '#fff',
              lineHeight: 1.05, letterSpacing: -2,
              display: 'flex', flexDirection: 'column',
            }}>
              <span>Stop Overpaying</span>
              <span style={{ color: '#818cf8' }}>for Travel.</span>
            </div>
            <p style={{ fontSize: 22, color: '#94a3b8', margin: 0, fontWeight: 400 }}>
              Real prices. No markup. No surprises.
            </p>
          </div>
        </div>
      ),
    },

    b: {
      title: 'The World,\nfor Less.',
      sub: 'From Jeju to Lisbon — find the lowest price anywhere on Earth.',
      node: (
        <div style={{
          width: W, height: H,
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0f1629 0%, #1a0533 50%, #0f1629 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Sunset arc */}
          <div style={{
            position: 'absolute', bottom: -300, left: '50%',
            width: 900, height: 900,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #f97316 0%, #ec4899 35%, #9333ea 60%, transparent 75%)',
            transform: 'translateX(-50%)',
            opacity: 0.6,
            display: 'flex',
          }} />

          {/* Horizon line */}
          <div style={{
            position: 'absolute', bottom: 180, left: 0, right: 0,
            height: 1, background: 'rgba(249,115,22,0.4)',
            display: 'flex',
          }} />

          {/* Stars */}
          {[
            [120, 80], [340, 50], [560, 110], [780, 60], [950, 90],
            [200, 160], [480, 130], [700, 170], [1050, 140],
          ].map(([x, y], i) => (
            <div key={i} style={{
              position: 'absolute', left: x, top: y,
              width: i % 3 === 0 ? 3 : 2, height: i % 3 === 0 ? 3 : 2,
              borderRadius: '50%', background: 'white', opacity: 0.7,
              display: 'flex',
            }} />
          ))}

          {/* Destination pins */}
          {[
            { x: 200, label: 'Jeju' },
            { x: 520, label: 'Tokyo' },
            { x: 840, label: 'Lisbon' },
          ].map((pin) => (
            <div key={pin.label} style={{
              position: 'absolute', left: pin.x, bottom: 196,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 20, padding: '4px 10px',
                fontSize: 13, color: 'white', fontWeight: 600,
                display: 'flex',
              }}>{pin.label}</div>
              <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.4)', display: 'flex' }} />
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', display: 'flex' }} />
            </div>
          ))}

          {/* Wordmark */}
          <div style={{
            position: 'absolute', top: 52, left: 64,
            fontSize: 15, color: 'rgba(255,255,255,0.5)',
            fontWeight: 700, letterSpacing: 2,
            display: 'flex',
          }}>CHEAPESTGO</div>

          {/* Main text */}
          <div style={{
            position: 'absolute', bottom: 56, left: 64,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 80, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: -2, display: 'flex', flexDirection: 'column' }}>
              <span>The World,</span>
              <span style={{ background: 'linear-gradient(90deg, #f97316, #ec4899)', WebkitBackgroundClip: 'text', color: 'transparent' }}>for Less.</span>
            </div>
            <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              From Jeju to Lisbon — find the lowest price anywhere on Earth.
            </p>
          </div>
        </div>
      ),
    },

    c: {
      title: 'Your Travel OS.',
      sub: 'Search, compare, and book across hundreds of global providers.',
      node: (
        <div style={{
          width: W, height: H,
          display: 'flex',
          background: '#ffffff',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Left accent bar */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: 6,
            background: 'linear-gradient(180deg, #6366f1, #8b5cf6, #06b6d4)',
            display: 'flex',
          }} />

          {/* Right panel — colored */}
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: 420,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #06b6d4 100%)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 24,
          }}>
            {/* Mock search card */}
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 16, padding: '16px 20px',
              width: 300,
              display: 'flex', flexDirection: 'column', gap: 10,
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              {[
                { label: 'Destination', value: 'Jeju, Korea' },
                { label: 'Check-in', value: 'May 29' },
                { label: 'Check-out', value: 'May 30' },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: 1 }}>{row.label.toUpperCase()}</span>
                  <span style={{ fontSize: 15, color: 'white', fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
              <div style={{
                marginTop: 4,
                background: 'white', borderRadius: 10,
                padding: '10px 0', textAlign: 'center',
                fontSize: 14, fontWeight: 700, color: '#6366f1',
                display: 'flex', justifyContent: 'center',
              }}>Search Hotels →</div>
            </div>

            {/* Price tag */}
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 4,
            }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'line-through' }}>₱12,400</span>
              <span style={{ fontSize: 32, fontWeight: 800, color: 'white' }}>₱8,200</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>/night</span>
            </div>
          </div>

          {/* Left content */}
          <div style={{
            flex: 1, padding: '64px 56px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20,
          }}>
            <span style={{
              fontSize: 12, fontWeight: 700, letterSpacing: 2,
              color: '#6366f1', textTransform: 'uppercase',
              display: 'flex',
            }}>CheapestGo</span>
            <div style={{
              fontSize: 68, fontWeight: 800, color: '#0f172a',
              lineHeight: 1.0, letterSpacing: -2,
              display: 'flex', flexDirection: 'column',
            }}>
              <span>Your</span>
              <span>Travel OS.</span>
            </div>
            <p style={{ fontSize: 18, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Search, compare, and book across hundreds of global providers.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {['Hotels', 'Flights', 'Live Prices'].map((tag) => (
                <div key={tag} style={{
                  border: '1px solid #e2e8f0', borderRadius: 100,
                  padding: '6px 14px', fontSize: 13, color: '#475569', fontWeight: 500,
                  display: 'flex',
                }}>{tag}</div>
              ))}
            </div>
          </div>
        </div>
      ),
    },

    d: {
      title: 'Book Before\nPrices Change.',
      sub: 'Live prices that actually update. Lock in your deal now.',
      node: (
        <div style={{
          width: W, height: H,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 40%, #db2777 80%, #ea580c 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Concentric rings */}
          {[320, 520, 720, 920].map((size, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: size, height: size,
              borderRadius: '50%',
              border: `1px solid rgba(255,255,255,${0.12 - i * 0.02})`,
              display: 'flex',
            }} />
          ))}

          {/* Live badge top right */}
          <div style={{
            position: 'absolute', top: 48, right: 64,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 100, padding: '8px 18px',
            border: '1px solid rgba(255,255,255,0.2)',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'flex' }} />
            <span style={{ color: 'white', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>LIVE PRICES</span>
          </div>

          {/* Wordmark */}
          <div style={{
            position: 'absolute', top: 52, left: 64,
            fontSize: 15, color: 'rgba(255,255,255,0.6)',
            fontWeight: 700, letterSpacing: 2,
            display: 'flex',
          }}>CHEAPESTGO</div>

          {/* Price ticker */}
          <div style={{
            position: 'absolute', bottom: 52, right: 64,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
          }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 1 }}>JEJU · 1 NIGHT</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', textDecoration: 'line-through' }}>$134</span>
              <span style={{ fontSize: 42, color: 'white', fontWeight: 800, lineHeight: 1 }}>$89</span>
            </div>
            <div style={{
              background: '#4ade80', borderRadius: 6,
              padding: '3px 10px', fontSize: 12, fontWeight: 700, color: '#052e16',
              display: 'flex',
            }}>↓ 34% cheaper today</div>
          </div>

          {/* Main headline */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, zIndex: 1 }}>
            <div style={{
              fontSize: 90, fontWeight: 900, color: 'white',
              lineHeight: 0.95, letterSpacing: -3, textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span>Book Before</span>
              <span>Prices Change.</span>
            </div>
            <p style={{ fontSize: 22, color: 'rgba(255,255,255,0.75)', margin: 0, textAlign: 'center' }}>
              Live prices that actually update. Lock in your deal now.
            </p>
          </div>
        </div>
      ),
    },
  };

  const chosen = designs[design] || designs['a'];

  return new ImageResponse(chosen.node as React.ReactElement, { width: W, height: H });
}
