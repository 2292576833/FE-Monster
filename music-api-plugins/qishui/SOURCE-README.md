# Rebuilding the corresponding source

The source archive contains three sibling directories:

- `fe-monster-qishui-plugin`: FE Monster local HTTP adapter;
- `music-lib`: exact upstream source at commit `7a864570e1ca8ccdb9d44bb57def626b53c33621`;
- `go-qrcode`: QR renderer source at `v0.0.0-20200617195104-da1b6568686e`.

The archived adapter `go.mod` uses local `replace` directives. From `fe-monster-qishui-plugin`, run:

```powershell
$env:CGO_ENABLED = "0"
$env:GOOS = "windows"
$env:GOARCH = "amd64"
go build -trimpath -o qishui-api-plugin.exe .
```

No proprietary SDK or captured user credential is part of the source archive.
