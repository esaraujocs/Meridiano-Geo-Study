// Só para Windows. Vários testes chamam execFileSync("node_modules/.bin/tsc", ...), que ali é um script de shell
// e não executa. Este shim redireciona essa chamada para o `node node_modules/typescript/bin/tsc`.
// Uso: NODE_OPTIONS="-r ./scripts/windows-tsc-shim.cjs" npm run test:spoils
const cp = require("node:child_process");
const orig = cp.execFileSync;
cp.execFileSync = function (file, args, opts) {
  if (typeof file === "string" && file.split("\\").join("/").endsWith("node_modules/.bin/tsc")) {
    return orig(process.execPath, ["node_modules/typescript/bin/tsc", ...(args ?? [])], opts);
  }
  return orig.apply(this, arguments);
};
