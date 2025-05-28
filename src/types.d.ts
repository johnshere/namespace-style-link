export type FuncName = "b" | "e" | "m";
export type LastBEM = { b: string; e: string; m: string };
export type NamespaceCache = {
  nsModule: "useBEM" | "useNamespace";
  nsModuleVarName: string;
  nsRoot: string;
};
