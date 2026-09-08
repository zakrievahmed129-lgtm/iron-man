using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace Aegis
{
    class AegisMouseBridge
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern int GetSystemMetrics(int nIndex);

        const int SM_CXSCREEN = 0;
        const int SM_CYSCREEN = 1;

        const uint MOUSEEVENTF_LEFTDOWN   = 0x0002;
        const uint MOUSEEVENTF_LEFTUP     = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN  = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP    = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP   = 0x0040;
        const uint MOUSEEVENTF_WHEEL      = 0x0800;

        // Variables de glissement fluide continu (Moteur 166 Hz)
        static volatile float targetX = 960f;
        static volatile float targetY = 540f;
        static volatile float currentX = 960f;
        static volatile float currentY = 540f;
        static volatile float glideFactor = 0.22f; // Glissement soyeux par défaut
        static volatile bool isRunning = true;
        static volatile bool hasTarget = false;
        static object syncLock = new object();

        static void GlideThreadLoop()
        {
            while (isRunning)
            {
                if (hasTarget)
                {
                    float dx = targetX - currentX;
                    float dy = targetY - currentY;
                    float dist = (float)Math.Sqrt(dx * dx + dy * dy);

                    if (dist > 0.25f)
                    {
                        // Moteur de glissement fluide continu (166 Hz)
                        // Élimine toute saccade ou téléportation même si le flux vidéo subit des baisses de FPS
                        float step = glideFactor;
                        if (dist < 4.0f)
                        {
                            step = Math.Max(0.06f, glideFactor * 0.50f);
                        }
                        else if (dist > 180.0f)
                        {
                            step = Math.Min(0.42f, glideFactor * 1.5f);
                        }

                        currentX += dx * step;
                        currentY += dy * step;

                        SetCursorPos((int)Math.Round(currentX), (int)Math.Round(currentY));
                    }
                    else
                    {
                        currentX = targetX;
                        currentY = targetY;
                    }
                }

                Thread.Sleep(6); // ~166 Hz d'interpolation fluide continue
            }
        }

        static void Main(string[] args)
        {
            int screenWidth = GetSystemMetrics(SM_CXSCREEN);
            int screenHeight = GetSystemMetrics(SM_CYSCREEN);

            // Initialiser position réelle de la souris
            POINT currentPoint;
            if (GetCursorPos(out currentPoint))
            {
                currentX = currentPoint.X;
                currentY = currentPoint.Y;
                targetX = currentPoint.X;
                targetY = currentPoint.Y;
            }
            else
            {
                currentX = screenWidth / 2f;
                currentY = screenHeight / 2f;
                targetX = currentX;
                targetY = currentY;
            }

            // Démarrage du thread d'interpolation de glissement 166 Hz
            Thread glideThread = new Thread(GlideThreadLoop);
            glideThread.IsBackground = true;
            glideThread.Priority = ThreadPriority.AboveNormal;
            glideThread.Start();

            Console.WriteLine("READY " + screenWidth + " " + screenHeight);
            Console.Out.Flush();

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                try
                {
                    if (line.StartsWith("MOVE ") || line.StartsWith("GLIDE "))
                    {
                        string[] parts = line.Split(' ');
                        if (parts.Length >= 3)
                        {
                            int x = int.Parse(parts[1]);
                            int y = int.Parse(parts[2]);

                            // Si première assignation, synchroniser avec la position actuelle
                            if (!hasTarget)
                            {
                                POINT p;
                                if (GetCursorPos(out p))
                                {
                                    currentX = p.X;
                                    currentY = p.Y;
                                }
                                hasTarget = true;
                            }

                            targetX = x;
                            targetY = y;
                        }
                    }
                    else if (line.StartsWith("SNAP "))
                    {
                        string[] parts = line.Split(' ');
                        if (parts.Length >= 3)
                        {
                            int x = int.Parse(parts[1]);
                            int y = int.Parse(parts[2]);
                            currentX = x;
                            currentY = y;
                            targetX = x;
                            targetY = y;
                            hasTarget = true;
                            SetCursorPos(x, y);
                        }
                    }
                    else if (line.StartsWith("SET_GLIDE "))
                    {
                        string[] parts = line.Split(' ');
                        if (parts.Length >= 2)
                        {
                            float g;
                            if (float.TryParse(parts[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out g))
                            {
                                glideFactor = Math.Max(0.06f, Math.Min(1.0f, g));
                            }
                        }
                    }
                    else if (line == "RELEASE")
                    {
                        hasTarget = false;
                    }
                    else if (line == "CLICK LEFT" || line == "CLICK")
                    {
                        // Ancrer sur la cible actuelle lors du clic
                        currentX = targetX;
                        currentY = targetY;
                        SetCursorPos((int)Math.Round(currentX), (int)Math.Round(currentY));

                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(15);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    }
                    else if (line == "CLICK RIGHT")
                    {
                        currentX = targetX;
                        currentY = targetY;
                        SetCursorPos((int)Math.Round(currentX), (int)Math.Round(currentY));

                        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(15);
                        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    }
                    else if (line == "DOUBLE_CLICK")
                    {
                        currentX = targetX;
                        currentY = targetY;
                        SetCursorPos((int)Math.Round(currentX), (int)Math.Round(currentY));

                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        Thread.Sleep(50);
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    }
                    else if (line == "DOWN LEFT")
                    {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    }
                    else if (line == "UP LEFT")
                    {
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    }
                    else if (line == "DOWN RIGHT")
                    {
                        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                    }
                    else if (line == "UP RIGHT")
                    {
                        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    }
                    else if (line.StartsWith("SCROLL "))
                    {
                        string[] parts = line.Split(' ');
                        if (parts.Length >= 2)
                        {
                            int delta = int.Parse(parts[1]);
                            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, 0);
                        }
                    }
                    else if (line == "GET_SCREEN")
                    {
                        int w = GetSystemMetrics(SM_CXSCREEN);
                        int h = GetSystemMetrics(SM_CYSCREEN);
                        Console.WriteLine("SCREEN " + w + " " + h);
                        Console.Out.Flush();
                    }
                    else if (line == "QUIT")
                    {
                        isRunning = false;
                        break;
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("ERR " + ex.Message);
                }
            }
        }
    }
}
