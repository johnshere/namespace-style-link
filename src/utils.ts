import * as vscode from "vscode";
import { FuncName, LastBEM, NamespaceCache } from "./types";
/**
 * 获取光标所在行的hover单词
 * @param line 一行文本内容
 * @param position 光标位置
 * @returns
 */
export function getHoverWord(line: string, position: vscode.Position) {
  let start = position.character;
  let end = position.character;
  // 向前找到最近的引号
  while (start > 0 && !/^["'`]$/.test(line[start])) {
    start--;
  }
  // 向后找到最近的引号
  while (end < line.length && !/^["'`]$/.test(line[end])) {
    end++;
  }
  if (
    line[start] !== line[end] ||
    !/^["'`]$/.test(line[start]) ||
    end < start
  ) {
    return;
  }
  return line.slice(start + 1, end);
}

/**
 * 匹配 xxx.b('bbb') / xxx.e('eee') / xxx.m('mmm')，记录最近的变量名
 * @param text 文件内容
 * @param bemModuleVarName BEM模块变量名
 * @returns 匹配到的调用及变量名
 */
export function findLastBEM(text: string, bemModuleVarName: string): LastBEM {
  // 支持跨多行
  const result = {} as LastBEM;
  const regex = new RegExp(
    `${bemModuleVarName}\\.(b|e|m)\\(\\s*['"]([^'"]+)['"]\\s*\\)`,
    "g"
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const func = match[1] as keyof LastBEM;
    const arg = match[2];
    result[func] = arg;
  }
  return result;
}

const FUNC_NAMES: Record<FuncName, string> = {
  b: "block",
  e: "element",
  m: "modifier",
} as any;
// 新增：查找匹配的CSS规则
export function findMatchedStyles(
  document: vscode.TextDocument,
  funcName: FuncName,
  className: string,
  mod: NamespaceCache
) {
  const result: number[] = [];
  const func = mod.nsModule === "useBEM" ? FUNC_NAMES[funcName] : funcName;
  // 匹配 @include e(wrap) 或 @include e('wrap') 或 @include e("wrap")
  const regex = new RegExp(
    `@include\\s+${func}\\(\\s*(?:['"]?)${className}(?:['"]?)\\s*\\)`,
    "g"
  );

  for (let i = 0; i < document.lineCount; i++) {
    if (regex.test(document.lineAt(i).text)) {
      result.push(i);
    }
  }
  return result;
}
/**
 *
 * @param cache 缓存Map，key为文档URI，value为NamespaceCache对象
 * @returns
 */
export function styleMatchCreate(cache: Map<string, NamespaceCache>) {
  return (document: vscode.TextDocument, position: vscode.Position) => {
    // 检测是否存在 useBEM 函数调用
    // 优先用缓存
    const nsModule = cache.get(document.uri.toString());
    if (!nsModule) {
      return;
    }

    const bemModuleVarName = nsModule.nsModuleVarName;
    const nsRoot = nsModule.nsRoot;

    // 判断hover选中的是否是BEM函数的调用，并获取，例如：bem.b('block') / bem.e('element') / bem.m('modifier')
    const line = document.lineAt(position.line).text;

    const word = getHoverWord(line, position);
    if (!word) {
      return;
    }

    // 查找最近的 BEM 函数调用，截取hover位置之前的全部内容
    // const text = document.getText();
    // let textBeforeHover = text.substring(0, document.offsetAt(position));
    // textBeforeHover = textBeforeHover.replace(line.substring(position.character), '');
    // const lastBEM = findLastBEM(textBeforeHover, bemModuleVarName);

    // 需要获取调用的函数名，例如：b、e、m
    let hoverStr =
      line
        .substring(0, position.character)
        .split(bemModuleVarName + ".")
        .pop() || "";
    hoverStr = hoverStr + line.split(hoverStr).pop();
    if (!hoverStr) {
      return;
    }
    let bemFunc: FuncName;
    if (new RegExp(`^(b|be|bm|bem)\\(\\s*['"]${word}['"]`).test(hoverStr)) {
      bemFunc = "b";
    } else if (
      new RegExp(`^(e|em)\\(\\s*['"]${word}['"]`).test(hoverStr) ||
      new RegExp(
        `^(be|bem)\\(\\s*['"]([^'"]+)['"]\\s*,\\s*['"]${word}['"]`
      ).test(hoverStr)
    ) {
      bemFunc = "e";
    } else if (
      new RegExp(`^(m)\\(\\s*['"]${word}['"]`).test(hoverStr) ||
      new RegExp(
        `^(bm|em)\\(\\s*['"]([^'"]+)['"]\\s*,\\s*['"]${word}['"]`
      ).test(hoverStr) ||
      new RegExp(
        `^(bem)\\(\\s*['"]([^'"]+)['"]\\s*,\\s*['"]([^'"]+)['"]\\s*,\\s*['"]${word}['"]`
      ).test(hoverStr)
    ) {
      bemFunc = "m";
    } else {
      return;
    }

    // 在<style>标签中查找匹配的CSS选择器
    return findMatchedStyles(document, bemFunc, word, nsModule);
  };
}
