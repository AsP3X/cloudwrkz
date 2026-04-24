//
//  AddTimeEntrySheet.swift
//  Cloudwrkz
//
//  Sheet to add a manual time entry with a known duration.
//  Liquid glass enterprise design. Matches web AddTimeEntryDialog.
//

import SwiftUI

// Human: Manual add mirrors edit: create the entry with wall `stoppedAt`, then POST each draft break via `TimeTrackingService.addBreak` after the new id returns (same as edit sync).
// Agent: AddTimeEntrySheet draftBreaks AddBreakSheet; addEntry CALLS addTimeEntry THEN addBreak per row; READS appState ServerConfig.

struct AddTimeEntrySheet: View {
    var onCreated: (() -> Void)?
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var description = ""
    @State private var location = ""
    @State private var tagInput = ""
    @State private var tags: [String] = []
    @State private var billable = false
    @State private var hours = 0
    @State private var minutes = 0
    @State private var seconds = 0
    @State private var startDate = Date()
    @State private var draftBreaks: [DraftTimeEntryBreak] = []
    @State private var showAddBreakSheet = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    @Environment(\.appState) private var appState

    private static let endPreviewFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()

    private static let shortDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
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
                    VStack(alignment: .leading, spacing: 20) {
                        headerSection
                        formSection
                        if let error = errorMessage {
                            errorBanner(error)
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 32)
                }
                .scrollClipDisabled(true)
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Add Time Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(CloudwrkzColors.neutral400)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await addEntry() }
                    } label: {
                        HStack(spacing: 6) {
                            if isSubmitting {
                                CloudwrkzSpinner(tint: .white)
                                    .scaleEffect(0.7)
                            }
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 12))
                            Text("Add")
                                .font(.system(size: 17, weight: .semibold))
                        }
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .disabled(isSubmitting || totalSeconds == 0)
                }
            }
            .tint(CloudwrkzColors.primary400)
            .sheet(isPresented: $showAddBreakSheet) {
                AddBreakSheet(timeEntryId: "__draft_add__", onPersistLocally: { start, end, desc in
                    let localId = "local-\(UUID().uuidString)"
                    draftBreaks.append(DraftTimeEntryBreak(localId: localId, startedAt: start, endedAt: end, description: desc))
                })
            }
        }
    }

    private var totalSeconds: Int {
        hours * 3600 + minutes * 60 + seconds
    }

    /// Wall-clock end: worked span from `startDate`, extended if any break ends later (same envelope idea as edit).
    private var computedStoppedDate: Date {
        let workEnd = startDate.addingTimeInterval(TimeInterval(totalSeconds))
        let breakEnds = draftBreaks.compactMap(\.endedAt)
        return ([workEnd] + breakEnds).max() ?? workEnd
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: 14) {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(CloudwrkzColors.primary400)
            VStack(alignment: .leading, spacing: 4) {
                Text("Add a manual time entry")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text("Enter worked duration, start time, optional breaks, and details.")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Form

    private var formSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            fieldGroup("Name") {
                TextField("e.g. Client meeting (optional, auto-generated if empty)", text: $name)
                    .font(.system(size: 15))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .padding(14)
                    .glassField()
            }

            fieldGroup("Worked duration *") {
                durationPicker
            }

            fieldGroup("Start") {
                DatePicker("", selection: $startDate, displayedComponents: [.date, .hourAndMinute])
                    .datePickerStyle(.compact)
                    .labelsHidden()
                    .tint(CloudwrkzColors.primary400)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .glassField()
            }

            breaksSection

            if totalSeconds > 0 {
                Text("Entry ends at \(Self.endPreviewFormatter.string(from: computedStoppedDate)) (covers worked time and any breaks).")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .fixedSize(horizontal: false, vertical: true)
            }

            fieldGroup("Description") {
                TextField("Additional details…", text: $description, axis: .vertical)
                    .font(.system(size: 15))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(3...6)
                    .padding(14)
                    .glassField()
            }

            fieldGroup("Location") {
                LocationAutocompleteFieldView(text: $location, placeholder: "e.g. Office, Remote")
            }

            fieldGroup("Tags") {
                HStack(spacing: 8) {
                    TextField("Add tag…", text: $tagInput)
                        .font(.system(size: 15))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                        .onSubmit { addTag() }

                    if !tagInput.isEmpty {
                        Button { addTag() } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(CloudwrkzColors.primary400)
                        }
                    }
                }
                .padding(14)
                .glassField()

                if !tags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(tags, id: \.self) { tag in
                                HStack(spacing: 4) {
                                    Text(tag)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(CloudwrkzColors.primary400)
                                    Button {
                                        tags.removeAll { $0 == tag }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.system(size: 12))
                                            .foregroundStyle(CloudwrkzColors.neutral500)
                                    }
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(CloudwrkzColors.primary400.opacity(0.15), in: Capsule())
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            }

            Toggle(isOn: $billable) {
                HStack(spacing: 8) {
                    Image(systemName: "dollarsign.circle.fill")
                        .foregroundStyle(CloudwrkzColors.success400)
                    Text("Billable")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                }
            }
            .tint(CloudwrkzColors.primary500)
            .padding(14)
            .glassField()
        }
        .padding(20)
        .background(formGlass)
    }

    // MARK: - Breaks (same interaction model as EditTimeEntrySheet)

    private var breaksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            fieldGroup("Breaks") {
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

                    if draftBreaks.isEmpty {
                        Text("No breaks recorded.")
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                            .padding(.vertical, 4)
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(draftBreaks) { breakItem in
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
                                        draftBreaks = draftBreaks.filter { $0.id != breakItem.id }
                                    } label: {
                                        Image(systemName: "trash")
                                            .font(.system(size: 14))
                                            .foregroundStyle(CloudwrkzColors.neutral500)
                                    }
                                }
                                .padding(.vertical, 8)
                                if breakItem.id != draftBreaks.last?.id {
                                    Rectangle()
                                        .fill(CloudwrkzColors.neutral700.opacity(0.4))
                                        .frame(height: 1)
                                        .padding(.vertical, 4)
                                }
                            }
                            let totalBreak = DraftTimeEntryBreak.totalBreakSeconds(in: draftBreaks)
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
    }

    // MARK: - Duration picker

    private var durationPicker: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                durationUnit(value: $hours, label: "Hours", range: 0...23)
                Text(":")
                    .font(.system(size: 24, weight: .bold, design: .monospaced))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                durationUnit(value: $minutes, label: "Min", range: 0...59)
                Text(":")
                    .font(.system(size: 24, weight: .bold, design: .monospaced))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                durationUnit(value: $seconds, label: "Sec", range: 0...59)
            }
            .frame(maxWidth: .infinity)

            if totalSeconds > 0 {
                Text("Worked: \(TimeTrackingUtils.formatDuration(totalSeconds))")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundStyle(CloudwrkzColors.primary400)
            }
        }
        .padding(14)
        .glassField()
    }

    private func durationUnit(value: Binding<Int>, label: String, range: ClosedRange<Int>) -> some View {
        VStack(spacing: 4) {
            Picker(label, selection: value) {
                ForEach(range, id: \.self) { n in
                    Text(String(format: "%02d", n))
                        .tag(n)
                }
            }
            .pickerStyle(.wheel)
            .frame(width: 60, height: 80)
            .clipped()

            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral500)
        }
    }

    // MARK: - Helpers

    private func fieldGroup<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(CloudwrkzColors.neutral500)
            content()
        }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(CloudwrkzColors.error500)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.error500)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CloudwrkzColors.error500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }

    private func addTag() {
        let tag = tagInput.trimmingCharacters(in: .whitespaces)
        if !tag.isEmpty && !tags.contains(tag) {
            tags.append(tag)
        }
        tagInput = ""
    }

    private func validationErrorMessage() -> String? {
        if totalSeconds <= 0 {
            return "Worked duration is required."
        }
        for b in draftBreaks {
            guard let end = b.endedAt else {
                return "Each break must have an end time."
            }
            if end <= b.startedAt {
                return "Each break must end after it starts."
            }
            if b.startedAt < startDate {
                return "Breaks must start on or after the entry start time."
            }
        }
        let stop = computedStoppedDate
        for b in draftBreaks {
            guard let end = b.endedAt else { continue }
            if end > stop {
                return "A break extends past the entry end; adjust break times or worked duration."
            }
        }
        return nil
    }

    /// After the manual entry row exists, adds each local draft the same way as `EditTimeEntrySheet.syncDraftBreaksToServer` (POST …/breaks, 202 + poll).
    // Human: A single `POST /add` body was losing nested breaks; separate calls match the edit path and are reliable.
    // Agent: FOR draftBreaks CALL TimeTrackingService.addBreak; RETURNS first error message or nil.
    private func persistDraftBreaksAfterCreate(timeEntryId: String) async -> String? {
        for b in draftBreaks {
            let end = b.endedAt ?? b.startedAt
            let result = await TimeTrackingService.addBreak(
                config: appState.config,
                timeEntryId: timeEntryId,
                startedAt: b.startedAt,
                endedAt: end,
                description: b.description
            )
            if case .failure(let err) = result {
                return errorText(err)
            }
        }
        return nil
    }

    private func addEntry() async {
        if let msg = validationErrorMessage() {
            await MainActor.run { errorMessage = msg }
            return
        }

        await MainActor.run {
            isSubmitting = true
            errorMessage = nil
        }

        let input = TimeTrackingService.AddManualInput(
            name: name.trimmingCharacters(in: .whitespaces),
            description: description.isEmpty ? nil : description.trimmingCharacters(in: .whitespaces),
            tags: tags.isEmpty ? nil : tags,
            location: location.isEmpty ? nil : location.trimmingCharacters(in: .whitespaces),
            billable: billable ? true : nil,
            hours: hours,
            minutes: minutes,
            seconds: seconds,
            startedAt: startDate,
            stoppedAt: computedStoppedDate
        )

        let result = await TimeTrackingService.addTimeEntry(config: appState.config, input: input)

        switch result {
        case .success(let newId):
            if !draftBreaks.isEmpty {
                if let breakErr = await persistDraftBreaksAfterCreate(timeEntryId: newId) {
                    await MainActor.run {
                        errorMessage = breakErr
                        isSubmitting = false
                    }
                    return
                }
            }
            await MainActor.run {
                onCreated?()
                dismiss()
                isSubmitting = false
            }
        case .failure(let error):
            await MainActor.run {
                errorMessage = errorText(error)
                isSubmitting = false
            }
        }
    }

    private func errorText(_ error: TimeTrackingServiceError) -> String {
        switch error {
        case .noServerURL: return "No server configured."
        case .noToken: return "Please sign in again."
        case .unauthorized: return "Session expired."
        case .notFound: return "Time tracking not available."
        case .serverError(let m): return m
        case .networkError: return "Could not reach server."
        }
    }

    private var formGlass: some View {
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

#Preview {
    AddTimeEntrySheet()
}
