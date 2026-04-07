/**
 * Test Script: Verify Stats API Data Accuracy
 * 
 * This script creates test sessions via the API and verifies that the stats endpoint
 * returns accurate calculations for:
 * - totalMinutes (sum of focus_minutes)
 * - sessions (count of completed sessions)
 * - taskCompletionRate (completed tasks / total sessions)
 * 
 * Prerequisites: Server must be running (npm run dev)
 * Run with: npx ts-node test-stats-api.ts
 */

import { randomUUID } from "crypto";

const BASE_URL = "http://localhost:3000";

interface TestSession {
  variant: "sprint" | "classic" | "deep_work" | "flow" | "custom";
  focusMinutes: number;
  taskStatus: "completed" | "carried" | "none";
}

async function makeRequest(
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  console.log("🧪 Starting Stats API Accuracy Test\n");

  // Step 1: Create a test user and login
  console.log("📝 Step 1: Creating test user and logging in...");
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "TestPassword123!";

  try {
    await makeRequest("POST", "/api/v1/auth/signup", undefined, {
      email: testEmail,
      password: testPassword,
      name: "Test User",
    });
    console.log(`✅ Created test user: ${testEmail}`);
  } catch (error: any) {
    console.log(`⚠️  Signup failed (user may exist): ${error.message}`);
  }

  const loginResponse = await makeRequest("POST", "/api/v1/auth/login", undefined, {
    email: testEmail,
    password: testPassword,
  });

  const token = loginResponse.token;
  console.log(`✅ Logged in successfully`);

  // Step 2: Define test sessions with known values
  const testSessions: TestSession[] = [
    { variant: "sprint", focusMinutes: 25, taskStatus: "completed" },
    { variant: "classic", focusMinutes: 25, taskStatus: "completed" },
    { variant: "deep_work", focusMinutes: 50, taskStatus: "carried" },
    { variant: "flow", focusMinutes: 25, taskStatus: "none" },
    { variant: "custom", focusMinutes: 30, taskStatus: "completed" },
  ];

  // Calculate expected values
  const expectedTotalMinutes = testSessions.reduce((sum, s) => sum + s.focusMinutes, 0);
  const expectedSessionCount = testSessions.length;
  const expectedCompletedTasks = testSessions.filter(s => s.taskStatus === "completed").length;
  const expectedTaskCompletionRate = expectedCompletedTasks / expectedSessionCount;

  console.log("\n📊 Expected Values:");
  console.log(`  Total Minutes: ${expectedTotalMinutes}`);
  console.log(`  Session Count: ${expectedSessionCount}`);
  console.log(`  Completed Tasks: ${expectedCompletedTasks}`);
  console.log(`  Task Completion Rate: ${expectedTaskCompletionRate.toFixed(4)} (${(expectedTaskCompletionRate * 100).toFixed(2)}%)`);

  // Step 3: Create test sessions via API
  console.log("\n📝 Step 2: Creating test sessions via POST /api/v1/sessions...");
  for (const session of testSessions) {
    await makeRequest("POST", "/api/v1/sessions", token, {
      variant: session.variant,
      focusMinutes: session.focusMinutes,
      taskStatus: session.taskStatus,
      clientSessionId: randomUUID(),
    });
  }
  console.log(`✅ Created ${testSessions.length} test sessions`);

  // Step 4: Query stats via API
  console.log("\n🔍 Step 3: Querying GET /api/v1/stats/summary...");
  const stats = await makeRequest("GET", "/api/v1/stats/summary", token);

  console.log("\n📈 Actual Values from API:");
  console.log(`  Total Minutes: ${stats.totalMinutes}`);
  console.log(`  Session Count: ${stats.sessions}`);
  console.log(`  Trees Completed: ${stats.treesCompleted}`);
  console.log(`  Task Completion Rate: ${stats.taskCompletionRate.toFixed(4)} (${(stats.taskCompletionRate * 100).toFixed(2)}%)`);

  // Step 5: Verify calculations
  console.log("\n✅ Verification Results:");
  
  let allPassed = true;

  if (stats.totalMinutes === expectedTotalMinutes) {
    console.log(`  ✓ Total Minutes: PASS (${stats.totalMinutes} === ${expectedTotalMinutes})`);
  } else {
    console.log(`  ✗ Total Minutes: FAIL (${stats.totalMinutes} !== ${expectedTotalMinutes})`);
    allPassed = false;
  }

  if (stats.sessions === expectedSessionCount) {
    console.log(`  ✓ Session Count: PASS (${stats.sessions} === ${expectedSessionCount})`);
  } else {
    console.log(`  ✗ Session Count: FAIL (${stats.sessions} !== ${expectedSessionCount})`);
    allPassed = false;
  }

  // Calculate completed tasks from the rate
  const actualCompletedTasks = Math.round(stats.taskCompletionRate * stats.sessions);
  if (actualCompletedTasks === expectedCompletedTasks) {
    console.log(`  ✓ Completed Tasks: PASS (${actualCompletedTasks} === ${expectedCompletedTasks})`);
  } else {
    console.log(`  ✗ Completed Tasks: FAIL (${actualCompletedTasks} !== ${expectedCompletedTasks})`);
    allPassed = false;
  }

  if (Math.abs(stats.taskCompletionRate - expectedTaskCompletionRate) < 0.0001) {
    console.log(`  ✓ Task Completion Rate: PASS (${stats.taskCompletionRate.toFixed(4)} === ${expectedTaskCompletionRate.toFixed(4)})`);
  } else {
    console.log(`  ✗ Task Completion Rate: FAIL (${stats.taskCompletionRate.toFixed(4)} !== ${expectedTaskCompletionRate.toFixed(4)})`);
    allPassed = false;
  }

  // Step 6: Test edge case - verify only completed sessions are counted
  console.log("\n🧪 Step 4: Testing Edge Case - Abandoned Sessions");
  console.log("Creating an abandoned session (should not affect stats)...");
  
  // Start a session
  const startResponse = await makeRequest("POST", "/api/v1/sessions/start", token, {
    variant: "sprint",
    focusMinutes: 100,
    clientSessionId: randomUUID(),
  });
  
  // Abandon it
  await makeRequest("POST", `/api/v1/sessions/${startResponse.sessionId}/abandon`, token);
  console.log("✅ Created and abandoned a session");

  // Query stats again
  const statsAfterAbandoned = await makeRequest("GET", "/api/v1/stats/summary", token);

  if (statsAfterAbandoned.totalMinutes === expectedTotalMinutes) {
    console.log(`  ✓ Abandoned sessions excluded: PASS (still ${expectedTotalMinutes} minutes)`);
  } else {
    console.log(`  ✗ Abandoned sessions excluded: FAIL (got ${statsAfterAbandoned.totalMinutes} instead of ${expectedTotalMinutes})`);
    allPassed = false;
  }

  if (statsAfterAbandoned.sessions === expectedSessionCount) {
    console.log(`  ✓ Session count unchanged: PASS (still ${expectedSessionCount} sessions)`);
  } else {
    console.log(`  ✗ Session count changed: FAIL (got ${statsAfterAbandoned.sessions} instead of ${expectedSessionCount})`);
    allPassed = false;
  }

  // Final result
  console.log("\n" + "=".repeat(50));
  if (allPassed) {
    console.log("🎉 ALL TESTS PASSED - Stats calculations are accurate!");
    console.log("\n✅ Task 4.2 Complete: Data accuracy verified");
  } else {
    console.log("❌ SOME TESTS FAILED - Review the results above");
    process.exit(1);
  }
  console.log("=".repeat(50) + "\n");
}

main().catch((error) => {
  console.error("❌ Test failed with error:", error);
  process.exit(1);
});
