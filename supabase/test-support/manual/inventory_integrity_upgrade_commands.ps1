function Get-InventoryUpgradeSupabaseCommands {
  param(
    [Parameter(Mandatory)] [string] $WorktreePath,
    [Parameter(Mandatory)] [string] $PreviousVersion
  )

  $resolvedWorktreePath = (Resolve-Path -LiteralPath $WorktreePath).Path
  return [ordered]@{
    Reset = [string[]] @(
      'supabase', '--workdir', $resolvedWorktreePath,
      'db', 'reset', '--local', '--version', $PreviousVersion, '--no-seed'
    )
    Migrate = [string[]] @(
      'supabase', '--workdir', $resolvedWorktreePath,
      'migration', 'up', '--local'
    )
  }
}
