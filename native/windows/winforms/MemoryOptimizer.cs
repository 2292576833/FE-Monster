using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace FeMonster.Client;

internal static class MemoryOptimizer
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetProcessWorkingSetSize(
        IntPtr process,
        IntPtr minimumWorkingSetSize,
        IntPtr maximumWorkingSetSize
    );

    public static bool TrimWorkingSet(Process process)
    {
        if (process == null) return false;
        try
        {
            return SetProcessWorkingSetSize(process.Handle, new IntPtr(-1), new IntPtr(-1));
        }
        catch (Exception)
        {
            return false;
        }
    }

    public static bool TrimCurrentProcess()
    {
        using Process process = Process.GetCurrentProcess();
        return TrimWorkingSet(process);
    }
}
