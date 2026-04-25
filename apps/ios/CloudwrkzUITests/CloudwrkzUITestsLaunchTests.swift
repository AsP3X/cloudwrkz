//
//  CloudwrkzUITestsLaunchTests.swift
//  CloudwrkzUITests
//
//  Created by Niklas Vorberg on 13.02.26.
//

import XCTest

// Human: Per-configuration launch screenshots help catch accidental layout regressions in CI without maintaining full scenario tests yet.
// Agent: XCTestCase CloudwrkzUITestsLaunchTests; runsForEachTargetApplicationUIConfiguration true; testLaunch XCUIApplication screenshot XCTAttachment keepAlways.

final class CloudwrkzUITestsLaunchTests: XCTestCase {

    override class var runsForEachTargetApplicationUIConfiguration: Bool {
        true
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLaunch() throws {
        let app = XCUIApplication()
        app.launch()

        // Insert steps here to perform after app launch but before taking a screenshot,
        // such as logging into a test account or navigating somewhere in the app

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Launch Screen"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
