"""
Generates photorealistic Japanese bushcraft fire & wood assets:
- Snow Peak Takibi Stainless Steel Fire Pit (焚火台) + cooking grill bridge
- Oak chopping block stump (劈柴墩)
- Bushcraft camping hatchet (手斧)
- Whole Hinoki log, Split half-log, Kindling bundle, Glowing charcoal ember bed
- Telescoping steel & walnut fire blowpipe (火吹棒)
"""
import math
import random
import bpy
import bmesh
from mathutils import Vector, Matrix
from generators.mesh_utils import (
    clear_scene, make_mesh_object, add_cylinder_segment, export_objects_glb
)


def build_firepit_snowpeak(mats, out_dir):
    """Build iconic Snow Peak Pack & Carry (L) inverted-pyramid stainless fire pit + grill grate."""
    clear_scene()
    objs = []

    # 1. Heavy steel baseplate
    bm_base = bmesh.new()
    bmesh.ops.create_cube(bm_base, size=1.0, matrix=Matrix.Translation((0, 0, 0.012)) @ Matrix.Diagonal((0.48, 0.48, 0.014, 1.0)))
    objs.append(make_mesh_object("FirepitBaseplate", bm_base, mats["cast_iron"], smooth=False, uv_scale=2.0))

    # 2. Inverted stainless steel pyramid fire bowl (4 angled trapezoidal plates + 4 tubular legs)
    bm_steel = bmesh.new()
    top_hw = 0.235
    bot_hw = 0.065
    top_z = 0.34
    bot_z = 0.11

    corners_top = [(-top_hw, -top_hw, top_z), (top_hw, -top_hw, top_z), (top_hw, top_hw, top_z), (-top_hw, top_hw, top_z)]
    corners_bot = [(-bot_hw, -bot_hw, bot_z), (bot_hw, -bot_hw, bot_z), (bot_hw, bot_hw, bot_z), (-bot_hw, bot_hw, bot_z)]

    plate_faces = []
    for i in range(4):
        ni = (i + 1) % 4
        v0 = bm_steel.verts.new(corners_bot[i])
        v1 = bm_steel.verts.new(corners_bot[ni])
        v2 = bm_steel.verts.new(corners_top[ni])
        v3 = bm_steel.verts.new(corners_top[i])
        plate_faces.append(bm_steel.faces.new((v0, v1, v2, v3)))
    # Bottom ash floor plate
    vb = [bm_steel.verts.new(p) for p in corners_bot]
    plate_faces.append(bm_steel.faces.new(vb))
    bmesh.ops.solidify(bm_steel, geom=plate_faces, thickness=0.005)

    # Four iconic Snow Peak diagonal corner legs
    for i in range(4):
        sx = -1 if corners_top[i][0] < 0 else 1
        sy = -1 if corners_top[i][1] < 0 else 1
        p_foot = (sx * 0.21, sy * 0.21, 0.018)
        p_mid = (sx * 0.13, sy * 0.13, 0.19)
        p_top = (sx * 0.245, sy * 0.245, top_z + 0.015)
        add_cylinder_segment(bm_steel, p_foot, p_mid, 0.010, 0.010, segs=8)
        add_cylinder_segment(bm_steel, p_mid, p_top, 0.010, 0.010, segs=8)

    # Top rim frame bars
    for i in range(4):
        ni = (i + 1) % 4
        add_cylinder_segment(bm_steel, corners_top[i], corners_top[ni], 0.007, 0.007, segs=8)

    objs.append(make_mesh_object("FirepitBody", bm_steel, mats["brushed_steel"], smooth=True, uv_scale=2.5))

    # 3. Cast-iron raised cooking grill bridge & parallel grate bars (sits above flames at z=0.41)
    bm_grate = bmesh.new()
    gz = 0.405
    gw = 0.255
    # Bridge stand legs clipped to rim
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_cylinder_segment(bm_grate, (sx * 0.23, sy * 0.20, top_z), (sx * gw, sy * 0.21, gz), 0.007, 0.007, segs=8)
    # Outer grate rectangle
    add_cylinder_segment(bm_grate, (-gw, -0.21, gz), (gw, -0.21, gz), 0.0075, 0.0075, segs=8)
    add_cylinder_segment(bm_grate, (-gw, 0.21, gz), (gw, 0.21, gz), 0.0075, 0.0075, segs=8)
    add_cylinder_segment(bm_grate, (-gw, -0.21, gz), (-gw, 0.21, gz), 0.0075, 0.0075, segs=8)
    add_cylinder_segment(bm_grate, (gw, -0.21, gz), (gw, 0.21, gz), 0.0075, 0.0075, segs=8)
    # 11 parallel grill rods (covering 65% of firepit so you can still add firewood on the front side!)
    for k in range(11):
        gx = -gw + 0.03 + k * (0.34 / 10.0)
        add_cylinder_segment(bm_grate, (gx, -0.21, gz), (gx, 0.21, gz), 0.004, 0.004, segs=6)

    objs.append(make_mesh_object("FirepitGrillGrate", bm_grate, mats["cast_iron"], smooth=True, uv_scale=3.0))

    export_objects_glb(objs, f"{out_dir}/firepit_snowpeak.glb")


def build_chopping_block(mats, out_dir):
    """Build a heavy weathered oak chopping stump (劈柴墩) with organic bark perimeter & split end-grain top."""
    clear_scene()
    objs = []
    segs = 28
    height = 0.48
    base_r = 0.24
    rng = random.Random(42)

    bm_bark = bmesh.new()
    bm_top = bmesh.new()

    r_prof = [base_r * (1.0 + 0.055 * math.sin(i * 0.9) + 0.03 * math.cos(i * 2.1) + rng.uniform(-0.015, 0.015)) for i in range(segs)]

    ring_bot = []
    ring_mid = []
    ring_top = []
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        r = r_prof[i]
        ring_bot.append(bm_bark.verts.new((math.cos(a) * (r * 1.07), math.sin(a) * (r * 1.07), 0.0)))
        ring_mid.append(bm_bark.verts.new((math.cos(a) * (r * 0.98), math.sin(a) * (r * 0.98), height * 0.52)))
        ring_top.append(bm_bark.verts.new((math.cos(a) * r, math.sin(a) * r, height)))

    for i in range(segs):
        ni = (i + 1) % segs
        bm_bark.faces.new((ring_bot[i], ring_bot[ni], ring_mid[ni], ring_mid[i]))
        bm_bark.faces.new((ring_mid[i], ring_mid[ni], ring_top[ni], ring_top[i]))

    objs.append(make_mesh_object("ChoppingStumpBark", bm_bark, mats["bark"], smooth=True, uv_scale=1.6, uv_mode="cyl"))

    # Top cut end-grain face (with concentric growth rings + radial drying cracks!)
    center = bm_top.verts.new((0.0, 0.0, height - 0.008))
    uv_top = bm_top.loops.layers.uv.verify()
    top_v = []
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        r = r_prof[i] * 0.99
        top_v.append(bm_top.verts.new((math.cos(a) * r, math.sin(a) * r, height + 0.001)))
    for i in range(segs):
        ni = (i + 1) % segs
        f = bm_top.faces.new((center, top_v[i], top_v[ni]))
        a0 = 2.0 * math.pi * i / segs
        a1 = 2.0 * math.pi * ni / segs
        f.loops[0][uv_top].uv = (0.5, 0.5)
        f.loops[1][uv_top].uv = (0.5 + math.cos(a0) * 0.48, 0.5 + math.sin(a0) * 0.48)
        f.loops[2][uv_top].uv = (0.5 + math.cos(a1) * 0.48, 0.5 + math.sin(a1) * 0.48)
    mesh_top = bpy.data.meshes.new("ChoppingStumpTop")
    bm_top.normal_update()
    bm_top.to_mesh(mesh_top)
    bm_top.free()
    obj_top = bpy.data.objects.new("ChoppingStumpTop", mesh_top)
    bpy.context.collection.objects.link(obj_top)
    obj_top.data.materials.append(mats["wood_endgrain"])
    objs.append(obj_top)

    export_objects_glb(objs, f"{out_dir}/chopping_block.glb")


def build_hatchet(mats, out_dir):
    """Build a hand-forged bushcraft camping hatchet (手斧) with curved hickory handle."""
    clear_scene()
    objs = []

    # Curved ergonomic hickory wood handle
    bm_handle = bmesh.new()
    pts = [
        (0.0, 0.0, 0.0, 0.016, 0.024),
        (0.0, 0.008, 0.08, 0.013, 0.019),
        (0.0, 0.016, 0.17, 0.012, 0.018),
        (0.0, 0.010, 0.27, 0.014, 0.020),
        (0.0, 0.0, 0.36, 0.016, 0.025),
    ]
    segs = 14
    rings = []
    for x, y, z, rx, ry in pts:
        ring = []
        for i in range(segs):
            a = 2.0 * math.pi * i / segs
            ring.append(bm_handle.verts.new((x + math.cos(a) * rx, y + math.sin(a) * ry, z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for i in range(segs):
            ni = (i + 1) % segs
            bm_handle.faces.new((rings[j][i], rings[j][ni], rings[j + 1][ni], rings[j + 1][i]))
    bm_handle.faces.new(list(reversed(rings[0])))
    bm_handle.faces.new(rings[-1])
    objs.append(make_mesh_object("HatchetHandle", bm_handle, mats["camp_wood"], smooth=True, uv_scale=2.5))

    # Forged dark steel axe head (poll -> eye -> tapered bearded blade edge pointing +Y)
    bm_head = bmesh.new()
    # Cross-section profiles along Y (from poll -0.045 to sharp edge +0.105)
    # Each entry: (y, half_width_x, z_bot, z_top)
    prof = [
        (-0.042, 0.016, 0.295, 0.348),
        (-0.020, 0.020, 0.292, 0.352),
        (0.020, 0.020, 0.290, 0.352),
        (0.055, 0.011, 0.275, 0.356),
        (0.088, 0.005, 0.258, 0.362),
        (0.108, 0.0012, 0.252, 0.366),
    ]
    h_rings = []
    for y, hw, zb, zt in prof:
        h_rings.append([
            bm_head.verts.new((-hw, y, zb)),
            bm_head.verts.new((hw, y, zb)),
            bm_head.verts.new((hw, y, zt)),
            bm_head.verts.new((-hw, y, zt)),
        ])
    for j in range(len(h_rings) - 1):
        for i in range(4):
            ni = (i + 1) % 4
            bm_head.faces.new((h_rings[j][i], h_rings[j][ni], h_rings[j + 1][ni], h_rings[j + 1][i]))
    bm_head.faces.new(list(reversed(h_rings[0])))
    bm_head.faces.new(h_rings[-1])
    bmesh.ops.bevel(bm_head, geom=list(bm_head.edges), offset=0.002, segments=2, affect='EDGES')
    objs.append(make_mesh_object("HatchetHead", bm_head, mats["cast_iron"], smooth=True, uv_scale=4.0))

    export_objects_glb(objs, f"{out_dir}/hatchet.glb")


def build_firewood_assets(mats, out_dir):
    """Build Whole Hinoki Log, Split Half-Log, Kindling Bundle, Ember Bed, and Fire Blowpipe."""
    rng = random.Random(77)

    # 1. Whole Hinoki Firewood Log (length 0.36m, radius ~0.062m, standing or lying along X)
    clear_scene()
    objs = []
    segs = 14
    L = 0.36
    r0 = 0.062
    bm_bark = bmesh.new()
    bm_ends = bmesh.new()
    r_mod = [r0 * (1.0 + 0.08 * math.sin(i * 1.7) + rng.uniform(-0.04, 0.04)) for i in range(segs)]
    ring_a = [bm_bark.verts.new((-L * 0.5, math.cos(2 * math.pi * i / segs) * r_mod[i], math.sin(2 * math.pi * i / segs) * r_mod[i])) for i in range(segs)]
    ring_b = [bm_bark.verts.new((L * 0.5, math.cos(2 * math.pi * i / segs) * r_mod[i] * 0.96, math.sin(2 * math.pi * i / segs) * r_mod[i] * 0.96)) for i in range(segs)]
    for i in range(segs):
        ni = (i + 1) % segs
        bm_bark.faces.new((ring_a[i], ring_a[ni], ring_b[ni], ring_b[i]))
    objs.append(make_mesh_object("WholeLogBark", bm_bark, mats["bark"], smooth=True, uv_scale=2.5))

    # Cut wood end caps with concentric growth rings
    uv_end = bm_ends.loops.layers.uv.verify()
    for x_end, scale in ((-L * 0.5, 1.0), (L * 0.5, 0.96)):
        c = bm_ends.verts.new((x_end, 0.0, 0.0))
        rv = [bm_ends.verts.new((x_end, math.cos(2 * math.pi * i / segs) * r_mod[i] * scale, math.sin(2 * math.pi * i / segs) * r_mod[i] * scale)) for i in range(segs)]
        for i in range(segs):
            ni = (i + 1) % segs
            a0 = 2.0 * math.pi * i / segs
            a1 = 2.0 * math.pi * ni / segs
            if x_end < 0:
                f = bm_ends.faces.new((c, rv[ni], rv[i]))
                f.loops[0][uv_end].uv = (0.5, 0.5)
                f.loops[1][uv_end].uv = (0.5 + math.cos(a1) * 0.48, 0.5 + math.sin(a1) * 0.48)
                f.loops[2][uv_end].uv = (0.5 + math.cos(a0) * 0.48, 0.5 + math.sin(a0) * 0.48)
            else:
                f = bm_ends.faces.new((c, rv[i], rv[ni]))
                f.loops[0][uv_end].uv = (0.5, 0.5)
                f.loops[1][uv_end].uv = (0.5 + math.cos(a0) * 0.48, 0.5 + math.sin(a0) * 0.48)
                f.loops[2][uv_end].uv = (0.5 + math.cos(a1) * 0.48, 0.5 + math.sin(a1) * 0.48)
    mesh_ends = bpy.data.meshes.new("WholeLogEnds")
    bm_ends.normal_update()
    bm_ends.to_mesh(mesh_ends)
    bm_ends.free()
    obj_ends = bpy.data.objects.new("WholeLogEnds", mesh_ends)
    bpy.context.collection.objects.link(obj_ends)
    obj_ends.data.materials.append(mats["wood_endgrain"])
    objs.append(obj_ends)
    export_objects_glb(objs, f"{out_dir}/log_whole.glb")

    # 2. Split Quarter/Half Hinoki Firewood Wedge (fresh golden split inner wood + bark curved back!)
    clear_scene()
    objs = []
    bm_split = bmesh.new()
    bm_bark2 = bmesh.new()
    arc_n = 7
    rw = 0.062
    ang0, ang1 = -math.pi * 0.42, math.pi * 0.42
    # Split inner V-faces + end triangles
    a_apex0 = bm_split.verts.new((-L * 0.5, 0.0, 0.0))
    a_apex1 = bm_split.verts.new((L * 0.5, 0.0, 0.0))
    arc0 = []
    arc1 = []
    b_arc0 = []
    b_arc1 = []
    for k in range(arc_n):
        t = k / (arc_n - 1)
        a = ang0 + (ang1 - ang0) * t
        y = math.cos(a) * rw
        z = math.sin(a) * rw
        arc0.append(bm_split.verts.new((-L * 0.5, y, z)))
        arc1.append(bm_split.verts.new((L * 0.5, y * 0.97, z * 0.97)))
        b_arc0.append(bm_bark2.verts.new((-L * 0.5, y, z)))
        b_arc1.append(bm_bark2.verts.new((L * 0.5, y * 0.97, z * 0.97)))
    # Two split flat inner faces
    bm_split.faces.new((a_apex0, a_apex1, arc1[0], arc0[0]))
    bm_split.faces.new((a_apex0, arc0[-1], arc1[-1], a_apex1))
    # End caps
    for k in range(arc_n - 1):
        bm_split.faces.new((a_apex0, arc0[k], arc0[k + 1]))
        bm_split.faces.new((a_apex1, arc1[k + 1], arc1[k]))
        bm_bark2.faces.new((b_arc0[k], b_arc1[k], b_arc1[k + 1], b_arc0[k + 1]))
    objs.append(make_mesh_object("SplitLogInner", bm_split, mats["hinoki_split"], smooth=False, uv_scale=3.0))
    objs.append(make_mesh_object("SplitLogBark", bm_bark2, mats["bark"], smooth=True, uv_scale=2.5))
    export_objects_glb(objs, f"{out_dir}/log_split.glb")

    # 3. Kindling / Tinder Bundle (criss-crossed thin dry cedar sticks + curls)
    clear_scene()
    bm_k = bmesh.new()
    for idx in range(9):
        ang = idx * 0.68
        dy = (idx - 4) * 0.012
        dz = 0.012 + (idx % 3) * 0.014
        p0 = (-0.11 * math.cos(ang * 0.25), dy - 0.04 * math.sin(ang), dz)
        p1 = (0.11 * math.cos(ang * 0.25), dy + 0.04 * math.sin(ang), dz + 0.018)
        add_cylinder_segment(bm_k, p0, p1, 0.0075, 0.0055, segs=6)
    obj_k = make_mesh_object("KindlingBundle", bm_k, mats["hinoki_split"], smooth=False, uv_scale=4.0)
    export_objects_glb([obj_k], f"{out_dir}/kindling_bundle.glb")

    # 4. Glowing Charcoal Ember Bed (mound of irregular cracked glowing coal chunks inside firepit)
    clear_scene()
    bm_e = bmesh.new()
    for idx in range(18):
        a = rng.uniform(0, 2 * math.pi)
        rad = rng.uniform(0.0, 0.145)
        cx = math.cos(a) * rad
        cy = math.sin(a) * rad
        cz = 0.02 + (1.0 - rad / 0.16) * 0.045 + rng.uniform(-0.01, 0.012)
        sx = rng.uniform(0.028, 0.055)
        sy = rng.uniform(0.024, 0.050)
        sz = rng.uniform(0.018, 0.036)
        mat = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rng.uniform(0, 3.14), 4, 'Z') @ Matrix.Diagonal((sx, sy, sz, 1.0))
        bmesh.ops.create_icosphere(bm_e, subdivisions=1, radius=1.0, matrix=mat)
    obj_e = make_mesh_object("EmberBed", bm_e, mats["charcoal"], smooth=True, uv_scale=5.0)
    export_objects_glb([obj_e], f"{out_dir}/ember_bed.glb")

    # 5. Telescoping Stainless + Walnut Fire Blowpipe (火吹棒)
    clear_scene()
    objs = []
    bm_pipe = bmesh.new()
    add_cylinder_segment(bm_pipe, (0, 0, 0.0), (0, 0, 0.56), 0.0055, 0.004, segs=10)
    add_cylinder_segment(bm_pipe, (0, 0, 0.55), (0, 0, 0.62), 0.004, 0.0028, segs=10)
    objs.append(make_mesh_object("BlowpipeTube", bm_pipe, mats["brushed_steel"], smooth=True, uv_scale=4.0))
    bm_grip = bmesh.new()
    add_cylinder_segment(bm_grip, (0, 0, 0.02), (0, 0, 0.14), 0.0095, 0.009, segs=12)
    objs.append(make_mesh_object("BlowpipeGrip", bm_grip, mats["camp_wood"], smooth=True, uv_scale=3.0))
    export_objects_glb(objs, f"{out_dir}/blowpipe.glb")
