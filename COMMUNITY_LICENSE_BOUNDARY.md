# FE Monster License Boundary

## Open Source Client

The FE Monster client source is licensed under the MIT License, as stated in
`LICENSE`.

MIT is used here because the current client still contains community UI host
code in the same web runtime files as the open player UI. Keeping the open
client under GPL while distributing proprietary community modules in the same
runtime would create a higher license-compatibility risk.

## Public Community Interface

These files are public interface files and remain part of the open client:

- `src/main/java/com/femonster/community/CommunityClient.java`
- `src/main/java/com/femonster/community/CommunityModule.java`
- `src/main/java/com/femonster/community/CommunityDeviceRequest.java`
- `src/main/java/com/femonster/community/CommunityRequest.java`
- `src/main/java/com/femonster/community/CommunitySignature.java`

Open code may depend on these interfaces. It must not contain official
community secrets, signing keys, certificate pinning material, final device
fingerprint salts, or closed anti-tamper logic.

## Proprietary Community Implementation

These paths are community proprietary:

- `src/community-proprietary/**`
- `plugins/community/*.jar`
- `../FE moster server/**`

The proprietary community implementation is licensed under
`LICENSES/COMMUNITY-PROPRIETARY.txt`.

## Isolation Rule

The open client talks to community functionality only through:

- the public Java community interfaces;
- local HTTP calls to the community server;
- closed runtime modules loaded from `plugins/community/*.jar`.

Do not move community implementation back into `src/main/java/com/femonster/core`.
Do not place source files inside `plugins/community`; that folder is for closed
binary modules only.
