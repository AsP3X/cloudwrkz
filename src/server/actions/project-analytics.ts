"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { canViewProject } from "./projects";

export type ProjectAnalytics = {
  progress: {
    overall: number;
    byMilestone: Array<{
      milestoneId: string;
      milestoneName: string;
      progress: number;
    }>;
    byStatus: Record<string, number>;
  };
  timeTracking: {
    totalPlanned: number; // hours
    totalActual: number; // hours
    byMember: Array<{
      userId: string;
      userName: string;
      planned: number;
      actual: number;
    }>;
    byTicket: Array<{
      ticketId: string;
      ticketNumber: string;
      ticketTitle: string;
      planned: number;
      actual: number;
    }>;
  };
  budget: {
    totalBudget: number;
    spent: number;
    remaining: number;
    burnRate: number; // per day
    forecasted: number; // forecasted completion cost
    byCategory: Array<{
      categoryId: string;
      categoryName: string;
      budgeted: number;
      spent: number;
    }>;
  };
  team: {
    totalMembers: number;
    activeMembers: number;
    workload: Array<{
      userId: string;
      userName: string;
      assignedTasks: number;
      completedTasks: number;
      timeSpent: number; // hours
      capacity: number; // hours per week (default 40)
    }>;
  };
  tickets: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    averageResolutionTime: number; // hours
    openTickets: number;
    resolvedTickets: number;
    createdTrend: Array<{
      date: string;
      count: number;
    }>;
  };
  risks: {
    total: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    critical: number;
  };
  issues: {
    total: number;
    open: number;
    resolved: number;
    byPriority: Record<string, number>;
  };
};

export async function getProjectAnalytics(projectId: string): Promise<ProjectAnalytics | null> {
  const user = await requireAuth();

  if (!(await canViewProject(user.id, projectId))) {
    return null;
  }

  // Get project with related data
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      budget: true,
      startDate: true,
      endDate: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  // Get milestones
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  // Get tasks
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: {
      id: true,
      status: true,
      assignedToId: true,
      estimatedHours: true,
      milestoneId: true,
      ticketId: true,
    },
  });

  // Get time entries
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      projectId,
      status: "COMPLETED",
    },
    select: {
      userId: true,
      ticketId: true,
      totalDuration: true,
    },
  });

  // Get tickets
  const tickets = await prisma.ticket.findMany({
    where: { projectId },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
      resolvedAt: true,
    },
  });

  // Get risks
  const risks = await prisma.projectRisk.findMany({
    where: { projectId },
    select: {
      id: true,
      severity: true,
      status: true,
    },
  });

  // Get issues
  const issues = await prisma.projectIssue.findMany({
    where: { projectId },
    select: {
      id: true,
      status: true,
      priority: true,
    },
  });

  // Get budget categories
  const budgetCategories = await prisma.budgetCategory.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      budgetedAmount: true,
      spentAmount: true,
    },
  });

  // Calculate progress
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED").length;
  const overallProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const progressByMilestone = milestones.map((milestone) => {
    const milestoneTasks = tasks.filter((t) => t.milestoneId === milestone.id);
    const completed = milestoneTasks.filter((t) => t.status === "COMPLETED").length;
    const progress = milestoneTasks.length > 0 ? (completed / milestoneTasks.length) * 100 : 0;
    return {
      milestoneId: milestone.id,
      milestoneName: milestone.name,
      progress,
    };
  });

  const progressByStatus: Record<string, number> = {};
  for (const task of tasks) {
    progressByStatus[task.status] = (progressByStatus[task.status] || 0) + 1;
  }

  // Calculate time tracking
  const totalPlanned = tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const totalActual = timeEntries.reduce((sum, e) => sum + e.totalDuration / 3600, 0);

  const timeByMember = new Map<string, { planned: number; actual: number }>();
  for (const task of tasks) {
    if (task.assignedToId) {
      const current = timeByMember.get(task.assignedToId) || { planned: 0, actual: 0 };
      current.planned += task.estimatedHours || 0;
      timeByMember.set(task.assignedToId, current);
    }
  }
  for (const entry of timeEntries) {
    const current = timeByMember.get(entry.userId) || { planned: 0, actual: 0 };
    current.actual += entry.totalDuration / 3600;
    timeByMember.set(entry.userId, current);
  }

  const timeByMemberArray = Array.from(timeByMember.entries()).map(([userId, data]) => {
    const member = project.members.find((m) => m.user.id === userId);
    return {
      userId,
      userName: member?.user.name || member?.user.email || "Unknown",
      planned: data.planned,
      actual: data.actual,
    };
  });

  const timeByTicket = new Map<string, { planned: number; actual: number; ticketNumber: string; ticketTitle: string }>();
  for (const task of tasks) {
    if (task.ticketId) {
      const ticket = tickets.find((t) => t.id === task.ticketId);
      if (ticket) {
        const current = timeByTicket.get(task.ticketId) || { planned: 0, actual: 0, ticketNumber: ticket.ticketNumber, ticketTitle: ticket.title };
        current.planned += task.estimatedHours || 0;
        timeByTicket.set(task.ticketId, current);
      }
    }
  }
  for (const entry of timeEntries) {
    if (entry.ticketId) {
      const current = timeByTicket.get(entry.ticketId);
      if (current) {
        current.actual += entry.totalDuration / 3600;
      }
    }
  }

  const timeByTicketArray = Array.from(timeByTicket.values());

  // Calculate budget
  const totalBudget = project.budget || 0;
  const spent = budgetCategories.reduce((sum, cat) => sum + cat.spentAmount, 0);
  const remaining = totalBudget - spent;

  // Calculate burn rate (spent per day)
  let burnRate = 0;
  if (project.startDate) {
    const daysSinceStart = Math.max(1, Math.floor((Date.now() - project.startDate.getTime()) / (1000 * 60 * 60 * 24)));
    burnRate = spent / daysSinceStart;
  }

  // Forecasted completion cost (simple linear projection)
  let forecasted = spent;
  if (totalPlanned > 0 && totalActual > 0) {
    const efficiency = totalActual / totalPlanned;
    const remainingPlanned = totalPlanned - totalActual;
    forecasted = spent + (remainingPlanned * efficiency * (totalBudget / totalPlanned));
  }

  const budgetByCategory = budgetCategories.map((cat) => ({
    categoryId: cat.id,
    categoryName: cat.name,
    budgeted: cat.budgetedAmount,
    spent: cat.spentAmount,
  }));

  // Calculate team metrics
  const totalMembers = project.members.length;
  const activeMembers = new Set(timeEntries.map((e) => e.userId)).size;

  const workload = project.members.map((member) => {
    const memberTasks = tasks.filter((t) => t.assignedToId === member.user.id);
    const completed = memberTasks.filter((t) => t.status === "COMPLETED").length;
    const memberTime = timeEntries
      .filter((e) => e.userId === member.user.id)
      .reduce((sum, e) => sum + e.totalDuration / 3600, 0);

    return {
      userId: member.user.id,
      userName: member.user.name || member.user.email,
      assignedTasks: memberTasks.length,
      completedTasks: completed,
      timeSpent: memberTime,
      capacity: 40, // Default 40 hours per week
    };
  });

  // Calculate ticket metrics
  const ticketByStatus: Record<string, number> = {};
  const ticketByPriority: Record<string, number> = {};
  let totalResolutionTime = 0;
  let resolvedCount = 0;

  for (const ticket of tickets) {
    ticketByStatus[ticket.status] = (ticketByStatus[ticket.status] || 0) + 1;
    ticketByPriority[ticket.priority] = (ticketByPriority[ticket.priority] || 0) + 1;

    if (ticket.resolvedAt && ticket.createdAt) {
      const resolutionTime = (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60 * 60);
      totalResolutionTime += resolutionTime;
      resolvedCount++;
    }
  }

  const averageResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0;

  // Ticket creation trend (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentTickets = tickets.filter((t) => t.createdAt >= thirtyDaysAgo);
  const createdTrend: Record<string, number> = {};
  for (const ticket of recentTickets) {
    const date = ticket.createdAt.toISOString().split("T")[0];
    createdTrend[date] = (createdTrend[date] || 0) + 1;
  }

  const createdTrendArray = Object.entries(createdTrend)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate risk metrics
  const riskBySeverity: Record<string, number> = {};
  const riskByStatus: Record<string, number> = {};
  let criticalRisks = 0;

  for (const risk of risks) {
    riskBySeverity[risk.severity] = (riskBySeverity[risk.severity] || 0) + 1;
    riskByStatus[risk.status] = (riskByStatus[risk.status] || 0) + 1;
    if (risk.severity === "CRITICAL") {
      criticalRisks++;
    }
  }

  // Calculate issue metrics
  const issueByPriority: Record<string, number> = {};
  let openIssues = 0;
  let resolvedIssues = 0;

  for (const issue of issues) {
    issueByPriority[issue.priority] = (issueByPriority[issue.priority] || 0) + 1;
    if (issue.status === "OPEN" || issue.status === "IN_PROGRESS") {
      openIssues++;
    } else {
      resolvedIssues++;
    }
  }

  return {
    progress: {
      overall: overallProgress,
      byMilestone: progressByMilestone,
      byStatus: progressByStatus,
    },
    timeTracking: {
      totalPlanned,
      totalActual,
      byMember: timeByMemberArray,
      byTicket: timeByTicketArray,
    },
    budget: {
      totalBudget,
      spent,
      remaining,
      burnRate,
      forecasted,
      byCategory: budgetByCategory,
    },
    team: {
      totalMembers,
      activeMembers,
      workload,
    },
    tickets: {
      total: tickets.length,
      byStatus: ticketByStatus,
      byPriority: ticketByPriority,
      averageResolutionTime,
      openTickets: ticketByStatus["OPEN"] || 0,
      resolvedTickets: ticketByStatus["RESOLVED"] || 0,
      createdTrend: createdTrendArray,
    },
    risks: {
      total: risks.length,
      bySeverity: riskBySeverity,
      byStatus: riskByStatus,
      critical: criticalRisks,
    },
    issues: {
      total: issues.length,
      open: openIssues,
      resolved: resolvedIssues,
      byPriority: issueByPriority,
    },
  };
}
