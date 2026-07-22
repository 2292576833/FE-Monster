import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const appSource = fs.readFileSync(path.join(webRoot, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const cssPath = path.join(webRoot, 'text-fonts.css');

const bundledFonts = [
  ['unbounded-sans', 'FE Wujiehei', 'fonts/wujiehei/LogoSCUnboundedSans-Regular.ttf'],
  ['caveat-regular', 'FE Caveat', 'fonts/caveat/Caveat-Variable.ttf'],
  ['smiley-sans', 'FE Smiley Sans', 'fonts/smiley-sans/SmileySans-Oblique.woff2'],
  ['source-han-heavy', 'FE Noto Serif SC', 'fonts/source-han-serif/NotoSerifSC-VF.ttf'],
  ['yanbo-serif', 'FE Yanbo Serif', 'fonts/yanbo-serif/MaoKenWangYanBoSong-Regular.ttf']
];

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(fs.existsSync(cssPath), '缺少 web/text-fonts.css');
expect(/text-fonts\.css/.test(indexSource), 'index.html 未加载 text-fonts.css');

const cssSource = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
for (const [id, family, relativeFile] of bundledFonts) {
  const fontPath = path.join(webRoot, ...relativeFile.split('/'));
  expect(fs.existsSync(fontPath), `缺少内置字体文件：${relativeFile}`);
  expect(appSource.includes(`id: '${id}'`) && appSource.includes(`embeddedFamily: '${family}'`), `${id} 未声明 embeddedFamily`);
  expect(cssSource.includes(`font-family: '${family}'`) || cssSource.includes(`font-family: "${family}"`), `${family} 缺少 @font-face`);
  expect(cssSource.includes(relativeFile.replace('fonts/', './fonts/')), `${relativeFile} 未被 CSS 引用`);
}

const licenseFiles = [
  'fonts/LICENSES/Caveat-OFL.txt',
  'fonts/LICENSES/SmileySans-OFL.txt',
  'fonts/LICENSES/NotoSerifSC-OFL.txt',
  'fonts/LICENSES/UnboundedSans-OFL.txt',
  'fonts/LICENSES/YanboSerif-OFL.txt',
  'fonts/LICENSE-AUDIT.md'
];
for (const relativeFile of licenseFiles) {
  expect(fs.existsSync(path.join(webRoot, ...relativeFile.split('/'))), `缺少授权文件：${relativeFile}`);
}

if (failures.length) {
  console.error(`Bundled text font check failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Bundled text font check passed: ${bundledFonts.length} fonts, ${licenseFiles.length} license/audit files.`);
