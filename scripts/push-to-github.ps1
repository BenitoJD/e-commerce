param(
  [string]$RepoName = "toolsvilla-clone",
  [string]$Owner = "BenitoJD",
  [string]$Branch = "main"
)
$ErrorActionPreference = "Stop"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found. Install https://git-scm.com/download/win then re-run." }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "gh CLI not found. Install https://cli.github.com/ then 'gh auth login' and re-run." }
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path ".git")) { git init -b $Branch }
git add -A
git commit -m "Initial end-to-end E-Commerce build (storefront+backend+docker+razorpay)" -q
if (-not (gh repo view "$Owner/$RepoName" 2>$null)) {
  gh repo create "$Owner/$RepoName" --public --source=. --remote=origin --push
} else {
  git remote remove origin -ErrorAction SilentlyContinue
  git remote add origin "https://github.com/$Owner/$RepoName.git"
  git push -u origin $Branch
}
Write-Host "Pushed to https://github.com/$Owner/$RepoName"
