import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratchParent = path.join(root, 'tmp');
mkdirSync(scratchParent, { recursive: true });
const scratch = mkdtempSync(path.join(scratchParent, 'setup-temp-path-'));
mkdirSync(path.join(scratch, 'junction-target'));
symlinkSync(path.join(scratch, 'junction-target'), path.join(scratch, 'junction'), 'junction');
const harness = path.join(scratch, 'harness');
mkdirSync(harness);
const project = path.join(harness, 'SetupTempPathProbe.csproj');
const source = path.join(root, 'native', 'windows', 'setup', 'Program.cs');
writeFileSync(project, `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <StartupObject>SetupTempPathProbe</StartupObject>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="${source.replaceAll('\\', '/')}" Link="Program.cs" />
  </ItemGroup>
</Project>
`, 'utf8');
writeFileSync(path.join(harness, 'Probe.cs'), `
using System.Diagnostics;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FeMonster.Setup;

internal static class SetupTempPathProbe
{
    private static void AddText(ZipArchive archive, string name, string text)
    {
        using StreamWriter writer = new(archive.CreateEntry(name).Open(), new UTF8Encoding(false));
        writer.Write(text);
    }

    private static void Check(string fixtureRoot, string name, int parentLength, int relativeLength, bool expectRelocation)
    {
        string caseRoot = Path.Combine(fixtureRoot, name);
        Directory.CreateDirectory(caseRoot);
        string installParent = Path.Combine(caseRoot, "安装 " + new string('d', parentLength - caseRoot.Length - 4));
        Directory.CreateDirectory(installParent);
        string install = Path.Combine(installParent, "app");
        string distribution = Path.Combine(caseRoot, "distribution");
        Directory.CreateDirectory(distribution);
        string exe = Path.Combine(distribution, "FE-Monster-Setup.exe");
        File.WriteAllBytes(exe, Array.Empty<byte>());
        string relative = "nested/" + new string('x', relativeLength - 11) + ".txt";
        using MemoryStream payloadBytes = new();
        using (ZipArchive payload = new(payloadBytes, ZipArchiveMode.Create, leaveOpen: true))
            AddText(payload, "FE Monster/" + relative, "payload-fixture");
        byte[] payloadZip = payloadBytes.ToArray();
        string manifest = JsonSerializer.Serialize(new {
            schemaVersion = 1, architecture = "x64", minimumWindowsBuild = 17763,
            payloadFile = "FE-Monster-Payload.zip", payloadLength = payloadZip.Length,
            payloadSha256 = Convert.ToHexString(SHA256.HashData(payloadZip)),
            requiredInstallBytes = 15, maxRelativePathLength = relative.Length, webView2Mode = "online"
        });
        using (ZipArchive bundle = ZipFile.Open(Path.Combine(distribution, "FE-Monster-Setup-Bundle.zip"), ZipArchiveMode.Create))
        {
            AddText(bundle, "setup-manifest.json", manifest);
            AddText(bundle, "install-fe-monster.ps1", "# Fixture only; never execute an installer.");
            using Stream stream = bundle.CreateEntry("FE-Monster-Payload.zip").Open();
            stream.Write(payloadZip);
        }
        string tempRoot = SetupEngine.ExtractBundle(exe, install);
        try
        {
            PayloadPreparation payload = SetupEngine.PreparePayload(tempRoot);
            string extracted = Path.Combine(payload.Root, relative.Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(extracted)) throw new Exception(".NET extraction lost the fixture file");
            ProcessStartInfo probe = new("powershell.exe") {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
            };
            probe.ArgumentList.Add("-NoProfile");
            probe.ArgumentList.Add("-Command");
            probe.ArgumentList.Add("if (!(Test-Path -LiteralPath $Env:FE_SETUP_PROBE_FILE -PathType Leaf)) { exit 17 }");
            probe.Environment["FE_SETUP_PROBE_FILE"] = extracted;
            using Process process = Process.Start(probe)!;
            process.WaitForExit();
            if (process.ExitCode != 0)
                throw new Exception($"{name}: Windows PowerShell cannot see the extracted payload ({extracted.Length} characters)");
            if (extracted.Length > 240) throw new Exception($"{name}: extraction exceeded the legacy path budget");
            if (!string.Equals(Path.GetPathRoot(tempRoot), Path.GetPathRoot(install), StringComparison.OrdinalIgnoreCase))
                throw new Exception($"{name}: temporary payload moved off the installation drive");
            bool relocated = !string.Equals(Path.GetDirectoryName(tempRoot), installParent, StringComparison.OrdinalIgnoreCase);
            if (relocated != expectRelocation)
                throw new Exception($"{name}: unexpected temporary parent selection");
            if (!tempRoot.StartsWith(fixtureRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new Exception($"{name}: temporary payload escaped the dedicated fixture");
            if (Directory.Exists(install)) throw new Exception($"{name}: extraction changed the requested install target");
            Console.WriteLine($"{name}: payload relative {relative.Length}, install parent {installParent.Length}, extracted {extracted.Length}: OK");
        }
        finally
        {
            if (tempRoot.StartsWith(fixtureRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
                Path.GetFileName(tempRoot).StartsWith(".fms-", StringComparison.Ordinal))
                Directory.Delete(tempRoot, true);
        }
        if (Directory.EnumerateDirectories(installParent, ".fms-*").Any())
            throw new Exception($"{name}: the superseded temporary directory was retained");
    }

    private static int Main(string[] args)
    {
        string fixtureRoot = Path.GetFullPath(args[0]);
        Check(fixtureRoot, "deep", 112, 110, true);
        Check(fixtureRoot, "different-budget", 90, 140, true);
        Check(fixtureRoot, "short-payload", 112, 40, false);
        Check(fixtureRoot, "boundary-240", 92, 110, false);
        Check(fixtureRoot, "boundary-241", 93, 110, true);
        Check(fixtureRoot, "junction", 92, 40, true);
        if (Directory.EnumerateDirectories(Path.Combine(fixtureRoot, "junction-target"), ".fms-*", SearchOption.AllDirectories).Any())
            throw new Exception("Temporary extraction traversed a junction");
        Console.WriteLine("Setup temporary payload path budget: OK");
        return 0;
    }
}
`, 'utf8');

try {
  const result = spawnSync('dotnet', ['run', '--disable-build-servers', '--project', project, '--', scratch], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    env: {
      ...process.env,
      DOTNET_CLI_HOME: path.join(scratch, 'dotnet-home'),
      DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER: '1',
      DOTNET_NOLOGO: '1',
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
      DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
      TEMP: scratch,
      TMP: scratch,
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Setup temporary payload path budget: OK/);
  console.log(result.stdout.trim());
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
}
