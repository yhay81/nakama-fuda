[CmdletBinding()]
param(
    [switch]$Local
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute nakama-fuda $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) {
    throw "D1 metrics query failed with exit code $LASTEXITCODE"
}

$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) {
    throw "D1 metrics query returned no result"
}

function Get-Percent {
    param([int]$Numerator, [int]$Denominator)
    if ($Denominator -eq 0) { return $null }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Visitors = [int]$Row.visitors
$Searchers = [int]$Row.searchers
$Creators = [int]$Row.creators
$Viewers = [int]$Row.viewers
$OutboundUsers = [int]$Row.outbound_users

[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "nakama-fuda"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        visitors = $Visitors
        searchers = $Searchers
        creators = $Creators
        viewers = $Viewers
        outbound_users = $OutboundUsers
        editors = [int]$Row.editors
        closers = [int]$Row.closers
        returned = [int]$Row.returned
        reporters = [int]$Row.reporters
        deleters = [int]$Row.deleters
    }
    depth = [ordered]@{
        active_listings = [int]$Row.active_listings
        closed_listings = [int]$Row.closed_listings
        hidden_listings = [int]$Row.hidden_listings
        listings_with_three_viewers = [int]$Row.listings_with_three_viewers
        listings_with_two_outbound_users = [int]$Row.listings_with_two_outbound_users
        qualified_listings = [int]$Row.qualified_listings
        listings_updated_later = [int]$Row.listings_updated_later
    }
    rates = [ordered]@{
        create_percent = Get-Percent $Creators $Visitors
        search_to_view_percent = Get-Percent $Viewers $Searchers
        view_to_outbound_percent = Get-Percent $OutboundUsers $Viewers
    }
} | ConvertTo-Json -Depth 4
