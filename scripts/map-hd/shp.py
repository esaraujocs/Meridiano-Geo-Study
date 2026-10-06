"""Leitor mínimo de shapefile de polígonos (tipo 5) em numpy, sem GDAL.

Lê os registros em blocos e devolve os polígonos do shapely (um por anel externo: os buracos seguem o anel externo,
como o GDAL grava). Feito para os land polygons do osmdata.openstreetmap.de (EPSG:3857).
"""
import struct

import numpy as np
import shapely


def record_offsets(shx_path):
    """Offsets (em bytes) e tamanhos de cada registro, lidos do .shx."""
    data = np.fromfile(shx_path, dtype=">i4", offset=100).reshape(-1, 2)
    return data[:, 0].astype(np.int64) * 2, data[:, 1].astype(np.int64) * 2


def read_polygons(shp_path, shx_path, start=0, stop=None):
    """Polígonos dos registros [start, stop). Devolve (polígonos, índice do registro de cada polígono)."""
    offsets, lengths = record_offsets(shx_path)
    stop = len(offsets) if stop is None else min(stop, len(offsets))
    if start >= stop:
        return np.array([], dtype=object), np.array([], dtype=np.int64)
    first = offsets[start]
    last = offsets[stop - 1] + 8 + lengths[stop - 1]
    with open(shp_path, "rb") as handle:
        handle.seek(first)
        blob = handle.read(last - first)
    coords_parts = []
    ring_sizes = []
    ring_record = []
    for index in range(start, stop):
        base = offsets[index] - first + 8  # pula o cabeçalho do registro (número e tamanho, big-endian)
        shape_type = struct.unpack_from("<i", blob, base)[0]
        if shape_type == 0:
            continue
        if shape_type != 5:
            raise ValueError(f"registro {index}: tipo {shape_type}, esperado 5 (polígono)")
        num_parts, num_points = struct.unpack_from("<2i", blob, base + 36)
        parts = np.frombuffer(blob, dtype="<i4", count=num_parts, offset=base + 44)
        points = np.frombuffer(blob, dtype="<f8", count=num_points * 2, offset=base + 44 + 4 * num_parts).reshape(-1, 2)
        coords_parts.append(points)
        bounds = np.append(parts, num_points)
        ring_sizes.extend(np.diff(bounds).tolist())
        ring_record.extend([index] * num_parts)
    if not coords_parts:
        return np.array([], dtype=object), np.array([], dtype=np.int64)
    coords = np.concatenate(coords_parts)
    sizes = np.asarray(ring_sizes, dtype=np.int64)
    ring_of_point = np.repeat(np.arange(len(sizes)), sizes)
    # área com sinal de cada anel (fórmula do agrimensor): no shapefile o anel externo é horário (área negativa com y para cima)
    x = coords[:, 0]
    y = coords[:, 1]
    starts = np.concatenate([[0], np.cumsum(sizes)[:-1]])
    nxt = np.arange(len(coords)) + 1
    ends = starts + sizes
    nxt[ends - 1] = starts  # o seguinte do último ponto de cada anel é o primeiro
    cross = x * y[nxt] - x[nxt] * y
    signed = np.add.reduceat(cross, starts) / 2.0
    is_shell = signed < 0
    # cada registro começa num anel externo; se o primeiro anel vier anti-horário, ele vira externo assim mesmo
    record_start = np.concatenate([[True], np.asarray(ring_record[1:]) != np.asarray(ring_record[:-1])])
    is_shell = is_shell | record_start
    polygon_of_ring = np.cumsum(is_shell) - 1
    rings = shapely.linearrings(coords, indices=ring_of_point)
    polygons = shapely.polygons(rings, indices=polygon_of_ring)
    polygon_record = np.asarray(ring_record, dtype=np.int64)[is_shell]
    return polygons, polygon_record
