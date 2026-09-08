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

        static void Main(string[] args)
        {
            int screenWidth = GetSystemMetrics(SM_CXSCREEN);
            int screenHeight = GetSystemMetrics(SM_CYSCREEN);

            Console.WriteLine("READY " + screenWidth + " " + screenHeight);
            Console.Out.Flush();

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                try
                {
                    if (line.StartsWith("MOVE ") || line.StartsWith("GLIDE ") || line.StartsWith("SNAP "))
                    {
                        string[] parts = line.Split(' ');
                        if (parts.Length >= 3)
                        {
                            int x = int.Parse(parts[1]);
                            int y = int.Parse(parts[2]);
                            SetCursorPos(x, y);
                        }
                    }
                    else if (line.StartsWith("SET_GLIDE "))
                    {
                        // No-op pour compatibilité
                    }
                    else if (line == "RELEASE")
                    {
                        // No-op
                    }
                    else if (line == "CLICK LEFT" || line == "CLICK")
                    {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(15);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    }
                    else if (line == "CLICK RIGHT")
                    {
                        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(15);
                        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    }
                    else if (line == "DOUBLE_CLICK")
                    {
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
