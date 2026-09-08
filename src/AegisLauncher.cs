using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace Aegis
{
    class AegisLauncher
    {
        static Process nodeProcess = null;

        static void Main(string[] args)
        {
            Console.Title = "🛡️ A.E.G.I.S — Spatial Hand & Mouse Controller 60 FPS";
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
╔══════════════════════════════════════════════════════════════╗
║        🛡️  A.E.G.I.S — SPATIAL HAND & MOUSE CONTROLLER        ║
║       Contrôle 60 FPS & Arrière-Plan Actif Même Réduit       ║
╚══════════════════════════════════════════════════════════════╝
");
            Console.ResetColor();

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.Combine(appDir, "server.js");

            if (!File.Exists(serverScript))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("❌ Erreur : 'server.js' est introuvable dans : " + appDir);
                Console.ResetColor();
                Console.WriteLine("\nAppuyez sur une touche pour quitter...");
                Console.ReadKey();
                return;
            }

            // 1. Démarrer le serveur Node.js (Dual HTTP/HTTPS)
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("🚀 [1/3] Initialisation du serveur A.E.G.I.S 60 FPS...");
            Console.ResetColor();

            ProcessStartInfo psiNode = new ProcessStartInfo
            {
                FileName = "node",
                Arguments = "server.js",
                WorkingDirectory = appDir,
                UseShellExecute = false,
                RedirectStandardOutput = false,
                RedirectStandardError = false
            };

            try
            {
                nodeProcess = Process.Start(psiNode);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("❌ Impossible de lancer Node.js (" + ex.Message + "). Assurez-vous que Node.js est installé.");
                Console.ResetColor();
                Console.WriteLine("\nAppuyez sur une touche pour quitter...");
                Console.ReadKey();
                return;
            }

            AppDomain.CurrentDomain.ProcessExit += (s, e) => Cleanup();
            Console.CancelKeyPress += (s, e) => {
                Cleanup();
                Environment.Exit(0);
            };

            Thread.Sleep(1500);

            // 2. Ouvrir l'application PC en mode autonome avec maintien d'activité en arrière-plan
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("💻 [2/3] Ouverture de la fenêtre A.E.G.I.S (Mode Arrière-Plan persistant)...");
            Console.ResetColor();

            LaunchAppWindow("http://localhost:8000/pc.html");

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("⚡ [3/3] Contrôle souris Win32 60 FPS actif !");
            Console.WriteLine("💡 ASTUCE : Vous pouvez minimiser la fenêtre, le contrôle continuera en tâche de fond !");
            Console.WriteLine("\n👉 Pour quitter, fermez cette fenêtre ou tapez 'Q'.\n");
            Console.ResetColor();

            while (true)
            {
                if (nodeProcess != null && nodeProcess.HasExited)
                {
                    Console.WriteLine("\nServeur arrêté.");
                    break;
                }

                if (Console.KeyAvailable)
                {
                    var key = Console.ReadKey(true);
                    if (key.Key == ConsoleKey.Q || key.Key == ConsoleKey.Escape)
                    {
                        Console.WriteLine("\nArrêt en cours...");
                        break;
                    }
                }

                Thread.Sleep(300);
            }

            Cleanup();
        }

        static void LaunchAppWindow(string url)
        {
            string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
            }

            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            // Arguments pour désactiver la mise en veille et le bridage en arrière-plan lorsque la fenêtre est réduite
            string browserArgs = "--app=" + url + " --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion,Translate";

            try
            {
                if (File.Exists(chromePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = chromePath,
                        Arguments = browserArgs,
                        UseShellExecute = false
                    });
                    return;
                }

                if (File.Exists(edgePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = browserArgs,
                        UseShellExecute = false
                    });
                    return;
                }

                Process.Start(url);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Ouverture navigateur: " + ex.Message);
                try { Process.Start(url); } catch { }
            }
        }

        static void Cleanup()
        {
            try
            {
                if (nodeProcess != null && !nodeProcess.HasExited)
                {
                    nodeProcess.Kill();
                }
            }
            catch { }
        }
    }
}
