# ！行尾注释检测（Python）
# 用 tokenize 提取 COMMENT 词法单元，再判断同一行上它之前是否存在代码词法单元。
# 不能用手写的引号状态机：那会把 docstring 内部以 # 开头的正文误判为注释。
# 用法：python3 scripts/comment-audit/trailing_check.py <files...>
import io
import sys
import tokenize

SKIP = {
    tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE,
    tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING,
    tokenize.ENDMARKER,
}


def trailing(path):
    with io.open(path, "rb") as fh:
        tokens = list(tokenize.tokenize(fh.readline))

    # 先记录哪些行上出现过真正的代码词法单元
    code_lines = set()
    for tok in tokens:
        if tok.type not in SKIP:
            code_lines.add(tok.start[0])

    # 再挑出「同行且之前有代码」的注释，即行尾注释
    out = []
    for tok in tokens:
        if tok.type == tokenize.COMMENT and tok.start[0] in code_lines:
            out.append((tok.start[0], tok.string))
    return out


total = 0
for path in sys.argv[1:]:
    hits = trailing(path)
    total += len(hits)
    print("%-46s trailing_comments=%d" % (path, len(hits)))
    for lineno, text in hits:
        print("     L%d: %s" % (lineno, text[:70]))
print("TOTAL=%d" % total)
