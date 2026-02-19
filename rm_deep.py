#!/usr/bin/env python3
"""Delete deeply nested dirs using fd-based ops - never constructs long paths."""

import os
import sys

def delete_at_fd(parent_fd: int, name: str, is_dir: bool) -> None:
    """Delete path 'name' relative to parent_fd. Uses only short names, no full paths."""
    if is_dir:
        child_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY, dir_fd=parent_fd)
        try:
            with os.scandir(child_fd) as it:
                for ent in list(it):  # list() to consume before we delete
                    delete_at_fd(child_fd, ent.name, ent.is_dir(follow_symlinks=False))
        finally:
            os.close(child_fd)
        os.rmdir(name, dir_fd=parent_fd)
    else:
        os.unlink(name, dir_fd=parent_fd)


def main():
    if len(sys.argv) >= 2:
        parent = os.path.expanduser(sys.argv[1])
        child = sys.argv[2] if len(sys.argv) >= 3 else None
        if child:
            fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                print(f"Deleting {parent}/{child}")
                delete_at_fd(fd, child, True)
                print("Done.")
            finally:
                os.close(fd)
            return
        # 1 arg: if path points to a node_modules/clerk folder, delete it
        if os.path.isdir(parent):
            base = os.path.basename(parent.rstrip("/"))
            if base.startswith("node_modules") or base == "clerk":
                grandparent = os.path.dirname(parent)
                fd = os.open(grandparent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    print(f"Deleting {parent}")
                    delete_at_fd(fd, base, True)
                    print("Done.")
                finally:
                    os.close(fd)
                return
        target = parent
    else:
        target = os.path.expanduser("~/.Trash")
    print(f"Target: {target}")
    fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
    try:
        with os.scandir(fd) as it:
            for ent in it:
                if ent.name.startswith("node_modules") or ent.name == "clerk":
                    print(f"Deleting: {ent.name}")
                    delete_at_fd(fd, ent.name, ent.is_dir(follow_symlinks=False))
                    print(f"  Done: {ent.name}")
    finally:
        os.close(fd)
    print("Finished.")


if __name__ == "__main__":
    main()
