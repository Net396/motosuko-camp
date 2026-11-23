"""
AAA Botanical & Nature Asset Generator for Lake Motosuko (Blender 5.3).
Replaces blobby spheres with true recursive woody branching trees + hundreds of curved
alpha-cutout botanical foliage cards (7-lobed Japanese Momiji maples, feathered Sugi cedar
fronds, sunlit Susuki pampas grass plumes) + high-detail faceted volcanic basalt boulders & cobbles.
"""
import math
import random
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler
from generators.mesh_utils import (
    clear_scene, make_mesh_object, add_cylinder_segment, export_objects_glb, set_smooth
)


def add_curved_foliage_card(bm, uv_layer, origin, direction, up_hint, width, height, arch=0.14):
    """
    Create a gently curved 2x2 quad botanical foliage card attached at `origin` extending along `direction`.
    Slight 3D cupping & droop gives realistic depth and catches sunset light naturally from every angle!
    """
    fwd = direction.normalized()
    right = fwd.cross(up_hint)
    if right.length < 1e-4:
        right = fwd.cross(Vector((1, 0, 0)))
    right.normalize()
    up = right.cross(fwd).normalized()

    # 3x3 grid (4 quads) for natural organic droop & center fold
    grid = []
    for j in range(3):
        v = j / 2.0  # 0 = stem base, 1 = tip
        droop = -arch * (v * v) * height
        row = []
        for i in range(3):
            u = i / 2.0  # 0..1 across width
            lat = (u - 0.5) * width
            cup = abs(u - 0.5) * 0.14 * width
            p = origin + fwd * (v * height) + right * lat + up * (droop + cup)
            row.append((bm.verts.new(p), u, 1.0 - v))
        grid.append(row)

    for j in range(2):
        for i in range(2):
            v00, u00, w00 = grid[j][i]
            v10, u10, w10 = grid[j][i + 1]
            v11, u11, w11 = grid[j + 1][i + 1]
            v01, u01, w01 = grid[j + 1][i]
            f = bm.faces.new((v00, v10, v11, v01))
            f.loops[0][uv_layer].uv = (u00, w00)
            f.loops[1][uv_layer].uv = (u10, w10)
            f.loops[2][uv_layer].uv = (u11, w11)
            f.loops[3][uv_layer].uv = (u01, w01)


def make_uv_preserved_object(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    set_smooth(obj)
    return obj


def build_japanese_cedar(mats, out_dir):
    """Build a realistic tall Japanese Cedar (杉木 Sugi) with fluted bark trunk & 200+ drooping needle frond cards."""
    clear_scene()
    rng = random.Random(303)
    objs = []

    height = 15.0
    bm_trunk = bmesh.new()
    bm_cards = bmesh.new()
    uv_layer = bm_cards.loops.layers.uv.verify()

    # Tapered straight Japanese Sugi trunk with flared root buttress
    segs_h = 10
    prev = Vector((0.0, 0.0, -0.25))
    trunk_pts = [prev]
    for k in range(1, segs_h + 1):
        t = k / segs_h
        nxt = Vector((math.sin(t * 2.1) * 0.12, math.cos(t * 1.5) * 0.09, t * height * 0.96))
        r0 = 0.44 if k == 1 else (0.31 * ((1.0 - (k - 1) / segs_h) ** 0.85) + 0.035)
        r1 = 0.31 * ((1.0 - t) ** 0.85) + 0.035
        add_cylinder_segment(bm_trunk, prev, nxt, r0, r1, segs=12, cap=(k == segs_h))
        trunk_pts.append(nxt)
        prev = nxt

    # 14 whorls of drooping woody limbs + dense overlapping feathered conifer bough alpha cards!
    tiers = 14
    for t_idx in range(tiers):
        frac = t_idx / (tiers - 1)
        z_tier = 2.6 + frac * (height - 2.9)
        tier_len = (1.0 - frac * 0.78) * 2.75 + 0.45
        n_limbs = max(5, int(9 - frac * 4))
        for b in range(n_limbs):
            ang = (2.0 * math.pi * b / n_limbs) + t_idx * 0.85 + rng.uniform(-0.22, 0.22)
            rad_dir = Vector((math.cos(ang), math.sin(ang), 0.0))
            base = Vector((0.0, 0.0, z_tier))
            # Slightly drooping then upturned tip (authentic Sugi silhouette!)
            mid = base + rad_dir * (tier_len * 0.55) + Vector((0, 0, -0.28 * (1.0 - frac)))
            tip = base + rad_dir * tier_len + Vector((0, 0, -0.18 * (1.0 - frac) + 0.12))
            r_b = 0.055 * (1.0 - frac * 0.65)
            add_cylinder_segment(bm_trunk, base, mid, r_b, r_b * 0.6, segs=6)
            add_cylinder_segment(bm_trunk, mid, tip, r_b * 0.6, r_b * 0.25, segs=5)

            # Attach 3 crossed/layered needle frond cards along each limb!
            for f_pos, f_scale in ((0.35, 0.95), (0.68, 1.05), (0.95, 0.88)):
                origin = base.lerp(tip, f_pos) + Vector((0, 0, rng.uniform(-0.08, 0.10)))
                w = (0.95 + (1.0 - frac) * 0.65) * f_scale
                h = (1.15 + (1.0 - frac) * 0.75) * f_scale
                # Horizontal drooping frond
                dir1 = (rad_dir + Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), -0.22 + frac * 0.35))).normalized()
                add_curved_foliage_card(bm_cards, uv_layer, origin, dir1, Vector((0, 0, 1)), w, h, arch=0.22)
                # Angled volumetric cross-frond so canopy never looks flat from below or side!
                side_up = (Vector((0, 0, 1)) + Vector((-rad_dir.y, rad_dir.x, 0)) * rng.choice((-0.65, 0.65))).normalized()
                add_curved_foliage_card(bm_cards, uv_layer, origin, dir1, side_up, w * 0.88, h * 0.92, arch=0.18)

    # Crown spire needle fronds
    for k in range(8):
        ang = 2.0 * math.pi * k / 8.0
        d = Vector((math.cos(ang) * 0.35, math.sin(ang) * 0.35, 0.95)).normalized()
        add_curved_foliage_card(bm_cards, uv_layer, Vector((0, 0, height - 0.6)), d, Vector((0, 0, 1)), 0.75, 1.1, arch=0.12)

    objs.append(make_mesh_object("CedarTrunk", bm_trunk, mats["bark"], smooth=True, uv_scale=0.85, uv_mode="cyl"))
    objs.append(make_uv_preserved_object("CedarFoliage", bm_cards, mats["cedar_bough"]))
    export_objects_glb(objs, f"{out_dir}/tree_cedar.glb")


def _build_maple_variant(mats, card_mat_key, filename, seed, out_dir):
    """
    Build a true sculptural Japanese Maple (紅葉 Momiji) with gnarled recursive branching
    and 150+ delicate 7-lobed alpha-cutout Momiji leaf sprays — ZERO sphere blobs!
    """
    clear_scene()
    rng = random.Random(seed)
    objs = []

    bm_trunk = bmesh.new()
    bm_cards = bmesh.new()
    uv_layer = bm_cards.loops.layers.uv.verify()

    # Graceful S-curved multi-segment trunk with flared roots
    p0 = Vector((0, 0, -0.15))
    p1 = Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), 0.75))
    p2 = Vector((rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), 1.65))
    add_cylinder_segment(bm_trunk, p0, p1, 0.25, 0.17, segs=12)
    add_cylinder_segment(bm_trunk, p1, p2, 0.17, 0.135, segs=10)

    # Exposed surface roots gripping volcanic ground
    for r_i in range(4):
        ra = 2.0 * math.pi * r_i / 4.0 + rng.uniform(-0.35, 0.35)
        r_tip = Vector((math.cos(ra) * 0.65, math.sin(ra) * 0.65, -0.12))
        add_cylinder_segment(bm_trunk, Vector((math.cos(ra) * 0.14, math.sin(ra) * 0.14, 0.22)), r_tip, 0.085, 0.025, segs=7)

    # 6 spreading primary limbs -> 3 forked secondary branches each -> airy layered Momiji leaf fans!
    n_main = 6
    for i in range(n_main):
        ang = (2.0 * math.pi * i / n_main) + rng.uniform(-0.28, 0.28)
        elev = rng.uniform(0.45, 0.92)
        len1 = rng.uniform(1.65, 2.45)
        d1 = Vector((math.cos(ang), math.sin(ang), elev)).normalized()
        mid = p2 + d1 * (len1 * 0.55)
        end1 = p2 + d1 * len1 + Vector((0, 0, rng.uniform(-0.2, 0.25)))
        add_cylinder_segment(bm_trunk, p2, mid, 0.095, 0.068, segs=8)
        add_cylinder_segment(bm_trunk, mid, end1, 0.068, 0.042, segs=7)

        # 3 secondary spreading twigs per primary bough
        for j in range(3):
            sub_ang = ang + (j - 1) * 0.58 + rng.uniform(-0.22, 0.22)
            sub_len = rng.uniform(1.05, 1.65)
            origin_b = mid if j == 0 else end1
            d2 = Vector((math.cos(sub_ang), math.sin(sub_ang), rng.uniform(0.05, 0.52))).normalized()
            end2 = origin_b + d2 * sub_len
            add_cylinder_segment(bm_trunk, origin_b, end2, 0.038, 0.016, segs=6)

            # Fine tertiary twigs + 9 crossed Momiji leaf cluster cards per branch!
            for c in range(9):
                t_pos = rng.uniform(0.32, 1.04)
                c_origin = origin_b.lerp(end2, t_pos) + Vector((rng.uniform(-0.22, 0.22), rng.uniform(-0.22, 0.22), rng.uniform(-0.14, 0.24)))
                c_ang = sub_ang + rng.uniform(-1.35, 1.35)
                c_dir = Vector((math.cos(c_ang), math.sin(c_ang), rng.uniform(-0.18, 0.45))).normalized()
                # Vary card roll slightly for natural multi-plane airy Japanese maple canopy!
                tilt_side = Vector((-c_dir.y, c_dir.x, 0.0)) * rng.uniform(-0.75, 0.75)
                up_hint = (Vector((0, 0, 1)) + tilt_side).normalized()
                w = rng.uniform(0.72, 1.18)
                h = rng.uniform(0.75, 1.22)
                add_curved_foliage_card(bm_cards, uv_layer, c_origin, c_dir, up_hint, w, h, arch=0.16)

    objs.append(make_mesh_object("MapleTrunk", bm_trunk, mats["bark"], smooth=True, uv_scale=1.2, uv_mode="cyl"))
    objs.append(make_uv_preserved_object("MapleFoliage", bm_cards, mats[card_mat_key]))
    export_objects_glb(objs, f"{out_dir}/{filename}")


def build_japanese_maples(mats, out_dir):
    _build_maple_variant(mats, "maple_red_card", "tree_maple_red.glb", 404, out_dir)
    _build_maple_variant(mats, "maple_gold_card", "tree_maple_gold.glb", 505, out_dir)


def build_basalt_rock(mats, out_dir):
    """Build a crisp high-res craggy Fuji volcanic basalt boulder + a small volcanic pebble/cobble cluster."""
    clear_scene()
    rng = random.Random(606)
    bm = bmesh.new()
    res = bmesh.ops.create_icosphere(bm, subdivisions=4, radius=0.68)
    planes = [(Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized(), rng.uniform(0.32, 0.56)) for _ in range(11)]
    for v in res["verts"]:
        p = v.co.copy()
        p.z *= 0.62
        for n, d in planes:
            proj = p.dot(n)
            if proj > d:
                p -= n * (proj - d) * 0.62
        # Multi-frequency sharp lava crags
        crag = (
            0.11 * math.sin(p.x * 5.8 + p.y * 4.1) * math.cos(p.z * 5.2)
            + 0.045 * math.cos(p.x * 13.5 - p.z * 11.2)
        )
        p *= (1.0 + crag)
        v.co = p
    obj = make_mesh_object("BasaltBoulder", bm, mats["basalt_rock"], smooth=True, uv_scale=1.8)
    export_objects_glb([obj], f"{out_dir}/rock_basalt.glb")

    # Small shoreline volcanic cobble stone (for Three.js InstancedMesh shoreline scattering!)
    clear_scene()
    bm_p = bmesh.new()
    res_p = bmesh.ops.create_icosphere(bm_p, subdivisions=2, radius=0.095)
    for v in res_p["verts"]:
        v.co.z *= 0.54
        v.co.x *= 1.18
        v.co *= 1.0 + 0.14 * math.sin(v.co.x * 28.0 + v.co.y * 22.0)
    obj_p = make_mesh_object("VolcanicCobble", bm_p, mats["basalt_rock"], smooth=True, uv_scale=4.0)
    export_objects_glb([obj_p], f"{out_dir}/cobble_stone.glb")


def build_pampas_grass(mats, out_dir):
    """Build an authentic autumn Japanese Susuki pampas grass clump (芒草) with slender blades & feathery golden plumes."""
    clear_scene()
    rng = random.Random(707)
    objs = []

    # 1. Gracefully arching slender olive-tan grass blades
    bm_blades = bmesh.new()
    n_blades = 34
    for i in range(n_blades):
        ang = 2.0 * math.pi * i / n_blades + rng.uniform(-0.18, 0.18)
        h = rng.uniform(0.55, 1.08)
        arch = rng.uniform(0.35, 0.78)
        w0 = 0.011
        segs = 6
        prev_l = None
        prev_r = None
        dir_xy = Vector((math.cos(ang), math.sin(ang), 0.0))
        side_xy = Vector((-math.sin(ang), math.cos(ang), 0.0))
        base_off = dir_xy * rng.uniform(0.0, 0.10)
        for s in range(segs + 1):
            t = s / segs
            p = base_off + dir_xy * (arch * (t ** 1.55)) + Vector((0, 0, h * math.sin(t * math.pi * 0.62)))
            w = w0 * (1.0 - t * 0.90)
            vl = bm_blades.verts.new(p - side_xy * w)
            vr = bm_blades.verts.new(p + side_xy * w)
            if prev_l is not None:
                bm_blades.faces.new((prev_l, prev_r, vr, vl))
            prev_l, prev_r = vl, vr
    # 2. 7 tall slender stalks topped with feathery sunlit silver-gold Susuki plumes (crossed alpha cards!)
    bm_plumes = bmesh.new()
    uv_layer = bm_plumes.loops.layers.uv.verify()
    for k in range(7):
        ang = 2.0 * math.pi * k / 7.0 + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(0.18, 0.42)
        stalk_h = rng.uniform(0.95, 1.48)
        p_base = Vector((math.cos(ang) * 0.06, math.sin(ang) * 0.06, 0.0))
        p_top = p_base + Vector((math.cos(ang) * lean, math.sin(ang) * lean, stalk_h))
        add_cylinder_segment(bm_blades, p_base, p_top, 0.004, 0.0022, segs=5, cap=False)

        plume_dir = (Vector((math.cos(ang) * 0.35, math.sin(ang) * 0.35, 0.92))).normalized()
        up1 = Vector((-math.sin(ang), math.cos(ang), 0.0))
        up2 = Vector((math.cos(ang), math.sin(ang), -0.35)).normalized()
        add_curved_foliage_card(bm_plumes, uv_layer, p_top - plume_dir * 0.05, plume_dir, up1, 0.11, 0.28, arch=0.14)
        add_curved_foliage_card(bm_plumes, uv_layer, p_top - plume_dir * 0.05, plume_dir, up2, 0.11, 0.28, arch=0.14)

    objs.append(make_mesh_object("PampasBlades", bm_blades, mats["grass_blade"], smooth=True, uv_scale=2.0))
    objs.append(make_uv_preserved_object("PampasPlumes", bm_plumes, mats["pampas_plume"]))
    export_objects_glb(objs, f"{out_dir}/pampas_grass.glb")


def build_autumn_shrubs(mats, out_dir):
    """
    Build lush layered Japanese autumn hillside bushes (crimson, golden-amber, and olive-yellow-green)
    using dense organic botanical leaf-cluster alpha cards to carpet the mountain slope naturally!
    """
    variants = [
        ("maple_red_card",   "shrub_autumn_red.glb",   901),
        ("maple_gold_card",  "shrub_autumn_gold.glb",  902),
        ("shrub_green_card", "shrub_autumn_green.glb", 903),
    ]
    for mat_key, filename, seed in variants:
        clear_scene()
        rng = random.Random(seed)
        bm_twigs = bmesh.new()
        bm_cards = bmesh.new()
        uv_layer = bm_cards.loops.layers.uv.verify()

        # 5 low woody shrub stems radiating from root center
        for i in range(5):
            ang = 2.0 * math.pi * i / 5.0 + rng.uniform(-0.35, 0.35)
            tip = Vector((math.cos(ang) * rng.uniform(0.55, 0.95), math.sin(ang) * rng.uniform(0.55, 0.95), rng.uniform(0.65, 1.05)))
            add_cylinder_segment(bm_twigs, (0, 0, -0.1), tip, 0.032, 0.012, segs=5)

        # 42 dense overlapping curved leaf-spray cards forming a lush organic autumn bush!
        for k in range(42):
            ang = rng.uniform(0, 2.0 * math.pi)
            r = rng.uniform(0.05, 0.95)
            h_dome = (1.0 - (r / 1.15) ** 2) * rng.uniform(0.65, 1.35)
            origin = Vector((math.cos(ang) * r, math.sin(ang) * r, max(0.05, h_dome * 0.55)))
            d = Vector((math.cos(ang) * 0.7 + rng.uniform(-0.4, 0.4), math.sin(ang) * 0.7 + rng.uniform(-0.4, 0.4), rng.uniform(0.25, 0.95))).normalized()
            side = Vector((-d.y, d.x, 0.0)) * rng.uniform(-0.7, 0.7)
            up_h = (Vector((0, 0, 1)) + side).normalized()
            w = rng.uniform(0.68, 1.12)
            h = rng.uniform(0.72, 1.16)
            add_curved_foliage_card(bm_cards, uv_layer, origin, d, up_h, w, h, arch=0.18)

        objs = [
            make_mesh_object("ShrubTwigs", bm_twigs, mats["bark"], smooth=True, uv_scale=2.0),
            make_uv_preserved_object("ShrubFoliage", bm_cards, mats[mat_key]),
        ]
        export_objects_glb(objs, f"{out_dir}/{filename}")
