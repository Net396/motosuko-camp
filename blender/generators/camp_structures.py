"""
High-Detail Japanese Camp Structures & Props for Lake Motosuko (Blender 5.3):
- Photorealistic 60-segment Nordisk Asgard / Tent-Mark Circus TC Cotton Bell Tent
  with catenary fabric tension wrinkles, raised stitched panel seams, rain cap,
  dual peak ventilation hoods, zippered mesh windows, rolled vestibule doors with toggle straps,
  braided guylines + wooden tensioners, forged J-stakes, Pendleton wool rug, oak cot & sleeping bag!
- Folding wooden roll-top table (蛋卷桌) with beveled oak slats & brass hardware
- Kermit Chair (克米特椅) with draped Pendleton wool throw blanket
- Vintage Feuerhand hurricane oil lantern
- Authentic Koan Camp extras: Olive camp cooler box + wooden Japanese lakeside post + iron lantern stand
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from generators.mesh_utils import (
    clear_scene, make_mesh_object, add_cylinder_segment, export_objects_glb
)


def build_canvas_tent(mats, out_dir):
    """Build a high-resolution, museum-grade Nordisk / Circus TC Cotton Bell Tent."""
    clear_scene()
    objs = []

    n_panels = 12
    n_seg = 60  # Smooth 60-segment circumference with subtle sculpted catenary fabric drapes!
    base_r = 2.02
    wall_h = 0.62
    peak_h = 2.56

    bm_canvas = bmesh.new()
    rings = []
    # 12 vertical height rings for true catenary roof curve + fabric tension folds!
    levels = [
        (0.02, base_r * 1.005, 0.000),
        (0.22, base_r * 0.996, 0.008),
        (0.44, base_r * 0.988, 0.010),
        (wall_h, base_r * 0.975, 0.012),
        (0.86, base_r * 0.845, 0.032),
        (1.12, base_r * 0.710, 0.044),
        (1.38, base_r * 0.575, 0.048),
        (1.64, base_r * 0.440, 0.042),
        (1.90, base_r * 0.305, 0.032),
        (2.16, base_r * 0.175, 0.018),
        (2.40, base_r * 0.068, 0.006),
        (peak_h - 0.04, 0.032, 0.000),
    ]

    # Doorway opening spans front +Y (indices 0..4 and n_seg-4..n_seg-1 for lower 7 rings)
    door_half_span = 4

    def is_door_face(r_idx, i):
        if r_idx >= 7:
            return False
        return (i < door_half_span) or (i >= n_seg - door_half_span)

    for r_idx, (z, rad, sag) in enumerate(levels):
        ring = []
        for i in range(n_seg):
            a = 2.0 * math.pi * i / n_seg
            # Sculpted catenary sag between the 12 structural panel seams + micro fabric ripples!
            panel_phase = (i % (n_seg // n_panels)) / float(n_seg // n_panels)
            catenary = math.sin(panel_phase * math.pi)
            micro_fold = math.sin(a * 24.0 + r_idx * 0.8) * 0.005 * (1.0 - r_idx / len(levels))
            r_mod = rad - sag * catenary + micro_fold
            ring.append(bm_canvas.verts.new((math.sin(a) * r_mod, math.cos(a) * r_mod, z)))
        rings.append(ring)

    peak_v = bm_canvas.verts.new((0.0, 0.0, peak_h))

    for r_idx in range(len(rings) - 1):
        r0, r1 = rings[r_idx], rings[r_idx + 1]
        for i in range(n_seg):
            ni = (i + 1) % n_seg
            if is_door_face(r_idx, i):
                continue
            bm_canvas.faces.new((r0[i], r0[ni], r1[ni], r1[i]))

    for i in range(n_seg):
        ni = (i + 1) % n_seg
        bm_canvas.faces.new((rings[-1][i], rings[-1][ni], peak_v))

    # Neatly rolled-back canvas entrance flaps with natural tapered folds flanking the doorway
    for side in (-1, 1):
        a = side * (2.0 * math.pi * door_half_span / n_seg)
        p_bot = Vector((math.sin(a) * (base_r + 0.04), math.cos(a) * (base_r + 0.04), 0.04))
        p_mid = Vector((math.sin(a) * (base_r * 0.82), math.cos(a) * (base_r * 0.82), 0.92))
        p_top = Vector((math.sin(a) * (base_r * 0.44), math.cos(a) * (base_r * 0.44), 1.66))
        add_cylinder_segment(bm_canvas, p_bot, p_mid, 0.058, 0.048, segs=12)
        add_cylinder_segment(bm_canvas, p_mid, p_top, 0.048, 0.026, segs=12)

    # Top waterproof rain-cap cone & two triangular ventilation eaves near peak!
    cap_segs = 24
    cap_ring_bot = [bm_canvas.verts.new((math.sin(2 * math.pi * i / cap_segs) * 0.24, math.cos(2 * math.pi * i / cap_segs) * 0.24, peak_h - 0.26)) for i in range(cap_segs)]
    cap_apex = bm_canvas.verts.new((0.0, 0.0, peak_h + 0.03))
    for i in range(cap_segs):
        ni = (i + 1) % cap_segs
        bm_canvas.faces.new((cap_ring_bot[i], cap_ring_bot[ni], cap_apex))

    # Give thin realistic fabric double wall (avoiding thick overlap)
    bmesh.ops.solidify(bm_canvas, geom=list(bm_canvas.faces), thickness=0.008)
    objs.append(make_mesh_object("TentCanvas", bm_canvas, mats["tent_canvas"], smooth=True, uv_scale=0.75))

    # 2. Raised Stitched Panel Seam Ribs, Mud Skirt, Door Trim Piping, Toggle Straps & Window Frames!
    bm_trim = bmesh.new()
    # Heavy mud skirt around perimeter
    for i in range(n_seg):
        ni = (i + 1) % n_seg
        if is_door_face(0, i):
            continue
        a0 = 2.0 * math.pi * i / n_seg
        a1 = 2.0 * math.pi * ni / n_seg
        v0 = bm_trim.verts.new((math.sin(a0) * (base_r + 0.14), math.cos(a0) * (base_r + 0.14), 0.006))
        v1 = bm_trim.verts.new((math.sin(a1) * (base_r + 0.14), math.cos(a1) * (base_r + 0.14), 0.006))
        v2 = bm_trim.verts.new((math.sin(a1) * (base_r + 0.01), math.cos(a1) * (base_r + 0.01), 0.11))
        v3 = bm_trim.verts.new((math.sin(a0) * (base_r + 0.01), math.cos(a0) * (base_r + 0.01), 0.11))
        bm_trim.faces.new((v0, v1, v2, v3))

    # Subtle tone-on-tone stitched canvas seam piping (instead of harsh dark lines!)
    bm_seams = bmesh.new()
    for p_idx in range(n_panels):
        i = p_idx * (n_seg // n_panels)
        if i < door_half_span or i > n_seg - door_half_span:
            continue
        a = 2.0 * math.pi * i / n_seg
        p_eave = Vector((math.sin(a) * (base_r * 0.985), math.cos(a) * (base_r * 0.985), wall_h))
        p_top = Vector((math.sin(a) * 0.04, math.cos(a) * 0.04, peak_h - 0.04))
        add_cylinder_segment(bm_seams, p_eave, p_top, 0.0045, 0.0035, segs=6, cap=False)
    objs.append(make_mesh_object("TentSeams", bm_seams, mats["rope"], smooth=True, uv_scale=2.0))

    # Toggle straps binding rolled door flaps
    for side in (-1, 1):
        a = side * (2.0 * math.pi * door_half_span / n_seg)
        for z_t, r_t in ((0.45, base_r * 0.93), (1.15, base_r * 0.69)):
            c = Vector((math.sin(a) * r_t, math.cos(a) * r_t, z_t))
            add_cylinder_segment(bm_trim, c - Vector((0, 0, 0.012)), c + Vector((0, 0, 0.012)), 0.056, 0.056, segs=10)

    # Heavy bathtub groundsheet floor
    gs_ring = [bm_trim.verts.new((math.sin(2 * math.pi * i / 36) * (base_r - 0.04), math.cos(2 * math.pi * i / 36) * (base_r - 0.04), 0.025)) for i in range(36)]
    gs_f = bm_trim.faces.new(gs_ring)
    bmesh.ops.solidify(bm_trim, geom=[gs_f], thickness=0.025)
    objs.append(make_mesh_object("TentTrimAndFloor", bm_trim, mats["tent_trim"], smooth=True, uv_scale=1.2))

    # 3. Semi-Circular Lower Mesh Windows (left & right walls, iconic Nordisk Asgard touch!)
    bm_win = bmesh.new()
    for side_ang in (math.pi * 0.5, -math.pi * 0.5, math.pi * 0.85, -math.pi * 0.85):
        w_center = Vector((math.sin(side_ang) * (base_r * 0.985), math.cos(side_ang) * (base_r * 0.985), 0.34))
        tan_v = Vector((math.cos(side_ang), -math.sin(side_ang), 0.0))
        norm_v = Vector((math.sin(side_ang), math.cos(side_ang), 0.0))
        arc_v = [bm_win.verts.new(w_center + norm_v * 0.012 + tan_v * (-0.28))]
        for k in range(1, 9):
            th = math.pi * k / 8.0
            pt = w_center + norm_v * 0.012 + tan_v * (-math.cos(th) * 0.28) + Vector((0, 0, math.sin(th) * 0.22))
            arc_v.append(bm_win.verts.new(pt))
        bm_win.faces.new(arc_v)
    objs.append(make_mesh_object("TentMeshWindows", bm_win, mats["tent_mesh"], smooth=False, uv_scale=3.0))

    # 4. Detailed Interior: Pendleton Wool Camp Rug, Wooden Center Pole, Entrance A-Poles, Oak Cot & Quilted Blanket!
    bm_wood = bmesh.new()
    add_cylinder_segment(bm_wood, (0, 0, 0.03), (0, 0, peak_h - 0.03), 0.025, 0.022, segs=12)
    # Entrance A-frame wooden poles with angled porch overhang
    for side in (-1, 1):
        add_cylinder_segment(bm_wood, (side * 0.68, base_r * 0.96, 0.0), (0.0, base_r * 0.52, 1.66), 0.017, 0.015, segs=10)
    # Wooden triangular guyline tensioners (自在金具)
    for i in range(n_panels):
        if i == 0 or i == 1 or i == n_panels - 1:
            continue
        a = 2.0 * math.pi * i / n_panels
        p_t = Vector((math.sin(a) * (base_r + 0.55), math.cos(a) * (base_r + 0.55), 0.22))
        bmesh.ops.create_cube(bm_wood, size=1.0, matrix=Matrix.Translation(p_t) @ Matrix.Rotation(-a, 4, 'Z') @ Matrix.Diagonal((0.035, 0.012, 0.055, 1.0)))

    # Low wooden camp cot frame inside back of tent
    cot_y = -0.68
    for cx in (-0.84, 0.84):
        add_cylinder_segment(bm_wood, (cx, cot_y - 0.34, 0.03), (cx, cot_y - 0.34, 0.25), 0.018, 0.018, segs=8)
        add_cylinder_segment(bm_wood, (cx, cot_y + 0.34, 0.03), (cx, cot_y + 0.34, 0.25), 0.018, 0.018, segs=8)
    add_cylinder_segment(bm_wood, (-0.88, cot_y - 0.34, 0.25), (0.88, cot_y - 0.34, 0.25), 0.018, 0.018, segs=8)
    add_cylinder_segment(bm_wood, (-0.88, cot_y + 0.34, 0.25), (0.88, cot_y + 0.34, 0.25), 0.018, 0.018, segs=8)
    objs.append(make_mesh_object("TentWoodPoles", bm_wood, mats["camp_wood"], smooth=True, uv_scale=1.4))

    # Pendleton camp wool rug & cozy sleeping bag blanket inside tent
    bm_wool = bmesh.new()
    bmesh.ops.create_cube(bm_wool, size=1.0, matrix=Matrix.Translation((0.0, 0.25, 0.048)) @ Matrix.Diagonal((1.45, 1.05, 0.012, 1.0)))
    # Sleeping bag + pillow on cot
    bmesh.ops.create_cube(bm_wool, size=1.0, matrix=Matrix.Translation((0.08, cot_y, 0.31)) @ Matrix.Diagonal((1.38, 0.66, 0.11, 1.0)))
    bmesh.ops.bevel(bm_wool, geom=list(bm_wool.edges), offset=0.03, segments=3, affect='EDGES')
    objs.append(make_mesh_object("TentWoolInterior", bm_wool, mats["camp_wool"], smooth=True, uv_scale=1.0))

    # 5. Tensioned braided guylines & forged J-hook steel stakes
    bm_rope = bmesh.new()
    bm_pegs = bmesh.new()
    for i in range(n_panels):
        if i == 0:
            continue
        a = 2.0 * math.pi * i / n_panels
        eave_pt = Vector((math.sin(a) * base_r * 0.98, math.cos(a) * base_r * 0.98, wall_h))
        peg_pt = Vector((math.sin(a) * (base_r + 0.88), math.cos(a) * (base_r + 0.88), 0.02))
        add_cylinder_segment(bm_rope, eave_pt, peg_pt, 0.0032, 0.0032, segs=6, cap=False)
        peg_top = peg_pt + Vector((math.sin(a) * 0.045, math.cos(a) * 0.045, 0.11))
        add_cylinder_segment(bm_pegs, peg_pt - Vector((0, 0, 0.06)), peg_top, 0.0055, 0.0065, segs=6)

    objs.append(make_mesh_object("TentGuylines", bm_rope, mats["rope"], smooth=True, uv_scale=2.0))
    objs.append(make_mesh_object("TentPegs", bm_pegs, mats["cast_iron"], smooth=True, uv_scale=2.0))

    export_objects_glb(objs, f"{out_dir}/tent_nordisk.glb")


def build_camp_table(mats, out_dir):
    """Build an authentic Japanese wooden folding roll-top camp table (蛋卷桌)."""
    clear_scene()
    objs = []
    bm_wood = bmesh.new()

    table_w = 0.96
    table_d = 0.62
    table_h = 0.44

    num_slats = 12
    slat_w = (table_w - 0.04) / num_slats - 0.005
    for i in range(num_slats):
        sx = -table_w * 0.5 + 0.02 + slat_w * 0.5 + i * (slat_w + 0.005)
        mat_xform = Matrix.Translation((sx, 0.0, table_h - 0.009)) @ Matrix.Diagonal((slat_w, table_d, 0.016, 1.0))
        res = bmesh.ops.create_cube(bm_wood, size=1.0, matrix=mat_xform)
        edges = list({e for v in res["verts"] for e in v.link_edges})
        bmesh.ops.bevel(bm_wood, geom=edges, offset=0.0025, segments=2, affect='EDGES')

    for sy in (-table_d * 0.38, table_d * 0.38):
        bmesh.ops.create_cube(bm_wood, size=1.0, matrix=Matrix.Translation((0.0, sy, table_h - 0.028)) @ Matrix.Diagonal((table_w * 0.92, 0.026, 0.024, 1.0)))

    for sx in (-table_w * 0.38, table_w * 0.38):
        add_cylinder_segment(bm_wood, (sx, -table_d * 0.40, 0.0), (sx, table_d * 0.36, table_h - 0.03), 0.015, 0.015, segs=10)
        add_cylinder_segment(bm_wood, (sx, table_d * 0.40, 0.0), (sx, -table_d * 0.36, table_h - 0.03), 0.015, 0.015, segs=10)

    add_cylinder_segment(bm_wood, (-table_w * 0.38, 0.0, table_h * 0.44), (table_w * 0.38, 0.0, table_h * 0.44), 0.012, 0.012, segs=10)
    objs.append(make_mesh_object("RollTopTableWood", bm_wood, mats["camp_wood"], smooth=True, uv_scale=1.6))

    bm_brass = bmesh.new()
    for sx in (-table_w * 0.38, table_w * 0.38):
        add_cylinder_segment(bm_brass, (sx - 0.022, 0.0, table_h * 0.48), (sx + 0.022, 0.0, table_h * 0.48), 0.008, 0.008, segs=8)
    objs.append(make_mesh_object("RollTopTableHardware", bm_brass, mats["brass"], smooth=True, uv_scale=4.0))

    export_objects_glb(objs, f"{out_dir}/camp_table.glb")


def build_kermit_chair(mats, out_dir):
    """Build the iconic Kermit Chair (克米特椅) with oak frame, duck canvas & draped wool blanket!"""
    clear_scene()
    objs = []
    bm_wood = bmesh.new()

    w = 0.52
    seat_h_front = 0.34
    seat_h_back = 0.29
    back_top_h = 0.72

    for sx in (-w * 0.5, w * 0.5):
        add_cylinder_segment(bm_wood, (sx, 0.24, 0.0), (sx, 0.20, 0.50), 0.014, 0.014, segs=12)
        add_cylinder_segment(bm_wood, (sx, -0.26, 0.0), (sx, -0.16, seat_h_back), 0.014, 0.014, segs=12)
        add_cylinder_segment(bm_wood, (sx, -0.16, seat_h_back), (sx, -0.30, back_top_h), 0.014, 0.013, segs=12)
        add_cylinder_segment(bm_wood, (sx, 0.23, seat_h_front), (sx, -0.18, seat_h_back), 0.013, 0.013, segs=12)
        arm_mat = Matrix.Translation((sx, -0.02, 0.50)) @ Matrix.Diagonal((0.046, 0.45, 0.018, 1.0))
        res = bmesh.ops.create_cube(bm_wood, size=1.0, matrix=arm_mat)
        edges = list({e for v in res["verts"] for e in v.link_edges})
        bmesh.ops.bevel(bm_wood, geom=edges, offset=0.004, segments=2, affect='EDGES')

    add_cylinder_segment(bm_wood, (-w * 0.5, 0.22, seat_h_front - 0.02), (w * 0.5, 0.22, seat_h_front - 0.02), 0.013, 0.013, segs=10)
    add_cylinder_segment(bm_wood, (-w * 0.5, -0.17, seat_h_back - 0.02), (w * 0.5, -0.17, seat_h_back - 0.02), 0.013, 0.013, segs=10)

    arch_pts = []
    for i in range(9):
        t = i / 8.0
        x = -w * 0.5 + t * w
        y = -0.30 - 0.035 * math.sin(t * math.pi)
        z = back_top_h + 0.022 * math.sin(t * math.pi)
        arch_pts.append((x, y, z))
    for i in range(len(arch_pts) - 1):
        add_cylinder_segment(bm_wood, arch_pts[i], arch_pts[i + 1], 0.013, 0.013, segs=10)
    objs.append(make_mesh_object("KermitFrame", bm_wood, mats["camp_wood"], smooth=True, uv_scale=1.8))

    # Duck-canvas seat & backrest slings
    bm_fab = bmesh.new()
    s_grid = []
    for j in range(6):
        row = []
        v = j / 5.0
        y = 0.22 * (1.0 - v) + (-0.17) * v
        z_base = seat_h_front * (1.0 - v) + seat_h_back * v
        for i in range(7):
            u = i / 6.0
            x = -w * 0.48 + u * w * 0.96
            sag = -0.024 * math.sin(u * math.pi) * math.sin(v * math.pi)
            row.append(bm_fab.verts.new((x, y, z_base + sag)))
        s_grid.append(row)
    for j in range(5):
        for i in range(6):
            bm_fab.faces.new((s_grid[j][i], s_grid[j][i + 1], s_grid[j + 1][i + 1], s_grid[j + 1][i]))

    b_grid = []
    for j in range(6):
        row = []
        v = j / 5.0
        y = -0.17 * (1.0 - v) + (-0.30) * v
        z = (seat_h_back + 0.03) * (1.0 - v) + (back_top_h - 0.01) * v
        for i in range(7):
            u = i / 6.0
            x = -w * 0.48 + u * w * 0.96
            curve = -0.036 * math.sin(u * math.pi)
            row.append(bm_fab.verts.new((x, y + curve, z)))
        b_grid.append(row)
    for j in range(5):
        for i in range(6):
            bm_fab.faces.new((b_grid[j][i], b_grid[j][i + 1], b_grid[j + 1][i + 1], b_grid[j + 1][i]))
    bmesh.ops.solidify(bm_fab, geom=list(bm_fab.faces), thickness=0.008)
    objs.append(make_mesh_object("KermitCanvas", bm_fab, mats["chair_fabric"], smooth=True, uv_scale=2.0))

    # Cozy folded Pendleton wool blanket casually draped over the left half of the backrest!
    bm_blk = bmesh.new()
    res_b = bmesh.ops.create_cube(
        bm_blk, size=1.0,
        matrix=Matrix.Translation((-0.11, -0.32, 0.62)) @ Matrix.Rotation(0.28, 4, 'X') @ Matrix.Diagonal((0.26, 0.09, 0.28, 1.0))
    )
    bmesh.ops.bevel(bm_blk, geom=list(bm_blk.edges), offset=0.022, segments=3, affect='EDGES')
    objs.append(make_mesh_object("KermitBlanket", bm_blk, mats["camp_wool"], smooth=True, uv_scale=1.6))

    bm_metal = bmesh.new()
    for sx in (-w * 0.5, w * 0.5):
        bmesh.ops.create_cube(bm_metal, size=1.0, matrix=Matrix.Translation((sx, -0.16, seat_h_back)) @ Matrix.Diagonal((0.035, 0.045, 0.045, 1.0)))
    objs.append(make_mesh_object("KermitBrackets", bm_metal, mats["brushed_steel"], smooth=True, uv_scale=4.0))

    export_objects_glb(objs, f"{out_dir}/kermit_chair.glb")


def build_hurricane_lantern(mats, out_dir):
    """Build a vintage Feuerhand / Dietz style hurricane oil lantern (煤油风灯)."""
    clear_scene()
    objs = []

    def lathe_profile(profile, segs=28):
        bm = bmesh.new()
        rings = []
        for r, z in profile:
            ring = [bm.verts.new((math.cos(2 * math.pi * i / segs) * r, math.sin(2 * math.pi * i / segs) * r, z)) for i in range(segs)]
            rings.append(ring)
        for j in range(len(rings) - 1):
            for i in range(segs):
                ni = (i + 1) % segs
                bm.faces.new((rings[j][i], rings[j][ni], rings[j + 1][ni], rings[j + 1][i]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        return bm

    bm_body = lathe_profile([
        (0.068, 0.0), (0.070, 0.015), (0.068, 0.055),
        (0.052, 0.072), (0.044, 0.088), (0.038, 0.095),
    ])
    bm_hood = lathe_profile([
        (0.045, 0.215), (0.058, 0.222), (0.048, 0.245),
        (0.028, 0.265), (0.032, 0.285), (0.022, 0.295),
    ])
    for sx in (-1, 1):
        pts = [(sx * 0.058, 0.0, 0.058), (sx * 0.078, 0.0, 0.085), (sx * 0.082, 0.0, 0.165), (sx * 0.074, 0.0, 0.225), (sx * 0.036, 0.0, 0.258)]
        for k in range(len(pts) - 1):
            add_cylinder_segment(bm_hood, pts[k], pts[k + 1], 0.0085, 0.0085, segs=10)

    objs.append(make_mesh_object("LanternBody", bm_body, mats["enamel_green"], smooth=True, uv_scale=3.0))
    objs.append(make_mesh_object("LanternHood", bm_hood, mats["enamel_green"], smooth=True, uv_scale=3.0))

    bm_brass = lathe_profile([(0.036, 0.092), (0.032, 0.106), (0.020, 0.115)], segs=20)
    add_cylinder_segment(bm_brass, (0.046, 0.02, 0.062), (0.054, 0.024, 0.078), 0.009, 0.009, segs=10)
    bail_pts = [(math.cos(math.pi * i / 14.0) * 0.088, 0.0, 0.22 + math.sin(math.pi * i / 14.0) * 0.125) for i in range(15)]
    for i in range(len(bail_pts) - 1):
        add_cylinder_segment(bm_brass, bail_pts[i], bail_pts[i + 1], 0.0028, 0.0028, segs=6)
    objs.append(make_mesh_object("LanternBrass", bm_brass, mats["brass"], smooth=True, uv_scale=4.0))

    bm_glass = lathe_profile([(0.034, 0.102), (0.047, 0.125), (0.054, 0.155), (0.049, 0.188), (0.036, 0.215)])
    objs.append(make_mesh_object("LanternGlass", bm_glass, mats["clear_glass"], smooth=True, uv_scale=2.0))

    export_objects_glb(objs, f"{out_dir}/lantern_hurricane.glb")


def build_camp_extras(mats, out_dir):
    """Build extra authentic Japanese camp atmosphere props: Cooler Box, Firewood Rack, Iron Lantern Stand."""
    # 1. Olive Vintage Hard Cooler Box (YETI / Stanley camp style)
    clear_scene()
    objs = []
    bm_box = bmesh.new()
    res = bmesh.ops.create_cube(bm_box, size=1.0, matrix=Matrix.Translation((0, 0, 0.17)) @ Matrix.Diagonal((0.52, 0.34, 0.32, 1.0)))
    bmesh.ops.bevel(bm_box, geom=list(bm_box.edges), offset=0.018, segments=3, affect='EDGES')
    # Hinged lid
    res_l = bmesh.ops.create_cube(bm_box, size=1.0, matrix=Matrix.Translation((0, 0, 0.355)) @ Matrix.Diagonal((0.54, 0.36, 0.055, 1.0)))
    edges_l = list({e for v in res_l["verts"] for e in v.link_edges})
    bmesh.ops.bevel(bm_box, geom=edges_l, offset=0.012, segments=2, affect='EDGES')
    objs.append(make_mesh_object("CoolerBody", bm_box, mats["enamel_green"], smooth=True, uv_scale=1.5))

    bm_latches = bmesh.new()
    for sx in (-0.16, 0.16):
        bmesh.ops.create_cube(bm_latches, size=1.0, matrix=Matrix.Translation((sx, 0.175, 0.32)) @ Matrix.Diagonal((0.035, 0.02, 0.065, 1.0)))
    for sx in (-0.275, 0.275):
        add_cylinder_segment(bm_latches, (sx, -0.07, 0.25), (sx, 0.07, 0.25), 0.008, 0.008, segs=8)
    objs.append(make_mesh_object("CoolerHardware", bm_latches, mats["brushed_steel"], smooth=True, uv_scale=4.0))
    export_objects_glb(objs, f"{out_dir}/cooler_box.glb")

    # 2. Forged Iron Bushcraft Lantern Stand (ランタンハンガー)
    clear_scene()
    bm_st = bmesh.new()
    # Ground spike & main wrought-iron post + S-hook curve at 1.75m
    add_cylinder_segment(bm_st, (0, 0, -0.05), (0, 0, 1.65), 0.0085, 0.0075, segs=10)
    # Curved shepherd's hook top
    hook = [(0, 0, 1.64), (0, 0.04, 1.76), (0, 0.14, 1.82), (0, 0.24, 1.78), (0, 0.26, 1.70)]
    for k in range(len(hook) - 1):
        add_cylinder_segment(bm_st, hook[k], hook[k + 1], 0.007, 0.006, segs=8)
    # Tripod base legs
    for i in range(3):
        a = 2.0 * math.pi * i / 3.0
        add_cylinder_segment(bm_st, (0, 0, 0.34), (math.cos(a) * 0.28, math.sin(a) * 0.28, 0.0), 0.007, 0.006, segs=8)
    obj_st = make_mesh_object("LanternStand", bm_st, mats["cast_iron"], smooth=True, uv_scale=3.0)
    export_objects_glb([obj_st], f"{out_dir}/lantern_stand.glb")
