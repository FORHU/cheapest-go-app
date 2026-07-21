const sharp = require('sharp');
const path = require('path');

const DEST = path.join(__dirname, '../../cheapest-go-mobile/assets/images/');

const mark = (bg) => `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${bg ? '<rect width="1024" height="1024" fill="#1d4ed8"/>' : ''}
  <text
    x="512" y="512"
    font-family="Segoe UI Black, Segoe UI, sans-serif"
    font-size="480"
    font-weight="900"
    text-anchor="middle"
    dominant-baseline="central"
    fill="white"
    letter-spacing="-16">CG</text>
</svg>`;

async function run() {
  await sharp(Buffer.from(mark(true))).resize(1024, 1024).png().toFile(path.join(DEST, 'icon.png'));
  console.log('✓ icon.png');

  await sharp(Buffer.from(mark(false))).resize(1024, 1024).png().toFile(path.join(DEST, 'adaptive-icon.png'));
  console.log('✓ adaptive-icon.png');

  await sharp(Buffer.from(mark(false))).resize(1024, 1024).png().toFile(path.join(DEST, 'splash-icon.png'));
  console.log('✓ splash-icon.png');

  await sharp(Buffer.from(mark(true))).resize(64, 64).png().toFile(path.join(DEST, 'favicon.png'));
  console.log('✓ favicon.png');
}

run().catch(console.error);
