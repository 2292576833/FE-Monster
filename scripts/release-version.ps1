function Get-FeMonsterReleaseVersion {
  param([Parameter(Mandatory)][object]$Metadata)

  $packageVersion = [string]$Metadata.version
  $identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
  $pattern = '^(?<major>0|[1-9][0-9]*)\.(?<minor>0|[1-9][0-9]*)\.(?<patch>0|[1-9][0-9]*)(?:-(?<prerelease>' + $identifier + '(?:\.' + $identifier + ')*))?$'
  $match = [regex]::Match($packageVersion, $pattern)
  if (!$match.Success) {
    throw "package.json contains an invalid release version: $packageVersion"
  }
  foreach ($component in @('major', 'minor', 'patch')) {
    [uint16]$number = 0
    if (![uint16]::TryParse($match.Groups[$component].Value, [ref]$number) -or $number -gt 65534) {
      throw "Release version cannot be represented by Windows assembly metadata: $packageVersion"
    }
  }

  $numericVersion = '{0}.{1}.{2}' -f $match.Groups['major'].Value, $match.Groups['minor'].Value, $match.Groups['patch'].Value
  $displayVersion = [string]$Metadata.displayVersion
  if ([string]::IsNullOrEmpty($displayVersion)) { $displayVersion = $packageVersion }
  $compactVersion = $numericVersion + $match.Groups['prerelease'].Value
  if ($displayVersion -cne $packageVersion -and $displayVersion -cne $compactVersion) {
    throw "package.json displayVersion '$displayVersion' does not match release version '$packageVersion'."
  }
  return [pscustomobject]@{
    PackageVersion = $packageVersion
    DisplayVersion = $displayVersion
    WindowsVersion = "$numericVersion.0"
  }
}
