using System.Diagnostics;
using System.Drawing;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

namespace FeMonster.Setup;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        SetupOptions options = SetupOptions.Parse(args);
        string? exePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
        {
            if (!options.Quiet) Fail("Setup executable path was not found.");
            return 1;
        }

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
            DialogResult result = MessageBox.Show(
                "Installation is still running. Close anyway?",
                "FE Monster Setup",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning
            );
            if (result != DialogResult.Yes)
            {
                e.Cancel = true;
                return;
            }

            try { installProcess.Kill(entireProcessTree: true); } catch { }
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
        installPathBox.Enabled = false;
        browseButton.Enabled = false;
        openFolderButton.Enabled = false;
        launchAfterInstallBox.Enabled = false;
        progressBar.Style = ProgressBarStyle.Marquee;
        statusLabel.Text = "Preparing installer payload...";
        logBox.Clear();

        try
        {
            tempRoot = await Task.Run(() => SetupEngine.ExtractBundle(exePath));
            string installScript = Path.Combine(tempRoot, "install-fe-monster.ps1");
            if (!File.Exists(installScript))
            {
                throw new InvalidOperationException("Installer script was not found in setup payload.");
            }

            logPath = Path.Combine(installDir, "out", "install.log");
            lastLogLength = 0;
            statusLabel.Text = "Installing FE Monster...";
            logTimer.Start();

            string arguments = "-NoProfile -File " +
                SetupEngine.QuoteArg(installScript) +
                " -InstallDir " + SetupEngine.QuoteArg(installDir) +
                " -NoPopup" +
                (launchAfterInstallBox.Checked ? "" : " -NoLaunch") +
                options.ForwardedArgumentLine;

            installProcess = Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = arguments,
                WorkingDirectory = tempRoot,
                UseShellExecute = false,
                CreateNoWindow = true
            }) ?? throw new InvalidOperationException("Could not start PowerShell installer.");

            await Task.Run(() => installProcess.WaitForExit());
            RefreshLog(force: true);
            progressBar.Style = ProgressBarStyle.Blocks;

            if (installProcess.ExitCode == 0)
            {
                ExitCode = 0;
                statusLabel.Text = "FE Monster setup completed.";
                installButton.Text = "已完成";
                closeButton.Text = "完成";
            }
            else
            {
                ExitCode = installProcess.ExitCode;
                statusLabel.Text = "FE Monster setup failed. Check the log below.";
                installButton.Text = "重新安装";
                installButton.Enabled = true;
                installPathBox.Enabled = true;
                browseButton.Enabled = true;
                openFolderButton.Enabled = true;
                launchAfterInstallBox.Enabled = true;
            }
        }
        catch (Exception error)
        {
            ExitCode = 1;
            progressBar.Style = ProgressBarStyle.Blocks;
            statusLabel.Text = "FE Monster setup failed.";
            AppendLog(error.Message);
            installButton.Text = "重新安装";
            installButton.Enabled = true;
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
        string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FE Monster");
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

internal static class SetupEngine
{
    private static readonly byte[] Marker = Encoding.ASCII.GetBytes("FE_MONSTER_SETUP_PAYLOAD_V1");
    private const string BundleFileName = "FE-Monster-Setup-Bundle.zip";

    public static int RunHeadless(string exePath, SetupOptions options)
    {
        string? tempRoot = null;
        try
        {
            tempRoot = ExtractBundle(exePath);
            string installScript = Path.Combine(tempRoot, "install-fe-monster.ps1");
            if (!File.Exists(installScript))
            {
                throw new InvalidOperationException("Installer script was not found in setup payload.");
            }

            string arguments = "-NoProfile -File " +
                QuoteArg(installScript) +
                " -InstallDir " + QuoteArg(options.InstallDir) +
                " -NoPopup" +
                (options.LaunchAfterInstall ? "" : " -NoLaunch") +
                options.ForwardedArgumentLine;

            using Process process = Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = arguments,
                WorkingDirectory = tempRoot,
                UseShellExecute = false,
                CreateNoWindow = true
            }) ?? throw new InvalidOperationException("Could not start PowerShell installer.");
            process.WaitForExit();
            return process.ExitCode;
        }
        catch (Exception error)
        {
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
        try
        {
            string root = string.IsNullOrWhiteSpace(installDir)
                ? Path.Combine(Path.GetTempPath(), "FE Monster")
                : Path.GetFullPath(Environment.ExpandEnvironmentVariables(installDir));
            string outDir = Path.Combine(root, "out");
            Directory.CreateDirectory(outDir);
            File.AppendAllText(
                Path.Combine(outDir, "setup-headless.log"),
                $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {error}\r\n",
                Encoding.UTF8
            );
        }
        catch
        {
        }
    }

    public static string ExtractBundle(string exePath)
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "fe-monster-setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);
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

        ZipFile.ExtractToDirectory(bundleZip, tempRoot, true);
        return tempRoot;
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
