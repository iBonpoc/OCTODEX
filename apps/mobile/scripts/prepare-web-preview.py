#!/usr/bin/env python3
"""
Turn `expo export --platform web` output (dist/) into a folder that works from ANY sub-path
(e.g. a claude.ai Artifact preview), so the founder can open the app on a phone by link.

What it does:
  1. Copies dist/ to OUT, renames _expo -> app-js (paths starting with "_" are reserved by the host).
  2. Rewrites absolute "/_expo/..." and "/assets/..." string literals in JS to `self.__B + "..."`,
     where self.__B is the page's own directory computed at runtime (router changes the URL later).
  3. Renames "[id]-*.js" and "+not-found-*.js" chunks to plain names.
  4. Writes OUT/index.html (no <html>/<head>: the host adds the skeleton) and OUT/files.json.

Usage: npx expo export --platform web && python3 scripts/prepare-web-preview.py dist OUT
"""
import json, os, re, shutil, sys

src, out = sys.argv[1], sys.argv[2]
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(src, out)
os.rename(os.path.join(out, "_expo"), os.path.join(out, "app-js"))
for f in ("index.html", "metadata.json"):
    p = os.path.join(out, f)
    if os.path.exists(p):
        os.remove(p)

web = os.path.join(out, "app-js", "static", "js", "web")
renames = {}
for name in os.listdir(web):
    new = name.replace("[id]-", "id-").replace("+not-found-", "not-found-")
    if new != name:
        os.rename(os.path.join(web, name), os.path.join(web, new))
        renames[name] = new

for name in os.listdir(web):
    p = os.path.join(web, name)
    s = open(p, encoding="utf-8").read()
    for a, b in renames.items():
        s = s.replace(a, b)
    s = s.replace("_expo/static", "app-js/static")
    # plain string literals only (skip escaped quotes inside JSON strings)
    s = re.sub(r'(?<!\\)"/app-js/', 'self.__B+"app-js/', s)
    s = re.sub(r'(?<!\\)"/assets/', 'self.__B+"assets/', s)
    open(p, "w", encoding="utf-8").write(s)

dist_index = open(os.path.join(src, "index.html"), encoding="utf-8").read()
scripts = re.findall(r'src="/_expo/(static/js/web/[^"]+)"', dist_index)
tags = "\n".join(f'<script src="./app-js/{s}" defer></script>' for s in scripts)
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(f"""<title>GoRix</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{{--page:#EFEBE5;color-scheme:light}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--page:#24272D;color-scheme:dark}}}}
:root[data-theme="dark"]{{--page:#24272D;color-scheme:dark}}
html,body{{height:100%}}
body{{overflow:hidden;background:var(--page)}}
#root{{display:flex;height:100%;flex:1}}
</style>
<div id="root"></div>
<script>self.__B=location.href.split("#")[0].split("?")[0].replace(/[^/]*$/,"");</script>
{tags}
""")

files = []
for root, _, names in os.walk(out):
    for n in names:
        rel = os.path.relpath(os.path.join(root, n), out)
        if rel not in ("index.html", "files.json"):
            files.append({"path": rel})
json.dump(files, open(os.path.join(out, "files.json"), "w"), indent=0)
print(f"ready: {out} ({len(files)} files)")
