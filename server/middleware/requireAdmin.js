const { findUserById, normalizeEmail } = require("../services/user.service");

const defaultAdminEmail = "pseu.oficial@gmail.com";

function getAdminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || defaultAdminEmail)
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
}

function isAdminEmail(email) {
  return getAdminEmails().has(normalizeEmail(email));
}

function redirectToAccess(req, res) {
  const returnTo = encodeURIComponent(req.originalUrl || "/ia-pseu");
  return res.redirect(302, `/acesso?returnTo=${returnTo}`);
}

async function requireAdmin(req, res, next) {
  try {
    if (!req.session?.userId) {
      return redirectToAccess(req, res);
    }

    const user = await findUserById(req.session.userId);
    if (!user || user.status !== "active") {
      return redirectToAccess(req, res);
    }

    if (!isAdminEmail(user.email)) {
      const wantsHtml = req.accepts("html");
      if (wantsHtml) {
        return res.status(403).send(`
          <!doctype html>
          <html lang="pt-BR">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>PSEU | Acesso reservado</title>
              <style>
                body {
                  min-height: 100vh;
                  margin: 0;
                  display: grid;
                  place-items: center;
                  background: #050407;
                  color: #f5efe4;
                  font-family: Georgia, "Times New Roman", serif;
                }
                main {
                  width: min(560px, calc(100% - 32px));
                  border: 1px solid rgba(214, 174, 96, 0.34);
                  background: rgba(12, 10, 14, 0.9);
                  padding: 34px;
                }
                span {
                  color: #d6ae60;
                  font: 700 0.72rem/1 "Segoe UI", sans-serif;
                  letter-spacing: 0.18em;
                  text-transform: uppercase;
                }
                h1 { margin: 12px 0; font-size: clamp(2rem, 6vw, 3.4rem); line-height: 0.96; }
                p { color: #c8bfb0; line-height: 1.7; }
                a { color: #d6ae60; }
              </style>
            </head>
            <body>
              <main>
                <span>Area interna</span>
                <h1>Acesso reservado.</h1>
                <p>Esta area pertence somente ao administrador do PSEU.</p>
                <p><a href="/portal">Voltar ao Portal</a></p>
              </main>
            </body>
          </html>
        `);
      }

      return res.status(403).json({ error: "admin_required" });
    }

    req.adminUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireAdmin;
module.exports.isAdminEmail = isAdminEmail;
