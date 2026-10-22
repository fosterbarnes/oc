#ifndef AppVersion
#define AppVersion "0.0.0"
#endif
#ifndef AppPublisher
#define AppPublisher "fosterbarnes"
#endif
#ifndef AppURL
#define AppURL "https://github.com/fosterbarnes/oc"
#endif
#ifndef SetupIconFile
#define SetupIconFile "..\src\.res\icon.ico"
#endif
#ifndef WizardImageFile
#define WizardImageFile "images\installer-wizard-large.png"
#endif
#ifndef WizardSmallImageFile
#define WizardSmallImageFile "images\installer-wizard-small.png"
#endif
#ifndef LicenseFile
#define LicenseFile "..\LICENSE"
#endif
#ifndef OcBin
#define OcBin "..\src\packages\opencode\dist\opencode-windows-x64\bin"
#endif
#ifndef NativeBin
#define NativeBin "..\src\packages\opencode\dist\opencode-native-windows-x64\bin"
#endif
#ifndef OcSetupDir
#define OcSetupDir "publish"
#endif

[Setup]
AppId={{C5076603-A282-4FFC-BE1F-A691FECE2F60}
AppName=oc
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
DefaultDirName={code:DefaultAppDir}
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\oc.exe
WizardStyle=modern dark
WizardBackColor=#1B1B1B
WizardImageBackColor=#1B1B1B
WizardSmallImageBackColor=#1B1B1B
SetupIconFile={#SetupIconFile}
WizardImageFile={#WizardImageFile}
WizardSmallImageFile={#WizardSmallImageFile}
LicenseFile={#LicenseFile}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ChangesEnvironment=yes
OutputDir=Output
OutputBaseFilename=oc_v{#AppVersion}_windows-x64-setup
; One LZMA stream with a dictionary bigger than one Bun binary (~225 MB): opencode.exe then
; compresses against oc.exe's identical runtime instead of storing it twice. Setup needs about
; the dictionary size in RAM while extracting.
Compression=lzma2/max
SolidCompression=yes
LZMADictionarySize=262144
LZMAUseSeparateProcess=yes

[Tasks]
Name: startmenuicon; Description: "Create a Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; oc.exe and opencode.exe stay adjacent so the solid stream finds their shared runtime.
Source: "{#OcBin}\oc.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#NativeBin}\opencode.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#OcBin}\cursor-runtime\*"; DestDir: "{app}\cursor-runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
; ocSetup.exe plus the WPF native DLLs published next to it.
Source: "{#OcSetupDir}\*"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#LicenseFile}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\oc"; Filename: "{app}\oc.exe"; Tasks: startmenuicon
Name: "{autoprograms}\oc dependencies"; Filename: "{app}\ocSetup.exe"; Tasks: startmenuicon
Name: "{autodesktop}\oc"; Filename: "{app}\oc.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ocSetup.exe"; Description: "Set up dependencies"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\occ.exe"
Type: files; Name: "{app}\es.exe"

[Code]
const
  EnvironmentKey = 'Environment';
  ShutdownArgs = 'oc --shutdown-all';

// Hard links need the Win32 call; Inno has no built-in for them.
function CreateHardLinkW(lpFileName, lpExistingFileName: String; lpSecurityAttributes: Integer): Boolean;
external 'CreateHardLinkW@kernel32.dll stdcall';

// First install only (upgrades reuse the previous folder): adopt an oc already on PATH so setup
// replaces it instead of adding a second install behind it. occ.exe rules out other oc.exe tools.
// Same rule as resolveInstallDir in .scripts\scriptHelper.ps1.
function DefaultAppDir(Param: String): String;
var
  Occ: String;
begin
  Occ := FileSearch('occ.exe', GetEnv('PATH'));
  if (Occ <> '') and FileExists(ExtractFilePath(Occ) + 'oc.exe') then
    Result := RemoveBackslashUnlessRoot(ExtractFilePath(Occ))
  else
    Result := ExpandConstant('{localappdata}\Programs\oc');
end;

procedure InitializeWizard;
begin
  WizardForm.LicenseAcceptedRadio.Checked := True;
end;

// Splits a ';'-separated PATH value and drops empty entries.
function SplitPath(PathValue: String): TArrayOfString;
var
  Rest, Entry: String;
  P, Count: Integer;
begin
  SetArrayLength(Result, 0);
  Rest := PathValue + ';';
  while Rest <> '' do
  begin
    P := Pos(';', Rest);
    Entry := Copy(Rest, 1, P - 1);
    Delete(Rest, 1, P);
    if Entry <> '' then
    begin
      Count := GetArrayLength(Result);
      SetArrayLength(Result, Count + 1);
      Result[Count] := Entry;
    end;
  end;
end;

// Case-insensitive, trailing backslash ignored, as in .scripts\install.ps1.
function NormalizePathEntry(Entry: String): String;
begin
  Result := Lowercase(Entry);
  while (Result <> '') and (Result[Length(Result)] = '\') do
    Delete(Result, Length(Result), 1);
end;

function PathHasEntry(PathValue, Dir: String): Boolean;
var
  Parts: TArrayOfString;
  I: Integer;
begin
  Result := False;
  Parts := SplitPath(PathValue);
  for I := 0 to GetArrayLength(Parts) - 1 do
    if NormalizePathEntry(Parts[I]) = NormalizePathEntry(Dir) then Result := True;
end;

// Appends to the raw value so existing entries (and any %VAR% references) stay as they were.
function AddPathEntry(PathValue, Dir: String): String;
begin
  if PathValue = '' then Result := Dir
  else if Copy(PathValue, Length(PathValue), 1) = ';' then Result := PathValue + Dir
  else Result := PathValue + ';' + Dir;
end;

function RemovePathEntry(PathValue, Dir: String): String;
var
  Parts: TArrayOfString;
  I: Integer;
begin
  Result := '';
  Parts := SplitPath(PathValue);
  for I := 0 to GetArrayLength(Parts) - 1 do
  begin
    if NormalizePathEntry(Parts[I]) = NormalizePathEntry(Dir) then Continue;
    if Result = '' then Result := Parts[I]
    else Result := Result + ';' + Parts[I];
  end;
end;

// Closes oc windows and hosts from this install folder so their files can be replaced.
// The exit code is only logged: a failed shutdown should not block the install.
procedure ShutdownOc;
var
  OcExe: String;
  ResultCode: Integer;
begin
  OcExe := ExpandConstant('{app}\oc.exe');
  if not FileExists(OcExe) then Exit;
  if Exec(OcExe, ShutdownArgs, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Log(Format('oc --shutdown-all exited with code %d', [ResultCode]))
  else
    Log('oc --shutdown-all could not be started.');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not FileExists(ExpandConstant('{app}\oc.exe')) then Exit;
  if not WizardSilent then
    if MsgBox('Open oc windows will be closed to finish the install.', mbConfirmation, MB_OKCANCEL) = IDCANCEL then
    begin
      Result := 'Install cancelled. Close your oc windows, then run setup again.';
      Exit;
    end;
  ShutdownOc;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  OcExe, OccExe, AppDir, UserPath: String;
begin
  if CurStep <> ssPostInstall then Exit;
  OcExe := ExpandConstant('{app}\oc.exe');
  OccExe := ExpandConstant('{app}\occ.exe');
  // Installing replaces oc.exe with a new file, which leaves the old occ.exe link stale, so relink it.
  if FileExists(OccExe) then DeleteFile(OccExe);
  if CreateHardLinkW(OccExe, OcExe, 0) then
    Log('Created occ.exe hard link.')
  else
  begin
    Log('CreateHardLinkW failed; copying oc.exe to occ.exe.');
    if not CopyFile(OcExe, OccExe, False) then Log('Could not copy oc.exe to occ.exe.');
  end;

  AppDir := ExpandConstant('{app}');
  UserPath := '';
  RegQueryStringValue(HKCU, EnvironmentKey, 'Path', UserPath);
  if not PathHasEntry(UserPath, AppDir) then
    RegWriteExpandStringValue(HKCU, EnvironmentKey, 'Path', AddPathEntry(UserPath, AppDir));
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  AppDir, UserPath: String;
begin
  if CurUninstallStep = usUninstall then ShutdownOc;
  if CurUninstallStep <> usPostUninstall then Exit;
  AppDir := ExpandConstant('{app}');
  UserPath := '';
  RegQueryStringValue(HKCU, EnvironmentKey, 'Path', UserPath);
  if PathHasEntry(UserPath, AppDir) then
    RegWriteExpandStringValue(HKCU, EnvironmentKey, 'Path', RemovePathEntry(UserPath, AppDir));
end;
