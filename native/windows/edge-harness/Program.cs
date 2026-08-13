using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;
using Forms = System.Windows.Forms;
using Threading = System.Windows.Threading;

internal static class Program
{
    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint { public int X; public int Y; }

    [DllImport("user32.dll")]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out NativePoint point);

    [STAThread]
    private static int Main(string[] args)
    {
        _ = SetThreadDpiAwarenessContext(new IntPtr(-4));
        string registryPath = $@"Software\FE Monster\DesktopPetTest\edge-harness-{Environment.ProcessId}-{Guid.NewGuid():N}";
        string? previousRegistryPath = Environment.GetEnvironmentVariable("FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH");
        Environment.SetEnvironmentVariable("FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH", registryPath);
        string edge = args.ElementAtOrDefault(0)?.ToLowerInvariant() ?? "right";
        int holdMovingMs = int.TryParse(args.ElementAtOrDefault(1), out int hold) ? hold : 1_100;
        string clientAssemblyPath = args.ElementAtOrDefault(2)
            ?? Path.Combine(AppContext.BaseDirectory, "FE Monster.dll");
        Assembly clientAssembly = Assembly.LoadFrom(clientAssemblyPath);
        Type type = clientAssembly.GetType(
            "FeMonster.Client.DesktopPetWindow",
            throwOnError: true) ?? throw new InvalidOperationException("DesktopPetWindow missing");
        object window = Activator.CreateInstance(type, nonPublic: true)
            ?? throw new InvalidOperationException("DesktopPetWindow could not be constructed");
        if (edge == "adjacent-monitor")
        {
            try
            {
                return VerifyAdjacentMonitorDockOwnership(type, window);
            }
            finally
            {
                try { RequiredMethod(type, "Close").Invoke(window, null); } catch { }
                try { Registry.CurrentUser.DeleteSubKeyTree(registryPath, throwOnMissingSubKey: false); } catch { }
                Environment.SetEnvironmentVariable("FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH", previousRegistryPath);
            }
        }
        MethodInfo show = RequiredMethod(type, "ShowPet");
        MethodInfo move = RequiredMethod(type, "MoveBy");
        MethodInfo endMove = RequiredMethod(type, "EndMove");
        MethodInfo query = RequiredMethod(type, "QueryBounds");
        MethodInfo cursorNear = type.GetMethod("CursorNearDockEdge", BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new MissingMethodException(type.FullName, "CursorNearDockEdge");
        MethodInfo setPanelOpen = RequiredMethod(type, "SetPanelOpen");
        MethodInfo close = RequiredMethod(type, "Close");
        try
        {
            show.Invoke(window, null);
            Pump(180);
            object initial = query.Invoke(window, null)!;
            object area = Get(initial, "workingArea");
            int initialLeft = GetInt(initial, "left");
            int initialTop = GetInt(initial, "top");
            int initialWidth = GetInt(initial, "width");
            int initialHeight = GetInt(initial, "height");
            int areaLeft = GetInt(area, "left");
            int areaTop = GetInt(area, "top");
            int areaWidth = GetInt(area, "width");
            int areaHeight = GetInt(area, "height");
            bool canMoveSystemCursor = TrySetCursor(areaLeft + areaWidth / 2, areaTop + areaHeight / 2);
            (int dx, int dy) = edge switch
            {
                "left" => (areaLeft - initialLeft, 0),
                "right" => (areaLeft + areaWidth - initialLeft - initialWidth, 0),
                "top" => (0, areaTop - initialTop),
                "bottom" => (0, areaTop + areaHeight - initialTop - initialHeight),
                _ => throw new ArgumentException($"Unsupported edge: {edge}")
            };
            move.Invoke(window, [dx, dy]);
            Pump(holdMovingMs);
            object moving = query.Invoke(window, null)!;
            if (!GetBool(moving, "moving") || GetBool(moving, "autoHidden"))
            {
                throw new InvalidOperationException("desktop pet hid or dropped its guard while still moving");
            }
            endMove.Invoke(window, null);
            var docked = WaitFor(query, window, "dock", 2_200,
                bounds => GetString(bounds, "dockEdge") == edge
                    && !GetBool(bounds, "moving")
                    && VisibleAtExpectedEdge(bounds, edge));

            setPanelOpen.Invoke(window,
            [
                true,
                new System.Drawing.RectangleF(20, 20, 250, 110),
                new System.Drawing.SizeF(720, 660),
                18f
            ]);
            Pump(1_150);
            if (GetBool(query.Invoke(window, null)!, "autoHidden"))
                throw new InvalidOperationException("desktop pet hid while its chat panel was open");
            setPanelOpen.Invoke(window,
            [
                false,
                System.Drawing.RectangleF.Empty,
                System.Drawing.SizeF.Empty,
                0f
            ]);
            WaitFor(query, window, "panel close dock settle", 2_200,
                bounds => GetString(bounds, "dockEdge") == edge
                    && VisibleAtExpectedEdge(bounds, edge));
            if (canMoveSystemCursor)
                canMoveSystemCursor = TrySetCursor(areaLeft + areaWidth / 2, areaTop + areaHeight / 2);

            long hideStarted = Environment.TickCount64;
            var hidden = WaitFor(query, window, "auto-hide", 2_600,
                bounds => GetBool(bounds, "autoHidden"));
            long hideDelay = Environment.TickCount64 - hideStarted;
            if (hideDelay < 650 || hideDelay > 1_900)
            {
                throw new InvalidOperationException($"auto-hide delay was {hideDelay}ms; expected 650..1900ms including dock settle grace");
            }
            var hiddenSettled = WaitFor(query, window, "hidden animation settle", 1_500,
                bounds => HiddenAtExpectedStrip(bounds, edge, 24));
            object hiddenBounds = hiddenSettled.Bounds;
            int hiddenLeft = GetInt(hiddenBounds, "left");
            int hiddenTop = GetInt(hiddenBounds, "top");
            int hiddenWidth = GetInt(hiddenBounds, "width");
            int hiddenHeight = GetInt(hiddenBounds, "height");
            (int cursorX, int cursorY) = edge switch
            {
                "left" => (areaLeft + 1, hiddenTop + hiddenHeight / 2),
                "right" => (areaLeft + areaWidth - 2, hiddenTop + hiddenHeight / 2),
                "top" => (hiddenLeft + hiddenWidth / 2, areaTop + 1),
                "bottom" => (hiddenLeft + hiddenWidth / 2, areaTop + areaHeight - 2),
                _ => throw new UnreachableException()
            };
            long revealStarted = Environment.TickCount64;
            if (!canMoveSystemCursor || !TrySetCursor(cursorX, cursorY))
            {
                bool directNear = (bool)(cursorNear.Invoke(window, [new System.Drawing.Point(cursorX, cursorY), new System.Drawing.Rectangle(areaLeft, areaTop, areaWidth, areaHeight)]) ?? false);
                if (!directNear)
                    throw new InvalidOperationException($"{edge} physical-coordinate proximity predicate rejected {cursorX},{cursorY}");
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    ok = true,
                    edge,
                    movingGuardMs = holdMovingMs,
                    dockMs = docked.ElapsedMs,
                    hideDelayMs = hideDelay,
                    revealDelayMs = (long?)null,
                    systemCursorControl = "unavailable",
                    proximityPredicate = true,
                    hiddenBounds
                }));
                return 0;
            }
            (object Bounds, long ElapsedMs) revealed;
            try
            {
                revealed = WaitFor(query, window, "proximity reveal", 1_800,
                    bounds => !GetBool(bounds, "autoHidden")
                        && VisibleAtExpectedEdge(bounds, edge));
            }
            catch (TimeoutException error)
            {
                _ = GetCursorPos(out NativePoint rawCursor);
                var formsCursor = Forms.Cursor.Position;
                bool privateNear = (bool)(cursorNear.Invoke(window, [formsCursor, new System.Drawing.Rectangle(areaLeft, areaTop, areaWidth, areaHeight)]) ?? false);
                throw new TimeoutException($"{error.Message}; requestedCursor={cursorX},{cursorY}; rawCursor={rawCursor.X},{rawCursor.Y}; formsCursor={formsCursor.X},{formsCursor.Y}; privateNear={privateNear}", error);
            }
            long revealDelay = Environment.TickCount64 - revealStarted;
            Console.WriteLine(JsonSerializer.Serialize(new
            {
                ok = true,
                edge,
                movingGuardMs = holdMovingMs,
                dockMs = docked.ElapsedMs,
                hideDelayMs = hideDelay,
                revealDelayMs = revealDelay,
                panelProtected = true,
                hiddenBounds,
                revealedBounds = revealed.Bounds
            }));
            return 0;
        }
        finally
        {
            try { close.Invoke(window, null); } catch { }
            Pump(80);
            try { Registry.CurrentUser.DeleteSubKeyTree(registryPath, throwOnMissingSubKey: false); } catch { }
            Environment.SetEnvironmentVariable("FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH", previousRegistryPath);
        }
    }

    private static MethodInfo RequiredMethod(Type type, string name) => type.GetMethod(name)
        ?? throw new MissingMethodException(type.FullName, name);

    private static int VerifyAdjacentMonitorDockOwnership(Type type, object window)
    {
        FieldInfo dockArea = type.GetField("dockWorkingArea", BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new MissingFieldException(type.FullName, "dockWorkingArea");
        FieldInfo dockEdge = type.GetField("dockEdge", BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new MissingFieldException(type.FullName, "dockEdge");
        MethodInfo workingArea = type.GetMethod("WorkingAreaForDock", BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new MissingMethodException(type.FullName, "WorkingAreaForDock");

        var originalMonitor = new System.Drawing.Rectangle(-1920, 0, 1920, 1040);
        // A right-docked hidden window keeps only its 24-DIP strip on the
        // original monitor, so ordinary largest-overlap selection prefers the
        // adjacent 0..2560 monitor. Dock ownership must remain original.
        var mostlyAdjacentHiddenBounds = new System.Drawing.Rectangle(-30, 260, 375, 425);
        object right = Enum.Parse(dockEdge.FieldType, "Right");
        dockEdge.SetValue(window, right);
        dockArea.SetValue(window, originalMonitor);
        var selected = (System.Drawing.Rectangle)(workingArea.Invoke(
            window,
            [mostlyAdjacentHiddenBounds]) ?? System.Drawing.Rectangle.Empty);
        if (selected != originalMonitor)
            throw new InvalidOperationException(
                $"hidden dock switched from {originalMonitor} to adjacent monitor {selected}");

        Console.WriteLine(JsonSerializer.Serialize(new
        {
            ok = true,
            scenario = "adjacent-monitor-dock-ownership",
            originalMonitor,
            mostlyAdjacentHiddenBounds,
            selected
        }));
        return 0;
    }

    private static (object Bounds, long ElapsedMs) WaitFor(
        MethodInfo query,
        object window,
        string label,
        int timeoutMs,
        Func<object, bool> predicate)
    {
        long started = Environment.TickCount64;
        object? last = null;
        while (Environment.TickCount64 - started <= timeoutMs)
        {
            Pump(30);
            last = query.Invoke(window, null)!;
            if (predicate(last)) return (last, Environment.TickCount64 - started);
        }
        throw new TimeoutException($"{label} timed out; last={JsonSerializer.Serialize(last)}");
    }

    private static object Get(object source, string property) => source.GetType().GetProperty(property)?.GetValue(source)
        ?? throw new MissingMemberException(source.GetType().FullName, property);

    private static int GetInt(object source, string property) => Convert.ToInt32(Get(source, property));

    private static bool GetBool(object source, string property) => Convert.ToBoolean(Get(source, property));

    private static string GetString(object source, string property) => Convert.ToString(Get(source, property)) ?? "";

    private static bool TrySetCursor(int x, int y)
    {
        if (!SetCursorPos(x, y)) return false;
        Pump(35);
        return GetCursorPos(out NativePoint actual)
            && Math.Abs(actual.X - x) <= 1
            && Math.Abs(actual.Y - y) <= 1;
    }

    private static bool VisibleAtExpectedEdge(object bounds, string edge)
    {
        object area = Get(bounds, "workingArea");
        int left = GetInt(bounds, "left");
        int top = GetInt(bounds, "top");
        int width = GetInt(bounds, "width");
        int height = GetInt(bounds, "height");
        int areaLeft = GetInt(area, "left");
        int areaTop = GetInt(area, "top");
        int areaRight = areaLeft + GetInt(area, "width");
        int areaBottom = areaTop + GetInt(area, "height");
        return edge switch
        {
            "left" => Math.Abs(left - areaLeft) <= 2,
            "right" => Math.Abs(left + width - areaRight) <= 2,
            "top" => Math.Abs(top - areaTop) <= 2,
            "bottom" => Math.Abs(top + height - areaBottom) <= 2,
            _ => false
        };
    }

    private static bool HiddenAtExpectedStrip(object bounds, string edge, int revealDip)
    {
        object area = Get(bounds, "workingArea");
        int left = GetInt(bounds, "left");
        int top = GetInt(bounds, "top");
        int width = GetInt(bounds, "width");
        int height = GetInt(bounds, "height");
        int areaLeft = GetInt(area, "left");
        int areaTop = GetInt(area, "top");
        int areaWidth = GetInt(area, "width");
        int areaHeight = GetInt(area, "height");
        int revealPixels = Math.Max(1, (int)Math.Round(revealDip * width / 300d));
        return edge switch
        {
            "left" => Math.Abs(left + width - (areaLeft + revealPixels)) <= 2,
            "right" => Math.Abs(left - (areaLeft + areaWidth - revealPixels)) <= 2,
            "top" => Math.Abs(top + height - (areaTop + revealPixels)) <= 2,
            "bottom" => Math.Abs(top - (areaTop + areaHeight - revealPixels)) <= 2,
            _ => false
        };
    }

    private static void Pump(int milliseconds)
    {
        long until = Environment.TickCount64 + milliseconds;
        while (Environment.TickCount64 < until)
        {
            Forms.Application.DoEvents();
            var frame = new Threading.DispatcherFrame();
            Threading.Dispatcher.CurrentDispatcher.BeginInvoke(
                Threading.DispatcherPriority.Background,
                new Threading.DispatcherOperationCallback(value =>
                {
                    ((Threading.DispatcherFrame)value).Continue = false;
                    return null;
                }),
                frame);
            Threading.Dispatcher.PushFrame(frame);
            Thread.Sleep(10);
        }
    }
}
