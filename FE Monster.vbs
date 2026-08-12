Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
script = root & "\scripts\launch-fe-monster.ps1"
mainExecutable = root & "\native\windows\build\winforms\FE Monster.exe"
javaJar = root & "\out\fe-monster-java.jar"
args = ""

For i = 0 To WScript.Arguments.Count - 1
  args = args & " " & Quote(WScript.Arguments(i))
Next

If fso.FileExists(mainExecutable) And fso.FileExists(javaJar) Then
  shell.Run Quote(mainExecutable) & args, 1, False
Else
  command = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Quote(script) & " -Root " & Quote(root) & args
  shell.Run command, 0, False
End If

Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
