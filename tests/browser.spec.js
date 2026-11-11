import { test, expect } from "@playwright/test";
test("landing, role selection, registration and unsigned workspaces", async ({
  page,
}) => {
  const failures = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A little sunshine/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  for (const name of ["Resident", "Society Admin", "System Administrator"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Create resident / applicant account" })
    .click();
  await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
  for (const role of ["resident", "society", "system"]) {
    await page.goto("/#/workspace/" + role);
    await expect(
      page.getByRole("heading", { name: "Sign-in required" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh records" }),
    ).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});
test("password recovery UI does not expose account existence", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Recover your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

test("Mira Bhayandar reference navigation is available in each role and requires sign-in", async ({
  page,
}) => {
  for (const role of ["resident", "society", "system"]) {
    await page.goto("/#/workspace/" + role);
    const menu = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    if (await menu.isVisible()) await menu.click();
    await page
      .getByRole("button", { name: "Mira Bhayandar reference", exact: true })
      .click();
    await expect(
      page.getByText("Sign in to view the reference database.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("809,378", { exact: true })).toHaveCount(0);
  }
});
