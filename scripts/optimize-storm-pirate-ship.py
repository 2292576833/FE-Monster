"""Prepare the supplied pirate ship as a compact, textured storm-ocean GLB.

Run with Blender after opening the source blend:
  blender --background modelNew.blend --python optimize-storm-pirate-ship.py -- OUTPUT_DIR
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


TEXTURE_SIZE = 1024


def output_directory() -> Path:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not args:
        raise RuntimeError("An output directory is required after --")
    folder = Path(args[0]).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "textures").mkdir(parents=True, exist_ok=True)
    return folder


def spectral_noise(u: np.ndarray, v: np.ndarray, seed: int, layers: int = 12) -> np.ndarray:
    rng = np.random.default_rng(seed)
    result = np.zeros_like(u, dtype=np.float32)
    weight_sum = 0.0
    for layer in range(layers):
        frequency = 1.35 * (1.58**layer)
        angle = rng.uniform(0.0, math.tau)
        phase = rng.uniform(0.0, math.tau)
        weight = 0.57**layer
        result += np.sin(
            math.tau * frequency * (u * math.cos(angle) + v * math.sin(angle)) + phase
        ).astype(np.float32) * weight
        weight_sum += weight
    return np.clip(result / max(weight_sum, 1e-6) * 0.5 + 0.5, 0.0, 1.0)


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    amount = np.clip((value - edge0) / max(edge1 - edge0, 1e-6), 0.0, 1.0)
    return amount * amount * (3.0 - 2.0 * amount)


def normal_from_height(height: np.ndarray, strength: float) -> np.ndarray:
    gradient_v, gradient_u = np.gradient(height.astype(np.float32))
    nx = -gradient_u * strength
    ny = -gradient_v * strength
    nz = np.ones_like(height, dtype=np.float32)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack((nx / length, ny / length, nz / length), axis=-1) * 0.5 + 0.5


def save_texture(name: str, rgb: np.ndarray, output: Path, colorspace: str) -> bpy.types.Image:
    rgb = np.clip(rgb, 0.0, 1.0).astype(np.float32)
    alpha = np.ones((*rgb.shape[:2], 1), dtype=np.float32)
    rgba = np.concatenate((rgb, alpha), axis=-1)
    image = bpy.data.images.get(name) or bpy.data.images.new(name, width=rgb.shape[1], height=rgb.shape[0])
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(rgba.ravel())
    image.file_format = "PNG"
    image.filepath_raw = str((output / "textures" / f"{name}.png").resolve())
    image.save()
    return image


def grayscale_rgb(value: np.ndarray) -> np.ndarray:
    return np.repeat(value[..., None], 3, axis=-1)


def generate_body_textures(output: Path, u: np.ndarray, v: np.ndarray) -> dict[str, bpy.types.Image]:
    broad = spectral_noise(u, v, 1307, 10)
    fine = spectral_noise(u * 2.4, v * 7.2, 6211, 9)
    grain = np.sin(math.tau * (v * 36.0 + broad * 0.72 + np.sin(u * math.tau * 3.0) * 0.11)) * 0.5 + 0.5
    plank_v = np.minimum(np.mod(v * 10.0, 1.0), 1.0 - np.mod(v * 10.0, 1.0))
    plank_u = np.minimum(np.mod(u * 5.0 + np.floor(v * 10.0) * 0.37, 1.0), 1.0 - np.mod(u * 5.0 + np.floor(v * 10.0) * 0.37, 1.0))
    seams = np.maximum(1.0 - smoothstep(0.005, 0.032, plank_v), 0.55 * (1.0 - smoothstep(0.004, 0.022, plank_u)))
    damp = smoothstep(0.54, 0.86, spectral_noise(u * 0.42, v * 0.42, 9001, 8))
    base = np.zeros((*u.shape, 3), dtype=np.float32)
    base[..., 0] = 0.105 + grain * 0.082 + fine * 0.028
    base[..., 1] = 0.050 + grain * 0.044 + fine * 0.018
    base[..., 2] = 0.023 + grain * 0.020
    base *= (1.0 - seams[..., None] * 0.67) * (1.0 - damp[..., None] * 0.24)
    roughness = np.clip(0.50 + (1.0 - grain) * 0.18 + seams * 0.19 + damp * 0.12, 0.38, 0.88)
    height = grain * 0.17 + fine * 0.035 - seams * 0.28
    return {
        "base": save_texture("pirate_ship_body_base", base, output, "sRGB"),
        "roughness": save_texture("pirate_ship_body_roughness", grayscale_rgb(roughness), output, "Non-Color"),
        "normal": save_texture("pirate_ship_body_normal", normal_from_height(height, 12.0), output, "Non-Color"),
    }


def generate_parts_textures(output: Path, u: np.ndarray, v: np.ndarray) -> dict[str, bpy.types.Image]:
    broad = spectral_noise(u * 0.75, v * 0.75, 4439, 11)
    pitting = spectral_noise(u * 4.1, v * 4.1, 7717, 10)
    rust = smoothstep(0.57, 0.76, broad * 0.72 + pitting * 0.28)
    edge_stain = smoothstep(0.66, 0.88, spectral_noise(u * 1.7, v * 1.7, 1193, 8))
    rust = np.clip(rust * 0.88 + edge_stain * 0.24, 0.0, 1.0)
    iron = np.array([0.075, 0.082, 0.085], dtype=np.float32)
    oxide = np.array([0.34, 0.105, 0.027], dtype=np.float32)
    base = iron[None, None, :] * (1.0 - rust[..., None]) + oxide[None, None, :] * rust[..., None]
    base *= 0.78 + pitting[..., None] * 0.34
    roughness = np.clip(0.34 + rust * 0.49 + (1.0 - pitting) * 0.12, 0.30, 0.94)
    metallic = np.clip(0.76 * (1.0 - rust) + 0.05 * rust, 0.03, 0.82)
    height = pitting * 0.08 - rust * 0.20 + broad * 0.04
    return {
        "base": save_texture("pirate_ship_parts_base", base, output, "sRGB"),
        "roughness": save_texture("pirate_ship_parts_roughness", grayscale_rgb(roughness), output, "Non-Color"),
        "metallic": save_texture("pirate_ship_parts_metallic", grayscale_rgb(metallic), output, "Non-Color"),
        "normal": save_texture("pirate_ship_parts_normal", normal_from_height(height, 18.0), output, "Non-Color"),
    }


def generate_sail_textures(output: Path, u: np.ndarray, v: np.ndarray) -> dict[str, bpy.types.Image]:
    weather = spectral_noise(u * 0.62, v * 0.62, 2017, 11)
    stains = smoothstep(0.56, 0.82, spectral_noise(u * 1.45, v * 1.45, 8089, 9))
    weave = (np.sin(math.tau * u * 188.0) + np.sin(math.tau * v * 164.0)) * 0.5
    seams = 1.0 - smoothstep(0.002, 0.014, np.minimum(np.mod(v * 8.0, 1.0), 1.0 - np.mod(v * 8.0, 1.0)))
    canvas = np.array([0.29, 0.265, 0.215], dtype=np.float32)
    base = canvas[None, None, :] * (0.79 + weather[..., None] * 0.34)
    base *= 1.0 - stains[..., None] * 0.31
    base *= 1.0 - seams[..., None] * 0.34
    roughness = np.clip(0.77 + stains * 0.11 + seams * 0.07 - weather * 0.04, 0.69, 0.96)
    height = weave * 0.016 - seams * 0.12 + weather * 0.025
    return {
        "base": save_texture("pirate_ship_sail_base", base, output, "sRGB"),
        "roughness": save_texture("pirate_ship_sail_roughness", grayscale_rgb(roughness), output, "Non-Color"),
        "normal": save_texture("pirate_ship_sail_normal", normal_from_height(height, 22.0), output, "Non-Color"),
    }


def make_material(name: str, textures: dict[str, bpy.types.Image], metallic: float, normal_strength: float) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.surface_render_method = "DITHERED" if "Sail" in name else "DITHERED"
    material.use_transparency_overlap = False
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (760, 20)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (420, 20)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = 0.62
    principled.inputs["IOR"].default_value = 1.46
    material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    base_node = nodes.new("ShaderNodeTexImage")
    base_node.image = textures["base"]
    base_node.location = (-460, 180)
    material.node_tree.links.new(base_node.outputs["Color"], principled.inputs["Base Color"])

    roughness_node = nodes.new("ShaderNodeTexImage")
    roughness_node.image = textures["roughness"]
    roughness_node.location = (-460, -10)
    material.node_tree.links.new(roughness_node.outputs["Color"], principled.inputs["Roughness"])

    if textures.get("metallic"):
        metallic_node = nodes.new("ShaderNodeTexImage")
        metallic_node.image = textures["metallic"]
        metallic_node.location = (-460, -190)
        material.node_tree.links.new(metallic_node.outputs["Color"], principled.inputs["Metallic"])

    normal_node = nodes.new("ShaderNodeTexImage")
    normal_node.image = textures["normal"]
    normal_node.location = (-460, -370)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = normal_strength
    normal_map.location = (120, -260)
    material.node_tree.links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    material.node_tree.links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
    return material


def source_material_kind(obj: bpy.types.Object) -> str:
    names = " ".join(slot.material.name for slot in obj.material_slots if slot.material).lower()
    if "sail" in names:
        return "sail"
    if "parts" in names:
        return "parts"
    return "body"


def join_by_material(mesh_objects: list[bpy.types.Object], materials: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    groups = {kind: [] for kind in ("body", "parts", "sail")}
    for obj in mesh_objects:
        groups[source_material_kind(obj)].append(obj)
    joined = []
    for kind in ("body", "parts", "sail"):
        group = groups[kind]
        if not group:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in group:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = f"StormPirateShip_{kind.title()}"
        obj.data.name = f"StormPirateShip_{kind.title()}Mesh"
        obj.data.materials.clear()
        obj.data.materials.append(materials[kind])
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        obj.data.validate(clean_customdata=False)
        obj.data.update()
        joined.append(obj)
    return joined


def normalize_origin(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum = Vector((float("inf"),) * 3)
    maximum = Vector((float("-inf"),) * 3)
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], world[axis])
                maximum[axis] = max(maximum[axis], world[axis])
    horizontal_center = Vector(((minimum.x + maximum.x) * 0.5, (minimum.y + maximum.y) * 0.5, minimum.z))
    for obj in objects:
        obj.location -= horizontal_center
    bpy.context.view_layer.update()
    return minimum, maximum


def main() -> None:
    output = output_directory()
    scene = bpy.context.scene
    mesh_objects = [obj for obj in scene.objects if obj.type == "MESH"]
    # The source parents every mesh under a rotated FBX root. Preserve each
    # world matrix before removing that hierarchy, otherwise the ship lies on
    # its side after export.
    for obj in mesh_objects:
        world_matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world_matrix
    for obj in list(scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    if not mesh_objects:
        raise RuntimeError("The source file contains no mesh objects")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    axis = np.linspace(0.0, 1.0, TEXTURE_SIZE, endpoint=False, dtype=np.float32)
    u, v = np.meshgrid(axis, axis)
    body_textures = generate_body_textures(output, u, v)
    parts_textures = generate_parts_textures(output, u, v)
    sail_textures = generate_sail_textures(output, u, v)
    materials = {
        "body": make_material("Storm Ship | Weathered Wood", body_textures, 0.02, 0.62),
        "parts": make_material("Storm Ship | Rusted Iron", parts_textures, 0.64, 0.78),
        "sail": make_material("Storm Ship | Aged Canvas Sail", sail_textures, 0.0, 0.46),
    }

    joined = join_by_material(mesh_objects, materials)
    source_min, source_max = normalize_origin(joined)
    for obj in joined:
        obj.select_set(True)
        obj.visible_shadow = True

    retained_images = {
        image
        for texture_set in (body_textures, parts_textures, sail_textures)
        for image in texture_set.values()
    }
    for material in list(bpy.data.materials):
        if material not in materials.values() and material.users == 0:
            bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if image not in retained_images and image.name != "Render Result":
            bpy.data.images.remove(image)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.world.color = (0.008, 0.013, 0.018)
    blend_path = output / "pirate-ship-storm-optimized.blend"
    glb_path = output / "pirate-ship-storm.glb"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in joined:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = joined[0]
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    dimensions = source_max - source_min
    print("FE_SHIP source_meshes", len(mesh_objects))
    print("FE_SHIP optimized_meshes", len(joined))
    print("FE_SHIP dimensions", tuple(round(value, 4) for value in dimensions))
    print("FE_SHIP blend", blend_path)
    print("FE_SHIP glb", glb_path)
    print("FE_SHIP glb_bytes", glb_path.stat().st_size)


if __name__ == "__main__":
    main()
