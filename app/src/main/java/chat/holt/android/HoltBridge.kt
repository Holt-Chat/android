package chat.holt.android

import android.webkit.JavascriptInterface

class HoltBridge(private val activity: MainActivity) {

  @JavascriptInterface
  fun syncSessions(json: String) {
    activity.runOnUiThread { activity.onSessionsSynced(json) }
  }

  @JavascriptInterface
  fun setForeground(foreground: Boolean) {
    activity.runOnUiThread { activity.onForegroundChanged(foreground) }
  }

  @JavascriptInterface
  fun saveBase64(base64: String, filename: String, mimetype: String) {
    activity.saveDownload(base64, filename, mimetype)
  }

  @JavascriptInterface
  fun platform(): String = "android"

  @JavascriptInterface
  fun syncNotifConfig(json: String) {
    activity.runOnUiThread { activity.syncNotifConfig(json) }
  }

  @JavascriptInterface
  fun notifGranted(): Boolean = activity.notifGranted()

  @JavascriptInterface
  fun batteryUnrestricted(): Boolean = activity.batteryUnrestricted()

  @JavascriptInterface
  fun requestNotifications() {
    activity.runOnUiThread { activity.requestNotifications() }
  }

  @JavascriptInterface
  fun requestBattery() {
    activity.runOnUiThread { activity.requestBatteryExemption() }
  }

  @JavascriptInterface
  fun openAppInfo() {
    activity.runOnUiThread { activity.openAppInfo() }
  }

  @JavascriptInterface
  fun cacheBytes(): Long = activity.cacheBytes()

  @JavascriptInterface
  fun clearCache() {
    activity.clearCache()
  }
}
