"""
Blender BMesh & Export Utilities (Blender 4.x / 5.x compatible).
"""
import os
import math
import bpy
import bmesh
from mathutils import Vector, Matrix


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def set_smooth(obj):
    if obj.type != 'MESH':
        return
    mesh = obj.data
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()


def assign_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def box_project_uv(obj, scale=1.0):
    """Fast deterministic tri-planar box UV projection directly via bmesh (no UI context needed)."""
    if obj.type != 'MESH':
        return
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co * scale
            if az >= ax and az >= ay:
                u, v = co.x, co.y
            elif ax >= ay and ax >= az:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def cylindrical_uv(obj, scale_u=1.0, scale_v=1.0):
    if obj.type != 'MESH':
        return
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            angle = math.atan2(co.y, co.x) / (2.0 * math.pi) + 0.5
            loop[uv_layer].uv = (angle * scale_u, co.z * scale_v)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def make_mesh_object(name, bm, mat=None, smooth=True, uv_scale=1.0, uv_mode="box"):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat is not None:
        assign_material(obj, mat)
    if smooth:
        set_smooth(obj)
    if uv_mode == "box":
        box_project_uv(obj, scale=uv_scale)
    elif uv_mode == "cyl":
        cylindrical_uv(obj, scale_u=uv_scale, scale_v=uv_scale)
    return obj


def add_cylinder_segment(bm, p0, p1, r0, r1=None, segs=12, cap=True):
    """Add a tapered cylinder connecting p0 -> p1 into an existing bmesh."""
    if r1 is None:
        r1 = r0
    v0 = Vector(p0)
    v1 = Vector(p1)
    diff = v1 - v0
    length = diff.length
    if length < 1e-6:
        return
    z_axis = diff.normalized()
    up = Vector((0, 0, 1)) if abs(z_axis.z) < 0.95 else Vector((1, 0, 0))
    x_axis = up.cross(z_axis).normalized()
    y_axis = z_axis.cross(x_axis).normalized()

    ring0 = []
    ring1 = []
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        ca, sa = math.cos(a), math.sin(a)
        radial = x_axis * ca + y_axis * sa
        ring0.append(bm.verts.new(v0 + radial * r0))
        ring1.append(bm.verts.new(v1 + radial * r1))

    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((ring0[i], ring0[ni], ring1[ni], ring1[i]))
    if cap:
        bm.faces.new(list(reversed(ring0)))
        bm.faces.new(ring1)


def export_objects_glb(objs, out_path):
    """Export the specified list of Blender objects cleanly to a single .glb file."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_yup=True,
    )
    size_kb = os.path.getsize(out_path) / 1024.0
    print(f"  [GLB] Exported {os.path.basename(out_path)} ({size_kb:.1f} KB)")
