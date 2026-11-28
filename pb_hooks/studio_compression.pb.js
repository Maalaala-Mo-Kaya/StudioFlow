/// <reference path="../pb_data/types.d.ts" />
// Compresses the server's text responses (gzip) when the browser accepts it: record lists, station
// data, the app's own JavaScript and CSS. A list of 1,000 job orders goes from about 3.3 MB to
// 0.14 MB, so stations on Wi-Fi refresh much faster.
// Left alone: photos and stored files (already compressed), uploads, and the live-update stream.
routerUse((e) => {
  const path = e.request.url.path;
  const accepts = String(e.request.header.get("Accept-Encoding") || "").toLowerCase().includes("gzip");
  if (!accepts
    || path.startsWith("/api/realtime")
    || path.startsWith("/api/files/")
    || /\/image\//.test(path)
    || /\/(?:upload|shoot-upload|documents|backups)(?:\/|$)/.test(path)
    || /\.(?:jpe?g|png|gif|webp|avif|pdf|zip|woff2?|ico|mp4)$/i.test(path)) {
    return e.next();
  }
  return $apis.gzip().func(e);
});
