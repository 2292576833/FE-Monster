using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
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
    private static readonly Color Accent = Color.FromArgb(15, 108, 189);
    private static readonly Color TextPrimary = Color.FromArgb(31, 31, 31);
    private static readonly Color TextSecondary = Color.FromArgb(96, 94, 92);
    private static readonly Color Border = Color.FromArgb(225, 223, 221);
    private static readonly Color SubtleSurface = Color.FromArgb(250, 250, 250);

    private readonly string exePath;
    private readonly SetupOptions options;
    private readonly TextBox installPathBox;
    private readonly TextBox logBox;
    private readonly Label statusLabel;
    private readonly Label statusDescriptionLabel;
    private readonly Label packageModeLabel;
    private readonly Label packageModeDescriptionLabel;
    private readonly Panel statusAccent;
    private readonly Button installButton;
    private readonly Button closeButton;
    private readonly Button browseButton;
    private readonly Button openFolderButton;
    private readonly Button detailsButton;
    private readonly CheckBox launchAfterInstallBox;
    private readonly FluentProgressIndicator progressBar;
    private readonly Control detailsHost;
    private readonly System.Windows.Forms.Timer logTimer;
    private Process? installProcess;
    private string? tempRoot;
    private string logPath = "";
    private long lastLogLength;
    private bool detailsExpanded;

    private static string DisplayProductVersion(string productVersion)
    {
        if (!Version.TryParse(productVersion, out Version? version)) return productVersion;
        int patch = Math.Max(0, version.Build);
        return $"{version.Major}.{version.Minor}.{patch}";
    }

    public SetupForm(string exePath, SetupOptions options)
    {
        this.exePath = exePath;
        this.options = options;
        ExitCode = 1;

        Text = "FE Monster Setup";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = false;
        MinimizeBox = true;
        ClientSize = new Size(760, 650);
        MinimumSize = new Size(680, 590);
        BackColor = Color.White;
        ForeColor = TextPrimary;
        Font = new Font("Segoe UI", 9.25f, FontStyle.Regular, GraphicsUnit.Point);
        AutoScaleMode = AutoScaleMode.Dpi;
        AutoScaleDimensions = new SizeF(96f, 96f);
        KeyPreview = true;
        AccessibleName = "FE Monster 安装程序";
        AccessibleDescription = "安装 FE Monster 桌面客户端。";
        Icon = SetupEngine.AssociatedIcon(exePath);

        TableLayoutPanel page = new()
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            ColumnCount = 1,
            RowCount = 4,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        page.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        page.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        page.RowStyles.Add(new RowStyle(SizeType.Absolute, 1f));
        page.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        page.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        TableLayoutPanel header = new()
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(32, 22, 32, 18),
            BackColor = Color.White,
            Margin = Padding.Empty
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 64f));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        PictureBox logo = new()
        {
            Size = new Size(52, 52),
            Margin = new Padding(0, 2, 12, 0),
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = Icon?.ToBitmap(),
            AccessibleName = "FE Monster 图标",
            TabStop = false
        };
        header.Controls.Add(logo, 0, 0);

        TableLayoutPanel heading = new()
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 1,
            RowCount = 2,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };

        Label title = new()
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            Text = "安装 FE Monster",
            Font = new Font("Segoe UI Semibold", 20f, FontStyle.Regular, GraphicsUnit.Point),
            ForeColor = TextPrimary,
            Margin = Padding.Empty
        };
        heading.Controls.Add(title, 0, 0);

        Label subtitle = new()
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            Text = $"桌面客户端、桌宠与本地音乐服务 · 版本 {DisplayProductVersion(Application.ProductVersion)}",
            ForeColor = TextSecondary,
            Margin = new Padding(2, 4, 0, 0)
        };
        heading.Controls.Add(subtitle, 0, 1);
        header.Controls.Add(heading, 1, 0);
        page.Controls.Add(header, 0, 0);

        Panel headerDivider = new()
        {
            Dock = DockStyle.Fill,
            BackColor = Border,
            Margin = Padding.Empty,
            TabStop = false
        };
        page.Controls.Add(headerDivider, 0, 1);

        Panel contentViewport = new()
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            Padding = new Padding(32, 22, 32, 18),
            BackColor = Color.White,
            Margin = Padding.Empty
        };
        TableLayoutPanel content = new()
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 1,
            RowCount = 9,
            BackColor = Color.White,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        Label pathLabel = new()
        {
            AutoSize = true,
            Text = "\u5b89\u88c5\u8def\u5f84",
            Font = new Font("Segoe UI Semibold", 10f, FontStyle.Regular, GraphicsUnit.Point),
            ForeColor = TextPrimary,
            Margin = new Padding(0, 0, 0, 4)
        };
        content.Controls.Add(pathLabel, 0, 0);

        Label pathHelp = new()
        {
            AutoSize = true,
            Text = "应用与运行环境将安装到此文件夹。个人设置会在升级时保留。",
            ForeColor = TextSecondary,
            Margin = new Padding(0, 0, 0, 10)
        };
        content.Controls.Add(pathHelp, 0, 1);

        TableLayoutPanel pathRow = new()
        {
            Dock = DockStyle.Top,
            AutoSize = false,
            Height = 34,
            ColumnCount = 3,
            RowCount = 1,
            Margin = new Padding(0, 0, 0, 16),
            Padding = Padding.Empty
        };
        pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 104f));
        pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 104f));

        installPathBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 1, 0, 1),
            Text = options.InstallDir,
            BackColor = SystemInformation.HighContrast ? SystemColors.Window : Color.White,
            ForeColor = SystemInformation.HighContrast ? SystemColors.WindowText : TextPrimary,
            BorderStyle = BorderStyle.FixedSingle,
            AccessibleName = "安装位置",
            AccessibleDescription = "FE Monster 的安装文件夹路径。",
            TabIndex = 0
        };
        pathRow.Controls.Add(installPathBox, 0, 0);

        browseButton = new FluentButton(FluentButtonKind.Secondary)
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(8, 0, 0, 0),
            Text = "\u9009\u62e9\u8def\u5f84",
            AccessibleName = "选择安装位置",
            TabIndex = 1
        };
        browseButton.Click += (_, _) => BrowseInstallPath();
        pathRow.Controls.Add(browseButton, 1, 0);

        openFolderButton = new FluentButton(FluentButtonKind.Secondary)
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(8, 0, 0, 0),
            Text = "\u6253\u5f00\u76ee\u5f55",
            AccessibleName = "打开安装目录",
            TabIndex = 2
        };
        openFolderButton.Click += (_, _) => OpenInstallFolder();
        pathRow.Controls.Add(openFolderButton, 2, 0);
        content.Controls.Add(pathRow, 0, 2);

        FluentCardPanel packageCard = new()
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(16, 12, 16, 12),
            Margin = new Padding(0, 0, 0, 16),
            BackColor = SubtleSurface
        };
        TableLayoutPanel packageLayout = new()
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 1,
            RowCount = 2,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        packageModeLabel = new Label
        {
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 9.25f, FontStyle.Regular, GraphicsUnit.Point),
            ForeColor = Accent,
            Margin = Padding.Empty
        };
        packageModeDescriptionLabel = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(620, 0),
            ForeColor = TextSecondary,
            Margin = new Padding(0, 3, 0, 0)
        };
        packageLayout.Controls.Add(packageModeLabel, 0, 0);
        packageLayout.Controls.Add(packageModeDescriptionLabel, 0, 1);
        packageCard.Controls.Add(packageLayout);
        content.Controls.Add(packageCard, 0, 3);

        UpdateDistributionMode(SetupEngine.InferDistributionMode(exePath));

        FluentCardPanel stateCard = new()
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(20, 16, 20, 16),
            Margin = new Padding(0, 0, 0, 12),
            BackColor = Color.White
        };
        statusAccent = new Panel
        {
            Dock = DockStyle.Left,
            Width = 4,
            BackColor = Accent,
            Margin = Padding.Empty,
            TabStop = false
        };
        TableLayoutPanel stateLayout = new()
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 1,
            RowCount = 3,
            Margin = Padding.Empty,
            Padding = new Padding(10, 0, 0, 0)
        };

        statusLabel = new Label
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI Semibold", 12f, FontStyle.Regular, GraphicsUnit.Point),
            ForeColor = TextPrimary,
            AccessibleName = "安装状态",
            Margin = Padding.Empty
        };
        stateLayout.Controls.Add(statusLabel, 0, 0);

        statusDescriptionLabel = new Label
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            MaximumSize = new Size(620, 0),
            ForeColor = TextSecondary,
            Margin = new Padding(0, 4, 0, 12)
        };
        stateLayout.Controls.Add(statusDescriptionLabel, 0, 1);

        progressBar = new FluentProgressIndicator
        {
            Dock = DockStyle.Top,
            Height = 5,
            AccessibleName = "安装进度",
            AccessibleDescription = "显示安装准备、安装、完成或失败状态。",
            AccessibleRole = AccessibleRole.ProgressBar,
            Margin = Padding.Empty
        };
        stateLayout.Controls.Add(progressBar, 0, 2);
        stateCard.Controls.Add(stateLayout);
        stateCard.Controls.Add(statusAccent);
        content.Controls.Add(stateCard, 0, 4);

        launchAfterInstallBox = new CheckBox
        {
            AutoSize = true,
            Text = "安装完成后启动 FE Monster",
            Checked = options.LaunchAfterInstall,
            BackColor = Color.White,
            ForeColor = TextPrimary,
            AccessibleName = "安装完成后启动 FE Monster",
            Margin = new Padding(0, 0, 0, 12),
            TabIndex = 3
        };
        content.Controls.Add(launchAfterInstallBox, 0, 5);

        detailsButton = new FluentButton(FluentButtonKind.Subtle)
        {
            AutoSize = false,
            Dock = DockStyle.Top,
            Height = 34,
            Text = "显示安装详情",
            TextAlign = ContentAlignment.MiddleLeft,
            AccessibleName = "显示安装详情",
            Margin = new Padding(0, 0, 0, 8),
            TabIndex = 4
        };
        detailsButton.Click += (_, _) => ToggleDetails();
        content.Controls.Add(detailsButton, 0, 6);

        logBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = SystemInformation.HighContrast ? SystemColors.Window : Color.White,
            ForeColor = SystemInformation.HighContrast ? SystemColors.WindowText : TextPrimary,
            BorderStyle = BorderStyle.None,
            Font = new Font("Consolas", 9f, FontStyle.Regular, GraphicsUnit.Point),
            AccessibleName = "安装详细信息",
            AccessibleDescription = "安装过程日志与错误详情。",
            TabIndex = 5
        };
        FluentCardPanel logHost = new()
        {
            Dock = DockStyle.Top,
            Height = 174,
            Padding = new Padding(12),
            Margin = new Padding(0, 0, 0, 4),
            BackColor = Color.White,
            Visible = false
        };
        logHost.Controls.Add(logBox);
        detailsHost = logHost;
        content.Controls.Add(detailsHost, 0, 7);
        contentViewport.Controls.Add(content);
        page.Controls.Add(contentViewport, 0, 2);

        TableLayoutPanel footer = new()
        {
            Dock = DockStyle.Bottom,
            AutoSize = false,
            Height = 68,
            ColumnCount = 1,
            RowCount = 1,
            Padding = new Padding(32, 14, 32, 14),
            BackColor = SubtleSurface,
            Margin = Padding.Empty
        };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        footer.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        footer.Paint += (_, e) =>
        {
            Color dividerColor = SystemInformation.HighContrast
                ? SystemColors.WindowText
                : Border;
            using Pen divider = new(dividerColor, 1f);
            e.Graphics.DrawLine(divider, 0, 0, footer.Width, 0);
        };
        TableLayoutPanel footerLayout = new()
        {
            Dock = DockStyle.Fill,
            AutoSize = false,
            ColumnCount = 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        footerLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        footerLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        Label scopeLabel = new()
        {
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Text = "仅为当前用户安装，无需管理员权限",
            ForeColor = TextSecondary,
            Margin = Padding.Empty
        };
        footerLayout.Controls.Add(scopeLabel, 0, 0);
        FlowLayoutPanel buttonRow = new()
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Anchor = AnchorStyles.Right,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = SubtleSurface,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };

        installButton = new FluentButton(FluentButtonKind.Primary)
        {
            Text = "安装",
            Size = new Size(116, 38),
            Margin = new Padding(8, 0, 0, 0),
            AccessibleName = "安装 FE Monster",
            TabIndex = 6
        };
        installButton.Click += async (_, _) => await StartInstallAsync();

        closeButton = new FluentButton(FluentButtonKind.Secondary)
        {
            Text = "关闭",
            Size = new Size(96, 38),
            Margin = Padding.Empty,
            AccessibleName = "关闭安装程序",
            TabIndex = 7
        };
        closeButton.Click += (_, _) => Close();
        buttonRow.Controls.Add(closeButton);
        buttonRow.Controls.Add(installButton);
        footerLayout.Controls.Add(buttonRow, 1, 0);
        footer.Controls.Add(footerLayout, 0, 0);
        page.Controls.Add(footer, 0, 3);

        Controls.Add(page);
        AcceptButton = installButton;
        CancelButton = closeButton;

        if (SystemInformation.HighContrast)
        {
            ApplyHighContrastPalette(page);
            headerDivider.BackColor = SystemColors.WindowText;
        }

        logTimer = new System.Windows.Forms.Timer { Interval = 500 };
        logTimer.Tick += (_, _) => RefreshLog();
        ApplyVisualState(SetupVisualState.Ready);
#if DEBUG
        if (options.PreviewState is SetupVisualState previewState && previewState != SetupVisualState.Ready)
        {
            SetInstallControlsEnabled(previewState == SetupVisualState.Failed);
            ApplyVisualState(
                previewState,
                previewState == SetupVisualState.Failed
                    ? "安装包校验失败，文件可能下载不完整或已损坏。请重新下载安装包后重试。"
                    : null
            );
            if (previewState == SetupVisualState.Failed)
            {
                AppendLog("示例错误：安装包完整性校验未通过。请重新下载安装包后重试。");
                ExpandDetails();
            }
        }
#endif
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
            ApplyVisualState(SetupVisualState.Failed, "请先选择一个安装位置，然后重试。");
            installPathBox.Focus();
            return;
        }

        SetInstallControlsEnabled(false);
        ApplyVisualState(SetupVisualState.Preparing);
        logBox.Clear();

        try
        {
            string installDir = Path.GetFullPath(Environment.ExpandEnvironmentVariables(rawInstallDir));
            installPathBox.Text = installDir;
            SetupEngine.ValidateInstallDirectoryBoundary(installDir);
            tempRoot = await Task.Run(() => SetupEngine.ExtractBundle(exePath, installDir));
            PayloadPreparation payload = await Task.Run(() => SetupEngine.PreparePayload(tempRoot));
            UpdateDistributionMode(payload.WebView2Mode);
            string installScript = Path.Combine(tempRoot, "install-fe-monster.ps1");
            if (!File.Exists(installScript))
            {
                throw new InvalidOperationException("Installer script was not found in setup payload.");
            }
            SetupEngine.ValidateInstallTarget(installDir, payload);

            logPath = SetupEngine.CreateInstallerSessionLogPath(installDir);
            lastLogLength = 0;
            ApplyVisualState(SetupVisualState.Installing);
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

            if (installProcess.ExitCode == 0)
            {
                ExitCode = 0;
                ApplyVisualState(SetupVisualState.Completed);
            }
            else
            {
                ExitCode = installProcess.ExitCode;
                SetInstallControlsEnabled(true);
                ApplyVisualState(
                    SetupVisualState.Failed,
                    "安装进程没有成功完成。关闭正在运行的 FE Monster 后重试，或查看安装详情。"
                );
                ExpandDetails();
            }
        }
        catch (Exception error)
        {
            SetupEngine.WriteDiagnosticLog("interactive-install", error);
            ExitCode = 1;
            AppendLog(error.Message);
            SetInstallControlsEnabled(true);
            ApplyVisualState(SetupVisualState.Failed, FriendlyFailureText(error));
            ExpandDetails();
        }
        finally
        {
            logTimer.Stop();
            CleanupTempRoot();
        }
    }

    private void ApplyVisualState(SetupVisualState state, string? detail = null)
    {
        switch (state)
        {
            case SetupVisualState.Ready:
                statusLabel.Text = "准备安装";
                statusDescriptionLabel.Text = "安装程序会先校验文件完整性，再安全更新现有版本。";
                statusAccent.BackColor = Accent;
                progressBar.State = SetupProgressState.Ready;
                installButton.Text = "安装";
                installButton.Enabled = true;
                closeButton.Text = "关闭";
                closeButton.Enabled = true;
                AcceptButton = installButton;
                break;
            case SetupVisualState.Preparing:
                statusLabel.Text = "正在准备安装";
                statusDescriptionLabel.Text = "正在校验安装包、磁盘空间和系统兼容性。";
                statusAccent.BackColor = Accent;
                progressBar.State = SetupProgressState.Running;
                installButton.Text = "准备中";
                installButton.Enabled = false;
                closeButton.Enabled = false;
                break;
            case SetupVisualState.Installing:
                statusLabel.Text = "正在安装 FE Monster";
                statusDescriptionLabel.Text = "请保持此窗口打开。升级过程中会保留个人数据。";
                statusAccent.BackColor = Accent;
                progressBar.State = SetupProgressState.Running;
                installButton.Text = "安装中";
                installButton.Enabled = false;
                closeButton.Enabled = false;
                break;
            case SetupVisualState.Completed:
                statusLabel.Text = "安装完成";
                statusDescriptionLabel.Text = "FE Monster 已准备就绪，可以立即开始使用。";
                statusAccent.BackColor = Color.FromArgb(16, 124, 16);
                progressBar.State = SetupProgressState.Completed;
                installButton.Text = "已安装";
                installButton.Enabled = false;
                closeButton.Text = "完成";
                closeButton.Enabled = true;
                AcceptButton = closeButton;
                closeButton.Focus();
                break;
            case SetupVisualState.Failed:
                statusLabel.Text = "安装未完成";
                statusDescriptionLabel.Text = string.IsNullOrWhiteSpace(detail)
                    ? "请查看安装详情并重试。"
                    : detail;
                statusAccent.BackColor = Color.FromArgb(196, 43, 28);
                progressBar.State = SetupProgressState.Failed;
                installButton.Text = "重试安装";
                installButton.Enabled = true;
                closeButton.Text = "关闭";
                closeButton.Enabled = true;
                AcceptButton = installButton;
                break;
        }
        statusLabel.AccessibleDescription = statusDescriptionLabel.Text;
        installButton.Invalidate();
        closeButton.Invalidate();
    }

    private void SetInstallControlsEnabled(bool enabled)
    {
        installPathBox.Enabled = enabled;
        browseButton.Enabled = enabled;
        openFolderButton.Enabled = enabled;
        launchAfterInstallBox.Enabled = enabled;
        closeButton.Enabled = enabled;
    }

    private void UpdateDistributionMode(string mode)
    {
        bool offline = string.Equals(mode, "offline", StringComparison.OrdinalIgnoreCase);
        packageModeLabel.Text = offline ? "离线安装包" : "在线安装包";
        packageModeDescriptionLabel.Text = offline
            ? "基础运行环境已包含在安装包中。社区与桌宠对话功能仍需要网络连接。"
            : "缺少 WebView2 时会从 Microsoft 安全获取。社区与桌宠对话功能需要网络连接。";
        packageModeLabel.AccessibleDescription = packageModeDescriptionLabel.Text;
    }

    private void ToggleDetails()
    {
        detailsExpanded = !detailsExpanded;
        detailsHost.Visible = detailsExpanded;
        detailsButton.Text = detailsExpanded ? "隐藏安装详情" : "显示安装详情";
        detailsButton.AccessibleName = detailsButton.Text;
        if (detailsExpanded) logBox.Focus();
    }

    private void ExpandDetails()
    {
        if (detailsExpanded) return;
        detailsExpanded = true;
        detailsHost.Visible = true;
        detailsButton.Text = "隐藏安装详情";
        detailsButton.AccessibleName = detailsButton.Text;
    }

    private static string FriendlyFailureText(Exception error)
    {
        if (error is InvalidDataException)
        {
            return "安装包校验失败，文件可能下载不完整或已损坏。请重新下载安装包后重试。";
        }
        if (error is UnauthorizedAccessException)
        {
            return "无法写入所选文件夹。请选择当前用户有权限的位置后重试。";
        }
        if (error is IOException && error.Message.Contains("space", StringComparison.OrdinalIgnoreCase))
        {
            return "磁盘可用空间不足。释放空间或更换安装位置后重试。";
        }
        if (error is PlatformNotSupportedException) return error.Message;
        return "安装没有完成。请查看安装详情，处理提示的问题后重试。";
    }

    private static void ApplyHighContrastPalette(Control root)
    {
        if (root is not FluentButton && root is not FluentProgressIndicator)
        {
            root.BackColor = SystemColors.Window;
            root.ForeColor = SystemColors.WindowText;
        }
        foreach (Control child in root.Controls) ApplyHighContrastPalette(child);
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

internal enum SetupVisualState
{
    Ready,
    Preparing,
    Installing,
    Completed,
    Failed
}

internal enum SetupProgressState
{
    Ready,
    Running,
    Completed,
    Failed
}

internal enum FluentButtonKind
{
    Primary,
    Secondary,
    Subtle
}

internal sealed class FluentButton : Button
{
    private readonly FluentButtonKind kind;
    private bool hot;
    private bool pressed;

    public FluentButton(FluentButtonKind kind)
    {
        this.kind = kind;
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        UseVisualStyleBackColor = false;
        Cursor = Cursors.Hand;
        Font = new Font("Segoe UI Semibold", 9.25f, FontStyle.Regular, GraphicsUnit.Point);
        Padding = new Padding(12, 0, 12, 0);
        SetStyle(
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.UserPaint,
            true
        );
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        hot = true;
        Invalidate();
        base.OnMouseEnter(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        hot = false;
        pressed = false;
        Invalidate();
        base.OnMouseLeave(e);
    }

    protected override void OnMouseDown(MouseEventArgs mevent)
    {
        if (mevent.Button == MouseButtons.Left) pressed = true;
        Invalidate();
        base.OnMouseDown(mevent);
    }

    protected override void OnMouseUp(MouseEventArgs mevent)
    {
        pressed = false;
        Invalidate();
        base.OnMouseUp(mevent);
    }

    protected override void OnGotFocus(EventArgs e)
    {
        Invalidate();
        base.OnGotFocus(e);
    }

    protected override void OnLostFocus(EventArgs e)
    {
        Invalidate();
        base.OnLostFocus(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        Rectangle bounds = new(0, 0, Math.Max(1, Width - 1), Math.Max(1, Height - 1));
        bool highContrast = SystemInformation.HighContrast;
        Color background;
        Color foreground;
        Color border;

        if (!Enabled)
        {
            background = highContrast ? SystemColors.Control : Color.FromArgb(243, 242, 241);
            foreground = highContrast ? SystemColors.GrayText : Color.FromArgb(161, 159, 157);
            border = highContrast ? SystemColors.GrayText : Color.FromArgb(225, 223, 221);
        }
        else if (highContrast)
        {
            background = Focused ? SystemColors.Highlight : SystemColors.ButtonFace;
            foreground = Focused ? SystemColors.HighlightText : SystemColors.ControlText;
            border = SystemColors.ControlText;
        }
        else if (kind == FluentButtonKind.Primary)
        {
            background = pressed
                ? Color.FromArgb(0, 72, 127)
                : hot || Focused ? Color.FromArgb(17, 94, 163) : Color.FromArgb(15, 108, 189);
            foreground = Color.White;
            border = background;
        }
        else if (kind == FluentButtonKind.Subtle)
        {
            background = pressed
                ? Color.FromArgb(237, 235, 233)
                : hot || Focused ? Color.FromArgb(243, 242, 241) : Color.White;
            foreground = Color.FromArgb(50, 49, 48);
            border = background;
        }
        else
        {
            background = pressed
                ? Color.FromArgb(237, 235, 233)
                : hot || Focused ? Color.FromArgb(250, 249, 248) : Color.White;
            foreground = Color.FromArgb(50, 49, 48);
            border = hot || Focused ? Color.FromArgb(96, 94, 92) : Color.FromArgb(138, 136, 134);
        }

        using GraphicsPath path = RoundedRectangle(bounds, kind == FluentButtonKind.Subtle ? 5 : 4);
        using SolidBrush backgroundBrush = new(background);
        e.Graphics.FillPath(backgroundBrush, path);
        if (kind != FluentButtonKind.Subtle || highContrast)
        {
            using Pen borderPen = new(border, 1f);
            e.Graphics.DrawPath(borderPen, path);
        }

        TextFormatFlags flags = TextFormatFlags.VerticalCenter |
            (TextAlign == ContentAlignment.MiddleLeft
                ? TextFormatFlags.Left
                : TextFormatFlags.HorizontalCenter) |
            TextFormatFlags.SingleLine |
            TextFormatFlags.EndEllipsis;
        Rectangle textBounds = TextAlign == ContentAlignment.MiddleLeft
            ? new Rectangle(12, 0, Math.Max(0, Width - 24), Height)
            : ClientRectangle;
        TextRenderer.DrawText(e.Graphics, Text, Font, textBounds, foreground, flags);

        if (Focused && ShowFocusCues)
        {
            Rectangle focusBounds = Rectangle.Inflate(bounds, -3, -3);
            ControlPaint.DrawFocusRectangle(e.Graphics, focusBounds, foreground, background);
        }
    }

    private static GraphicsPath RoundedRectangle(Rectangle rectangle, int radius)
    {
        GraphicsPath path = new();
        int diameter = radius * 2;
        if (diameter <= 0)
        {
            path.AddRectangle(rectangle);
            return path;
        }
        Rectangle arc = new(rectangle.Location, new Size(diameter, diameter));
        path.AddArc(arc, 180, 90);
        arc.X = rectangle.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = rectangle.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = rectangle.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class FluentCardPanel : Panel
{
    public FluentCardPanel()
    {
        SetStyle(
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.UserPaint,
            true
        );
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Color border = SystemInformation.HighContrast ? SystemColors.WindowText : Color.FromArgb(225, 223, 221);
        using Pen pen = new(border, 1f);
        Rectangle rectangle = new(0, 0, Math.Max(0, Width - 1), Math.Max(0, Height - 1));
        e.Graphics.DrawRectangle(pen, rectangle);
    }
}

internal sealed class FluentProgressIndicator : Control
{
    private readonly System.Windows.Forms.Timer animationTimer;
    private int animationOffset;
    private SetupProgressState state;

    public FluentProgressIndicator()
    {
        SetStyle(
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.UserPaint,
            true
        );
        TabStop = false;
        animationTimer = new System.Windows.Forms.Timer { Interval = 24 };
        animationTimer.Tick += (_, _) =>
        {
            animationOffset = (animationOffset + 7) % Math.Max(1, Width + 120);
            Invalidate();
        };
    }

    public SetupProgressState State
    {
        get => state;
        set
        {
            if (state == value) return;
            state = value;
            if (state == SetupProgressState.Running && Visible && !SystemInformation.TerminalServerSession)
            {
                animationTimer.Start();
            }
            else
            {
                animationTimer.Stop();
            }
            Invalidate();
            AccessibilityNotifyClients(AccessibleEvents.ValueChange, -1);
        }
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        if (!Visible) animationTimer.Stop();
        else if (state == SetupProgressState.Running && !SystemInformation.TerminalServerSession)
        {
            animationTimer.Start();
        }
        base.OnVisibleChanged(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) animationTimer.Dispose();
        base.Dispose(disposing);
    }

    protected override AccessibleObject CreateAccessibilityInstance() =>
        new FluentProgressAccessibleObject(this);

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Color track = SystemInformation.HighContrast ? SystemColors.ControlDark : Color.FromArgb(237, 235, 233);
        Color accent = SystemInformation.HighContrast ? SystemColors.Highlight : Color.FromArgb(15, 108, 189);
        if (state == SetupProgressState.Completed) accent = Color.FromArgb(16, 124, 16);
        if (state == SetupProgressState.Failed) accent = Color.FromArgb(196, 43, 28);

        using SolidBrush trackBrush = new(track);
        e.Graphics.FillRectangle(trackBrush, ClientRectangle);
        using SolidBrush accentBrush = new(accent);
        switch (state)
        {
            case SetupProgressState.Ready:
                e.Graphics.FillRectangle(accentBrush, 0, 0, Math.Max(3, Width / 12), Height);
                break;
            case SetupProgressState.Running:
                int segment = Math.Max(48, Width / 5);
                int x = animationOffset - 120;
                e.Graphics.FillRectangle(accentBrush, x, 0, segment, Height);
                break;
            case SetupProgressState.Completed:
            case SetupProgressState.Failed:
                e.Graphics.FillRectangle(accentBrush, ClientRectangle);
                break;
        }
    }

    private sealed class FluentProgressAccessibleObject : ControlAccessibleObject
    {
        private readonly FluentProgressIndicator owner;

        public FluentProgressAccessibleObject(FluentProgressIndicator owner) : base(owner)
        {
            this.owner = owner;
        }

        public override AccessibleRole Role => AccessibleRole.ProgressBar;

        public override string? Value => owner.State switch
        {
            SetupProgressState.Ready => "准备就绪",
            SetupProgressState.Running => "正在安装",
            SetupProgressState.Completed => "安装完成",
            SetupProgressState.Failed => "安装失败",
            _ => ""
        };
    }
}

internal sealed class SetupOptions
{
    private SetupOptions(
        bool quiet,
        string installDir,
        bool launchAfterInstall,
        IReadOnlyList<string> forwardedArgs,
        SetupVisualState? previewState
    )
    {
        Quiet = quiet;
        InstallDir = installDir;
        LaunchAfterInstall = launchAfterInstall;
        ForwardedArgs = forwardedArgs;
        PreviewState = previewState;
    }

    public bool Quiet { get; }
    public string InstallDir { get; }
    public bool LaunchAfterInstall { get; }
    public IReadOnlyList<string> ForwardedArgs { get; }
    public SetupVisualState? PreviewState { get; }

    public string ForwardedArgumentLine => ForwardedArgs.Count == 0
        ? ""
        : " " + string.Join(" ", ForwardedArgs.Select(SetupEngine.QuoteArg));

    public static SetupOptions Parse(string[] args)
    {
        bool quiet = false;
        string installDir = GetDefaultInstallDir();
        bool launchAfterInstall = true;
        List<string> forwarded = new();
        SetupVisualState? previewState = null;

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

#if DEBUG
            if (string.Equals(arg, "--ui-preview", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                if (Enum.TryParse(args[i + 1], ignoreCase: true, out SetupVisualState parsedState))
                {
                    previewState = parsedState;
                }
                i += 1;
                continue;
            }
#endif

            forwarded.Add(arg);
        }

        return new SetupOptions(quiet, installDir, launchAfterInstall, forwarded, previewState);
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
            return SelectRegisteredInstallDirectory(raw);
        }
        catch
        {
            return "";
        }
    }

    internal static string SelectRegisteredInstallDirectory(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";
        try
        {
            string candidate = Path.GetFullPath(Environment.ExpandEnvironmentVariables(raw));
            bool hasJar = File.Exists(Path.Combine(candidate, "out", "fe-monster-java.jar"));
            bool modernInstall =
                hasJar &&
                File.Exists(Path.Combine(candidate, "web", "index.html")) &&
                File.Exists(Path.Combine(
                    candidate,
                    "native",
                    "windows",
                    "build",
                    "winforms",
                    "FE Monster.exe"
                ));
            bool legacyInstall =
                hasJar &&
                (File.Exists(Path.Combine(candidate, "FE Monster.vbs")) ||
                 File.Exists(Path.Combine(candidate, "run.cmd")));
            return modernInstall || legacyInstall ? candidate : "";
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
    int MaxRelativePathLength,
    string WebView2Mode
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

    public static string InferDistributionMode(string exePath)
    {
        try
        {
            using Stream? resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(BundleFileName);
            if (resource != null) return ReadDistributionMode(resource);

            string? sidecarBundle = FindSidecarBundle(exePath);
            if (!string.IsNullOrWhiteSpace(sidecarBundle))
            {
                using FileStream input = File.OpenRead(sidecarBundle);
                return ReadDistributionMode(input);
            }
        }
        catch
        {
        }
        return "online";
    }

    private static string ReadDistributionMode(Stream bundleInput)
    {
        using ZipArchive archive = new(bundleInput, ZipArchiveMode.Read, leaveOpen: true);
        ZipArchiveEntry? manifestEntry = archive.Entries.FirstOrDefault(entry =>
            string.Equals(
                entry.FullName.Replace('\\', '/'),
                SetupManifestFileName,
                StringComparison.OrdinalIgnoreCase
            )
        );
        if (manifestEntry == null) return "online";
        using Stream input = manifestEntry.Open();
        using JsonDocument document = JsonDocument.Parse(input);
        return NormalizeDistributionMode(
            document.RootElement.TryGetProperty("webView2Mode", out JsonElement mode)
                ? mode.GetString()
                : null
        );
    }

    private static string NormalizeDistributionMode(string? mode) =>
        string.Equals(mode, "offline", StringComparison.OrdinalIgnoreCase) ? "offline" : "online";

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
        string webView2Mode = NormalizeDistributionMode(
            root.TryGetProperty("webView2Mode", out JsonElement modeElement)
                ? modeElement.GetString()
                : null
        );
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
        return new PayloadPreparation(payloadRoot, requiredInstallBytes, maxRelativePathLength, webView2Mode);
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
