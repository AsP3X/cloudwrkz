//
//  EmploymentDetailsView.swift
//  Cloudwrkz
//
//  Sheet content for linked employee data (parity with web EmploymentDetailsDialog).
//

import SwiftUI

// Human: Read-only employment summary: status, work contact, org, PTO, compensation, managers—same sections as the web modal.
// Agent: EmploymentDetailsView READS optional EmployeeMyRecord; EMPTY state copy; FORMAT money + vacation bar.

struct EmploymentDetailsView: View {
    var employee: EmployeeMyRecord?

    private static let moneyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 2
        f.minimumFractionDigits = 0
        return f
    }()

    var body: some View {
        Group {
            if let employee {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        nameAndStatus(employee)
                        workContact(employee)
                        roleAndOrg(employee)
                        timeOff(employee)
                        compensation(employee)
                        managers(employee)
                    }
                    .padding(20)
                }
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    Text("profile.employment.empty_title")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                    Text("profile.employment.empty_body")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
        }
        .background(CloudwrkzColors.neutral950)
    }

    private func nameAndStatus(_ e: EmployeeMyRecord) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Text("\(e.firstName) \(e.lastName)")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text(statusLabel(for: e.employeeStatus))
                .font(.system(size: 11, weight: .semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(statusBackground(for: e.employeeStatus), in: Capsule())
                .foregroundStyle(statusForeground(for: e.employeeStatus))
        }
    }

    private func workContact(_ e: EmployeeMyRecord) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("profile.employment.work_contact")
            labeledValue(title: "profile.employment.work_email", value: e.email)
            if !e.emails.isEmpty {
                Text("profile.employment.additional_emails")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.6)
                    .foregroundStyle(CloudwrkzColors.neutral500)
                ForEach(e.emails) { row in
                    Text(emailLine(row))
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral200)
                }
            }
        }
    }

    private func emailLine(_ row: EmployeeExtraEmail) -> String {
        if let label = row.label?.trimmingCharacters(in: .whitespaces), !label.isEmpty {
            return "\(row.email) (\(label))"
        }
        return row.email
    }

    private func roleAndOrg(_ e: EmployeeMyRecord) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("profile.employment.role_org")
            if let t = e.title?.trimmingCharacters(in: .whitespaces), !t.isEmpty {
                labeledValue(title: "profile.employment.job_title", value: t)
            }
            if let d = e.department?.trimmingCharacters(in: .whitespaces), !d.isEmpty {
                labeledValue(title: "profile.employment.department", value: d)
            }
            let role = e.companyRole?.trimmingCharacters(in: .whitespaces) ?? ""
            labeledValue(title: "profile.employment.company_role", value: role.isEmpty ? "—" : role)
        }
    }

    private func timeOff(_ e: EmployeeMyRecord) -> some View {
        let vacationTotal = e.vacationAvailable + e.vacationUsed + e.vacationPlanned
        let usedPct: Double = vacationTotal > 0
            ? min(100, Double(e.vacationUsed) / Double(vacationTotal) * 100)
            : 0

        return VStack(alignment: .leading, spacing: 12) {
            sectionTitle("profile.employment.time_off")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                statTile(value: "\(e.vacationAvailable)", caption: "profile.employment.vacation_available")
                statTile(value: "\(e.vacationUsed)", caption: "profile.employment.vacation_used")
                statTile(value: "\(e.vacationPlanned)", caption: "profile.employment.vacation_planned")
                statTile(value: "\(e.sickDaysAvailable)/\(e.sickDaysTotal)", caption: "profile.employment.sick_days")
            }
            if vacationTotal > 0 {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("profile.employment.vacation_usage")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                        Spacer()
                        Text("\(e.vacationUsed) / \(vacationTotal)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(CloudwrkzColors.neutral800).frame(height: 6)
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [CloudwrkzColors.primary500, CloudwrkzColors.primary400],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(width: max(4, geo.size.width * usedPct / 100), height: 6)
                        }
                    }
                    .frame(height: 6)
                }
            }
        }
    }

    private func compensation(_ e: EmployeeMyRecord) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("profile.employment.compensation")
            HStack(spacing: 12) {
                labeledValue(title: "profile.employment.monthly_salary", value: formatMoney(e.monthlySalary))
                Spacer(minLength: 8)
                labeledValue(title: "profile.employment.monthly_expenses", value: formatMoney(e.monthlyExpenses))
            }
            labeledValue(
                title: "profile.employment.hours_worked",
                value: e.hoursWorked.map { Self.moneyFormatter.string(from: NSNumber(value: $0)) ?? String($0) } ?? "—"
            )
        }
    }

    private func managers(_ e: EmployeeMyRecord) -> some View {
        Group {
            if !e.managers.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    sectionTitle("profile.employment.managers")
                    ForEach(e.managers) { m in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(m.firstName) \(m.lastName)")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(CloudwrkzColors.neutral100)
                            Text(m.email)
                                .font(.system(size: 12, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.neutral500)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .glassCard(cornerRadius: 12)
                    }
                }
            }
        }
    }

    private func sectionTitle(_ key: LocalizedStringKey) -> some View {
        Text(key)
            .font(.system(size: 10, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
    }

    private func labeledValue(title: LocalizedStringKey, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .tracking(0.6)
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statTile(value: String, caption: LocalizedStringKey) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text(caption)
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .glassCard(cornerRadius: 12)
    }

    private func formatMoney(_ n: Double?) -> String {
        guard let n else { return "—" }
        return Self.moneyFormatter.string(from: NSNumber(value: n)) ?? String(n)
    }

    private func statusLabel(for raw: String) -> String {
        switch raw.uppercased() {
        case "ACTIVE": return String(localized: "profile.employee_status.active")
        case "INACTIVE": return String(localized: "profile.employee_status.inactive")
        case "ON_LEAVE": return String(localized: "profile.employee_status.on_leave")
        case "PROBATION": return String(localized: "profile.employee_status.probation")
        case "TERMINATED": return String(localized: "profile.employee_status.terminated")
        default: return raw.replacingOccurrences(of: "_", with: " ")
        }
    }

    private func statusBackground(for raw: String) -> Color {
        switch raw.uppercased() {
        case "ACTIVE": return CloudwrkzColors.success500.opacity(0.2)
        case "INACTIVE": return CloudwrkzColors.neutral800
        case "ON_LEAVE": return CloudwrkzColors.warning500.opacity(0.2)
        case "PROBATION": return CloudwrkzColors.primary500.opacity(0.2)
        case "TERMINATED": return CloudwrkzColors.error500.opacity(0.2)
        default: return CloudwrkzColors.neutral800
        }
    }

    private func statusForeground(for raw: String) -> Color {
        switch raw.uppercased() {
        case "ACTIVE": return CloudwrkzColors.success500
        case "INACTIVE": return CloudwrkzColors.neutral400
        case "ON_LEAVE": return CloudwrkzColors.warning500
        case "PROBATION": return CloudwrkzColors.primary400
        case "TERMINATED": return CloudwrkzColors.error500
        default: return CloudwrkzColors.neutral400
        }
    }
}
