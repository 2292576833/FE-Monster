import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'fe-setup-registered-upgrade-'));
const harness = path.join(scratch, 'harness');
const project = path.join(harness, 'SetupRegisteredUpgradeProbe.csproj');
const source = path.join(root, 'native', 'windows', 'setup', 'Program.cs');
const dotnetHome = path.join(scratch, 'dotnet-home');
const fixtures = path.join(scratch, '旧版 用户记录');
mkdirSync(harness, { recursive: true });
mkdirSync(dotnetHome, { recursive: true });
mkdirSync(fixtures, { recursive: true });

writeFileSync(project, `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <StartupObject>SetupRegisteredUpgradeProbe</StartupObject>
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

internal static class SetupRegisteredUpgradeProbe
{
    private static void Touch(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, "fixture");
    }

    private static void RequireSelected(string rawRegistryValue, string expected, string label)
    {
        string actual = SetupOptions.SelectRegisteredInstallDirectory(rawRegistryValue);
        if (!string.Equals(Path.GetFullPath(actual), Path.GetFullPath(expected), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"{label} registered install was not selected: {actual}");
    }

    private static void RequireRejected(string rawRegistryValue, string label)
    {
        string actual = SetupOptions.SelectRegisteredInstallDirectory(rawRegistryValue);
        if (!string.IsNullOrWhiteSpace(actual))
            throw new InvalidOperationException($"{label} directory was accepted: {actual}");
    }

    private static int Main(string[] args)
    {
        if (args.Length != 1) throw new ArgumentException("expected fixture root");
        string fixtureRoot = Path.GetFullPath(args[0]);

        string modern = Path.Combine(fixtureRoot, "modern");
        Touch(Path.Combine(modern, "out", "fe-monster-java.jar"));
        Touch(Path.Combine(modern, "web", "index.html"));
        Touch(Path.Combine(modern, "native", "windows", "build", "winforms", "FE Monster.exe"));
        RequireSelected(modern, modern, "modern");

        string legacyVbs = Path.Combine(fixtureRoot, "legacy-vbs");
        Touch(Path.Combine(legacyVbs, "out", "fe-monster-java.jar"));
        Touch(Path.Combine(legacyVbs, "FE Monster.vbs"));
        Environment.SetEnvironmentVariable("FE_SETUP_LEGACY_ROOT", legacyVbs);
        RequireSelected("%FE_SETUP_LEGACY_ROOT%", legacyVbs, "legacy VBS");

        string legacyRun = Path.Combine(fixtureRoot, "legacy-run");
        Touch(Path.Combine(legacyRun, "out", "fe-monster-java.jar"));
        Touch(Path.Combine(legacyRun, "run.cmd"));
        RequireSelected(legacyRun, legacyRun, "legacy run.cmd");

        string unrelated = Path.Combine(fixtureRoot, "unrelated");
        Touch(Path.Combine(unrelated, "out", "fe-monster-java.jar"));
        Touch(Path.Combine(unrelated, "personal-records.txt"));
        RequireRejected(unrelated, "unrelated");
        RequireRejected(Path.Combine(fixtureRoot, "missing"), "missing");
        RequireRejected("   ", "blank");

        Console.WriteLine("Setup registered modern/legacy upgrade path: OK");
        return 0;
    }
}
`, 'utf8');

try {
  const result = spawnSync('dotnet', [
    'run',
    '--disable-build-servers',
    '--project', project,
    '--', fixtures,
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
  assert.match(result.stdout, /registered modern\/legacy upgrade path: OK/);
  console.log('Setup registered-upgrade selection: OK');
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
