#!/bin/zsh
# usage: shoot.sh [theme...] — круг 4.3 (frames list below); result -> v42/img (names now-<name>-<theme>-390.png)
cd /Users/yuriisurhuchov/GoRix/wt-2412
OUT=/Users/yuriisurhuchov/GoRix/notes/review-v2/q10-gutters-menu/v43/img
FR=(
"g-new:g-new:0:g-new" "g-new-s:g-new:9999:g-new-more"
"g-ready:g-ready:0:g-ready" "g-ready-tapeA:g-ready-tapeA:0:g-ready-tapeA"
"g-ready-more:g-ready-more:0:g-ready-more" "g-ready-more-s:g-ready-more:9999:g-ready-more2"
"g-mm:g-mm:0:g-mm"
"ds-new-smooth:ds-new-smooth:0:ds-new-smooth"
"ds-new-smooth-more:ds-new-smooth-more:0:ds-new-smooth-more" "ds-new-smooth-more-s:ds-new-smooth-more:9999:ds-new-smooth-more2"
"ds-new-ribbed:ds-new-ribbed:0:ds-new-ribbed" "ds-new-ribbed-more-s:ds-new-ribbed-more:9999:ds-new-ribbed-more2"
"ds-new-round:ds-new-round:0:ds-new-round" "ds-new-round-more-s:ds-new-round-more:9999:ds-new-round-more2"
"ds-ready:ds-ready:0:ds-ready" "ds-ready-more-s:ds-ready-more:9999:ds-ready-more2"
"ds-new-2floor:ds-new-2floor:0:ds-new-2floor"
"ds-color-empty-s:ds-color-empty:9999:ds-color-empty2" "ds-color-set-s:ds-color-set:9999:ds-color-set2"
"menu-bottom:menu-bottom:0:menu-bottom" "menu-bottom-old:menu-bottom-old:0:menu-bottom-old" "menu-angle:menu-angle:0:menu-angle" "menu-offset:menu-offset:0:menu-offset"
"page-wall:page-wall:0:page-wall" "page-wall-round:page-wall-round:0:page-wall-round" "page-top:page-top:0:page-top" "page-top-round:page-top-round:0:page-top-round" "page-mount-g:page-mount-g:0:page-mount-g"
"page-color:page-color:0:page-color" "page-color-empty:page-color-empty:0:page-color-empty"
)
THEMES=(${@:-dark light})
ONLY=${ONLY:-}
for th in $THEMES; do
  for f in $FR; do
    name=${f%%:*}; r=${f#*:}; view=${r%%:*}; r=${r#*:}; sc=${r%%:*}; outn=${r#*:}
    [[ -n $ONLY && " $ONLY " != *" $outn "* ]] && continue
    [[ -n $SKIPNEW && "$OUT/now-${outn}-${th}-390.png" -nt $SKIPNEW ]] && continue
    do="wait:2500"; [[ $sc != 0 ]] && do="wait:2500;scroll:$sc"
    [[ $view == menu-* ]] && do="wait:3500"
    p=$(GORIX_SHOT_PORT=8094 npm run shot -- "/mockq10?v=$view" --theme $th --width 390 --by q10 --reduce-motion --do "$do" 2>&1 | grep -E "\.png$" | head -1)
    if [[ -z $p ]]; then echo "FAIL $outn $th"; else cp "$p" "$OUT/now-${outn}-${th}-390.png"; echo "ok $outn $th"; fi
  done
done
