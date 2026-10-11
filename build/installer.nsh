!macro customHeader
  !define /redef COMPANY_NAME "HKDEVS"
!macroend

!macro customInit
  ${if} $installMode == "CurrentUser"
    ${if} $perUserInstallationFolder == ""
      StrCpy $INSTDIR "$LOCALAPPDATA\Programs\HKDEVS\Pharmco"
    ${endif}
  ${else}
    ${if} $perMachineInstallationFolder == ""
      !ifdef APP_64
        ${if} ${RunningX64}
          StrCpy $INSTDIR "$PROGRAMFILES64\HKDEVS\Pharmco"
        ${else}
          StrCpy $INSTDIR "$PROGRAMFILES\HKDEVS\Pharmco"
        ${endif}
      !else
        StrCpy $INSTDIR "$PROGRAMFILES\HKDEVS\Pharmco"
      !endif
    ${endif}
  ${endif}
!macroend
