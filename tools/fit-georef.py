import json, re, math, os, subprocess, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S=os.environ.get("SPIKE_DIR", os.path.join(ROOT,"ucdh-data"))
# merge data.jsx BUILDINGS + default-edits via node
node_src = f'''
const fs=require("fs"),vm=require("vm");
const ctx={{window:{{}}}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync("{ROOT}/data.jsx","utf8"),ctx);
const b=ctx.window.BUILDINGS;
const e=JSON.parse(fs.readFileSync("{ROOT}/default-edits.json","utf8"));
const ov=e.buildings||{{}};const out=[];
for(const x of b){{const o=ov[x.code]; if(o&&o._deleted)continue; out.push(o?{{...x,...o}}:{{...x}});}}
for(const [code,ab] of Object.entries(e.addedBuildings||{{}})){{if(ab._deleted)continue; out.push({{code,...ab}});}}
console.log(JSON.stringify({{buildings:out, pois:e.pois||e.addedPois||null, keys:Object.keys(e)}}));
'''
open(S+"/merge.js","w").write(node_src)
merged=json.loads(subprocess.check_output(["node",S+"/merge.js"]).decode())
B=merged["buildings"]
print("merged buildings:",len(B),"edit keys:",merged["keys"])

def center(b):
    if b.get("points"):
        p=b["points"]; return (sum(q[0] for q in p)/len(p), sum(q[1] for q in p)/len(p))
    return (b["x"]+b.get("w",0)/2, b["y"]+b.get("h",0)/2)

osm=json.load(open(S+"/osm-sac.json"))["elements"]
def ocenter(e):
    g=e.get("geometry") or []
    if not g: return None
    return (sum(p["lon"] for p in g)/len(g), sum(p["lat"] for p in g)/len(g))
named={}
for e in osm:
    t=e.get("tags",{})
    n=t.get("name")
    if n and "building" in t:
        c=ocenter(e)
        if c: named.setdefault(n,c)

# manual control-point map: data.jsx code -> OSM name
CP = {
 "T":"UC Davis Medical Center","I":"UC Davis Pathology Building","W":"North Addition Office Building",
 "PS":"UC Davis Health Patient Support Services Building","N":"Medical Records","PO":"Police Department",
 "Y":"UC Davis Health Behavioral Health Center","Z":"UC Davis Health Children's Behavioral Health Center",
 "Hp":"Hotel Med Park, Ascend Hotel Collection","V":"Glassrock Building","T2":"Ticon II Building",
 "D2":"Davis 2 Building","M":"UC Davis Cancer Center North Building","L":"UC Davis Cancer Center South Building",
 "A":"48 X Complex","K2":"Lawrence J. Ellison Ambulatory Care Center","SFC":"UC Davis Health Fitness Center",
 "CM":"Courtyard Sacramento Midtown",
}
by={b["code"]:b for b in B}
def merc(lon,lat):
    R=6378137.0
    return (R*math.radians(lon), R*math.log(math.tan(math.pi/4+math.radians(lat)/2)))
pts=[]
for code,name in CP.items():
    if code in by and name in named:
        px=center(by[code]); lon,lat=named[name]; pts.append((code,name,px,merc(lon,lat),(lon,lat)))
    else:
        print("  MISS", code, name, code in by, name in named)
print("control points:",len(pts))
# least squares affine px->merc
import itertools
def fit(pts):
    A=[];bx=[];byv=[]
    for _,_,(u,v),(mx,my),_ in pts:
        A.append([u,v,1]); bx.append(mx); byv.append(my)
    def lstsq(A,b):
        n=3
        ATA=[[sum(A[k][i]*A[k][j] for k in range(len(A))) for j in range(n)] for i in range(n)]
        ATb=[sum(A[k][i]*b[k] for k in range(len(A))) for i in range(n)]
        # gaussian elim
        M=[row[:]+[ATb[i]] for i,row in enumerate(ATA)]
        for i in range(n):
            p=max(range(i,n),key=lambda r:abs(M[r][i])); M[i],M[p]=M[p],M[i]
            for r in range(n):
                if r!=i:
                    f=M[r][i]/M[i][i]
                    for c in range(i,n+1): M[r][c]-=f*M[i][c]
        return [M[i][n]/M[i][i] for i in range(n)]
    return lstsq(A,bx), lstsq(A,byv)
cx,cy=fit(pts)
print("cx",cx); print("cy",cy)
res=[]
for code,name,(u,v),(mx,my),ll in pts:
    px_=cx[0]*u+cx[1]*v+cx[2]; py_=cy[0]*u+cy[1]*v+cy[2]
    # mercator meters -> ground meters scale factor cos(lat)
    k=math.cos(math.radians(ll[1]))
    d=math.hypot(px_-mx,py_-my)*k
    res.append((d,code,name))
res.sort(reverse=True)
rms=math.sqrt(sum(d*d for d,_,_ in res)/len(res))
print(f"RMS residual: {rms:.1f} m (ground)")
for d,code,name in res: print(f"  {d:8.1f} m  {code:4s} {name}")
# scale: meters per px
k=math.cos(math.radians(38.5535))
sx=math.hypot(cx[0],cy[0])*k; sy=math.hypot(cx[1],cy[1])*k
print(f"meters/px x={sx:.3f} y={sy:.3f}  rotation={math.degrees(math.atan2(cy[0],cx[0])):.2f} deg")
