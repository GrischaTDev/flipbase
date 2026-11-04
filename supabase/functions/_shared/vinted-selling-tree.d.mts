export interface VintedSellingTreeNode {
  readonly id: number;
  readonly parentId: number | null;
  readonly title: string;
  readonly path: string;
  readonly isLeaf: boolean;
}
export declare function parseVintedSellingTree(input: unknown): VintedSellingTreeNode[];
export declare function flattenVintedSellingCatalogs(input: unknown): VintedSellingTreeNode[];
