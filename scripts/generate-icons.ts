/** Renders the app icons (rani mark with a marigold fold) into /public/icons. */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

function svg(size: number, pad: number) {
  const r = size * 0.28;
  const inner = size - pad * 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#15121e"/>
    <clipPath id="c"><rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}"/></clipPath>
    <g clip-path="url(#c)">
      <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" fill="#e0127a"/>
      <polygon points="${pad},${size - pad} ${size - pad},${pad + inner * 0.62} ${size - pad},${size - pad}" fill="#ffb000" opacity="0.95"/>
    </g>
  </svg>`;
}

async function main() {
  const out = path.resolve("public/icons");
  await fs.mkdir(out, { recursive: true });
  await sharp(Buffer.from(svg(192, 16))).png().toFile(path.join(out, "icon-192.png"));
  await sharp(Buffer.from(svg(512, 40))).png().toFile(path.join(out, "icon-512.png"));
  await sharp(Buffer.from(svg(512, 96))).png().toFile(path.join(out, "maskable-512.png"));
  await sharp(Buffer.from(svg(180, 14))).png().toFile(path.join(out, "apple-touch-icon.png"));
  console.log("icons written to", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
