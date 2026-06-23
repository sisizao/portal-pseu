function renderAccessPage({ supportEmail = "pseu.oficial@gmail.com" } = {}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Acesso | Portal PSEU</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #040403;
      --panel: rgba(12, 10, 8, 0.92);
      --panel-strong: rgba(3, 3, 4, 0.76);
      --panel-soft: rgba(255, 255, 255, 0.035);
      --gold: #d7ad62;
      --gold-soft: rgba(215, 173, 98, 0.28);
      --gold-faint: rgba(215, 173, 98, 0.12);
      --line: rgba(215, 173, 98, 0.18);
      --blue-glow: rgba(65, 112, 132, 0.18);
      --text: #f4eee2;
      --muted: rgba(244, 238, 226, 0.68);
      --dim: rgba(244, 238, 226, 0.42);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: clamp(18px, 4vw, 42px);
      color: var(--text);
      background:
        radial-gradient(circle at 18% 82%, rgba(215, 173, 98, 0.14), transparent 20rem),
        radial-gradient(circle at 82% 42%, rgba(74, 116, 112, 0.18), transparent 28rem),
        linear-gradient(115deg, rgba(4, 4, 3, 0.98), rgba(9, 8, 10, 0.94) 46%, rgba(3, 8, 9, 0.96)),
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.022) 0 1px, transparent 1px 86px),
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
        linear-gradient(90deg, rgba(4, 4, 3, 0.98) 0 22%, rgba(4, 4, 3, 0.72) 52%, rgba(4, 4, 3, 0.78) 100%),
        radial-gradient(circle at 76% 48%, rgba(215, 173, 98, 0.22), transparent 22rem),
        url("/PCL/assets/images/visuals/portal-entry-16x9.svg") center right / cover no-repeat;
      opacity: 0.64;
    }

    body::after {
      background:
        linear-gradient(90deg, transparent 0 12%, rgba(215, 173, 98, 0.06) 12.2%, transparent 12.4% 87%, rgba(215, 173, 98, 0.05) 87.2%, transparent 87.4%),
        repeating-linear-gradient(0deg, transparent 0 42px, rgba(215, 173, 98, 0.028) 42px 43px, transparent 43px 86px),
        radial-gradient(circle at 50% 35%, transparent 0 18rem, rgba(0, 0, 0, 0.48) 42rem),
        repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.024) 0 1px, transparent 1px 5px);
      opacity: 0.34;
    }

    main {
      width: min(1120px, 100%);
      display: grid;
      grid-template-columns: minmax(0, 0.92fr) minmax(340px, 0.98fr);
      gap: clamp(22px, 5vw, 64px);
      align-items: center;
      position: relative;
      z-index: 1;
    }

    main::before {
      content: "";
      position: absolute;
      inset: clamp(-18px, -2vw, -10px);
      border: 1px solid rgba(215, 173, 98, 0.08);
      background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.018), transparent 18% 82%, rgba(255, 255, 255, 0.018)),
        rgba(0, 0, 0, 0.08);
      pointer-events: none;
      z-index: -3;
    }

    main::after {
      content: "";
      position: absolute;
      right: clamp(-78px, -6vw, -22px);
      top: 50%;
      width: min(38vw, 440px);
      height: min(76vh, 680px);
      transform: translateY(-50%);
      border: 1px solid rgba(215, 173, 98, 0.18);
      border-bottom-color: rgba(215, 173, 98, 0.08);
      border-radius: 220px 220px 28px 28px;
      pointer-events: none;
      z-index: -2;
      opacity: 0.72;
      background:
        radial-gradient(circle at 50% 42%, rgba(215, 173, 98, 0.2), transparent 8rem),
        radial-gradient(circle at 50% 55%, rgba(75, 120, 134, 0.22), transparent 16rem),
        linear-gradient(180deg, rgba(215, 173, 98, 0.06), rgba(0, 0, 0, 0.04) 35%, rgba(0, 0, 0, 0.36));
      box-shadow:
        0 0 90px rgba(215, 173, 98, 0.08),
        inset 0 0 0 18px rgba(0, 0, 0, 0.24),
        inset 0 0 120px rgba(215, 173, 98, 0.08);
    }

    .access-copy {
      display: grid;
      gap: 20px;
      min-width: 0;
      position: relative;
    }

    .access-copy::before {
      content: "";
      position: absolute;
      left: -18px;
      bottom: 72px;
      width: min(420px, 72vw);
      height: 164px;
      pointer-events: none;
      z-index: -1;
      opacity: 0.52;
      transform: rotate(-2deg);
      background:
        linear-gradient(0deg, rgba(215, 173, 98, 0.08), rgba(215, 173, 98, 0.02) 42%, transparent 43%),
        repeating-linear-gradient(0deg, rgba(215, 173, 98, 0.12) 0 1px, rgba(0, 0, 0, 0.36) 1px 34px, rgba(215, 173, 98, 0.08) 34px 35px),
        linear-gradient(90deg, rgba(0, 0, 0, 0.52), rgba(82, 55, 22, 0.18), transparent);
      border-left: 1px solid rgba(215, 173, 98, 0.22);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.46);
    }

    .access-copy::after {
      content: "";
      position: absolute;
      right: 8%;
      top: 8%;
      width: 150px;
      height: 150px;
      border: 1px solid rgba(215, 173, 98, 0.12);
      border-radius: 50%;
      pointer-events: none;
      opacity: 0.42;
      background:
        radial-gradient(circle, rgba(215, 173, 98, 0.12) 0 5px, transparent 6px),
        radial-gradient(circle, transparent 0 44%, rgba(215, 173, 98, 0.08) 45% 46%, transparent 47%),
        conic-gradient(from 25deg, transparent 0 18%, rgba(215, 173, 98, 0.16) 18% 19%, transparent 19% 52%, rgba(215, 173, 98, 0.14) 52% 53%, transparent 53%);
      filter: blur(0.1px);
    }

    .archive-seal {
      position: relative;
      width: 70px;
      height: 70px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(215, 173, 98, 0.36);
      background:
        linear-gradient(145deg, rgba(215, 173, 98, 0.16), rgba(255, 255, 255, 0.02)),
        rgba(0, 0, 0, 0.36);
      color: var(--gold);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 2.2rem;
      box-shadow:
        0 24px 54px rgba(0, 0, 0, 0.42),
        inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    }

    .archive-seal::before {
      content: "";
      position: absolute;
      inset: 10px;
      border: 1px solid rgba(215, 173, 98, 0.28);
      border-radius: 50%;
      box-shadow:
        0 0 0 7px rgba(215, 173, 98, 0.025),
        inset 0 0 18px rgba(215, 173, 98, 0.1);
    }

    .archive-seal::after {
      content: "Arquivo reservado";
      position: absolute;
      left: 86px;
      top: 25px;
      width: max-content;
      color: rgba(215, 173, 98, 0.58);
      font-size: 0.68rem;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    }

    .eyebrow,
    .access-panel__eyebrow,
    .access-note span {
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 0.26em;
      font-size: 0.72rem;
    }

    h1 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(3.2rem, 9vw, 6.8rem);
      line-height: 0.86;
      letter-spacing: 0;
      max-width: 7ch;
      text-wrap: balance;
      text-shadow:
        0 1px 0 rgba(215, 173, 98, 0.2),
        0 28px 60px rgba(0, 0, 0, 0.62);
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.72;
    }

    .lead {
      max-width: 36rem;
      font-size: clamp(1rem, 1.7vw, 1.18rem);
    }

    .access-copy > .lead:not(.lead--reserved),
    .access-copy > .access-note:not(.access-note--purchase) {
      display: none;
    }

    .access-artifacts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      max-width: 34rem;
      margin-top: 2px;
      position: relative;
    }

    .access-ledger {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      max-width: 34rem;
      padding: 10px;
      border: 1px solid rgba(215, 173, 98, 0.16);
      background:
        linear-gradient(90deg, rgba(215, 173, 98, 0.05), transparent 42%, rgba(65, 112, 132, 0.04)),
        rgba(0, 0, 0, 0.26);
      box-shadow:
        0 18px 44px rgba(0, 0, 0, 0.22),
        inset 0 0 0 1px rgba(255, 255, 255, 0.02);
    }

    .access-ledger__item {
      position: relative;
      min-height: 78px;
      padding: 12px 12px 12px 42px;
      display: grid;
      align-content: center;
      gap: 4px;
      border: 1px solid rgba(215, 173, 98, 0.12);
      background:
        radial-gradient(circle at 88% 12%, rgba(215, 173, 98, 0.1), transparent 3.6rem),
        rgba(3, 3, 4, 0.52);
    }

    .access-ledger__item::before {
      content: "";
      position: absolute;
      left: 14px;
      top: 50%;
      width: 15px;
      height: 15px;
      border: 1px solid rgba(215, 173, 98, 0.42);
      transform: translateY(-50%) rotate(45deg);
      box-shadow:
        0 0 0 5px rgba(215, 173, 98, 0.025),
        0 0 18px rgba(215, 173, 98, 0.08);
    }

    .access-ledger__item span {
      color: rgba(215, 173, 98, 0.72);
      font-size: 0.58rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .access-ledger__item strong {
      color: rgba(244, 238, 226, 0.92);
      font-size: 0.85rem;
      line-height: 1.25;
    }

    .artifact {
      min-height: 92px;
      border: 1px solid rgba(215, 173, 98, 0.22);
      background:
        radial-gradient(circle at 82% 18%, rgba(215, 173, 98, 0.12), transparent 3.8rem),
        linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 35%),
        rgba(3, 3, 4, 0.68);
      position: relative;
      overflow: hidden;
      padding: 12px;
      display: grid;
      align-content: end;
      gap: 5px;
      box-shadow:
        0 16px 36px rgba(0, 0, 0, 0.24),
        inset 0 0 0 1px rgba(255, 255, 255, 0.025);
    }

    .artifact::before {
      content: "";
      position: absolute;
      inset: 12px 14px auto auto;
      width: 22px;
      height: 32px;
      border: 1px solid rgba(215, 173, 98, 0.28);
      background: rgba(215, 173, 98, 0.05);
      transform: rotate(3deg);
    }

    .artifact--key::before {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border-color: rgba(215, 173, 98, 0.34);
      box-shadow:
        16px 14px 0 -14px rgba(215, 173, 98, 0.8),
        25px 14px 0 -14px rgba(215, 173, 98, 0.8);
    }

    .artifact--eye::before {
      width: 42px;
      height: 22px;
      border-radius: 50%;
      transform: rotate(-8deg);
      box-shadow: inset 0 0 0 8px rgba(215, 173, 98, 0.035);
    }

    .artifact span {
      color: var(--gold);
      font-size: 0.62rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .artifact strong {
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 600;
    }

    .artifact strong::after {
      content: "";
      display: block;
      width: 42px;
      height: 1px;
      margin-top: 8px;
      background: linear-gradient(90deg, rgba(215, 173, 98, 0.72), transparent);
    }

    .access-note {
      max-width: 31rem;
      border: 1px solid rgba(215, 173, 98, 0.2);
      border-left-color: rgba(215, 173, 98, 0.52);
      padding: 14px 16px;
      display: grid;
      gap: 8px;
      background:
        linear-gradient(90deg, rgba(215, 173, 98, 0.07), transparent 72%),
        rgba(0, 0, 0, 0.22);
    }

    .access-copy__links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 18px;
      align-items: center;
    }

    .support {
      font-size: 0.8rem;
      color: rgba(244, 238, 226, 0.52);
    }

    .funnel-link {
      width: fit-content;
      color: var(--muted);
      font-size: 0.88rem;
      text-decoration: none;
      border-bottom: 1px solid rgba(215, 173, 98, 0.34);
    }

    .funnel-link:hover,
    .funnel-link:focus-visible {
      color: var(--text);
      border-bottom-color: var(--gold);
      outline: none;
    }

    .access-panel {
      border: 1px solid rgba(215, 173, 98, 0.44);
      background:
        radial-gradient(circle at 84% 0%, rgba(215, 173, 98, 0.2), transparent 15rem),
        radial-gradient(circle at 50% 32%, var(--blue-glow), transparent 20rem),
        repeating-linear-gradient(0deg, transparent 0 34px, rgba(215, 173, 98, 0.025) 34px 35px),
        linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 25%),
        linear-gradient(145deg, rgba(215, 173, 98, 0.08), transparent 38%),
        var(--panel);
      box-shadow:
        0 38px 100px rgba(0, 0, 0, 0.58),
        0 0 0 1px rgba(215, 173, 98, 0.09),
        0 0 80px rgba(215, 173, 98, 0.06),
        inset 0 0 0 1px rgba(255, 255, 255, 0.04);
      padding: clamp(22px, 4vw, 38px);
      display: grid;
      gap: 20px;
      position: relative;
      overflow: hidden;
    }

    .access-panel::before {
      content: "ARQUIVO RESERVADO";
      position: absolute;
      top: 18px;
      right: -36px;
      width: 190px;
      padding: 6px 0;
      text-align: center;
      transform: rotate(34deg);
      border-top: 1px solid rgba(215, 173, 98, 0.3);
      border-bottom: 1px solid rgba(215, 173, 98, 0.3);
      color: rgba(215, 173, 98, 0.5);
      font-size: 0.56rem;
      letter-spacing: 0.22em;
    }

    .access-panel::after {
      content: "";
      position: absolute;
      inset: 18px;
      border: 1px solid rgba(215, 173, 98, 0.1);
      pointer-events: none;
      background:
        linear-gradient(90deg, rgba(215, 173, 98, 0.16), transparent 14% 86%, rgba(215, 173, 98, 0.12)),
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 18%);
      mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      mask-composite: exclude;
      padding: 1px;
      opacity: 0.7;
    }

    .access-panel__header {
      display: grid;
      gap: 8px;
      padding: 18px 62px 8px 0;
      position: relative;
      z-index: 1;
    }

    .access-panel__header::before,
    .access-panel__header::after {
      content: "";
      position: absolute;
      right: 0;
      pointer-events: none;
    }

    .access-panel__header::before {
      top: 8px;
      width: 46px;
      height: 46px;
      border: 1px solid rgba(215, 173, 98, 0.42);
      border-radius: 50%;
      background:
        radial-gradient(circle, rgba(215, 173, 98, 0.22) 0 4px, transparent 5px),
        radial-gradient(circle, transparent 0 45%, rgba(215, 173, 98, 0.1) 46% 48%, transparent 49%);
      box-shadow:
        0 0 30px rgba(215, 173, 98, 0.1),
        inset 0 0 18px rgba(0, 0, 0, 0.42);
    }

    .access-panel__header::after {
      top: 27px;
      width: 50px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(215, 173, 98, 0.68), transparent);
    }

    .access-panel__eyebrow {
      color: transparent;
      font-size: 0;
    }

    .access-panel__eyebrow::before {
      content: "Conex\\00e3o interna";
      color: var(--gold);
      font-size: 0.72rem;
      letter-spacing: 0.26em;
    }

    .access-panel__header strong {
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(1.5rem, 4vw, 2.25rem);
      font-weight: 700;
      line-height: 1;
    }

    .access-panel__header p {
      max-width: 32rem;
      font-size: 0;
      line-height: 0;
    }

    .access-panel__header p::before {
      content: "Confirme sua presen\\00e7 a para abrir o Portal protegido.";
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.65;
    }

    .purchase-reminder {
      border: 1px solid rgba(215, 173, 98, 0.2);
      background:
        linear-gradient(90deg, rgba(215, 173, 98, 0.08), transparent 78%),
        rgba(0, 0, 0, 0.24);
      padding: 13px 14px 13px 48px;
      color: rgba(244, 238, 226, 0.78);
      font-size: 0.9rem;
      line-height: 1.65;
      position: relative;
      z-index: 1;
    }

    .purchase-reminder::before {
      content: "";
      position: absolute;
      left: 15px;
      top: 17px;
      width: 18px;
      height: 18px;
      border: 1px solid rgba(215, 173, 98, 0.48);
      border-radius: 50%;
      box-shadow: 12px 9px 0 -8px rgba(215, 173, 98, 0.72);
    }

    .purchase-reminder::after {
      content: "";
      position: absolute;
      left: 29px;
      top: 29px;
      width: 18px;
      height: 1px;
      background: rgba(215, 173, 98, 0.48);
      transform: rotate(38deg);
    }

    .access-status {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      position: relative;
      z-index: 1;
    }

    .access-status div {
      border: 1px solid rgba(215, 173, 98, 0.16);
      background: var(--panel-strong);
      padding: 10px;
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .access-status span {
      color: var(--dim);
      font-size: 0.64rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .access-status div:nth-child(2) span {
      font-size: 0;
    }

    .access-status div:nth-child(2) span::before {
      content: "Sess\\00e3o";
      font-size: 0.64rem;
    }

    .access-status strong {
      color: var(--text);
      font-size: 0.78rem;
      white-space: nowrap;
    }

    .tabs {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      padding: 4px;
      border: 1px solid rgba(215, 173, 98, 0.14);
      background: rgba(0, 0, 0, 0.26);
      position: relative;
      z-index: 1;
    }

    button,
    input {
      font: inherit;
    }

    .tab,
    .submit {
      min-height: 46px;
      border: 1px solid rgba(215, 173, 98, 0.25);
      color: var(--text);
      background: rgba(255, 255, 255, 0.025);
      cursor: pointer;
      transition:
        border-color 0.18s ease,
        background 0.18s ease,
        filter 0.18s ease;
    }

    .tab {
      color: var(--muted);
    }

    .tab.is-active,
    .submit {
      color: #fff7de;
      background:
        linear-gradient(90deg, rgba(90, 59, 22, 0.94), rgba(162, 115, 43, 0.88)),
        rgba(215, 173, 98, 0.18);
      border-color: rgba(244, 205, 127, 0.72);
      box-shadow:
        0 14px 34px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.11);
    }

    .submit:hover,
    .submit:focus-visible,
    .tab:focus-visible {
      outline: none;
      border-color: rgba(255, 226, 154, 0.9);
      filter: brightness(1.05);
    }

    form {
      display: none;
      gap: 14px;
      position: relative;
      z-index: 1;
    }

    form.is-active {
      display: grid;
    }

    label {
      display: grid;
      gap: 7px;
      color: var(--muted);
      font-size: 0.9rem;
      letter-spacing: 0.01em;
    }

    input {
      width: 100%;
      min-height: 50px;
      border: 1px solid rgba(215, 173, 98, 0.16);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent),
        rgba(0, 0, 0, 0.56);
      color: var(--text);
      padding: 0 14px;
      outline: none;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.018);
    }

    input:focus {
      border-color: rgba(215, 173, 98, 0.62);
      box-shadow: 0 0 0 3px rgba(215, 173, 98, 0.1);
    }

    .message {
      min-height: 24px;
      color: var(--gold);
      font-size: 0.9rem;
      position: relative;
      z-index: 1;
    }

    @media (max-width: 820px) {
      main {
        grid-template-columns: 1fr;
      }

      h1 {
        max-width: none;
      }

      .access-artifacts {
        max-width: none;
      }

      .access-ledger {
        max-width: none;
      }

      main::after {
        display: none;
      }

      .access-copy::before {
        bottom: 110px;
        width: min(520px, 92vw);
      }

      .access-status {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 520px) {
      body {
        place-items: start center;
      }

      .tabs {
        grid-template-columns: 1fr;
      }

      .archive-seal {
        width: 58px;
        height: 58px;
        font-size: 1.7rem;
      }

      .archive-seal::after {
        left: 70px;
        top: 20px;
        font-size: 0.58rem;
        letter-spacing: 0.18em;
      }

      .access-artifacts {
        grid-template-columns: 1fr;
      }

      .access-ledger {
        grid-template-columns: 1fr;
      }

      .access-copy::before,
      .access-copy::after {
        display: none;
      }

      .artifact {
        min-height: 78px;
      }

      .access-panel {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="access-copy">
      <div class="archive-seal" aria-hidden="true">P</div>
      <span class="eyebrow">Acesso reservado</span>
      <h1>Portal PSEU</h1>
      <p class="lead lead--reserved">A entrada reconhece apenas quem possui passagem ativa. O arquivo interno preserva os livros, a travessia e os sinais que n&atilde;o pertencem ao funil p&uacute;blico.</p>
      <div class="access-ledger" aria-label="O que existe dentro do Portal">
        <div class="access-ledger__item">
          <span>Biblioteca</span>
          <strong>18 arquivos no percurso</strong>
        </div>
        <div class="access-ledger__item">
          <span>Leitura</span>
          <strong>Ambiente reservado</strong>
        </div>
        <div class="access-ledger__item">
          <span>Travessia</span>
          <strong>Sequ&ecirc;ncia preservada</strong>
        </div>
        <div class="access-ledger__item">
          <span>Prote&ccedil;&atilde;o</span>
          <strong>Acesso reconhecido por e-mail</strong>
        </div>
      </div>
      <div class="access-artifacts" aria-hidden="true">
        <div class="artifact artifact--book">
          <span>Livro</span>
          <strong>Biblioteca interna</strong>
        </div>
        <div class="artifact artifact--key">
          <span>Chave</span>
          <strong>Passagem validada</strong>
        </div>
        <div class="artifact artifact--eye">
          <span>Sinal</span>
          <strong>Arquivo observado</strong>
        </div>
      </div>
      <div class="access-note access-note--purchase">
        <span>&Aacute;rea protegida</span>
        <p>Use o mesmo e-mail utilizado na compra para criar sua conta. O sistema reconhece seu acesso atrav&eacute;s desse e-mail.</p>
      </div>
      <p class="lead">A entrada reconhece apenas quem possui passagem ativa. O arquivo interno preserva os livros, a travessia e os sinais que não pertencem ao funil público.</p>
      <div class="access-note">
        <span>Área protegida</span>
        <p>Use o e-mail da compra ou a senha já criada para atravessar para o ambiente interno.</p>
      </div>
      <div class="access-copy__links">
        <p class="support">Suporte: ${supportEmail}</p>
      </div>
    </section>

    <section class="access-panel" aria-label="Acesso ao Portal PSEU">
      <div class="access-panel__header">
        <span class="access-panel__eyebrow">Conexão interna</span>
        <strong>Entrada do arquivo</strong>
        <p>Confirme sua presença para abrir o Portal protegido.</p>
      </div>

      <p class="purchase-reminder">Use o mesmo e-mail utilizado na compra para criar sua conta. O sistema reconhece seu acesso atrav&eacute;s desse e-mail.</p>

      <div class="access-status" aria-hidden="true">
        <div>
          <span>Estado</span>
          <strong>Reservado</strong>
        </div>
        <div>
          <span>Sessão</span>
          <strong>Verificada</strong>
        </div>
        <div>
          <span>Destino</span>
          <strong>/portal</strong>
        </div>
      </div>

      <div class="tabs" role="tablist">
        <button class="tab is-active" type="button" data-mode="claim">Primeiro acesso</button>
        <button class="tab" type="button" data-mode="login">Login</button>
      </div>

      <form class="is-active" data-form="claim">
        <label>
          E-mail da compra
          <input name="email" type="email" autocomplete="email" required />
        </label>
        <label>
          Criar senha
          <input name="password" type="password" autocomplete="new-password" minlength="8" required />
        </label>
        <button class="submit" type="submit">Ativar acesso</button>
      </form>

      <form data-form="login">
        <label>
          E-mail
          <input name="email" type="email" autocomplete="email" required />
        </label>
        <label>
          Senha
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button class="submit" type="submit">Entrar no Portal</button>
      </form>

      <div class="message" data-message aria-live="polite"></div>
    </section>
  </main>

  <script>
    const tabs = document.querySelectorAll("[data-mode]");
    const forms = document.querySelectorAll("[data-form]");
    const message = document.querySelector("[data-message]");
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo") || "/portal";

    function setMessage(text) {
      message.textContent = text || "";
    }

    function setMode(mode) {
      tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.mode === mode));
      forms.forEach((form) => form.classList.toggle("is-active", form.dataset.form === mode));
      setMessage("");
    }

    tabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));

    async function submitAuth(mode, form) {
      setMessage("Verificando acesso...");
      const data = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/auth/" + mode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const copy = mode === "claim"
          ? "Nao foi possivel ativar. Confira o e-mail da compra e a senha."
          : "Login nao autorizado. Confira e-mail e senha.";
        setMessage(copy);
        return;
      }

      setMessage("Acesso confirmado. Abrindo o Portal...");
      window.location.assign(returnTo);
    }

    forms.forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitAuth(form.dataset.form, form).catch(() => {
          setMessage("Falha temporaria. Tente novamente.");
        });
      });
    });

    fetch("/api/auth/me", { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((auth) => {
        if (auth && auth.authenticated) window.location.assign(returnTo);
      })
      .catch(() => {});
  </script>
</body>
</html>`;
}

module.exports = {
  renderAccessPage,
};
