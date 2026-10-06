using System.IO;

namespace FeMonster.Client;

internal static class JavaBuildArtifact
{
    internal static string? Resolve(string root)
    {
        string rootPath = Path.GetFullPath(root);
        string outPath = Path.Combine(rootPath, "out");
        string stableJar = Path.Combine(outPath, "fe-monster-java.jar");
        try
        {
            string marker = Path.Combine(outPath, "run-jar.txt");
            if (Directory.Exists(outPath) &&
                (File.GetAttributes(outPath) & FileAttributes.ReparsePoint) == 0 &&
                File.Exists(marker))
            {
                string value = File.ReadAllText(marker).Trim();
                if (value.Length > 0 && value.IndexOfAny(new[] { '\r', '\n' }) < 0)
                {
                    string candidate = Path.GetFullPath(Path.IsPathRooted(value)
                        ? value : Path.Combine(rootPath, value));
                    string name = Path.GetFileName(candidate);
                    // Match the build publisher: only direct immutable artifacts
                    // from this application's out directory may override the bundle.
                    if (string.Equals(Path.GetDirectoryName(candidate), outPath, StringComparison.OrdinalIgnoreCase) &&
                        name.StartsWith("fe-monster-java-", StringComparison.OrdinalIgnoreCase) &&
                        name.EndsWith(".jar", StringComparison.OrdinalIgnoreCase) &&
                        name.Length > "fe-monster-java-.jar".Length &&
                        File.Exists(candidate) &&
                        (File.GetAttributes(candidate) & FileAttributes.ReparsePoint) == 0)
                    {
                        return candidate;
                    }
                }
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            // Installed bundles have no build marker; an unusable development
            // marker must not prevent the stable bundled backend from starting.
        }
        return File.Exists(stableJar) ? stableJar : null;
    }
}
