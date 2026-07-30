[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_listings.sql"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$ServiceWorkerPath = Join-Path $RepoRoot "public\sw.js"
$PublicDirectory = Join-Path $RepoRoot "public"

$RequiredFiles = @(
    ".github\workflows\ci.yml",
    ".dev.vars.example",
    "DECISIONS.md",
    "EXPERIMENT.md",
    "METRICS.md",
    "PRIVACY.md",
    "README.md",
    "SECURITY.md",
    "STACK.md",
    "ops\product-metrics.ps1",
    "ops\product-metrics.sql",
    "ops\submit-indexnow.ps1",
    "public\app.js",
    "public\common.js",
    "public\directory.js",
    "public\edit.js",
    "public\favicon.png",
    "public\listing.js",
    "public\manifest.webmanifest",
    "public\og.png",
    "public\robots.txt",
    "public\styles.css",
    "public\sw.js"
)
foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $RelativePath))) {
        throw "Missing required release file: $RelativePath"
    }
}

$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath
$ServiceWorker = Get-Content -Raw -LiteralPath $ServiceWorkerPath
$Scripts = @(
    Get-Content -Raw (Join-Path $PublicDirectory "app.js")
    Get-Content -Raw (Join-Path $PublicDirectory "common.js")
    Get-Content -Raw (Join-Path $PublicDirectory "directory.js")
    Get-Content -Raw (Join-Path $PublicDirectory "edit.js")
    Get-Content -Raw (Join-Path $PublicDirectory "listing.js")
) -join "`n"
$ProductSurface = @($Worker, $Scripts) -join "`n"

foreach ($VisualClass in @(
    'class="recruit-desk"',
    'class="seat seat-open"',
    'class="condition-card card-game"',
    'class="detail-table"',
    'class="listing-card"',
    'class="demo-board"'
)) {
    if (-not $Worker.Contains($VisualClass)) {
        throw "Missing product visual: $VisualClass"
    }
}
if ($ProductSurface -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性') {
    throw "Research copy must not appear on the product surface"
}
if ($Styles -match '(?s)h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px' -or
    -not $Styles.Contains("clamp(1.75rem, 3.2vw, 2rem)")) {
    throw "Primary heading must remain at or below 32px"
}
if ($ProductSurface -match '(?i)innerHTML|eval\(|new Function') {
    throw "User content must not be interpreted as markup or code"
}
if ($Scripts -match 'fetch\(\s*["'']https?://') {
    throw "Browser scripts must not call third-party endpoints"
}
foreach ($ExpectedFetch in @(
    'fetch("/api/events"',
    'fetchJson("/api/listings"',
    'fetchJson(`/api/listings/${slug}`',
    'fetch(`/api/listings/${slug}/report`'
)) {
    if (-not $Scripts.Contains($ExpectedFetch)) {
        throw "Missing expected same-origin request: $ExpectedFetch"
    }
}
if (-not $Worker.Contains('const slugPattern = /^[A-Za-z0-9_-]{12}$/') -or
    -not $Worker.Contains('const capabilityPattern = /^[A-Za-z0-9_-]{43}$/') -or
    -not $Worker.Contains("randomBase64Url(32)") -or
    -not $Worker.Contains("crypto.subtle.digest")) {
    throw "Expected random public slugs and hashed 256-bit capabilities"
}
if (-not $ProductSurface.Contains("x-nakama-fuda-capability")) {
    throw "Missing edit capability boundary"
}
if (-not $Worker.Contains('url.protocol === "https:"') -or
    -not $Worker.Contains("!url.username") -or
    -not $Worker.Contains('url.port === "443"') -or
    -not $Worker.Contains('hostname !== "localhost"') -or
    -not $Worker.Contains('!hostname.endsWith(".local")') -or
    -not $Worker.Contains('!hostname.endsWith(".internal")') -or
    -not $Worker.Contains("!hostname.includes")) {
    throw "Expected strict HTTPS and local-network URL boundaries"
}
if (-not $Worker.Contains("today + 7 * 86400000") -or
    -not $Worker.Contains("today + 90 * 86400000") -or
    -not $Worker.Contains("parseJson(c.req.raw, 8192)") -or
    -not $Worker.Contains("createdToday") -or
    -not $Worker.Contains(">= 2")) {
    throw "Expected bounded listing content, expiry, and daily creation limit"
}
if (-not $Worker.Contains('app.get("/list"') -or
    -not $Worker.Contains('app.get("/r/:slug"') -or
    -not $Worker.Contains("current={props.filters.platform}") -or
    -not $Worker.Contains("current={props.filters.activityTime}") -or
    -not $Worker.Contains("current={props.filters.vc}")) {
    throw "Expected a public filtered directory with preserved selections"
}
if (-not $Worker.Contains("COUNT(DISTINCT session_id)") -or
    -not $Worker.Contains("reports?.count ?? 0") -or
    -not $Worker.Contains("DELETE FROM listing_reports WHERE listing_id = ?") -or
    -not $Worker.Contains('request.headers.get("cf-connecting-ip")') -or
    -not $Worker.Contains("crypto.subtle.sign") -or
    -not $Worker.Contains("c.env.REPORT_HASH_KEY") -or
    -not $Worker.Contains("THEN 'hidden' ELSE status END") -or
    -not $Worker.Contains("inactiveLifetime")) {
    throw "Expected independent reporting, safe reactivation, and inactive-listing expiry"
}
if ($Worker -match 'style=\{' -or
    $Worker -match "'unsafe-inline'" -or
    -not $Worker.Contains("styleSrc: [""'self'""]")) {
    throw "Expected a strict style CSP without inline styles"
}
if (-not $ServiceWorker.Contains('const cacheName = "nakama-fuda-v1"') -or
    -not $ServiceWorker.Contains('"/common.js"') -or
    -not $ServiceWorker.Contains("cacheablePaths.has(url.pathname)") -or
    $ServiceWorker.Contains('"/list"') -or
    $ServiceWorker.Contains('"/r/"') -or
    $ServiceWorker.Contains('"/edit/"')) {
    throw "Expected a bounded cache that excludes directory, listing, and capability pages"
}
foreach ($Table in @("listings", "listing_reports", "product_events")) {
    if (-not $Migration.Contains("CREATE TABLE $Table")) {
        throw "Database contract is missing: $Table"
    }
}
foreach ($EventName in @(
    "visited",
    "directory_searched",
    "listing_created",
    "listing_opened",
    "outbound_opened",
    "listing_updated",
    "listing_closed",
    "listing_deleted",
    "listing_reported",
    "returned"
)) {
    if (-not $Migration.Contains("'$EventName'") -or -not $Worker.Contains("""$EventName""")) {
        throw "Event contract is missing: $EventName"
    }
}
if (-not $Migration.Contains("is_qa") -or
    -not $Migration.Contains("CHECK(name IN") -or
    -not $Migration.Contains("UNIQUE(listing_id, session_id)") -or
    -not $Migration.Contains("UNIQUE(listing_id, reporter_hash)") -or
    -not $Worker.Contains('Object.keys(value).sort()')) {
    throw "Expected exact-shape events, independent reports, and a QA boundary"
}
if ($Worker -match '(?i)better-auth|betterAuth') {
    throw "Account authentication is not needed for this capability-based release"
}
if (-not $Worker.Contains("camera=(), geolocation=(), microphone=(), payment=()") -or
    $ProductSurface -match 'navigator\.geolocation|getCurrentPosition|watchPosition|Notification\.requestPermission|getUserMedia') {
    throw "The release must not request sensitive permissions"
}
if (-not $Styles.Contains("@media print")) {
    throw "Expected a readable print layout"
}

$OgPath = Join-Path $PublicDirectory "og.png"
if ((Get-Item -LiteralPath $OgPath).Length -lt 50000) {
    throw "Expected a product-specific raster social card"
}

$KeyFiles = @(
    Get-ChildItem -LiteralPath $PublicDirectory -File |
        Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" }
)
if ($KeyFiles.Count -ne 1) {
    throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)"
}
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) {
    throw "IndexNow key file name and content do not match"
}

Write-Output "Product release contract is satisfied"
