// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { BEM_USE_REGEX } from "./constant";
import { FuncName, NamespaceCache } from "./types";
import { findMatchedStyles, getHoverWord, styleMatchCreate } from "./utils";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("namespace-style-link 扩展已激活");
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
    "namespace-style-link.greet",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("hi from namespace-style-link!");
    }
  );
  // 缓存每个文档是否使用了 useBEM
  const nsFileCache = new Map<string, NamespaceCache>();

  // 检查并缓存 useBEM
  function checkAndCacheBEM(document: vscode.TextDocument) {
    if (document.languageId !== "vue") {
      return;
    }
    const text = document.getText();
    const match = BEM_USE_REGEX.exec(text);
    if (match) {
      nsFileCache.set(document.uri.toString(), {
        nsModuleVarName: match[1],
        nsModule: match[2] as NamespaceCache["nsModule"],
        nsRoot: match[3],
      });
    } else {
      nsFileCache.delete(document.uri.toString());
    }
  }

  // 激活时对已打开的文档做一次检查
  vscode.workspace.textDocuments.forEach(checkAndCacheBEM);

  // 监听新打开的文档
  vscode.workspace.onDidOpenTextDocument(checkAndCacheBEM);

  const styleMatch = styleMatchCreate(nsFileCache);

  const definitionDisposable = vscode.languages.registerDefinitionProvider(
    "vue",
    {
      provideDefinition(document, position, token) {
        const matchedRules = styleMatch(document, position);
        if (matchedRules && matchedRules.length > 0) {
          // 跳转到第一个匹配的 style 行
          const targetLine = matchedRules[0];
          return new vscode.Location(
            document.uri,
            new vscode.Position(targetLine, 0)
          );
        }
        return;
      },
    }
  );
  // 新增：注册Vue语言的Hover Provider
  const hoverDisposable = vscode.languages.registerHoverProvider("vue", {
    provideHover(document, position, token) {
      const matchedRules = styleMatch(document, position);

      if (matchedRules && matchedRules.length > 0) {
        const md = new vscode.MarkdownString();
        matchedRules.forEach((i) => {
          md.appendMarkdown(
            `[go to style >](${encodeURI(
              `command:revealLine?${JSON.stringify({
                lineNumber: i,
                at: "top",
              })}`
            )})\n\n`
          );
          const startSpace = document.lineAt(i).text.split("@include").shift();
          let styles = [];
          for (let j = 0; j < 3; j++) {
            let sline = document.lineAt(i + j).text;
            if (sline && startSpace) {
              sline = sline.replace(startSpace, "");
            }
            styles.push(sline);
          }
          md.appendCodeblock(styles.filter(Boolean).join("\n"), "css");
          md.appendMarkdown("\n\n");
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

// This method is called when your extension is deactivated
export function deactivate() {}
