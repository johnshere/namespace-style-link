// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const BEM_USE_REGEX = /(\w+)\s*=\s*useBEM\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('namespace-style-link 扩展已激活');
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "namespace-style-link" is now active!'
  );

  // You can register commands here

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    'namespace-style-link.greet',
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage(
        'hi from namespace-style-link!'
      );
    }
  );
  // 缓存每个文档是否使用了 useBEM
  const bemFileCache = new Map<string, { bemModuleVarName: string, bemNs: string }>();

  // 检查并缓存 useBEM
  function checkAndCacheBEM(document: vscode.TextDocument) {
    if (document.languageId !== 'vue') { return; }
    const text = document.getText();
    const match = BEM_USE_REGEX.exec(text);
    if (match) {
      bemFileCache.set(document.uri.toString(), { bemModuleVarName: match[1], bemNs: match[2] });
    } else {
      bemFileCache.delete(document.uri.toString());
    }
  }

  // 激活时对已打开的文档做一次检查
  vscode.workspace.textDocuments.forEach(checkAndCacheBEM);

  // 监听新打开的文档
  vscode.workspace.onDidOpenTextDocument(checkAndCacheBEM);

  const styleMatch = (document: vscode.TextDocument, position: vscode.Position) => {
    // 检测是否存在 useBEM 函数调用
    // 优先用缓存
    const bemInfo = bemFileCache.get(document.uri.toString());
    if (!bemInfo) { return; }

    const bemModuleVarName = bemInfo.bemModuleVarName;
    const bemNs = bemInfo.bemNs;

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
    let hoverWord = line.substring(0, position.character).split(bemModuleVarName + '.').pop() || '';
    hoverWord = hoverWord + line.split(hoverWord).pop();
    if (!hoverWord) {
      return;
    }
    let bemFunc: FuncName;
    if (new RegExp(`^(b|be|bm|bem)\\(\\s*['"]${word}['"]`).test(hoverWord)) {
      bemFunc = 'b';
    } else if (
      new RegExp(`^(e|em)\\(\\s*['"]${word}['"]`).test(hoverWord) ||
      new RegExp(`^(be|bem)\\(\\s*['"]([^'"]+)['"]\\s*,\\s*['"]${word}['"]`).test(hoverWord)) {
      bemFunc = 'e';
    } else if (
      new RegExp(`^(m)\\(\\s*['"]${word}['"]`).test(hoverWord) ||
      new RegExp(`^(bm|em)\\(\\s*['"]([^'"]+)['"]\\s*,\\s*['"]${word}['"]`).test(hoverWord) ||
      new RegExp(`^(bem)\\(\\s*['"]([^'"]+)['"]\\s*,\\s*['"]([^'"]+)['"]\\s*,\\s*['"]${word}['"]`).test(hoverWord)) {
      bemFunc = 'm';
    } else {
      return;
    }

    // 在<style>标签中查找匹配的CSS选择器
    return findMatchedStyles(document, bemFunc, word);
  };

  const definitionDisposable = vscode.languages.registerDefinitionProvider('vue', {
    provideDefinition(document, position, token) {
      const matchedRules = styleMatch(document, position);
      if (matchedRules && matchedRules.length > 0) {
        // 跳转到第一个匹配的 style 行
        const targetLine = matchedRules[0];
        return new vscode.Location(document.uri, new vscode.Position(targetLine, 0));
      }
      return;
    }
  });
  // 新增：注册Vue语言的Hover Provider
  const hoverDisposable = vscode.languages.registerHoverProvider('vue', {
    provideHover(document, position, token) {

      const matchedRules = styleMatch(document, position);

      if (matchedRules && matchedRules.length > 0) {
        const md = new vscode.MarkdownString();
        matchedRules.forEach(i => {
          md.appendMarkdown(
            `[go to style >](${encodeURI(`command:revealLine?${JSON.stringify({ lineNumber: i, at: 'top' })}`)})\n\n`
          );
          const startSpace = document.lineAt(i).text.split('@include').shift();
          let styles = [];
          for (let j = 0; j < 3; j++) {
            let sline = document.lineAt(i + j).text;
            if (sline && startSpace) {
              sline = sline.replace(startSpace, '');
            }
            styles.push(sline);
          }
          md.appendCodeblock(styles.filter(Boolean).join('\n'), 'css');
          md.appendMarkdown('\n\n');
        });
        md.isTrusted = true;
        return new vscode.Hover(md);
      }
    },
  });

  context.subscriptions.push(disposable);
  context.subscriptions.push(definitionDisposable);
  context.subscriptions.push(hoverDisposable);
}

/**
 * 获取光标所在行的hover单词
 * @param line 一行文本内容
 * @param position 光标位置
 * @returns 
 */
function getHoverWord(line: string, position: vscode.Position) {
  let start = position.character;
  let end = position.character;
  // 向前找到最近的引号
  while (start > 0 && !/^["'`]$/.test(line[start])) { start--; }
  // 向后找到最近的引号
  while (end < line.length && !/^["'`]$/.test(line[end])) { end++; }
  if (line[start] !== line[end] || !/^["'`]$/.test(line[start]) || end < start) {
    return;
  }
  return line.slice(start + 1, end);
}

type LastBEM = { b: string; e: string; m: string };
/**
 * 匹配 xxx.b('bbb') / xxx.e('eee') / xxx.m('mmm')，记录最近的变量名
 * @param text 文件内容
 * @param bemModuleVarName BEM模块变量名
 * @returns 匹配到的调用及变量名
 */
function findLastBEM(text: string, bemModuleVarName: string): LastBEM {
  // 支持跨多行
  const result = {} as LastBEM;
  const regex = new RegExp(
    `${bemModuleVarName}\\.(b|e|m)\\(\\s*['"]([^'"]+)['"]\\s*\\)`,
    'g'
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const func = match[1] as keyof LastBEM;
    const arg = match[2];
    result[func] = arg;
  }
  return result;
}

type FuncName = 'b' | 'e' | 'm';
const FUNC_NAMES: Record<FuncName, string> = {
  b: 'block',
  e: 'element',
  m: 'modifier',
} as any;
// 新增：查找匹配的CSS规则
function findMatchedStyles(document: vscode.TextDocument, funcName: FuncName, className: string) {
  const result: number[] = [];
  const mixin = `@include ${FUNC_NAMES[funcName]}(${className})`;

  for (let i = 0; i < document.lineCount; i++) {
    if (document.lineAt(i).text.includes(mixin)) {
      result.push(i);
    }
  }
  return result;
}

// This method is called when your extension is deactivated
export function deactivate() { }
