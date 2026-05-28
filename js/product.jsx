/* ===== ProductPage — detail view ===== */

function ProductPage({ product, onBack, onAdd }) {
  const [tab, setTab] = React.useState("desc");
  const [qty, setQty] = React.useState(1);
  return (
    <section style={{ padding: "32px 0 80px" }}>
      <div className="container">
        <button onClick={onBack} style={{
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
          color: "var(--gold-200)",
          fontFamily: '"Bebas Neue", Impact, sans-serif',
          letterSpacing: "0.14em", fontSize: 14,
          display: "inline-flex", alignItems: "center", gap: 8,
          marginBottom: 24,
        }}>
          <Icon name="left" size={14} color="var(--gold-200)" />
          VOLTAR AO VAULT
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 48 }}>
          {/* Gallery */}
          <div>
            <div style={{ position: "relative" }}>
              <ProductStage image={product.image} glow={product.glow}>
                <Silhouette seed={product.seed} glow={product.silhouetteGlow} />
              </ProductStage>
              {product.badge && (
                <div style={{
                  position: "absolute", top: 16, left: 16,
                  fontFamily: '"Bebas Neue", Impact, sans-serif',
                  letterSpacing: "0.16em", fontSize: 12,
                  padding: "4px 10px", borderRadius: 2,
                  background: "linear-gradient(180deg, #F2C95B 0%, #C68A14 100%)",
                  color: "#15110C",
                }}>{product.badge}</div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  aspectRatio: "1", borderRadius: 4,
                  border: i === 0 ? "1px solid var(--gold-300)" : "1px solid rgba(232,176,40,0.25)",
                  background: "linear-gradient(180deg, #2C2218 0%, #0B0907 100%)",
                  opacity: i === 0 ? 1 : 0.7,
                }}/>
              ))}
            </div>
          </div>

          {/* Buy panel */}
          <div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: "var(--parch-300)", letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: 8,
            }}>{product.franchise} · SKU {product.sku}</div>
            <h1 style={{
              fontFamily: '"Bebas Neue", Impact, sans-serif',
              fontSize: 56, lineHeight: 0.96,
              letterSpacing: "0.03em", textTransform: "uppercase",
              color: "var(--fg)", margin: "0 0 12px",
            }}>{product.name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
              <TierChip tier={product.tier} />
              {product.stock > 0 && product.stock <= 5
                ? <StatusPill status="warning">ÚLTIMAS {product.stock} UNIDADES</StatusPill>
                : product.stock > 0
                  ? <StatusPill status="success">EM ESTOQUE</StatusPill>
                  : <StatusPill status="danger">ESGOTADO</StatusPill>}
              {product.editionOf && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  background: "var(--vault-900)", color: "var(--gold-200)",
                  border: "1px solid var(--gold-500)",
                  padding: "4px 8px", borderRadius: 2, letterSpacing: "0.04em",
                }}>EDIÇÃO {String(product.editionNumber).padStart(3, "0")} / {product.editionOf}</span>
              )}
            </div>

            {/* Price panel */}
            <div style={{
              background: "var(--vault-800)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: 20,
              boxShadow: "var(--shadow-1)",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <div style={{
                  fontFamily: '"Bebas Neue", Impact, sans-serif',
                  letterSpacing: "0.03em", fontSize: 56, color: "var(--gold-200)", lineHeight: 1,
                }}>{brl(product.price)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--parch-300)" }}>
                  ou 12× {brl(product.price / 12)} sem juros
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
                <QtyStepper value={qty} onChange={setQty} max={Math.max(product.stock, 1)} />
                <Button variant="primary" size="lg" style={{ flex: 1 }}
                        onClick={() => onAdd(product, qty)}
                        disabled={product.stock === 0}>
                  <Icon name="bag" size={18} color="#15110C" />
                  ADICIONAR AO BAÚ
                </Button>
              </div>
              <Button variant="ghost" style={{ width: "100%", marginTop: 10 }}>
                <Icon name="heart" size={16} color="var(--parch-100)" />
                SALVAR NA LISTA
              </Button>

              <div style={{
                display: "flex", gap: 12, alignItems: "center",
                marginTop: 18, padding: "12px 14px",
                background: "var(--vault-900)",
                border: "1px solid var(--line)",
                borderRadius: 4,
              }}>
                <img src="assets/icons/anchor.svg" style={{ width: 22, height: 22 }} />
                <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-muted)" }}>
                  <b style={{ color: "var(--gold-200)" }}>Frete-tesouro grátis</b> · São Paulo · entrega entre 5 e 8 dias úteis
                </div>
              </div>
            </div>

            {/* Stat block */}
            <div style={{ marginTop: 28 }}>
              <Tabs current={tab} onChange={setTab}
                    tabs={[{ id: "desc", label: "Sobre a relíquia" },
                           { id: "stat", label: "Stat block" },
                           { id: "ship", label: "Envio" }]} />
              <div style={{ padding: "16px 0", color: "var(--fg-muted)", fontSize: 14, lineHeight: 1.6 }}>
                {tab === "desc" && <p style={{ margin: 0 }}>{product.description}</p>}
                {tab === "stat" && <StatBlock product={product} />}
                {tab === "ship" && <ShipBlock />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function QtyStepper({ value, onChange, max = 10 }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center",
      border: "1px solid var(--line-strong)", borderRadius: 2,
      background: "var(--vault-900)",
    }}>
      <button onClick={() => onChange(Math.max(1, value - 1))} style={stepBtn}>
        <Icon name="minus" size={16} color="var(--parch-100)" />
      </button>
      <span style={{
        padding: "0 14px", minWidth: 32, textAlign: "center",
        fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--gold-200)",
      }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} style={stepBtn}>
        <Icon name="plus" size={16} color="var(--parch-100)" />
      </button>
    </div>
  );
}
const stepBtn = {
  background: "transparent", border: "none", padding: "12px 12px",
  cursor: "pointer", display: "inline-flex", alignItems: "center",
};

function Tabs({ tabs, current, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--line)" }}>
      {tabs.map(t => {
        const active = t.id === current;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            background: "transparent", border: "none", padding: "12px 18px 14px 0",
            marginRight: 18, cursor: "pointer",
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            letterSpacing: "0.14em", fontSize: 15,
            color: active ? "var(--gold-200)" : "var(--fg-muted)",
            borderBottom: active ? "2px solid var(--gold-300)" : "2px solid transparent",
            marginBottom: -1,
          }}>{t.label}</button>
        );
      })}
    </div>
  );
}

function StatBlock({ product }) {
  const stats = [
    { k: "Escala",       v: product.scale || "1/6" },
    { k: "Altura",       v: product.height || "32 cm" },
    { k: "Materiais",    v: product.materials || "PVC, ABS, metal fundido" },
    { k: "Articulações", v: product.joints || "32 pontos" },
    { k: "Acessórios",   v: product.accessories || "Espada, capa, baú" },
    { k: "Origem",       v: product.origin || "Tokyo, JP" },
    { k: "Fabricante",   v: product.maker || "Forge Atelier" },
    { k: "Peso",         v: product.weight || "1.4 kg" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0,
                  border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
      {stats.map((s, i) => (
        <div key={s.k} style={{
          padding: "12px 14px",
          background: i % 2 === 0 ? "var(--vault-800)" : "var(--vault-700)",
          borderBottom: i < stats.length - 2 ? "1px solid var(--line)" : "none",
          borderRight: i % 2 === 0 ? "1px solid var(--line)" : "none",
          display: "flex", justifyContent: "space-between", gap: 12,
        }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
                         letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold-300)" }}>{s.k}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg)" }}>{s.v}</span>
        </div>
      ))}
    </div>
  );
}

function ShipBlock() {
  const rows = [
    { icon: "anchor", t: "Frete-tesouro grátis", s: "Acima de R$ 499. Brasil inteiro." },
    { icon: "scroll", t: "Despacho em 72h",       s: "Embalagem reforçada com proteção em espuma." },
    { icon: "chest",  t: "Baú de presente",        s: "Acompanha caixa colecionável numerada." },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map(r => (
        <div key={r.t} style={{
          display: "flex", gap: 14, padding: "12px 14px",
          border: "1px solid var(--line)", borderRadius: 4,
          background: "var(--vault-800)",
        }}>
          <img src={`assets/icons/${r.icon}.svg`} style={{ width: 24, height: 24, flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 13, color: "var(--gold-200)" }}>{r.t}</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{r.s}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { ProductPage, QtyStepper });
