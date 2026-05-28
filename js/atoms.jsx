/* ===== Atoms: Button, TierChip, StatusPill, Icon, Glyph, Silhouette, ProductStage, brl ===== */
const { useState } = React;

function Button({ variant = "primary", size = "md", icon, children, onClick, type = "button", style, disabled }) {
  const base = {
    border: "1px solid transparent",
    borderRadius: 2,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "all 200ms cubic-bezier(0.2, 0.7, 0.2, 1)",
    whiteSpace: "nowrap",
    userSelect: "none",
    lineHeight: 1,
  };
  const grotesk = {
    fontFamily: '"Space Grotesk", system-ui, sans-serif',
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  };
  const bebas = {
    fontFamily: '"Bebas Neue", Impact, sans-serif',
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  };
  const sizes = {
    sm: { padding: "10px 14px", fontSize: 11 },
    md: { padding: "14px 22px", fontSize: 13 },
    lg: { padding: "16px 28px", fontSize: 15 },
  };
  const sizesBebas = {
    sm: { padding: "8px 14px", fontSize: 13 },
    md: { padding: "12px 22px", fontSize: 16 },
    lg: { padding: "16px 28px", fontSize: 20 },
  };
  const variants = {
    primary: {
      ...grotesk,
      letterSpacing: "0.18em",
      color: "#1A0B02",
      textShadow: "0 1px 0 rgba(255,235,180,0.55)",
      background:
        "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(255,250,210,0.85), transparent 60%)," +
        "linear-gradient(180deg, #FFE48A 0%, #F2B935 30%, #E07A12 60%, #B0420A 90%, #6E2606 100%)",
      borderColor: "#4A1A04",
      borderTopColor: "#FFE48A",
      boxShadow: [
        "inset 0 1px 0 rgba(255,248,210,0.95)",
        "inset 0 -1px 0 rgba(50,16,4,0.6)",
        "inset 0 -10px 18px rgba(255,120,30,0.55)",
        "inset 0 -22px 32px rgba(110,38,6,0.5)",
        "0 2px 0 #2A0E04",
        "0 6px 12px rgba(0,0,0,0.55)",
        "0 0 0 1px rgba(255,160,60,0.25)",
        "0 0 18px -2px rgba(255,140,42,0.7)",
        "0 0 32px -6px rgba(232,110,30,0.6)",
      ].join(", "),
    },
    ember: {
      ...grotesk,
      letterSpacing: "0.18em",
      color: "#1A0B02",
      textShadow: "0 1px 0 rgba(255,230,180,0.6)",
      background:
        "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(255,240,210,0.85), transparent 60%)," +
        "linear-gradient(180deg, #FFD08A 0%, #FF8A2A 35%, #DD3C12 78%, #6E1604 100%)",
      borderColor: "#3A0D04",
      borderTopColor: "#FFD08A",
      boxShadow: [
        "inset 0 1px 0 rgba(255,240,210,0.95)",
        "inset 0 -1px 0 rgba(40,8,2,0.6)",
        "inset 0 -10px 18px rgba(255,90,20,0.55)",
        "inset 0 -22px 32px rgba(110,22,4,0.5)",
        "0 2px 0 #1A0604",
        "0 6px 12px rgba(0,0,0,0.55)",
        "0 0 0 1px rgba(255,140,60,0.3)",
        "0 0 22px -2px rgba(255,90,20,0.8)",
        "0 0 40px -6px rgba(220,40,10,0.55)",
      ].join(", "),
    },
    secondary: {
      ...bebas,
      background: "transparent",
      color: "var(--gold-200)",
      borderColor: "var(--gold-400)",
    },
    ghost: {
      ...bebas,
      background: "transparent",
      color: "var(--parch-100)",
      borderColor: "var(--line-strong)",
    },
    disabled: {
      ...bebas,
      background: "var(--pewter-400)",
      color: "var(--pewter-200)",
      borderColor: "var(--pewter-400)",
    },
  };
  const v = disabled ? variants.disabled : variants[variant];
  const useGrotesk = !disabled && (variant === "primary" || variant === "ember");
  const sz = useGrotesk ? sizes[size] : sizesBebas[size];
  return (
    <button type={type} onClick={disabled ? undefined : onClick} disabled={disabled}
            style={{ ...base, ...sz, ...v, ...style }}>
      {icon && <span style={{ display: "inline-flex", marginRight: -2 }}>{icon}</span>}
      {children}
    </button>
  );
}

const TIER_STYLES = {
  comum:    { bg: "rgba(95,106,126,0.18)", border: "#5F6A7E", color: "#C1C8D4", flat: true },
  raro:     { bg: "rgba(79,175,176,0.15)", border: "#4FAFB0", color: "#9FE2DD", flat: true },
  epico:    { bg: "rgba(161,86,232,0.15)", border: "#A156E8", color: "#D7B5FF", flat: true },
  lendaria: {
    bg: "linear-gradient(180deg, #FBEFC9 0%, #F2C95B 28%, #E89028 62%, #A04A0A 100%)",
    border: "#4A1A04", color: "#1A0B02",
    shadow: "inset 0 1px 0 rgba(255,250,210,0.85), inset 0 -8px 14px rgba(168,80,16,0.55), 0 1px 0 #2A0E04, 0 0 18px -2px rgba(255,140,42,0.65), 0 0 28px -6px rgba(232,176,40,0.5)",
    textShadow: "0 1px 0 rgba(255,240,200,0.55)",
  },
};

function TierChip({ tier = "raro", style }) {
  const t = TIER_STYLES[tier] || TIER_STYLES.raro;
  const labels = { comum: "Comum", raro: "Raro", epico: "Épico", lendaria: "★ Lendária" };
  return (
    <span style={{
      position: "relative",
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      fontSize: 11,
      padding: "5px 11px",
      borderRadius: 2,
      border: `1px solid ${t.border}`,
      background: t.bg,
      color: t.color,
      lineHeight: 1,
      boxShadow: t.shadow || "none",
      textShadow: t.textShadow || "none",
      whiteSpace: "nowrap",
      overflow: "hidden",
      ...style,
    }}>
      {!t.flat && <span style={{
        position: "absolute", inset: "1px 2px auto 2px", height: "38%",
        borderRadius: "1px 1px 0 0",
        background: "linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0) 100%)",
        pointerEvents: "none",
      }}/>}
      <span style={{ position: "relative" }}>{labels[tier]}</span>
    </span>
  );
}

function StatusPill({ status = "success", children }) {
  const s = {
    success: { bg: "rgba(123,174,79,0.18)", color: "#B6D595", border: "rgba(123,174,79,0.45)" },
    warning: { bg: "rgba(232,176,40,0.18)", color: "#F7DD8E", border: "rgba(232,176,40,0.5)" },
    danger:  { bg: "rgba(196,50,26,0.18)", color: "#F0A696", border: "rgba(196,50,26,0.55)" },
    info:    { bg: "rgba(94,143,168,0.18)", color: "#BCD4E0", border: "rgba(94,143,168,0.45)" },
  }[status];
  return (
    <span style={{
      fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
      padding: "4px 10px", borderRadius: 999,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor",
                     boxShadow: status === "warning" ? "0 0 8px currentColor" : "none" }} />
      {children}
    </span>
  );
}

function Icon({ name, size = 20, color = "currentColor", strokeWidth = 1.75 }) {
  const paths = {
    search:  <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    bag:     <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    heart:   <path d="M20.84 4.6a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.07a5.5 5.5 0 0 0-7.78 7.78l1.06 1.07L12 21.23l7.78-7.78 1.06-1.07a5.5 5.5 0 0 0 0-7.78z"/>,
    filter:  <><path d="M3 6h18M6 12h12M10 18h4"/></>,
    user:    <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    right:   <path d="M9 18l6-6-6-6"/>,
    left:    <path d="M15 18l-6-6 6-6"/>,
    close:   <><path d="M18 6 6 18M6 6l12 12"/></>,
    plus:    <><path d="M12 5v14M5 12h14"/></>,
    minus:   <path d="M5 12h14"/>,
    check:   <path d="M5 13l4 4L19 7"/>,
    truck:   <><path d="M3 7h13v10H3z"/><path d="M16 10h4l2 3v4h-6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
    shield:  <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z"/>,
    star:    <path d="M12 3l2.6 5.6 6 .9-4.4 4.2 1 6.1L12 17l-5.3 2.8 1-6.1L3.4 9.5l6-.9z"/>,
    menu:    <><path d="M3 6h18M3 12h18M3 18h18"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0 }}>{paths[name]}</svg>
  );
}

function Glyph({ name, size = 20, style }) {
  return (
    <img src={`assets/icons/${name}.svg`} width={size} height={size} alt="" style={style} />
  );
}

function Silhouette({ seed = 0, glow = "rgba(232,176,40,0.25)" }) {
  const shapes = [
    "polygon(42% 0, 58% 0, 68% 22%, 64% 36%, 78% 64%, 86% 100%, 14% 100%, 22% 64%, 36% 36%, 32% 22%)",
    "polygon(38% 0, 62% 0, 72% 28%, 68% 48%, 82% 78%, 78% 100%, 22% 100%, 18% 78%, 32% 48%, 28% 28%)",
    "polygon(45% 0, 55% 0, 70% 18%, 60% 34%, 84% 60%, 80% 100%, 20% 100%, 16% 60%, 40% 34%, 30% 18%)",
    "polygon(40% 0, 60% 0, 66% 30%, 60% 50%, 76% 70%, 80% 100%, 20% 100%, 24% 70%, 40% 50%, 34% 30%)",
  ];
  return (
    <div style={{
      width: "55%", height: "78%",
      background: "linear-gradient(180deg, #6B4A30 0%, #3A2018 100%)",
      clipPath: shapes[seed % shapes.length],
      boxShadow: `0 0 40px ${glow}`,
    }}/>
  );
}

function ProductStage({ children, image, glow = "rgba(232,176,40,0.18)" }) {
  return (
    <div style={{
      width: "100%", aspectRatio: "1",
      borderRadius: 4,
      background: image ? "#0B0907" : `
        radial-gradient(ellipse at 50% 30%, rgba(255,176,112,0.28), transparent 65%),
        radial-gradient(ellipse at 50% 50%, ${glow}, transparent 70%),
        linear-gradient(180deg, #2A2018 0%, #0E0B07 100%)
      `,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "1px solid rgba(232,176,40,0.18)",
      position: "relative", overflow: "hidden",
    }}>
      {image ? (
        <img src={image} alt="" style={{
          width: "100%", height: "100%", objectFit: "cover", display: "block",
        }}/>
      ) : (
        <>
          {children}
          <div style={{
            position: "absolute", left: "10%", right: "10%", bottom: "4%", height: "8%",
            background: "radial-gradient(ellipse at center top, rgba(255,140,42,0.5), transparent 70%)",
            filter: "blur(4px)",
          }}/>
        </>
      )}
    </div>
  );
}

function brl(value) {
  return "R$ " + value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Object.assign(window, { Button, TierChip, StatusPill, Icon, Glyph, Silhouette, ProductStage, brl });
