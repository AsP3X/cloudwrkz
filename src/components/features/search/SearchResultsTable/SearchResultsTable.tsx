"use client";

import React from "react";
import Link from "next/link";
import { type SearchResult } from "@/server/actions/search";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";

interface SearchResultsTableProps {
  results: SearchResult[];
}

export const SearchResultsTable = ({ results }: SearchResultsTableProps) => {
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      PENDING: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      CLOSED: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
      CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return statusColors[status] || statusColors.OPEN;
  };

  const getPriorityColor = (priority: string) => {
    const priorityColors: Record<string, string> = {
      LOW: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
      MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      URGENT: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    };
    return priorityColors[priority] || priorityColors.MEDIUM;
  };

  const getResultIcon = (type: SearchResult["type"]) => {
    if (type === "ticket") {
      return (
        <svg
          className="w-5 h-5 text-primary-600 dark:text-primary-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    }
    return (
      <svg
        className="w-5 h-5 text-neutral-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
    );
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                ID/Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden md:table-cell">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden lg:table-cell">
                Assigned To
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden lg:table-cell">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden xl:table-cell">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {results.map((result) => (
              <tr
                key={`${result.type}-${result.id}`}
                className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {getResultIcon(result.type)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {result.type === "ticket" && result.metadata?.ticketNumber ? (
                    <Link
                      href={result.url}
                      className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                    >
                      {result.metadata.ticketNumber}
                    </Link>
                  ) : (
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      {result.id.slice(0, 8)}...
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <Link
                    href={result.url}
                    className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    <div className="max-w-md">
                      <div className="truncate">{result.title}</div>
                      {result.description && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                          {result.description}
                        </div>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {result.type === "ticket" && result.metadata?.status ? (
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        result.metadata.status
                      )}`}
                    >
                      {result.metadata.status.replace("_", " ")}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {result.type === "ticket" && result.metadata?.priority ? (
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(
                        result.metadata.priority
                      )}`}
                    >
                      {result.metadata.priority}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                  {result.type === "ticket" && result.metadata?.type ? (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                      {getTicketTypeLabel(result.metadata.type as TicketType)}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                  {result.type === "ticket" && result.metadata ? (
                    <div className="text-sm text-neutral-700 dark:text-neutral-300">
                      {result.metadata.assignedTo ? (
                        result.metadata.assignedTo
                      ) : result.metadata.assignedToGroup ? (
                        <>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">Group: </span>
                          {result.metadata.assignedToGroup}
                        </>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">Unassigned</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                  {result.type === "ticket" && result.metadata?.createdAt ? (
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      {formatDate(result.metadata.createdAt)}
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap hidden xl:table-cell">
                  {result.type === "ticket" && result.metadata?.updatedAt ? (
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      {formatDateTime(result.metadata.updatedAt)}
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
