import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSnapshotText } from "../src/domain/snapshot.js";

test("real collector script runs against mocked AD cmdlets, retains foreign member IDs, and refuses overwrites", (t) => {
  const shell = process.env.KINGIDENTITY_PWSH || "pwsh";
  const available = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"], { encoding: "utf8" });
  if (available.error?.code === "ENOENT") return t.skip("PowerShell 7 is not installed; collector mock check requires pwsh.");
  assert.equal(available.status, 0, available.stderr);
  const directory = mkdtempSync(join(tmpdir(), "kingidentity-collector-"));
  try {
    const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./collector.mock.ps1", import.meta.url)), "-CollectorPath", fileURLToPath(new URL("../collectors/Collect-ADDS.ps1", import.meta.url)), "-TestDirectory", directory], { encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, /Collector mock check passed/);
    const snapshot = parseSnapshotText(readFileSync(join(directory, "snapshot.json"), "utf8"));
    assert.equal(snapshot.domains[0].principals.length, 2);
    assert.equal(snapshot.domains[0].principals.find((row) => row.objectClass === "computer").isDomainController, true);
    assert.equal(snapshot.collectionWarnings.length, 0);
    assert.equal(snapshot.domains[0].privilegedGroups[0].members[0].enabled, null);
    assert.equal(snapshot.domains[0].privilegedGroups[0].members[0].objectGuid, "33333333-3333-4333-8333-333333333333");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
