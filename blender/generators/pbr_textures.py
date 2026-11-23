"""
High-Resolution Photorealistic PBR & Botanical Alpha-Card Texture Generator for Blender 5.3.
Synthesizes crisp 1024x1024 and 2048x2048 Albedo, Normal, Roughness, Emission, and Alpha-Cutout
botanical foliage textures (Momiji Maple sprays, Sugi Cedar boughs, Susuki Pampas plumes)
and packs them cleanly into Blender Principled BSDF materials for glTF/GLB export.
"""
import os
import math
import numpy as np
import bpy

TEX_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "textures")
os.makedirs(TEX_DIR, exist_ok=True)


def _hash_grid(gx, gy, seed=0):
    n = (gx * 374761393 + gy * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / float(0x1000000)


def tileable_noise(size, freq, seed=0):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / float(size)
    fx = x * freq
    fy = y * freq
    x0 = np.floor(fx).astype(np.int64)
    y0 = np.floor(fy).astype(np.int64)
    tx = fx - x0
    ty = fy - y0
    sx = tx * tx * tx * (tx * (tx * 6.0 - 15.0) + 10.0)
    sy = ty * ty * ty * (ty * (ty * 6.0 - 15.0) + 10.0)

    x0m = x0 % freq
    y0m = y0 % freq
    x1m = (x0 + 1) % freq
    y1m = (y0 + 1) % freq

    v00 = _hash_grid(x0m, y0m, seed)
    v10 = _hash_grid(x1m, y0m, seed)
    v01 = _hash_grid(x0m, y1m, seed)
    v11 = _hash_grid(x1m, y1m, seed)

    nx0 = v00 * (1.0 - sx) + v10 * sx
    nx1 = v01 * (1.0 - sx) + v11 * sx
    return (nx0 * (1.0 - sy) + nx1 * sy).astype(np.float32)


def fbm(size, base_freq=4, octaves=5, persistence=0.52, seed=0):
    total = np.zeros((size, size), dtype=np.float32)
    amp = 1.0
    norm = 0.0
    freq = base_freq
    for i in range(octaves):
        total += amp * tileable_noise(size, freq, seed + i * 37)
        norm += amp
        amp *= persistence
        freq *= 2
    return total / norm


def ridged_fbm(size, base_freq=4, octaves=5, persistence=0.52, seed=0):
    total = np.zeros((size, size), dtype=np.float32)
    amp = 1.0
    norm = 0.0
    freq = base_freq
    for i in range(octaves):
        n = tileable_noise(size, freq, seed + i * 43)
        r = 1.0 - np.abs(n * 2.0 - 1.0)
        total += amp * (r * r)
        norm += amp
        amp *= persistence
        freq *= 2
    return total / norm


def voronoi_pebbles(size, cells=24, seed=0):
    """Fast vectorized tileable Voronoi cellular height + cell ID map for crisp volcanic gravel pebbles!"""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / float(size) * cells
    ix = np.floor(x).astype(np.int64)
    iy = np.floor(y).astype(np.int64)

    min_d1 = np.full((size, size), 1e9, dtype=np.float32)
    min_d2 = np.full((size, size), 1e9, dtype=np.float32)
    cell_id = np.zeros((size, size), dtype=np.float32)

    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx = (ix + dx) % cells
            cy = (iy + dy) % cells
            rx = _hash_grid(cx, cy, seed)
            ry = _hash_grid(cx, cy, seed + 997)
            px = (ix + dx) + 0.15 + rx * 0.70
            py = (iy + dy) + 0.15 + ry * 0.70
            dist = np.sqrt((x - px) ** 2 + (y - py) ** 2)
            closer = dist < min_d1
            min_d2 = np.where(closer, min_d1, np.minimum(min_d2, dist))
            cell_id = np.where(closer, _hash_grid(cx, cy, seed + 2027), cell_id)
            min_d1 = np.where(closer, dist, min_d1)

    edge = np.clip((min_d2 - min_d1) * 2.8, 0.0, 1.0)
    dome = np.clip(1.0 - min_d1 * 1.35, 0.0, 1.0)
    height = np.sqrt(np.clip(edge * dome, 0.0, 1.0))
    return height, cell_id


def height_to_normal(height, strength=3.0):
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * strength
    nx = -dx
    ny = -dy
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    rgb = np.stack([(nx / length) * 0.5 + 0.5, (ny / length) * 0.5 + 0.5, (nz / length) * 0.5 + 0.5], axis=-1)
    return np.clip(rgb, 0.0, 1.0).astype(np.float32)


def save_image(name, arr, is_color=True):
    h, w = arr.shape[:2]
    has_alpha = (arr.ndim == 3 and arr.shape[2] == 4)
    if arr.ndim == 2:
        rgba = np.stack([arr, arr, arr, np.ones_like(arr)], axis=-1)
    elif arr.shape[2] == 3:
        rgba = np.concatenate([arr, np.ones((h, w, 1), dtype=np.float32)], axis=-1)
    else:
        rgba = arr

    filepath = os.path.join(TEX_DIR, f"{name}.png")
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=has_alpha)
    flipped = np.flipud(np.clip(rgba, 0.0, 1.0)).astype(np.float32)
    img.pixels.foreach_set(flipped.ravel())
    img.filepath_raw = filepath
    img.file_format = 'PNG'
    img.save()

    bpy.data.images.remove(img)
    loaded = bpy.data.images.load(filepath)
    loaded.colorspace_settings.name = 'sRGB' if is_color else 'Non-Color'
    loaded.pack()
    return loaded


def create_pbr_material(name, albedo_img=None, normal_img=None, rough_img=None,
                        emission_img=None, base_color=(0.5, 0.5, 0.5, 1.0),
                        metallic=0.0, roughness=0.5, normal_strength=1.0,
                        emission_strength=0.0, uv_scale=(1.0, 1.0), alpha_mode=None):
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (520, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (180, 0)
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-720, 0)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (-500, 0)
    mapping.inputs["Scale"].default_value = (uv_scale[0], uv_scale[1], 1.0)
    nt.links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    if albedo_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = albedo_img
        tex.location = (-220, 260)
        nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_mode in ('CLIP', 'BLEND'):
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            if hasattr(mat, "blend_method"):
                mat.blend_method = alpha_mode
            if alpha_mode == 'CLIP' and hasattr(mat, "alpha_threshold"):
                mat.alpha_threshold = 0.42

    if rough_img is not None:
        tex_r = nt.nodes.new("ShaderNodeTexImage")
        tex_r.image = rough_img
        tex_r.location = (-220, -20)
        nt.links.new(mapping.outputs["Vector"], tex_r.inputs["Vector"])
        nt.links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])

    if normal_img is not None:
        tex_n = nt.nodes.new("ShaderNodeTexImage")
        tex_n.image = normal_img
        tex_n.location = (-260, -300)
        nt.links.new(mapping.outputs["Vector"], tex_n.inputs["Vector"])
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.location = (-10, -280)
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    if emission_img is not None:
        tex_e = nt.nodes.new("ShaderNodeTexImage")
        tex_e.image = emission_img
        tex_e.location = (-220, -560)
        nt.links.new(mapping.outputs["Vector"], tex_e.inputs["Vector"])
        if "Emission Color" in bsdf.inputs:
            nt.links.new(tex_e.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = emission_strength

    return mat


def _generate_maple_branch_card(palette, name_prefix, seed=10):
    """
    Synthesize a crisp 512x512 botanical Japanese Maple (Momiji 紅葉) branchlet alpha-cutout card!
    Draws a woody forked twig + ~28 serrated 7-lobed Japanese maple leaves with realistic venation
    and rich natural color variation so trees look genuinely photographic instead of spheres!
    """
    S = 512
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / float(S)
    rgba = np.zeros((S, S, 4), dtype=np.float32)
    hmap = np.zeros((S, S), dtype=np.float32)
    rng = np.random.default_rng(seed)

    # 1. Draw delicate woody stem & side twigs from bottom-center (0.5, 0.98) up to (0.5, 0.14)
    def draw_twig(x0, y0, x1, y1, w0, w1):
        vx, vy = x1 - x0, y1 - y0
        l2 = vx * vx + vy * vy + 1e-8
        t = np.clip(((xx - x0) * vx + (yy - y0) * vy) / l2, 0.0, 1.0)
        px = x0 + vx * t
        py = y0 + vy * t
        d = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
        w = w0 * (1.0 - t) + w1 * t
        mask = d < w
        rgba[mask, 0] = 0.16
        rgba[mask, 1] = 0.11
        rgba[mask, 2] = 0.08
        rgba[mask, 3] = 1.0
        hmap[mask] = np.maximum(hmap[mask], 0.35)

    draw_twig(0.50, 0.98, 0.50, 0.22, 0.014, 0.004)
    draw_twig(0.50, 0.76, 0.24, 0.52, 0.009, 0.003)
    draw_twig(0.50, 0.72, 0.76, 0.48, 0.009, 0.003)
    draw_twig(0.50, 0.50, 0.28, 0.28, 0.007, 0.0025)
    draw_twig(0.50, 0.48, 0.72, 0.26, 0.007, 0.0025)

    # 2. Stamp 34 sharp 7-lobed Japanese Momiji maple leaves along the twigs!
    leaf_centers = [
        (0.50, 0.16), (0.40, 0.21), (0.60, 0.20), (0.28, 0.27), (0.72, 0.26),
        (0.35, 0.33), (0.65, 0.32), (0.50, 0.30), (0.20, 0.38), (0.80, 0.36),
        (0.42, 0.42), (0.58, 0.41), (0.25, 0.49), (0.75, 0.48), (0.34, 0.54),
        (0.66, 0.53), (0.16, 0.56), (0.84, 0.55), (0.48, 0.54), (0.28, 0.62),
        (0.72, 0.61), (0.40, 0.66), (0.60, 0.65), (0.22, 0.70), (0.78, 0.69),
        (0.46, 0.76), (0.56, 0.75), (0.34, 0.79), (0.66, 0.78), (0.50, 0.43),
        (0.32, 0.43), (0.68, 0.42), (0.44, 0.25), (0.57, 0.26),
    ]
    for cx, cy in leaf_centers:
        cx += rng.uniform(-0.025, 0.025)
        cy += rng.uniform(-0.025, 0.025)
        rot = rng.uniform(-math.pi, math.pi)
        rad = rng.uniform(0.085, 0.135)
        dx = xx - cx
        dy = yy - cy
        # Local rotated coordinates
        ca, sa = math.cos(rot), math.sin(rot)
        lx = dx * ca + dy * sa
        ly = -dx * sa + dy * ca
        r = np.sqrt(lx * lx + ly * ly) + 1e-6
        ang = np.arctan2(ly, lx)

        # Classic 7-lobed serrated Japanese Momiji star profile!
        # Main central lobe + 3 symmetric lateral pairs + fine serrated edges
        lobe_env = (
            0.48
            + 0.38 * np.power(np.maximum(0.0, np.cos((ang - 0.0) * 3.5)), 2.2)
            + 0.16 * np.cos(ang * 7.0)
            + 0.055 * np.sin(ang * 28.0)  # delicate serrated leaf margins!
        )
        # Cut notch at stem base (ang near ±pi)
        base_cut = 1.0 - 0.65 * np.exp(-((np.abs(ang) - math.pi) ** 2) / 0.22)
        leaf_r = rad * lobe_env * base_cut
        mask = r < leaf_r

        # Leaf coloration with vein darkening & warm translucent center glow
        base_c = palette[int(rng.integers(0, len(palette)))]
        shade = 0.78 + 0.32 * (1.0 - r / (leaf_r + 1e-5))
        vein = np.exp(-np.abs(np.sin(ang * 3.5)) * 18.0) * 0.18
        edge_tint = np.clip((r / (leaf_r + 1e-5) - 0.65) * 2.5, 0.0, 1.0) * 0.15

        col_r = np.clip(base_c[0] * shade - vein * 0.25 + edge_tint, 0.0, 1.0)
        col_g = np.clip(base_c[1] * shade - vein * 0.18 - edge_tint * 0.2, 0.0, 1.0)
        col_b = np.clip(base_c[2] * shade - vein * 0.12, 0.0, 1.0)

        rgba[mask, 0] = col_r[mask]
        rgba[mask, 1] = col_g[mask]
        rgba[mask, 2] = col_b[mask]
        rgba[mask, 3] = 1.0
        hmap[mask] = np.clip(0.55 + (1.0 - r[mask] / (leaf_r[mask] + 1e-5)) * 0.35 - vein[mask], 0.0, 1.0)

    albedo_img = save_image(f"{name_prefix}_albedo", rgba, is_color=True)
    normal_img = save_image(f"{name_prefix}_normal", height_to_normal(hmap, 3.0), is_color=False)
    return create_pbr_material(
        f"Mat_{name_prefix}",
        albedo_img=albedo_img,
        normal_img=normal_img,
        roughness=0.58,
        normal_strength=0.75,
        alpha_mode='CLIP',
    )


def _generate_cedar_bough_card():
    """
    Synthesize a crisp 512x512 feathered Japanese Cedar (杉木 Sugi) evergreen conifer bough card!
    """
    S = 512
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / float(S)
    rgba = np.zeros((S, S, 4), dtype=np.float32)
    hmap = np.zeros((S, S), dtype=np.float32)
    rng = np.random.default_rng(707)

    # Central woody branch + 9 paired feathery conifer needle sprays
    def draw_needle_cluster(x0, y0, x1, y1, width, color_var):
        vx, vy = x1 - x0, y1 - y0
        length = math.hypot(vx, vy) + 1e-6
        ux, uy = vx / length, vy / length
        px, py = -uy, ux
        # Project grid onto local spray coords (s along spray, t perpendicular)
        dx, dy = xx - x0, yy - y0
        s = (dx * ux + dy * uy) / length
        t = (dx * px + dy * py) / width
        # Feathered fine pine needles radiating outward from central rib
        needle_ribs = 0.55 + 0.45 * np.sin((s * 26.0 - np.abs(t) * 3.8) * math.pi)
        env = np.maximum(0.0, np.sin(np.clip(s, 0.0, 1.0) * math.pi)) ** 0.55
        mask = (s >= -0.02) & (s <= 1.03) & (np.abs(t) < env * (0.62 + 0.46 * needle_ribs))

        # Rich sunlit Japanese Sugi conifer green (warm natural forest tones, not pitch black!)
        tip = np.clip(s * 0.65 + np.abs(t) * 0.45, 0.0, 1.0)
        cr = 0.075 + tip * 0.095 + color_var * 0.035
        cg = 0.175 + tip * 0.165 + color_var * 0.045
        cb = 0.068 + tip * 0.055
        rgba[mask, 0] = cr[mask]
        rgba[mask, 1] = cg[mask]
        rgba[mask, 2] = cb[mask]
        rgba[mask, 3] = 1.0
        hmap[mask] = np.maximum(hmap[mask], (0.4 + 0.45 * needle_ribs[mask]))

    # Central leader spray
    draw_needle_cluster(0.50, 0.96, 0.50, 0.05, 0.13, 0.2)
    # 10 paired lateral conifer sprays
    for k in range(6):
        y_base = 0.86 - k * 0.135
        spread = (0.40 - k * 0.045)
        for side in (-1, 1):
            draw_needle_cluster(
                0.50, y_base,
                0.50 + side * spread, y_base - 0.18,
                0.105 - k * 0.008,
                float(rng.uniform(-0.3, 0.5)),
            )
            draw_needle_cluster(
                0.50 + side * spread * 0.45, y_base - 0.08,
                0.50 + side * (spread * 0.92), y_base - 0.26,
                0.085,
                float(rng.uniform(-0.2, 0.6)),
            )

    albedo_img = save_image("cedar_bough_albedo", rgba, is_color=True)
    normal_img = save_image("cedar_bough_normal", height_to_normal(hmap, 3.5), is_color=False)
    return create_pbr_material(
        "Mat_CedarBough",
        albedo_img=albedo_img,
        normal_img=normal_img,
        roughness=0.74,
        normal_strength=0.9,
        alpha_mode='CLIP',
    )


def _generate_pampas_plume_card():
    """Synthesize a delicate, wispy sunlit autumn Japanese Susuki pampas plume (no stiff kite triangles!)."""
    S = 256
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / float(S)
    rgba = np.zeros((S, S, 4), dtype=np.float32)
    cx = 0.48 + 0.10 * ((1.0 - yy) ** 1.8)
    dx = np.abs(xx - cx)
    # Fine vertical wispy silk fibers radiating softly off the central stalk
    fibers = np.sin((xx * 95.0 + yy * 28.0) * math.pi) * 0.5 + 0.5
    wisps = fbm(S, 18, 4, 0.62, seed=808)
    env = np.maximum(0.0, np.sin(np.clip((1.0 - yy) * 1.08, 0.0, 1.0) * math.pi)) ** 0.85
    width = 0.16 * env * (0.35 + 0.65 * wisps * (0.5 + 0.5 * fibers))
    alpha = np.clip((width - dx) / 0.035, 0.0, 1.0) * (0.45 + 0.55 * fibers)
    stem = (yy > 0.65) & (dx < 0.012)
    alpha = np.where(stem, 1.0, alpha)

    rgba[..., 0] = 0.84 + wisps * 0.14
    rgba[..., 1] = 0.76 + wisps * 0.14
    rgba[..., 2] = 0.58 + wisps * 0.12
    rgba[..., 3] = alpha

    img = save_image("pampas_plume_albedo", rgba, is_color=True)
    return create_pbr_material(
        "Mat_PampasPlume",
        albedo_img=img,
        roughness=0.84,
        alpha_mode='CLIP',
    )


def generate_all_materials():
    """Synthesize and register the complete high-resolution realistic Japanese camp PBR material library."""
    mats = {}
    S = 512
    S_HI = 1024

    # 1. HIGH-RES 1024x1024 Volcanic Black Sand & Basalt Pebble Beach (Koan Motosuko Shoreline!)
    peb_large, cid_large = voronoi_pebbles(S_HI, cells=22, seed=101)
    peb_med, cid_med = voronoi_pebbles(S_HI, cells=48, seed=102)
    peb_fine = tileable_noise(S_HI, 128, seed=103)
    sand_macro = fbm(S_HI, 6, 4, 0.55, seed=104)

    # Blend multi-scale real volcanic basalt pebbles over dark Fuji volcanic grit
    pebble_h = np.maximum(peb_large * 0.75, peb_med * 0.58) * 0.72 + peb_fine * 0.18 + sand_macro * 0.10
    col = np.zeros((S_HI, S_HI, 3), dtype=np.float32)
    # Individual pebble color diversity: charcoal basalt, dark slate grey, warm volcanic brown-grey
    stone_tone = 0.11 + cid_large * 0.14 + cid_med * 0.08 + pebble_h * 0.12
    col[..., 0] = stone_tone * (0.98 + (cid_large - 0.5) * 0.18)
    col[..., 1] = stone_tone * (0.94 + (cid_med - 0.5) * 0.12)
    col[..., 2] = stone_tone * (0.90 + (0.5 - cid_large) * 0.14)

    # Darken crevices between pebbles for realistic baked micro-AO!
    crevice_ao = np.clip(0.45 + pebble_h * 0.85, 0.35, 1.0)
    col *= crevice_ao[..., None]

    # Subtle scattered fallen autumn needles & dried leaf flecks
    needle_mask = np.clip((fbm(S_HI, 16, 4, 0.55, seed=105) - 0.63) * 4.5, 0, 1) * (1.0 - peb_large * 0.6)
    col[..., 0] = col[..., 0] * (1 - needle_mask * 0.55) + 0.34 * (needle_mask * 0.55)
    col[..., 1] = col[..., 1] * (1 - needle_mask * 0.55) + 0.17 * (needle_mask * 0.55)
    col[..., 2] = col[..., 2] * (1 - needle_mask * 0.55) + 0.07 * (needle_mask * 0.55)

    rough = np.clip(0.86 - peb_large * 0.28 + (1.0 - crevice_ao) * 0.15, 0.48, 0.96)
    mats["volcanic_ground"] = create_pbr_material(
        "Mat_VolcanicGround",
        albedo_img=save_image("volcanic_ground_albedo", col, True),
        normal_img=save_image("volcanic_ground_normal", height_to_normal(pebble_h, 7.5), False),
        rough_img=save_image("volcanic_ground_rough", rough, False),
        normal_strength=1.35,
        uv_scale=(34.0, 34.0),
    )

    # 2. HIGH-RES 1024x1024 Heavy Woven Cotton-Poly TC Canvas Tent Fabric (Nordisk / Tent-Mark Circus TC)
    y_hi, x_hi = np.mgrid[0:S_HI, 0:S_HI].astype(np.float32)
    # Fine woven canvas threads + subtle ripstop crosshatch + tension creases
    weave_x = np.sin(x_hi * 2 * math.pi * 160 / S_HI) * 0.5 + 0.5
    weave_y = np.sin(y_hi * 2 * math.pi * 160 / S_HI) * 0.5 + 0.5
    ripstop = ((x_hi % 32) < 2).astype(np.float32) * 0.35 + ((y_hi % 32) < 2).astype(np.float32) * 0.35
    weave = weave_x * 0.4 + weave_y * 0.4 + ripstop * 0.2
    crease = fbm(S_HI, 5, 4, 0.52, seed=201)
    h_canvas = weave * 0.42 + crease * 0.58

    c_canvas = np.zeros((S_HI, S_HI, 3), dtype=np.float32)
    # Warm sand-ivory Japanese TC cotton tone
    c_canvas[..., 0] = 0.79 - crease * 0.08 + weave * 0.028
    c_canvas[..., 1] = 0.72 - crease * 0.08 + weave * 0.024
    c_canvas[..., 2] = 0.58 - crease * 0.07 + weave * 0.020
    r_canvas = np.clip(0.84 + crease * 0.10 - weave * 0.05, 0.72, 0.96)
    mats["tent_canvas"] = create_pbr_material(
        "Mat_TentCanvas",
        albedo_img=save_image("tent_canvas_albedo", c_canvas, True),
        normal_img=save_image("tent_canvas_normal", height_to_normal(h_canvas, 3.0), False),
        rough_img=save_image("tent_canvas_rough", r_canvas, False),
        normal_strength=0.75,
        uv_scale=(3.5, 3.5),
    )

    # Tent khaki/olive cordura trim & seam tape
    c_trim = c_canvas[::2, ::2].copy()
    c_trim[..., 0] *= 0.36
    c_trim[..., 1] *= 0.40
    c_trim[..., 2] *= 0.30
    mats["tent_trim"] = create_pbr_material(
        "Mat_TentTrim",
        albedo_img=save_image("tent_trim_albedo", c_trim, True),
        normal_img=save_image("tent_trim_normal", height_to_normal(h_canvas[::2, ::2], 2.5), False),
        roughness=0.86,
        uv_scale=(4.0, 4.0),
    )

    # Dark insect-mesh window screen for tent vents/windows
    mesh_pat = ((x_hi[:S, :S] % 8 < 2) | (y_hi[:S, :S] % 8 < 2)).astype(np.float32)
    c_mesh = np.stack([mesh_pat * 0.08 + 0.04] * 3, axis=-1).astype(np.float32)
    mats["tent_mesh"] = create_pbr_material(
        "Mat_TentMesh",
        albedo_img=save_image("tent_mesh_albedo", c_mesh, True),
        roughness=0.78,
        uv_scale=(6.0, 6.0),
    )

    # Pendleton / Native Japanese Camp Wool Blanket & Tent Rug!
    u_r = (x_hi[:S, :S] / float(S))
    v_r = (y_hi[:S, :S] / float(S))
    stripe = (
        np.sin(v_r * math.pi * 12.0) * 0.5 + 0.5
    )
    diamond = np.abs(((u_r * 8.0) % 1.0) - 0.5) + np.abs(((v_r * 6.0) % 1.0) - 0.5)
    geo_mask = ((diamond < 0.35) & (diamond > 0.22)).astype(np.float32)
    c_rug = np.zeros((S, S, 3), dtype=np.float32)
    # Warm terracotta, deep navy, cream & mustard camp wool weave
    c_rug[..., 0] = 0.48 * (1 - stripe * 0.4) + 0.35 * geo_mask
    c_rug[..., 1] = 0.20 * (1 - stripe * 0.3) + 0.28 * geo_mask
    c_rug[..., 2] = 0.14 + stripe * 0.16 + 0.12 * geo_mask
    c_rug *= (0.88 + weave[:S, :S] * 0.22)[..., None]
    mats["camp_wool"] = create_pbr_material(
        "Mat_CampWool",
        albedo_img=save_image("camp_wool_albedo", c_rug, True),
        normal_img=save_image("camp_wool_normal", height_to_normal(weave[:S, :S], 3.2), False),
        roughness=0.92,
    )

    # 3. Warm Oiled Japanese Walnut / Oak Wood (1024x1024 for close-up table & Kermit chair!)
    u = x_hi / float(S_HI)
    warp = fbm(S_HI, 4, 4, 0.55, seed=301) * 0.18
    rings = np.sin((u * 16.0 + warp * 13.0) * math.pi * 2.0) * 0.5 + 0.5
    fibers = tileable_noise(S_HI, 128, seed=302) * 0.32 + fbm(S_HI, 16, 4, 0.52, seed=303) * 0.68
    grain = rings * 0.55 + fibers * 0.45
    c_wood = np.zeros((S_HI, S_HI, 3), dtype=np.float32)
    c_wood[..., 0] = 0.26 + grain * 0.25
    c_wood[..., 1] = 0.145 + grain * 0.145
    c_wood[..., 2] = 0.068 + grain * 0.070
    r_wood = np.clip(0.36 + (1.0 - grain) * 0.28, 0.24, 0.68)
    mats["camp_wood"] = create_pbr_material(
        "Mat_CampWood",
        albedo_img=save_image("camp_wood_albedo", c_wood, True),
        normal_img=save_image("camp_wood_normal", height_to_normal(grain, 2.8), False),
        rough_img=save_image("camp_wood_rough", r_wood, False),
        normal_strength=0.65,
        uv_scale=(1.5, 1.5),
    )

    # 4. Split Hinoki Firewood Inner Face + Concentric Growth-Ring End Grain!
    g512 = grain[::2, ::2]
    c_split = np.zeros((S, S, 3), dtype=np.float32)
    c_split[..., 0] = 0.62 + g512 * 0.24
    c_split[..., 1] = 0.45 + g512 * 0.20
    c_split[..., 2] = 0.24 + g512 * 0.13
    r_split = np.clip(0.76 + (1.0 - g512) * 0.18, 0.64, 0.94)
    mats["hinoki_split"] = create_pbr_material(
        "Mat_HinokiSplit",
        albedo_img=save_image("hinoki_split_albedo", c_split, True),
        normal_img=save_image("hinoki_split_normal", height_to_normal(g512, 4.0), False),
        rough_img=save_image("hinoki_split_rough", r_split, False),
        normal_strength=0.95,
    )

    # Concentric cut-stump end-grain with radial drying cracks!
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / float(S) - 0.5
    rad_e = np.sqrt(xx * xx + yy * yy) * 2.0
    ang_e = np.arctan2(yy, xx)
    wobble = fbm(S, 6, 3, 0.5, seed=315) * 0.07
    growth_rings = np.sin((rad_e + wobble) * 42.0) * 0.5 + 0.5
    crack_mask = np.clip(np.exp(-np.abs(ang_e - 0.4) * 32.0) + np.exp(-np.abs(ang_e + 2.1) * 28.0), 0, 1) * np.clip(rad_e * 1.6, 0, 1)
    c_end = np.zeros((S, S, 3), dtype=np.float32)
    c_end[..., 0] = (0.52 + growth_rings * 0.26) * (1.0 - crack_mask * 0.72)
    c_end[..., 1] = (0.37 + growth_rings * 0.20) * (1.0 - crack_mask * 0.72)
    c_end[..., 2] = (0.20 + growth_rings * 0.12) * (1.0 - crack_mask * 0.72)
    mats["wood_endgrain"] = create_pbr_material(
        "Mat_WoodEndgrain",
        albedo_img=save_image("wood_endgrain_albedo", c_end, True),
        normal_img=save_image("wood_endgrain_normal", height_to_normal(growth_rings * 0.5 - crack_mask * 0.8, 5.0), False),
        roughness=0.84,
        normal_strength=1.1,
    )

    # 5. Deep Fibrous Cedar / Oak Bark (1024x1024)
    bark_v = fbm(S_HI, 8, 5, 0.6, seed=401)
    ridges = np.abs(np.sin((u * 22.0 + bark_v * 1.8) * math.pi))
    bark_h = np.clip(ridges * 0.64 + bark_v * 0.36, 0, 1)
    c_bark = np.zeros((S_HI, S_HI, 3), dtype=np.float32)
    c_bark[..., 0] = 0.13 + bark_h * 0.18
    c_bark[..., 1] = 0.092 + bark_h * 0.125
    c_bark[..., 2] = 0.064 + bark_h * 0.082
    # Subtle silver-green Japanese forest lichen flecks on tree bark
    lichen = np.clip((fbm(S_HI, 10, 3, 0.5, seed=405) - 0.68) * 5.0, 0, 1)
    c_bark[..., 0] = c_bark[..., 0] * (1 - lichen * 0.45) + 0.32 * (lichen * 0.45)
    c_bark[..., 1] = c_bark[..., 1] * (1 - lichen * 0.45) + 0.38 * (lichen * 0.45)
    c_bark[..., 2] = c_bark[..., 2] * (1 - lichen * 0.45) + 0.28 * (lichen * 0.45)
    r_bark = np.clip(0.92 - bark_h * 0.12, 0.78, 0.98)
    mats["bark"] = create_pbr_material(
        "Mat_Bark",
        albedo_img=save_image("bark_albedo", c_bark, True),
        normal_img=save_image("bark_normal", height_to_normal(bark_h, 7.5), False),
        rough_img=save_image("bark_rough", r_bark, False),
        normal_strength=1.35,
        uv_scale=(2.0, 2.0),
    )

    # 6. Seasoned Cast Iron (Skillet, Grate, Hatchet Forged Head)
    iron_n = fbm(S, 32, 4, 0.55, seed=501)
    iron_micro = tileable_noise(S, 128, seed=502)
    iron_h = iron_n * 0.5 + iron_micro * 0.5
    c_iron = np.zeros((S, S, 3), dtype=np.float32)
    c_iron[..., 0] = 0.048 + iron_h * 0.048
    c_iron[..., 1] = 0.048 + iron_h * 0.048
    c_iron[..., 2] = 0.052 + iron_h * 0.052
    r_iron = np.clip(0.32 + iron_n * 0.24, 0.22, 0.62)
    mats["cast_iron"] = create_pbr_material(
        "Mat_CastIron",
        albedo_img=save_image("cast_iron_albedo", c_iron, True),
        normal_img=save_image("cast_iron_normal", height_to_normal(iron_h, 3.2), False),
        rough_img=save_image("cast_iron_rough", r_iron, False),
        metallic=0.88,
        normal_strength=0.75,
    )

    # 7. Brushed Stainless Steel & Heat-Tinted Titanium
    brush = tileable_noise(S, 64, seed=601)
    brush_h = np.mean(np.stack([np.roll(brush, i, axis=1) for i in range(-4, 5)], axis=0), axis=0)
    heat_tint = fbm(S, 4, 3, 0.5, seed=602)
    c_steel = np.zeros((S, S, 3), dtype=np.float32)
    c_steel[..., 0] = 0.70 + brush_h * 0.14 - heat_tint * 0.06
    c_steel[..., 1] = 0.71 + brush_h * 0.13 - heat_tint * 0.09
    c_steel[..., 2] = 0.73 + brush_h * 0.12 - heat_tint * 0.04
    r_steel = np.clip(0.22 + brush_h * 0.18 + heat_tint * 0.08, 0.14, 0.52)
    mats["brushed_steel"] = create_pbr_material(
        "Mat_BrushedSteel",
        albedo_img=save_image("brushed_steel_albedo", c_steel, True),
        normal_img=save_image("brushed_steel_normal", height_to_normal(brush_h, 1.8), False),
        rough_img=save_image("brushed_steel_rough", r_steel, False),
        metallic=0.95,
        normal_strength=0.5,
    )

    c_ti = c_steel.copy()
    c_ti[..., 0] *= 0.85
    c_ti[..., 1] *= 0.86
    c_ti[..., 2] *= 0.90
    mats["titanium"] = create_pbr_material(
        "Mat_Titanium",
        albedo_img=save_image("titanium_albedo", c_ti, True),
        rough_img=save_image("titanium_rough", np.clip(r_steel + 0.12, 0.24, 0.58), False),
        metallic=0.92,
    )

    # 8. Aged Brass & Forest-Green Enamel & Matte Black
    patina = fbm(S, 8, 4, 0.5, seed=701)
    c_brass = np.zeros((S, S, 3), dtype=np.float32)
    c_brass[..., 0] = 0.74 - patina * 0.22
    c_brass[..., 1] = 0.55 - patina * 0.18
    c_brass[..., 2] = 0.23 - patina * 0.09
    mats["brass"] = create_pbr_material(
        "Mat_Brass",
        albedo_img=save_image("brass_albedo", c_brass, True),
        rough_img=save_image("brass_rough", np.clip(0.22 + patina * 0.28, 0.16, 0.58), False),
        metallic=0.93,
    )

    c_enamel = np.zeros((S, S, 3), dtype=np.float32)
    c_enamel[..., 0] = 0.05 + patina * 0.03
    c_enamel[..., 1] = 0.18 + patina * 0.05
    c_enamel[..., 2] = 0.11 + patina * 0.035
    mats["enamel_green"] = create_pbr_material(
        "Mat_EnamelGreen",
        albedo_img=save_image("enamel_green_albedo", c_enamel, True),
        metallic=0.15,
        roughness=0.18,
    )

    mats["matte_black"] = create_pbr_material(
        "Mat_MatteBlack",
        base_color=(0.045, 0.047, 0.050, 1.0),
        metallic=0.38,
        roughness=0.34,
    )

    # 9. Charcoal & Glowing Embers
    char_n = fbm(S, 12, 5, 0.6, seed=801)
    cracks = np.clip(1.0 - np.abs(char_n - 0.5) * 14.0, 0.0, 1.0)
    c_char = np.zeros((S, S, 3), dtype=np.float32)
    c_char[..., 0] = 0.03 + char_n * 0.04
    c_char[..., 1] = 0.028 + char_n * 0.035
    c_char[..., 2] = 0.028 + char_n * 0.035
    e_char = np.zeros((S, S, 3), dtype=np.float32)
    e_char[..., 0] = cracks
    e_char[..., 1] = (cracks ** 2) * 0.38
    e_char[..., 2] = (cracks ** 4) * 0.05
    mats["charcoal"] = create_pbr_material(
        "Mat_Charcoal",
        albedo_img=save_image("charcoal_albedo", c_char, True),
        normal_img=save_image("charcoal_normal", height_to_normal(char_n, 6.0), False),
        emission_img=save_image("charcoal_emissive", e_char, True),
        roughness=0.92,
        normal_strength=1.25,
        emission_strength=2.2,
    )

    # 10. A5 Wagyu Steak (Rich marbled Japanese beef!)
    meat_n = fbm(S, 10, 4, 0.55, seed=901)
    marble = np.clip(1.0 - np.abs(fbm(S, 14, 4, 0.6, seed=902) - 0.52) * 16.0, 0.0, 1.0)
    c_meat = np.zeros((S, S, 3), dtype=np.float32)
    c_meat[..., 0] = 0.46 + meat_n * 0.14 + marble * 0.42
    c_meat[..., 1] = 0.10 + meat_n * 0.05 + marble * 0.72
    c_meat[..., 2] = 0.09 + meat_n * 0.04 + marble * 0.68
    mats["wagyu_raw"] = create_pbr_material(
        "Mat_WagyuRaw",
        albedo_img=save_image("wagyu_raw_albedo", c_meat, True),
        normal_img=save_image("wagyu_raw_normal", height_to_normal(meat_n * 0.6 + marble * 0.4, 2.8), False),
        rough_img=save_image("wagyu_raw_rough", np.clip(0.30 + meat_n * 0.18 - marble * 0.1, 0.16, 0.54), False),
        normal_strength=0.7,
    )

    # 11. Rugged Porous Fuji Volcanic Basalt Boulder (1024x1024!)
    rock_n = ridged_fbm(S_HI, 6, 5, 0.58, seed=1001)
    pores = tileable_noise(S_HI, 96, seed=1002)
    rock_h = rock_n * 0.72 + pores * 0.28
    c_rock = np.zeros((S_HI, S_HI, 3), dtype=np.float32)
    c_rock[..., 0] = 0.13 + rock_h * 0.18
    c_rock[..., 1] = 0.128 + rock_h * 0.175
    c_rock[..., 2] = 0.135 + rock_h * 0.17
    moss = np.clip((fbm(S_HI, 6, 4, 0.55, seed=1003) - 0.58) * 4.5, 0, 1)
    c_rock[..., 0] = c_rock[..., 0] * (1 - moss * 0.55) + 0.11 * (moss * 0.55)
    c_rock[..., 1] = c_rock[..., 1] * (1 - moss * 0.55) + 0.23 * (moss * 0.55)
    c_rock[..., 2] = c_rock[..., 2] * (1 - moss * 0.55) + 0.08 * (moss * 0.55)
    mats["basalt_rock"] = create_pbr_material(
        "Mat_BasaltRock",
        albedo_img=save_image("basalt_rock_albedo", c_rock, True),
        normal_img=save_image("basalt_rock_normal", height_to_normal(rock_h, 7.5), False),
        roughness=0.84,
        normal_strength=1.35,
        uv_scale=(2.0, 2.0),
    )

    # 12. REAL BOTANICAL ALPHA-CUTOUT FOLIAGE CARDS (No more sphere blobs!!)
    mats["cedar_bough"] = _generate_cedar_bough_card()
    mats["maple_red_card"] = _generate_maple_branch_card(
        palette=[
            (0.66, 0.10, 0.04),
            (0.82, 0.19, 0.05),
            (0.52, 0.06, 0.03),
            (0.88, 0.34, 0.06),
            (0.74, 0.14, 0.04),
        ],
        name_prefix="MapleRedCard",
        seed=1201,
    )
    mats["maple_gold_card"] = _generate_maple_branch_card(
        palette=[
            (0.88, 0.54, 0.07),
            (0.94, 0.68, 0.10),
            (0.78, 0.34, 0.06),
            (0.85, 0.44, 0.06),
            (0.68, 0.48, 0.08),
        ],
        name_prefix="MapleGoldCard",
        seed=1202,
    )
    mats["shrub_green_card"] = _generate_maple_branch_card(
        palette=[
            (0.28, 0.44, 0.11),
            (0.42, 0.52, 0.12),
            (0.58, 0.54, 0.11),
            (0.20, 0.34, 0.09),
            (0.68, 0.44, 0.09),
        ],
        name_prefix="ShrubGreenCard",
        seed=1203,
    )
    mats["pampas_plume"] = _generate_pampas_plume_card()

    # 13. Duck-Canvas Olive Chair Fabric, Clear Glass, Ceramic, Coffee, Rope
    c_chair = c_canvas[::2, ::2].copy()
    c_chair[..., 0] *= 0.28
    c_chair[..., 1] *= 0.34
    c_chair[..., 2] *= 0.24
    mats["chair_fabric"] = create_pbr_material(
        "Mat_ChairFabric",
        albedo_img=save_image("chair_fabric_albedo", c_chair, True),
        normal_img=save_image("chair_fabric_normal", height_to_normal(h_canvas[::2, ::2], 2.5), False),
        roughness=0.88,
        uv_scale=(3.0, 3.0),
    )

    mats["clear_glass"] = create_pbr_material(
        "Mat_ClearGlass",
        base_color=(0.88, 0.94, 0.96, 0.28),
        metallic=0.05,
        roughness=0.06,
    )
    for node in mats["clear_glass"].node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            node.inputs["Alpha"].default_value = 0.26

    mats["ceramic_white"] = create_pbr_material("Mat_CeramicWhite", base_color=(0.92, 0.90, 0.86, 1.0), roughness=0.16)
    mats["coffee_grounds"] = create_pbr_material("Mat_CoffeeGrounds", base_color=(0.14, 0.075, 0.04, 1.0), roughness=0.95)
    mats["rope"] = create_pbr_material("Mat_Rope", base_color=(0.74, 0.65, 0.49, 1.0), roughness=0.88)
    mats["grass_blade"] = create_pbr_material("Mat_GrassBlade", base_color=(0.36, 0.34, 0.20, 1.0), roughness=0.78)

    return mats
