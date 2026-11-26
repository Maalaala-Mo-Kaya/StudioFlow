/**
 * Builds the Photo Sender download for one camera: the scripts from scripts/photo-sender, plus a
 * photo-sender.config.json that already holds the server address, the camera and its key, so
 * the photographer only double-clicks the installer and types the EOS folder. Imported on click
 * (keeps fflate and the scripts out of the main bundle).
 */
import { strToU8, zipSync } from 'fflate';
import senderScript from '../../../scripts/photo-sender/photo-sender.ps1?raw';
import installScript from '../../../scripts/photo-sender/install-photo-sender.ps1?raw';
import installBat from '../../../scripts/photo-sender/install-photo-sender.bat?raw';
import uninstallScript from '../../../scripts/photo-sender/uninstall-photo-sender.ps1?raw';
import uninstallBat from '../../../scripts/photo-sender/uninstall-photo-sender.bat?raw';
import readme from '../../../scripts/photo-sender/README.txt?raw';

export interface SenderKitInput {
  server: string;
  camera: string;
  cameraName: string;
  key: string;
}

/** Windows line endings: cmd.exe misreads .bat files with bare LF. */
const crlf = (text: string) => strToU8(text.replace(/\r?\n/g, '\r\n'));

/** A folder / file name safe on Windows. */
export function kitFolderName(cameraName: string) {
  const clean = cameraName.replace(/[^\w .()-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return `StudioFlow Photo Sender - ${clean || 'Camera'}`;
}

export function buildSenderKit(input: SenderKitInput): Blob {
  const folder = kitFolderName(input.cameraName);
  const config = JSON.stringify({
    source: 'C:\\EOS_Out',
    server: input.server.replace(/\/+$/, ''),
    camera: input.camera,
    cameraName: input.cameraName,
    key: input.key,
    settleSeconds: 3,
  }, null, 2);
  const files: Record<string, Uint8Array> = {
    'install-photo-sender.bat': crlf(installBat),
    'install-photo-sender.ps1': crlf(installScript),
    'photo-sender.ps1': crlf(senderScript),
    'uninstall-photo-sender.bat': crlf(uninstallBat),
    'uninstall-photo-sender.ps1': crlf(uninstallScript),
    'README.txt': crlf(readme),
    'photo-sender.config.json': crlf(config),
  };
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [`${folder}/${name}`, bytes])));
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}
