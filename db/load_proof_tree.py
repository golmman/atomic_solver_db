#!/usr/bin/env python3
"""Load a proof_tree.bin file into the proof_tree PostgreSQL database.

The file format is described in proof_tree_dump.md.
"""

import os
import struct
import sys


def sq_str(sq: int) -> str:
    """Return the UCI square string for a 0-63 square index."""
    file = sq % 8
    rank = sq // 8
    return chr(ord("a") + file) + str(rank + 1)


def move_to_uci(move_code: int) -> str:
    """Convert a 16-bit move code to a UCI string.

    The bit layout is: to_sq:6 | from_sq:6 | type:2 | promotion_type:2.
    """
    to_sq = move_code & 0x3F
    from_sq = (move_code >> 6) & 0x3F
    move_type = (move_code >> 12) & 0x3
    promotion_idx = (move_code >> 14) & 0x3

    from_str = sq_str(from_sq)

    if move_type == 3:  # Castling
        # Normalize to the king-destination squares g1/c1/g8/c8.
        if from_sq in (4, 60):
            from_file = from_sq % 8
            to_file = to_sq % 8
            rank = from_sq // 8
            target_file = "g" if to_file > from_file else "c"
            to_str = target_file + str(rank + 1)
        else:
            to_str = sq_str(to_sq)
    else:
        to_str = sq_str(to_sq)

    uci = from_str + to_str

    if move_type == 1:  # Promotion
        uci += ["q", "r", "b", "n"][promotion_idx]

    return uci


VALID_OUTCOME_CODES = {0, 1, 2}
OUTCOME_NAMES = {0: "Draw", 1: "Win", 2: "Loss"}


def load_proof_tree(path: str):
    """Parse proof_tree.bin and return (metadata, rows).

    rows is a list of tuples: (id, parent_id, uci_move, depth)
    depth is the tree depth (0 for the root, +1 for each generation).
    """
    with open(path, "rb") as f:
        data = f.read()

    offset = 0

    def read(size: int) -> bytes:
        nonlocal offset
        if offset + size > len(data):
            raise ValueError(f"Unexpected end of file at offset {offset}")
        chunk = data[offset : offset + size]
        offset += size
        return chunk

    magic = read(8)
    if magic != b"ATOMTREE":
        raise ValueError(f"Bad magic: {magic!r}")

    version = read(1)[0]
    if version != 1:
        raise ValueError(f"Unsupported version: {version}")

    # FEN is terminated by '\n'.
    fen_end = data.find(b"\n", offset)
    if fen_end == -1:
        raise ValueError("FEN not terminated by newline")
    fen = data[offset:fen_end].decode("ascii")
    offset = fen_end + 1

    root_outcome_code = read(1)[0]
    if root_outcome_code not in VALID_OUTCOME_CODES:
        raise ValueError(f"Invalid root_outcome: {root_outcome_code}")
    root_outcome = OUTCOME_NAMES[root_outcome_code]

    root_depth = struct.unpack("<I", read(4))[0]

    records_bytes = data[offset:]
    if len(records_bytes) % 6 != 0:
        raise ValueError("Records do not fill the file evenly")
    n = len(records_bytes) // 6

    parents = []
    move_codes = []
    for _ in range(n):
        parent_id = struct.unpack("<I", read(4))[0]
        move_code = struct.unpack("<H", read(2))[0]
        parents.append(parent_id)
        move_codes.append(move_code)

    if n == 0:
        raise ValueError("No node records found")

    if parents[0] != 0xFFFFFFFF:
        raise ValueError("Root node must have parent_id 0xFFFFFFFF")
    if move_codes[0] != 0:
        raise ValueError("Root node must have move_code 0")

    for i in range(1, n):
        if parents[i] >= i:
            raise ValueError(f"Node {i} has invalid parent_id {parents[i]}")

    # Build children adjacency.
    children = [[] for _ in range(n)]
    for i in range(1, n):
        children[parents[i]].append(i)

    # Compute tree depth: 0 at the root, increasing by one for each child.
    depths = [0] * n
    for i in range(n):
        for child in children[i]:
            depths[child] = depths[i] + 1

    rows = []
    for i in range(n):
        parent_id = None if i == 0 else parents[i]
        uci = None if i == 0 else move_to_uci(move_codes[i])
        rows.append((i, parent_id, uci, depths[i]))

    metadata = {
        "fen": fen,
        "version": version,
        "root_outcome": root_outcome,
        "root_depth": root_depth,
        "node_count": n,
    }
    return metadata, rows


def import_to_postgres(metadata, rows, conninfo):
    """Import parsed rows into the proof_tree table and store metadata."""
    import psycopg2
    from psycopg2.extras import execute_values

    conn = psycopg2.connect(**conninfo)
    try:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS proof_tree CASCADE;")
            cur.execute(
                """
                CREATE TABLE proof_tree (
                    id integer PRIMARY KEY,
                    parent_id integer REFERENCES proof_tree(id),
                    uci_move text,
                    depth integer NOT NULL
                );
                """
            )
            cur.execute("CREATE INDEX idx_proof_tree_parent ON proof_tree (parent_id);")

            cur.execute("DROP TABLE IF EXISTS proof_tree_meta;")
            cur.execute(
                """
                CREATE TABLE proof_tree_meta (
                    fen text,
                    version integer,
                    root_outcome text,
                    root_depth integer,
                    node_count integer
                );
                """
            )

            execute_values(
                cur,
                """
                INSERT INTO proof_tree
                    (id, parent_id, uci_move, depth)
                VALUES %s
                """,
                rows,
                page_size=10000,
            )

            cur.execute(
                """
                INSERT INTO proof_tree_meta
                    (fen, version, root_outcome, root_depth, node_count)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    metadata["fen"],
                    metadata["version"],
                    metadata["root_outcome"],
                    metadata["root_depth"],
                    metadata["node_count"],
                ),
            )
        conn.commit()
    finally:
        conn.close()


def get_conninfo():
    """Build a psycopg2 connection dict from environment variables."""
    return {
        "host": os.environ.get("PGHOST", "/var/run/postgresql"),
        "dbname": os.environ.get("PGDATABASE", os.environ.get("POSTGRES_DB", "proof_tree")),
        "user": os.environ.get("PGUSER", os.environ.get("POSTGRES_USER", "postgres")),
        "password": os.environ.get("PGPASSWORD", os.environ.get("POSTGRES_PASSWORD", "")),
    }


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "/proof_tree.bin"

    print(f"Loading proof tree from {path}...", file=sys.stderr)
    metadata, rows = load_proof_tree(path)
    print(f"Parsed {metadata['node_count']} nodes.", file=sys.stderr)

    conninfo = get_conninfo()
    import_to_postgres(metadata, rows, conninfo)
    print("Import complete.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
