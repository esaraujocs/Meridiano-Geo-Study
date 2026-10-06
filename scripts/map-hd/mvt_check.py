"""Confere que todo polígono do mapa é válido nas unidades do tile, depois do arredondamento (o que build-tiles.py garante com
snap rounding). Polígono que se cruza vira, no MapLibre, uma faixa pintada duas vezes: uma linha clara atravessando a terra.

Uso: python scripts/map-hd/mvt_check.py [arquivo.pmtiles]   (padrão: public/maps/meridiano-hd.pmtiles; ~3 min)
Também serve de leitor mínimo de MVT (só o que build-tiles.py grava): decode(blob).
"""
import gzip
import os
import sys
import time

import numpy as np
import shapely


def _varint(data, pos):
    value = shift = 0
    while True:
        byte = data[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, pos
        shift += 7


def _fields(data):
    pos = 0
    while pos < len(data):
        key, pos = _varint(data, pos)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, pos = _varint(data, pos)
        elif wire == 2:
            length, pos = _varint(data, pos)
            value = data[pos:pos + length]
            pos += length
        else:
            raise ValueError(f"tipo de campo {wire} não esperado")
        yield number, value


def _packed(data):
    out, pos = [], 0
    while pos < len(data):
        value, pos = _varint(data, pos)
        out.append(value)
    return out


def _rings(cmds):
    rings, ring, x, y, i = [], [], 0, 0, 0
    while i < len(cmds):
        cmd, count = cmds[i] & 7, cmds[i] >> 3
        i += 1
        if cmd == 7:
            rings.append(ring)
            ring = []
            continue
        for _ in range(count):
            dx, dy = cmds[i], cmds[i + 1]
            i += 2
            x += (dx >> 1) ^ -(dx & 1)
            y += (dy >> 1) ^ -(dy & 1)
            ring.append((x, y))
    return rings


def decode(blob):
    """[(carta_id, MultiPolygon em unidades do tile)] de um tile MVT com gzip."""
    data = gzip.decompress(blob)
    out = []
    for number, layer in _fields(data):
        if number != 3:
            continue
        values, features = [], []
        for lnum, lval in _fields(layer):
            if lnum == 4:
                values.append(next(v for n, v in _fields(lval) if n == 1).decode("utf8"))
            elif lnum == 2:
                tags, geometry = [], []
                for fnum, fval in _fields(lval):
                    if fnum == 2:
                        tags = _packed(fval)
                    elif fnum == 4:
                        geometry = _packed(fval)
                features.append((tags, geometry))
        for tags, geometry in features:
            polys, current = [], None
            for ring in _rings(geometry):
                pts = np.array(ring + [ring[0]], dtype=float)
                area = 0.5 * float(np.dot(pts[:-1, 0], pts[1:, 1]) - np.dot(pts[1:, 0], pts[:-1, 1]))
                if area > 0:  # anel externo (área positiva com y para baixo)
                    current = [pts, []]
                    polys.append(current)
                elif current is not None:
                    current[1].append(pts)
            geom = shapely.MultiPolygon([shapely.Polygon(shell, holes) for shell, holes in polys]) if polys else None
            out.append((values[tags[1]] if len(tags) > 1 else "", geom))
    return out


def main():
    from pmtiles.reader import MmapSource, all_tiles
    sys.stdout.reconfigure(encoding="utf-8")
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "maps", "meridiano-hd.pmtiles")
    started = time.time()
    tiles = 0
    bad = []
    with open(path, "rb") as handle:
        for (z, x, y), blob in all_tiles(MmapSource(handle)):
            tiles += 1
            for cid, geom in decode(blob):
                if geom is not None and not shapely.is_valid(geom):
                    bad.append(f"{z}/{x}/{y} {cid or '(neutra)'}: {shapely.is_valid_reason(geom)[:80]}")
    print(f"{tiles} tiles lidos · {len(bad)} polígonos inválidos · {time.time() - started:.0f} s")
    if bad:
        print(chr(10).join(bad[:20]))
        sys.exit(1)


if __name__ == "__main__":
    main()
