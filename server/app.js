require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const { pool } = require("./db/pool");
const authRoutes = require("./routes/auth.routes");
const booksRoutes = require("./routes/books.routes");
const checkoutRoutes = require("./routes/checkout.routes");
const gumroadRoutes = require("./routes/gumroad.routes");
const aiPanelRoutes = require("./routes/ai-panel.routes");
const portalRoutes = require("./routes/portal.routes");
const { assetExistsSync, getPublicFragmentDescriptor } = require("./services/content-provisioning.service");

const app = express();
const PgSession = connectPgSimple(session);
const isProduction = process.env.NODE_ENV === "production";
const sessionName = process.env.SESSION_NAME || "pseu.sid";
const projectRoot = path.resolve(__dirname, "..");
const safeAssetExtensions = new Set([
  ".css",
  ".js",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".mp4",
  ".mov",
  ".srt",
]);
function sendPublicFragmentFallback(res) {
  return res.status(404).type("html").send(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fragmento em silêncio</title>
    <style>
      html,
      body {
        height: 100%;
        margin: 0;
        background: #050507;
        color: rgba(247, 240, 223, 0.88);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        display: grid;
        place-items: center;
        padding: 24px;
        text-align: center;
        background:
          radial-gradient(circle at 50% 28%, rgba(211, 167, 90, 0.16), transparent 18rem),
          linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 34%),
          #050507;
      }

      main {
        max-width: 520px;
        border: 1px solid rgba(211, 167, 90, 0.24);
        padding: clamp(24px, 6vw, 44px);
        background: rgba(4, 4, 7, 0.72);
      }

      span {
        display: block;
        margin-bottom: 12px;
        color: rgba(211, 167, 90, 0.82);
        font-size: 0.72rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      p {
        margin: 0;
        line-height: 1.55;
        letter-spacing: 0.03em;
      }
    </style>
  </head>
  <body>
    <main>
      <span>Fragmento em silêncio</span>
      <p>O fragmento público ainda não respondeu. O Centro preservou este eco para quando o arquivo voltar ao ar.</p>
    </main>
  </body>
</html>`);
}

function sendPublicFragmentPdf(req, res, next) {
  const assetPath = decodeURIComponent(req.path || "");
  const fragment = getPublicFragmentDescriptor(assetPath);
  if (!fragment) return next();

  if (!assetExistsSync(fragment.absolutePath)) {
    return sendPublicFragmentFallback(res);
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${fragment.fileName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  return res.sendFile(fragment.absolutePath, (err) => {
    if (err && !res.headersSent) return next();
    return undefined;
  });
}

app.disable("x-powered-by");
app.set("trust proxy", isProduction ? 1 : 0);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/fragmentos/manual-do-despertar.pdf", sendPublicFragmentPdf);
app.get("/livros/o livro despertar/Design sem nome.pdf", sendPublicFragmentPdf);

app.use(
  session({
    name: sessionName,
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || "dev-only-change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: Number(process.env.SESSION_MAX_AGE_MS || 1000 * 60 * 60 * 24 * 7),
    },
  })
);

app.use(sendPublicFragmentPdf);

app.use((req, res, next) => {
  const assetPath = decodeURIComponent(req.path || "");
  const extension = path.extname(assetPath).toLowerCase();
  const allowedPrefixes = [
    "/css/",
    "/js/",
    "/PCL/assets/",
    "/livros/",
    "/escesqueleto/",
    "/arsenal visual PSEU/",
  ];
  const rootAsset = assetPath.split("/").filter(Boolean).length === 1;
  const allowedPrefix = allowedPrefixes.some((prefix) => assetPath.startsWith(prefix));

  if (!safeAssetExtensions.has(extension) || (!allowedPrefix && !rootAsset)) {
    return next();
  }

  const filePath = path.normalize(path.join(projectRoot, assetPath));
  if (!filePath.startsWith(projectRoot)) {
    return res.status(403).json({ error: "asset_forbidden" });
  }

  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) return next();
    return undefined;
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "portal-pseu", mode: process.env.NODE_ENV || "development" });
});

app.use("/api/auth", authRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/webhooks", gumroadRoutes);
app.use("/", aiPanelRoutes);
app.use("/", portalRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

app.use((err, _req, res, _next) => {
  console.error("[PSEU SERVER ERROR]", err);
  res.status(500).json({ error: "internal_error" });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Portal PSEU backend ativo em http://localhost:${port}`);
  });
}

module.exports = app;
