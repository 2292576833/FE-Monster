using System;
using System.Collections.Generic;

namespace FeMonster.Client;

internal sealed record ClientOptions(
    string Url,
    int Width,
    int Height,
    bool GpuAcceleration,
    bool DirectX11,
    bool XAudio2,
    bool X3DAudio
)
{
    public static ClientOptions Parse(string[] args)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < args.Length - 1; i += 1)
        {
            if (args[i].StartsWith("--", StringComparison.Ordinal)) values[args[i]] = args[i + 1];
        }

        return new ClientOptions(
            Get(values, "--url", "http://127.0.0.1:3000/?client=embedded&render=directx11&audio=xaudio2"),
            GetInt(values, "--width", 1280),
            GetInt(values, "--height", 720),
            GetBool(values, "--gpu", true),
            GetBool(values, "--dx11", true),
            GetBool(values, "--xaudio2", true),
            GetBool(values, "--x3daudio", true)
        );
    }

    private static string Get(IReadOnlyDictionary<string, string> values, string key, string fallback)
    {
        return values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value : fallback;
    }

    private static int GetInt(IReadOnlyDictionary<string, string> values, string key, int fallback)
    {
        return int.TryParse(Get(values, key, ""), out var value) ? value : fallback;
    }

    private static bool GetBool(IReadOnlyDictionary<string, string> values, string key, bool fallback)
    {
        var raw = Get(values, key, fallback ? "true" : "false");
        return raw.Equals("1", StringComparison.OrdinalIgnoreCase)
            || raw.Equals("true", StringComparison.OrdinalIgnoreCase)
            || raw.Equals("yes", StringComparison.OrdinalIgnoreCase)
            || raw.Equals("on", StringComparison.OrdinalIgnoreCase);
    }
}
