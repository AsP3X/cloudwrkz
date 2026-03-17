//
//  PullDownToSearchView.swift
//  Cloudwrkz
//
//  Full-screen overlay that only captures touches in the top band; detects swipe-down-and-hold there.
//

import SwiftUI
import UIKit

/// Height of the top band (points) where pull-down-and-hold is recognized. Below this, touches pass through to the scroll view.
private let kPullBandHeight: CGFloat = 140

struct PullDownToSearchView: UIViewRepresentable {
    let onTrigger: () -> Void

    func makeUIView(context: Context) -> PullDownBandView {
        let view = PullDownBandView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = true
        view.captureBandHeight = kPullBandHeight

        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
        pan.delegate = context.coordinator
        view.addGestureRecognizer(pan)

        context.coordinator.holdTimer = nil
        return view
    }

    func updateUIView(_ uiView: PullDownBandView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onTrigger: onTrigger)
    }

    class Coordinator: NSObject, UIGestureRecognizerDelegate {
        let onTrigger: () -> Void
        var holdTimer: Timer?
        let dragThreshold: CGFloat = 50
        let holdDuration: TimeInterval = 0.45

        init(onTrigger: @escaping () -> Void) {
            self.onTrigger = onTrigger
        }

        @objc func pan(_ recognizer: UIPanGestureRecognizer) {
            let translation = recognizer.translation(in: recognizer.view)

            switch recognizer.state {
            case .changed:
                if translation.y > dragThreshold, holdTimer == nil {
                    let timer = Timer(timeInterval: holdDuration, repeats: false) { [weak self] _ in
                        guard let self else { return }
                        self.holdTimer?.invalidate()
                        self.holdTimer = nil
                        DispatchQueue.main.async { self.onTrigger() }
                    }
                    RunLoop.main.add(timer, forMode: .common)
                    holdTimer = timer
                }
            case .ended, .cancelled:
                holdTimer?.invalidate()
                holdTimer = nil
            default:
                break
            }
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            false
        }
    }
}

/// Only participates in hit-testing for the top band; passes through touches below.
final class PullDownBandView: UIView {
    var captureBandHeight: CGFloat = 140

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard point.y >= 0, point.y <= captureBandHeight else {
            return nil
        }
        return super.hitTest(point, with: event)
    }
}
