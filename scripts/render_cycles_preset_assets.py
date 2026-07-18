"""Render the Cycles-authored environment assets used by two realtime presets.

Run with Blender, not the system Python:
  blender --background --factory-startup --python scripts/render_cycles_preset_assets.py

Optional targets after ``--``: ``storm-ocean`` and ``void-prism``.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "web" / "assets" / "cycles"
SOURCE_ROOT = ROOT / "cycles-source"
WIDTH = max(512, int(os.environ.get("FE_CYCLES_WIDTH", "2048")))
HEIGHT = max(256, int(os.environ.get("FE_CYCLES_HEIGHT", str(WIDTH // 2))))
SAMPLES = max(1, int(os.environ.get("FE_CYCLES_SAMPLES", "64")))
SUPPORTED_TARGETS = ("storm-ocean", "void-prism")


def target_names() -> list[str]:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    targets = arguments or list(SUPPORTED_TARGETS)
    unknown = sorted(set(targets) - set(SUPPORTED_TARGETS))
    if unknown:
        raise SystemExit(f"Unsupported Cycles preset target(s): {', '.join(unknown)}")
    return list(dict.fromkeys(targets))


def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 4
    scene.cycles.transparent_max_bounces = 4
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.025
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    return scene


def configure_cycles_device(scene: bpy.types.Scene) -> dict[str, str]:
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        scene.cycles.device = "CPU"
        return {"backend": "CPU", "name": "CPU"}

    preferences = addon.preferences
    for backend in ("HIP", "OPTIX", "CUDA", "ONEAPI", "METAL"):
        try:
            preferences.compute_device_type = backend
            preferences.get_devices()
        except (AttributeError, TypeError, RuntimeError):
            continue
        devices = [device for device in preferences.devices if device.type == backend]
        if not devices:
            continue
        preferred = next(
            (device for device in devices if any(token in device.name.upper() for token in (" RX ", "RTX", "ARC"))),
            devices[-1],
        )
        for device in preferences.devices:
            device.use = device == preferred
        scene.cycles.device = "GPU"
        return {"backend": backend, "name": preferred.name}

    scene.cycles.device = "CPU"
    cpu_name = next(
        (device.name for device in getattr(preferences, "devices", []) if device.type == "CPU"),
        "CPU",
    )
    return {"backend": "CPU", "name": cpu_name}


def add_panorama_camera(scene: bpy.types.Scene) -> None:
    camera_data = bpy.data.cameras.new("CyclesPresetEnvironmentCamera")
    camera_data.type = "PANO"
    camera_data.panorama_type = "EQUIRECTANGULAR"
    camera = bpy.data.objects.new("CyclesPresetEnvironmentCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, 0, 0)
    camera.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = camera


def color_ramp(
    nodes: bpy.types.Nodes,
    name: str,
    stops: list[tuple[float, tuple[float, float, float, float]]],
) -> bpy.types.Node:
    node = nodes.new("ShaderNodeValToRGB")
    node.name = name
    node.label = name
    ramp = node.color_ramp
    while len(ramp.elements) > 2:
        ramp.elements.remove(ramp.elements[-1])
    for index, (position, color) in enumerate(stops):
        element = ramp.elements[index] if index < 2 else ramp.elements.new(position)
        element.position = position
        element.color = color
    return node


def direction_lobe(
    nodes: bpy.types.Nodes,
    links: bpy.types.NodeLinks,
    vector_socket: bpy.types.NodeSocket,
    direction: tuple[float, float, float],
    power: float,
    strength: float,
    name: str,
) -> bpy.types.NodeSocket:
    length = math.sqrt(sum(value * value for value in direction)) or 1
    normalized = tuple(value / length for value in direction)
    dot = nodes.new("ShaderNodeVectorMath")
    dot.name = f"{name} Direction"
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = normalized
    links.new(vector_socket, dot.inputs[0])

    maximum = nodes.new("ShaderNodeMath")
    maximum.name = f"{name} Positive"
    maximum.operation = "MAXIMUM"
    maximum.inputs[1].default_value = 0
    links.new(dot.outputs[1], maximum.inputs[0])

    exponent = nodes.new("ShaderNodeMath")
    exponent.name = f"{name} Softness"
    exponent.operation = "POWER"
    exponent.inputs[1].default_value = power
    links.new(maximum.outputs[0], exponent.inputs[0])

    gain = nodes.new("ShaderNodeMath")
    gain.name = f"{name} Strength"
    gain.operation = "MULTIPLY"
    gain.inputs[1].default_value = strength
    links.new(exponent.outputs[0], gain.inputs[0])
    return gain.outputs[0]


def mix_lobe(
    nodes: bpy.types.Nodes,
    links: bpy.types.NodeLinks,
    base_socket: bpy.types.NodeSocket,
    factor_socket: bpy.types.NodeSocket,
    color: tuple[float, float, float, float],
    name: str,
) -> bpy.types.NodeSocket:
    mix = nodes.new("ShaderNodeMixRGB")
    mix.name = name
    mix.blend_type = "MIX"
    mix.inputs[2].default_value = color
    links.new(factor_socket, mix.inputs[0])
    links.new(base_socket, mix.inputs[1])
    return mix.outputs[0]


def build_storm_world(scene: bpy.types.Scene) -> None:
    world = bpy.data.worlds.new("Storm Ocean | Cycles Environment")
    world.use_nodes = True
    scene.world = world
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "World Direction"
    separate = nodes.new("ShaderNodeSeparateXYZ")
    separate.name = "Horizon Axis"
    links.new(coordinates.outputs["Normal"], separate.inputs[0])

    vertical_map = nodes.new("ShaderNodeMapRange")
    vertical_map.name = "Vertical Gradient"
    vertical_map.clamp = True
    vertical_map.inputs[1].default_value = -1
    vertical_map.inputs[2].default_value = 1
    vertical_map.inputs[3].default_value = 0
    vertical_map.inputs[4].default_value = 1
    links.new(separate.outputs["Z"], vertical_map.inputs[0])

    vertical = color_ramp(
        nodes,
        "Storm Atmospheric Depth",
        [
            (0.0, (0.004, 0.009, 0.014, 1)),
            (0.34, (0.018, 0.034, 0.052, 1)),
            (0.5, (0.16, 0.19, 0.25, 1)),
            (0.61, (0.055, 0.074, 0.11, 1)),
            (1.0, (0.006, 0.011, 0.02, 1)),
        ],
    )
    links.new(vertical_map.outputs[0], vertical.inputs[0])

    scale = nodes.new("ShaderNodeVectorMath")
    scale.name = "Cloud Domain"
    scale.operation = "SCALE"
    scale.inputs[3].default_value = 6.4
    links.new(coordinates.outputs["Normal"], scale.inputs[0])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "Cycles Storm Cloud Field"
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 1.15
    noise.inputs["Detail"].default_value = 9
    noise.inputs["Roughness"].default_value = 0.72
    noise.inputs["Lacunarity"].default_value = 2.1
    noise.inputs["Distortion"].default_value = 0.17
    links.new(scale.outputs[0], noise.inputs["Vector"])
    cloud = color_ramp(
        nodes,
        "Cloud Radiance",
        [
            (0.26, (0.025, 0.038, 0.055, 1)),
            (0.48, (0.06, 0.085, 0.11, 1)),
            (0.66, (0.22, 0.25, 0.3, 1)),
            (0.82, (0.42, 0.44, 0.49, 1)),
        ],
    )
    links.new(noise.outputs["Fac"], cloud.inputs[0])

    cloud_mix = nodes.new("ShaderNodeMixRGB")
    cloud_mix.name = "Layered Storm Sky"
    cloud_mix.blend_type = "MIX"
    cloud_mix.inputs[0].default_value = 0.55
    links.new(vertical.outputs[0], cloud_mix.inputs[1])
    links.new(cloud.outputs[0], cloud_mix.inputs[2])
    color_socket = cloud_mix.outputs[0]

    horizon_absolute = nodes.new("ShaderNodeMath")
    horizon_absolute.operation = "ABSOLUTE"
    links.new(separate.outputs["Z"], horizon_absolute.inputs[0])
    horizon_map = nodes.new("ShaderNodeMapRange")
    horizon_map.name = "Horizon Glow Band"
    horizon_map.clamp = True
    horizon_map.inputs[1].default_value = 0
    horizon_map.inputs[2].default_value = 0.32
    horizon_map.inputs[3].default_value = 0.34
    horizon_map.inputs[4].default_value = 0
    links.new(horizon_absolute.outputs[0], horizon_map.inputs[0])
    color_socket = mix_lobe(
        nodes,
        links,
        color_socket,
        horizon_map.outputs[0],
        (0.34, 0.29, 0.31, 1),
        "Storm Horizon Scattering",
    )

    sunset = direction_lobe(
        nodes,
        links,
        coordinates.outputs["Normal"],
        (0.48, -0.82, 0.12),
        34,
        0.78,
        "Low Sunset",
    )
    color_socket = mix_lobe(
        nodes,
        links,
        color_socket,
        sunset,
        (1.0, 0.43, 0.18, 1),
        "Sunset Reflection Source",
    )

    background = nodes.new("ShaderNodeBackground")
    background.name = "Cycles Storm Radiance"
    background.inputs["Strength"].default_value = 0.82
    links.new(color_socket, background.inputs["Color"])
    output = nodes.new("ShaderNodeOutputWorld")
    links.new(background.outputs[0], output.inputs[0])


def build_void_world(scene: bpy.types.Scene) -> None:
    world = bpy.data.worlds.new("Void Prism | Cycles Reflection Studio")
    world.use_nodes = True
    scene.world = world
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "Studio Direction"
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coordinates.outputs["Normal"], separate.inputs[0])
    vertical_map = nodes.new("ShaderNodeMapRange")
    vertical_map.name = "Neutral Gallery Gradient"
    vertical_map.clamp = True
    vertical_map.inputs[1].default_value = -1
    vertical_map.inputs[2].default_value = 1
    links.new(separate.outputs["Z"], vertical_map.inputs[0])
    neutral = color_ramp(
        nodes,
        "Polished Silver Studio",
        [
            (0.0, (0.24, 0.27, 0.29, 1)),
            (0.22, (0.42, 0.46, 0.48, 1)),
            (0.5, (0.69, 0.72, 0.73, 1)),
            (0.78, (0.46, 0.5, 0.52, 1)),
            (1.0, (0.27, 0.3, 0.32, 1)),
        ],
    )
    links.new(vertical_map.outputs[0], neutral.inputs[0])
    color_socket = neutral.outputs[0]

    lobe_definitions = [
        ((0.82, -0.48, 0.2), 8.5, 0.72, (0.95, 0.97, 0.98, 1), "Left Softbox"),
        ((-0.82, -0.48, 0.2), 8.5, 0.72, (0.94, 0.96, 0.97, 1), "Right Softbox"),
        ((0.05, 0.18, 0.98), 6.5, 0.42, (0.86, 0.9, 0.92, 1), "Top Softbox"),
        ((-0.08, -0.28, -0.96), 7.5, 0.28, (0.78, 0.82, 0.84, 1), "Lower Softbox"),
        ((0.0, 0.98, 0.08), 4.2, 0.48, (0.13, 0.15, 0.16, 1), "Contrast Cove"),
    ]
    for direction, power, strength, color, name in lobe_definitions:
        factor = direction_lobe(
            nodes,
            links,
            coordinates.outputs["Normal"],
            direction,
            power,
            strength,
            name,
        )
        color_socket = mix_lobe(nodes, links, color_socket, factor, color, name)

    background = nodes.new("ShaderNodeBackground")
    background.name = "Cycles Studio Radiance"
    background.inputs["Strength"].default_value = 0.78
    links.new(color_socket, background.inputs["Color"])
    output = nodes.new("ShaderNodeOutputWorld")
    links.new(background.outputs[0], output.inputs[0])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def render_target(target: str) -> None:
    scene = reset_scene()
    device = configure_cycles_device(scene)
    add_panorama_camera(scene)
    uses_cycles_output = target == "storm-ocean"
    output_role = "realtime-reflection-environment" if uses_cycles_output else "authoring-reference-environment"
    if target == "storm-ocean":
        build_storm_world(scene)
    else:
        build_void_world(scene)

    output_directory = ASSET_ROOT / target
    source_directory = SOURCE_ROOT / target
    output_directory.mkdir(parents=True, exist_ok=True)
    source_directory.mkdir(parents=True, exist_ok=True)
    image_path = output_directory / f"{target}-cycles-environment.png"
    blend_path = source_directory / f"{target}-cycles-environment.blend"
    manifest_path = output_directory / "cycles-render.json"
    scene.render.filepath = str(image_path)
    scene["fe_preset"] = target
    scene["fe_renderer"] = "Blender Cycles"
    scene["fe_cycles_device_backend"] = device["backend"]
    scene["fe_cycles_device_name"] = device["name"]
    scene["fe_cycles_samples"] = SAMPLES
    scene["fe_output_role"] = output_role

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)

    manifest = {
        "schema": "fe-monster.cycles-render/v1",
        "preset": target,
        "renderer": {
            "engine": scene.render.engine,
            "blenderVersion": bpy.app.version_string,
            "deviceBackend": device["backend"],
            "deviceName": device["name"],
            "samples": SAMPLES,
            "panorama": "equirectangular",
            "resolution": [WIDTH, HEIGHT],
            "colorSpace": "sRGB",
        },
        "sourceBlend": blend_path.relative_to(ROOT).as_posix(),
        "output": {
            "file": image_path.name,
            "role": output_role,
            "sha256": sha256(image_path),
        },
        "runtime": {
            "renderer": "three-webgl",
            "usesCyclesOutput": uses_cycles_output,
            "usesCyclesAuthoringReference": True,
            "keepsAudioReactiveInteraction": True,
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"CYCLES_RENDERED={target}:{image_path}")


if __name__ == "__main__":
    for target_name in target_names():
        render_target(target_name)
