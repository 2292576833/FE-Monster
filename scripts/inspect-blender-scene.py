"""Print compact geometry, material, image, and bounds diagnostics for a Blender file."""

import bpy
from mathutils import Vector


mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
curve_objects = [obj for obj in bpy.context.scene.objects if obj.type == "CURVE"]
vertices = sum(len(obj.data.vertices) for obj in mesh_objects)
polygons = sum(len(obj.data.polygons) for obj in mesh_objects)
materials = {slot.material.name for obj in mesh_objects for slot in obj.material_slots if slot.material}

bounds_min = Vector((float("inf"),) * 3)
bounds_max = Vector((float("-inf"),) * 3)
for obj in mesh_objects:
    for corner in obj.bound_box:
        world = obj.matrix_world @ Vector(corner)
        bounds_min.x = min(bounds_min.x, world.x)
        bounds_min.y = min(bounds_min.y, world.y)
        bounds_min.z = min(bounds_min.z, world.z)
        bounds_max.x = max(bounds_max.x, world.x)
        bounds_max.y = max(bounds_max.y, world.y)
        bounds_max.z = max(bounds_max.z, world.z)

print("FE_INSPECT objects", len(bpy.context.scene.objects))
print("FE_INSPECT meshes", len(mesh_objects))
print("FE_INSPECT curves", len(curve_objects))
print("FE_INSPECT vertices", vertices)
print("FE_INSPECT polygons", polygons)
print("FE_INSPECT materials", len(materials), sorted(materials))
if mesh_objects:
    print("FE_INSPECT bounds_min", tuple(round(value, 5) for value in bounds_min))
    print("FE_INSPECT bounds_max", tuple(round(value, 5) for value in bounds_max))
    print("FE_INSPECT dimensions", tuple(round(value, 5) for value in (bounds_max - bounds_min)))

for image in bpy.data.images:
    print(
        "FE_INSPECT image",
        image.name,
        "packed=" + str(bool(image.packed_file)),
        "size=" + str(tuple(image.size)),
        "path=" + bpy.path.abspath(image.filepath),
    )

for obj in sorted(mesh_objects, key=lambda candidate: len(candidate.data.polygons), reverse=True)[:20]:
    print(
        "FE_INSPECT mesh",
        obj.name,
        "vertices=" + str(len(obj.data.vertices)),
        "polygons=" + str(len(obj.data.polygons)),
        "materials=" + str([slot.material.name if slot.material else "" for slot in obj.material_slots]),
    )
