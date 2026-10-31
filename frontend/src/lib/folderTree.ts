/**
 * 폴더 종류 묶음(= 사진이 **바로** 들어 있는 폴더)을 트리로.
 * - 사진 없는 중간 폴더는 접어서 한 칸으로 (`1/2`) — 사진 있는 가장 가까운 윗 폴더 아래에 놓고, 이름은 그 아래 경로 전체
 * - 개수는 그 폴더 바로 아래 파일만 (하위 폴더 것은 안 더한다)
 */
export interface FolderNode {
  key: string;
  title: string;
  count: number;
  children: FolderNode[];
}

export function buildFolderTree(groups: { key: string; count: number }[]): { root: { count: number } | null; nodes: FolderNode[] } {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const parentOf = (key: string): string => {
    const parts = key.split("/");
    for (let n = parts.length - 1; n >= 1; n--) {
      const up = parts.slice(0, n).join("/");
      if (byKey.has(up)) return up;
    }
    return "";
  };
  const nodes = new Map<string, FolderNode>();
  const top: FolderNode[] = [];
  for (const g of [...groups].filter((x) => x.key !== "").sort((a, b) => a.key.localeCompare(b.key, "ko", { numeric: true }))) {
    const parent = parentOf(g.key);
    const node: FolderNode = { key: g.key, title: parent === "" ? g.key : g.key.slice(parent.length + 1), count: g.count, children: [] };
    nodes.set(g.key, node);
    (parent === "" ? top : nodes.get(parent)!.children).push(node);
  }
  const root = byKey.get("");
  return { root: root ? { count: root.count } : null, nodes: top };
}
