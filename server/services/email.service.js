const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const resendTimeoutMs = Number(process.env.RESEND_TIMEOUT_MS || 15000);
const passwordResetSubject = "Recupera\u00e7\u00e3o de senha - Portal PSEU";
const purchaseAccessSubject = "Seu acesso ao Portal PSEU foi liberado.";

function getResendConfig() {
  return {
    apiKey: String(process.env.RESEND_API_KEY || "").trim(),
    from: String(process.env.RESEND_FROM || "").trim(),
  };
}

function isResendConfigured() {
  const config = getResendConfig();
  return Boolean(config.apiKey && config.from);
}

function isSmtpConfigured() {
  return isResendConfigured();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeRecipients(to) {
  return Array.isArray(to)
    ? to.map((item) => String(item || "").trim()).filter(Boolean)
    : [String(to || "").trim()].filter(Boolean);
}

function maskEmailForLog(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value.includes("@")) return undefined;
  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 2))}@${domain}`;
}

function maskRecipientsForLog(recipients) {
  return recipients.map(maskEmailForLog).filter(Boolean);
}

function serializeError(error) {
  if (!error) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    status: error.status,
    response: error.response,
    cause: error.cause ? serializeError(error.cause) : undefined,
  };
}

function logResendError(context, error, details = {}) {
  console.error("[PSEU EMAIL] Falha no envio via Resend:", {
    context,
    error: serializeError(error),
    details,
  });
}

function resolveResetUrl(resetUrl) {
  const rawUrl = String(resetUrl || "").trim();
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;

  const baseUrl = String(process.env.PASSWORD_RESET_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl || !rawUrl) return rawUrl;
  if (rawUrl.startsWith("/")) return `${baseUrl}${rawUrl}`;
  return `${baseUrl}/${rawUrl}`;
}

function resolvePortalUrl(pathname = "/acesso") {
  const rawPath = String(pathname || "/acesso").trim() || "/acesso";
  if (/^https?:\/\//i.test(rawPath)) return rawPath;

  const baseUrl = String(process.env.APP_BASE_URL || process.env.PASSWORD_RESET_BASE_URL || "https://eusouportal.com")
    .trim()
    .replace(/\/+$/, "");
  if (!baseUrl) return rawPath;
  return `${baseUrl}${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;
}

async function readResendResponse(response) {
  const bodyText = await response.text();
  if (!bodyText) return null;

  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

async function sendMail({ to, subject, text, html }) {
  const config = getResendConfig();
  const recipients = normalizeRecipients(to);

  if (!isResendConfigured()) {
    const error = new Error("resend_not_configured");
    logResendError("configuration", error, {
      hasApiKey: Boolean(config.apiKey),
      hasFrom: Boolean(config.from),
    });
    throw error;
  }

  if (!recipients.length) {
    const error = new Error("resend_missing_recipient");
    logResendError("validation", error);
    throw error;
  }

  if (typeof fetch !== "function") {
    const error = new Error("resend_fetch_unavailable");
    logResendError("runtime", error);
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resendTimeoutMs);
  const payload = {
    from: config.from,
    to: recipients,
    subject,
    html,
    text,
  };

  try {
    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseBody = await readResendResponse(response);

    if (!response.ok) {
      const error = new Error(`resend_error:${response.status}`);
      error.status = response.status;
      error.response = responseBody;
      logResendError("api", error, {
        endpoint: RESEND_EMAILS_ENDPOINT,
        to: maskRecipientsForLog(recipients),
        from: config.from,
      });
      throw error;
    }

    return responseBody;
  } catch (error) {
    if (!String(error?.message || "").startsWith("resend_error:")) {
      logResendError("request", error, {
        endpoint: RESEND_EMAILS_ENDPOINT,
        to: maskRecipientsForLog(recipients),
        from: config.from,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPasswordResetEmail({ to, resetUrl, expiresAt }) {
  const absoluteResetUrl = resolveResetUrl(resetUrl);
  const safeUrl = escapeHtml(absoluteResetUrl);
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
    `Link de recuperacao: ${absoluteResetUrl}`,
    `Validade: ${expiresText}`,
    "Este link so pode ser usado uma vez.",
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
                <p style="margin:0 0 20px;color:rgba(244,238,226,.78);line-height:1.6;">Recebemos uma solicitacao para restaurar seu acesso ao Portal. O link abaixo permanece ativo por 1 hora e so pode ser usado uma vez.</p>
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
    subject: passwordResetSubject,
    text,
    html,
  });
}

async function sendPurchaseAccessEmail({ to, hasPassword = false }) {
  const accessUrl = resolvePortalUrl("/acesso");
  const resetUrl = resolvePortalUrl("/acesso?mode=forgot");
  const logoUrl = resolvePortalUrl("/PCL/assets/images/brand/pseu-logo.png");
  const safeAccessUrl = escapeHtml(accessUrl);
  const safeResetUrl = escapeHtml(resetUrl);
  const safeLogoUrl = escapeHtml(logoUrl);
  const safeEmail = escapeHtml(to);
  const passwordGuidance = hasPassword
    ? "Se voce ja possui senha, entre pelo Portal. Caso nao lembre a senha, use Redefinir senha."
    : "Se este for seu primeiro acesso, use o botao abaixo para criar sua senha com o mesmo e-mail da compra.";

  const text = [
    "Portal PSEU",
    "",
    "Bem-vindo ao Portal PSEU. Sua jornada comeca agora.",
    "Seu acesso ao Portal PSEU ja esta disponivel.",
    `E-mail da compra: ${to}`,
    passwordGuidance,
    "",
    `Criar meu primeiro acesso: ${accessUrl}`,
    `Redefinir senha: ${resetUrl}`,
    "",
    "Verifique tambem Caixa de Entrada, Spam, Promocoes e Lixo Eletronico caso nao encontre novas mensagens do Portal.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#000000;color:#f4eee2;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000000;padding:26px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid rgba(215,173,98,.28);background:#060606;">
            <tr>
              <td align="center" style="padding:28px 24px 30px;">
                <img src="${safeLogoUrl}" width="132" alt="PSEU" style="display:block;width:132px;max-width:42%;height:auto;margin:0 auto 22px;border:0;outline:none;text-decoration:none;">
                <h1 style="margin:0 0 18px;color:#f4eee2;font-size:26px;line-height:1.28;font-weight:700;letter-spacing:.01em;">Bem-vindo ao Portal PSEU.<br>Sua jornada come&ccedil;a agora.</h1>
                <p style="margin:0 0 18px;color:rgba(244,238,226,.8);font-size:15px;line-height:1.65;">Seu acesso ao Portal PSEU ja esta disponivel.</p>
                <p style="margin:0 0 18px;color:rgba(244,238,226,.74);font-size:15px;line-height:1.65;">O acesso esta vinculado ao mesmo e-mail utilizado na compra:<br><strong style="color:#d7ad62;">${safeEmail}</strong></p>
                <p style="margin:0 0 24px;color:rgba(244,238,226,.72);font-size:15px;line-height:1.65;">${escapeHtml(passwordGuidance)}</p>
                <p style="margin:0 0 22px;">
                  <a href="${safeAccessUrl}" style="display:inline-block;width:100%;max-width:320px;padding:15px 18px;background:#d7ad62;color:#080706;text-decoration:none;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-align:center;">CRIAR MEU PRIMEIRO ACESSO</a>
                </p>
                <p style="margin:0 0 10px;color:rgba(244,238,226,.62);font-size:14px;line-height:1.6;">Se voce ja possui senha e nao lembra o acesso, use Redefinir senha.</p>
                <p style="margin:0 0 20px;">
                  <a href="${safeResetUrl}" style="display:inline-block;padding:11px 16px;border:1px solid rgba(215,173,98,.48);color:#f4eee2;text-decoration:none;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Redefinir senha</a>
                </p>
                <p style="margin:0;color:rgba(244,238,226,.54);font-size:13px;line-height:1.6;">Confira tambem Caixa de Entrada, Spam, Promocoes e Lixo Eletronico.</p>
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
    subject: purchaseAccessSubject,
    text,
    html,
  });
}

module.exports = {
  isResendConfigured,
  isSmtpConfigured,
  sendMail,
  sendPasswordResetEmail,
  sendPurchaseAccessEmail,
};
