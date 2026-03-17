//
//  ServerConfigView.swift
//  Cloudwrkz
//
//  Enterprise-style tenant & server configuration. Liquid glass, clear hierarchy.
//

import SwiftUI

// MARK: - Tenant card metadata (for UI only)

private extension TenantType {
    var iconName: String {
        switch self {
        case .official: return "cloud.fill"
        case .onprem: return "building.2.fill"
        }
    }

    var localizedTagline: String {
        switch self {
        case .official: return String(localized: "server_config.tenant_official")
        case .onprem: return String(localized: "server_config.tenant_onprem")
        }
    }
}

struct ServerConfigView: View {
    @Binding var config: ServerConfig
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: Field?
    @State private var portText: String = ""

    enum Field { case domain, port, loginPath }

    private var portBinding: Binding<String> {
        Binding(
            get: {
                if !portText.isEmpty { return portText }
                return config.serverPort.map { "\($0)" } ?? ""
            },
            set: { new in
                portText = new
                config.serverPort = Int(new).flatMap { $0 > 0 && $0 < 65536 ? $0 : nil }
            }
        )
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background

                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        headerSection
                        tenantSection
                        if config.tenant != .official {
                            connectionSection
                        }
                        loginPathSection
                        if let url = config.baseURL?.absoluteString {
                            resolvedURLSection(url)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("common.done") {
                        config.save()
                        dismiss()
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
        }
        .onAppear {
            if let p = config.serverPort { portText = "\(p)" }
        }
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

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "gearshape.2.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("server_config.title")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("server_config.subtitle")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    // MARK: - Tenant selection (cards)

    private var tenantSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "server_config.environment"))

            VStack(spacing: 10) {
                ForEach(TenantType.allCases) { tenant in
                    tenantCard(tenant)
                }
            }
        }
    }

    private func tenantCard(_ tenant: TenantType) -> some View {
        let isSelected = config.tenant == tenant
        return Button {
            withAnimation(.easeOut(duration: 0.2)) {
                config.tenant = tenant
            }
        } label: {
            HStack(spacing: 16) {
                Image(systemName: tenant.iconName)
                    .font(.system(size: 22))
                    .foregroundStyle(isSelected ? CloudwrkzColors.primary400 : CloudwrkzColors.neutral400)
                    .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(tenant.rawValue)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                    Text(tenant.localizedTagline)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? CloudwrkzColors.glassFillHighlight : CloudwrkzColors.glassFillSubtle)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isSelected ? CloudwrkzColors.primary400.opacity(0.5) : CloudwrkzColors.glassStrokeSubtle,
                                lineWidth: isSelected ? 1.5 : 1
                            )
                    )
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Connection (domain + port)

    private var connectionSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader(String(localized: "server_config.connection_details"))

            VStack(alignment: .leading, spacing: 16) {
                labeledField(
                    label: String(localized: "server_config.server_domain"),
                    placeholder: String(localized: "server_config.domain_placeholder"),
                    icon: "globe",
                    text: $config.serverDomain,
                    field: .domain
                )

                labeledField(
                    label: String(localized: "server_config.port_optional"),
                    placeholder: String(localized: "server_config.port_placeholder"),
                    icon: "number",
                    text: portBinding,
                    field: .port,
                    keyboard: .numberPad
                )

                HStack(spacing: 12) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                    Toggle("server_config.use_https", isOn: $config.useHTTPS)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                        .tint(CloudwrkzColors.primary400)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(CloudwrkzColors.neutral900.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                )
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private func labeledField(
        label: String,
        placeholder: String,
        icon: String,
        text: Binding<String>,
        field: Field,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.4)
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }
            TextField(placeholder, text: text)
                .keyboardType(keyboard)
                .textContentType(keyboard == .numberPad ? nil : .URL)
                .autocapitalization(.none)
                .autocorrectionDisabled()
                .focused($focusedField, equals: field)
                .foregroundStyle(CloudwrkzColors.neutral100)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .glassField(cornerRadius: 12)
        }
    }

    // MARK: - Login API path

    private var loginPathSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader(String(localized: "server_config.login_path"))
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "key.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                    Text("server_config.path_no_slash")
                        .font(.system(size: 12, weight: .semibold))
                        .tracking(0.4)
                        .foregroundStyle(CloudwrkzColors.neutral400)
                }
                TextField("server_config.login_path_placeholder", text: $config.loginPath)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .loginPath)
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .glassField(cornerRadius: 12)
                Text("server_config.login_path_hint")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Resolved URL

    private func resolvedURLSection(_ url: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(String(localized: "server_config.active_endpoint"))
            HStack(spacing: 10) {
                Image(systemName: "link")
                    .font(.system(size: 14))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text(url)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral200)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassField(cornerRadius: 12)
        }
    }

    // MARK: - Section title

    private func sectionHeader(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
    }
}

#Preview {
    ServerConfigView(config: .constant(AppState().config))
}
