import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = path.join(root, ".tmp", "music-api-managed-log-redaction");
const classes = path.join(scratch, "classes");
const mainClasses = path.join(root, "out", "classes");
const javaHome = [
  "C:\\Program Files\\Java\\jdk-17",
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean).find((candidate) => existsSync(path.join(candidate, "bin", "javac.exe")));
const javac = javaHome ? path.join(javaHome, "bin", "javac.exe") : "javac";
const java = javaHome ? path.join(javaHome, "bin", "java.exe") : "java";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });
try {
  run(javac, [
    "-encoding", "UTF-8",
    "--release", "17",
    "-cp", mainClasses,
    "-d", classes,
    path.join(root, "src", "test", "java", "com", "femonster", "music", "MusicApiManagedLogRedactionProbe.java")
  ]);
  console.log(run(java, [
    "-cp", `${classes}${path.delimiter}${mainClasses}`,
    "com.femonster.music.MusicApiManagedLogRedactionProbe"
  ]));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
