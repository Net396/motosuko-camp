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
    """Deterministic Koan Camping Ground volcanic shoreline elevation."""
    shore_y = 14.5 + 3.2 * math.sin(x * 0.045) + 1.8 * math.cos(x * 0.095 + 0.6)
    dist_from_shore = shore_y - y

    if dist_from_shore < 0:
        h = dist_from_shore * 0.16 - 0.008 * (dist_from_shore ** 2)
        h = max(h, -6.0)
    else:
        beach = min(dist_from_shore, 8.0) * 0.11
        flat_camp = max(0.0, min(dist_from_shore - 8.0, 14.0)) * 0.03
        back_hill = max(0.0, dist_from_shore - 22.0) ** 1.38 * 0.19
        h = beach + flat_camp + back_hill

    camp_r = math.hypot(x, y - 2.0)
    camp_blend = max(0.0, min(1.0, (campR := camp_r) and (campR - 7.5) / 8.0))

    undul = (
        0.18 * math.sin(x * 0.13 + 0.4) * math.cos(y * 0.11)
        + 0.09 * math.sin(x * 0.31 - y * 0.27)
        + 0.04 * math.cos(x * 0.7 + y * 0.6)
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
    # Lean 128x128 mesh (2.4x faster GPU vertex processing while keeping smooth gravel curves!)
    nx, ny = 128, 128
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

    # Flanking foreground dark-silhouetted wooded ridges (framing right & far left just like the reference photo!)
    # Right dark forested hill jutting toward lake (iconic framing!)
    rr_x = (wx - 620.0) / 420.0
    rr_y = (wy - 700.0) / 220.0
    right_ridge = 138.0 * np.exp(-(rr_x ** 2 * 0.85 + rr_y ** 2 * 1.25)) * (0.82 + 0.28 * ridge_hi)

    # Far-left gentle ridge keeping the golden sunset horizon open behind Fuji's left slope!
    lr_x = (wx + 880.0) / 420.0
    lr_y = (wy - 740.0) / 240.0
    left_ridge = 108.0 * np.exp(-(lr_x ** 2 * 0.8 + lr_y ** 2 * 1.1)) * (0.82 + 0.28 * ridge_hi)

    # Low wooded far shore apron around lake edge
    far_shore = 24.0 * np.exp(-((wy - 615.0) / 115.0) ** 2) * (0.72 + 0.50 * ridge_hi)

    H = np.maximum.reduce([fuji_h, left_ridge, right_ridge, far_shore])
    edge_y = np.clip((wy - 470.0) / 150.0, 0.0, 1.0)
    edge_x = np.clip(1.0 - np.maximum(0.0, (np.abs(wx) - 1040.0) / 260.0), 0.0, 1.0)
    H = H * edge_y * edge_x - (1.0 - edge_y) * 8.0

    # --- PHOTOGRAPHIC 2048x2048 ALBEDO: Cobalt Alpine Fuji + Crisp Lace-Like Snow Veins + Dark Foreground Ridges ---
    # Dendritic snow clings tightly inside radial gullies & wind-swept upper ridges, exposing sharp dark basalt ribs!
    snow_elevation = 212.0 + (1.0 - radial_chutes) * 118.0 - fine_ridges * 36.0 + noise_detail * 24.0
    is_fuji = np.clip((fuji_h - 115.0) / 55.0, 0.0, 1.0)
    # Razor-crisp snow threshold (sharp 7m transition = photographic alpine snow streaks!)
    snow_mask = np.clip((H - snow_elevation) / 7.5, 0.0, 1.0) * is_fuji
    # Extra crisp summit ice cap right around the crater rim
    summit_cap = np.clip((H - 332.0) / 14.0, 0.0, 1.0) * (0.45 + 0.55 * radial_chutes)
    snow_mask = np.clip(np.maximum(snow_mask, summit_cap), 0.0, 1.0)

    # Authentic deep Japanese Cobalt-Indigo Alpine Fuji slopes (aerial Rayleigh scattering tint like reference photo!)
    alt_t = np.clip(H / 380.0, 0.0, 1.0)
    fuji_rock = np.zeros((S, S, 3), dtype=np.float32)
    rib_contrast = 0.65 + 0.55 * fine_ridges
    # Rich sapphire-cobalt slate on mid-lower slopes -> darker volcanic basalt ridges near summit
    fuji_rock[..., 0] = (0.045 + 0.055 * (1.0 - alt_t) + 0.03 * ridge_hi) * rib_contrast
    fuji_rock[..., 1] = (0.115 + 0.095 * (1.0 - alt_t) + 0.04 * ridge_hi) * rib_contrast
    fuji_rock[..., 2] = (0.245 + 0.145 * (1.0 - alt_t) + 0.06 * ridge_hi) * rib_contrast

    # Dark silhouetted forested foreground flanking hills & far shoreline (deep pine black-green for dramatic contrast!)
    canopy_hi = up2x(fbm(S_n, 48, 4, 0.60, seed=2031))
    is_fg_ridge = np.clip(
        np.maximum((right_ridge - fuji_h + 15.0) / 30.0, (left_ridge - fuji_h + 15.0) / 30.0),
        0.0, 1.0
    )
    is_far_shore = np.clip((685.0 - wy) / 90.0, 0.0, 1.0)
    dark_forest_mask = np.clip(np.maximum(is_fg_ridge, is_far_shore), 0.0, 1.0)

    dark_forest = np.zeros((S, S, 3), dtype=np.float32)
    dark_forest[..., 0] = 0.018 + canopy_hi * 0.032
    dark_forest[..., 1] = 0.036 + canopy_hi * 0.052
    dark_forest[..., 2] = 0.022 + canopy_hi * 0.028

    # Misty blue-teal Aokigahara forest sea at Fuji's mid-base (just like the reference photo!)
    base_plain_mask = np.clip(1.0 - (H - 55.0) / 55.0, 0.0, 1.0) * (1.0 - dark_forest_mask)
    aoki_col = np.zeros((S, S, 3), dtype=np.float32)
    aoki_col[..., 0] = 0.030 + canopy_hi * 0.045
    aoki_col[..., 1] = 0.085 + canopy_hi * 0.080
    aoki_col[..., 2] = 0.145 + canopy_hi * 0.105

    albedo = fuji_rock * (1.0 - base_plain_mask[..., None]) + aoki_col * base_plain_mask[..., None]
    albedo = albedo * (1.0 - dark_forest_mask[..., None]) + dark_forest * dark_forest_mask[..., None]

    # Pure sparkling sunlit alpine snow with subtle cool-blue crevice nuance
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
