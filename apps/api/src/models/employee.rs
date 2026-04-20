use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct EmployeeListItem {
    pub id: String,
    pub employee_code: String,
    pub first_name: String,
    pub last_name: String,
    pub display_name: Option<String>,
    pub work_email: Option<String>,
    pub department: Option<String>,
    pub job_title: Option<String>,
    pub location: Option<String>,
    pub status: String,
    pub employment_type: String,
    pub hire_date: chrono::NaiveDate,
    pub termination_date: Option<chrono::NaiveDate>,
    pub manager_employee_id: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct EmployeeDetail {
    pub id: String,
    pub employee_code: String,
    pub user_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub display_name: Option<String>,
    pub work_email: Option<String>,
    pub personal_email: Option<String>,
    pub phone: Option<String>,
    pub date_of_birth: Option<chrono::NaiveDate>,
    pub hire_date: chrono::NaiveDate,
    pub termination_date: Option<chrono::NaiveDate>,
    pub status: String,
    pub employment_type: String,
    pub department: Option<String>,
    pub job_title: Option<String>,
    pub legal_entity: Option<String>,
    pub location: Option<String>,
    pub manager_employee_id: Option<String>,
    pub emergency_contact: Option<serde_json::Value>,
    pub notes: Option<String>,
    pub payroll_external_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_by_user_id: Option<String>,
    pub updated_by_user_id: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct EmployeeListParams {
    pub status: Option<String>,
    pub department: Option<String>,
    pub manager_employee_id: Option<String>,
    pub location: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeeCreateRequest {
    pub employee_code: String,
    pub user_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub display_name: Option<String>,
    pub work_email: Option<String>,
    pub personal_email: Option<String>,
    pub phone: Option<String>,
    pub date_of_birth: Option<String>,
    pub hire_date: String,
    pub termination_date: Option<String>,
    pub status: Option<String>,
    pub employment_type: Option<String>,
    pub department: Option<String>,
    pub job_title: Option<String>,
    pub legal_entity: Option<String>,
    pub location: Option<String>,
    pub manager_employee_id: Option<String>,
    pub emergency_contact: Option<serde_json::Value>,
    pub notes: Option<String>,
    pub payroll_external_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeeUpdateRequest {
    pub user_id: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub display_name: Option<String>,
    pub work_email: Option<String>,
    pub personal_email: Option<String>,
    pub phone: Option<String>,
    pub date_of_birth: Option<String>,
    pub hire_date: Option<String>,
    pub termination_date: Option<String>,
    pub status: Option<String>,
    pub employment_type: Option<String>,
    pub department: Option<String>,
    pub job_title: Option<String>,
    pub legal_entity: Option<String>,
    pub location: Option<String>,
    pub manager_employee_id: Option<String>,
    pub emergency_contact: Option<serde_json::Value>,
    pub notes: Option<String>,
    pub payroll_external_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeeCompensationUpsertRequest {
    pub pay_frequency: String,
    pub amount_cents: i64,
    pub currency: Option<String>,
    pub compensation_type: Option<String>,
    pub pay_grade: Option<String>,
    pub pay_band: Option<String>,
    pub effective_from: String,
    pub effective_to: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeeAssetAssignRequest {
    pub asset_name: String,
    pub asset_tag: Option<String>,
    pub serial_number: Option<String>,
    pub category: Option<String>,
    pub due_back_at: Option<String>,
    pub notes: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeeSkillUpsertRequest {
    pub skill_name: String,
    pub level: Option<i32>,
    pub category: Option<String>,
    pub verified: Option<bool>,
    pub last_used_at: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeeCertificationUpsertRequest {
    pub certification_name: String,
    pub issuer: Option<String>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub credential_id: Option<String>,
    pub verification_url: Option<String>,
    pub status: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeePerformanceReviewCreateRequest {
    pub reviewer_employee_id: Option<String>,
    pub cycle_name: String,
    pub rating: Option<f64>,
    pub summary: Option<String>,
    pub strengths: Option<String>,
    pub improvements: Option<String>,
    pub reviewed_at: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeeGoalCreateRequest {
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub target_date: Option<String>,
    pub progress_percent: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmployeeLifecycleEventCreateRequest {
    pub event_type: String,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub due_at: Option<String>,
    pub owner_user_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

// Human: Leave request models cover vacation/sick/parental and other absence types with
// a status-transition flow: PENDING → APPROVED or DENIED, optionally CANCELLED.
// Agent: READS leave_type, start_date, end_date; WRITES employee_leave_requests; approval via UpdateRequest.
#[derive(Debug, Deserialize, Serialize)]
pub struct LeaveRequestCreateRequest {
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

// Human: Leave update covers status transitions (approve, deny, cancel) and reasons.
// Agent: WRITES status, approved_at, rejection_reason, approved_by_user_id; REQUIRES leave.approve permission for approval.
#[derive(Debug, Deserialize, Serialize)]
pub struct LeaveRequestUpdateRequest {
    pub status: Option<String>,
    pub rejection_reason: Option<String>,
    pub notes: Option<String>,
}

// Human: Document create stores URL-based file references (contracts, IDs, certs) for an employee.
// Agent: WRITES employee_documents row; no binary storage; url is caller-provided.
#[derive(Debug, Deserialize, Serialize)]
pub struct DocumentCreateRequest {
    pub doc_type: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub url: Option<String>,
    pub file_name: Option<String>,
    pub expires_at: Option<String>,
    pub metadata: Option<serde_json::Value>,
}
