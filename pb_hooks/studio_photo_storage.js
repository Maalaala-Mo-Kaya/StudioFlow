const { catalogItem } = require(__hooks + "/studio_workflow.js");
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

function pathFor(app, registration, legacyBrowser = false) {
  const label = (collection, field, fallback) => {
    const item = catalogItem(app, collection, registration.getString(field));
    return item?.getString("code") || item?.getString("name") || fallback;
  };
  const clean = (value) => segment(legacyBrowser ? value.replace(/\s+/g, "_").replace(/^_+|_+$/g, "") : value);
  const job = clean(registration.getString("job_order_no") || "JO-" + registration.id);
  const family = clean(registration.getString("family_name") || "STUDENT");
  const given = registration.getString("given_name");
  return [
    clean(label("organizations", "organization", "ORGANIZATION")),
    clean(label("courses", "course", "COURSE")),
    `${job}_${family}${given ? "_" + clean(given) : ""}`.replace(/_+$/, ""),
  ].join("/");
}

function setFolder(record, path) {
  record.set("photo_folder", path);
  record.set("photo_folder_key", path.toLowerCase());
}

function photoFolder(app, registration) {
  const saved = registration.getString("photo_folder");
  if (saved) return saved;

  const jobOrder = registration.getString("job_order_no");
  if (!jobOrder || app.findRecordsByFilter("registrations", "job_order_no = {:job}", "", 2, 0, { job: jobOrder }).length !== 1) {
    throw new ApiError(409, "This legacy job order cannot be matched to a unique photo folder.");
  }
  const paths = [...new Set([pathFor(app, registration), pathFor(app, registration, true)])];
  const existing = paths.filter((path) => {
    const root = openStudent(path);
    if (!root) return false;
    try { return inventory(root).length > 0; } finally { root.close(); }
  });
  if (existing.length > 1) throw new ApiError(409, "Photos exist in two legacy folders for this job order.");
  const path = existing[0] || paths[0];
  if (app.findRecordsByFilter("registrations", "photo_folder_key = {:path} && id != {:id}", "", 1, 0, {
    path: path.toLowerCase(), id: registration.id,
  }).length) throw new ApiError(409, "This photo folder belongs to another registration.");
  return path;
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
    root.mkdirAll("selected", 0o750);
    root.mkdirAll("unselected", 0o750);
  } finally {
    root.close();
  }
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

function inventory(root) {
  const entries = [];
  for (const group of ["", "selected", "unselected"]) {
    if (group) {
      const directory = statEntry(root, group);
      if (!directory) continue;
      if (!directory.isDir()) throw new Error("A photo selection folder is not a directory.");
    }
    const dir = root.open(group || ".");
    try {
      for (const entry of dir.readDir(-1)) {
        const name = entry.name();
        if (!usableName(name) || !entry.type().isRegular() || !formats[$filepath.ext(name).toLowerCase()]) continue;
        const info = entry.info();
        const path = group ? group + "/" + name : name;
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

function image(root, group, name, id) {
  if (!["", "selected", "unselected"].includes(group) || !usableName(name)) throw new NotFoundError("Photo not found.");
  if (group && !statEntry(root, group)?.isDir()) throw new NotFoundError("Photo not found.");
  const path = group ? group + "/" + name : name;
  if ($security.sha256(path) !== id) throw new NotFoundError("Photo not found.");
  const mime = photoMime(root, path, statEntry(root, path));
  if (!mime) throw new NotFoundError("Photo not found.");
  return { path, mime };
}

function displayPath(relative) {
  return $filepath.join(basePath(), ...relative.split("/"));
}

module.exports = { displayPath, image, inventory, openStudent, pathFor, photoFolder, provision, setFolder, statEntry };
