from __future__ import annotations

import argparse
import binascii
import math
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image


BASE_SIZE = 2048
OUTPUT_SIZE = 4096
SEED = 20260713


def png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    checksum = binascii.crc32(chunk_type)
    checksum = binascii.crc32(payload, checksum) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + chunk_type + payload + struct.pack(">I", checksum)


class PngStreamWriter:
    """Write 8-bit PNG rows without retaining the full encoded image in memory."""

    def __init__(self, path: Path, width: int, height: int, color_type: int, level: int) -> None:
        self.path = path
        self.temporary_path = path.with_suffix(f"{path.suffix}.tmp")
        self.width = width
        self.channels = 3 if color_type == 2 else 1
        self.row_count = 0
        self.compressed = bytearray()
        self.compressor = zlib.compressobj(level)
        self.stream = self.temporary_path.open("wb")
        self.stream.write(b"\x89PNG\r\n\x1a\n")
        self.stream.write(png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)))

    def _flush_idat(self) -> None:
        if self.compressed:
            self.stream.write(png_chunk(b"IDAT", bytes(self.compressed)))
            self.compressed.clear()

    def write_rows(self, rows: np.ndarray) -> None:
        expected_shape = (rows.shape[0], self.width) if self.channels == 1 else (rows.shape[0], self.width, 3)
        if rows.dtype != np.uint8 or rows.shape != expected_shape:
            raise ValueError(f"Expected uint8 PNG rows with shape {expected_shape}, got {rows.dtype} {rows.shape}")
        for row in rows:
            self.compressed.extend(self.compressor.compress(b"\x00" + row.tobytes()))
            if len(self.compressed) >= 1024 * 1024:
                self._flush_idat()
        self.row_count += rows.shape[0]

    def close(self, expected_height: int) -> None:
        if self.stream.closed:
            return
        if self.row_count != expected_height:
            raise ValueError(f"Expected {expected_height} rows, wrote {self.row_count}")
        self.compressed.extend(self.compressor.flush())
        self._flush_idat()
        self.stream.write(png_chunk(b"IEND", b""))
        self.stream.close()
        self.temporary_path.replace(self.path)

    def abort(self) -> None:
        if not self.stream.closed:
            self.stream.close()
        self.temporary_path.unlink(missing_ok=True)


def spectral_slopes(size: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    white_noise = rng.standard_normal((size, size), dtype=np.float32)
    spectrum = np.fft.rfft2(white_noise)
    frequency_x = np.fft.rfftfreq(size) * size
    frequency_y = np.fft.fftfreq(size) * size
    grid_x, grid_y = np.meshgrid(frequency_x, frequency_y)
    magnitude = np.hypot(grid_x, grid_y)
    safe_magnitude = np.maximum(magnitude, 1.0)

    wind_angle = math.radians(32.0)
    wind_x, wind_y = math.cos(wind_angle), math.sin(wind_angle)
    primary_alignment = np.abs((grid_x * wind_x + grid_y * wind_y) / safe_magnitude)
    cross_angle = wind_angle - math.radians(68.0)
    cross_x, cross_y = math.cos(cross_angle), math.sin(cross_angle)
    cross_alignment = np.abs((grid_x * cross_x + grid_y * cross_y) / safe_magnitude)
    # A real wind sea is never one perfectly aligned comb. The weaker cross-sea
    # lobe breaks the synthetic grid while retaining a readable prevailing wind.
    directional_spread = (
        0.07
        + 0.88 * np.power(primary_alignment, 6.0)
        + 0.46 * np.power(cross_alignment, 6.5)
    )
    gravity_band = 1.0 - np.exp(-np.square(magnitude / 4.0))
    capillary_rolloff = np.exp(-np.power(magnitude / 760.0, 4.0))
    spectral_decay = np.power(safe_magnitude, -2.15)
    filter_amplitude = directional_spread * gravity_band * capillary_rolloff * spectral_decay
    filter_amplitude[0, 0] = 0.0
    filtered = spectrum * filter_amplitude

    slope_x = np.fft.irfft2(filtered * (1j * grid_x), s=(size, size)).astype(np.float32)
    slope_y = np.fft.irfft2(filtered * (1j * grid_y), s=(size, size)).astype(np.float32)
    combined_std = float(np.sqrt((np.var(slope_x) + np.var(slope_y)) * 0.5))
    target_std = 0.096
    scale = target_std / max(combined_std, 1e-7)
    return slope_x * scale, slope_y * scale


def resize_float(field: np.ndarray, size: int) -> np.ndarray:
    source_size = field.shape[0]
    scale = size / float(source_size)
    source_padding = max(4, int(math.ceil(4.0 / scale)))
    target_padding = max(1, int(round(source_padding * scale)))
    padded = np.pad(field, source_padding, mode="wrap")
    image = Image.fromarray(np.asarray(padded, dtype=np.float32), mode="F")
    padded_size = size + target_padding * 2
    resized = np.asarray(
        image.resize((padded_size, padded_size), Image.Resampling.LANCZOS),
        dtype=np.float32,
    )
    return resized[
        target_padding:target_padding + size,
        target_padding:target_padding + size,
    ].copy()


def add_capillary_band(
    slope_x: np.ndarray,
    slope_y: np.ndarray,
    rng: np.random.Generator,
) -> None:
    size = slope_x.shape[0]
    x = np.arange(size, dtype=np.float32) / float(size)
    wind_angle = math.radians(32.0)
    components: list[tuple[int, int, float, float]] = []
    component_count = 32 if size >= 8192 else 24
    maximum_frequency = 3360.0 if size >= 8192 else 1680.0
    for index, frequency in enumerate(np.geomspace(320.0, maximum_frequency, component_count)):
        if index % 4 == 3:
            lobe_angle = wind_angle - math.radians(68.0)
            spread_degrees = 13.0
        elif index % 7 == 5:
            lobe_angle = wind_angle + math.radians(20.0)
            spread_degrees = 11.0
        else:
            lobe_angle = wind_angle
            spread_degrees = 10.0 + index * 0.24
        angle = lobe_angle + math.radians(float(rng.normal(0.0, spread_degrees)))
        wave_x = max(1, int(round(frequency * math.cos(angle))))
        wave_y = int(round(frequency * math.sin(angle)))
        direction_length = math.hypot(wave_x, wave_y)
        amplitude = (
            0.0096
            * math.pow(frequency / 320.0, -0.48)
            * float(rng.uniform(0.78, 1.18))
        )
        components.append((wave_x, wave_y, float(rng.uniform(0.0, math.tau)), amplitude / direction_length))

    chunk_size = 128
    for y_start in range(0, size, chunk_size):
        y_stop = min(size, y_start + chunk_size)
        y = np.arange(y_start, y_stop, dtype=np.float32) / float(size)
        detail_x = np.zeros((y_stop - y_start, size), dtype=np.float32)
        detail_y = np.zeros_like(detail_x)
        for wave_x, wave_y, phase, normalized_amplitude in components:
            wave_phase = math.tau * (wave_y * y[:, None] + wave_x * x[None, :]) + phase
            cosine = np.cos(wave_phase).astype(np.float32)
            detail_x += cosine * (normalized_amplitude * wave_x)
            detail_y += cosine * (normalized_amplitude * wave_y)
        slope_x[y_start:y_stop] += detail_x
        slope_y[y_start:y_stop] += detail_y


def periodic_resize_rows(source: np.ndarray, output_size: int, y_start: int, y_stop: int) -> np.ndarray:
    source_size = source.shape[0]
    source_x = np.arange(output_size, dtype=np.float32) * (source_size / float(output_size))
    x0 = np.floor(source_x).astype(np.int32) % source_size
    x1 = (x0 + 1) % source_size
    x_blend = source_x - np.floor(source_x)
    source_y = np.arange(y_start, y_stop, dtype=np.float32) * (source_size / float(output_size))
    y0 = np.floor(source_y).astype(np.int32) % source_size
    y1 = (y0 + 1) % source_size
    y_blend = source_y - np.floor(source_y)
    upper = source[y0][:, x0] * (1.0 - x_blend) + source[y0][:, x1] * x_blend
    lower = source[y1][:, x0] * (1.0 - x_blend) + source[y1][:, x1] * x_blend
    return (upper * (1.0 - y_blend[:, None]) + lower * y_blend[:, None]).astype(np.float32)


def encode_textures_streaming(
    slope_x: np.ndarray,
    slope_y: np.ndarray,
    normal_path: Path,
    roughness_path: Path,
) -> None:
    size = slope_x.shape[0]
    sample_stride = max(1, size // 1024)
    sampled_magnitude = np.hypot(
        slope_x[::sample_stride, ::sample_stride],
        slope_y[::sample_stride, ::sample_stride],
    )
    scale = max(float(np.percentile(sampled_magnitude, 98.5)), 1e-6)

    # A compact broad-wind field is upsampled per output block. This preserves
    # the original roughness breakup while avoiding another full 8K float map.
    broad_x = resize_float(slope_x, 512)
    broad_y = resize_float(slope_y, 512)
    broad_source = np.clip(np.hypot(broad_x, broad_y) / scale, 0.0, 1.0)
    broad_low, broad_high = np.percentile(broad_source, [1.0, 99.0])
    broad_source = np.clip(
        (broad_source - broad_low) / max(float(broad_high - broad_low), 1e-6),
        0.0,
        1.0,
    ).astype(np.float32)

    normal_writer = PngStreamWriter(normal_path, size, size, color_type=2, level=4)
    roughness_writer = PngStreamWriter(roughness_path, size, size, color_type=0, level=6)
    try:
        chunk_size = 128
        for y_start in range(0, size, chunk_size):
            y_stop = min(size, y_start + chunk_size)
            local_x = slope_x[y_start:y_stop]
            local_y = slope_y[y_start:y_stop]
            inverse_length = 1.0 / np.sqrt(1.0 + local_x * local_x + local_y * local_y)

            normal = np.empty((y_stop - y_start, size, 3), dtype=np.uint8)
            normal[..., 0] = np.clip(np.round((-local_x * inverse_length * 0.5 + 0.5) * 255.0), 0.0, 255.0)
            normal[..., 1] = np.clip(np.round((-local_y * inverse_length * 0.5 + 0.5) * 255.0), 0.0, 255.0)
            normal[..., 2] = np.clip(np.round((inverse_length * 0.5 + 0.5) * 255.0), 0.0, 255.0)

            normalized = np.clip(np.hypot(local_x, local_y) / scale, 0.0, 1.0)
            broad = periodic_resize_rows(broad_source, size, y_start, y_stop)
            roughness = 0.56 + np.power(normalized, 0.72) * 0.24 + np.power(broad, 1.18) * 0.12
            roughness = np.clip(np.round(np.clip(roughness, 0.52, 0.94) * 255.0), 0.0, 255.0).astype(np.uint8)

            normal_writer.write_rows(normal)
            roughness_writer.write_rows(roughness)
        normal_writer.close(size)
        roughness_writer.close(size)
    except BaseException:
        normal_writer.abort()
        roughness_writer.abort()
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate seamless spectral storm-water PBR maps.")
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, choices=(4096, 8192), default=OUTPUT_SIZE)
    parser.add_argument("--base-size", type=int, choices=(1024, 2048, 4096), default=BASE_SIZE)
    args = parser.parse_args()

    rng = np.random.default_rng(SEED)
    slope_x, slope_y = spectral_slopes(args.base_size, rng)
    slope_x = resize_float(slope_x, args.size)
    slope_y = resize_float(slope_y, args.size)
    add_capillary_band(slope_x, slope_y, rng)

    args.output.mkdir(parents=True, exist_ok=True)
    resolution_label = "8k" if args.size == 8192 else "4k"
    normal_path = args.output / f"water-normal-spectral-{resolution_label}.png"
    roughness_path = args.output / f"water-roughness-spectral-{resolution_label}.png"
    encode_textures_streaming(slope_x, slope_y, normal_path, roughness_path)
    with Image.open(normal_path) as normal_image, Image.open(roughness_path) as roughness_image:
        expected_size = (args.size, args.size)
        if normal_image.size != expected_size or normal_image.mode != "RGB":
            raise RuntimeError(f"Invalid normal map: {normal_image.size} {normal_image.mode}")
        if roughness_image.size != expected_size or roughness_image.mode != "L":
            raise RuntimeError(f"Invalid roughness map: {roughness_image.size} {roughness_image.mode}")
    print(f"GENERATED {normal_path} {normal_path.stat().st_size} bytes")
    print(f"GENERATED {roughness_path} {roughness_path.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
