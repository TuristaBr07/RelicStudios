/* ===== Hero, CategoryStrip, SectionHeading ===== */

function Hero({ onCTA }) {
  return (
    <section style={{
      position: "relative",
      overflow: "hidden",
      borderBottom: "1px solid var(--gold-400)",
      background: `
        radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,228,180,0.55), transparent 65%),
        radial-gradient(ellipse 70% 50% at 80% 80%, rgba(255,150,70,0.4), transparent 70%),
        linear-gradient(180deg, #FFE0B5 0%, #FFC587 60%, #FFAA58 100%)
      `,
    }}>
      <div style={{
        position: "absolute", inset: 0, opacity: 0.08, mixBlendMode: "multiply", pointerEvents: "none",
        backgroundImage: "repeating-radial-gradient(circle at 30% 20%, rgba(110,60,10,0.5) 0 1px, transparent 1px 3px), repeating-radial-gradient(circle at 70% 60%, rgba(110,60,10,0.4) 0 1px, transparent 1px 4px)",
      }}/>
      <div className="container" style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "1.1fr 0.9fr",
        alignItems: "center",
        gap: 32,
        padding: "72px 48px 80px",
        minHeight: 520,
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12,
            letterSpacing: "0.28em", textTransform: "uppercase",
            color: "#6E2A06", marginBottom: 16,
          }}>— Baú #07 · Outubro de 2026 —</div>
          <h1 style={{
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            fontSize: "clamp(56px, 8vw, 88px)", lineHeight: 1.05,
            letterSpacing: "0.03em", textTransform: "uppercase",
            color: "#1A0A02",
            textShadow: "0 1px 0 rgba(255,235,200,0.55)",
            margin: "0 0 18px 0",
          }}>
            Cada figura é{" "}
            <span style={{
              background: "linear-gradient(180deg, #C85800 0%, #962400 50%, #621200 100%)",
              WebkitBackgroundClip: "text", backgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 1px 0 rgba(60,10,0,0.35))",
            }}>uma relíquia.</span>
          </h1>
          <div style={{
            display: "flex", alignItems: "center", gap: 14, marginBottom: 18,
            width: "fit-content",
          }}>
            <span style={{ width: 40, height: 1, background: "linear-gradient(90deg, transparent, #6E2A06)" }}/>
            <span style={{
              fontFamily: '"Archivo Black", "Bebas Neue", sans-serif',
              letterSpacing: "0.24em", fontSize: 14, textTransform: "uppercase",
              color: "#6E2A06",
            }}>Get The Relic.</span>
            <span style={{ width: 40, height: 1, background: "linear-gradient(90deg, #6E2A06, transparent)" }}/>
          </div>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.55, fontWeight: 500,
            color: "#3A1808", maxWidth: 480, margin: 0,
          }}>
            32 peças garimpadas em Tóquio, Hong Kong e Osaka.<br/>
            Numeradas à mão. Sem reposição.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
            <button onClick={onCTA} style={{
              position: "relative", overflow: "hidden",
              fontFamily: '"Archivo Black", "Space Grotesk", system-ui, sans-serif',
              fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase",
              fontSize: 14, padding: "18px 30px",
              color: "#2A0E04",
              textShadow: "0 1px 0 rgba(255,250,210,0.6)",
              background:
                "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(255,255,210,0.9), transparent 60%)," +
                "linear-gradient(180deg, #FFEC00 0%, #FFB800 30%, #FF7A00 70%, #FF4D14 100%)",
              border: "1px solid #B03808",
              borderTopColor: "#FFEC00",
              borderRadius: 3,
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 12,
              lineHeight: 1,
              boxShadow: [
                "inset 0 1px 0 rgba(255,253,210,0.95)",
                "inset 0 -1px 0 rgba(176,56,8,0.65)",
                "inset 0 -12px 22px rgba(255,120,20,0.45)",
                "0 2px 0 #8C2A04",
                "0 8px 18px rgba(60,16,0,0.55)",
                "0 0 0 1px rgba(255,200,80,0.35)",
                "0 0 24px -2px rgba(255,180,0,0.7)",
                "0 0 48px -8px rgba(255,80,0,0.55)",
              ].join(", "),
              transition: "all 220ms cubic-bezier(0.2, 0.7, 0.2, 1)",
            }}>
              <span style={{
                position: "absolute", top: "-50%", bottom: "-50%", width: 36,
                background: "linear-gradient(90deg, transparent, rgba(255,253,210,0.7), transparent)",
                transform: "translateX(-220%) skewX(-22deg)",
                animation: "relicShine 4.6s ease-in-out infinite",
                pointerEvents: "none",
              }}/>
              <span style={{ position: "relative" }}>EXPLORAR O VAULT</span>
              <span style={{ position: "relative", fontSize: 18 }}>→</span>
            </button>
            <button style={{
              fontFamily: '"Bebas Neue", Impact, sans-serif',
              letterSpacing: "0.14em", textTransform: "uppercase",
              fontSize: 17, padding: "16px 26px",
              color: "#6E2A06",
              background: "transparent",
              border: "1.5px solid #6E2A06",
              borderRadius: 2,
              cursor: "pointer",
              lineHeight: 1,
            }}>ENTRAR NA FILA</button>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 12,
            marginTop: 36, padding: "10px 16px",
            border: "1px solid #C42A0A",
            borderRadius: 2,
            background: "rgba(255,90,20,0.12)",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#C42A0A",
                           boxShadow: "0 0 12px #FF5A0E", animation: "pulse 1.8s ease-in-out infinite" }}/>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700,
                           letterSpacing: "0.18em", textTransform: "uppercase", color: "#C42A0A",
                           whiteSpace: "nowrap" }}>AO VIVO</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#3A1808", fontWeight: 500 }}>
              28 caçadores estão olhando o baú agora
            </span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at center, rgba(255,140,42,0.35), transparent 60%)",
            filter: "blur(20px)",
          }}/>
          <img src="assets/relic-logo-chest.png" alt="" style={{
            width: "100%", maxWidth: 460,
            filter: "drop-shadow(0 40px 50px rgba(80,30,0,0.45)) drop-shadow(0 0 60px rgba(255,140,42,0.3))",
            position: "relative",
          }}/>
        </div>
      </div>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes relicShine {
          0%   { transform: translateX(-220%) skewX(-22deg); }
          55%  { transform: translateX(720%)  skewX(-22deg); }
          100% { transform: translateX(720%)  skewX(-22deg); }
        }
      `}</style>
    </section>
  );
}

function CategoryStrip({ onPick }) {
  const cats = [
    { id: "anime", label: "Animes",      glyph: "swords",  count: 142 },
    { id: "games", label: "Video Games", glyph: "compass", count: 96 },
    { id: "movies", label: "Cinema & TV", glyph: "scroll",  count: 38 },
    { id: "rare",  label: "Lendárias",   glyph: "skull",   count: 12, hot: true },
  ];
  return (
    <section style={{ padding: "56px 0", borderBottom: "1px solid var(--line)" }}>
      <div className="container">
        <SectionHeading eyebrow="Mapa do tesouro" title="Onde caçar" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 24 }}>
          {cats.map(c => (
            <a key={c.id} onClick={() => onPick(c.id)} style={{
              position: "relative",
              cursor: "pointer",
              background: "var(--bg-elevated)",
              border: `1px solid ${c.hot ? "var(--gold-400)" : "rgba(244,233,210,0.35)"}`,
              borderRadius: 6,
              padding: "28px 20px",
              display: "flex", alignItems: "center", gap: 16,
              textDecoration: "none",
              boxShadow: c.hot ? "0 0 24px -6px rgba(232,176,40,0.5)" : "var(--shadow-1)",
              transition: "all 200ms cubic-bezier(0.2, 0.7, 0.2, 1)",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 4,
                background: "var(--vault-600)",
                border: `1px solid ${c.hot ? "var(--gold-400)" : "rgba(244,233,210,0.45)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img src={`assets/icons/${c.glyph}.svg`} style={{ width: 28, height: 28 }} />
              </div>
              <div>
                <div style={{
                  fontFamily: '"Bebas Neue", Impact, sans-serif',
                  letterSpacing: "0.08em", fontSize: 22,
                  color: "var(--fg)",
                }}>{c.label}</div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--fg-faint)", letterSpacing: "0.06em",
                }}>{c.count} PEÇAS</div>
              </div>
              {c.hot && <div style={{
                position: "absolute", top: -10, right: 14,
                fontFamily: '"Bebas Neue", Impact, sans-serif',
                fontSize: 11, letterSpacing: "0.18em",
                padding: "3px 8px", borderRadius: 2,
                background: "linear-gradient(180deg, #FFB070 0%, #E0531A 100%)",
                color: "#15110C",
              }}>QUENTE</div>}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
      <div>
        <div style={{
          fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 11,
          letterSpacing: "0.24em", textTransform: "uppercase",
          color: "var(--gold-300)", marginBottom: 8,
        }}>— {eyebrow} —</div>
        <h2 style={{
          fontFamily: '"Bebas Neue", Impact, sans-serif',
          fontSize: 48, lineHeight: 1,
          letterSpacing: "0.03em", textTransform: "uppercase",
          color: "var(--fg)", margin: 0,
        }}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

Object.assign(window, { Hero, CategoryStrip, SectionHeading });
