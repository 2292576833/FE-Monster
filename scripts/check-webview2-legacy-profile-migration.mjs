import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'fe-webview2-legacy-migration-'));
const project = path.join(scratch, 'WebView2LegacyMigrationProbe.csproj');
const probe = path.join(scratch, 'Probe.cs');
const helper = path.join(
  root,
  'native',
  'windows',
  'winforms',
  'WebView2ProfileMigration.cs',
);

writeFileSync(project, `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="${helper.replaceAll('\\', '/')}" Link="WebView2ProfileMigration.cs" />
  </ItemGroup>
</Project>
`, 'utf8');

writeFileSync(probe, String.raw`
using FeMonster.Client;

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static void Write(string root, string relative, string value)
{
    string path = Path.Combine(root, relative);
    Directory.CreateDirectory(Path.GetDirectoryName(path)!);
    File.WriteAllText(path, value);
}

string scratch = Path.GetFullPath(args[0]);
string legacyRoot = Path.Combine(scratch, "legacy");
Directory.CreateDirectory(legacyRoot);
Write(legacyRoot, @"Default\Local Storage\leveldb\000003.log", "legacy-local-storage");
Write(legacyRoot, @"Default\IndexedDB\community\record.bin", "legacy-community-record");
Write(legacyRoot, "Local State", "legacy-browser-state");
Write(legacyRoot, @"DesktopHostV2\Default\Local Storage\leveldb\000003.log", "new-local-storage");
Write(legacyRoot, @"DesktopHostV2-Test-fixture\Default\Local Storage\secret.log", "test-only");
Write(legacyRoot, @"DesktopHostV2-SoftwareRecovery\Default\Local Storage\recovery.log", "recovery-only");

int copied = WebView2ProfileMigration.MigrateLegacyProfile(legacyRoot, "DesktopHostV2");
string destination = Path.Combine(legacyRoot, "DesktopHostV2");
Require(copied >= 2, "legacy profile files were not copied");
Require(
    File.ReadAllText(Path.Combine(destination, @"Default\Local Storage\leveldb\000003.log")) == "new-local-storage",
    "existing current-profile state was overwritten"
);
Require(
    File.ReadAllText(Path.Combine(destination, @"Default\IndexedDB\community\record.bin")) == "legacy-community-record",
    "legacy IndexedDB state was not migrated"
);
Require(
    File.ReadAllText(Path.Combine(destination, "Local State")) == "legacy-browser-state",
    "legacy root browser state was not migrated"
);
Require(
    !File.Exists(Path.Combine(destination, @"DesktopHostV2-Test-fixture\Default\Local Storage\secret.log")),
    "test-only WebView2 profile leaked into the production profile"
);
Require(
    !File.Exists(Path.Combine(destination, @"DesktopHostV2-SoftwareRecovery\Default\Local Storage\recovery.log")),
    "software-recovery profile was recursively imported"
);
Require(
    File.Exists(Path.Combine(destination, WebView2ProfileMigration.MigrationMarkerName)),
    "completed migration marker was not written"
);
Require(
    File.ReadAllText(Path.Combine(legacyRoot, @"Default\Local Storage\leveldb\000003.log")) == "legacy-local-storage",
    "legacy source state was destructively changed"
);

Write(legacyRoot, @"Default\Local Storage\leveldb\late.log", "late-legacy-write");
Require(
    WebView2ProfileMigration.MigrateLegacyProfile(legacyRoot, "DesktopHostV2") == 0,
    "a completed migration ran twice"
);
Require(
    !File.Exists(Path.Combine(destination, @"Default\Local Storage\leveldb\late.log")),
    "a completed profile was mutated by a later legacy write"
);

string directUpgradeRoot = Path.Combine(scratch, "direct-upgrade");
Directory.CreateDirectory(directUpgradeRoot);
Write(directUpgradeRoot, @"Default\Local Storage\leveldb\000003.log", "direct-upgrade-local-storage");
Write(directUpgradeRoot, @"Default\IndexedDB\history\record.bin", "direct-upgrade-history");
Require(
    WebView2ProfileMigration.MigrateLegacyProfile(directUpgradeRoot, "DesktopHostV2") == 2,
    "a direct legacy upgrade did not migrate the complete browser profile"
);
Require(
    File.ReadAllText(Path.Combine(directUpgradeRoot, @"DesktopHostV2\Default\Local Storage\leveldb\000003.log")) == "direct-upgrade-local-storage",
    "direct-upgrade localStorage was not preserved"
);
Require(
    File.ReadAllText(Path.Combine(directUpgradeRoot, @"DesktopHostV2\Default\IndexedDB\history\record.bin")) == "direct-upgrade-history",
    "direct-upgrade IndexedDB history was not preserved"
);

string emptyRoot = Path.Combine(scratch, "empty");
Directory.CreateDirectory(emptyRoot);
Require(
    WebView2ProfileMigration.MigrateLegacyProfile(emptyRoot, "DesktopHostV2") == 0,
    "an empty WebView2 root was mistaken for a legacy profile"
);
Require(
    !Directory.Exists(Path.Combine(emptyRoot, "DesktopHostV2")),
    "an empty root created a spurious current profile"
);

Console.WriteLine("WebView2 legacy profile migration PASS");
`, 'utf8');

try {
  const result = spawnSync('dotnet', ['run', '--project', project, '--configuration', 'Release', '--', scratch], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DOTNET_CLI_HOME: path.join(scratch, 'dotnet-home'),
      NUGET_PACKAGES: process.env.NUGET_PACKAGES || path.join(root, 'native', 'windows', 'packages'),
    },
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
