import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../src/data/demoSnapshot.js";

const upload = (name, value) => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });

test("async snapshot and comparison imports complete without detached React event errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Choose KingIdentity JSON snapshot").setInputFiles(upload("audit-import.json", demoSnapshot));
  await expect(page.getByTitle("audit-import.json")).toBeVisible();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByLabel("Choose earlier KingIdentity snapshot").setInputFiles(upload("baseline.json", demoSnapshot));
  await expect(page.getByText(/Comparing current capture/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "AD DS principals" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("invalid metadata is rejected and imported markup is rendered as text", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const bad = structuredClone(demoSnapshot);
  bad.forest.name = { bad: "render" };
  await page.getByLabel("Choose KingIdentity JSON snapshot").setInputFiles(upload("bad.json", bad));
  await expect(page.getByText("The snapshot contains invalid forest or collector metadata.")).toBeVisible();
  const safe = structuredClone(demoSnapshot);
  const markup = '<img src=x onerror="alert(1)">';
  safe.domains[0].principals[0].accountName = markup;
  await page.getByLabel("Choose KingIdentity JSON snapshot").setInputFiles(upload("text-only.json", safe));
  await expect(page.getByTitle("text-only.json")).toBeVisible();
  await page.getByRole("button", { name: "Directory", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp("img src=x") })).toBeVisible();
  await expect(page.locator(".directory-table img")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("production authentication redirect serves its own bridge without mounting the dashboard", async ({ page }) => {
  const response = await page.goto("/redirect.html");
  expect(response.status()).toBe(200);
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#root")).toHaveCount(0);
  await expect(page.locator('script[type="module"][src*="redirect-"]')).toHaveCount(1);
});

test("large directory imports page rows and reset paging when searched", async ({ page }) => {
  const snapshot = structuredClone(demoSnapshot);
  const base = snapshot.domains[0].principals[0];
  snapshot.domains = [{ ...snapshot.domains[0], privilegedGroups: [], principals: Array.from({ length: 250 }, (_, index) => ({ ...base, accountName: `fixture-${index}`, objectGuid: `fixture-guid-${index}`, objectSid: `fixture-sid-${index}` })) }];
  await page.goto("/");
  await page.getByLabel("Choose KingIdentity JSON snapshot").setInputFiles(upload("large.json", snapshot));
  await expect(page.getByTitle("large.json")).toBeVisible();
  await page.getByRole("button", { name: "Directory", exact: true }).click();
  await expect(page.locator(".directory-table tbody > tr")).toHaveCount(100);
  await page.getByRole("button", { name: "Next accounts" }).click();
  await expect(page.getByRole("button", { name: /^fixture-100 / })).toBeVisible();
  await page.getByLabel("Search directory principals").fill("fixture-249");
  await expect(page.locator(".directory-table tbody > tr")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^fixture-249 / })).toBeVisible();
});

test("clearing cloud evidence cancels an in-flight mocked collection and prevents stale records from returning", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/assets/dist-*.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export class InteractionRequiredAuthError extends Error {}
    export class PublicClientApplication {
      async initialize() {}
      async loginPopup() { return { account: { tenantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } }; }
      async acquireTokenSilent() { return { accessToken: "synthetic-browser-test-token" }; }
    }
  ` }));
  let graphRequests = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route("https://graph.microsoft.com/v1.0/**", async (route) => {
    graphRequests++;
    await pending;
    await route.fulfill({ json: { value: [{ id: "stale-cloud-row", displayName: "Stale evidence", groupTypes: [] }] } }).catch(() => {});
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await page.getByLabel("Tenant ID or verified tenant domain").fill("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    await page.getByLabel("Application (client) ID").fill("11111111-2222-4333-8444-555555555555");
    await page.getByRole("button", { name: "Sign in and collect selected evidence" }).click();
    await expect.poll(() => graphRequests).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Clear collected cloud data" }).click();
    release();
    await expect(page.getByRole("button", { name: "Sign in and collect selected evidence" })).toBeEnabled();
    await expect(page.locator(".source-status-row").filter({ hasText: "Microsoft Entra ID" })).toContainText("Not collected");
    await expect(page.getByText("Stale evidence", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { release(); }
});
