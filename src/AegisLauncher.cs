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
            Console.Title = "🛡️ A.E.G.I.S — Spatial Hand & Mouse Controller";
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
╔══════════════════════════════════════════════════════════════╗
║        🛡️  A.E.G.I.S — SPATIAL HAND & MOUSE CONTROLLER        ║
║         Contrôle Gestuel PC par Caméra Smartphone            ║
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

            // 1. Démarrer le serveur Node.js
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("🚀 [1/3] Démarrage du serveur A.E.G.I.S...");
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

            // Gestionnaire de sortie propre
            AppDomain.CurrentDomain.ProcessExit += (s, e) => Cleanup();
            Console.CancelKeyPress += (s, e) => {
                Cleanup();
                Environment.Exit(0);
            };

            // 2. Pause pour laisser le serveur initialiser le port SSL et générer le QR code
            Thread.Sleep(1800);

            // 3. Ouvrir l'application PC en mode Application autonome
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("💻 [2/3] Ouverture de l'interface A.E.G.I.S en mode application...");
            Console.ResetColor();

            LaunchAppWindow("https://localhost:8443/pc.html");

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("⚡ [3/3] Synchronisation souris et MediaPipe activée !");
            Console.WriteLine("\n👉 Pour quitter proprement l'application, fermez cette fenêtre ou tapez 'Q'.\n");
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
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
            }

            try
            {
                if (File.Exists(edgePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = "--app=" + url + " --ignore-certificate-errors",
                        UseShellExecute = false
                    });
                    return;
                }

                if (File.Exists(chromePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = chromePath,
                        Arguments = "--app=" + url + " --ignore-certificate-errors",
                        UseShellExecute = false
                    });
                    return;
                }

                // Fallback navigateur par défaut
                Process.Start(url);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Note ouverture navigateur: " + ex.Message);
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
