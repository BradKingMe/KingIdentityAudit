#Requires -Modules ActiveDirectory
# KingIdentity AD DS Collector 0.1.0
# This script only issues Get-AD* directory queries and writes a local JSON file.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputPath,

    [ValidateNotNullOrEmpty()]
    [string[]]$Domain,

    [ValidateRange(1, 3650)]
    [int]$InactiveAccountDays = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory -ErrorAction Stop

function ConvertTo-IsoTimestamp {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) { return $null }
    try {
        return ([datetime]$Value).ToUniversalTime().ToString('o')
    }
    catch {
        return $null
    }
}

function Get-BooleanValue {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) { return $false }
    return [bool]$Value
}

$warnings = [System.Collections.Generic.List[string]]::new()
$forest = Get-ADForest -ErrorAction Stop
$selectedDomains = @($forest.Domains)
if ($PSBoundParameters.ContainsKey('Domain')) {
    $unknownDomains = @($Domain | Where-Object { $forest.Domains -notcontains $_ })
    if ($unknownDomains.Count -gt 0) {
        throw "Domain selection includes names outside the current forest: $($unknownDomains -join ', ')"
    }
    $selectedDomains = @($forest.Domains | Where-Object { $Domain -contains $_ })
}
$domainReports = [System.Collections.Generic.List[object]]::new()

foreach ($domainName in $selectedDomains) {
    try {
        $domain = Get-ADDomain -Identity $domainName -Server $domainName -ErrorAction Stop
    }
    catch {
        $warnings.Add("Could not read domain metadata for ${domainName}: $($_.Exception.Message)")
        continue
    }

    $policy = $null
    try {
        $rawPolicy = Get-ADDefaultDomainPasswordPolicy -Identity $domainName -Server $domainName -ErrorAction Stop
        $maxPasswordAgeDays = $null
        if ($null -ne $rawPolicy.MaxPasswordAge) {
            $maxPasswordAgeDays = [math]::Round($rawPolicy.MaxPasswordAge.TotalDays, 2)
        }
        $policy = [ordered]@{
            minPasswordLength = [int]$rawPolicy.MinPasswordLength
            maxPasswordAgeDays = $maxPasswordAgeDays
            passwordHistoryCount = [int]$rawPolicy.PasswordHistoryCount
            lockoutThreshold = [int]$rawPolicy.LockoutThreshold
        }
    }
    catch {
        $warnings.Add("Could not read the default password policy for ${domainName}: $($_.Exception.Message)")
    }

    $domainControllers = @()
    try {
        $domainControllers = @(
            Get-ADDomainController -Filter * -Server $domainName -ErrorAction Stop |
                ForEach-Object {
                    [ordered]@{
                        hostName = [string]$_.HostName
                        site = [string]$_.Site
                        operatingSystem = [string]$_.OperatingSystem
                    }
                }
        )
    }
    catch {
        $warnings.Add("Could not enumerate domain controllers for ${domainName}: $($_.Exception.Message)")
    }

    $principals = [System.Collections.Generic.List[object]]::new()
    try {
        $users = @(Get-ADUser -Filter * -Server $domainName -ResultSetSize $null -Properties @(
            'Enabled', 'LastLogonDate', 'PasswordNeverExpires', 'ServicePrincipalName',
            'TrustedForDelegation', 'AccountNotDelegated', 'adminCount'
        ) -ErrorAction Stop)
        foreach ($user in $users) {
            $principals.Add([ordered]@{
                accountName = [string]$user.SamAccountName
                objectClass = 'user'
                objectGuid = [string]$user.ObjectGUID
                objectSid = [string]$user.SID
                userPrincipalName = [string]$user.UserPrincipalName
                enabled = [bool]$user.Enabled
                lastLogonDate = ConvertTo-IsoTimestamp $user.LastLogonDate
                passwordNeverExpires = [bool]$user.PasswordNeverExpires
                servicePrincipalNames = @($user.ServicePrincipalName | Where-Object { $_ })
                trustedForDelegation = Get-BooleanValue $user.TrustedForDelegation
                accountNotDelegated = Get-BooleanValue $user.AccountNotDelegated
                adminCount = Get-BooleanValue $user.adminCount
            })
        }
    }
    catch {
        $warnings.Add("Could not enumerate users for ${domainName}: $($_.Exception.Message)")
    }

    try {
        $computers = @(Get-ADComputer -Filter * -Server $domainName -ResultSetSize $null -Properties @(
            'Enabled', 'LastLogonDate', 'OperatingSystem', 'OperatingSystemVersion',
            'ServicePrincipalName', 'TrustedForDelegation', 'AccountNotDelegated', 'adminCount'
        ) -ErrorAction Stop)
        foreach ($computer in $computers) {
            $principals.Add([ordered]@{
                accountName = [string]$computer.SamAccountName
                objectClass = 'computer'
                objectGuid = [string]$computer.ObjectGUID
                objectSid = [string]$computer.SID
                userPrincipalName = $null
                enabled = [bool]$computer.Enabled
                lastLogonDate = ConvertTo-IsoTimestamp $computer.LastLogonDate
                passwordNeverExpires = $null
                servicePrincipalNames = @($computer.ServicePrincipalName | Where-Object { $_ })
                trustedForDelegation = Get-BooleanValue $computer.TrustedForDelegation
                accountNotDelegated = Get-BooleanValue $computer.AccountNotDelegated
                adminCount = Get-BooleanValue $computer.adminCount
            })
        }
    }
    catch {
        $warnings.Add("Could not enumerate computers for ${domainName}: $($_.Exception.Message)")
    }

    $groupTargets = [System.Collections.Generic.List[object]]::new()
    $domainSid = $domain.DomainSID.Value
    $groupTargets.Add([pscustomobject]@{ Name = 'Domain Admins'; SID = "${domainSid}-512"; Scope = $domainName })
    $groupTargets.Add([pscustomobject]@{ Name = 'Administrators'; SID = 'S-1-5-32-544'; Scope = $domainName })
    $groupTargets.Add([pscustomobject]@{ Name = 'Account Operators'; SID = 'S-1-5-32-548'; Scope = $domainName })
    $groupTargets.Add([pscustomobject]@{ Name = 'Backup Operators'; SID = 'S-1-5-32-551'; Scope = $domainName })
    if ($domainName -ieq $forest.RootDomain) {
        $groupTargets.Add([pscustomobject]@{ Name = 'Schema Admins'; SID = "${domainSid}-518"; Scope = $domainName })
        $groupTargets.Add([pscustomobject]@{ Name = 'Enterprise Admins'; SID = "${domainSid}-519"; Scope = $domainName })
    }

    $privilegedGroups = [System.Collections.Generic.List[object]]::new()
    foreach ($target in $groupTargets) {
        try {
            $group = Get-ADGroup -Identity $target.SID -Server $target.Scope -ErrorAction Stop
            $members = @(
                Get-ADGroupMember -Identity $group.DistinguishedName -Recursive -Server $target.Scope -ErrorAction Stop |
                    ForEach-Object {
                        [ordered]@{
                            accountName = [string]$(if ($_.SamAccountName) { $_.SamAccountName } else { $_.Name })
                            objectClass = [string]$_.ObjectClass
                            enabled = $null
                        }
                    }
            )
            foreach ($member in $members) {
                if ($member.objectClass -eq 'user') {
                    $matchedUser = $principals | Where-Object { $_.accountName -eq $member.accountName -and $_.objectClass -eq 'user' } | Select-Object -First 1
                    if ($null -ne $matchedUser) { $member.enabled = $matchedUser.enabled }
                }
            }
            $privilegedGroups.Add([ordered]@{
                name = [string]$group.Name
                scope = [string]$target.Scope
                members = @($members)
            })
        }
        catch {
            $warnings.Add("Could not read $($target.Name) membership in $($target.Scope): $($_.Exception.Message)")
        }
    }

    $replicationFailures = @()
    try {
        $replicationFailures = @(
            Get-ADReplicationFailure -Target $domainName -Scope Domain -ErrorAction Stop |
                ForEach-Object {
                    [ordered]@{
                        server = [string]$_.Server
                        partner = [string]$_.Partner
                        firstFailureTime = ConvertTo-IsoTimestamp $_.FirstFailureTime
                        failureCount = [int]$_.FailureCount
                        lastError = [string]$_.LastError
                    }
                }
        )
    }
    catch {
        $warnings.Add("Could not read replication failures for ${domainName}: $($_.Exception.Message)")
    }

    $domainReports.Add([ordered]@{
        name = [string]$domain.DNSRoot
        domainMode = [string]$domain.DomainMode
        passwordPolicy = $policy
        domainControllers = @($domainControllers)
        principals = @($principals)
        privilegedGroups = @($privilegedGroups)
        replicationFailures = @($replicationFailures)
    })
}

$fullOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($fullOutputPath)
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
    throw "Output directory does not exist: $outputDirectory"
}
if (Test-Path -LiteralPath $fullOutputPath) {
    throw "Output file already exists. Choose a new path: $fullOutputPath"
}
if ($domainReports.Count -eq 0) {
    throw 'No domain data was collected. Review module access and collection warnings before retrying.'
}

$report = [ordered]@{
    format = 'kingidentity.directory-snapshot'
    schemaVersion = 1
    capturedAt = [datetime]::UtcNow.ToString('o')
    collector = [ordered]@{
        name = 'KingIdentity AD DS Collector'
        version = '0.1.0'
        inactiveAccountDays = $InactiveAccountDays
        includedDomains = @($selectedDomains)
        mode = 'read-only'
    }
    forest = [ordered]@{
        name = [string]$forest.Name
        rootDomain = [string]$forest.RootDomain
        domains = @($forest.Domains)
        forestMode = [string]$forest.ForestMode
    }
    domains = @($domainReports)
    collectionWarnings = @($warnings)
}

$json = $report | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($fullOutputPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Snapshot written locally to $fullOutputPath"
