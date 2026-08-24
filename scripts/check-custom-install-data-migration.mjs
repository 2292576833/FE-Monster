import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'fe-custom-install-data-migration-'));
const project = path.join(scratch, 'CustomInstallDataMigrationProbe.csproj');
const helper = path.join(
  root,
  'native',
  'windows',
  'winforms',
  'LegacyDataDirectoryMigration.cs',
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
    <Compile Include="${helper.replaceAll('\\', '/')}" Link="LegacyDataDirectoryMigration.cs" />
  </ItemGroup>
</Project>
`, 'utf8');

writeFileSync(path.join(scratch, 'Probe.cs'), String.raw`
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
string source = Path.Combine(scratch, "custom-old-install", "data");
string stable = Path.Combine(scratch, "LocalAppData", "FE Monster", "data");
Directory.CreateDirectory(source);
Directory.CreateDirectory(stable);

Write(source, "community-device-credentials.json", "legacy-registered-device");
Write(source, "client-preferences.json", "legacy-client-preferences");
Write(source, @"official-browser-login\qq\profile.json", "legacy-browser-login");
Write(source, @"community-account-profiles\netease-user.json", "legacy-community-profile");
Write(source, "community-server-url.txt", "https://release.example/community");
Write(source, @"wallpapers\user-import.bin", "legacy-user-wallpaper");

Write(stable, "community-device-credentials.json", "fresh-unregistered-device");
Write(stable, "client-preferences.json", "fresh-default-preferences");
Write(stable, "new-install-only.json", "keep-new-state");

LegacyDataMigrationResult result = LegacyDataDirectoryMigration.Migrate(source, stable);
Require(result.Completed, "migration did not complete");
Require(result.ReplacedFiles == 2, "conflicting identity/preferences were not replaced");
Require(result.BackedUpFiles == 2, "conflicting stable files were not backed up");
Require(File.ReadAllText(Path.Combine(stable, "community-device-credentials.json")) == "legacy-registered-device", "legacy device identity is not active");
Require(File.ReadAllText(Path.Combine(stable, "client-preferences.json")) == "legacy-client-preferences", "legacy preferences are not active");
Require(File.ReadAllText(Path.Combine(stable, @"official-browser-login\qq\profile.json")) == "legacy-browser-login", "official browser login was not migrated");
Require(File.ReadAllText(Path.Combine(stable, @"community-account-profiles\netease-user.json")) == "legacy-community-profile", "community profile was not migrated");
Require(File.ReadAllText(Path.Combine(stable, @"wallpapers\user-import.bin")) == "legacy-user-wallpaper", "imported wallpaper was not migrated");
Require(File.ReadAllText(Path.Combine(stable, "new-install-only.json")) == "keep-new-state", "destination-only state was removed");
Require(File.ReadAllText(Path.Combine(source, "community-device-credentials.json")) == "legacy-registered-device", "legacy source was modified");

string[] backups = Directory.GetFiles(stable, "*", SearchOption.AllDirectories)
    .Where(path => path.Contains(LegacyDataDirectoryMigration.BackupDirectoryPrefix, StringComparison.Ordinal))
    .ToArray();
Require(backups.Any(path => File.ReadAllText(path) == "fresh-unregistered-device"), "replaced device identity was not recoverable");
Require(backups.Any(path => File.ReadAllText(path) == "fresh-default-preferences"), "replaced preferences were not recoverable");

Write(source, "client-preferences.json", "late-legacy-change");
LegacyDataMigrationResult repeated = LegacyDataDirectoryMigration.Migrate(source, stable);
Require(!repeated.Completed && repeated.CopiedFiles == 0 && repeated.ReplacedFiles == 0, "completed migration ran twice");
Require(File.ReadAllText(Path.Combine(stable, "client-preferences.json")) == "legacy-client-preferences", "late source change overwrote active state");

Console.WriteLine("Custom-install legacy data migration PASS");
`, 'utf8');

try {
  const result = spawnSync('dotnet', ['run', '--project', project, '--configuration', 'Release', '--', scratch], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DOTNET_CLI_HOME: path.join(scratch, 'dotnet-home'),
      NUGET_PACKAGES: process.env.NUGET_PACKAGES || path.join(root, 'native', 'windows', 'packages'),
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    },
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
