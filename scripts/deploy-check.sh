#!/usr/bin/env bash

set -euo pipefail

DEV_ORG_DEFAULT="smaccagno@lab00.dev"
PROD_ORG_DEFAULT="smaccagno@lab00.prod"
PROD_BRANCH_DEFAULT="prod"

SCRIPT_NAME="$(basename "$0")"

log() {
  printf '%s\n' "$1"
}

die() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-check.sh preflight [--auto-fix] [--dev-org ORG]
  scripts/deploy-check.sh prod-diff [--prod-org ORG]
  scripts/deploy-check.sh prod-deploy [--prod-branch BRANCH] [--prod-org ORG] [--path METADATA_PATH ...]

Commands:
  preflight    Check local <-> GitHub alignment and show DEV diff/preview.
  prod-diff    Show GitHub vs PROD differences and ask confirmation to align PROD.
  prod-deploy  Enforce dedicated PROD branch, deploy to PROD, then sync branch.

Options:
  --auto-fix   On preflight, run pull --rebase when behind and push when ahead.
  --dev-org    Override DEV org alias/username (default: smaccagno@lab00.dev).
  --prod-org   Override PROD org alias/username (default: smaccagno@lab00.prod).
  --prod-branch Override dedicated PROD branch (default: prod).
  --path       Metadata path to deploy (repeatable). Default: force-app/main/default.
EOF
}

ensure_git_repo() {
  git rev-parse --git-dir >/dev/null 2>&1 || die "Not inside a git repository."
}

ensure_sf_cli() {
  command -v sf >/dev/null 2>&1 || die "Salesforce CLI (sf) is not installed or not in PATH."
}

ensure_upstream() {
  git rev-parse --abbrev-ref "@{u}" >/dev/null 2>&1 || die "Current branch has no upstream tracking branch."
}

check_local_vs_github() {
  ensure_upstream
  local upstream ahead behind
  upstream="$(git rev-parse --abbrev-ref '@{u}')"
  git fetch --all --prune
  ahead="$(git rev-list --count "${upstream}..HEAD")"
  behind="$(git rev-list --count "HEAD..${upstream}")"

  log "Branch: $(git rev-parse --abbrev-ref HEAD)"
  log "Upstream: ${upstream}"
  log "Ahead: ${ahead} | Behind: ${behind}"

  if [[ "${ahead}" -eq 0 && "${behind}" -eq 0 ]]; then
    log "Local and GitHub are aligned."
    return
  fi

  log "Differences found between local and GitHub:"
  git log --oneline --left-right "HEAD...${upstream}"

  if [[ "${AUTO_FIX}" == "true" ]]; then
    if [[ "${behind}" -gt 0 ]]; then
      log "Running git pull --rebase to align local branch..."
      git pull --rebase
    fi
    if [[ "${ahead}" -gt 0 ]]; then
      log "Pushing local commits to GitHub..."
      git push
    fi
    log "Local/GitHub alignment completed."
  else
    die "Run again with --auto-fix to align local and GitHub automatically."
  fi
}

preview_diff_with_org() {
  local org="$1"
  ensure_sf_cli
  log "Checking differences between local and org: ${org}"
  if sf project deploy preview --target-org "${org}" >/tmp/sf-preview.out 2>/tmp/sf-preview.err; then
    cat /tmp/sf-preview.out
  else
    log "Could not run 'sf project deploy preview' for ${org}."
    log "CLI output:"
    cat /tmp/sf-preview.err || true
    log "Fallback: running validate-only deploy check."
    sf project deploy start -d force-app/main/default --target-org "${org}" --dry-run --wait 15
  fi
}

confirm() {
  local prompt="$1"
  local answer
  read -r -p "${prompt} [y/N]: " answer
  [[ "${answer}" =~ ^[Yy]$ ]]
}

cmd_preflight() {
  check_local_vs_github
  log ""
  preview_diff_with_org "${DEV_ORG}"
  log ""
  log "Preflight completed."
}

cmd_prod_diff() {
  check_local_vs_github
  log ""
  preview_diff_with_org "${PROD_ORG}"
  log ""
  if confirm "Align PROD from current GitHub branch now?"; then
    log "Executing PROD deploy alignment..."
    sf project deploy start -d force-app/main/default --target-org "${PROD_ORG}" --wait 15
    log "PROD alignment completed."
  else
    log "PROD alignment cancelled."
  fi
}

cmd_prod_deploy() {
  local current_branch
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  [[ "${current_branch}" == "${PROD_BRANCH}" ]] || die "You must be on '${PROD_BRANCH}' branch for PROD deploy. Current: ${current_branch}"

  ensure_upstream
  git fetch --all --prune
  git pull --rebase

  local deploy_paths=("${DEPLOY_PATHS[@]}")
  if [[ "${#deploy_paths[@]}" -eq 0 ]]; then
    deploy_paths=("force-app/main/default")
  fi

  ensure_sf_cli
  local args=()
  local p
  for p in "${deploy_paths[@]}"; do
    args+=("-d" "${p}")
  done

  log "Deploying to PROD org '${PROD_ORG}' from branch '${PROD_BRANCH}'..."
  sf project deploy start "${args[@]}" --target-org "${PROD_ORG}" --wait 15

  log "Syncing PROD branch to GitHub..."
  git push
  log "PROD deploy and branch sync completed."
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

COMMAND="${1:-}"
AUTO_FIX="false"
DEV_ORG="${DEV_ORG_DEFAULT}"
PROD_ORG="${PROD_ORG_DEFAULT}"
PROD_BRANCH="${PROD_BRANCH_DEFAULT}"
DEPLOY_PATHS=()

if [[ -z "${COMMAND}" ]]; then
  usage
  exit 1
fi
shift

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --auto-fix)
      AUTO_FIX="true"
      shift
      ;;
    --dev-org)
      DEV_ORG="${2:-}"
      [[ -n "${DEV_ORG}" ]] || die "Missing value for --dev-org"
      shift 2
      ;;
    --prod-org)
      PROD_ORG="${2:-}"
      [[ -n "${PROD_ORG}" ]] || die "Missing value for --prod-org"
      shift 2
      ;;
    --prod-branch)
      PROD_BRANCH="${2:-}"
      [[ -n "${PROD_BRANCH}" ]] || die "Missing value for --prod-branch"
      shift 2
      ;;
    --path)
      DEPLOY_PATHS+=("${2:-}")
      [[ -n "${2:-}" ]] || die "Missing value for --path"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

ensure_git_repo

case "${COMMAND}" in
  preflight)
    cmd_preflight
    ;;
  prod-diff)
    cmd_prod_diff
    ;;
  prod-deploy)
    cmd_prod_deploy
    ;;
  *)
    usage
    die "Unknown command: ${COMMAND}"
    ;;
esac
