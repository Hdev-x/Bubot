#!/usr/bin/env bash

set -euo pipefail

project="${1:-.}"

git -C "$project" rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "FAIL Git 저장소가 아닙니다: $project" >&2
  exit 1
}

failed=0
staged_files=()
while IFS= read -r file; do
  [[ -n "$file" ]] && staged_files+=("$file")
done < <(git -C "$project" diff --cached --name-only --diff-filter=ACMR)

if ((${#staged_files[@]} == 0)); then
  echo "PASS staged files 없음"
  exit 0
fi

for file in "${staged_files[@]}"; do
  # 검사기 자체에는 탐지 패턴 예시가 포함되므로 자기 파일은 검사 대상에서 제외한다.
  [[ "$file" == "ops/check-secrets.sh" ]] && continue

  lower="$(printf '%s' "$file" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    *.env|*.pem|*.key|*.p12|*.pfx|*credential*|*secret*|*application-local*|*service-account*)
      echo "FAIL 민감 파일명 감지: $file" >&2
      failed=1
      continue
      ;;
  esac

  if git -C "$project" show ":$file" 2>/dev/null | LC_ALL=C grep -aEiq \
    '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|password[[:space:]]*[:=][[:space:]]*[^[:space:]#]{8,}|postgres(ql)?://[^[:space:]]+:[^[:space:]@]+@)'; then
    echo "FAIL 시크릿 의심 내용 감지: $file" >&2
    failed=1
  fi
done

if ((failed)); then
  echo "커밋·push 전에 값을 제거하고 이미 노출된 자격증명은 폐기·재발급하세요." >&2
  exit 1
fi

echo "PASS staged secret heuristic scan (${#staged_files[@]} files)"
