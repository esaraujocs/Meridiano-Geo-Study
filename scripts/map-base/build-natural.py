# O fundo "Natural" do mapa (23/10/2026, pedido do Enzo: "o modo mapa do Google Earth, meio desenhado", não a foto): a cobertura do solo em cores
# chapadas e suaves (areia, cerrado, campo, floresta, gelo) com um toque do relevo, tirada dos ladrilhos da terra da Blue Marble (public/maps/sat/
# bm-terra, domínio público, NASA Earth Observatory); a terra (o que fica opaco) é a do mapa HD, para casar com a costa e os lagos do jogo. Gera public/maps/sat/natural/{z}/{x}/{y}.webp (zooms 0–5, 512 px, mar transparente).
#   python scripts/map-base/build-natural.py            todos os ladrilhos (~3 min com os núcleos da máquina)
#   python scripts/map-base/build-natural.py 2 out.jpg  só o mundo num zoom, costurado numa imagem (para ajustar as cores)
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC = "public/maps/sat/bm-terra"

# paleta: (índice de vegetação, cor) — de deserto a floresta
MAP = "public/maps/meridiano-hd.pmtiles"
_reader = None

def land_mask(z, x, y):
    """A terra do mapa HD no ladrilho (512 px): os ladrilhos vetoriais do zoom seguinte, desenhados com o dobro da resolução e reduzidos (borda
    suave). Lagos e mar ficam transparentes, então a imagem casa com a costa e os lagos que o jogo desenha."""
    global _reader
    if _reader is None:
        from pmtiles.reader import MmapSource, Reader
        _reader = Reader(MmapSource(open(MAP, "rb")))
    sys.path.insert(0, "scripts/map-hd")
    from mvt_check import decode
    canvas = Image.new("L", (1024, 1024), 0)
    draw = ImageDraw.Draw(canvas)
    for dx in (0, 1):
        for dy in (0, 1):
            blob = _reader.get(z + 1, 2 * x + dx, 2 * y + dy)
            if not blob: continue
            polys = [poly for _, geom in decode(blob) if geom is not None for poly in geom.geoms]
            extent = 8192 if z + 1 >= 9 else 4096
            k = 512 / extent
            for poly in sorted(polys, key=lambda item: -item.area):  # as ilhas dos lagos (menores) por cima do lago
                ring = lambda coords: [(dx * 512 + px * k, dy * 512 + py * k) for px, py in coords]
                draw.polygon(ring(poly.exterior.coords), fill=255)
                for hole in poly.interiors: draw.polygon(ring(hole.coords), fill=0)
    return np.asarray(canvas.resize((512, 512), Image.BOX)).astype(np.float32)

def fill_water(rgb, keep, radius=6):
    """Troca os pixels de água da foto (mar, lagos, represas) pela média da terra em volta, para a cor da terra chegar até a costa do mapa."""
    w = keep.astype(np.float32)
    wb = np.asarray(Image.fromarray((w * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255
    out = rgb.copy()
    for c in range(3):
        cb = np.asarray(Image.fromarray((rgb[..., c] * w).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32)
        out[..., c] = np.where(keep, rgb[..., c], np.where(wb > 0.02, cb / np.maximum(wb, 1e-3), np.array([200, 196, 160])[c]))
    return out

PAD = 48

def padded(z, x, y):
    """O ladrilho com uma margem dos vizinhos (o mundo dá a volta na horizontal), para o desfoque e a classificação não deixarem emenda."""
    n = 2 ** z
    big = Image.new("RGBA", (512 + 2 * PAD, 512 + 2 * PAD), (0, 0, 0, 0))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            ty = y + dy
            if not 0 <= ty < n: continue
            p = f"{SRC}/{z}/{(x + dx) % n}/{ty}.webp"
            if os.path.exists(p): big.paste(Image.open(p).convert("RGBA"), (PAD + dx * 512, PAD + dy * 512))
    return big

def stylize(img, alpha):
    """img com margem PAD em volta; devolve o ladrilho de 512 px com a terra do mapa (alpha) como transparência."""
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb = a[..., :3]
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # a água da foto (o recorte do bm-terra e o mar fundo, quase preto, que ele deixou passar): azul acima do vermelho e do verde
    water = (a[..., 3] < 128) | ((B > R + 12) & (B > G - 4) & (R + G + B < 330))
    rgb = fill_water(rgb, ~water)
    # suaviza a foto antes de classificar (tira o ruído e o aspecto de foto)
    soft = np.asarray(Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32)
    r, g, b = soft[..., 0], soft[..., 1], soft[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    mx, mn = soft.max(-1), soft.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    # vegetação: verde acima do vermelho; aridez: vermelho bem acima do azul e claro
    veg = np.clip(((g - r) / np.maximum(g + r, 1)) * 3.6 + 0.58 - np.clip((lum - 80) / 130, 0, 1) * 0.55, 0, 1)
    sand = np.array([240, 230, 205]); dry = np.array([224, 216, 178]); grass = np.array([200, 221, 166]); forest = np.array([150, 194, 136])
    t = veg[..., None]
    col = np.where(t < 0.33, sand + (dry - sand) * (t / 0.33), np.where(t < 0.66, dry + (grass - dry) * ((t - 0.33) / 0.33), grass + (forest - grass) * ((t - 0.66) / 0.34)))
    # gelo e neve: claro e pouco saturado
    ice = np.clip((lum - 170) / 45, 0, 1) * np.clip((0.22 - sat) / 0.12, 0, 1)
    col = col + (np.array([246, 248, 248]) - col) * ice[..., None]
    # relevo: o detalhe de luz da foto (passa-alta), fraco
    base = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)
    detail = np.clip((lum - base) / 60, -1, 1)
    col = col * (1 + detail[..., None] * 0.16)
    col = col[PAD:PAD + 512, PAD:PAD + 512]
    out = np.dstack([np.clip(col, 0, 255), alpha]).astype(np.uint8)
    return Image.fromarray(out)

def stitch(z, out):
    n = 2 ** z; W = 512 * n
    canvas = Image.new("RGBA", (W, W), (170, 205, 230, 255))
    for x in range(n):
        for y in range(n):
            p = f"{SRC}/{z}/{x}/{y}.webp"
            if os.path.exists(p):
                t = stylize(padded(z, x, y), land_mask(z, x, y))
                canvas.alpha_composite(t, (x * 512, y * 512))
    canvas.convert("RGB").save(out, quality=88)

OUT = "public/maps/sat/natural"

def one(job):
    z, x, y = job
    stylize(padded(z, x, y), land_mask(z, x, y)).save(f"{OUT}/{z}/{x}/{y}.webp", "WEBP", quality=82, method=4)

def build_all():
    from multiprocessing import Pool
    jobs = []
    for z in range(6):
        for x in range(2 ** z):
            os.makedirs(f"{OUT}/{z}/{x}", exist_ok=True)
            jobs += [(z, x, y) for y in range(2 ** z) if os.path.exists(f"{SRC}/{z}/{x}/{y}.webp")]
    with Pool(max(1, (os.cpu_count() or 2) - 2)) as pool: pool.map(one, jobs, chunksize=8)
    print(f"ok: {len(jobs)} ladrilhos em {OUT}")

if __name__ == "__main__":
    if len(sys.argv) > 2: stitch(int(sys.argv[1]), sys.argv[2])
    else: build_all()
