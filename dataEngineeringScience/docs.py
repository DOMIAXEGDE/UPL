from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

EXTENSIONS = {".txt", ".c", ".py", ".ps1", ".md"}
OUTPUT_PATH = Path("doc/doc.txt")


def list_text_files(directory: Path = Path(".")) -> list[Path]:
    """Return files in `directory` whose suffix is in EXTENSIONS (case-insensitive)."""
    files: list[Path] = []
    for p in directory.iterdir():
        if p.is_file() and p.suffix.lower() in EXTENSIONS:
            files.append(p)
    return files


def read_file_content(path: Path) -> str:
    """Read file as UTF-8, returning the text or the error message."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception as e:  # noqa: BLE001 - we want to capture any read error
        return f"[ERROR reading {path.name}: {e}]"


def _sort_key(path: Path) -> tuple[int, str]:
    """
    Extract the first integer found in the filename (without extension) for sorting.
    Files without a number are placed after numbered files (using +inf via a large sentinel).
    Ties are broken by lowercase filename for stable ordering.
    """
    stem = path.stem
    m = re.search(r"\d+", stem)
    if m:
        try:
            num = int(m.group(0))
        except ValueError:
            num = 10**18  # extremely large sentinel
    else:
        num = 10**18
    return (num, stem.lower())


def sort_files(files: Iterable[Path]) -> list[Path]:
    """Sort files using _sort_key."""
    return sorted(files, key=_sort_key)


def create_txt(files: Iterable[Path], out_path: Path = OUTPUT_PATH) -> None:
    """Create/overwrite the output text file with each file's name and content."""
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Avoid including the output file itself if it's in the same folder and matches filter
    files = [p for p in files if p.resolve() != out_path.resolve()]

    with out_path.open("w", encoding="utf-8", newline="\n") as txt_file:
        for p in files:
            txt_file.write(f"{p.name}\n;Content of {p.name}\n")
            txt_file.write(read_file_content(p))
            txt_file.write("\n\n")


def main() -> None:
    here = Path(".")
    text_files = list_text_files(here)

    # Optionally skip this script file if it lives in the same directory
    try:
        this_file = Path(__file__).resolve()
        text_files = [p for p in text_files if p.resolve() != this_file]
    except NameError:
        # __file__ may not exist in some execution contexts (e.g., interactive)
        pass

    sorted_text_files = sort_files(text_files)
    create_txt(sorted_text_files, OUTPUT_PATH)

    print(f"Documentation updated: Created '{OUTPUT_PATH.as_posix()}' "
          f"from {len(sorted_text_files)} file(s).")


if __name__ == "__main__":
    main()
