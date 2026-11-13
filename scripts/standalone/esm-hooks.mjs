/**
 * 独立客户端模式的 ESM 模块钩子（tsx register() 同步钩子）。
 *
 * 职责：
 *   1) 把仓库 tsconfig.base.json 的 paths 别名解析成真实文件路径（兜底）；
 *   2) 把 'snowcat-webui-backend'（index 入口）重定向到 shim。
 *
 * 只影响本进程（standalone-client.ts），不污染仓库构建链。
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const PACKAGES = path.join(REPO_ROOT, 'packages');

/** tsconfig.base.json paths 的最小镜像（只放独立客户端链路用到的） */
const ALIAS_TABLE = [
  [/^snowcat-core$/, path.join(PACKAGES, 'snowcat-core', 'index.ts')],
  [/^snowcat-core\/(.+)$/, path.join(PACKAGES, 'snowcat-core', '$1')],
  [/^snowcat-onebot$/, path.join(PACKAGES, 'snowcat-onebot', 'index.ts')],
  [/^snowcat-onebot\/(.+)$/, path.join(PACKAGES, 'snowcat-onebot', '$1')],
  [/^snowcat-common$/, path.join(PACKAGES, 'snowcat-common', 'src', 'index.ts')],
  [/^snowcat-common\/src\/(.+)$/, path.join(PACKAGES, 'snowcat-common', 'src', '$1')],
  [/^snowcat-webui-backend$/, path.join(PACKAGES, 'snowcat-test', 'shims', 'webui-backend-index.ts')],
  [/^snowcat-webui-backend\/index$/, path.join(PACKAGES, 'snowcat-test', 'shims', 'webui-backend-index.ts')],
  [/^snowcat-webui-backend\/(.+)$/, path.join(PACKAGES, 'snowcat-webui-backend', '$1')],
  [/^snowcat-image-size$/, path.join(PACKAGES, 'snowcat-image-size', 'src', 'index.ts')],
  [/^@\/snowcat-image-size\/(.+)$/, path.join(PACKAGES, 'snowcat-image-size', '$1')],
  [/^snowcat-protobuf$/, path.join(PACKAGES, 'snowcat-protobuf', 'NapProto.ts')],
  [/^@\/snowcat-core\/(.+)$/, path.join(PACKAGES, 'snowcat-core', '$1')],
  [/^@\/snowcat-onebot\/(.+)$/, path.join(PACKAGES, 'snowcat-onebot', '$1')],
  [/^@\/snowcat-common\/(.+)$/, path.join(PACKAGES, 'snowcat-common', '$1')],
  [/^@\/snowcat-webui-backend\/(.+)$/, path.join(PACKAGES, 'snowcat-webui-backend', '$1')],
  [/^snowcat-pty$/, path.join(PACKAGES, 'snowcat-pty', 'index.ts')],
  [/^@\/snowcat-(.+)$/, path.join(PACKAGES, 'snowcat-$1')],
];

function tryAlias (specifier) {
  for (const entry of ALIAS_TABLE) {
    const m = specifier.match(entry[0]);
    if (m) {
      let resolved = entry[1].replace(/\$(\d)/g, (_, d) => m[Number(d)]);
      if (!path.extname(resolved)) {
        if (existsSync(path.join(resolved, 'index.ts'))) {
          resolved = path.join(resolved, 'index.ts');
        } else if (existsSync(resolved + '.ts')) {
          resolved += '.ts';
        }
      }
      if (existsSync(resolved)) return resolved;
    }
  }
  return null;
}

export function resolve (specifier, context, nextResolve) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
    return nextResolve(specifier, context);
  }
  const aliased = tryAlias(specifier);
  if (aliased) {
    return { url: pathToFileURL(aliased).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
