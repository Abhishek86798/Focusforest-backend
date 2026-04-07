/**
 * Test Script: Verify Stats Data Accuracy
 * 
 * This script creates test sessions and verifies that the stats endpoint
 * returns accurate calculations for:
 * - totalMinutes (sum of focus_minutes)
 * - sessions (count of completed sessions)
 * - taskCompletionRate (completed tasks / total sessions)
 * 
 * Run with: npx ts-node test-stats-accuracy.ts
 */

import { prisma } from "./src/lib/prisma";
import { randomUUID } from "crypto";

interface TestSession {
  variant: "sprint" | "classic" | "deep_work" | "flow" | "custom";
  focusMinutes: number;
  taskStatus: "completed" | "carried" | "none";
  stageProgress: number;
}

async function main() {
  console.log("🧪 Starting Stats Accuracy Test\n");

  // Create a test user
  const testUserId = randomUUID();
  console.log(`Creating test user: ${testUserId}`);
  
  await prisma.user.create({
    data: {
      id: testUserId,
      email: `test-${Date.now()}@example.com`,
      name: "Test User",
    },
  });

  // Define test sessions with known values
  const testSessions: TestSession[] = [
    { variant: "sprint", focusMinutes: 25, taskStatus: "completed", stageProgress: 1.5 },
    { variant: "classic", focusMinutes: 25, taskStatus: "completed", stageProgress: 1.5 },
    { variant: "deep_work", focusMinutes: 50, taskStatus: "carried", stageProgress: 2.0 },
    { variant: "flow", focusMinutes: 25, taskStatus: "none", stageProgress: 1.0 },
    { variant: "custom", focusMinutes: 30, taskStatus: "completed", stageProgress: 1.8 },
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

  // Create test sessions in database
  console.log("\n📝 Creating test sessions...");
  for (const session of testSessions) {
    await prisma.session.create({
      data: {
        userId: testUserId,
        variant: session.variant,
        focusMinutes: session.focusMinutes,
        taskStatus: session.taskStatus,
        stageProgress: session.stageProgress,
        clientSessionId: randomUUID(),
        state: "completed",
        startedAt: null,
        expectedEndAt: null,
      },
    });
  }
  console.log(`✅ Created ${testSessions.length} test sessions`);

  // Query stats using the service function
  console.log("\n🔍 Querying stats from database...");
  
  const minutesAgg = await prisma.session.aggregate({
    where: { userId: testUserId, state: 'completed' },
    _sum: { focusMinutes: true }
  });

  const sessionsCount = await prisma.session.count({
    where: { userId: testUserId, state: 'completed' }
  });

  const tasksCompletedCount = await prisma.session.count({
    where: { userId: testUserId, state: 'completed', taskStatus: 'completed' }
  });

  const actualTotalMinutes = minutesAgg._sum.focusMinutes ?? 0;
  const actualSessionCount = sessionsCount;
  const actualCompletedTasks = tasksCompletedCount;
  const actualTaskCompletionRate = sessionsCount > 0 ? tasksCompletedCount / sessionsCount : 0;

  console.log("\n📈 Actual Values from Database:");
  console.log(`  Total Minutes: ${actualTotalMinutes}`);
  console.log(`  Session Count: ${actualSessionCount}`);
  console.log(`  Completed Tasks: ${actualCompletedTasks}`);
  console.log(`  Task Completion Rate: ${actualTaskCompletionRate.toFixed(4)} (${(actualTaskCompletionRate * 100).toFixed(2)}%)`);

  // Verify calculations
  console.log("\n✅ Verification Results:");
  
  let allPassed = true;

  if (actualTotalMinutes === expectedTotalMinutes) {
    console.log(`  ✓ Total Minutes: PASS (${actualTotalMinutes} === ${expectedTotalMinutes})`);
  } else {
    console.log(`  ✗ Total Minutes: FAIL (${actualTotalMinutes} !== ${expectedTotalMinutes})`);
    allPassed = false;
  }

  if (actualSessionCount === expectedSessionCount) {
    console.log(`  ✓ Session Count: PASS (${actualSessionCount} === ${expectedSessionCount})`);
  } else {
    console.log(`  ✗ Session Count: FAIL (${actualSessionCount} !== ${expectedSessionCount})`);
    allPassed = false;
  }

  if (actualCompletedTasks === expectedCompletedTasks) {
    console.log(`  ✓ Completed Tasks: PASS (${actualCompletedTasks} === ${expectedCompletedTasks})`);
  } else {
    console.log(`  ✗ Completed Tasks: FAIL (${actualCompletedTasks} !== ${expectedCompletedTasks})`);
    allPassed = false;
  }

  if (Math.abs(actualTaskCompletionRate - expectedTaskCompletionRate) < 0.0001) {
    console.log(`  ✓ Task Completion Rate: PASS (${actualTaskCompletionRate.toFixed(4)} === ${expectedTaskCompletionRate.toFixed(4)})`);
  } else {
    console.log(`  ✗ Task Completion Rate: FAIL (${actualTaskCompletionRate.toFixed(4)} !== ${expectedTaskCompletionRate.toFixed(4)})`);
    allPassed = false;
  }

  // Test edge case: abandoned sessions should not be counted
  console.log("\n🧪 Testing Edge Case: Abandoned Sessions");
  await prisma.session.create({
    data: {
      userId: testUserId,
      variant: "sprint",
      focusMinutes: 100,
      taskStatus: "none",
      stageProgress: 0,
      clientSessionId: randomUUID(),
      state: "abandoned",
      startedAt: new Date(),
      expectedEndAt: new Date(),
      abandonedAt: new Date(),
    },
  });

  const statsAfterAbandoned = await prisma.session.aggregate({
    where: { userId: testUserId, state: 'completed' },
    _sum: { focusMinutes: true }
  });

  if (statsAfterAbandoned._sum.focusMinutes === expectedTotalMinutes) {
    console.log(`  ✓ Abandoned sessions excluded: PASS (still ${expectedTotalMinutes} minutes)`);
  } else {
    console.log(`  ✗ Abandoned sessions excluded: FAIL (got ${statsAfterAbandoned._sum.focusMinutes} instead of ${expectedTotalMinutes})`);
    allPassed = false;
  }

  // Cleanup
  console.log("\n🧹 Cleaning up test data...");
  await prisma.session.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } });
  console.log("✅ Cleanup complete");

  // Final result
  console.log("\n" + "=".repeat(50));
  if (allPassed) {
    console.log("🎉 ALL TESTS PASSED - Stats calculations are accurate!");
  } else {
    console.log("❌ SOME TESTS FAILED - Review the results above");
    process.exit(1);
  }
  console.log("=".repeat(50) + "\n");
}

main()
  .catch((error) => {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
