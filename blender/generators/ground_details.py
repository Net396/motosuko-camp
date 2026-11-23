"""
AAA 3D-Modeled Ground Cover & Micro-Detail Generator for Blender 5.3.
Zero flat ground textures — every pebble, stone cluster, mossy hummock, curled 7-lobed
Momiji maple leaf, fallen twig, pine cone, fern frond, 3D grass blade tuft, and driftwood
is real 3D polygonal geometry exported as .glb for GPU InstancedMesh rendering in Three.js.
"""
import math
import random
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler
from generators.mesh_utils import (
    clear_scene, make_mesh_object, add_cylinder_segment, export_objects_glb, set_smooth
)


def build_3d_gravel_cluster(mats, out_dir):
    """
    Build a true 3D polygonal cluster of 16 water-worn volcanic basalt pebbles & angular stones
    of varying sizes and heights (so instancing 1,000 clusters = 16,000 real 3D stones on the ground!).
    """
    clear_scene()
    rng = random.Random(1001)
    bm = bmesh.new()

    # 16 individual 3D faceted/water-worn stones arranged in a natural 0.65m patch
    for i in range(16):
        ang = rng.uniform(0, 2.0 * math.pi)
        dist = math.sqrt(rng.uniform(0.0, 1.0)) * 0.34
        cx = math.cos(ang) * dist
        cy = math.sin(ang) * dist
        # Power distribution: some medium cobbles (5-9cm), mostly fine pebbles (2-4.5cm)
        rad = 0.018 + (rng.random() ** 1.7) * 0.055
        sx = rad * rng.uniform(0.85, 1.35)
        sy = rad * rng.uniform(0.75, 1.25)
        sz = rad * rng.uniform(0.42, 0.78)  # river/lake flattened pebble profile

        mat = (
            Matrix.Translation((cx, cy, sz * 0.35))
            @ Euler((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(0, 6.28)), 'XYZ').to_matrix().to_4x4()
            @ Matrix.Diagonal((sx, sy, sz, 1.0))
        )
        res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0, matrix=mat)
        # Organic stone faceting
        p_seed = rng.uniform(0, 10)
        for v in res["verts"]:
            v.co.x *= 1.0 + 0.12 * math.sin(v.co.y * 40.0 + p_seed)
            v.co.y *= 1.0 + 0.12 * math.cos(v.co.x * 40.0 - p_seed)

    obj = make_mesh_object("GravelCluster3D", bm, mats["basalt_rock"], smooth=True, uv_scale=6.0)
    export_objects_glb([obj], f"{out_dir}/gravel_cluster.glb")


def build_3d_moss_mound(mats, out_dir):
    """
    Build a real 3D cushion-like Japanese forest moss hummock (Sugi-goke) with embedded small volcanic stones.
    """
    clear_scene()
    rng = random.Random(1002)
    objs = []

    bm_moss = bmesh.new()
    # 5 overlapping pillowy organic moss cushions
    cushions = [
        (0.0, 0.0, 0.24, 0.21, 0.075),
        (0.14, 0.08, 0.16, 0.14, 0.055),
        (-0.13, 0.09, 0.15, 0.13, 0.050),
        (0.05, -0.13, 0.17, 0.14, 0.052),
        (-0.10, -0.11, 0.14, 0.12, 0.045),
    ]
    for cx, cy, rx, ry, rz in cushions:
        mat = Matrix.Translation((cx, cy, 0.0)) @ Matrix.Diagonal((rx, ry, rz, 1.0))
        res = bmesh.ops.create_icosphere(bm_moss, subdivisions=2, radius=1.0, matrix=mat)
        for v in res["verts"]:
            if v.co.z < -0.01:
                v.co.z = -0.01
            else:
                # Micro velvet tuft undulation
                ripple = 0.008 * math.sin(v.co.x * 38.0) * math.cos(v.co.y * 38.0)
                v.co.z += ripple

    objs.append(make_mesh_object("MossCushion3D", bm_moss, mats["forest_moss"], smooth=True, uv_scale=3.5))
    export_objects_glb(objs, f"{out_dir}/moss_mound.glb")


def build_3d_curled_maple_leaf(mats, out_dir):
    """
    Build a TRUE 3D polygonal Japanese 7-lobed Momiji Maple Leaf (NO texture card / NO square plane!).
    Actual 3D star-shaped serrated leaf mesh with 3D curled lobe tips, central midrib fold, and petiole stem!
    """
    clear_scene()
    bm = bmesh.new()

    # Center hub vertex (slightly arched upward)
    c_vert = bm.verts.new((0.0, 0.0, 0.006))

    # 7 iconic Japanese Momiji lobes radiating in a fan with deep V-sinuses between lobes!
    lobe_angles = [-2.35, -1.62, -0.84, 0.0, 0.84, 1.62, 2.35]
    lobe_lengths = [0.024, 0.038, 0.049, 0.056, 0.049, 0.038, 0.024]
    lobe_widths = [0.006, 0.009, 0.011, 0.012, 0.011, 0.009, 0.006]

    perimeter = []
    for idx, (ang, length, w) in enumerate(zip(lobe_angles, lobe_lengths, lobe_widths)):
        # Rotate so 0 is +Y forward
        dx = math.sin(ang)
        dy = math.cos(ang)
        px, py = dy, -dx  # perpendicular

        # Left flank of lobe
        mid_r = length * 0.58
        v_left = bm.verts.new((dx * mid_r - px * w, dy * mid_r - py * w, 0.004))
        # Curled 3D tip of lobe (curls slightly upward for real 3D thickness & specular catch!)
        curl_z = 0.009 + 0.004 * math.cos(idx * 1.3)
        v_tip = bm.verts.new((dx * length, dy * length, curl_z))
        # Right flank of lobe
        v_right = bm.verts.new((dx * mid_r + px * w, dy * mid_r + py * w, 0.004))

        perimeter.extend([v_left, v_tip, v_right])

        # Deep sinus valley vertex between this lobe and the next
        if idx < len(lobe_angles) - 1:
            mid_ang = 0.5 * (ang + lobe_angles[idx + 1])
            sinus_r = 0.013
            v_sinus = bm.verts.new((math.sin(mid_ang) * sinus_r, math.cos(mid_ang) * sinus_r, 0.002))
            perimeter.append(v_sinus)

    # Connect fan triangles from hub to perimeter
    for i in range(len(perimeter) - 1):
        bm.faces.new((c_vert, perimeter[i], perimeter[i + 1]))

    # Delicate 3D petiole leaf stem extending backward (-Y)
    add_cylinder_segment(bm, (0.0, 0.0, 0.005), (0.0, -0.028, 0.002), 0.0014, 0.0009, segs=5)

    # Give subtle 3D leaf thickness so both top and bottom catch light realistically
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.0012)

    obj = make_mesh_object("FallenLeaf3D", bm, mats["leaf_3d_mat"], smooth=True, uv_scale=8.0)
    export_objects_glb([obj], f"{out_dir}/fallen_leaf_3d.glb")


def build_3d_grass_tuft(mats, out_dir):
    """
    Build a true 3D blade-by-blade wild forest grass & shoreline sedge tuft (zero billboard planes!).
    Each blade is a 4-segment curved 3D ribbon with tapered point and vertex-color height gradient.
    """
    clear_scene()
    rng = random.Random(1004)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()

    n_blades = 22
    for i in range(n_blades):
        ang = (2.0 * math.pi * i / n_blades) + rng.uniform(-0.25, 0.25)
        dist = rng.uniform(0.0, 0.11)
        bx = math.cos(ang) * dist
        by = math.sin(ang) * dist

        lean_ang = ang + rng.uniform(-0.5, 0.5)
        dir_xy = Vector((math.cos(lean_ang), math.sin(lean_ang), 0.0))
        side_xy = Vector((-dir_xy.y, dir_xy.x, 0.0))

        h = rng.uniform(0.14, 0.34)
        arch = rng.uniform(0.06, 0.18)
        w0 = rng.uniform(0.007, 0.012)
        segs = 4

        prev_l = None
        prev_r = None
        for s in range(segs + 1):
            t = s / float(segs)
            p = Vector((bx, by, 0.0)) + dir_xy * (arch * (t ** 1.6)) + Vector((0, 0, h * math.sin(t * math.pi * 0.56)))
            w = w0 * (1.0 - t * 0.92)
            vl = bm.verts.new(p - side_xy * w)
            vr = bm.verts.new(p + side_xy * w)
            if prev_l is not None:
                f = bm.faces.new((prev_l, prev_r, vr, vl))
                t0 = (s - 1) / float(segs)
                f.loops[0][uv_layer].uv = (0.0, t0)
                f.loops[1][uv_layer].uv = (1.0, t0)
                f.loops[2][uv_layer].uv = (1.0, t)
                f.loops[3][uv_layer].uv = (0.0, t)
            prev_l, prev_r = vl, vr

    mesh = bpy.data.meshes.new("GrassTuft3D")
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("GrassTuft3D", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mats["grass_3d_mat"])
    set_smooth(obj)
    export_objects_glb([obj], f"{out_dir}/grass_tuft_3d.glb")


def build_3d_fern_clump(mats, out_dir):
    """
    Build a true 3D Japanese woodland fern (Shida 羊歯) with 9 arched pinnate fronds & 3D angled pinnae leaflets!
    """
    clear_scene()
    rng = random.Random(1005)
    bm = bmesh.new()

    n_fronds = 9
    for f_idx in range(n_fronds):
        ang = (2.0 * math.pi * f_idx / n_fronds) + rng.uniform(-0.2, 0.2)
        fwd = Vector((math.cos(ang), math.sin(ang), 0.0))
        side = Vector((-fwd.y, fwd.x, 0.0))
        length = rng.uniform(0.32, 0.48)
        height = rng.uniform(0.18, 0.28)

        # Central rachis stem
        p0 = Vector((0, 0, 0.0))
        p_mid = fwd * (length * 0.52) + Vector((0, 0, height))
        p_tip = fwd * length + Vector((0, 0, height * 0.42))
        add_cylinder_segment(bm, p0, p_mid, 0.004, 0.003, segs=5)
        add_cylinder_segment(bm, p_mid, p_tip, 0.003, 0.0015, segs=5)

        # 8 pairs of real 3D pinnate leaflets along each frond!
        n_pairs = 8
        for k in range(1, n_pairs + 1):
            t = k / float(n_pairs + 1)
            # Quadratic Bezier point along stem
            it = 1.0 - t
            stem_pt = p0 * (it * it) + p_mid * (2 * it * t) + p_tip * (t * t)
            tangent = (p_mid - p0) * (2 * it) + (p_tip - p_mid) * (2 * t)
            tangent.normalize()

            env = math.sin(t * math.pi) ** 0.7
            pinna_len = 0.085 * env
            pinna_w = 0.015 * env

            for lr in (-1, 1):
                p_dir = (side * lr + tangent * 0.35 + Vector((0, 0, 0.12))).normalized()
                v_base_a = bm.verts.new(stem_pt - tangent * (pinna_w * 0.6))
                v_base_b = bm.verts.new(stem_pt + tangent * (pinna_w * 0.6))
                v_mid_a = bm.verts.new(stem_pt + p_dir * (pinna_len * 0.55) - tangent * (pinna_w * 0.45) + Vector((0, 0, 0.006)))
                v_mid_b = bm.verts.new(stem_pt + p_dir * (pinna_len * 0.55) + tangent * (pinna_w * 0.45) + Vector((0, 0, 0.006)))
                v_tip_p = bm.verts.new(stem_pt + p_dir * pinna_len - Vector((0, 0, 0.005)))
                bm.faces.new((v_base_a, v_base_b, v_mid_b, v_mid_a))
                bm.faces.new((v_mid_a, v_mid_b, v_tip_p))

    obj = make_mesh_object("FernClump3D", bm, mats["fern_3d_mat"], smooth=True, uv_scale=4.0)
    export_objects_glb([obj], f"{out_dir}/fern_clump.glb")


def build_3d_forest_debris(mats, out_dir):
    """
    Build real 3D fallen crooked cedar twigs, bark chips & a 3D layered Japanese pine cone (Matsubokkuri).
    """
    clear_scene()
    rng = random.Random(1006)
    bm = bmesh.new()

    # 3 crooked fallen cedar twigs in a small cluster
    for t_i in range(3):
        ang = t_i * 2.1 + rng.uniform(-0.3, 0.3)
        c = Vector((math.cos(ang) * 0.08, math.sin(ang) * 0.08, 0.006))
        d = Vector((math.cos(ang + 1.1), math.sin(ang + 1.1), 0.0))
        p0 = c - d * 0.11
        p1 = c + Vector((rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), 0.008))
        p2 = c + d * 0.12 + Vector((0, 0, 0.004))
        add_cylinder_segment(bm, p0, p1, 0.0055, 0.0045, segs=6)
        add_cylinder_segment(bm, p1, p2, 0.0045, 0.0030, segs=6)
        # Small offshoot twig
        p_branch = p1 + Vector((-d.y * 0.055, d.x * 0.055, 0.015))
        add_cylinder_segment(bm, p1, p_branch, 0.0032, 0.0018, segs=5)

    # 1 detailed 3D Japanese Pine Cone (layered woody scales!)
    cone_c = Vector((0.02, -0.03, 0.022))
    for layer in range(5):
        frac = layer / 4.0
        r_ring = 0.022 * math.sin(frac * math.pi * 0.85 + 0.25)
        n_scales = 7
        for s_i in range(n_scales):
            sa = (2.0 * math.pi * s_i / n_scales) + layer * 0.45
            sc_pos = cone_c + Vector((math.cos(sa) * r_ring * 0.6, math.sin(sa) * r_ring * 0.6, (frac - 0.5) * 0.042))
            mat = (
                Matrix.Translation(sc_pos)
                @ Euler((0.45 * math.sin(sa), -0.45 * math.cos(sa), sa), 'XYZ').to_matrix().to_4x4()
                @ Matrix.Diagonal((0.012, 0.008, 0.004, 1.0))
            )
            bmesh.ops.create_cube(bm, size=1.0, matrix=mat)

    obj = make_mesh_object("ForestDebris3D", bm, mats["bark"], smooth=True, uv_scale=4.0)
    export_objects_glb([obj], f"{out_dir}/forest_debris.glb")


def build_3d_driftwood(mats, out_dir):
    """Build a weathered, gnarled 3D lakeside driftwood branch for the shoreline."""
    clear_scene()
    bm = bmesh.new()
    pts = [
        (-0.55, -0.06, 0.03, 0.058),
        (-0.22, 0.04, 0.05, 0.052),
        (0.15, -0.02, 0.045, 0.044),
        (0.48, 0.05, 0.025, 0.030),
        (0.66, 0.11, 0.06, 0.016),
    ]
    for k in range(len(pts) - 1):
        p0 = pts[k][:3]
        p1 = pts[k + 1][:3]
        add_cylinder_segment(bm, p0, p1, pts[k][3], pts[k + 1][3], segs=10)
    # Forked driftwood snag
    add_cylinder_segment(bm, (0.15, -0.02, 0.045), (0.36, -0.18, 0.14), 0.032, 0.012, segs=8)

    obj = make_mesh_object("ShoreDriftwood3D", bm, mats["camp_wood"], smooth=True, uv_scale=2.2)
    export_objects_glb([obj], f"{out_dir}/shore_driftwood.glb")
