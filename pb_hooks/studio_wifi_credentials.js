function keyUnavailable() {
  return new ApiError(503, "The saved Wi-Fi encryption key is unavailable. Check the StudioFlow server.");
}

function keyFor(app, create) {
  const keyPath = app.dataDir() + ".wifi-key";
  try {
    const key = toString($os.readFile(keyPath));
    if (/^[a-zA-Z0-9+/]{32}$/.test(key)) return key;
  } catch (_) {
    if (create) {
      const parent = $filepath.dir(keyPath);
      const name = $filepath.base(keyPath);
      const exists = $os.readDir(parent).some((file) => file.name() === name);
      const encrypted = app.findRecordsByFilter("qr_codes", "wifi_ciphertext != ''", "", 1, 0);
      if (!exists && !encrypted.length) {
        // The caller holds the database write lock, so first-time saves share one key.
        const key = $security.randomStringWithAlphabet(32, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
        const temporary = keyPath + "." + $security.randomString(12) + ".tmp";
        try {
          $os.writeFile(temporary, key, 0o600);
          $os.rename(temporary, keyPath);
          return key;
        } catch (_) {
          try { $os.remove(temporary); } catch (_) { /* A failed write may not have created a file. */ }
        }
      }
    }
  }
  throw keyUnavailable();
}

function encrypt(app, password) {
  return $security.encrypt(password, keyFor(app, true));
}

function decrypt(app, ciphertext) {
  try {
    return toString($security.decrypt(ciphertext, keyFor(app, false)));
  } catch (_) {
    throw keyUnavailable();
  }
}

module.exports = { encrypt, decrypt };
