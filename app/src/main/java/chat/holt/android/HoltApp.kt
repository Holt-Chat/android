package chat.holt.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class HoltApp : Application() {
  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)
      val service = NotificationChannel(CH_SERVICE, getString(R.string.notif_channel_service), NotificationManager.IMPORTANCE_MIN)
      service.description = getString(R.string.notif_service_text)
      service.setShowBadge(false)
      val messages = NotificationChannel(CH_MESSAGES, getString(R.string.notif_channel_messages), NotificationManager.IMPORTANCE_HIGH)
      messages.enableVibration(true)
      messages.setShowBadge(true)
      nm.createNotificationChannel(service)
      nm.createNotificationChannel(messages)
    }
  }
  companion object {
    const val CH_SERVICE = "holt_service"
    const val CH_MESSAGES = "holt_messages"
  }
}
