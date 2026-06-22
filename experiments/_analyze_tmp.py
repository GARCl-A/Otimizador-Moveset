import csv, re, math, sys

folder = sys.argv[1]
TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison',
         'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy']
PER_POKE = 44
CAND = 6 * PER_POKE

rows = 0
cand_type = [0]*18
tmin, tmax, tsum = 1e9, -1e9, 0.0
with open(f'{folder}/dataset.csv', newline='') as f:
    r = csv.reader(f); next(r)
    for row in r:
        rows += 1
        for i in range(18):
            if float(row[CAND+i]) != 0:
                cand_type[i] += 1
        t = float(row[-1]); tmin=min(tmin,t); tmax=max(tmax,t); tsum+=t

print(f"[{folder}] dataset: {rows} amostras, target {tmin:.0f}/{tsum/rows:.1f}/{tmax:.0f}")
print("  tipo do candidato (fracao):")
order = sorted(range(18), key=lambda i: -cand_type[i])
for i in order:
    if cand_type[i]:
        print(f"    {TYPES[i]:9s} {cand_type[i]/rows*100:5.1f}%")

def pearson(xs, ys):
    n=len(xs); mx=sum(xs)/n; my=sum(ys)/n
    sxy=sum((x-mx)*(y-my) for x,y in zip(xs,ys))
    sxx=sum((x-mx)**2 for x in xs); syy=sum((y-my)**2 for y in ys)
    return sxy/math.sqrt(sxx*syy) if sxx>0 and syy>0 else 0.0

svg = open(f'{folder}/previsto_vs_exato.svg', encoding='utf-8').read()
pts = re.findall(r'<circle[^>]*cx="([-\d.]+)"[^>]*cy="([-\d.]+)"', svg)
if pts:
    cx=[float(a) for a,b in pts]; cy=[float(b) for a,b in pts]
    print(f"  scatter: {len(pts)} pontos, |corr| = {abs(pearson(cx,cy)):.3f}")
