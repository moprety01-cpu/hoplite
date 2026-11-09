"""Rasterize Natural Earth 1:50m land polygons into a 120x60 equirectangular bitmap.

Source data (public domain): https://github.com/nvkelso/natural-earth-vector (geojson/ne_50m_land.geojson)
Each cell is land if at least half of its 4x4 subsamples fall inside a land polygon.
Output: land-120x60.txt — 60 rows (north to south) x 120 columns (180°W to 180°E), '#' = land, '.' = sea.
"""
import json, sys, numpy as np, shapely
from shapely.geometry import shape
from shapely.ops import unary_union

src = sys.argv[1] if len(sys.argv) > 1 else 'ne_50m_land.geojson'
C, R, SS = 120, 60, 4
land = unary_union([shape(f['geometry']) for f in json.load(open(src))['features']])
shapely.prepare(land)
xs = (np.arange(C * SS) + .5) / (C * SS) * 360 - 180
ys = 90 - (np.arange(R * SS) + .5) / (R * SS) * 180
X, Y = np.meshgrid(xs, ys)
inside = shapely.contains_xy(land, X.ravel(), Y.ravel()).reshape(R, SS, C, SS).mean(axis=(1, 3)) >= .5
with open('land-120x60.txt', 'w') as f:
    f.write('\n'.join(''.join('#' if b else '.' for b in row) for row in inside) + '\n')
print('land fraction %.3f' % inside.mean())
