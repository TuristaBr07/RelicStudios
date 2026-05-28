/* ===== ProductCard, ProductGrid, Filters, SortBar ===== */

function ProductCard({ product, onOpen, onAdd, onQuickView }) {
  const [hover, setHover] = React.useState(false);
  const featured = product.tier === "lendaria";

  const handleActivate = () => onOpen(product);
  const handleKeyDown  = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); }
  };

  return (
    <article
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`${product.name} — ${brl(product.price)}`}
      style={{
        background: "linear-gradient(180deg, #2A2018 0%, #1A140E 100%)",
        border: `1px solid ${featured ? "var(--gold-400)" : (hover ? "var(--gold-400)" : "rgba(232,176,40,0.40)")}`,
        borderRadius: 6, padding: 14,
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: featured
          ? "0 0 0 1px var(--gold-400), 0 0 36px -8px rgba(232,176,40,0.55), var(--shadow-1), inset 0 1px 0 rgba(255,220,140,0.08)"
          : (hover
              ? "var(--shadow-2), inset 0 1px 0 rgba(255,220,140,0.08), 0 0 24px -8px rgba(232,176,40,0.25)"
              : "var(--shadow-1), inset 0 1px 0 rgba(255,220,140,0.04)"),
        position: "relative", cursor: "pointer",
        transition: "all 200ms cubic-bezier(0.2, 0.7, 0.2, 1)",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
      }}>

      {product.badge && (
        <div aria-label={product.badge} style={{
          position: "absolute", top: 12, left: 12, zIndex: 2,
          fontFamily: '"Bebas Neue", Impact, sans-serif',
          letterSpacing: "0.16em", fontSize: 11,
          padding: "3px 8px", borderRadius: 2,
          background: "linear-gradient(180deg, #F2C95B 0%, #C68A14 100%)",
          color: "#15110C",
        }}>{product.badge}</div>
      )}

      <ProductStage image={product.image} glow={product.glow} alt={product.name}>
        <Silhouette seed={product.seed} glow={product.silhouetteGlow} />
      </ProductStage>

      {onQuickView && (
        <button
          onClick={(e) => { e.stopPropagation(); onQuickView(product); }}
          aria-label={`Visão rápida de ${product.name}`}
          style={{
            position: "absolute", top: 14, right: 14, zIndex: 2,
            opacity: hover ? 1 : 0,
            transform: hover ? "translateY(0)" : "translateY(-4px)",
            transition: "all 200ms cubic-bezier(0.2, 0.7, 0.2, 1)",
            background: "rgba(11,9,7,0.85)", backdropFilter: "blur(6px)",
            color: "var(--gold-200)", border: "1px solid var(--gold-400)",
            borderRadius: 2, padding: "7px 12px", cursor: "pointer",
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            letterSpacing: "0.14em", fontSize: 11,
            display: "inline-flex", alignItems: "center", gap: 6, lineHeight: 1,
          }}>
          <Icon name="search" size={12} color="var(--gold-200)" strokeWidth={2} />
          VISÃO RÁPIDA
        </button>
      )}

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        fontFamily: "var(--font-mono)", fontSize: 10,
        color: "var(--parch-300)", letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.franchise}</span>
        <span aria-label={`Escala ${product.scale}`} style={{
          flexShrink: 0, background: "var(--vault-900)", color: "var(--gold-200)",
          border: "1px solid var(--gold-500)", padding: "2px 7px", borderRadius: 2,
        }}>{product.scale}</span>
      </div>

      <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15, color: "var(--fg)", lineHeight: 1.25 }}>
        {product.name}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: "auto" }}>
        <div>
          <div style={{
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            letterSpacing: "0.04em", fontSize: 28, color: "var(--gold-200)", lineHeight: 1,
          }}>{brl(product.price)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--parch-300)", marginTop: 2 }}>
            12× {brl(product.price / 12)}
          </div>
        </div>
        <TierChip tier={product.tier} />
      </div>

      {product.editionOf && (
        <div aria-label={`Edição ${product.editionNumber} de ${product.editionOf}`} style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--gold-200)", letterSpacing: "0.06em",
          borderTop: "1px solid var(--line)", paddingTop: 8,
        }}>EDIÇÃO {String(product.editionNumber).padStart(3, "0")} / {product.editionOf}</div>
      )}
    </article>
  );
}

function ProductGrid({ products, onOpen, onAdd, onQuickView }) {
  return (
    <div className="grid-products">
      {products.map(p => (
        <ProductCard key={p.id} product={p} onOpen={onOpen} onAdd={onAdd} onQuickView={onQuickView} />
      ))}
    </div>
  );
}

function Filters({ value, onChange }) {
  const sections = [
    { id: "franchise", label: "Franquia", options: ["Berserk", "Final Fantasy", "Dragon Ball", "One Piece", "Zelda", "Bloodborne"] },
    { id: "tier",      label: "Tier",     options: ["Comum", "Raro", "Épico", "Lendária"] },
    { id: "scale",     label: "Escala",   options: ["1/12", "1/10", "1/8", "1/6", "1/4"] },
  ];
  const toggle = (sec, opt) => {
    const next = { ...value };
    next[sec] = (next[sec] || []).includes(opt)
      ? next[sec].filter(x => x !== opt)
      : [...(next[sec] || []), opt];
    onChange(next);
  };
  return (
    <aside aria-label="Filtros de produtos" style={{ width: 240, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Icon name="filter" size={16} color="var(--gold-300)" />
        <h3 style={{
          fontFamily: '"Bebas Neue", Impact, sans-serif',
          letterSpacing: "0.14em", fontSize: 18, color: "var(--fg)", margin: 0,
        }}>Filtros</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <PriceRange value={value.price} onChange={p => onChange({ ...value, price: p })} />
        {sections.map(s => (
          <fieldset key={s.id} style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{
              fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 11,
              letterSpacing: "0.18em", textTransform: "uppercase",
              color: "var(--gold-300)", marginBottom: 10,
            }}>— {s.label} —</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.options.map(o => {
                const checked = (value[s.id] || []).includes(o);
                return (
                  <label key={o} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg)",
                    cursor: "pointer", userSelect: "none",
                  }}>
                    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(s.id, o)}
                        className="visually-hidden"
                      />
                      <span aria-hidden="true" style={{
                        width: 16, height: 16, borderRadius: 2, flexShrink: 0,
                        border: `1px solid ${checked ? "var(--gold-400)" : "rgba(244,233,210,0.45)"}`,
                        background: checked ? "var(--gold-300)" : "var(--vault-900)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        pointerEvents: "none",
                      }}>
                        {checked && <Icon name="check" size={12} color="var(--vault-900)" strokeWidth={3} />}
                      </span>
                    </span>
                    <span style={{ color: checked ? "var(--fg)" : "var(--fg-muted)" }}>{o}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </aside>
  );
}

function PriceRange({ value = [0, 3000], onChange }) {
  const max = 3000;
  return (
    <div>
      <div style={{
        fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 11,
        letterSpacing: "0.18em", textTransform: "uppercase",
        color: "var(--gold-300)", marginBottom: 10,
      }}>— Faixa de preço —</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{
          flex: 1, padding: "8px 10px", background: "var(--vault-900)",
          border: "1px solid var(--line-strong)", borderRadius: 2,
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--gold-200)",
        }}>{brl(value[0])}</div>
        <span aria-hidden="true" style={{ color: "var(--fg-faint)" }}>—</span>
        <div style={{
          flex: 1, padding: "8px 10px", background: "var(--vault-900)",
          border: "1px solid var(--line-strong)", borderRadius: 2,
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--gold-200)",
        }}>{brl(value[1])}</div>
      </div>
      {/* Slider de faixa de preço com inputs nativos acessíveis */}
      <div style={{ position: "relative" }}>
        <label className="visually-hidden" htmlFor="price-min">Preço mínimo</label>
        <input id="price-min" type="range" min={0} max={max} step={50}
               value={value[0]}
               onChange={e => onChange([Math.min(Number(e.target.value), value[1] - 50), value[1]])}
               aria-valuetext={brl(value[0])}
               style={{ width: "100%", accentColor: "var(--gold-300)", cursor: "pointer" }} />
        <label className="visually-hidden" htmlFor="price-max">Preço máximo</label>
        <input id="price-max" type="range" min={0} max={max} step={50}
               value={value[1]}
               onChange={e => onChange([value[0], Math.max(Number(e.target.value), value[0] + 50)])}
               aria-valuetext={brl(value[1])}
               style={{ width: "100%", accentColor: "var(--gold-300)", cursor: "pointer" }} />
      </div>
    </div>
  );
}

function SortBar({ count, sort, onSort }) {
  const opts = [
    { id: "relevance",  label: "Mais procurados" },
    { id: "newest",     label: "Recém-saqueados" },
    { id: "price_asc",  label: "Menor preço" },
    { id: "price_desc", label: "Maior preço" },
    { id: "rare",       label: "Raridade" },
  ];
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 0", borderBottom: "1px solid var(--line)", marginBottom: 24,
    }}>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-muted)" }}>
        <span style={{ color: "var(--gold-200)", fontWeight: 700 }}>{count}</span> peças no vault
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <label htmlFor="sort-select" style={{
          fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
          letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--parch-300)",
        }}>ORDENAR</label>
        <select id="sort-select" value={sort} onChange={e => onSort(e.target.value)} style={{
          background: "var(--vault-900)", color: "var(--fg)",
          border: "1px solid var(--line-strong)", borderRadius: 2,
          padding: "8px 12px", fontFamily: "var(--font-body)", fontSize: 13,
        }}>
          {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

Object.assign(window, { ProductCard, ProductGrid, Filters, SortBar });
