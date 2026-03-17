//
//  EditTimeEntrySheet.swift
//  Cloudwrkz
//
//  Edit time entry sheet. Liquid glass, modern enterprise. Matches EditLinkView design.
//  Sections for identity, timing, details, tags, billable toggle, with change tracking
//  and saving overlay.
//

import SwiftUI

struct EditTimeEntrySheet: View {
    @Environment(\.dismiss) private var dismiss
    let entry: TimeEntry
    var onSaved: (() -> Void)?

    // MARK: - Editable fields

    @State private var name: String
    @State private var descriptionText: String
    @State private var location: String
    @State private var tagInput = ""
    @State private var tags: [String]
    @State private var billable: Bool
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var hasEndDate: Bool

    // MARK: - UI state

    @State private var currentEntry: TimeEntry
    @State private var isSaving = false
    @State private var showAddBreakSheet = false
    @State private var deletingBreakId: String?
    @State private var errorMessage: String?
    @State private var successMessage: String?
    @State private var hasChanges = false
    @FocusState private var focusedField: Field?

    @Environment(\.appState) private var appState

    enum Field: Hashable {
        case name, description, location, tag
    }

    init(entry: TimeEntry, onSaved: (() -> Void)? = nil) {
        self.entry = entry
        self.onSaved = onSaved
        _currentEntry = State(initialValue: entry)
        _name = State(initialValue: entry.name)
        _descriptionText = State(initialValue: entry.description ?? "")
        _location = State(initialValue: entry.location ?? "")
        _tags = State(initialValue: entry.tags)
        _billable = State(initialValue: entry.billable)
        _startDate = State(initialValue: entry.startedAt)
        _endDate = State(initialValue: entry.stoppedAt ?? Date())
        _hasEndDate = State(initialValue: entry.stoppedAt != nil)
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        headerSection

                        if let err = errorMessage {
                            errorBanner(err)
                        }
                        if let msg = successMessage {
                            successBanner(msg)
                        }

                        nameSection
                        descriptionSection
                        timingSection
                        locationSection
                        tagsSection
                        billableSection
                        breaksSection
                        infoSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 40)
                }
                .overlay {
                    if isSaving {
                        savingOverlay
                    }
                }
            }
            .navigationTitle("Edit Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(hasChanges && !isSaving ? CloudwrkzColors.primary400 : CloudwrkzColors.neutral500)
                        .disabled(!hasChanges || isSaving)
                }
            }
            .tint(CloudwrkzColors.primary400)
            .onChange(of: name) { _, _ in trackChanges() }
            .onChange(of: descriptionText) { _, _ in trackChanges() }
            .onChange(of: location) { _, _ in trackChanges() }
            .onChange(of: tags) { _, _ in trackChanges() }
            .onChange(of: billable) { _, _ in trackChanges() }
            .onChange(of: startDate) { _, _ in trackChanges() }
            .onChange(of: endDate) { _, _ in trackChanges() }
            .onChange(of: hasEndDate) { _, _ in trackChanges() }
            .sheet(isPresented: $showAddBreakSheet) {
                AddBreakSheet(timeEntryId: entry.id) {
                    Task { await refreshEntryForBreaks() }
                }
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "pencil.and.outline")
                    .font(.system(size: 28))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("Edit time entry")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("Modify name, timing, description, and other details.")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    // MARK: - Name

    private var nameSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Name")
            TextField("Timer name", text: $name)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .focused($focusedField, equals: .name)
                .padding(14)
                .glassField(cornerRadius: 12)
        }
    }

    // MARK: - Timing

    private var timingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Timing")
            VStack(alignment: .leading, spacing: 0) {
                datePickerRow(
                    icon: "play.circle.fill",
                    iconColor: CloudwrkzColors.success500,
                    label: "Start",
                    date: $startDate,
                    maxDate: hasEndDate ? endDate : nil
                )

                timingDivider

                if entry.status == .stopped || entry.status == .completed {
                    endDateRow
                } else {
                    activeTimerNote
                }

                if hasEndDate {
                    timingDivider
                    durationSummary
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private func datePickerRow(
        icon: String,
        iconColor: Color,
        label: String,
        date: Binding<Date>,
        maxDate: Date? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(iconColor)
                Text(label)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
                Text(Self.shortDateFormatter.string(from: date.wrappedValue))
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }
            DatePicker(
                "",
                selection: date,
                in: dateRange(max: maxDate),
                displayedComponents: [.date, .hourAndMinute]
            )
            .datePickerStyle(.compact)
            .labelsHidden()
            .tint(CloudwrkzColors.primary400)
        }
    }

    private var endDateRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "stop.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.error500)
                Text("End")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
                if hasEndDate {
                    Text(Self.shortDateFormatter.string(from: endDate))
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                } else {
                    Text("Not set")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                }
            }
            if hasEndDate {
                DatePicker(
                    "",
                    selection: $endDate,
                    in: startDate...,
                    displayedComponents: [.date, .hourAndMinute]
                )
                .datePickerStyle(.compact)
                .labelsHidden()
                .tint(CloudwrkzColors.primary400)
            }
        }
    }

    private var activeTimerNote: some View {
        HStack(spacing: 10) {
            Image(systemName: "info.circle")
                .font(.system(size: 14))
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text("End time can only be edited on stopped entries.")
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
        }
        .padding(.top, 4)
    }

    private var durationSummary: some View {
        let seconds = max(0, Int(endDate.timeIntervalSince(startDate)))
        let durationText = TimeTrackingUtils.formatDuration(seconds)
        return HStack(spacing: 10) {
            Image(systemName: "clock.fill")
                .font(.system(size: 16))
                .foregroundStyle(CloudwrkzColors.primary400)
            Text("Duration")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Spacer()
            Text(durationText)
                .font(.system(size: 15, weight: .bold, design: .monospaced))
                .foregroundStyle(CloudwrkzColors.primary400)
                .contentTransition(.numericText())
        }
        .id("\(startDate.timeIntervalSince1970)-\(endDate.timeIntervalSince1970)")
    }

    private var timingDivider: some View {
        Rectangle()
            .fill(CloudwrkzColors.neutral700.opacity(0.4))
            .frame(height: 1)
            .padding(.vertical, 12)
    }

    private func dateRange(max: Date?) -> ClosedRange<Date> {
        let distantPast = Calendar.current.date(byAdding: .year, value: -5, to: Date()) ?? Date.distantPast
        let upper = max ?? Date()
        return distantPast...upper
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Description")
            TextField("What were you working on?", text: $descriptionText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .lineLimit(3...8)
                .focused($focusedField, equals: .description)
                .padding(14)
                .glassField(cornerRadius: 12)
        }
    }

    // MARK: - Location

    private var locationSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Location")
            LocationAutocompleteFieldView(text: $location, placeholder: "e.g. Office, Remote, Home")
        }
    }

    // MARK: - Tags

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Tags")
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "tag")
                        .font(.system(size: 16))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                    TextField("Add a tag\u{2026}", text: $tagInput)
                        .textFieldStyle(.plain)
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .tag)
                        .onSubmit { addTag() }
                    if !tagInput.isEmpty {
                        Button { addTag() } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 22))
                                .foregroundStyle(CloudwrkzColors.primary400)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(14)
                .glassField(cornerRadius: 12)

                if !tags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(tags, id: \.self) { tag in
                                tagChip(tag)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private func tagChip(_ tag: String) -> some View {
        HStack(spacing: 5) {
            Text(tag)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.primary400)
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    tags.removeAll { $0 == tag }
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(CloudwrkzColors.primary400.opacity(0.12), in: Capsule())
        .overlay(Capsule().stroke(CloudwrkzColors.primary400.opacity(0.2), lineWidth: 1))
    }

    // MARK: - Billable

    private var billableSection: some View {
        HStack(spacing: 14) {
            Image(systemName: billable ? "dollarsign.circle.fill" : "dollarsign.circle")
                .font(.system(size: 22))
                .foregroundStyle(billable ? CloudwrkzColors.success400 : CloudwrkzColors.neutral500)

            VStack(alignment: .leading, spacing: 2) {
                Text("Billable")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text("Mark this entry as billable time.")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }

            Spacer()

            Toggle("", isOn: $billable)
                .labelsHidden()
                .tint(CloudwrkzColors.primary400)
        }
        .padding(16)
        .glassPanel(cornerRadius: 16, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
    }

    // MARK: - Breaks

    private var breaksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Breaks")
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "cup.and.saucer.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(CloudwrkzColors.warning400)
                    Text("Breaks")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                    Spacer()
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

                let breaks = currentEntry.breaks ?? []
                if breaks.isEmpty {
                    Text("No breaks recorded.")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                        .padding(.vertical, 4)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(breaks) { breakItem in
                            HStack(spacing: 12) {
                                Circle()
                                    .fill(breakItem.endedAt == nil ? CloudwrkzColors.warning500 : CloudwrkzColors.neutral600)
                                    .frame(width: 8, height: 8)
                                VStack(alignment: .leading, spacing: 2) {
                                    if let desc = breakItem.description, !desc.isEmpty {
                                        Text(desc)
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundStyle(CloudwrkzColors.neutral200)
                                    }
                                    Text(Self.shortDateFormatter.string(from: breakItem.startedAt))
                                        .font(.system(size: 12, weight: .regular))
                                        .foregroundStyle(CloudwrkzColors.neutral500)
                                }
                                Spacer()
                                if let duration = breakItem.duration {
                                    Text(TimeTrackingUtils.formatDuration(duration))
                                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(CloudwrkzColors.warning400)
                                } else {
                                    Text("Ongoing")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(CloudwrkzColors.warning500)
                                }
                                Button {
                                    Task { await deleteBreak(breakId: breakItem.id) }
                                } label: {
                                    Image(systemName: "trash")
                                        .font(.system(size: 14))
                                        .foregroundStyle(CloudwrkzColors.neutral500)
                                }
                                .disabled(deletingBreakId == breakItem.id)
                            }
                            .padding(.vertical, 8)
                            if breakItem.id != breaks.last?.id {
                                infoDivider
                            }
                        }
                        let totalBreak = TimeTrackingUtils.calculateTotalBreakDuration(breaks)
                        HStack {
                            Spacer()
                            Text("Total: \(TimeTrackingUtils.formatDuration(totalBreak))")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(CloudwrkzColors.warning400)
                        }
                        .padding(.top, 4)
                    }
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Read-only info

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Info")
            VStack(alignment: .leading, spacing: 14) {
                if let timezone = entry.timezone {
                    infoRow(icon: "globe", label: "Timezone", value: timezone)
                    infoDivider
                }
                infoRow(icon: "calendar", label: "Created", value: formatted(entry.createdAt))
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private func infoRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(CloudwrkzColors.neutral400)
                .frame(width: 20)
            Text(label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral400)
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
    }

    private var infoDivider: some View {
        Rectangle()
            .fill(CloudwrkzColors.neutral700.opacity(0.5))
            .frame(height: 1)
    }

    // MARK: - Shared chrome

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
    }

    private var savingOverlay: some View {
        Color.black.opacity(0.4)
            .ignoresSafeArea()
            .overlay {
                VStack(spacing: 16) {
                    CloudwrkzSpinner(tint: CloudwrkzColors.neutral100)
                        .scaleEffect(1.3)
                    Text("Saving changes\u{2026}")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral200)
                }
                .padding(28)
                .glassPanel(cornerRadius: 20)
            }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(CloudwrkzColors.error500)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CloudwrkzColors.error500.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
    }

    private func successBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(CloudwrkzColors.success400)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CloudwrkzColors.success400.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
    }

    private static let detailDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    private static let shortDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d, HH:mm"
        return f
    }()

    private func formatted(_ date: Date) -> String {
        Self.detailDateFormatter.string(from: date)
    }

    // MARK: - Data flow

    private func addTag() {
        let tag = tagInput.trimmingCharacters(in: .whitespaces)
        if !tag.isEmpty && !tags.contains(tag) {
            withAnimation(.easeInOut(duration: 0.2)) {
                tags.append(tag)
            }
        }
        tagInput = ""
    }

    private func trackChanges() {
        let startChanged = abs(startDate.timeIntervalSince(entry.startedAt)) > 1
        let endChanged: Bool = {
            if let originalEnd = entry.stoppedAt {
                return !hasEndDate || abs(endDate.timeIntervalSince(originalEnd)) > 1
            } else {
                return hasEndDate
            }
        }()

        hasChanges =
            name != entry.name ||
            descriptionText != (entry.description ?? "") ||
            location != (entry.location ?? "") ||
            tags != entry.tags ||
            billable != entry.billable ||
            startChanged ||
            endChanged
    }

    // MARK: - Validation

    private var validationError: String? {
        if name.trimmingCharacters(in: .whitespaces).isEmpty {
            return "Name is required."
        }
        if hasEndDate && endDate < startDate {
            return "End time must be after start time."
        }
        return nil
    }

    // MARK: - Breaks API

    private func refreshEntryForBreaks() async {
        let result = await TimeTrackingService.fetchTimeEntry(config: appState.config, id: entry.id)
        if case .success(let updated) = result {
            await MainActor.run { currentEntry = updated }
        }
    }

    private func deleteBreak(breakId: String) async {
        await MainActor.run { deletingBreakId = breakId }
        let result = await TimeTrackingService.deleteBreak(config: appState.config, timeEntryId: entry.id, breakId: breakId)
        if case .success = result {
            await refreshEntryForBreaks()
        }
        await MainActor.run { deletingBreakId = nil }
    }

    // MARK: - Network

    private func save() async {
        errorMessage = nil
        successMessage = nil

        if let error = validationError {
            errorMessage = error
            return
        }

        isSaving = true

        let input = TimeTrackingService.UpdateInput(
            name: name.trimmingCharacters(in: .whitespaces),
            description: descriptionText.isEmpty ? nil : descriptionText.trimmingCharacters(in: .whitespaces),
            tags: tags,
            location: location.isEmpty ? nil : location.trimmingCharacters(in: .whitespaces),
            billable: billable,
            startedAt: startDate,
            stoppedAt: hasEndDate ? endDate : nil
        )

        let result = await TimeTrackingService.updateTimeEntry(config: appState.config, id: entry.id, input: input)

        isSaving = false
        switch result {
        case .success:
            onSaved?()
            dismiss()
        case .failure(let error):
            errorMessage = errorText(error)
        }
    }

    private func errorText(_ error: TimeTrackingServiceError) -> String {
        switch error {
        case .noServerURL: return "No server configured."
        case .noToken: return "Please sign in again."
        case .unauthorized: return "Session expired."
        case .notFound: return "Time entry not found."
        case .serverError(let m): return m
        case .networkError: return "Could not reach server."
        }
    }
}
