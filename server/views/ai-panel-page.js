function renderAiPanelPage() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PSEU | Observatório interno</title>
  <style>
    :root {
      --bg: #030305;
      --panel: rgba(11, 10, 13, 0.92);
      --panel-strong: #111014;
      --line: rgba(218, 178, 96, 0.24);
      --line-soft: rgba(255, 255, 255, 0.08);
      --gold: #d7ad60;
      --cyan: #5ed9d2;
      --text: #f7efe4;
      --muted: #b8afa2;
      --quiet: #7e756a;
      --danger: #e09580;
      --shadow: 0 28px 90px rgba(0, 0, 0, 0.56);
    }

    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--bg); }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--text);
      font-family: "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 76% 6%, rgba(94, 217, 210, 0.12), transparent 28rem),
        radial-gradient(circle at 20% 10%, rgba(215, 173, 96, 0.1), transparent 26rem),
        linear-gradient(135deg, #020203 0%, #09080d 48%, #020203 100%);
    }

    button, input, select { font: inherit; }
    button, a { -webkit-tap-highlight-color: transparent; }
    h1, h2, h3, p { margin: 0; }

    .ai-shell {
      width: min(1500px, calc(100% - 32px));
      margin: 0 auto;
      padding: 24px 0 36px;
    }

    .panel {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 30%), var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 14px 18px;
    }

    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand-mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      color: var(--gold);
      background: rgba(215, 173, 96, 0.08);
      font-family: Georgia, serif;
      font-weight: 700;
    }
    .brand strong, .brand small { display: block; }
    .brand small, .eyebrow {
      color: var(--gold);
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .shortcuts, .tabs, .filters, .inline-filters { display: flex; gap: 9px; flex-wrap: wrap; }
    .button, .tab {
      min-height: 38px;
      border: 1px solid var(--line);
      padding: 9px 13px;
      color: var(--text);
      background: rgba(255, 255, 255, 0.035);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-decoration: none;
      text-transform: uppercase;
      cursor: pointer;
    }
    .button--primary, .tab[aria-selected="true"] {
      color: #12100d;
      background: linear-gradient(120deg, #d5ad61, #efd38b);
      border-color: rgba(239, 211, 139, 0.62);
    }

    .hero { margin-top: 14px; padding: clamp(24px, 5vw, 48px); }
    .hero h1 {
      max-width: 900px;
      margin-top: 10px;
      font: 700 clamp(2.8rem, 7vw, 6.4rem)/0.88 Georgia, serif;
    }
    .hero p { max-width: 780px; margin-top: 18px; color: var(--muted); line-height: 1.7; }
    .status-pill {
      display: inline-flex;
      margin-top: 18px;
      border: 1px solid rgba(94, 217, 210, 0.32);
      padding: 7px 9px;
      color: var(--cyan);
      background: rgba(94, 217, 210, 0.08);
      font-size: 0.67rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .workspace { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 14px; margin-top: 14px; }
    .tabs { align-content: start; flex-direction: column; padding: 14px; }
    .tab { width: 100%; text-align: left; }
    .content { min-width: 0; padding: clamp(18px, 3vw, 30px); }
    .view[hidden] { display: none; }
    .filters[hidden] { display: none; }
    .view-header { display: flex; justify-content: space-between; gap: 18px; align-items: end; }
    .view-header h2 { margin-top: 7px; font: 700 clamp(2rem, 4vw, 3.5rem)/0.95 Georgia, serif; }
    .view-header p { max-width: 650px; color: var(--muted); line-height: 1.6; }

    .filters, .inline-filters {
      align-items: end;
      margin-top: 20px;
      border: 1px solid var(--line-soft);
      padding: 12px;
      background: rgba(255, 255, 255, 0.02);
    }
    label { display: grid; gap: 6px; color: var(--quiet); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    input, select {
      min-height: 38px;
      width: 100%;
      border: 1px solid var(--line-soft);
      padding: 8px 10px;
      color: var(--text);
      background: #08070a;
    }
    .filters label { min-width: 160px; }
    .inline-filters label { min-width: 150px; flex: 1; }

    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
    .metric, .data-block {
      border: 1px solid var(--line-soft);
      background: rgba(255, 255, 255, 0.025);
    }
    .metric { min-height: 132px; padding: 16px; }
    .metric strong { display: block; margin-top: 14px; font: 700 2.3rem/1 Georgia, serif; }
    .metric small { display: block; margin-top: 10px; color: var(--quiet); line-height: 1.4; }
    .data-block { margin-top: 14px; padding: 16px; overflow: hidden; }
    .data-block h3 { font: 700 1.35rem/1.1 Georgia, serif; }
    .data-block > p { margin-top: 8px; color: var(--muted); line-height: 1.5; }

    .table-wrap { margin-top: 12px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th, td { border-bottom: 1px solid var(--line-soft); padding: 11px 9px; text-align: left; vertical-align: top; }
    th { color: var(--gold); font-size: 0.67rem; letter-spacing: 0.1em; text-transform: uppercase; }
    td { color: var(--muted); font-size: 0.84rem; }
    td strong { color: var(--text); }
    .compact-table { min-width: 520px; }

    .empty, .error, .loading {
      margin-top: 16px;
      border: 1px dashed var(--line);
      padding: 20px;
      color: var(--muted);
      text-align: center;
    }
    .error { border-color: rgba(224, 149, 128, 0.45); color: var(--danger); }
    .caveat { margin-top: 16px; border-left: 2px solid var(--gold); padding: 10px 14px; color: var(--muted); line-height: 1.55; }
    .timeline { display: grid; gap: 9px; margin-top: 16px; }
    .timeline article { border-left: 2px solid var(--cyan); padding: 10px 14px; background: rgba(94, 217, 210, 0.035); }
    .timeline time, .timeline small { color: var(--quiet); font-size: 0.73rem; }
    .timeline strong { display: block; margin: 4px 0; color: var(--text); }
    .footer-note { margin-top: 14px; color: var(--quiet); font-size: 0.76rem; text-align: right; }

    @media (max-width: 1080px) {
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .workspace { grid-template-columns: 1fr; }
      .tabs { flex-direction: row; overflow-x: auto; flex-wrap: nowrap; }
      .tab { width: auto; white-space: nowrap; }
    }

    @media (max-width: 720px) {
      .ai-shell { width: min(100% - 18px, 640px); padding-top: 9px; }
      .topbar, .view-header { align-items: flex-start; flex-direction: column; }
      .shortcuts { width: 100%; }
      .shortcuts .button { flex: 1; }
      .hero { padding: 24px 18px; }
      .hero h1 { font-size: clamp(2.6rem, 15vw, 4rem); }
      .content { padding: 18px 12px; }
      .metrics { grid-template-columns: 1fr; }
      .filters, .inline-filters { align-items: stretch; flex-direction: column; }
      .filters label, .inline-filters label { min-width: 0; }
      .button, .tab { min-height: 44px; }
    }
  </style>
</head>
<body>
  <main class="ai-shell">
    <header class="topbar panel">
      <div class="brand">
        <div class="brand-mark">P</div>
        <div><strong>PSEU · Observatório interno</strong><small>sessão administrativa · somente leitura</small></div>
      </div>
      <nav class="shortcuts" aria-label="Atalhos internos">
        <a class="button" href="/">Ver Funil</a>
        <a class="button" href="/portal">Ver Portal</a>
        <a class="button" href="/acesso">Acesso</a>
        <a class="button button--primary" href="/ia-pseu" aria-current="page">Painel IA</a>
      </nav>
    </header>

    <section class="hero panel">
      <span class="eyebrow">Leitura operacional</span>
      <h1>A jornada deixa rastros.</h1>
      <p>Visão administrativa agregada do funil, das sessões e da leitura. Nenhuma ação de conta, acesso ou conteúdo pode ser executada por este painel.</p>
      <span class="status-pill">dados reais · consultas read-only</span>
    </section>

    <section class="workspace">
      <nav class="tabs panel" aria-label="Visões do observatório" role="tablist">
        <button class="tab" type="button" role="tab" aria-selected="true" data-view="overview">Visão geral</button>
        <button class="tab" type="button" role="tab" aria-selected="false" data-view="funnel">Funil</button>
        <button class="tab" type="button" role="tab" aria-selected="false" data-view="reading">Leitura</button>
        <button class="tab" type="button" role="tab" aria-selected="false" data-view="users">Usuários</button>
        <button class="tab" type="button" role="tab" aria-selected="false" data-view="journey">Jornada individual</button>
      </nav>

      <section class="content panel" aria-live="polite">
        <div class="filters" id="global-period" aria-label="Período das visões temporais">
          <label>De <input id="period-from" type="date" /></label>
          <label>Até <input id="period-to" type="date" /></label>
          <button class="button button--primary" id="apply-period" type="button">Atualizar período</button>
        </div>

        <section class="view" data-panel="overview">
          <header class="view-header"><div><span class="eyebrow">Resumo</span><h2>Visão geral</h2></div><p>Pessoas, sessões, contas e leitura permanecem métricas distintas.</p></header>
          <div id="overview-content" class="loading">Consultando dados reais…</div>
        </section>

        <section class="view" data-panel="funnel" hidden>
          <header class="view-header"><div><span class="eyebrow">Travessia pública</span><h2>Funil</h2></div><p>Alcance por seção, VSL, CTA e início de checkout, sem atribuição comercial presumida.</p></header>
          <div id="funnel-content" class="loading">Aguardando consulta…</div>
        </section>

        <section class="view" data-panel="reading" hidden>
          <header class="view-header"><div><span class="eyebrow">Estado atual</span><h2>Leitura</h2></div><p>Checkpoint consolidado por usuário e documento.</p></header>
          <form id="reading-filters" class="inline-filters">
            <label>ID do usuário <input name="user_id" inputmode="numeric" /></label>
            <label>Livro <input name="book_id" placeholder="manual-do-despertar" /></label>
            <label>Documento <input name="document_id" placeholder="manual" /></label>
            <label>Status <select name="status"><option value="">Todos</option><option>started</option><option>reading</option><option>completed</option></select></label>
            <button class="button" type="submit">Filtrar</button>
          </form>
          <div id="reading-content" class="loading">Aguardando consulta…</div>
        </section>

        <section class="view" data-panel="users" hidden>
          <header class="view-header"><div><span class="eyebrow">Contas internas</span><h2>Usuários</h2></div><p>Identificadores internos e atividade mínima, sem e-mail ou credenciais.</p></header>
          <form id="users-filters" class="inline-filters">
            <label>Status <select name="status"><option value="">Todos</option><option>pending</option><option>active</option><option>suspended</option><option>revoked</option></select></label>
            <button class="button" type="submit">Filtrar</button>
          </form>
          <div id="users-content" class="loading">Aguardando consulta…</div>
        </section>

        <section class="view" data-panel="journey" hidden>
          <header class="view-header"><div><span class="eyebrow">Seleção explícita</span><h2>Jornada individual</h2></div><p>Abra uma jornada a partir da lista de usuários ou informe um ID interno.</p></header>
          <form id="journey-form" class="inline-filters">
            <label>ID do usuário <input name="user_id" inputmode="numeric" required /></label>
            <button class="button button--primary" type="submit">Consultar jornada</button>
          </form>
          <div id="journey-content" class="empty">Nenhum usuário selecionado.</div>
        </section>
      </section>
    </section>
    <p class="footer-note">PSEU · arquivo interno reservado · sem comandos de escrita</p>
  </main>
  <script src="/js/admin-observability.js" defer></script>
</body>
</html>`;
}

module.exports = { renderAiPanelPage };
