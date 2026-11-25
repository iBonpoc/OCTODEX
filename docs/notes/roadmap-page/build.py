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
    items.append(dict(k="pr",n=p["number"],t=p["title"],s=st,ch=checks,cl=cls(ls),a=area(ls),u=p["updated_at"]))
since=(datetime.datetime.now(datetime.UTC).replace(tzinfo=None)-datetime.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
for p in gh(f"{R}/pulls?state=closed&sort=updated&direction=desc&per_page=100"):
    if p.get("merged_at") and p["merged_at"]>since:
        ls=lab(p); items.append(dict(k="pr",n=p["number"],t=p["title"],s="merged",cl=cls(ls),a=area(ls),u=p["merged_at"]))
iss=gh(f"{R}/issues?state=open&labels=%D0%B4%D0%BE-1.0&per_page=100",True)
for x in iss:
    if "pull_request" in x: continue
    ls=lab(x)
    if "эпик" in ls: continue
    pr_="urgent" if "срочно" in ls else ("later" if "потом" in ls else "")
    items.append(dict(k="is",n=x["number"],t=x["title"],s="todo",st=stage.get(x["number"]),cl=cls(ls),a=area(ls),p=pr_,
        f=("основатель" in ls),q=("вопрос" in ls),b=("ошибка" in ls),u=x["updated_at"]))
for x in gh(f"{R}/issues?state=closed&since={since}&per_page=100",True):
    if "pull_request" in x or not x.get("closed_at") or x["closed_at"]<since: continue
    ls=lab(x)
    if "решение" in ls or "эпик" in ls: continue
    items.append(dict(k="is",n=x["number"],t=x["title"],s="done",st=stage.get(x["number"]),cl=cls(ls),a=area(ls),u=x["closed_at"]))
out=dict(at=datetime.datetime.now(datetime.UTC).replace(tzinfo=None).strftime("%Y-%m-%dT%H:%M:%SZ"),items=items)
json.dump(out,open(sys.argv[1],"w"),ensure_ascii=False,separators=(",",":"))
from collections import Counter
print(len(items),Counter(i["s"] for i in items),Counter(i.get("st") for i in items if i["k"]=="is"))
