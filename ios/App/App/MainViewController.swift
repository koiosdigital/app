import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        // Native edge-swipe back/forward, driven by the SPA's history entries
        webView?.allowsBackForwardNavigationGestures = true
    }

}
