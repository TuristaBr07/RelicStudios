/* ===== Footer ===== */
function Footer() {
  const cols = [
    { t: "Vault",   links: ["Todas as peças", "Lendárias", "Pré-vendas", "Baús mensais", "Lista de espera"] },
    { t: "Caçada",  links: ["Animes", "Video Games", "Cinema & TV", "Manga", "Anime · Vintage"] },
    { t: "Taverna", links: ["Sobre Relic", "Atelier", "Blog do Caçador", "Carreiras"] },
    { t: "Frota",   links: ["Frete & Prazos", "Trocas & Devoluções", "Pagamento", "Atendimento", "FAQ"] },
  ];
  const socials = [
    { icon: "compass", label: "Instagram" },
    { icon: "scroll",  label: "YouTube" },
    { icon: "skull",   label: "X / Twitter" },
    { icon: "anchor",  label: "Discord" },
  ];
  return (
    <footer style={{
      borderTop: "1px solid var(--gold-400)",
      background: "linear-gradient(180deg, #0F0B07 0%, #0B0907 100%)",
      paddingTop: 56, paddingBottom: 28,
      marginTop: 96,
    }}>
      <div className="container">
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr 1fr", gap: 40, marginBottom: 48 }}>
          <div>
            <img src="assets/wordmark-relic.svg" alt="Relic Studios" style={{ height: 72, marginBottom: 12 }} />
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.6, margin: 0, maxWidth: 280 }}>
              Cada figura é uma relíquia. Garimpadas em Tóquio, Hong Kong e Osaka — entregues no Brasil inteiro.
            </p>
            <nav aria-label="Redes sociais" style={{ display: "flex", gap: 14, marginTop: 18 }}>
              {socials.map(s => (
                <button key={s.icon} aria-label={s.label} style={{
                  background: "transparent", border: "none", padding: 0, cursor: "pointer",
                  display: "inline-flex", borderRadius: 2,
                }}>
                  <img src={`assets/icons/${s.icon}.svg`} alt="" aria-hidden="true"
                       style={{ width: 22, height: 22, opacity: 0.75 }} />
                </button>
              ))}
            </nav>
          </div>
          {cols.map(c => (
            <nav key={c.t} aria-label={`Links: ${c.t}`}>
              <div style={{
                fontFamily: '"Bebas Neue", Impact, sans-serif',
                letterSpacing: "0.16em", fontSize: 16, color: "var(--gold-300)",
                marginBottom: 14,
              }}>{c.t}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {c.links.map(l => (
                  <li key={l}>
                    <button style={{
                      background: "transparent", border: "none", padding: 0, cursor: "pointer",
                      fontFamily: "var(--font-body)", fontSize: 13, color: "var(--parch-100)",
                      textAlign: "left",
                    }}>{l}</button>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div style={{
          paddingTop: 20, borderTop: "1px solid var(--line)",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", letterSpacing: "0.04em" }}>
            © 2026 RELIC STUDIOS · CNPJ 00.000.000/0001-00 · São Paulo, BR
          </div>
          <nav aria-label="Links legais" style={{ display: "flex", gap: 20 }}>
            {["Privacidade","Termos","Política de cookies"].map(l => (
              <button key={l} style={{
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                fontFamily: "var(--font-body)", fontSize: 11, color: "var(--fg-faint)",
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}>{l}</button>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Footer });
