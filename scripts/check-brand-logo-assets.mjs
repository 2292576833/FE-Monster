import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function pngSize(relativePath) {
  const bytes = read(relativePath);
  const signature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`${relativePath} is not a PNG`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function icoSizes(relativePath) {
  const bytes = read(relativePath);
  if (bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) {
    throw new Error(`${relativePath} is not an ICO`);
  }
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    return bytes[offset] || 256;
  });
}

const iosProject = fs.readdirSync(root, { withFileTypes: true })
  .find((entry) => entry.isDirectory()
    && entry.name.startsWith('FE moster iOS')
    && fs.existsSync(path.join(root, entry.name, 'project.yml')));

if (!iosProject) throw new Error('iOS project directory was not found');

const macProject = fs.readdirSync(root, { withFileTypes: true })
  .find((entry) => entry.isDirectory()
    && fs.existsSync(path.join(root, entry.name, 'Build', 'build-macos.sh')));

if (!macProject) throw new Error('macOS project directory was not found');

const expectedPngs = new Map([
  ['branding/fe-monster-logo-front-master.png', 1254],
  ['native/windows/assets/fe-monster.png', 256],
  ['web/assets/fe-monster-app-icon.png', 512],
  ['web/assets/fe-monster-favicon.png', 64],
  ['download-site/public/media/logo.png', 512],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192],
  [`${iosProject.name}/App/Resources/Assets.xcassets/AppIcon.appiconset/FE-Monster-AppIcon-1024.png`, 1024],
  [`${macProject.name}/Build/AppIcon.iconset/icon_16x16.png`, 16],
  [`${macProject.name}/Build/AppIcon.iconset/icon_16x16@2x.png`, 32],
  [`${macProject.name}/Build/AppIcon.iconset/icon_32x32.png`, 32],
  [`${macProject.name}/Build/AppIcon.iconset/icon_32x32@2x.png`, 64],
  [`${macProject.name}/Build/AppIcon.iconset/icon_128x128.png`, 128],
  [`${macProject.name}/Build/AppIcon.iconset/icon_128x128@2x.png`, 256],
  [`${macProject.name}/Build/AppIcon.iconset/icon_256x256.png`, 256],
  [`${macProject.name}/Build/AppIcon.iconset/icon_256x256@2x.png`, 512],
  [`${macProject.name}/Build/AppIcon.iconset/icon_512x512.png`, 512],
  [`${macProject.name}/Build/AppIcon.iconset/icon_512x512@2x.png`, 1024],
]);

for (const [relativePath, expectedSize] of expectedPngs) {
  const size = pngSize(relativePath);
  if (size.width !== expectedSize || size.height !== expectedSize) {
    throw new Error(`${relativePath} is ${size.width}x${size.height}; expected ${expectedSize}x${expectedSize}`);
  }
}

const icoFrames = icoSizes('native/windows/assets/fe-monster.ico');
const expectedIcoFrames = [16, 24, 32, 48, 64, 128, 256];
if (JSON.stringify(icoFrames) !== JSON.stringify(expectedIcoFrames)) {
  throw new Error(`Unexpected ICO frames: ${icoFrames.join(', ')}`);
}

const winformsProject = read('native/windows/winforms/FeMonsterClient.WinForms.csproj').toString('utf8');
const setupProject = read('native/windows/setup/FeMonsterSetup.csproj').toString('utf8');
const setupProgram = read('native/windows/setup/Program.cs').toString('utf8');
const androidManifest = read('android/app/src/main/AndroidManifest.xml').toString('utf8');
const webIndex = read('web/index.html').toString('utf8');
const macInfoPlist = read(`${macProject.name}/Build/Info.plist`).toString('utf8');
const macBuildScript = read(`${macProject.name}/Build/build-macos.sh`).toString('utf8');

for (const [name, source, needle] of [
  ['WinForms icon reference', winformsProject, '<ApplicationIcon>..\\assets\\fe-monster.ico</ApplicationIcon>'],
  ['installer icon reference', setupProject, '<ApplicationIcon>..\\assets\\fe-monster.ico</ApplicationIcon>'],
  ['installer UI associated icon', setupProgram, 'Image = Icon?.ToBitmap()'],
  ['Android launcher icon', androidManifest, 'android:icon="@mipmap/ic_launcher"'],
  ['Android round launcher icon', androidManifest, 'android:roundIcon="@mipmap/ic_launcher"'],
  ['web favicon', webIndex, 'href="/assets/fe-monster-favicon.png"'],
  ['web Apple touch icon', webIndex, 'href="/assets/fe-monster-app-icon.png"'],
  ['macOS bundle icon declaration', macInfoPlist, '<string>FE-Monster</string>'],
  ['macOS icon compilation', macBuildScript, 'iconutil -c icns'],
]) {
  if (!source.includes(needle)) throw new Error(`${name} is missing`);
}

console.log(`Brand logo assets OK: ${expectedPngs.size} PNGs, ICO ${icoFrames.join('/')}, all platform references present.`);
