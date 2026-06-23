const IA_CATEGORIES = [
  {
    id: "livros",
    title: "Livros do projeto",
    description: "Catálogo, ordem dos livros, status de produção e arquivos oficiais.",
  },
  {
    id: "funil",
    title: "Funil",
    description: "Travessia pública, VSLs, biblioteca externa, fragmento e CTA final.",
  },
  {
    id: "portal",
    title: "Portal",
    description: "Área interna, biblioteca protegida, sessões e experiência do comprador.",
  },
  {
    id: "roteiros",
    title: "Roteiros",
    description: "Narrativas, VSLs, sequências de leitura e materiais de apresentação.",
  },
  {
    id: "identidade-visual",
    title: "Identidade visual",
    description: "Noir, dossiê, chaves, olhos, arquivos reservados e atmosfera PSEU.",
  },
  {
    id: "regras-internas",
    title: "Regras internas",
    description: "Decisões operacionais, limites de acesso e critérios de publicação.",
  },
  {
    id: "frases-ctas",
    title: "Frases/CTAs",
    description: "Chamadas, promessas, microcopys e pontos de conversão.",
  },
  {
    id: "estrategia-venda",
    title: "Estratégia de venda",
    description: "Oferta, posicionamento, valor percebido e etapas de compra.",
  },
  {
    id: "configuracoes",
    title: "Configurações do sistema",
    description: "Variáveis, rotas, integrações, deploy e dependências técnicas.",
  },
  {
    id: "memoria-ia",
    title: "Memória da IA",
    description: "Base futura de aprendizados, fontes, resumos e decisões catalogadas.",
  },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderCategory(category, index) {
  return `
    <article class="memory-card" id="memoria-${escapeHtml(category.id)}">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <h3>${escapeHtml(category.title)}</h3>
      <p>${escapeHtml(category.description)}</p>
    </article>
  `;
}

function renderAiPanelPage({ adminEmail = "pseu.oficial@gmail.com" } = {}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PSEU | IA interna</title>
  <style>
    :root {
      --bg: #030305;
      --panel: rgba(11, 10, 13, 0.88);
      --panel-strong: rgba(17, 14, 18, 0.96);
      --line: rgba(218, 178, 96, 0.22);
      --line-soft: rgba(255, 255, 255, 0.08);
      --gold: #d7ad60;
      --gold-soft: rgba(215, 173, 96, 0.18);
      --cyan: #5ed9d2;
      --text: #f7efe4;
      --muted: #b8afa2;
      --quiet: #7e756a;
      --shadow: 0 28px 90px rgba(0, 0, 0, 0.56);
    }

    * { box-sizing: border-box; }

    html {
      min-height: 100%;
      background: var(--bg);
    }

    body {
      min-height: 100vh;
      margin: 0;
      color: var(--text);
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at 70% 8%, rgba(94, 217, 210, 0.13), transparent 26rem),
        radial-gradient(circle at 24% 14%, rgba(215, 173, 96, 0.11), transparent 24rem),
        linear-gradient(135deg, #020203 0%, #09080d 48%, #020203 100%);
      overflow-x: hidden;
    }

    body::before,
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    body::before {
      opacity: 0.18;
      background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
        linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px);
      background-size: 92px 100%, 100% 74px;
      mask-image: radial-gradient(circle at center, black, transparent 76%);
    }

    body::after {
      background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.58) 78%);
    }

    .ai-shell {
      position: relative;
      z-index: 1;
      width: min(1480px, calc(100% - 34px));
      margin: 0 auto;
      padding: 28px 0;
    }

    .ai-topbar,
    .ai-hero,
    .ai-sidebar,
    .ai-memory,
    .ai-status {
      border: 1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 28%),
        var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(22px);
    }

    .ai-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 14px 18px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .brand-mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      color: var(--gold);
      background: rgba(215, 173, 96, 0.08);
      font-weight: 700;
      letter-spacing: 0.12em;
    }

    .eyebrow,
    .ai-topbar small,
    .memory-card span,
    .status-pill,
    .source-list span {
      color: var(--gold);
      font-family: "Segoe UI", sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .brand strong,
    .brand small {
      display: block;
      white-space: nowrap;
    }

    .brand small,
    p,
    li {
      color: var(--muted);
      font-family: "Segoe UI", sans-serif;
    }

    .top-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      border: 1px solid var(--line);
      padding: 9px 13px;
      color: var(--text);
      background: rgba(255, 255, 255, 0.035);
      font-family: "Segoe UI", sans-serif;
      font-size: 0.74rem;
      letter-spacing: 0.12em;
      text-decoration: none;
      text-transform: uppercase;
    }

    .button--primary {
      color: #12100d;
      background: linear-gradient(120deg, #d5ad61, #efd38b);
      border-color: rgba(239, 211, 139, 0.62);
      font-weight: 800;
    }

    .ai-grid {
      display: grid;
      grid-template-columns: minmax(250px, 0.74fr) minmax(0, 2fr) minmax(260px, 0.82fr);
      gap: 16px;
      margin-top: 16px;
      align-items: stretch;
    }

    .ai-sidebar,
    .ai-memory,
    .ai-status {
      min-width: 0;
      padding: 20px;
    }

    .ai-sidebar {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .category-link {
      display: block;
      border: 1px solid var(--line-soft);
      padding: 12px;
      background: rgba(255, 255, 255, 0.025);
      color: var(--text);
      font-family: "Segoe UI", sans-serif;
      font-size: 0.84rem;
      text-decoration: none;
    }

    .category-link.is-active {
      border-color: var(--line);
      background: rgba(215, 173, 96, 0.08);
      color: var(--gold);
    }

    .ai-hero {
      position: relative;
      min-height: 420px;
      padding: clamp(24px, 4vw, 42px);
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(270px, 0.92fr);
      gap: clamp(24px, 5vw, 58px);
      align-items: center;
    }

    .ai-hero::before {
      content: "";
      position: absolute;
      inset: -34% -10% auto auto;
      width: 34rem;
      height: 34rem;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(94, 217, 210, 0.18), transparent 62%);
      filter: blur(12px);
    }

    .hero-copy {
      position: relative;
      z-index: 1;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      max-width: 780px;
      margin-top: 10px;
      font-size: 5.1rem;
      line-height: 0.86;
      letter-spacing: 0;
    }

    .hero-copy p {
      max-width: 650px;
      margin-top: 18px;
      font-size: 1rem;
      line-height: 1.75;
    }

    .ai-core {
      position: relative;
      z-index: 1;
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      background:
        radial-gradient(circle at 50% 46%, rgba(94, 217, 210, 0.16), transparent 30%),
        radial-gradient(circle at center, rgba(215, 173, 96, 0.1), transparent 62%),
        rgba(0, 0, 0, 0.32);
      box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.72);
    }

    .ai-core::before,
    .ai-core::after {
      content: "";
      position: absolute;
      border-radius: 999px;
      border: 1px solid rgba(215, 173, 96, 0.28);
    }

    .ai-core::before {
      width: 72%;
      height: 72%;
      box-shadow: 0 0 42px rgba(215, 173, 96, 0.08);
    }

    .ai-core::after {
      width: 42%;
      height: 18%;
      border-color: rgba(94, 217, 210, 0.5);
      filter: drop-shadow(0 0 18px rgba(94, 217, 210, 0.22));
    }

    .core-face {
      position: relative;
      width: 44%;
      aspect-ratio: 0.74;
      border: 1px solid rgba(215, 173, 96, 0.34);
      border-radius: 48% 48% 42% 42%;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 36%),
        rgba(4, 4, 7, 0.74);
      box-shadow: 0 0 46px rgba(94, 217, 210, 0.12);
    }

    .core-face::before,
    .core-face::after {
      content: "";
      position: absolute;
      left: 22%;
      right: 22%;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--cyan), transparent);
    }

    .core-face::before { top: 36%; }
    .core-face::after { top: 54%; opacity: 0.52; }

    .memory-section {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 16px;
    }

    .memory-card {
      min-height: 146px;
      border: 1px solid var(--line-soft);
      padding: 16px;
      background: rgba(255, 255, 255, 0.026);
    }

    .memory-card h3 {
      margin-top: 18px;
      font-size: 1.2rem;
    }

    .memory-card p {
      margin-top: 9px;
      font-size: 0.88rem;
      line-height: 1.55;
    }

    .ai-memory h2,
    .ai-status h2 {
      margin-top: 8px;
      font-size: 2.7rem;
      line-height: 0.95;
    }

    .status-pill {
      display: inline-flex;
      border: 1px solid rgba(94, 217, 210, 0.32);
      color: var(--cyan);
      background: rgba(94, 217, 210, 0.08);
      padding: 7px 9px;
      margin-top: 12px;
    }

    .source-list {
      display: grid;
      gap: 12px;
      margin-top: 20px;
    }

    .source-list article {
      border: 1px solid var(--line-soft);
      padding: 14px;
      background: rgba(255, 255, 255, 0.025);
    }

    .source-list strong {
      display: block;
      margin-top: 7px;
    }

    .source-list p {
      margin-top: 6px;
      font-size: 0.84rem;
      line-height: 1.55;
    }

    .footer-note {
      margin-top: 16px;
      color: var(--quiet);
      font-family: "Segoe UI", sans-serif;
      font-size: 0.78rem;
      text-align: right;
    }

    @media (max-width: 1080px) {
      .ai-grid {
        grid-template-columns: 1fr;
      }

      .ai-sidebar {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      h1 {
        font-size: 4.4rem;
      }
    }

    @media (max-width: 760px) {
      .ai-shell {
        width: min(100% - 20px, 640px);
        padding: 10px 0 20px;
      }

      .ai-topbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .top-actions {
        width: 100%;
        justify-content: stretch;
      }

      .button {
        flex: 1;
      }

      .ai-hero {
        grid-template-columns: 1fr;
        min-height: 0;
      }

      .ai-core {
        width: min(320px, 100%);
        margin: 0 auto;
      }

      .ai-sidebar,
      .memory-section {
        grid-template-columns: 1fr;
      }

      h1 {
        font-size: 3.25rem;
      }

      .ai-memory h2,
      .ai-status h2 {
        font-size: 2.15rem;
      }
    }
  </style>
</head>
<body>
  <main class="ai-shell">
    <header class="ai-topbar">
      <div class="brand">
        <div class="brand-mark">P</div>
        <div>
          <strong>PSEU · IA interna</strong>
          <small>acesso admin · ${escapeHtml(adminEmail)}</small>
        </div>
      </div>
      <nav class="top-actions" aria-label="Atalhos internos">
        <a class="button" href="/">Ver Funil</a>
        <a class="button" href="/portal">Ver Portal</a>
        <a class="button" href="/acesso">Acesso</a>
        <a class="button button--primary" href="/ia-pseu" aria-current="page">Voltar ao Painel IA</a>
      </nav>
    </header>

    <section class="ai-grid" aria-label="Painel da IA PSEU">
      <aside class="ai-sidebar" aria-label="Categorias de memoria">
        ${IA_CATEGORIES.map((category, index) => `
          <a class="category-link ${index === 0 ? "is-active" : ""}" href="#memoria-${escapeHtml(category.id)}">${escapeHtml(category.title)}</a>
        `).join("")}
      </aside>

      <section>
        <article class="ai-hero">
          <div class="hero-copy">
            <span class="eyebrow">Nucleo simbolico</span>
            <h1>IA PSEU em formação.</h1>
            <p>Esta área representa a inteligência interna do PSEU. Aqui serão organizadas as memórias, regras, conteúdos e decisões estratégicas do projeto.</p>
            <span class="status-pill">base em formação · somente leitura</span>
          </div>
          <div class="ai-core" aria-hidden="true">
            <div class="core-face"></div>
          </div>
        </article>

        <article class="ai-memory">
          <span class="eyebrow">Mapa inicial</span>
          <h2>Blocos de conhecimento</h2>
          <div class="memory-section">
            ${IA_CATEGORIES.map(renderCategory).join("")}
          </div>
        </article>
      </section>

      <aside class="ai-status" aria-label="Status da base">
        <span class="eyebrow">Estado atual</span>
        <h2>Memória ainda não indexada.</h2>
        <p style="margin-top: 14px; line-height: 1.7;">A primeira versão cria apenas o cofre visual e a separação administrativa. A IA real, ingestão, busca e automações ficam para etapas posteriores.</p>

        <div class="source-list">
          <article>
            <span>Fonte futura</span>
            <strong>Livros e catalogo</strong>
            <p>Mapear títulos, status, descrições, PDFs reais e materiais em desenvolvimento.</p>
          </article>
          <article>
            <span>Fonte futura</span>
            <strong>Funil e oferta</strong>
            <p>Organizar travessia, VSLs, CTAs, páginas públicas e mensagens de conversão.</p>
          </article>
          <article>
            <span>Regra ativa</span>
            <strong>Separado do comprador</strong>
            <p>Esta área não compartilha interface, permissão ou memória com o Portal do cliente.</p>
          </article>
        </div>
      </aside>
    </section>

    <p class="footer-note">PSEU · arquivo interno reservado</p>
  </main>
</body>
</html>`;
}

module.exports = {
  renderAiPanelPage,
};
