//
//  TicketDetailView.swift
//  Cloudwrkz
//
//  Enterprise ticket detail with glass panels. Matches cloudwrkz ticket detail layout.
//

import SwiftUI

struct TicketDetailView: View {
    let ticket: Ticket
    @State private var showTicketInfoSidebar = false

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        ZStack {
            background
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    headerSection
                    contentGrid
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
        .scrollContentBackground(.hidden)
        }
        .navigationTitle(ticket.ticketNumber)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showTicketInfoSidebar = true
                } label: {
                    Image(systemName: "info.circle")
                        .font(.system(size: 20))
                }
            }
        }
        .sheet(isPresented: $showTicketInfoSidebar) {
            TicketInfoSidebarView(ticket: ticket)
        }
        .tint(CloudwrkzColors.primary400)
    }

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Text(ticket.ticketNumber)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(CloudwrkzColors.primary400.opacity(0.15), in: Capsule())
                HStack(spacing: 6) {
                    statusPill(ticket.status)
                    priorityPill(ticket.priority)
                    typePill(ticket.type)
                }
            }
            Text(ticket.title)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .fixedSize(horizontal: false, vertical: true)
            Text(String(format: String(localized: "common.created_date"), Self.dateFormatter.string(from: ticket.createdAt)))
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .glassCard(cornerRadius: 20)
    }

    private var contentGrid: some View {
        mainColumn
    }

    private var mainColumn: some View {
        VStack(alignment: .leading, spacing: 16) {
            descriptionCard
            commentsPlaceholder
        }
    }

    private var descriptionCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "doc.text.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("common.description")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            if let desc = ticket.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral200)
                    .lineSpacing(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("common.no_description")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .italic()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private var commentsPlaceholder: some View {
        HStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 20))
                .foregroundStyle(CloudwrkzColors.primary400.opacity(0.8))
            VStack(alignment: .leading, spacing: 4) {
                Text("common.comments_activity")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text("common.view_comments_web")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private func statusPill(_ status: String) -> some View {
        Text(status.replacingOccurrences(of: "_", with: " "))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(statusColor(status))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(statusColor(status).opacity(0.2), in: Capsule())
    }

    private func priorityPill(_ priority: String) -> some View {
        Text(priority)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(priorityColor(priority))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(priorityColor(priority).opacity(0.2), in: Capsule())
    }

    private func typePill(_ type: String) -> some View {
        Text(type)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(CloudwrkzColors.neutral200)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(CloudwrkzColors.neutral700.opacity(0.8), in: Capsule())
    }

    private func statusColor(_ status: String) -> Color {
        switch status.uppercased() {
        case "OPEN": return CloudwrkzColors.primary400
        case "IN_PROGRESS": return CloudwrkzColors.warning500
        case "PENDING": return CloudwrkzColors.warning400
        case "RESOLVED", "CLOSED": return CloudwrkzColors.success500
        case "CANCELLED": return CloudwrkzColors.neutral500
        default: return CloudwrkzColors.neutral400
        }
    }

    private func priorityColor(_ priority: String) -> Color {
        switch priority.uppercased() {
        case "URGENT": return CloudwrkzColors.error500
        case "HIGH": return CloudwrkzColors.warning500
        case "MEDIUM": return CloudwrkzColors.warning400
        default: return CloudwrkzColors.neutral400
        }
    }

    private func formatCreatedBy() -> String {
        guard let createdBy = ticket.createdBy else { return "—" }
        if let n = createdBy.name, !n.isEmpty { return n }
        return String(createdBy.email.prefix(upTo: createdBy.email.firstIndex(of: "@") ?? createdBy.email.endIndex))
    }

    private func formatAssignedTo() -> String {
        if let assignee = ticket.assignedTo {
            if let n = assignee.name, !n.isEmpty { return n }
            return String(assignee.email.prefix(upTo: assignee.email.firstIndex(of: "@") ?? assignee.email.endIndex))
        }
        if let group = ticket.assignedToGroup { return group.name }
        return String(localized: "todo.unassigned")
    }
}

// MARK: - Ticket info sidebar (sheet)

private struct TicketInfoSidebarView: View {
    let ticket: Ticket
    @Environment(\.dismiss) private var dismiss

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                ScrollView {
                    ticketInfoContent
                        .padding(20)
                        .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("common.ticket_info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("common.done") {
                        dismiss()
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .tint(CloudwrkzColors.primary400)
        }
    }

    private var ticketInfoContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 8) {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("common.ticket_info")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            VStack(alignment: .leading, spacing: 14) {
                infoRow(label: String(localized: "common.ticket_id"), value: ticket.ticketNumber, mono: true)
                infoRow(label: String(localized: "common.type"), value: ticket.type)
                sidebarDivider
                infoRow(label: String(localized: "common.status"), value: ticket.status.replacingOccurrences(of: "_", with: " "))
                infoRow(label: String(localized: "common.priority"), value: ticket.priority)
                sidebarDivider
                infoRow(label: String(localized: "common.created_by"), value: formatCreatedBy())
                infoRow(label: String(localized: "common.assigned_to"), value: formatAssignedTo())
                sidebarDivider
                infoRow(label: String(localized: "todo.created"), value: Self.dateFormatter.string(from: ticket.createdAt))
                if ticket.updatedAt != ticket.createdAt {
                    infoRow(label: String(localized: "common.last_updated"), value: Self.dateFormatter.string(from: ticket.updatedAt))
                }
                if (ticket._count?.comments ?? 0) > 0 {
                    sidebarDivider
                    HStack(spacing: 6) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 12))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                        Text((ticket._count?.comments ?? 0) == 1 ? String(format: String(localized: "common.comment_count"), ticket._count?.comments ?? 0) : String(format: String(localized: "common.comments_count"), ticket._count?.comments ?? 0))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral200)
                    }
                }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private func infoRow(label: String, value: String, mono: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text(value)
                .font(.system(size: 14, weight: mono ? .semibold : .regular, design: mono ? .monospaced : .default))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var sidebarDivider: some View {
        Rectangle()
            .fill(CloudwrkzColors.neutral700.opacity(0.6))
            .frame(height: 1)
    }

    private func formatCreatedBy() -> String {
        guard let createdBy = ticket.createdBy else { return "—" }
        if let n = createdBy.name, !n.isEmpty { return n }
        return String(createdBy.email.prefix(upTo: createdBy.email.firstIndex(of: "@") ?? createdBy.email.endIndex))
    }

    private func formatAssignedTo() -> String {
        if let assignee = ticket.assignedTo {
            if let n = assignee.name, !n.isEmpty { return n }
            return String(assignee.email.prefix(upTo: assignee.email.firstIndex(of: "@") ?? assignee.email.endIndex))
        }
        if let group = ticket.assignedToGroup { return group.name }
        return String(localized: "todo.unassigned")
    }
}

#Preview {
    NavigationStack {
        TicketDetailView(ticket: Ticket(
            id: "preview-1",
            ticketNumber: "TKT-0042",
            title: "Implement ticket detail view for the app",
            description: "Add a full-screen ticket detail with description, metadata sidebar, and comments placeholder. Design should match cloudwrkz enterprise style.",
            type: "SUPPORT",
            status: "IN_PROGRESS",
            priority: "HIGH",
            archivedAt: nil,
            createdAt: Date(),
            updatedAt: Date(),
            createdBy: .init(id: "u1", name: "Jane Doe", email: "jane@example.com"),
            assignedTo: .init(id: "u2", name: "John Smith", email: "john@example.com"),
            assignedToGroup: nil,
            _count: .init(comments: 3)
        ))
    }
}
