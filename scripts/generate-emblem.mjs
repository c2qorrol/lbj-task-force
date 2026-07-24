/**
 * Regenerates every derived form of the site emblem from the master PNG at
 * the repo root (lbj-taskforce-emblem-cyberpunk.png):
 *
 *   - src/app/icon.png       512px favicon / app icon (Next file convention)
 *   - src/app/apple-icon.png 180px iOS home-screen icon
 *   - src/app/favicon.ico    16/32/48px classic favicon (PNG-compressed ICO)
 *   - public/emblem.png      128px header/footer logo (rendered at 20-26 px)
 *   - public/emblem-large.png 512px dashboard hero (rendered at 160-208 px)
 *   - src/lib/emblem.ts      320px base64 data URI for the OG images
 *
 * Run after replacing the master file:  node scripts/generate-emblem.mjs
 */
import sharp from "sharp";
import { writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "lbj-taskforce-emblem-cyberpunk.png");

await sharp(src)
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "src/app/icon.png"));

await sharp(src)
  .resize(180, 180)
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "src/app/apple-icon.png"));

await sharp(src)
  .resize(128, 128)
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "public/emblem.png"));

await sharp(src)
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "public/emblem-large.png"));

// ICO container with PNG-compressed entries (supported by all modern
// browsers); covers clients that request /favicon.ico directly.
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(
  icoSizes.map((s) =>
    sharp(src).resize(s, s).png({ compressionLevel: 9 }).toBuffer(),
  ),
);
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(1, 2); // type: icon
icoHeader.writeUInt16LE(icoSizes.length, 4);
const icoEntries = [];
let icoOffset = 6 + 16 * icoSizes.length;
icoSizes.forEach((s, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(s === 256 ? 0 : s, 0); // width
  entry.writeUInt8(s === 256 ? 0 : s, 1); // height
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(icoPngs[i].length, 8);
  entry.writeUInt32LE(icoOffset, 12);
  icoOffset += icoPngs[i].length;
  icoEntries.push(entry);
});
writeFileSync(
  path.join(root, "src/app/favicon.ico"),
  Buffer.concat([icoHeader, ...icoEntries, ...icoPngs]),
);

const buf = await sharp(src)
  .resize(320, 320)
  .png({ compressionLevel: 9 })
  .toBuffer();

const ts = `/**
 * The LBJ Task Force emblem as a base64 data URI, for the generated Open
 * Graph cards. Satori/resvg cannot fetch files or use the public/ asset at
 * render time on Workers, so the image is inlined here as code. This is a
 * 320px resize of lbj-taskforce-emblem-cyberpunk.png (repo root); regenerate
 * with \`node scripts/generate-emblem.mjs\` if the emblem file changes.
 */
export const EMBLEM_DATA_URI =
  "data:image/png;base64,${buf.toString("base64")}";
`;
writeFileSync(path.join(root, "src/lib/emblem.ts"), ts);

for (const f of [
  "src/app/icon.png",
  "src/app/apple-icon.png",
  "src/app/favicon.ico",
  "public/emblem.png",
  "public/emblem-large.png",
  "src/lib/emblem.ts",
]) {
  console.log(f, statSync(path.join(root, f)).size, "bytes");
}
