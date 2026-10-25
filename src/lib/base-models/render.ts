import sharp from "sharp";
import { SKIN_TONES, getBackdrop, type Backdrop, type BaseModel } from "./catalog";

/**
 * Development renderer for base-model placeholders: an editorial silhouette
 * on the chosen backdrop. Production replaces these with the reviewed,
 * photoreal library; the renderer stays as the offline fallback.
 *
 * `backdrop` is the resolved backdrop (from the content DAL) or, for scripts
 * that only know the defaults, its id in the static catalogue.
 */
export async function renderBaseModelPng(model: BaseModel, backdrop: string | Pick<Backdrop, "hex">, width = 864, height = 1296): Promise<Buffer> {
  const resolved = typeof backdrop === "string" ? getBackdrop(backdrop) : backdrop;
  const bg = resolved?.hex ?? "#F4EFE6";
  const skin = SKIN_TONES[model.skinTone].hex;
  const dark = isDark(bg);
  const shade = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const w = { slim: 0.86, regular: 1, curvy: 1.12, plus: 1.26 }[model.bodyType];

  const cx = width / 2;
  const headR = width * 0.062;
  const headY = height * 0.16;
  const shoulderY = height * 0.27;
  const shoulderHalf = width * 0.17 * w;
  const waistY = height * 0.47;
  const waistHalf = width * 0.11 * w;
  const hipY = height * 0.58;
  const hipHalf = width * 0.16 * w;
  const kneeY = height * 0.8;
  const ankleY = height * 0.96;
  const legHalf = width * 0.07 * w;

  const body = `
    M ${cx - shoulderHalf} ${shoulderY}
    C ${cx - shoulderHalf - 10} ${shoulderY + 60}, ${cx - waistHalf - 6} ${waistY - 40}, ${cx - waistHalf} ${waistY}
    C ${cx - waistHalf - 4} ${waistY + 50}, ${cx - hipHalf} ${hipY - 30}, ${cx - hipHalf} ${hipY}
    C ${cx - hipHalf} ${kneeY}, ${cx - legHalf * 1.5} ${kneeY}, ${cx - legHalf * 1.4} ${ankleY}
    L ${cx - 6} ${ankleY} L ${cx - 6} ${kneeY} L ${cx + 6} ${kneeY} L ${cx + 6} ${ankleY}
    L ${cx + legHalf * 1.4} ${ankleY}
    C ${cx + legHalf * 1.5} ${kneeY}, ${cx + hipHalf} ${kneeY}, ${cx + hipHalf} ${hipY}
    C ${cx + hipHalf} ${hipY - 30}, ${cx + waistHalf + 4} ${waistY + 50}, ${cx + waistHalf} ${waistY}
    C ${cx + waistHalf + 6} ${waistY - 40}, ${cx + shoulderHalf + 10} ${shoulderY + 60}, ${cx + shoulderHalf} ${shoulderY}
    Q ${cx} ${shoulderY - 28} ${cx - shoulderHalf} ${shoulderY} Z`;

  const armL = `M ${cx - shoulderHalf + 6} ${shoulderY + 10} C ${cx - shoulderHalf - 40} ${shoulderY + 160}, ${cx - shoulderHalf - 30} ${waistY + 90}, ${cx - shoulderHalf - 8} ${hipY + 20}`;
  const armR = `M ${cx + shoulderHalf - 6} ${shoulderY + 10} C ${cx + shoulderHalf + 40} ${shoulderY + 160}, ${cx + shoulderHalf + 30} ${waistY + 90}, ${cx + shoulderHalf + 8} ${hipY + 20}`;

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="vignette" cx="50%" cy="40%" r="75%">
        <stop offset="0%" stop-color="${bg}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${dark ? "#000" : "#000"}" stop-opacity="${dark ? 0.35 : 0.12}"/>
      </radialGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bg}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${dark ? "#000" : "#000"}" stop-opacity="0.18"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="${bg}"/>
    <rect width="100%" height="100%" fill="url(#vignette)"/>
    <rect y="${height * 0.86}" width="100%" height="${height * 0.14}" fill="url(#floor)"/>
    <ellipse cx="${cx}" cy="${ankleY + 6}" rx="${width * 0.2 * w}" ry="${height * 0.012}" fill="${shade}"/>
    <path d="${armL}" stroke="${skin}" stroke-width="${width * 0.05 * w}" stroke-linecap="round" fill="none"/>
    <path d="${armR}" stroke="${skin}" stroke-width="${width * 0.05 * w}" stroke-linecap="round" fill="none"/>
    <path d="${body}" fill="${skin}"/>
    <rect x="${cx - headR * 0.42}" y="${headY + headR * 0.6}" width="${headR * 0.84}" height="${shoulderY - headY - headR * 0.4}" rx="${headR * 0.3}" fill="${skin}"/>
    <ellipse cx="${cx}" cy="${headY}" rx="${headR}" ry="${headR * 1.22}" fill="${skin}"/>
    <path d="M ${cx - headR * 1.05} ${headY - headR * 0.1} C ${cx - headR * 1.1} ${headY - headR * 1.5}, ${cx + headR * 1.1} ${headY - headR * 1.5}, ${cx + headR * 1.05} ${headY - headR * 0.1} C ${cx + headR * 0.9} ${headY - headR * 0.6}, ${cx - headR * 0.9} ${headY - headR * 0.6}, ${cx - headR * 1.05} ${headY - headR * 0.1} Z" fill="#2A1C14" opacity="0.9"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 < 110;
}
