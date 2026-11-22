// Shared by PocketBase and the offline repository migration.
const folderNameBytes = 120;
const registrationNameLimit = 100;

function utf8Bytes(character) {
  const code = character.codePointAt(0);
  return code <= 0x7F ? 1 : code <= 0x7FF ? 2 : code <= 0xFFFF ? 3 : 4;
}

function clientFolderName(jobOrder, family, given, middle, limit = folderNameBytes) {
  if (!jobOrder || !/^[\w.-]+$/.test(jobOrder) || /^\.+$/.test(jobOrder)) {
    throw new Error("An official job order number is required.");
  }
  const name = [family, given, middle].filter(Boolean).join(" ")
    .replace(/[\s_<>:"/\\|?*\x00-\x1F]+/gu, "_").replace(/^[_.]+|[_.]+$/g, "");
  const prefix = jobOrder + "_";
  let remaining = limit - prefix.length;
  let shortened = "";
  for (const character of name) {
    remaining -= utf8Bytes(character);
    if (remaining < 0) break;
    shortened += character;
  }
  return prefix + (shortened.replace(/[_.]+$/g, "") || "UNNAMED");
}

module.exports = { clientFolderName, folderNameBytes, registrationNameLimit, utf8Bytes };
