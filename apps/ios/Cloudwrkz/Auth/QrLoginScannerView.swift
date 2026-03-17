//
//  QrLoginScannerView.swift
//  Cloudwrkz
//
//  Camera scanner for QR login. Parses URL from QR (e.g. https://domain/qr-login?r=REQUEST_ID) and calls approve API.
//

import SwiftUI
import AVFoundation

struct QrLoginScannerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appState) private var appState
    var onSuccess: (() -> Void)?
    var onDismiss: (() -> Void)?

    @State private var status: Status = .scanning
    @State private var errorMessage: String?
    @State private var successMessage: String?
    @State private var scannerKey = 0
    @State private var completedStepsCount = 0
    @State private var apiSucceeded = false

    private static let checklistSteps = [
        "Validating request",
        "Generating keys",
        "Exchanging keys",
        "Validating…",
        "Logged in",
    ]

    enum Status {
        case scanning
        case processing
        case success
        case failure
    }

    /// Visible window: max 3 items; when third is done drop top; 2 or 1 left at end.
    private var checklistVisibleIndices: [Int] {
        let count = completedStepsCount
        let start: Int
        let num: Int
        switch count {
        case 0: start = 0; num = 2
        case 1, 2: start = 0; num = 3
        case 3: start = 1; num = 3
        case 4: start = 3; num = 2
        default: start = 4; num = 1  // 5
        }
        return (0..<num).map { start + $0 }
    }

    private var checklistView: some View {
        VStack(alignment: .center, spacing: 10) {
            ForEach(checklistVisibleIndices, id: \.self) { index in
                let title = Self.checklistSteps[index]
                let isCompleted = index < completedStepsCount
                let isCurrent = index == completedStepsCount
                let isNext = index == completedStepsCount + 1
                let isNormalSize = isCurrent
                checklistRow(index: index, title: title, isCompleted: isCompleted, isCurrent: isCurrent, isNext: isNext)
                    .scaleEffect(isNormalSize ? 1.0 : 0.82)
                    .opacity(isNormalSize ? 1.0 : 0.88)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .move(edge: .bottom)),
                        removal: .opacity.combined(with: .move(edge: .top))
                    ))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 120)
        .padding(.horizontal, 8)
        .animation(.easeOut(duration: 0.3), value: completedStepsCount)
    }

    private func checklistRow(index: Int, title: String, isCompleted: Bool, isCurrent: Bool, isNext: Bool) -> some View {
        HStack(spacing: 12) {
            if isCompleted {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.success500)
                    .transition(.scale.combined(with: .opacity))
            } else if isCurrent {
                CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                    .scaleEffect(0.9)
            } else {
                Image(systemName: "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.neutral600)
            }
            Text(title)
                .font(.system(size: 15, weight: isCompleted || isCurrent ? .medium : .regular))
                .foregroundStyle(isCompleted || isCurrent ? CloudwrkzColors.neutral100 : CloudwrkzColors.neutral500)
        }
    }

    private func runChecklistAnimation() async {
        guard status == .processing else { return }
        for step in 1...Self.checklistSteps.count {
            try? await Task.sleep(nanoseconds: 480_000_000)
            await MainActor.run {
                guard status == .processing else { return }
                completedStepsCount = step
                if step == Self.checklistSteps.count && apiSucceeded {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        withAnimation(.easeOut(duration: 0.35)) {
                            status = .success
                        }
                    }
                }
            }
        }
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

                VStack(spacing: 24) {
                    if status == .scanning || status == .processing {
                        QrCameraView(
                            onCodeScanned: { urlString in
                                guard status == .scanning else { return }
                                handleScannedCode(urlString)
                            }
                        )
                        .id(scannerKey)
                        .frame(height: 320)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(CloudwrkzColors.primary500.opacity(0.3), lineWidth: 2)
                        )
                        .padding(.horizontal, 24)

                        if status == .processing {
                            checklistView
                                .padding(.top, 20)
                                .task(id: status) {
                                    await runChecklistAnimation()
                                }
                        } else {
                            Text("Point your camera at the QR code on the website")
                                .font(.subheadline)
                                .foregroundStyle(CloudwrkzColors.neutral400)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                    } else if status == .success {
                        VStack(spacing: 20) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 80))
                                .foregroundStyle(CloudwrkzColors.success500)
                                .symbolEffect(.bounce, value: status)
                            Text("You're signed in")
                                .font(.title2)
                                .fontWeight(.semibold)
                                .foregroundStyle(CloudwrkzColors.neutral100)
                            if let msg = successMessage {
                                Text(msg)
                                    .font(.subheadline)
                                    .foregroundStyle(CloudwrkzColors.neutral400)
                                    .multilineTextAlignment(.center)
                            }
                        }
                        .padding(.vertical, 24)
                        .animation(.easeOut(duration: 0.35), value: status)
                        .transition(.scale(scale: 0.92).combined(with: .opacity))
                        .onAppear {
                            onSuccess?()
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                                dismiss()
                            }
                        }
                    } else {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(CloudwrkzColors.error500)
                        if let msg = errorMessage {
                            Text(msg)
                                .font(.subheadline)
                                .foregroundStyle(CloudwrkzColors.neutral400)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        Button("Try again") {
                            errorMessage = nil
                            scannerKey += 1
                            status = .scanning
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(CloudwrkzColors.primary500)
                    }
                }
                .padding(.vertical, 32)
            }
            .navigationTitle("Login with QR code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onDismiss?()
                        dismiss()
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
        }
    }

    private func handleScannedCode(_ urlString: String) {
        completedStepsCount = 0
        apiSucceeded = false
        status = .processing

        guard let requestId = requestIdFromQrPayload(urlString) else {
            status = .failure
            errorMessage = "This doesn’t look like a Cloudwrkz login QR code. Open the website login page and choose “Sign in with QR code”."
            return
        }

        Task { @MainActor in
            switch await QrLoginService.approve(requestId: requestId, config: appState.config) {
            case .success:
                successMessage = "The browser will sign you in shortly."
                apiSucceeded = true
                if completedStepsCount == Self.checklistSteps.count {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        withAnimation(.easeOut(duration: 0.35)) {
                            status = .success
                        }
                    }
                }
            case .failure(let err):
                status = .failure
                errorMessage = messageForFailure(err)
            }
        }
    }

    private func requestIdFromQrPayload(_ payload: String) -> String? {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            return nil
        }
        return queryItems.first(where: { $0.name.lowercased() == "r" })?.value
    }

    private func messageForFailure(_ err: QrLoginApproveFailure) -> String {
        switch err {
        case .noServerURL:
            return "Server URL is not configured."
        case .noToken:
            return "You must be signed in in the app first."
        case .invalidRequestId:
            return "Invalid QR code."
        case .unauthorized:
            return "Session expired. Please sign in again in the app."
        case .requestNotFoundOrExpired:
            return "This QR code has expired. Please show a new one on the website."
        case .requestAlreadyUsedOrExpired:
            return "This QR code was already used."
        case .requestExpired:
            return "This QR code has expired. Please show a new one on the website."
        case .serverError(let message):
            return message
        case .networkError(let description):
            return "Network error: \(description)"
        }
    }
}

// MARK: - Camera capture for QR

private struct QrCameraView: UIViewControllerRepresentable {
    var onCodeScanned: (String) -> Void

    func makeUIViewController(context: Context) -> QrCameraViewController {
        let vc = QrCameraViewController()
        vc.onCodeScanned = onCodeScanned
        return vc
    }

    func updateUIViewController(_ uiViewController: QrCameraViewController, context: Context) {}
}

private final class QrCameraViewController: UIViewController {
    var onCodeScanned: ((String) -> Void)?
    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var hasReported = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let session = AVCaptureSession()
        self.captureSession = session

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            return
        }
        session.addInput(input)

        // Zoom in so the QR code fills the frame (Telegram-style: camera shows mainly what you point at)
        do {
            try device.lockForConfiguration()
            let maxZoom = min(device.activeFormat.videoMaxZoomFactor, 2.5)
            if maxZoom >= 1.5 {
                device.videoZoomFactor = maxZoom
            }
            device.unlockForConfiguration()
        } catch {
            // Ignore; run without zoom
        }

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.metadataObjectTypes = [.qr]
        output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        self.previewLayer = layer

        DispatchQueue.global(qos: .userInitiated).async { [weak session] in
            session?.startRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        captureSession?.stopRunning()
    }
}

extension QrCameraViewController: AVCaptureMetadataOutputObjectsDelegate {
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !hasReported,
              let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              obj.type == .qr,
              let str = obj.stringValue, !str.isEmpty else {
            return
        }
        hasReported = true
        captureSession?.stopRunning()
        onCodeScanned?(str)
    }
}
