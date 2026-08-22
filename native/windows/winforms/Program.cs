using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

namespace FeMonster.Client;

internal static class Program
{
    private const string AppUserModelId = "FE.Monster.Desktop";

    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 17763))
        {
            ShowStartupError("FE Monster requires Windows 10 version 1809 or newer.");
            return 2;
        }
        if (RuntimeInformation.ProcessArchitecture != Architecture.X64)
        {
            ShowStartupError("This FE Monster build requires a Windows x64 process.");
            return 2;
        }

        _ = SetCurrentProcessExplicitAppUserModelID(AppUserModelId);
        using EventWaitHandle activationRequest = new(
            false,
            EventResetMode.AutoReset,
            UserActivationRequestName()
        );
        using EventWaitHandle activationAcknowledged = new(
            false,
            EventResetMode.AutoReset,
            UserActivationAcknowledgedName()
        );
        using Mutex singleInstance = new(true, UserMutexName(), out bool ownsMutex);
        if (!ownsMutex)
        {
            activationAcknowledged.Reset();
            activationRequest.Set();
            if (activationAcknowledged.WaitOne(TimeSpan.FromSeconds(2)))
            {
                _ = TryActivateExistingInstance();
                return 0;
            }
            if (TryActivateExistingInstance()) return 0;

            DialogResult restart = MessageBox.Show(
                "FE Monster is running in the background but has no visible window.\n\n" +
                "Restart that instance now?",
                "FE Monster",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning
            );
            if (restart != DialogResult.Yes || !TerminateInvisibleInstances())
            {
                return 1;
            }
            ownsMutex = singleInstance.WaitOne(TimeSpan.FromSeconds(5));
            if (!ownsMutex)
            {
                ShowStartupError("The background FE Monster instance did not exit. Restart Windows or end FE Monster.exe in Task Manager.");
                return 1;
            }
        }

        BackendHost? backend = null;
        try
        {
            string[] clientArgs = args;
            if (!HasUrlArgument(args))
            {
                backend = BackendHost.Start();
                clientArgs = args.Concat(new[] { "--url", backend.ClientUrl }).ToArray();
            }

            using FeMonsterForm mainForm = new(ClientOptions.Parse(clientArgs), backend is not null);
            _ = mainForm.Handle;
            using CancellationTokenSource activationStop = new();
            Task activationTask = ListenForActivation(
                activationRequest,
                activationAcknowledged,
                activationStop.Token,
                mainForm
            );
            try
            {
                Application.Run(mainForm);
            }
            finally
            {
                activationStop.Cancel();
                try { activationTask.Wait(TimeSpan.FromSeconds(2)); } catch (AggregateException) { }
            }
            return 0;
        }
        catch (Exception error)
        {
            StartupDiagnostics.Write(error);
            ShowStartupError(
                "FE Monster could not start.\n\n" +
                error.Message +
                "\n\nDiagnostic log:\n" +
                StartupDiagnostics.LogPath
            );
            return 1;
        }
        finally
        {
            backend?.Dispose();
            if (ownsMutex)
            {
                try { singleInstance.ReleaseMutex(); } catch (ApplicationException) { }
            }
        }
    }

    private static bool HasUrlArgument(string[] args)
    {
        return args.Any(value => string.Equals(value, "--url", StringComparison.OrdinalIgnoreCase));
    }

    private static string UserMutexName()
    {
        return @"Local\FE-Monster-" + UserInstanceSuffix();
    }

    private static string UserActivationRequestName()
    {
        return @"Local\FE-Monster-Activate-" + UserInstanceSuffix();
    }

    private static string UserActivationAcknowledgedName()
    {
        return @"Local\FE-Monster-Activated-" + UserInstanceSuffix();
    }

    private static string UserInstanceSuffix()
    {
        string testScope = DesktopPetTestInstanceScope();
        byte[] identity = Encoding.UTF8.GetBytes(
            Environment.UserDomainName + "\\" + Environment.UserName + testScope
        );
        return Convert.ToHexString(SHA256.HashData(identity)).Substring(0, 16);
    }

    internal static string DesktopPetTestStorageKey()
    {
        string testScope = DesktopPetTestInstanceScope();
        return testScope.Length == 0
            ? ""
            : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(testScope))).Substring(0, 16);
    }

    private static string DesktopPetTestInstanceScope()
    {
        string raw = Environment.GetEnvironmentVariable(
            "FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH"
        ) ?? "";
        return raw.Length <= 512 && raw.StartsWith(
            @"Software\FE Monster\DesktopPetTest\",
            StringComparison.OrdinalIgnoreCase
        )
            ? "\n" + raw
            : "";
    }

    private static Task ListenForActivation(
        EventWaitHandle activationRequest,
        EventWaitHandle activationAcknowledged,
        CancellationToken cancellationToken,
        FeMonsterForm mainForm
    )
    {
        return Task.Run(() =>
        {
            WaitHandle[] handles = { activationRequest, cancellationToken.WaitHandle };
            while (WaitHandle.WaitAny(handles) == 0)
            {
                try
                {
                    if (mainForm.IsDisposed) break;
                    mainForm.BeginInvoke((Action)(() =>
                    {
                        try
                        {
                            mainForm.ShowMainWindow();
                        }
                        finally
                        {
                            activationAcknowledged.Set();
                        }
                    }));
                }
                catch (InvalidOperationException)
                {
                    if (mainForm.IsDisposed) break;
                }
            }
        });
    }

    private static bool TryActivateExistingInstance()
    {
        foreach (Process candidate in ExistingMainProcesses())
        {
            try
            {
                candidate.Refresh();
                IntPtr window = candidate.MainWindowHandle;
                if (window == IntPtr.Zero) continue;
                _ = ShowWindowAsync(window, 9);
                _ = SetForegroundWindow(window);
                return true;
            }
            catch
            {
            }
            finally
            {
                candidate.Dispose();
            }
        }
        return false;
    }

    private static bool TerminateInvisibleInstances()
    {
        bool success = true;
        foreach (Process candidate in ExistingMainProcesses())
        {
            try
            {
                candidate.Kill(entireProcessTree: true);
                if (!candidate.WaitForExit(4000)) success = false;
            }
            catch
            {
                success = false;
            }
            finally
            {
                candidate.Dispose();
            }
        }
        return success;
    }

    private static IEnumerable<Process> ExistingMainProcesses()
    {
        string processName = Path.GetFileNameWithoutExtension(Environment.ProcessPath) ?? "FE Monster";
        int currentSession = Process.GetCurrentProcess().SessionId;
        return Process.GetProcessesByName(processName)
            .Where(process => process.Id != Environment.ProcessId && process.SessionId == currentSession);
    }

    private static void ShowStartupError(string message)
    {
        MessageBox.Show(message, "FE Monster", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr window, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);
}

internal sealed class BackendHost : IDisposable
{
    private const int MinimumJavaMajor = 17;
    private readonly Process process;
    private readonly string logPath;
    private bool disposed;

    private BackendHost(Process process, string clientUrl, string logPath)
    {
        this.process = process;
        this.logPath = logPath;
        ClientUrl = clientUrl;
    }

    public string ClientUrl { get; }

    public static BackendHost Start()
    {
        string root = ResolveRoot();
        string dataDirectory = ResolveStableDataDirectory(root);
        string javaExe = ResolveJava(root);
        string jar = Path.Combine(root, "out", "fe-monster-java.jar");
        int port = ReserveLocalPort();
        string baseUrl = $"http://127.0.0.1:{port}/";
        string clientUrl = baseUrl + "?client=embedded&render=directx11&audio=xaudio2";
        string outDir = Path.Combine(root, "out");
        Directory.CreateDirectory(outDir);
        string logPath = Path.Combine(outDir, "backend.log");

        ProcessStartInfo startInfo = new()
        {
            FileName = javaExe,
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        startInfo.ArgumentList.Add("-Xms64m");
        startInfo.ArgumentList.Add("-Xmx512m");
        startInfo.ArgumentList.Add("-jar");
        startInfo.ArgumentList.Add(jar);
        startInfo.ArgumentList.Add("--server");
        startInfo.Environment["FE_MONSTER_ROOT"] = root;
        startInfo.Environment["FE_MONSTER_WEB_ROOT"] = Path.Combine(root, "web");
        startInfo.Environment["FE_MONSTER_DATA_DIR"] = dataDirectory;
        startInfo.Environment["FE_MONSTER_PORT"] = port.ToString();
        startInfo.Environment["FE_MONSTER_MAIN_PID"] = Environment.ProcessId.ToString();

        Process process = new() { StartInfo = startInfo, EnableRaisingEvents = true };
        object logGate = new();
        DataReceivedEventHandler appendLine = (_, eventArgs) =>
        {
            if (string.IsNullOrWhiteSpace(eventArgs.Data)) return;
            try
            {
                lock (logGate)
                {
                    File.AppendAllText(logPath, eventArgs.Data + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch
            {
            }
        };
        process.OutputDataReceived += appendLine;
        process.ErrorDataReceived += appendLine;

        try
        {
            if (!process.Start()) throw new InvalidOperationException("The bundled Java backend did not start.");
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            WriteProcessTree(outDir, process.Id, javaExe, port);
            WaitUntilReady(process, baseUrl, logPath);
            return new BackendHost(process, clientUrl, logPath);
        }
        catch
        {
            try
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
            }
            catch
            {
            }
            process.Dispose();
            throw;
        }
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;

        try
        {
            using HttpClient client = new() { Timeout = TimeSpan.FromSeconds(2) };
            _ = client.GetAsync(new Uri(new Uri(ClientUrl), "/api/app/quit")).GetAwaiter().GetResult();
        }
        catch
        {
        }

        try
        {
            if (!process.WaitForExit(3000))
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(2000);
            }
        }
        catch (Exception error)
        {
            StartupDiagnostics.Write(error, logPath);
        }
        process.Dispose();
    }

    private static string ResolveRoot()
    {
        List<string> candidates = new();
        AddExecutableRootCandidates(candidates);

        string? explicitRoot = Environment.GetEnvironmentVariable("FE_MONSTER_ROOT");
        if (!string.IsNullOrWhiteSpace(explicitRoot)) candidates.Add(explicitRoot);
        candidates.Add(Environment.CurrentDirectory);

        foreach (string candidate in candidates)
        {
            try
            {
                string root = Path.GetFullPath(candidate);
                if (File.Exists(Path.Combine(root, "out", "fe-monster-java.jar")) &&
                    File.Exists(Path.Combine(root, "web", "index.html")))
                {
                    return root;
                }
            }
            catch
            {
            }
        }
        throw new FileNotFoundException("FE Monster application root or Java jar was not found.");
    }

    private static string ResolveStableDataDirectory(string root)
    {
        string? explicitDataDirectory = Environment.GetEnvironmentVariable("FE_MONSTER_DATA_DIR");
        if (!string.IsNullOrWhiteSpace(explicitDataDirectory))
        {
            string requested = Path.GetFullPath(
                Environment.ExpandEnvironmentVariables(explicitDataDirectory)
            );
            Directory.CreateDirectory(requested);
            return requested;
        }

        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localAppData))
        {
            localAppData = Path.GetTempPath();
        }
        string stable = Path.GetFullPath(Path.Combine(localAppData, "FE Monster", "data"));
        Directory.CreateDirectory(stable);

        string legacy = Path.GetFullPath(Path.Combine(root, "data"));
        if (!string.Equals(legacy, stable, StringComparison.OrdinalIgnoreCase))
        {
            MigrateLegacyDataDirectory(legacy, stable);
        }
        return stable;
    }

    private static void MigrateLegacyDataDirectory(string source, string destination)
    {
        if (!Directory.Exists(source)) return;
        try
        {
            EnumerationOptions options = new()
            {
                RecurseSubdirectories = true,
                IgnoreInaccessible = true,
                ReturnSpecialDirectories = false,
                AttributesToSkip = FileAttributes.ReparsePoint
            };
            foreach (string sourceFile in Directory.EnumerateFiles(source, "*", options))
            {
                string relative = Path.GetRelativePath(source, sourceFile);
                if (relative.StartsWith("..", StringComparison.Ordinal)) continue;
                string destinationFile = Path.GetFullPath(Path.Combine(destination, relative));
                string destinationPrefix = destination.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (!destinationFile.StartsWith(destinationPrefix, StringComparison.OrdinalIgnoreCase)) continue;

                string? parent = Path.GetDirectoryName(destinationFile);
                if (!string.IsNullOrWhiteSpace(parent)) Directory.CreateDirectory(parent);
                bool releaseControlled = relative.Equals("community-server-url.txt", StringComparison.OrdinalIgnoreCase)
                    || relative.Equals("community-server-tls-pin.txt", StringComparison.OrdinalIgnoreCase);
                if (releaseControlled || !File.Exists(destinationFile))
                {
                    File.Copy(sourceFile, destinationFile, overwrite: releaseControlled);
                }
            }
        }
        catch (IOException)
        {
            // Existing stable state remains authoritative if a legacy file is locked.
        }
        catch (UnauthorizedAccessException)
        {
            // The backend will report a writable-data error if the stable root itself is unavailable.
        }
    }

    private static void AddExecutableRootCandidates(List<string> candidates)
    {
        DirectoryInfo? current = new(AppContext.BaseDirectory);
        for (int i = 0; current != null && i < 8; i += 1, current = current.Parent)
        {
            candidates.Add(current.FullName);
        }
    }

    private static string ResolveJava(string root)
    {
        List<string> candidates = new();

        void AddJavaHome(string? home)
        {
            if (string.IsNullOrWhiteSpace(home)) return;
            candidates.Add(Path.Combine(home, "bin", "javaw.exe"));
            candidates.Add(Path.Combine(home, "bin", "java.exe"));
        }

        candidates.Add(Path.Combine(root, "runtime", "java", "bin", "FE Monster Backend.exe"));
        AddJavaHome(Path.Combine(root, "runtime", "java"));
        foreach (string variable in new[]
                 {
                     "FE_JAVA26_HOME",
                     "FE_JAVA_HOME",
                     "FE_JAVA17_HOME",
                     "JAVA_HOME"
                 })
        {
            AddJavaHome(Environment.GetEnvironmentVariable(variable));
        }
        string[] pathParts = (Environment.GetEnvironmentVariable("PATH") ?? "")
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (string pathPart in pathParts)
        {
            candidates.Add(Path.Combine(pathPart, "javaw.exe"));
            candidates.Add(Path.Combine(pathPart, "java.exe"));
        }

        List<string> rejected = new();
        foreach (string candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!File.Exists(candidate)) continue;
            int major = TryReadJavaReleaseMajorVersion(candidate, out int releaseMajor)
                ? releaseMajor
                : ReadJavaMajorVersion(candidate);
            if (major >= MinimumJavaMajor) return candidate;
            rejected.Add($"{candidate} (Java {major})");
        }

        string detail = rejected.Count == 0
            ? "No Java executable was found."
            : "Rejected runtimes: " + string.Join("; ", rejected);
        throw new FileNotFoundException(
            $"FE Monster requires Java {MinimumJavaMajor} or newer. {detail} " +
            "Install Java 17+ or set FE_JAVA_HOME to a compatible runtime."
        );
    }

    private static bool TryReadJavaReleaseMajorVersion(string javaExecutable, out int major)
    {
        major = 0;
        try
        {
            string? binDirectory = Path.GetDirectoryName(javaExecutable);
            string? javaHome = string.IsNullOrWhiteSpace(binDirectory)
                ? null
                : Directory.GetParent(binDirectory)?.FullName;
            if (string.IsNullOrWhiteSpace(javaHome)) return false;
            string releasePath = Path.Combine(javaHome, "release");
            if (!File.Exists(releasePath)) return false;

            string release = File.ReadAllText(releasePath, Encoding.UTF8);
            System.Text.RegularExpressions.Match match =
                System.Text.RegularExpressions.Regex.Match(
                    release,
                    @"(?m)^JAVA_VERSION\s*=\s*""(?<first>\d+)(?:\.(?<second>\d+))?"
                );
            if (!match.Success) return false;
            int first = int.Parse(match.Groups["first"].Value);
            major = first == 1 && match.Groups["second"].Success
                ? int.Parse(match.Groups["second"].Value)
                : first;
            return major > 0;
        }
        catch
        {
            major = 0;
            return false;
        }
    }

    private static int ReadJavaMajorVersion(string javaExecutable)
    {
        string probe = javaExecutable;
        if (Path.GetFileName(javaExecutable).Equals("javaw.exe", StringComparison.OrdinalIgnoreCase))
        {
            string consoleJava = Path.Combine(
                Path.GetDirectoryName(javaExecutable) ?? "",
                "java.exe"
            );
            if (File.Exists(consoleJava)) probe = consoleJava;
        }

        try
        {
            ProcessStartInfo versionInfo = new()
            {
                FileName = probe,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            versionInfo.ArgumentList.Add("-version");
            using Process versionProcess = new() { StartInfo = versionInfo };
            if (!versionProcess.Start()) return 0;
            Task<string> stdout = versionProcess.StandardOutput.ReadToEndAsync();
            Task<string> stderr = versionProcess.StandardError.ReadToEndAsync();
            if (!versionProcess.WaitForExit(3500))
            {
                try
                {
                    versionProcess.Kill(entireProcessTree: true);
                }
                catch
                {
                }
                return 0;
            }

            string output = stdout.GetAwaiter().GetResult() + Environment.NewLine +
                            stderr.GetAwaiter().GetResult();
            System.Text.RegularExpressions.Match match =
                System.Text.RegularExpressions.Regex.Match(
                    output,
                    @"(?:java|openjdk)\s+version\s+""(?<first>\d+)(?:\.(?<second>\d+))?",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase
                );
            if (!match.Success) return 0;
            int first = int.Parse(match.Groups["first"].Value);
            if (first == 1 && match.Groups["second"].Success)
            {
                return int.Parse(match.Groups["second"].Value);
            }
            return first;
        }
        catch
        {
            return 0;
        }
    }

    private static int ReserveLocalPort()
    {
        TcpListener listener = new(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
        finally
        {
            listener.Stop();
        }
    }

    private static void WaitUntilReady(Process process, string baseUrl, string logPath)
    {
        using HttpClient client = new() { Timeout = TimeSpan.FromMilliseconds(900) };
        DateTime deadline = DateTime.UtcNow.AddSeconds(25);
        BackendStartupProbeResult lastProbe = new(false, "starting", "backend has not answered yet");
        while (DateTime.UtcNow < deadline)
        {
            if (process.HasExited)
            {
                throw new InvalidOperationException(
                    $"FE Monster backend exited with code {process.ExitCode}. See {logPath}"
                );
            }
            try
            {
                lastProbe = BackendStartupProbe
                    .ProbeOnceAsync(client, new Uri(baseUrl))
                    .GetAwaiter()
                    .GetResult();
                if (lastProbe.Ready) return;
            }
            catch
            {
            }
            Thread.Sleep(50);
        }
        throw new TimeoutException(
            $"FE Monster backend did not become ready during '{lastProbe.Phase}' " +
            $"({lastProbe.Detail}). See {logPath}"
        );
    }

    private static void WriteProcessTree(string outDir, int backendProcessId, string javaExe, int port)
    {
        var report = new
        {
            app = "FE Monster",
            mainProcessId = Environment.ProcessId,
            backendProcessId,
            backendRole = "Java local API and audio service (CPU is attributed under the FE Monster process tree)",
            backendExecutable = javaExe,
            port,
            startedAt = DateTimeOffset.UtcNow
        };
        File.WriteAllText(
            Path.Combine(outDir, "process-tree.json"),
            JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }),
            Encoding.UTF8
        );
    }
}

internal static class StartupDiagnostics
{
    public static string LogPath
    {
        get
        {
            string configuredDataRoot = Environment.GetEnvironmentVariable("FE_MONSTER_DATA_DIR")?.Trim() ?? "";
            if (configuredDataRoot.Length != 0)
            {
                string dataRoot = Path.GetFullPath(Environment.ExpandEnvironmentVariables(configuredDataRoot));
                string appDataRoot = Directory.GetParent(dataRoot)?.FullName ?? dataRoot;
                return Path.Combine(appDataRoot, "logs", "startup.log");
            }
            string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(root, "FE Monster", "logs", "startup.log");
        }
    }

    public static void Write(Exception error, string? additionalPath = null)
    {
        WriteText(error.ToString(), additionalPath);
    }

    public static void WriteMessage(string message, string? additionalPath = null)
    {
        WriteText(message, additionalPath);
    }

    private static void WriteText(string message, string? additionalPath)
    {
        string text = $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}";
        foreach (string path in new[] { LogPath, additionalPath ?? "" })
        {
            if (string.IsNullOrWhiteSpace(path)) continue;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.AppendAllText(path, text, Encoding.UTF8);
            }
            catch
            {
            }
        }
    }
}
