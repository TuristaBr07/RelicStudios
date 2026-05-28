/* ===== QuickBuyModal — fast purchase from grid hover ===== */

function QuickBuyModal({ open, product, onClose, onAdd }) {
  const [qty, setQty] = React.useState(1);
  const modalRef = React.useRef(null);
  const titleId = "qb-title";

  useFocusTrap(modalRef, open);

  React.useEffect(() => { if (open) setQty(1); }, [open, product]);

  React.useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!product) return null;
  const lowStock = product.stock > 0 && product.stock <= 5;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 110,
      pointerEvents: open ? "auto" : "none",
    }}>
      <div onClick={onClose} aria-hidden="true" style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.75)",
        opacity: open ? 1 : 0,
        transition: "opacity 220ms cubic-bezier(0.2, 0.7, 0.2, 1)",
      }}/>
      <div ref={modalRef}
           role="dialog"
           aria-modal="true"
           aria-labelledby={titleId}
           style={{
             position: "absolute", left: "50%", top: "50%",
             transform: open ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.96)",
             opacity: open ? 1 : 0,
             transition: "all 240ms cubic-bezier(0.2, 0.7, 0.2, 1)",
             width: "min(940px, calc(100vw - 48px))",
             maxHeight: "calc(100vh - 64px)",
             background: "linear-gradient(180deg, #1F1812 0%, #15110C 100%)",
             border: "1px solid var(--gold-400)", borderRadius: 6,
             boxShadow: "var(--shadow-3), 0 0 0 1px var(--gold-400), 0 0 80px -20px rgba(232,176,40,0.45)",
             overflow: "hidden",
             display: "grid", gridTemplateColumns: "1fr 1fr",
           }}>

        <button onClick={onClose} aria-label="Fechar visão rápida" style={{
          position: "absolute", top: 14, right: 14, zIndex: 2,
          width: 36, height: 36, borderRadius: 2,
          background: "rgba(11,9,7,0.7)", border: "1px solid var(--line-strong)",
          cursor: "pointer", color: "var(--parch-100)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name="close" size={18} color="var(--parch-100)" />
        </button>

        <div style={{ padding: 16 }}>
          <ProductStage image={product.image} glow={product.glow} alt={product.name}>
            <Silhouette seed={product.seed} glow={product.silhouetteGlow} />
          </ProductStage>
        </div>

        <div style={{ padding: "28px 28px 24px", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: "var(--parch-300)", letterSpacing: "0.08em", textTransform: "uppercase",
            marginBottom: 8,
          }}>
            <span>{product.franchise}</span>
            <span aria-label={`Escala ${product.scale}`} style={{
              background: "var(--vault-900)", color: "var(--gold-200)",
              border: "1px solid var(--gold-500)",
              padding: "2px 7px", borderRadius: 2,
            }}>{product.scale}</span>
            <span><span className="visually-hidden">SKU:</span> {product.sku}</span>
          </div>

          <h2 id={titleId} style={{
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            fontSize: 36, lineHeight: 1.05, letterSpacing: "0.03em", textTransform: "uppercase",
            color: "var(--fg)", margin: "0 0 12px",
          }}>{product.name}</h2>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <TierChip tier={product.tier} />
            {product.stock === 0
              ? <StatusPill status="danger">ESGOTADO</StatusPill>
              : lowStock
                ? <StatusPill status="warning">ÚLTIMAS {product.stock} UNIDADES</StatusPill>
                : <StatusPill status="success">EM ESTOQUE</StatusPill>}
          </div>

          <p style={{
            fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55,
            color: "var(--fg-muted)", margin: "0 0 18px",
          }}>{product.description}</p>

          <dl style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, margin: "0 0 22px",
            border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden",
            background: "var(--vault-800)",
          }}>
            {[
              ["Escala", product.scale],
              ["Altura", product.height],
              ["Materiais", product.materials],
              ["Edição", `${product.editionNumber} / ${product.editionOf}`],
            ].map(([k, v], i) => (
              <div key={k} style={{
                padding: "10px 12px",
                borderBottom: i < 2 ? "1px solid var(--line)" : "none",
                borderRight: i % 2 === 0 ? "1px solid var(--line)" : "none",
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <dt style={{
                  fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600,
                  letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold-300)",
                }}>{k}</dt>
                <dd style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg)", margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>

          <div style={{
            display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16,
            paddingBottom: 16, borderBottom: "1px solid var(--line)",
          }}>
            <div style={{
              fontFamily: '"Bebas Neue", Impact, sans-serif',
              letterSpacing: "0.03em", fontSize: 44, color: "var(--gold-200)", lineHeight: 1,
            }}>{brl(product.price)}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--parch-300)" }}>
              12× {brl(product.price / 12)} sem juros
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <QtyStepper value={qty} onChange={setQty} max={Math.max(product.stock, 1)} />
            <Button variant="primary" size="md" style={{ flex: 1 }}
                    onClick={() => { onAdd(product, qty); onClose(); }}
                    disabled={product.stock === 0}>
              <Icon name="bag" size={16} color="#2A0E04" />
              ADICIONAR AO BAÚ
            </Button>
          </div>
          <Button variant="ghost" size="md" style={{ width: "100%", marginTop: 8 }}>
            VER FICHA COMPLETA →
          </Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { QuickBuyModal });
