package com.femonster.memory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryFlag;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.UserPrincipal;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

final class MemoryFileSecurity {
    private MemoryFileSecurity() {
    }

    static void hardenOwnerOnly(Path path, boolean directory) throws IOException {
        if (path == null
            || Files.isSymbolicLink(path)
            || (directory && !Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS))
            || (!directory && !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS))) {
            throw new IOException("MEMORY_OWNER_ONLY_UNAVAILABLE");
        }
        if (Files.getFileStore(path).supportsFileAttributeView("posix")) {
            Set<PosixFilePermission> permissions = EnumSet.of(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE
            );
            if (directory) permissions.add(PosixFilePermission.OWNER_EXECUTE);
            Files.setPosixFilePermissions(path, permissions);
            if (!Files.getPosixFilePermissions(path, LinkOption.NOFOLLOW_LINKS).equals(permissions)) {
                throw new IOException("MEMORY_OWNER_ONLY_UNAVAILABLE");
            }
            return;
        }

        AclFileAttributeView view = Files.getFileAttributeView(
            path,
            AclFileAttributeView.class,
            LinkOption.NOFOLLOW_LINKS
        );
        if (view == null) throw new IOException("MEMORY_OWNER_ONLY_UNAVAILABLE");
        UserPrincipal owner = view.getOwner();
        AclEntry.Builder builder = AclEntry.newBuilder()
            .setType(AclEntryType.ALLOW)
            .setPrincipal(owner)
            .setPermissions(EnumSet.allOf(AclEntryPermission.class));
        if (directory) {
            builder.setFlags(EnumSet.of(AclEntryFlag.FILE_INHERIT, AclEntryFlag.DIRECTORY_INHERIT));
        }
        view.setAcl(List.of(builder.build()));
        if (!isOwnerOnly(path, directory)) throw new IOException("MEMORY_OWNER_ONLY_UNAVAILABLE");
    }

    static boolean isOwnerOnly(Path path, boolean directory) throws IOException {
        if (Files.getFileStore(path).supportsFileAttributeView("posix")) {
            Set<PosixFilePermission> expected = EnumSet.of(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE
            );
            if (directory) expected.add(PosixFilePermission.OWNER_EXECUTE);
            return Files.getPosixFilePermissions(path, LinkOption.NOFOLLOW_LINKS).equals(expected);
        }
        AclFileAttributeView view = Files.getFileAttributeView(
            path,
            AclFileAttributeView.class,
            LinkOption.NOFOLLOW_LINKS
        );
        if (view == null) return false;
        UserPrincipal owner = view.getOwner();
        List<AclEntry> entries = view.getAcl();
        if (entries.size() != 1) return false;
        AclEntry entry = entries.get(0);
        if (entry.type() != AclEntryType.ALLOW
            || !entry.principal().equals(owner)
            || !entry.permissions().equals(EnumSet.allOf(AclEntryPermission.class))) {
            return false;
        }
        Set<AclEntryFlag> expectedFlags = directory
            ? EnumSet.of(AclEntryFlag.FILE_INHERIT, AclEntryFlag.DIRECTORY_INHERIT)
            : Set.of();
        return entry.flags().equals(expectedFlags);
    }
}
