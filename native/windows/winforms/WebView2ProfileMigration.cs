using System;
using System.IO;
using System.Linq;
using System.Text;

namespace FeMonster.Client;

internal static class WebView2ProfileMigration
{
    internal const string MigrationMarkerName = ".fe-monster-legacy-profile-migrated";

    internal static int MigrateLegacyProfile(string profileRoot, string destinationFolderName)
    {
        string root = Path.GetFullPath(profileRoot);
        if (!Directory.Exists(root)) return 0;
        if (string.IsNullOrWhiteSpace(destinationFolderName) ||
            destinationFolderName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
            destinationFolderName.Contains(Path.DirectorySeparatorChar) ||
            destinationFolderName.Contains(Path.AltDirectorySeparatorChar))
        {
            throw new ArgumentException("A single safe WebView2 profile folder name is required.", nameof(destinationFolderName));
        }

        bool legacyProfileDetected =
            Directory.Exists(Path.Combine(root, "Default")) ||
            File.Exists(Path.Combine(root, "Local State"));
        if (!legacyProfileDetected) return 0;

        string destination = Path.GetFullPath(Path.Combine(root, destinationFolderName));
        string destinationPrefix = destination.TrimEnd(
            Path.DirectorySeparatorChar,
            Path.AltDirectorySeparatorChar
        ) + Path.DirectorySeparatorChar;
        string marker = Path.Combine(destination, MigrationMarkerName);
        if (File.Exists(marker)) return 0;

        string[] legacyEntries = Directory.EnumerateFileSystemEntries(root).ToArray();
        Directory.CreateDirectory(destination);
        int copiedFiles = 0;
        foreach (string entry in legacyEntries)
        {
            string name = Path.GetFileName(entry);
            if (string.Equals(name, destinationFolderName, StringComparison.OrdinalIgnoreCase) ||
                name.StartsWith(destinationFolderName + "-", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            if ((File.GetAttributes(entry) & FileAttributes.ReparsePoint) != 0) continue;

            if (File.Exists(entry))
            {
                copiedFiles += CopyFileIfMissing(entry, root, destination, destinationPrefix);
                continue;
            }

            EnumerationOptions options = new()
            {
                RecurseSubdirectories = true,
                IgnoreInaccessible = false,
                ReturnSpecialDirectories = false,
                AttributesToSkip = FileAttributes.ReparsePoint
            };
            foreach (string sourceFile in Directory.EnumerateFiles(entry, "*", options))
            {
                copiedFiles += CopyFileIfMissing(sourceFile, root, destination, destinationPrefix);
            }
        }

        string markerTemporary = marker + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            File.WriteAllText(markerTemporary, "schemaVersion=1\n", new UTF8Encoding(false));
            if (!File.Exists(marker)) File.Move(markerTemporary, marker);
        }
        finally
        {
            try { File.Delete(markerTemporary); } catch { }
        }
        return copiedFiles;
    }

    private static int CopyFileIfMissing(
        string sourceFile,
        string sourceRoot,
        string destinationRoot,
        string destinationPrefix
    )
    {
        string relative = Path.GetRelativePath(sourceRoot, sourceFile);
        if (relative.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(relative)) return 0;
        string destinationFile = Path.GetFullPath(Path.Combine(destinationRoot, relative));
        if (!destinationFile.StartsWith(destinationPrefix, StringComparison.OrdinalIgnoreCase)) return 0;
        if (File.Exists(destinationFile)) return 0;

        string? parent = Path.GetDirectoryName(destinationFile);
        if (string.IsNullOrWhiteSpace(parent)) return 0;
        Directory.CreateDirectory(parent);
        string temporary = destinationFile + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            File.Copy(sourceFile, temporary, overwrite: false);
            try
            {
                File.Move(temporary, destinationFile);
                return 1;
            }
            catch (IOException) when (File.Exists(destinationFile))
            {
                return 0;
            }
        }
        finally
        {
            try { File.Delete(temporary); } catch { }
        }
    }
}
