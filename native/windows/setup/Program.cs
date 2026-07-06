using System.Diagnostics;
using System.Drawing;
using System.IO.Compression;
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
            Text = "Install path",
            ForeColor = Color.FromArgb(218, 236, 244),
            Location = new Point(22, 18)
        };
        content.Controls.Add(pathLabel);

        installPathBox = new TextBox
        {
            Location = new Point(22, 44),
            Size = new Size(486, 28),
            Text = options.InstallDir,
            BackColor = Color.FromArgb(28, 36, 42),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        content.Controls.Add(installPathBox);

        browseButton = new Button
        {
            Location = new Point(518, 43),
            Size = new Size(78, 30),
            Text = "Browse",
            BackColor = Color.FromArgb(42, 54, 62),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        browseButton.FlatAppearance.BorderColor = Color.FromArgb(74, 96, 108);
        browseButton.Click += (_, _) => BrowseInstallPath();
        content.Controls.Add(browseButton);

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

        logBox = new TextBox
        {
            Location = new Point(22, 150),
            Size = new Size(574, 176),
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
        using FolderBrowserDialog dialog = new()
        {
            Description = "Choose where FE Monster will be installed",
            SelectedPath = installPathBox.Text
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            installPathBox.Text = dialog.SelectedPath;
        }
    }

    private async Task StartInstallAsync()
    {
        string installDir = installPathBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(installDir))
        {
            MessageBox.Show("Choose an install path first.", "FE Monster Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        installButton.Enabled = false;
        installPathBox.Enabled = false;
        browseButton.Enabled = false;
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

            string arguments = "-NoProfile -ExecutionPolicy Bypass -File " +
                SetupEngine.QuoteArg(installScript) +
                " -InstallDir " + SetupEngine.QuoteArg(installDir) +
                " -NoPopup" +
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
    private SetupOptions(bool quiet, string installDir, IReadOnlyList<string> forwardedArgs)
    {
        Quiet = quiet;
        InstallDir = installDir;
        ForwardedArgs = forwardedArgs;
    }

    public bool Quiet { get; }
    public string InstallDir { get; }
    public IReadOnlyList<string> ForwardedArgs { get; }

    public string ForwardedArgumentLine => ForwardedArgs.Count == 0
        ? ""
        : " " + string.Join(" ", ForwardedArgs.Select(SetupEngine.QuoteArg));

    public static SetupOptions Parse(string[] args)
    {
        bool quiet = false;
        string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FE Monster");
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

            forwarded.Add(arg);
        }

        return new SetupOptions(quiet, installDir, forwarded);
    }

    private static bool IsInstallDirArg(string value)
    {
        return string.Equals(value, "-InstallDir", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "/InstallDir", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "--install-dir", StringComparison.OrdinalIgnoreCase);
    }
}

internal static class SetupEngine
{
    private static readonly byte[] Marker = Encoding.ASCII.GetBytes("FE_MONSTER_SETUP_PAYLOAD_V1");

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

            string arguments = "-NoProfile -ExecutionPolicy Bypass -File " +
                QuoteArg(installScript) +
                " -InstallDir " + QuoteArg(options.InstallDir) +
                " -NoPopup" +
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
        catch
        {
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

    public static string ExtractBundle(string exePath)
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "fe-monster-setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);
        string bundleZip = Path.Combine(tempRoot, "setup-bundle.zip");
        ExtractPayload(exePath, bundleZip);
        ZipFile.ExtractToDirectory(bundleZip, tempRoot, true);
        return tempRoot;
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
