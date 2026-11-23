"""
Generates realistic Japanese outdoor cooking & pour-over coffee equipment:
- Lodge-style cast-iron skillet (铸铁平底锅)
- Thick-cut marbled A5 Wagyu steak (A5和牛牛排)
- Forest-green enameled Japanese camp pot (露营煮锅)
- Matte-black gooseneck pour-over kettle (手冲壶)
- Hario V60 ceramic coffee dripper + glass server carafe (手冲滤杯与分享壶)
- Snow Peak Ti-Single 450ml titanium mug (钛杯)
- Wooden cutting board + water jug (砧板与水桶)
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from generators.mesh_utils import (
    clear_scene, make_mesh_object, add_cylinder_segment, export_objects_glb
)


def lathe_bm(profile, segs=28, cap_bottom=True, cap_top=False):
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segs):
            a = 2.0 * math.pi * i / segs
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for i in range(segs):
            ni = (i + 1) % segs
            bm.faces.new((rings[j][i], rings[j][ni], rings[j + 1][ni], rings[j + 1][i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    return bm


def build_castiron_skillet(mats, out_dir):
    clear_scene()
    # Thick-walled cast-iron skillet body (radius ~12cm, depth 4.2cm)
    bm = lathe_bm([
        (0.0, 0.0),
        (0.098, 0.0),
        (0.118, 0.042),
        (0.123, 0.044),
        (0.114, 0.044),
        (0.095, 0.008),
        (0.0, 0.008),
    ], segs=32, cap_bottom=False, cap_top=False)

    # Ergonomic teardrop skillet handle (+Y)
    handle_pts = [
        (0.0, 0.114, 0.040, 0.022, 0.006),
        (0.0, 0.165, 0.045, 0.016, 0.005),
        (0.0, 0.225, 0.052, 0.018, 0.0055),
        (0.0, 0.245, 0.054, 0.012, 0.005),
    ]
    h_rings = []
    for x, y, z, rx, rz in handle_pts:
        h_rings.append([
            bm.verts.new((x - rx, y, z - rz)),
            bm.verts.new((x + rx, y, z - rz)),
            bm.verts.new((x + rx, y, z + rz)),
            bm.verts.new((x - rx, y, z + rz)),
        ])
    for j in range(len(h_rings) - 1):
        for i in range(4):
            ni = (i + 1) % 4
            bm.faces.new((h_rings[j][i], h_rings[j][ni], h_rings[j + 1][ni], h_rings[j + 1][i]))
    bm.faces.new(list(reversed(h_rings[0])))
    bm.faces.new(h_rings[-1])

    # Small opposite helper tab (-Y)
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0.0, -0.130, 0.040)) @ Matrix.Diagonal((0.052, 0.026, 0.010, 1.0)))

    obj = make_mesh_object("CastIronSkillet", bm, mats["cast_iron"], smooth=True, uv_scale=3.0)
    export_objects_glb([obj], f"{out_dir}/skillet_castiron.glb")


def build_wagyu_steak(mats, out_dir):
    clear_scene()
    bm = bmesh.new()
    # Organic ribeye steak contour (approx 15cm x 11cm x 2.2cm thick)
    segs = 24
    thickness = 0.022
    bot_ring = []
    mid_ring = []
    top_ring = []
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        # Natural ribeye lobe shape
        r = 0.068 * (1.0 + 0.16 * math.cos(a) + 0.12 * math.sin(2 * a - 0.5) + 0.06 * math.cos(3 * a))
        x = math.cos(a) * r * 1.15
        y = math.sin(a) * r * 0.85
        bot_ring.append(bm.verts.new((x * 0.94, y * 0.94, 0.0)))
        mid_ring.append(bm.verts.new((x, y, thickness * 0.5)))
        top_ring.append(bm.verts.new((x * 0.94, y * 0.94, thickness)))

    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((bot_ring[i], bot_ring[ni], mid_ring[ni], mid_ring[i]))
        bm.faces.new((mid_ring[i], mid_ring[ni], top_ring[ni], top_ring[i]))

    c_bot = bm.verts.new((0.0, 0.0, 0.0))
    c_top = bm.verts.new((0.0, 0.0, thickness + 0.003))
    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((c_bot, bot_ring[ni], bot_ring[i]))
        bm.faces.new((c_top, top_ring[i], top_ring[ni]))

    obj = make_mesh_object("WagyuSteak", bm, mats["wagyu_raw"], smooth=True, uv_scale=6.0)
    export_objects_glb([obj], f"{out_dir}/wagyu_steak.glb")


def build_camp_pot(mats, out_dir):
    """Build dark forest-green enameled camp pot (for curry udon / hot soup) with lid & bail."""
    clear_scene()
    objs = []
    bm_pot = lathe_bm([
        (0.0, 0.0),
        (0.088, 0.0),
        (0.094, 0.015),
        (0.096, 0.115),
        (0.102, 0.120),
        (0.092, 0.120),
        (0.090, 0.008),
        (0.0, 0.008),
    ], segs=28, cap_bottom=False, cap_top=False)
    objs.append(make_mesh_object("CampPotBody", bm_pot, mats["enamel_green"], smooth=True, uv_scale=3.0))

    # Matching domed lid
    bm_lid = lathe_bm([
        (0.098, 0.118),
        (0.095, 0.126),
        (0.065, 0.142),
        (0.018, 0.148),
        (0.0, 0.148),
    ], segs=28, cap_bottom=False, cap_top=False)
    objs.append(make_mesh_object("CampPotLid", bm_lid, mats["enamel_green"], smooth=True, uv_scale=3.0))

    # Wooden lid knob
    bm_knob = lathe_bm([
        (0.009, 0.146),
        (0.017, 0.156),
        (0.015, 0.168),
        (0.0, 0.170),
    ], segs=16, cap_bottom=False, cap_top=False)
    objs.append(make_mesh_object("CampPotKnob", bm_knob, mats["camp_wood"], smooth=True, uv_scale=4.0))

    # Wire bail handle
    bm_bail = bmesh.new()
    pts = []
    for i in range(13):
        a = math.pi * i / 12.0
        pts.append((math.cos(a) * 0.104, 0.0, 0.112 + math.sin(a) * 0.115))
    for i in range(len(pts) - 1):
        add_cylinder_segment(bm_bail, pts[i], pts[i + 1], 0.003, 0.003, segs=6)
    objs.append(make_mesh_object("CampPotBail", bm_bail, mats["brushed_steel"], smooth=True, uv_scale=4.0))

    export_objects_glb(objs, f"{out_dir}/camp_pot.glb")


def build_gooseneck_kettle(mats, out_dir):
    """Build a matte-black Japanese pour-over gooseneck kettle (Kalita / Hario style)."""
    clear_scene()
    objs = []

    # Tapered matte-black body
    bm_body = lathe_bm([
        (0.0, 0.0),
        (0.068, 0.0),
        (0.072, 0.012),
        (0.066, 0.065),
        (0.055, 0.125),
        (0.050, 0.140),
        (0.054, 0.146),
        (0.048, 0.146),
        (0.048, 0.134),
        (0.0, 0.134),
    ], segs=28, cap_bottom=False, cap_top=False)

    # Graceful S-curved gooseneck spout (+Y)
    spout_pts = [
        (0.0, 0.064, 0.025, 0.011),
        (0.0, 0.088, 0.032, 0.0095),
        (0.0, 0.105, 0.065, 0.008),
        (0.0, 0.112, 0.108, 0.0068),
        (0.0, 0.130, 0.136, 0.0055),
        (0.0, 0.150, 0.142, 0.0048),
    ]
    for k in range(len(spout_pts) - 1):
        p0 = spout_pts[k][:3]
        p1 = spout_pts[k + 1][:3]
        add_cylinder_segment(bm_body, p0, p1, spout_pts[k][3], spout_pts[k + 1][3], segs=12, cap=False)

    # Ergonomic C-handle (-Y)
    h_pts = [
        (0.0, -0.052, 0.128),
        (0.0, -0.098, 0.122),
        (0.0, -0.108, 0.082),
        (0.0, -0.095, 0.036),
        (0.0, -0.066, 0.028),
    ]
    for k in range(len(h_pts) - 1):
        add_cylinder_segment(bm_body, h_pts[k], h_pts[k + 1], 0.0065, 0.0065, segs=10)

    objs.append(make_mesh_object("KettleBody", bm_body, mats["matte_black"], smooth=True, uv_scale=3.0))

    # Walnut wood lid knob
    bm_knob = lathe_bm([
        (0.008, 0.136),
        (0.015, 0.150),
        (0.013, 0.162),
        (0.0, 0.164),
    ], segs=16, cap_bottom=False, cap_top=False)
    objs.append(make_mesh_object("KettleWoodKnob", bm_knob, mats["camp_wood"], smooth=True, uv_scale=4.0))

    export_objects_glb(objs, f"{out_dir}/kettle_gooseneck.glb")


def build_coffee_dripper_set(mats, out_dir):
    """Build Hario V60 ceramic conical dripper sitting atop a glass server carafe."""
    clear_scene()
    objs = []

    # 1. Glass carafe server
    bm_carafe = lathe_bm([
        (0.0, 0.0),
        (0.054, 0.0),
        (0.060, 0.025),
        (0.052, 0.078),
        (0.042, 0.112),
        (0.046, 0.122),
    ], segs=26, cap_bottom=False, cap_top=False)
    objs.append(make_mesh_object("CoffeeCarafeGlass", bm_carafe, mats["clear_glass"], smooth=True, uv_scale=2.0))

    # Carafe black handle collar
    bm_ch = bmesh.new()
    h_pts = [
        (0.0, -0.044, 0.105),
        (0.0, -0.082, 0.102),
        (0.0, -0.086, 0.056),
        (0.0, -0.056, 0.026),
    ]
    for k in range(len(h_pts) - 1):
        add_cylinder_segment(bm_ch, h_pts[k], h_pts[k + 1], 0.0055, 0.0055, segs=8)
    objs.append(make_mesh_object("CoffeeCarafeHandle", bm_ch, mats["matte_black"], smooth=True, uv_scale=4.0))

    # 2. White ceramic V60 dripper cone on top (z = 0.122..0.205)
    bm_v60 = lathe_bm([
        (0.048, 0.120),
        (0.048, 0.126),
        (0.018, 0.126),
        (0.056, 0.204),
        (0.052, 0.204),
        (0.015, 0.128),
    ], segs=28, cap_bottom=False, cap_top=False)
    objs.append(make_mesh_object("V60Dripper", bm_v60, mats["ceramic_white"], smooth=True, uv_scale=3.0))

    # 3. Fresh dark-roasted coffee grounds cone inside V60
    bm_grounds = lathe_bm([
        (0.016, 0.140),
        (0.038, 0.175),
        (0.024, 0.168),
        (0.0, 0.164),
    ], segs=20, cap_bottom=False, cap_top=False)
    objs.append(make_mesh_object("CoffeeGrounds", bm_grounds, mats["coffee_grounds"], smooth=True, uv_scale=4.0))

    export_objects_glb(objs, f"{out_dir}/coffee_dripper_set.glb")


def build_titanium_mug(mats, out_dir):
    """Build Snow Peak Ti-Single 450ml mug with folding twin wire handles."""
    clear_scene()
    objs = []
    bm = lathe_bm([
        (0.0, 0.0),
        (0.041, 0.0),
        (0.042, 0.090),
        (0.044, 0.092),
        (0.040, 0.092),
        (0.039, 0.004),
        (0.0, 0.004),
    ], segs=26, cap_bottom=False, cap_top=False)

    # Twin folding wire handles (-Y)
    for sx in (-0.006, 0.006):
        pts = [
            (sx, -0.042, 0.075),
            (sx, -0.076, 0.072),
            (sx, -0.078, 0.025),
            (sx, -0.042, 0.020),
        ]
        for k in range(len(pts) - 1):
            add_cylinder_segment(bm, pts[k], pts[k + 1], 0.0022, 0.0022, segs=6)

    objs.append(make_mesh_object("TitaniumMug", bm, mats["titanium"], smooth=True, uv_scale=4.0))
    export_objects_glb(objs, f"{out_dir}/titanium_mug.glb")


def build_cutting_board_and_jug(mats, out_dir):
    """Build a solid oak cutting board and classic olive/tan camp water jug (Stanley style)."""
    # 1. Cutting board
    clear_scene()
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, 0.010)) @ Matrix.Diagonal((0.30, 0.20, 0.020, 1.0)))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.004, segments=2, affect='EDGES')
    obj = make_mesh_object("CuttingBoard", bm, mats["camp_wood"], smooth=True, uv_scale=2.5)
    export_objects_glb([obj], f"{out_dir}/cutting_board.glb")

    # 2. Stanley-style insulated water jug
    clear_scene()
    objs = []
    bm_jug = lathe_bm([
        (0.0, 0.0),
        (0.118, 0.0),
        (0.122, 0.02),
        (0.122, 0.25),
        (0.114, 0.275),
        (0.114, 0.30),
        (0.0, 0.30),
    ], segs=24, cap_bottom=False, cap_top=False)
    objs.append(make_mesh_object("WaterJugBody", bm_jug, mats["enamel_green"], smooth=True, uv_scale=2.5))
    # Spigot tap on front (+Y)
    bm_tap = bmesh.new()
    add_cylinder_segment(bm_tap, (0.0, 0.118, 0.068), (0.0, 0.155, 0.068), 0.011, 0.009, segs=10)
    add_cylinder_segment(bm_tap, (0.0, 0.150, 0.068), (0.0, 0.152, 0.048), 0.007, 0.006, segs=8)
    objs.append(make_mesh_object("WaterJugSpigot", bm_tap, mats["matte_black"], smooth=True, uv_scale=4.0))
    export_objects_glb(objs, f"{out_dir}/water_jug.glb")
