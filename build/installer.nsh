; נוצר על ידי tools/gen-installer-nsh.mjs — אין לערוך ידנית.
; המקור הוא fileAssociations ב-electron-builder.yml.

!define OMNI_BACKUP_KEY "Software\OmniFlux Player\AssocBackup"

!macro customInit
  ; --- הסרת "בית הקולנוע", אם היא מותקנת ---
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\11905866-38ea-515c-805e-83a90b0ab429" "UninstallString"
  ${If} $R0 != ""
    ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\11905866-38ea-515c-805e-83a90b0ab429" "InstallLocation"
    ${If} $R1 != ""
      ExecWait '"$R0" /S _?=$R1'
    ${Else}
      ExecWait '"$R0" /S'
    ${EndIf}
  ${EndIf}
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{11905866-38ea-515c-805e-83a90b0ab429}" "UninstallString"
  ${If} $R0 != ""
    ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{11905866-38ea-515c-805e-83a90b0ab429}" "InstallLocation"
    ${If} $R1 != ""
      ExecWait '"$R0" /S _?=$R1'
    ${Else}
      ExecWait '"$R0" /S'
    ${EndIf}
  ${EndIf}
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\11905866-38ea-515c-805e-83a90b0ab429" "UninstallString"
  ${If} $R0 != ""
    ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\11905866-38ea-515c-805e-83a90b0ab429" "InstallLocation"
    ${If} $R1 != ""
      ExecWait '"$R0" /S _?=$R1'
    ${Else}
      ExecWait '"$R0" /S'
    ${EndIf}
  ${EndIf}
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{11905866-38ea-515c-805e-83a90b0ab429}" "UninstallString"
  ${If} $R0 != ""
    ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{11905866-38ea-515c-805e-83a90b0ab429}" "InstallLocation"
    ${If} $R1 != ""
      ExecWait '"$R0" /S _?=$R1'
    ${Else}
      ExecWait '"$R0" /S'
    ${EndIf}
  ${EndIf}

  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.mp4" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mp4" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.mkv" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mkv" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.avi" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "avi" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.mov" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mov" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.webm" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "webm" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.m4v" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "m4v" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.ts" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "ts" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.m2ts" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "m2ts" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.flv" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "flv" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.wmv" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "wmv" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.mpg" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mpg" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.mpeg" ""
  ${If} $0 != "OmniFlux Video"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mpeg" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.mp3" ""
  ${If} $0 != "OmniFlux Audio"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mp3" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.flac" ""
  ${If} $0 != "OmniFlux Audio"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "flac" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.m4a" ""
  ${If} $0 != "OmniFlux Audio"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "m4a" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.opus" ""
  ${If} $0 != "OmniFlux Audio"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "opus" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.ogg" ""
  ${If} $0 != "OmniFlux Audio"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "ogg" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.wav" ""
  ${If} $0 != "OmniFlux Audio"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "wav" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.aac" ""
  ${If} $0 != "OmniFlux Audio"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "aac" "$0"
  ${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.wma" ""
  ${If} $0 != "OmniFlux Audio"
  ${AndIf} $0 != ""
    WriteRegStr SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "wma" "$0"
  ${EndIf}
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities" "ApplicationName" "OmniFlux Player"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities" "ApplicationDescription" "OmniFlux Player"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".mp4" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".mkv" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".avi" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".mov" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".webm" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".m4v" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".ts" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".m2ts" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".flv" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".wmv" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".mpg" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".mpeg" "OmniFlux Video"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".mp3" "OmniFlux Audio"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".flac" "OmniFlux Audio"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".m4a" "OmniFlux Audio"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".opus" "OmniFlux Audio"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".ogg" "OmniFlux Audio"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".wav" "OmniFlux Audio"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".aac" "OmniFlux Audio"
  WriteRegStr SHELL_CONTEXT "Software\OmniFlux Player\Capabilities\FileAssociations" ".wma" "OmniFlux Audio"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "OmniFlux Player" "Software\OmniFlux Player\Capabilities"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mp4"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.mp4" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.mp4" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.mp4" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mkv"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.mkv" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.mkv" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.mkv" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "avi"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.avi" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.avi" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.avi" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mov"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.mov" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.mov" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.mov" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "webm"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.webm" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.webm" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.webm" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "m4v"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.m4v" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.m4v" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.m4v" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "ts"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.ts" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.ts" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.ts" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "m2ts"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.m2ts" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.m2ts" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.m2ts" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "flv"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.flv" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.flv" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.flv" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "wmv"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.wmv" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.wmv" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.wmv" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mpg"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.mpg" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.mpg" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.mpg" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mpeg"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.mpeg" ""
    ${If} $1 == "OmniFlux Video"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.mpeg" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.mpeg" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "mp3"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.mp3" ""
    ${If} $1 == "OmniFlux Audio"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.mp3" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.mp3" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "flac"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.flac" ""
    ${If} $1 == "OmniFlux Audio"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.flac" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.flac" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "m4a"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.m4a" ""
    ${If} $1 == "OmniFlux Audio"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.m4a" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.m4a" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "opus"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.opus" ""
    ${If} $1 == "OmniFlux Audio"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.opus" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.opus" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "ogg"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.ogg" ""
    ${If} $1 == "OmniFlux Audio"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.ogg" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.ogg" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "wav"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.wav" ""
    ${If} $1 == "OmniFlux Audio"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.wav" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.wav" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "aac"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.aac" ""
    ${If} $1 == "OmniFlux Audio"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.aac" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.aac" ""
      ${EndIf}
    ${EndIf}
    ReadRegStr $0 SHELL_CONTEXT "${OMNI_BACKUP_KEY}" "wma"
    ReadRegStr $1 SHELL_CONTEXT "Software\Classes\.wma" ""
    ${If} $1 == "OmniFlux Audio"
      ${If} $0 != ""
        WriteRegStr SHELL_CONTEXT "Software\Classes\.wma" "" "$0"
      ${Else}
        DeleteRegValue SHELL_CONTEXT "Software\Classes\.wma" ""
      ${EndIf}
    ${EndIf}
    DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "OmniFlux Player"
    DeleteRegKey SHELL_CONTEXT "Software\OmniFlux Player"
  ${endIf}
!macroend
