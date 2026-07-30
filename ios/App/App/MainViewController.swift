import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        // Native edge-swipe back, driven by the SPA's history entries
        webView?.allowsBackForwardNavigationGestures = true
        disableForwardGesture()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // WebKit may (re)create its edge recognizers after viewDidLoad
        disableForwardGesture()
    }

    // allowsBackForwardNavigationGestures has no back-only mode; kill the
    // right-edge (forward) recognizer so back can't be undone by a swipe
    private func disableForwardGesture() {
        for recognizer in webView?.gestureRecognizers ?? [] {
            if let edge = recognizer as? UIScreenEdgePanGestureRecognizer, edge.edges == .right {
                edge.isEnabled = false
            }
        }
    }

}
