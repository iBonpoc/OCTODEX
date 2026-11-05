#!/usr/bin/env bash
# Руководитель: какие файлы правят сразу несколько рабочих веток (docs/ai/DIRECTOR.md, «Пересечения»).
# Запуск: bash scripts/overlap.sh <ветка> <ветка> ...
#   Ветки — головы открытых PR и ветки из docs/ai/BOARD.md, где работа идёт без PR.
#   Без аргументов — все ветки origin с коммитами за 14 дней (там бывают уже влитые squash-ем — шум).
# Печатает: файл → ветки, которые его меняют. Файлы, уже равные main, не считаются.
set -euo pipefail
git fetch -q --prune origin
if [ "$#" -gt 0 ]; then
  refs=(); for b in "$@"; do refs+=("origin/${b#origin/}"); done
else
  since=$(( $(date +%s) - 14*86400 ))
  mapfile -t refs < <(git for-each-ref --format='%(refname:short) %(committerdate:unix)' refs/remotes/origin \
    | awk -v s="$since" '$1!="origin/main" && $1!="origin/HEAD" && $1!="origin" && $2>=s {print $1}')
fi
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
for ref in "${refs[@]}"; do
  base="$(git merge-base origin/main "$ref" 2>/dev/null || true)"
  [ -n "$base" ] || continue
  while IFS= read -r f; do
    git diff --quiet origin/main "$ref" -- "$f" && continue   # уже как в main
    printf '%s\t%s\n' "$f" "${ref#origin/}" >> "$tmp"
  done < <(git diff --name-only "$base" "$ref")
done
sort -u "$tmp" | awk -F'\t' '
  { b[$1] = b[$1] (b[$1] ? ", " : "") $2; n[$1]++ }
  END { k = 0; for (f in n) if (n[f] > 1) { print f "  ←  " b[f]; k++ }
        if (!k) print "Пересечений нет." }' | sort
