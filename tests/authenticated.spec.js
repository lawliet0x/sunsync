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
      !accounts.length,
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
