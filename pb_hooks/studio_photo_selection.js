const workflow = require(__hooks + "/studio_workflow.js");
const storage = require(__hooks + "/studio_photo_storage.js");

function gallery(app, record, callback) {
  if (!workflow.photographyComplete(record)) {
    throw new ApiError(409, "Photography must be completed before opening the gallery.");
  }
  let root;
  let folder;
  try {
    folder = storage.photoFolder(app, record);
    root = storage.openStudent(folder);
  } catch (error) {
    if (error.status === 409) throw error;
    throw new ApiError(503, "Photo storage is temporarily unavailable.");
  }
  if (!root) throw new NotFoundError("The photo folder is not available yet.");
  try { return callback(root, folder); } finally { root.close(); }
}

function readInventory(root, folder) {
  try { return storage.inventory(root, folder); } catch (_) {
    throw new ApiError(503, "The photo folder could not be read. Try again after storage is available.");
  }
}

function version(record, photos) {
  return $security.sha256(JSON.stringify([
    record.getInt("photo_revision"),
    photos.map(({ path, fingerprint }) => [path, fingerprint]),
  ]));
}

// The limit the client bought (saved on the job order); older orders fall back to the package.
function selectionLimit(app, record) {
  const sold = workflow.json(record, "package_snapshot")?.photo_selection_limit;
  if (Number.isInteger(sold) && sold >= 0) return sold;
  return workflow.catalogItem(app, "packages", record.getString("package"))?.getInt("photo_selection_limit") || 0;
}

function describe(record, photos) {
  const selected = photos?.filter((photo) => photo.group === "selected");
  const saved = workflow.json(record, "photo_selection");
  let selectionState = "awaiting";
  if (workflow.json(record, "photo_pending")) selectionState = "recovering";
  else if (record.getFloat("photo_edit_until") > Date.now()) selectionState = "in_progress";
  else if (workflow.json(record, "photography")?.selectionReview
    || (saved && selected && JSON.stringify(saved) !== JSON.stringify(selected.map(({ path, fingerprint }) => [path, fingerprint])))) {
    selectionState = "needs_review";
  } else if (saved) selectionState = "completed";
  return { selectionState, selectedCount: selected?.length ?? saved?.length ?? 0, unselectedCount: selected ? photos.length - selected.length : 0 };
}

function planMoves(root, folder, photos, chosen) {
  const directories = storage.photoDirectories(root, folder);
  for (const directory of Object.values(directories)) root.mkdirAll(directory, 0o750);
  const destinations = new Set();
  const moves = [];
  for (const photo of photos) {
    const group = chosen.has(photo.id) ? "selected" : "unselected";
    if (photo.group === group) continue;
    const extension = $filepath.ext(photo.name);
    const stem = photo.name.slice(0, -extension.length);
    let path = directories[group] + "/" + photo.name;
    for (let suffix = 2; destinations.has(path.toLowerCase()) || storage.statEntry(root, path); suffix++) {
      path = directories[group] + "/" + stem + "_" + suffix + extension;
    }
    destinations.add(path.toLowerCase());
    moves.push({ from: photo.path, to: path, fingerprint: photo.fingerprint });
  }
  return moves;
}

function sameBytes(root, from, to) {
  const first = root.open(from);
  try {
    const second = root.open(to);
    try {
      const size = first.stat().size();
      if (size !== second.stat().size()) return false;
      const left = new Uint8Array(64 * 1024);
      const right = new Uint8Array(left.length);
      for (let offset = 0; offset < size; offset += left.length) {
        const length = Math.min(left.length, size - offset);
        first.readAt(left.subarray(0, length), offset);
        second.readAt(right.subarray(0, length), offset);
        for (let i = 0; i < length; i++) {
          if (left[i] !== right[i]) return false;
        }
      }
      return true;
    } finally { second.close(); }
  } finally { first.close(); }
}

function matches(info, fingerprint) {
  return info?.mode().isRegular() && info.size() === fingerprint[0]
    && info.modTime().unixNano().toString() === fingerprint[1];
}

function applyMove(root, move) {
  const from = storage.statEntry(root, move.from);
  const to = storage.statEntry(root, move.to);
  if (from && !matches(from, move.fingerprint)) throw new Error("A source photo changed.");
  if (to && (!matches(to, move.fingerprint) || (from && !sameBytes(root, move.from, move.to)))) {
    throw new Error("The destination is occupied by a different file.");
  }
  if (!from) {
    if (!to) throw new Error("A photo is missing from both locations.");
    return;
  }
  // An exclusive same-volume link cannot replace an existing photograph. The
  // durable journal makes a crash between linking and removing recoverable.
  if (!to) root.link(move.from, move.to);
  root.remove(move.from);
}

function recover(app, id) {
  const record = app.findRecordById("registrations", id);
  if (!workflow.json(record, "photo_pending")) return;
  workflow.withRegistration(app, id, (tx, current) => {
    const pending = workflow.json(current, "photo_pending");
    if (!pending) return;
    // Use the already-bound directory so an administrative status change cannot strand the journal.
    let root;
    try {
      const folder = current.getString("photo_folder");
      root = storage.openStudent(folder);
      if (!root) throw new Error("The student folder is unavailable.");
      for (const group of Object.values(storage.photoDirectories(root, folder))) {
        if (!storage.statEntry(root, group)?.isDir()) throw new Error("A photo selection folder is missing or invalid.");
      }
      for (const move of pending.moves) applyMove(root, move);
      if (pending.request) {
        const selected = storage.inventory(root, folder).filter((item) => item.group === "selected")
          .map(({ path, fingerprint }) => [path, fingerprint]);
        if (JSON.stringify(selected) !== JSON.stringify(pending.selected)) {
          throw new Error("The selected folder changed during the transfer.");
        }
        current.set("photo_selection", selected);
        const plan = workflow.json(current, "photography");
        if (plan?.selectionReview && plan.selectionReview === pending.selectionReview) {
          delete plan.selectionReview;
          current.set("photography", plan);
        }
        current.set("photo_last_request", pending.request);
        current.set("photo_revision", current.getInt("photo_revision") + 1);
        current.set("photo_edit_until", 0);
        if (current.getString("photo_status") !== "ready_to_print") current.set("photo_status", "client_selected");
      }
      current.set("photo_pending", null);
      tx.save(current);
    } catch (error) {
      app.logger().warn("Photo selection recovery failed", "registration", id, "error", String(error));
      throw new ApiError(503, "Photo transfer paused. Restore access to the original files and reopen the gallery to resume.");
    } finally { if (root) root.close(); }
  });
}

function queueMoves(app, id, auth, input) {
  recover(app, id);
  workflow.withRegistration(app, id, (tx, record) => {
    const account = workflow.staff(tx, auth, ["admin", "chooser"]);
    if (workflow.json(record, "photo_pending")) throw new ApiError(409, "Another photo transfer is running. Reopen this gallery to retry.");
    let request = null;
    if (input) {
      const signature = $security.sha256(JSON.stringify([input.version, [...input.selected].sort()]));
      request = { id: input.requestId, actor: account.id, signature };
      const previous = workflow.json(record, "photo_last_request");
      if (previous?.id === input.requestId && previous.actor === account.id) {
        if (previous.signature === signature) return;
        throw new ApiError(409, "This request ID was already used for a different selection.");
      }
    }
    gallery(tx, record, (root, folder) => {
      const photos = readInventory(root, folder);
      if (!photos.length) throw new NotFoundError("No supported photographs are available yet.");
      const chosen = input ? new Set(input.selected) : new Set(photos.filter((photo) => photo.group === "selected").map((photo) => photo.id));
      if (input) {
        if (version(record, photos) !== input.version) {
          throw new ApiError(409, "The photographs or selection changed. Reload the gallery before confirming again.");
        }
        if (!chosen.size || photos.filter((photo) => chosen.has(photo.id)).length !== chosen.size) {
          throw new BadRequestError("Select one or more photographs from this gallery.");
        }
        const limit = selectionLimit(tx, record);
        if (limit && chosen.size > limit) throw new BadRequestError("This package allows up to " + limit + " selected photographs.");
      }
      let moves;
      try { moves = planMoves(root, folder, photos, chosen); } catch (_) {
        throw new ApiError(503, "The photo folders are not writable. Check storage access and retry.");
      }
      storage.setFolder(record, folder);
      if (input || moves.length) {
        const destinations = new Map(moves.map(({ from, to }) => [from, to]));
        const selected = photos.filter((photo) => chosen.has(photo.id))
          .map(({ path, fingerprint }) => [destinations.get(path) ?? path, fingerprint])
          .sort(([a], [b]) => a < b ? -1 : Number(a > b));
        const selectionReview = workflow.json(record, "photography")?.selectionReview;
        record.set("photo_pending", { moves, selected, request, selectionReview });
      }
      if (!input) {
        record.set("photo_edit_until", Date.now() + 15 * 60 * 1000);
      }
      tx.save(record);
    });
  });
  recover(app, id);
}

function listItem(app, record) {
  const info = workflow.summary(app, record);
  if (workflow.json(record, "photo_pending")) return { ...info, availability: "recovering", ...describe(record) };
  if (!info.photographyComplete) return { ...info, availability: "pending_shoot", ...describe(record) };
  try {
    return gallery(app, record, (root, folder) => {
      const photos = readInventory(root, folder);
      return { ...info, availability: photos.length ? "available" : "empty", ...describe(record, photos) };
    });
  } catch (error) {
    return { ...info, availability: error.status === 404 ? "missing" : "unavailable", ...describe(record) };
  }
}

function details(app, id) {
  return workflow.withRegistration(app, id, (tx, record) => gallery(tx, record, (root, folder) => {
    if (workflow.json(record, "photo_pending")) throw new ApiError(409, "The gallery is being updated.");
    const inventory = readInventory(root, folder);
    return {
      student: workflow.summary(tx, record),
      version: version(record, inventory),
      limit: selectionLimit(tx, record),
      photos: inventory.map(({ id, name, group }) => ({ id, name, group, selected: group === "selected" })),
    };
  }));
}

module.exports = { details, gallery, listItem, queueMoves, readInventory, recover };
