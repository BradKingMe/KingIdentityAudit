param([string]$CollectorPath, [string]$TestDirectory)
$ErrorActionPreference = 'Stop'
$moduleDirectory = Join-Path $TestDirectory 'modules/ActiveDirectory'
New-Item -Path $moduleDirectory -ItemType Directory -Force | Out-Null
@'
function Get-ADForest { [CmdletBinding()]param(); [pscustomobject]@{ Domains=@('example.test'); RootDomain='example.test'; Name='example.test'; ForestMode='Windows2016Forest' } }
function Get-ADDomain { [CmdletBinding()]param($Identity,$Server); [pscustomobject]@{ DomainSID=[pscustomobject]@{Value='S-1-5-21-1-2-3'}; DNSRoot='example.test'; DomainMode='Windows2016Domain' } }
function Get-ADDefaultDomainPasswordPolicy { [CmdletBinding()]param($Identity,$Server); [pscustomobject]@{ MaxPasswordAge=[timespan]::FromDays(90); MinPasswordLength=14; PasswordHistoryCount=24; LockoutThreshold=10 } }
function Get-ADDomainController { [CmdletBinding()]param($Filter,$Server); [pscustomobject]@{ HostName='dc.example.test'; Site='Test'; OperatingSystem='Windows Server'; ComputerObjectDN='CN=DC,OU=Domain Controllers,DC=example,DC=test' } }
function Get-ADUser { [CmdletBinding()]param($Filter,$Server,$ResultSetSize,$Properties); [pscustomobject]@{ SamAccountName='alex'; ObjectGUID='11111111-1111-4111-8111-111111111111'; SID='S-1-5-21-1-2-3-1001'; UserPrincipalName='alex@example.test'; Enabled=$false; LastLogonDate=$null; PasswordNeverExpires=$false; ServicePrincipalName=@(); TrustedForDelegation=$false; AccountNotDelegated=$false; adminCount=$null } }
function Get-ADComputer { [CmdletBinding()]param($Filter,$Server,$ResultSetSize,$Properties); [pscustomobject]@{ SamAccountName='DC$'; ObjectGUID='22222222-2222-4222-8222-222222222222'; SID='S-1-5-21-1-2-3-1002'; DistinguishedName='CN=DC,OU=Domain Controllers,DC=example,DC=test'; Enabled=$true; LastLogonDate=$null; ServicePrincipalName=@('HOST/dc.example.test'); TrustedForDelegation=$true; AccountNotDelegated=$false; adminCount=$null } }
function Get-ADGroup { [CmdletBinding()]param($Identity,$Server); [pscustomobject]@{ DistinguishedName="CN=$Identity,DC=example,DC=test"; Name="Group-$Identity" } }
function Get-ADGroupMember { [CmdletBinding()]param($Identity,[switch]$Recursive,$Server); [pscustomobject]@{ SamAccountName='alex'; Name='alex'; ObjectClass='user'; ObjectGUID='33333333-3333-4333-8333-333333333333'; SID='S-1-5-21-4-5-6-1001' } }
function Get-ADReplicationFailure { [CmdletBinding()]param($Target,$Scope) }
Export-ModuleMember -Function Get-AD*
'@ | Set-Content -LiteralPath (Join-Path $moduleDirectory 'ActiveDirectory.psm1') -Encoding utf8
$env:PSModulePath = "$(Join-Path $TestDirectory 'modules')$([System.IO.Path]::PathSeparator)$env:PSModulePath"
$snapshotPath = Join-Path $TestDirectory 'snapshot.json'
& $CollectorPath -OutputPath $snapshotPath
$before = [System.IO.File]::ReadAllText($snapshotPath)
$rejected = $false
try { & $CollectorPath -OutputPath $snapshotPath } catch { $rejected = $_.Exception.Message -like '*already exists*' }
if (-not $rejected -or [System.IO.File]::ReadAllText($snapshotPath) -ne $before) { throw 'Existing output was not protected.' }
Write-Output 'Collector mock check passed'
