const net = require("net");
const tls = require("tls");

const smtpTimeoutMs = Number(process.env.SMTP_TIMEOUT_MS || 15000);

function getSmtpConfig() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from: process.env.SMTP_FROM || `Portal PSEU <${user || "no-reply@portal-pseu.local"}>`,
  };
}

function isSmtpConfigured() {
  const config = getSmtpConfig();
  return Boolean(config.user && config.pass);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function extractEmailAddress(value) {
  const match = String(value || "").match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function normalizeLineEndings(value) {
  return String(value || "").replace(/\r?\n/g, "\r\n");
}

function dotStuff(value) {
  return normalizeLineEndings(value).replace(/^\./gm, "..");
}

function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };

    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";

      if (/^\d{3} /.test(lastLine)) {
        cleanup();
        resolve({
          code: Number(lastLine.slice(0, 3)),
          message: buffer.trim(),
        });
      }
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const onTimeout = () => {
      cleanup();
      reject(new Error("smtp_timeout"));
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

async function expectResponse(socket, command, expectedCodes) {
  const responsePromise = readResponse(socket);
  if (command) socket.write(`${command}\r\n`);
  const response = await responsePromise;
  const expected = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];

  if (!expected.includes(response.code)) {
    throw new Error(`smtp_unexpected_response:${response.code}:${response.message}`);
  }

  return response;
}

function connectSocket(config) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.createConnection({ host: config.host, port: config.port });

    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("secureConnect", onConnect);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };

    const onConnect = () => {
      cleanup();
      socket.setTimeout(smtpTimeoutMs);
      resolve(socket);
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const onTimeout = () => {
      cleanup();
      reject(new Error("smtp_timeout"));
    };

    socket.setTimeout(smtpTimeoutMs);
    socket.once(config.secure ? "secureConnect" : "connect", onConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

function upgradeToTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: host }, () => {
      secureSocket.setTimeout(smtpTimeoutMs);
      resolve(secureSocket);
    });

    secureSocket.once("error", reject);
    secureSocket.once("timeout", () => reject(new Error("smtp_timeout")));
  });
}

function buildMessage({ from, to, subject, text, html }) {
  const boundary = `pseu-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const messageId = `${Date.now()}.${Math.random().toString(16).slice(2)}@portal-pseu`;

  return [
    `From: ${sanitizeHeader(from)}`,
    `To: ${sanitizeHeader(to)}`,
    `Subject: ${sanitizeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function sendMail({ to, subject, text, html }) {
  const config = getSmtpConfig();
  if (!isSmtpConfigured()) {
    throw new Error("smtp_not_configured");
  }

  const fromAddress = extractEmailAddress(config.from);
  const toAddress = extractEmailAddress(to);
  let socket = await connectSocket(config);

  try {
    await expectResponse(socket, null, 220);
    await expectResponse(socket, `EHLO ${config.host}`, 250);

    if (!config.secure) {
      await expectResponse(socket, "STARTTLS", 220);
      socket = await upgradeToTls(socket, config.host);
      await expectResponse(socket, `EHLO ${config.host}`, 250);
    }

    const authPayload = Buffer.from(`\u0000${config.user}\u0000${config.pass}`).toString("base64");
    await expectResponse(socket, `AUTH PLAIN ${authPayload}`, 235);
    await expectResponse(socket, `MAIL FROM:<${fromAddress}>`, 250);
    await expectResponse(socket, `RCPT TO:<${toAddress}>`, [250, 251]);
    await expectResponse(socket, "DATA", 354);

    const message = dotStuff(buildMessage({ from: config.from, to, subject, text, html }));
    await expectResponse(socket, `${message}\r\n.`, 250);
    await expectResponse(socket, "QUIT", 221);
  } finally {
    socket.end();
  }
}

async function sendPasswordResetEmail({ to, resetUrl, expiresAt }) {
  const safeUrl = escapeHtml(resetUrl);
  const expiresText = expiresAt
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(expiresAt)
    : "1 hora";

  const text = [
    "Portal PSEU",
    "",
    "Recebemos uma solicitacao para redefinir sua senha.",
    `Link de recuperacao: ${resetUrl}`,
    `Validade: ${expiresText}`,
    "",
    "Se voce nao solicitou esta acao, ignore este e-mail.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#050506;color:#f4eee2;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050506;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid rgba(215,173,98,.32);background:#0c0a08;">
            <tr>
              <td style="padding:28px;">
                <div style="color:#d7ad62;font-size:12px;letter-spacing:3px;text-transform:uppercase;">Portal PSEU</div>
                <h1 style="margin:14px 0 10px;color:#f4eee2;font-size:24px;line-height:1.2;">Redefinicao de senha</h1>
                <p style="margin:0 0 20px;color:rgba(244,238,226,.78);line-height:1.6;">Recebemos uma solicitacao para restaurar seu acesso ao Portal. O link abaixo permanece ativo por 1 hora.</p>
                <p style="margin:0 0 22px;">
                  <a href="${safeUrl}" style="display:inline-block;padding:13px 18px;background:#d7ad62;color:#120f0a;text-decoration:none;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Redefinir senha</a>
                </p>
                <p style="margin:0 0 8px;color:rgba(244,238,226,.62);line-height:1.6;">Se o botao nao abrir, use este link:</p>
                <p style="margin:0 0 18px;word-break:break-all;color:#d7ad62;line-height:1.5;">${safeUrl}</p>
                <p style="margin:0;color:rgba(244,238,226,.52);font-size:13px;line-height:1.6;">Se voce nao solicitou esta acao, ignore este e-mail.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await sendMail({
    to,
    subject: "Redefinicao de senha - Portal PSEU",
    text,
    html,
  });
}

module.exports = {
  isSmtpConfigured,
  sendMail,
  sendPasswordResetEmail,
};
