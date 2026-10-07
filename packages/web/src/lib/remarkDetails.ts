interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName: string };
}

const opening = (node: MarkdownNode) =>
  node.type === "html" ? node.value?.match(/^<details>\s*<summary>([^<>\n]+)<\/summary>\s*$/)?.[1] : undefined;
const closing = (node: MarkdownNode) => node.type === "html" && /^<\/details>\s*$/.test(node.value ?? "");

/**
 * A deliberately small Markdown extension: an attribute-free <details><summary>text</summary> block,
 * a blank line, Markdown content, a blank line, and </details>. Other HTML stays escaped by ReactMarkdown.
 * Only known tag names are generated; source attributes and raw HTML never enter the DOM.
 */
export function remarkDetails() {
  function fold(nodes: MarkdownNode[]): MarkdownNode[] {
    const out: MarkdownNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      // Build-time source-sync delimiters are not article content. Code-fenced examples stay untouched.
      if (node.type === "html" && /^<!-- (?:BEGIN|END) HARNESS PROMPTS -->\s*$/.test(node.value ?? "")) continue;
      const label = opening(node);
      if (label) {
        let depth = 1;
        let end = i + 1;
        for (; end < nodes.length; end++) {
          if (opening(nodes[end])) depth++;
          else if (closing(nodes[end])) depth--;
          if (depth === 0) break;
        }
        if (depth === 0) {
          out.push({
            type: "docDetails",
            data: { hName: "details" },
            children: [
              { type: "docSummary", data: { hName: "summary" }, children: [{ type: "text", value: label.trim() }] },
              ...fold(nodes.slice(i + 1, end)),
            ],
          });
          i = end;
          continue;
        }
      }
      if (node.children) node.children = fold(node.children);
      out.push(node);
    }
    return out;
  }
  return (tree: MarkdownNode) => {
    if (tree.children) tree.children = fold(tree.children);
  };
}
