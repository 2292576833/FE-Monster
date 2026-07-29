# FE Monster Rust surround upmixer

This `cdylib` is the surround-expansion stage used only while FE Monster
spatial audio is enabled:

`stereo PCM -> OxiMedia SurroundUpmixer -> X3DAudio scene metadata -> Google OBR -> XAudio2`

The exported interface is a small versioned C ABI so the Windows C++ audio
pipeline can load the DLL without putting JNI calls on the audio callback.
Java continues to control the native pipeline through the existing JNI bridge.

The default algorithm is OxiMedia `MatrixDecode` (Dolby Pro Logic II-style
`L+R`/`L-R` extraction). It supports stereo to 5.1 and the library's 5.1 to
7.1 expansion. If the DLL is missing, rejects a block, or cannot initialize,
the C++ pipeline uses its allocation-free built-in matrix for that block.
Dry/OBR-off playback never loads or invokes this library.

`soft_matrix` was evaluated but is intentionally not in the live callback:
its published interface is an offline WAV-to-WAV command and its own
documentation describes roughly real-time processing on an M2 Mac. It remains
a possible offline render/export option, not a playback dependency.

License: this wrapper is Apache-2.0. `oximedia-audiopost` 0.2.0 is Apache-2.0.
