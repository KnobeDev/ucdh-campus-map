import json,math,collections,os
S=os.environ.get("SPIKE_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"ucdh-data"))
cx=[2.095480283557903, 0.019737985258021704, -13521038.178462502]
cy=[0.002737975444267888, -2.0774730781853026, 4658517.990787355]
# invert affine (merc -> px)
a,b,c=cx; d,e,f=cy
det=a*e-b*d
def to_px(mx,my):
    X=mx-c; Y=my-f
    return ((e*X-b*Y)/det, (-d*X+a*Y)/det)
R=6378137.0
def merc(lon,lat): return (R*math.radians(lon), R*math.log(math.tan(math.pi/4+math.radians(lat)/2)))
els=json.load(open(S+"/osm-sac.json"))["elements"]
W,H=919,792
stats=collections.Counter(); inside=collections.Counter(); lens=collections.Counter()
def seglen(g):
    tot=0
    for p,q in zip(g,g[1:]):
        dx=(q["lon"]-p["lon"])*111320*math.cos(math.radians(p["lat"])); dy=(q["lat"]-p["lat"])*110540
        tot+=math.hypot(dx,dy)
    return tot
for el in els:
    t=el.get("tags",{}); g=el.get("geometry") or []
    if not g: continue
    kind = "building" if "building" in t else ("parking" if t.get("amenity")=="parking" else ("hw:"+t["highway"] if "highway" in t else "other"))
    pts=[to_px(*merc(p["lon"],p["lat"])) for p in g]
    frac=sum(1 for x,y in pts if 0<=x<=W and 0<=y<=H)/len(pts)
    stats[kind]+=1
    if frac>0.5:
        inside[kind]+=1
        if kind.startswith("hw:"): lens[kind]+=seglen(g)
print("kind            total  inside-map  km")
for k in sorted(stats, key=lambda k:-inside[k]):
    print(f"{k:15s} {stats[k]:5d} {inside[k]:9d}  {lens[k]/1000:.2f}")
ped = sum(lens[k] for k in ("hw:footway","hw:pedestrian","hw:path","hw:steps"))
print(f"\npedestrian network inside map: {ped/1000:.2f} km")
print(f"map extent at 1.63 m/px: {W*1.639:.0f} x {H*1.625:.0f} m")
