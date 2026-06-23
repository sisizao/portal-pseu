const fs = require("fs/promises");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const indexPath = path.join(projectRoot, "index.html");

const portalCriticalStyle = `<style>
body.is-protected-portal .preportal,
body.is-protected-portal .preportal-page,
body.is-protected-portal [data-fragment-reader],
body.is-protected-portal .traversal-veil {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
  height: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

body.is-protected-portal .app-shell {
  display: grid !important;
}

.portal-admin-link {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 8px 11px;
  font-size: 0.68rem;
  text-decoration: none;
  white-space: nowrap;
}
</style>`;

const portalAdminLink = `<a class="button button--ghost portal-admin-link" href="/ia-pseu">Painel IA</a>`;

const portalRouteScript = `<script>
window.PSEU_FORCE_INTERNAL_PORTAL = true;
try {
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
} catch (error) {}
</script>`;

const portalAuthScript = `<script>
(function () {
  async function requirePortalSession() {
    try {
      const authResponse = await fetch("/api/auth/me", { credentials: "include" });
      const auth = authResponse.ok ? await authResponse.json() : null;

      if (!auth || !auth.authenticated) {
        window.location.replace("/acesso?returnTo=/portal");
        return;
      }

      window.PSEU_AUTH_USER = auth.user;
      document.body.classList.add("is-authenticated-portal", "is-protected-portal", "is-portal-unlocked");

      try {
        const booksResponse = await fetch("/api/books", { credentials: "include" });
        if (booksResponse.ok) {
          window.PSEU_PORTAL_BOOKS = await booksResponse.json();
          window.dispatchEvent(new CustomEvent("pseu:books-ready", { detail: window.PSEU_PORTAL_BOOKS }));
        }
      } catch (error) {
        console.warn("[PSEU AUTH] Livros protegidos ainda nao foram carregados.", error);
      }
    } catch (error) {
      window.location.replace("/acesso?returnTo=/portal");
    }
  }

  requirePortalSession();
})();
</script>`;

function removeExternalFunnel(html) {
  const funnelMatch = html.match(/<main\b[^>]*\bid=["']funil["'][^>]*>/i);
  const portalMatch = html.match(/<div\b(?=[^>]*\bclass=["'][^"']*\bapp-shell\b[^"']*["'])(?=[^>]*\bid=["']portal-interno["'])[^>]*>/i);
  const funnelStart = funnelMatch?.index ?? -1;
  const portalStart = portalMatch?.index ?? -1;

  if (funnelStart < 0 || portalStart < 0 || portalStart <= funnelStart) {
    return html;
  }

  return `${html.slice(0, funnelStart)}${html.slice(portalStart)}`;
}

function addAdminPanelLink(html) {
  const logoutButton = '<button class="button button--ghost portal-logout" type="button" data-action="logout">Sair</button>';
  if (!html.includes(logoutButton)) return html;
  return html.replace(logoutButton, `${portalAdminLink}\n          ${logoutButton}`);
}

async function renderProtectedPortal({ showAdminPanelLink = false } = {}) {
  const baseHtml = removeExternalFunnel(await fs.readFile(indexPath, "utf8"));
  const html = showAdminPanelLink ? addAdminPanelLink(baseHtml) : baseHtml;
  const mainScriptPattern = /<script src="js\/main\.js(?:\?[^"]*)?"><\/script>/;
  const htmlWithProtectedBody = html.replace("<body>", '<body class="is-protected-portal is-portal-unlocked" data-protected-portal="true">');
  const htmlWithCriticalStyle = htmlWithProtectedBody.includes("</head>")
    ? htmlWithProtectedBody.replace("</head>", `${portalCriticalStyle}\n</head>`)
    : `${portalCriticalStyle}\n${htmlWithProtectedBody}`;
  const htmlWithPortalRoute = mainScriptPattern.test(htmlWithCriticalStyle)
    ? htmlWithCriticalStyle.replace(mainScriptPattern, `${portalRouteScript}\n  $&`)
    : `${portalRouteScript}\n${htmlWithCriticalStyle}`;

  if (!htmlWithPortalRoute.includes("</body>")) {
    return `${htmlWithPortalRoute}\n${portalAuthScript}`;
  }

  return htmlWithPortalRoute.replace("</body>", `${portalAuthScript}\n</body>`);
}

module.exports = {
  renderProtectedPortal,
};
