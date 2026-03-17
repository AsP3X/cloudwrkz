//
//  TimeEntryDetailView.swift
//  Cloudwrkz
//
//  Enterprise time entry detail view with liquid glass panels.
//  Features: live timer, timeline sidebar, breaks display, quick actions.
//

import SwiftUI
import Combine

struct TimeEntryDetailView: View {
    let entry: TimeEntry
    @State private var liveEntry: TimeEntry?
    @State private var showInfoSidebar = false
    @State private var showEditSheet = false
    @State private var showDeleteConfirm = false
    @State private var showAddBreakSheet = false
    @State private var isPerformingAction = false
    @State private var deletingBreakId: String?
    @Environment(\.dismiss) private var dismiss

    @Environment(\.appState) private var appState

    private var current: TimeEntry { liveEntry ?? entry }

    var body: some View {
        ZStack {
            background
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    headerCard
                    timerCard
                    if current.status.isActive {
                        actionCard
                    }
                    detailsCard
                    breaksSection
                    tagsCard
                    dangerZone
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle(current.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { showEditSheet = true } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 20))
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { showInfoSidebar = true } label: {
                    Image(systemName: "info.circle")
                        .font(.system(size: 20))
                }
            }
        }
        .sheet(isPresented: $showEditSheet) {
            EditTimeEntrySheet(entry: current) {
                showEditSheet = false
                Task { await refreshEntry() }
            }
        }
        .sheet(isPresented: $showInfoSidebar) {
            TimeEntryInfoSidebar(entry: current)
        }
        .sheet(isPresented: $showAddBreakSheet) {
            AddBreakSheet(timeEntryId: current.id) {
                Task { await refreshEntry() }
            }
        }
        .alert("Delete Time Entry", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                Task { await deleteEntry() }
            }
        } message: {
            Text("This will permanently delete \"\(current.name)\". This action cannot be undone.")
        }
        .tint(CloudwrkzColors.primary400)
        .onAppear { Task { await refreshEntry() } }
    }

    // MARK: - Background

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    // MARK: - Header card

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text(current.name)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(CloudwrkzColors.primary400.opacity(0.15), in: Capsule())

                statusPill(current.status)

                if current.billable {
                    Text("BILLABLE")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(CloudwrkzColors.success400)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(CloudwrkzColors.success400.opacity(0.15), in: Capsule())
                }
            }

            if let desc = current.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral200)
                    .lineSpacing(4)
            }

            if let location = current.location, !location.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 12))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                    Text(location)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(glassPanel)
    }

    // MARK: - Timer card (live updating)

    private var timerCard: some View {
        return VStack(spacing: 12) {
            if current.status.isActive {
                HStack(spacing: 8) {
                    Circle()
                        .fill(current.status == .running ? CloudwrkzColors.success500 : CloudwrkzColors.warning500)
                        .frame(width: 10, height: 10)
                        .modifier(PulseModifier())
                    Text(current.status == .running ? "Timer Running" : "Timer Paused")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(current.status == .running ? CloudwrkzColors.success400 : CloudwrkzColors.warning400)
                }
            }

            LiveDetailTimerText(entry: current)

            Text("Total duration")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral500)

            if let breaks = current.breaks, !breaks.isEmpty {
                let breakDuration = TimeTrackingUtils.calculateTotalBreakDuration(breaks)
                if breakDuration > 0 {
                    Text("−\(TimeTrackingUtils.formatDuration(breakDuration)) breaks deducted")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.warning400)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 20)
        .background(timerGlass)
        .id("\(current.id)-\(current.totalDuration)-\(current.startedAt.timeIntervalSince1970)-\(current.stoppedAt?.timeIntervalSince1970 ?? 0)")
    }

    // MARK: - Action card

    private var actionCard: some View {
        HStack(spacing: 12) {
            if current.status.canPause {
                Button {
                    Task { await performAction(.pause) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "pause.fill")
                            .font(.system(size: 14))
                        Text("Pause")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(CloudwrkzColors.warning400)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .glassButtonSecondary()
                }
                .disabled(isPerformingAction)
            }

            if current.status.canResume {
                Button {
                    Task { await performAction(.resume) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 14))
                        Text("Resume")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .glassButtonPrimary()
                }
                .disabled(isPerformingAction)
            }

            if current.status.canStop {
                Button {
                    Task { await performAction(.stop) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "stop.fill")
                            .font(.system(size: 14))
                        Text("Stop")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(CloudwrkzColors.error500)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .glassButtonSecondary()
                }
                .disabled(isPerformingAction)
            }
        }
    }

    // MARK: - Details card

    private var detailsCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("Details")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }

            VStack(alignment: .leading, spacing: 12) {
                infoRow(label: "Status", value: current.status.displayName)
                divider
                infoRow(label: "Started", value: formatted(current.startedAt))
                if let pausedAt = current.pausedAt {
                    infoRow(label: "Paused", value: formatted(pausedAt))
                }
                if let stoppedAt = current.stoppedAt {
                    infoRow(label: "Stopped", value: formatted(stoppedAt))
                }
                if let completedAt = current.completedAt {
                    infoRow(label: "Completed", value: formatted(completedAt))
                }
                divider
                if let timezone = current.timezone {
                    infoRow(label: "Timezone", value: timezone)
                }
                infoRow(label: "Created", value: formatted(current.createdAt))
                if current.updatedAt != current.createdAt {
                    infoRow(label: "Updated", value: formatted(current.updatedAt))
                }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(glassPanel)
    }

    // MARK: - Breaks card

    private var breaksSection: some View {
        breaksCard(breaks: current.breaks ?? [])
    }

    private func breaksCard(breaks: [TimeEntryBreak]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "cup.and.saucer.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.warning400)
                Text("Breaks")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
                if !breaks.isEmpty {
                    Text("\(breaks.count)")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                }
                Button {
                    showAddBreakSheet = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 14))
                        Text("Add break")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }

            if breaks.isEmpty {
                Text("No breaks recorded.")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .padding(.vertical, 4)
            } else {
                ForEach(breaks) { breakEntry in
                    HStack(spacing: 12) {
                        Circle()
                            .fill(breakEntry.endedAt == nil ? CloudwrkzColors.warning500 : CloudwrkzColors.neutral600)
                            .frame(width: 8, height: 8)

                        VStack(alignment: .leading, spacing: 3) {
                            if let desc = breakEntry.description, !desc.isEmpty {
                                Text(desc)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(CloudwrkzColors.neutral200)
                            }
                            Text(formatted(breakEntry.startedAt))
                                .font(.system(size: 12, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.neutral500)
                        }

                        Spacer()

                        if let duration = breakEntry.duration {
                            Text(TimeTrackingUtils.formatDuration(duration))
                                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                .foregroundStyle(CloudwrkzColors.warning400)
                        } else {
                            Text("Ongoing")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(CloudwrkzColors.warning500)
                        }

                        Button {
                            Task { await deleteBreak(breakId: breakEntry.id) }
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 14))
                                .foregroundStyle(CloudwrkzColors.neutral500)
                        }
                        .disabled(deletingBreakId == breakEntry.id)
                    }
                    .padding(.vertical, 6)

                    if breakEntry.id != breaks.last?.id {
                        divider
                    }
                }

                let totalBreak = TimeTrackingUtils.calculateTotalBreakDuration(breaks)
                HStack {
                    Spacer()
                    Text("Total: \(TimeTrackingUtils.formatDuration(totalBreak))")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.warning400)
                }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(glassPanel)
    }

    // MARK: - Tags card

    @ViewBuilder
    private var tagsCard: some View {
        if !current.tags.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "tag.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(CloudwrkzColors.primary400)
                    Text("Tags")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                }
                FlowLayout(spacing: 8) {
                    ForEach(current.tags, id: \.self) { tag in
                        Text(tag)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.primary400)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(CloudwrkzColors.primary400.opacity(0.15), in: Capsule())
                    }
                }
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(glassPanel)
        }
    }

    // MARK: - Danger zone

    private var dangerZone: some View {
        VStack(spacing: 12) {
            if current.status == .stopped {
                Button {
                    Task { await performAction(.complete) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 16))
                        Text("Mark as Completed")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(CloudwrkzColors.success400)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .glassButtonSecondary()
                }
            }

            Button {
                showDeleteConfirm = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "trash.fill")
                        .font(.system(size: 14))
                    Text("Delete Entry")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(CloudwrkzColors.error500)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .glassButtonSecondary()
            }
        }
    }

    // MARK: - Glass backgrounds

    private var glassPanel: some View {
        Group {
            if #available(iOS 26.0, *) {
                RoundedRectangle(cornerRadius: 20)
                    .fill(.clear)
                    .glassEffect(.regular.tint(CloudwrkzColors.glassFillSubtle), in: RoundedRectangle(cornerRadius: 20))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                    )
            } else {
                Color.clear
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                    )
            }
        }
    }

    private var timerGlass: some View {
        Group {
            if #available(iOS 26.0, *) {
                RoundedRectangle(cornerRadius: 24)
                    .fill(.clear)
                    .glassEffect(.regular.tint(timerColor.opacity(0.06)), in: RoundedRectangle(cornerRadius: 24))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(timerColor.opacity(0.25), lineWidth: 1)
                    )
            } else {
                Color.clear
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(timerColor.opacity(0.25), lineWidth: 1)
                    )
            }
        }
    }

    // MARK: - Helpers

    private var timerColor: Color {
        switch current.status {
        case .running: return CloudwrkzColors.success400
        case .paused: return CloudwrkzColors.warning400
        case .stopped: return CloudwrkzColors.neutral200
        case .completed: return CloudwrkzColors.primary400
        }
    }

    private func statusPill(_ status: TimeEntryStatus) -> some View {
        HStack(spacing: 4) {
            Image(systemName: status.iconName)
                .font(.system(size: 10))
            Text(status.displayName)
                .font(.system(size: 11, weight: .semibold))
        }
        .foregroundStyle(statusColor(status))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(statusColor(status).opacity(0.2), in: Capsule())
    }

    private func statusColor(_ status: TimeEntryStatus) -> Color {
        switch status {
        case .running: return CloudwrkzColors.success500
        case .paused: return CloudwrkzColors.warning500
        case .stopped: return CloudwrkzColors.neutral400
        case .completed: return CloudwrkzColors.primary400
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text(value)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var divider: some View {
        Rectangle()
            .fill(CloudwrkzColors.neutral700.opacity(0.6))
            .frame(height: 1)
    }

    private static let detailDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .medium
        return f
    }()

    private func formatted(_ date: Date) -> String {
        Self.detailDateFormatter.string(from: date)
    }

    // MARK: - Actions

    private enum EntryAction { case pause, resume, stop, complete }

    private func performAction(_ action: EntryAction) async {
        isPerformingAction = true
        let result: Result<Void, TimeTrackingServiceError>
        switch action {
        case .pause:
            result = await TimeTrackingService.pauseTimeEntry(config: appState.config, id: current.id)
        case .resume:
            result = await TimeTrackingService.resumeTimeEntry(config: appState.config, id: current.id)
        case .stop:
            result = await TimeTrackingService.stopTimeEntry(config: appState.config, id: current.id)
        case .complete:
            result = await TimeTrackingService.completeTimeEntry(config: appState.config, id: current.id)
        }

        if case .success = result {
            await refreshEntry()
        }
        isPerformingAction = false
    }

    private func deleteEntry() async {
        let result = await TimeTrackingService.deleteTimeEntry(config: appState.config, id: current.id)
        if case .success = result {
            dismiss()
        }
    }

    private func refreshEntry() async {
        let result = await TimeTrackingService.fetchTimeEntry(config: appState.config, id: entry.id)
        if case .success(let updated) = result {
            await MainActor.run { liveEntry = updated }
        }
    }

    private func deleteBreak(breakId: String) async {
        await MainActor.run { deletingBreakId = breakId }
        let result = await TimeTrackingService.deleteBreak(config: appState.config, timeEntryId: current.id, breakId: breakId)
        if case .success = result {
            await refreshEntry()
        }
        await MainActor.run { deletingBreakId = nil }
    }
}

// MARK: - Info sidebar sheet

private struct TimeEntryInfoSidebar: View {
    let entry: TimeEntry
    @Environment(\.dismiss) private var dismiss

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .medium
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
                    VStack(alignment: .leading, spacing: 18) {
                        sectionHeader("Timeline", icon: "clock.arrow.circlepath")

                        VStack(alignment: .leading, spacing: 14) {
                            timelineRow(icon: "play.circle.fill", color: CloudwrkzColors.success500, label: "Started", date: entry.startedAt)

                            if let pausedAt = entry.pausedAt {
                                timelineRow(icon: "pause.circle.fill", color: CloudwrkzColors.warning500, label: "Paused", date: pausedAt)
                            }

                            if let lastResumedAt = entry.lastResumedAt {
                                timelineRow(icon: "arrow.clockwise.circle.fill", color: CloudwrkzColors.primary400, label: "Last Resumed", date: lastResumedAt)
                            }

                            if let stoppedAt = entry.stoppedAt {
                                timelineRow(icon: "stop.circle.fill", color: CloudwrkzColors.error500, label: "Stopped", date: stoppedAt)
                            }

                            if let completedAt = entry.completedAt {
                                timelineRow(icon: "checkmark.circle.fill", color: CloudwrkzColors.primary400, label: "Completed", date: completedAt)
                            }
                        }

                        sidebarDivider

                        sectionHeader("Metadata", icon: "doc.text.fill")

                        VStack(alignment: .leading, spacing: 12) {
                            infoRow(label: "Entry ID", value: String(entry.id.prefix(8)) + "…", mono: true)
                            infoRow(label: "Duration (stored)", value: TimeTrackingUtils.formatDuration(entry.totalDuration))
                            if let timezone = entry.timezone {
                                infoRow(label: "Timezone", value: timezone)
                            }
                            infoRow(label: "Billable", value: entry.billable ? "Yes" : "No")
                            if let location = entry.location, !location.isEmpty {
                                infoRow(label: "Location", value: location)
                            }
                        }

                        if let user = entry.user {
                            sidebarDivider
                            sectionHeader("User", icon: "person.fill")
                            VStack(alignment: .leading, spacing: 12) {
                                if let name = user.name, !name.isEmpty {
                                    infoRow(label: "Name", value: name)
                                }
                                infoRow(label: "Email", value: user.email)
                            }
                        }
                    }
                    .padding(22)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(sidebarGlass)
                    .padding(20)
                    .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Entry information")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .tint(CloudwrkzColors.primary400)
        }
    }

    private func sectionHeader(_ title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(CloudwrkzColors.primary400)
            Text(title)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
    }

    private func timelineRow(icon: String, color: Color, label: String, date: Date) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(color)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                Text(Self.dateFormatter.string(from: date))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
        }
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

    private var sidebarGlass: some View {
        Group {
            if #available(iOS 26.0, *) {
                RoundedRectangle(cornerRadius: 20)
                    .fill(.clear)
                    .glassEffect(.regular.tint(CloudwrkzColors.glassFillSubtle), in: RoundedRectangle(cornerRadius: 20))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                    )
            } else {
                Color.clear
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                    )
            }
        }
    }
}

// MARK: - Flow layout for tags

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(in: proposal.width ?? .infinity, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(in: bounds.width, subviews: subviews)
        for (index, offset) in result.offsets.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + offset.x, y: bounds.minY + offset.y), proposal: .unspecified)
        }
    }

    private func layout(in maxWidth: CGFloat, subviews: Subviews) -> (offsets: [CGPoint], size: CGSize) {
        var offsets: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            offsets.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x)
        }

        return (offsets, CGSize(width: maxX, height: y + rowHeight))
    }
}

// MARK: - Live timer text (isolated sub-view so only the digits re-render each second)

private struct LiveDetailTimerText: View {
    let entry: TimeEntry
    @State private var timerTick = Date()
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        let _ = timerTick
        let elapsed = TimeTrackingUtils.calculateElapsedTime(entry: entry)
        return Text(TimeTrackingUtils.formatDuration(elapsed))
            .font(.system(size: 48, weight: .bold, design: .monospaced))
            .foregroundStyle(timerColor)
            .contentTransition(.numericText())
            .animation(.easeInOut(duration: 0.3), value: elapsed)
            .onReceive(timer) { timerTick = $0 }
    }

    private var timerColor: Color {
        switch entry.status {
        case .running: return CloudwrkzColors.success400
        case .paused: return CloudwrkzColors.warning400
        case .stopped: return CloudwrkzColors.neutral200
        case .completed: return CloudwrkzColors.primary400
        }
    }
}

// MARK: - Pulse modifier

private struct PulseModifier: ViewModifier {
    @State private var isAnimating = false

    func body(content: Content) -> some View {
        content
            .opacity(isAnimating ? 0.4 : 1.0)
            .onAppear {
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                    isAnimating = true
                }
            }
    }
}
