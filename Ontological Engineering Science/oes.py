#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Universal Scheme–aligned generator for valid expressions over tokens:
    'a.', '~', 'o.', '{', '}', 'A.'

Grammar (Objects):
    Expr := Atom | "{" Expr "}" | Expr "~" Expr
    Atom := "a." | "o." | "A."

VALID iff:
  (P1) Braces are balanced
  (P2) '~' is binary-infix with Expr on both sides

Output: streams VALID combinations for token-length in [min_len, max_len],
tokens separated by a single space.

CLI:
    python generate_combinations.py --out valid.txt --min-len 3 --max-len 12
    python generate_combinations.py --out valid.txt --min-len 3 --max-len 17 --only-odd

Design aligned to the scheme:
  - Value Set: Token literals
  - Property Set: well_formed, balanced, token_length
  - Relation Set: structural equivalence, subexpression, yields_length
  - Object Set: Expr = Atom | Brace | Binary
  - Morphism Set: brace(), combine(), pretty(), tokens(), length()
  - Category Set: Builders as endomorphisms with identity and composition
  - Implementation/Circuit Set: streaming enumerator + DP counter + CLI

"""

from __future__ import annotations
import argparse
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable, Iterable, Iterator, List, Optional, Tuple

# ===============================
# VALUE SET: tokens / literals
# ===============================

TOK_A   = "a."
TOK_O   = "o."
TOK_AU  = "A."
TOK_TIL = "~"
TOK_L   = "{"
TOK_R   = "}"

ALPHABET: Tuple[str, ...] = (TOK_A, TOK_TIL, TOK_O, TOK_L, TOK_R, TOK_AU)

ATOMS: Tuple[str, ...] = (TOK_A, TOK_O, TOK_AU)


# ===============================
# OBJECT SET: expression AST
# ===============================

class Expr:
    """Abstract base of expressions in the grammar."""

    def tokens(self) -> List[str]:
        raise NotImplementedError

    def length(self) -> int:
        return len(self.tokens())

    def __str__(self) -> str:
        return pretty(self)

    # Relation: structural equality
    def structurally_equals(self, other: "Expr") -> bool:
        return self.tokens() == other.tokens()


@dataclass(frozen=True)
class Atom(Expr):
    sym: str  # one of ATOMS

    def __post_init__(self):
        if self.sym not in ATOMS:
            raise ValueError(f"Invalid atom: {self.sym}")

    def tokens(self) -> List[str]:
        return [self.sym]


@dataclass(frozen=True)
class Brace(Expr):
    inner: Expr

    def tokens(self) -> List[str]:
        return [TOK_L] + self.inner.tokens() + [TOK_R]


@dataclass(frozen=True)
class Binary(Expr):
    left: Expr
    right: Expr

    def tokens(self) -> List[str]:
        return self.left.tokens() + [TOK_TIL] + self.right.tokens()


# ===============================
# MORPHISM SET: constructors, projections, printers
# ===============================

def brace(e: Expr) -> Expr:
    """Morphism: Expr → Expr (wrap with braces)"""
    return Brace(e)

def combine(l: Expr, r: Expr) -> Expr:
    """Morphism: Expr×Expr → Expr (binary infix '~')"""
    return Binary(l, r)

def pretty(e: Expr) -> str:
    """Morphism: Expr → string of space-separated tokens (canonical form)"""
    return " ".join(e.tokens())


# ===============================
# PROPERTY SET: predicates/invariants
# ===============================

def is_atom_expr(e: Expr) -> bool:
    return isinstance(e, Atom)

def is_balanced_tokens(toks: Iterable[str]) -> bool:
    """(P1) Balanced braces over token stream."""
    depth = 0
    for t in toks:
        if t == TOK_L:
            depth += 1
        elif t == TOK_R:
            depth -= 1
            if depth < 0:
                return False
    return depth == 0

def is_well_formed(e: Expr) -> bool:
    """(P1)+(P2) by construction always True for Expr built via morphisms.
    Kept as a property to match scheme; asserts token-level invariant."""
    toks = e.tokens()
    if not is_balanced_tokens(toks):
        return False
    # (P2) Binary '~' is always surrounded by Exprs because AST enforces it.
    # Still ensure no stray '~' at token edges.
    if toks and toks[0] == TOK_TIL:
        return False
    if toks and toks[-1] == TOK_TIL:
        return False
    return True

def token_length(e: Expr) -> int:
    return e.length()


# ===============================
# RELATION SET: structural relations
# ===============================

def yields_length(e: Expr, n: int) -> bool:
    return token_length(e) == n

def has_subexpression(e: Expr, sub: Expr) -> bool:
    if e.structurally_equals(sub):
        return True
    if isinstance(e, Atom):
        return False
    if isinstance(e, Brace):
        return has_subexpression(e.inner, sub)
    if isinstance(e, Binary):
        return has_subexpression(e.left, sub) or has_subexpression(e.right, sub)
    return False


# ===============================
# CATEGORY SET: small category of builders
#   Objects: Expr
#   Morphisms: callables Expr→Expr built from {identity, brace} and contexted combine
#   Composition: function composition
# ===============================

Morph = Callable[[Expr], Expr]

def identity() -> Morph:
    return lambda x: x

def compose(f: Morph, g: Morph) -> Morph:
    """(f ∘ g)(x) = f(g(x))"""
    return lambda x: f(g(x))

def left_combine_with(k: Expr) -> Morph:
    """Return a morphism m(x) = combine(k, x)"""
    return lambda x: combine(k, x)

def right_combine_with(k: Expr) -> Morph:
    """Return a morphism m(x) = combine(x, k)"""
    return lambda x: combine(x, k)


# ===============================
# IMPLEMENTATION / CIRCUIT SET
#   Streaming enumerator by token length
#   DP counter (no materialization)
#   CLI
# ===============================

# Cached enumeration by token-length (pure, total)
@lru_cache(maxsize=None)
def gen_by_len(n: int) -> Tuple[Expr, ...]:
    """
    Returns ALL valid expressions with token-length == n (as Expr ASTs).
    WARNING: grows fast; use stream_by_len for memory-light iteration.
    """
    results: List[Expr] = []
    if n == 1:
        results.extend([Atom(TOK_A), Atom(TOK_O), Atom(TOK_AU)])
        return tuple(results)

    # Brace case: "{" Expr "}" has length inner+2
    if n >= 3:
        inner_len = n - 2
        for inner in gen_by_len(inner_len):
            results.append(brace(inner))

    # Binary case: Expr "~" Expr where i + 1 + j = n
    if n >= 3:
        for i in range(1, n - 1):
            j = n - 1 - i
            for L in gen_by_len(i):
                for R in gen_by_len(j):
                    results.append(combine(L, R))
    return tuple(results)

def count_by_len(n: int) -> int:
    """Count via DP using the same recurrence without building ASTs."""
    @lru_cache(maxsize=None)
    def E(k: int) -> int:
        if k < 1:
            return 0
        if k == 1:
            return 3  # three atoms
        total = 0
        # braces
        total += E(k - 2) if k - 2 >= 1 else 0
        # binary splits
        for i in range(1, k - 1):
            j = k - 1 - i
            if j >= 1:
                total += E(i) * E(j)
        return total
    return E(n)

def stream_by_len(n: int) -> Iterator[Expr]:
    """Memory-light generator of Expr with token-length n."""
    if n == 1:
        yield Atom(TOK_A); yield Atom(TOK_O); yield Atom(TOK_AU)
        return

    if n >= 3:
        inner_len = n - 2
        for inner in stream_by_len(inner_len):
            yield brace(inner)

    if n >= 3:
        for i in range(1, n - 1):
            j = n - 1 - i
            for L in stream_by_len(i):
                for R in stream_by_len(j):
                    yield combine(L, R)

def write_all(out_path: str, min_len: int, max_len: int, only_odd: bool = False) -> None:
    total_lines = 0
    with open(out_path, "w", encoding="utf-8") as f:
        for n in range(min_len, max_len + 1):
            # In this grammar, only odd lengths are nonzero.
            if (n % 2 == 0) or (only_odd and (n % 2 == 0)):
                continue
            for expr in stream_by_len(n):
                # Properties re-checked (paranoid; always True by construction)
                if is_well_formed(expr):
                    f.write(pretty(expr) + "\n")
                    total_lines += 1
    print(f"Wrote {total_lines} lines to {out_path}")

# ===============================
# CLI (circuit orchestration)
# ===============================

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="Output .txt file path")
    ap.add_argument("--min-len", type=int, default=3, help="Minimum token length (default: 3)")
    ap.add_argument("--max-len", type=int, default=11, help="Maximum token length (default: 11)")
    ap.add_argument("--only-odd", action="store_true", help="Generate only odd lengths (recommended)")
    ap.add_argument("--show-counts", action="store_true", help="Print counts per length before generating")
    ap.add_argument("--demo-category", action="store_true",
                    help="Print a tiny demo showing identity/compose over builders")
    args = ap.parse_args()

    if args.show_counts:
        for n in range(args.min_len, args.max_len + 1):
            c = count_by_len(n) if (n % 2 == 1) else 0
            print(f"length {n:2d}: {c:,}")

    if args.demo_category:
        # Category demo: (brace ∘ right_combine_with(A.))(a.) == brace(a. ~ A.)
        a = Atom(TOK_A)
        A = Atom(TOK_AU)
        morph = compose(brace, right_combine_with(A))
        out = morph(a)
        print("Category demo:")
        print("  start:", pretty(a))
        print("  morph: brace ∘ right_combine_with(A.)")
        print("  end  :", pretty(out))

    write_all(args.out, args.min_len, args.max_len, only_odd=args.only_odd)

if __name__ == "__main__":
    main()
