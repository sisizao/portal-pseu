function renderThankYouPage({ supportEmail = "pseu.oficial@gmail.com" } = {}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Compra confirmada | Portal PSEU</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #040403;
      --panel: rgba(14, 12, 9, 0.9);
      --panel-strong: rgba(3, 3, 4, 0.72);
      --gold: #d7ad62;
      --gold-soft: rgba(215, 173, 98, 0.28);
      --gold-faint: rgba(215, 173, 98, 0.12);
      --text: #f4eee2;
      --muted: rgba(244, 238, 226, 0.7);
      --dim: rgba(244, 238, 226, 0.48);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: clamp(18px, 4vw, 44px);
      color: var(--text);
      background:
        linear-gradient(115deg, rgba(4, 4, 3, 0.94), rgba(9, 8, 10, 0.96) 48%, rgba(3, 8, 9, 0.94)),
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 86px),
        var(--bg);
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
      background:
        linear-gradient(90deg, transparent 0 12%, rgba(215, 173, 98, 0.08) 12.2%, transparent 12.4% 87%, rgba(215, 173, 98, 0.06) 87.2%, transparent 87.4%),
        linear-gradient(180deg, rgba(215, 173, 98, 0.08), transparent 30%, rgba(68, 44, 16, 0.08));
      mix-blend-mode: screen;
      opacity: 0.72;
    }

    body::after {
      background: repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.026) 0 1px, transparent 1px 5px);
      opacity: 0.08;
    }

    main {
      width: min(920px, 100%);
      position: relative;
      z-index: 1;
      display: grid;
      gap: clamp(20px, 4vw, 32px);
    }

    .seal {
      width: 72px;
      height: 72px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(215, 173, 98, 0.36);
      background:
        linear-gradient(145deg, rgba(215, 173, 98, 0.16), rgba(255, 255, 255, 0.02)),
        rgba(0, 0, 0, 0.36);
      color: var(--gold);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 2.1rem;
      box-shadow:
        0 24px 54px rgba(0, 0, 0, 0.42),
        inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    }

    .panel {
      border: 1px solid var(--gold-soft);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 25%),
        linear-gradient(145deg, rgba(215, 173, 98, 0.08), transparent 38%),
        var(--panel);
      box-shadow:
        0 34px 90px rgba(0, 0, 0, 0.52),
        inset 0 0 0 1px rgba(255, 255, 255, 0.035);
      padding: clamp(22px, 5vw, 44px);
      display: grid;
      gap: 26px;
      position: relative;
      overflow: hidden;
    }

    .panel::before {
      content: "ACESSO RECONHECIDO";
      position: absolute;
      top: 18px;
      right: -42px;
      width: 210px;
      padding: 6px 0;
      text-align: center;
      transform: rotate(34deg);
      border-top: 1px solid rgba(215, 173, 98, 0.3);
      border-bottom: 1px solid rgba(215, 173, 98, 0.3);
      color: rgba(215, 173, 98, 0.5);
      font-size: 0.56rem;
      letter-spacing: 0.22em;
    }

    .eyebrow {
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 0.26em;
      font-size: 0.72rem;
    }

    h1 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(3rem, 8vw, 6rem);
      line-height: 0.9;
      letter-spacing: 0;
    }

    h2,
    p,
    ul {
      margin: 0;
    }

    h2 {
      color: var(--muted);
      font-size: clamp(1.05rem, 2vw, 1.28rem);
      font-weight: 500;
      line-height: 1.6;
    }

    .message {
      display: grid;
      gap: 12px;
      border-left: 1px solid rgba(215, 173, 98, 0.36);
      padding: 2px 0 2px 18px;
      background: linear-gradient(90deg, rgba(215, 173, 98, 0.05), transparent 72%);
      color: var(--muted);
      line-height: 1.72;
    }

    .content {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.9fr);
      gap: clamp(20px, 4vw, 34px);
      align-items: start;
    }

    .found {
      border: 1px solid rgba(215, 173, 98, 0.16);
      background: var(--panel-strong);
      padding: clamp(16px, 3vw, 22px);
      display: grid;
      gap: 14px;
    }

    .found strong {
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-size: 0.68rem;
      font-weight: 600;
    }

    ul {
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.9;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 14px 18px;
      align-items: center;
    }

    .button {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 22px;
      color: #fff7de;
      text-decoration: none;
      background:
        linear-gradient(90deg, rgba(106, 69, 20, 0.94), rgba(158, 112, 39, 0.86)),
        rgba(215, 173, 98, 0.18);
      border: 1px solid rgba(244, 205, 127, 0.72);
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.26);
    }

    .button:hover,
    .button:focus-visible {
      outline: none;
      border-color: rgba(255, 226, 154, 0.9);
      filter: brightness(1.06);
    }

    .support {
      color: var(--dim);
      font-size: 0.86rem;
    }

    @media (max-width: 760px) {
      .content {
        grid-template-columns: 1fr;
      }

      .panel::before {
        opacity: 0.65;
      }
    }

    @media (max-width: 520px) {
      body {
        place-items: start center;
      }

      .seal {
        width: 58px;
        height: 58px;
        font-size: 1.7rem;
      }
    }
  </style>
</head>
<body>
  <main>
    <div class="seal" aria-hidden="true">P</div>

    <section class="panel" aria-label="Compra confirmada">
      <div>
        <span class="eyebrow">Portal PSEU</span>
        <h1>Compra confirmada.</h1>
        <h2>Seu acesso ao Portal PSEU foi reconhecido.</h2>
      </div>

      <div class="content">
        <div class="message">
          <p>Utilize o mesmo e-mail usado na compra para criar sua conta.</p>
          <p>O sistema reconhece seu acesso atrav&eacute;s desse e-mail.</p>
          <p>Se voc&ecirc; utilizar outro e-mail, o acesso poder&aacute; n&atilde;o ser localizado automaticamente.</p>
        </div>

        <aside class="found">
          <strong>O que voc&ecirc; encontrar&aacute;</strong>
          <ul>
            <li>Biblioteca interna</li>
            <li>Arquivos protegidos</li>
            <li>Leitura reservada</li>
            <li>Conte&uacute;do em expans&atilde;o</li>
          </ul>
        </aside>
      </div>

      <div class="actions">
        <a class="button" href="/acesso">Criar conta / Acessar Portal</a>
        <span class="support">Suporte: ${supportEmail}</span>
      </div>
    </section>
  </main>
</body>
</html>`;
}

module.exports = {
  renderThankYouPage,
};
