using System.Diagnostics;
using System.Drawing;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FeMonster.Setup;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        SetupOptions options = SetupOptions.Parse(args);
        try
        {
            SetupEngine.ValidatePlatform();
        }
        catch (Exception error)
        {
            SetupEngine.WriteDiagnosticLog("platform-preflight", error);
            if (!options.Quiet) Fail(error.Message);
            return 2;
        }

        string? exePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
        {
            if (!options.Quiet) Fail("Setup executable path was not found.");
            return 1;
        }
        SetupEngine.WriteEnvironmentDiagnostic(exePath);

        if (options.Quiet)
        {
            return SetupEngine.RunHeadless(exePath, options);
        }

        using SetupForm form = new(exePath, options);
        Application.Run(form);
        return form.ExitCode;
    }

    private static void Fail(string message)
    {
        MessageBox.Show(message, "FE Monster Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}

internal sealed class SetupForm : Form
{
    private readonly string exePath;
    private readonly SetupOptions options;
    private readonly TextBox installPathBox;
    private readonly TextBox logBox;
    private readonly Label statusLabel;
    private readonly Button installButton;
    private readonly Button closeButton;
    private readonly Button browseButton;
    private readonly Button openFolderButton;
    private readonly CheckBox launchAfterInstallBox;
    private readonly ProgressBar progressBar;
    private readonly System.Windows.Forms.Timer logTimer;
    private Process? installProcess;
    private string? tempRoot;
    private string logPath = "";
    private long lastLogLength;

    public SetupForm(string exePath, SetupOptions options)
    {
        this.exePath = exePath;
        this.options = options;
        ExitCode = 1;

        Text = "FE Monster Setup";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        ClientSize = new Size(640, 520);
        BackColor = Color.FromArgb(16, 20, 24);
        ForeColor = Color.FromArgb(246, 252, 255);
        Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
        Icon = SetupEngine.AssociatedIcon(exePath);

        Panel header = new()
        {
            Dock = DockStyle.Top,
            Height = 116,
            Padding = new Padding(22, 20, 22, 12),
            BackColor = Color.FromArgb(22, 28, 33)
        };

        PictureBox logo = new()
        {
            Size = new Size(70, 70),
            Location = new Point(22, 20),
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = Icon?.ToBitmap()
        };
        header.Controls.Add(logo);

        Label title = new()
        {
            AutoSize = true,
            Location = new Point(110, 28),
            Text = "FE Monster",
            Font = new Font("Segoe UI", 22f, FontStyle.Bold),
            ForeColor = Color.White
        };
        header.Controls.Add(title);

        Label subtitle = new()
        {
            AutoSize = true,
            Location = new Point(114, 72),
            Text = "Install the embedded desktop client and local music services.",
            ForeColor = Color.FromArgb(184, 210, 220)
        };
        header.Controls.Add(subtitle);

        Panel content = new()
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(22, 18, 22, 12),
            BackColor = BackColor
        };

        Label pathLabel = new()
        {
            AutoSize = true,
            Text = "\u5b89\u88c5\u8def\u5f84",
            ForeColor = Color.FromArgb(218, 236, 244),
            Location = new Point(22, 18)
        };
        content.Controls.Add(pathLabel);

        installPathBox = new TextBox
        {
            Location = new Point(22, 44),
            Size = new Size(394, 28),
            Text = options.InstallDir,
            BackColor = Color.FromArgb(28, 36, 42),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        content.Controls.Add(installPathBox);

        browseButton = new Button
        {
            Location = new Point(426, 43),
            Size = new Size(82, 30),
            Text = "\u9009\u62e9\u8def\u5f84",
            BackColor = Color.FromArgb(42, 54, 62),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        browseButton.FlatAppearance.BorderColor = Color.FromArgb(74, 96, 108);
        browseButton.Click += (_, _) => BrowseInstallPath();
        content.Controls.Add(browseButton);

        openFolderButton = new Button
        {
            Location = new Point(516, 43),
            Size = new Size(80, 30),
            Text = "\u6253\u5f00\u76ee\u5f55",
            BackColor = Color.FromArgb(42, 54, 62),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        openFolderButton.FlatAppearance.BorderColor = Color.FromArgb(74, 96, 108);
        openFolderButton.Click += (_, _) => OpenInstallFolder();
        content.Controls.Add(openFolderButton);

        statusLabel = new Label
        {
            AutoEllipsis = true,
            Location = new Point(22, 92),
            Size = new Size(574, 22),
            Text = "Ready to install.",
            ForeColor = Color.FromArgb(184, 226, 236)
        };
        content.Controls.Add(statusLabel);

        progressBar = new ProgressBar
        {
            Location = new Point(22, 122),
            Size = new Size(574, 10),
            Style = ProgressBarStyle.Blocks
        };
        content.Controls.Add(progressBar);

        launchAfterInstallBox = new CheckBox
        {
            Location = new Point(22, 140),
            Size = new Size(574, 24),
            Text = "安装完成后启动 FE Monster",
            Checked = options.LaunchAfterInstall,
            BackColor = this.BackColor,
            ForeColor = Color.FromArgb(218, 236, 244),
            FlatStyle = FlatStyle.Flat
        };
        content.Controls.Add(launchAfterInstallBox);

        logBox = new TextBox
        {
            Location = new Point(22, 170),
            Size = new Size(574, 156),
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = Color.FromArgb(8, 10, 12),
            ForeColor = Color.FromArgb(210, 232, 240),
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Consolas", 9f, FontStyle.Regular)
        };
        content.Controls.Add(logBox);

        Panel footer = new()
        {
            Dock = DockStyle.Bottom,
            Height = 66,
            Padding = new Padding(22, 14, 22, 14),
            BackColor = BackColor
        };

        FlowLayoutPanel buttonRow = new()
        {
            Dock = DockStyle.Right,
            Width = 238,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = BackColor
        };

        installButton = new Button
        {
            Text = "点击安装",
            Size = new Size(108, 34),
            Margin = new Padding(6, 0, 0, 0),
            BackColor = Color.FromArgb(92, 197, 220),
            ForeColor = Color.FromArgb(4, 12, 16),
            FlatStyle = FlatStyle.Flat
        };
        installButton.FlatAppearance.BorderSize = 0;
        installButton.Click += async (_, _) => await StartInstallAsync();

        closeButton = new Button
        {
            Text = "关闭",
            Size = new Size(108, 34),
            Margin = new Padding(6, 0, 0, 0),
            BackColor = Color.FromArgb(40, 49, 56),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        closeButton.FlatAppearance.BorderColor = Color.FromArgb(72, 88, 98);
        closeButton.Click += (_, _) => Close();
        buttonRow.Controls.Add(closeButton);
        buttonRow.Controls.Add(installButton);
        footer.Controls.Add(buttonRow);
        content.Controls.Add(footer);

        Controls.Add(content);
        Controls.Add(header);

        logTimer = new System.Windows.Forms.Timer { Interval = 500 };
        logTimer.Tick += (_, _) => RefreshLog();
    }

    public int ExitCode { get; private set; }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (installProcess is { HasExited: false })
        {
            MessageBox.Show(
                "Installation is in a protected upgrade phase and cannot be closed yet. Wait for setup to finish.",
                "FE Monster Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            e.Cancel = true;
            return;
        }

        logTimer.Stop();
        CleanupTempRoot();
        base.OnFormClosing(e);
    }

    private void BrowseInstallPath()
    {
        string selectedPath = installPathBox.Text.Trim();
        string initialPath = ResolveExistingFolderForDialog(selectedPath);
        using FolderBrowserDialog dialog = new()
        {
            Description = "\u9009\u62e9 FE Monster \u7684\u5b89\u88c5\u8def\u5f84",
            SelectedPath = initialPath,
            UseDescriptionForTitle = true,
            ShowNewFolderButton = true
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            installPathBox.Text = dialog.SelectedPath;
        }
    }

    private void OpenInstallFolder()
    {
        string installDir = installPathBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(installDir)) return;

        string folder = Directory.Exists(installDir) ? installDir : ResolveExistingFolderForDialog(installDir);
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = folder,
                UseShellExecute = true
            });
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "FE Monster Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static string ResolveExistingFolderForDialog(string requestedPath)
    {
        if (!string.IsNullOrWhiteSpace(requestedPath))
        {
            try
            {
                string full = Path.GetFullPath(Environment.ExpandEnvironmentVariables(requestedPath));
                if (Directory.Exists(full)) return full;

                string? parent = Path.GetDirectoryName(full);
                while (!string.IsNullOrWhiteSpace(parent))
                {
                    if (Directory.Exists(parent)) return parent;
                    parent = Path.GetDirectoryName(parent);
                }
            }
            catch
            {
            }
        }

        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Directory.Exists(local) ? local : Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    }

    private async Task StartInstallAsync()
    {
        string rawInstallDir = installPathBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(rawInstallDir))
        {
            MessageBox.Show("\u8bf7\u5148\u9009\u62e9\u5b89\u88c5\u8def\u5f84\u3002", "FE Monster Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        string installDir = Path.GetFullPath(Environment.ExpandEnvironmentVariables(rawInstallDir));
        installPathBox.Text = installDir;

        installButton.Enabled = false;
        closeButton.Enabled = false;
        installPathBox.Enabled = false;
        browseButton.Enabled = false;
        openFolderButton.Enabled = false;
        launchAfterInstallBox.Enabled = false;
        progressBar.Style = ProgressBarStyle.Marquee;
        statusLabel.Text = "Preparing installer payload...";
        logBox.Clear();

        try
        {
            SetupEngine.ValidateInstallDirectoryBoundary(installDir);
            tempRoot = await Task.Run(() => SetupEngine.ExtractBundle(exePath, installDir));
            PayloadPreparation payload = await Task.Run(() => SetupEngine.PreparePayload(tempRoot));
            string installScript = Path.Combine(tempRoot, "install-fe-monster.ps1");
            if (!File.Exists(installScript))
            {
                throw new InvalidOperationException("Installer script was not found in setup payload.");
            }
            SetupEngine.ValidateInstallTarget(installDir, payload);

            logPath = SetupEngine.CreateInstallerSessionLogPath(installDir);
            lastLogLength = 0;
            statusLabel.Text = "Installing FE Monster...";
            logTimer.Start();

            ProcessStartInfo startInfo = SetupEngine.CreateInstallerStartInfo(
                installScript,
                installDir,
                payload.Root,
                tempRoot,
                logPath,
                launchAfterInstallBox.Checked,
                options.ForwardedArgs
            );
            installProcess = Process.Start(startInfo) ??
                throw new InvalidOperationException("Could not start PowerShell installer.");

            await Task.Run(() => installProcess.WaitForExit());
            RefreshLog(force: true);
            progressBar.Style = ProgressBarStyle.Blocks;

            if (installProcess.ExitCode == 0)
            {
                ExitCode = 0;
                statusLabel.Text = "FE Monster setup completed.";
                installButton.Text = "已完成";
                closeButton.Text = "完成";
                closeButton.Enabled = true;
            }
            else
            {
                ExitCode = installProcess.ExitCode;
                statusLabel.Text = "FE Monster setup failed. Check the log below.";
                installButton.Text = "重新安装";
                installButton.Enabled = true;
                closeButton.Enabled = true;
                installPathBox.Enabled = true;
                browseButton.Enabled = true;
                openFolderButton.Enabled = true;
                launchAfterInstallBox.Enabled = true;
            }
        }
        catch (Exception error)
        {
            SetupEngine.WriteDiagnosticLog("interactive-install", error);
            ExitCode = 1;
            progressBar.Style = ProgressBarStyle.Blocks;
            statusLabel.Text = "FE Monster setup failed.";
            AppendLog(error.Message);
            installButton.Text = "重新安装";
            installButton.Enabled = true;
            closeButton.Enabled = true;
            installPathBox.Enabled = true;
            browseButton.Enabled = true;
            openFolderButton.Enabled = true;
            launchAfterInstallBox.Enabled = true;
        }
        finally
        {
            logTimer.Stop();
            CleanupTempRoot();
        }
    }

    private void RefreshLog(bool force = false)
    {
        if (string.IsNullOrWhiteSpace(logPath) || !File.Exists(logPath)) return;
        try
        {
            FileInfo info = new(logPath);
            if (!force && info.Length == lastLogLength) return;
            lastLogLength = info.Length;

            using FileStream stream = new(logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using StreamReader reader = new(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            logBox.Text = reader.ReadToEnd();
            logBox.SelectionStart = logBox.TextLength;
            logBox.ScrollToCaret();
        }
        catch
        {
        }
    }

    private void AppendLog(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;
        logBox.AppendText(message + Environment.NewLine);
    }

    private void CleanupTempRoot()
    {
        string? path = tempRoot;
        tempRoot = null;
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path)) return;
        try { Directory.Delete(path, true); } catch { }
    }
}

internal sealed class SetupOptions
{
    private SetupOptions(bool quiet, string installDir, bool launchAfterInstall, IReadOnlyList<string> forwardedArgs)
    {
        Quiet = quiet;
        InstallDir = installDir;
        LaunchAfterInstall = launchAfterInstall;
        ForwardedArgs = forwardedArgs;
    }

    public bool Quiet { get; }
    public string InstallDir { get; }
    public bool LaunchAfterInstall { get; }
    public IReadOnlyList<string> ForwardedArgs { get; }

    public string ForwardedArgumentLine => ForwardedArgs.Count == 0
        ? ""
        : " " + string.Join(" ", ForwardedArgs.Select(SetupEngine.QuoteArg));

    public static SetupOptions Parse(string[] args)
    {
        bool quiet = false;
        string installDir = GetDefaultInstallDir();
        bool launchAfterInstall = true;
        List<string> forwarded = new();

        for (int i = 0; i < args.Length; i += 1)
        {
            string arg = args[i];
            if (string.Equals(arg, "--quiet", StringComparison.OrdinalIgnoreCase))
            {
                quiet = true;
                continue;
            }

            if (IsInstallDirArg(arg) && i + 1 < args.Length)
            {
                installDir = args[i + 1];
                i += 1;
                continue;
            }

            if (IsNoLaunchArg(arg))
            {
                launchAfterInstall = false;
                continue;
            }

            forwarded.Add(arg);
        }

        return new SetupOptions(quiet, installDir, launchAfterInstall, forwarded);
    }

    private static string GetDefaultInstallDir()
    {
        string registered = GetRegisteredInstallDir();
        if (!string.IsNullOrWhiteSpace(registered)) return registered;
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FE Monster"
        );
    }

    private static string GetRegisteredInstallDir()
    {
        try
        {
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall\FE Monster"
            );
            string raw = key?.GetValue("InstallLocation") as string ?? "";
            if (string.IsNullOrWhiteSpace(raw)) return "";
            string candidate = Path.GetFullPath(Environment.ExpandEnvironmentVariables(raw));
            bool recognized =
                File.Exists(Path.Combine(candidate, "out", "fe-monster-java.jar")) &&
                File.Exists(Path.Combine(candidate, "web", "index.html")) &&
                File.Exists(Path.Combine(
                    candidate,
                    "native",
                    "windows",
                    "build",
                    "winforms",
                    "FE Monster.exe"
                ));
            return recognized ? candidate : "";
        }
        catch
        {
            return "";
        }
    }

    private static bool IsInstallDirArg(string value)
    {
        return string.Equals(value, "-InstallDir", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "/InstallDir", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "--install-dir", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsNoLaunchArg(string value)
    {
        return string.Equals(value, "-NoLaunch", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "/NoLaunch", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "--no-launch", StringComparison.OrdinalIgnoreCase);
    }
}

internal sealed record PayloadPreparation(
    string Root,
    long RequiredInstallBytes,
    int MaxRelativePathLength
);

internal static class SetupEngine
{
    private static readonly byte[] Marker = Encoding.ASCII.GetBytes("FE_MONSTER_SETUP_PAYLOAD_V1");
    private const string BundleFileName = "FE-Monster-Setup-Bundle.zip";
    private const string SetupManifestFileName = "setup-manifest.json";
    private const string PayloadFileName = "FE-Monster-Payload.zip";
    private const int MinimumWindowsBuild = 17763;
    private const int SafeLegacyPathLimit = 240;

    public static string DiagnosticLogPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FE Monster Setup",
        "logs",
        "installer.log"
    );

    public static void ValidatePlatform()
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, MinimumWindowsBuild))
        {
            throw new PlatformNotSupportedException(
                $"FE Monster requires Windows 10 version 1809 (build {MinimumWindowsBuild}) or newer."
            );
        }
        if (RuntimeInformation.ProcessArchitecture != Architecture.X64)
        {
            throw new PlatformNotSupportedException("This FE Monster installer requires a Windows x64 process.");
        }
    }

    public static void WriteEnvironmentDiagnostic(string exePath)
    {
        string signer = "unsigned";
        try
        {
            using X509Certificate2 certificate = new(X509Certificate.CreateFromSignedFile(exePath));
            signer = certificate.Subject;
        }
        catch
        {
        }
        WriteDiagnosticLine(
            "environment",
            $"os={Environment.OSVersion.Version}; processArch={RuntimeInformation.ProcessArchitecture}; " +
            $"osArch={RuntimeInformation.OSArchitecture}; temp={Path.GetTempPath()}; signer={signer}"
        );
    }

    public static void WriteDiagnosticLog(string stage, Exception error)
    {
        WriteDiagnosticLine(stage, error.ToString());
    }

    private static void WriteDiagnosticLine(string stage, string message)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(DiagnosticLogPath)!);
            File.AppendAllText(
                DiagnosticLogPath,
                $"[{DateTimeOffset.Now:O}] stage={stage} {message}\r\n",
                Encoding.UTF8
            );
        }
        catch
        {
        }
    }

    public static int RunHeadless(string exePath, SetupOptions options)
    {
        string? tempRoot = null;
        try
        {
            ValidateInstallDirectoryBoundary(options.InstallDir);
            tempRoot = ExtractBundle(exePath, options.InstallDir);
            PayloadPreparation payload = PreparePayload(tempRoot);
            string installScript = Path.Combine(tempRoot, "install-fe-monster.ps1");
            if (!File.Exists(installScript))
            {
                throw new InvalidOperationException("Installer script was not found in setup payload.");
            }

            ValidateInstallTarget(options.InstallDir, payload);
            string sessionLogPath = CreateInstallerSessionLogPath(options.InstallDir);
            ProcessStartInfo startInfo = CreateInstallerStartInfo(
                installScript,
                options.InstallDir,
                payload.Root,
                tempRoot,
                sessionLogPath,
                options.LaunchAfterInstall,
                options.ForwardedArgs
            );
            using Process process = Process.Start(startInfo) ??
                throw new InvalidOperationException("Could not start PowerShell installer.");
            process.WaitForExit();
            return process.ExitCode;
        }
        catch (Exception error)
        {
            WriteDiagnosticLog("headless-install", error);
            WriteHeadlessFailureLog(options.InstallDir, error);
            return 1;
        }
        finally
        {
            if (!string.IsNullOrWhiteSpace(tempRoot) && Directory.Exists(tempRoot))
            {
                try { Directory.Delete(tempRoot, true); } catch { }
            }
        }
    }

    private static void WriteHeadlessFailureLog(string installDir, Exception error)
    {
        WriteDiagnosticLine("headless-target", $"installDir={installDir}; error={error}");
    }

    public static string CreateInstallerSessionLogPath(string? preferredInstallDir = null)
    {
        string localDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FE Monster Setup",
            "logs"
        );
        string directory = localDirectory;
        if (!string.IsNullOrWhiteSpace(preferredInstallDir))
        {
            try
            {
                string installDir = Path.GetFullPath(
                    Environment.ExpandEnvironmentVariables(preferredInstallDir)
                );
                string? installParent = Path.GetDirectoryName(installDir);
                string installRoot = Path.GetPathRoot(installDir) ?? "";
                string localRoot = Path.GetPathRoot(localDirectory) ?? "";
                if (!string.IsNullOrWhiteSpace(installParent) &&
                    !string.Equals(installRoot, localRoot, StringComparison.OrdinalIgnoreCase))
                {
                    directory = Path.Combine(installParent, ".fe-monster-setup-state", "logs");
                }
            }
            catch
            {
                directory = localDirectory;
            }
        }
        return Path.Combine(
            directory,
            $"install-{DateTime.Now:yyyyMMdd-HHmmss}-{Environment.ProcessId}-{Guid.NewGuid():N}.log"
        );
    }

    public static string SelectInstallerSessionLogPathForTest(string preferredInstallDir) =>
        CreateInstallerSessionLogPath(preferredInstallDir);

    public static string ExtractBundle(string exePath, string preferredInstallDir)
    {
        string tempRoot = CreateWritableTempRoot(preferredInstallDir, exePath);
        try
        {
            long bundleLength = GetBundleSourceLength(exePath);
            EnsureFreeSpace(
                tempRoot,
                checked(bundleLength + 256L * 1024L * 1024L),
                "temporary"
            );
            string bundleZip = Path.Combine(tempRoot, BundleFileName);
            if (ExtractEmbeddedResourceBundle(bundleZip))
            {
            }
            else if (HasEmbeddedPayload(exePath))
            {
                ExtractPayload(exePath, bundleZip);
            }
            else
            {
                string? sidecarBundle = FindSidecarBundle(exePath);
                if (!string.IsNullOrWhiteSpace(sidecarBundle))
                {
                    File.Copy(sidecarBundle, bundleZip, true);
                }
                else
                {
                    throw new InvalidOperationException("Setup payload was not found.");
                }
            }

            (long bundleExtractedBytes, long payloadExtractedBytes) = InspectBundleSpaceRequirements(bundleZip);
            EnsureFreeSpace(
                tempRoot,
                checked(bundleExtractedBytes + payloadExtractedBytes + 512L * 1024L * 1024L),
                "temporary"
            );
            ZipFile.ExtractToDirectory(bundleZip, tempRoot, true);
            return tempRoot;
        }
        catch
        {
            try { Directory.Delete(tempRoot, true); } catch { }
            throw;
        }
    }

    private static long GetBundleSourceLength(string exePath)
    {
        using (Stream? resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(BundleFileName))
        {
            if (resource != null) return resource.Length;
        }

        long appendedLength = GetEmbeddedPayloadLength(exePath);
        if (appendedLength > 0) return appendedLength;

        string? sidecar = FindSidecarBundle(exePath);
        if (!string.IsNullOrWhiteSpace(sidecar)) return new FileInfo(sidecar).Length;
        throw new InvalidOperationException("Setup payload was not found.");
    }

    private static (long BundleExtractedBytes, long PayloadExtractedBytes) InspectBundleSpaceRequirements(
        string bundleZip
    )
    {
        using ZipArchive archive = ZipFile.OpenRead(bundleZip);
        long bundleExtractedBytes = 0;
        foreach (ZipArchiveEntry entry in archive.Entries)
        {
            bundleExtractedBytes = checked(bundleExtractedBytes + entry.Length);
        }

        ZipArchiveEntry manifestEntry = archive.Entries.FirstOrDefault(entry =>
            string.Equals(
                entry.FullName.Replace('\\', '/'),
                SetupManifestFileName,
                StringComparison.OrdinalIgnoreCase
            )
        ) ?? throw new InvalidDataException($"Setup payload manifest is missing: {SetupManifestFileName}");
        using Stream manifestInput = manifestEntry.Open();
        using JsonDocument document = JsonDocument.Parse(manifestInput);
        long payloadExtractedBytes = document.RootElement.GetProperty("requiredInstallBytes").GetInt64();
        if (bundleExtractedBytes <= 0 || payloadExtractedBytes <= 0)
        {
            throw new InvalidDataException("Setup payload disk-space metadata is invalid.");
        }
        return (bundleExtractedBytes, payloadExtractedBytes);
    }

    public static PayloadPreparation PreparePayload(string tempRoot)
    {
        string manifestPath = Path.Combine(tempRoot, SetupManifestFileName);
        if (!File.Exists(manifestPath))
        {
            throw new InvalidDataException($"Setup payload manifest is missing: {SetupManifestFileName}");
        }

        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(manifestPath, Encoding.UTF8));
        JsonElement root = document.RootElement;
        int schemaVersion = root.GetProperty("schemaVersion").GetInt32();
        string architecture = root.GetProperty("architecture").GetString() ?? "";
        int minimumBuild = root.GetProperty("minimumWindowsBuild").GetInt32();
        string payloadFile = root.GetProperty("payloadFile").GetString() ?? "";
        long expectedLength = root.GetProperty("payloadLength").GetInt64();
        string expectedSha256 = root.GetProperty("payloadSha256").GetString() ?? "";
        int maxRelativePathLength = root.GetProperty("maxRelativePathLength").GetInt32();
        long requiredInstallBytes = root.GetProperty("requiredInstallBytes").GetInt64();
        if (schemaVersion != 1 || !string.Equals(architecture, "x64", StringComparison.Ordinal) ||
            minimumBuild != MinimumWindowsBuild || !string.Equals(payloadFile, PayloadFileName, StringComparison.Ordinal))
        {
            throw new InvalidDataException("Setup payload manifest is incompatible with this x64 installer.");
        }

        string payloadZip = Path.Combine(tempRoot, payloadFile);
        if (!File.Exists(payloadZip)) throw new InvalidDataException("Setup payload archive is missing.");
        FileInfo payloadInfo = new(payloadZip);
        if (payloadInfo.Length != expectedLength)
        {
            throw new InvalidDataException(
                $"Setup payload length mismatch (expected {expectedLength}, found {payloadInfo.Length})."
            );
        }
        using SHA256 sha256 = SHA256.Create();
        using FileStream payloadInput = File.OpenRead(payloadZip);
        string actualSha256 = Convert.ToHexString(sha256.ComputeHash(payloadInput)).ToLowerInvariant();
        if (!string.Equals(actualSha256, expectedSha256, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException(
                "Setup payload SHA-256 mismatch. The download is incomplete, corrupted, or modified."
            );
        }

        string extractRoot = Path.Combine(tempRoot, "payload");
        Directory.CreateDirectory(extractRoot);
        ZipFile.ExtractToDirectory(payloadZip, extractRoot, true);
        string payloadRoot = Path.Combine(extractRoot, "FE Monster");
        if (!Directory.Exists(payloadRoot))
        {
            throw new InvalidDataException("FE Monster payload root is missing after extraction.");
        }
        return new PayloadPreparation(payloadRoot, requiredInstallBytes, maxRelativePathLength);
    }

    public static void ValidateInstallTarget(string requestedPath, PayloadPreparation payload)
    {
        if (string.IsNullOrWhiteSpace(requestedPath))
        {
            throw new InvalidOperationException("Choose a writable FE Monster installation directory.");
        }
        string installDir = Path.GetFullPath(Environment.ExpandEnvironmentVariables(requestedPath));
        string? parent = Path.GetDirectoryName(installDir);
        if (string.IsNullOrWhiteSpace(parent))
        {
            throw new InvalidOperationException($"Unsafe installation directory: {installDir}");
        }
        ValidateDedicatedInstallDirectory(installDir);
        Directory.CreateDirectory(installDir);
        string probe = Path.Combine(installDir, ".fe-monster-write-" + Guid.NewGuid().ToString("N"));
        try
        {
            File.WriteAllText(probe, "ok", Encoding.ASCII);
        }
        catch (Exception error)
        {
            throw new UnauthorizedAccessException(
                $"The current user cannot write to {installDir}. Choose a folder under Local AppData.",
                error
            );
        }
        finally
        {
            try { File.Delete(probe); } catch { }
        }

        int longestPath = installDir.TrimEnd(Path.DirectorySeparatorChar).Length + 1 + payload.MaxRelativePathLength;
        if (longestPath > SafeLegacyPathLimit)
        {
            throw new PathTooLongException(
                $"The selected path is too deep for bundled native tools ({longestPath} characters; limit {SafeLegacyPathLimit}). " +
                "Choose a shorter installation folder."
            );
        }
        long retainedUserStateBytes = GetPreservedUserStateBytes(installDir);
        EnsureFreeSpace(
            installDir,
            checked(payload.RequiredInstallBytes + retainedUserStateBytes + 256L * 1024L * 1024L),
            "installation"
        );
    }

    public static void ValidateInstallDirectoryBoundary(string requestedPath)
    {
        if (string.IsNullOrWhiteSpace(requestedPath))
        {
            throw new InvalidOperationException("Choose a writable FE Monster installation directory.");
        }
        string installDir = Path.GetFullPath(Environment.ExpandEnvironmentVariables(requestedPath));
        ValidateDedicatedInstallDirectory(installDir);
    }

    private static long GetPreservedUserStateBytes(string installDir)
    {
        if (!Directory.Exists(installDir)) return 0;
        long total = 0;
        EnumerationOptions options = new()
        {
            RecurseSubdirectories = true,
            IgnoreInaccessible = false,
            AttributesToSkip = FileAttributes.ReparsePoint
        };
        foreach (string relative in new[] { "data", "WebView2", "logs" })
        {
            string directory = Path.Combine(installDir, relative);
            if (!Directory.Exists(directory)) continue;
            foreach (string file in Directory.EnumerateFiles(directory, "*", options))
            {
                total = checked(total + new FileInfo(file).Length);
            }
        }
        string publicAccessKey = Path.Combine(installDir, "public-access.key");
        if (File.Exists(publicAccessKey))
        {
            total = checked(total + new FileInfo(publicAccessKey).Length);
        }
        return total;
    }

    private static void ValidateDedicatedInstallDirectory(string installDir)
    {
        string candidate = Path.GetFullPath(installDir).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string? driveRoot = Path.GetPathRoot(candidate)?.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (string.IsNullOrWhiteSpace(candidate) ||
            string.IsNullOrWhiteSpace(driveRoot) ||
            string.Equals(candidate, driveRoot, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Unsafe installation directory: {candidate}");
        }

        List<string> protectedDirectories = new();
        foreach (Environment.SpecialFolder folder in new[] {
            Environment.SpecialFolder.Windows,
            Environment.SpecialFolder.System,
            Environment.SpecialFolder.ProgramFiles,
            Environment.SpecialFolder.ProgramFilesX86,
            Environment.SpecialFolder.CommonApplicationData,
            Environment.SpecialFolder.UserProfile,
            Environment.SpecialFolder.Desktop,
            Environment.SpecialFolder.MyDocuments,
            Environment.SpecialFolder.MyPictures,
            Environment.SpecialFolder.MyMusic,
            Environment.SpecialFolder.MyVideos,
            Environment.SpecialFolder.LocalApplicationData,
            Environment.SpecialFolder.ApplicationData,
            Environment.SpecialFolder.CommonDesktopDirectory,
            Environment.SpecialFolder.CommonDocuments,
            Environment.SpecialFolder.Programs,
            Environment.SpecialFolder.CommonPrograms,
            Environment.SpecialFolder.StartMenu,
            Environment.SpecialFolder.CommonStartMenu
        })
        {
            string path = Environment.GetFolderPath(folder);
            if (!string.IsNullOrWhiteSpace(path)) protectedDirectories.Add(path);
        }
        string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrWhiteSpace(profile))
        {
            protectedDirectories.Add(Path.Combine(profile, "Downloads"));
            string? profileParent = Path.GetDirectoryName(profile);
            if (!string.IsNullOrWhiteSpace(profileParent)) protectedDirectories.Add(profileParent);
        }
        string? oneDrive = Environment.GetEnvironmentVariable("OneDrive");
        if (!string.IsNullOrWhiteSpace(oneDrive)) protectedDirectories.Add(oneDrive);

        foreach (string protectedDirectory in protectedDirectories.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            string normalizedProtected = Path.GetFullPath(protectedDirectory)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string candidatePrefix = candidate + Path.DirectorySeparatorChar;
            if (string.Equals(candidate, normalizedProtected, StringComparison.OrdinalIgnoreCase) ||
                normalizedProtected.StartsWith(candidatePrefix, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Unsafe installation directory: {candidate} is a system or user-data root. " +
                    "Choose a dedicated FE Monster folder."
                );
            }
        }

        if (!Directory.Exists(candidate) || !Directory.EnumerateFileSystemEntries(candidate).Any()) return;
        bool modernInstall =
            File.Exists(Path.Combine(candidate, "payload-integrity.json")) &&
            File.Exists(Path.Combine(candidate, "native", "windows", "build", "winforms", "FE Monster.exe"));
        bool legacyInstall =
            File.Exists(Path.Combine(candidate, "out", "fe-monster-java.jar")) &&
            (File.Exists(Path.Combine(candidate, "FE Monster.vbs")) ||
             File.Exists(Path.Combine(candidate, "run.cmd")));
        string retainedMarker = Path.Combine(candidate, ".fe-monster-user-data");
        bool retainedState = false;
        if (File.Exists(retainedMarker) &&
            string.Equals(File.ReadAllText(retainedMarker).Trim(), "schemaVersion=1", StringComparison.Ordinal))
        {
            HashSet<string> allowedEntries = new(StringComparer.OrdinalIgnoreCase)
            {
                "data",
                "WebView2",
                "logs",
                "public-access.key",
                ".fe-monster-user-data"
            };
            retainedState = Directory.EnumerateFileSystemEntries(candidate)
                .All(path => allowedEntries.Contains(Path.GetFileName(path))) &&
                (!File.Exists(Path.Combine(candidate, "data"))) &&
                (!File.Exists(Path.Combine(candidate, "WebView2"))) &&
                (!File.Exists(Path.Combine(candidate, "logs"))) &&
                (!Directory.Exists(Path.Combine(candidate, "public-access.key")));
        }
        if (!modernInstall && !legacyInstall && !retainedState)
        {
            throw new InvalidOperationException(
                $"Unsafe installation directory: {candidate} already contains unrelated files. " +
                "Choose an empty folder or an existing FE Monster installation."
            );
        }
    }

    public static ProcessStartInfo CreateInstallerStartInfo(
        string installScript,
        string installDir,
        string payloadRoot,
        string workingDirectory,
        string logPath,
        bool launchAfterInstall,
        IReadOnlyList<string> forwardedArgs
    )
    {
        ProcessStartInfo startInfo = new()
        {
            FileName = "powershell.exe",
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        foreach (string argument in new[] {
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            installScript,
            "-InstallDir",
            installDir,
            "-PayloadRoot",
            payloadRoot,
            "-LogPath",
            logPath,
            "-NoPopup"
        })
        {
            startInfo.ArgumentList.Add(argument);
        }
        startInfo.ArgumentList.Add("-ConsumePayloadRoot");
        if (!launchAfterInstall) startInfo.ArgumentList.Add("-NoLaunch");
        foreach (string argument in forwardedArgs) startInfo.ArgumentList.Add(argument);
        return startInfo;
    }

    private static string CreateWritableTempRoot(string preferredInstallDir, string exePath)
    {
        string localFallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FE Monster Setup", "Temp");
        List<string> candidateBases = new();
        try
        {
            string fullInstallDir = Path.GetFullPath(Environment.ExpandEnvironmentVariables(preferredInstallDir));
            string? existingParent = Path.GetDirectoryName(fullInstallDir);
            while (!string.IsNullOrWhiteSpace(existingParent) && !Directory.Exists(existingParent))
            {
                existingParent = Path.GetDirectoryName(existingParent);
            }
            if (!string.IsNullOrWhiteSpace(existingParent)) candidateBases.Add(existingParent);
        }
        catch
        {
        }
        string? setupDirectory = Path.GetDirectoryName(exePath);
        if (!string.IsNullOrWhiteSpace(setupDirectory) && Directory.Exists(setupDirectory))
        {
            candidateBases.Add(setupDirectory);
        }
        candidateBases.Add(Path.GetTempPath());
        candidateBases.Add(localFallback);

        foreach (string candidateBase in candidateBases.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(candidateBase)) continue;
            try
            {
                Directory.CreateDirectory(candidateBase);
                string candidate = Path.Combine(candidateBase, ".fms-" + Guid.NewGuid().ToString("N").Substring(0, 12));
                Directory.CreateDirectory(candidate);
                string probe = Path.Combine(candidate, "write.test");
                File.WriteAllText(probe, "ok", Encoding.ASCII);
                File.Delete(probe);
                return candidate;
            }
            catch
            {
            }
        }
        throw new IOException("No writable temporary directory is available for FE Monster setup.");
    }

    private static void EnsureFreeSpace(string path, long requiredBytes, string label)
    {
        string? root = Path.GetPathRoot(Path.GetFullPath(path));
        if (string.IsNullOrWhiteSpace(root)) return;
        DriveInfo drive = new(root);
        if (drive.IsReady && drive.AvailableFreeSpace < requiredBytes)
        {
            throw new IOException(
                $"Not enough {label} disk space on {root}. " +
                $"Required: {requiredBytes / 1024 / 1024} MiB; available: {drive.AvailableFreeSpace / 1024 / 1024} MiB."
            );
        }
    }

    private static bool ExtractEmbeddedResourceBundle(string outputZip)
    {
        Stream? input = Assembly.GetExecutingAssembly().GetManifestResourceStream(BundleFileName);
        if (input == null) return false;

        using (input)
        using (FileStream output = File.Create(outputZip))
        {
            input.CopyTo(output);
        }
        return true;
    }

    private static string? FindSidecarBundle(string exePath)
    {
        string? exeDir = Path.GetDirectoryName(exePath);
        if (string.IsNullOrWhiteSpace(exeDir)) return null;

        string sidecarBundle = Path.Combine(exeDir, BundleFileName);
        return File.Exists(sidecarBundle) ? sidecarBundle : null;
    }

    private static bool HasEmbeddedPayload(string exePath)
    {
        try
        {
            using FileStream input = File.OpenRead(exePath);
            if (input.Length < Marker.Length + sizeof(long)) return false;
            input.Seek(-Marker.Length, SeekOrigin.End);
            byte[] marker = new byte[Marker.Length];
            ReadExactly(input, marker);
            return marker.SequenceEqual(Marker);
        }
        catch
        {
            return false;
        }
    }

    private static long GetEmbeddedPayloadLength(string exePath)
    {
        try
        {
            using FileStream input = File.OpenRead(exePath);
            if (input.Length < Marker.Length + sizeof(long)) return 0;
            input.Seek(-Marker.Length, SeekOrigin.End);
            byte[] marker = new byte[Marker.Length];
            ReadExactly(input, marker);
            if (!marker.SequenceEqual(Marker)) return 0;
            input.Seek(-(Marker.Length + sizeof(long)), SeekOrigin.End);
            byte[] lengthBytes = new byte[sizeof(long)];
            ReadExactly(input, lengthBytes);
            long payloadLength = BitConverter.ToInt64(lengthBytes, 0);
            long payloadOffset = input.Length - Marker.Length - sizeof(long) - payloadLength;
            return payloadLength > 0 && payloadOffset >= 0 ? payloadLength : 0;
        }
        catch
        {
            return 0;
        }
    }

    public static Icon? AssociatedIcon(string exePath)
    {
        try
        {
            return Icon.ExtractAssociatedIcon(exePath);
        }
        catch
        {
            return null;
        }
    }

    public static string QuoteArg(string value)
    {
        if (string.IsNullOrEmpty(value)) return "\"\"";
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static void ExtractPayload(string exePath, string outputZip)
    {
        using FileStream input = File.OpenRead(exePath);
        if (input.Length < Marker.Length + sizeof(long))
        {
            throw new InvalidOperationException("Setup payload is missing.");
        }

        input.Seek(-Marker.Length, SeekOrigin.End);
        byte[] marker = new byte[Marker.Length];
        ReadExactly(input, marker);
        if (!marker.SequenceEqual(Marker))
        {
            throw new InvalidOperationException("Setup payload marker was not found.");
        }

        input.Seek(-(Marker.Length + sizeof(long)), SeekOrigin.End);
        byte[] lengthBytes = new byte[sizeof(long)];
        ReadExactly(input, lengthBytes);
        long payloadLength = BitConverter.ToInt64(lengthBytes, 0);
        long payloadOffset = input.Length - Marker.Length - sizeof(long) - payloadLength;
        if (payloadLength <= 0 || payloadOffset < 0)
        {
            throw new InvalidOperationException("Setup payload length is invalid.");
        }

        input.Seek(payloadOffset, SeekOrigin.Begin);
        using FileStream output = File.Create(outputZip);
        CopyExactly(input, output, payloadLength);
    }

    private static void CopyExactly(Stream input, Stream output, long bytes)
    {
        byte[] buffer = new byte[1024 * 1024];
        long remaining = bytes;
        while (remaining > 0)
        {
            int read = input.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
            if (read <= 0) throw new EndOfStreamException();
            output.Write(buffer, 0, read);
            remaining -= read;
        }
    }

    private static void ReadExactly(Stream input, byte[] buffer)
    {
        int offset = 0;
        while (offset < buffer.Length)
        {
            int read = input.Read(buffer, offset, buffer.Length - offset);
            if (read <= 0) throw new EndOfStreamException();
            offset += read;
        }
    }
}
