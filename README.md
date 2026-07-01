# FE Monster Java

This is a Java 17 clean-room rewrite target for the FE Player / FE Monster backend shell and local client.

The original `E:\FE` project is not modified. This folder contains a new Java implementation that keeps the same local HTTP API shape where possible:

- local server on `http://127.0.0.1:3000` by default, with automatic fallback to the next free local port
- local client window launched from `run.cmd` by default
- player state, queue, seek, volume and transport endpoints
- Netease API proxy/adapters for search, login status, playlists and song URLs
- visual bridge state simulation for the local client
- static client resource hosting from `web/`
- responsive local player UI with search, playlists, queue, transport controls, progress, volume and QR login dialog

## Build

```bat
build.cmd
```

## Run

```bat
run.cmd
```

Optional environment variables:

- `FE_MONSTER_PORT`: server port, default `3000`
- `FE_MONSTER_WEB_ROOT`: static client root, default `web`
- `FE_NETEASE_BASE_URL`: local NeteaseCloudMusicApi URL, default `http://127.0.0.1:3010`
- `FE_MONSTER_CLIENT_EXE`: optional Edge/Chrome executable used for the local client window

Launch flags:

- `run.cmd`: build, start the Java service, and open the local client window
- `run.cmd --web`: open the client in the default browser
- `run.cmd --no-client`: start the local service only

## Notes

The Java version intentionally avoids external dependencies so it can compile with the installed JDK 17. It does not replace the UE5 renderer; it provides the Java backend and local client shell that serves the existing player assets.

## Verification

The current local player was checked with the Java jar running locally, Microsoft Edge through Playwright, and both desktop/mobile screenshots:

- `build/web-player-final-1365x768.png`
- `build/web-player-final-390x844.png`

## GitHub

Source code: https://github.com/2292576833/FE-Monster
