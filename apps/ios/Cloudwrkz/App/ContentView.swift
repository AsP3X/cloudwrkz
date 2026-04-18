//
//  ContentView.swift
//  Cloudwrkz
//
//  Single-column dashboard: menu (same row design) as main content, tap pushes to section.
//

import SwiftUI

struct ContentView: View {
    @Environment(\.appState) private var appState
    @State private var path = NavigationPath()

    /// True when the main (dashboard) screen is shown. When this flips to true after login, we refresh profile so the avatar shows the new user.
    var isMainVisible: Bool = true
    /// Binding so the menu can open server config after dismissing. RootView owns the sheet.
    var showServerConfig: Binding<Bool> = .constant(false)
    /// Called when user taps Log out in the menu. RootView should clear token and navigate to splash.
    var onLogout: (() -> Void)? = nil

    /// Profile for avatar and menu; refreshed on appear so edits elsewhere update the toolbar.
    @State private var profileFirstName: String? = UserProfileStorage.firstName
    @State private var profileLastName: String? = UserProfileStorage.lastName
    @State private var profileEmail: String? = UserProfileStorage.email
    @State private var profileUsername: String? = UserProfileStorage.username
    @State private var profileImageData: Data? = UserProfileStorage.profileImageData

    /// Present profile sheet when "View Profile" is chosen from context menu.
    @State private var showProfileSheet = false
    /// Present profile menu (popover) when profile button is tapped.
    @State private var showProfileMenu = false
    /// Present QR login scanner when user chooses "Login with QR code" from profile menu.
    @State private var showQrScanner = false
    /// Present search overlay when user swipes down and holds on dashboard (or taps toolbar search).
    @State private var showSearch = false
    /// When true, show search after the current sheet/fullScreenCover has finished dismissing (avoids "already presenting").
    @State private var pendingSearchAfterDismiss = false
    /// Search result selected before dismissing; handled in fullScreenCover onDismiss to open detail in-app or Safari.
    @State private var pendingSearchResult: SearchResult?

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                LinearGradient(
                    colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                if noModulesAvailable {
                    noModulesWarning
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            welcomeSection
                            menuSection
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, 20)
                        .padding(.bottom, 32)
                    }
                }
            }
            .overlay {
                if !noModulesAvailable {
                    PullDownToSearchView(onTrigger: { requestSearch() })
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .allowsHitTesting(true)
                }
            }
            .navigationTitle("dashboard.title")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: DashboardSection.self) { section in
                if section == .tickets {
                    TicketsOverviewView()
                } else if section == .todos {
                    TodosOverviewView()
                } else if section == .links {
                    LinksOverviewView()
                } else if section == .timeTracking {
                    TimeTrackingOverviewView()
                } else if section == .archive {
                    ArchiveOverviewView(path: $path)
                } else {
                    DashboardSectionPlaceholderView(section: section)
                }
            }
            .navigationDestination(for: Ticket.self) { ticket in
                TicketDetailView(ticket: ticket)
            }
            .navigationDestination(for: Todo.self) { todo in
                TodoDetailView(todo: todo)
            }
            .navigationDestination(for: Link.self) { link in
                LinkDetailView(link: link, serverBaseURL: appState.config.baseURL)
            }
            .navigationDestination(for: TimeEntry.self) { entry in
                TimeEntryDetailView(entry: entry)
            }
            .onAppear {
                refreshProfileFromStorage()
                if AuthTokenStorage.getToken() != nil {
                    Task { @MainActor in
                        switch await AuthService.fetchCurrentUser(config: appState.config) {
                        case .success((let name, let email, let modules)):
                            if let n = name?.trimmingCharacters(in: .whitespaces), !n.isEmpty {
                                UserProfileStorage.username = n
                            }
                            if let e = email?.trimmingCharacters(in: .whitespaces), !e.isEmpty {
                                UserProfileStorage.email = e
                            }
                            UserProfileStorage.allowedModuleIds = modules
                            refreshProfileFromStorage()
                        case .failure:
                            break
                        }
                    }
                }
            }
            .onChange(of: isMainVisible) { _, visible in
                if visible {
                    refreshProfileFromStorage()
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        requestSearch()
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        refreshProfileFromStorage()
                        showProfileMenu = true
                    } label: {
                        ProfileAvatarView(
                            firstName: profileFirstName ?? UserProfileStorage.firstName,
                            lastName: profileLastName ?? UserProfileStorage.lastName,
                            username: profileUsername ?? UserProfileStorage.username,
                            profileImageData: profileImageData ?? UserProfileStorage.profileImageData,
                            size: 36
                        )
                        .id(profileUsername ?? UserProfileStorage.username ?? profileFirstName ?? profileLastName ?? "avatar")
                    }
                    .buttonStyle(.plain)
                    .frame(width: 36, height: 36)
                    .fixedSize(horizontal: true, vertical: true)
                    .popover(isPresented: $showProfileMenu) {
                        ProfileMenuPopoverView(
                            firstName: profileFirstName,
                            lastName: profileLastName,
                            username: profileUsername,
                            email: profileEmail,
                            profileImageData: profileImageData,
                            onViewProfile: {
                                showProfileMenu = false
                                DispatchQueue.main.async {
                                    showProfileSheet = true
                                }
                            },
                            onQrLogin: {
                                showProfileMenu = false
                                DispatchQueue.main.async {
                                    showQrScanner = true
                                }
                            },
                            onLogout: onLogout != nil ? {
                                showProfileMenu = false
                                onLogout?()
                            } : nil
                        )
                    }
                }
            }
            .sheet(isPresented: $showProfileSheet, onDismiss: {
                if pendingSearchAfterDismiss {
                    pendingSearchAfterDismiss = false
                    showSearch = true
                }
            }) {
                ProfileView(
                    firstName: profileFirstName,
                    lastName: profileLastName,
                    username: profileUsername,
                    email: profileEmail,
                    profileImageData: profileImageData,
                    onLogout: onLogout != nil ? {
                        showProfileSheet = false
                        onLogout?()
                    } : nil,
                    onProfileUpdated: { refreshProfileFromStorage() }
                )
            }
            .fullScreenCover(isPresented: $showSearch, onDismiss: {
                if let result = pendingSearchResult {
                    pendingSearchResult = nil
                    Task { await openSearchResult(result) }
                }
            }) {
                DashboardSearchView(
                    onDismiss: { showSearch = false },
                    onSelectResult: { result in
                        pendingSearchResult = result
                        showSearch = false
                    }
                )
            }
            .fullScreenCover(isPresented: $showQrScanner) {
                QrLoginScannerView(onDismiss: { showQrScanner = false })
            }
            .tint(CloudwrkzColors.primary400)
            .toolbarBackground(.hidden, for: .navigationBar)
            .animation(Animation.elasticSlide, value: path)
        }
    }

    /// True when profile has been loaded and the user has no modules (permissions or modules disabled).
    private var noModulesAvailable: Bool {
        guard let ids = UserProfileStorage.allowedModuleIds else { return false }
        return ids.isEmpty
    }

    /// Centered full-screen warning, same style as server/load error view in TicketsOverviewView etc.
    private var noModulesWarning: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 44))
                .foregroundStyle(CloudwrkzColors.warning500)
            Text("dashboard.no_modules.title")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text("dashboard.no_modules.message")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var welcomeSection: some View {
        Text("dashboard.welcome_back")
            .font(.system(size: 15, weight: .regular))
            .foregroundStyle(CloudwrkzColors.neutral400)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var menuSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("dashboard.quick_access")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral500)

            VStack(spacing: 10) {
                ForEach(DashboardSection.visibleMenuSections(allowedModuleIds: UserProfileStorage.allowedModuleIds)) { section in
                    NavigationLink(value: section) {
                        HStack(spacing: 16) {
                            Image(systemName: section.iconName)
                                .font(.system(size: 20))
                                .foregroundStyle(CloudwrkzColors.primary400)
                                .frame(width: 32, height: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(section.title)
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(CloudwrkzColors.neutral100)
                                Text(section.subtitle)
                                    .font(.system(size: 13, weight: .regular))
                                    .foregroundStyle(CloudwrkzColors.neutral500)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(CloudwrkzColors.neutral500)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                        .glassCard(cornerRadius: 16)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func refreshProfileFromStorage() {
        profileFirstName = UserProfileStorage.firstName
        profileLastName = UserProfileStorage.lastName
        profileEmail = UserProfileStorage.email
        profileUsername = UserProfileStorage.username
        profileImageData = UserProfileStorage.profileImageData
    }

    /// Presents search, or defers it until profile sheet has dismissed to avoid "already presenting".
    private func requestSearch() {
        if showProfileSheet {
            pendingSearchAfterDismiss = true
            showProfileSheet = false
        } else {
            showSearch = true
        }
    }

    /// Opens the selected search result in-app when a native detail exists; otherwise Safari.
    @MainActor
    private func openSearchResult(_ result: SearchResult) async {
        let config = appState.config

        switch result.type {
        case "task", "subtask":
            switch await TodoService.fetchTodo(config: config, id: result.id) {
            case .success(let todo):
                path.append(todo)
            case .failure:
                openSearchResultInSafari(result)
            }
        case "timeentry":
            switch await TimeTrackingService.fetchTimeEntry(config: config, id: result.id) {
            case .success(let entry):
                path.append(entry)
            case .failure:
                openSearchResultInSafari(result)
            }
        case "ticket":
            switch await TicketService.fetchTicket(config: config, id: result.id) {
            case .success(let ticket):
                path.append(ticket)
            case .failure:
                openSearchResultInSafari(result)
            }
        case "link":
            switch await LinkService.fetchLink(config: config, id: result.id) {
            case .success(let link):
                path.append(link)
            case .failure:
                openSearchResultInSafari(result)
            }
        default:
            openSearchResultInSafari(result)
        }
    }

    private func openSearchResultInSafari(_ result: SearchResult) {
        guard let base = appState.config.baseURL else { return }
        let pathString = result.url.hasPrefix("/") ? String(result.url.dropFirst()) : result.url
        guard let url = URL(string: pathString, relativeTo: base) else { return }
        UIApplication.shared.open(url)
    }

}

#Preview {
    ContentView()
}
