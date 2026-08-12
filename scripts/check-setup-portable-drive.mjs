import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratchParent = path.join(root, 'tmp');
mkdirSync(scratchParent, { recursive: true });
const scratch = mkdtempSync(path.join(scratchParent, 'fe-setup-portable-drive-'));
const harness = path.join(scratch, 'harness');
const project = path.join(harness, 'SetupPortableDriveProbe.csproj');
const source = path.join(root, 'native', 'windows', 'setup', 'Program.cs');
const dotnetHome = path.join(scratch, 'dotnet-home');
mkdirSync(harness, { recursive: true });
mkdirSync(dotnetHome, { recursive: true });

writeFileSync(project, `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <StartupObject>SetupPortableDriveProbe</StartupObject>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="${source.replaceAll('\\', '/')}" Link="Program.cs" />
  </ItemGroup>
</Project>
`, 'utf8');
writeFileSync(path.join(harness, 'Probe.cs'), `
using System;
using System.IO;
using FeMonster.Setup;

internal static class SetupPortableDriveProbe
{
    private static int Main(string[] args)
    {
        if (args.Length != 1) throw new ArgumentException("expected install root");
        string install = Path.GetFullPath(args[0]);
        string selected = Path.GetFullPath(SetupEngine.SelectInstallerSessionLogPathForTest(install));
        string selectedRoot = Path.GetPathRoot(selected) ?? "";
        string installRoot = Path.GetPathRoot(install) ?? "";
        if (!string.Equals(selectedRoot, installRoot, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"session log stayed on {selectedRoot} instead of {installRoot}");
        if (!selected.Contains(".fe-monster-setup-state", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("selected-drive session-log directory was not used");
        Console.WriteLine(selected);
        return 0;
    }
}
`, 'utf8');

try {
  const install = path.join(root, 'tmp', 'portable-drive-probe', 'app');
  const result = spawnSync('dotnet', [
    'run',
    '--disable-build-servers',
    '--project', project,
    '--', install
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    env: {
      ...process.env,
      DOTNET_CLI_HOME: dotnetHome,
      DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER: '1',
      TEMP: scratch,
      TMP: scratch,
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /\.fe-monster-setup-state[\\/]logs[\\/]install-/i);
  console.log('Setup portable-drive log selection: OK');
} finally {
  try {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
  } catch (error) {
    // A just-terminated .NET compiler/Defender scan can transiently retain a
    // handle. Cleanup is diagnostic-only and must not turn a green portability
    // assertion into a product failure; the workspace temp root is isolated.
    console.warn(`Portable-drive probe cleanup was deferred: ${error.code || error.message}`);
  }
}
