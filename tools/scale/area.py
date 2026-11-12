# Areas and bounding rectangles of farmland polygons from an OpenStreetMap Overpass extract (JSON with geometry).
# Usage: python3 tools/scale/area.py <farmland.json>
import json, math, sys, statistics as st
d=json.load(open(sys.argv[1]))
R=6371008.8
def poly(coords):
    lat0=math.radians(sum(c['lat'] for c in coords)/len(coords))
    pts=[(math.radians(c['lon'])*R*math.cos(lat0), math.radians(c['lat'])*R) for c in coords]
    a=0
    for i in range(len(pts)):
        x1,y1=pts[i];x2,y2=pts[(i+1)%len(pts)]
        a+=x1*y2-x2*y1
    return abs(a)/2, pts
def mrr(pts):
    # minimum-area rotated rectangle via convex hull edges
    P=sorted(set(pts))
    if len(P)<3: return (0,0)
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo=[];up=[]
    for p in P:
        while len(lo)>=2 and cross(lo[-2],lo[-1],p)<=0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up)>=2 and cross(up[-2],up[-1],p)<=0: up.pop()
        up.append(p)
    H=lo[:-1]+up[:-1]
    best=None
    for i in range(len(H)):
        x1,y1=H[i];x2,y2=H[(i+1)%len(H)]
        ang=math.atan2(y2-y1,x2-x1);c=math.cos(-ang);s=math.sin(-ang)
        xs=[p[0]*c-p[1]*s for p in H];ys=[p[0]*s+p[1]*c for p in H]
        w=max(xs)-min(xs);h=max(ys)-min(ys)
        if best is None or w*h<best[0]: best=(w*h,max(w,h),min(w,h))
    return best[1],best[2]
rows=[]
for e in d['elements']:
    if e['type']=='way' and 'geometry' in e:
        a,pts=poly(e['geometry']); L,W=mrr(pts)
        rows.append((a,L,W,e.get('tags',{})))
    elif e['type']=='relation':
        for m in e.get('members',[]):
            if m.get('role')=='outer' and 'geometry' in m:
                a,pts=poly(m['geometry']); L,W=mrr(pts); rows.append((a,L,W,e.get('tags',{})))
mode=sys.argv[2] if len(sys.argv)>2 else 'field'
areas=[r[0] for r in rows]
print('n',len(rows))
if not rows: sys.exit()
q=lambda xs,p: sorted(xs)[min(len(xs)-1,int(p*len(xs)))]
if mode=='field':
    ac=[a/4046.856 for a in areas]
    print('acres: p10 %.1f p25 %.1f median %.1f p75 %.1f p90 %.1f mean %.1f max %.1f'%(q(ac,.1),q(ac,.25),q(ac,.5),q(ac,.75),q(ac,.9),st.mean(ac),max(ac)))
    big=[r for r in rows if r[0]/4046.856>=2]
    print('n>=2ac',len(big))
    ac2=[r[0]/4046.856 for r in big]
    print('>=2ac acres: p25 %.1f median %.1f p75 %.1f mean %.1f'%(q(ac2,.25),q(ac2,.5),q(ac2,.75),st.mean(ac2)))
    Ls=[r[1] for r in big];Ws=[r[2] for r in big]
    print('>=2ac bounding rect length m: p25 %.0f med %.0f p75 %.0f ; width m: p25 %.0f med %.0f p75 %.0f'%(q(Ls,.25),q(Ls,.5),q(Ls,.75),q(Ws,.25),q(Ws,.5),q(Ws,.75)))
    # area-weighted median
    s=sorted(ac2);tot=sum(s);c=0
    for x in s:
        c+=x
        if c>=tot/2: print('area-weighted median acres %.1f'%x);break
    for b in [(2,5),(5,10),(10,20),(20,40),(40,80),(80,1e9)]:
        print('  %s: %d'%(b,sum(1 for x in ac if b[0]<=x<b[1])))
else:
    print('m2: p10 %.0f p25 %.0f median %.0f p75 %.0f p90 %.0f p97 %.0f max %.0f'%(q(areas,.1),q(areas,.25),q(areas,.5),q(areas,.75),q(areas,.9),q(areas,.97),max(areas)))
