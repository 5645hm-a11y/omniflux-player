# מד עוצמה לכל תהליך שמשמיע צליל, דרך Core Audio של Windows
param([int]$Seconds = 40)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int NotImpl1(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface); }
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int NotImpl1(); int NotImpl2(); int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum); }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { int GetCount(out int SessionCount); int GetSession(int SessionCount, out IAudioSessionControl2 Session); }
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int GetState(out int s); int GetDisplayName(out IntPtr p); int SetDisplayName(IntPtr a, IntPtr b); int GetIconPath(out IntPtr p); int SetIconPath(IntPtr a, IntPtr b);
  int GetGroupingParam(out Guid g); int SetGroupingParam(IntPtr a, IntPtr b); int RegisterAudioSessionNotification(IntPtr a); int UnregisterAudioSessionNotification(IntPtr a);
  int GetSessionIdentifier(out IntPtr p); int GetSessionInstanceIdentifier(out IntPtr p); int GetProcessId(out uint pid); }
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation { int GetPeakValue(out float pfPeak); }

public static class Peak {
  public static string Read() {
    var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
    IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioSessionManager2).GUID; object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    var mgr = (IAudioSessionManager2)o; IAudioSessionEnumerator se; mgr.GetSessionEnumerator(out se);
    int n; se.GetCount(out n); var parts = new List<string>();
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 s; se.GetSession(i, out s); uint pid; s.GetProcessId(out pid); int st; s.GetState(out st);
      float pk; ((IAudioMeterInformation)s).GetPeakValue(out pk);
      string name = "?"; try { name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
      if (st == 1 || pk > 0) parts.Add(name + ":" + pid + "=" + pk.ToString("0.000"));
    }
    return string.Join("  ", parts);
  }
}
"@
for ($i = 0; $i -lt $Seconds; $i++) {
  "{0}  {1}" -f (Get-Date -Format HH:mm:ss), [Peak]::Read()
  Start-Sleep -Milliseconds 1000
}
