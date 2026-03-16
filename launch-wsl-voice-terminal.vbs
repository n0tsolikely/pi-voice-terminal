Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcherPath = scriptDir & "\launch-pi-voice-terminal.bat"
command = Chr(34) & launcherPath & Chr(34) & " --run-hidden"

shell.Run command, 0, False
