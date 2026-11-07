const fs = require("node:fs");
const typescript = require("typescript");

// 直接执行项目源码；仅转换 TypeScript，不加载 React Native 原生模块。
const compile = (loadedModule, filename) => {
  const { outputText } = typescript.transpileModule(
    fs.readFileSync(filename, "utf8"),
    {
      compilerOptions: {
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
        jsx: typescript.JsxEmit.React,
        esModuleInterop: true,
      },
    },
  );
  loadedModule._compile(outputText, filename);
};

require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;
