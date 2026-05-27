/* ===== App — orchestrator + routes + product data ===== */

const PRODUCTS = [
  {
    id: "p1", name: "C.C. — Code Geass", franchise: "Code Geass · Ed. limitada",
    sku: "RLC-CGCC-022", tier: "lendaria", price: 1299, badge: "LENDÁRIA",
    image: "assets/products/cc-code-geass.jpg",
    seed: 0, glow: "rgba(120,200,80,0.22)", silhouetteGlow: "rgba(120,200,80,0.3)",
    editionNumber: 47, editionOf: 500, stock: 3,
    description: "C.C. em pose icônica de Code Geass, esculpida sobre referência oficial. 32 cm, articulações ocultas, cabelos com efeito de movimento.",
    scale: "1/6", height: "32 cm", joints: "Articulado oculto",
    materials: "Resina pintada à mão, PVC, ABS", accessories: "2 expressões, base preta",
    origin: "Tokyo, JP", maker: "Bulkamancer / KAI", weight: "1.4 kg",
  },
  {
    id: "p2", name: "Dante — Devil May Cry", franchise: "Devil May Cry · 2026",
    sku: "RLC-DMCD-008", tier: "epico", price: 1149, badge: "ÉPICO",
    image: "assets/products/dante-dmc.jpg",
    seed: 1, glow: "rgba(196,50,26,0.22)", silhouetteGlow: "rgba(196,50,26,0.35)",
    editionNumber: 102, editionOf: 800, stock: 12,
    description: "Dante segurando Ebony & Ivory, capa em couro real, escultura referência do primeiro DMC.",
    scale: "1/6", height: "31 cm", joints: "26 pontos",
    materials: "Resina, couro sintético, metal", accessories: "Ebony, Ivory, Rebellion",
    origin: "Osaka, JP", maker: "Bulkamancer / Alex Gray", weight: "1.5 kg",
  },
  {
    id: "p3", name: "Arthur Morgan & Mount", franchise: "Red Dead Redemption 2",
    sku: "RLC-RDRA-014", tier: "lendaria", price: 1899, badge: "DIORAMA",
    image: "assets/products/arthur-rdr2.jpg",
    seed: 2, glow: "rgba(232,176,40,0.22)", silhouetteGlow: "rgba(232,176,40,0.3)",
    editionNumber: 220, editionOf: 300, stock: 4,
    description: "Diorama de Arthur Morgan a cavalo com revólver em punho. Base com terreno texturizado e céu pintado.",
    scale: "1/8", height: "38 cm", joints: "Estático",
    materials: "Resina, base diorama, fundo pintado", accessories: "Cavalo, revólver, base completa",
    origin: "Hong Kong", maker: "Bulkamancer / Rodrigues + Lozynina", weight: "3.2 kg",
  },
  {
    id: "p4", name: "Asuka Langley — Plug Suit", franchise: "Evangelion · 2.0",
    sku: "RLC-EVAA-002", tier: "epico", price: 989, badge: null,
    image: "assets/products/asuka-evangelion.jpg",
    seed: 3, glow: "rgba(220,40,40,0.18)", silhouetteGlow: "rgba(255,60,60,0.25)",
    editionNumber: 14, editionOf: 600, stock: 9,
    description: "Asuka com a Lança de Longinus, plug suit em acabamento brilhante e detalhes do EVA-02.",
    scale: "1/7", height: "27 cm", joints: "Articulado oculto",
    materials: "PVC, ABS, metal", accessories: "Lança, base com efeito de chamas",
    origin: "Tokyo, JP", maker: "Bulkamancer / KAI", weight: "1.1 kg",
  },
  {
    id: "p5", name: "Guts — Berserker Armor 1/6", franchise: "Berserk · Em breve",
    sku: "RLC-BRSK-022", tier: "raro", price: 1599, badge: "PRÉ-VENDA",
    seed: 0, glow: "rgba(232,176,40,0.18)", silhouetteGlow: "rgba(232,176,40,0.3)",
    editionNumber: 0, editionOf: 500, stock: 0,
    description: "Guts trajando a Armadura do Berserker. Pré-venda — entrega prevista para Q1 2027.",
    scale: "1/6", height: "32 cm", joints: "32 pontos",
    materials: "PVC, ABS, metal fundido", accessories: "Espada, capa, baú colecionável",
    origin: "Tokyo, JP", maker: "Forge Atelier", weight: "1.4 kg",
  },
  {
    id: "p6", name: "Link — Champion of Hyrule", franchise: "The Legend of Zelda · TotK",
    sku: "RLC-ZLDL-031", tier: "comum", price: 489, badge: null,
    seed: 1, glow: "rgba(123,174,79,0.16)", silhouetteGlow: "rgba(74,176,55,0.22)",
    editionNumber: 612, editionOf: 2400, stock: 38,
    description: "Link com Master Sword e Hylian Shield, escultura inspirada em Tears of the Kingdom.",
    scale: "1/10", height: "20 cm", joints: "24 pontos",
    materials: "PVC, ABS", accessories: "Master Sword, escudo, paraglider",
    origin: "Osaka, JP", maker: "Loftwing Works", weight: "0.6 kg",
  },
  {
    id: "p7", name: "Geralt of Rivia — Wolf School", franchise: "The Witcher 3",
    sku: "RLC-WGRL-007", tier: "raro", price: 939, badge: null,
    seed: 2, glow: "rgba(95,106,126,0.18)", silhouetteGlow: "rgba(193,200,212,0.25)",
    editionNumber: 88, editionOf: 600, stock: 5,
    description: "Geralt com armadura Wolf School, espadas de aço e prata, capa em tecido real.",
    scale: "1/6", height: "30 cm", joints: "32 pontos",
    materials: "PVC, ABS, metal", accessories: "Espadas, sinais, capa de tecido",
    origin: "Tokyo, JP", maker: "Kaer Morhen Atelier", weight: "1.5 kg",
  },
  {
    id: "p8", name: "Cloud Strife — Advent Children", franchise: "Final Fantasy VII",
    sku: "RLC-FFCS-008", tier: "raro", price: 879, badge: null,
    seed: 3, glow: "rgba(94,143,168,0.18)", silhouetteGlow: "rgba(143,154,176,0.3)",
    editionNumber: 305, editionOf: 800, stock: 18,
    description: "Cloud em pose tática com a Buster Sword, versão Advent Children. 27 cm.",
    scale: "1/7", height: "27 cm", joints: "26 pontos",
    materials: "PVC, ABS", accessories: "Buster Sword, fenrir base",
    origin: "Osaka, JP", maker: "Mirai Works", weight: "1.1 kg",
  },
];

function App() {
  const [route, setRoute]       = React.useState({ name: "home" });
  const [cart, setCart]         = React.useState([]);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [filters, setFilters]   = React.useState({ price: [0, 3000], franchise: [], tier: [], scale: [] });
  const [sort, setSort]         = React.useState("relevance");
  const [quickView, setQuickView] = React.useState(null);

  const nav = (id) => {
    if (id === "home") setRoute({ name: "home" });
    else if (id === "drops") setRoute({ name: "bau-mensal" });
    else if (id === "vault" || id === "animes" || id === "games") {
      setRoute({ name: "catalog", filter: id });
    } else setRoute({ name: "home" });
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const openProduct = (p) => {
    setRoute({ name: "product", id: p.id });
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const addToCart = (p, qty = 1) => {
    setCart(c => {
      const idx = c.findIndex(x => x.id === p.id);
      if (idx >= 0) {
        const next = [...c]; next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...c, { ...p, qty }];
    });
    setCartOpen(true);
  };
  const removeFromCart = (p) => setCart(c => c.filter(x => x.id !== p.id));
  const setQty = (p, qty) => setCart(c => c.map(x => x.id === p.id ? { ...x, qty } : x));

  const cartCount    = cart.reduce((s, x) => s + x.qty, 0);
  const current      = route.name === "catalog"   ? (route.filter || "vault")
                     : route.name === "home"       ? "home"
                     : route.name === "bau-mensal" ? "drops"
                     : "vault";

  const currentProduct = route.name === "product" ? PRODUCTS.find(p => p.id === route.id) : null;

  return (
    <div className="app-shell">
      <Header cartCount={cartCount} onNav={nav} current={current} onOpenCart={() => setCartOpen(true)} />
      <main>
        {route.name === "home" && (
          <>
            <Hero onCTA={() => nav("vault")} />
            <CategoryStrip onPick={() => nav("vault")} />
            <FeaturedDrop products={PRODUCTS.slice(0, 4)} onOpen={openProduct} onAdd={addToCart} onQuickView={setQuickView} />
            <Newsletter />
          </>
        )}
        {route.name === "catalog" && (
          <CatalogPage
            products={PRODUCTS}
            filters={filters} onFiltersChange={setFilters}
            sort={sort} onSort={setSort}
            onOpen={openProduct} onAdd={addToCart}
            onQuickView={setQuickView}
          />
        )}
        {route.name === "product" && currentProduct && (
          <ProductPage product={currentProduct} onBack={() => nav("vault")} onAdd={addToCart} />
        )}
        {route.name === "bau-mensal" && (
          <BauMensalPage onSubscribe={() => alert("Levaríamos pro checkout de assinatura.")} />
        )}
      </main>
      <Footer />
      <CartDrawer
        open={cartOpen}
        items={cart}
        onClose={() => setCartOpen(false)}
        onRemove={removeFromCart}
        onQty={setQty}
        onCheckout={() => alert("Levaríamos pro checkout.")}
      />
      <QuickBuyModal
        open={!!quickView}
        product={quickView}
        onClose={() => setQuickView(null)}
        onAdd={addToCart}
      />
    </div>
  );
}

function CatalogPage({ products, filters, onFiltersChange, sort, onSort, onOpen, onAdd, onQuickView }) {
  return (
    <section style={{ padding: "32px 0 80px" }}>
      <div className="container">
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 11,
            letterSpacing: "0.24em", textTransform: "uppercase",
            color: "var(--gold-300)", marginBottom: 8,
          }}>— O vault —</div>
          <h1 style={{
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            fontSize: 72, lineHeight: 1, letterSpacing: "0.03em",
            textTransform: "uppercase", color: "var(--fg)", margin: 0,
          }}>Todas as relíquias</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg-muted)", marginTop: 10 }}>
            {products.length} peças garimpadas. Filtre por franquia, raridade ou escala.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 40 }}>
          <Filters value={filters} onChange={onFiltersChange} />
          <div>
            <SortBar count={products.length} sort={sort} onSort={onSort} />
            <ProductGrid products={products} onOpen={onOpen} onAdd={onAdd} onQuickView={onQuickView} />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedDrop({ products, onOpen, onAdd, onQuickView }) {
  return (
    <section style={{ padding: "72px 0 24px" }}>
      <div className="container">
        <SectionHeading eyebrow="Recém-saqueados" title="Drops da semana"
          action={
            <a style={{
              fontFamily: '"Bebas Neue", Impact, sans-serif',
              letterSpacing: "0.14em", fontSize: 14, color: "var(--gold-200)",
              cursor: "pointer", textDecoration: "none",
            }}>VER TODOS →</a>
          } />
        <div style={{ marginTop: 32 }}>
          <ProductGrid products={products} onOpen={onOpen} onAdd={onAdd} onQuickView={onQuickView} />
        </div>
      </div>
    </section>
  );
}

function Newsletter() {
  return (
    <section style={{ padding: "80px 0 0" }}>
      <div className="container">
        <div style={{
          position: "relative", overflow: "hidden",
          borderRadius: 6,
          border: "1px solid var(--gold-400)",
          padding: "56px 48px",
          background: "linear-gradient(135deg, #1F1812 0%, #2C2218 100%)",
          boxShadow: "0 0 0 1px var(--gold-400), 0 0 60px -20px rgba(232,176,40,0.4)",
          display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, alignItems: "center",
        }}>
          <div>
            <div style={{
              fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 11,
              letterSpacing: "0.22em", textTransform: "uppercase",
              color: "var(--gold-300)", marginBottom: 14,
            }}>— Mapa dos próximos baús —</div>
            <h2 style={{
              fontFamily: '"Bebas Neue", Impact, sans-serif',
              fontSize: 56, lineHeight: 1, letterSpacing: "0.03em",
              textTransform: "uppercase", color: "var(--fg)", margin: 0,
            }}>Receba o aviso<br/>antes de todo mundo.</h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg-muted)", marginTop: 16, maxWidth: 480 }}>
              Cadastre seu e-mail e te avisamos 24h antes de cada drop. Sem spam, só relíquias.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input placeholder="seu@email.com.br" style={{
              background: "var(--vault-900)", color: "var(--fg)",
              border: "1px solid var(--line-strong)", borderRadius: 2,
              padding: "14px 16px", fontFamily: "var(--font-body)", fontSize: 15,
              outline: "none",
            }} />
            <Button variant="primary" size="lg">ENTRAR NA FILA →</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
