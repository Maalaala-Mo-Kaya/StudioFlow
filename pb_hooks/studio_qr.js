const COLLECTION = "qr_codes";
const WINDOW_SECONDS = 600;

function string(value) {
  return typeof value === "string" ? value : "";
}

function byteLength(value) {
  return encodeURIComponent(value).replace(/%[0-9a-f]{2}/gi, "x").length;
}

function expiryTime(day) {
  // Expiration is at the end of the studio's Asia/Manila calendar day.
  return Date.parse(day + "T00:00:00+08:00") + 86400000;
}

function validDestination(value) {
  // Require an absolute HTTP(S) URL with an ordinary hostname or bracketed IPv6.
  // PocketBase's JS runtime does not have the browser URL API.
  if (value.length > 1800 || /[\s\\\x00-\x1f\x7f]/.test(value)) return false;
  const match = /^https?:\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?(?:[/?#]|$)/i.exec(value);
  if (!match || (match[2] && Number(match[2]) > 65535)) return false;
  const host = match[1];
  return host.startsWith("[") ? host.includes(":") : host.replace(/\.$/, "").split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function update(record, body, creating) {
  const kind = creating ? body.kind : record.getString("kind");
  if (!["direct", "protected", "wifi"].includes(kind)) throw new BadRequestError("Choose a QR code type.");
  const name = string(body.name).trim();
  if (name.length > 120) throw new BadRequestError("Use a name of 120 characters or fewer.");
  record.set("kind", kind);
  record.set("name", name);

  if (kind === "wifi") {
    const ssid = string(body.ssid);
    if (!ssid || byteLength(ssid) > 32 || /[\x00-\x1f\x7f]/.test(ssid)) {
      throw new BadRequestError("Enter a Wi-Fi network name of up to 32 bytes.");
    }
    if (!["WPA", "WEP", "nopass"].includes(body.security)) throw new BadRequestError("Choose a Wi-Fi security type.");
    record.set("ssid", ssid);
    record.set("security", body.security);
    record.set("hidden_network", body.hiddenNetwork === true);
    return;
  }

  const destination = string(body.destination).trim();
  if (!validDestination(destination)) throw new BadRequestError("Enter a valid HTTP or HTTPS destination.");
  record.set("destination", destination);
  if (creating) record.set("slug", $security.randomString(24));
  if (typeof body.disabled === "boolean") record.set("disabled", body.disabled);

  if (kind === "protected") {
    const password = string(body.password);
    if (creating || password) {
      if (password !== body.confirmPassword || !password.trim() || /[\x00-\x1f\x7f]/.test(password)
          || byteLength(password) > 71) {
        throw new BadRequestError("Enter matching access passwords of up to 71 bytes.");
      }
      record.set("password", password);
    }
    const expiresOn = string(body.expiresOn);
    if (expiresOn) {
      const parsed = new Date(expiresOn + "T00:00:00Z");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !Number.isFinite(parsed.getTime())
          || parsed.toISOString().slice(0, 10) !== expiresOn) {
        throw new BadRequestError("Choose a valid expiration date.");
      }
    }
    record.set("expires_on", expiresOn);
  }
}

function status(record) {
  if (record.getBool("disabled")) return "disabled";
  const expiresOn = record.getString("expires_on");
  if (expiresOn && expiryTime(expiresOn) <= Date.now()) return "expired";
  return record.getString("kind") === "wifi" ? "metadata" : "active";
}

function summary(record) {
  return {
    id: record.id,
    slug: record.getString("slug"),
    kind: record.getString("kind"),
    name: record.getString("name"),
    created: record.getString("created"),
    destination: record.getString("destination"),
    expiresOn: record.getString("expires_on"),
    disabled: record.getBool("disabled"),
    status: status(record),
    ssid: record.getString("ssid"),
    security: record.getString("security"),
    hiddenNetwork: record.getBool("hidden_network"),
  };
}

function findPublic(app, slug) {
  if (!/^[a-z0-9]{24}$/i.test(slug)) return null;
  const records = app.findRecordsByFilter(COLLECTION, "slug = {:slug}", "", 1, 0, { slug });
  return records[0] || null;
}

function reserveAttempt(app, slug, ip) {
  const window = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const take = (tx, scope, limit) => tx.db().newQuery(`
    INSERT INTO studio_qr_attempts (scope, window, attempts) VALUES ({:scope}, {:window}, 1)
    ON CONFLICT(scope) DO UPDATE SET window = excluded.window,
      attempts = CASE WHEN studio_qr_attempts.window = excluded.window THEN studio_qr_attempts.attempts + 1 ELSE 1 END
    WHERE studio_qr_attempts.window != excluded.window OR studio_qr_attempts.attempts < {:limit}
  `).bind({ scope, window, limit }).execute().rowsAffected() === 1;

  let allowed;
  // Reserve before password verification so parallel requests share the same budget.
  app.runInTransaction((tx) => {
    allowed = take(tx, slug + ":" + $security.sha256(ip), 5) && take(tx, slug, 40);
  });
  return allowed ? 0 : Math.max(1, (window + 1) * WINDOW_SECONDS - Math.floor(Date.now() / 1000));
}

function pruneAttempts(app) {
  const window = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  app.db().newQuery("DELETE FROM studio_qr_attempts WHERE window < {:window}").bind({ window }).execute();
}

function noStore(e) {
  e.response.header().set("Cache-Control", "private, no-store");
  e.response.header().set("Referrer-Policy", "no-referrer");
}

function accessPage(e, code, message, showForm, slug) {
  e.response.header().set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http: https:; frame-ancestors 'none'; base-uri 'none'");
  e.response.header().set("X-Robots-Tag", "noindex, nofollow");
  const heading = showForm ? "Protected link" : "Link unavailable";
  // Only fixed messages and a validated alphanumeric slug are interpolated.
  return e.html(code, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading} | StudioFlow</title>
<style>
*{box-sizing:border-box}body{min-height:100vh;display:grid;place-items:center;margin:0;padding:1rem;background:#100f0e;color:#f3efe6;font:1rem/1.5 system-ui,sans-serif}
main{width:min(100%,27rem);background:#1c1916;border:1px solid #665434;padding:clamp(1.3rem,5vw,2.3rem)}
h1{margin:.4rem 0;font-size:1.8rem}p{color:#ddd3c0}strong{color:#e8c782;text-transform:uppercase;letter-spacing:.15em;font-size:.8rem}
label,input,button{display:block;width:100%}label{margin-top:1.5rem}input,button{margin-top:.45rem;padding:.65rem;font:inherit}
input{background:#100f0e;color:#f3efe6;border:1px solid #948667}button{margin-top:1rem;background:#e8c782;color:#1c1916;border:0;font-weight:bold;cursor:pointer}
:focus-visible{outline:2px solid #fff;outline-offset:3px}
</style></head>
<body><main><strong>StudioFlow</strong><h1>${heading}</h1><p${code === 200 ? "" : ' role="alert"'}>${message}</p>
${showForm ? `<form method="post" action="/q/${slug}"><label for="password">Access password</label>
<input id="password" name="password" type="password" maxlength="71" autocomplete="current-password" required>
<button type="submit">Continue</button></form>` : ""}
</main></body></html>`);
}

function publicLink(e, verify) {
  noStore(e);
  const slug = e.request.pathValue("slug");
  const record = findPublic(e.app, slug);
  if (!record || status(record) !== "active") {
    return accessPage(e, 404, "This QR link is inactive or has expired.", false, "");
  }
  if (record.getString("kind") === "direct" && !verify) return e.redirect(302, record.getString("destination"));
  if (!verify) return accessPage(e, 200, "Enter the access password to continue.", true, slug);
  if (record.getString("kind") !== "protected") {
    return accessPage(e, 404, "This QR link is inactive or has expired.", false, "");
  }
  const retryAfter = reserveAttempt(e.app, slug, e.realIP());
  if (retryAfter) {
    e.response.header().set("Retry-After", String(retryAfter));
    return accessPage(e, 429, "Too many attempts. Wait a few minutes and try again.", true, slug);
  }
  const password = e.request.formValue("password");
  if (!password || byteLength(password) > 71 || !record.validatePassword(password)) {
    return accessPage(e, 401, "That password was incorrect. Try again.", true, slug);
  }
  // An admin may have revoked the link or changed the password during verification.
  const latest = findPublic(e.app, slug);
  if (!latest || status(latest) !== "active" || latest.getString("password:hash") !== record.getString("password:hash")) {
    return accessPage(e, 404, "This QR link changed. Scan it again to continue.", false, "");
  }
  return e.redirect(303, latest.getString("destination"));
}

module.exports = { COLLECTION, noStore, pruneAttempts, publicLink, summary, update };
