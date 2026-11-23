type QrFactory = typeof import('qrcode-generator');
let factory: Promise<QrFactory> | undefined;

export interface QrImage {
  size: number;
  path: string;
}

/** Encode UTF-8 and include a four-module quiet zone. */
export async function makeQrImage(value: string): Promise<QrImage> {
  factory ??= import('qrcode-generator').then(({ default: qrcode }) => {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    return qrcode;
  });
  const qrcode = await factory;
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      if (qr.isDark(row, column)) path += `M${column + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return { size: count + quiet * 2, path };
}
