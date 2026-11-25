#!/bin/zsh
# usage: shoot.sh  — all frames, both themes, one run; output dir ~/GoRix/notes/screens/<commit>/ -> copied to v4/img by copy step
cd ~/GoRix/wt-2412
OUT=~/GoRix/notes/review-v2/q10-gutters-menu/v4/img
typeset -A SC
# name:view:scroll
FR=(
"g-new:g-new:0" "g-new-s:g-new:9999"
"g-ready:g-ready:0"
"g-ready-more:g-ready-more:0" "g-ready-more-s:g-ready-more:9999"
"g-mm:g-mm:0"
"ds-new-smooth:ds-new-smooth:0"
"ds-new-smooth-more:ds-new-smooth-more:0" "ds-new-smooth-more-s:ds-new-smooth-more:9999"
"ds-new-ribbed:ds-new-ribbed:0"
"ds-new-ribbed-more:ds-new-ribbed-more:0" "ds-new-ribbed-more-s:ds-new-ribbed-more:9999"
"ds-new-round:ds-new-round:0"
"ds-new-round-more:ds-new-round-more:0" "ds-new-round-more-s:ds-new-round-more:9999"
"ds-ready:ds-ready:0"
"ds-ready-more:ds-ready-more:0" "ds-ready-more-s:ds-ready-more:9999"
"menu-angle:menu-angle:0" "menu-offset:menu-offset:0" "menu-color:menu-color:0" "menu-color-s:menu-color:9999" "menu-wall:menu-wall:0" "menu-wall-s:menu-wall:9999"
"was-g-new:was-g:0" "was-g-ready:was-g:0" "was-ds:was-d:0"
)
for th in dark light; do
  for f in $FR; do
    name=${f%%:*}; rest=${f#*:}; view=${rest%%:*}; sc=${rest##*:}
    do="wait:2500"; [[ $sc != 0 ]] && do="wait:2500;scroll:$sc"
    [[ $view == menu-* ]] && do="wait:3000"; [[ ( $view == menu-color || $view == menu-wall ) && $sc != 0 ]] && do="wait:3000;scroll:$sc"
    p=$(GORIX_SHOT_PORT=8094 npm run shot -- "/mockq10?v=$view" --theme $th --width 390 --by q10 --reduce-motion --do "$do" 2>&1 | grep -E "\.png$" | head -1)
    if [[ -z $p ]]; then echo "FAIL $name $th"; else cp "$p" "$OUT/${name}-${th}-390.png"; echo "ok $name $th"; fi
  done
done
