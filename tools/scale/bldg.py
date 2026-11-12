# Footprints of rural buildings from an OpenStreetMap Overpass extract, using area.py beside it.
# Usage: python3 tools/scale/bldg.py <buildings.json>
import os
import json,math,sys,statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
d=json.load(open(sys.argv[1]))
R=6371008.8
def proj(c,lat0): return (math.radians(c['lon'])*R*math.cos(lat0), math.radians(c['lat'])*R)
def area(pts):
    a=0
    for i in range(len(pts)):
        x1,y1=pts[i];x2,y2=pts[(i+1)%len(pts)];a+=x1*y2-x2*y1
    return abs(a)/2
def mrr(pts):
    P=sorted(set(pts))
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo=[];up=[]
    for p in P:
        while len(lo)>=2 and cross(lo[-2],lo[-1],p)<=0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up)>=2 and cross(up[-2],up[-1],p)<=0: up.pop()
        up.append(p)
    H=lo[:-1]+up[:-1];best=None
    for i in range(len(H)):
        x1,y1=H[i];x2,y2=H[(i+1)%len(H)];ang=math.atan2(y2-y1,x2-x1);c=math.cos(-ang);s=math.sin(-ang)
        xs=[p[0]*c-p[1]*s for p in H];ys=[p[0]*s+p[1]*c for p in H];w=max(xs)-min(xs);h=max(ys)-min(ys)
        if best is None or w*h<best[0]: best=(w*h,max(w,h),min(w,h))
    return best[1],best[2]
lat0=math.radians(46.78)
B=[]
for e in d['elements']:
    g=e.get('geometry')
    if not g: continue
    pts=[proj(c,lat0) for c in g]
    a=area(pts);L,W=mrr(pts)
    cx=sum(p[0] for p in pts)/len(pts);cy=sum(p[1] for p in pts)/len(pts)
    B.append(dict(t=e.get('tags',{}).get('building'),a=a,L=L,W=W,x=cx,y=cy))
q=lambda xs,p: sorted(xs)[min(len(xs)-1,int(p*len(xs)))]
for grp,ts in [('house',{'house','detached'}),('garage',{'garage'}),('yes',{'yes'}),('yes>150m2',None)]:
    if ts: S=[b for b in B if b['t'] in ts]
    else: S=[b for b in B if b['t']=='yes' and b['a']>150]
    if not S: continue
    print(grp,len(S),'area m2 p25 %.0f med %.0f p75 %.0f p90 %.0f max %.0f'%(q([b['a'] for b in S],.25),q([b['a'] for b in S],.5),q([b['a'] for b in S],.75),q([b['a'] for b in S],.9),max(b['a'] for b in S)),
      '| LxW med %.0fx%.0f'%(q([b['L'] for b in S],.5),q([b['W'] for b in S],.5)))
big=sorted([b for b in B if b['a']>250],key=lambda b:-b['a'])
print('buildings >250 m2:',len(big))
for b in big[:25]: print('  %s %.0f m2  %.0f x %.0f m'%(b['t'],b['a'],b['L'],b['W']))
# farmstead clusters: link buildings within 80 m
n=len(B);par=list(range(n))
def f(i):
    while par[i]!=i: par[i]=par[par[i]];i=par[i]
    return i
for i in range(n):
    for j in range(i+1,n):
        if (B[i]['x']-B[j]['x'])**2+(B[i]['y']-B[j]['y'])**2<80**2: par[f(i)]=f(j)
cl={}
for i in range(n): cl.setdefault(f(i),[]).append(i)
C=[(sum(B[i]['x'] for i in v)/len(v),sum(B[i]['y'] for i in v)/len(v),len(v),max(B[i]['a'] for i in v)) for v in cl.values()]
print('clusters',len(C))
nn=[]
for i,a in enumerate(C):
    dm=min(math.hypot(a[0]-b[0],a[1]-b[1]) for j,b in enumerate(C) if j!=i)
    nn.append(dm)
print('nearest-neighbour distance between building clusters m: p25 %.0f med %.0f p75 %.0f p90 %.0f'%(q(nn,.25),q(nn,.5),q(nn,.75),q(nn,.9)))
fs=[c for c in C if c[3]>250]
nn2=[min(math.hypot(a[0]-b[0],a[1]-b[1]) for b in fs if b is not a) for a in fs]
print('clusters with a >250 m2 building (farmsteads?)',len(fs),'NN dist m: p25 %.0f med %.0f p75 %.0f'%(q(nn2,.25),q(nn2,.5),q(nn2,.75)) if len(fs)>2 else '')
area_km2=(0.12*111.2)*(0.12*111.2*math.cos(lat0))
print('bbox km2 %.1f clusters per km2 %.2f'%(area_km2,len(C)/area_km2))
