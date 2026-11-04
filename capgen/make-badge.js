// Generates a glossy pin-badge (button) mockup: overlay, blank, example, design template and editable SVG.
// Usage: node make-badge.js   → writes into ../pin-badge/
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, '..', 'pin-badge');
fs.mkdirSync(OUT, { recursive: true });

const S = 1200;          // canvas size
const C = S / 2;         // centre
const R = 520;           // badge radius → artwork is 1040×1040
const SAFE = 0.86;       // keep text inside this share of the radius (the edge curls over)

const defs = `
  <defs>
    <clipPath id="badge-clip"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="crisp" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    <!-- rolled edge: art darkens and bends away near the rim -->
    <radialGradient id="edge-curl" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.80" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.93" stop-color="#000" stop-opacity="0.10"/>
      <stop offset="0.985" stop-color="#000" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <!-- overall dome light: brighter top-left, darker bottom-right -->
    <linearGradient id="dome" x1="0.15" y1="0.1" x2="0.85" y2="0.95">
      <stop offset="0" stop-color="#fff" stop-opacity="0.16"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.16"/>
    </linearGradient>
    <linearGradient id="rim-light" x1="0.1" y1="0.1" x2="0.9" y2="0.9">
      <stop offset="0" stop-color="#fff" stop-opacity="0.85"/>
      <stop offset="0.35" stop-color="#fff" stop-opacity="0.15"/>
      <stop offset="0.65" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.35"/>
    </linearGradient>
  </defs>`;

const shadowLayer = `
  <g id="Shadow">
    <ellipse cx="${C + 18}" cy="${C + 30}" rx="${R}" ry="${R - 6}" fill="#000" opacity="0.32" filter="url(#drop)"/>
    <circle cx="${C + 4}" cy="${C + 8}" r="${R}" fill="#000" opacity="0.25" filter="url(#crisp)"/>
  </g>`;

// Gloss sits on top of the artwork, like the clear plastic film on a real badge.
const glossLayer = `
  <g id="Gloss and edge (keep on top)">
    <circle cx="${C}" cy="${C}" r="${R}" fill="url(#dome)"/>
    <circle cx="${C}" cy="${C}" r="${R}" fill="url(#edge-curl)"/>
    <g clip-path="url(#badge-clip)">
      <!-- broad soft window reflection, top-left -->
      <path d="M${C - 400},${C - 120} C${C - 380},${C - 340} ${C - 180},${C - 450} ${C + 60},${C - 470}
               C${C - 140},${C - 380} ${C - 300},${C - 260} ${C - 400},${C - 120} Z"
            fill="#fff" opacity="0.55" filter="url(#soft)"/>
      <!-- sharp specular highlight -->
      <ellipse cx="${C - 250}" cy="${C - 330}" rx="70" ry="26" transform="rotate(-38 ${C - 250} ${C - 330})"
               fill="#fff" opacity="0.85" filter="url(#crisp)"/>
      <!-- faint bounce light, bottom-right -->
      <path d="M${C + 430},${C + 120} C${C + 400},${C + 300} ${C + 260},${C + 420} ${C + 80},${C + 470}
               C${C + 250},${C + 380} ${C + 370},${C + 260} ${C + 430},${C + 120} Z"
            fill="#fff" opacity="0.22" filter="url(#soft)"/>
    </g>
    <circle cx="${C}" cy="${C}" r="${R - 6}" fill="none" stroke="url(#rim-light)" stroke-width="5"/>
    <circle cx="${C}" cy="${C}" r="${R - 1}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>
  </g>`;

// Original example art (not a copy of the reference design).
const artworks = {
  blank: `<circle cx="${C}" cy="${C}" r="${R}" fill="#f4f1ea"/>`,
  placeholder: `
    <circle cx="${C}" cy="${C}" r="${R}" fill="#f4f1ea"/>
    <circle cx="${C}" cy="${C}" r="${R * SAFE}" fill="none" stroke="#c9c2b2" stroke-width="4" stroke-dasharray="16 12"/>
    <text x="${C}" y="${C + 20}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="60" fill="#a8a090">YOUR POSTER</text>`,
  example: `
    <circle cx="${C}" cy="${C}" r="${R}" fill="#2f6be6"/>
    <circle cx="${C}" cy="${C}" r="${R - 70}" fill="none" stroke="#f4ecd6" stroke-width="10"/>
    <path id="arc-top" d="M${C - 360},${C} A360,360 0 0 1 ${C + 360},${C}" fill="none"/>
    <text font-family="Arial Black, Arial" font-weight="900" font-size="92" fill="#f4ecd6" letter-spacing="6">
      <textPath href="#arc-top" startOffset="50%" text-anchor="middle">MY SPOT</textPath>
    </text>
    <path d="M${C},${C - 150} L${C + 38},${C - 40} L${C + 150},${C - 40} L${C + 60},${C + 28} L${C + 95},${C + 140}
             L${C},${C + 72} L${C - 95},${C + 140} L${C - 60},${C + 28} L${C - 150},${C - 40} L${C - 38},${C - 40} Z"
          fill="#ffd23f" stroke="#1d3f94" stroke-width="10" stroke-linejoin="round"/>
    <text x="${C}" y="${C + 300}" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="70" fill="#f4ecd6" letter-spacing="10">SMI MAP</text>`,
};

function svg({ art = 'blank', withShadow = true, transparentFace = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
${defs}
${withShadow ? shadowLayer : ''}
${transparentFace ? '' : `<g id="Your poster (replace me)" clip-path="url(#badge-clip)">${artworks[art]}</g>`}
${glossLayer}
</svg>`;
}

// Flat guide for designers: exact size, cut line and safe zone. No gloss.
const template = `<svg xmlns="http://www.w3.org/2000/svg" width="${R * 2}" height="${R * 2}" viewBox="0 0 ${R * 2} ${R * 2}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <circle cx="${R}" cy="${R}" r="${R - 2}" fill="#f4f1ea" stroke="#e2495b" stroke-width="4"/>
  <circle cx="${R}" cy="${R}" r="${R * SAFE}" fill="none" stroke="#2f6be6" stroke-width="4" stroke-dasharray="18 12"/>
  <text x="${R}" y="${R - 30}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="44" fill="#2f6be6">Keep text inside the blue line</text>
  <text x="${R}" y="${R + 30}" text-anchor="middle" font-family="Arial" font-size="34" fill="#e2495b">Red line = edge of the badge</text>
  <text x="${R}" y="${R + 80}" text-anchor="middle" font-family="Arial" font-size="30" fill="#777">1040 × 1040 px · export PNG</text>
</svg>`;

function png(svgText, file, width = S) {
  const r = new Resvg(svgText, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } });
  fs.writeFileSync(path.join(OUT, file), r.render().asPng());
}

png(svg({ transparentFace: true }), 'badge-overlay.png');
png(svg({ art: 'blank' }), 'badge-blank.png');
png(svg({ art: 'example' }), 'badge-example.png');
png(template, 'badge-design-template.png', R * 2);
fs.writeFileSync(path.join(OUT, 'badge-mockup-editable.svg'), svg({ art: 'placeholder' }));
console.log('done:', fs.readdirSync(OUT).join(', '));
