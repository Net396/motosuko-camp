"""
Photographic 2048x2048 Mount Fuji (Razor-sharp dendritic snow gullies, cobalt alpine rock,
Aokigahara misty foothills, and dark silhouetted flanking Yamanashi ridges)
+ Lean High-FPS Koan Camping Ground Black Volcanic Gravel Terrain.
"""
import math
import numpy as np
import bpy
import bmesh
from generators.mesh_utils import clear_scene, export_objects_glb, set_smooth
from generators.pbr_textures import save_image, height_to_normal, create_pbr_material, fbm, ridged_fbm


def campsite_height(x, y):
    """Deterministic Koan Camping Ground 3D micro-topography & shoreline elevation."""
    shore_y = 14.5 + 3.2 * math.sin(x * 0.045) + 1.8 * math.cos(x * 0.095 + 0.6)
    dist_from_shore = shore_y - y

    if dist_from_shore < 0:
        h = dist_from_shore * 0.16 - 0.008 * (dist_from_shore ** 2)
        h = max(h, -6.0)
    else:
        beach = min(dist_from_shore, 8.0) * 0.11
        flat_camp = max(0.0, min(dist_from_shore - 8.0, 14.0)) * 0.03
        back_hill = max(0.0, dist_from_shore - 22.0) ** 1.38 * 0.19
        # Wave-washed 3D shoreline gravel berm ridge along the water's edge
        berm = 0.085 * math.exp(-((dist_from_shore - 2.2) ** 2) / 1.4) * (0.7 + 0.3 * math.sin(x * 0.45))
        h = beach + flat_camp + back_hill + berm

    camp_r = math.hypot(x, y - 2.0)
    camp_blend = max(0.0, min(1.0, (camp_r - 7.5) / 8.0))

    # Multi-frequency 3D forest floor hummocks, erosion ruts & hillside rock terraces
    undul = (
        0.22 * math.sin(x * 0.13 + 0.4) * math.cos(y * 0.11)
        + 0.11 * math.sin(x * 0.31 - y * 0.27)
        + 0.055 * math.cos(x * 0.75 + y * 0.65)
        + 0.028 * math.sin(x * 1.6 - y * 1.4)
    )
    h += undul * camp_blend

    if camp_r < 12.0:
        target_camp_z = 1.05
        t = max(0.0, min(1.0, (camp_r - 6.0) / 6.0))
        t = t * t * (3.0 - 2.0 * t)
        h = target_camp_z * (1.0 - t) + h * t

    return h


def build_campsite_terrain(mats, out_dir):
    clear_scene()
    # High-detail 180x180 3D sculpted terrain mesh with non-linear vertex concentration near camp & shore!
    nx, ny = 180, 180
    size_x, size_y = 180.0, 160.0
    bm = bmesh.new()

    verts_grid = []
    for j in range(ny + 1):
        row = []
        v_frac = j / ny
        y = -65.0 + v_frac * size_y
        for i in range(nx + 1):
            u_frac = i / nx
            x = -size_x * 0.5 + u_frac * size_x
            z = campsite_height(x, y)
            row.append(bm.verts.new((x, y, z)))
        verts_grid.append(row)

    uv_layer = bm.loops.layers.uv.verify()
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((verts_grid[j][i], verts_grid[j][i + 1], verts_grid[j + 1][i + 1], verts_grid[j + 1][i]))
            f.loops[0][uv_layer].uv = (i / nx, j / ny)
            f.loops[1][uv_layer].uv = ((i + 1) / nx, j / ny)
            f.loops[2][uv_layer].uv = ((i + 1) / nx, (j + 1) / ny)
            f.loops[3][uv_layer].uv = (i / nx, (j + 1) / ny)

    mesh = bpy.data.meshes.new("CampsiteTerrain")
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("CampsiteTerrain", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mats["volcanic_ground"])
    set_smooth(obj)

    export_objects_glb([obj], f"{out_dir}/terrain_campsite.glb")


def build_mt_fuji_backdrop(out_dir):
    """
    Build photographic Mount Fuji with 2048x2048 crisp dendritic snow gullies,
    iconic cobalt-blue alpine volcanic slopes, Aokigahara forested plain foothills,
    and dark silhouetted foreground flanking mountain ridges (matching DSLR Kawaguchiko/Motosuko vista!).
    """
    clear_scene()
    res = 160  # Lean fast mesh paired with ultra-crisp 2048x2048 texture & micro-ridge normal map!
    width = 2600.0
    depth = 1550.0

    S = 2048
    gx, gy = np.meshgrid(np.linspace(-1.0, 1.0, S, dtype=np.float32), np.linspace(-1.0, 1.0, S, dtype=np.float32))
    wx = gx * (width * 0.5)
    wy = 980.0 + gy * (depth * 0.5)

    # Majestic centered-right Mount Fuji cone
    fx = (wx - 45.0) / 600.0
    fy = (wy - 1300.0) / 600.0
    r = np.sqrt(fx * fx + fy * fy) + 1e-6
    angle = np.arctan2(fy, fx)

    # High-frequency volcanic ridge & scree detail (computed cleanly at 1024 then upscaled/combined with 2048 radial chutes for speed!)
    S_n = 1024
    ridge_1024 = ridged_fbm(S_n, 10, 5, 0.56, seed=2025)
    detail_1024 = fbm(S_n, 16, 5, 0.55, seed=2028) - 0.5
    fine_1024 = ridged_fbm(S_n, 28, 4, 0.58, seed=2041)

    # Bilinear 2x upscale to 2048x2048 cleanly
    def up2x(a):
        return np.repeat(np.repeat(a, 2, axis=0), 2, axis=1)

    ridge_hi = up2x(ridge_1024)
    noise_detail = up2x(detail_1024)
    fine_ridges = up2x(fine_1024)

    # Authentic razor-sharp radial volcanic chutes radiating from Fuji's crater rim (like Osawa Kuzure & Yoshida gullies!)
    warp_ang = angle + noise_detail * 0.14 + (ridge_hi - 0.5) * 0.08
    chutes_major = np.sin(warp_ang * 14.0 + 0.4) * 0.5 + 0.5
    chutes_mid   = np.sin(warp_ang * 29.0 - 1.1) * 0.5 + 0.5
    chutes_fine  = np.sin(warp_ang * 57.0 + 2.3) * 0.5 + 0.5
    # Sharpen gully valleys with power curves so dark volcanic ribs cut crisply through bright white snow!
    radial_chutes = (
        (chutes_major ** 1.8) * 0.48
        + (chutes_mid ** 2.2) * 0.34
        + (chutes_fine ** 2.6) * 0.18
    )

    radial_disp = (radial_chutes - 0.45) * 0.042 * np.exp(-((r - 0.34) ** 2) / 0.13)

    # Subtle secondary parasitic volcanic domes at Fuji's left-lower base (Omuroyama / Nagaoyama from reference photo!)
    dome1_r = np.sqrt(((wx + 370.0) / 210.0) ** 2 + ((wy - 1010.0) / 170.0) ** 2)
    dome1 = 88.0 * np.exp(-(dome1_r ** 2) * 1.35)
    dome2_r = np.sqrt(((wx + 145.0) / 130.0) ** 2 + ((wy - 950.0) / 110.0) ** 2)
    dome2 = 52.0 * np.exp(-(dome2_r ** 2) * 1.4)

    # Classic sweeping concave Mount Fuji volcano silhouette with sharp authentic summit crater peaks
    r_eff = np.maximum(0.0, r - 0.046)
    fuji_profile = np.exp(-np.power(r_eff * 1.44, 1.35))
    crater_dip = 0.026 * np.exp(-(r ** 2) / 0.0020)
    rim_peaks = (0.015 * np.cos(angle * 3.0 - 0.7) + 0.009 * np.sin(angle * 7.0 + 0.4)) * np.exp(-((r - 0.050) ** 2) / 0.0022)

    fuji_h = 395.0 * np.clip(fuji_profile - crater_dip + rim_peaks + radial_disp, 0.0, 1.25)
    fuji_h += (ridge_hi - 0.5) * 14.0 * np.clip(fuji_profile * 2.2, 0.0, 1.0)
    fuji_h = np.maximum(fuji_h, np.maximum(dome1, dome2))

    # Flanking foreground wooded mountain peninsulas curving naturally into Lake Motosuko (no straight horizontal seam!)
    rr_x = (wx - 580.0) / 420.0
    rr_y = (wy - 740.0) / 260.0
    right_ridge = 148.0 * np.exp(-(rr_x ** 2 * 0.80 + rr_y ** 2 * 1.15)) * (0.82 + 0.30 * ridge_hi)

    lr_x = (wx + 680.0) / 440.0
    lr_y = (wy - 760.0) / 260.0
    left_ridge = 128.0 * np.exp(-(lr_x ** 2 * 0.78 + lr_y ** 2 * 1.10)) * (0.82 + 0.30 * ridge_hi)

    # Organic curved far shoreline (natural bays & headlands instead of a flat straight line at wy=470!)
    curved_shore_wy = (
        670.0
        + 110.0 * np.sin(wx * 0.0032 + 0.5)
        + 65.0 * np.cos(wx * 0.0075 - 0.8)
        + 85.0 * noise_detail
    )
    H_raw = np.maximum.reduce([fuji_h, left_ridge, right_ridge])
    edge_y = np.clip((wy - curved_shore_wy) / 140.0, 0.0, 1.0)
    edge_x = np.clip(1.0 - np.maximum(0.0, (np.abs(wx) - 1060.0) / 240.0), 0.0, 1.0)
    # Smoothly plunge underwater (-12m) in front of the curved far shoreline so no straight line ever pokes above water!
    H = H_raw * (edge_y ** 1.25) * edge_x - (1.0 - edge_y) * 14.0

    # --- PHOTOGRAPHIC 2048x2048 ALBEDO: Cobalt Alpine Fuji + Crisp Lace-Like Snow Veins + Lush Autumn Foothills ---
    snow_elevation = 205.0 + (1.0 - radial_chutes) * 115.0 - fine_ridges * 36.0 + noise_detail * 24.0
    is_fuji = np.clip((fuji_h - 105.0) / 55.0, 0.0, 1.0)
    snow_mask = np.clip((H - snow_elevation) / 7.5, 0.0, 1.0) * is_fuji
    summit_cap = np.clip((H - 328.0) / 14.0, 0.0, 1.0) * (0.45 + 0.55 * radial_chutes)
    snow_mask = np.clip(np.maximum(snow_mask, summit_cap), 0.0, 1.0)

    # Authentic deep Japanese Cobalt-Indigo Alpine Fuji slopes
    alt_t = np.clip(H / 380.0, 0.0, 1.0)
    fuji_rock = np.zeros((S, S, 3), dtype=np.float32)
    rib_contrast = 0.68 + 0.52 * fine_ridges
    fuji_rock[..., 0] = (0.055 + 0.065 * (1.0 - alt_t) + 0.03 * ridge_hi) * rib_contrast
    fuji_rock[..., 1] = (0.125 + 0.105 * (1.0 - alt_t) + 0.04 * ridge_hi) * rib_contrast
    fuji_rock[..., 2] = (0.255 + 0.145 * (1.0 - alt_t) + 0.06 * ridge_hi) * rib_contrast

    # Lush Sunlit Autumn & Pine Forest Foothills along the flanking ridges and curved far shore (NOT pitch black!)
    canopy_hi = up2x(fbm(S_n, 48, 4, 0.60, seed=2031))
    autumn_groves = up2x(fbm(S_n, 14, 4, 0.55, seed=2026))
    autumn_patch = np.clip((autumn_groves - 0.45) * 3.0, 0.0, 1.0)

    foothill_forest = np.zeros((S, S, 3), dtype=np.float32)
    # Deep alpine forest green + warm autumn russet/amber maple & beech slopes
    foothill_forest[..., 0] = (0.045 + canopy_hi * 0.055) * (1 - autumn_patch * 0.72) + (0.38 + canopy_hi * 0.22) * (autumn_patch * 0.72)
    foothill_forest[..., 1] = (0.105 + canopy_hi * 0.085) * (1 - autumn_patch * 0.72) + (0.17 + canopy_hi * 0.14) * (autumn_patch * 0.72)
    foothill_forest[..., 2] = (0.075 + canopy_hi * 0.055) * (1 - autumn_patch * 0.72) + (0.06 + canopy_hi * 0.04) * (autumn_patch * 0.72)

    # Golden sandy/pebble beach strip right along the curved far shoreline (matching reference photo 2!)
    far_beach_mask = np.clip(1.0 - np.abs(H - 2.5) / 5.5, 0.0, 1.0) * np.clip(1.0 - is_fuji, 0.0, 1.0)
    far_beach_col = np.array([0.46, 0.36, 0.22], dtype=np.float32)

    foothill_mask = np.clip(1.0 - (H - 115.0) / 55.0, 0.0, 1.0) * (1.0 - 0.45 * is_fuji)
    albedo = fuji_rock * (1.0 - foothill_mask[..., None]) + foothill_forest * foothill_mask[..., None]
    albedo = albedo * (1.0 - far_beach_mask[..., None] * 0.75) + far_beach_col * (far_beach_mask[..., None] * 0.75)

    # Pure sparkling sunlit alpine snow
    snow_col = np.zeros((S, S, 3), dtype=np.float32)
    snow_col[..., 0] = 0.94 + fine_ridges * 0.06
    snow_col[..., 1] = 0.95 + fine_ridges * 0.05
    snow_col[..., 2] = 0.99
    albedo = albedo * (1.0 - snow_mask[..., None]) + snow_col * snow_mask[..., None]

    roughness = np.clip(0.88 - snow_mask * 0.34, 0.44, 0.95)
    # Ultra-crisp volcanic rib & gully normal map
    h_norm = H / 395.0 + (radial_chutes * 0.018 * is_fuji) + (fine_ridges * 0.014 * is_fuji)
    normal_map = height_to_normal(h_norm, strength=34.0)

    mat_fuji = create_pbr_material(
        "Mat_MtFuji",
        albedo_img=save_image("mt_fuji_albedo", albedo, True),
        normal_img=save_image("mt_fuji_normal", normal_map, False),
        rough_img=save_image("mt_fuji_rough", roughness, False),
        normal_strength=1.25,
        uv_scale=(1.0, 1.0),
    )

    bm = bmesh.new()
    vgrid = []
    for j in range(res + 1):
        row = []
        v = j / res
        sy = min(S - 1, int(v * (S - 1)))
        for i in range(res + 1):
            u = i / res
            sx = min(S - 1, int(u * (S - 1)))
            x = (u * 2.0 - 1.0) * (width * 0.5)
            y = 980.0 + (v * 2.0 - 1.0) * (depth * 0.5)
            z = float(H[sy, sx])
            row.append(bm.verts.new((x, y, z)))
        vgrid.append(row)

    uv_layer = bm.loops.layers.uv.verify()
    for j in range(res):
        for i in range(res):
            f = bm.faces.new((vgrid[j][i], vgrid[j][i + 1], vgrid[j + 1][i + 1], vgrid[j + 1][i]))
            f.loops[0][uv_layer].uv = (i / res, 1.0 - j / res)
            f.loops[1][uv_layer].uv = ((i + 1) / res, 1.0 - j / res)
            f.loops[2][uv_layer].uv = ((i + 1) / res, 1.0 - (j + 1) / res)
            f.loops[3][uv_layer].uv = (i / res, 1.0 - (j + 1) / res)

    mesh = bpy.data.meshes.new("MtFujiBackdrop")
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("MtFujiBackdrop", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat_fuji)
    set_smooth(obj)

    export_objects_glb([obj], f"{out_dir}/mt_fuji_backdrop.glb")
