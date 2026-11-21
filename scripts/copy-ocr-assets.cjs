// Copies the text-recognition (OCR) engine used by Admin → Import Catalog into public/ocr/,
// so the studio's own server hosts it and photo import works with no internet.
// Runs before `npm run dev` and `npm run build` (predev / prebuild). public/ocr/ is generated.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "public", "ocr");
const mod = (...parts) => path.join(root, "node_modules", ...parts);

const copies = [
  [mod("tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  // LSTM-only engine builds; the worker picks one by the browser's WebAssembly support.
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]
    .map((name) => [mod("tesseract.js-core", name), name]),
];

fs.mkdirSync(out, { recursive: true });
for (const [from, name] of copies) {
  const to = path.join(out, name);
  if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue;
  fs.copyFileSync(from, to);
}

// The English model is stored unzipped: some servers would mark a .gz file as compressed,
// the browser would unzip it, and the OCR worker would then fail to unzip it a second time.
const model = path.join(out, "eng.traineddata");
if (!fs.existsSync(model)) {
  const gz = fs.readFileSync(mod("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"));
  fs.writeFileSync(model, zlib.gunzipSync(gz));
}
console.log("OCR assets ready in public/ocr/");
