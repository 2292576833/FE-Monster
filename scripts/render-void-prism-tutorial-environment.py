"""Build a clean Cycles reflection environment for the Void Prism preset.

Run from the repository root with Blender 5.1 or newer:
  blender --factory-startup --background \
    --python scripts/render-void-prism-tutorial-environment.py

The script writes only its dedicated PNG, JSON metadata, and source ``.blend``.
It does not edit a preset manifest or any realtime client file.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
IMAGE_PATH = (
    ROOT
    / "web"
    / "assets"
    / "cycles"
    / "void-prism"
    / "void-prism-tutorial-environment.png"
)
METADATA_PATH = IMAGE_PATH.with_suffix(".json")
BLEND_PATH = (
    ROOT
    / "cycles-source"
    / "void-prism"
    / "void-prism-tutorial-environment.blend"
)
WIDTH = 2048
HEIGHT = 1024
SAMPLES = 64


def clear_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.name = "Void Prism | Tutorial Reflection Environment"
    scene.unit_settings.system = "METRIC"
    return scene


def configure_hip(scene: bpy.types.Scene) -> list[str]:
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        raise RuntimeError("Cycles add-on is unavailable")

    preferences = addon.preferences
    preferences.compute_device_type = "HIP"
    preferences.refresh_devices()
    hip_devices = [device for device in preferences.devices if device.type == "HIP"]
    if not hip_devices:
        raise RuntimeError("No HIP device is available for Cycles")

    preferred = [device for device in hip_devices if "RX 5700 XT" in device.name]
    active = preferred or hip_devices
    for device in preferences.devices:
        device.use = device in active
    scene.cycles.device = "GPU"
    return [device.name for device in active]


def configure_render(scene: bpy.types.Scene) -> None:
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "16"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.filepath = str(IMAGE_PATH)
    scene.render.dither_intensity = 1.0

    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 6
    scene.cycles.transmission_bounces = 4
    scene.cycles.transparent_max_bounces = 4
    scene.cycles.seed = 43017
    if hasattr(scene.cycles, "sample_clamp_indirect"):
        scene.cycles.sample_clamp_indirect = 4.0

    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.05
    scene.view_settings.gamma = 1.0


def material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return result


def emission_material(
    name: str,
    color: tuple[float, float, float, float],
    strength: float,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    links = result.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = strength
    links.new(emission.outputs[0], output.inputs["Surface"])
    return result


def window_material() -> bpy.types.Material:
    result = bpy.data.materials.new("Tutorial Environment | Broad Sky Window")
    result.use_nodes = True
    nodes = result.node_tree.nodes
    links = result.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.40
    coordinates = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    low = ramp.color_ramp.elements[0]
    high = ramp.color_ramp.elements[1]
    low.position = 0.0
    low.color = (0.68, 0.65, 0.61, 1.0)
    middle = ramp.color_ramp.elements.new(0.48)
    middle.color = (0.86, 0.84, 0.80, 1.0)
    high.position = 1.0
    high.color = (0.78, 0.81, 0.86, 1.0)

    links.new(coordinates.outputs["UV"], separate.inputs[0])
    links.new(separate.outputs["Y"], ramp.inputs[0])
    links.new(ramp.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs[0], output.inputs["Surface"])
    return result


def assign(obj: bpy.types.Object, surface: bpy.types.Material) -> None:
    obj.data.materials.append(surface)


def rounded_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    surface: bpy.types.Material,
    bevel: float,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = rotation
    modifier = obj.modifiers.new("Soft architectural edge", "BEVEL")
    modifier.width = min(bevel, min(dimensions) * 0.45)
    modifier.segments = 5
    assign(obj, surface)
    return obj


def uv_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    surface: bpy.types.Material,
    segments: int = 48,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=max(16, segments // 2),
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    assign(obj, surface)
    return obj


def cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    surface: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=48,
        radius=radius,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    bevel = obj.modifiers.new("Rounded cylinder edge", "BEVEL")
    bevel.width = min(0.08, depth * 0.25)
    bevel.segments = 4
    assign(obj, surface)
    return obj


def area_light(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> bpy.types.Object:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.name = f"{name} Data"
    light.data.shape = "DISK"
    light.data.energy = energy
    light.data.size = size
    light.data.color = color
    direction = Vector(target) - light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return light


def build_world(scene: bpy.types.Scene) -> None:
    world = bpy.data.worlds.new("Tutorial Environment | Neutral Silver World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.070, 0.072, 0.075, 1.0)
    background.inputs["Strength"].default_value = 0.24
    scene.world = world


def add_panorama_camera(scene: bpy.types.Scene) -> None:
    camera_data = bpy.data.cameras.new("Void Prism Tutorial Environment Camera")
    camera_data.type = "PANO"
    camera_data.panorama_type = "EQUIRECTANGULAR"
    camera_data.clip_start = 0.05
    camera_data.clip_end = 200.0
    camera = bpy.data.objects.new("Void Prism Tutorial Environment Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0.0, 0.0, 0.05)
    camera.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    scene.camera = camera


def build_environment(scene: bpy.types.Scene) -> None:
    warm_wall = material("Tutorial | Silver gray plaster", (0.340, 0.335, 0.325, 1), 0.52)
    dark_wall = material("Tutorial | Lifted charcoal interior", (0.070, 0.070, 0.074, 1), 0.43)
    ceiling = material("Tutorial | Soft silver ceiling", (0.540, 0.540, 0.540, 1), 0.58)
    floor = material("Tutorial | Satin gray floor", (0.280, 0.275, 0.265, 1), 0.31)
    fabric = material("Tutorial | Rounded silver fabric", (0.090, 0.090, 0.095, 1), 0.64)
    walnut = material("Tutorial | Neutral gray furniture", (0.240, 0.235, 0.225, 1), 0.28)
    ceramic = material("Tutorial | Pale silver ceramic", (0.550, 0.540, 0.520, 1), 0.24)
    bronze = material("Tutorial | Polished silver sculpture", (0.380, 0.390, 0.410, 1), 0.22, 0.76)
    deep_silver_cove = material("Tutorial | Deep silver cove", (0.080, 0.081, 0.085, 1), 0.38, 0.22)
    deep_silver_rug = material("Tutorial | Deep silver rounded rug", (0.070, 0.070, 0.074, 1), 0.58, 0.05)
    lamp_glow = emission_material("Tutorial | Rounded neutral lamp glow", (1.0, 0.96, 0.92, 1), 1.8)
    sun_glow = emission_material("Tutorial | Broad soft sky anchor", (1.0, 0.95, 0.90, 1), 2.0)
    sky_window = window_material()

    rounded_box("Room Floor", (0, 0, -2.65), (16, 16, 0.35), floor, 0.12)
    rounded_box("Room Ceiling", (0, 0, 4.65), (16, 16, 0.35), ceiling, 0.12)
    rounded_box("Dark Interior Wall", (0, 7.65, 1.0), (16, 0.45, 7.0), dark_wall, 0.16)
    rounded_box("Warm Opposite Wall", (0, -7.65, 1.0), (16, 0.45, 7.0), warm_wall, 0.16)
    rounded_box("Warm Side Wall", (7.65, 0, 1.0), (0.45, 16, 7.0), warm_wall, 0.16)
    rounded_box("Window Wall Return", (-7.65, 5.85, 1.0), (0.45, 3.4, 7.0), warm_wall, 0.16)
    rounded_box("Window Wall Opposite Return", (-7.65, -6.65, 1.0), (0.45, 1.7, 7.0), warm_wall, 0.16)

    # Broad, rounded silver anchors distribute clean contrast through the
    # equirectangular zenith and nadir. The rings are deliberately wide coves,
    # not strip lights or black bars, and the offset ovals add four-way structure.
    for name, location, scale in (
        ("Broad Ceiling Silver Cove", (0.30, 0.0, 4.38), (1.45, 1.00, 0.18)),
        ("Broad Floor Silver Cove", (-0.40, 0.0, -2.39), (1.25, 0.95, 0.16)),
    ):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=2.10,
            minor_radius=0.72,
            major_segments=96,
            minor_segments=24,
            location=location,
        )
        cove = bpy.context.object
        cove.name = name
        cove.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.shade_smooth()
        assign(cove, deep_silver_cove)

    for name, location, scale in (
        ("Ceiling Silver Oval Northeast", (3.90, 3.20, 4.38), (2.80, 1.80, 0.10)),
        ("Ceiling Silver Oval Southwest", (-4.10, -3.00, 4.38), (2.80, 1.80, 0.10)),
        ("Floor Silver Rug Northwest", (-4.20, 3.00, -2.38), (2.70, 1.75, 0.10)),
        ("Floor Silver Rug Southeast", (4.10, -3.20, -2.38), (2.70, 1.75, 0.10)),
    ):
        uv_sphere(name, location, scale, deep_silver_rug)

    bpy.ops.mesh.primitive_plane_add(location=(-7.48, -0.55, 0.65), rotation=(0, math.pi / 2, 0))
    window = bpy.context.object
    window.name = "Broad Window And Sky"
    # Overscan the luminous panel behind the floor, ceiling, and wall returns
    # so the equirectangular reflection contains no dark border seams.
    window.scale = (3.75, 5.9, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(window, sky_window)
    uv_sphere("Broad Sun Shape", (-7.22, -2.8, 2.25), (0.10, 1.08, 1.08), sun_glow)

    rounded_box("Rounded Sofa Base", (-1.2, 5.65, -1.62), (5.4, 1.45, 0.72), fabric, 0.30)
    rounded_box("Rounded Sofa Back", (-1.2, 6.25, -0.64), (5.4, 0.50, 1.62), fabric, 0.24)
    for index, x in enumerate((-2.9, -1.2, 0.5)):
        rounded_box(
            f"Sofa Cushion {index + 1}",
            (x, 5.28, -1.12),
            (1.52, 1.16, 0.32),
            ceramic if index == 1 else fabric,
            0.15,
        )

    rounded_box("Rounded Coffee Table", (0.5, -4.35, -1.56), (4.2, 2.0, 0.34), walnut, 0.16)
    rounded_box("Rounded Ottoman", (-3.8, -3.75, -1.52), (2.05, 1.75, 0.70), fabric, 0.30)
    rounded_box("Sideboard", (6.50, -0.80, -1.35), (1.45, 4.35, 1.25), walnut, 0.22)

    lamp_x, lamp_y = 5.72, -1.40
    cylinder("Lamp Base", (lamp_x, lamp_y, -0.60), 0.55, 0.24, bronze)
    cylinder("Lamp Rounded Pedestal", (lamp_x, lamp_y, -0.22), 0.34, 0.58, bronze)
    uv_sphere("Rounded Lamp Shade", (lamp_x, lamp_y, 0.36), (0.88, 0.88, 0.60), lamp_glow)
    bpy.ops.object.light_add(type="POINT", location=(lamp_x, lamp_y, 0.34))
    lamp_light = bpy.context.object
    lamp_light.name = "Rounded Lamp Practical"
    lamp_light.data.energy = 80
    lamp_light.data.color = (1.0, 0.96, 0.92)
    lamp_light.data.shadow_soft_size = 0.72

    rounded_box("Sculpture Pedestal", (4.30, 5.42, -1.05), (1.65, 1.15, 2.00), dark_wall, 0.20)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.82,
        minor_radius=0.29,
        major_segments=64,
        minor_segments=24,
        location=(4.30, 5.18, 0.65),
        rotation=(math.pi / 2, 0, 0),
    )
    sculpture = bpy.context.object
    sculpture.name = "Rounded Bronze Sculpture"
    bpy.ops.object.shade_smooth()
    assign(sculpture, bronze)
    uv_sphere("Ceramic Vessel", (-5.35, 3.65, -1.15), (0.65, 0.65, 1.12), ceramic)
    uv_sphere("Broad Wall Relief", (2.25, 7.34, 1.55), (1.55, 0.16, 1.05), ceramic)

    area_light(
        "Broad Window Key",
        (-5.45, -0.65, 2.15),
        (0.0, 1.0, -0.25),
        850,
        4.8,
        (1.0, 0.97, 0.94),
    )
    area_light(
        "Large Neutral Fill",
        (4.65, -4.25, 1.75),
        (0.0, 1.5, -0.35),
        400,
        4.2,
        (0.94, 0.97, 1.0),
    )
    area_light(
        "Large Ceiling Bounce",
        (0.0, 2.0, 4.10),
        (0.0, 2.0, -1.0),
        460,
        4.5,
        (1.0, 0.985, 0.96),
    )

    build_world(scene)
    add_panorama_camera(scene)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_metadata(
    scene: bpy.types.Scene,
    devices: list[str],
    render_seconds: float,
) -> dict[str, object]:
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    lights = [obj for obj in scene.objects if obj.type == "LIGHT"]
    metadata = {
        "schema": "fe-monster.cycles-tutorial-environment/v1",
        "preset": "void-prism",
        "role": "tutorial-style-reflection-environment",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "renderer": {
            "engine": scene.render.engine,
            "blenderVersion": bpy.app.version_string,
            "blenderBuildHash": bpy.app.build_hash.decode("ascii"),
            "deviceBackend": "HIP",
            "deviceNames": devices,
            "samples": scene.cycles.samples,
            "denoiser": scene.cycles.denoiser,
            "adaptiveThreshold": scene.cycles.adaptive_threshold,
        },
        "image": {
            "projection": "equirectangular",
            "resolution": [WIDTH, HEIGHT],
            "format": "PNG",
            "colorDepth": 16,
            "file": IMAGE_PATH.relative_to(ROOT).as_posix(),
            "bytes": IMAGE_PATH.stat().st_size,
            "sha256": sha256(IMAGE_PATH),
        },
        "colorManagement": {
            "viewTransform": scene.view_settings.view_transform,
            "look": scene.view_settings.look,
            "exposure": scene.view_settings.exposure,
            "gamma": scene.view_settings.gamma,
        },
        "source": {
            "blend": BLEND_PATH.relative_to(ROOT).as_posix(),
            "script": Path(__file__).resolve().relative_to(ROOT).as_posix(),
        },
        "design": {
            "palette": "neutral-silver-gray-with-subtle-warmth",
            "reflectionAnchors": [
                "broad bright window and sky",
                "lifted charcoal interior wall",
                "rounded furniture",
                "rounded practical lamp",
                "broad sculpture silhouettes",
            ],
            "excluded": [
                "thin strip lights",
                "black bars",
                "text",
                "procedural dirt",
                "visible grain",
                "large near-black regions",
            ],
        },
        "statistics": {
            "renderSeconds": round(render_seconds, 3),
            "objects": len(scene.objects),
            "meshObjects": len(meshes),
            "lights": len(lights),
            "basePolygons": sum(len(obj.data.polygons) for obj in meshes),
        },
    }
    METADATA_PATH.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return metadata


def main() -> None:
    IMAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    scene = clear_scene()
    configure_render(scene)
    devices = configure_hip(scene)
    build_environment(scene)
    scene["fe_renderer"] = "Blender Cycles"
    scene["fe_cycles_backend"] = "HIP"
    scene["fe_cycles_devices"] = ", ".join(devices)
    scene["fe_cycles_samples"] = SAMPLES
    scene["fe_projection"] = "equirectangular"
    scene["fe_output_role"] = "tutorial-style-reflection-environment"

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    render_seconds = time.perf_counter() - started
    metadata = write_metadata(scene, devices, render_seconds)

    print(f"FE_VOID_PRISM_TUTORIAL_ENV_IMAGE={IMAGE_PATH}")
    print(f"FE_VOID_PRISM_TUTORIAL_ENV_BLEND={BLEND_PATH}")
    print(f"FE_VOID_PRISM_TUTORIAL_ENV_METADATA={METADATA_PATH}")
    print(f"FE_VOID_PRISM_TUTORIAL_ENV_DEVICE=HIP:{' | '.join(devices)}")
    print(f"FE_VOID_PRISM_TUTORIAL_ENV_SECONDS={render_seconds:.3f}")
    print(f"FE_VOID_PRISM_TUTORIAL_ENV_BYTES={metadata['image']['bytes']}")


if __name__ == "__main__":
    main()
