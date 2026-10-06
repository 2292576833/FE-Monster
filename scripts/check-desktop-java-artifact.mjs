import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratchParent = path.join(root, 'tmp');
mkdirSync(scratchParent, { recursive: true });
const scratch = mkdtempSync(path.join(scratchParent, 'desktop-java-artifact-'));
assert.ok(path.resolve(scratch).startsWith(path.resolve(scratchParent) + path.sep));
const source = path.join(root, 'native/windows/winforms/JavaBuildArtifact.cs');
const program = readFileSync(path.join(root, 'native/windows/winforms/Program.cs'), 'utf8');
assert.match(program, /string jar = JavaBuildArtifact\.Resolve\(root\)/);
assert.match(program, /if \(JavaBuildArtifact\.Resolve\(root\) is not null/);
const xmlPath = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const project = path.join(scratch, 'DesktopJavaArtifactProbe.csproj');
writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup><Compile Include="${xmlPath(source)}" Link="JavaBuildArtifact.cs" /></ItemGroup>
</Project>`);
writeFileSync(path.join(scratch, 'Probe.cs'), `
using FeMonster.Client;

string root = Path.GetFullPath(args[0]);
string output = Path.Combine(root, "out");
Directory.CreateDirectory(output);
string stable = Path.Combine(output, "fe-monster-java.jar");
string latest = Path.Combine(output, "fe-monster-java-new.jar");
string marker = Path.Combine(output, "run-jar.txt");
File.WriteAllText(stable, "old");
File.WriteAllText(latest, "new");
int assertions = 0;
void Expect(string? expected, string scenario)
{
    string? actual = JavaBuildArtifact.Resolve(root);
    if (!string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase))
        throw new Exception(scenario + ": expected " + expected + ", got " + actual);
    assertions++;
}
Expect(stable, "installed bundle without marker");
File.WriteAllText(marker, latest + Environment.NewLine);
using (FileStream locked = new(stable, FileMode.Open, FileAccess.Read, FileShare.Read))
{
    Expect(latest, "locked old bundle must not take precedence over a newer immutable build");
}
File.WriteAllText(marker, Path.Combine("out", Path.GetFileName(latest)));
Expect(latest, "contained relative marker");
File.Delete(stable);
Expect(latest, "marker-only development output");
File.WriteAllText(stable, "old");
string outside = Path.Combine(root, "fe-monster-java-outside.jar");
File.WriteAllText(outside, "outside");
foreach (string invalid in new[] {
    outside, stable, Path.Combine(output, "fe-monster-java-missing.jar"),
    latest + "\\n" + stable, "", "\\0", Path.Combine(output, "fe-monster-java-.jar")
})
{
    File.WriteAllText(marker, invalid);
    Expect(stable, "invalid marker must fall back to installed bundle");
}
File.Delete(stable);
Expect(null, "no usable backend");
Console.WriteLine("Desktop Java artifact selection: PASS (" + assertions + " checks)");
`);

try {
  const result = spawnSync('dotnet', [
    'run', '--disable-build-servers', '--project', project, '--', path.join(scratch, 'fixture')
  ], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000,
    env: { ...process.env, DOTNET_CLI_HOME: path.join(scratch, 'dotnet-home'), DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER: '1' }
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Desktop Java artifact selection: PASS/);
  console.log(result.stdout.trim());
} finally {
  if (path.resolve(scratch).startsWith(path.resolve(scratchParent) + path.sep)) {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
