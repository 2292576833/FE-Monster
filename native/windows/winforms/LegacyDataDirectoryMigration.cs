using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace FeMonster.Client;

internal readonly record struct LegacyDataMigrationResult(
    int CopiedFiles,
    int ReplacedFiles,
    int BackedUpFiles,
    bool Completed
);

internal static class LegacyDataDirectoryMigration
{
    internal const string MigrationMarkerName = ".fe-monster-legacy-data-migrated";
    internal const string BackupDirectoryPrefix = ".fe-monster-legacy-data-backup-";

    internal static LegacyDataMigrationResult Migrate(string sourceDirectory, string destinationDirectory)
    {
        string source = Path.GetFullPath(sourceDirectory);
        string destination = Path.GetFullPath(destinationDirectory);
        if (!Directory.Exists(source) || string.Equals(source, destination, StringComparison.OrdinalIgnoreCase))
        {
            return default;
        }

        string marker = Path.Combine(destination, MigrationMarkerName);
        if (File.Exists(marker)) return default;

        EnumerationOptions options = new()
        {
            RecurseSubdirectories = true,
            IgnoreInaccessible = false,
            ReturnSpecialDirectories = false,
            AttributesToSkip = FileAttributes.ReparsePoint
        };
        string[] sourceFiles = Directory.EnumerateFiles(source, "*", options)
            .Where(path => !IsMigrationMetadata(source, path))
            .ToArray();
        if (sourceFiles.Length == 0) return default;

        Directory.CreateDirectory(destination);
        string destinationPrefix = destination.TrimEnd(
            Path.DirectorySeparatorChar,
            Path.AltDirectorySeparatorChar
        ) + Path.DirectorySeparatorChar;
        string sourceId = Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes(source.ToUpperInvariant())
        )).Substring(0, 16);
        string backupRoot = Path.Combine(destination, BackupDirectoryPrefix + sourceId);
        int copiedFiles = 0;
        int replacedFiles = 0;
        int backedUpFiles = 0;

        foreach (string sourceFile in sourceFiles)
        {
            string relative = Path.GetRelativePath(source, sourceFile);
            if (relative.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(relative)) continue;
            string destinationFile = Path.GetFullPath(Path.Combine(destination, relative));
            if (!destinationFile.StartsWith(destinationPrefix, StringComparison.OrdinalIgnoreCase)) continue;

            if (!File.Exists(destinationFile))
            {
                CopyAtomically(sourceFile, destinationFile, overwrite: false);
                copiedFiles++;
                continue;
            }
            if (FilesEqual(sourceFile, destinationFile)) continue;

            string backupFile = Path.GetFullPath(Path.Combine(backupRoot, relative));
            string backupPrefix = backupRoot.TrimEnd(
                Path.DirectorySeparatorChar,
                Path.AltDirectorySeparatorChar
            ) + Path.DirectorySeparatorChar;
            if (!backupFile.StartsWith(backupPrefix, StringComparison.OrdinalIgnoreCase)) continue;
            if (!File.Exists(backupFile))
            {
                CopyAtomically(destinationFile, backupFile, overwrite: false);
                backedUpFiles++;
            }
            CopyAtomically(sourceFile, destinationFile, overwrite: true);
            replacedFiles++;
        }

        WriteMarkerAtomically(marker, sourceId);
        return new LegacyDataMigrationResult(copiedFiles, replacedFiles, backedUpFiles, true);
    }

    private static bool IsMigrationMetadata(string sourceRoot, string path)
    {
        string relative = Path.GetRelativePath(sourceRoot, path);
        string firstSegment = relative.Split(
            new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar },
            2,
            StringSplitOptions.RemoveEmptyEntries
        ).FirstOrDefault() ?? "";
        return string.Equals(firstSegment, MigrationMarkerName, StringComparison.OrdinalIgnoreCase) ||
            firstSegment.StartsWith(BackupDirectoryPrefix, StringComparison.OrdinalIgnoreCase);
    }

    private static bool FilesEqual(string left, string right)
    {
        FileInfo leftInfo = new(left);
        FileInfo rightInfo = new(right);
        if (leftInfo.Length != rightInfo.Length) return false;
        using FileStream leftStream = File.Open(left, FileMode.Open, FileAccess.Read, FileShare.Read);
        using FileStream rightStream = File.Open(right, FileMode.Open, FileAccess.Read, FileShare.Read);
        byte[] leftHash = SHA256.HashData(leftStream);
        byte[] rightHash = SHA256.HashData(rightStream);
        return CryptographicOperations.FixedTimeEquals(leftHash, rightHash);
    }

    private static void CopyAtomically(string source, string destination, bool overwrite)
    {
        string? parent = Path.GetDirectoryName(destination);
        if (string.IsNullOrWhiteSpace(parent)) throw new IOException("Migration destination has no parent directory.");
        Directory.CreateDirectory(parent);
        string temporary = destination + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            File.Copy(source, temporary, overwrite: false);
            File.Move(temporary, destination, overwrite);
        }
        finally
        {
            try { File.Delete(temporary); } catch { }
        }
    }

    private static void WriteMarkerAtomically(string marker, string sourceId)
    {
        string temporary = marker + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            File.WriteAllText(
                temporary,
                $"schemaVersion=1\nsourceId={sourceId}\n",
                new UTF8Encoding(false)
            );
            File.Move(temporary, marker, overwrite: true);
        }
        finally
        {
            try { File.Delete(temporary); } catch { }
        }
    }
}
