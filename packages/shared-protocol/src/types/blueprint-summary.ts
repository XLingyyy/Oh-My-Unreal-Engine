// K2a: Blueprint 顶层元信息摘要类型（只读，不包含节点/引脚/连线）

export interface GraphSummary {
  name: string;
  kind: 'event' | 'function' | 'macro';
}

export interface VariableSummary {
  name: string;
  category: string;
}

export interface FunctionSummary {
  name: string;
}

export interface MacroSummary {
  name: string;
}

export interface BlueprintSummary {
  name: string;
  packagePath: string;
  objectPath: string;
  assetClass: string;
  parentClassName: string;
  generatedClassName: string;
  skeletonClassName: string;
  blueprintType: string;
  status: string;
  isDataOnly: boolean;
  isDirty: boolean;
  graphCount: number;
  graphs: GraphSummary[];
  variableCount: number;
  variables: VariableSummary[];
  functionCount: number;
  functions: FunctionSummary[];
  macroCount: number;
  macros: MacroSummary[];
}

export interface BlueprintSummaryData {
  /** 当前选中的 Blueprint 摘要；无选中或非 Blueprint 时返回 null */
  selectedBlueprint: BlueprintSummary | null;
}
