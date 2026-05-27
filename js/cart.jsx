/* ===== Cart — slide-over drawer ===== */

function CartDrawer({ open, items, onClose, onRemove, onQty, onCheckout }) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const freeShip = subtotal >= 499;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      pointerEvents: open ? "auto" : "none",
    }}>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.7)",
        opacity: open ? 1 : 0,
        transition: "opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1)",
      }} />
      <aside style={{
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: 440,
        background: "linear-gradient(180deg, #15110C 0%, #1F1812 100%)",
        borderLeft: "1px solid var(--gold-400)",
        boxShadow: "var(--shadow-3)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1)",
        display: "flex", flexDirection: "column",
      }}>
        <header style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <img src="assets/icons/chest.svg" style={{ width: 28, height: 28 }} />
          <h3 style={{
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            letterSpacing: "0.1em", fontSize: 24, margin: 0, color: "var(--fg)",
          }}>SEU BAÚ <span style={{ color: "var(--fg-faint)", fontSize: 16 }}>({items.length})</span></h3>
          <button onClick={onClose} style={{
            marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer",
            color: "var(--parch-100)", padding: 6,
          }}>
            <Icon name="close" size={20} color="var(--parch-100)" />
          </button>
        </header>

        <div style={{ padding: "14px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <img src="assets/icons/anchor.svg" style={{ width: 16, height: 16 }} />
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg-muted)" }}>
              {freeShip
                ? <><b style={{ color: "var(--gold-200)" }}>Frete-tesouro liberado!</b> Bom saque, caçador.</>
                : <>Falta <b style={{ color: "var(--gold-200)" }}>{brl(499 - subtotal)}</b> para o frete grátis.</>}
            </div>
          </div>
          <div style={{ height: 4, borderRadius: 1, background: "var(--vault-900)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, (subtotal / 499) * 100)}%`,
              background: "linear-gradient(90deg, #F2C95B, #FF8A2A)",
              transition: "width 300ms",
            }}/>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {items.length === 0 ? (
            <EmptyCart />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map(i => (
                <div key={i.id} style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr auto",
                  gap: 12, padding: 10,
                  background: "var(--vault-800)",
                  border: "1px solid var(--line)",
                  borderRadius: 4,
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 3,
                    background: i.image ? "#0E1219" : "linear-gradient(180deg, #2A323F 0%, #0E1219 100%)",
                    border: "1px solid var(--pewter-400)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", flexShrink: 0,
                  }}>
                    {i.image
                      ? <img src={i.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      : <Silhouette seed={i.seed} glow={i.silhouetteGlow} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-faint)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {i.franchise}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 13, color: "var(--fg)", lineHeight: 1.3, marginTop: 2 }}>
                      {i.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <MiniQty value={i.qty} onChange={v => onQty(i, v)} />
                      <button onClick={() => onRemove(i)} style={{
                        background: "transparent", border: "none", padding: 0, cursor: "pointer",
                        fontFamily: "var(--font-body)", fontSize: 11, color: "var(--fg-faint)",
                        letterSpacing: "0.06em", textTransform: "uppercase",
                      }}>Remover</button>
                    </div>
                  </div>
                  <div style={{
                    fontFamily: '"Bebas Neue", Impact, sans-serif',
                    fontSize: 18, color: "var(--gold-200)",
                    letterSpacing: "0.04em", whiteSpace: "nowrap",
                  }}>{brl(i.price * i.qty)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <footer style={{
            padding: "16px 24px 24px",
            borderTop: "1px solid var(--line)",
            background: "rgba(11, 9, 7, 0.6)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-muted)" }}>Subtotal</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg)" }}>{brl(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-muted)" }}>Frete</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13,
                              color: freeShip ? "var(--gold-200)" : "var(--fg)" }}>
                {freeShip ? "Grátis" : "Calculado no checkout"}
              </span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              padding: "12px 0", borderTop: "1px solid var(--line)",
              marginBottom: 16,
            }}>
              <span style={{
                fontFamily: '"Bebas Neue", Impact, sans-serif',
                letterSpacing: "0.12em", fontSize: 18, color: "var(--fg)",
              }}>TOTAL</span>
              <span style={{
                fontFamily: '"Bebas Neue", Impact, sans-serif',
                fontSize: 32, letterSpacing: "0.03em",
                color: "var(--gold-200)",
              }}>{brl(subtotal)}</span>
            </div>
            <Button variant="primary" size="lg" style={{ width: "100%" }} onClick={onCheckout}>
              IR AO CHECKOUT →
            </Button>
            <button onClick={onClose} style={{
              width: "100%", marginTop: 10,
              background: "transparent", border: "none", padding: 8, cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg-faint)",
              letterSpacing: "0.14em", textTransform: "uppercase",
            }}>continuar caçando</button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function MiniQty({ value, onChange }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center",
      border: "1px solid var(--line-strong)", borderRadius: 2,
      background: "var(--vault-900)",
    }}>
      <button onClick={() => onChange(Math.max(1, value - 1))} style={miniBtn}>−</button>
      <span style={{
        padding: "0 10px", minWidth: 22, textAlign: "center",
        fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--gold-200)",
      }}>{value}</span>
      <button onClick={() => onChange(value + 1)} style={miniBtn}>+</button>
    </div>
  );
}
const miniBtn = {
  background: "transparent", border: "none", padding: "4px 8px",
  cursor: "pointer", color: "var(--parch-100)",
  fontFamily: "var(--font-body)", fontSize: 12,
};

function EmptyCart() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
      padding: "48px 16px", gap: 12,
    }}>
      <img src="assets/icons/chest.svg" style={{ width: 64, height: 64, opacity: 0.35 }} />
      <div style={{
        fontFamily: '"Bebas Neue", Impact, sans-serif',
        letterSpacing: "0.1em", fontSize: 22, color: "var(--fg)",
      }}>BAÚ VAZIO, CAPITÃO</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-muted)", maxWidth: 280 }}>
        Volte ao vault e escolha sua próxima relíquia.
      </div>
    </div>
  );
}

Object.assign(window, { CartDrawer });
