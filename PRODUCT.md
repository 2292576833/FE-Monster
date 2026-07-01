# Product

## Register

product

## Users

FE Monster Java is for Windows listeners and builders who want the FE-Monster music experience to run from a Java service with a local desktop client. They use it to search Netease music, browse account playlists, manage a queue, and control playback from a spatial black-glass interface.

## Product Purpose

FE Monster Java migrates the local service, API contract, client UI, and playback surface into a Java 17 project. Success means the user can start `run.cmd`, get a local client window, search or load playlists, play tracks locally, manage queue state, and see a visual stage that reflects playback and Visual Bridge data.

## Brand Personality

Immersive, precise, electric. The interface should feel like a refined black-glass music instrument: spatial and reactive, but still quiet enough that playback controls and selected content are always clear.

## Anti-references

Avoid flat admin-dashboard panels, generic music-app clones, oversized decorative cards, unclear fake-glass overlays, piled-up buttons, and visual effects that hide controls. Do not copy external source code into this project; reference projects are for behavior and product intent only.

## Design Principles

Preserve control clarity: play, pause, next, previous, seek, volume, login, queue, and selected playlist states must stay obvious and reachable.

Make the stage useful: the sphere, lyric area, queue rail, and glass panels should respond to current state rather than remain static decoration.

Keep Java migration honest: implement stable local APIs and local playback first, then deepen visual fidelity without breaking the service contract.

Favor focused density: show enough search, playlist, and queue information to act quickly, but keep the current track as the visual center.

Use spatial UI deliberately: floating panels and motion can add depth, but selected songs and active controls must remain the single readable focus.

## Accessibility & Inclusion

Target readable contrast on dark surfaces, visible keyboard focus, button labels or titles for icon controls, usable reduced-motion behavior, and layouts that continue to work on compact laptop and mobile widths. Color and glow may reinforce state, but must not be the only state cue.
