// Shared by PocketBase and the offline repository migration.
function clientFolderName(jobOrder, family, given, middle) {
  if (!jobOrder || !/^[\w.-]+$/.test(jobOrder) || /^\.+$/.test(jobOrder)) {
    throw new Error("An official job order number is required.");
  }
  const name = [family, given, middle].filter(Boolean).join(" ")
    .replace(/[\s_<>:"/\\|?*\x00-\x1F]+/gu, "_").replace(/^[_.]+|[_.]+$/g, "");
  return jobOrder + "_" + (name || "UNNAMED");
}

module.exports = { clientFolderName };
