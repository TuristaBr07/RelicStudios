/* ===== BauMensalPage — Monthly Chest subscription landing ===== */

function BauMensalPage({ onSubscribe }) {
  const tiers = [
    {
      id: "explorador", name: "Explorador", price: 249,
      tagline: "Pra quem está começando a caçada.",
      lootline: "1 figure série rara + brindes", tier: "comum",
      perks: ["1 figure de tier RARO por mês", "Pin colecionável da edição", "Frete grátis Brasil", "Acesso ao Discord da Taverna"],
    },
    {
      id: "capitao", name: "Capitão", price: 449,
      tagline: "A escolha da maioria dos caçadores.",
      lootline: "1 figure épica + 2 brindes premium", tier: "epico", featured: true,
      perks: ["1 figure de tier ÉPICO por mês", "2 brindes premium curados", "Acesso antecipado a drops (24h)", "Frete grátis Brasil + 10% off na loja", "Pin + certificado numerado"],
    },
    {
      id: "lenda", name: "Lenda", price: 899,
      tagline: "Pra quem caça relíquias raras.",
      lootline: "1 figure lendária + tudo do Capitão", tier: "lendaria",
      perks: ["1 figure de tier LENDÁRIA por mês", "Edição numerada exclusiva (<50 unidades)", "Acesso antecipado a drops (72h)", "Frete grátis worldwide", "20% off na loja + 1 brinde anual"],
    },
  ];

  return (
    <div>
      {/* Hero */}
      <section aria-label="Programa de assinatura" style={{
        position: "relative", overflow: "hidden",
        borderBottom: "1px solid var(--gold-400)",
        background: `
          radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,228,180,0.55), transparent 65%),
          radial-gradient(ellipse 70% 50% at 80% 80%, rgba(255,150,70,0.4), transparent 70%),
          linear-gradient(180deg, #FFE0B5 0%, #FFC587 60%, #FFAA58 100%)
        `,
      }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0, opacity: 0.08, mixBlendMode: "multiply", pointerEvents: "none",
          backgroundImage: "repeating-radial-gradient(circle at 30% 20%, rgba(110,60,10,0.5) 0 1px, transparent 1px 3px)",
        }}/>
        <div className="container grid-hero" style={{ position: "relative", padding: "72px 48px 80px", minHeight: 540 }}>
          <div>
            <div style={{
              fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12,
              letterSpacing: "0.28em", textTransform: "uppercase", color: "#6E2A06", marginBottom: 16,
            }}>— Programa de assinatura —</div>
            <h1 style={{
              fontFamily: '"Bebas Neue", Impact, sans-serif',
              fontSize: "clamp(56px, 8vw, 96px)", lineHeight: 1.02,
              letterSpacing: "0.03em", textTransform: "uppercase",
              color: "#1A0A02", textShadow: "0 1px 0 rgba(255,235,200,0.55)",
              margin: "0 0 18px 0",
            }}>
              Todo mês,{" "}
              <span style={{
                background: "linear-gradient(180deg, #8C2A00 0%, #6B1600 50%, #4A0A00 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                filter: "drop-shadow(0 1px 0 rgba(60,10,0,0.25))",
              }}>uma relíquia</span><br/>na sua porta.
            </h1>
            <p style={{
              fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.55, fontWeight: 500,
              color: "#3A1808", maxWidth: 520, margin: 0,
            }}>
              Você escolhe um tier, a gente garimpa, esculpe e entrega.
              Sem repetição, sem desperdício. Cancela quando quiser.
            </p>
            <div style={{ display: "flex", gap: 28, marginTop: 28, flexWrap: "wrap" }}>
              {[["1.847", "Caçadores ativos"], ["32", "Baús entregues"], ["0", "Repetições"]].map(([n, l]) => (
                <div key={l}>
                  <div style={{
                    fontFamily: '"Bebas Neue", Impact, sans-serif',
                    fontSize: 44, lineHeight: 1, color: "#1A0A02", letterSpacing: "0.03em",
                  }}>{n}</div>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    color: "#6E2A06", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 4,
                  }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div aria-hidden="true" style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(circle at center, rgba(255,140,42,0.4), transparent 60%)",
              filter: "blur(20px)",
            }}/>
            <img src="assets/relic-logo-chest.png" alt="" style={{
              width: "100%", maxWidth: 480,
              filter: "drop-shadow(0 40px 50px rgba(80,30,0,0.45)) drop-shadow(0 0 60px rgba(255,140,42,0.3))",
              position: "relative",
            }}/>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section aria-labelledby="como-funciona-title" style={{ padding: "96px 0 56px" }}>
        <div className="container">
          <SectionHeading eyebrow="Como funciona" title="Três passos. Sem letra miúda." />
          <div id="como-funciona-title" className="visually-hidden">Como funciona o programa de assinatura</div>
          <div className="grid-3col" style={{ marginTop: 40 }}>
            {[
              { n: "01", glyph: "key",     t: "Você assina", s: "Escolhe um tier e cadastra suas franquias favoritas. A gente registra suas preferências." },
              { n: "02", glyph: "compass", t: "Garimpamos",  s: "Nosso time vasculha Tóquio, Hong Kong e Osaka pra montar uma seleção que combina com seu perfil." },
              { n: "03", glyph: "chest",   t: "Entregamos",  s: "Todo dia 10, o baú chega na sua porta. Embalagem reforçada, certificado numerado." },
            ].map(s => (
              <div key={s.n} style={{
                background: "var(--vault-800)", border: "1px solid var(--line)",
                borderRadius: 6, padding: 28, position: "relative",
              }}>
                <div aria-hidden="true" style={{
                  position: "absolute", top: 24, right: 24,
                  fontFamily: '"Bebas Neue", Impact, sans-serif',
                  fontSize: 64, lineHeight: 1, color: "var(--gold-400)",
                  letterSpacing: "0.03em", opacity: 0.5,
                }}>{s.n}</div>
                <img src={`assets/icons/${s.glyph}.svg`} style={{ width: 40, height: 40, marginBottom: 16 }} alt="" aria-hidden="true" />
                <h3 style={{
                  fontFamily: '"Bebas Neue", Impact, sans-serif',
                  fontSize: 30, lineHeight: 1, margin: "0 0 10px",
                  letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--fg)",
                }}>{s.t}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0 }}>
                  {s.s}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tiers */}
      <section aria-labelledby="tiers-title" style={{ padding: "56px 0 80px" }}>
        <div className="container">
          <SectionHeading eyebrow="Tiers de assinatura" title="Escolha o tamanho do tesouro" />
          <div id="tiers-title" className="visually-hidden">Planos de assinatura disponíveis</div>
          <div className="grid-3col" style={{ marginTop: 40 }}>
            {tiers.map(t => <TierCard key={t.id} tier={t} onSubscribe={onSubscribe} />)}
          </div>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-faint)",
            textAlign: "center", marginTop: 32, lineHeight: 1.6,
          }}>
            Todos os planos são mensais. Cancele quando quiser, sem multa. Pula o mês sem perder o slot.
          </p>
        </div>
      </section>

      {/* Sneak peek */}
      <section aria-label="Prévia do baú de outubro" style={{ padding: "80px 0", background: "var(--vault-800)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="container">
          <SectionHeading eyebrow="Sneak peek" title="O que vem no baú de outubro"
            action={
              <button style={{
                fontFamily: '"Bebas Neue", Impact, sans-serif',
                letterSpacing: "0.14em", fontSize: 14, color: "var(--gold-200)",
                background: "none", border: "none", cursor: "pointer",
              }}>VER HISTÓRICO →</button>
            } />
          <div className="grid-products" style={{ marginTop: 32 }}>
            {[
              { tag: "ANIMES", img: "assets/products/cc-code-geass.jpg", label: "1 figure lendária",    name: "Prévia: figure lendária de anime" },
              { tag: "GAMES",  img: "assets/products/dante-dmc.jpg",     label: "Tier épico ou superior", name: "Prévia: figure épica de games" },
              { tag: "BRINDE", img: null, glyph: "scroll", label: "Certificado numerado", name: "Brinde: certificado numerado" },
              { tag: "BRINDE", img: null, glyph: "coin",   label: "Moeda colecionável",   name: "Brinde: moeda colecionável" },
            ].map((it, i) => (
              <div key={i} style={{
                background: "linear-gradient(180deg, #2A2018 0%, #1A140E 100%)",
                border: "1px solid rgba(232,176,40,0.40)",
                borderRadius: 6, padding: 14,
                display: "flex", flexDirection: "column", gap: 10,
                boxShadow: "var(--shadow-1)",
              }}>
                <div style={{
                  aspectRatio: 1, borderRadius: 4,
                  background: it.img ? "#0B0907" : "linear-gradient(180deg, #2A2018 0%, #0E0B07 100%)",
                  border: "1px solid rgba(232,176,40,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", position: "relative",
                }}>
                  {it.img
                    ? <img src={it.img} alt={it.name} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(2px) brightness(0.6)" }}/>
                    : <img src={`assets/icons/${it.glyph}.svg`} style={{ width: 56, height: 56, opacity: 0.5 }} alt="" aria-hidden="true" />}
                  <div aria-hidden="true" style={{
                    position: "absolute", inset: 0,
                    background: "radial-gradient(circle at center, transparent 30%, rgba(11,9,7,0.7) 100%)",
                  }}/>
                  <div aria-hidden="true" style={{
                    position: "absolute",
                    fontFamily: '"Bebas Neue", Impact, sans-serif',
                    letterSpacing: "0.18em", fontSize: 16, color: "var(--gold-200)",
                    textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                  }}>SURPRESA</div>
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "var(--parch-300)", letterSpacing: "0.08em", textTransform: "uppercase",
                }}>{it.tag}</div>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>
                  {it.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" style={{ padding: "96px 0" }}>
        <div className="container container--narrow">
          <SectionHeading eyebrow="Dúvidas frequentes" title="Antes da próxima caçada" />
          <h2 id="faq-title" className="visually-hidden">Perguntas frequentes sobre a assinatura</h2>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 1, background: "var(--line)" }}>
            {[
              { q: "Posso escolher exatamente qual figure vou receber?", a: "Não. A graça do baú é a surpresa curada. Você nos diz quais franquias gosta e a gente ajusta — mas a peça em si é mistério até abrir a caixa." },
              { q: "E se eu já tiver uma das peças?", a: "Não tem repetição. A gente registra cada peça que sai e nunca manda a mesma figure pro mesmo caçador. Se quiser repassar uma peça em duplicidade, o Discord da Taverna tem um canal de trocas." },
              { q: "Posso pausar minha assinatura?", a: "Sim. Pula o mês ou cancela quando quiser, do seu painel. Sem multa, sem fidelidade, sem ligação de retenção." },
              { q: "Como é o envio?", a: "Embalagem reforçada com proteção em espuma, despacho via Sedex no dia 5 de cada mês. Brasil inteiro. Lendas têm frete worldwide." },
              { q: "Posso assinar pra outra pessoa?", a: "Sim — temos a opção 'baú-presente' com cartão personalizado. No checkout, basta marcar a opção e deixar a mensagem." },
            ].map((it, i) => <FAQItem key={i} q={it.q} a={it.a} defaultOpen={i === 0} />)}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section style={{ padding: "0 0 96px" }}>
        <div className="container">
          <div style={{
            position: "relative", overflow: "hidden", borderRadius: 6,
            border: "1px solid var(--gold-400)", padding: "64px 48px",
            background: "linear-gradient(135deg, #1F1812 0%, #2C2218 100%)",
            boxShadow: "0 0 0 1px var(--gold-400), 0 0 80px -20px rgba(232,176,40,0.5)",
            textAlign: "center",
          }}>
            <img src="assets/icons/chest.svg" style={{ width: 56, height: 56, marginBottom: 18, opacity: 0.85 }} alt="" aria-hidden="true" />
            <h2 style={{
              fontFamily: '"Bebas Neue", Impact, sans-serif',
              fontSize: 56, lineHeight: 1, letterSpacing: "0.03em",
              textTransform: "uppercase", color: "var(--fg)", margin: 0,
            }}>
              Sua próxima relíquia<br/>está em algum baú.
            </h2>
            <p style={{
              fontFamily: "var(--font-body)", fontSize: 16, color: "var(--fg-muted)",
              maxWidth: 560, margin: "20px auto 32px",
            }}>
              Assine até o dia 30 pra entrar no próximo lote. Vagas limitadas pra manter a curadoria justa.
            </p>
            <Button variant="primary" size="lg" onClick={onSubscribe}>ENTRAR NO PRÓXIMO BAÚ →</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TierCard({ tier, onSubscribe }) {
  return (
    <article style={{
      position: "relative",
      background: tier.featured ? "linear-gradient(180deg, #2C2218 0%, #1F1812 100%)" : "var(--vault-800)",
      border: tier.featured ? "1px solid var(--gold-400)" : "1px solid var(--line)",
      borderRadius: 6, padding: 28,
      display: "flex", flexDirection: "column", gap: 16,
      boxShadow: tier.featured
        ? "0 0 0 1px var(--gold-400), 0 0 40px -8px rgba(232,176,40,0.4)"
        : "var(--shadow-1)",
      transform: tier.featured ? "translateY(-8px)" : "translateY(0)",
    }}>
      {tier.featured && (
        <div aria-label="Plano mais escolhido" style={{
          position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
          fontFamily: '"Bebas Neue", Impact, sans-serif',
          letterSpacing: "0.18em", fontSize: 12,
          padding: "5px 12px", borderRadius: 2,
          background: "linear-gradient(180deg, #F2C95B 0%, #E89028 60%, #A04A0A 100%)",
          color: "#1A0B02", boxShadow: "0 0 20px -4px rgba(232,176,40,0.6)",
          whiteSpace: "nowrap",
        }}>MAIS ESCOLHIDO</div>
      )}
      <div>
        <TierChip tier={tier.tier} />
        <h3 style={{
          fontFamily: '"Bebas Neue", Impact, sans-serif',
          fontSize: 40, lineHeight: 1, margin: "12px 0 6px",
          letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--fg)",
        }}>{tier.name}</h3>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg-muted)", margin: 0 }}>
          {tier.tagline}
        </p>
      </div>
      <div style={{ padding: "14px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-faint)" }}>R$</span>
          <span style={{
            fontFamily: '"Bebas Neue", Impact, sans-serif',
            fontSize: 56, color: "var(--gold-200)", lineHeight: 1,
          }} aria-label={`R$ ${tier.price} por mês`}>{tier.price}</span>
          <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-faint)" }}>/mês</span>
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--gold-300)", marginTop: 4 }}>
          {tier.lootline}
        </div>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {tier.perks.map(p => (
          <li key={p} style={{
            display: "flex", gap: 10, fontFamily: "var(--font-body)", fontSize: 13,
            color: "var(--fg-muted)", lineHeight: 1.5,
          }}>
            <span aria-hidden="true" style={{ flexShrink: 0, color: "var(--gold-300)", marginTop: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7"/>
              </svg>
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Button
        variant={tier.featured ? "primary" : "secondary"}
        size="md" style={{ width: "100%" }}
        onClick={() => onSubscribe(tier)}
        ariaLabel={`Escolher plano ${tier.name} — R$ ${tier.price} por mês`}>
        ESCOLHER {tier.name.toUpperCase()}
      </Button>
    </article>
  );
}

function FAQItem({ q, a, defaultOpen }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const id = React.useId ? React.useId() : `faq-${Math.random().toString(36).slice(2, 8)}`;
  const panelId = `faq-panel-${id}`;
  const btnId   = `faq-btn-${id}`;

  return (
    <div style={{ background: "var(--vault-700)" }}>
      <button id={btnId}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen(!open)}
              style={{
                width: "100%", padding: "20px 4px",
                background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                color: "var(--fg)",
              }}>
        <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 16 }}>{q}</span>
        <span aria-hidden="true" style={{
          flexShrink: 0, fontFamily: '"Bebas Neue", Impact, sans-serif',
          fontSize: 22, color: "var(--gold-300)",
          transform: open ? "rotate(45deg)" : "rotate(0deg)",
          transition: "transform 200ms",
        }}>+</span>
      </button>
      <div id={panelId}
           role="region"
           aria-labelledby={btnId}
           hidden={!open}
           style={{ padding: "0 4px 22px", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.65 }}>
        {a}
      </div>
    </div>
  );
}

Object.assign(window, { BauMensalPage });
