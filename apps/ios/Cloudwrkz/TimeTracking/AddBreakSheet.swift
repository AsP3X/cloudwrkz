//
//  AddBreakSheet.swift
//  Cloudwrkz
//
//  Sheet to add a break to a time entry. Start and end time required; optional description.
//

import SwiftUI

struct AddBreakSheet: View {
    let timeEntryId: String
    var onAdded: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.appState) private var appState

    @State private var descriptionText = ""
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var isAdding = false
    @State private var errorMessage: String?

    init(timeEntryId: String, onAdded: (() -> Void)? = nil) {
        self.timeEntryId = timeEntryId
        self.onAdded = onAdded
        let cal = Calendar.current
        let now = Date()
        let start = cal.date(bySettingHour: 12, minute: 0, second: 0, of: now) ?? now
        let end = cal.date(bySettingHour: 12, minute: 30, second: 0, of: now) ?? now
        _startDate = State(initialValue: start)
        _endDate = State(initialValue: end)
    }

    private var durationSeconds: Int {
        max(0, Int(endDate.timeIntervalSince(startDate)))
    }

    private var validationError: String? {
        if endDate <= startDate {
            return "End time must be after start time."
        }
        return nil
    }

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
                    VStack(alignment: .leading, spacing: 24) {
                        headerText

                        descriptionField

                        timeSection

                        if let err = errorMessage {
                            errorBanner(err)
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Add Break")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await addBreak() } }
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.primary400)
                        .disabled(isAdding || validationError != nil)
                }
            }
            .tint(CloudwrkzColors.primary400)
            .onChange(of: startDate) { _, newStart in
                if endDate <= newStart {
                    endDate = Calendar.current.date(byAdding: .minute, value: 15, to: newStart) ?? newStart
                }
            }
        }
    }

    // MARK: - Header

    private var headerText: some View {
        Text("Set the start and end time for this break. Both are required.")
            .font(.system(size: 15, weight: .regular))
            .foregroundStyle(CloudwrkzColors.neutral400)
    }

    // MARK: - Description (optional)

    private var descriptionField: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Description (optional)")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral500)
            TextField("e.g. Lunch, Coffee break", text: $descriptionText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .lineLimit(2...4)
                .padding(14)
                .glassField(cornerRadius: 12)
        }
    }

    // MARK: - Start & End time (required)

    private var timeSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Time")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral500)

            VStack(alignment: .leading, spacing: 0) {
                timeRow(
                    icon: "play.circle.fill",
                    iconColor: CloudwrkzColors.success500,
                    label: "Start time",
                    date: $startDate,
                    maxDate: endDate
                )

                Rectangle()
                    .fill(CloudwrkzColors.neutral700.opacity(0.5))
                    .frame(height: 1)
                    .padding(.vertical, 12)

                timeRow(
                    icon: "stop.circle.fill",
                    iconColor: CloudwrkzColors.error500,
                    label: "End time",
                    date: $endDate,
                    minDate: startDate
                )

                Rectangle()
                    .fill(CloudwrkzColors.neutral700.opacity(0.5))
                    .frame(height: 1)
                    .padding(.vertical, 12)

                HStack(spacing: 10) {
                    Image(systemName: "clock.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(CloudwrkzColors.primary400)
                    Text("Duration")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                    Spacer()
                    Text(TimeTrackingUtils.formatDuration(durationSeconds))
                        .font(.system(size: 15, weight: .bold, design: .monospaced))
                        .foregroundStyle(endDate > startDate ? CloudwrkzColors.primary400 : CloudwrkzColors.error500)
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private func timeRow(
        icon: String,
        iconColor: Color,
        label: String,
        date: Binding<Date>,
        minDate: Date? = nil,
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
            }
            DatePicker(
                "",
                selection: date,
                in: dateRange(min: minDate, max: maxDate),
                displayedComponents: [.date, .hourAndMinute]
            )
            .datePickerStyle(.compact)
            .labelsHidden()
            .tint(CloudwrkzColors.primary400)
        }
    }

    private func dateRange(min: Date? = nil, max: Date? = nil) -> ClosedRange<Date> {
        let lower = min ?? Date.distantPast
        let upper = max ?? Date.distantFuture
        return lower...upper
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

    // MARK: - Actions

    private func addBreak() async {
        errorMessage = nil
        if let validation = validationError {
            errorMessage = validation
            return
        }

        await MainActor.run { isAdding = true }

        let result = await TimeTrackingService.addBreak(
            config: appState.config,
            timeEntryId: timeEntryId,
            startedAt: startDate,
            endedAt: endDate,
            description: descriptionText.trimmingCharacters(in: .whitespaces).isEmpty ? nil : descriptionText.trimmingCharacters(in: .whitespaces)
        )

        await MainActor.run { isAdding = false }

        switch result {
        case .success:
            onAdded?()
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
