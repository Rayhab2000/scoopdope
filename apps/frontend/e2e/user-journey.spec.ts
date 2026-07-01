import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3000';

/**
 * Slug / title used for the deterministic seed course created in beforeAll.
 * Using a fixed title lets all assertions target a known, stable course rather
 * than whatever happens to be first in the catalogue.
 */
const SEED_COURSE_TITLE = 'E2E Seed Course — Stellar Basics';
const SEED_LESSON_TITLE = 'Lesson 1 — Introduction';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueUser() {
  const ts = Date.now();
  return {
    username: `e2euser_${ts}`,
    email: `e2euser_${ts}@example.com`,
    password: 'Test@1234!',
  };
}

/**
 * Registers a new user via the UI and logs them in.
 * Returns once the user is on an authenticated page (dashboard or courses).
 */
async function registerAndLogin(page: Page, user: ReturnType<typeof uniqueUser>) {
  await page.goto('/auth/register');
  await page.getByLabel(/username/i).fill(user.username);
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/^password$/i).fill(user.password);
  await page.getByRole('button', { name: /register|sign up|create account/i }).click();

  if (page.url().includes('login')) {
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/^password$/i).fill(user.password);
    await page.getByRole('button', { name: /log in|sign in/i }).click();
  }

  await expect(page).not.toHaveURL(/login|register/, { timeout: 10_000 });
}

/**
 * Obtains a JWT token for an admin/seeder account via the API.
 * Falls back to an env-provided token to avoid hard-coding credentials.
 */
async function getAdminToken(apiContext: APIRequestContext): Promise<string | null> {
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) return null;

  const res = await apiContext.post(`${API_BASE}/v1/auth/login`, {
    data: { email: adminEmail, password: adminPassword },
  });

  if (!res.ok()) return null;

  const body = await res.json();
  return body.access_token ?? body.token ?? null;
}

// ---------------------------------------------------------------------------
// Shared state populated by beforeAll
// ---------------------------------------------------------------------------

let seedCourseId: string | number | null = null;
let seedLessonId: string | number | null = null;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Critical user journey: register → enroll → complete lesson', () => {
  /**
   * beforeAll: create (or discover) the deterministic seed course so every
   * test in this suite targets the same known course rather than relying on
   * whatever happens to appear first in the catalogue.
   *
   * Strategy:
   *  1. If E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD are set, create the course via
   *     the API and record its id.
   *  2. Otherwise fall back to course id=1 (suitable for local dev with
   *     pre-seeded data) and log a warning.
   */
  test.beforeAll(async () => {
    const apiContext = await request.newContext();
    const token = await getAdminToken(apiContext);

    if (token) {
      // Create a course
      const courseRes = await apiContext.post(`${API_BASE}/v1/courses`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: SEED_COURSE_TITLE,
          description: 'Deterministic seed course for E2E tests.',
          published: true,
        },
      });

      if (courseRes.ok()) {
        const course = await courseRes.json();
        seedCourseId = course.id;

        // Create a lesson inside that course
        const lessonRes = await apiContext.post(
          `${API_BASE}/v1/courses/${seedCourseId}/lessons`,
          {
            headers: { Authorization: `Bearer ${token}` },
            data: {
              title: SEED_LESSON_TITLE,
              content: 'Introduction to the Stellar blockchain.',
              order: 1,
            },
          },
        );

        if (lessonRes.ok()) {
          const lesson = await lessonRes.json();
          seedLessonId = lesson.id;
        }
      }
    }

    // Fallback for local dev without admin credentials
    if (!seedCourseId) {
      console.warn(
        '[E2E] No E2E_ADMIN_EMAIL/PASSWORD set — falling back to course id=1. ' +
          'Set these env vars to enable full fixture seeding.',
      );
      seedCourseId = 1;
    }

    await apiContext.dispose();
  });

  /**
   * afterAll: delete the seed course created in beforeAll so tests are
   * idempotent across runs. Skipped when falling back to id=1.
   */
  test.afterAll(async () => {
    if (!seedCourseId || seedCourseId === 1) return;

    const apiContext = await request.newContext();
    const token = await getAdminToken(apiContext);

    if (token) {
      await apiContext.delete(`${API_BASE}/v1/courses/${seedCourseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    await apiContext.dispose();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1 — Registration and authentication
  // ─────────────────────────────────────────────────────────────────────────

  test('user can register and log in', async ({ page }) => {
    const user = uniqueUser();

    await page.goto('/auth/register');
    await page.getByLabel(/username/i).fill(user.username);
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/^password$/i).fill(user.password);
    await page.getByRole('button', { name: /register|sign up|create account/i }).click();

    // Should redirect away from the register page
    await expect(page).toHaveURL(/login|dashboard|courses/, { timeout: 10_000 });

    if (page.url().includes('login')) {
      await page.getByLabel(/email/i).fill(user.email);
      await page.getByLabel(/^password$/i).fill(user.password);
      await page.getByRole('button', { name: /log in|sign in/i }).click();
    }

    // Must end up on an authenticated page
    await expect(page).not.toHaveURL(/login|register/, { timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2 — Course catalogue
  // ─────────────────────────────────────────────────────────────────────────

  test('authenticated user can browse the course catalogue', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/courses');

    // Page must have a visible heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8_000 });

    // At least one course card or link must be present
    const courseItems = page.locator(
      '[data-testid="course-card"], [data-testid="course-item"], .course-card',
    );
    const courseLinks = page.getByRole('link', { name: /view course|enroll|start/i });

    const hasCards = await courseItems.first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasLinks = await courseLinks.first().isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasCards || hasLinks).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3 — Course enrollment
  // ─────────────────────────────────────────────────────────────────────────

  test('user can enroll in the seed course and land on the course page', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    // Navigate directly to the seed course
    await page.goto(`/courses/${seedCourseId}`);
    await expect(page).toHaveURL(new RegExp(`courses/${seedCourseId}`), { timeout: 8_000 });

    // Course title or content heading must be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8_000 });

    // Enroll button must be present
    const enrollBtn = page.getByRole('button', { name: /enroll/i });
    await expect(enrollBtn).toBeVisible({ timeout: 8_000 });
    await enrollBtn.click();

    // Enrollment confirmation feedback
    await expect(
      page.getByText(/enrolled|you are enrolled|enrollment confirmed/i),
    ).toBeVisible({ timeout: 10_000 });

    // After enrollment, course content (lessons) should become accessible
    const lessonLink = page
      .getByRole('link', { name: /lesson|start|begin/i })
      .first();
    await expect(lessonLink).toBeVisible({ timeout: 8_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4 — Lesson navigation
  // ─────────────────────────────────────────────────────────────────────────

  test('enrolled user can navigate to the first lesson', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    // Enroll first (repeat from fixture — each test is independent)
    await page.goto(`/courses/${seedCourseId}`);
    const enrollBtn = page.getByRole('button', { name: /enroll/i });
    if (await enrollBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await enrollBtn.click();
      await expect(
        page.getByText(/enrolled|enrollment confirmed/i),
      ).toBeVisible({ timeout: 10_000 });
    }

    // Click through to the first lesson
    const lessonLink = page
      .getByRole('link', { name: /lesson|start|begin/i })
      .first();
    await expect(lessonLink).toBeVisible({ timeout: 8_000 });
    await lessonLink.click();

    // URL must contain "lesson"
    await expect(page).toHaveURL(/lesson/, { timeout: 8_000 });

    // Lesson heading or content must be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5 — Mark lesson complete + progress update
  // ─────────────────────────────────────────────────────────────────────────

  test('user can mark a lesson complete and progress is updated', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    // Enroll
    await page.goto(`/courses/${seedCourseId}`);
    const enrollBtn = page.getByRole('button', { name: /enroll/i });
    if (await enrollBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await enrollBtn.click();
      await expect(
        page.getByText(/enrolled|enrollment confirmed/i),
      ).toBeVisible({ timeout: 10_000 });
    }

    // Capture progress percentage before completing the lesson, if shown
    const progressLocator = page.locator(
      '[data-testid="progress-bar"], [aria-label*="progress"], [role="progressbar"]',
    ).first();
    const progressBefore = await progressLocator
      .getAttribute('aria-valuenow')
      .catch(() => null);

    // Navigate to first lesson
    const lessonLink = page
      .getByRole('link', { name: /lesson|start|begin/i })
      .first();
    await expect(lessonLink).toBeVisible({ timeout: 8_000 });
    await lessonLink.click();
    await expect(page).toHaveURL(/lesson/, { timeout: 8_000 });

    // Mark complete
    const completeBtn = page.getByRole('button', {
      name: /mark (as )?complete|complete lesson/i,
    });
    await expect(completeBtn).toBeVisible({ timeout: 8_000 });
    await completeBtn.click();

    // Completion feedback must appear
    await expect(
      page.getByText(/completed|lesson complete|well done|progress saved/i),
    ).toBeVisible({ timeout: 10_000 });

    // Navigate back to the course page to verify progress update
    await page.goto(`/courses/${seedCourseId}`);

    // Progress bar or percentage text should reflect the completion
    const progressAfterText = page.getByText(/\d+\s*%|1\s*\/\s*\d+\s*lesson/i);
    const progressAfterBar = page.locator(
      '[data-testid="progress-bar"], [aria-label*="progress"], [role="progressbar"]',
    ).first();

    const hasProgressText = await progressAfterText
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);
    const hasProgressBar = await progressAfterBar
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // At least one progress indicator must be visible
    expect(hasProgressText || hasProgressBar).toBe(true);

    // If the progress bar was measurable before and after, it must have increased
    if (progressBefore !== null && hasProgressBar) {
      const progressAfter = await progressAfterBar
        .getAttribute('aria-valuenow')
        .catch(() => null);
      if (progressAfter !== null) {
        expect(Number(progressAfter)).toBeGreaterThan(Number(progressBefore));
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6 — Full end-to-end journey (smoke test combining all steps)
  // ─────────────────────────────────────────────────────────────────────────

  test('full journey: register → browse → enroll → lesson → complete → progress', async ({
    page,
  }) => {
    const user = uniqueUser();

    // ── 1. Register & login ───────────────────────────────────────────────
    await registerAndLogin(page, user);

    // ── 2. Browse catalogue ───────────────────────────────────────────────
    await page.goto('/courses');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8_000 });

    // ── 3. Open the seed course ───────────────────────────────────────────
    await page.goto(`/courses/${seedCourseId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8_000 });

    // ── 4. Enroll ─────────────────────────────────────────────────────────
    const enrollBtn = page.getByRole('button', { name: /enroll/i });
    await expect(enrollBtn).toBeVisible({ timeout: 8_000 });
    await enrollBtn.click();
    await expect(
      page.getByText(/enrolled|you are enrolled|enrollment confirmed/i),
    ).toBeVisible({ timeout: 10_000 });

    // ── 5. Navigate to first lesson ───────────────────────────────────────
    const lessonLink = page
      .getByRole('link', { name: /lesson|start|begin/i })
      .first();
    await expect(lessonLink).toBeVisible({ timeout: 8_000 });
    await lessonLink.click();
    await expect(page).toHaveURL(/lesson/, { timeout: 8_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8_000 });

    // ── 6. Mark lesson complete ────────────────────────────────────────────
    const completeBtn = page.getByRole('button', {
      name: /mark (as )?complete|complete lesson/i,
    });
    await expect(completeBtn).toBeVisible({ timeout: 8_000 });
    await completeBtn.click();
    await expect(
      page.getByText(/completed|lesson complete|well done|progress saved/i),
    ).toBeVisible({ timeout: 10_000 });

    // ── 7. Verify progress on course page ─────────────────────────────────
    await page.goto(`/courses/${seedCourseId}`);

    const hasProgress = await page
      .getByText(/\d+\s*%|1\s*\/\s*\d+\s*lesson/i)
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    const hasProgressBar = await page
      .locator('[data-testid="progress-bar"], [role="progressbar"]')
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    expect(hasProgress || hasProgressBar).toBe(true);

    // ── 8. Credential (staging only) ──────────────────────────────────────
    // Only assert credential issuance when running against a real backend.
    // Skip in unit/local mode where the Stellar network is not available.
    if (process.env.E2E_CHECK_CREDENTIALS === 'true') {
      await page.goto('/credentials');
      await expect(
        page.getByText(/intro to stellar|e2e seed|credential|certificate/i),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByText(/stellar|blockchain|on-chain|transaction/i),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
