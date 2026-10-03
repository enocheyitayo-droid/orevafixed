$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:OWNER_EMAIL = Read-Host 'Your owner sign-in email'
$secureStorePassword = Read-Host 'Choose a unique password (at least 14 characters)' -AsSecureString
try {
  $env:OWNER_PASSWORD = [System.Net.NetworkCredential]::new('', $secureStorePassword).Password
  node --env-file-if-exists=.env owner.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Owner setup failed. Check the message above.' }
} finally {
  Remove-Item Env:OWNER_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:OWNER_EMAIL -ErrorAction SilentlyContinue
  $secureStorePassword.Dispose()
}
