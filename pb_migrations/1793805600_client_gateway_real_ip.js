/// <reference path="../pb_data/types.d.ts" />

// The client port (8090) is scripts/client-gateway.cjs, which forwards kiosk calls to PocketBase
// from 127.0.0.1 and puts the guest's own address in X-Real-IP (always overwritten, never taken
// from the request). Trust that header so e.realIP() (the QR password attempt limit, request
// logs, rate limits) sees each guest device instead of the gateway. Guests can't reach the staff
// port, so only the gateway can set it for them.
const HEADER = "X-Real-IP";

migrate((app) => {
  const settings = app.settings();
  const headers = Array.from(settings.trustedProxy.headers || []);
  if (!headers.some((name) => String(name).toLowerCase() === HEADER.toLowerCase())) {
    headers.push(HEADER);
    settings.trustedProxy.headers = headers;
    app.save(settings);
  }
}, (app) => {
  const settings = app.settings();
  const headers = Array.from(settings.trustedProxy.headers || []);
  settings.trustedProxy.headers = headers.filter((name) => String(name).toLowerCase() !== HEADER.toLowerCase());
  app.save(settings);
});
