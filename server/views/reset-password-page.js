function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderResetPasswordPage({
  token = "",
  tokenValid = false,
  supportEmail = "pseu.oficial@gmail.com",
} = {}) {
  const safeToken = escapeHtml(token);
  const safeSupportEmail = escapeHtml(supportEmail);

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redefinir senha | Portal PSEU</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #040403;
      --panel: rgba(12, 10, 8, 0.92);
      --gold: #d7ad62;
      --gold-soft: rgba(215, 173, 98, 0.28);
      --line: rgba(215, 173, 98, 0.2);
      --text: #f4eee2;
      --muted: rgba(244, 238, 226, 0.68);
      --dim: rgba(244, 238, 226, 0.45);
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
        radial-gradient(circle at 22% 78%, rgba(215, 173, 98, 0.13), transparent 20rem),
        radial-gradient(circle at 82% 36%, rgba(74, 116, 112, 0.18), transparent 28rem),
        linear-gradient(115deg, rgba(4, 4, 3, 0.98), rgba(9, 8, 10, 0.95) 48%, rgba(3, 8, 9, 0.96)),
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
        linear-gradient(90deg, rgba(4, 4, 3, 0.96) 0 24%, rgba(4, 4, 3, 0.72) 55%, rgba(4, 4, 3, 0.86) 100%),
        radial-gradient(circle at 76% 48%, rgba(215, 173, 98, 0.2), transparent 22rem),
        url("/PCL/assets/images/visuals/portal-entry-16x9.svg") center right / cover no-repeat;
      opacity: 0.58;
    }

    body::after {
      background:
        linear-gradient(90deg, transparent 0 12%, rgba(215, 173, 98, 0.06) 12.2%, transparent 12.4% 87%, rgba(215, 173, 98, 0.05) 87.2%, transparent 87.4%),
        repeating-linear-gradient(0deg, transparent 0 42px, rgba(215, 173, 98, 0.028) 42px 43px, transparent 43px 86px),
        radial-gradient(circle at 50% 35%, transparent 0 18rem, rgba(0, 0, 0, 0.48) 42rem);
      opacity: 0.36;
    }

    main {
      width: min(620px, 100%);
      position: relative;
      z-index: 1;
      border: 1px solid rgba(215, 173, 98, 0.42);
      background:
        radial-gradient(circle at 88% 0%, rgba(215, 173, 98, 0.18), transparent 14rem),
        radial-gradient(circle at 50% 32%, rgba(65, 112, 132, 0.18), transparent 20rem),
        repeating-linear-gradient(0deg, transparent 0 34px, rgba(215, 173, 98, 0.025) 34px 35px),
        linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 25%),
        var(--panel);
      box-shadow:
        0 38px 100px rgba(0, 0, 0, 0.58),
        0 0 0 1px rgba(215, 173, 98, 0.09),
        inset 0 0 0 1px rgba(255, 255, 255, 0.04);
      padding: clamp(24px, 5vw, 42px);
      display: grid;
      gap: 18px;
    }

    main::before {
      content: "PROTOCOLO DE ACESSO";
      position: absolute;
      top: 18px;
      right: -34px;
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

    .eyebrow {
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 0.26em;
      font-size: 0.72rem;
    }

    h1 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2rem, 8vw, 3.4rem);
      line-height: 0.98;
      letter-spacing: 0;
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.72;
    }

    form {
      display: grid;
      gap: 14px;
      margin-top: 4px;
    }

    label {
      display: grid;
      gap: 7px;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .password-control {
      position: relative;
      display: block;
    }

    input,
    button {
      font: inherit;
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
    }

    .password-control input {
      padding-right: 54px;
    }

    input:focus {
      border-color: rgba(215, 173, 98, 0.62);
      box-shadow: 0 0 0 3px rgba(215, 173, 98, 0.1);
    }

    .password-toggle {
      position: absolute;
      top: 50%;
      right: 8px;
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      transform: translateY(-50%);
      border: 1px solid rgba(215, 173, 98, 0.22);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent),
        rgba(0, 0, 0, 0.36);
      color: rgba(244, 238, 226, 0.62);
      cursor: pointer;
      transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
    }

    .password-toggle svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .password-toggle:hover,
    .password-toggle:focus-visible,
    .password-toggle[aria-pressed="true"] {
      outline: none;
      border-color: rgba(215, 173, 98, 0.58);
      color: var(--gold);
      background:
        linear-gradient(180deg, rgba(215, 173, 98, 0.12), transparent),
        rgba(0, 0, 0, 0.46);
    }

    .submit,
    .return-link {
      min-height: 46px;
      border: 1px solid rgba(244, 205, 127, 0.72);
      color: #fff7de;
      background:
        linear-gradient(90deg, rgba(90, 59, 22, 0.94), rgba(162, 115, 43, 0.88)),
        rgba(215, 173, 98, 0.18);
      box-shadow:
        0 14px 34px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.11);
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      display: grid;
      place-items: center;
      padding: 0 18px;
      transition: border-color 0.18s ease, filter 0.18s ease;
    }

    .submit:hover,
    .submit:focus-visible,
    .return-link:hover,
    .return-link:focus-visible {
      outline: none;
      border-color: rgba(255, 226, 154, 0.9);
      filter: brightness(1.05);
    }

    .state {
      border: 1px solid var(--line);
      background:
        linear-gradient(90deg, rgba(215, 173, 98, 0.07), transparent 72%),
        rgba(0, 0, 0, 0.22);
      padding: 14px 16px;
      display: grid;
      gap: 8px;
    }

    .state strong {
      color: var(--gold);
      font-size: 0.76rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .message {
      min-height: 24px;
      color: var(--gold);
      font-size: 0.9rem;
    }

    .support {
      color: var(--dim);
      font-size: 0.82rem;
    }
  </style>
</head>
<body>
  <main>
    <span class="eyebrow">Portal PSEU</span>
    <h1>Redefinir senha</h1>
    ${tokenValid ? `
      <p>Informe uma nova senha para restaurar sua passagem ao Portal.</p>
      <form data-reset-form>
        <input name="token" type="hidden" value="${safeToken}" />
        <label>
          <span>Nova senha</span>
          <span class="password-control">
            <input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="8" required />
            <button class="password-toggle" type="button" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" aria-controls="reset-password">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2.2 10s3.1-5 7.8-5 7.8 5 7.8 5-3.1 5-7.8 5-7.8-5-7.8-5Z"></path>
                <circle cx="10" cy="10" r="2.4"></circle>
              </svg>
            </button>
          </span>
        </label>
        <label>
          <span>Confirmar nova senha</span>
          <span class="password-control">
            <input id="reset-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required />
            <button class="password-toggle" type="button" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" aria-controls="reset-confirm-password">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2.2 10s3.1-5 7.8-5 7.8 5 7.8 5-3.1 5-7.8 5-7.8-5-7.8-5Z"></path>
                <circle cx="10" cy="10" r="2.4"></circle>
              </svg>
            </button>
          </span>
        </label>
        <button class="submit" type="submit">Redefinir senha</button>
      </form>
      <div class="message" data-message aria-live="polite"></div>
    ` : `
      <div class="state">
        <strong>Link indisponivel</strong>
        <p>Este protocolo expirou ou ja foi utilizado. Solicite um novo link para restaurar o acesso.</p>
      </div>
      <a class="return-link" href="/acesso">Voltar ao acesso</a>
    `}
    <p class="support">Suporte: ${safeSupportEmail}</p>
  </main>

  <script>
    const form = document.querySelector("[data-reset-form]");
    const message = document.querySelector("[data-message]");

    function setMessage(text) {
      if (message) message.textContent = text || "";
    }

    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      const input = document.getElementById(button.getAttribute("aria-controls"));
      if (!input) return;

      button.addEventListener("click", () => {
        const shouldShow = input.type === "password";
        input.type = shouldShow ? "text" : "password";
        button.setAttribute("aria-pressed", shouldShow ? "true" : "false");
        button.setAttribute("aria-label", shouldShow ? "Ocultar senha" : "Mostrar senha");
        input.focus({ preventScroll: true });
      });
    });

    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage("Atualizando senha...");

        const data = Object.fromEntries(new FormData(form).entries());

        if (!data.token) {
          setMessage("Solicite um novo link para redefinir sua senha.");
          return;
        }

        if (String(data.password || "").length < 8) {
          setMessage("A senha precisa ter pelo menos 8 caracteres.");
          return;
        }

        if (data.password !== data.confirmPassword) {
          setMessage("As senhas informadas nao coincidem.");
          return;
        }

        try {
          const response = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            let payload = {};
            try {
              payload = await response.json();
            } catch (_parseErr) {
              payload = {};
            }

            if (payload.error === "invalid_password_reset") {
              setMessage("Verifique a nova senha e tente novamente.");
              return;
            }

            setMessage("Nao foi possivel redefinir. Solicite um novo link e tente novamente.");
            return;
          }

          setMessage("Senha redefinida. Retornando ao acesso...");
          window.setTimeout(() => window.location.assign("/acesso?mode=login"), 1200);
        } catch (_err) {
          setMessage("Falha temporaria. Tente novamente.");
        }
      });
    }
  </script>
</body>
</html>`;
}

module.exports = {
  renderResetPasswordPage,
};
