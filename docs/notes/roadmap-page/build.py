import json, subprocess, sys, datetime
R="repos/iBonpoc/OCTODEX"
def gh(path, paginate=False):
    a=["gh","api","-X","GET",path]+(["--paginate","--slurp"] if paginate else [])
    out=subprocess.run(a,capture_output=True,text=True,check=True).stdout
    d=json.loads(out)
    if paginate: d=[x for page in d for x in page]
    return d
STAGES={1542:1,2431:1,1878:2,2432:2,1879:3,1880:4,1526:4,1881:5,1544:5,1882:6}
stage={}
def walk(n,s,depth):
    try: subs=gh(f"{R}/issues/{n}/sub_issues?per_page=100",True)
    except Exception: return
    for x in subs:
        stage.setdefault(x["number"],s)
        if depth<2 and x.get("sub_issues_summary",{}).get("total",0): walk(x["number"],s,depth+1)
for c,s in STAGES.items(): walk(c,s,1)
import re
def desc(body, prefer=None):
    b=body or ""
    if prefer:
        m=re.search(r"^##+\s*"+prefer+r".*?$\n(.*?)(?=^##|\Z)", b, re.S|re.M)
        if m: b=m.group(1)
    for para in re.split(r"\n\s*\n", b):
        t=para.strip()
        if not t or t.startswith(("#","|","```","<!--","---",">")): continue
        t=re.sub(r"!\[[^\]]*\]\([^)]*\)","",t); t=re.sub(r"\[([^\]]+)\]\([^)]*\)",r"\1",t)
        t=re.sub(r"[*_`]","",t); t=re.sub(r"^\s*[-•]\s*","",t,flags=re.M); t=re.sub(r"\s+"," ",t).strip()
        if len(t)<25: continue
        return t[:260]+("…" if len(t)>260 else "")
    return ""
def lab(x): return [l["name"] for l in x.get("labels",[])]
def area(ls):
    for k,v in [("gutters","Gutters"),("сметы","Сметы"),("лиды","Лиды"),("дизайн","Дизайн"),("проверки","Проверки"),("ядро","Ядро"),("деньги","Деньги"),("право","Право")]:
        if k in ls: return v
    return ""
def cls(ls):
    for k in ("К1","К2","К3","K1","K2","K3"):
        if k in ls: return k.replace("K","К")
    return ""
items=[]
link={}
prs=gh(f"{R}/pulls?state=open&per_page=100",True)
for p in prs:
    if p["number"]==2540: continue
    ls=lab(p); st="queue" if "к-влитию" in ls else ("draft" if p["draft"] else "review")
    checks=""
    try:
        cr=gh(f"{R}/commits/{p['head']['sha']}/check-runs?per_page=100")["check_runs"]
        cs=[c["conclusion"] for c in cr]
        checks="red" if "failure" in cs else ("run" if None in cs else "green")
    except Exception: pass
    items.append(dict(k="pr",n=p["number"],t=p["title"],d=desc(p.get("body"),"Что сделано"),s=st,ch=checks,cl=cls(ls),a=area(ls),u=p["updated_at"]))
    for m in re.finditer(r"(?:clos\w*|fix\w*|resolv\w*|refs?)\s*:?\s*#(\d+)", p.get("body") or "", re.I): link.setdefault(int(m.group(1)),[]).append([p["number"],st if checks!="red" else "red"])
since=(datetime.datetime.now(datetime.UTC).replace(tzinfo=None)-datetime.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
for p in gh(f"{R}/pulls?state=closed&sort=updated&direction=desc&per_page=100"):
    if p.get("merged_at") and p["merged_at"]>since:
        ls=lab(p); items.append(dict(k="pr",n=p["number"],t=p["title"],d=desc(p.get("body"),"Что сделано"),s="merged",cl=cls(ls),a=area(ls),u=p["merged_at"]))
        for m in re.finditer(r"(?:clos\w*|fix\w*|resolv\w*|refs?)\s*:?\s*#(\d+)", p.get("body") or "", re.I): link.setdefault(int(m.group(1)),[]).append([p["number"],"merged"])
iss=gh(f"{R}/issues?state=open&labels=%D0%B4%D0%BE-1.0&per_page=100",True)
for x in iss:
    if "pull_request" in x: continue
    ls=lab(x)
    if "эпик" in ls: continue
    pr_="urgent" if "срочно" in ls else ("later" if "потом" in ls else "")
    items.append(dict(k="is",n=x["number"],t=x["title"],s="todo",st=stage.get(x["number"]),cl=cls(ls),a=area(ls),p=pr_,
        f=("основатель" in ls),q=("вопрос" in ls),b=("ошибка" in ls),u=x["updated_at"],d=desc(x.get("body")),
        sub=[x.get("sub_issues_summary",{}).get("completed",0),x.get("sub_issues_summary",{}).get("total",0)]))
for x in gh(f"{R}/issues?state=closed&since={since}&per_page=100",True):
    if "pull_request" in x or not x.get("closed_at") or x["closed_at"]<since: continue
    ls=lab(x)
    if "решение" in ls or "эпик" in ls: continue
    items.append(dict(k="is",n=x["number"],t=x["title"],d=desc(x.get("body")),s="done",st=stage.get(x["number"]),cl=cls(ls),a=area(ls),u=x["closed_at"]))
for it in items:
    if it["k"]=="is" and it["n"] in link: it["prs"]=link[it["n"]]
sp={}
for c,sn in STAGES.items():
    try:
        x=gh(f"{R}/issues/{c}"); ss=x.get("sub_issues_summary",{}); a=sp.setdefault(sn,[0,0]); a[0]+=ss.get("completed",0); a[1]+=ss.get("total",0)
    except Exception: pass
import os
pf=os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])),"plain.json")
if os.path.exists(pf):
    plain=json.load(open(pf))
    for it in items:
        o=plain.get(str(it["n"]))
        if o:
            if o.get("t"): it["tt"]=it["t"]; it["t"]=o["t"]
            if o.get("d"): it["d"]=o["d"]
            it["pl"]=1
out=dict(stages=sp,at=datetime.datetime.now(datetime.UTC).replace(tzinfo=None).strftime("%Y-%m-%dT%H:%M:%SZ"),items=items)
json.dump(out,open(sys.argv[1],"w"),ensure_ascii=False,separators=(",",":"))
from collections import Counter
print(len(items),Counter(i["s"] for i in items),Counter(i.get("st") for i in items if i["k"]=="is"))
