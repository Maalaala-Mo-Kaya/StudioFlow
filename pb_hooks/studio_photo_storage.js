const { catalogItem } = require(__hooks + "/studio_workflow.js");
const { clientFolderName, folderNameBytes, utf8Bytes } = require(__hooks + "/studio_photo_names.cjs");
const defaultRoot = "C:\\StudioFlow_Photos";
const formats = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif" };

function basePath() {
  return $os.getenv("STUDIOFLOW_PHOTOS_ROOT") || defaultRoot;
}

function segment(value) {
  const cleaned = String(value || "").replace(/\.\./g, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim().replace(/[. ]+$/, "");
  return usableName(cleaned) ? cleaned : "UNNAMED";
}

function usableName(name) {
  return !!name && name !== "." && name !== ".." && !/[<>:"/\\|?*\x00-\x1F]|[. ]$/u.test(name)
    && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name);
}

function pathFor(app, registration, layout = "current") {
  const label = (collection, field, fallback) => {
    const item = catalogItem(app, collection, registration.getString(field));
    return item?.getString("code") || item?.getString("name") || fallback;
  };
  const clean = (value) => segment(layout === "browser" ? value.replace(/\s+/g, "_").replace(/^_+|_+$/g, "") : value);
  const job = registration.getString("job_order_no");
  const family = clean(registration.getString("family_name") || "STUDENT");
  const given = registration.getString("given_name");
  const leaf = layout === "current" || layout === "unbounded"
    ? clientFolderName(job, registration.getString("family_name"), given, registration.getString("middle_name"),
      layout === "unbounded" ? Infinity : undefined)
    : `${clean(job)}_${family}${given ? "_" + clean(given) : ""}`.replace(/_+$/, "");
  if (registration.getString("client_kind") === "walkin") {
    // Walk-ins have no school or course: file them by the month they registered (studio time, UTC+8).
    const created = registration.getString("created");
    const at = created ? Date.parse(created.replace(" ", "T")) : Date.now();
    const month = new Date((Number.isFinite(at) ? at : Date.now()) + 8 * 3600000).toISOString().slice(0, 7);
    return ["WALK-IN", month, leaf].join("/");
  }
  return [
    clean(label("organizations", "organization", "ORGANIZATION")),
    clean(label("courses", "course", "COURSE")),
    leaf,
  ].join("/");
}

function setFolder(record, path) {
  record.set("photo_folder", path);
  record.set("photo_folder_key", path.toLowerCase());
}

// A storage conflict must not stop payment or bind a made-up repository path.
function assignFolder(app, registration, newlyNumbered) {
  if (registration.getString("photo_folder")) return;
  try { setFolder(registration, photoFolder(app, registration, newlyNumbered)); }
  catch (error) { app.logger().warn("Client photo folder could not be assigned", "registration", registration.id, "error", String(error)); }
}

const documentsDir = "RECEIPTS";

// Saves one PDF copy (job order, receipt or refund slip) into <client folder>/RECEIPTS/,
// replacing an older copy of the same document. Written to a temporary name first, so a
// failed upload never leaves half a file under the real name.
function saveDocument(relative, name, bytes) {
  if (!/^(?:JO-\d+|OR-\d+|RF-\d+)\.pdf$/.test(name)) throw new BadRequestError("Invalid document name.");
  provision(relative);
  const root = openStudent(relative);
  if (!root) throw new Error("The client folder could not be opened.");
  try {
    root.mkdirAll(documentsDir, 0o750);
    const target = documentsDir + "/" + name;
    const partial = target + ".studioflow-partial";
    // O_WRONLY | O_CREATE | O_TRUNC
    const output = root.openFile(partial, 0x1 | 0x40 | 0x200, 0o640);
    try {
      output.write(bytes);
      output.sync();
    } finally { output.close(); }
    if (statEntry(root, target)) root.remove(target);
    root.rename(partial, target);
  } finally {
    root.close();
  }
}

function photoFolder(app, registration, newlyNumbered = false) {
  const saved = registration.getString("photo_folder");
  if (saved && (folderLeafBytes(saved) <= folderNameBytes || probeFolder(saved) !== "too-long")) return saved;

  const jobOrder = registration.getString("job_order_no");
  const matches = jobOrder ? app.findRecordsByFilter("registrations", "job_order_no = {:job}", "", 2, 0, { job: jobOrder }) : [];
  if (!jobOrder || (newlyNumbered ? matches.length !== 0 : matches.length !== 1 || matches[0].id !== registration.id)) {
    throw new ApiError(409, "This legacy job order cannot be matched to a unique photo folder.");
  }
  const canonical = pathFor(app, registration);
  const paths = [...new Set([canonical, ...["unbounded", "legacy", "browser"].map((layout) => pathFor(app, registration, layout))])];
  const existing = paths.filter((path) => probeFolder(path) === "exists");
  if (existing.length > 1) throw new ApiError(409, "Photos exist in two legacy folders for this job order.");
  const path = existing[0] || canonical;
  if (app.findRecordsByFilter("registrations", "photo_folder_key = {:path} && id != {:id}", "", 1, 0, {
    path: path.toLowerCase(), id: registration.id,
  }).length) throw new ApiError(409, "This photo folder belongs to another registration.");
  return path;
}

function folderLeafBytes(path) {
  return Array.from(path.split("/").pop()).reduce((size, character) => size + utf8Bytes(character), 0);
}

function probeFolder(path) {
  const leaf = path.split("/").pop();
  const length = basePath().startsWith("/") ? folderLeafBytes(path) : leaf.length;
  if (length > 255) return "too-long";
  try {
    const root = openStudent(path);
    if (!root) return "missing";
    root.close();
    return "exists";
  } catch (error) {
    if (/file name too long|filename or extension is too long|name is too long/i.test(String(error))) return "too-long";
    throw error;
  }
}

function isMissing(error) {
  const message = String(error);
  return /file does not exist|no such file or directory|cannot find the (?:file|path) specified/i.test(message);
}

function statEntry(root, path) {
  try { return root.lstat(path); } catch (error) {
    if (!isMissing(error)) throw error;
    return null;
  }
}

function openStudent(relative, create = false) {
  const parts = relative.split("/");
  if (parts.length !== 3 || !parts.every(usableName)) throw new BadRequestError("Invalid photo folder.");
  const base = basePath();
  if (!$filepath.isAbs(base)) throw new Error("STUDIOFLOW_PHOTOS_ROOT must be an absolute path.");
  if (create) $os.mkdirAll(base, 0o750);
  let root;
  try { root = $os.openRoot(base); } catch (error) {
    if (!isMissing(error)) throw error;
    return null;
  }
  try {
    for (const part of parts) {
      if (create && !statEntry(root, part)) {
        try { root.mkdir(part, 0o750); } catch (error) {
          if (!statEntry(root, part)) throw error;
        }
      }
      const entry = statEntry(root, part);
      if (!entry) return null;
      if (!entry.isDir()) throw new Error("Unexpected entry in photo directory path.");
      const next = root.openRoot(part);
      root.close();
      root = next;
    }
    const student = root;
    root = null;
    return student;
  } finally {
    if (root) root.close();
  }
}

function provision(relative) {
  const root = openStudent(relative, true);
  if (!root) throw new Error("The student folder could not be created.");
  try {
    for (const directory of Object.values(photoDirectories(root, relative))) root.mkdirAll(directory, 0o750);
  } finally {
    root.close();
  }
}

function photoDirectories(root, folder) {
  const expected = folder.split("/").pop();
  const dir = root.open(".");
  let names;
  try { names = dir.readDir(-1).map((entry) => entry.name()); } finally { dir.close(); }
  const match = (candidates, fallback) => {
    const found = names.filter((name) => candidates.includes(name.toLowerCase()));
    if (found.length > 1) throw new Error("Multiple photo folders have the same role.");
    if (found.length && !statEntry(root, found[0])?.isDir()) throw new Error("A photo selection folder is not a directory.");
    return found[0] || fallback;
  };
  return {
    selected: match([expected.toLowerCase(), "selected"], expected),
    unselected: match(["unselected"], "Unselected"),
  };
}

function photoMime(root, path, info) {
  const mime = formats[$filepath.ext(path).toLowerCase()];
  if (!mime || !info?.mode().isRegular() || info.size() < 12) return "";
  const file = root.open(path);
  const prefix = new Uint8Array(12);
  try { file.readAt(prefix, 0); } finally { file.close(); }
  const tag = String.fromCharCode(...prefix);
  switch (mime) {
    case "image/jpeg": return prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255 ? mime : "";
    case "image/png": return tag.startsWith("\x89PNG\r\n\x1a\n") ? mime : "";
    case "image/webp": return tag.startsWith("RIFF") && tag.endsWith("WEBP") ? mime : "";
    case "image/gif": return /^GIF8[79]a/.test(tag) ? mime : "";
    case "image/avif": return /ftypavi[fs]$/.test(tag) ? mime : "";
    default: return "";
  }
}

function inventory(root, folder) {
  const entries = [];
  const directories = photoDirectories(root, folder);
  for (const [group, directoryName] of [["", ""], ...Object.entries(directories)]) {
    if (group) {
      const directory = statEntry(root, directoryName);
      if (!directory) continue;
      if (!directory.isDir()) throw new Error("A photo selection folder is not a directory.");
    }
    const dir = root.open(directoryName || ".");
    try {
      for (const entry of dir.readDir(-1)) {
        const name = entry.name();
        if (!usableName(name) || !entry.type().isRegular() || !formats[$filepath.ext(name).toLowerCase()]) continue;
        const info = entry.info();
        const path = directoryName ? directoryName + "/" + name : name;
        let mime;
        try { mime = photoMime(root, path, info); } catch (error) {
          if (!isMissing(error)) throw error;
        }
        if (!mime) continue;
        entries.push({
          id: $security.sha256(path), path, name, mime, group,
          fingerprint: [info.size(), info.modTime().unixNano().toString()],
        });
      }
    } finally {
      dir.close();
    }
  }
  return entries.sort((a, b) => a.path < b.path ? -1 : Number(a.path > b.path));
}

function image(root, folder, group, name, id) {
  if (!["", "selected", "unselected"].includes(group) || !usableName(name)) throw new NotFoundError("Photo not found.");
  const directory = group ? photoDirectories(root, folder)[group] : "";
  if (directory && !statEntry(root, directory)?.isDir()) throw new NotFoundError("Photo not found.");
  const path = directory ? directory + "/" + name : name;
  if ($security.sha256(path) !== id) throw new NotFoundError("Photo not found.");
  const mime = photoMime(root, path, statEntry(root, path));
  if (!mime) throw new NotFoundError("Photo not found.");
  return { path, mime };
}

function displayPath(relative) {
  return $filepath.join(basePath(), ...relative.split("/"));
}

module.exports = {
  assignFolder, basePath, displayPath, documentsDir, formats, image, inventory, isMissing, openStudent, pathFor, photoFolder,
  photoDirectories, photoMime, provision, saveDocument, setFolder, statEntry, usableName,
};
