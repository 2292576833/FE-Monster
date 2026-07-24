# Google OBR WebAssembly bridge

This directory builds the official
[Google Open Binaural Renderer](https://github.com/google/obr) into the
AudioWorklet-compatible WebAssembly module used by FE Monster.

- Official source revision: `478dc7c752d5eccae534635139ff0253eee3a14a`
- Renderer input: stereo loudspeaker layout (`kLayoutStereo`)
- Filter profile: official third-order Ambient HRTF/BRIR assets
- Processing quantum: 128 planar float samples per channel
- Browser backend identity: `google-obr-official`
- Runtime targets: AudioWorklet, Web Worker, and the Node validation probe
- Fixed WebAssembly memory: 64 MiB, allocated before the real-time callback

The source renderer and filter data are not reimplemented. The small C ABI
bridge exposes `ObrImpl::Process` to the AudioWorklet. To avoid shipping unused
filter banks, the build links only the official third-order Ambient left/right
assets selected by the stereo renderer.

Run `scripts/build-google-obr-wasm.ps1` with Emscripten 4.0.23, CMake 3.28+
and Ninja. The generated runtime is written to `web/vendor/google-obr/`.

Google OBR is distributed under the BSD 3-Clause Clear License and the Open
Binaural Renderer Patent License 1.0. Both complete license texts must remain
beside the generated runtime. The build also copies the Abseil, Eigen, and
PFFFT notices required by the statically linked third-party dependencies.
