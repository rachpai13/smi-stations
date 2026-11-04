// Generates an editable vintage crown bottle-cap mockup (SVG) and PNG exports.
// Usage: node make-cap.js   → writes into ../bottle-cap/
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, '..', 'bottle-cap');
fs.mkdirSync(OUT, { recursive: true });

const S = 1200;            // canvas size
const C = S / 2;           // centre
const TEETH = 21;          // real crown caps have 21 crimps
const R_MID = 546, R_AMP = 15;   // scalloped skirt edge
const R_SHOULDER = 466;    // outer edge of the rolled shoulder
const R_FACE = 440;        // printable top (artwork area)
const LIGHT = -Math.PI * 0.75; // light from top-left

const f = (n) => n.toFixed(2);
const pt = (r, a) => `${f(C + r * Math.cos(a))},${f(C + r * Math.sin(a))}`;

// Skirt outline: rounded crimps (sharpened sine).
function skirtPath() {
  const steps = TEETH * 40;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const c = Math.cos(TEETH * a);
    const r = R_MID + R_AMP * Math.sign(c) * Math.pow(Math.abs(c), 0.6);
    d += (i ? 'L' : 'M') + pt(r, a);
  }
  return d + 'Z';
}

// Light/dark wedge on either side of each crimp so the folds read as 3D.
function flutes() {
  const step = (Math.PI * 2) / TEETH;
  let out = '';
  for (let i = 0; i < TEETH; i++) {
    const a = i * step;
    const facing = Math.cos(a - LIGHT);            // -1..1, how much this crimp faces the light
    const hiOpacity = 0.35 + 0.45 * Math.max(0, facing);
    const loOpacity = 0.25 + 0.4 * Math.max(0, -facing);
    const wedge = (a0, a1) =>
      `M${pt(R_SHOULDER - 6, a0)}L${pt(R_MID + 40, a0)}L${pt(R_MID + 40, a1)}L${pt(R_SHOULDER - 6, a1)}Z`;
    out += `<path d="${wedge(a - step / 2, a)}" fill="#ffffff" opacity="${f(hiOpacity)}"/>`;
    out += `<path d="${wedge(a, a + step / 2)}" fill="#2a2e33" opacity="${f(loOpacity)}"/>`;
  }
  return out;
}

const defs = `
  <defs>
    <clipPath id="skirt-clip"><path d="${skirtPath()}"/></clipPath>
    <clipPath id="face-clip"><circle cx="${C}" cy="${C}" r="${R_FACE}"/></clipPath>
    <radialGradient id="skirt-shade" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.75" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.35"/>
    </radialGradient>
    <linearGradient id="shoulder" x1="0.15" y1="0.1" x2="0.85" y2="0.9">
      <stop offset="0" stop-color="#fbfbfb"/>
      <stop offset="0.45" stop-color="#c9cdd2"/>
      <stop offset="1" stop-color="#6f757c"/>
    </linearGradient>
    <radialGradient id="face-edge" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.86" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.32"/>
    </radialGradient>
    <linearGradient id="face-gloss" x1="0.2" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.28"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.10"/>
    </linearGradient>
    <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>`;

const shadowLayer = `
  <g id="Shadow">
    <path d="${skirtPath()}" fill="#000" opacity="0.28" transform="translate(10 16)" filter="url(#drop)"/>
  </g>`;

const rimLayer = `
  <g id="Rim">
    <path d="${skirtPath()}" fill="#b4b8be"/>
    <g clip-path="url(#skirt-clip)">
      <g filter="url(#soft)">${flutes()}</g>
      <circle cx="${C}" cy="${C}" r="${R_MID + R_AMP}" fill="url(#skirt-shade)"/>
      <rect width="${S}" height="${S}" filter="url(#grain)" opacity="0.10" style="mix-blend-mode:multiply"/>
    </g>
    <path d="${skirtPath()}" fill="none" stroke="#5c6168" stroke-width="2.5"/>
    <circle cx="${C}" cy="${C}" r="${(R_SHOULDER + R_FACE) / 2}" fill="none" stroke="url(#shoulder)" stroke-width="${R_SHOULDER - R_FACE}"/>
    <circle cx="${C}" cy="${C}" r="${R_SHOULDER}" fill="none" stroke="#4f545a" stroke-width="2.5" opacity="0.8"/>
  </g>`;

// Vintage caps are often printed right over the crimps. Change the fill colour, or hide the layer for bare metal.
const skirtTintLayer = (color) => `
  <g id="Skirt colour (optional)" style="mix-blend-mode:multiply">
    <path d="${skirtPath()}" fill="${color}" opacity="0.85"/>
  </g>`;

const faceShadingLayer = `
  <g id="Face shading">
    <rect x="${C - R_FACE}" y="${C - R_FACE}" width="${R_FACE * 2}" height="${R_FACE * 2}" clip-path="url(#face-clip)"
      filter="url(#grain)" opacity="0.07" style="mix-blend-mode:multiply"/>
    <circle cx="${C}" cy="${C}" r="${R_FACE}" fill="url(#face-edge)"/>
    <circle cx="${C}" cy="${C}" r="${R_FACE}" fill="url(#face-gloss)"/>
    <circle cx="${C}" cy="${C}" r="${R_FACE}" fill="none" stroke="#3d4248" stroke-width="3" opacity="0.7"/>
  </g>`;

// Artwork sits inside the round face. Replace this group with your own design.
const artworks = {
  blank: `<circle cx="${C}" cy="${C}" r="${R_FACE}" fill="#efe6d2"/>`,
  placeholder: `
    <circle cx="${C}" cy="${C}" r="${R_FACE}" fill="#efe6d2"/>
    <circle cx="${C}" cy="${C}" r="${R_FACE - 40}" fill="none" stroke="#c9bfa8" stroke-width="4" stroke-dasharray="14 12"/>
    <text x="${C}" y="${C + 18}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="54" fill="#a89e88">YOUR DESIGN</text>`,
  example: `
    <circle cx="${C}" cy="${C}" r="${R_FACE}" fill="#f4ecd6"/>
    <path d="M${C - R_FACE},${C + 40} A${R_FACE},${R_FACE} 0 0 0 ${C + R_FACE},${C + 40} Z" fill="#2f6be6"/>
    <rect x="${C - R_FACE}" y="${C - 92}" width="${R_FACE * 2}" height="128" fill="#d6343f"/>
    <text x="${C}" y="${C - 2}" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="104" fill="#f4ecd6" letter-spacing="4">SMI MAP</text>
    <text x="${C}" y="${C - 150}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="46" fill="#d6343f" letter-spacing="6">CAMPUS</text>
    <text x="${C}" y="${C + 170}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="50" fill="#f4ecd6" letter-spacing="8">EST. 2026</text>`,
};

function svg(artKey, { withShadow = true, withArt = true, skirt = null } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
${defs}
${withShadow ? shadowLayer : ''}
${rimLayer}
${skirt ? skirtTintLayer(skirt) : ''}
${withArt ? `<g id="Artwork (replace me)" clip-path="url(#face-clip)">${artworks[artKey]}</g>` : ''}
${faceShadingLayer}
</svg>`;
}

function png(svgText, file) {
  const r = new Resvg(svgText, { fitTo: { mode: 'width', value: S }, font: { loadSystemFonts: true } });
  fs.writeFileSync(path.join(OUT, file), r.render().asPng());
}

// Figma's SVG import doesn't support noise filters or blend modes, so leave the grain out of the editable file.
const editable = svg('placeholder').replace(/<rect[^>]*filter="url\(#grain\)"[^>]*\/>/g, '');
fs.writeFileSync(path.join(OUT, 'cap-mockup-editable.svg'), editable);
png(svg('blank'), 'cap-blank.png');
png(svg('example', { skirt: '#d6343f' }), 'cap-example.png');
png(svg(null, { withArt: false }), 'cap-overlay.png');
console.log('done:', fs.readdirSync(OUT).join(', '));
