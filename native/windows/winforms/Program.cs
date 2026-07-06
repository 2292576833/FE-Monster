using System;
using System.Windows.Forms;

namespace FeMonster.Client;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new FeMonsterForm(ClientOptions.Parse(args)));
    }
}
