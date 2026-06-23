function requireAuth(req, res, next) {
  if (req.session?.userId) {
    return next();
  }

  const wantsHtml = !req.path.startsWith("/api") && req.accepts("html");
  if (wantsHtml) {
    const returnTo = encodeURIComponent(req.originalUrl || "/portal");
    return res.redirect(302, `/acesso?returnTo=${returnTo}`);
  }

  return res.status(401).json({
    error: "unauthorized",
    message: "Sessao necessaria para acessar esta rota.",
  });
}

module.exports = requireAuth;
