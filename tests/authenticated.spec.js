import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const accounts = process.env.DEMO_CREDENTIALS_FILE
  ? JSON.parse(readFileSync(process.env.DEMO_CREDENTIALS_FILE, "utf8"))
  : [];
const pages = {
  resident: [
    "Overview",
    "My consumption",
    "My solar credits",
    "My savings",
    "Community",
    "Notifications",
    "Profile & settings",
  ],
  society: [
    "Overview",
    "Solar monitoring",
    "Energy allocation",
    "Residents & buildings",
    "Installations",
    "Society analytics",
    "Notifications",
    "Society settings",
  ],
  system: [
    "Platform overview",
    "Societies",
    "Approvals",
    "Platform health",
    "Plans & limits",
    "Audit & security",
    "Platform settings",
  ],
};
for (const role of Object.keys(pages)) {
  test(`${role} authenticated pages, session restore, role guard and logout`, async ({
    page,
    isMobile,
  }) => {
    test.skip(
      !accounts.some((a) => a.role === role),
      "Provide a separate private DEMO_CREDENTIALS_FILE to run hosted authentication tests.",
    );
    test.setTimeout(90000);
    const account = accounts.find((a) => a.role === role);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/#/login/" + role);
    await page.getByLabel("Email address", { exact: true }).fill(account.email);
    await page.getByLabel(/^Password/).fill(account.password);
    await page
      .locator("form")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Refresh records", exact: true }),
    ).toBeVisible();
    for (const name of pages[role]) {
      if (isMobile)
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      await page
        .locator("nav")
        .getByRole("button", { name, exact: true })
        .click();
      await expect(
        page.locator("main").getByRole("heading", { name, exact: true, level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Refresh records", exact: true }),
      ).toBeEnabled();
      await expect(page.locator(".form-error")).toHaveCount(0);
    }
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Refresh records", exact: true }),
    ).toBeVisible();
    const other = role === "system" ? "resident" : "system";
    await page.goto("/#/workspace/" + other);
    // Default pages intentionally expose read-only public sources to signed-in users.
    const publicWorkspace = page.getByRole("region", {
      name: "Public-source workspace",
      exact: true,
    });
    await expect(publicWorkspace).toBeVisible();
    await expect(
      publicWorkspace.getByText("REAL PUBLIC-SOURCE RECORDS · READ ONLY", { exact: true }),
    ).toBeVisible();
    await expect(
      publicWorkspace.getByRole("button", { name: "Refresh public data", exact: true }),
    ).toBeEnabled();
    await expect(publicWorkspace.getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Refresh records", exact: true }),
    ).toHaveCount(0);
    // Verify denial on an operational-only page, not the public default page.
    if (isMobile)
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.locator("nav").getByRole("button", {
      name: other === "system" ? "Approvals" : "My solar credits",
      exact: true,
    }).click();
    await expect(
      page.getByRole("heading", {
        name: "Workspace access not assigned",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/#/workspace/" + role);
    await expect(
      page.getByRole("button", { name: "Refresh records", exact: true }),
    ).toBeVisible();
    if (isMobile)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    await page.goto("/#/workspace/" + role);
    await expect(
      page.getByRole("heading", { name: "Sign-in required", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
