/* ===== Header — sticky top bar ===== */

function Header({ cartCount = 0, onNav, current = "home", onOpenCart }) {
  const links = [
    { id: "vault",   label: "VAULT" },
    { id: "animes",  label: "ANIMES" },
    { id: "games",   label: "GAMES" },
    { id: "drops",   label: "BAÚS" },
    { id: "loja",    label: "TAVERNA" },
  ];
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      background: "rgba(15, 11, 8, 0.78)",
      borderBottom: "1px solid var(--line)",
      height: 72,
      display: "flex", alignItems: "center",
    }}>
      <div className="container" style={{ display: "flex", alignItems: "center", gap: 24, width: "100%" }}>
        <a onClick={() => onNav("home")} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textDecoration: "none" }}>
          <img src="assets/relic-logo-chest.png" alt="Relic" style={{ height: 44, marginTop: 2 }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{
              fontFamily: '"Bebas Neue", Impact, sans-serif',
              fontSize: 26, letterSpacing: "0.08em",
              background: "linear-gradient(180deg, #FBEFC9 0%, #F2C95B 40%, #C68A14 100%)",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>RELIC</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.34em",
              color: "var(--parch-200)", marginTop: 2,
            }}>— STUDIOS —</span>
          </div>
        </a>

        <nav style={{ display: "flex", gap: 4, marginLeft: 24 }}>
          {links.map(l => {
            const active = l.id === current;
            return (
              <a key={l.id} onClick={() => onNav(l.id)} style={{
                fontFamily: '"Bebas Neue", Impact, sans-serif',
                letterSpacing: "0.14em",
                fontSize: 15,
                padding: "8px 14px",
                color: active ? "var(--gold-200)" : "var(--parch-100)",
                textDecoration: "none",
                cursor: "pointer",
                borderRadius: 2,
                borderBottom: active ? "2px solid var(--gold-300)" : "2px solid transparent",
              }}>{l.label}</a>
            );
          })}
        </nav>

        <div style={{ marginLeft: "auto", position: "relative", width: 280 }}>
          <input placeholder="Buscar relíquias..." style={{
            width: "100%",
            background: "var(--vault-900)",
            border: "1px solid var(--line-strong)",
            borderRadius: 2,
            color: "var(--fg)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            padding: "10px 12px 10px 36px",
            outline: "none",
            boxSizing: "border-box",
          }} />
          <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}>
            <Icon name="search" size={16} color="var(--pewter-200)" />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <IconButton title="Conta" onClick={() => {}}><Icon name="user" size={18} color="var(--parch-100)" /></IconButton>
          <IconButton title="Lista de desejos" onClick={() => {}}><Icon name="heart" size={18} color="var(--parch-100)" /></IconButton>
          <button onClick={onOpenCart} style={{
            position: "relative",
            background: "transparent",
            border: "1px solid var(--gold-400)",
            borderRadius: 2,
            padding: "8px 14px",
            display: "inline-flex", alignItems: "center", gap: 8,
            cursor: "pointer",
            color: "var(--gold-200)",
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            letterSpacing: "0.14em", fontSize: 14,
          }}>
            <Icon name="bag" size={16} color="var(--gold-200)" />
            BAÚ
            {cartCount > 0 && <span style={{
              background: "var(--gold-300)", color: "var(--vault-900)",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              padding: "2px 6px", borderRadius: 999, marginLeft: 2,
            }}>{cartCount}</span>}
          </button>
        </div>
      </div>
    </header>
  );
}

function IconButton({ children, title, onClick }) {
  return (
    <button title={title} onClick={onClick} style={{
      background: "transparent", border: "none", padding: 10,
      cursor: "pointer", borderRadius: 2, display: "inline-flex", alignItems: "center",
    }}>{children}</button>
  );
}

Object.assign(window, { Header });
