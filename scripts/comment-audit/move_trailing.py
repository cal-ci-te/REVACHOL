# ！行尾注释转前置
# 把「代码 # 注释」改写为「# 注释」+「代码」两行，供批量满足 code-style.md 的
# 「不要用行尾注释」。注释文本取自 tokenize 的词法单元，不经手写字面量，
# 因此引号、反斜杠（如 "\x1b"）等特殊字符能被原样保留。
#
# 默认保留工具指令注释（noqa / type: ignore 等）：它们必须与代码同行才生效。
#
# 用法：
#   python3 scripts/comment-audit/move_trailing.py <files...>          # 预览
#   python3 scripts/comment-audit/move_trailing.py --apply <files...>  # 写入
import io
import sys
import tokenize

KEEP_MARKERS = ("noqa", "type: ignore", "type:ignore", "pylint:", "mypy:")


def is_kept(comment):
    return any(marker in comment for marker in KEEP_MARKERS)


def collect(path):
    """返回 [(行号, 注释列, 注释文本)]，仅含需要移动的行尾注释"""
    with io.open(path, "rb") as fh:
        tokens = list(tokenize.tokenize(fh.readline))

    code_lines = set()
    for tok in tokens:
        if tok.type not in {
            tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE,
            tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING, tokenize.ENDMARKER,
        }:
            code_lines.add(tok.start[0])

    hits = []
    for tok in tokens:
        if tok.type != tokenize.COMMENT:
            continue
        if tok.start[0] not in code_lines:
            continue
        if is_kept(tok.string):
            continue
        hits.append((tok.start[0], tok.start[1], tok.string))
    return hits


def transform(path, apply_changes):
    lines = io.open(path, encoding="utf-8").read().split("\n")
    hits = collect(path)

    for lineno, col, comment in sorted(hits, key=lambda h: -h[0]):
        original = lines[lineno - 1]
        code = original[:col].rstrip()
        indent = code[:len(code) - len(code.lstrip())]
        text = comment.lstrip("#").strip()
        lines[lineno - 1:lineno] = [indent + "# " + text, code]

    if apply_changes:
        io.open(path, "w", encoding="utf-8", newline="").write("\n".join(lines))

    print("%-46s moved=%d" % (path, len(hits)))
    for lineno, col, comment in hits:
        print("     L%-4d %s" % (lineno, comment[:70]))
    return len(hits)


def main():
    args = sys.argv[1:]
    apply_changes = "--apply" in args
    files = [a for a in args if not a.startswith("--")]
    total = 0
    for path in files:
        total += transform(path, apply_changes)
    print("TOTAL=%d%s" % (total, "" if apply_changes else "  （预览模式，加 --apply 写入）"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
