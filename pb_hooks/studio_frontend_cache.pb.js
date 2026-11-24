/// <reference path="../pb_data/types.d.ts" />

routerUse((e) => {
  // The SPA uses hash routes. Revalidate its entry page on navigation so it points
  // to the current hashed JavaScript and CSS, while leaving asset caching alone.
  const path = e.request.url.path;
  if ((e.request.method === "GET" || e.request.method === "HEAD") && (path === "/" || path === "/index.html")) {
    e.response.header().set("Cache-Control", "no-cache");
  }
  return e.next();
});
