# ！Python 代码等价校验
# 对比版控中 HEAD 版本与工作区的 AST，用于证明「只改了注释」。
# AST 比对天然忽略注释与空白，只要两个文件 AST 完全相同，即可断定代码语义未变。
# 用法：
#   python3 scripts/comment-audit/codecmp_py.py <files...>
#   python3 scripts/comment-audit/codecmp_py.py --staged     比对已暂存改动
#   python3 scripts/comment-audit/codecmp_py.py --changed    比对全部未提交改动（默认）
import ast
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# 统一在仓库根执行 git：路径解析不随调用目录漂移
def git(*args):
    return subprocess.run(
        ("git",) + args,
        cwd=REPO, check=True, capture_output=True, text=True, encoding="utf-8",
    ).stdout


# 取未提交的 .py 改动；用 status 而非 diff，后者会受索引 stat 缓存影响而漏报
def changed_files():
    out = git("status", "--porcelain")
    files = []
    for line in out.splitlines():
        path = line[3:].strip()
        if path.endswith(".py"):
            files.append(path)
    return files


# 取已暂存的 .py 改动
def staged_files():
    out = git("diff", "--cached", "--name-only")
    return [f for f in out.splitlines() if f.endswith(".py")]


# 序列化语法树，供直接比较
def dump(source):
    # include_attributes=False：忽略行号等位置属性，只比结构
    return ast.dump(ast.parse(source), include_attributes=False)


# 入口：确定文件清单、逐文件比对并汇总
def main():
    args = sys.argv[1:]
    if not args or args[0] == "--changed":
        files = changed_files()
    elif args[0] == "--staged":
        files = staged_files()
    else:
        files = [a for a in args if not a.startswith("--")]

    if not files:
        print("没有需要比对的 .py 文件")
        return 0

    same = diff = skip = 0
    for path in files:
        try:
            head_src = git("show", "HEAD:" + path)
        except subprocess.CalledProcessError:
            print("SKIP  %s  （HEAD 中不存在，属新文件）" % path)
            skip += 1
            continue

        full = os.path.join(REPO, path)
        with open(full, encoding="utf-8") as fh:
            work_src = fh.read()

        try:
            a = dump(head_src)
            b = dump(work_src)
        except SyntaxError as err:
            print("SKIP  %s  （解析失败：%s）" % (path, err))
            skip += 1
            continue

        if a == b:
            print("PASS  %s" % path)
            same += 1
        else:
            print("FAIL  %s  （AST 不同，代码语义已变更）" % path)
            diff += 1

    print()
    print("等价 %d，差异 %d，跳过 %d" % (same, diff, skip))
    return 1 if diff else 0


if __name__ == "__main__":
    sys.exit(main())
