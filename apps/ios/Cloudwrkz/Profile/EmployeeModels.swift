//
//  EmployeeModels.swift
//  Cloudwrkz
//
//  Decodable shapes for GET /employees/me (camelCase JSON from cloudwrkz-api).
//

import Foundation

// Human: Mirrors the web `Employee` type so the profile sheet can show the same employment payload as the dashboard.
// Agent: EmployeeMyRecord EmployeeExtraEmail EmployeeManagerBrief Decodable; optional nested linkedUser.

struct MyEmployeeEnvelope: Decodable, Sendable {
    let employee: EmployeeMyRecord?
}

struct EmployeeMyRecord: Decodable, Sendable, Identifiable {
    let id: String
    let firstName: String
    let lastName: String
    let email: String
    let title: String?
    let employeeStatus: String
    let companyRole: String?
    let department: String?
    let monthlySalary: Double?
    let monthlyExpenses: Double?
    let hoursWorked: Double?
    let vacationAvailable: Int
    let vacationUsed: Int
    let vacationPlanned: Int
    let sickDaysTotal: Int
    let sickDaysAvailable: Int
    let linkedUserId: String?
    let linkedUser: EmployeeLinkedUserSummary?
    let emails: [EmployeeExtraEmail]
    let managers: [EmployeeManagerBrief]
}

struct EmployeeLinkedUserSummary: Decodable, Sendable {
    let id: String
    let email: String?
    let name: String?
}

struct EmployeeExtraEmail: Decodable, Sendable, Identifiable {
    let id: String
    let email: String
    let label: String?
}

struct EmployeeManagerBrief: Decodable, Sendable, Identifiable {
    let id: String
    let firstName: String
    let lastName: String
    let email: String
}
